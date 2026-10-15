/**
 * Who may open the F1 developer tools. On the dev server, anyone (the harness
 * leans on them). In the deployed game, only a signed-in account the server
 * has named as an admin — the list is a Worker secret, not in the code.
 *
 * This keeps the tools out of other players' hands; it is not a lock on the
 * game itself, which runs in the player's own browser.
 */
import { DEBUG } from '@/config';
import { account } from '@/systems/Account';

export function devToolsAllowed(): boolean {
  if (import.meta.env.DEV && !DEBUG.gatedInDev) {
    return true;
  }
  return account.user?.admin === true;
}
