import { FIREBALL, SHOTS } from '@/config';
import type { LaunchSpec } from '@/entities/Projectile';
import { ProjectileWeapon } from '@/weapons/ProjectileWeapon';
import { SKILLS } from '@/weapons/skills';
import type { WeaponContext } from '@/weapons/Weapon';

/**
 * Drop-only skill: lobs a homing-free bolt at the nearest enemy in range,
 * which bursts on the first thing it touches and takes everything within
 * FIREBALL.blastRadius of it along.
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
      blastRadius: FIREBALL.blastRadius,
      ...SHOTS.fireball,
    };
  }
}
