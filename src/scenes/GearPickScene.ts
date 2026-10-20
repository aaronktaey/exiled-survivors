import Phaser from 'phaser';

import { COLORS, DEPTH, RUN_BAG, SCENES, SCRIM, TEXT } from '@/config';
import { fill, t } from '@/i18n';
import { fitText } from '@/systems/Layout';
import type { GearItem } from '@/systems/Gear';
import { drawGearCard, type GearCardView } from '@/systems/GearCard';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

/** What the survivor did with a piece just picked up. */
export type GearPickChoice = 'wear' | 'keep' | 'drop';

export interface GearPickData {
  readonly item: GearItem;
  /** What is worn in the same slot now, to compare against. */
  readonly worn: GearItem | null;
  /** With the 보관함 full, keeping it is not on offer: it is worn or let go. */
  readonly bagFull: boolean;
  readonly onChoose: (choice: GearPickChoice) => void;
}

interface PickButton {
  readonly choice: GearPickChoice;
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

const TITLE_Y = 34;
const BUTTON_W = 160;
const BUTTON_H = 40;

/**
 * 장비 획득 — a piece picked up in a run, beside what is worn in its slot, and
 * the choice, always all three (0.72): 착용 (what was worn goes into the
 * 보관함), 보관, or 버리기. With the 보관함 full, 보관 is shown dimmed and
 * cannot be pressed. The run is held while it is open, the way a level-up's
 * cards hold it.
 */
export class GearPickScene extends Phaser.Scene {
  public static readonly KEY = SCENES.gearPick;
  /** The two cards and the buttons. Public for tests. */
  public found?: GearCardView;
  public worn?: GearCardView;
  public buttons: PickButton[] = [];
  /** The button the keyboard is on. Public for tests. */
  public focused = 0;

  private payload!: GearPickData;
  private done = false;

  public constructor() {
    super(GearPickScene.KEY);
  }

  public init(data: GearPickData): void {
    this.payload = data;
    this.buttons = [];
    this.focused = 0;
    this.done = false;
  }

  public create(): void {
    const { width, height } = this.scale;
    const copy = t().runGear;
    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.upgrade).setOrigin(0, 0).setDepth(DEPTH.ui).setInteractive();
    fitText(
      this.add
        .text(width / 2, TITLE_Y, copy.pickTitle, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.screen, color: COLORS.text })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 40,
    );

    // Side by side when there is the width for two, one over the other when not.
    const side = width >= 600;
    const cardW = side ? Math.min(340, (width - 48) / 2) : Math.min(380, width - 32);
    const top = TITLE_Y + 30;
    const options = (heading: string, lit: boolean) => ({ heading, width: cardW, empty: copy.pickNone, depth: DEPTH.ui + 1, lit });
    this.found = drawGearCard(this, this.payload.item, options(copy.pickFound, true));
    this.worn = drawGearCard(this, this.payload.worn, options(copy.pickWorn, false));
    let bottom: number;
    if (side) {
      const left = width / 2 - cardW - 8;
      this.found.container.setPosition(left, top);
      this.worn.container.setPosition(width / 2 + 8, top);
      bottom = top + Math.max(this.found.height, this.worn.height);
    } else {
      const left = width / 2 - cardW / 2;
      this.found.container.setPosition(left, top);
      this.worn.container.setPosition(left, top + this.found.height + 8);
      bottom = top + this.found.height + 8 + this.worn.height;
    }
    // A short window shrinks the cards to fit above the buttons.
    const room = height - 110 - top;
    if (bottom - top > room) {
      const k = Math.max(0.55, room / (bottom - top));
      for (const card of [this.found, this.worn]) {
        const c = card.container;
        c.setScale(k).setPosition(width / 2 + (c.x - width / 2) * k, top + (c.y - top) * k);
      }
      bottom = top + (bottom - top) * k;
    }

    const choices: { choice: GearPickChoice; label: string }[] = [
      { choice: 'wear', label: copy.pickWear },
      { choice: 'keep', label: copy.pickKeep },
      { choice: 'drop', label: copy.pickDiscard },
    ];
    const y = Math.min(height - 60, bottom + 34);
    const buttonW = Math.min(BUTTON_W, (width - 40) / choices.length);
    choices.forEach(({ choice, label }, index) => {
      const x = width / 2 + (index - (choices.length - 1) / 2) * (buttonW + 8);
      const shut = choice === 'keep' && this.payload.bagFull;
      const plate = this.add
        .rectangle(x, y, buttonW, BUTTON_H, COLORS.panel, 1)
        .setStrokeStyle(2, COLORS.panelEdge, 1)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: !shut });
      const text = this.add
        .text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2)
        .setAlpha(shut ? 0.4 : 1);
      fitText(text, buttonW - 10, 0);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.focus(index));
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.choose(choice));
      this.buttons.push({ choice, plate, label: text });
    });
    const note = this.payload.bagFull ? fill(copy.pickFull, { max: RUN_BAG.capacity }) : '';
    fitText(
      this.add
        .text(width / 2, y + 36, [note, prefersTouchControls() ? copy.pickHintTouch : copy.pickHintKeyboard].filter(Boolean).join('   ·   '), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 24,
    );

    this.focus(0);
    this.armKeys();
  }

  /** Takes a choice and closes — never 보관 with the 보관함 full. Public so a test can. */
  public choose(choice: GearPickChoice): void {
    if (this.done || (choice === 'keep' && this.payload.bagFull)) {
      return;
    }
    this.done = true;
    const { onChoose } = this.payload;
    this.scene.stop();
    onChoose(choice);
  }

  private focus(index: number): void {
    this.focused = index;
    this.buttons.forEach((button, i) => {
      button.plate.setFillStyle(i === index ? COLORS.panelActive : COLORS.panel, 1);
      button.plate.setStrokeStyle(i === index ? 3 : 2, i === index ? COLORS.textFill : COLORS.panelEdge, 1);
    });
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
          this.focus((this.focused + this.buttons.length - 1) % this.buttons.length);
          break;
        case 'ArrowRight':
        case 'KeyD':
          this.focus((this.focused + 1) % this.buttons.length);
          break;
        case 'Space':
        case 'Enter':
        case 'NumpadEnter':
          this.choose(this.buttons[this.focused]!.choice);
          break;
        case 'KeyK':
          this.choose('keep');
          break;
        case 'KeyX':
        case 'Delete':
          this.choose('drop');
          break;
        case 'Escape':
          // Backing out keeps it, or lets it go when there is no room: never wears it.
          this.choose(this.payload.bagFull ? 'drop' : 'keep');
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
