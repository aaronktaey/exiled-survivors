import Phaser from 'phaser';

import {
  COLORS,
  DEPTH,
  ENEMY_KINDS,
  GAME_OVER,
  MENU,
  RANKING,
  SCENES,
  SCRIM,
  SKILL_ICONS,
  TEXT,
  TEXTURES,
  type BoneId,
} from '@/config';
import { guideValues } from '@/content/guide';
import { BoneScene } from '@/scenes/BoneScene';
import { fill, t } from '@/i18n';
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
  /**
   * The run's levels did not come to what it counted gaining (RunTally): it
   * is not offered to the ranking, and the screen does not say why (0.91).
   */
  readonly refused?: boolean;
  /** Which of them, said on the screen so a record that is not offered is not a mystery. */
  readonly devReason?: 'debug' | 'draft';
  /** The run's main skill, shown beside it on the board. */
  readonly mainSkill?: string;
  /** 판 내역, handed in with the run for the admin's review. */
  readonly detail?: RunDetail;
  /** Starts another run, with the 뼈다귀 picked for it. */
  readonly onRestart: (applied: readonly BoneId[]) => void;
}

/** "12,345" — thousands marked, because the score gets long. */
const grouped = (value: number): string => Math.round(value).toLocaleString('en-US');

/** "8,420", "12.3K", "4.56M" — short enough for a skill's cell. */
const compact = (value: number): string => {
  const whole = Math.round(value);
  // From just under the next unit up, so 999,999 reads 1M, not 1000K.
  for (const [size, unit, mark] of [[999.5e6, 1e9, 'B'], [999.5e3, 1e6, 'M'], [1e4, 1e3, 'K']] as const) {
    if (whole >= size) {
      const shown = whole / unit;
      return `${shown >= 100 ? Math.round(shown) : Number(shown.toPrecision(3))}${mark}`;
    }
  }
  return grouped(whole);
};

/**
 * End-of-run screen (0.116, the user's ask: fewer words, more to see): the
 * score large, what each enemy kind added to it as one bar with each kind's
 * picture and count under it, the skills as icons with a bar of what each dealt, a tip
 * at random, and the ways on — another run, the title, the options, and the
 * ranking when the run made it.
 *
 * Lying down (GAME_OVER.wideFrom) the run's figures take the left and the
 * tip and the buttons the right; upright, one under the other. Each block is
 * built first and measured, and the whole is centred around it.
 */
export class GameOverScene extends Phaser.Scene {
  public static readonly KEY = SCENES.gameOver;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;

  private payload!: GameOverData;
  /** This screen's list of choices. Public so a test can drive it. */
  public menu!: MenuList;
  /** The run's figures, so a test can read what the run was told it did. */
  public table!: Phaser.GameObjects.Container;
  /** The tip shown under it, so a test can read it. */
  public tipText!: Phaser.GameObjects.Text;
  /**
   * The place each run took on the board, by its summary. Kept on the
   * instance rather than reset in init: the screen is rebuilt when the
   * language changes, and must not offer the same run up a second time.
   */
  private readonly entered = new WeakMap<RunSummary, number>();
  /** The tip each run was shown, so a rebuild (a language change) keeps it. */
  private readonly tipFor = new WeakMap<RunSummary, number>();

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
    const wide = width >= GAME_OVER.wideFrom;

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.gameOver).setOrigin(0, 0).setDepth(DEPTH.ui);

    // A run that made the board gets a row for entering it, and asks once
    // on its own as the screen opens.
    const qualifies = !this.payload.devRun && !this.payload.refused && ranking.qualifies(this.payload.summary.score);
    const rowCount = qualifies ? 4 : 3;
    const rows = rowCount * (MENU.buttonHeight + MENU.buttonGap) - MENU.buttonGap;

    // The columns: one, or the figures on the left and the rest on the right.
    const sideWidth = wide ? Math.min(MENU.buttonWidth, (width - GAME_OVER.columnGap - 48) * 0.42) : fitWidth(GAME_OVER.tableWidth, width);
    const figuresWidth = wide ? Math.min(GAME_OVER.tableWidth + 40, width - sideWidth - GAME_OVER.columnGap - 48) : sideWidth;
    const figuresX = wide ? centerX - (sideWidth + GAME_OVER.columnGap) / 2 : centerX;
    const sideX = wide ? centerX + (figuresWidth + GAME_OVER.columnGap) / 2 : centerX;

    const figuresHeight = this.buildFigures(figuresWidth);
    const tip = this.buildTip(sideWidth);
    const sideHeight = tip.height + GAME_OVER.tableGap + rows;
    const bodyHeight = wide ? Math.max(figuresHeight, sideHeight) : figuresHeight + GAME_OVER.tableGap + sideHeight;
    const top = centredTop(height, GAME_OVER.headHeight + bodyHeight);
    const bodyTop = top + GAME_OVER.headHeight;

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
      .text(centerX, top + 70, fill(t().gameOver.survived, { time: `${mm}:${ss}`, level: this.payload.level }), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.heading,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.table.setPosition(figuresX, wide ? bodyTop + Math.max(0, (sideHeight - figuresHeight) / 2) : bodyTop);
    const sideTop = wide ? bodyTop + Math.max(0, (figuresHeight - sideHeight) / 2) : bodyTop + figuresHeight + GAME_OVER.tableGap;
    tip.setPosition(sideX, sideTop);

    this.menu = new MenuList(this, {
      x: sideX,
      y: sideTop + tip.height + GAME_OVER.tableGap + MENU.buttonHeight / 2,
      width: sideWidth,
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

    fitText(
      this.add
        .text(centerX, height - 28, prefersTouchControls() ? t().gameOver.hintTouch : t().gameOver.hintKeyboard, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width,
      8,
    );

    if (qualifies && RANKING.promptOnDeath && !this.entered.has(this.payload.summary)) {
      this.time.delayedCall(450, () => this.openEntry());
    }
  }

  /**
   * Asks for a name over this screen, which waits underneath — paused, so
   * a key pressed for the name does not also pick a row here. The board's
   * number is the run's score (0.116; still `damage` on the wire).
   */
  private openEntry(): void {
    if (this.entered.has(this.payload.summary) || !this.scene.isActive()) {
      return;
    }

    const { summary, level, survivedMs } = this.payload;
    const data: RankEntryData = {
      run: { damage: summary.score, level, survivedMs, skill: this.payload.mainSkill ?? '', detail: this.payload.detail },
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
   * The run's figures, in a container whose own origin is the middle of its
   * top edge: the score, the kinds' bar and pictures, the skills' icons.
   * Returns how tall it came out.
   */
  private buildFigures(width: number): number {
    const copy = t().gameOver;
    const { summary } = this.payload;
    const half = width / 2;
    const text = (x: number, y: number, value: string, size: string, color: string, originX = 0.5): Phaser.GameObjects.Text => {
      const label = this.add.text(x, y, value, { fontFamily: 'system-ui, sans-serif', fontSize: size, color }).setOrigin(originX, 0);
      this.table.add(label);
      return label;
    };

    this.table = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    let y = 0;

    // The score, large, with its label and the kills under it.
    text(0, y, copy.damageDealt, TEXT.size.small, COLORS.muted);
    y += 20;
    const score = text(0, y, `★ ${grouped(summary.score)}`, TEXT.size.banner, COLORS.gearText);
    fitText(score, width, 0);
    y += score.displayHeight + 2;
    text(0, y, fill(copy.scoreCaption, { kills: grouped(summary.kills) }), TEXT.size.hint, COLORS.muted);
    y += 22 + GAME_OVER.blockGap;

    // What each kind added: one bar, a share each, in the kind's colour.
    if (summary.byKind.length > 0) {
      text(-half, y, copy.killsTitle, TEXT.size.hint, COLORS.muted, 0);
      y += 20;
      const bar = this.add.graphics();
      this.table.add(bar);
      bar.fillStyle(0x1b2230, 1).fillRect(-half, y, width, GAME_OVER.barHeight);
      const sum = summary.byKind.reduce((total, entry) => total + entry.score, 0);
      let x = -half;
      for (const entry of summary.byKind) {
        if (sum <= 0) {
          break;
        }
        const share = (entry.score / sum) * width;
        bar.fillStyle(ENEMY_KINDS[entry.kind]?.color ?? 0x888888, 1).fillRect(x, y, Math.max(0, share - 1), GAME_OVER.barHeight);
        x += share;
      }
      y += GAME_OVER.barHeight + 8;
      y += this.lay(
        summary.byKind.map((entry) => ({
          texture: ENEMY_KINDS[entry.kind]?.texture,
          color: ENEMY_KINDS[entry.kind]?.color ?? 0x888888,
          label: `×${grouped(entry.count)}`,
        })),
        y,
        width,
      );
      y += GAME_OVER.blockGap;
    }

    // The skills: an icon each, its level, and a bar for what it dealt against the best of them.
    if (summary.skills.length > 0) {
      text(-half, y, copy.skillsTitle, TEXT.size.hint, COLORS.muted, 0);
      y += 22;
      const best = Math.max(1, ...summary.skills.map((line) => line.damage));
      const cell = GAME_OVER.skillCell;
      const perRow = Math.max(1, Math.floor(width / cell));
      const rowsOf = Math.ceil(summary.skills.length / perRow);
      const cellHeight = GAME_OVER.skillIcon + 44;
      summary.skills.forEach((line, index) => {
        const row = Math.floor(index / perRow);
        const inRow = Math.min(perRow, summary.skills.length - row * perRow);
        const cx = -(inRow * cell) / 2 + cell / 2 + (index % perRow) * cell;
        const cy = y + row * cellHeight;
        const key = SKILL_ICONS[line.id]?.key ?? TEXTURES.skillOrb;
        this.table.add(this.add.image(cx, cy + GAME_OVER.skillIcon / 2, key).setDisplaySize(GAME_OVER.skillIcon, GAME_OVER.skillIcon));
        text(cx, cy + GAME_OVER.skillIcon + 2, `Lv ${line.level}`, TEXT.size.hint, COLORS.text);
        const { width: barWidth, height: barHeight } = GAME_OVER.skillBar;
        const graph = this.add.graphics();
        this.table.add(graph);
        const by = cy + GAME_OVER.skillIcon + 22;
        graph.fillStyle(0x1b2230, 1).fillRect(cx - barWidth / 2, by, barWidth, barHeight);
        graph.fillStyle(COLORS.accentFill, 1).fillRect(cx - barWidth / 2, by, barWidth * (line.damage / best), barHeight);
        text(cx, by + barHeight + 2, compact(line.damage), TEXT.size.hint, COLORS.muted).setName(`damage:${line.id}`);
      });
      y += rowsOf * cellHeight;
    }

    return y;
  }

  /**
   * A row of pictures, each with its count beside it and a stroke of its
   * colour under it (the bar's colour above), centred and wrapped to
   * `width`. Returns how tall it came out.
   */
  private lay(chips: readonly { texture?: string; color: number; label: string }[], top: number, width: number): number {
    const size = GAME_OVER.kindIcon;
    const built = chips.map((chip) => {
      const label = this.add
        .text(0, 0, chip.label, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text })
        .setOrigin(0, 0.5);
      return { chip, label, span: size + 4 + label.width };
    });
    const lines: (typeof built)[] = [[]];
    let used = 0;
    for (const item of built) {
      const need = item.span + (lines[lines.length - 1]!.length > 0 ? GAME_OVER.kindGap : 0);
      if (used + need > width && lines[lines.length - 1]!.length > 0) {
        lines.push([]);
        used = 0;
      }
      used += item.span + (lines[lines.length - 1]!.length > 0 ? GAME_OVER.kindGap : 0);
      lines[lines.length - 1]!.push(item);
    }
    const lineHeight = size + 8;
    lines.forEach((line, row) => {
      const span = line.reduce((total, item) => total + item.span, 0) + GAME_OVER.kindGap * Math.max(0, line.length - 1);
      let x = -span / 2;
      const cy = top + row * lineHeight + size / 2;
      for (const item of line) {
        if (item.chip.texture && this.textures.exists(item.chip.texture)) {
          this.table.add(this.add.image(x + size / 2, cy, item.chip.texture).setDisplaySize(size, size));
        }
        const stroke = this.add.graphics();
        stroke.fillStyle(item.chip.color, 1).fillRect(x, cy + size / 2 + 1, size, 3);
        this.table.add(stroke);
        item.label.setPosition(x + size + 4, cy);
        this.table.add(item.label);
        x += item.span + GAME_OVER.kindGap;
      }
    });
    return lines.length * lineHeight;
  }

  /**
   * One tip, at random (kept through a rebuild), on a panel: how to grow,
   * how to score more, and what the game does that a player may not know.
   * Its numbers are the guide's, read off the config.
   */
  private buildTip(width: number): Phaser.GameObjects.Container {
    const copy = t().gameOver;
    const { summary } = this.payload;
    const tips = copy.tips;
    let index = this.tipFor.get(summary);
    if (index === undefined || index >= tips.length) {
      index = Math.floor(Math.random() * tips.length);
      this.tipFor.set(summary, index);
    }
    const pad = GAME_OVER.tipPadding;
    const box = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    const head = this.add
      .text(-width / 2 + pad, pad, copy.tipTitle, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.accent })
      .setOrigin(0, 0);
    this.tipText = this.add
      .text(-width / 2 + pad, pad + head.height + 4, fill(tips[index] ?? '', guideValues()), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.text,
        lineSpacing: 3,
        wordWrap: { width: width - pad * 2, useAdvancedWrap: true },
      })
      .setOrigin(0, 0);
    const height = pad + head.height + 4 + this.tipText.height + pad;
    const panel = this.add
      .rectangle(0, 0, width, height, GAME_OVER.tipFill, 0.92)
      .setOrigin(0.5, 0)
      .setStrokeStyle(1, GAME_OVER.tipEdge, 1);
    box.add([panel, head, this.tipText]);
    box.setSize(width, height);
    return box;
  }

  /** Every tip as it would read, numbers filled in — for a test to check none is left unfilled. */
  public allTips(): string[] {
    const values = guideValues();
    return t().gameOver.tips.map((tip) => fill(tip, values));
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

