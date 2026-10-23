import Phaser from 'phaser';

import { COLORS, DEPTH, MENU, SCENES, SCRIM, TEXT } from '@/config';
import { t } from '@/i18n';
import { centredTop } from '@/systems/Layout';
import { MenuList, type MenuItem } from '@/systems/MenuList';
import { addBackButton, type BackButton } from '@/systems/BackButton';

export interface ConfirmSceneData {
  /** The heading and what it says; a new run's question when left out. */
  readonly title?: string;
  readonly body?: string;
  /** Under it, smaller: what is about to be lost. */
  readonly detail?: string;
  /** The yes button's label; 새로 시작 when left out. */
  readonly confirmLabel?: string;
  readonly onConfirm: () => void;
  /** Offers 이어서 하기 as well — a new run's question only. */
  readonly onLoad?: () => void;
  readonly onCancel: () => void;
}

/**
 * A question asked before something that cannot be taken back: starting a
 * new run throws away the save that is sitting there (and offers to pick it
 * up instead, since that is usually what was meant); signing in replaces
 * this device's records with the account's (0.101). Heading, body, the
 * detail and the buttons are stacked and centred as one block.
 */
export class ConfirmScene extends Phaser.Scene {
  public static readonly KEY = SCENES.confirm;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;

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
    this.backButton = addBackButton(this, () => this.finish(this.payload.onCancel));
    const { width, height } = this.scale;
    const copy = t().confirm;
    const { title, body, detail, confirmLabel, onLoad } = this.payload;
    const wrap = Math.min(520, width - 48);

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);

    const heading = this.add
      .text(width / 2, 0, title ?? copy.newRunTitle, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.panel,
        color: COLORS.accent,
        align: 'center',
        wordWrap: { width: wrap },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);
    const lines = this.add
      .text(width / 2, 0, body ?? copy.newRunBody, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.text,
        align: 'center',
        lineSpacing: 4,
        wordWrap: { width: wrap },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);
    const note = detail
      ? this.add
          .text(width / 2, 0, detail, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: TEXT.size.small,
            color: COLORS.muted,
            align: 'center',
            wordWrap: { width: wrap },
          })
          .setOrigin(0.5, 0)
          .setDepth(DEPTH.ui + 1)
      : null;

    const items: MenuItem[] = [
      ...(onLoad ? [{ id: 'load', label: () => copy.loadInstead, onSelect: () => this.finish(onLoad) }] : []),
      { id: 'overwrite', label: () => confirmLabel ?? copy.startAnyway, onSelect: () => this.finish(this.payload.onConfirm) },
      { id: 'cancel', label: () => copy.cancel, onSelect: () => this.finish(this.payload.onCancel) },
    ];
    const listHeight = items.length * (MENU.buttonHeight + MENU.buttonGap) - MENU.buttonGap;
    const block = heading.height + 14 + lines.height + (note ? 10 + note.height : 0) + 30 + listHeight;
    let y = centredTop(height, block);
    heading.setY(y);
    y += heading.height + 14;
    lines.setY(y);
    y += lines.height;
    if (note) {
      note.setY(y + 10);
      y += 10 + note.height;
    }
    y += 30;

    this.menu = new MenuList(this, {
      x: width / 2,
      y: y + MENU.buttonHeight / 2,
      onCancel: () => this.finish(this.payload.onCancel),
      items,
    });
  }

  private finish(action: () => void): void {
    this.scene.stop();
    action();
  }
}
