import Phaser from 'phaser';

import { COLORS, DEPTH, SCENES, SCRIM, TEXT } from '@/config';
import { t } from '@/i18n';
import { fitText } from '@/systems/Layout';
import type { GearItem } from '@/systems/Gear';
import { drawGearCard, type GearCardView } from '@/systems/GearCard';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

/** What the survivor did with a piece just picked up. */
export type GearPickChoice = 'wear' | 'drop';

export interface GearPickData {
  readonly item: GearItem;
  /** What is worn in the same slot now, to compare against. */
  readonly worn: GearItem | null;
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
/** The room between the two cards, where the arrow sits. */
const ARROW_GAP = 48;

/**
 * 장비 획득 — a piece picked up in a run, and the one choice there is since
 * the 보관함 went (0.78): 착용 or 버리기. What is worn now is on the left (on
 * top, on a narrow screen), the piece found on the right (under it), and a
 * gold arrow between says which way the change goes. Worn, the old piece is
 * let go. The run is held while it is open, the way a level-up's cards hold it.
 */
export class GearPickScene extends Phaser.Scene {
  public static readonly KEY = SCENES.gearPick;
  /** The two cards, the arrow and the buttons. Public for tests. */
  public found?: GearCardView;
  public worn?: GearCardView;
  public arrow?: Phaser.GameObjects.Graphics;
  /** Where the arrow points from and to, and which way (`right` side by side, `down` stacked). Public for tests. */
  public arrowAt = { x: 0, y: 0, way: 'right' as 'right' | 'down' };
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

    // Side by side when there is the width for two and the arrow, one over the other when not.
    const side = width >= 600;
    const cardW = side ? Math.min(320, (width - 32 - ARROW_GAP) / 2) : Math.min(380, width - 32);
    const top = TITLE_Y + 30;
    const options = (heading: string, lit: boolean) => ({ heading, width: cardW, empty: copy.pickNone, depth: DEPTH.ui + 1, lit });
    this.worn = drawGearCard(this, this.payload.worn, options(copy.pickWorn, false));
    this.found = drawGearCard(this, this.payload.item, options(copy.pickFound, true));
    let bottom: number;
    if (side) {
      const left = width / 2 - ARROW_GAP / 2 - cardW;
      this.worn.container.setPosition(left, top);
      this.found.container.setPosition(width / 2 + ARROW_GAP / 2, top);
      bottom = top + Math.max(this.found.height, this.worn.height);
    } else {
      const left = width / 2 - cardW / 2;
      this.worn.container.setPosition(left, top);
      this.found.container.setPosition(left, top + this.worn.height + ARROW_GAP);
      bottom = top + this.worn.height + ARROW_GAP + this.found.height;
    }
    // A short window shrinks the cards (and the gap) to fit above the buttons.
    const room = height - 110 - top;
    let k = 1;
    if (bottom - top > room) {
      k = Math.max(0.5, room / (bottom - top));
      for (const card of [this.found, this.worn]) {
        const c = card.container;
        c.setScale(k).setPosition(width / 2 + (c.x - width / 2) * k, top + (c.y - top) * k);
      }
      bottom = top + (bottom - top) * k;
    }
    this.drawArrow(side, cardW * k, k);

    const choices: { choice: GearPickChoice; label: string }[] = [
      { choice: 'wear', label: copy.pickWear },
      { choice: 'drop', label: copy.pickDiscard },
    ];
    const y = Math.min(height - 60, bottom + 34);
    const buttonW = Math.min(BUTTON_W, (width - 40) / choices.length);
    choices.forEach(({ choice, label }, index) => {
      const x = width / 2 + (index - (choices.length - 1) / 2) * (buttonW + 8);
      const plate = this.add
        .rectangle(x, y, buttonW, BUTTON_H, COLORS.panel, 1)
        .setStrokeStyle(2, COLORS.panelEdge, 1)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: true });
      const text = this.add
        .text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      fitText(text, buttonW - 10, 0);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.focus(index));
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.choose(choice));
      this.buttons.push({ choice, plate, label: text });
    });
    fitText(
      this.add
        .text(width / 2, y + 36, prefersTouchControls() ? copy.pickHintTouch : copy.pickHintKeyboard, {
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

  /** Takes a choice and closes. Public so a test can. */
  public choose(choice: GearPickChoice): void {
    if (this.done) {
      return;
    }
    this.done = true;
    const { onChoose } = this.payload;
    this.scene.stop();
    onChoose(choice);
  }

  /** The gold arrow from the worn card to the found one: across the gap, or down it. */
  private drawArrow(side: boolean, cardW: number, k: number): void {
    const worn = this.worn!;
    const found = this.found!;
    const len = ARROW_GAP * k * 0.7;
    const head = 9 * Math.max(k, 0.7);
    const g = this.add.graphics().setDepth(DEPTH.ui + 2);
    g.lineStyle(5 * Math.max(k, 0.7), COLORS.gold, 1);
    g.fillStyle(COLORS.gold, 1);
    if (side) {
      const cx = (worn.container.x + cardW + found.container.x) / 2;
      const cy = worn.container.y + Math.min(worn.height, found.height) * k / 2;
      g.lineBetween(cx - len / 2, cy, cx + len / 2 - head, cy);
      g.fillTriangle(cx + len / 2, cy, cx + len / 2 - head * 1.4, cy - head, cx + len / 2 - head * 1.4, cy + head);
      this.arrowAt = { x: cx, y: cy, way: 'right' };
    } else {
      const wornBottom = worn.container.y + worn.height * k;
      const cx = this.scale.width / 2;
      const cy = (wornBottom + found.container.y) / 2;
      g.lineBetween(cx, cy - len / 2, cx, cy + len / 2 - head);
      g.fillTriangle(cx, cy + len / 2, cx - head, cy + len / 2 - head * 1.4, cx + head, cy + len / 2 - head * 1.4);
      this.arrowAt = { x: cx, y: cy, way: 'down' };
    }
    this.arrow = g;
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
        case 'KeyX':
        case 'Delete':
        case 'Escape':
          // Backing out lets it go: it is never worn by accident.
          this.choose('drop');
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
