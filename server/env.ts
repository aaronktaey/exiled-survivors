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
  /**
   * Account ids (users.id) allowed the in-game developer tools, comma
   * separated. A secret rather than a line in the code: the repository is
   * public, and the list is nobody else's business.
   */
  readonly ADMIN_USERS?: string;
  /**
   * test-api only (honoured with AUTH_TEST): the day 오늘의 규칙 are read for,
   * in place of today, and a run's own `rules` day taken as it says — so the
   * suite does not change with the calendar.
   */
  readonly DAILY_DAY?: string;
}
