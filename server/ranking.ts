/**
 * The shared ranking.
 *
 *   GET  /api/ranking      the board: each account's best run today, best
 *                          first, cached at the edge briefly
 *   GET  /api/ranking/me   the signed-in account's best today, and where it stands
 *
 * "Today" is the board's day (RANKING.dailyReset): it starts over at 05:00
 * Korean time, and every query is scoped to the day it is asked in.
 *   POST /api/ranking      one run handed in by a signed-in account, with
 *                          what the game says about it (판 내역)
 *   GET  /api/ranking/review   the admin's: today's board with each run's
 *                              detail, and which look out of line
 *   POST /api/ranking/remove   the admin's: { entryId } off the board
 *   GET  /api/ranking/podium   어제의 랭킹: the day before's first three
 *   GET  /api/ranking/podium/me     the signed-in account's own place that day
 *   POST /api/ranking/podium/seen   the signed-in account has seen it today
 *
 * Only accounts hand runs in, and an account has one name on the board —
 * set by the run it hands in — so a name cannot be worn by a crowd. The
 * rules a run has to pass are the game's own (RANKING) plus RULES.
 */
import { RANKING, nextRankingReset, rankingDayStart } from '../src/config/system';
import { isAdmin, sessionUser } from './auth';
import type { Env } from './env';
import { hex, json, readJson, sameOrigin, sha256, unstored } from './http';

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
  /** One account hands in at most one run this often... */
  cooldownMs: 15_000,
  /** ...and at most this many a day... */
  perDay: 60,
  /** ...and one address, across every account on it, this many. */
  perAddressPerDay: 180,
  /** How long the edge keeps a copy of the board before asking the database again. */
  cacheSeconds: 30,
  /** Anything bigger than this is not a run (its 판 내역 included). */
  maxBodyBytes: 8_192,
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
  /** The skill the run was played on — its first, main skill. */
  readonly skill: string;
  /** How many days this account has finished first. */
  readonly wins: number;
  /** And second, and third. */
  readonly seconds: number;
  readonly thirds: number;
}

/** Which count a finished day's place adds to. */
const PODIUM_COLUMN = ['daily_wins', 'daily_seconds', 'daily_thirds'] as const;

/** A skill id as the game writes it; anything else is stored as none. */
const SKILL_ID = /^[A-Za-z]{1,32}$/;
const DAY_MS = 86_400_000;

/**
 * Each account's best run of the day, best first, a tie to whoever got there
 * first — read off `daily_best` (one row per account per day, indexed by day
 * and damage), so a look costs the rows it shows rather than the history.
 */
const BOARD = `
  SELECT b.user_id AS userId, u.rank_name AS name, u.rank_emoji AS emoji, u.rank_flag AS flag,
         b.damage, b.level, b.survived_ms AS survivedMs, b.at, b.skill, u.daily_wins AS wins,
         u.daily_seconds AS seconds, u.daily_thirds AS thirds
    FROM daily_best b JOIN users u ON u.id = b.user_id
   WHERE b.day = ?2
   ORDER BY b.damage DESC, b.at ASC`;

async function topRows(env: Env, day: number): Promise<(RankRow & { userId: string })[]> {
  const result = await env.DB.prepare(`${BOARD} LIMIT ?1`)
    .bind(RANKING.size, day)
    .all<RankRow & { userId: string }>();
  return result.results ?? [];
}

/** The edge's copy of one day's board: a new day is a new key, so a reset is never served stale. */
const boardKey = (request: Request, day: number): string =>
  new URL(`${BOARD_PATH}?day=${day}`, request.url).toString();

const publicRows = (rows: readonly (RankRow & { userId: string })[]): RankRow[] =>
  rows.map(({ name, emoji, flag, damage, level, survivedMs, at, skill, wins, seconds, thirds }) => ({
    name, emoji, flag, damage, level, survivedMs, at, skill, wins, seconds, thirds,
  }));

/**
 * Credits each finished day's first, second and third place, once. Run on a look at
 * the board after a reset; the days are claimed before anyone is credited,
 * so two looks at once cannot count the same day twice.
 */
async function tallyWins(env: Env, today: number): Promise<void> {
  const lastDone = today - DAY_MS;
  const row = await env.DB.prepare('SELECT through_day AS through FROM tally WHERE id = 1').first<{ through: number }>();
  const through = row?.through ?? -1;
  if (through >= lastDone) {
    return;
  }
  const claim = await env.DB.prepare('UPDATE tally SET through_day = ?1 WHERE id = 1 AND through_day = ?2')
    .bind(lastDone, through)
    .run();
  if ((claim.meta?.changes ?? 0) !== 1) {
    return;
  }
  const placed = await env.DB.prepare(
    `SELECT user_id AS userId, n FROM (
       SELECT user_id, ROW_NUMBER() OVER (PARTITION BY day ORDER BY damage DESC, at ASC) AS n
         FROM daily_best WHERE day > ?1 AND day <= ?2
     ) WHERE n <= ${PODIUM_COLUMN.length}`,
  )
    .bind(through, lastDone)
    .all<{ userId: string; n: number }>();
  const credit = (placed.results ?? []).map(({ userId, n }) => {
    const column = PODIUM_COLUMN[n - 1]!;
    return env.DB.prepare(`UPDATE users SET ${column} = ${column} + 1 WHERE id = ?1`).bind(userId);
  });
  if (credit.length > 0) {
    await env.DB.batch(credit);
  }
}

/** The board, from the edge's copy when it has a fresh one. */
export async function board(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const cache = caches.default;
  const now = Date.now();
  const day = rankingDayStart(now);
  const key = new Request(boardKey(request, day), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) {
    return unstored(hit);
  }

  // A new day: yesterday's (and any before it not yet counted) first place is credited.
  await tallyWins(env, day);
  // Never kept past the reset.
  const untilReset = Math.max(1, Math.floor((nextRankingReset(now) - now) / 1000));
  const response = json({ entries: publicRows(await topRows(env, day)) }, 200, {
    'Cache-Control': `public, max-age=${Math.min(RULES.cacheSeconds, untilReset)}`,
  });
  ctx.waitUntil(cache.put(key, response.clone()));
  return unstored(response);
}

/** The signed-in account's best run, and its place: 0 off the board, null signed out. */
export async function mine(request: Request, env: Env): Promise<Response> {
  const user = await sessionUser(request, env);
  if (!user) {
    return json({ best: null, place: null }, 200, { 'Cache-Control': 'no-store' });
  }
  const day = rankingDayStart(Date.now());
  const best = await env.DB.prepare(
    'SELECT damage, level, survived_ms AS survivedMs, at FROM daily_best WHERE day = ?2 AND user_id = ?1',
  )
    .bind(user.id, day)
    .first<{ damage: number; level: number; survivedMs: number; at: string }>();
  const podium = await env.DB.prepare(
    'SELECT daily_wins AS wins, daily_seconds AS seconds, daily_thirds AS thirds FROM users WHERE id = ?1',
  )
    .bind(user.id)
    .first<{ wins: number; seconds: number; thirds: number }>();
  const counts = { wins: podium?.wins ?? 0, seconds: podium?.seconds ?? 0, thirds: podium?.thirds ?? 0 };
  if (!best) {
    return json({ best: null, place: 0, ...counts }, 200, { 'Cache-Control': 'no-store' });
  }
  const above = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM daily_best WHERE day = ?3 AND (damage > ?1 OR (damage = ?1 AND at < ?2))',
  )
    .bind(best.damage, best.at, day)
    .first<{ n: number }>();
  return json(
    {
      best: { name: user.rankName, emoji: user.rankEmoji, flag: user.rankFlag, ...best },
      place: (above?.n ?? 0) + 1,
      ...counts,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
}

const ID = /^[A-Za-z]{1,32}$/;
const whole = (value: unknown, max: number): number | null => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};
const lines = (raw: unknown): { id: string; tier: number }[] =>
  (Array.isArray(raw) ? raw : [])
    .slice(0, 6)
    .map((line) => ({ id: String(line?.id ?? ''), tier: whole(line?.tier, 9) ?? 0 }))
    .filter((line) => ID.test(line.id) && line.tier >= 1);

/**
 * 판 내역: what the game says about a run — the build and version it was
 * played on, kills by kind, the 뼈다귀 it took, its weapon, skills and 패시브,
 * and whether it was resumed from a save. Nothing on the board checks it;
 * it is kept so the admin can read a run that looks out of line. Only the
 * known fields, in their known shapes, are kept; anything else is dropped.
 * Returns '' when there is nothing to keep (a client from before 0.62).
 */
export function cleanDetail(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return '';
  }
  const d = raw as Record<string, unknown>;
  const counts = (value: unknown, max: number, keys: number): Record<string, number> => {
    const out: Record<string, number> = {};
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, count] of Object.entries(value).slice(0, keys)) {
        const n = whole(count, max);
        if (ID.test(key) && n !== null) {
          out[key] = n;
        }
      }
    }
    return out;
  };
  const gear = d.gear && typeof d.gear === 'object' ? (d.gear as Record<string, unknown>) : null;
  const detail = {
    build: /^[\w.-]{1,40}$/.test(String(d.build ?? '')) ? String(d.build) : '',
    version: /^[\w.-]{1,12}$/.test(String(d.version ?? '')) ? String(d.version) : '',
    kills: counts(d.kills, 1e9, 40),
    bones: (Array.isArray(d.bones) ? d.bones : []).map(String).filter((id) => ID.test(id)).slice(0, 10),
    gear: gear && ID.test(String(gear.id ?? ''))
      ? { id: String(gear.id), prefixes: lines(gear.prefixes), suffixes: lines(gear.suffixes) }
      : null,
    skills: (Array.isArray(d.skills) ? d.skills : [])
      .slice(0, 12)
      .map((skill) => ({ id: String(skill?.id ?? ''), level: whole(skill?.level, 999) ?? 0 }))
      .filter((skill) => ID.test(skill.id)),
    passives: counts(d.passives, 999, 30),
    resumed: d.resumed === true,
  };
  return JSON.stringify(detail);
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
  // Whole numbers are what is stored; a fraction is rounded down rather than
  // refused — a run's time is a sum of frame times and is never whole.
  const damage = Math.floor(Number(run.damage));
  const level = Math.floor(Number(run.level));
  const survivedMs = Math.floor(Number(run.survivedMs));

  if (!new RegExp(`^[A-Z]{1,${RANKING.nameLength}}$`).test(name)) {
    return 'name';
  }
  if (!(RANKING.emoji as readonly string[]).includes(emoji)) {
    return 'emoji';
  }
  if (!(RANKING.flags as readonly string[]).includes(flag)) {
    return 'flag';
  }
  if (![damage, level, survivedMs].every(Number.isFinite)) {
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
  return hex(await sha256(`${env.IP_SALT ?? 'exiled-survivors'}:${ip}`)).slice(0, 32);
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

/** One run handed in by a signed-in account. */
export async function submit(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!sameOrigin(request)) {
    return json({ error: 'origin' }, 403);
  }
  const user = await sessionUser(request, env);
  if (!user) {
    return json({ error: 'signed out' }, 401);
  }

  const raw = await readJson(request, RULES.maxBodyBytes);
  if (raw === null) {
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

  // How many this account, and this address, have handed in lately.
  const address = await addressOf(request, env);
  const now = Date.now();
  const dayAgo = now - 86_400_000;
  // Two lookups, each on its own index, rather than one OR that reads the table.
  const [mineRow, hereRow] = await env.DB.batch<{ burst: number | null; day: number }>([
    env.DB.prepare(
      `SELECT SUM(CASE WHEN at_ms > ?2 THEN 1 ELSE 0 END) AS burst, COUNT(*) AS day
         FROM entries WHERE user_id = ?1 AND at_ms > ?3`,
    ).bind(user.id, now - RULES.cooldownMs, dayAgo),
    env.DB.prepare('SELECT 0 AS burst, COUNT(*) AS day FROM entries WHERE ip_hash = ?1 AND at_ms > ?2').bind(
      address,
      dayAgo,
    ),
  ]);
  const recent = {
    burst: mineRow?.results?.[0]?.burst ?? 0,
    mine: mineRow?.results?.[0]?.day ?? 0,
    here: hereRow?.results?.[0]?.day ?? 0,
  };
  if (
    (recent?.burst ?? 0) > 0 ||
    (recent?.mine ?? 0) >= RULES.perDay ||
    (recent?.here ?? 0) >= RULES.perAddressPerDay
  ) {
    return json({ error: 'slow down' }, 429, { 'Retry-After': String(Math.ceil(RULES.cooldownMs / 1000)) });
  }

  // The name on the board is the account's: this run sets it. The run goes
  // into the history, and onto today's board only if it beats the account's
  // best today.
  const at = new Date(now).toISOString();
  const damage = Math.floor(Number(run.damage));
  const level = Math.floor(Number(run.level));
  const survivedMs = Math.floor(Number(run.survivedMs));
  const skill = SKILL_ID.test(String(run.skill ?? '')) ? String(run.skill) : '';
  const detail = cleanDetail(run.detail);
  const inserted = await env.DB.batch([
    env.DB.prepare('UPDATE users SET rank_name = ?2, rank_emoji = ?3, rank_flag = ?4 WHERE id = ?1').bind(
      user.id,
      run.name,
      run.emoji,
      run.flag,
    ),
    env.DB.prepare(
      `INSERT INTO entries (name, emoji, flag, damage, level, survived_ms, at, at_ms, ip_hash, user_id, skill, detail)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`,
    ).bind(run.name, run.emoji, run.flag, damage, level, survivedMs, at, now, address, user.id, skill, detail),
  ]);
  const entryId = Number(inserted[1]?.meta.last_row_id ?? 0);
  const day = rankingDayStart(now);
  await env.DB.prepare(
    `INSERT INTO daily_best (day, user_id, entry_id, damage, level, survived_ms, at, skill)
     VALUES (?7, ?1, ?2, ?3, ?4, ?5, ?6, ?8)
     ON CONFLICT (day, user_id) DO UPDATE SET entry_id = excluded.entry_id, damage = excluded.damage,
       level = excluded.level, survived_ms = excluded.survived_ms, at = excluded.at, skill = excluded.skill
     WHERE excluded.damage > daily_best.damage`,
  )
    .bind(user.id, entryId, damage, level, survivedMs, at, day, skill)
    .run();

  // The board this run is on, straight from the database, and the edge's
  // copy here dropped so the next look sees it too.
  const rows = await topRows(env, day);
  const place = rows.findIndex((row) => row.userId === user.id) + 1;
  ctx.waitUntil(caches.default.delete(boardKey(request, day)));
  return json({ ok: true, place, entries: publicRows(rows) });
}

/** The middle of a list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** One run on today's board, as the admin's review reads it. */
export interface ReviewRow {
  readonly entryId: number;
  readonly name: string;
  readonly damage: number;
  readonly level: number;
  readonly survivedMs: number;
  readonly at: string;
  readonly skill: string;
  /** Other accounts' runs of a like length it was compared with. */
  readonly peers: number;
  /** Their median damage, or null when there were too few. */
  readonly reference: number | null;
  /** Its damage over that median, or null. */
  readonly ratio: number | null;
  readonly outlier: boolean;
  /** Its 판 내역, or null for a run handed in before there was one. */
  readonly detail: unknown;
}

/**
 * The admin's look at today's board: every run with its 판 내역, and how it
 * stands against other accounts' runs of a like length (RANKING.review).
 * Nothing here changes the board; an outlier is on it like any other run
 * until the admin takes it off.
 */
export async function review(request: Request, env: Env): Promise<Response> {
  const user = await sessionUser(request, env);
  if (!user || !isAdmin(env, user.id)) {
    return json({ error: 'admin only' }, 403, { 'Cache-Control': 'no-store' });
  }
  const now = Date.now();
  const rule = RANKING.review;
  const board = await env.DB.prepare(
    `SELECT b.entry_id AS entryId, b.user_id AS userId, u.rank_name AS name, b.damage, b.level,
            b.survived_ms AS survivedMs, b.at, b.skill, e.detail
       FROM daily_best b JOIN users u ON u.id = b.user_id LEFT JOIN entries e ON e.id = b.entry_id
      WHERE b.day = ?2
      ORDER BY b.damage DESC, b.at ASC LIMIT ?1`,
  )
    .bind(RANKING.size, rankingDayStart(now))
    .all<Omit<ReviewRow, 'peers' | 'reference' | 'ratio' | 'outlier' | 'detail'> & { userId: string; detail: string | null }>();
  const recent = await env.DB.prepare(
    'SELECT user_id AS userId, damage, survived_ms AS survivedMs FROM entries WHERE at_ms > ?1 AND removed_at IS NULL',
  )
    .bind(now - rule.lookbackDays * DAY_MS)
    .all<{ userId: string; damage: number; survivedMs: number }>();
  const runs = recent.results ?? [];

  const rows: ReviewRow[] = (board.results ?? []).map(({ userId, detail, ...row }) => {
    const low = row.survivedMs * (1 - rule.timeWindow);
    const high = row.survivedMs * (1 + rule.timeWindow);
    const peers = runs.filter((run) => run.userId !== userId && run.survivedMs >= low && run.survivedMs <= high);
    const reference = peers.length >= rule.minPeers ? median(peers.map((run) => run.damage)) : null;
    const ratio = reference && reference > 0 ? row.damage / reference : null;
    let parsed: unknown = null;
    try {
      parsed = detail ? JSON.parse(detail) : null;
    } catch {
      parsed = null;
    }
    return { ...row, peers: peers.length, reference, ratio, outlier: ratio !== null && ratio >= rule.factor, detail: parsed };
  });
  return json({ rule, rows }, 200, { 'Cache-Control': 'no-store' });
}

/**
 * The admin takes a run off the board. It is marked removed rather than
 * deleted, and the account's place that day goes to its next best run (or
 * it leaves the board). Answers with today's board as it now stands.
 */
export async function removeEntry(request: Request, env: Env): Promise<Response> {
  if (!sameOrigin(request)) {
    return json({ error: 'origin' }, 403);
  }
  const user = await sessionUser(request, env);
  if (!user || !isAdmin(env, user.id)) {
    return json({ error: 'admin only' }, 403);
  }
  const body = (await readJson(request, 256)) as { entryId?: unknown } | null;
  const entryId = Math.floor(Number(body?.entryId));
  if (!Number.isFinite(entryId) || entryId <= 0) {
    return json({ error: 'entry' }, 400);
  }
  const entry = await env.DB.prepare(
    'SELECT user_id AS userId, at_ms AS atMs FROM entries WHERE id = ?1 AND removed_at IS NULL',
  )
    .bind(entryId)
    .first<{ userId: string; atMs: number }>();
  if (!entry) {
    return json({ error: 'not found' }, 404);
  }
  const day = rankingDayStart(entry.atMs);
  await env.DB.batch([
    env.DB.prepare('UPDATE entries SET removed_at = ?2 WHERE id = ?1').bind(entryId, Date.now()),
    env.DB.prepare('DELETE FROM daily_best WHERE day = ?1 AND user_id = ?2').bind(day, entry.userId),
    env.DB.prepare(
      `INSERT INTO daily_best (day, user_id, entry_id, damage, level, survived_ms, at, skill)
       SELECT ?1, user_id, id, damage, level, survived_ms, at, skill FROM entries
        WHERE user_id = ?2 AND at_ms >= ?1 AND at_ms < ?3 AND removed_at IS NULL
        ORDER BY damage DESC, at ASC LIMIT 1`,
    ).bind(day, entry.userId, day + DAY_MS),
  ]);
  // The edge's copy of that day goes, so the next look is the board without
  // it — and of the next day's 어제의 랭킹, which is that day's first three.
  await caches.default.delete(boardKey(request, day));
  await caches.default.delete(podiumKey(request, day));
  const rows = await topRows(env, rankingDayStart(Date.now()));
  return json({ ok: true, entries: publicRows(rows) }, 200, { 'Cache-Control': 'no-store' });
}

/** The edge's copy of a finished day's first three, keyed by that day. */
const podiumKey = (request: Request, day: number): string =>
  new URL(`${BOARD_PATH}/podium?day=${day}`, request.url).toString();

/**
 * 어제의 랭킹: the first, second and third of the day before today's board,
 * the order the cups were given in. The same for everyone, so the edge keeps
 * it until the next reset (or until the admin takes one of them off).
 */
export async function podium(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const now = Date.now();
  const day = rankingDayStart(now) - DAY_MS;
  const cache = caches.default;
  const key = new Request(podiumKey(request, day), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) {
    return unstored(hit);
  }
  const result = await env.DB.prepare(`${BOARD} LIMIT ?1`)
    .bind(3, day)
    .all<RankRow & { userId: string }>();
  const untilReset = Math.max(1, Math.floor((nextRankingReset(now) - now) / 1000));
  const response = json({ day, entries: publicRows(result.results ?? []) }, 200, {
    'Cache-Control': `public, max-age=${Math.min(3600, untilReset)}`,
  });
  ctx.waitUntil(cache.put(key, response.clone()));
  return unstored(response);
}

/**
 * The signed-in account's own place on the day 어제의 랭킹 shows, out of how
 * many accounts ran that day; `mine` is null signed out or without a run.
 * Never cached: it is this account's.
 */
export async function podiumMine(request: Request, env: Env): Promise<Response> {
  const day = rankingDayStart(Date.now()) - DAY_MS;
  const counted = await env.DB.prepare('SELECT COUNT(*) AS n FROM daily_best WHERE day = ?1').bind(day).first<{ n: number }>();
  const total = counted?.n ?? 0;
  const user = await sessionUser(request, env);
  const best = user
    ? await env.DB.prepare(
        'SELECT damage, level, survived_ms AS survivedMs, at FROM daily_best WHERE day = ?1 AND user_id = ?2',
      )
        .bind(day, user.id)
        .first<{ damage: number; level: number; survivedMs: number; at: string }>()
    : null;
  if (!best) {
    return json({ day, total, mine: null }, 200, { 'Cache-Control': 'no-store' });
  }
  const above = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM daily_best WHERE day = ?3 AND (damage > ?1 OR (damage = ?1 AND at < ?2))',
  )
    .bind(best.damage, best.at, day)
    .first<{ n: number }>();
  const { damage, level, survivedMs } = best;
  return json({ day, total, mine: { place: (above?.n ?? 0) + 1, damage, level, survivedMs } }, 200, {
    'Cache-Control': 'no-store',
  });
}

/** The signed-in account has seen today's 어제의 랭킹: it is not shown to it again today, on any device. */
export async function podiumSeen(request: Request, env: Env): Promise<Response> {
  if (!sameOrigin(request)) {
    return json({ error: 'origin' }, 403);
  }
  const user = await sessionUser(request, env);
  if (!user) {
    return json({ error: 'signed out' }, 401);
  }
  const day = rankingDayStart(Date.now());
  await env.DB.prepare('UPDATE users SET podium_seen = ?2 WHERE id = ?1').bind(user.id, day).run();
  return json({ ok: true, day }, 200, { 'Cache-Control': 'no-store' });
}

/** After an account is deleted, the board should not wait out its cache to forget it. */
export function forgetBoard(request: Request, ctx: ExecutionContext): void {
  ctx.waitUntil(caches.default.delete(boardKey(request, rankingDayStart(Date.now()))));
}
