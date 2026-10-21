import { SHOTS, SKILL_MASTERY } from '@/config';
import type { LaunchSpec } from '@/entities/Projectile';
import { ProjectileWeapon } from '@/weapons/ProjectileWeapon';
import { SKILLS } from '@/weapons/skills';
import type { WeaponContext } from '@/weapons/Weapon';

/**
 * Drop-only skill: lobs a homing-free bolt at the nearest enemy in range,
 * which bursts on the first thing it touches and takes everything within
 * its blastRadius of it along.
 * Tags: 투사체 · 원거리 · 주문 · 화염.
 */
export class Fireball extends ProjectileWeapon {
  public readonly definition = SKILLS.fireball;

  protected override specFor(context: WeaponContext): LaunchSpec {
    return {
      damage: context.damage,
      speed: context.projectileSpeed,
      range: context.range,
      pierce: 0,
      chillMs: 0,
      // 각성 widens the burst, and 2차 각성 again (4× in all); the held 효과범위 on top.
      blastRadius:
        context.blastRadius *
        (context.mastered ? SKILL_MASTERY.fireBlastScale : 1) *
        (context.masteredTwice ? SKILL_MASTERY.second.fireBlastScale : 1) *
        (context.areaScale ?? 1),
      ...SHOTS.fireball,
    };
  }
}
