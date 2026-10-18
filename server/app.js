import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentUser, login, logout, sessionCookie } from './auth.js';
import {
  comparison,
  saveDraft,
  reviewStatement,
  recordCorrection,
  resolveReviewTask,
  audit,
} from './repository.js';
import { importDrafts } from './csv.js';
import { requiredText, ValidationError } from './domain.js';

const PUBLIC_ROOT = resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
};

async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json'))
    throw new ValidationError('Send JSON content.', 415);
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 250000) throw new ValidationError('Request exceeds 250 KB.', 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Request is not valid JSON.');
  }
}

/** Rate limits are process-local. Deploy a shared edge limiter before scaling instances. */
function createLimiter() {
  const entries = new Map();
  return (key, limit, window = 15 * 60 * 1000) => {
    const now = Date.now();
    for (const [entryKey, value] of entries) if (value.reset < now) entries.delete(entryKey);
    const entry = entries.get(key) || { count: 0, reset: now + window };
    entry.count++;
    entries.set(key, entry);
    if (entry.count > limit)
      throw new ValidationError('Too many requests. Wait 15 minutes before trying again.', 429);
  };
}

export function createApp(db, env = process.env) {
  const limit = createLimiter();
  const origin = env.APP_ORIGIN || 'http://127.0.0.1:4180';
  return createServer(async (req, res) => {
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    };
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    );
    res.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(req.url, origin),
        path = url.pathname,
        method = req.method;
      const ip = req.socket.remoteAddress || 'unknown';
      if (path.startsWith('/api/')) {
        limit(`all:${ip}`, 1000);
        if (!['GET', 'POST'].includes(method))
          throw new ValidationError('Method not allowed.', 405);
        // JSON-only writes plus an exact origin check protect cookie-authenticated mutations.
        if (method === 'POST' && req.headers.origin !== origin)
          throw new ValidationError('Request origin is not allowed.', 403);
        if (method === 'GET' && path === '/api/comparison') return json(200, comparison(db));
        if (method === 'GET' && path === '/api/session')
          return json(200, { user: currentUser(db, req) });
        if (method === 'POST' && path === '/api/login') {
          limit(`login:${ip}`, 15);
          const input = await body(req);
          if (!input || typeof input.password !== 'string' || input.password.length > 500)
            throw new ValidationError('Enter your username and password.');
          const session = login(db, input.username, input.password, env);
          res.setHeader('Set-Cookie', sessionCookie(session.token, env.COOKIE_SECURE === 'true'));
          audit(db, session.user.id, 'session.started', null);
          return json(200, { user: session.user });
        }
        if (method === 'POST' && path === '/api/logout') {
          logout(db, req);
          res.setHeader('Set-Cookie', sessionCookie('', env.COOKIE_SECURE === 'true'));
          return json(200, { ok: true });
        }
        if (method === 'POST' && path === '/api/corrections') {
          limit(`correction:${ip}`, 10);
          const input = await body(req);
          recordCorrection(
            db,
            requiredText(input?.statement_id, 'Statement ID', 100),
            requiredText(input?.message, 'Correction', 2000),
          );
          return json(201, { ok: true });
        }
        const user = currentUser(db, req);
        if (!user) throw new ValidationError('Sign in to access the editorial workspace.', 401);
        if (method === 'GET' && path === '/api/admin')
          return json(200, {
            statements: db.prepare('SELECT * FROM statements ORDER BY created_at DESC').all(),
            tasks: db
              .prepare("SELECT * FROM review_tasks WHERE status = 'open' ORDER BY created_at DESC")
              .all(),
            audit: db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100').all(),
          });
        if (method === 'POST' && path === '/api/statements')
          return json(201, { id: saveDraft(db, user, await body(req)) });
        if (method === 'POST' && path === '/api/import')
          return json(201, { ids: importDrafts(db, user, (await body(req))?.csv) });
        const review = path.match(/^\/api\/statements\/([^/]+)\/review$/);
        if (method === 'POST' && review) {
          reviewStatement(db, user, review[1], await body(req));
          return json(200, { ok: true });
        }
        const task = path.match(/^\/api\/tasks\/([^/]+)\/resolve$/);
        if (method === 'POST' && task) {
          resolveReviewTask(db, user, task[1]);
          return json(200, { ok: true });
        }
        throw new ValidationError('Endpoint not found.', 404);
      }
      if (method !== 'GET' && method !== 'HEAD')
        throw new ValidationError('Method not allowed.', 405);
      const file =
        path === '/' || ['/races', '/compare', '/methodology', '/editorial'].includes(path)
          ? 'index.html'
          : decodeURIComponent(path).slice(1);
      const absolute = resolve(PUBLIC_ROOT, file);
      if (!absolute.startsWith(PUBLIC_ROOT + sep)) throw new ValidationError('Not found.', 404);
      try {
        const data = await readFile(absolute);
        res.writeHead(200, {
          'Content-Type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`,
        });
        res.end(method === 'HEAD' ? undefined : data);
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR')
          throw new ValidationError('Not found.', 404);
        throw error;
      }
    } catch (error) {
      if (error instanceof ValidationError) return json(error.status, { error: error.message });
      console.error('Request failed:', error.message);
      json(500, {
        error:
          'The server could not complete this request. Your form has been preserved; please retry.',
      });
    }
  });
}
