import Phaser from 'phaser';

import { COLORS, DEPTH, MELEE } from '@/config';
import type { Enemy } from '@/entities/Enemy';
import { SKILLS } from '@/weapons/skills';
import { findNearest, type Weapon, type WeaponContext } from '@/weapons/Weapon';

/**
 * The starting attack: swings at the nearest enemy in reach, hitting
 * everything caught in the arc around it. Tags: 물리 · 공격 · 근접.
 */
export class MeleeStrike implements Weapon {
  public readonly definition = SKILLS.meleeStrike;

  private readonly scene: Phaser.Scene;
  private readonly flash: Phaser.GameObjects.Graphics;
  private sinceSwingMs = 0;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.flash = scene.add.graphics().setDepth(DEPTH.vfx).setAlpha(0);
  }

  public update(delta: number, context: WeaponContext): void {
    this.sinceSwingMs += delta;
    if (this.sinceSwingMs < context.cooldownMs) {
      return;
    }

    const target = findNearest(context.origin, context.enemies, context.range);
    if (!target) {
      // Hold the charge so the first enemy to step into reach is hit at once.
      this.sinceSwingMs = context.cooldownMs;
      return;
    }

    this.sinceSwingMs = 0;
    this.swing(context, target);
  }

  private swing(context: WeaponContext, target: Phaser.GameObjects.Components.Transform): void {
    const { origin, range } = context;
    const angle = Phaser.Math.Angle.Between(origin.x, origin.y, target.x, target.y);
    const halfArc = MELEE.arcRadians / 2;

    this.showFlash(origin.x, origin.y, angle, halfArc, range);

    // Copy first: a kill destroys the enemy and mutates the group's list.
    for (const child of [...context.enemies.getChildren()]) {
      const enemy = child as Enemy;
      if (!enemy.active) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(origin.x, origin.y, enemy.x, enemy.y);
      if (distance > range) {
        continue;
      }

      const toEnemy = Math.atan2(enemy.y - origin.y, enemy.x - origin.x);
      if (Math.abs(Phaser.Math.Angle.Wrap(toEnemy - angle)) > halfArc) {
        continue;
      }

      context.hit(enemy, context.damage);
    }
  }

  private showFlash(x: number, y: number, angle: number, halfArc: number, reach: number): void {
    this.flash.clear();
    this.flash.fillStyle(COLORS.meleeArc, 0.3);
    this.flash.slice(x, y, reach, angle - halfArc, angle + halfArc, false);
    this.flash.fillPath();

    this.scene.tweens.killTweensOf(this.flash);
    this.flash.setAlpha(1);
    this.scene.tweens.add({ targets: this.flash, alpha: 0, duration: MELEE.flashMs });
  }
}
