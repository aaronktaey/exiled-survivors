import Phaser from 'phaser';

import { COLORS, DEPTH, SCENES } from '@/config';
import { t } from '@/i18n';
import { MenuList } from '@/systems/MenuList';

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
    [copy.roleIcons, 'Raven Fantasy Icons — Caio / Clockwork Raven Studios'],
    [copy.roleMusic, 'Constance'],
    [copy.roleSfx, 'bulletcasing'],
  ];
}

/** 제작자 정보: who and what this run is built out of. */
export class CreditsScene extends Phaser.Scene {
  public static readonly KEY = SCENES.credits;

  private payload!: CreditsSceneData;

  public constructor() {
    super(CreditsScene.KEY);
  }

  public init(data: CreditsSceneData): void {
    this.payload = data;
  }

  public create(): void {
    const { width, height } = this.scale;

    this.add.rectangle(0, 0, width, height, 0x05070b, 0.92).setOrigin(0, 0).setDepth(DEPTH.ui);
    this.add
      .text(width / 2, 60, t().credits.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '34px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    const left = width / 2 - 230;
    lines().forEach(([role, who], index) => {
      const y = 140 + index * 34;

      this.add
        .text(left, y, role, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          color: COLORS.accent,
        })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.ui + 1);

      this.add
        .text(left + 90, y, who, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '15px',
          color: COLORS.text,
        })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.ui + 1);
    });

    new MenuList(this, {
      x: width / 2,
      y: height - 92,
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
