import Phaser from 'phaser';

import {
  COLORS,
  DEPTH,
  HUD,
  SKILL_ICONS,
  TEXT,
  TEXTURES,
} from '@/config';
import { fill, heldBonusText, masteryText, t } from '@/i18n';
import type { Progression } from '@/systems/Progression';
import { SKILLS, type SkillId } from '@/weapons/skills';

/** The edge a skill at SKILL_MASTERY.level wears. */
const MASTERY_GOLD = 0xffc43a;

export interface LoadoutEntry {
  readonly id: SkillId;
  readonly name: string;
  /** Picks taken on this skill, the pickup included. */
  readonly level: number;
  /** How far it is awakened (GameScene.masteryOf): 0, 1 or 2. Only the main skill ever is. */
  readonly mastery: 0 | 1 | 2;
  /** Damage per second, counting everything the skill touches at once. */
  readonly dps: number;
  /** The lines of its hover card: how that DPS is reached, step by step. */
  readonly breakdown: readonly string[];
}

/** What kind of thing is acting on the survivor. */
export type EffectKind = 'gear' | 'passive' | 'bone' | 'buff' | 'debuff';

/** One thing acting on the survivor: an icon left of the skills, and its card. */
export interface EffectEntry {
  readonly id: string;
  readonly kind: EffectKind;
  readonly icon: string;
  /** The card: a heading, then a line each. */
  readonly title: string;
  readonly lines: readonly string[];
  /** A number in the icon's corner (the 재능의 파편 held, 0.106). */
  readonly count?: number;
  /** A tint for an icon drawn pale to be coloured (the shard's). */
  readonly tint?: number;
}

/** One effect's icon. */
interface EffectSlot {
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly icon: Phaser.GameObjects.Image;
  readonly count: Phaser.GameObjects.Text;
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
const EFFECT = HUD.effectSlot;
/** The most effects shown at once; more than this is not a run anyone has had. */
const MAX_EFFECTS = 10;

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
  /** What is acting on the survivor, left of the skills. Public so a test can point at one. */
  public readonly effectSlots: EffectSlot[] = [];
  /** Which effect the card is open on, or -1. Public for tests. */
  public pointedEffect = -1;
  private effects: ReadonlyArray<EffectEntry> = [];
  /** Where the row starts, and the line it sits on. */
  private readonly rowLeft: number;
  private readonly rowTop: number;
  /** How far right the bar may run before it would meet the clock. */
  private readonly rowRoom: number;
  /** The layout last drawn, so it is only moved when it changes. */
  private laidOut = '';
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
    this.rowLeft = left;
    this.rowTop = top;
    // Beside the clock, the row stops short of it; under it, at the edge.
    this.rowRoom = narrow ? this.viewWidth - HUD.margin : this.viewWidth / 2 - 48;

    for (let i = 0; i < MAX_SLOTS; i++) {
      const x = left + SLOT / 2 + i * (SLOT + SLOT_GAP);
      const y = top + SLOT / 2;
      const plate = scene.add
        .rectangle(x, y, SLOT, SLOT, COLORS.panel, 0.75)
        .setStrokeStyle(1, COLORS.panelEdge, 1)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui)
        .setInteractive({ useHandCursor: true })
        .setData('flat', true)
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

    for (let i = 0; i < MAX_EFFECTS; i++) {
      const plate = scene.add
        .rectangle(0, top + SLOT / 2, EFFECT, EFFECT, COLORS.panel, 0.75)
        .setStrokeStyle(1, COLORS.panelEdge, 1)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui)
        .setInteractive({ useHandCursor: true })
        .setData('flat', true)
        .setVisible(false);
      const icon = scene.add
        .image(0, top + SLOT / 2, TEXTURES.skillOrb)
        .setDisplaySize(EFFECT - 6, EFFECT - 6)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui + 1)
        .setVisible(false);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, (pointer: Phaser.Input.Pointer) =>
        this.pointEffect(i, pointer.wasTouch),
      );
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => this.pointEffect(-1));
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, (pointer: Phaser.Input.Pointer) => {
        if (pointer.wasTouch) {
          this.pointEffect(-1);
        }
      });
      const count = scene.add
        .text(0, 0, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text, stroke: TEXT.outline.color, strokeThickness: 3 })
        .setOrigin(1, 1)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui + 2)
        .setVisible(false);
      this.effectSlots.push({ plate, icon, count });
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

  public update(
    delta: number,
    enemies: number,
    loadout: ReadonlyArray<LoadoutEntry>,
    effects: ReadonlyArray<EffectEntry> = [],
  ): void {
    this.elapsedMs += delta;
    this.loadout = loadout;
    this.effects = effects;
    this.layOut(loadout.length, effects.length);
    this.effectSlots.forEach((slot, i) => {
      const entry = effects[i];
      slot.plate.setVisible(entry !== undefined);
      slot.icon.setVisible(entry !== undefined);
      slot.count.setVisible(entry?.count !== undefined);
      if (!entry) {
        return;
      }
      if (slot.icon.texture.key !== entry.icon) {
        slot.icon.setTexture(entry.icon).setDisplaySize(EFFECT - 6, EFFECT - 6);
      }
      if (entry.tint === undefined) {
        slot.icon.clearTint();
      } else {
        slot.icon.setTint(entry.tint);
      }
      if (entry.count !== undefined) {
        slot.count.setText(String(entry.count));
      }
      const edge = entry.kind === 'buff' || entry.kind === 'debuff' ? HUD.effectEdge[entry.kind] : COLORS.panelEdge;
      slot.plate.setStrokeStyle(entry.kind === 'buff' || entry.kind === 'debuff' ? 2 : 1, edge, 1);
    });
    if (this.pointedEffect >= 0) {
      if (this.pointedEffect < effects.length) {
        this.drawEffectCard(this.pointedEffect);
      } else {
        this.pointEffect(-1);
      }
    }

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
      // 각성: gold round the icon and on the number — thicker at the second.
      const mastered = entry.mastery >= 1;
      slot.plate.setStrokeStyle(entry.mastery === 2 ? 3 : mastered ? 2 : 1, mastered ? MASTERY_GOLD : COLORS.panelEdge, 1);
      slot.level.setColor(mastered ? '#ffd76a' : COLORS.text);
    });

    // The card follows its skill: a level taken mid-hover is read at once.
    if (this.pointed >= 0) {
      this.drawCard(this.pointed);
    }

    this.drawXpBar();
  }

  /**
   * Where the effects and the skills sit: the effects first, then the skills
   * after a gap, on one row while that clears the clock; otherwise the skills
   * keep the row and the effects take one under it.
   */
  private layOut(skills: number, effects: number): void {
    const effectsW = effects > 0 ? effects * EFFECT + (effects - 1) * HUD.effectGap : 0;
    const skillsW = skills > 0 ? skills * SLOT + (skills - 1) * SLOT_GAP : 0;
    const beside = effects === 0 || this.rowLeft + effectsW + HUD.effectsToSkills + skillsW <= this.rowRoom;
    const key = `${skills}/${effects}/${beside}`;
    if (key === this.laidOut) {
      return;
    }
    this.laidOut = key;

    const skillsLeft = beside && effects > 0 ? this.rowLeft + effectsW + HUD.effectsToSkills : this.rowLeft;
    const rowY = this.rowTop + SLOT / 2;
    this.slots.forEach((slot, i) => {
      const x = skillsLeft + SLOT / 2 + i * (SLOT + SLOT_GAP);
      slot.plate.setX(x);
      slot.icon.setX(x);
      slot.level.setX(x + SLOT / 2 - 2);
    });
    const effectY = beside ? rowY : this.rowTop + SLOT + 6 + EFFECT / 2;
    this.effectSlots.forEach((slot, i) => {
      const x = this.rowLeft + EFFECT / 2 + i * (EFFECT + HUD.effectGap);
      slot.plate.setPosition(x, effectY);
      slot.icon.setPosition(x, effectY);
      slot.count.setPosition(x + EFFECT / 2 - 1, effectY + EFFECT / 2 + 1);
    });
  }

  /**
   * Opens the card on one of the survivor's effects, or closes it with -1 —
   * the same card, and the same hold, as a skill's. Public so a test can.
   */
  public pointEffect(index: number, touch = false): void {
    const open = index >= 0 && index < this.effects.length;
    this.pointedEffect = open ? index : -1;
    if (open) {
      this.pointed = -1;
      this.card.setVisible(true);
      this.cardText.setVisible(true);
      this.drawEffectCard(index);
    } else if (this.pointed < 0) {
      this.card.setVisible(false);
      this.cardText.setVisible(false);
    }
    this.hold(open && !touch);
  }

  private drawEffectCard(index: number): void {
    const entry = this.effects[index];
    const slot = this.effectSlots[index];
    if (!entry || !slot) {
      return;
    }
    const kind = t().hud.effectKinds[entry.kind];
    this.cardText.setText([`${entry.title}  ·  ${kind}`, ...entry.lines]);
    this.placeCard(slot.plate.x - EFFECT / 2, slot.plate.y + EFFECT / 2 + 6);
  }

  /** The card under what it is about, pulled back on screen. */
  private placeCard(left: number, top: number): void {
    const pad = 8;
    const width = Math.ceil(this.cardText.width) + pad * 2;
    const height = Math.ceil(this.cardText.height) + pad * 2;
    const x = Phaser.Math.Clamp(left, 4, Math.max(4, this.viewWidth - width - 4));
    this.card.setPosition(x, top).setSize(width, height);
    this.cardText.setPosition(x + pad, top + pad);
  }

  private hold(hold: boolean): void {
    if (hold !== this.holding) {
      this.holding = hold;
      this.onInspect(hold);
    }
  }

  /**
   * Opens the card on one skill, or closes it with -1. Public so a test can
   * point without a mouse.
   */
  public point(index: number, touch = false): void {
    const open = index >= 0 && index < this.loadout.length;
    this.pointed = open ? index : -1;
    if (open) {
      this.pointedEffect = -1;
    }

    // Closing the skill's card leaves an effect's open card alone.
    if (open || this.pointedEffect < 0) {
      this.card.setVisible(open);
      this.cardText.setVisible(open);
    }
    if (open) {
      this.drawCard(index);
    }

    this.hold(open && !touch);
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
      heldBonusText(entry.id),
      ...(entry.mastery >= 1 ? [fill(t().mastery.card, { effect: masteryText(entry.id) })] : []),
      ...(entry.mastery >= 2 ? [fill(t().mastery.card2, { effect: masteryText(entry.id, 2) })] : []),
    ]);

    // Under the bar, starting at the skill.
    this.placeCard(slot.plate.x - SLOT / 2, slot.plate.y + SLOT / 2 + 6);
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
