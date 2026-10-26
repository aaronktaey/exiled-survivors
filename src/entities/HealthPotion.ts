import Phaser from 'phaser';

import { COLORS, POTION, TEXTURES } from '@/config';
import { GroundItem } from '@/entities/GroundItem';

/**
 * A health potion dropped by a kill. Walk over it to get POTION.heal back;
 * leave it too long and it expires like any other ground item.
 */
export class HealthPotion extends GroundItem {
  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.potion, COLORS.potionGlow);
    this.setDisplaySize(POTION.size, POTION.size);
  }

  /**
   * What one potion restores, in hit points: a flat POTION.heal (0.140; a
   * fifth of the bar before), and `extra` from the run's 포션 회복량 파편 (0.140).
   */
  public static healing(extra = 0): number {
    return POTION.heal + extra;
  }

  public drop(x: number, y: number): void {
    this.begin(x, y, POTION.size);
    this.pop();
  }
}
