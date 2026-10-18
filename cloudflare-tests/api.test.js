import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getPlatformProxy, unstable_splitSqlQuery } from 'wrangler';
import { onRequest } from '../cloudflare/api.js';
import { enforceRateLimit } from '../cloudflare/repository.js';
import { topicNames } from '../server/seed-data.js';
import { checkSource, checkVerifiedLinks } from '../cloudflare/link-health.js';
import { exampleDraft, testEnv } from '../test/helpers.js';

async function fixture(t) {
  // Real workerd/D1 bindings, isolated from both local development and remote databases.
  const proxy = await getPlatformProxy({
    configPath: 'wrangler.jsonc',
    persist: false,
    remoteBindings: false,
    envFiles: [],
  });
  t.after(() => proxy.dispose());
  const db = proxy.env.DB;
  for (const file of ['0001-schema.sql', '0002-seed.sql']) {
    const statements = unstable_splitSqlQuery(
      readFileSync(new URL(`../cloudflare/migrations/${file}`, import.meta.url), 'utf8'),
    );
    await db.batch(statements.map((sql) => db.prepare(sql)));
  }
  const env = {
    DB: db,
    ...testEnv,
    SESSION_SECRET: 'EXAMPLE-ONLY-cloudflare-signing-secret-123456789',
  };
  function request(path, data, cookie = '', overrides = {}, origin = 'https://record.example') {
    return onRequest({
      env: { ...env, ...overrides },
      request: new Request(
        `https://record.example/api${path}`,
        data === undefined
          ? {
              headers: { Cookie: cookie },
            }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
              body: JSON.stringify(data),
            },
      ),
    });
  }
  async function signIn(username) {
    const response = await request('/login', {
      username,
      password: username === 'reviewer' ? testEnv.REVIEWER_PASSWORD : testEnv.RESEARCHER_PASSWORD,
    });
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get('Set-Cookie'),
      /HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800; Secure/,
    );
    return response.headers.get('Set-Cookie').split(';')[0];
  }
  return { db, env, request, signIn };
}

test('D1 migrations seed the same proposed race and topics, with zero claims', async (t) => {
  const { db, request } = await fixture(t);
  const response = await request('/comparison'),
    result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(
    result.topics.map((topic) => [topic.id, topic.name, topic.description]),
    topicNames,
  );
  assert.equal(result.race.status, 'pending_confirmation');
  assert.deepEqual(result.statements, []);
  await assert.rejects(
    db
      .prepare(
        `INSERT INTO statements (id,candidate_id,topic_id,text,text_type,source_type,source_title,added_by,reviewed_by,source_read,review_status,created_at,updated_at)
    VALUES ('bypass','paxton','education','EXAMPLE ONLY','direct_quote','speech','EXAMPLE ONLY','researcher','reviewer',1,'verified','now','now')`,
      )
      .run(),
  );
});

test('Pages API preserves authentication, source validation, independent review, and corrections', async (t) => {
  const { request, signIn } = await fixture(t);
  assert.equal((await request('/admin')).status, 401);
  assert.equal(
    (
      await request(
        '/login',
        { username: 'researcher', password: testEnv.RESEARCHER_PASSWORD },
        '',
        {},
        'https://evil.example',
      )
    ).status,
    403,
  );
  const author = await signIn('researcher'),
    reviewer = await signIn('reviewer');
  assert.equal(
    (await request('/statements', exampleDraft({ source_url: 'javascript:alert(1)' }), author))
      .status,
    400,
  );
  const missing = await (
    await request('/statements', exampleDraft({ source_url: '' }), author)
  ).json();
  assert.equal(
    (
      await request(
        `/statements/${missing.id}/review`,
        { review_status: 'verified', source_read: true },
        reviewer,
      )
    ).status,
    400,
  );
  const { id } = await (await request('/statements', exampleDraft(), author)).json();
  assert.equal((await (await request('/comparison')).json()).statements.length, 0);
  assert.equal(
    (
      await request(
        `/statements/${id}/review`,
        { review_status: 'verified', source_read: true },
        author,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/statements/${id}/review`,
        { review_status: 'verified', source_read: false },
        reviewer,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/statements/${id}/review`,
        { review_status: 'verified', source_read: true },
        reviewer,
      )
    ).status,
    200,
  );
  const published = await (await request('/comparison')).json();
  assert.equal(published.statements.length, 1);
  assert.equal(published.statements[0].added_by, undefined);
  assert.equal(
    (await request('/corrections', { statement_id: id, message: 'EXAMPLE ONLY correction' }))
      .status,
    201,
  );
  const queue = await (await request('/admin', undefined, reviewer)).json();
  assert.equal(queue.tasks.length, 1);
  assert.equal((await request(`/tasks/${queue.tasks[0].id}/resolve`, {}, author)).status, 403);
  assert.equal((await request(`/tasks/${queue.tasks[0].id}/resolve`, {}, reviewer)).status, 200);
  assert.equal(
    (await request(`/statements/${id}/review`, { review_status: 'flagged' }, reviewer)).status,
    200,
  );
  assert.equal((await (await request('/comparison')).json()).statements.length, 0);
  const selfAuthored = await (await request('/statements', exampleDraft(), reviewer)).json();
  assert.equal(
    (
      await request(
        `/statements/${selfAuthored.id}/review`,
        { review_status: 'verified', source_read: true },
        reviewer,
      )
    ).status,
    403,
  );
});

test('D1 imports are atomic, draft-only, and bounded for the free query limit', async (t) => {
  const { db, request, signIn } = await fixture(t),
    author = await signIn('researcher');
  const header =
    'candidate_id,topic_id,text,text_type,source_url,source_type,source_title,review_status\n';
  const row =
    'paxton,education,EXAMPLE ONLY,direct_quote,https://example.com,speech,EXAMPLE ONLY,verified';
  const invalid = row.replace('education', 'missing-topic');
  assert.equal(
    (await request('/import', { csv: header + row + '\n' + invalid }, author)).status,
    400,
  );
  assert.equal((await db.prepare('SELECT count(*) AS n FROM statements').first()).n, 0);
  assert.equal(
    (await request('/import', { csv: header + Array(21).fill(row).join('\n') }, author)).status,
    400,
  );
  const imported = await request(
    '/import',
    { csv: header + Array(20).fill(row).join('\n') },
    author,
  );
  assert.equal(imported.status, 201);
  assert.equal((await imported.json()).ids.length, 20);
  assert.equal(
    (await db.prepare("SELECT count(*) AS n FROM statements WHERE review_status='draft'").first())
      .n,
    20,
  );
  assert.equal((await (await request('/comparison')).json()).statements.length, 0);
});

test('Pages sessions revoke on password/secret changes and logout; rate limits persist in D1', async (t) => {
  const { db, request, signIn } = await fixture(t),
    cookie = await signIn('researcher');
  assert.equal((await request('/admin', undefined, cookie)).status, 200);
  assert.equal(
    (
      await request('/admin', undefined, cookie, {
        RESEARCHER_PASSWORD: 'EXAMPLE-ONLY-changed-password',
      })
    ).status,
    401,
  );
  assert.equal(
    (await request('/admin', undefined, cookie, { RESEARCHER_PASSWORD: '' })).status,
    401,
  );
  assert.equal(
    (
      await request('/admin', undefined, cookie, {
        SESSION_SECRET: 'EXAMPLE-ONLY-changed-signing-secret-987654321',
      })
    ).status,
    401,
  );
  await request('/logout', {}, cookie);
  assert.equal((await request('/admin', undefined, cookie)).status, 401);
  await enforceRateLimit(db, 'example-ip', 2);
  await enforceRateLimit(db, 'example-ip', 2);
  await assert.rejects(enforceRateLimit(db, 'example-ip', 2), /Too many requests/);
});

test('unconfigured D1 and contributor secrets fail with actionable responses', async (t) => {
  const { request } = await fixture(t);
  assert.equal((await request('/comparison', undefined, '', { DB: null })).status, 503);
  assert.equal(
    (
      await request(
        '/login',
        { username: 'researcher', password: testEnv.RESEARCHER_PASSWORD },
        '',
        { SESSION_SECRET: '' },
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await request(
        '/login',
        { username: 'researcher', password: testEnv.RESEARCHER_PASSWORD },
        '',
        { RESEARCHER_PASSWORD: '' },
      )
    ).status,
    401,
  );
});

test('Cloudflare source checks preserve verified text, deduplicate tasks, and resolve on recovery', async (t) => {
  const { db, request, signIn } = await fixture(t);
  const author = await signIn('researcher'),
    reviewer = await signIn('reviewer');
  const { id } = await (await request('/statements', exampleDraft(), author)).json();
  await request(
    `/statements/${id}/review`,
    { review_status: 'verified', source_read: true },
    reviewer,
  );
  await checkVerifiedLinks(db, async () => false);
  await checkVerifiedLinks(db, async () => false);
  assert.equal(
    (await (await request('/comparison')).json()).statements[0].link_status,
    'unavailable',
  );
  assert.equal(
    (await db.prepare("SELECT count(*) AS n FROM review_tasks WHERE status='open'").first()).n,
    1,
  );
  await checkVerifiedLinks(db, async () => true);
  assert.equal(
    (await db.prepare("SELECT count(*) AS n FROM review_tasks WHERE status='open'").first()).n,
    0,
  );
  assert.equal((await (await request('/comparison')).json()).statements.length, 1);
  for (const url of [
    'http://127.0.0.1',
    'http://[::1]',
    'https://service.internal',
    'http://localhost',
    'https://example.com:8443',
  ])
    await assert.rejects(checkSource(url));
  await assert.rejects(
    checkSource(
      'https://example.com',
      async () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1' } }),
    ),
  );
  let calls = 0;
  assert.equal(
    await checkSource('https://example.com', async (_url, options) => {
      calls++;
      return new Response(null, { status: options.method === 'HEAD' ? 405 : 200 });
    }),
    true,
  );
  assert.equal(calls, 2);
});
