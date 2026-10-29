/**
 * 오류 수집 (0.160, the user's ask): what went wrong on a player's device.
 *
 *   POST /api/errors   one report (systems/ErrorReport.ts sends it)
 *   GET  /api/errors   the newest reports — the admin's only
 *
 * A report is what the page knew: the message, where in the code, the stack,
 * the build and version, the screen it was on, the window's size, the
 * language and the browser — and the account, when the player was signed in
 * (the user's pick; cleared when the account is deleted). Kept 30 days.
 * One address sends at most LIMITS.perAddressPerDay a day; past that a
 * report is answered and dropped.
 */
import { isAdmin, sessionUser } from './auth';
import type { Env } from './env';
import { hex, json, readJson, sha256, unstored } from './http';

export const ERROR_LIMITS = {
  bodyBytes: 8192,
  message: 300,
  stack: 2000,
  field: 200,
  perAddressPerDay: 60,
  keepDays: 30,
  /** One report in this many also sweeps out what is past keepDays. */
  sweepEvery: 50,
  listMax: 200,
} as const;

const DAY_MS = 86_400_000;

async function addressOf(request: Request, env: Env): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  return hex(await sha256(`${env.IP_SALT ?? 'exiled-survivors'}:${ip}`)).slice(0, 32);
}

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value !== '' ? value.slice(0, max) : null;

export async function reportError(request: Request, env: Env): Promise<Response> {
  const body = (await readJson(request, ERROR_LIMITS.bodyBytes)) as Record<string, unknown> | null;
  const message = text(body?.message, ERROR_LIMITS.message);
  if (!body || !message) {
    return json({ error: 'bad report' }, 400);
  }
  const now = Date.now();
  const address = await addressOf(request, env);
  const sent = await env.DB.prepare('SELECT COUNT(*) AS n FROM errors WHERE address = ?1 AND at > ?2')
    .bind(address, now - DAY_MS)
    .first<{ n: number }>();
  if ((sent?.n ?? 0) >= ERROR_LIMITS.perAddressPerDay) {
    return json({ ok: true, kept: false }, 202);
  }
  const user = await sessionUser(request, env);
  const field = (key: string): string | null => text(body[key], ERROR_LIMITS.field);
  await env.DB.prepare(
    `INSERT INTO errors (at, user_id, address, platform, build, version, message, source, stack, scene, screen, lang, agent)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
  )
    .bind(
      now,
      user?.id ?? null,
      address,
      field('platform'),
      field('build'),
      field('version'),
      message,
      field('source'),
      text(body.stack, ERROR_LIMITS.stack),
      field('scene'),
      field('screen'),
      field('lang'),
      field('agent'),
    )
    .run();
  if (Math.random() < 1 / ERROR_LIMITS.sweepEvery) {
    await env.DB.prepare('DELETE FROM errors WHERE at < ?1').bind(now - ERROR_LIMITS.keepDays * DAY_MS).run();
  }
  return json({ ok: true, kept: true }, 201);
}

export async function listErrors(request: Request, env: Env): Promise<Response> {
  const user = await sessionUser(request, env);
  if (!user || !isAdmin(env, user.id)) {
    return json({ error: 'forbidden' }, 403);
  }
  const rows = await env.DB.prepare(
    `SELECT id, at, user_id AS userId, platform, build, version, message, source, stack, scene, screen, lang, agent
       FROM errors ORDER BY at DESC LIMIT ?1`,
  )
    .bind(ERROR_LIMITS.listMax)
    .all();
  return unstored(json({ errors: rows.results }));
}
