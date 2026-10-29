import Phaser from 'phaser';

import { PATCH_NOTES } from '@/content/patchNotes';
import { language } from '@/i18n';
import { apiUrl, PLATFORM } from '@/systems/Platform';

declare const __BUILD_ID__: string;

/**
 * 오류 수집 (0.160, the user's ask): an error the page did not catch is sent
 * to the Worker (server/errors.ts), so what breaks on a player's device can
 * be seen and fixed. What goes: the message, where in the code, the stack,
 * the build and version, the screens running, the window's size, the
 * language, the browser — and, signed in, the account (the server reads it
 * off the session). The privacy policy says so.
 *
 * At most ERRORS.perPage reports a page, each kind once. Off on the dev
 * server (the harness too) unless a page sets `window.__errorsOn`.
 */
const ERRORS = { perPage: 10, message: 300, stack: 2000, field: 200 } as const;

let sent = 0;
const seen = new Set<string>();

export function installErrorReport(game: () => Phaser.Game | undefined): void {
  const on = !import.meta.env.DEV || (window as { __errorsOn?: boolean }).__errorsOn === true;
  if (!on) {
    return;
  }
  window.addEventListener('error', (event) => {
    // Another origin's script (a browser extension) says only "Script error." — not ours to fix.
    if (event.filename && !event.filename.startsWith(window.location.origin)) {
      return;
    }
    const error = event.error as { stack?: unknown } | undefined;
    send(game(), String(event.message || 'error'), `${event.filename}:${event.lineno}:${event.colno}`, error?.stack);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: unknown; stack?: unknown } | undefined;
    const message = typeof reason?.message === 'string' ? reason.message : String(event.reason);
    send(game(), `unhandled rejection: ${message}`, '', reason?.stack);
  });
}

function send(game: Phaser.Game | undefined, message: string, source: string, stack: unknown): void {
  const key = `${message}@${source}`;
  if (sent >= ERRORS.perPage || seen.has(key)) {
    return;
  }
  seen.add(key);
  sent++;
  const cut = (value: string, max: number): string => value.slice(0, max);
  let scene = '';
  try {
    scene = (game?.scene.getScenes(true) ?? []).map((one) => one.scene.key).join(',');
  } catch {
    // The game is the thing that broke: no screens to name.
  }
  const report = {
    message: cut(message, ERRORS.message),
    source: cut(source, ERRORS.field),
    stack: typeof stack === 'string' ? cut(stack, ERRORS.stack) : '',
    platform: PLATFORM,
    build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev',
    version: PATCH_NOTES[0]?.version ?? '',
    scene: cut(scene, ERRORS.field),
    screen: `${window.innerWidth}x${window.innerHeight}`,
    lang: language(),
    agent: cut(navigator.userAgent, ERRORS.field),
  };
  void fetch(apiUrl('/api/errors'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    credentials: 'same-origin',
    keepalive: true,
  }).catch(() => {
    // Offline, or the server could not take it: nothing more to do.
  });
}
