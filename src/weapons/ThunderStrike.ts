import Phaser from 'phaser';

import { DEPTH, SKILL_MASTERY, THUNDER } from '@/config';
import type { Enemy } from '@/entities/Enemy';
import { sfx } from '@/systems/Sfx';
import { drawBolt } from '@/weapons/bolt';
import { SKILLS } from '@/weapons/skills';
import { findNearestEnemy, type Weapon, type WeaponContext } from '@/weapons/Weapon';

/**
 * Drop-only skill: a bolt out of the sky onto the enemy nearest the
 * survivor within range, landing the moment it is cast (a random one in
 * range until 2026-10-16; the user asked for the nearest). A recast after a
 * kill goes to whoever is nearest then.
 *
 * A strike that kills rolls THUNDER.recastChance to strike again at once,
 * and each recast rolls its own — a crowd of the nearly dead can take a
 * string of them from one cast.
 *
 * Tags: 오라 · 주문 · 번개.
 */
export class ThunderStrike implements Weapon {
  public readonly definition = SKILLS.thunderStrike;

  private readonly scene: Phaser.Scene;
  private readonly bolt: Phaser.GameObjects.Graphics;
  private sinceCastMs = 0;
  /** How many strikes the last cast came to. Public for tests. */
  public lastStrikes = 0;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bolt = scene.add.graphics().setDepth(DEPTH.vfx).setAlpha(0);
  }

  public update(delta: number, context: WeaponContext): void {
    this.sinceCastMs += delta;
    if (this.sinceCastMs < context.cooldownMs) {
      return;
    }

    const first = this.pick(context);
    if (!first) {
      // Hold the charge so the first enemy to wander in is struck at once.
      this.sinceCastMs = context.cooldownMs;
      return;
    }

    this.sinceCastMs = 0;
    this.bolt.clear();
    this.lastStrikes = 0;
    context.onCast?.(first.x);
    this.cast(context, first);
    this.scene.tweens.killTweensOf(this.bolt);
    this.bolt.setAlpha(1);
    this.scene.tweens.add({ targets: this.bolt, alpha: 0, duration: THUNDER.flashMs });
    sfx.playSkill(this.scene, this.definition.id);
  }

  /** One bolt: the first strike, then a recast for as long as kills keep winning the roll. */
  private cast(context: WeaponContext, first: Enemy): void {
    let target: Enemy | undefined = first;
    let strikes = 0;

    while (target && strikes <= THUNDER.maxRecasts) {
      const killed = this.strike(context, target);
      strikes += 1;
      // 각성: a kill always strikes again.
      const recast = context.mastered ? SKILL_MASTERY.thunderRecastChance : THUNDER.recastChance;
      if (!killed || Math.random() >= recast) {
        break;
      }
      target = this.pick(context);
    }

    this.lastStrikes += strikes;
  }

  /** Drops one bolt on `target`. True when it killed. */
  private strike(context: WeaponContext, target: Enemy): boolean {
    // Read before the hit: a kill recycles the sprite, and a recycled one
    // can be handed out again, so its life count is what says it died.
    const { x, y, lives } = target;
    drawBolt(this.bolt, x, y - THUNDER.height, x, y);
    context.hit(target, context.damage);
    return !target.active || target.lives !== lives;
  }

  /** The enemy nearest the survivor within range, or undefined if none is. */
  private pick(context: WeaponContext): Enemy | undefined {
    return findNearestEnemy(context.origin.x, context.origin.y, context.enemies, context.range);
  }
}
