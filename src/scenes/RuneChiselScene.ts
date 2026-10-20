import Phaser from 'phaser';

import { COLORS, DEPTH, RUNE_SLOTS, SCENES, SCRIM, SKILL_ICONS, TEXT, TEXTURES } from '@/config';
import { fill, skillName, t } from '@/i18n';
import { fitText } from '@/systems/Layout';
import type { RunKit } from '@/systems/RunKit';
import type { SkillId } from '@/weapons/skills';

export interface RuneChiselData {
  readonly kit: RunKit;
  /** The skills held, the main one first. */
  readonly skills: readonly SkillId[];
  readonly onPick: (skill: SkillId) => void;
}

interface ChiselRow {
  readonly skill: SkillId;
  readonly open: boolean;
  readonly plate: Phaser.GameObjects.Rectangle;
}

const ROW_W = 360;
const ROW_H = 54;
const ROW_GAP = 10;
/** Long enough that a key held from play cannot take a row for the player. */
const INPUT_LOCK_MS = 260;

/**
 * 룬 끌 — which skill gets one more 강화 슬롯. One row per skill held, with
 * its slots so far; a skill already at RUNE_SLOTS.max is shown shut. The
 * run is held while it is open, as for every choice.
 */
export class RuneChiselScene extends Phaser.Scene {
  public static readonly KEY = SCENES.runeChisel;
  /** The rows, in order. Public for tests. */
  public rows: ChiselRow[] = [];
  public focused = 0;

  private payload!: RuneChiselData;
  private done = false;
  private unlocked = false;

  public constructor() {
    super(RuneChiselScene.KEY);
  }

  public init(data: RuneChiselData): void {
    this.payload = data;
    this.rows = [];
    this.done = false;
    this.unlocked = false;
  }

  public create(): void {
    const { width, height } = this.scale;
    const copy = t().runes;
    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.upgrade).setOrigin(0, 0).setDepth(DEPTH.ui).setInteractive();

    const skills = this.payload.skills;
    const rowW = Math.min(ROW_W, width - 32);
    const block = 110 + skills.length * (ROW_H + ROW_GAP);
    let y = Math.max(20, (height - block) / 2);
    this.add.image(width / 2, y + 16, TEXTURES.runeChisel).setDisplaySize(32, 32).setDepth(DEPTH.ui + 1);
    y += 50;
    fitText(
      this.add.text(width / 2, y, copy.chisel, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.screen, color: COLORS.text })
        .setOrigin(0.5).setDepth(DEPTH.ui + 1),
      width - 32,
    );
    y += 30;
    fitText(
      this.add.text(width / 2, y, copy.chiselSubtitle, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.accent })
        .setOrigin(0.5).setDepth(DEPTH.ui + 1),
      width - 32,
    );
    y += 24 + ROW_H / 2;

    skills.forEach((skill, index) => {
      const slots = this.payload.kit.socketsOf(skill).length;
      const open = this.payload.kit.canAddSlot(skill);
      const plate = this.add
        .rectangle(width / 2, y, rowW, ROW_H, COLORS.panel, 1)
        .setStrokeStyle(2, COLORS.panelEdge, 1)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: open });
      const icon = SKILL_ICONS[skill];
      const left = width / 2 - rowW / 2;
      if (icon && this.textures.exists(icon.key)) {
        this.add.image(left + 30, y, icon.key).setDisplaySize(36, 36).setDepth(DEPTH.ui + 2).setAlpha(open ? 1 : 0.4);
      }
      this.add
        .text(left + 58, y, skillName(skill), { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.text })
        .setOrigin(0, 0.5).setDepth(DEPTH.ui + 2).setAlpha(open ? 1 : 0.45);
      this.add
        .text(left + rowW - 14, y, open ? fill(copy.slots, { n: slots, max: RUNE_SLOTS.max }) : copy.chiselFull, {
          fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: open ? COLORS.accent : COLORS.muted,
        })
        .setOrigin(1, 0.5).setDepth(DEPTH.ui + 2);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.focus(index));
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.choose(index));
      this.rows.push({ skill, open, plate });
      y += ROW_H + ROW_GAP;
    });

    this.focus(Math.max(0, this.rows.findIndex((row) => row.open)));
    this.time.delayedCall(INPUT_LOCK_MS, () => { this.unlocked = true; });
    this.armKeys();
  }

  /** Takes a skill: it gets the slot. Not one already full. Public so a test can. */
  public choose(index: number): void {
    const row = this.rows[index];
    if (this.done || !row || !row.open) {
      return;
    }
    this.done = true;
    const { onPick } = this.payload;
    this.scene.stop();
    onPick(row.skill);
  }

  private focus(index: number): void {
    this.focused = index;
    this.rows.forEach((row, i) => {
      const on = i === index && row.open;
      row.plate.setFillStyle(on ? COLORS.panelActive : COLORS.panel, 1);
      row.plate.setStrokeStyle(on ? 3 : 2, on ? COLORS.accentFill : COLORS.panelEdge, 1);
    });
  }

  private armKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      if (!this.unlocked || event.repeat) {
        return;
      }
      const step = (by: number): void => {
        for (let i = 1; i <= this.rows.length; i++) {
          const next = (this.focused + by * i + this.rows.length * 4) % this.rows.length;
          if (this.rows[next]?.open) {
            this.focus(next);
            return;
          }
        }
      };
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          step(-1);
          break;
        case 'ArrowDown':
        case 'KeyS':
          step(1);
          break;
        case 'Space':
        case 'Enter':
        case 'NumpadEnter':
          this.choose(this.focused);
          break;
        default: {
          const digit = /^Digit([1-9])$/.exec(event.code);
          if (!digit) {
            return;
          }
          this.choose(Number(digit[1]) - 1);
        }
      }
      event.preventDefault?.();
    };
    keyboard.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off('keydown', onKey));
  }
}
