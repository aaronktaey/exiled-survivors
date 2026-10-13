import Phaser from 'phaser';

import { COLORS, DEPTH, MENU, SCENES, SCRIM, TEXT, TEXTURES } from '@/config';
import { PATCH_NOTES } from '@/content/patchNotes';
import { gearName, t } from '@/i18n';
import { bgm } from '@/systems/Bgm';
import { gear } from '@/systems/Gear';
import { MenuList } from '@/systems/MenuList';
import { saveGame } from '@/systems/SaveGame';
import { centredTop } from '@/systems/Layout';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

/** How many rows the title lists, for centring it before they are built. */
const ROW_COUNT = 6;

/** Title screen: the logo, and the ways out of it. */
export class MenuScene extends Phaser.Scene {
  public static readonly KEY = SCENES.menu;

  private menu!: MenuList;

  public constructor() {
    super(MenuScene.KEY);
  }

  public create(): void {
    const { width, height } = this.scale;

    this.add.tileSprite(0, 0, width, height, TEXTURES.grid).setOrigin(0, 0).setDepth(DEPTH.ground);
    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.title).setOrigin(0, 0).setDepth(DEPTH.ground + 1);

    // Logo, byline and rows are one block, centred in whatever is there.
    const listHeight = ROW_COUNT * (MENU.buttonHeight + MENU.buttonGap) - MENU.buttonGap;
    // Six rows under the logo only just fit a 540-tall canvas, so a short
    // one closes the gap rather than pushing the last row into the hint.
    const gap = height < MENU.shortHeight ? MENU.logoGapShort : MENU.logoGap;
    const top = centredTop(height, MENU.logoBlockHeight + gap + listHeight);

    this.addLogo(width, top + MENU.logoHeight / 2);

    const saved = saveGame.read();
    this.menu = new MenuList(this, {
      x: width / 2,
      y: top + MENU.logoBlockHeight + gap + MENU.buttonHeight / 2,
      items: [
        { id: 'start', label: () => t().menu.start, onSelect: () => this.onStart() },
        {
          id: 'load',
          label: () => t().menu.load,
          detail: () => (saved ? saveGame.describe(saved) : t().menu.noSave),
          enabled: () => saved !== null,
          onSelect: () => this.startRun(true),
        },
        {
          id: 'gear',
          label: () => t().menu.gear,
          detail: () => gearName(gear.equipped.id),
          onSelect: () => this.openOverlay(SCENES.gear),
        },
        {
          id: 'settings',
          // Always "Settings", like the Language row it leads to.
          label: () => 'Settings',
          onSelect: () => this.openOverlay(SCENES.settings, { allowLanguage: true }),
        },
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
      ],
    });

    this.add
      .text(
        width / 2,
        height - 26,
        prefersTouchControls() ? t().menu.hintTouch : t().menu.hintKeyboard,
        { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    // The track is multi-megabyte, so it arrives a moment after the menu.
    bgm.start(this);
  }

  /** The pixel logo, drifting slowly up and down. */
  private addLogo(width: number, y: number): void {
    const logo = this.add.image(width / 2, y, TEXTURES.logo).setDepth(DEPTH.ui);

    // It is baked at a fixed pixel size, which is wider than a phone.
    const room = width - MENU.logoMargin * 2;
    if (logo.width > room) {
      logo.setScale(room / logo.width);
    }

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
        fontSize: TEXT.size.body,
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);
  }

  /**
   * A new run would throw away whatever is saved, so when there is one it
   * asks first — and offers to carry on with it instead, which is usually
   * what the button was reaching for.
   */
  private onStart(): void {
    const saved = saveGame.read();
    if (!saved) {
      this.startRun();
      return;
    }

    this.scene.pause();
    this.scene.launch(SCENES.confirm, {
      detail: saveGame.describe(saved),
      onConfirm: () => {
        saveGame.clear();
        this.scene.resume();
        this.startRun();
      },
      onLoad: () => {
        this.scene.resume();
        this.startRun(true);
      },
      onCancel: () => {
        this.scene.resume();
        this.menu.refresh();
      },
    });
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
