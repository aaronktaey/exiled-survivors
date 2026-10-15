/**
 * 계정 — who this browser is signed in as, if anyone.
 *
 * Signing in is a full trip to the provider and back (server/auth.ts): the
 * game page is left, and comes back at `/#login=ok` (or error, cancelled).
 * That outcome is read off the address as this module loads, before the
 * game draws anything, and kept for the title screen to say.
 */
import { ACCOUNT } from '@/config';

export type ProviderId = 'google' | 'facebook' | 'twitter' | 'test';

export interface AccountUser {
  readonly id: string;
  readonly provider: ProviderId;
  /** What the provider calls them. */
  readonly name: string;
  /** The name their runs carry on the board, once they have handed one in. */
  readonly rank: { readonly name: string; readonly emoji: string; readonly flag: string };
  /** The server lets this account open the developer tools (F1). */
  readonly admin?: boolean;
}

export type LoginOutcome = 'ok' | 'error' | 'cancelled';

type Listener = () => void;

async function request(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  const timer = setTimeout(() => controller?.abort(), ACCOUNT.timeoutMs);
  try {
    const response = await fetch(path, { credentials: 'same-origin', ...init, signal: controller?.signal });
    const body: unknown = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

export { request as accountRequest };

class AccountStore {
  public user: AccountUser | null = null;
  /** The ways in this deployment offers. */
  public providers: ProviderId[] = [];
  /** 'unknown' until the server has answered once; 'offline' when it could not. */
  public status: 'unknown' | 'ready' | 'offline' = 'unknown';
  /** How the last trip to a provider ended, until the title screen has said so. */
  public outcome: LoginOutcome | null = null;
  private readonly listeners = new Set<Listener>();
  private pending: Promise<void> | null = null;

  public constructor() {
    this.outcome = this.takeOutcome();
  }

  public get signedIn(): boolean {
    return this.user !== null;
  }

  /** Asks the server who this browser is. Shared by every caller while in flight. */
  public refresh(): Promise<void> {
    if (!ACCOUNT.enabled) {
      this.status = 'ready';
      return Promise.resolve();
    }
    this.pending ??= (async () => {
      const reply = await request('/api/me', { cache: 'no-store' });
      const body = reply.body as { user?: AccountUser | null; providers?: ProviderId[] } | null;
      if (reply.ok && body) {
        this.user = body.user ?? null;
        this.providers = Array.isArray(body.providers) ? body.providers : [];
        this.status = 'ready';
      } else {
        this.status = 'offline';
      }
      this.pending = null;
      this.notify();
    })();
    return this.pending;
  }

  /** Off to the provider. The page is left; it comes back signed in. */
  public login(provider: ProviderId, returnPath = '/'): void {
    const to = `/api/auth/${provider}/start?return=${encodeURIComponent(returnPath)}`;
    window.location.assign(to);
  }

  public async logout(): Promise<boolean> {
    const reply = await request('/api/auth/logout', { method: 'POST' });
    if (reply.ok) {
      this.user = null;
      this.notify();
    }
    return reply.ok;
  }

  /** The account and everything it holds on the server, gone. */
  public async remove(): Promise<boolean> {
    const reply = await request('/api/me/delete', { method: 'POST' });
    if (reply.ok) {
      this.user = null;
      this.notify();
    }
    return reply.ok;
  }

  public onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  /** `#login=…` on the address, read once and taken off it. */
  private takeOutcome(): LoginOutcome | null {
    if (typeof window === 'undefined') {
      return null;
    }
    const match = /^#login=(ok|error|cancelled)$/.exec(window.location.hash);
    if (!match) {
      return null;
    }
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return match[1] as LoginOutcome;
  }
}

export const account = new AccountStore();
