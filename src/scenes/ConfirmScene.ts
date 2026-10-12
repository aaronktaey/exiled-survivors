import Phaser from 'phaser';

import { COLORS, DEPTH, SCENES } from '@/config';
import { t } from '@/i18n';
import { MenuList } from '@/systems/MenuList';

export interface ConfirmSceneData {
  /** Shown under the heading: what is about to be lost. */
  readonly detail: string;
  readonly onConfirm: () => void;
  readonly onLoad: () => void;
  readonly onCancel: () => void;
}

/**
 * The one question the game asks: starting a new run throws away the save
 * that is sitting there, so it says so first — and offers to pick that run
 * up instead, since that is usually what was meant.
 */
export class ConfirmScene extends Phaser.Scene {
  public static readonly KEY = SCENES.confirm;

  private payload!: ConfirmSceneData;
  /** This screen's list of choices. Public so a test can drive it. */
  public menu!: MenuList;

  public constructor() {
    super(ConfirmScene.KEY);
  }

  public init(data: ConfirmSceneData): void {
    this.payload = data;
  }

  public create(): void {
    const { width, height } = this.scale;
    const copy = t().confirm;

    this.add.rectangle(0, 0, width, height, 0x05070b, 0.97).setOrigin(0, 0).setDepth(DEPTH.ui);

    this.add
      .text(width / 2, height / 2 - 120, copy.newRunTitle, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '26px',
        color: COLORS.accent,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.add
      .text(width / 2, height / 2 - 76, copy.newRunBody, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: COLORS.text,
        align: 'center',
        wordWrap: { width: 520 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.add
      .text(width / 2, height / 2 - 34, this.payload.detail, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.menu = new MenuList(this, {
      x: width / 2,
      y: height / 2 + 20,
      onCancel: () => this.finish(this.payload.onCancel),
      items: [
        { id: 'load', label: () => copy.loadInstead, onSelect: () => this.finish(this.payload.onLoad) },
        { id: 'overwrite', label: () => copy.startAnyway, onSelect: () => this.finish(this.payload.onConfirm) },
        { id: 'cancel', label: () => copy.cancel, onSelect: () => this.finish(this.payload.onCancel) },
      ],
    });
  }

  private finish(action: () => void): void {
    this.scene.stop();
    action();
  }
}
