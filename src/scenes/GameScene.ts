import Phaser from 'phaser';

import { COLORS, DEPTH, GAME_HEIGHT, GAME_WIDTH } from '@/config';

/**
 * The run itself: player, spawning, weapons and pickups will live here.
 * For now it only proves the stack boots end to end.
 */
export class GameScene extends Phaser.Scene {
  public static readonly KEY = 'GameScene';

  public constructor() {
    super(GameScene.KEY);
  }

  public create(): void {
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;

    this.add
      .text(centerX, centerY, 'Hello Survivor', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '56px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    this.add
      .text(centerX, centerY + 56, 'Exiled Survivors — booted', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: COLORS.accent,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);
  }

  public override update(_time: number, _delta: number): void {
    // Per-frame systems (movement, spawning, weapon cooldowns) run from here.
  }
}
