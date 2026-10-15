/**
 * The account's copy of the player's records.
 *
 *   GET /api/save   { data, updatedAt } — data is null before the first upload
 *   PUT /api/save   { data, base } — written only if the copy is still the
 *                   one `base` names; otherwise 409 with what is there now
 *
 * `data` is the game's localStorage, key by key: only the game's own keys,
 * and never the local ranking board, which the server owns.
 */
import { sessionUser } from './auth';
import type { Env } from './env';
import { json, readJson, sameOrigin } from './http';

const PREFIX = 'exiled-survivors:';
/** Kept apart: the board comes from the server, the sync note is per browser. */
const NOT_SAVED = ['exiled-survivors:ranking:v1', 'exiled-survivors:sync:v1'];
/** A stash a few hundred swords deep is still far under this. */
const MAX_BYTES = 512 * 1024;

/** Only the game's keys, as strings; null when it is not that shape. */
export function cleanSave(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.startsWith(PREFIX) && !NOT_SAVED.includes(key) && typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

export async function getSave(request: Request, env: Env): Promise<Response> {
  const user = await sessionUser(request, env);
  if (!user) {
    return json({ error: 'signed out' }, 401);
  }
  const row = await env.DB.prepare('SELECT data, updated_at AS updatedAt FROM saves WHERE user_id = ?1')
    .bind(user.id)
    .first<{ data: string; updatedAt: number }>();
  return json(
    { data: row ? (JSON.parse(row.data) as unknown) : null, updatedAt: row?.updatedAt ?? 0 },
    200,
    { 'Cache-Control': 'no-store' },
  );
}

export async function putSave(request: Request, env: Env): Promise<Response> {
  if (!sameOrigin(request)) {
    return json({ error: 'origin' }, 403);
  }
  const user = await sessionUser(request, env);
  if (!user) {
    return json({ error: 'signed out' }, 401);
  }

  const body = (await readJson(request, MAX_BYTES)) as { data?: unknown; base?: unknown } | null;
  const data = cleanSave(body?.data);
  const base = Number(body?.base);
  if (!data || !Number.isFinite(base)) {
    return json({ error: 'body' }, 400);
  }

  // Written only if the copy is still the one this browser last saw — in one
  // statement, so two devices writing at once cannot both win.
  const updatedAt = Math.max(Date.now(), base + 1);
  const text = JSON.stringify(data);
  const written =
    base === 0
      ? await env.DB.prepare('INSERT OR IGNORE INTO saves (user_id, data, updated_at) VALUES (?1, ?2, ?3)')
          .bind(user.id, text, updatedAt)
          .run()
      : await env.DB.prepare('UPDATE saves SET data = ?2, updated_at = ?3 WHERE user_id = ?1 AND updated_at = ?4')
          .bind(user.id, text, updatedAt, base)
          .run();

  if ((written.meta.changes ?? 0) !== 1) {
    // Someone — another device — wrote since this browser last looked.
    const current = await env.DB.prepare('SELECT data, updated_at AS updatedAt FROM saves WHERE user_id = ?1')
      .bind(user.id)
      .first<{ data: string; updatedAt: number }>();
    return json(
      { error: 'conflict', data: current ? (JSON.parse(current.data) as unknown) : null, updatedAt: current?.updatedAt ?? 0 },
      409,
    );
  }
  return json({ ok: true, updatedAt });
}
