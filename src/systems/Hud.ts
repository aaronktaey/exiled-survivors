import Phaser from 'phaser';

import { COLORS, DEPTH, PLAYER } from '@/config';
import type { Player } from '@/entities/Player';
import type { Progression } from '@/systems/Progression';

const MARGIN = 16;
const BAR_WIDTH = 200;
const BAR_HEIGHT = 10;

/** Fixed-to-camera run readout: health, XP, level, stats and the clock. */
export class Hud {
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly statsLabel: Phaser.GameObjects.Text;
  private readonly clockLabel: Phaser.GameObjects.Text;
  private readonly player: Player;
  private readonly progression: Progression;

  private elapsedMs = 0;

  public constructor(scene: Phaser.Scene, player: Player, progression: Progression) {
    this.player = player;
    this.progression = progression;

    this.bars = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.ui);

    this.statsLabel = scene.add
      .text(MARGIN, MARGIN + BAR_HEIGHT * 2 + 14, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: COLORS.muted,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);

    this.clockLabel = scene.add
      .text(scene.scale.width - MARGIN, MARGIN, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: COLORS.text,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);
  }

  public update(delta: number, enemies: number): void {
    this.elapsedMs += delta;

    const total = Math.floor(this.elapsedMs / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    this.clockLabel.setText(`${mm}:${ss}`);

    const { level, damage, attackSpeed } = this.progression;
    this.statsLabel.setText(
      `Lv ${level}    공격력 ${damage}    공격속도 ${attackSpeed.toFixed(1)}/s    적 ${enemies}`,
    );

    this.drawBars();
  }

  private drawBars(): void {
    const hpRatio = Phaser.Math.Clamp(this.player.hp / PLAYER.maxHp, 0, 1);
    const xpRatio = Phaser.Math.Clamp(this.progression.xp / this.progression.xpToNext, 0, 1);

    this.bars.clear();
    this.drawBar(MARGIN, hpRatio, COLORS.hpFill);
    this.drawBar(MARGIN + BAR_HEIGHT + 4, xpRatio, COLORS.xpFill);
  }

  private drawBar(y: number, ratio: number, color: number): void {
    this.bars.fillStyle(COLORS.barTrack, 1);
    this.bars.fillRect(MARGIN, y, BAR_WIDTH, BAR_HEIGHT);

    if (ratio > 0) {
      this.bars.fillStyle(color, 1);
      this.bars.fillRect(MARGIN, y, BAR_WIDTH * ratio, BAR_HEIGHT);
    }
  }
}
