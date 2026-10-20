import Phaser from 'phaser';

import { ALL_RUNES, COLORS, DEPTH, RUNES, RUNE_SLOTS, SCENES, SCRIM, SKILL_ICONS, TEXT, runeTexture, type RuneId } from '@/config';
import { fill, runeLines, runeName, runeWorksOn, skillName, t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { fitText } from '@/systems/Layout';
import type { RunKit } from '@/systems/RunKit';
import { runeWorksFor } from '@/systems/Runes';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import type { SkillId } from '@/weapons/skills';

export interface RuneSceneData {
  readonly kit: RunKit;
  /** The skills held, the main one first. */
  readonly skills: readonly SkillId[];
  readonly onClose: () => void;
}

/** A slot as the cursor knows it: whose, and which. */
interface SlotPlace {
  readonly skill: SkillId;
  readonly slot: number;
}

const TITLE_Y = 30;
const ROW_H = 58;
const CELL = 44;
const CELL_GAP = 8;
const RUNE_CELL = 52;

/**
 * 룬 — the run's skills and their 강화 슬롯, and the 룬 held, opened from the
 * pause menu. A slot is picked (a tap, or the arrows); a 룬 below is then
 * pressed (a tap, or its number key) to set it there. Since 0.76 (the user's
 * ask) a 룬 that does nothing for the skill cannot go in, and one set cannot
 * come out: it can only be overwritten, which destroys it — so that is asked
 * twice. Every change reaches the run at once: GameScene listens to the kit.
 */
export class RuneScene extends Phaser.Scene {
  public static readonly KEY = SCENES.runes;
  public backButton?: BackButton;
  /** The slot the cursor is on, if the run has any. Public for tests. */
  public selected: SlotPlace | null = null;
  /** The 룬 kinds held, in the order their keys and buttons go. Public for tests. */
  public heldOrder: RuneId[] = [];
  public status!: Phaser.GameObjects.Text;

  private payload!: RuneSceneData;
  private layer!: Phaser.GameObjects.Container;
  private note = '';
  /** An overwrite pressed once, waiting for the second press. */
  private armed: { skill: SkillId; slot: number; rune: RuneId } | null = null;

  public constructor() {
    super(RuneScene.KEY);
  }

  public init(data: RuneSceneData): void {
    this.payload = data;
    this.selected = null;
    this.heldOrder = [];
    this.note = '';
    this.armed = null;
  }

  private get kit(): RunKit {
    return this.payload.kit;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui).setInteractive();
    fitText(
      this.add
        .text(width / 2, TITLE_Y, t().runes.title, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.screen, color: COLORS.text })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 220,
    );
    this.status = this.add
      .text(width / 2, height - 46, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
    fitText(
      this.add
        .text(width / 2, height - 18, prefersTouchControls() ? t().runes.hintTouch : t().runes.hintKeyboard, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 16,
    );
    this.layer = this.add.container(0, 0).setDepth(DEPTH.ui + 1);

    const first = this.payload.skills.find((skill) => this.kit.socketsOf(skill).length > 0);
    this.selected = first ? { skill: first, slot: 0 } : null;
    this.armKeys();
    this.redraw();
  }

  /** Puts the cursor on a slot. Public so a test can. */
  public select(skill: SkillId, slot: number): void {
    if (slot >= 0 && slot < this.kit.socketsOf(skill).length) {
      this.selected = { skill, slot };
      this.note = '';
      this.armed = null;
      this.redraw();
    }
  }

  /**
   * Sets a held 룬 in the slot under the cursor — not one that does nothing
   * for that skill. A slot already holding one is overwritten only on the
   * second press, the old 룬 destroyed. Public so a test can.
   */
  public setRune(rune: RuneId): boolean {
    const at = this.selected;
    const copy = t().runes;
    if (!at) {
      this.say(copy.pickSlot);
      return false;
    }
    if (!runeWorksFor(rune, at.skill) || !this.kit.canTake(at.skill, rune, at.slot)) {
      this.say(copy.cantSet);
      return false;
    }
    const there = this.kit.socketsOf(at.skill)[at.slot] ?? null;
    const confirmed = this.armed?.skill === at.skill && this.armed.slot === at.slot && this.armed.rune === rune;
    if (there && !confirmed) {
      this.armed = { skill: at.skill, slot: at.slot, rune };
      this.say(fill(copy.overwrite, { rune: runeName(there) }));
      return false;
    }
    this.armed = null;
    if (!this.kit.socket(at.skill, at.slot, rune)) {
      return false;
    }
    this.say(fill(copy.set, { rune: runeName(rune), skill: skillName(at.skill) }));
    return true;
  }

  public close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }

  private say(text: string): void {
    this.note = text;
    this.redraw();
  }

  /** Everything below the title, drawn again from the kit. */
  private redraw(): void {
    const { width, height } = this.scale;
    const copy = t().runes;
    this.layer.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(object: T): T => {
      this.layer.add(object);
      return object;
    };
    const text = (x: number, y: number, value: string, size: string, color: string, originX = 0) =>
      add(this.add.text(x, y, value, { fontFamily: 'system-ui, sans-serif', fontSize: size, color }).setOrigin(originX, 0.5));

    const blockW = Math.min(620, width - 32);
    const left = (width - blockW) / 2;
    let y = TITLE_Y + 44;

    // The skills, each with its slots: the ones it has, then the ones it could still get.
    for (const skill of this.payload.skills) {
      const sockets = this.kit.socketsOf(skill);
      const icon = SKILL_ICONS[skill];
      if (icon && this.textures.exists(icon.key)) {
        add(this.add.image(left + 18, y, icon.key).setDisplaySize(32, 32));
      }
      const name = text(left + 42, y - 9, skillName(skill), TEXT.size.label, COLORS.text);
      fitText(name, Math.max(80, blockW - 42 - RUNE_SLOTS.max * (CELL + CELL_GAP) - 12), 0);
      text(left + 42, y + 12, sockets.length > 0 ? fill(copy.slots, { n: sockets.length, max: RUNE_SLOTS.max }) : copy.noSlots, TEXT.size.hint, COLORS.muted);
      for (let slot = 0; slot < RUNE_SLOTS.max; slot++) {
        const x = left + blockW - (RUNE_SLOTS.max - slot) * (CELL + CELL_GAP) + CELL / 2;
        const has = slot < sockets.length;
        const picked = this.selected?.skill === skill && this.selected.slot === slot;
        const cell = add(
          this.add
            .rectangle(x, y, CELL, CELL, has ? COLORS.panel : 0x000000, has ? 1 : 0.2)
            .setStrokeStyle(picked ? 3 : 1, picked ? COLORS.accentFill : COLORS.panelEdge, has ? 1 : 0.35),
        );
        const rune = has ? sockets[slot] : null;
        if (rune) {
          add(this.add.image(x, y, runeTexture(rune)).setDisplaySize(CELL - 10, CELL - 10).setAlpha(runeWorksFor(rune, skill) ? 1 : 0.45));
        }
        if (has) {
          cell.setInteractive({ useHandCursor: true }).on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.select(skill, slot));
        }
      }
      y += ROW_H;
    }

    // What the slot under the cursor holds.
    y += 4;
    const at = this.selected;
    const inSlot = at ? this.kit.socketsOf(at.skill)[at.slot] ?? null : null;
    const detail = inSlot
      ? [`${runeName(inSlot)}  ·  ${runeLines(inSlot).join(' · ')}`, runeWorksFor(inSlot, at!.skill) ? runeWorksOn(inSlot) : copy.notFor]
      : [at ? copy.empty : copy.noSlots];
    detail.forEach((line, i) => {
      const t1 = text(width / 2, y + i * 20, line, TEXT.size.hint, i === 0 ? COLORS.text : COLORS.muted, 0.5);
      fitText(t1, blockW, 0);
    });
    y += detail.length * 20 + 6;
    y += 8;

    // The 룬 held: a button each, numbered for the keyboard.
    text(left, y, copy.held, TEXT.size.hint, COLORS.muted);
    y += 18;
    this.heldOrder = ALL_RUNES.filter((rune) => this.kit.runeCount(rune.id) > 0).map((rune) => rune.id);
    if (this.heldOrder.length === 0) {
      const none = text(left, y + 12, copy.none, TEXT.size.hint, COLORS.muted);
      fitText(none, blockW, 0);
    }
    const perRow = Math.max(1, Math.floor((blockW + CELL_GAP) / (RUNE_CELL + CELL_GAP)));
    const room = height - 70 - y;
    const rows = Math.ceil(this.heldOrder.length / perRow);
    const size = Math.min(RUNE_CELL, rows > 0 ? (room - (rows - 1) * CELL_GAP) / rows : RUNE_CELL);
    this.heldOrder.forEach((rune, index) => {
      const cx = left + size / 2 + (index % perRow) * (size + CELL_GAP);
      const cy = y + size / 2 + Math.floor(index / perRow) * (size + CELL_GAP);
      const works = at ? runeWorksFor(rune, at.skill) : true;
      const plate = add(
        this.add.rectangle(cx, cy, size, size, COLORS.panel, 1).setStrokeStyle(2, RUNES[rune].color, works ? 0.9 : 0.3),
      );
      add(this.add.image(cx, cy - 4, runeTexture(rune)).setDisplaySize(size * 0.6, size * 0.6).setAlpha(works ? 1 : 0.45));
      text(cx + size / 2 - 4, cy + size / 2 - 9, `×${this.kit.runeCount(rune)}`, '11px', COLORS.text, 1);
      text(cx - size / 2 + 4, cy - size / 2 + 9, String((index + 1) % 10), '11px', COLORS.muted, 0);
      plate
        .setInteractive({ useHandCursor: true })
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.setRune(rune))
        .on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
          this.status.setScale(1).setText(`${runeName(rune)}  ·  ${runeLines(rune).join(' · ')}  ·  ${runeWorksOn(rune)}`);
          fitText(this.status, width - 24, 0);
        });
    });

    this.status.setScale(1).setText(this.note);
    fitText(this.status, width - 24, 0);
  }

  private armKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const places = (): SlotPlace[] =>
      this.payload.skills.flatMap((skill) => this.kit.socketsOf(skill).map((_, slot) => ({ skill, slot })));
    const move = (dSkill: number, dSlot: number): void => {
      const all = places();
      if (all.length === 0) {
        return;
      }
      const at = this.selected ?? all[0]!;
      if (dSlot !== 0) {
        this.select(at.skill, Math.max(0, Math.min(this.kit.socketsOf(at.skill).length - 1, at.slot + dSlot)));
        return;
      }
      const withSlots = this.payload.skills.filter((skill) => this.kit.socketsOf(skill).length > 0);
      const i = withSlots.indexOf(at.skill) + dSkill;
      const skill = withSlots[Math.max(0, Math.min(withSlots.length - 1, i))];
      if (skill) {
        this.select(skill, Math.min(at.slot, this.kit.socketsOf(skill).length - 1));
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          move(0, -1);
          break;
        case 'ArrowRight':
        case 'KeyD':
          move(0, 1);
          break;
        case 'ArrowUp':
        case 'KeyW':
          move(-1, 0);
          break;
        case 'ArrowDown':
        case 'KeyS':
          move(1, 0);
          break;
        case 'Escape':
          this.close();
          break;
        default: {
          const digit = /^Digit([0-9])$/.exec(event.code);
          if (!digit) {
            return;
          }
          const index = (Number(digit[1]) + 9) % 10;
          const rune = this.heldOrder[index];
          if (rune) {
            this.setRune(rune);
          }
        }
      }
      event.preventDefault?.();
    };
    keyboard.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off('keydown', onKey));
  }
}
