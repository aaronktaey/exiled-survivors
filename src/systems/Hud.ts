import Phaser from 'phaser';

import { COLORS, DEPTH } from '@/config';

/** Fixed-to-camera run readout: time survived and how many enemies are up. */
export class Hud {
  private readonly label: Phaser.GameObjects.Text;
  private elapsedMs = 0;

  public constructor(scene: Phaser.Scene) {
    this.label = scene.add
      .text(16, 14, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: COLORS.text,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);
  }

  public update(delta: number, enemies: number): void {
    this.elapsedMs += delta;

    const total = Math.floor(this.elapsedMs / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');

    this.label.setText(`${mm}:${ss}    enemies ${enemies}`);
  }
}
