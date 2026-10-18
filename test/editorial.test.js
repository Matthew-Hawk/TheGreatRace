import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureDatabase, researcher, reviewer, exampleDraft } from './helpers.js';
import { validateSourceUrl, validateDraft } from '../server/domain.js';
import { comparison, saveDraft, reviewStatement, recordCorrection } from '../server/repository.js';
import { importDrafts, parseCsv } from '../server/csv.js';
import { seedDatabase } from '../server/database.js';
import { isPublicIPv4, checkVerifiedLinks, checkSource } from '../server/link-health.js';

function withDb(t) {
  const db = fixtureDatabase();
  t.after(() => db.close());
  return db;
}
const approve = (db, id) =>
  reviewStatement(db, reviewer, id, { review_status: 'verified', source_read: true });

test('seeding is idempotent and creates no statements', (t) => {
  const db = withDb(t);
  seedDatabase(db);
  const data = comparison(db);
  assert.equal(data.candidates.length, 2);
  assert.equal(data.topics.length, 16);
  assert.deepEqual(data.statements, []);
  assert.equal(data.race.status, 'pending_confirmation');
  assert.equal(data.race.election_date, null);
});

test('source validation rejects unsafe schemes, embedded credentials, and malformed URLs', () => {
  for (const url of [
    '',
    'example.com',
    'javascript:alert(1)',
    'file:///test',
    'https://name:secret@example.com',
  ])
    assert.throws(() => validateSourceUrl(url));
  assert.equal(validateSourceUrl('https://example.com'), 'https://example.com/');
});

test('draft validation rejects impossible dates and unsupported source types', () => {
  assert.throws(() => validateDraft(exampleDraft({ statement_date: '2025-02-30' })));
  assert.throws(() => validateDraft(exampleDraft({ source_type: 'rumor' })));
  assert.equal(validateDraft(exampleDraft()).statement_date, null);
});

test('drafts and flagged statements stay out of the public record', (t) => {
  const db = withDb(t),
    id = saveDraft(db, researcher, exampleDraft());
  assert.equal(comparison(db).statements.length, 0);
  reviewStatement(db, reviewer, id, { review_status: 'flagged' });
  assert.equal(comparison(db).statements.length, 0);
});

test('verification requires a source URL and explicit source-read confirmation', (t) => {
  const db = withDb(t),
    missing = saveDraft(db, researcher, exampleDraft({ source_url: '' }));
  assert.throws(() => approve(db, missing), /Source URL/);
  const id = saveDraft(db, researcher, exampleDraft());
  assert.throws(
    () => reviewStatement(db, reviewer, id, { review_status: 'verified', source_read: false }),
    /opened and read/,
  );
  assert.equal(comparison(db).statements.length, 0);
});

test('authors cannot self-review and researchers cannot verify', (t) => {
  const db = withDb(t),
    selfAuthored = saveDraft(db, reviewer, exampleDraft());
  assert.throws(() => approve(db, selfAuthored), /different person/);
  const id = saveDraft(db, researcher, exampleDraft());
  assert.throws(
    () => reviewStatement(db, researcher, id, { review_status: 'verified', source_read: true }),
    /reviewer account/,
  );
});

test('independent verification publishes source metadata but not editor identities', (t) => {
  const db = withDb(t),
    id = saveDraft(db, researcher, exampleDraft());
  approve(db, id);
  const [published] = comparison(db).statements;
  assert.equal(published.id, id);
  assert.equal(published.source_url, 'https://example.com/fictional-source');
  assert.equal(published.review_status, 'verified');
  assert.equal(published.added_by, undefined);
  assert.equal(db.prepare('SELECT count(*) AS n FROM audit_log').get().n, 2);
});

test('database constraints block direct verification bypasses, including NULL sources', (t) => {
  const db = withDb(t),
    id = saveDraft(db, researcher, exampleDraft({ source_url: '' }));
  assert.throws(() =>
    db
      .prepare(
        "UPDATE statements SET review_status='verified', reviewed_by='reviewer', source_read=1 WHERE id=?",
      )
      .run(id),
  );
  const sourced = saveDraft(db, reviewer, exampleDraft());
  assert.throws(() =>
    db
      .prepare(
        "UPDATE statements SET review_status='verified', reviewed_by='reviewer', source_read=1 WHERE id=?",
      )
      .run(sourced),
  );
  assert.equal(comparison(db).statements.length, 0);
});

test('database URL validation rejects malformed and unsafe sources on direct SQL updates', (t) => {
  const db = withDb(t),
    id = saveDraft(db, researcher, exampleDraft());
  for (const url of ['https://', 'javascript:alert(1)', 'https://user:password@example.com']) {
    assert.throws(() =>
      db
        .prepare(
          "UPDATE statements SET source_url=?, review_status='verified', reviewed_by='reviewer', source_read=1 WHERE id=?",
        )
        .run(url, id),
    );
  }
  assert.equal(comparison(db).statements.length, 0);
});

test('CSV supports quoted commas, quotes, multiline content, and CRLF', () => {
  const rows = parseCsv(
    'candidate_id,topic_id,text,text_type,source_url,source_type,source_title\r\npaxton,education,"EXAMPLE ONLY, ""quoted""\nsecond line",direct_quote,https://example.com,speech,Example\r\n',
  );
  assert.equal(rows[0].text, 'EXAMPLE ONLY, "quoted"\nsecond line');
  assert.throws(() => parseCsv('a,a\n1,2'), /unique/);
});

test('CSV import cannot promote a supplied verified status', (t) => {
  const db = withDb(t);
  const [id] = importDrafts(
    db,
    researcher,
    'candidate_id,topic_id,text,text_type,source_url,source_type,source_title,review_status\npaxton,education,EXAMPLE ONLY,direct_quote,https://example.com,speech,Example,verified',
  );
  assert.equal(
    db.prepare('SELECT review_status FROM statements WHERE id=?').get(id).review_status,
    'draft',
  );
});

test('invalid later CSV rows roll back the entire import and its audit events', (t) => {
  const db = withDb(t);
  assert.throws(() =>
    importDrafts(
      db,
      researcher,
      'candidate_id,topic_id,text,text_type,source_url,source_type,source_title\npaxton,education,EXAMPLE ONLY,direct_quote,https://example.com,speech,Example\npaxton,invalid,EXAMPLE ONLY,direct_quote,https://example.com,speech,Example',
    ),
  );
  assert.equal(db.prepare('SELECT count(*) AS n FROM statements').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM audit_log').get().n, 0);
});

test('corrections require a public statement and create a task without changing its text', (t) => {
  const db = withDb(t),
    id = saveDraft(db, researcher, exampleDraft());
  assert.throws(() => recordCorrection(db, id, 'EXAMPLE ONLY correction'), /Published statement/);
  approve(db, id);
  recordCorrection(db, id, 'EXAMPLE ONLY correction');
  assert.equal(db.prepare('SELECT kind FROM review_tasks').get().kind, 'correction');
  assert.equal(comparison(db).statements[0].text, exampleDraft().text);
});

test('unavailable links retain verified records, deduplicate tasks, and resolve on recovery', async (t) => {
  const db = withDb(t),
    id = saveDraft(db, researcher, exampleDraft());
  approve(db, id);
  await checkVerifiedLinks(db, async () => false);
  await checkVerifiedLinks(db, async () => false);
  assert.equal(comparison(db).statements[0].link_status, 'unavailable');
  assert.equal(comparison(db).statements.length, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM review_tasks').get().n, 1);
  await checkVerifiedLinks(db, async () => true);
  assert.equal(db.prepare('SELECT status FROM review_tasks').get().status, 'resolved');
});

test('link checker blocks local, private, reserved, and IP-literal destinations', async () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.0.1',
    '::1',
    '100.64.0.1',
    '224.0.0.1',
  ])
    assert.equal(isPublicIPv4(address), false);
  assert.equal(isPublicIPv4('8.8.8.8'), true);
  for (const url of [
    'http://127.0.0.1',
    'http://localhost',
    'http://[::1]',
    'https://example.com:8443',
  ])
    await assert.rejects(checkSource(url));
});
