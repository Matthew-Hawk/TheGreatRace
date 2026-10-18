import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateSourceUrl } from './domain.js';

const topicNames = [
  ['taxes', 'Taxes and budget', 'Revenue, spending, and fiscal policy'],
  ['education', 'Education', 'Schools, teachers, and higher education'],
  ['healthcare', 'Healthcare', 'Access, coverage, and public health'],
  ['economy', 'Economy, jobs and trade', 'Work, business, and international trade'],
  ['immigration', 'Immigration', 'Border policy and immigration systems'],
  ['energy', 'Energy and environment', 'Energy, climate, and natural resources'],
  [
    'foreign-policy',
    'Foreign policy and national security',
    'Diplomacy, defense, and international affairs',
  ],
  ['justice', 'Criminal justice and public safety', 'Courts, policing, and public safety'],
  ['civil-rights', 'Civil rights and voting', 'Civil liberties and election policy'],
  [
    'reproductive-policy',
    'Abortion and reproductive policy',
    'Reproductive rights and legislation',
  ],
  ['guns', 'Guns', 'Firearms policy and legislation'],
  ['culture', 'Social and cultural issues', 'Social policy and cultural questions'],
  ['technology', 'Technology and privacy', 'Digital rights, privacy, and technology'],
  ['veterans', 'Veterans', 'Services and support for veterans'],
  ['housing', 'Housing', 'Housing supply, affordability, and access'],
  ['agriculture', 'Agriculture and rural issues', 'Farming and rural communities'],
];

export function openDatabase(path = process.env.DATABASE_PATH || './data/great-race.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  // SQLite invokes the same full URL parser as the API, even for direct SQL updates.
  db.function('is_valid_source_url', { deterministic: true }, (source) => {
    try {
      validateSourceUrl(source);
      return 1;
    } catch {
      return 0;
    }
  });
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  // Migrations run in filename order. Add a new migration rather than editing an applied one.
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY);');
  const migrations = readdirSync(new URL('./migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const migration of migrations) {
    if (!db.prepare('SELECT name FROM migrations WHERE name = ?').get(migration)) {
      transaction(db, () => {
        db.exec(readFileSync(new URL(`./migrations/${migration}`, import.meta.url), 'utf8'));
        db.prepare('INSERT INTO migrations VALUES (?)').run(migration);
      });
    }
  }
  seedDatabase(db);
  return db;
}

export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function seedDatabase(db) {
  transaction(db, () => {
    db.prepare(
      "INSERT OR IGNORE INTO races (id, office, state) VALUES ('texas-senate', 'U.S. Senate', 'Texas')",
    ).run();
    const candidate = db.prepare(
      'INSERT OR IGNORE INTO candidates (id, race_id, name, party) VALUES (?, ?, ?, ?)',
    );
    candidate.run('paxton', 'texas-senate', 'Ken Paxton', 'Republican');
    candidate.run('talarico', 'texas-senate', 'James Talarico', 'Democratic');
    const topic = db.prepare(
      'INSERT OR IGNORE INTO topics (id, name, description, sort_order) VALUES (?, ?, ?, ?)',
    );
    topicNames.forEach(([id, name, description], i) => topic.run(id, name, description, i));
    // Never seed statements: a real person must supply and independently review them.
  });
}
