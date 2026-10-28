import Phaser from 'phaser';

import { COLORS, DEPTH, MELEE, SKILL_MASTERY } from '@/config';
import type { Enemy } from '@/entities/Enemy';
import { sfx } from '@/systems/Sfx';
import { SKILLS } from '@/weapons/skills';
import { CastRepeat, type Weapon, type WeaponContext } from '@/weapons/Weapon';

/**
 * How far the swing has to reach to touch an enemy as it is drawn, and how
 * much wider than the arc its middle may sit while some of it is still
 * inside. Reach is measured to the edge of what is seen, not to the middle:
 * a 우두머리 is drawn far wider than its body, and a swing that visibly cut
 * into it used to miss until its middle was in reach.
 */
function reachTo(enemy: Enemy, x: number, y: number): { readonly gap: number; readonly slack: number } {
  const radius = enemy.shownRadius;
  const distance = Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y);
  return {
    gap: distance - radius,
    slack: distance > radius ? Math.asin(radius / distance) : Math.PI,
  };
}

/**
 * The starting attack: swings at the nearest enemy in reach, hitting
 * everything caught in the arc around it. Tags: 물리 · 공격 · 근접.
 */
export class MeleeStrike implements Weapon {
  public readonly definition = SKILLS.meleeStrike;

  private readonly scene: Phaser.Scene;
  private readonly flash: Phaser.GameObjects.Graphics;
  private sinceSwingMs = 0;
  /** 반복: whether this cast goes off once more. */
  private readonly repeat = new CastRepeat();
  /** Enemy shots struck down by the 각성 swing. Public for tests. */
  public strikes = 0;
  /** Swings since awakening; every SKILL_MASTERY.meleeShotClearEvery-th clears the shots. Public for tests. */
  public awakenedSwings = 0;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.flash = scene.add.graphics().setDepth(DEPTH.vfx).setAlpha(0);
  }

  /** 가시 (0.143): the next update casts, the cooldown run out. */
  public castNow(): void {
    this.sinceSwingMs = Number.POSITIVE_INFINITY;
  }

  public update(delta: number, context: WeaponContext): void {
    this.sinceSwingMs += delta;
    if (this.sinceSwingMs < context.cooldownMs) {
      return;
    }

    const target = this.nearestInReach(context);
    if (!target) {
      // Hold the charge so the first enemy to step into reach is hit at once.
      this.sinceSwingMs = context.cooldownMs;
      return;
    }

    this.sinceSwingMs = this.repeat.restart(context);
    context.onCast?.(target.x);
    this.swing(context, target);
  }

  /** The enemy whose drawn edge is nearest, if any edge is within reach. */
  private nearestInReach(context: WeaponContext): Enemy | undefined {
    let best: Enemy | undefined;
    let bestGap = context.range;
    for (const child of context.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (!enemy.active) {
        continue;
      }
      const { gap } = reachTo(enemy, context.origin.x, context.origin.y);
      if (gap <= bestGap) {
        bestGap = gap;
        best = enemy;
      }
    }
    return best;
  }

  private swing(context: WeaponContext, target: Phaser.GameObjects.Components.Transform): void {
    const { origin, range } = context;
    const angle = Phaser.Math.Angle.Between(origin.x, origin.y, target.x, target.y);
    // 2차 각성: the swing opens to SKILL_MASTERY.second.meleeArcDegrees.
    const arc = context.masteredTwice ? Phaser.Math.DegToRad(SKILL_MASTERY.second.meleeArcDegrees) : MELEE.arcRadians;
    const halfArc = arc / 2;

    // 각성 (0.153): every third swing (SKILL_MASTERY.meleeShotClearEvery) clears the shots round it.
    const clears = context.mastered && ++this.awakenedSwings % SKILL_MASTERY.meleeShotClearEvery === 0;
    this.showFlash(origin.x, origin.y, angle, halfArc, range, clears);
    sfx.playSkill(this.scene, this.definition.id);

    // Copy first: a kill destroys the enemy and mutates the group's list.
    for (const child of [...context.enemies.getChildren()]) {
      const enemy = child as Enemy;
      if (!enemy.active) {
        continue;
      }

      // Any of it inside the arc counts: its edge within reach, and its
      // middle no further outside the arc than its own width allows.
      const { gap, slack } = reachTo(enemy, origin.x, origin.y);
      if (gap > range) {
        continue;
      }

      const toEnemy = Math.atan2(enemy.y - origin.y, enemy.x - origin.x);
      if (Math.abs(Phaser.Math.Angle.Wrap(toEnemy - angle)) > halfArc + slack) {
        continue;
      }

      context.hit(enemy, context.damage);
    }

    // 각성: on a clearing swing, every enemy shot within reach is struck out of the air.
    if (clears) {
      for (const child of [...context.enemyShots.getChildren()]) {
        const shot = child as Phaser.Physics.Arcade.Image & { despawn?: () => void };
        if (!shot.active) {
          continue;
        }
        if (Phaser.Math.Distance.Between(origin.x, origin.y, shot.x, shot.y) > range) {
          continue;
        }
        shot.despawn?.();
        this.strikes += 1;
      }
    }
  }

  private showFlash(x: number, y: number, angle: number, halfArc: number, reach: number, clears = false): void {
    this.flash.clear();
    this.flash.fillStyle(COLORS.meleeArc, 0.3);
    this.flash.slice(x, y, reach, angle - halfArc, angle + halfArc, false);
    this.flash.fillPath();
    // A clearing swing shows the reach it cleared, all round.
    if (clears) {
      this.flash.lineStyle(3, COLORS.meleeArc, 0.7);
      this.flash.strokeCircle(x, y, reach);
    }

    this.scene.tweens.killTweensOf(this.flash);
    this.flash.setAlpha(1);
    this.scene.tweens.add({ targets: this.flash, alpha: 0, duration: MELEE.flashMs });
  }
}
