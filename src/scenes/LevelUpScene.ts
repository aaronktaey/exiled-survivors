import Phaser from 'phaser';

import { COLORS, DEPTH } from '@/config';
import { UPGRADES, type UpgradeId } from '@/systems/Progression';

export interface LevelUpData {
  readonly level: number;
  readonly onPick: (upgrade: UpgradeId) => void;
}

const LEFT_CODES = ['KeyA', 'ArrowLeft'];
const RIGHT_CODES = ['KeyD', 'ArrowRight'];

/**
 * Overlay shown on level-up. Picking is left/right only, so the whole game
 * stays playable on WASD and the arrow keys alone.
 *
 * Input is ignored for a moment after opening, and key repeats are dropped,
 * so a direction already held for movement cannot auto-pick an upgrade.
 */
export class LevelUpScene extends Phaser.Scene {
  public static readonly KEY = 'LevelUpScene';
  private static readonly INPUT_LOCK_MS = 260;

  private payload!: LevelUpData;
  private unlocked = false;
  private picked = false;

  public constructor() {
    super(LevelUpScene.KEY);
  }

  public init(data: LevelUpData): void {
    this.payload = data;
    this.picked = false;
  }

  public create(): void {
    const { width, height } = this.scale;
    const centerX = width / 2;

    this.add.rectangle(0, 0, width, height, 0x05070b, 0.72).setOrigin(0, 0).setDepth(DEPTH.ui);

    this.add
      .text(centerX, height / 2 - 150, 'LEVEL UP', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '42px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    this.add
      .text(centerX, height / 2 - 108, `Lv ${this.payload.level}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: COLORS.accent,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    this.buildCard(centerX - 150, height / 2 + 10, UPGRADES[0]!, '← / A');
    this.buildCard(centerX + 150, height / 2 + 10, UPGRADES[1]!, 'D / →');

    this.add
      .text(centerX, height / 2 + 150, '방향키 또는 A·D 로 선택', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    // A fresh scene's `time.now` is still 0 in create(), so compare against
    // a flag the clock flips instead of a precomputed timestamp.
    this.unlocked = false;
    this.time.delayedCall(LevelUpScene.INPUT_LOCK_MS, () => { this.unlocked = true; });
    this.input.keyboard?.on('keydown', this.onKeyDown, this);
  }

  private buildCard(x: number, y: number, upgrade: (typeof UPGRADES)[number], hint: string): void {
    const panel = this.add.rectangle(x, y, 260, 170, COLORS.panel, 1).setDepth(DEPTH.ui);
    panel.setStrokeStyle(2, COLORS.panelEdge, 1);

    this.add
      .text(x, y - 42, upgrade.label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '26px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    this.add
      .text(x, y + 10, upgrade.detail, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: 220 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    this.add
      .text(x, y + 60, hint, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: COLORS.accent,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);
  }

  private onKeyDown(event: KeyboardEvent): void {
    // `repeat` filters a direction that was already held when the popup opened.
    if (this.picked || event.repeat || !this.unlocked) {
      return;
    }

    if (LEFT_CODES.includes(event.code)) {
      this.pick(UPGRADES[0]!.id);
    } else if (RIGHT_CODES.includes(event.code)) {
      this.pick(UPGRADES[1]!.id);
    }
  }

  private pick(upgrade: UpgradeId): void {
    this.picked = true;
    this.input.keyboard?.off('keydown', this.onKeyDown, this);

    const { onPick } = this.payload;
    this.scene.stop();
    onPick(upgrade);
  }
}
