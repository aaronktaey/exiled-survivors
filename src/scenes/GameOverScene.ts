import Phaser from 'phaser';

import { COLORS, DEPTH } from '@/config';

export interface GameOverData {
  readonly level: number;
  readonly survivedMs: number;
  readonly onRestart: () => void;
}

const RESTART_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/** End-of-run overlay. Restarts on any movement key, so no extra bindings. */
export class GameOverScene extends Phaser.Scene {
  public static readonly KEY = 'GameOverScene';
  private static readonly INPUT_LOCK_MS = 500;

  private payload!: GameOverData;
  private unlocked = false;
  private done = false;

  public constructor() {
    super(GameOverScene.KEY);
  }

  public init(data: GameOverData): void {
    this.payload = data;
    this.done = false;
  }

  public create(): void {
    const { width, height } = this.scale;
    const centerX = width / 2;

    this.add.rectangle(0, 0, width, height, 0x05070b, 0.8).setOrigin(0, 0).setDepth(DEPTH.ui);

    const total = Math.floor(this.payload.survivedMs / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');

    this.add
      .text(centerX, height / 2 - 60, 'GAME OVER', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '48px',
        color: COLORS.accent,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    this.add
      .text(centerX, height / 2, `생존 ${mm}:${ss}    Lv ${this.payload.level}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    this.add
      .text(centerX, height / 2 + 56, '아무 이동키나 눌러 다시 시작', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    // A fresh scene's `time.now` is still 0 in create(), so compare against
    // a flag the clock flips instead of a precomputed timestamp.
    this.unlocked = false;
    this.time.delayedCall(GameOverScene.INPUT_LOCK_MS, () => { this.unlocked = true; });
    this.input.keyboard?.on('keydown', this.onKeyDown, this);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.done || event.repeat || !this.unlocked) {
      return;
    }
    if (!RESTART_CODES.includes(event.code)) {
      return;
    }

    this.done = true;
    this.input.keyboard?.off('keydown', this.onKeyDown, this);

    const { onRestart } = this.payload;
    this.scene.stop();
    onRestart();
  }
}
