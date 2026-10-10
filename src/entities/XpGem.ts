import Phaser from 'phaser';

import { DEPTH, ICONS, PLAYER, TEXTURES, XP } from '@/config';

/**
 * Dropped where an enemy died. Sits still until the player is close, then
 * homes in — the usual survivors-style vacuum.
 */
export class XpGem extends Phaser.Physics.Arcade.Image {
  public value: number = XP.perEnemy;
  private target?: Phaser.GameObjects.Components.Transform;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.gem);
    this.setDepth(DEPTH.pickups);
    // The source art is 32x32; draw it small and match the body to it.
    this.setDisplaySize(ICONS.gem.size, ICONS.gem.size);
  }

  public drop(x: number, y: number, value: number, target: Phaser.GameObjects.Components.Transform): void {
    this.value = value;
    this.target = target;
    this.enableBody(true, x, y, true, true);
    this.setDisplaySize(ICONS.gem.size, ICONS.gem.size);
    this.body?.setSize(ICONS.gem.size, ICONS.gem.size, true);
    this.setVelocity(0, 0);
  }

  public collect(): void {
    this.disableBody(true, true);
  }

  public override update(): void {
    if (!this.target || !this.body) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    if (distance <= PLAYER.pickupRadius) {
      this.scene.physics.moveTo(this, this.target.x, this.target.y, PLAYER.pickupSpeed);
    } else {
      this.setVelocity(0, 0);
    }
  }
}
