import Phaser from 'phaser';

import { COLORS, DEPTH } from '@/config';
import { upgradeOptionsFor, type UpgradeId, type UpgradeOption } from '@/systems/Progression';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { SKILLS, type SkillId } from '@/weapons/skills';

export interface UpgradeChoiceData {
  /** Headline — "LEVEL UP" for a level, the skill's name for a pickup. */
  readonly title: string;
  readonly subtitle: string;
  /** Which skill the chosen upgrade is spent on. */
  readonly skill: SkillId;
  readonly onPick: (upgrade: UpgradeId) => void;
}

const LEFT_CODES = ['KeyA', 'ArrowLeft'];
const RIGHT_CODES = ['KeyD', 'ArrowRight'];
/** Confirm stays inside WASD/arrows; Enter and Space are extras. */
const CONFIRM_CODES = ['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'Enter', 'Space'];

const CARD_WIDTH = 260;
const CARD_HEIGHT = 170;
const CARD_GAP = 40;

interface CardView {
  readonly option: UpgradeOption;
  readonly panel: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  readonly x: number;
}

/**
 * Upgrade picker, shown both on level-up (spends on the basic attack) and on
 * a skill pickup (spends on that skill). A pointer moves between the cards
 * on left/right and up/down confirms, so the game stays playable on WASD and
 * the arrow keys alone; cards are also tappable.
 *
 * Key repeats are dropped and input is locked briefly on open, so a direction
 * already held for movement cannot move the pointer or confirm by accident.
 */
export class UpgradeScene extends Phaser.Scene {
  public static readonly KEY = 'UpgradeScene';
  private static readonly INPUT_LOCK_MS = 260;

  private payload!: UpgradeChoiceData;
  private cards: CardView[] = [];
  private pointer!: Phaser.GameObjects.Triangle;
  private selected = 0;
  private unlocked = false;
  private picked = false;

  public constructor() {
    super(UpgradeScene.KEY);
  }

  public init(data: UpgradeChoiceData): void {
    this.payload = data;
    this.picked = false;
    this.selected = 0;
  }

  public create(): void {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const cardY = height / 2 + 10;

    this.add.rectangle(0, 0, width, height, 0x05070b, 0.72).setOrigin(0, 0).setDepth(DEPTH.ui);

    this.add
      .text(centerX, height / 2 - 150, this.payload.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '42px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    this.add
      .text(centerX, height / 2 - 108, this.payload.subtitle, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: COLORS.accent,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    const options = upgradeOptionsFor(SKILLS[this.payload.skill]);
    const span = CARD_WIDTH + CARD_GAP;
    this.cards = options.map((option, index) => {
      const x = centerX + (index - (options.length - 1) / 2) * span;
      return this.buildCard(x, cardY, option);
    });

    // Caret that slides to whichever card is under the pointer.
    this.pointer = this.add
      .triangle(this.cards[0]!.x, cardY - CARD_HEIGHT / 2 - 18, 0, 0, 18, 0, 9, 12, COLORS.accentFill)
      .setDepth(DEPTH.ui);

    this.add
      .text(
        centerX,
        height / 2 + 150,
        prefersTouchControls() ? '원하는 쪽을 터치하세요' : '← → 이동   ↑ ↓ 선택   (WASD 동일)',
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: COLORS.muted,
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    this.refresh(false);

    // A fresh scene's `time.now` is still 0 in create(), so compare against
    // a flag the clock flips instead of a precomputed timestamp.
    this.unlocked = false;
    this.time.delayedCall(UpgradeScene.INPUT_LOCK_MS, () => { this.unlocked = true; });
    this.input.keyboard?.on('keydown', this.onKeyDown, this);
  }

  private buildCard(x: number, y: number, option: UpgradeOption): CardView {
    const panel = this.add.rectangle(x, y, CARD_WIDTH, CARD_HEIGHT, COLORS.panel, 1).setDepth(DEPTH.ui);
    panel.setStrokeStyle(2, COLORS.panelEdge, 1);

    const label = this.add
      .text(x, y - 36, option.label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '26px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    this.add
      .text(x, y + 22, option.detail, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '13px',
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: CARD_WIDTH - 40 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    // Touch (and mouse) players pick by tapping the card directly.
    panel.setInteractive({ useHandCursor: true });
    panel.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.onCardTapped(option.id));

    return { option, panel, label, x };
  }

  private onCardTapped(upgrade: UpgradeId): void {
    if (this.picked || !this.unlocked) {
      return;
    }

    const index = this.cards.findIndex((card) => card.option.id === upgrade);
    if (index >= 0) {
      this.selected = index;
      this.refresh(true);
    }

    this.pick(upgrade);
  }

  private move(step: number): void {
    const next = Phaser.Math.Clamp(this.selected + step, 0, this.cards.length - 1);
    if (next === this.selected) {
      return;
    }

    this.selected = next;
    this.refresh(true);
  }

  private refresh(animate: boolean): void {
    this.cards.forEach((card, index) => {
      const active = index === this.selected;
      card.panel.setFillStyle(active ? COLORS.panelActive : COLORS.panel, 1);
      card.panel.setStrokeStyle(active ? 3 : 2, active ? COLORS.accentFill : COLORS.panelEdge, 1);
      card.label.setColor(active ? COLORS.text : COLORS.muted);
    });

    const targetX = this.cards[this.selected]!.x;
    if (animate) {
      this.tweens.add({ targets: this.pointer, x: targetX, duration: 110, ease: 'Quad.easeOut' });
    } else {
      this.pointer.setX(targetX);
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    // `repeat` filters a direction that was already held when the popup opened.
    if (this.picked || event.repeat || !this.unlocked) {
      return;
    }

    if (LEFT_CODES.includes(event.code)) {
      this.move(-1);
    } else if (RIGHT_CODES.includes(event.code)) {
      this.move(1);
    } else if (CONFIRM_CODES.includes(event.code)) {
      this.pick(this.cards[this.selected]!.option.id);
    }
  }

  private pick(upgrade: UpgradeId): void {
    this.picked = true;
    this.input.keyboard?.off('keydown', this.onKeyDown, this);

    const { onPick } = this.payload;
    this.scene.stop();
    onPick(upgrade);
  }
}
