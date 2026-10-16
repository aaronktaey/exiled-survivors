import Phaser from 'phaser';

import {
  BALANCE,
  COLORS,
  DEPTH,
  DIALS,
  SKILL_BASE,
  SCENES,
  SCRIM,
  SKILL_ICONS,
  TEXT,
  TEXTURES,
  type BoneId,
  type DialSpec,
  type DialTab,
  type GearId,
  type OrbId,
} from '@/config';
import { boneShort, fill, gearName, orbShort, skillName, t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { fitText } from '@/systems/Layout';
import { dpsFromStats } from '@/systems/Progression';
import { tuning } from '@/systems/Tuning';
import { ALL_SKILLS, type SkillId } from '@/weapons/skills';

export interface TuningSceneData {
  readonly onClose: () => void;
  /** The run's skills and their DPS right now, when opened from a run. */
  readonly dps?: () => ReadonlyArray<{ readonly id: SkillId; readonly name: string; readonly dps: number }>;
}

/** One knob on the screen. */
interface Knob {
  readonly dial: DialSpec;
  readonly x: number;
  readonly y: number;
  readonly arc: Phaser.GameObjects.Graphics;
  readonly value: Phaser.GameObjects.Text;
  readonly label: Phaser.GameObjects.Text;
  readonly hit: Phaser.GameObjects.Arc;
}

const RADIUS = 24;
const CELL_W = 108;
const CELL_H = 96;
/** The arc a knob sweeps: 270°, the gap at the bottom. */
const SWEEP_FROM = Math.PI * 0.75;
const SWEEP = Math.PI * 1.5;
const DRAFT = 0xffb347;
const SHARED = 0x6aa9ff;
const PAGE_SKILLS = ['meleeStrike', 'fireball', 'chainLightning', 'iceSpear', 'voidOrb', 'thunderStrike', 'common'];

/**
 * 밸런스 — the admin's dials, over the title or a paused run.
 *
 * A tab per kind of number (스킬 · 적 · 드랍), and on 스킬 a page per skill.
 * Each knob is dragged (up or right to raise), wheeled, or stepped with ↑ ↓
 * once the arrows have picked it; a double press sets it back to everyone's
 * value. Turning one changes this game at once — the admin's draft, in
 * orange — and 전체 적용 makes the draft everyone's from their next run.
 */
export class TuningScene extends Phaser.Scene {
  public static readonly KEY = SCENES.tuning;
  public backButton?: BackButton;
  /** The knobs on screen. Public so a test can turn one. */
  public knobs: Knob[] = [];
  public tab: DialTab = 'skills';
  public page = 'meleeStrike';
  public focused = 0;
  /** The line saying what is drafted and what is shared. Public for tests. */
  public status!: Phaser.GameObjects.Text;
  public dpsLine?: Phaser.GameObjects.Text;
  /** 전체 적용 asks once before it goes. */
  public armed = false;

  private payload!: TuningSceneData;
  private grid?: Phaser.GameObjects.Container;
  private tabPlates = new Map<string, Phaser.GameObjects.Rectangle>();
  private gridTop = 0;
  private dragging: { knob: Knob; from: number; x: number; y: number } | null = null;
  private lastPress = { path: '', at: 0 };
  private publishLabel?: Phaser.GameObjects.Text;

  public constructor() {
    super(TuningScene.KEY);
  }

  public init(data: TuningSceneData & { tab?: DialTab; page?: string }): void {
    this.payload = data;
    this.knobs = [];
    this.tab = data.tab ?? 'skills';
    this.page = data.page ?? 'meleeStrike';
    this.focused = 0;
    this.armed = false;
    this.dragging = null;
    this.tabPlates = new Map();
    this.dpsLine = undefined;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    const copy = t().tuning;
    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);

    fitText(
      this.add
        .text(width / 2, 30, copy.title, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.screen, color: COLORS.text })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 220,
    );

    // 스킬 · 적 · 드랍.
    const tabs: DialTab[] = ['skills', 'enemies', 'drops'];
    tabs.forEach((tab, i) => {
      const x = width / 2 + (i - 1) * 104;
      this.tabButton(`tab:${tab}`, x, 66, 96, 28, copy.tabs[tab], () => this.reopen({ tab, page: this.page }));
    });
    let y = 94;
    if (this.tab === 'skills') {
      const size = 30;
      const gap = 6;
      const left = width / 2 - (PAGE_SKILLS.length * (size + gap) - gap) / 2 + size / 2;
      PAGE_SKILLS.forEach((id, i) => {
        const x = left + i * (size + gap);
        const plate = this.tabButton(`page:${id}`, x, y + size / 2, size, size, '', () => this.reopen({ tab: 'skills', page: id }));
        if (id === 'common') {
          this.add.text(x, y + size / 2, '∗', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.text })
            .setOrigin(0.5).setDepth(DEPTH.ui + 2);
        } else {
          this.add.image(x, y + size / 2, SKILL_ICONS[id]?.key ?? TEXTURES.skillOrb).setDisplaySize(size - 6, size - 6).setDepth(DEPTH.ui + 2);
        }
        plate.setData('skill', id);
      });
      y += size + 8;
      const pageName = this.page === 'common' ? copy.common : skillName(this.page as SkillId);
      this.add.text(width / 2, y + 8, pageName, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.gearText })
        .setOrigin(0.5).setDepth(DEPTH.ui + 1);
      y += 22;
    }
    // The 스킬 tab always reads out what its page's dials make of the skill;
    // the other tabs, mid-run, the run's skills.
    if (this.tab === 'skills' || this.payload.dps) {
      this.dpsLine = this.add
        .text(width / 2, y + 6, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1);
      y += 20;
    }
    this.gridTop = y + 8;

    // Under the grid: what is drafted, and the two ways out of a draft.
    this.status = this.add
      .text(width / 2, height - 78, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted, align: 'center' })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
    this.tabButton('cancel', width / 2 - 90, height - 46, 160, 34, copy.cancel, () => this.cancelDraft());
    this.publishLabel = this.tabButton('publish', width / 2 + 90, height - 46, 160, 34, copy.publish, () => void this.publish())
      .getData('label') as Phaser.GameObjects.Text;
    fitText(
      this.add
        .text(width / 2, height - 14, copy.hint, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width,
    );

    this.buildGrid();
    this.armInput();
    const unwatch = tuning.onChange(() => this.refresh());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unwatch);
    this.refresh();
  }

  /** Turns one dial to a value. Public so a test can. */
  public turn(path: string, value: number): void {
    tuning.set(path, value);
    this.armed = false;
    this.refresh();
  }

  private dialsShown(): DialSpec[] {
    return DIALS.filter((dial) => dial.tab === this.tab && (this.tab !== 'skills' || dial.skill === this.page));
  }

  private buildGrid(): void {
    const { width, height } = this.scale;
    this.grid?.destroy();
    this.grid = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    this.knobs = [];
    const dials = this.dialsShown();
    const cols = Math.max(1, Math.min(dials.length, Math.floor((width - 24) / CELL_W)));
    const rows = Math.max(1, Math.floor((height - this.gridTop - 96) / CELL_H));
    // Too many for the window: drawn smaller rather than off the edge.
    const scale = Math.min(1, rows / Math.ceil(dials.length / cols));
    const cellW = CELL_W * Math.max(scale, 0.8);
    const cellH = CELL_H * scale;
    const used = Math.min(cols, dials.length);
    const left = width / 2 - (used * cellW) / 2 + cellW / 2;
    dials.forEach((dial, i) => {
      const x = left + (i % cols) * cellW;
      const y = this.gridTop + Math.floor(i / cols) * cellH + RADIUS * scale + 4;
      const arc = this.add.graphics();
      const value = this.add
        .text(x, y, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text })
        .setOrigin(0.5);
      const label = this.add
        .text(x, y + RADIUS * scale + 16, this.labelOf(dial), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
          align: 'center',
        })
        .setOrigin(0.5);
      fitText(label, cellW - 4, 0);
      const hit = this.add.circle(x, y, RADIUS * scale + 6, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      const knob: Knob = { dial, x, y, arc, value, label, hit };
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
        this.focused = i;
        this.pressed(knob, pointer);
      });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_WHEEL, (_p: unknown, _dx: number, dy: number) => {
        this.focused = i;
        this.nudge(knob, dy < 0 ? 1 : -1);
      });
      arc.setData('scale', scale);
      this.grid!.add([arc, value, label, hit]);
      this.knobs.push(knob);
    });
  }

  /** A press starts a drag; a second press on the same knob, quickly, sets it back. */
  private pressed(knob: Knob, pointer: Phaser.Input.Pointer): void {
    const now = this.time.now;
    if (this.lastPress.path === knob.dial.path && now - this.lastPress.at < 350) {
      this.turn(knob.dial.path, tuning.sharedOf(knob.dial.path));
      this.lastPress = { path: '', at: 0 };
      return;
    }
    this.lastPress = { path: knob.dial.path, at: now };
    this.dragging = { knob, from: tuning.valueOf(knob.dial.path), x: pointer.x, y: pointer.y };
  }

  private nudge(knob: Knob, notches: number): void {
    const { step } = tuning.range(knob.dial);
    this.turn(knob.dial.path, tuning.valueOf(knob.dial.path) + step * notches);
  }

  private armInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      const drag = this.dragging;
      if (!drag || !pointer.isDown) {
        return;
      }
      const { min, max } = tuning.range(drag.knob.dial);
      // Up or right raises it; two hundred pixels is the whole sweep.
      const moved = (drag.y - pointer.y + (pointer.x - drag.x)) / 200;
      this.turn(drag.knob.dial.path, drag.from + moved * (max - min));
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.dragging = null;
    });
    const keyboard = this.input.keyboard;
    const onKey = (event: KeyboardEvent): void => {
      const knob = this.knobs[this.focused];
      const fast = event.shiftKey ? 10 : 1;
      switch (event.code) {
        case 'ArrowLeft':
          this.focused = Math.max(0, this.focused - 1);
          break;
        case 'ArrowRight':
          this.focused = Math.min(this.knobs.length - 1, this.focused + 1);
          break;
        case 'ArrowUp':
          if (knob) this.nudge(knob, fast);
          break;
        case 'ArrowDown':
          if (knob) this.nudge(knob, -fast);
          break;
        case 'Escape':
          this.close();
          return;
        default:
          return;
      }
      event.preventDefault?.();
      this.refresh();
    };
    keyboard?.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard?.off('keydown', onKey));
  }

  private refresh(): void {
    const copy = t().tuning;
    this.knobs.forEach((knob, i) => {
      const { dial } = knob;
      const scale = (knob.arc.getData('scale') as number) ?? 1;
      const r = RADIUS * scale;
      const { min, max } = tuning.range(dial);
      const value = tuning.valueOf(dial.path);
      const share = Phaser.Math.Clamp((value - min) / (max - min), 0, 1);
      const drafted = dial.path in tuning.draft;
      const g = knob.arc;
      g.clear();
      g.fillStyle(i === this.focused ? COLORS.panelActive : COLORS.panel, 1);
      g.fillCircle(knob.x, knob.y, r);
      g.lineStyle(4, 0x2b3445, 1);
      g.beginPath();
      g.arc(knob.x, knob.y, r, SWEEP_FROM, SWEEP_FROM + SWEEP, false);
      g.strokePath();
      g.lineStyle(4, drafted ? DRAFT : SHARED, 1);
      g.beginPath();
      g.arc(knob.x, knob.y, r, SWEEP_FROM, SWEEP_FROM + SWEEP * share, false);
      g.strokePath();
      // Where everyone's value sits on the sweep: a tick to turn back to.
      const home = SWEEP_FROM + SWEEP * Phaser.Math.Clamp((tuning.sharedOf(dial.path) - min) / (max - min), 0, 1);
      g.lineStyle(2, 0xf4f1e8, 0.8);
      g.lineBetween(knob.x + Math.cos(home) * (r - 6), knob.y + Math.sin(home) * (r - 6), knob.x + Math.cos(home) * (r + 4), knob.y + Math.sin(home) * (r + 4));
      if (i === this.focused) {
        g.lineStyle(2, 0xf4f1e8, 1);
        g.strokeCircle(knob.x, knob.y, r + 7);
      }
      knob.value.setText(this.format(dial, value)).setColor(drafted ? '#ffb347' : COLORS.text);
      fitText(knob.value.setScale(1), r * 2 - 4, 0);
    });

    const page = `page:${this.page}`;
    this.tabPlates.forEach((plate, id) => {
      const on = id === `tab:${this.tab}` || (this.tab === 'skills' && id === page);
      if (id.startsWith('tab:') || id.startsWith('page:')) {
        plate.setStrokeStyle(2, on ? COLORS.accentFill : COLORS.panelEdge, 1);
      }
    });

    const drafted = Object.keys(tuning.draft).length;
    const when = tuning.sharedAt ? new Date(tuning.sharedAt).toLocaleString() : copy.never;
    this.status.setText(
      `${drafted > 0 ? fill(copy.drafting, { count: drafted }) : copy.clean}   ·   ${fill(copy.sharedAt, { when })}`,
    );
    this.publishLabel?.setText(this.armed ? copy.publishConfirm : copy.publish).setColor(this.armed ? COLORS.accent : COLORS.text);
    if (this.dpsLine) {
      this.dpsLine.setText(this.dpsText());
      fitText(this.dpsLine.setScale(1), this.scale.width - 16);
    }
  }

  /**
   * The DPS line. On a skill's page, that skill: in this run when it is in
   * hand (every fold the run fights with), and otherwise at level 1 off the
   * dials as they stand. On the common page and the other tabs, every skill
   * in hand — or, from the title, every skill at level 1.
   */
  private dpsText(): string {
    const copy = t().tuning;
    const run = this.payload.dps?.() ?? [];
    const grouped = (value: number) => Math.round(value).toLocaleString('en-US');
    const one = (id: SkillId): string => {
      const held = run.find((line) => line.id === id);
      return held
        ? fill(copy.dpsRun, { skill: skillName(id), dps: grouped(held.dps) })
        : fill(copy.dpsBase, { skill: skillName(id), dps: grouped(TuningScene.baseDps(id)) });
    };
    if (this.tab === 'skills' && this.page !== 'common') {
      return one(this.page as SkillId);
    }
    const ids = run.length > 0 ? run.map((line) => line.id) : ALL_SKILLS.map((skill) => skill.id);
    return `DPS — ${ids.map((id) => {
      const held = run.find((line) => line.id === id);
      return `${skillName(id)} ${grouped(held ? held.dps : TuningScene.baseDps(id))}`;
    }).join('   ')}`;
  }

  /** A skill at level 1 off the dials as they stand: its base line and its 피해 배율. */
  private static baseDps(id: SkillId): number {
    const base = SKILL_BASE[id];
    return dpsFromStats({ ...base, damage: base.damage * (BALANCE.damageScale[id] ?? 1) });
  }

  private format(dial: DialSpec, value: number): string {
    switch (dial.kind) {
      case 'chance': {
        const pct = value * 100;
        return `${pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
      }
      case 'scale':
        return `×${value.toFixed(2)}`;
      case 'ms':
        return `${(value / 1000).toFixed(2)}s`;
      case 'count':
        return String(Math.round(value));
      default:
        return value >= 100 ? String(Math.round(value)) : String(Number(value.toFixed(2)));
    }
  }

  /** What a dial is called: a stat's name on a skill page, the thing's own name otherwise. */
  private labelOf(dial: DialSpec): string {
    const copy = t().tuning;
    const parts = dial.path.split('.');
    const [root, a, b] = parts as [string, string, string | undefined];
    if (root === 'SKILL_BASE' && b) {
      return copy.fields[b as keyof typeof copy.fields] ?? b;
    }
    if (root === 'BALANCE' && a === 'damageScale') {
      return copy.fields.damageScale;
    }
    if (root === 'ORBS') {
      return orbShort(a as OrbId);
    }
    if (root === 'BONES') {
      return boneShort(a as BoneId);
    }
    if (root === 'GEAR') {
      return gearName(a as GearId);
    }
    return (copy.labels as Record<string, string>)[dial.path] ?? dial.path;
  }

  private tabButton(id: string, x: number, y: number, w: number, h: number, text: string, onPress: () => void): Phaser.GameObjects.Rectangle {
    const plate = this.add
      .rectangle(x, y, w, h, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    fitText(label, w - 6, 0);
    plate.setData('label', label);
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
    this.tabPlates.set(id, plate);
    return plate;
  }

  private reopen(where: { tab: DialTab; page: string }): void {
    this.scene.restart({ ...this.payload, ...where });
  }

  private cancelDraft(): void {
    tuning.clearDraft();
    this.armed = false;
    this.refresh();
  }

  /** First press asks, the second makes the draft everyone's. */
  public async publish(): Promise<void> {
    if (!this.armed) {
      this.armed = true;
      this.refresh();
      return;
    }
    this.armed = false;
    const ok = await tuning.publish();
    if (!this.scene.isActive()) {
      return;
    }
    this.refresh();
    this.status.setText(ok ? t().tuning.published : t().tuning.publishFailed);
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
