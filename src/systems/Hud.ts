import Phaser from 'phaser';

import { COLORS, DEPTH, HUD, SKILL_ICONS, SKILL_MASTERY, TEXT, TEXTURES } from '@/config';
import { fill, masteryText, t } from '@/i18n';
import type { Progression } from '@/systems/Progression';
import { SKILLS, type SkillId } from '@/weapons/skills';

/** The edge a skill at SKILL_MASTERY.level wears. */
const MASTERY_GOLD = 0xffc43a;

export interface LoadoutEntry {
  readonly id: SkillId;
  readonly name: string;
  /** Picks taken on this skill, the pickup included. */
  readonly level: number;
  /** Damage per second, counting everything the skill touches at once. */
  readonly dps: number;
  /** The lines of its hover card: how that DPS is reached, step by step. */
  readonly breakdown: readonly string[];
}

/** One skill in the bar. */
interface SkillSlot {
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly icon: Phaser.GameObjects.Image;
  readonly level: Phaser.GameObjects.Text;
}

const SLOT = HUD.skillSlot;
const SLOT_GAP = HUD.skillGap;
/** The most skills the bar ever has to hold: all of them. */
const MAX_SLOTS = Object.keys(SKILLS).length;

/** Whole numbers where they are whole, one decimal where they are not. */
const round = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

/**
 * Camera-fixed run readout: the skills in hand top-left as a row of icons,
 * the clock and enemy count top-centre, and a full-width XP bar along the
 * bottom edge.
 *
 * Each skill is its icon with its level in the corner. Pointing at one —
 * the mouse over it, or a finger held on it — opens a card that spells out
 * its DPS the way the run computes it, and the run holds still while the
 * card is open under a mouse (`onInspect`), so it can be read in the middle
 * of a fight. A finger shows the card without the hold: on a phone the
 * same thumb is steering, and a run that froze under it would be a trap.
 *
 * The player's own level and health are not here — they ride above the
 * player, drawn by Player itself.
 */
export class Hud {
  private readonly xpBar: Phaser.GameObjects.Graphics;
  /** The skills in hand. Public so a test can point at one. */
  public readonly slots: SkillSlot[] = [];
  /** The hover card, and what it says. Public for tests. */
  public readonly card: Phaser.GameObjects.Rectangle;
  public readonly cardText: Phaser.GameObjects.Text;
  private readonly clockLabel: Phaser.GameObjects.Text;
  private readonly enemiesLabel: Phaser.GameObjects.Text;
  private readonly progression: Progression;
  private readonly viewWidth: number;
  private readonly viewHeight: number;
  private readonly onInspect: (hold: boolean) => void;
  /** Whether the open card is holding the run still. */
  private holding = false;
  private loadout: ReadonlyArray<LoadoutEntry> = [];
  /** Which slot the card is open on, or -1. Public for tests. */
  public pointed = -1;

  private elapsedMs = 0;

  public constructor(
    scene: Phaser.Scene,
    progression: Progression,
    onInspect: (hold: boolean) => void = () => {},
  ) {
    this.progression = progression;
    this.onInspect = onInspect;
    this.viewWidth = scene.scale.width;
    this.viewHeight = scene.scale.height;

    this.xpBar = scene.add.graphics().setScrollFactor(0).setDepth(DEPTH.ui);

    // On a phone the clock is only two hundred pixels from the left edge,
    // so the bar goes under it rather than through it.
    const narrow = this.viewWidth < HUD.narrowWidth;
    const left = narrow ? HUD.margin : HUD.leftInset;
    const top = narrow ? HUD.narrowTop : HUD.margin;

    for (let i = 0; i < MAX_SLOTS; i++) {
      const x = left + SLOT / 2 + i * (SLOT + SLOT_GAP);
      const y = top + SLOT / 2;
      const plate = scene.add
        .rectangle(x, y, SLOT, SLOT, COLORS.panel, 0.75)
        .setStrokeStyle(1, COLORS.panelEdge, 1)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui)
        .setInteractive({ useHandCursor: true })
        .setVisible(false);
      const icon = scene.add
        .image(x, y, TEXTURES.skillOrb)
        .setDisplaySize(SLOT - 8, SLOT - 8)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui + 1)
        .setVisible(false);
      const level = scene.add
        .text(x + SLOT / 2 - 2, y + SLOT / 2 - 1, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.text,
        })
        .setOrigin(1, 1)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui + 2)
        .setVisible(false);

      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, (pointer: Phaser.Input.Pointer) =>
        this.point(i, pointer.wasTouch),
      );
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.point(-1));
      // A finger: the card is up for as long as it is held down.
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
        if (pointer.wasTouch) {
          this.point(-1);
        }
      });
      this.slots.push({ plate, icon, level });
    }

    this.card = scene.add
      .rectangle(0, 0, 10, 10, COLORS.panel, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 5)
      .setVisible(false);
    this.cardText = scene.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.text,
        lineSpacing: 4,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 6)
      .setVisible(false);

    this.clockLabel = scene.add
      .text(this.viewWidth / 2, HUD.margin - 4, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.heading,
        color: COLORS.text,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);

    // Under the clock, where the eye already is during a wave.
    this.enemiesLabel = scene.add
      .text(this.viewWidth / 2, HUD.margin + HUD.countGap, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.muted,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);
  }

  /** "타격  Lv 1  DPS 190", one line per skill — what the bar stands for. Public for tests. */
  public get loadoutText(): string {
    const copy = t().hud;
    return this.loadout
      .map((s) => `${s.name}  ${fill(copy.level, { level: s.level })}  ${fill(copy.dps, { dps: round(s.dps) })}`)
      .join('\n');
  }

  /** Where the bar is on screen, for layout checks. */
  public get barBounds(): { x: number; y: number; right: number; bottom: number } {
    const shown = this.slots.filter((slot) => slot.plate.visible);
    const first = this.slots[0]!.plate;
    const last = (shown[shown.length - 1] ?? this.slots[0]!).plate;
    return {
      x: first.x - SLOT / 2,
      y: first.y - SLOT / 2,
      right: last.x + SLOT / 2,
      bottom: first.y + SLOT / 2,
    };
  }

  /** Starts the clock partway in, when a saved run is resumed. */
  public seed(elapsedMs: number): void {
    this.elapsedMs = elapsedMs;
  }

  public update(delta: number, enemies: number, loadout: ReadonlyArray<LoadoutEntry>): void {
    this.elapsedMs += delta;
    this.loadout = loadout;

    const total = Math.floor(this.elapsedMs / 1000);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    this.clockLabel.setText(`${mm}:${ss}`);

    const copy = t().hud;
    this.enemiesLabel.setText(fill(copy.enemies, { count: enemies }));

    this.slots.forEach((slot, i) => {
      const entry = loadout[i];
      slot.plate.setVisible(entry !== undefined);
      slot.icon.setVisible(entry !== undefined);
      slot.level.setVisible(entry !== undefined);
      if (!entry) {
        return;
      }
      const key = SKILL_ICONS[entry.id]?.key ?? TEXTURES.skillOrb;
      if (slot.icon.texture.key !== key) {
        slot.icon.setTexture(key).setDisplaySize(SLOT - 8, SLOT - 8);
      }
      slot.level.setText(String(entry.level));
      // 각성: gold round the icon and on the number.
      const mastered = entry.level >= SKILL_MASTERY.level;
      slot.plate.setStrokeStyle(mastered ? 2 : 1, mastered ? MASTERY_GOLD : COLORS.panelEdge, 1);
      slot.level.setColor(mastered ? '#ffd76a' : COLORS.text);
    });

    // The card follows its skill: a level taken mid-hover is read at once.
    if (this.pointed >= 0) {
      this.drawCard(this.pointed);
    }

    this.drawXpBar();
  }

  /**
   * Opens the card on one skill, or closes it with -1. Public so a test can
   * point without a mouse.
   */
  public point(index: number, touch = false): void {
    const open = index >= 0 && index < this.loadout.length;
    this.pointed = open ? index : -1;

    this.card.setVisible(open);
    this.cardText.setVisible(open);
    if (open) {
      this.drawCard(index);
    }

    const hold = open && !touch;
    if (hold !== this.holding) {
      this.holding = hold;
      this.onInspect(hold);
    }
  }

  private drawCard(index: number): void {
    const entry = this.loadout[index];
    const slot = this.slots[index];
    if (!entry || !slot) {
      return;
    }

    const copy = t().hud;
    this.cardText.setText([
      `${entry.name}  ${fill(copy.level, { level: entry.level })}`,
      ...entry.breakdown,
      ...(entry.level >= SKILL_MASTERY.level ? [fill(t().mastery.card, { effect: masteryText(entry.id) })] : []),
    ]);

    const pad = 8;
    const width = Math.ceil(this.cardText.width) + pad * 2;
    const height = Math.ceil(this.cardText.height) + pad * 2;
    // Under the bar, starting at the skill, and pulled back on screen.
    const x = Phaser.Math.Clamp(slot.plate.x - SLOT / 2, 4, Math.max(4, this.viewWidth - width - 4));
    const y = slot.plate.y + SLOT / 2 + 6;
    this.card.setPosition(x, y).setSize(width, height);
    this.cardText.setPosition(x + pad, y + pad);
  }

  private drawXpBar(): void {
    const ratio = Phaser.Math.Clamp(this.progression.xp / this.progression.xpToNext, 0, 1);
    const top = this.viewHeight - HUD.xpBarHeight;

    this.xpBar.clear();
    this.xpBar.fillStyle(COLORS.barTrack, 1);
    this.xpBar.fillRect(0, top, this.viewWidth, HUD.xpBarHeight);

    if (ratio > 0) {
      this.xpBar.fillStyle(COLORS.xpFill, 1);
      this.xpBar.fillRect(0, top, this.viewWidth * ratio, HUD.xpBarHeight);
    }
  }
}
