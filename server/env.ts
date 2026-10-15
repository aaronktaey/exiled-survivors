import type { ProviderEnv } from './providers';

/** Everything the Worker is given: bindings, and secrets set with `wrangler secret put`. */
export interface Env extends ProviderEnv {
  readonly DB: D1Database;
  readonly ASSETS: Fetcher;
  /** Turnstile's secret. Unset in local development, where nothing is challenged. */
  readonly TURNSTILE_SECRET?: string;
  /** Mixed into a hashed address, so the table never holds anything reversible. */
  readonly IP_SALT?: string;
  /** Signs the short-lived cookie that carries a sign-in across the provider's pages. */
  readonly AUTH_SECRET?: string;
}
