import Phaser from 'phaser';

import { COLORS, DEPTH, GAME_OVER, MENU, RANKING, SCENES, SCRIM, TEXT, type BoneId } from '@/config';
import { BoneScene } from '@/scenes/BoneScene';
import { enemyName, fill, t } from '@/i18n';
import { centredTop, fitText, fitWidth } from '@/systems/Layout';
import { MenuList } from '@/systems/MenuList';
import { ranking } from '@/systems/Ranking';
import type { RunSummary } from '@/systems/RunStats';
import type { RankEntryData } from '@/scenes/RankEntryScene';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import type { RunDetail } from '@/systems/Ranking';

export interface GameOverData {
  /** What the run amounted to, read out as a table. */
  readonly summary: RunSummary;
  readonly level: number;
  readonly survivedMs: number;
  /** The developer tools changed this run: it is not offered to the ranking. */
  readonly devRun?: boolean;
  /** Which of them, said on the screen so a record that is not offered is not a mystery. */
  readonly devReason?: 'debug' | 'draft';
  /** The run's main skill, shown beside it on the board. */
  readonly mainSkill?: string;
  /** 판 내역, handed in with the run for the admin's review. */
  readonly detail?: RunDetail;
  /** Starts another run, with the 뼈다귀 picked for it. */
  readonly onRestart: (applied: readonly BoneId[]) => void;
}

/** "12,345" — thousands marked, because the damage number gets long. */
const grouped = (value: number): string => Math.round(value).toLocaleString('en-US');

/** Whole numbers where they are whole, one decimal where they are not. */
const round = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/**
 * End-of-run screen: what the run amounted to, and the three ways on —
 * another run, the title, or the options.
 *
 * The table is built before anything is placed, because how tall it comes
 * out depends on how many enemy kinds were met and how many skills were
 * carried, and a line of either can wrap. It is measured, and then the whole
 * block is centred around it.
 */
export class GameOverScene extends Phaser.Scene {
  public static readonly KEY = SCENES.gameOver;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;

  private payload!: GameOverData;
  /** This screen's list of choices. Public so a test can drive it. */
  public menu!: MenuList;
  /** The table, so a test can read what the run was told it did. */
  public table!: Phaser.GameObjects.Container;
  /**
   * The place each run took on the board, by its summary. Kept on the
   * instance rather than reset in init: the screen is rebuilt when the
   * language changes, and must not offer the same run up a second time.
   */
  private readonly entered = new WeakMap<RunSummary, number>();

  public constructor() {
    super(GameOverScene.KEY);
  }

  public init(data: GameOverData): void {
    this.payload = data;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.toTitle());
    const { width, height } = this.scale;
    const centerX = width / 2;

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.gameOver).setOrigin(0, 0).setDepth(DEPTH.ui);

    // A run that made the board gets a row for entering it, and asks once
    // on its own as the screen opens.
    const qualifies = !this.payload.devRun && ranking.qualifies(this.payload.summary.damage);
    const rowCount = qualifies ? 4 : 3;

    // Built first, measured, then everything is centred around it.
    const tableHeight = this.buildTable(width);
    const rows = rowCount * (MENU.buttonHeight + MENU.buttonGap) - MENU.buttonGap;
    const top = centredTop(height, GAME_OVER.headHeight + tableHeight + GAME_OVER.tableGap + rows);

    const total = Math.floor(this.payload.survivedMs / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');

    fitText(
      this.add
        .text(centerX, top + 28, t().gameOver.title, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hero,
          color: COLORS.accent,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width,
    );

    this.add
      .text(
        centerX,
        top + 70,
        fill(t().gameOver.survived, { time: `${mm}:${ss}`, level: this.payload.level }),
        { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.heading, color: COLORS.text },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.table.setPosition(centerX, top + GAME_OVER.headHeight);

    this.menu = new MenuList(this, {
      x: centerX,
      y: top + GAME_OVER.headHeight + tableHeight + GAME_OVER.tableGap + MENU.buttonHeight / 2,
      items: [
        { id: 'retry', label: () => t().gameOver.retry, onSelect: () => this.restart() },
        { id: 'menu', label: () => t().gameOver.toTitle, onSelect: () => this.toTitle() },
        { id: 'settings', label: () => t().menu.settings, onSelect: () => this.openSettings() },
        ...(qualifies
          ? [
              {
                id: 'rank',
                label: () => {
                  const place = this.entered.get(this.payload.summary) ?? 0;
                  return place > 0 ? fill(t().ranking.registered, { place }) : t().ranking.register;
                },
                enabled: () => !this.entered.has(this.payload.summary),
                onSelect: () => this.openEntry(),
              },
            ]
          : []),
      ],
    });

    // A run the developer tools touched is on neither board, and says why —
    // an admin with a 밸런스 experiment left on once set a record and was
    // never asked for a name.
    if (this.payload.devRun) {
      const why = this.payload.devReason === 'draft' ? t().gameOver.devRunDraft : t().gameOver.devRunDebug;
      fitText(
        this.add
          .text(centerX, height - 54, why, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.suspectText })
          .setOrigin(0.5)
          .setDepth(DEPTH.ui + 1)
          .setName('devRunNote'),
        width,
        8,
      );
    }

    this.add
      .text(
        centerX,
        height - 28,
        prefersTouchControls() ? t().gameOver.hintTouch : t().gameOver.hintKeyboard,
        { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    if (qualifies && RANKING.promptOnDeath && !this.entered.has(this.payload.summary)) {
      this.time.delayedCall(450, () => this.openEntry());
    }
  }

  /**
   * Asks for a name over this screen, which waits underneath — paused, so
   * a key pressed for the name does not also pick a row here.
   */
  private openEntry(): void {
    if (this.entered.has(this.payload.summary) || !this.scene.isActive()) {
      return;
    }

    const { summary, level, survivedMs } = this.payload;
    const data: RankEntryData = {
      run: { damage: summary.damage, level, survivedMs, skill: this.payload.mainSkill ?? '', detail: this.payload.detail },
      onDone: (place) => {
        this.scene.resume();
        if (place > 0) {
          this.entered.set(summary, place);
        }
        this.menu.refresh();
      },
    };
    this.scene.pause();
    this.scene.launch(SCENES.rankEntry, data);
    this.scene.bringToTop(SCENES.rankEntry);
  }

  /**
   * The run as a table, inside a container whose own origin is the middle of
   * its top edge. Returns how tall it came out.
   *
   * Three figures with a label on the left and a number on the right, then
   * what was killed and what was carried — both of which are a list and so
   * are set as one wrapped, centred line each.
   */
  private buildTable(screenWidth: number): number {
    const copy = t().gameOver;
    const { summary } = this.payload;
    const half = fitWidth(GAME_OVER.tableWidth, screenWidth) / 2;

    this.table = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    let y = 0;

    const figure = (label: string, value: string): void => {
      this.table.add(
        this.add
          .text(-half, y, label, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: TEXT.size.small,
            color: COLORS.muted,
          })
          .setOrigin(0, 0),
      );
      this.table.add(
        this.add
          .text(half, y, value, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: TEXT.size.small,
            color: COLORS.text,
          })
          .setOrigin(1, 0),
      );
      y += GAME_OVER.lineHeight;
    };

    const wrapped = (text: string, colour: string): void => {
      if (!text) {
        return;
      }

      const line = this.add
        .text(0, y, text, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: colour,
          align: 'center',
          lineSpacing: 3,
          wordWrap: { width: half * 2 },
        })
        .setOrigin(0.5, 0);
      this.table.add(line);
      y += line.height + GAME_OVER.wrapGap;
    };

    figure(copy.damageDealt, grouped(summary.damage));
    figure(copy.killsDealt, grouped(summary.kills));
    figure(copy.goldEarned, `+${grouped(summary.gold)}`);
    if (summary.accountXp !== undefined && summary.accountLevel !== undefined) {
      figure(copy.accountXp, fill(copy.accountXpValue, { xp: grouped(summary.accountXp), level: summary.accountLevel }));
    }

    y += GAME_OVER.wrapGap;
    wrapped(
      summary.byKind.map((entry) => `${enemyName(entry.kind)} ${entry.count}`).join('   '),
      COLORS.muted,
    );
    wrapped(
      summary.skills
        .map((line) =>
          fill(copy.skillLine, { skill: line.name, level: line.level, dps: round(line.dps) }),
        )
        .join('   '),
      COLORS.text,
    );

    return y;
  }

  private restart(): void {
    // Another run is a fresh run: it stops at the 뼈다귀 first, the same as
    // 게임 시작. Backing out of that comes back here.
    const { onRestart } = this.payload;
    BoneScene.before(
      this,
      (applied) => {
        this.scene.stop();
        onRestart(applied);
      },
      () => this.menu.refresh(),
    );
  }

  private toTitle(): void {
    // The dead run is still sitting there underneath; it goes too.
    this.scene.stop(SCENES.game);
    this.scene.start(SCENES.menu);
  }

  private openSettings(): void {
    this.scene.pause();
    // Scenes render in the order the game added them, not the order they
    // were opened — without this, 설정 draws under the screen that opened it.
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
    this.scene.bringToTop(SCENES.settings);
  }
}
