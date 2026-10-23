import Phaser from 'phaser';

import { COLORS, DEPTH, SCRIM, SKILL_ICON_SIZE, SKILL_ICONS, TEXT, UPGRADE_SHOWN_AS_CHANCE } from '@/config';
import { fill, t } from '@/i18n';
import type { UpgradeId } from '@/systems/Progression';
import { fitText } from '@/systems/Layout';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import type { SkillId } from '@/weapons/skills';

/**
 * One card: an upgrade (Progression's ChoiceCard fits as it is), or since
 * 0.102 a 재능의 파편 stat — anything with an id, a name and a line.
 */
export interface ChoiceCard {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  /** An upgrade's numbers: where it stands, where it goes, the picks taken of the most. */
  readonly now?: number;
  readonly next?: number;
  readonly taken?: number;
  readonly maxPicks?: number | null;
}

export interface UpgradeChoiceData {
  /** Headline — "LEVEL UP" for a level, the skill's name for a pickup. */
  readonly title: string;
  readonly subtitle: string;
  /** Which skill the chosen upgrade is spent on — its icon heads the screen. */
  readonly skill?: SkillId;
  /** A picture for the head when there is no skill (재능의 파편's). */
  readonly icon?: string;
  /** The picks to show, already filtered by whatever has hit its ceiling. */
  readonly options: readonly ChoiceCard[];
  readonly onPick: (id: string) => void;
}

/** Moving the caret is free; it is confirming that movement keys cannot do. */
const LEFT_CODES = ['KeyA', 'ArrowLeft'];
const RIGHT_CODES = ['KeyD', 'ArrowRight'];
/** Space is the pick; Enter comes along for free. */
const CONFIRM_CODES = ['Space', 'Enter', 'NumpadEnter'];
/** 1-4 reach a card directly, so a keyboard can still get to all of them. */
const NUMBER_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

/** Cards shrink from this to fit however many options a skill offers. */
const CARD_MAX_WIDTH = 260;
/** Below this a card cannot hold its own label, so the row wraps instead. */
const CARD_MIN_WIDTH = 150;
const CARD_HEIGHT = 200;
const CARD_GAP = 24;
/** Keeps the row clear of the screen edges at four cards. */
const SIDE_MARGIN = 28;
/** Below this width the card is too narrow for the full-size label. */
const WIDE_CARD = 240;

interface CardView {
  readonly option: ChoiceCard;
  readonly panel: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  /** "현재 15 → 강화 후 18" and "강화 2/20회". Public through the card for tests. */
  readonly values?: Phaser.GameObjects.Text;
  readonly picks?: Phaser.GameObjects.Text;
  readonly x: number;
  readonly y: number;
}

/**
 * Upgrade picker, shown both on level-up (spends on the basic attack) and on
 * a skill pickup (spends on that skill).
 *
 * The caret moves on left/right (or A/D) and on hover; a card is taken with
 * the space bar, by clicking or tapping it, or with 1-4 for a card directly.
 *
 * What the movement keys deliberately cannot do is confirm. They are held
 * down constantly while playing, and a popup appearing under a held key used
 * to pick for the player.
 *
 * Input is locked briefly on open for the same reason.
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

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.upgrade).setOrigin(0, 0).setDepth(DEPTH.ui);

    // A projectile skill offers four picks, a melee one two, so the row is
    // sized from the count rather than from a fixed card width — and on a
    // phone, where four of them would be slivers, it wraps onto two rows.
    const options = this.payload.options;
    const usable = width - SIDE_MARGIN * 2;
    const perRow = Math.max(
      1,
      Math.min(options.length, Math.floor((usable + CARD_GAP) / (CARD_MIN_WIDTH + CARD_GAP))),
    );
    const rowCount = Math.ceil(options.length / perRow);
    const cardWidth = Math.min(
      CARD_MAX_WIDTH,
      (usable - CARD_GAP * (perRow - 1)) / perRow,
    );
    const span = cardWidth + CARD_GAP;
    const rowSpan = CARD_HEIGHT + CARD_GAP;

    // Everything stacked top to bottom — icon, name, what kind of pick, the
    // caret, the cards, the keys — and the whole block centred, so two rows
    // of cards on a phone push the rest up rather than over it.
    const ICON = SKILL_ICON_SIZE.card;
    const block = ICON + 8 + 44 + 34 + 26 + rowCount * CARD_HEIGHT + (rowCount - 1) * CARD_GAP + 22 + 20;
    let y = Math.max(12, (height - block) / 2);

    const iconKey = this.payload.icon ?? (this.payload.skill ? SKILL_ICONS[this.payload.skill]?.key : undefined);
    if (iconKey && this.textures.exists(iconKey)) {
      this.add
        .image(centerX, y + ICON / 2, iconKey)
        .setDisplaySize(ICON, ICON)
        .setDepth(DEPTH.ui);
    }
    y += ICON + 8;

    fitText(
      this.add
        .text(centerX, y + 22, this.payload.title, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.banner,
          color: COLORS.text,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui),
      width,
    );
    y += 44;

    this.add
      .text(centerX, y + 14, this.payload.subtitle, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.label,
        color: COLORS.accent,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);
    y += 34 + 26;

    // Each row is centred on its own, so a short last row sits in the middle.
    const firstRowY = y + CARD_HEIGHT / 2;
    this.cards = options.map((option, index) => {
      const row = Math.floor(index / perRow);
      const inRow = index - row * perRow;
      const rowSize = Math.min(perRow, options.length - row * perRow);
      const x = centerX + (inRow - (rowSize - 1) / 2) * span;
      return this.buildCard(x, firstRowY + row * rowSpan, cardWidth, option);
    });
    y += rowCount * CARD_HEIGHT + (rowCount - 1) * CARD_GAP + 22;

    // Caret that slides to whichever card is under the pointer.
    this.pointer = this.add
      .triangle(this.cards[0]!.x, firstRowY - CARD_HEIGHT / 2 - 18, 0, 0, 18, 0, 9, 12, COLORS.accentFill)
      .setDepth(DEPTH.ui);

    fitText(
      this.add
        .text(
          centerX,
          y + 8,
          prefersTouchControls() ? t().upgrade.hintTouch : t().upgrade.hintKeyboard,
          {
            fontFamily: 'system-ui, sans-serif',
            fontSize: TEXT.size.small,
            color: COLORS.muted,
          },
        )
        .setOrigin(0.5)
        .setDepth(DEPTH.ui),
      width,
    );

    this.refresh(false);

    // A fresh scene's `time.now` is still 0 in create(), so compare against
    // a flag the clock flips instead of a precomputed timestamp.
    this.unlocked = false;
    this.time.delayedCall(UpgradeScene.INPUT_LOCK_MS, () => { this.unlocked = true; });
    this.input.keyboard?.on('keydown', this.onKeyDown, this);
  }

  private buildCard(x: number, y: number, cardWidth: number, option: ChoiceCard): CardView {
    const panel = this.add.rectangle(x, y, cardWidth, CARD_HEIGHT, COLORS.panel, 1).setDepth(DEPTH.ui);
    panel.setStrokeStyle(2, COLORS.panelEdge, 1);

    // One line, drawn smaller rather than wrapped onto what is under it.
    const label = this.add
      .text(x, y - 62, option.label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: cardWidth >= WIDE_CARD ? TEXT.size.panel : TEXT.size.label,
        color: COLORS.text,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);
    fitText(label, cardWidth - 12, 0);

    this.add
      .text(x, y - 8, option.detail, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: cardWidth - 24 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    // Where the stat is and where this pick takes it, and how far it can go.
    const copy = t().upgrade;
    const values = option.now !== undefined && option.next !== undefined
      ? this.add
          .text(x, y + 46, fill(copy.values, { now: UpgradeScene.stat(option.id as UpgradeId, option.now), next: UpgradeScene.stat(option.id as UpgradeId, option.next) }), {
            fontFamily: 'system-ui, sans-serif',
            fontSize: TEXT.size.hint,
            color: COLORS.gearText,
            align: 'center',
          })
          .setOrigin(0.5)
          .setDepth(DEPTH.ui)
      : undefined;
    if (values) {
      fitText(values, cardWidth - 12, 0);
    }
    const picks = option.taken !== undefined
      ? this.add
          .text(
            x,
            y + 72,
            option.maxPicks === null || option.maxPicks === undefined
              ? fill(copy.picksOpen, { taken: option.taken })
              : fill(copy.picks, { taken: option.taken, max: option.maxPicks }),
            { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted, align: 'center' },
          )
          .setOrigin(0.5)
          .setDepth(DEPTH.ui)
      : undefined;
    if (picks) {
      fitText(picks, cardWidth - 12, 0);
    }

    // Touch (and mouse) players pick by tapping the card directly; hovering
    // moves the caret, so the space bar takes whatever is under the cursor.
    panel.setInteractive({ useHandCursor: true });
    panel.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.onCardTapped(option.id));
    panel.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.onCardHovered(option.id));

    return { option, panel, label, values, picks, x, y };
  }

  /** A stat as the card shows it: attacks a second to two places, the rest whole where they are whole. */
  private static stat(id: UpgradeId, value: number): string {
    if (id === 'attackSpeed') {
      return value.toFixed(2);
    }
    if (UPGRADE_SHOWN_AS_CHANCE.includes(id)) {
      return `${Math.round(value * 100)}%`;
    }
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  private onCardTapped(upgrade: string): void {
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

  /** Steps the caret, stopping at the ends rather than wrapping. */
  private move(step: number): void {
    const next = Phaser.Math.Clamp(this.selected + step, 0, this.cards.length - 1);
    if (next === this.selected) {
      return;
    }

    this.selected = next;
    this.refresh(true);
  }

  private onCardHovered(upgrade: string): void {
    if (this.picked || !this.unlocked) {
      return;
    }

    const index = this.cards.findIndex((card) => card.option.id === upgrade);
    if (index < 0 || index === this.selected) {
      return;
    }

    this.selected = index;
    this.refresh(true);
  }

  private refresh(animate: boolean): void {
    this.cards.forEach((card, index) => {
      const active = index === this.selected;
      card.panel.setFillStyle(active ? COLORS.panelActive : COLORS.panel, 1);
      card.panel.setStrokeStyle(active ? 3 : 2, active ? COLORS.accentFill : COLORS.panelEdge, 1);
      card.label.setColor(active ? COLORS.text : COLORS.muted);
    });

    const card = this.cards[this.selected]!;
    const targetX = card.x;
    const targetY = card.y - CARD_HEIGHT / 2 - 18;
    if (animate) {
      this.tweens.add({
        targets: this.pointer,
        x: targetX,
        y: targetY,
        duration: 110,
        ease: 'Quad.easeOut',
      });
    } else {
      this.pointer.setPosition(targetX, targetY);
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    // `repeat` filters a direction that was already held when the popup opened.
    if (this.picked || event.repeat || !this.unlocked) {
      return;
    }

    const numbered = NUMBER_CODES.indexOf(event.code);
    if (numbered >= 0) {
      const card = this.cards[numbered];
      if (card) {
        this.selected = numbered;
        this.refresh(true);
        this.pick(card.option.id);
      }
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

  private pick(upgrade: string): void {
    this.picked = true;
    this.input.keyboard?.off('keydown', this.onKeyDown, this);

    const { onPick } = this.payload;
    this.scene.stop();
    onPick(upgrade);
  }
}
