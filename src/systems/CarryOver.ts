/**
 * 이사 — bringing a player's things over from the game's old address.
 *
 * Everything a player keeps lives in this browser's localStorage, and that
 * belongs to one address: moving the game to a new domain would leave every
 * stash, tree and saved run behind. So the old address now serves a page
 * (bridge/index.html) that gathers the game's keys and comes here with them
 * in the URL's fragment — `#carry=<base64url JSON>` — which never leaves the
 * browser. This module writes them in, before any store has read anything,
 * and takes the fragment off the address again.
 *
 * It runs on import: main.ts imports it first of all.
 */

// Kept light, for running first: the storage keys and the seal, nothing else.
import { STORAGE } from '@/config/system';
import { sealRecord } from '@/systems/Seal';

/** Every key the game writes starts with this; nothing else is taken. */
export const CARRY_PREFIX = 'exiled-survivors:';

/** What the old address hands over. */
export interface CarryPayload {
  readonly v: 1;
  readonly items: Record<string, string>;
}

/** The fragment the bridge comes back with. */
export const CARRY_HASH = '#carry=';

/** Text → base64url, through UTF-8 so an emoji in a name survives. */
export function encodeCarry(payload: CarryPayload): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCarry(text: string): CarryPayload | null {
  try {
    const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<CarryPayload>;
    if (parsed.v !== 1 || !parsed.items || typeof parsed.items !== 'object') {
      return null;
    }
    const items: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.items)) {
      if (key.startsWith(CARRY_PREFIX) && typeof value === 'string') {
        items[key] = value;
      }
    }
    return { v: 1, items };
  } catch {
    return null;
  }
}

/** The records the game seals (systems/Seal.ts): what comes over is sealed as it lands. */
const SEALED_KEYS: readonly string[] = [STORAGE.save, STORAGE.passives];

function sealCarried(key: string, value: string): string {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || '_s' in parsed) {
      return value;
    }
    return sealRecord(key, parsed);
  } catch {
    return value;
  }
}

/** True when this browser already holds anything of the game's here. */
function holdsAnything(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    if (localStorage.key(i)?.startsWith(CARRY_PREFIX)) {
      return true;
    }
  }
  return false;
}

/**
 * Writes in what came over, if anything did. A browser that already played
 * at the new address is asked first: what is here would be replaced. The
 * fragment comes off the address either way, so a reload does not do it twice.
 */
export function takeCarriedSave(): 'none' | 'taken' | 'declined' | 'broken' {
  const { hash } = window.location;
  if (!hash.startsWith(CARRY_HASH)) {
    return 'none';
  }

  const clean = window.location.pathname + window.location.search;
  window.history.replaceState(null, '', clean);

  const payload = decodeCarry(hash.slice(CARRY_HASH.length));
  if (!payload) {
    return 'broken';
  }
  const entries = Object.entries(payload.items);
  if (entries.length === 0) {
    return 'none';
  }

  try {
    if (holdsAnything() && !window.confirm(carryQuestion())) {
      return 'declined';
    }
    for (const [key, value] of entries) {
      localStorage.setItem(key, SEALED_KEYS.includes(key) ? sealCarried(key, value) : value);
    }
    return 'taken';
  } catch {
    return 'broken';
  }
}

/** Asked before anything here is replaced — in the browser's own language. */
function carryQuestion(): string {
  const lang = (navigator.language || 'en').slice(0, 2);
  switch (lang) {
    case 'ko':
      return '이전 주소에서 가져온 기록이 있습니다. 이 브라우저의 기록을 이것으로 바꿀까요?';
    case 'ja':
      return '以前のアドレスの記録があります。このブラウザの記録を置き換えますか？';
    case 'zh':
      return '有从旧地址带来的记录。要用它替换此浏览器中的记录吗？';
    default:
      return 'Your records from the old address came along. Replace the ones in this browser with them?';
  }
}

takeCarriedSave();
