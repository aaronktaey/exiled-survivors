import Phaser from 'phaser';

import { ALL_ORBS, COLORS, DEPTH, GEAR_SLOTS, INVENTORY, SCENES, SCRIM, TEXT, gearTexture, type GearSlot } from '@/config';
import { fill, orbShort, t } from '@/i18n';
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

/** One worn slot's cell. */
interface Cell {
  readonly slot: GearSlot;
  readonly x: number;
  readonly y: number;
  readonly plate: Phaser.GameObjects.Rectangle;
}

interface GearButton {
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

const TITLE_Y = 30;
const SLOT_CELL = 60;

/**
 * 장비 — what the run wears, and the 구슬 to spend on it, opened from the
 * pause menu. Since the 보관함 went (0.78) a piece is worn or let go as it is
 * picked up, so this is only for crafting: a slot picks a worn piece, 구슬
 * 사용 opens the 구슬 popup on it. Whatever changes, the run is refitted at
 * once (GameScene listens to the kit).
 */
export class RunGearScene extends Phaser.Scene {
  public static readonly KEY = SCENES.runGear;
  public backButton?: BackButton;
  /** A cell per worn slot. Public for tests. */
  public cells: Cell[] = [];
  /** The cell under the cursor. Public for tests. */
  public selected = 0;
  public card?: GearCardView;
  public orbButton!: GearButton;
  public status!: Phaser.GameObjects.Text;
  public orbLine!: Phaser.GameObjects.Text;

  private payload!: RunGearSceneData;
  private cursor!: Phaser.GameObjects.Rectangle;
  private cardAt = { x: 0, y: 0, w: 0 };

  public constructor() {
    super(RunGearScene.KEY);
  }

  public init(data: RunGearSceneData): void {
    this.payload = data;
    this.cells = [];
    this.selected = 0;
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

    // The worn slots, side by side across the middle, each named under it.
    let y = TITLE_Y + 34;
    const gap = 30;
    const rowW = GEAR_SLOTS.length * SLOT_CELL + (GEAR_SLOTS.length - 1) * gap;
    GEAR_SLOTS.forEach((slot, i) => {
      const x = width / 2 - rowW / 2 + SLOT_CELL / 2 + i * (SLOT_CELL + gap);
      this.cells.push(this.makeCell(x, y + SLOT_CELL / 2, slot));
      this.add
        .text(x, y + SLOT_CELL + 4, copy.slots[slot], { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.ui + 1);
    });
    y += SLOT_CELL + 36;

    // The 구슬 held.
    const held = ALL_ORBS.filter((orb) => this.kit.count(orb.id) > 0).map((orb) => `${orbShort(orb.id)} ${this.kit.count(orb.id)}`);
    this.orbLine = this.add
      .text(width / 2, y, fill(copy.orbsHeld, { list: held.length > 0 ? held.join(' · ') : '—' }), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);
    fitText(this.orbLine, width - 32, 0);
    y += this.orbLine.height + 12;

    this.cursor = this.add.rectangle(0, 0, 10, 10, 0x000000, 0).setStrokeStyle(2, COLORS.accentFill, 1).setDepth(DEPTH.ui + 4);

    // The picked piece's card, and the button under it.
    const cardW = Math.min(420, width - 32);
    this.cardAt = { x: width / 2 - cardW / 2, y, w: cardW };
    this.orbButton = this.button(width / 2, height - 74, Math.min(200, width - 40), copy.orbs, () => this.openOrbs());
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

    const start = this.payload.selectedUid ? this.cells.findIndex((cell) => this.kit.equipped[cell.slot]?.uid === this.payload.selectedUid) : -1;
    this.selected = start >= 0 ? start : 0;
    this.armKeys();
    this.refresh();
  }

  /** The piece worn in a cell, if any. */
  public itemAt(index: number): GearItem | null {
    const cell = this.cells[index];
    return cell ? this.kit.equipped[cell.slot] : null;
  }

  /** The piece under the cursor. Public for tests. */
  public get picked(): GearItem | null {
    return this.itemAt(this.selected);
  }

  /** Moves the cursor to a cell. Public so a test can. */
  public select(index: number): void {
    if (index >= 0 && index < this.cells.length) {
      this.selected = index;
      this.refresh();
    }
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
        this.scene.restart({ ...this.payload, selectedUid: uid, note: note ?? this.status.text });
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

  private makeCell(x: number, y: number, slot: GearSlot): Cell {
    const plate = this.add
      .rectangle(x, y, SLOT_CELL, SLOT_CELL, INVENTORY.empty, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    const index = this.cells.length;
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.select(index));
    const item = this.kit.equipped[slot];
    if (item) {
      plate.setStrokeStyle(2, INVENTORY.border[dropTierFor(item)], 1);
      this.add.image(x, y, gearTexture(item.id)).setDisplaySize(SLOT_CELL * 0.84, SLOT_CELL * 0.84).setDepth(DEPTH.ui + 2);
    }
    return { slot, x, y, plate };
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
    this.cursor.setPosition(cell.x, cell.y).setSize(SLOT_CELL + 6, SLOT_CELL + 6);

    this.card?.container.destroy();
    const item = this.picked;
    this.card = drawGearCard(this, item, {
      heading: `${copy.slots[cell.slot]} · ${copy.equipped}`,
      width: this.cardAt.w,
      empty: fill(copy.emptySlot, { slot: copy.slots[cell.slot] }),
      depth: DEPTH.ui + 1,
    });
    this.card.container.setPosition(this.cardAt.x, this.cardAt.y);
    // It may have to shrink to clear the button.
    const room = this.scale.height - 100 - this.cardAt.y;
    if (this.card.height > room) {
      const k = Math.max(0.5, room / this.card.height);
      this.card.container.setScale(k).setX(this.scale.width / 2 - (this.cardAt.w * k) / 2);
    }

    const on = item !== null && this.kit.orbTotal > 0;
    this.orbButton.plate.setStrokeStyle(2, on ? COLORS.textFill : COLORS.panelEdge, 1);
    this.orbButton.label.setAlpha(on ? 1 : 0.45);
  }

  private armKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const onKey = (event: KeyboardEvent): void => {
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
        case 'ArrowUp':
        case 'KeyW':
          this.select((this.selected + this.cells.length - 1) % this.cells.length);
          break;
        case 'ArrowRight':
        case 'KeyD':
        case 'ArrowDown':
        case 'KeyS':
          this.select((this.selected + 1) % this.cells.length);
          break;
        case 'Space':
        case 'Enter':
        case 'NumpadEnter':
        case 'KeyO':
          this.openOrbs();
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
