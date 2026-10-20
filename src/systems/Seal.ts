import { SEAL } from '@/config/system';

/**
 * A seal on the records a player could gain by editing: the saved run and
 * the passive tree (2026-10-20, after runs resumed from a save edited by hand
 * — six skills in the hundreds of levels at character level 20 — topped the
 * board). Each record is written with a keyed hash of itself under `_s`; a
 * record whose hash does not match was changed outside the game, and is not
 * taken.
 *
 * The key is in the game's own code, so this stops an edit made in the
 * browser's tools, not someone who reads the bundle: the server's own checks
 * on a run (server/ranking.ts) are the other half.
 *
 * A record written before the seal has no `_s`. Until SEAL.graceUntil one is
 * taken and sealed on its next write, so nobody's records are lost to the
 * update; after it, an unsealed record is treated as an edited one.
 */
const FIELD = '_s';

/** cyrb53, twice over with different seeds: fast, sync, and plenty for a seal. */
function hash(text: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** What one record's seal is: the key it lives under, and the record as written. */
function sealOf(key: string, body: string): string {
  const salted = `${SEAL.pepper}|${key}|${body}`;
  return hash(salted, 0x9e3779b1) + hash(salted, 0x7f4a7c15);
}

/** A record as it is written: the record, with its seal beside it. */
export function sealRecord(key: string, value: object): string {
  const body = JSON.stringify(value);
  return JSON.stringify({ ...value, [FIELD]: sealOf(key, body) });
}

/** What reading one gave: the record, or `tampered` when it was changed outside the game. */
export type Opened<T> = { readonly state: 'sealed' | 'legacy'; readonly value: T } | { readonly state: 'tampered' };

/**
 * Reads a record and checks its seal. A legacy (unsealed) one is taken until
 * SEAL.graceUntil — the caller writes it back sealed — and refused after.
 */
export function openRecord<T>(key: string, raw: string, now: number = Date.now()): Opened<T> {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { state: 'tampered' };
  }
  const seal = parsed[FIELD];
  if (seal === undefined) {
    return now < SEAL.graceUntil ? { state: 'legacy', value: parsed as T } : { state: 'tampered' };
  }
  const { [FIELD]: _drop, ...value } = parsed;
  void _drop;
  return typeof seal === 'string' && seal === sealOf(key, JSON.stringify(value))
    ? { state: 'sealed', value: value as T }
    : { state: 'tampered' };
}
