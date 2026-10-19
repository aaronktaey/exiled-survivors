import Phaser from 'phaser';

import { ORBS, ORB_DROP, PLAYER, type OrbId } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import type { GemTarget } from '@/entities/XpGem';

/**
 * A 구슬 on the ground. Each has its own sprite — a ring, a star, a cross —
 * because three spheres in three colours are one dark floor away from being
 * the same thing; the sprite comes off the ORBS table.
 *
 * Since 0.71 a run finds dozens, so one carries no name over it: it is drawn
 * in to the survivor the way an XP gem is, and the pickup's toast says what
 * it was.
 */
export class OrbDrop extends GroundItem {
  /** Which 구슬 this is. Public for the pickup and for tests. */
  public orb: OrbId = 'transmute';
  private target?: GemTarget;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ORBS.transmute.texture, ORBS.transmute.color);
    this.setDisplaySize(ORB_DROP.size, ORB_DROP.size);
  }

  public drop(x: number, y: number, id: OrbId, target: GemTarget): void {
    const spec = ORBS[id] ?? ORBS.transmute;
    this.orb = spec.id;
    this.target = target;

    this.setTexture(spec.texture);
    this.begin(x, y, ORB_DROP.size);
    this.setDisplaySize(ORB_DROP.size, ORB_DROP.size);
    this.glow.setFillStyle(spec.color, this.glow.fillAlpha);

    this.pop();
  }

  public override update(time: number, delta: number): void {
    super.update(time, delta);
    if (!this.active || !this.target || !this.body) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    if (distance <= this.target.pickupRadius) {
      this.scene.physics.moveTo(this, this.target.x, this.target.y, PLAYER.pickupSpeed);
    } else {
      this.setVelocity(0, 0);
    }
    this.glow.setPosition(this.x, this.y);
  }
}
