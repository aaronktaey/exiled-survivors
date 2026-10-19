/**
 * The game's one Worker: it serves the built game, and everything under /api.
 * Static files never reach this code — Cloudflare serves them from the
 * `assets` directory for free — so only /api requests run it and count
 * toward the request quota.
 *
 *   /api/ranking, /api/ranking/me   ranking.ts (and the admin's /review, /remove)
 *   /api/auth/*, /api/me            auth.ts
 *   /api/save                       save.ts
 *   /api/balance                    tuning.ts
 */
import { callback, deleteMe, facebookDeletion, logout, me, start } from './auth';
import type { Env } from './env';
import { json } from './http';
import { board, forgetBoard, mine, podium, podiumMine, podiumSeen, removeEntry, review, submit } from './ranking';
import { getSave, putSave } from './save';
import { getTuning, putTuning } from './tuning';

export type { Env } from './env';
export { RULES, implausible, problemWith } from './ranking';

const AUTH_ROUTE = /^\/api\/auth\/([a-z]+)\/(start|callback)$/;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    const method = request.method;

    if (pathname === '/api/ranking') {
      if (method === 'GET') return board(request, env, ctx);
      if (method === 'POST') return submit(request, env, ctx);
      return json({ error: 'method' }, 405, { Allow: 'GET, POST' });
    }
    if (pathname === '/api/ranking/me' && method === 'GET') {
      return mine(request, env);
    }
    if (pathname === '/api/ranking/podium' && method === 'GET') {
      return podium(request, env, ctx);
    }
    if (pathname === '/api/ranking/podium/me' && method === 'GET') {
      return podiumMine(request, env);
    }
    if (pathname === '/api/ranking/podium/seen' && method === 'POST') {
      return podiumSeen(request, env);
    }
    if (pathname === '/api/ranking/review' && method === 'GET') {
      return review(request, env);
    }
    if (pathname === '/api/ranking/remove' && method === 'POST') {
      return removeEntry(request, env);
    }

    const auth = AUTH_ROUTE.exec(pathname);
    if (auth && method === 'GET') {
      const [, provider = '', step] = auth;
      return step === 'start' ? start(request, env, provider) : callback(request, env, provider);
    }
    if (pathname === '/api/me' && method === 'GET') {
      return me(request, env);
    }
    if (pathname === '/api/auth/logout' && method === 'POST') {
      return logout(request, env);
    }
    if (pathname === '/api/me/delete' && method === 'POST') {
      const response = await deleteMe(request, env);
      if (response.ok) {
        forgetBoard(request, ctx);
      }
      return response;
    }
    if (pathname === '/api/auth/facebook/deletion' && method === 'POST') {
      const response = await facebookDeletion(request, env);
      if (response.ok) {
        forgetBoard(request, ctx);
      }
      return response;
    }

    if (pathname === '/api/save') {
      if (method === 'GET') return getSave(request, env);
      if (method === 'PUT') return putSave(request, env);
      return json({ error: 'method' }, 405, { Allow: 'GET, PUT' });
    }

    if (pathname === '/api/balance') {
      if (method === 'GET') return getTuning(request, env, ctx);
      if (method === 'PUT') return putTuning(request, env, ctx);
      return json({ error: 'method' }, 405, { Allow: 'GET, PUT' });
    }

    if (pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, 404);
    }

    // Anything else is the game itself.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
