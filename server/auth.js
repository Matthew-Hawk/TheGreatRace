import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { ValidationError } from './domain.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const SESSION_LIFETIME = 8 * 60 * 60 * 1000;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, encoded) {
  const [salt, expected] = encoded.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(expected, 'hex'));
}

/** Accounts are provisioned by deployment configuration, never by public registration. */
export function configureUsers(db, env = process.env) {
  const pairs = [
    ['researcher', env.RESEARCHER_PASSWORD],
    ['reviewer', env.REVIEWER_PASSWORD],
  ];
  if (pairs[0][1] && pairs[0][1] === pairs[1][1])
    throw new Error('Use different passwords for the researcher and reviewer.');
  for (const [role, password] of pairs) {
    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(role);
    // Unconfigured accounts are disabled, including sessions left over from an earlier run.
    if (!password) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(role);
      continue;
    }
    if (password.length < 12) throw new Error(`${role} password must have at least 12 characters.`);
    if (!existing || !verifyPassword(password, existing.password_hash)) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(role);
      db.prepare(
        `INSERT INTO users (id, password_hash, role) VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash`,
      ).run(role, hashPassword(password), role);
    }
  }
}

export function login(db, username, password, env = process.env) {
  const enabled =
    username === 'researcher'
      ? env.RESEARCHER_PASSWORD
      : username === 'reviewer'
        ? env.REVIEWER_PASSWORD
        : null;
  const user =
    typeof username === 'string'
      ? db.prepare('SELECT * FROM users WHERE id = ?').get(username)
      : null;
  // Run a password derivation for unknown accounts too, reducing username timing leakage.
  const valid = verifyPassword(
    typeof password === 'string' ? password : '',
    user?.password_hash || dummyHash,
  );
  if (!enabled || !user || !valid)
    throw new ValidationError('Incorrect username or password, or account not configured.', 401);
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(
    digest(token),
    user.id,
    Date.now() + SESSION_LIFETIME,
  );
  return { token, user: { id: user.id, role: user.role } };
}

const dummyHash = hashPassword(randomBytes(32).toString('hex'));

function tokenFromRequest(req) {
  return (
    (req.headers.cookie || '')
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('session='))
      ?.slice(8) || ''
  );
}

export function currentUser(db, req) {
  return (
    db
      .prepare(
        `SELECT users.id, users.role FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE token_hash = ? AND expires_at > ?`,
      )
      .get(digest(tokenFromRequest(req)), Date.now()) || null
  );
}

export function logout(db, req) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(tokenFromRequest(req)));
}

export function sessionCookie(token, secure = false) {
  return `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? SESSION_LIFETIME / 1000 : 0}${secure ? '; Secure' : ''}`;
}
