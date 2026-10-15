/**
 * Signing in, and who is signed in.
 *
 *   GET  /api/auth/:provider/start      off to the provider
 *   GET  /api/auth/:provider/callback   back from it: account found or made, session set
 *   GET  /api/me                        who this browser is, and which ways in there are
 *   POST /api/auth/logout               this browser signs out
 *   POST /api/me/delete                 the account and everything it holds, gone
 *   POST /api/auth/facebook/deletion    Facebook's data-deletion callback
 *
 * A session is a random value in an HttpOnly cookie; the database keeps only
 * its hash. The trip to the provider and back is carried by a signed cookie
 * holding the state and the PKCE verifier, good for ten minutes.
 */
import type { Env } from './env';
import {
  cookie,
  fromBase64Url,
  hex,
  hmac,
  json,
  randomToken,
  sameOrigin,
  sameText,
  setCookie,
  sha256,
  toBase64Url,
} from './http';
import { PROVIDER_ORDER, PROVIDERS, TEST_PROVIDER, type ProviderId, type ProviderSpec } from './providers';

export const SESSION_COOKIE = 'es_session';
const TRIP_COOKIE = 'es_oauth';
/** How long a sign-in lasts on one browser. */
export const SESSION_DAYS = 60;
const TRIP_SECONDS = 600;

/** The signed-in account, as the routes see it. */
export interface SessionUser {
  readonly id: string;
  readonly provider: string;
  readonly displayName: string;
  readonly rankName: string;
  readonly rankEmoji: string;
  readonly rankFlag: string;
}

const isLocal = (request: Request): boolean =>
  ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname);

/** A provider that can be used here and now, or null. */
function providerFor(id: string, env: Env, request: Request): ProviderSpec | null {
  if (id === 'test') {
    return TEST_PROVIDER.ready(env) && isLocal(request) ? TEST_PROVIDER : null;
  }
  const spec = PROVIDERS[id as keyof typeof PROVIDERS];
  return spec && spec.ready(env) ? spec : null;
}

/** The ways in this deployment offers, in order. */
export function offered(env: Env, request: Request): ProviderId[] {
  const real = PROVIDER_ORDER.filter((id) => providerFor(id, env, request) !== null);
  return providerFor('test', env, request) ? [...real, 'test'] : real;
}

/** Only a path on this site: never somewhere else to be sent to. */
function safeReturn(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/';
}

async function sign(env: Env, value: string): Promise<string> {
  return toBase64Url(await hmac(env.AUTH_SECRET ?? '', value));
}

interface Trip {
  readonly p: string;
  readonly s: string;
  readonly v: string;
  readonly r: string;
  readonly e: number;
}

async function readTrip(request: Request, env: Env): Promise<Trip | null> {
  const raw = cookie(request, TRIP_COOKIE);
  const [body, signature] = (raw ?? '').split('.');
  if (!body || !signature || !sameText(signature, await sign(env, body))) {
    return null;
  }
  try {
    const trip = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as Trip;
    return trip.e > Date.now() ? trip : null;
  } catch {
    return null;
  }
}

/** Off to the provider, with the state and verifier kept in a signed cookie. */
export async function start(request: Request, env: Env, id: string): Promise<Response> {
  const spec = providerFor(id, env, request);
  if (!spec || !env.AUTH_SECRET) {
    return json({ error: 'provider' }, 404);
  }

  const url = new URL(request.url);
  const state = randomToken(16);
  const verifier = spec.pkce ? randomToken(48) : '';
  const trip: Trip = {
    p: spec.id,
    s: state,
    v: verifier,
    r: safeReturn(url.searchParams.get('return')),
    e: Date.now() + TRIP_SECONDS * 1000,
  };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(trip)));
  const tripCookie = setCookie(request, TRIP_COOKIE, `${body}.${await sign(env, body)}`, TRIP_SECONDS, '/api/auth');
  const callback = `${url.origin}/api/auth/${spec.id}/callback`;

  let to: string;
  if (spec.id === 'test') {
    // Straight back, as whoever the harness asked to be.
    const who = (url.searchParams.get('as') ?? 'player').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'player';
    to = `${callback}?code=${who}&state=${state}`;
  } else {
    const out = new URL(spec.authorize);
    out.searchParams.set('client_id', spec.clientId(env) ?? '');
    out.searchParams.set('redirect_uri', callback);
    out.searchParams.set('response_type', 'code');
    out.searchParams.set('scope', spec.scope);
    out.searchParams.set('state', state);
    if (spec.pkce) {
      out.searchParams.set('code_challenge', toBase64Url(await sha256(verifier)));
      out.searchParams.set('code_challenge_method', 'S256');
    }
    for (const [key, value] of Object.entries(spec.extra ?? {})) {
      out.searchParams.set(key, value);
    }
    to = out.toString();
  }

  return new Response(null, { status: 302, headers: { Location: to, 'Set-Cookie': tripCookie } });
}

/** The provider's code, traded for its access token. */
async function exchange(spec: ProviderSpec, env: Env, code: string, verifier: string, callback: string): Promise<string> {
  if (spec.id === 'test') {
    return code;
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callback,
    client_id: spec.clientId(env) ?? '',
  });
  const secret = spec.clientSecret(env);
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };
  if (spec.tokenAuth === 'basic') {
    headers.Authorization = `Basic ${btoa(`${spec.clientId(env) ?? ''}:${secret ?? ''}`)}`;
  } else if (secret) {
    params.set('client_secret', secret);
  }
  if (spec.pkce) {
    params.set('code_verifier', verifier);
  }

  const response =
    spec.tokenMethod === 'GET'
      ? await fetch(`${spec.token}?${params.toString()}`, { headers: { Accept: 'application/json' } })
      : await fetch(spec.token, { method: 'POST', headers, body: params.toString() });
  const body = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(`token ${response.status}`);
  }
  return body.access_token;
}

/** The account a provider's subject belongs to, made if there is none yet. */
async function accountFor(env: Env, provider: string, subject: string, name: string): Promise<string> {
  const found = await env.DB.prepare('SELECT user_id FROM identities WHERE provider = ?1 AND subject = ?2')
    .bind(provider, subject)
    .first<{ user_id: string }>();
  const displayName = name.slice(0, 40);

  if (found) {
    await env.DB.prepare('UPDATE users SET display_name = ?2 WHERE id = ?1').bind(found.user_id, displayName).run();
    return found.user_id;
  }

  const id = randomToken(12);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users (id, created_at, display_name) VALUES (?1, ?2, ?3)').bind(id, Date.now(), displayName),
    env.DB.prepare('INSERT INTO identities (provider, subject, user_id) VALUES (?1, ?2, ?3)').bind(provider, subject, id),
  ]);
  return id;
}

/** Back from the provider: the account found or made, and this browser signed in. */
export async function callback(request: Request, env: Env, id: string): Promise<Response> {
  const url = new URL(request.url);
  const trip = await readTrip(request, env);
  const ret = trip?.r ?? '/';
  const clearTrip = setCookie(request, TRIP_COOKIE, '', 0, '/api/auth');
  const back = (outcome: string, extra: string[] = []): Response => {
    const headers = new Headers({ Location: `${ret}#login=${outcome}` });
    headers.append('Set-Cookie', clearTrip);
    extra.forEach((value) => headers.append('Set-Cookie', value));
    return new Response(null, { status: 302, headers });
  };

  const spec = providerFor(id, env, request);
  if (!spec || !trip || trip.p !== spec.id || !sameText(url.searchParams.get('state') ?? '', trip.s)) {
    return back('error');
  }
  if (url.searchParams.get('error')) {
    return back('cancelled');
  }
  const code = url.searchParams.get('code');
  if (!code) {
    return back('error');
  }

  try {
    const token = await exchange(spec, env, code, trip.v, `${url.origin}/api/auth/${spec.id}/callback`);
    const profile = await spec.profile(token, env);
    if (!profile.subject) {
      return back('error');
    }
    const userId = await accountFor(env, spec.id, profile.subject, profile.name);
    const session = randomToken(32);
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO sessions (id_hash, user_id, provider, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)',
    )
      .bind(hex(await sha256(session)), userId, spec.id, now, now + SESSION_DAYS * 86_400_000)
      .run();
    return back('ok', [setCookie(request, SESSION_COOKIE, session, SESSION_DAYS * 86_400)]);
  } catch {
    return back('error');
  }
}

/** The account this request is signed in as, or null. */
export async function sessionUser(request: Request, env: Env): Promise<SessionUser | null> {
  const token = cookie(request, SESSION_COOKIE);
  if (!token) {
    return null;
  }
  const row = await env.DB.prepare(
    `SELECT u.id, s.provider, u.display_name AS displayName, u.rank_name AS rankName,
            u.rank_emoji AS rankEmoji, u.rank_flag AS rankFlag
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id_hash = ?1 AND s.expires_at > ?2`,
  )
    .bind(hex(await sha256(token)), Date.now())
    .first<SessionUser>();
  return row ?? null;
}

/** Who this browser is, and the ways in. */
export async function me(request: Request, env: Env): Promise<Response> {
  const user = await sessionUser(request, env);
  return json(
    {
      user: user
        ? {
            id: user.id,
            provider: user.provider,
            name: user.displayName,
            rank: { name: user.rankName, emoji: user.rankEmoji, flag: user.rankFlag },
          }
        : null,
      providers: offered(env, request),
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
}

/** This browser signs out. */
export async function logout(request: Request, env: Env): Promise<Response> {
  if (!sameOrigin(request)) {
    return json({ error: 'origin' }, 403);
  }
  const token = cookie(request, SESSION_COOKIE);
  if (token) {
    await env.DB.prepare('DELETE FROM sessions WHERE id_hash = ?1').bind(hex(await sha256(token))).run();
  }
  return json({ ok: true }, 200, { 'Set-Cookie': setCookie(request, SESSION_COOKIE, '', 0) });
}

/** Everything an account holds, removed: its runs, its save, its sign-ins. */
export async function removeAccount(env: Env, userId: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM best WHERE user_id = ?1').bind(userId),
    env.DB.prepare('DELETE FROM entries WHERE user_id = ?1').bind(userId),
    env.DB.prepare('DELETE FROM saves WHERE user_id = ?1').bind(userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(userId),
    env.DB.prepare('DELETE FROM identities WHERE user_id = ?1').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(userId),
  ]);
}

/** The signed-in account deletes itself. */
export async function deleteMe(request: Request, env: Env): Promise<Response> {
  if (!sameOrigin(request)) {
    return json({ error: 'origin' }, 403);
  }
  const user = await sessionUser(request, env);
  if (!user) {
    return json({ error: 'signed out' }, 401);
  }
  await removeAccount(env, user.id);
  return json({ ok: true }, 200, { 'Set-Cookie': setCookie(request, SESSION_COOKIE, '', 0) });
}

/**
 * Facebook's data-deletion callback: a signed request naming one of its
 * users. That account goes, and Facebook is told where the player can check.
 */
export async function facebookDeletion(request: Request, env: Env): Promise<Response> {
  const secret = env.FACEBOOK_CLIENT_SECRET;
  const form = await request.formData().catch(() => null);
  const signed = String(form?.get('signed_request') ?? '');
  const [signature, payload] = signed.split('.');
  if (!secret || !signature || !payload) {
    return json({ error: 'request' }, 400);
  }
  if (!sameText(signature, toBase64Url(await hmac(secret, payload)))) {
    return json({ error: 'signature' }, 400);
  }

  let fbUser = '';
  try {
    fbUser = String((JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { user_id?: string }).user_id ?? '');
  } catch {
    return json({ error: 'request' }, 400);
  }

  const found = await env.DB.prepare("SELECT user_id FROM identities WHERE provider = 'facebook' AND subject = ?1")
    .bind(fbUser)
    .first<{ user_id: string }>();
  if (found) {
    await removeAccount(env, found.user_id);
  }
  const code = randomToken(9);
  return json({
    url: `${new URL(request.url).origin}/data-deletion.html?code=${code}`,
    confirmation_code: code,
  });
}
