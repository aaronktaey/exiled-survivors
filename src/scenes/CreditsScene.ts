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
    const block = MENU.titleBlockHeight + lines().length * 34 + 60 + MENU.buttonHeight;
    const top = centredTop(height, block);

    this.add
      .text(width / 2, top + 16, t().credits.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    const left = width / 2 - Math.min(230, width / 2 - 24);
    lines().forEach(([role, who], index) => {
      const y = top + MENU.titleBlockHeight + 12 + index * 34;

      this.add
        .text(left, y, role, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.body,
          color: COLORS.accent,
        })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.ui + 1);

      this.add
        .text(left + 90, y, who, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.body,
          color: COLORS.text,
        })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.ui + 1);
    });

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
