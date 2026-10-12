import Phaser from 'phaser';

import { COLORS, DEPTH, SCENES } from '@/config';
import { MenuList } from '@/systems/MenuList';

export interface CreditsSceneData {
  readonly onClose: () => void;
}

const LINES: readonly (readonly [string, string])[] = [
  ['제작', 'whitemango'],
  ['개발', 'Claude Code (Anthropic)'],
  ['엔진', 'Phaser 4 · Vite · TypeScript'],
  ['아이콘', 'Raven Fantasy Icons — Caio / Clockwork Raven Studios'],
  ['배경음', 'Constance'],
  ['효과음', 'bulletcasing'],
];

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
      .text(width / 2, 60, '제작자 정보', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '34px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    const left = width / 2 - 230;
    LINES.forEach(([role, who], index) => {
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
      items: [{ id: 'back', label: () => '돌아가기', onSelect: () => this.close() }],
    });
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
