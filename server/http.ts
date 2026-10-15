/** What every route needs: answers, cookies, randomness and hashes. */

export const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });

export const redirect = (to: string, headers: Record<string, string> = {}): Response =>
  new Response(null, { status: 302, headers: { Location: to, ...headers } });

/** A cookie's value from the request, or null. */
export function cookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

/** A Set-Cookie header: HttpOnly and SameSite=Lax always, Secure off localhost. */
export function setCookie(
  request: Request,
  name: string,
  value: string,
  maxAgeSeconds: number,
  path = '/',
): string {
  const local = ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname);
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${path}`,
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(local ? [] : ['Secure']),
  ].join('; ');
}

export const toBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const fromBase64Url = (text: string): Uint8Array => {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};

/** `bytes` random bytes, as base64url. */
export const randomToken = (bytes = 32): string =>
  toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export const hex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

/** Compares two strings in time that does not depend on where they differ. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * True when a state-changing request came from the game's own pages. The
 * session cookie is SameSite=Lax already; this is the second lock.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) {
    // Same-origin fetches from older browsers, and tools: allowed only when
    // nothing says otherwise.
    return request.headers.get('Sec-Fetch-Site') !== 'cross-site';
  }
  return origin === new URL(request.url).origin;
}

/** The request's JSON body, or null when it is not JSON or too big. */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
