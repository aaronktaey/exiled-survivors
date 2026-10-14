import Phaser from 'phaser';

import {
  COLORS,
  DEPTH,
  MENU,
  SCENES,
  SCRIM,
  TEXT,
  TEXTURES,
  type BoneId,
} from '@/config';
import { PATCH_NOTES } from '@/content/patchNotes';
import { fill, t } from '@/i18n';
import { bgm } from '@/systems/Bgm';
import { IconBar } from '@/systems/IconBar';
import { bones } from '@/systems/Bones';
import { orbs } from '@/systems/Orbs';
import { passives } from '@/systems/Passives';
import { MenuList } from '@/systems/MenuList';
import { saveGame } from '@/systems/SaveGame';
import { centredTop, fitText } from '@/systems/Layout';
import { rankLabel, ranking } from '@/systems/Ranking';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

/** How many rows the title lists, for centring it before they are built. */
const ROW_COUNT = 5;

/** Title screen: the logo, and the ways out of it. */
export class MenuScene extends Phaser.Scene {
  public static readonly KEY = SCENES.menu;

  private menu!: MenuList;
  /** The corner icons. Public so a test can press one. */
  public icons!: IconBar;
  /** First place under the logo, when there is one. Public for tests. */
  public champion?: Phaser.GameObjects.Text;

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
    // First place on the board takes a line under the byline, once there is one.
    const blockHeight = MENU.logoBlockHeight + (ranking.first ? MENU.championGap : 0);
    const top = centredTop(height, blockHeight + gap + listHeight);

    this.addLogo(width, top + MENU.logoHeight / 2);

    const saved = saveGame.read();
    this.menu = new MenuList(this, {
      x: width / 2,
      y: top + blockHeight + gap + MENU.buttonHeight / 2,
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

    // 인벤토리 and 패시브 live in the corner rather than in the list: they are
    // where you go between runs, not a way out of the title.
    this.icons = new IconBar(this, [
      {
        id: 'gear',
        texture: TEXTURES.gear,
        label: () => t().menu.gear,
        // A 구슬 in the drawer is something to do in there, the same way a
        // point waiting is something to do in the tree.
        badge: () => orbs.total > 0,
        onSelect: () => this.openOverlay(SCENES.inventory),
      },
      {
        id: 'passives',
        texture: TEXTURES.passive,
        label: () => t().passives.title,
        badge: () => passives.value.points > 0,
        onSelect: () => this.openOverlay(SCENES.passives),
      },
      {
        id: 'ranking',
        texture: TEXTURES.trophy,
        label: () => t().ranking.icon,
        onSelect: () => this.openOverlay(SCENES.ranking),
      },
    ]);

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

    const bylineY = y + logo.displayHeight / 2 + 26;
    this.add
      .text(width / 2, bylineY, t().menu.byline, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    this.addChampion(width, bylineY + MENU.championGap);
  }

  /**
   * First place on the board, under the logo — the run to beat. Tapping it
   * opens the board. Nothing is drawn until someone has set one.
   */
  private addChampion(width: number, y: number): void {
    const first = ranking.first;
    this.champion = undefined;
    if (!first) {
      return;
    }

    this.champion = fitText(
      this.add
        .text(width / 2, y, fill(t().ranking.champion, {
          name: rankLabel(first),
          damage: Math.round(first.damage).toLocaleString('en-US'),
        }), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.body,
          color: COLORS.gearText,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui)
        .setInteractive({ useHandCursor: true }),
      width - 32,
    );
    this.champion.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.openOverlay(SCENES.ranking));
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
    this.scene.bringToTop(SCENES.confirm);
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

  /**
   * A fresh run stops at the 뼈다귀 screen first, when there is anything to
   * spend there. With an empty drawer the screen would be a page of nothing
   * between the button and the game, so it is skipped.
   */
  private startRun(fromSave = false): void {
    if (fromSave || bones.total === 0) {
      this.scene.start(SCENES.game, { save: fromSave ? saveGame.read() : null, startSlot: !fromSave });
      return;
    }

    this.scene.pause();
    this.scene.bringToTop(SCENES.bones);
    this.scene.launch(SCENES.bones, {
      onStart: (applied: readonly BoneId[]) => {
        this.scene.resume();
        this.scene.start(SCENES.game, { save: null, bones: applied, startSlot: true });
      },
      onCancel: () => {
        this.scene.stop(SCENES.bones);
        this.scene.resume();
        this.menu.refresh();
      },
    });
  }

  /** The other screens sit on top; the menu waits, deaf, underneath. */
  private openOverlay(key: string, extra: object = {}): void {
    this.scene.pause();
    this.scene.bringToTop(key);
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
        this.icons.refresh();
      },
    });
  }
}
