import { onRequest } from './api.js';

const applicationPages = new Set(['/races', '/compare', '/methodology', '/editorial']);

// Workers deploys this entry point; Pages continues to discover functions/api/.
// Both hosts use the same API, D1 repository, validation, and browser assets.
export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return onRequest({ request, env, waitUntil: context.waitUntil.bind(context) });
    }
    if (applicationPages.has(url.pathname)) {
      url.pathname = '/';
      return env.ASSETS.fetch(new Request(url, request));
    }
    return env.ASSETS.fetch(request);
  },
};
