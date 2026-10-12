import Phaser from 'phaser';

import { COLORS, PLAYER, POTION, TEXTURES } from '@/config';
import { GroundItem } from '@/entities/GroundItem';

/**
 * A health potion dropped by a kill. Walk over it to get a tenth of your
 * health back; leave it too long and it expires like any other ground item.
 */
export class HealthPotion extends GroundItem {
  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.potion, COLORS.potionGlow);
    this.setDisplaySize(POTION.size, POTION.size);
  }

  /** What one potion restores, in hit points. */
  public static get healing(): number {
    return Math.max(1, Math.round(PLAYER.maxHp * POTION.healFraction));
  }

  public drop(x: number, y: number): void {
    this.begin(x, y, POTION.size);
    this.pop();
  }
}
