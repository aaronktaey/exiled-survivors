/**
 * 실시간 업데이트 — a player who keeps the game open still ends up on the
 * latest version, without losing anything to it.
 *
 * Every build ships `version.json` naming itself (vite.config.ts), and the
 * game knows its own name (__BUILD_ID__). Every LIVE_UPDATE.checkEveryMs, and
 * whenever the tab comes back to the front, it asks for that file; when the
 * name has changed there is a new version.
 *
 * It is never swapped in mid-run. The page is reloaded only on the title
 * screen with nothing open over it — on arriving there (a run that ended
 * goes back to the title) or while idling there. Everything the player keeps
 * is already in storage, so a reload there loses nothing.
 */
import type Phaser from 'phaser';

import { LIVE_UPDATE, SCENES } from '@/config';

declare const __BUILD_ID__: string;

type Listener = () => void;

/** Remembers, for this tab, which version a reload was for — so a stale cache cannot loop it. */
const TRIED_KEY = 'exiled-survivors:live-update-tried';

class LiveUpdateStore {
  /** The version this page is running. 'dev' on the dev server. */
  public readonly current: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';
  /** The newest version the server has named, once asked. */
  public latest: string | null = null;
  /** Replaced by a test, which has no wish to actually reload. */
  public reload: () => void = () => window.location.reload();
  private readonly listeners = new Set<Listener>();
  private started = false;

  /** A newer version is out, and this page has not yet reloaded for it. */
  public get pending(): boolean {
    return this.latest !== null && this.latest !== this.current && this.tried() !== this.latest;
  }

  /** Starts asking. Off on the dev server, where there is no version.json to ask for. */
  public start(): void {
    if (this.started || this.current === 'dev') {
      return;
    }
    this.started = true;
    setInterval(() => void this.check(), LIVE_UPDATE.checkEveryMs);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void this.check();
      }
    });
  }

  /** Asks the server which version is current. */
  public async check(): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${LIVE_UPDATE.path}?t=${Date.now()}`, {
        cache: 'no-store',
      });
      const body = (await response.json()) as { build?: unknown };
      if (response.ok && typeof body.build === 'string' && body.build !== '') {
        this.found(body.build);
      }
    } catch {
      // Offline, or the file is not there: try again next time.
    }
  }

  /** The server names `build` as current. Public so a test can say so. */
  public found(build: string): void {
    const was = this.pending;
    this.latest = build;
    if (this.pending && !was) {
      this.listeners.forEach((listener) => listener());
    }
  }

  /**
   * Whether now is a time to reload: something newer is out, and the player
   * is on the title screen with nothing open over it — no run, no name being
   * typed, no choice between two sets of records waiting.
   */
  public safeNow(game: Phaser.Game): boolean {
    if (!this.pending) {
      return false;
    }
    const running = game.scene.getScenes(true).map((scene) => scene.scene.key);
    return running.length === 1 && running[0] === SCENES.menu;
  }

  /** Reloads onto the new version, remembering it so a stale copy cannot bring it back here. */
  public apply(): void {
    if (this.latest === null) {
      return;
    }
    try {
      sessionStorage.setItem(TRIED_KEY, this.latest);
    } catch {
      // Without session storage there is no loop guard; reload anyway.
    }
    this.reload();
  }

  public onPending(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private tried(): string | null {
    try {
      return sessionStorage.getItem(TRIED_KEY);
    } catch {
      return null;
    }
  }
}

export const liveUpdate = new LiveUpdateStore();
