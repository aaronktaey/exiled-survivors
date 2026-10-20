import Phaser from 'phaser';

import { COLORS, DEPTH, SCENES, SCRIM, SKILL_ICON_SIZE, SKILL_ICONS, TEXT } from '@/config';
import { fill, skillName, skillSummary, t, tagName } from '@/i18n';
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
}

const LEFT_CODES = ['KeyA', 'ArrowLeft', 'ArrowUp'];
const RIGHT_CODES = ['KeyD', 'ArrowRight', 'ArrowDown'];
const CONFIRM_CODES = ['Space', 'Enter', 'NumpadEnter'];
const NUMBER_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4'];

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
 * 무작위 스킬: three skills on cards, one to take. A skill already in hand
 * says 강화 on its card and opens its upgrade choice when taken; one not yet
 * held is simply acquired. A run's first skill is chosen here too.
 *
 * It moves and confirms the way the upgrade picker does — arrows or hover
 * to move, Space, a tap or 1-3 to take — and is locked for a moment on
 * open, so a key held down from play cannot take a card for the player.
 */
export class SkillPickScene extends Phaser.Scene {
  public static readonly KEY = SCENES.skillPick;
  private static readonly INPUT_LOCK_MS = 260;

  /** Public so a test can read and press the cards. */
  public payload!: SkillPickData;
  public cards: CardView[] = [];
  public selected = 0;
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

    // Three across when there is the width, stacked when there is not.
    const count = this.payload.options.length;
    const usable = width - SIDE_MARGIN * 2;
    const across = usable >= count * 150 + (count - 1) * CARD_GAP;
    const cardWidth = across
      ? Math.min(CARD_MAX_WIDTH, (usable - CARD_GAP * (count - 1)) / count)
      : Math.min(320, usable);
    const cardHeight = across ? CARD_HEIGHT : Math.min(CARD_HEIGHT * 0.62, (height - 220) / count - CARD_GAP);
    const block = 90 + (across ? cardHeight : count * (cardHeight + CARD_GAP) - CARD_GAP) + 50;
    const top = Math.max(16, (height - block) / 2);

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
      const x = across ? centerX + (index - (count - 1) / 2) * (cardWidth + CARD_GAP) : centerX;
      const y = across ? firstY : firstY + index * (cardHeight + CARD_GAP);
      return this.buildCard(index, skill, x, y, cardWidth, cardHeight, !across);
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

    this.add
      .text(textX, ty, skillSummary(skill), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
        align: compact ? 'left' : 'center',
        wordWrap: { width: textWidth },
        maxLines: compact ? 2 : 4,
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
    if (LEFT_CODES.includes(event.code)) {
      this.selected = Math.max(0, this.selected - 1);
      this.refresh();
    } else if (RIGHT_CODES.includes(event.code)) {
      this.selected = Math.min(this.cards.length - 1, this.selected + 1);
      this.refresh();
    } else if (CONFIRM_CODES.includes(event.code)) {
      this.pick(this.selected);
    }
  }
}
