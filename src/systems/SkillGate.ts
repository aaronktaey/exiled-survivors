import { SKILL_DEV_ONLY, SKILL_TRIAL } from '@/config';
import { account } from '@/systems/Account';
import type { SkillId } from '@/weapons/skills';

/**
 * Whether a skill may be offered to this player: anything not on trial,
 * and a trial skill (SKILL_TRIAL) to the accounts it names; one not shipped
 * yet (SKILL_DEV_ONLY) only on the dev server. The dev server
 * lets every one through for a look — but not the harness, which plays by
 * the shipped rule (no account there, so no trial skill).
 */
export function skillOffered(id: SkillId): boolean {
  const onDevServer = import.meta.env.DEV && !(window as Window & { __harness?: boolean }).__harness;
  // Not shipped yet (SKILL_DEV_ONLY): the dev server only.
  if (SKILL_DEV_ONLY.includes(id)) {
    return onDevServer;
  }
  const only = SKILL_TRIAL[id];
  if (!only) {
    return true;
  }
  if (onDevServer) {
    return true;
  }
  const me = account.user?.id;
  return me !== undefined && only.includes(me);
}
