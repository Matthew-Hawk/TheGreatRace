import { randomUUID } from 'node:crypto';
import { transaction } from './database.js';
import { assertReviewAllowed, validateDraft, ValidationError } from './domain.js';

export function audit(db, actor, action, statementId, details = {}) {
  db.prepare(
    'INSERT INTO audit_log (actor_id, action, statement_id, details, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(actor, action, statementId, JSON.stringify(details), new Date().toISOString());
}

export function comparison(db) {
  return {
    race: db.prepare('SELECT * FROM races WHERE id = ?').get('texas-senate'),
    candidates: db
      .prepare('SELECT * FROM candidates WHERE race_id = ? ORDER BY party DESC')
      .all('texas-senate'),
    topics: db.prepare('SELECT * FROM topics ORDER BY sort_order').all(),
    // Only this query feeds public rendering. Revalidate source syntax defensively in the UI too.
    statements: db
      .prepare(
        `SELECT id, candidate_id, topic_id, text, text_type, source_url,
      source_type, source_title, statement_date, created_at, review_status, link_status, last_link_check_at
      FROM statements WHERE review_status = 'verified' ORDER BY created_at DESC`,
      )
      .all(),
  };
}

export function createDraft(db, actor, raw) {
  const draft = validateDraft(raw);
  if (
    !db.prepare('SELECT id FROM candidates WHERE id = ?').get(draft.candidate_id) ||
    !db.prepare('SELECT id FROM topics WHERE id = ?').get(draft.topic_id)
  ) {
    throw new ValidationError('Choose an existing candidate and topic.');
  }
  const id = randomUUID(),
    now = new Date().toISOString();
  db.prepare(
    `INSERT INTO statements (id, candidate_id, topic_id, text, text_type, source_url,
    source_type, source_title, statement_date, added_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
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
  );
  audit(db, actor.id, 'statement.created', id, draft);
  return id;
}

export function saveDraft(db, actor, raw) {
  return transaction(db, () => createDraft(db, actor, raw));
}

export function reviewStatement(db, actor, id, input) {
  return transaction(db, () => {
    const statement = db.prepare('SELECT * FROM statements WHERE id = ?').get(id);
    if (!statement) throw new ValidationError('Statement not found.', 404);
    assertReviewAllowed(statement, actor, input);
    db.prepare(
      'UPDATE statements SET review_status = ?, reviewed_by = ?, source_read = ?, updated_at = ? WHERE id = ?',
    ).run(
      input.review_status,
      actor.id,
      input.source_read === true ? 1 : 0,
      new Date().toISOString(),
      id,
    );
    audit(db, actor.id, 'statement.reviewed', id, { before: statement.review_status, ...input });
  });
}

export function recordCorrection(db, id, message) {
  return transaction(db, () => {
    if (
      !db.prepare("SELECT id FROM statements WHERE id = ? AND review_status = 'verified'").get(id)
    ) {
      throw new ValidationError('Published statement not found.', 404);
    }
    db.prepare(
      "INSERT INTO review_tasks (id, statement_id, kind, message, created_at) VALUES (?, ?, 'correction', ?, ?)",
    ).run(randomUUID(), id, message, new Date().toISOString());
    audit(db, 'public', 'correction.submitted', id, { message });
  });
}

export function resolveReviewTask(db, actor, taskId) {
  if (actor.role !== 'reviewer') throw new ValidationError('A reviewer account is required.', 403);
  transaction(db, () => {
    const task = db.prepare('SELECT * FROM review_tasks WHERE id = ?').get(taskId);
    if (!task) throw new ValidationError('Review task not found.', 404);
    db.prepare("UPDATE review_tasks SET status = 'resolved' WHERE id = ?").run(taskId);
    audit(db, actor.id, 'task.resolved', task.statement_id, { task_id: taskId });
  });
}

export function recordLinkHealth(db, id, available) {
  transaction(db, () => {
    db.prepare('UPDATE statements SET link_status = ?, last_link_check_at = ? WHERE id = ?').run(
      available ? 'available' : 'unavailable',
      new Date().toISOString(),
      id,
    );
    // A broken link creates a separate task; it must not silently unpublish reviewed text.
    if (!available)
      db.prepare(
        `INSERT OR IGNORE INTO review_tasks (id, statement_id, kind, message, created_at)
      VALUES (?, ?, 'broken_link', 'Source unavailable; inspect the original and update the record.', ?)`,
      ).run(randomUUID(), id, new Date().toISOString());
    else
      db.prepare(
        "UPDATE review_tasks SET status = 'resolved' WHERE statement_id = ? AND kind = 'broken_link' AND status = 'open'",
      ).run(id);
    audit(db, 'link-checker', 'source.checked', id, { available });
  });
}
