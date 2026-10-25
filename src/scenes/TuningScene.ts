import Phaser from 'phaser';

import { DAILY_RULES,
  BALANCE,
  COLORS,
  DEPTH,
  DIALS,
  SPAWN_TABLE,
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
import { dailyEnemyText, boneName, boneShort, enemyName, fill, gearName, orbName, orbShort, skillName, t } from '@/i18n';
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
/** The magnified dial reads 0 to 100 across a dial's whole range. */
const ZOOM_STEPS = 100;

/** The magnified dial and what is drawn on it (refresh redraws them). */
interface Zoom {
  readonly dial: DialSpec;
  readonly root: Phaser.GameObjects.Container;
  readonly arc: Phaser.GameObjects.Graphics;
  readonly position: Phaser.GameObjects.Text;
  readonly value: Phaser.GameObjects.Text;
  readonly facts: Phaser.GameObjects.Text;
  readonly x: number;
  readonly y: number;
  readonly r: number;
}
/** The 스킬 tab's pages: the skills with dials, and 공통 only while some dial is on it. */
const pageSkills = (): string[] =>
  ['meleeStrike', 'fireball', 'chainLightning', 'iceSpear', 'voidOrb', 'thunderStrike', 'drone', 'poisonNova', 'common'].filter((page) =>
    DIALS.some((dial) => dial.tab === 'skills' && dial.skill === page),
  );

/**
 * 밸런스 — the admin's dials, over the title or a paused run.
 *
 * A tab per kind of number (스킬 · 적 · 드랍), and on 스킬 a page per skill.
 * A knob is wheeled, or stepped with ↑ ↓ once the arrows have picked it;
 * pressing it (or Enter) opens it magnified (0.89, the user's ask): what it
 * does written out, and a big dial that reads 0 to 100 across its range —
 * dragged round, wheeled, stepped by ±1 / ±10, or set back to everyone's
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
  /** The magnified dial, while one is open. Public so a test can read it. */
  public zoom: Zoom | null = null;
  /** Where the magnified dial stands, 0–100: kept, so a coarse dial still steps one at a time. */
  public zoomPosition = 0;

  private payload!: TuningSceneData;
  private grid?: Phaser.GameObjects.Container;
  private tabPlates = new Map<string, Phaser.GameObjects.Rectangle>();
  private gridTop = 0;
  /** A drag round the magnified dial is under way. */
  private turning = false;
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
    this.zoom = null;
    this.zoomPosition = 0;
    this.turning = false;
    this.tabPlates = new Map();
    this.dpsLine = undefined;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => (this.zoom ? this.closeZoom() : this.close()));
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
    // 스킬 · 적 · 드랍 · 적 강화 (0.127).
    const tabs: DialTab[] = ['skills', 'enemies', 'drops', 'daily'];
    const tabGap = Math.min(104, (width - 24) / tabs.length);
    tabs.forEach((tab, i) => {
      const x = width / 2 + (i - (tabs.length - 1) / 2) * tabGap;
      this.tabButton(`tab:${tab}`, x, 66, tabGap - 8, 28, copy.tabs[tab], () => this.reopen({ tab, page: this.page }));
    });
    let y = 94;
    if (this.tab === 'skills') {
      const size = 30;
      const gap = 6;
      const pages = pageSkills();
      const left = width / 2 - (pages.length * (size + gap) - gap) / 2 + size / 2;
      pages.forEach((id, i) => {
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
    let cols = Math.max(1, Math.min(dials.length, Math.floor((width - 24) / CELL_W)));
    // 적 강화 come in pairs, a multiplier and its switch: a row holds whole pairs.
    if (this.tab === 'daily' && cols > 1 && cols % 2 === 1) {
      cols -= 1;
    }
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
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        this.focused = i;
        this.press(dial);
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

  /** A knob pressed: a switch flips (켬/끔, 0.127); any other opens magnified. Public so a test can. */
  public press(dial: DialSpec): void {
    if (dial.kind === 'toggle') {
      this.turn(dial.path, tuning.valueOf(dial.path) >= 0.5 ? 0 : 1);
      return;
    }
    this.openZoom(dial);
  }

  /** Where a value sits on the magnified dial, 0–100. */
  private positionOf(dial: DialSpec, value = tuning.valueOf(dial.path)): number {
    const { min, max } = tuning.range(dial);
    return Math.round(Phaser.Math.Clamp((value - min) / (max - min), 0, 1) * ZOOM_STEPS);
  }

  /** Sets the magnified dial to a position, 0–100, and its dial to the value there. Public so a test can. */
  public setZoomPosition(position: number): void {
    const zoom = this.zoom;
    if (!zoom) {
      return;
    }
    this.zoomPosition = Phaser.Math.Clamp(Math.round(position), 0, ZOOM_STEPS);
    const { min, max } = tuning.range(zoom.dial);
    this.turn(zoom.dial.path, min + (this.zoomPosition / ZOOM_STEPS) * (max - min));
  }

  /**
   * Opens a dial magnified: its name, what it does, and the big 0–100 dial
   * with the buttons round it. Public so a test can.
   */
  public openZoom(dial: DialSpec): void {
    this.closeZoom();
    const { width, height } = this.scale;
    const copy = t().tuning;
    const depth = DEPTH.ui + 20;
    const root = this.add.container(0, 0).setDepth(depth);
    // A press outside the panel closes it; one on the panel does nothing.
    const scrim = this.add.rectangle(0, 0, width, height, 0x05070b, 0.72).setOrigin(0, 0).setInteractive();
    scrim.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.closeZoom());
    const w = Math.min(width - 24, 480);
    const h = Math.min(height - 24, 600);
    const left = width / 2 - w / 2;
    const top = height / 2 - h / 2;
    const panel = this.add
      .rectangle(width / 2, height / 2, w, h, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setInteractive();
    root.add([scrim, panel]);

    let y = top + 22;
    const title = this.add
      .text(width / 2, y, this.labelOf(dial), { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.heading, color: COLORS.gearText })
      .setOrigin(0.5);
    fitText(title, w - 16, 0);
    y += 22;
    const path = this.add
      .text(width / 2, y, dial.path, { fontFamily: 'ui-monospace, monospace', fontSize: TEXT.size.hint, color: COLORS.muted })
      .setOrigin(0.5);
    fitText(path, w - 16, 0);
    y += 16;
    const detail = this.add
      .text(left + 16, y, this.detailOf(dial), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.text,
        wordWrap: { width: w - 32, useAdvancedWrap: true },
        lineSpacing: 2,
      })
      .setOrigin(0, 0);
    y += detail.height + 8;
    root.add([title, path, detail]);

    // From the bottom up: the two ways out, the step buttons, the facts line.
    const bottom = top + h - 12;
    const exitY = bottom - 17;
    const stepY = exitY - 42;
    const factsY = stepY - 30;
    const facts = this.add
      .text(width / 2, factsY, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted, align: 'center' })
      .setOrigin(0.5);
    root.add(facts);
    const steps = [-10, -1, 1, 10];
    const stepW = Math.min(64, (w - 40) / steps.length - 8);
    steps.forEach((delta, i) => {
      const x = width / 2 + (i - (steps.length - 1) / 2) * (stepW + 8);
      root.add(this.zoomButton(x, stepY, stepW, 32, delta > 0 ? `+${delta}` : String(delta), () => this.setZoomPosition(this.zoomPosition + delta)));
    });
    const exitW = Math.min(160, (w - 40) / 2);
    root.add(this.zoomButton(width / 2 - exitW / 2 - 6, exitY, exitW, 34, copy.zoom.reset, () => {
      this.turn(dial.path, tuning.sharedOf(dial.path));
      this.zoomPosition = this.positionOf(dial);
      this.refresh();
    }));
    root.add(this.zoomButton(width / 2 + exitW / 2 + 6, exitY, exitW, 34, copy.zoom.close, () => this.closeZoom()));

    // The dial takes whatever height is left between the words and the facts.
    const room = factsY - 22 - y;
    const r = Phaser.Math.Clamp(Math.min(room / 2 - 14, w / 2 - 50), 46, 110);
    const cx = width / 2;
    // Centred in that room, so a tall window does not leave a gap under it.
    const cy = y + 14 + r + Math.max(0, (room - 2 * (r + 14)) / 2);
    const arc = this.add.graphics();
    const position = this.add
      .text(cx, cy - 8, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.screen, color: COLORS.text })
      .setOrigin(0.5);
    const value = this.add
      .text(cx, cy + r * 0.4, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.text })
      .setOrigin(0.5);
    // The 0–100 marks round the sweep, every ten.
    const marks: Phaser.GameObjects.Text[] = [];
    for (let mark = 0; mark <= ZOOM_STEPS; mark += 10) {
      const angle = SWEEP_FROM + (SWEEP * mark) / ZOOM_STEPS;
      marks.push(
        this.add
          .text(cx + Math.cos(angle) * (r + 17), cy + Math.sin(angle) * (r + 17), String(mark), {
            fontFamily: 'system-ui, sans-serif',
            fontSize: TEXT.size.hint,
            color: COLORS.muted,
          })
          .setOrigin(0.5)
          .setScale(r < 70 ? 0.8 : 1),
      );
    }
    // Pressed anywhere round the dial, it turns to where the pointer points.
    const grip = this.add.circle(cx, cy, r + 26, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    grip.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.turning = true;
      this.pointTo(pointer);
    });
    grip.on(Phaser.Input.Events.GAMEOBJECT_POINTER_WHEEL, (_p: unknown, _dx: number, dy: number) => {
      this.setZoomPosition(this.zoomPosition + (dy < 0 ? 1 : -1));
    });
    root.add([arc, ...marks, position, value, grip]);

    this.zoom = { dial, root, arc, position, value, facts, x: cx, y: cy, r };
    this.zoomPosition = this.positionOf(dial);
    this.refresh();
  }

  /** Closes the magnified dial. Public so a test can. */
  public closeZoom(): void {
    this.zoom?.root.destroy();
    this.zoom = null;
    this.turning = false;
  }

  /** Turns the magnified dial to where a pointer points; the gap at the bottom goes to the nearer end. */
  private pointTo(pointer: Phaser.Input.Pointer): void {
    const zoom = this.zoom;
    if (!zoom) {
      return;
    }
    const angle = Math.atan2(pointer.y - zoom.y, pointer.x - zoom.x);
    const along = Phaser.Math.Angle.Wrap(angle - SWEEP_FROM);
    const turned = along < 0 ? along + Math.PI * 2 : along;
    const share = turned <= SWEEP ? turned / SWEEP : turned - SWEEP < Math.PI * 2 - turned ? 1 : 0;
    this.setZoomPosition(share * ZOOM_STEPS);
  }

  private zoomButton(x: number, y: number, w: number, h: number, text: string, onPress: () => void): Phaser.GameObjects.Container {
    const plate = this.add
      .rectangle(0, 0, w, h, COLORS.panelActive, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, text, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text })
      .setOrigin(0.5);
    fitText(label, w - 6, 0);
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
    return this.add.container(x, y, [plate, label]).setData('label', label);
  }

  /** Draws the magnified dial as it stands. */
  private drawZoom(zoom: Zoom): void {
    const copy = t().tuning;
    const { dial, arc, x, y, r } = zoom;
    const value = tuning.valueOf(dial.path);
    const drafted = dial.path in tuning.draft;
    const share = this.zoomPosition / ZOOM_STEPS;
    arc.clear();
    arc.fillStyle(COLORS.panelActive, 1);
    arc.fillCircle(x, y, r - 8);
    arc.lineStyle(12, 0x2b3445, 1);
    arc.beginPath();
    arc.arc(x, y, r, SWEEP_FROM, SWEEP_FROM + SWEEP, false);
    arc.strokePath();
    arc.lineStyle(12, drafted ? DRAFT : SHARED, 1);
    arc.beginPath();
    arc.arc(x, y, r, SWEEP_FROM, SWEEP_FROM + SWEEP * share, false);
    arc.strokePath();
    // A small tick every five, a long one every ten.
    for (let mark = 0; mark <= ZOOM_STEPS; mark += 5) {
      const angle = SWEEP_FROM + (SWEEP * mark) / ZOOM_STEPS;
      const inner = r - (mark % 10 === 0 ? 14 : 10);
      arc.lineStyle(mark % 10 === 0 ? 2 : 1, 0xf4f1e8, mark % 10 === 0 ? 0.7 : 0.35);
      arc.lineBetween(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner, x + Math.cos(angle) * (r - 7), y + Math.sin(angle) * (r - 7));
    }
    // Everyone's value: a white notch across the ring to turn back to.
    const home = SWEEP_FROM + SWEEP * (this.positionOf(dial, tuning.sharedOf(dial.path)) / ZOOM_STEPS);
    arc.lineStyle(3, 0xf4f1e8, 1);
    arc.lineBetween(x + Math.cos(home) * (r - 9), y + Math.sin(home) * (r - 9), x + Math.cos(home) * (r + 9), y + Math.sin(home) * (r + 9));
    // The pointer, from the middle to where it stands.
    const at = SWEEP_FROM + SWEEP * share;
    arc.lineStyle(4, drafted ? DRAFT : SHARED, 1);
    arc.lineBetween(x + Math.cos(at) * r * 0.55, y + Math.sin(at) * r * 0.55, x + Math.cos(at) * (r - 16), y + Math.sin(at) * (r - 16));
    arc.fillStyle(drafted ? DRAFT : SHARED, 1);
    arc.fillCircle(x + Math.cos(at) * r, y + Math.sin(at) * r, 9);

    zoom.position.setText(String(this.zoomPosition)).setColor(drafted ? '#ffb347' : COLORS.text);
    zoom.value.setText(this.format(dial, value)).setColor(drafted ? '#ffb347' : COLORS.text);
    fitText(zoom.value.setScale(1), r * 1.4, 0);
    const { min, max } = tuning.range(dial);
    zoom.facts.setText(
      fill(copy.zoom.facts, {
        shared: this.format(dial, tuning.sharedOf(dial.path)),
        base: this.format(dial, tuning.defaultOf(dial.path)),
        min: this.format(dial, min),
        max: this.format(dial, max),
      }),
    );
    fitText(zoom.facts.setScale(1), Math.min(this.scale.width - 24, 480) - 16, 0);
  }

  /**
   * What a dial does, written out: a skill's stat by field, an 등장 시점, a
   * 구슬 · 뼈다귀 · 검 by its name, the rest by path.
   */
  private detailOf(dial: DialSpec): string {
    const copy = t().tuning;
    const [root, a, b] = dial.path.split('.') as [string, string, string | undefined];
    if (root === 'SKILL_BASE' && b) {
      return fill(copy.fieldDetails[b] ?? '', { skill: skillName(a as SkillId) });
    }
    if (root === 'BALANCE' && a === 'damageScale' && b) {
      return fill(copy.detailDamageScale, { skill: skillName(b as SkillId) });
    }
    if (root === 'BALANCE' && a === 'attackCoeff' && b) {
      return fill(copy.detailAttackCoeff, { skill: skillName(b as SkillId) });
    }
    if (root === 'DAILY_RULES') {
      const buff = DAILY_RULES.enemyBuffs[Number(b)];
      const name = buff ? dailyEnemyText(buff) : dial.path;
      return fill(dial.kind === 'toggle' ? copy.detailDailyOn : copy.detailDailyScale, { buff: name });
    }
    if (root === 'SPAWN_TABLE') {
      const row = SPAWN_TABLE[Number(a)];
      return row ? fill(copy.detailUnlock, { kind: enemyName(row.kind) }) : '';
    }
    if (root === 'ORBS') {
      return fill(copy.detailOrb, { name: orbName(a as OrbId) });
    }
    if (root === 'BONES') {
      return fill(copy.detailBone, { name: boneName(a as BoneId) });
    }
    if (root === 'GEAR') {
      return fill(copy.detailGear, { name: gearName(a as GearId) });
    }
    return copy.details[dial.path] ?? '';
  }

  private nudge(knob: Knob, notches: number): void {
    const { step } = tuning.range(knob.dial);
    this.turn(knob.dial.path, tuning.valueOf(knob.dial.path) + step * notches);
  }

  private armInput(): void {
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.turning && pointer.isDown) {
        this.pointTo(pointer);
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => {
      this.turning = false;
    });
    const keyboard = this.input.keyboard;
    const onKey = (event: KeyboardEvent): void => {
      const knob = this.knobs[this.focused];
      const fast = event.shiftKey ? 10 : 1;
      // The magnified dial has the keys while it is open.
      if (this.zoom) {
        switch (event.code) {
          case 'ArrowUp':
          case 'ArrowRight':
            this.setZoomPosition(this.zoomPosition + fast);
            break;
          case 'ArrowDown':
          case 'ArrowLeft':
            this.setZoomPosition(this.zoomPosition - fast);
            break;
          case 'Escape':
          case 'Enter':
          case 'Space':
            this.closeZoom();
            break;
          default:
            return;
        }
        event.preventDefault?.();
        return;
      }
      switch (event.code) {
        case 'Enter':
        case 'Space':
          if (knob) this.press(knob.dial);
          break;
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
    if (this.zoom) {
      this.drawZoom(this.zoom);
    }
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
      case 'toggle':
        return value >= 0.5 ? t().tuning.on : t().tuning.off;
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
    if (root === 'BALANCE' && a === 'attackCoeff') {
      return copy.fields.attackCoeff;
    }
    // 적 강화: the buff as players read it — its number follows the dial.
    if (root === 'DAILY_RULES') {
      const buff = DAILY_RULES.enemyBuffs[Number(b)];
      const name = buff ? dailyEnemyText(buff) : dial.path;
      // The switch sits beside its multiplier: its name without the number.
      return parts[3] === 'on' ? fill(copy.dailyOn, { buff: name.replace(/\s*\+\d+%/, '') }) : name;
    }
    if (root === 'SPAWN_TABLE') {
      const row = SPAWN_TABLE[Number(a)];
      return row ? fill(copy.unlockAt, { kind: enemyName(row.kind) }) : dial.path;
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
