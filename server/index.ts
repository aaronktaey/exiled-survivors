/**
 * The game's one Worker: it serves the built game, and the ranking under
 * /api. Static files never reach this code — Cloudflare serves them from the
 * `assets` directory for free — so only /api requests run it and count
 * toward the request quota.
 *
 *   GET  /api/ranking   the board, best first, cached at the edge briefly
 *   POST /api/ranking   one run handed in; checked, rate-limited, stored
 *
 * The rules a run has to pass are the game's own (RANKING, shared with the
 * client) plus the ceilings in RULES, which only the server enforces.
 */
import { RANKING } from '../src/config/system';

export interface Env {
  readonly DB: D1Database;
  readonly ASSETS: Fetcher;
  /** Turnstile's secret. Unset in local development, where nothing is challenged. */
  readonly TURNSTILE_SECRET?: string;
  /** Mixed into a hashed address, so the table never holds anything reversible. */
  readonly IP_SALT?: string;
}

/** What a run is checked against, beyond the shape the client already enforces. */
export const RULES = {
  /** A run shorter than this did not happen. */
  minSurvivedMs: 5_000,
  /** Six hours: longer than anyone is going to sit through one run. */
  maxSurvivedMs: 6 * 60 * 60 * 1000,
  maxLevel: 2_000,
  /**
   * Damage per second of survival, averaged over the run. Far above what a
   * built-up run reaches, so it only stops numbers typed in by hand.
   */
  maxDamagePerSecond: 2_000_000,
  /** One address hands in at most one run this often... */
  cooldownMs: 15_000,
  /** ...and at most this many a day. */
  perDay: 60,
  /** How long the edge keeps a copy of the board before asking the database again. */
  cacheSeconds: 30,
  /** Anything bigger than this is not a run. */
  maxBodyBytes: 2_048,
} as const;

const BOARD_PATH = '/api/ranking';

export interface RankRow {
  readonly name: string;
  readonly emoji: string;
  readonly flag: string;
  readonly damage: number;
  readonly level: number;
  readonly survivedMs: number;
  readonly at: string;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === BOARD_PATH) {
      if (request.method === 'GET') {
        return board(request, env, ctx);
      }
      if (request.method === 'POST') {
        return submit(request, env, ctx);
      }
      return json({ error: 'method' }, 405, { Allow: 'GET, POST' });
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not found' }, 404);
    }

    // Anything else is the game itself.
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/** The best RANKING.size runs, a tie to whoever got there first. */
async function topRows(env: Env): Promise<RankRow[]> {
  const result = await env.DB.prepare(
    `SELECT name, emoji, flag, damage, level, survived_ms AS survivedMs, at
       FROM entries ORDER BY damage DESC, at ASC LIMIT ?1`,
  )
    .bind(RANKING.size)
    .all<RankRow>();
  return result.results ?? [];
}

/** The board, from the edge's copy when it has a fresh one. */
async function board(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const key = new Request(new URL(BOARD_PATH, request.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) {
    return hit;
  }

  const response = json({ entries: await topRows(env) }, 200, {
    'Cache-Control': `public, max-age=${RULES.cacheSeconds}`,
  });
  ctx.waitUntil(cache.put(key, response.clone()));
  return response;
}

/** Why a run was refused, or null when it is a run. */
export function problemWith(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') {
    return 'body';
  }
  const run = raw as Record<string, unknown>;
  const name = String(run.name ?? '');
  const emoji = String(run.emoji ?? '');
  const flag = String(run.flag ?? '');
  const damage = Number(run.damage);
  const level = Number(run.level);
  const survivedMs = Number(run.survivedMs);

  if (!new RegExp(`^[A-Z]{1,${RANKING.nameLength}}$`).test(name)) {
    return 'name';
  }
  if (!(RANKING.emoji as readonly string[]).includes(emoji)) {
    return 'emoji';
  }
  if (!(RANKING.flags as readonly string[]).includes(flag)) {
    return 'flag';
  }
  if (![damage, level, survivedMs].every(Number.isInteger)) {
    return 'numbers';
  }
  if (damage <= 0 || damage > RANKING.shared.maxDamage) {
    return 'damage';
  }
  if (level < 1 || level > RULES.maxLevel) {
    return 'level';
  }
  if (survivedMs < RULES.minSurvivedMs || survivedMs > RULES.maxSurvivedMs) {
    return 'time';
  }
  if (damage / (survivedMs / 1000) > RULES.maxDamagePerSecond) {
    return 'pace';
  }
  return null;
}

/** A short, salted, one-way stand-in for the address a run came from. */
async function addressOf(request: Request, env: Env): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  const bytes = new TextEncoder().encode(`${env.IP_SALT ?? 'exiled-survivors'}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Asks Turnstile whether the token came from a person. Passes when no secret is set. */
async function human(token: unknown, request: Request, env: Env): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) {
    return true;
  }
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return false;
  }

  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET);
  form.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) {
    form.append('remoteip', ip);
  }
  try {
    const reply = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form,
    });
    const outcome = (await reply.json()) as { success?: boolean };
    return outcome.success === true;
  } catch {
    return false;
  }
}

/** One run handed in. */
async function submit(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const text = await request.text();
  if (text.length > RULES.maxBodyBytes) {
    return json({ error: 'body' }, 413);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json({ error: 'body' }, 400);
  }

  const problem = problemWith(raw);
  if (problem) {
    return json({ error: problem }, 400);
  }
  const run = raw as Record<string, unknown>;

  if (!(await human(run.token, request, env))) {
    return json({ error: 'challenge' }, 403);
  }

  // How many this address has handed in lately.
  const address = await addressOf(request, env);
  const now = Date.now();
  const recent = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN at_ms > ?2 THEN 1 ELSE 0 END) AS burst,
       COUNT(*) AS day
     FROM entries WHERE ip_hash = ?1 AND at_ms > ?3`,
  )
    .bind(address, now - RULES.cooldownMs, now - 24 * 60 * 60 * 1000)
    .first<{ burst: number | null; day: number }>();
  if ((recent?.burst ?? 0) > 0 || (recent?.day ?? 0) >= RULES.perDay) {
    return json({ error: 'slow down' }, 429, {
      'Retry-After': String(Math.ceil(RULES.cooldownMs / 1000)),
    });
  }

  const at = new Date(now).toISOString();
  await env.DB.prepare(
    `INSERT INTO entries (name, emoji, flag, damage, level, survived_ms, at, at_ms, ip_hash)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  )
    .bind(run.name, run.emoji, run.flag, run.damage, run.level, run.survivedMs, at, now, address)
    .run();

  // The board this run is on, straight from the database, and the edge's
  // copy here dropped so the next look sees it too.
  const entries = await topRows(env);
  const place =
    entries.findIndex((e) => e.at === at && e.name === run.name && e.damage === run.damage) + 1;
  ctx.waitUntil(caches.default.delete(new URL(BOARD_PATH, request.url).toString()));
  return json({ ok: true, place, entries });
}
