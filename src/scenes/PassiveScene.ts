import Phaser from 'phaser';

import {
  ALL_PASSIVES,
  COLORS,
  DEPTH,
  PASSIVE_DIALS,
  PASSIVE_POINTS,
  PASSIVES,
  SCENES,
  SCRIM,
  TEXT,
  type PassiveId,
} from '@/config';
import { fill, passiveDetail, passiveName, t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { fitText } from '@/systems/Layout';
import { passiveBonusFor, passives } from '@/systems/Passives';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export interface PassiveSceneData {
  readonly onClose: () => void;
}

/** One line's dial, as drawn. Public through `knobs` for tests. */
interface PassiveKnob {
  readonly id: PassiveId;
  readonly x: number;
  readonly y: number;
  readonly ring: Phaser.GameObjects.Graphics;
  /** The ranks it holds, inside the ring (no cap of its own since 0.102: the ring fills against every point). */
  readonly rank: Phaser.GameObjects.Text;
  readonly name: Phaser.GameObjects.Text;
  /** How much more often its shard drops, now: "15% 증가". */
  readonly chance: Phaser.GameObjects.Text;
  readonly hit: Phaser.GameObjects.Arc;
  readonly minus: Phaser.GameObjects.Text;
  readonly plus: Phaser.GameObjects.Text;
}

const TITLE_Y = 34;

/**
 * 패시브 (0.102, the user's ask): the 재능의 파편 lines as dials in a grid,
 * the way the 밸런스 panel lays its own — no tree. A tap on a dial (or its
 * +) puts a point in, its − takes one back, and 초기화 gives every point
 * back. Under each dial, the chance its stat has now.
 *
 * Keys: arrows move round the grid, Space / Enter / + spend, − / Backspace
 * take back, R resets, Esc leaves.
 */
export class PassiveScene extends Phaser.Scene {
  public static readonly KEY = SCENES.passives;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;
  /** Points in hand, of the whole. Public for tests. */
  public purse!: Phaser.GameObjects.Text;
  /** Every dial, by its line. Public so a test can read and press one. */
  public knobs = new Map<PassiveId, PassiveKnob>();
  /** What the focused dial is. Public for tests. */
  public detail!: Phaser.GameObjects.Text;
  /** Which dial the keys are on: an index into the lines. */
  public focused = 0;
  /** The 초기화 button. Public for tests. */
  public resetButton!: { readonly plate: Phaser.GameObjects.Rectangle; readonly label: Phaser.GameObjects.Text };

  private payload!: PassiveSceneData;
  private cols = 1;

  public constructor() {
    super(PassiveScene.KEY);
  }

  public init(data: PassiveSceneData): void {
    this.payload = data;
    this.knobs = new Map();
    this.focused = 0;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    const copy = t().passives;

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);
    this.add
      .text(width / 2, TITLE_Y, copy.title, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.screen, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
    this.purse = this.add
      .text(width / 2, TITLE_Y + 32, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.accent })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
    const lead = this.add
      .text(width / 2, TITLE_Y + 58, copy.lead, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: width - 32 },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);

    // The grid, under the lead and over the footer, centred; smaller when it would not fit.
    const top = lead.y + lead.height + 14;
    const footer = 96;
    const lines = ALL_PASSIVES;
    // As many as fit a row, then evened out: six on a wide screen are 3 × 2, not 5 and 1.
    const fits = Math.max(1, Math.min(lines.length, Math.floor((width - 16) / PASSIVE_DIALS.cellW)));
    const rows = Math.ceil(lines.length / fits);
    this.cols = Math.ceil(lines.length / rows);
    const room = height - top - footer;
    const scale = Phaser.Math.Clamp(room / (rows * PASSIVE_DIALS.cellH), 0.6, 1);
    const cellW = Math.min(PASSIVE_DIALS.cellW, (width - 16) / this.cols);
    const cellH = PASSIVE_DIALS.cellH * scale;
    const radius = PASSIVE_DIALS.radius * Math.max(scale, 0.75);
    const used = Math.min(this.cols, lines.length);
    const left = width / 2 - (used * cellW) / 2 + cellW / 2;
    const gridTop = top + Math.max(0, (room - rows * cellH) / 2);

    lines.forEach((spec, i) => {
      const x = left + (i % this.cols) * cellW;
      const y = gridTop + Math.floor(i / this.cols) * cellH + radius + 6;
      const ring = this.add.graphics().setDepth(DEPTH.ui + 1);
      const rank = this.add
        .text(x, y, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.text })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      const name = this.add
        .text(x, y + radius + 16, passiveName(spec.id), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.small,
          color: COLORS.text,
          align: 'center',
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1);
      fitText(name, cellW - 8, 0);
      const chance = this.add
        .text(x, y + radius + 36, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1);
      const hit = this.add
        .circle(x, y, radius + 6, 0xffffff, 0.001)
        .setDepth(DEPTH.ui + 3)
        .setInteractive({ useHandCursor: true });
      const sign = (text: string, dx: number): Phaser.GameObjects.Text =>
        this.add
          .text(x + dx, y + radius + 58, text, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: TEXT.size.label,
            color: COLORS.text,
            backgroundColor: '#1b2230',
            padding: { left: 12, right: 12, top: 2, bottom: 2 },
          })
          .setOrigin(0.5)
          .setDepth(DEPTH.ui + 2)
          .setInteractive({ useHandCursor: true });
      const minus = sign('−', -30);
      const plus = sign('+', 30);
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.spend(spec.id));
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_WHEEL, (_p: unknown, _dx: number, dy: number) => {
        this.focused = i;
        if (dy < 0) {
          this.spend(spec.id);
        } else {
          this.refund(spec.id);
        }
      });
      plus.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.spend(spec.id));
      minus.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.refund(spec.id));
      this.knobs.set(spec.id, { id: spec.id, x, y, ring, rank, name, chance, hit, minus, plus });
    });

    this.detail = this.add
      .text(width / 2, height - footer + 10, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: width - 32 },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);

    const plate = this.add
      .rectangle(width / 2, height - 44, 150, 34, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(width / 2, height - 44, copy.reset, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.reset());
    this.resetButton = { plate, label };

    fitText(
      this.add
        .text(width / 2, height - 16, prefersTouchControls() ? copy.hintTouch : copy.hintKeyboard, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 16,
    );

    this.input.keyboard?.on('keydown', this.onKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.off('keydown', this.onKey, this));
    this.refresh();
  }

  /** A point into a line, if there is one to spend and room in it. Public so a test can. */
  public spend(id: PassiveId): void {
    this.focused = Math.max(0, ALL_PASSIVES.findIndex((spec) => spec.id === id));
    passives.spend(id);
    this.refresh();
  }

  /** A point back out of a line. Public so a test can. */
  public refund(id: PassiveId): void {
    this.focused = Math.max(0, ALL_PASSIVES.findIndex((spec) => spec.id === id));
    passives.refund(id);
    this.refresh();
  }

  /** Every point back. Public so a test can. */
  public reset(): void {
    passives.reset();
    this.refresh();
  }

  /** Draws every dial as the tree now stands, and the focused one's line. */
  private refresh(): void {
    const copy = t().passives;
    const { points } = passives.value;
    this.purse.setText(fill(copy.pointsOf, { points, total: PASSIVE_POINTS }));
    const weights = passiveBonusFor(passives.value.ranks).shardWeights;

    ALL_PASSIVES.forEach((spec, i) => {
      const knob = this.knobs.get(spec.id);
      if (!knob) {
        return;
      }
      const rank = passives.rankOf(spec.id);
      const max = PASSIVES[spec.id].maxRank;
      const radius = (knob.hit.radius ?? PASSIVE_DIALS.radius + 6) - 6;
      const buyable = points > 0 && rank < max;
      const focused = i === this.focused;
      const g = knob.ring;
      g.clear();
      g.fillStyle(COLORS.panel, 1);
      g.fillCircle(knob.x, knob.y, radius);
      g.lineStyle(PASSIVE_DIALS.ringWidth, PASSIVE_DIALS.ringTrack, 1);
      g.beginPath();
      g.arc(knob.x, knob.y, radius, -Math.PI / 2, Math.PI * 1.5, false);
      g.strokePath();
      if (rank > 0) {
        g.lineStyle(PASSIVE_DIALS.ringWidth, PASSIVE_DIALS.ringFill, 1);
        g.beginPath();
        g.arc(knob.x, knob.y, radius, -Math.PI / 2, -Math.PI / 2 + (rank / max) * Math.PI * 2, false);
        g.strokePath();
      }
      if (focused || buyable) {
        g.lineStyle(2, focused ? COLORS.accentFill : PASSIVE_DIALS.buyable, focused ? 1 : 0.6);
        g.strokeCircle(knob.x, knob.y, radius + PASSIVE_DIALS.ringWidth + 3);
      }
      knob.rank.setText(String(rank));
      // How much more often its shard drops, as the tree has it now (0.103:
      // the user's word — the increase, not the chance itself).
      knob.chance.setText(fill(copy.chance, { pct: Math.round((weights[spec.shardStat] - 1) * 100) }));
      knob.plus.setAlpha(buyable ? 1 : 0.35);
      knob.minus.setAlpha(rank > 0 ? 1 : 0.35);
      knob.name.setColor(focused ? COLORS.accent : COLORS.text);
    });

    const focused = ALL_PASSIVES[this.focused];
    this.detail.setText(focused ? `${passiveName(focused.id)} — ${passiveDetail(focused.id)}` : '');
  }

  private onKey(event: KeyboardEvent): void {
    const count = ALL_PASSIVES.length;
    const id = ALL_PASSIVES[this.focused]?.id;
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.focused = (this.focused - 1 + count) % count;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.focused = (this.focused + 1) % count;
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.focused = (this.focused - this.cols + count) % count;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.focused = (this.focused + this.cols) % count;
        break;
      case 'Space':
      case 'Enter':
      case 'NumpadEnter':
      case 'Equal':
      case 'NumpadAdd':
        if (id) this.spend(id);
        return;
      case 'Minus':
      case 'NumpadSubtract':
      case 'Backspace':
        if (id) this.refund(id);
        return;
      case 'KeyR':
        this.reset();
        return;
      case 'Escape':
        this.close();
        return;
      default:
        return;
    }
    this.refresh();
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
