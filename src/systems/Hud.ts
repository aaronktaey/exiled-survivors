import Phaser from 'phaser';

import { COLORS, DEPTH, HUD } from '@/config';
import type { Progression } from '@/systems/Progression';

export interface LoadoutEntry {
  readonly name: string;
  readonly damage: number;
  readonly attackSpeed: number;
}

/**
 * Camera-fixed run readout: level and loadout top-left, clock top-centre,
 * and a full-width XP bar along the bottom edge.
 *
 * Health is not here — it rides above the player, drawn by Player itself.
 */
export class Hud {
  private readonly xpBar: Phaser.GameObjects.Graphics;
  private readonly statsLabel: Phaser.GameObjects.Text;
  private readonly skillsLabel: Phaser.GameObjects.Text;
  private readonly clockLabel: Phaser.GameObjects.Text;
  private readonly progression: Progression;
  private readonly viewWidth: number;
  private readonly viewHeight: number;

  private elapsedMs = 0;

  public constructor(scene: Phaser.Scene, progression: Progression) {
    this.progression = progression;
    this.viewWidth = scene.scale.width;
    this.viewHeight = scene.scale.height;

    this.xpBar = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.ui);

    this.statsLabel = scene.add
      .text(HUD.margin, HUD.margin, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: COLORS.muted,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);

    this.skillsLabel = scene.add
      .text(HUD.margin, HUD.margin + 22, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: COLORS.text,
        lineSpacing: 4,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);

    this.clockLabel = scene.add
      .text(this.viewWidth / 2, HUD.margin - 4, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: COLORS.text,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);
  }

  public update(delta: number, enemies: number, loadout: ReadonlyArray<LoadoutEntry>): void {
    this.elapsedMs += delta;

    const total = Math.floor(this.elapsedMs / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    this.clockLabel.setText(`${mm}:${ss}`);

    this.statsLabel.setText(`Lv ${this.progression.level}    적 ${enemies}`);
    this.skillsLabel.setText(
      loadout.map((s) => `${s.name}  공격력 ${s.damage}  공속 ${s.attackSpeed.toFixed(1)}/s`),
    );

    this.drawXpBar();
  }

  private drawXpBar(): void {
    const ratio = Phaser.Math.Clamp(this.progression.xp / this.progression.xpToNext, 0, 1);
    const top = this.viewHeight - HUD.xpBarHeight;

    this.xpBar.clear();
    this.xpBar.fillStyle(COLORS.barTrack, 1);
    this.xpBar.fillRect(0, top, this.viewWidth, HUD.xpBarHeight);

    if (ratio > 0) {
      this.xpBar.fillStyle(COLORS.xpFill, 1);
      this.xpBar.fillRect(0, top, this.viewWidth * ratio, HUD.xpBarHeight);
    }
  }
}
