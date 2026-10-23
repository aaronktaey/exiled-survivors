import Phaser from 'phaser';

import { COLORS, DEPTH, MENU, SCENES, SCRIM, TEXT } from '@/config';
import { centredTop } from '@/systems/Layout';
import { t } from '@/i18n';
import { MenuList } from '@/systems/MenuList';
import { addBackButton, type BackButton } from '@/systems/BackButton';

export interface CreditsSceneData {
  readonly onClose: () => void;
}

/** Who and what, with the roles named in the current language. */
function lines(): readonly (readonly [string, string])[] {
  const copy = t().credits;
  return [
    [copy.roleAuthor, 'whitemango'],
    [copy.roleDev, 'Claude Code (Anthropic)'],
    [copy.roleEngine, 'Phaser 4 · Vite · TypeScript'],
    // Galmuri is SIL OFL 1.1: its copyright is shown here, its licence ships in public/fonts/galmuri.
    [copy.roleFont, 'Galmuri © Lee Minseo (SIL OFL 1.1)'],
    // CC BY 4.0 asks for the title, the author, the source and the licence.
    [copy.roleMusic, '"Constance" Kevin MacLeod (incompetech.com) · Licensed under Creative Commons: By Attribution 4.0 (creativecommons.org/licenses/by/4.0)'],
  ];
}

/** 제작자 정보: who and what this run is built out of. */
export class CreditsScene extends Phaser.Scene {
  public static readonly KEY = SCENES.credits;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;

  private payload!: CreditsSceneData;
  /** This screen's list of choices. Public so a test can drive it. */
  public menu!: MenuList;

  public constructor() {
    super(CreditsScene.KEY);
  }

  public init(data: CreditsSceneData): void {
    this.payload = data;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);
    const left = width / 2 - Math.min(230, width / 2 - 24);
    const whoX = left + 90;

    // Made first and measured, so a credit that wraps (the music's) pushes the
    // rest down and the whole block is still centred.
    const rows = lines().map(([role, who]) => {
      const roleText = this.add
        .text(left, 0, role, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.body,
          color: COLORS.accent,
        })
        .setOrigin(0, 0)
        .setDepth(DEPTH.ui + 1);
      const whoText = this.add
        .text(whoX, 0, who, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.body,
          color: COLORS.text,
          wordWrap: { width: Math.max(160, width - whoX - 24), useAdvancedWrap: true },
        })
        .setOrigin(0, 0)
        .setDepth(DEPTH.ui + 1);
      return { roleText, whoText, height: Math.max(34, whoText.height + 12) };
    });
    const listHeight = rows.reduce((sum, row) => sum + row.height, 0);
    const block = MENU.titleBlockHeight + listHeight + 60 + MENU.buttonHeight;
    const top = centredTop(height, block);

    this.add
      .text(width / 2, top + 16, t().credits.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    let y = top + MENU.titleBlockHeight - 5;
    for (const row of rows) {
      row.roleText.setY(y);
      row.whoText.setY(y);
      y += row.height;
    }

    this.menu = new MenuList(this, {
      x: width / 2,
      y: top + block - MENU.buttonHeight / 2,
      width: 220,
      onCancel: () => this.close(),
      items: [{ id: 'back', label: () => t().common.back, onSelect: () => this.close() }],
    });
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
