import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/app.js';
import { fixtureDatabase, testEnv, exampleDraft } from './helpers.js';

test('HTTP workflow enforces authentication, origin, review separation, and public visibility', async (t) => {
  const db = fixtureDatabase();
  const env = { ...testEnv, APP_ORIGIN: 'http://127.0.0.1:4180' };
  const server = createApp(db, env);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, data, cookie = '', origin = env.APP_ORIGIN) {
    return fetch(
      `${base}${path}`,
      data === undefined
        ? { headers: { Cookie: cookie } }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin, Cookie: cookie },
            body: JSON.stringify(data),
          },
    );
  }
  assert.equal((await request('/')).status, 200);
  assert.equal(
    (await request('/styles.css')).headers.get('content-type'),
    'text/css; charset=utf-8',
  );
  assert.equal((await request('/api/admin')).status, 401);
  assert.equal(
    (
      await request(
        '/api/login',
        { username: 'researcher', password: testEnv.RESEARCHER_PASSWORD },
        '',
        'https://evil.example',
      )
    ).status,
    403,
  );
  assert.equal(
    (await request('/api/login', { username: 'researcher', password: 'wrong' })).status,
    401,
  );
  const researchLogin = await request('/api/login', {
    username: 'researcher',
    password: testEnv.RESEARCHER_PASSWORD,
  });
  const researchCookie = researchLogin.headers.get('set-cookie').split(';')[0];
  assert.match(researchLogin.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const created = await request('/api/statements', exampleDraft(), researchCookie);
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.equal((await (await request('/api/comparison')).json()).statements.length, 0);
  assert.equal(
    (
      await request(
        `/api/statements/${id}/review`,
        { review_status: 'verified', source_read: true },
        researchCookie,
      )
    ).status,
    403,
  );
  const reviewerLogin = await request('/api/login', {
    username: 'reviewer',
    password: testEnv.REVIEWER_PASSWORD,
  });
  const reviewCookie = reviewerLogin.headers.get('set-cookie').split(';')[0];
  assert.equal(
    (
      await request(
        `/api/statements/${id}/review`,
        { review_status: 'verified', source_read: false },
        reviewCookie,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/api/statements/${id}/review`,
        { review_status: 'verified', source_read: true },
        reviewCookie,
      )
    ).status,
    200,
  );
  const published = await (await request('/api/comparison')).json();
  assert.equal(published.statements.length, 1);
  assert.equal(published.statements[0].added_by, undefined);
  assert.equal(
    (await request('/api/corrections', { statement_id: id, message: 'EXAMPLE ONLY correction' }))
      .status,
    201,
  );
  const queue = await (await request('/api/admin', undefined, reviewCookie)).json();
  assert.equal(queue.tasks.length, 1);
  assert.equal(
    (await request(`/api/tasks/${queue.tasks[0].id}/resolve`, {}, reviewCookie)).status,
    200,
  );
  assert.equal(
    (await request(`/api/statements/${id}/review`, { review_status: 'flagged' }, reviewCookie))
      .status,
    200,
  );
  assert.equal((await (await request('/api/comparison')).json()).statements.length, 0);
  assert.equal((await request('/api/logout', {}, reviewCookie)).status, 200);
  assert.equal((await request('/api/admin', undefined, reviewCookie)).status, 401);
  assert.match(
    (await request('/')).headers.get('content-security-policy'),
    /frame-ancestors 'none'/,
  );
});

test('unconfigured editorial accounts cannot log in', async (t) => {
  const db = fixtureDatabase(),
    server = createApp(db, { APP_ORIGIN: 'http://127.0.0.1:4180' });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const result = await fetch(`http://127.0.0.1:${server.address().port}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:4180' },
    body: JSON.stringify({ username: 'researcher', password: testEnv.RESEARCHER_PASSWORD }),
  });
  assert.equal(result.status, 401);
});
