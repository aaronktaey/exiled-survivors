import { CHILL, SHOTS, SKILL_MASTERY } from '@/config';
import type { LaunchSpec } from '@/entities/Projectile';
import { ProjectileWeapon } from '@/weapons/ProjectileWeapon';
import { SKILLS } from '@/weapons/skills';
import type { WeaponContext } from '@/weapons/Weapon';

/**
 * Drop-only skill: a shard that runs a line through the crowd instead of
 * stopping at the first body, leaving 냉각 on everything it passes through.
 * Tags: 주문 · 냉기 · 관통 · 투사체.
 */
export class IceSpear extends ProjectileWeapon {
  public readonly definition = SKILLS.iceSpear;

  protected override specFor(context: WeaponContext): LaunchSpec {
    return {
      damage: context.damage,
      speed: context.projectileSpeed,
      range: context.range,
      pierce: context.pierceCount,
      chillMs: CHILL.durationMs * (context.durationScale ?? 1),
      freezeMs: context.mastered ? SKILL_MASTERY.freezeMs * (context.durationScale ?? 1) : 0,
      ...SHOTS.iceSpear,
    };
  }
}
