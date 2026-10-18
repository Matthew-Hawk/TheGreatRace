import { ValidationError, requiredText } from '../server/domain.js';
import { currentUser, digest, login, logout, sessionCookie } from './auth.js';
import {
  comparison,
  editorialData,
  saveDrafts,
  importDrafts,
  reviewStatement,
  recordCorrection,
  resolveReviewTask,
  enforceRateLimit,
} from './repository.js';

const securityHeaders = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};
const json = (status, value, extra = {}) =>
  Response.json(value, { status, headers: { ...securityHeaders, ...extra } });

async function body(request) {
  if (!(request.headers.get('Content-Type') || '').startsWith('application/json'))
    throw new ValidationError('Send JSON content.', 415);
  const reader = request.body?.getReader();
  if (!reader) throw new ValidationError('A JSON body is required.');
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 250000) {
      await reader.cancel();
      throw new ValidationError('Request exceeds 250 KB.', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ValidationError('Request is not valid JSON.');
  }
}

export async function onRequest({ request, env }) {
  try {
    if (!env.DB)
      throw new ValidationError(
        'Bind a Cloudflare D1 database named DB and apply its migrations.',
        503,
      );
    const { pathname: path, origin } = new URL(request.url),
      method = request.method,
      db = env.DB;
    if (!['GET', 'POST'].includes(method)) throw new ValidationError('Method not allowed.', 405);
    if (method === 'POST' && request.headers.get('Origin') !== origin)
      throw new ValidationError('Request origin is not allowed.', 403);
    if (method === 'GET' && path === '/api/comparison') return json(200, await comparison(db));
    if (method === 'GET' && path === '/api/session')
      return json(200, { user: await currentUser(db, request, env) });
    if (method === 'POST' && path === '/api/login') {
      await enforceRateLimit(
        db,
        `login:${await digest(request.headers.get('CF-Connecting-IP') || 'local')}`,
        15,
      );
      const session = await login(db, env, await body(request));
      return json(
        200,
        { user: session.user },
        { 'Set-Cookie': sessionCookie(session.token, request) },
      );
    }
    if (method === 'POST' && path === '/api/logout') {
      await logout(db, request);
      return json(200, { ok: true }, { 'Set-Cookie': sessionCookie('', request) });
    }
    if (method === 'POST' && path === '/api/corrections') {
      await enforceRateLimit(
        db,
        `correction:${await digest(request.headers.get('CF-Connecting-IP') || 'local')}`,
        10,
      );
      const input = await body(request);
      await recordCorrection(
        db,
        requiredText(input?.statement_id, 'Statement ID', 100),
        requiredText(input?.message, 'Correction', 2000),
      );
      return json(201, { ok: true });
    }
    const user = await currentUser(db, request, env);
    if (!user) throw new ValidationError('Sign in to access the editorial workspace.', 401);
    if (method === 'GET' && path === '/api/admin') return json(200, await editorialData(db));
    if (method === 'POST' && path === '/api/statements')
      return json(201, { id: (await saveDrafts(db, user, [await body(request)]))[0] });
    if (method === 'POST' && path === '/api/import')
      return json(201, { ids: await importDrafts(db, user, (await body(request))?.csv) });
    const review = path.match(/^\/api\/statements\/([^/]+)\/review$/);
    if (method === 'POST' && review) {
      await reviewStatement(db, user, review[1], await body(request));
      return json(200, { ok: true });
    }
    const task = path.match(/^\/api\/tasks\/([^/]+)\/resolve$/);
    if (method === 'POST' && task) {
      await resolveReviewTask(db, user, task[1]);
      return json(200, { ok: true });
    }
    throw new ValidationError('Endpoint not found.', 404);
  } catch (error) {
    if (error instanceof ValidationError) return json(error.status, { error: error.message });
    console.error('Pages API request failed:', error.message);
    return json(500, {
      error:
        'The server could not complete this request. Check the D1 binding and migrations, then retry.',
    });
  }
}
