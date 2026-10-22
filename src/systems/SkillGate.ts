import { SKILL_TRIAL } from '@/config';
import { account } from '@/systems/Account';
import type { SkillId } from '@/weapons/skills';

/**
 * Whether a skill may be offered to this player: anything not on trial,
 * and a trial skill (SKILL_TRIAL) to the accounts it names. The dev server
 * lets every one through for a look — but not the harness, which plays by
 * the shipped rule (no account there, so no trial skill).
 */
export function skillOffered(id: SkillId): boolean {
  const only = SKILL_TRIAL[id];
  if (!only) {
    return true;
  }
  if (import.meta.env.DEV && !(window as Window & { __harness?: boolean }).__harness) {
    return true;
  }
  const me = account.user?.id;
  return me !== undefined && only.includes(me);
}
