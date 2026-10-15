/**
 * The ways in: Google, Facebook and X, each an OAuth 2.0
 * authorization-code flow. A provider is offered only when its client id and
 * secret are set as Worker secrets, so adding one is a matter of keys.
 *
 * Only an id and a display name are asked for — no email, nothing that needs
 * a provider's review.
 */
import { hex, hmac } from './http';

export type ProviderId = 'google' | 'facebook' | 'twitter' | 'test';

export interface ProviderEnv {
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly FACEBOOK_CLIENT_ID?: string;
  readonly FACEBOOK_CLIENT_SECRET?: string;
  readonly TWITTER_CLIENT_ID?: string;
  readonly TWITTER_CLIENT_SECRET?: string;
  /** Only ever set by the local test harness. Never in production. */
  readonly AUTH_TEST?: string;
}

/** Who signed in, as the provider says. */
export interface Profile {
  readonly subject: string;
  readonly name: string;
}

export interface ProviderSpec {
  readonly id: ProviderId;
  readonly authorize: string;
  readonly token: string;
  readonly scope: string;
  /** Sends a PKCE challenge, and the verifier with the code. */
  readonly pkce: boolean;
  /** How the client authenticates at the token endpoint. */
  readonly tokenAuth: 'body' | 'basic';
  /** Facebook documents its token exchange as a GET; everyone else takes a POST. */
  readonly tokenMethod?: 'GET' | 'POST';
  /** Extra parameters on the way out. */
  readonly extra?: Record<string, string>;
  clientId(env: ProviderEnv): string | undefined;
  clientSecret(env: ProviderEnv): string | undefined;
  /** Whether it can be offered with the keys there are. */
  ready(env: ProviderEnv): boolean;
  profile(accessToken: string, env: ProviderEnv): Promise<Profile>;
}

const getJson = async (url: string, accessToken: string): Promise<Record<string, unknown>> => {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    throw new Error(`profile ${response.status}`);
  }
  return (await response.json()) as Record<string, unknown>;
};

const both = (id?: string, secret?: string): boolean => Boolean(id && secret);

export const PROVIDERS: Record<Exclude<ProviderId, 'test'>, ProviderSpec> = {
  google: {
    id: 'google',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid profile',
    pkce: true,
    tokenAuth: 'body',
    extra: { prompt: 'select_account' },
    clientId: (env) => env.GOOGLE_CLIENT_ID,
    clientSecret: (env) => env.GOOGLE_CLIENT_SECRET,
    ready: (env) => both(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    async profile(token) {
      const me = await getJson('https://openidconnect.googleapis.com/v1/userinfo', token);
      return { subject: String(me.sub ?? ''), name: String(me.name ?? '') };
    },
  },
  facebook: {
    id: 'facebook',
    authorize: 'https://www.facebook.com/dialog/oauth',
    token: 'https://graph.facebook.com/oauth/access_token',
    scope: 'public_profile',
    pkce: false,
    tokenAuth: 'body',
    tokenMethod: 'GET',
    clientId: (env) => env.FACEBOOK_CLIENT_ID,
    clientSecret: (env) => env.FACEBOOK_CLIENT_SECRET,
    ready: (env) => both(env.FACEBOOK_CLIENT_ID, env.FACEBOOK_CLIENT_SECRET),
    async profile(token, env) {
      // appsecret_proof ties the call to this app, as Facebook recommends.
      const proof = hex(await hmac(env.FACEBOOK_CLIENT_SECRET ?? '', token));
      const me = await getJson(
        `https://graph.facebook.com/me?fields=id,name&appsecret_proof=${proof}`,
        token,
      );
      return { subject: String(me.id ?? ''), name: String(me.name ?? '') };
    },
  },
  twitter: {
    id: 'twitter',
    authorize: 'https://x.com/i/oauth2/authorize',
    token: 'https://api.x.com/2/oauth2/token',
    // users.read needs tweet.read beside it.
    scope: 'users.read tweet.read',
    pkce: true,
    tokenAuth: 'basic',
    clientId: (env) => env.TWITTER_CLIENT_ID,
    clientSecret: (env) => env.TWITTER_CLIENT_SECRET,
    ready: (env) => both(env.TWITTER_CLIENT_ID, env.TWITTER_CLIENT_SECRET),
    async profile(token) {
      const me = await getJson('https://api.x.com/2/users/me', token);
      const data = me.data as { id?: string; name?: string } | undefined;
      return { subject: String(data?.id ?? ''), name: String(data?.name ?? '') };
    },
  },
};

/**
 * A stand-in provider for the local test harness: it signs in whoever the
 * code names, without leaving the machine. Only offered when AUTH_TEST is set
 * and the request is to localhost, so it can never answer in production.
 */
export const TEST_PROVIDER: ProviderSpec = {
  id: 'test',
  authorize: '',
  token: '',
  scope: '',
  pkce: false,
  tokenAuth: 'body',
  clientId: () => 'test',
  clientSecret: () => 'test',
  // Command-line vars may arrive as numbers, so compare as text.
  ready: (env) => String(env.AUTH_TEST ?? '') === '1',
  async profile(token) {
    return { subject: token, name: `Tester ${token}` };
  },
};

/** The order the buttons are offered in. */
export const PROVIDER_ORDER: readonly ProviderId[] = ['google', 'facebook', 'twitter'];
