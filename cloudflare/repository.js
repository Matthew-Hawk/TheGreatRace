import { assertReviewAllowed, validateDraft, ValidationError } from '../server/domain.js';
import { parseCsv } from '../server/csv-parser.js';

function audit(db, actor, action, statementId, details = {}) {
  return db
    .prepare(
      'INSERT INTO audit_log (actor_id, action, statement_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(actor, action, statementId, JSON.stringify(details), new Date().toISOString());
}

export async function comparison(db) {
  const [races, candidates, topics, statements] = await db.batch([
    db.prepare("SELECT * FROM races WHERE id = 'texas-senate'"),
    db.prepare("SELECT * FROM candidates WHERE race_id = 'texas-senate' ORDER BY party DESC"),
    db.prepare('SELECT * FROM topics ORDER BY sort_order'),
    db.prepare(`SELECT s.id, s.candidate_id, s.topic_id, s.text, s.text_type, s.source_url,
      s.source_type, s.source_title, s.statement_date, s.created_at, s.review_status, s.link_status, s.last_link_check_at
      FROM statements s JOIN candidates c ON c.id = s.candidate_id
      WHERE s.review_status = 'verified' AND c.race_id = 'texas-senate' ORDER BY s.created_at DESC`),
  ]);
  if (!races.results[0])
    throw new ValidationError('Apply the D1 migrations before opening the comparison.', 503);
  return {
    race: races.results[0],
    candidates: candidates.results,
    topics: topics.results,
    statements: statements.results,
  };
}

export async function editorialData(db) {
  const [statements, tasks, history] = await db.batch([
    db.prepare('SELECT * FROM statements ORDER BY created_at DESC'),
    db.prepare("SELECT * FROM review_tasks WHERE status = 'open' ORDER BY created_at DESC"),
    db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100'),
  ]);
  return { statements: statements.results, tasks: tasks.results, audit: history.results };
}

export async function saveDrafts(db, actor, rawRecords, imported = false) {
  const drafts = rawRecords.map(validateDraft);
  const references = await db.batch([
    db.prepare('SELECT id FROM candidates'),
    db.prepare('SELECT id FROM topics'),
  ]);
  const candidates = new Set(references[0].results.map((row) => row.id));
  const topics = new Set(references[1].results.map((row) => row.id));
  for (const draft of drafts)
    if (!candidates.has(draft.candidate_id) || !topics.has(draft.topic_id)) {
      throw new ValidationError('Choose an existing candidate and topic.');
    }
  const ids = drafts.map(() => crypto.randomUUID()),
    writes = [],
    now = new Date().toISOString();
  drafts.forEach((draft, index) => {
    writes.push(
      db
        .prepare(
          `INSERT INTO statements (id, candidate_id, topic_id, text, text_type, source_url,
      source_type, source_title, statement_date, added_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          ids[index],
          draft.candidate_id,
          draft.topic_id,
          draft.text,
          draft.text_type,
          draft.source_url,
          draft.source_type,
          draft.source_title,
          draft.statement_date,
          actor.id,
          now,
          now,
        ),
    );
    writes.push(audit(db, actor.id, 'statement.created', ids[index], draft));
  });
  if (imported) writes.push(audit(db, actor.id, 'csv.imported', null, { count: ids.length }));
  // D1 batch is atomic. Never emulate BEGIN/COMMIT over separate network requests.
  await db.batch(writes);
  return ids;
}

export function importDrafts(db, actor, csv) {
  const rows = parseCsv(csv);
  // Keep validation, inserts, and audits within the D1 free plan's per-request query limit.
  if (rows.length > 20)
    throw new ValidationError(
      'Cloudflare imports accept at most 20 rows per batch. Split your CSV into smaller files.',
    );
  return saveDrafts(db, actor, rows, true);
}

export async function reviewStatement(db, actor, id, input) {
  const statement = await db.prepare('SELECT * FROM statements WHERE id = ?').bind(id).first();
  if (!statement) throw new ValidationError('Statement not found.', 404);
  assertReviewAllowed(statement, actor, input);
  await db.batch([
    db
      .prepare(
        'UPDATE statements SET review_status = ?, reviewed_by = ?, source_read = ?, updated_at = ? WHERE id = ?',
      )
      .bind(
        input.review_status,
        actor.id,
        input.source_read === true ? 1 : 0,
        new Date().toISOString(),
        id,
      ),
    audit(db, actor.id, 'statement.reviewed', id, { before: statement.review_status, ...input }),
  ]);
}

export async function recordCorrection(db, id, message) {
  const statement = await db
    .prepare("SELECT id FROM statements WHERE id = ? AND review_status = 'verified'")
    .bind(id)
    .first();
  if (!statement) throw new ValidationError('Published statement not found.', 404);
  await db.batch([
    db
      .prepare(
        "INSERT INTO review_tasks (id, statement_id, kind, message, created_at) VALUES (?, ?, 'correction', ?, ?)",
      )
      .bind(crypto.randomUUID(), id, message, new Date().toISOString()),
    audit(db, 'public', 'correction.submitted', id, { message }),
  ]);
}

export async function resolveReviewTask(db, actor, id) {
  if (actor.role !== 'reviewer') throw new ValidationError('A reviewer account is required.', 403);
  const task = await db.prepare('SELECT * FROM review_tasks WHERE id = ?').bind(id).first();
  if (!task) throw new ValidationError('Review task not found.', 404);
  await db.batch([
    db.prepare("UPDATE review_tasks SET status = 'resolved' WHERE id = ?").bind(id),
    audit(db, actor.id, 'task.resolved', task.statement_id, { task_id: id }),
  ]);
}

/** Shared, atomic limits survive cold starts and are keyed by a hash of the client IP. */
export async function enforceRateLimit(db, key, maximum) {
  const now = Date.now(),
    expires = now + 15 * 60 * 1000;
  const results = await db.batch([
    db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now),
    db
      .prepare(
        `INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`,
      )
      .bind(key, expires),
  ]);
  if (results[1].results[0].count > maximum)
    throw new ValidationError('Too many requests. Wait 15 minutes before trying again.', 429);
}
