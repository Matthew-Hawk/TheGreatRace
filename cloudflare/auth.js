import { ValidationError } from '../server/domain.js';

const encoder = new TextEncoder();
const SESSION_LIFETIME = 8 * 60 * 60 * 1000;
const hex = (bytes) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
const unhex = (value) => Uint8Array.from(value.match(/.{2}/g) || [], (pair) => parseInt(pair, 16));

export async function digest(value) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function configuredPassword(env, username) {
  return username === 'researcher'
    ? env.RESEARCHER_PASSWORD
    : username === 'reviewer'
      ? env.REVIEWER_PASSWORD
      : null;
}

async function signingKey(env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    throw new ValidationError(
      'Contributor access is not configured. Set the Pages SESSION_SECRET.',
      503,
    );
  }
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

// Passwords stay in encrypted Cloudflare secrets. Only a secret-keyed version marker
// enters D1; it revokes sessions immediately after a password or signing-secret change.
async function credentialVersion(env, username, password) {
  const key = await signingKey(env);
  return hex(
    await crypto.subtle.sign('HMAC', key, encoder.encode(JSON.stringify([username, password]))),
  );
}

function cookieToken(request) {
  return (
    (request.headers.get('Cookie') || '')
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('session='))
      ?.slice(8) || ''
  );
}

export async function login(db, env, input) {
  if (!input || typeof input.password !== 'string' || input.password.length > 500) {
    throw new ValidationError('Enter your username and password.');
  }
  const expected = configuredPassword(env, input.username);
  if (!expected || expected.length < 12 || env.RESEARCHER_PASSWORD === env.REVIEWER_PASSWORD) {
    throw new ValidationError('Incorrect username or password, or account not configured.', 401);
  }
  const key = await signingKey(env);
  const supplied = await credentialVersion(env, input.username, input.password);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    unhex(supplied),
    encoder.encode(JSON.stringify([input.username, expected])),
  );
  if (!valid)
    throw new ValidationError('Incorrect username or password, or account not configured.', 401);
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
    db
      .prepare(
        'INSERT INTO sessions (token_hash, user_id, expires_at, credential_version) VALUES (?, ?, ?, ?)',
      )
      .bind(await digest(token), input.username, Date.now() + SESSION_LIFETIME, supplied),
    db
      .prepare('INSERT INTO audit_log (actor_id, action, details, created_at) VALUES (?, ?, ?, ?)')
      .bind(input.username, 'session.started', '{}', new Date().toISOString()),
  ]);
  return { token, user: { id: input.username, role: input.username } };
}

export async function currentUser(db, request, env) {
  const token = cookieToken(request);
  if (!token || !env.SESSION_SECRET) return null;
  const session = await db
    .prepare(
      `SELECT users.id, users.role, sessions.credential_version FROM sessions
    JOIN users ON users.id = sessions.user_id WHERE token_hash = ? AND expires_at > ?`,
    )
    .bind(await digest(token), Date.now())
    .first();
  if (!session) return null;
  const password = configuredPassword(env, session.id);
  if (!password || password.length < 12 || env.RESEARCHER_PASSWORD === env.REVIEWER_PASSWORD)
    return null;
  const valid = await crypto.subtle.verify(
    'HMAC',
    await signingKey(env),
    unhex(session.credential_version),
    encoder.encode(JSON.stringify([session.id, password])),
  );
  return valid ? { id: session.id, role: session.role } : null;
}

export async function logout(db, request) {
  await db
    .prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(await digest(cookieToken(request)))
    .run();
}

export function sessionCookie(token, request) {
  const secure = new URL(request.url).protocol === 'https:';
  return `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? SESSION_LIFETIME / 1000 : 0}${secure ? '; Secure' : ''}`;
}
