-- Planning data only. Never insert candidate statements here.
INSERT OR IGNORE INTO races (id, office, state) VALUES ('texas-senate', 'U.S. Senate', 'Texas');
INSERT OR IGNORE INTO candidates (id, race_id, name, party) VALUES
  ('paxton', 'texas-senate', 'Ken Paxton', 'Republican'),
  ('talarico', 'texas-senate', 'James Talarico', 'Democratic');
-- Passwords live in Cloudflare secrets, not in the seed or database.
INSERT OR IGNORE INTO users (id, password_hash, role) VALUES
  ('researcher', 'managed-in-cloudflare-secrets', 'researcher'),
  ('reviewer', 'managed-in-cloudflare-secrets', 'reviewer');
INSERT OR IGNORE INTO topics (id, name, description, sort_order) VALUES
  ('taxes', 'Taxes and budget', 'Revenue, spending, and fiscal policy', 0),
  ('education', 'Education', 'Schools, teachers, and higher education', 1),
  ('healthcare', 'Healthcare', 'Access, coverage, and public health', 2),
  ('economy', 'Economy, jobs and trade', 'Work, business, and international trade', 3),
  ('immigration', 'Immigration', 'Border policy and immigration systems', 4),
  ('energy', 'Energy and environment', 'Energy, climate, and natural resources', 5),
  ('foreign-policy', 'Foreign policy and national security', 'Diplomacy, defense, and international affairs', 6),
  ('justice', 'Criminal justice and public safety', 'Courts, policing, and public safety', 7),
  ('civil-rights', 'Civil rights and voting', 'Civil liberties and election policy', 8),
  ('reproductive-policy', 'Abortion and reproductive policy', 'Reproductive rights and legislation', 9),
  ('guns', 'Guns', 'Firearms policy and legislation', 10),
  ('culture', 'Social and cultural issues', 'Social policy and cultural questions', 11),
  ('technology', 'Technology and privacy', 'Digital rights, privacy, and technology', 12),
  ('veterans', 'Veterans', 'Services and support for veterans', 13),
  ('housing', 'Housing', 'Housing supply, affordability, and access', 14),
  ('agriculture', 'Agriculture and rural issues', 'Farming and rural communities', 15);
