/**
 * Turnstile — Cloudflare's check that a person, not a script, is handing a
 * run in to the ranking. Invisible as a rule: it only shows itself when it
 * wants the player to tick a box, and then in the corner of the page over the
 * canvas. Its script is loaded the first time a token is wanted, not before.
 */

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      appearance?: 'always' | 'execute' | 'interaction-only';
      callback?: (token: string) => void;
      'error-callback'?: () => void;
      'expired-callback'?: () => void;
      'timeout-callback'?: () => void;
    },
  ): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading: Promise<boolean> | null = null;

/** Puts Turnstile's script on the page once; resolves false if it cannot. */
function load(): Promise<boolean> {
  if (window.turnstile) {
    return Promise.resolve(true);
  }
  loading ??= new Promise<boolean>((resolve) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT;
    tag.async = true;
    tag.onload = () => resolve(window.turnstile !== undefined);
    tag.onerror = () => {
      loading = null;
      resolve(false);
    };
    document.head.appendChild(tag);
  });
  return loading;
}

/**
 * A fresh token for one submission, or null when none could be had in time
 * — no site key, no connection, or the check never finished. The server
 * decides what a missing token means.
 */
export async function turnstileToken(siteKey: string, timeoutMs: number): Promise<string | null> {
  if (!siteKey || !(await load()) || !window.turnstile) {
    return null;
  }
  const api = window.turnstile;

  return new Promise<string | null>((resolve) => {
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:9999;';
    document.body.appendChild(box);

    let widget: string | null = null;
    let settled = false;
    const finish = (token: string | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (widget !== null) {
        api.remove(widget);
      }
      box.remove();
      resolve(token);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    try {
      widget = api.render(box, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        callback: (token) => finish(token),
        'error-callback': () => finish(null),
        'expired-callback': () => finish(null),
        'timeout-callback': () => finish(null),
      });
    } catch {
      finish(null);
    }
  });
}
