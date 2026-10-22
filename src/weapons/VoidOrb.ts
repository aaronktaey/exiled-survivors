import Phaser from 'phaser';

import { AFFIX_TIMING, DEPTH, ENEMY_KINDS, SKILL_MASTERY, TEXTURES, VOID_ORB, orbsHeld } from '@/config';
import type { Enemy } from '@/entities/Enemy';
import { sfx } from '@/systems/Sfx';
import { SKILLS } from '@/weapons/skills';
import type { Weapon, WeaponContext } from '@/weapons/Weapon';

const TAU = Math.PI * 2;

/** When one orb may hit a given enemy again. Paired with the sprite's life
 *  count, so a recycled enemy starts clean. */
interface HitRecord {
  life: number;
  readyAt: number;
  /** This hit was a 반복's, so the next waits out the whole cooldown. */
  repeated?: boolean;
}

/**
 * Drop-only skill: orbs that ride around the player clockwise and hurt
 * whatever they sweep through. Nothing is fired and nothing is aimed — the
 * damage is in where the player stands.
 *
 * It reads the shared stats as an orbit: `range` is how far out the orbs
 * ride, `orbitSpeed` how fast they travel around that circle, and the
 * cooldown (from attack speed) how often one orb may hit the same enemy
 * again. Tags: 공허 · 주문 · 투사체.
 */
export class VoidOrb implements Weapon {
  public readonly definition = SKILLS.voidOrb;

  private readonly scene: Phaser.Scene;
  private readonly orbs: Phaser.GameObjects.Image[] = [];
  /** 2차 각성: the ring inside, turning the other way. Public for tests. */
  public readonly inner: Phaser.GameObjects.Image[] = [];
  /**
   * Re-hit timers by enemy, one per orb: an orb does not hit the same enemy
   * again inside the cooldown, but every orb that sweeps through it does.
   */
  private readonly hits = new Map<Enemy, Map<number, HitRecord>>();

  /** Where the first orb is on the circle, in radians. */
  private angle = 0;
  /** What an orb's radius is now, after the held 효과범위. */
  private orbRadius: number = VOID_ORB.radius;
  /** How far round the orbs have come since the last lap was counted, in radians. */
  private lap = 0;
  private elapsedMs = 0;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** The live orbs, for tests and debug readouts. */
  public get active(): readonly Phaser.GameObjects.Image[] {
    return this.orbs.filter((orb) => orb.visible);
  }

  public update(delta: number, context: WeaponContext): void {
    this.elapsedMs += delta;

    const count = orbsHeld(context.orbCount, context.extraProjectiles ?? 0);
    const radius = Math.max(1, context.range);
    const innerCount = context.masteredTwice ? count : 0;
    this.orbRadius = VOID_ORB.radius * (context.areaScale ?? 1);
    this.sync(this.orbs, count);
    this.sync(this.inner, innerCount);

    // Screen y grows downward, so a growing angle sweeps clockwise.
    const angularSpeed = context.orbitSpeed / radius;
    const turned = angularSpeed * (delta / 1000);
    this.angle = Phaser.Math.Angle.Wrap(this.angle + turned);
    // Nothing is cast and nothing aimed: the survivor raises its orb once a lap.
    this.lap += turned;
    if (this.lap >= TAU) {
      this.lap -= TAU;
      context.onCast?.();
    }

    const { x, y } = context.origin;
    for (let i = 0; i < count; i++) {
      // Evenly spaced around the circle, so two orbs sit opposite.
      const orbAngle = this.angle + (i / count) * TAU;
      this.orbs[i]?.setPosition(x + Math.cos(orbAngle) * radius, y + Math.sin(orbAngle) * radius);
    }
    // 2차 각성: the inner ring, the other way round, offset half a gap.
    const { radiusShare, damageShare } = SKILL_MASTERY.second.voidInner;
    for (let i = 0; i < innerCount; i++) {
      const orbAngle = -this.angle + ((i + 0.5) / innerCount) * TAU;
      this.inner[i]?.setPosition(x + Math.cos(orbAngle) * radius * radiusShare, y + Math.sin(orbAngle) * radius * radiusShare);
    }

    this.sweep(context, this.orbs, count, 0, context.damage);
    if (innerCount > 0) {
      // Keys past the outer ring's, so the two rings keep their own timers.
      this.sweep(context, this.inner, innerCount, 1000, context.damage * damageShare);
    }
  }

  /** Grows or hides a ring's orbs so exactly `count` of them are in the air. */
  private sync(orbs: Phaser.GameObjects.Image[], count: number): void {
    while (orbs.length < count) {
      orbs.push(
        this.scene.add
          .image(0, 0, TEXTURES.voidOrb)
          .setDepth(DEPTH.projectiles)
          .setDisplaySize(this.orbRadius * 2, this.orbRadius * 2),
      );
    }

    orbs.forEach((orb, index) => orb.setVisible(index < count).setDisplaySize(this.orbRadius * 2, this.orbRadius * 2));
  }

  /** Damages everything an orb is touching: each orb at most once per cooldown on each enemy. */
  private sweep(context: WeaponContext, orbs: readonly Phaser.GameObjects.Image[], count: number, key: number, damage: number): void {
    // Copy first: a kill recycles the enemy and mutates the group's list.
    for (const child of [...context.enemies.getChildren()]) {
      const enemy = child as Enemy;
      if (!enemy.active) {
        continue;
      }

      const reach = this.orbRadius + VOID_ORB.hitPadding + (ENEMY_KINDS[enemy.kind].size / 2);
      let records = this.hits.get(enemy);
      for (let i = 0; i < count && enemy.active; i++) {
        const orb = orbs[i];
        if (!orb || Phaser.Math.Distance.Between(orb.x, orb.y, enemy.x, enemy.y) > reach) {
          continue;
        }
        const record = records?.get(key + i);
        if (record !== undefined && record.life === enemy.lives && this.elapsedMs < record.readyAt) {
          continue;
        }
        if (!records) {
          records = new Map();
          this.hits.set(enemy, records);
        }
        // 반복: at its chance this orb hits the same enemy once more, soon.
        const again = !(record?.life === enemy.lives && record.repeated) && Math.random() < (context.repeatChance ?? 0);
        const wait = again ? Math.min(AFFIX_TIMING.repeatDelayMs, context.cooldownMs / 2) : context.cooldownMs;
        records.set(key + i, { life: enemy.lives, readyAt: this.elapsedMs + wait, repeated: again });
        context.hit(enemy, damage);
        // 각성 (0.94, the user's ask): every hit gives health back.
        if (context.mastered) {
          context.heal?.(SKILL_MASTERY.voidHealPerHit);
        }
        // Held well apart by its own gap, or an orbit would drone.
        sfx.playSkill(this.scene, this.definition.id);
      }
    }
  }
}
