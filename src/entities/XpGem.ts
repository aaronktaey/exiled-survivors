import Phaser from 'phaser';

import { DEPTH, ICONS, PLAYER, TEXTURES, XP } from '@/config';
import { flyTo } from '@/entities/GroundItem';

/**
 * Dropped where an enemy died. Sits still until the player is close, then
 * homes in — the usual survivors-style vacuum.
 */
/** Whoever the gem drifts towards, and how far away it starts drifting. */
export interface GemTarget extends Phaser.GameObjects.Components.Transform {
  readonly pickupRadius: number;
}

export class XpGem extends Phaser.Physics.Arcade.Image {
  /** Set by whatever dropped it; this is only the floor. */
  public value: number = XP.minimum;
  private target?: GemTarget;
  /** A 자석's pull, while it lasts: when it should arrive (scene clock). */
  private pullEndsAt = 0;
  /** Whether a 자석 is pulling it in. Public for tests. */
  public pulled = false;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.gem);
    this.setDepth(DEPTH.pickups);
    // The source art is 32x32; draw it small and match the body to it.
    this.setDisplaySize(ICONS.gem.size, ICONS.gem.size);
  }

  public drop(x: number, y: number, value: number, target: GemTarget): void {
    this.value = value;
    this.target = target;
    this.enableBody(true, x, y, true, true);
    this.setDisplaySize(ICONS.gem.size, ICONS.gem.size);
    this.body?.setSize(ICONS.gem.size, ICONS.gem.size, true);
    this.setVelocity(0, 0);
    this.pulled = false;
  }

  public collect(): void {
    this.pulled = false;
    this.disableBody(true, true);
  }

  /** A 자석: fly to the survivor however far away it lies, by `endsAt`. */
  public pullTo(endsAt: number): void {
    this.pulled = true;
    this.pullEndsAt = endsAt;
  }

  public override update(): void {
    if (!this.target || !this.body) {
      return;
    }
    if (this.pulled) {
      this.pulled = flyTo(this, this.target, this.pullEndsAt);
      return;
    }

    const distance = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    if (distance <= this.target.pickupRadius) {
      this.scene.physics.moveTo(this, this.target.x, this.target.y, PLAYER.pickupSpeed);
    } else {
      this.setVelocity(0, 0);
    }
  }
}
