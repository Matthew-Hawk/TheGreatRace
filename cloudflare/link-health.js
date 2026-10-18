import { validateSourceUrl } from '../server/domain.js';

/** Worker fetch uses public HTTP(S) hostnames only; redirects receive the same checks.
 * No service bindings, VPC access, credentials, or private-network gateway are attached.
 */
export async function checkSource(source, fetcher = fetch, redirects = 0, method = 'HEAD') {
  const url = new URL(validateSourceUrl(source));
  if (
    (url.port && !['80', '443'].includes(url.port)) ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname) ||
    /\.(?:localhost|local|internal|test|invalid|home\.arpa)$/i.test(url.hostname)
  ) {
    throw new Error('Only public HTTP(S) source hostnames can be checked.');
  }
  const response = await fetcher(url.href, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'TheGreatRace-SourceCheck/0.1' },
  });
  const location = response.headers.get('Location');
  await response.body?.cancel();
  if ([301, 302, 303, 307, 308].includes(response.status) && location) {
    if (redirects >= 3) throw new Error('Too many redirects.');
    return checkSource(new URL(location, url).href, fetcher, redirects + 1, method);
  }
  if ([405, 501].includes(response.status) && method === 'HEAD')
    return checkSource(source, fetcher, redirects, 'GET');
  return response.ok;
}

export async function checkVerifiedLinks(db, checker = checkSource) {
  const records = await db
    .prepare(
      `SELECT id, source_url FROM statements WHERE review_status='verified'
    ORDER BY COALESCE(last_link_check_at, '') LIMIT 5`,
    )
    .all();
  let unavailable = 0;
  // Bounded runs fit D1 query/subrequest limits and rotate through the oldest checks first.
  for (const statement of records.results) {
    let available = false;
    try {
      available = await checker(statement.source_url);
    } catch {
      /* Keep the text published; queue human inspection. */
    }
    if (!available) unavailable++;
    const now = new Date().toISOString();
    const task = available
      ? db
          .prepare(
            "UPDATE review_tasks SET status='resolved' WHERE statement_id=? AND kind='broken_link' AND status='open'",
          )
          .bind(statement.id)
      : db
          .prepare(
            "INSERT OR IGNORE INTO review_tasks (id, statement_id, kind, message, created_at) VALUES (?, ?, 'broken_link', 'Source unavailable; inspect the original and update the record.', ?)",
          )
          .bind(crypto.randomUUID(), statement.id, now);
    await db.batch([
      db
        .prepare('UPDATE statements SET link_status=?, last_link_check_at=? WHERE id=?')
        .bind(available ? 'available' : 'unavailable', now, statement.id),
      task,
      db
        .prepare(
          "INSERT INTO audit_log (actor_id, action, statement_id, details, created_at) VALUES ('link-checker','source.checked',?,?,?)",
        )
        .bind(statement.id, JSON.stringify({ available }), now),
    ]);
  }
  return { checked: records.results.length, unavailable };
}
