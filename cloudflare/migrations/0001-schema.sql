PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS races (
  id TEXT PRIMARY KEY, office TEXT NOT NULL, state TEXT NOT NULL,
  election_date TEXT, status TEXT NOT NULL DEFAULT 'pending_confirmation'
);
CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY, race_id TEXT NOT NULL REFERENCES races(id), name TEXT NOT NULL,
  party TEXT NOT NULL CHECK (party IN ('Republican', 'Democratic')),
  official_site_url TEXT, UNIQUE(race_id, party)
);
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
  parent_topic_id TEXT REFERENCES topics(id), sort_order INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('researcher', 'reviewer'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL, credential_version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS statements (
  id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES candidates(id),
  topic_id TEXT NOT NULL REFERENCES topics(id), text TEXT NOT NULL CHECK(length(trim(text)) > 0),
  text_type TEXT NOT NULL CHECK(text_type IN ('direct_quote', 'paraphrase')),
  source_url TEXT, source_type TEXT NOT NULL, source_title TEXT NOT NULL,
  statement_date TEXT, added_by TEXT NOT NULL REFERENCES users(id),
  reviewed_by TEXT REFERENCES users(id),
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK(review_status IN ('draft', 'verified', 'flagged')),
  source_read INTEGER NOT NULL DEFAULT 0 CHECK(source_read IN (0, 1)),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_link_check_at TEXT,
  link_status TEXT NOT NULL DEFAULT 'unchecked' CHECK(link_status IN ('unchecked', 'available', 'unavailable')),
  -- D1 has no custom SQL functions. The shared domain validator parses the full URL;
  -- this constraint independently enforces HTTP(S) shape and review requirements.
  CHECK(review_status != 'verified' OR (
    source_url IS NOT NULL AND length(source_url) <= 2048
    AND (source_url GLOB 'https://[A-Za-z0-9]*' OR source_url GLOB 'http://[A-Za-z0-9]*')
    AND instr(source_url, ' ') = 0 AND instr(source_url, char(9)) = 0
    AND instr(source_url, char(10)) = 0 AND instr(source_url, char(13)) = 0
    AND reviewed_by IS NOT NULL AND reviewed_by != added_by AND source_read = 1
  ))
);
CREATE INDEX IF NOT EXISTS statements_public ON statements(review_status, topic_id, candidate_id);
CREATE TABLE IF NOT EXISTS review_tasks (
  id TEXT PRIMARY KEY, statement_id TEXT NOT NULL REFERENCES statements(id),
  kind TEXT NOT NULL CHECK(kind IN ('correction', 'broken_link')),
  message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_link_task ON review_tasks(statement_id)
  WHERE kind = 'broken_link' AND status = 'open';
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL,
  action TEXT NOT NULL, statement_id TEXT, details TEXT NOT NULL, created_at TEXT NOT NULL
);


CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX rate_limit_expiration ON rate_limits(expires_at);
