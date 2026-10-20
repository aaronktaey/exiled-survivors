import Phaser from 'phaser';

import { DEPTH, LIGHTNING, SKILL_MASTERY } from '@/config';
import type { Enemy } from '@/entities/Enemy';
import { sfx } from '@/systems/Sfx';
import { drawBolt } from '@/weapons/bolt';
import { SKILLS } from '@/weapons/skills';
import { findNearestEnemy, type Weapon, type WeaponContext } from '@/weapons/Weapon';

/**
 * Drop-only skill: an instant arc that strikes the nearest enemy and then
 * jumps from victim to victim, never hitting the same one twice. There is no
 * projectile — the damage lands the moment it is cast.
 * Tags: 주문 · 번개 · 연쇄.
 */
export class ChainLightning implements Weapon {
  public readonly definition = SKILLS.chainLightning;

  private readonly scene: Phaser.Scene;
  private readonly bolt: Phaser.GameObjects.Graphics;
  private sinceCastMs = 0;
  /** Victims of the current cast, so the arc cannot double back. */
  private readonly struck = new Set<Enemy>();

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.bolt = scene.add.graphics().setDepth(DEPTH.vfx).setAlpha(0);
  }

  public update(delta: number, context: WeaponContext): void {
    this.sinceCastMs += delta;
    if (this.sinceCastMs < context.cooldownMs) {
      return;
    }

    const first = findNearestEnemy(context.origin.x, context.origin.y, context.enemies, context.range);
    if (!first) {
      // Hold the charge so the first enemy to wander in is struck at once.
      this.sinceCastMs = context.cooldownMs;
      return;
    }

    this.sinceCastMs = 0;
    this.strike(context, first);
  }

  /**
   * Walks the arc through the crowd, damaging each link as it goes. Every
   * jump starts from where the last victim stood, so the chain spreads
   * outward rather than fanning out from the player.
   */
  private strike(context: WeaponContext, first: Enemy): void {
    // Flat x, y pairs: the player, then each enemy the arc reaches.
    const path = [context.origin.x, context.origin.y];
    this.struck.clear();

    // chainCount is how many *extra* enemies the arc reaches after the first.
    const links = 1 + Math.max(0, Math.round(context.chainCount));
    let target: Enemy | undefined = first;

    for (let i = 0; i < links && target; i++) {
      // Read the position before the hit: a kill recycles the sprite.
      const { x, y } = target;
      path.push(x, y);
      this.struck.add(target);
      // 각성: the jumps still to come after this one each add a share.
      const toCome = links - 1 - i;
      const boost = context.mastered ? 1 + SKILL_MASTERY.chainBonusPerJump * toCome : 1;
      context.hit(target, context.damage * boost);

      target = findNearestEnemy(x, y, context.enemies, LIGHTNING.chainRadius, this.struck);
    }

    this.showBolt(path);
    sfx.playSkill(this.scene, this.definition.id);
  }

  private showBolt(path: readonly number[]): void {
    this.bolt.clear();
    for (let i = 0; i + 3 < path.length; i += 2) {
      drawBolt(this.bolt, path[i]!, path[i + 1]!, path[i + 2]!, path[i + 3]!);
    }

    this.scene.tweens.killTweensOf(this.bolt);
    this.bolt.setAlpha(1);
    this.scene.tweens.add({ targets: this.bolt, alpha: 0, duration: LIGHTNING.flashMs });
  }
}
