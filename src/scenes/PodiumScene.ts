import Phaser from 'phaser';

import { COLORS, DEPTH, RANKING, SCENES, SCRIM, SKILL_ICONS, TEXT, TEXTURES } from '@/config';
import { fill, t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { fitText } from '@/systems/Layout';
import { PLATFORM } from '@/systems/Platform';
import type { PodiumMine } from '@/systems/Podium';
import { flagTexture, rankLabel, type RankEntry } from '@/systems/Ranking';

export interface PodiumSceneData {
  /** The board's day the three are from (rankingDayStart). */
  readonly day: number;
  /** First, second and third, best first. */
  readonly entries: readonly RankEntry[];
  /** Signed in (so the line under the three is this account's place). */
  readonly signedIn?: boolean;
  /** This account's place that day, or null without a run. */
  readonly mine?: PodiumMine | null;
  /** How many accounts ran that day. */
  readonly total?: number;
  /** Called once, however it is closed: it has been seen. */
  readonly onSeen?: () => void;
  readonly onClose: () => void;
}

const CUPS = [TEXTURES.trophy, TEXTURES.trophySilver, TEXTURES.trophyBronze] as const;
const ROW_H = 66;
/** The line under the three: where this player placed. */
const MINE_H = 34;
const BUTTON_W = 160;
const BUTTON_H = 44;

/** "3:05" — a run's length. */
const clock = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * 어제의 랭킹 — the day before's first, second and third, each with its cup,
 * flag, name, skill and damage. Shown over the title on the first visit after
 * the board starts over, and never again that day once closed.
 */
export class PodiumScene extends Phaser.Scene {
  public static readonly KEY = SCENES.podium;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;
  /** Each place's name line, first to third. Public for tests. */
  public names: Phaser.GameObjects.Text[] = [];
  /** 확인. Public so a test can press it. */
  public okPlate?: Phaser.GameObjects.Rectangle;
  /** "내 순위 12위 / 35명 · …". Public for tests. */
  public mineLine?: Phaser.GameObjects.Text;
  private payload!: PodiumSceneData;
  private closed = false;

  public constructor() {
    super(PodiumScene.KEY);
  }

  public init(data: PodiumSceneData): void {
    this.payload = data;
    this.names = [];
    this.okPlate = undefined;
    this.mineLine = undefined;
    this.closed = false;
  }

  public create(): void {
    const { width, height } = this.scale;
    const copy = t().podium;
    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui).setInteractive();
    this.backButton = addBackButton(this, () => this.close());

    const entries = this.payload.entries.slice(0, 3);
    const block = 44 + 26 + 18 + entries.length * ROW_H + MINE_H + 18 + BUTTON_H;
    let y = Math.max(64, (height - block) / 2);

    fitText(
      this.add
        .text(width / 2, y + 18, copy.title, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.screen, color: COLORS.gearText })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 200,
      0,
    );
    y += 44;
    // The day, in the board's own time zone: the cups are counted by it.
    const shown = new Date(this.payload.day + RANKING.dailyReset.utcOffsetHours * 3_600_000);
    this.add
      .text(width / 2, y + 10, fill(copy.day, { date: `${shown.getUTCMonth() + 1}/${shown.getUTCDate()}` }), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
    y += 26 + 18;

    const panelW = Math.min(480, width - 32);
    entries.forEach((entry, index) => {
      const mid = y + ROW_H / 2;
      this.add
        .rectangle(width / 2, mid, panelW, ROW_H - 8, COLORS.panel, 0.9)
        .setStrokeStyle(2, index === 0 ? COLORS.gearEdge : COLORS.panelEdge, 1)
        .setDepth(DEPTH.ui + 1);
      this.drawRow(entry, index, width / 2, mid - 9, panelW - 24);
      this.add
        .text(width / 2, mid + 16, fill(copy.stats, { level: entry.level, time: clock(entry.survivedMs) }), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      y += ROW_H;
    });

    // Where this player placed that day — or why that cannot be said.
    const mine = this.payload.mine;
    const total = this.payload.total ?? 0;
    // The PC build has no sign-in yet (0.160): there is nothing to suggest.
    const own = !this.payload.signedIn
      ? PLATFORM === 'desktop' ? '' : copy.mineSignedOut
      : mine
        ? fill(copy.mine, {
            place: mine.place,
            total,
            damage: Math.round(mine.damage).toLocaleString('en-US'),
          })
        : copy.mineNone;
    this.mineLine = this.add
      .text(width / 2, y + MINE_H / 2, own, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: mine ? COLORS.accent : COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    fitText(this.mineLine, width, 16);
    y += MINE_H + 18;

    const plate = this.add
      .rectangle(width / 2, y + BUTTON_H / 2, BUTTON_W, BUTTON_H, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.accentFill, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(width / 2, y + BUTTON_H / 2, copy.ok, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.close());
    this.okPlate = plate;

    for (const key of ['keydown-ESC', 'keydown-ENTER', 'keydown-SPACE']) {
      this.input.keyboard?.on(key, this.close, this);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const key of ['keydown-ESC', 'keydown-ENTER', 'keydown-SPACE']) {
        this.input.keyboard?.off(key, this.close, this);
      }
    });
  }

  /** One place on one line — cup, flag, name, skill, damage — centred on x. */
  private drawRow(entry: RankEntry, index: number, x: number, y: number, room: number): void {
    const color = index === 0 ? COLORS.gearText : COLORS.text;
    const parts: { obj: Phaser.GameObjects.Image | Phaser.GameObjects.Text; w: number }[] = [];
    const image = (key: string, w: number, h: number): void => {
      parts.push({ obj: this.add.image(0, y, key).setOrigin(0, 0.5).setDisplaySize(w, h), w });
    };
    const text = (value: string, tint: string): Phaser.GameObjects.Text => {
      const obj = this.add
        .text(0, y, value, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: tint })
        .setOrigin(0, 0.5);
      parts.push({ obj, w: obj.width });
      return obj;
    };
    image(CUPS[index] ?? TEXTURES.trophyBronze, 26, 26);
    if (entry.flag) {
      image(flagTexture(entry.flag), 27, 18);
    }
    this.names.push(text(rankLabel(entry), color));
    const skill = entry.skill ? SKILL_ICONS[entry.skill]?.key : undefined;
    if (skill) {
      image(skill, 22, 22);
    }
    text(Math.round(entry.damage).toLocaleString('en-US'), color);

    const gap = 12;
    const total = parts.reduce((sum, part) => sum + part.w, 0) + gap * (parts.length - 1);
    // Too wide for a phone: the whole line drawn smaller about its middle.
    const k = Math.min(1, room / total);
    let left = x - (total * k) / 2;
    for (const part of parts) {
      part.obj.setDepth(DEPTH.ui + 2).setX(left);
      if (k < 1) {
        part.obj.setScale(part.obj.scaleX * k, part.obj.scaleY * k);
      }
      left += (part.w + gap) * k;
    }
  }

  /** Closes it, and says it has been seen. Public so a test can. */
  public close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.payload.onSeen?.();
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
