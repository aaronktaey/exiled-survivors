/**
 * 밸런스 다이얼 — the values the admin made everyone's.
 *
 *   GET /api/balance   { overrides, updatedAt }, cached at the edge briefly
 *   PUT /api/balance   { overrides } — an admin account only (ADMIN_USERS)
 *
 * Only the paths in src/config/tuning.ts are taken, each a finite number in
 * [0, TUNING.maxValue]; anything else is refused whole. The game lays these
 * over balance.ts at the start of a run, never in the middle of one.
 */
import { DIAL_PATHS, TUNING } from '../src/config/tuning';
import { isAdmin, sessionUser } from './auth';
import type { Env } from './env';
import { json, readJson, sameOrigin } from './http';

const PATH = '/api/balance';
const cacheKey = (request: Request): string => new URL(PATH, request.url).toString();

/** The overrides as stored, or none. */
async function stored(env: Env): Promise<{ overrides: Record<string, number>; updatedAt: number }> {
  const row = await env.DB.prepare('SELECT overrides, updated_at AS updatedAt FROM tuning WHERE id = 1')
    .first<{ overrides: string; updatedAt: number }>();
  if (!row) {
    return { overrides: {}, updatedAt: 0 };
  }
  try {
    return { overrides: JSON.parse(row.overrides) as Record<string, number>, updatedAt: row.updatedAt };
  } catch {
    return { overrides: {}, updatedAt: row.updatedAt };
  }
}

/** Why a set of overrides is refused, or null when it is fine. */
export function tuningProblem(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return 'body';
  }
  for (const [path, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!DIAL_PATHS.has(path)) {
      return `path ${path}`;
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > TUNING.maxValue) {
      return `value ${path}`;
    }
  }
  return null;
}

export async function getTuning(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const key = new Request(cacheKey(request), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) {
    return hit;
  }
  const response = json(await stored(env), 200, { 'Cache-Control': `public, max-age=${TUNING.cacheSeconds}` });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

export async function putTuning(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!sameOrigin(request)) {
    return json({ error: 'origin' }, 403);
  }
  const user = await sessionUser(request, env);
  if (!user || !isAdmin(env, user.id)) {
    return json({ error: 'admin only' }, 403);
  }
  const body = (await readJson(request, 32_768)) as { overrides?: unknown } | null;
  const problem = tuningProblem(body?.overrides);
  if (problem) {
    return json({ error: problem }, 400);
  }
  const overrides = body!.overrides as Record<string, number>;
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO tuning (id, overrides, updated_at, updated_by) VALUES (1, ?1, ?2, ?3)
     ON CONFLICT (id) DO UPDATE SET overrides = excluded.overrides, updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  )
    .bind(JSON.stringify(overrides), now, user.id)
    .run();
  ctx.waitUntil(caches.default.delete(cacheKey(request)));
  return json({ ok: true, overrides, updatedAt: now });
}
