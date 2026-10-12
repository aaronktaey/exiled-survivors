import Phaser from 'phaser';

import { COLORS, DEPTH, MENU, SCENES, TEXTURES } from '@/config';
import { PATCH_NOTES } from '@/content/patchNotes';
import { t } from '@/i18n';
import { bgm } from '@/systems/Bgm';
import { MenuList } from '@/systems/MenuList';
import { saveGame } from '@/systems/SaveGame';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

/** Title screen: the logo, and the four ways out of it. */
export class MenuScene extends Phaser.Scene {
  public static readonly KEY = SCENES.menu;

  private menu!: MenuList;

  public constructor() {
    super(MenuScene.KEY);
  }

  public create(): void {
    const { width, height } = this.scale;

    this.add.tileSprite(0, 0, width, height, TEXTURES.grid).setOrigin(0, 0).setDepth(DEPTH.ground);
    this.add.rectangle(0, 0, width, height, 0x05070b, 0.55).setOrigin(0, 0).setDepth(DEPTH.ground + 1);

    this.addLogo(width, 118);

    const saved = saveGame.read();
    this.menu = new MenuList(this, {
      x: width / 2,
      y: 236,
      items: [
        { id: 'start', label: () => t().menu.start, onSelect: () => this.startRun() },
        {
          id: 'load',
          label: () => t().menu.load,
          detail: () => (saved ? saveGame.describe(saved) : t().menu.noSave),
          enabled: () => saved !== null,
          onSelect: () => this.startRun(true),
        },
        { id: 'settings', label: () => t().menu.settings, onSelect: () => this.openOverlay(SCENES.settings) },
        {
          id: 'guide',
          label: () => t().menu.guide,
          onSelect: () => this.openOverlay(SCENES.info, { topic: 'guide' }),
        },
        {
          id: 'patch',
          label: () => t().menu.patch,
          detail: () => `v${PATCH_NOTES[0]?.version ?? ''}`,
          onSelect: () => this.openOverlay(SCENES.info, { topic: 'patch' }),
        },
        { id: 'credits', label: () => t().menu.credits, onSelect: () => this.openOverlay(SCENES.credits) },
      ],
    });

    this.add
      .text(
        width / 2,
        height - 26,
        prefersTouchControls() ? t().menu.hintTouch : t().menu.hintKeyboard,
        { fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: COLORS.muted },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    // The track is multi-megabyte, so it arrives a moment after the menu.
    bgm.start(this);
  }

  /** The pixel logo, drifting slowly up and down. */
  private addLogo(width: number, y: number): void {
    const logo = this.add.image(width / 2, y, TEXTURES.logo).setDepth(DEPTH.ui);

    this.tweens.add({
      targets: logo,
      y: y + MENU.logoBobPx,
      duration: MENU.logoBobMs,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });

    this.add
      .text(width / 2, y + logo.displayHeight / 2 + 26, t().menu.byline, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '15px',
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);
  }

  private startRun(fromSave = false): void {
    this.scene.start(SCENES.game, { save: fromSave ? saveGame.read() : null });
  }

  /** The other screens sit on top; the menu waits, deaf, underneath. */
  private openOverlay(key: string, extra: object = {}): void {
    this.scene.pause();
    this.scene.launch(key, {
      ...extra,
      onClose: (languageChanged = false) => {
        this.scene.resume();
        // A new language means new text everywhere, so build it again.
        if (languageChanged) {
          this.scene.restart();
          return;
        }
        this.menu.refresh();
      },
    });
  }
}
