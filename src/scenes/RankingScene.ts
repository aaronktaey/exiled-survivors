import Phaser from 'phaser';

import { ACCOUNT, COLORS, DEPTH, RANKING, SCENES, SCRIM, TEXT, nextRankingReset, SKILL_ICONS, TEXTURES } from '@/config';
import { affixName, boneName, enemyName, fill, gearName, passiveName, skillName, t } from '@/i18n';
import type { AffixId, BoneId, EnemyKind, GearId, PassiveId } from '@/config';
import type { SkillId } from '@/weapons/skills';
import { account, accountRequest } from '@/systems/Account';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { devToolsAllowed } from '@/systems/DevAccess';
import { fitText } from '@/systems/Layout';
import { flagTexture, rankLabel, ranking, type RankEntry, type RunDetail } from '@/systems/Ranking';
import { personal } from '@/systems/PersonalBest';

export type RankingTab = 'shared' | 'personal';

export interface RankingSceneData {
  readonly onClose: () => void;
  /** A place to light up — the one a name was just entered at. */
  readonly highlight?: number;
  /** Which board to open on. 전체 랭킹 when left out. */
  readonly tab?: RankingTab;
}

/** "3:05" — a run's length. */
const clock = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/** "10/15" — the day a run ended, on this device's clock. */
const day = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : `${date.getMonth() + 1}/${date.getDate()}`;
};

/** "12,345" — thousands marked, because the damage number gets long. */
const grouped = (value: number): string => Math.round(value).toLocaleString('en-US');

/** One run on today's board as the admin's review sees it (server/ranking.ts ReviewRow). */
export interface ReviewRow {
  readonly entryId: number;
  readonly name: string;
  readonly damage: number;
  readonly level: number;
  readonly survivedMs: number;
  readonly at: string;
  readonly peers: number;
  readonly reference: number | null;
  readonly ratio: number | null;
  readonly outlier: boolean;
  readonly detail: RunDetail | null;
}

/** A board row and its review are the same run when they ended at the same moment for the same damage. */
const reviewKey = (row: { readonly at: string; readonly damage: number }): string => `${row.at}|${row.damage}`;

/** A name from a table, or the id itself when this build does not know it (a newer one handed it in). */
const named = <T extends string>(id: string, name: (id: T) => string): string => {
  try {
    const out = name(id as T);
    return out && out !== 'undefined' ? out : id;
  } catch {
    return id;
  }
};

const POPUP_BUTTON_W = 150;
const POPUP_BUTTON_H = 40;

const TITLE_Y = 34;
const TAB_W = 150;
const TAB_H = 30;
const TAB_GAP = 12;
const FOOTER = 52;
/** The least room between two columns, when the window is too narrow for more. */
const MIN_COLUMN_GAP = 10;
/** The gap between columns, as a share of the one that would fill the table's full width. */
const COLUMN_GAP_SHARE = 0.75;

/**
 * Where the tabs, the reset line, the column heads and the first row sit.
 * A tall window gets room to breathe; lying down, twenty rows still have to
 * fit about 540 px, so it is tighter there.
 */
const SPACING = {
  roomy: { tabsY: 82, resetY: 126, headY: 170, firstRow: 32, rowMax: 34 },
  tight: { tabsY: 72, resetY: 108, headY: 142, firstRow: 24, rowMax: 30 },
} as const;
const ROOMY_FROM = 700;

/** One cell of the table: what it draws, each piece at its offset from the cell's left edge. */
interface TableCell {
  readonly parts: { readonly obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text; readonly dx: number }[];
  readonly width: number;
}

/**
 * 랭킹 — the best runs by damage dealt, 1 to RANKING.size, one line each:
 * the place, the name with its emoji, and the damage.
 *
 * It is this device's board for now. The rows read from the store's `top`
 * and nothing else, so when the board is shared the screen does not change.
 */
export class RankingScene extends Phaser.Scene {
  public static readonly KEY = SCENES.ranking;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;
  /** One text per row on the board, best first. Public for tests. */
  public rows: Phaser.GameObjects.Text[][] = [];
  /** Which board is showing. Public so a test can switch it. */
  public tab: RankingTab = 'shared';
  /** The tab plates, by tab. Public so a test can press one. */
  public tabs = new Map<RankingTab, Phaser.GameObjects.Rectangle>();
  private tabLabels = new Map<RankingTab, Phaser.GameObjects.Text>();
  private heads?: Phaser.GameObjects.Container;
  /** "매일 오전 5시 초기화 · 3:12:05 남음", on the shared tab. Public for tests. */
  public resetLine?: Phaser.GameObjects.Text;
  /** The reset the line is counting down to. */
  private resetAt = 0;

  private payload!: RankingSceneData;
  private layout!: {
    tableWidth: number;
    rowHeight: number;
    fontSize: string;
    headY: number;
    firstRow: number;
  };
  /** Everything the board's rows draw, so they can be drawn again. */
  private board?: Phaser.GameObjects.Container;
  private note!: Phaser.GameObjects.Text;
  /** The account's own best, once it is known. */
  private mine = '';
  private loading = false;
  /**
   * 랭킹 검토 — the admin's only (devToolsAllowed): every run on today's
   * board with its 판 내역 and whether it looks out of line, by reviewKey.
   * Public so a test can read it.
   */
  public review = new Map<string, ReviewRow>();
  /** The run being read in the popup, and the popup. Public for tests. */
  public reading: ReviewRow | null = null;
  public popup?: Phaser.GameObjects.Container;
  /** The second ask before a run comes off the board. Public for tests. */
  public confirmBox?: Phaser.GameObjects.Container;
  /** The popup's body, for a test to read. */
  public popupText?: Phaser.GameObjects.Text;
  private reviewing = false;
  /** What the last removal said, under the board. */
  private reviewNote = '';

  public constructor() {
    super(RankingScene.KEY);
  }

  public init(data: RankingSceneData): void {
    this.payload = data;
    this.rows = [];
    this.tab = data.tab ?? 'shared';
    this.tabs = new Map();
    this.tabLabels = new Map();
    this.resetLine = undefined;
    this.resetAt = 0;
    // The scene outlives a launch, and someone else may be signed in now.
    this.mine = '';
    this.review = new Map();
    this.reading = null;
    this.popup = undefined;
    this.confirmBox = undefined;
    this.popupText = undefined;
    this.reviewNote = '';
    this.reviewing = false;
  }

  public create(): void {
    this.reviewing = devToolsAllowed() && RANKING.shared.enabled;
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    const copy = t().ranking;

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);

    fitText(
      this.add
        .text(width / 2, TITLE_Y, copy.title, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.screen,
          color: COLORS.text,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 220,
    );

    // Twenty rows have to fit a 540-tall window lying down, so the row
    // height is whatever is left, capped at something comfortable to read.
    const spacing = height >= ROOMY_FROM ? SPACING.roomy : SPACING.tight;
    const tableWidth = Math.min(640, width - 32);
    const rowHeight = Math.min(spacing.rowMax, (height - spacing.headY - spacing.firstRow - FOOTER) / RANKING.size);
    const fontSize = rowHeight >= 24 ? TEXT.size.body : TEXT.size.hint;

    this.buildTabs(width, spacing.tabsY);
    this.resetLine = this.add
      .text(width / 2, spacing.resetY, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.gearText,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
    this.resetAt = nextRankingReset(Date.now());
    this.tickReset();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickReset() });
    this.layout = { tableWidth, rowHeight, fontSize, headY: spacing.headY, firstRow: spacing.firstRow };
    this.note = this.add
      .text(width / 2, height - FOOTER / 2, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    // This device's board at once, and the shared one folded in when it
    // arrives — the rows are drawn again then, not the whole screen.
    this.drawBoard();
    this.loading = RANKING.shared.enabled;
    this.drawNote();
    const unwatch = ranking.onChange(() => {
      this.loading = false;
      this.drawBoard();
      this.drawNote();
    });
    void ranking.refresh().then(() => {
      if (this.scene.isActive()) {
        this.loading = false;
        this.drawNote();
        void this.loadReview();
      }
    });
    void this.lookUpMine();

    const unwatchPersonal = personal.onChange(() => this.drawBoard());
    const flip = (event: KeyboardEvent): void => {
      if (this.popup) {
        return;
      }
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Tab'].includes(event.code)) {
        event.preventDefault?.();
        this.setTab(this.tab === 'shared' ? 'personal' : 'shared');
      }
    };
    this.input.keyboard?.on('keydown-ESC', this.close, this);
    this.input.keyboard?.on('keydown', flip);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unwatch();
      unwatchPersonal();
      this.input.keyboard?.off('keydown-ESC', this.close, this);
      this.input.keyboard?.off('keydown', flip);
    });
  }

  /** 전체 랭킹 and 내 기록, side by side under the title. */
  private buildTabs(width: number, y: number): void {
    const copy = t().ranking;
    (['shared', 'personal'] as const).forEach((tab, index) => {
      const x = width / 2 + (index === 0 ? -1 : 1) * (TAB_W / 2 + TAB_GAP / 2);
      const plate = this.add
        .rectangle(x, y, TAB_W, TAB_H, COLORS.panel, 1)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x, y, tab === 'shared' ? copy.tabShared : copy.tabPersonal, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.body,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      fitText(label, TAB_W - 12, 0);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.setTab(tab));
      this.tabs.set(tab, plate);
      this.tabLabels.set(tab, label);
    });
    this.lightTabs();
  }

  private lightTabs(): void {
    this.tabs.forEach((plate, tab) => {
      const on = tab === this.tab;
      plate.setFillStyle(on ? COLORS.panelActive : COLORS.panel, 1);
      plate.setStrokeStyle(2, on ? COLORS.accentFill : COLORS.panelEdge, 1);
      this.tabLabels.get(tab)?.setColor(on ? COLORS.text : COLORS.muted);
    });
  }

  /** Shows the other board. */
  public setTab(tab: RankingTab): void {
    if (tab === this.tab) {
      return;
    }
    this.tab = tab;
    this.lightTabs();
    this.drawBoard();
    this.drawNote();
    this.tickReset();
  }

  /**
   * The countdown to the shared board's reset. When it runs out, the board
   * on screen is yesterday's: it is drawn again (the store keeps only today's)
   * and the server asked for the new one.
   */
  private tickReset(): void {
    const line = this.resetLine;
    if (!line) {
      return;
    }
    const now = Date.now();
    if (now >= this.resetAt) {
      this.resetAt = nextRankingReset(now);
      this.drawBoard();
      void ranking.refresh();
    }
    const seconds = Math.max(0, Math.floor((this.resetAt - now) / 1000));
    const left = `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    line.setVisible(this.tab === 'shared');
    line.setText(fill(t().ranking.resetsIn, { hour: RANKING.dailyReset.hour, left }));
    fitText(line.setScale(1), this.scale.width);
  }

  /** The rows, from the store as it stands. */
  private drawBoard(): void {
    this.board?.destroy();
    this.board = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    this.heads?.destroy();
    this.heads = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    this.rows = [];

    if (this.tab === 'personal') {
      this.drawPersonal();
    } else {
      this.drawShared();
    }
  }

  /**
   * 전체 랭킹: place, flag, name with its emoji, the skill it was played on,
   * the account's cups (days at first, second, third), and the damage.
   */
  private drawShared(): void {
    const copy = t().ranking;
    const { rowHeight, fontSize, tableWidth } = this.layout;
    const top = ranking.top;
    if (top.length === 0) {
      this.drawEmpty(copy.empty);
    }

    const none: TableCell = { parts: [], width: 0 };
    const rows = top.map((entry, index) => {
      const place = index + 1;
      const y = this.rowY(index);
      const lit = place === this.payload.highlight;
      if (lit) {
        this.board!.add(this.add.rectangle(this.scale.width / 2, y, tableWidth + 12, rowHeight, COLORS.panelActive, 1));
      }
      // First place in gold; a place just entered in the accent colour; for
      // the admin, a run the review marks out of line in red.
      const checked = this.review.get(reviewKey(entry));
      const color = checked?.outlier
        ? COLORS.suspectText
        : lit
          ? COLORS.accent
          : place === 1
            ? COLORS.gearText
            : COLORS.text;
      if (checked) {
        const hit = this.add
          .rectangle(this.scale.width / 2, y, tableWidth + 12, rowHeight, 0xffffff, 0.001)
          .setInteractive({ useHandCursor: true })
          .setName('reviewRow');
        hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.openReview(checked));
        this.board!.add(hit);
      }
      const placeCell = this.cellText(y, String(place), fontSize, color);
      const name = this.cellText(y, rankLabel(entry), fontSize, color);
      const damage = this.cellText(y, grouped(entry.damage), fontSize, color);
      this.rows.push([placeCell, name, damage].map((cell) => cell.parts[0]!.obj as Phaser.GameObjects.Text));

      const h = Math.min(18, rowHeight - 4);
      const flag = entry.flag ? this.cellImage(y, flagTexture(entry.flag), h * 1.5, h, 'flag') : none;
      const icon = Math.min(20, rowHeight - 2);
      const skillKey = entry.skill ? SKILL_ICONS[entry.skill]?.key : undefined;
      const skill = skillKey ? this.cellImage(y, skillKey, icon, icon, 'skill') : none;
      return [placeCell, flag, name, skill, this.cups(entry, y), damage];
    });

    // The cups keep their room: an account's counts grow, the others do not.
    this.layColumns([copy.place, copy.flag, copy.name, copy.skill, copy.trophies, copy.damage], rows, 4);
  }

  /** The account's days at first, second and third place, as cups with a count each. */
  private cups(entry: RankEntry, y: number): TableCell {
    const cup = Math.min(16, this.layout.rowHeight - 4);
    const parts: TableCell['parts'] = [];
    let width = 0;
    const podium: [number, string, string][] = [
      [entry.wins, TEXTURES.trophy, 'wins'],
      [entry.seconds, TEXTURES.trophySilver, 'seconds'],
      [entry.thirds, TEXTURES.trophyBronze, 'thirds'],
    ];
    for (const [count, texture, tag] of podium) {
      if (count <= 0) {
        continue;
      }
      width += width > 0 ? 6 : 0;
      const image = this.add.image(0, y, texture).setOrigin(0, 0.5).setDisplaySize(cup, cup).setName(`${tag}Cup`);
      const times = this.add
        .text(0, y, `×${count}`, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.gearText })
        .setOrigin(0, 0.5)
        .setName(tag);
      this.board!.add([image, times]);
      parts.push({ obj: image, dx: width }, { obj: times, dx: width + cup + 2 });
      width += cup + 2 + times.width;
    }
    return { parts, width };
  }

  /** A row's middle, counting from the first. */
  private rowY(index: number): number {
    const { headY, firstRow, rowHeight } = this.layout;
    return headY + firstRow + index * rowHeight + rowHeight / 2;
  }

  private cellText(y: number, value: string, fontSize: string, color: string): TableCell {
    const text = this.add.text(0, y, value, { fontFamily: 'system-ui, sans-serif', fontSize, color }).setOrigin(0, 0.5);
    this.board!.add(text);
    return { parts: [{ obj: text, dx: 0 }], width: text.width };
  }

  private cellImage(y: number, key: string, w: number, h: number, name: string): TableCell {
    const image = this.add.image(0, y, key).setOrigin(0, 0.5).setDisplaySize(w, h).setName(name);
    this.board!.add(image);
    return { parts: [{ obj: image, dx: 0 }], width: w };
  }

  private drawEmpty(message: string): void {
    this.board!.add(
      this.add
        .text(this.scale.width / 2, this.layout.headY + 60, message, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.body,
          color: COLORS.muted,
          align: 'center',
          wordWrap: { width: this.layout.tableWidth },
        })
        .setOrigin(0.5, 0),
    );
  }

  /**
   * Places the columns: each as wide as its widest cell or head, the same
   * gap between every two, the whole centred. Every cell and head is
   * centred in its column. The gap is a share (COLUMN_GAP_SHARE) of what
   * would spread the table over its full width; a `keep` column holds the
   * room it would have had at the full gap, so it does not shrink with them.
   */
  private layColumns(heads: readonly string[], rows: readonly TableCell[][], keep?: number): void {
    const { headY, tableWidth } = this.layout;
    const headCells: TableCell[] = heads.map((label) => {
      const text = this.add
        .text(0, headY, label, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
        .setOrigin(0, 0.5);
      this.heads!.add(text);
      return { parts: [{ obj: text, dx: 0 }], width: text.width };
    });
    const widths = headCells.map((head, column) => Math.max(head.width, ...rows.map((row) => row[column]?.width ?? 0)));
    const spread = Math.max(MIN_COLUMN_GAP, (tableWidth - widths.reduce((sum, w) => sum + w, 0)) / Math.max(1, heads.length - 1));
    const gap = spread * COLUMN_GAP_SHARE;
    if (keep !== undefined && widths[keep] !== undefined) {
      widths[keep] += spread - gap;
    }
    const content = widths.reduce((sum, w) => sum + w, 0);
    const total = content + gap * (heads.length - 1);
    let x = (this.scale.width - total) / 2;
    // Wider than a phone even at the least gap: the whole table drawn
    // smaller, about the screen's middle and the heads' line.
    const fit = Math.min(1, (this.scale.width - 16) / total);
    for (const layer of [this.board!, this.heads!]) {
      layer.setScale(fit).setPosition((this.scale.width / 2) * (1 - fit), headY * (1 - fit));
    }
    widths.forEach((w, column) => {
      for (const cell of [headCells[column]!, ...rows.map((row) => row[column]!)]) {
        const start = x + (w - cell.width) / 2;
        cell.parts.forEach(({ obj, dx }) => obj.setX(start + dx));
      }
      x += w + gap;
    });
  }

  /** 내 기록: this player's own best runs, with when they ended and how long they lasted. */
  private drawPersonal(): void {
    const copy = t().ranking;
    const { fontSize } = this.layout;
    const runs = personal.runs;
    if (runs.length === 0) {
      this.drawEmpty(copy.personalEmpty);
    }

    const rows = runs.map((run, index) => {
      const place = index + 1;
      const y = this.rowY(index);
      const color = place === 1 ? COLORS.gearText : COLORS.text;
      const cells = [String(place), day(run.at), String(run.level), clock(run.survivedMs), grouped(run.damage)].map(
        (value) => this.cellText(y, value, fontSize, color),
      );
      this.rows.push(cells.map((cell) => cell.parts[0]!.obj as Phaser.GameObjects.Text));
      return cells;
    });
    this.layColumns([copy.place, copy.date, copy.level, copy.time, copy.damage], rows);
  }

  /** Where the board came from: shared, still coming, or this device only. */
  private drawNote(): void {
    const copy = t().ranking;
    if (this.tab === 'personal') {
      this.note.setText(account.signedIn ? copy.personalSyncedNote : copy.personalNote);
      fitText(this.note, this.scale.width - 16);
      return;
    }
    const text = !RANKING.shared.enabled
      ? copy.localNote
      : this.loading
        ? copy.loadingNote
        : ranking.source === 'shared'
          ? ''
          : copy.offlineNote;
    const review = this.reviewing && this.review.size > 0
      ? fill(copy.review.note, { n: [...this.review.values()].filter((row) => row.outlier).length })
      : '';
    this.note.setText([text, this.mine, review, this.reviewNote].filter(Boolean).join('   ·   '));
    fitText(this.note.setScale(1), this.scale.width - 16);
  }

  /** The admin's review of today's board, read once the board is in. Public so a test can ask again. */
  public async loadReview(): Promise<void> {
    if (!this.reviewing) {
      return;
    }
    const reply = await accountRequest('/api/ranking/review', { cache: 'no-store' });
    const rows = (reply.body as { rows?: ReviewRow[] } | null)?.rows;
    if (!reply.ok || !Array.isArray(rows) || !this.scene.isActive()) {
      return;
    }
    this.review = new Map(rows.map((row) => [reviewKey(row), row]));
    this.drawBoard();
    this.drawNote();
  }

  /** The 판 내역 of one run, read out, with the way to take it off the board. Public so a test can open it. */
  public openReview(row: ReviewRow): void {
    this.closeReview();
    this.reading = row;
    const { width, height } = this.scale;
    const copy = t().ranking.review;
    const panelW = Math.min(560, width - 24);
    const panelH = Math.min(height - 32, 470);
    const top = (height - panelH) / 2;
    const layer = this.add.container(0, 0).setDepth(DEPTH.ui + 10);
    const dim = this.add.rectangle(0, 0, width, height, 0x05070b, 0.75).setOrigin(0, 0).setInteractive();
    const panel = this.add
      .rectangle(width / 2, height / 2, panelW, panelH, COLORS.panel, 1)
      .setStrokeStyle(2, row.outlier ? 0xff6b6b : COLORS.gear, 1);
    const title = this.add
      .text(width / 2, top + 24, fill(copy.title, { name: row.name || '???' }), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.label,
        color: row.outlier ? COLORS.suspectText : COLORS.gearText,
      })
      .setOrigin(0.5);
    fitText(title, panelW - 16, 0);
    const room = panelH - 48 - POPUP_BUTTON_H - 36;
    const body = this.add
      .text(width / 2 - panelW / 2 + 20, top + 48, this.describe(row).join('\n'), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.text,
        lineSpacing: 5,
        wordWrap: { width: panelW - 40 },
      })
      .setOrigin(0, 0);
    // A run with a lot in it is drawn smaller rather than run off the panel.
    if (body.height > room) {
      body.setScale(room / body.height);
    }
    this.popupText = body;
    const buttonsY = top + panelH - 18 - POPUP_BUTTON_H / 2;
    const w = Math.min(POPUP_BUTTON_W, (panelW - 48) / 2);
    const remove = this.popupButton(width / 2 - w / 2 - 8, buttonsY, w, copy.remove, () => this.askRemove());
    remove.plate.setStrokeStyle(2, 0xff6b6b, 1);
    const close = this.popupButton(width / 2 + w / 2 + 8, buttonsY, w, copy.close, () => this.closeReview());
    layer.add([dim, panel, title, body, remove.plate, remove.label, close.plate, close.label]);
    this.popup = layer;
  }

  /** The popup's lines: the run, how it stands against others, then what it said about itself. */
  private describe(row: ReviewRow): string[] {
    const copy = t().ranking.review;
    const rule = RANKING.review;
    const out = [fill(copy.summary, { damage: grouped(row.damage), time: clock(row.survivedMs), level: row.level })];
    const window = Math.round(rule.timeWindow * 100);
    out.push(
      row.reference === null || row.ratio === null
        ? fill(copy.unknown, { n: row.peers, min: rule.minPeers })
        : fill(row.outlier ? copy.outlier : copy.normal, {
            n: row.peers,
            median: grouped(row.reference),
            ratio: row.ratio >= 100 ? Math.round(row.ratio) : row.ratio.toFixed(1),
            window,
          }),
    );
    out.push('');
    const d = row.detail;
    if (!d) {
      out.push(copy.noDetail);
      return out;
    }
    const list = (items: string[]): string => (items.length > 0 ? items.join(', ') : copy.none);
    out.push(fill(copy.version, { version: d.version || '?', build: d.build || '?' }) + (d.resumed ? ` · ${copy.resumed}` : ''));
    const kills = Object.entries(d.kills ?? {}).sort((a, b) => b[1] - a[1]);
    const total = kills.reduce((sum, [, n]) => sum + n, 0);
    out.push(fill(copy.kills, { total: grouped(total), list: list(kills.map(([kind, n]) => `${named<EnemyKind>(kind, enemyName)} ${grouped(n)}`)) }));
    out.push(fill(copy.bosses, { n: grouped(d.kills?.boss ?? 0) }));
    out.push(fill(copy.bones, { list: list((d.bones ?? []).map((id) => named<BoneId>(id, boneName))) }));
    const gear = d.gear;
    out.push(
      gear
        ? fill(copy.gear, {
            name: named<GearId>(gear.id, gearName),
            lines: list([...gear.prefixes, ...gear.suffixes].map((line) => fill(copy.tier, { name: named<AffixId>(line.id, affixName), tier: line.tier }))),
          })
        : fill(copy.gear, { name: copy.none, lines: copy.none }),
    );
    out.push(fill(copy.skills, { list: list((d.skills ?? []).map((skill) => `${named<SkillId>(skill.id, skillName)} Lv ${skill.level}`)) }));
    out.push(fill(copy.passives, {
      list: list(Object.entries(d.passives ?? {}).filter(([, n]) => n > 0).map(([id, n]) => `${named<PassiveId>(id, passiveName)} ${n}`)),
    }));
    return out;
  }

  /** The second ask: nothing comes off the board until its own button is pressed. Public so a test can. */
  public askRemove(): void {
    const row = this.reading;
    if (!row || this.confirmBox) {
      return;
    }
    const { width, height } = this.scale;
    const copy = t().ranking.review;
    const panelW = Math.min(440, width - 32);
    const panelH = 230;
    const layer = this.add.container(0, 0).setDepth(DEPTH.ui + 20);
    const dim = this.add.rectangle(0, 0, width, height, 0x05070b, 0.6).setOrigin(0, 0).setInteractive();
    const panel = this.add
      .rectangle(width / 2, height / 2, panelW, panelH, COLORS.panel, 1)
      .setStrokeStyle(2, 0xff6b6b, 1);
    const title = this.add
      .text(width / 2, height / 2 - 78, copy.confirmTitle, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.label,
        color: COLORS.suspectText,
      })
      .setOrigin(0.5);
    fitText(title, panelW - 16, 0);
    const body = this.add
      .text(width / 2, height / 2 - 18, fill(copy.confirmBody, { name: row.name || '???', damage: grouped(row.damage) }), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.text,
        align: 'center',
        wordWrap: { width: panelW - 40 },
      })
      .setOrigin(0.5);
    const w = Math.min(POPUP_BUTTON_W, (panelW - 48) / 2);
    const yes = this.popupButton(width / 2 - w / 2 - 8, height / 2 + 72, w, copy.confirm, () => void this.confirmRemove());
    yes.plate.setStrokeStyle(2, 0xff6b6b, 1);
    const no = this.popupButton(width / 2 + w / 2 + 8, height / 2 + 72, w, copy.cancel, () => this.cancelRemove());
    layer.add([dim, panel, title, body, yes.plate, yes.label, no.plate, no.label]);
    this.confirmBox = layer;
  }

  /** Backs out of the second ask, the run left where it is. Public so a test can. */
  public cancelRemove(): void {
    this.confirmBox?.destroy();
    this.confirmBox = undefined;
  }

  /** Takes the run being read off the board, then shows the board as it now stands. Public so a test can. */
  public async confirmRemove(): Promise<void> {
    const row = this.reading;
    if (!row || !this.confirmBox) {
      return;
    }
    const copy = t().ranking.review;
    const reply = await accountRequest('/api/ranking/remove', {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: row.entryId }),
    });
    if (!this.scene.isActive()) {
      return;
    }
    this.cancelRemove();
    this.closeReview();
    this.reviewNote = reply.ok ? fill(copy.removed, { name: row.name || '???' }) : copy.failed;
    this.drawNote();
    if (reply.ok) {
      await ranking.refresh();
      await this.loadReview();
    }
  }

  /** Closes the 판 내역 popup (and the ask over it, if any). Public so a test can. */
  public closeReview(): void {
    this.cancelRemove();
    this.popup?.destroy();
    this.popup = undefined;
    this.popupText = undefined;
    this.reading = null;
  }

  private popupButton(
    x: number,
    y: number,
    w: number,
    label: string,
    onPress: () => void,
  ): { plate: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text } {
    const plate = this.add
      .rectangle(x, y, w, POPUP_BUTTON_H, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
      .setOrigin(0.5);
    fitText(text, w - 12, 0);
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
    return { plate, label: text };
  }

  /** The signed-in account's own best, beside the note: where it stands, on the board or off it. */
  private async lookUpMine(): Promise<void> {
    if (!ACCOUNT.enabled || !RANKING.shared.enabled || !account.signedIn) {
      return;
    }
    const reply = await accountRequest('/api/ranking/me', { cache: 'no-store' });
    const body = reply.body as { best?: { damage?: number } | null; place?: number | null } | null;
    if (!reply.ok || !body || !this.scene.isActive()) {
      return;
    }
    const copy = t().ranking;
    this.mine = body.best
      ? fill(copy.mine, { place: body.place ?? 0, damage: Math.round(body.best.damage ?? 0).toLocaleString('en-US') })
      : copy.mineNone;
    this.drawNote();
  }

  private close(): void {
    // Esc and the back button take the topmost popup first.
    if (this.confirmBox) {
      this.cancelRemove();
      return;
    }
    if (this.popup) {
      this.closeReview();
      return;
    }
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
