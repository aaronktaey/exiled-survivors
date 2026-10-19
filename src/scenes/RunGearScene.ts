import Phaser from 'phaser';

import {
  ALL_ORBS,
  COLORS,
  DEPTH,
  GEAR_COMBINE,
  GEAR_SLOTS,
  INVENTORY,
  RUN_BAG,
  SCENES,
  SCRIM,
  TEXT,
  gearTexture,
  type GearSlot,
} from '@/config';
import { fill, gearName, gearTitle, orbShort, t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { dropTierFor, type GearItem } from '@/systems/Gear';
import { drawGearCard, type GearCardView } from '@/systems/GearCard';
import { fitText } from '@/systems/Layout';
import type { RunKit } from '@/systems/RunKit';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import type { OrbSceneData } from '@/scenes/OrbScene';

export interface RunGearSceneData {
  readonly kit: RunKit;
  readonly onClose: () => void;
  /** The piece to start on, after a 구슬 popup closes. */
  readonly selectedUid?: string | null;
  /** What the last action did, said under the buttons. */
  readonly note?: string;
}

/** One cell: a worn slot (`slot`) or a 보관함 place (`bag` index). */
interface Cell {
  readonly slot?: GearSlot;
  readonly bag?: number;
  readonly x: number;
  readonly y: number;
  readonly plate: Phaser.GameObjects.Rectangle;
}

interface GearButton {
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

const TITLE_Y = 30;

/**
 * 장비 — the run's own: what is worn in each slot, the 보관함, and the 구슬
 * held, opened from the pause menu. A cell picks a piece; 착용 puts a kept
 * one on (what was worn goes into the 보관함), 합성 makes three kept of one
 * base into one a tier better (asked twice), 버리기 lets a kept one go
 * (asked twice), 구슬 사용 opens the 구슬 popup on the picked piece, worn or
 * kept. Whatever changes, the run is refitted at once (GameScene listens to
 * the kit).
 */
export class RunGearScene extends Phaser.Scene {
  public static readonly KEY = SCENES.runGear;
  public backButton?: BackButton;
  /** Every cell, slots first. Public for tests. */
  public cells: Cell[] = [];
  /** The cell under the cursor. Public for tests. */
  public selected = 0;
  public card?: GearCardView;
  public equipButton!: GearButton;
  public discardButton!: GearButton;
  public orbButton!: GearButton;
  public combineButton!: GearButton;
  public status!: Phaser.GameObjects.Text;
  public orbLine!: Phaser.GameObjects.Text;

  private payload!: RunGearSceneData;
  private cursor!: Phaser.GameObjects.Rectangle;
  /** A 버리기 pressed once, waiting for the second: the uid it is for. */
  private armed: string | null = null;
  /** A 합성 pressed once, the same way. */
  private combineArmed: string | null = null;
  private cardAt = { x: 0, y: 0, w: 0 };

  public constructor() {
    super(RunGearScene.KEY);
  }

  public init(data: RunGearSceneData): void {
    this.payload = data;
    this.cells = [];
    this.selected = 0;
    this.armed = null;
    this.combineArmed = null;
    this.card = undefined;
  }

  private get kit(): RunKit {
    return this.payload.kit;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    const copy = t().runGear;
    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui).setInteractive();
    fitText(
      this.add
        .text(width / 2, TITLE_Y, copy.title, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.screen, color: COLORS.text })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 220,
    );

    const side = width >= INVENTORY.sideBySideFrom;
    const leftW = side ? Math.min(440, width * 0.48) : width - 32;
    const left = side ? 16 : 16;
    const cols = side ? 10 : 6;
    const rows = Math.ceil(RUN_BAG.capacity / cols);
    const gap = INVENTORY.gap;
    const cell = Math.min(INVENTORY.cellMax + 4, Math.floor((leftW - (cols - 1) * gap) / cols));
    const muted = (x: number, y: number, text: string) =>
      this.add
        .text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
        .setOrigin(0, 0)
        .setDepth(DEPTH.ui + 1);

    // The worn slots, a cell each with what it is under it.
    let y = TITLE_Y + 30;
    const slotCell = Math.min(56, cell + 12);
    GEAR_SLOTS.forEach((slot, i) => {
      const x = left + slotCell / 2 + i * (slotCell + 26);
      this.cells.push(this.makeCell(x, y + slotCell / 2, slotCell, { slot }));
      this.add
        .text(x, y + slotCell + 4, copy.slots[slot], { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.ui + 1);
    });
    y += slotCell + 28;

    // The 보관함.
    muted(left, y, fill(copy.bag, { n: this.kit.bag.length, max: RUN_BAG.capacity }));
    y += 22;
    for (let i = 0; i < RUN_BAG.capacity; i++) {
      const x = left + cell / 2 + (i % cols) * (cell + gap);
      const cy = y + cell / 2 + Math.floor(i / cols) * (cell + gap);
      this.cells.push(this.makeCell(x, cy, cell, { bag: i }));
    }
    y += rows * (cell + gap) + 6;

    // The 구슬 held.
    const held = ALL_ORBS.filter((orb) => this.kit.count(orb.id) > 0).map((orb) => `${orbShort(orb.id)} ${this.kit.count(orb.id)}`);
    this.orbLine = muted(left, y, fill(copy.orbsHeld, { list: held.length > 0 ? held.join(' · ') : '—' }));
    fitText(this.orbLine, leftW, 0);
    y += 24;

    this.cursor = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setStrokeStyle(2, COLORS.accentFill, 1).setDepth(DEPTH.ui + 4);

    // The picked piece's card, and the buttons under it: beside the grid, or under it.
    this.cardAt = side
      ? { x: left + leftW + 24, y: TITLE_Y + 30, w: width - leftW - 56 }
      : { x: 16, y, w: width - 32 };
    const buttonsY = height - 74;
    const bw = Math.min(130, (this.cardAt.w - 24) / 4);
    const bx = this.cardAt.x + this.cardAt.w / 2;
    const at = (i: number) => bx + (i - 1.5) * (bw + 8);
    this.equipButton = this.button(at(0), buttonsY, bw, copy.equip, () => this.equip());
    this.combineButton = this.button(at(1), buttonsY, bw, copy.combine, () => this.combine());
    this.orbButton = this.button(at(2), buttonsY, bw, copy.orbs, () => this.openOrbs());
    this.discardButton = this.button(at(3), buttonsY, bw, copy.discard, () => this.discard());
    this.status = this.add
      .text(width / 2, height - 46, this.payload.note ?? '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
    fitText(this.status, width - 24, 0);
    fitText(
      this.add
        .text(width / 2, height - 18, prefersTouchControls() ? copy.hintTouch : copy.hintKeyboard, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 16,
    );

    const start = this.payload.selectedUid ? this.indexOf(this.payload.selectedUid) : -1;
    this.selected = start >= 0 ? start : 0;
    this.armKeys();
    this.refresh();
  }

  /** The piece in a cell, if any. */
  public itemAt(index: number): GearItem | null {
    const cell = this.cells[index];
    if (!cell) {
      return null;
    }
    return cell.slot ? this.kit.equipped[cell.slot] : (this.kit.bag[cell.bag ?? -1] ?? null);
  }

  /** The piece under the cursor. Public for tests. */
  public get picked(): GearItem | null {
    return this.itemAt(this.selected);
  }

  /** Moves the cursor to a cell. Public so a test can. */
  public select(index: number): void {
    if (index >= 0 && index < this.cells.length) {
      this.selected = index;
      this.armed = null;
      this.combineArmed = null;
      this.refresh();
    }
  }

  /** Puts the picked kept piece on. Public so a test can. */
  public equip(): void {
    const item = this.picked;
    const cell = this.cells[this.selected];
    if (!item || cell?.slot) {
      return;
    }
    this.kit.equip(item);
    this.say(fill(t().runGear.wore, { gear: gearTitle(item) }));
    // The cursor follows the piece to its slot.
    this.restartOn(item.uid);
  }

  /** Lets a kept piece go, on the second press. Public so a test can. */
  public discard(): void {
    const item = this.picked;
    if (!item || this.cells[this.selected]?.slot) {
      return;
    }
    if (this.armed !== item.uid) {
      this.armed = item.uid;
      this.say(t().runGear.discardConfirm);
      this.refresh();
      return;
    }
    this.kit.remove(item.uid);
    this.restartOn(null);
  }

  /**
   * 합성 on the picked kept piece, on the second press: it and two more of
   * its base (RunKit.combineSet) make one a tier better. Public so a test can.
   */
  public combine(): void {
    const item = this.picked;
    const copy = t().runGear;
    if (!item || this.cells[this.selected]?.slot) {
      return;
    }
    const set = this.kit.combineSet(item.uid);
    if (set === 'top') {
      this.say(fill(copy.combineTop, { tier: GEAR_COMBINE.bestTier }));
      return;
    }
    if (set === 'count') {
      this.say(fill(copy.combineNeed, { n: GEAR_COMBINE.count }));
      return;
    }
    if (this.combineArmed !== item.uid) {
      this.combineArmed = item.uid;
      this.say(fill(copy.combineConfirm, { n: GEAR_COMBINE.count, gear: gearName(item.id) }));
      this.refresh();
      return;
    }
    const made = this.kit.combine(item.uid);
    if (typeof made === 'string') {
      return;
    }
    this.restartOn(made.uid, fill(copy.combined, { gear: gearTitle(made) }));
  }

  /** The 구슬 popup on the picked piece. Public so a test can. */
  public openOrbs(): void {
    const item = this.picked;
    const first = ALL_ORBS.find((orb) => this.kit.count(orb.id) > 0);
    if (!item) {
      return;
    }
    if (!first) {
      this.say(t().runGear.noOrbs);
      return;
    }
    const data: OrbSceneData = {
      kit: this.kit,
      uid: item.uid,
      orb: first.id,
      onClose: ({ uid, note }) => {
        this.scene.resume();
        this.restartOn(uid, note);
      },
    };
    this.scene.pause();
    this.scene.bringToTop(SCENES.orb);
    this.scene.launch(SCENES.orb, data);
  }

  public close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }

  private say(text: string): void {
    this.status.setScale(1).setText(text);
    fitText(this.status, this.scale.width - 24, 0);
  }

  private restartOn(uid: string | null, note?: string): void {
    this.scene.restart({ ...this.payload, selectedUid: uid, note: note ?? this.status.text });
  }

  private indexOf(uid: string): number {
    return this.cells.findIndex((_, i) => this.itemAt(i)?.uid === uid);
  }

  private makeCell(x: number, y: number, size: number, where: { slot?: GearSlot; bag?: number }): Cell {
    const plate = this.add
      .rectangle(x, y, size, size, INVENTORY.empty, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    const index = this.cells.length;
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.select(index));
    const cell: Cell = { ...where, x, y, plate };
    const item = where.slot ? this.kit.equipped[where.slot] : this.kit.bag[where.bag ?? -1];
    if (item) {
      plate.setStrokeStyle(2, INVENTORY.border[dropTierFor(item)], 1);
      this.add.image(x, y, gearTexture(item.id)).setDisplaySize(size * 0.84, size * 0.84).setDepth(DEPTH.ui + 2);
      if (where.slot) {
        this.add.rectangle(x - size / 2 + 5, y - size / 2 + 5, 7, 7, INVENTORY.equipped, 1).setDepth(DEPTH.ui + 3);
      }
    }
    return cell;
  }

  private button(x: number, y: number, w: number, label: string, onPress: () => void): GearButton {
    const plate = this.add
      .rectangle(x, y, w, 36, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    fitText(text, w - 10, 0);
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
    return { plate, label: text };
  }

  private refresh(): void {
    const copy = t().runGear;
    const cell = this.cells[this.selected]!;
    const size = (cell.plate.width as number) + 6;
    this.cursor.setPosition(cell.x, cell.y).setSize(size, size);

    this.card?.container.destroy();
    const item = this.picked;
    const empty = cell.slot ? fill(copy.emptySlot, { slot: copy.slots[cell.slot] }) : '—';
    const heading = cell.slot ? `${copy.slots[cell.slot]} · ${copy.equipped}` : fill(copy.bag, { n: this.kit.bag.length, max: RUN_BAG.capacity });
    this.card = drawGearCard(this, item, { heading, width: this.cardAt.w, empty, depth: DEPTH.ui + 1 });
    this.card.container.setPosition(this.cardAt.x, this.cardAt.y);
    // Under the grid on a narrow screen, it may have to shrink to clear the buttons.
    const room = this.scale.height - 100 - this.cardAt.y;
    if (this.card.height > room) {
      this.card.container.setScale(Math.max(0.5, room / this.card.height));
    }

    const kept = item !== null && !cell.slot;
    const paint = (button: GearButton, on: boolean, lit = false) => {
      button.plate.setStrokeStyle(2, lit ? COLORS.accentFill : on ? COLORS.textFill : COLORS.panelEdge, 1);
      button.label.setAlpha(on ? 1 : 0.45);
    };
    paint(this.equipButton, kept);
    paint(this.discardButton, kept, this.armed !== null && this.armed === item?.uid);
    paint(this.combineButton, kept && Array.isArray(this.kit.combineSet(item.uid)), this.combineArmed !== null && this.combineArmed === item?.uid);
    paint(this.orbButton, item !== null && this.kit.orbTotal > 0);
  }

  private armKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const step = (dx: number, dy: number): void => {
      const here = this.cells[this.selected]!;
      let best = -1;
      let bestScore = Infinity;
      this.cells.forEach((cell, index) => {
        const along = (cell.x - here.x) * dx + (cell.y - here.y) * dy;
        const across = Math.abs((cell.x - here.x) * dy) + Math.abs((cell.y - here.y) * dx);
        if (index === this.selected || along <= 2) {
          return;
        }
        const score = along + across * 2;
        if (score < bestScore) {
          bestScore = score;
          best = index;
        }
      });
      if (best >= 0) {
        this.select(best);
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          step(-1, 0);
          break;
        case 'ArrowRight':
        case 'KeyD':
          step(1, 0);
          break;
        case 'ArrowUp':
        case 'KeyW':
          step(0, -1);
          break;
        case 'ArrowDown':
        case 'KeyS':
          step(0, 1);
          break;
        case 'Space':
        case 'Enter':
        case 'NumpadEnter':
          this.equip();
          break;
        case 'Delete':
        case 'Backspace':
          this.discard();
          break;
        case 'KeyO':
          this.openOrbs();
          break;
        case 'KeyC':
          this.combine();
          break;
        case 'Escape':
          this.close();
          break;
        default:
          return;
      }
      event.preventDefault?.();
    };
    keyboard.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off('keydown', onKey));
  }
}
