import Phaser from 'phaser';

import {
  ACCOUNT,
  COLORS,
  DEPTH,
  LIVE_UPDATE,
  MENU,
  SCENES,
  SCRIM,
  TEXT,
  TEXTURES,
} from '@/config';
import { PATCH_NOTES } from '@/content/patchNotes';
import { fill, t } from '@/i18n';
import { bgm } from '@/systems/Bgm';
import { IconBar } from '@/systems/IconBar';
import { BoneScene } from '@/scenes/BoneScene';
import { orbs } from '@/systems/Orbs';
import { passives } from '@/systems/Passives';
import { MenuList } from '@/systems/MenuList';
import { saveGame } from '@/systems/SaveGame';
import { centredTop, fitText } from '@/systems/Layout';
import { flagTexture, rankLabel, ranking } from '@/systems/Ranking';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { account } from '@/systems/Account';
import { cloudSave } from '@/systems/CloudSave';
import { takePendingRank } from '@/systems/PendingRank';
import { liveUpdate } from '@/systems/LiveUpdate';

/** Syncing starts once per page, the first time the title finds someone signed in. */
let syncStarted = false;

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
  private championFlag?: Phaser.GameObjects.Image;
  /** Reloading onto a new version: the title takes no more input. */
  public updating = false;
  /** "새 버전으로 업데이트합니다…", while it is. Public for tests. */
  public updatingText?: Phaser.GameObjects.Text;

  public constructor() {
    super(MenuScene.KEY);
  }

  public init(): void {
    // The scene outlives a launch.
    this.updating = false;
    this.updatingText = undefined;
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
    // The line is kept even before anyone is on the board: the shared board
    // arrives a moment later, and the menu must not jump when it does.
    const blockHeight = MENU.logoBlockHeight + MENU.championGap;
    const top = centredTop(height, blockHeight + gap + listHeight);

    this.addLogo(width, top + MENU.logoHeight / 2);

    const saved = saveGame.read();
    this.menu = new MenuList(this, {
      keysElsewhere: () => this.icons?.hasFocus === true,
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
      ...(ACCOUNT.enabled
        ? [
            {
              id: 'account',
              texture: TEXTURES.account,
              label: () => (account.signedIn ? t().account.iconSignedIn : t().account.iconSignedOut),
              // Two sets of records waiting for a choice.
              badge: () => cloudSave.conflict !== null,
              onSelect: () => this.openOverlay(SCENES.account),
            },
          ]
        : []),
    ]);

    const unwatchAccount = account.onChange(() => this.icons.refresh());
    const unwatchSync = cloudSave.onChange(() => this.icons.refresh());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unwatchAccount();
      unwatchSync();
    });
    void this.settleAccount();

    // A newer version: taken here, on the title with nothing open, never mid-run.
    const offerUpdate = (): void => {
      if (!this.updating && liveUpdate.safeNow(this.game)) {
        this.applyUpdate();
      }
    };
    const unwatchUpdate = liveUpdate.onPending(offerUpdate);
    this.events.on(Phaser.Scenes.Events.RESUME, offerUpdate);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unwatchUpdate();
      this.events.off(Phaser.Scenes.Events.RESUME, offerUpdate);
    });
    this.time.delayedCall(0, offerUpdate);

    // The track is multi-megabyte, so it arrives a moment after the menu.
    bgm.start(this);
  }

  /** Says so, takes no more input, and reloads onto the new version. */
  private applyUpdate(): void {
    this.updating = true;
    const { width, height } = this.scale;
    this.add
      .rectangle(0, 0, width, height, 0x05070b, 0.75)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ui + 50)
      .setInteractive();
    this.updatingText = this.add
      .text(width / 2, height / 2, t().menu.updating, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 51);
    this.input.keyboard?.removeAllListeners();
    this.time.delayedCall(LIVE_UPDATE.noticeMs, () => liveUpdate.apply());
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
   * First place on the board, under the logo — the run to beat, with its
   * flag. Tapping it opens the board. Empty until someone has set one, and
   * redrawn when the shared board arrives with a different first place.
   */
  private addChampion(width: number, y: number): void {
    this.champion = this.add
      .text(width / 2, y, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.gearText,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui)
      .setInteractive({ useHandCursor: true });
    this.champion.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.openOverlay(SCENES.ranking));
    this.championFlag = this.add.image(0, y, '__DEFAULT').setDepth(DEPTH.ui).setVisible(false);

    const draw = () => this.drawChampion(width);
    draw();
    const unwatch = ranking.onChange(draw);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unwatch);
    void ranking.refresh();
  }

  private drawChampion(width: number): void {
    const label = this.champion;
    const flag = this.championFlag;
    if (!label || !flag || !label.active) {
      return;
    }

    const first = ranking.first;
    label.setScale(1).setText(
      first
        ? fill(t().ranking.champion, {
            name: rankLabel(first),
            damage: Math.round(first.damage).toLocaleString('en-US'),
          })
        : '',
    );
    fitText(label, width - 80);
    flag.setVisible(Boolean(first?.flag));
    if (first?.flag) {
      flag.setTexture(flagTexture(first.flag)).setDisplaySize(24, 16);
      // The flag sits just ahead of the line, which moves right to make room.
      const total = label.displayWidth + 30;
      label.setX(width / 2 + 15);
      flag.setPosition(width / 2 - total / 2 + 12, label.y);
    } else {
      label.setX(width / 2);
    }
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
    if (fromSave) {
      this.scene.start(SCENES.game, { save: saveGame.read(), startPick: false });
      return;
    }

    BoneScene.before(
      this,
      (applied) => this.scene.start(SCENES.game, { save: null, bones: applied, startPick: true }),
      () => this.menu.refresh(),
    );
  }

  /**
   * Who is signed in, and what coming back from a provider brings with it:
   * records to sync, a word on how the sign-in went, a run waiting to go on
   * the ranking, or two sets of records to choose between.
   */
  private async settleAccount(): Promise<void> {
    if (!ACCOUNT.enabled) {
      return;
    }
    await account.refresh();
    if (!this.scene.isActive() && !this.scene.isPaused()) {
      return;
    }
    if (account.user && !syncStarted) {
      syncStarted = true;
      await cloudSave.start();
    }
    this.icons.refresh();

    const copy = t().account;
    const outcome = account.outcome;
    account.outcome = null;
    if (outcome) {
      this.toast(outcome === 'ok' ? copy.loginOk : outcome === 'cancelled' ? copy.loginCancelled : copy.loginError);
    }

    const pending = takePendingRank();
    if (pending && account.user) {
      await ranking.refresh();
      ranking.submit(pending);
      this.toast(t().ranking.enteredAfterLogin);
      this.openOverlay(SCENES.ranking);
      return;
    }
    if (cloudSave.conflict && this.scene.isActive()) {
      this.openOverlay(SCENES.conflict);
    }
  }

  /** A line that rises over the hint and fades — how the title says something happened. */
  private toast(text: string): void {
    const { width, height } = this.scale;
    const line = this.add
      .text(width / 2, height - 64, text, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.gearText,
        backgroundColor: '#141924',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 10);
    fitText(line, width);
    this.tweens.add({
      targets: line,
      y: line.y - 16,
      alpha: 0,
      delay: 2400,
      duration: 700,
      onComplete: () => line.destroy(),
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
