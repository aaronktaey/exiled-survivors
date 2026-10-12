import Phaser from 'phaser';

import { COLORS, DEPTH, SCENES } from '@/config';
import { fill, t } from '@/i18n';
import { MenuList } from '@/systems/MenuList';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export interface GameOverData {
  readonly level: number;
  readonly survivedMs: number;
  readonly onRestart: () => void;
}

/**
 * End-of-run screen: how it went, and the three ways on — another run,
 * the title, or the options.
 */
export class GameOverScene extends Phaser.Scene {
  public static readonly KEY = SCENES.gameOver;

  private payload!: GameOverData;
  private menu!: MenuList;

  public constructor() {
    super(GameOverScene.KEY);
  }

  public init(data: GameOverData): void {
    this.payload = data;
  }

  public create(): void {
    const { width, height } = this.scale;
    const centerX = width / 2;

    this.add.rectangle(0, 0, width, height, 0x05070b, 0.85).setOrigin(0, 0).setDepth(DEPTH.ui);

    const total = Math.floor(this.payload.survivedMs / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');

    this.add
      .text(centerX, height / 2 - 150, t().gameOver.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '48px',
        color: COLORS.accent,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.add
      .text(centerX, height / 2 - 100, fill(t().gameOver.survived, { time: `${mm}:${ss}`, level: this.payload.level }), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.menu = new MenuList(this, {
      x: centerX,
      y: height / 2 - 30,
      items: [
        { id: 'retry', label: () => t().gameOver.retry, onSelect: () => this.restart() },
        { id: 'menu', label: () => t().gameOver.toTitle, onSelect: () => this.toTitle() },
        { id: 'settings', label: () => t().menu.settings, onSelect: () => this.openSettings() },
      ],
    });

    this.add
      .text(
        centerX,
        height - 28,
        prefersTouchControls() ? t().gameOver.hintTouch : t().gameOver.hintKeyboard,
        { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: COLORS.muted },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
  }

  private restart(): void {
    const { onRestart } = this.payload;
    this.scene.stop();
    onRestart();
  }

  private toTitle(): void {
    // The dead run is still sitting there underneath; it goes too.
    this.scene.stop(SCENES.game);
    this.scene.start(SCENES.menu);
  }

  private openSettings(): void {
    this.scene.pause();
    this.scene.launch(SCENES.settings, {
      allowLanguage: false,
      onClose: (languageChanged = false) => {
        this.scene.resume();
        if (languageChanged) {
          this.scene.restart();
          return;
        }
        this.menu.refresh();
      },
    });
  }
}
