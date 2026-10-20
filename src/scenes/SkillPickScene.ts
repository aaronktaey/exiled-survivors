import Phaser from 'phaser';

import { COLORS, DEPTH, SCENES, SCRIM, SKILL_ICON_SIZE, SKILL_ICONS, TEXT } from '@/config';
import { fill, skillName, skillSummary, t, tagName } from '@/i18n';
import { addBackButton } from '@/systems/BackButton';
import { fitText } from '@/systems/Layout';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { SKILLS, type SkillId } from '@/weapons/skills';

export interface SkillPickData {
  readonly title: string;
  readonly subtitle: string;
  /** The skills on offer, one card each. */
  readonly options: readonly SkillId[];
  /** Which of them are already in hand, so their card says 강화. */
  readonly owned: readonly SkillId[];
  /** The level each owned one is at, for its card. */
  readonly levels?: Partial<Record<SkillId, number>>;
  readonly onPick: (skill: SkillId) => void;
  /**
   * A line of its own for a card, in place of the skill's summary — a 룬's
   * pick says where it would go, `warn` (in red) when it would push one out.
   */
  readonly notes?: Partial<Record<SkillId, { readonly text: string; readonly warn?: boolean }>>;
  /** Given, a back button (and Esc) leave the choice this way — the run's first skill goes back to the title. */
  readonly onBack?: () => void;
}

const LEFT_CODES = ['KeyA', 'ArrowLeft'];
const RIGHT_CODES = ['KeyD', 'ArrowRight'];
const UP_CODES = ['KeyW', 'ArrowUp'];
const DOWN_CODES = ['KeyS', 'ArrowDown'];
const CONFIRM_CODES = ['Space', 'Enter', 'NumpadEnter'];
const NUMBER_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];

const CARD_MAX_WIDTH = 230;
const CARD_HEIGHT = 210;
const CARD_GAP = 18;
const SIDE_MARGIN = 16;

interface CardView {
  readonly skill: SkillId;
  readonly panel: Phaser.GameObjects.Rectangle;
  readonly name: Phaser.GameObjects.Text;
  readonly x: number;
  readonly y: number;
}

/**
 * Skills on cards, one to take: a run's first skill, out of every skill
 * there is (0.74; three at random before), laid out in rows. With `onBack`
 * a back button (and Esc) leave without taking one.
 *
 * It moves and confirms the way the upgrade picker does — arrows or hover
 * to move, Space, a tap or a number key to take — and is locked for a
 * moment on open, so a key held down from play cannot take a card for the
 * player.
 */
export class SkillPickScene extends Phaser.Scene {
  public static readonly KEY = SCENES.skillPick;
  private static readonly INPUT_LOCK_MS = 260;

  /** Public so a test can read and press the cards. */
  public payload!: SkillPickData;
  public cards: CardView[] = [];
  public selected = 0;
  /** How many cards a row holds. Public for tests. */
  public columns = 1;
  private unlocked = false;
  private picked = false;

  public constructor() {
    super(SkillPickScene.KEY);
  }

  public init(data: SkillPickData): void {
    this.payload = data;
    this.cards = [];
    this.selected = 0;
    this.picked = false;
    this.unlocked = false;
  }

  public create(): void {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const copy = t().skillPick;

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.upgrade).setOrigin(0, 0).setDepth(DEPTH.ui);
    const { onBack } = this.payload;
    if (onBack) {
      addBackButton(this, () => this.back());
    }

    // As many across as fit at 150 wide (at most three, the way the cards
    // read best), in as many rows as that takes; a card too short for its
    // picture over its words lays them side by side instead.
    const count = this.payload.options.length;
    const usable = width - SIDE_MARGIN * 2;
    const columns = Math.max(1, Math.min(3, count, Math.floor((usable + CARD_GAP) / (150 + CARD_GAP))));
    const rows = Math.ceil(count / columns);
    this.columns = columns;
    const cardWidth = Math.min(columns === 1 ? 320 : CARD_MAX_WIDTH, (usable - CARD_GAP * (columns - 1)) / columns);
    const margin = onBack ? 44 : 16;
    const cardHeight = Math.min(CARD_HEIGHT, (height - margin - 16 - 90 - 40 - CARD_GAP * (rows - 1)) / rows);
    // A card under 200 high cannot hold its picture over its words: side by side then.
    const compact = cardHeight < 200;
    const block = 90 + rows * cardHeight + (rows - 1) * CARD_GAP + 40;
    const top = Math.max(margin, (height - block) / 2);

    fitText(
      this.add
        .text(centerX, top + 20, this.payload.title, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.banner,
          color: COLORS.text,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui),
      width,
    );
    fitText(
      this.add
        .text(centerX, top + 58, this.payload.subtitle, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.label,
          color: COLORS.accent,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui),
      width,
    );

    const firstY = top + 90 + cardHeight / 2;
    this.cards = this.payload.options.map((skill, index) => {
      const row = Math.floor(index / columns);
      const inRow = Math.min(columns, count - row * columns);
      const x = centerX + ((index % columns) - (inRow - 1) / 2) * (cardWidth + CARD_GAP);
      const y = firstY + row * (cardHeight + CARD_GAP);
      return this.buildCard(index, skill, x, y, cardWidth, cardHeight, compact);
    });

    const lastBottom = this.cards.length
      ? this.cards[this.cards.length - 1]!.y + cardHeight / 2
      : firstY;
    fitText(
      this.add
        .text(centerX, Math.min(height - 16, lastBottom + 28), prefersTouchControls() ? copy.hintTouch : copy.hintKeyboard, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.small,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui),
      width,
    );

    this.refresh();
    this.time.delayedCall(SkillPickScene.INPUT_LOCK_MS, () => { this.unlocked = true; });
    this.input.keyboard?.on('keydown', this.onKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.onKeyDown, this);
    });
  }

  /** Leaves without a card, where that is offered. Public so a test can. */
  public back(): void {
    const { onBack } = this.payload;
    if (this.picked || !onBack) {
      return;
    }
    this.picked = true;
    this.scene.stop();
    onBack();
  }

  /** Takes a card. Public so a test can take one without hunting for it. */
  public pick(index: number): void {
    const card = this.cards[index];
    if (this.picked || !this.unlocked || !card) {
      return;
    }

    this.picked = true;
    const { onPick } = this.payload;
    this.scene.stop();
    onPick(card.skill);
  }

  /**
   * One card. Its index is handed in rather than read off `this.cards`: the
   * cards are built inside the map that fills that array, so it is still
   * empty here — every card once took index 0, and the mouse picked the
   * first card whichever one it was over.
   */
  private buildCard(
    index: number,
    skill: SkillId,
    x: number,
    y: number,
    w: number,
    h: number,
    compact: boolean,
  ): CardView {
    const copy = t().skillPick;
    const owned = this.payload.owned.includes(skill);
    const panel = this.add
      .rectangle(x, y, w, h, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui)
      .setInteractive({ useHandCursor: true });

    const icon = SKILL_ICONS[skill];
    const iconSize = compact ? SKILL_ICON_SIZE.drop : SKILL_ICON_SIZE.card;
    const iconX = compact ? x - w / 2 + 14 + iconSize / 2 : x;
    const iconY = compact ? y : y - h / 2 + 14 + iconSize / 2;
    if (icon && this.textures.exists(icon.key)) {
      this.add.image(iconX, iconY, icon.key).setDisplaySize(iconSize, iconSize).setDepth(DEPTH.ui + 1);
    }

    const textX = compact ? iconX + iconSize / 2 + 10 : x;
    const origin = compact ? 0 : 0.5;
    const textWidth = compact ? w - (textX - (x - w / 2)) - 10 : w - 20;
    let ty = compact ? y - h / 2 + 10 : iconY + iconSize / 2 + 8;

    const name = this.add
      .text(textX, ty, skillName(skill), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.label,
        color: COLORS.text,
      })
      .setOrigin(origin, 0)
      .setDepth(DEPTH.ui + 1);
    ty += name.height + 2;

    const level = this.payload.levels?.[skill];
    const badge = owned ? fill(copy.upgrade, { level: level ?? 1 }) : copy.new;
    const tags = SKILLS[skill].tags.map((tag) => tagName(tag)).join(' · ');
    const meta = this.add
      .text(textX, ty, `${badge}   ${tags}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: owned ? COLORS.accent : COLORS.gearText,
        wordWrap: { width: textWidth },
      })
      .setOrigin(origin, 0)
      .setDepth(DEPTH.ui + 1);
    ty += meta.height + 6;

    const note = this.payload.notes?.[skill];
    this.add
      .text(textX, ty, note ? note.text : skillSummary(skill), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: note?.warn ? COLORS.warnText : note ? COLORS.text : COLORS.muted,
        align: compact ? 'left' : 'center',
        wordWrap: { width: textWidth },
        // As many lines as the card has room left for.
        maxLines: Math.max(1, Math.min(4, Math.floor((y + h / 2 - 8 - ty) / 17))),
      })
      .setOrigin(origin, 0)
      .setDepth(DEPTH.ui + 1);

    panel.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (!this.picked) {
        this.selected = index;
        this.refresh();
      }
    });
    panel.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.pick(index));

    return { skill, panel, name, x, y };
  }

  private refresh(): void {
    this.cards.forEach((card, index) => {
      const active = index === this.selected;
      card.panel.setFillStyle(active ? COLORS.panelActive : COLORS.panel, 1);
      card.panel.setStrokeStyle(active ? 3 : 2, active ? COLORS.accentFill : COLORS.panelEdge, 1);
      card.name.setColor(active ? COLORS.text : COLORS.muted);
    });
  }

  private onKeyDown(event: KeyboardEvent): void {
    // `repeat` filters a direction that was already held when this opened.
    if (this.picked || event.repeat || !this.unlocked) {
      return;
    }

    const numbered = NUMBER_CODES.indexOf(event.code);
    if (numbered >= 0) {
      this.pick(numbered);
      return;
    }
    const last = this.cards.length - 1;
    if (LEFT_CODES.includes(event.code)) {
      this.selected = Math.max(0, this.selected - 1);
      this.refresh();
    } else if (RIGHT_CODES.includes(event.code)) {
      this.selected = Math.min(last, this.selected + 1);
      this.refresh();
    } else if (UP_CODES.includes(event.code)) {
      this.selected = this.selected - this.columns >= 0 ? this.selected - this.columns : this.selected;
      this.refresh();
    } else if (DOWN_CODES.includes(event.code)) {
      this.selected = Math.min(last, this.selected + this.columns);
      this.refresh();
    } else if (CONFIRM_CODES.includes(event.code)) {
      this.pick(this.selected);
    } else if (event.code === 'Escape') {
      this.back();
    }
  }
}
