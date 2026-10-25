import Phaser from 'phaser';

import { COLORS, DEPTH, PLAYER_LOOK, SCENES, SCRIM, SKILL_ART, SKILL_CARD, SKILL_ICON_SIZE, SKILL_ICONS, TEXT, skillArtTexture } from '@/config';
import { fill, heldBonusText, skillName, skillSummary, t, tagName } from '@/i18n';
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
  /**
   * Given, a button under the cards (and Esc, without `onBack`) takes none
   * of them: a 룬 found is let go (0.79).
   */
  readonly discard?: { readonly label: string; readonly onDiscard: () => void };
  /**
   * 예언 (0.127, the user's ask): the day's banned skill, shown as a card of
   * its own after the rest — greyed, never taken — with the prophecy over it.
   */
  readonly prophecy?: { readonly skill: SkillId; readonly title: string; readonly lines: readonly string[] };
}

const LEFT_CODES = ['KeyA', 'ArrowLeft'];
const RIGHT_CODES = ['KeyD', 'ArrowRight'];
const UP_CODES = ['KeyW', 'ArrowUp'];
const DOWN_CODES = ['KeyS', 'ArrowDown'];
const CONFIRM_CODES = ['Space', 'Enter', 'NumpadEnter'];
const NUMBER_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];

const CARD_MAX_WIDTH = 230;
/** The title and hint round the TCG cards (0.129): tighter than the plain ones', so eight fit a PC's 540 tall. */
const TCG_HEAD = 76;
const TCG_FOOT = 30;
const CARD_HEIGHT = 210;
const CARD_GAP = 18;
const SIDE_MARGIN = 16;
/** The 버리기 button's size, and the room it takes under the cards. */
const DISCARD_W = 160;
const DISCARD_H = 38;
const DISCARD_ROOM = DISCARD_H + 16;

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
  /** The 버리기 button, when the choice offers one. Public for tests. */
  public discardButton?: Phaser.GameObjects.Rectangle;
  /** Whether the cards are TCG cards (0.129) — false where the screen is too small for them. Public for tests. */
  public tcg = false;
  /** Each card's face, which turns over as the screen opens (0.129). Public for tests. */
  public faces: Phaser.GameObjects.Container[] = [];
  /** The banned skill's card and the prophecy written over it (예언). Public for tests. */
  public bannedCard?: { readonly skill: SkillId; readonly panel: Phaser.GameObjects.Rectangle; readonly words: Phaser.GameObjects.Text };
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
    this.discardButton = undefined;
    this.bannedCard = undefined;
    this.tcg = false;
    this.faces = [];
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

    // The prophecy's card takes a place in the grid, after the cards that can be taken.
    const count = this.payload.options.length + (this.payload.prophecy ? 1 : 0);
    const usable = width - SIDE_MARGIN * 2;
    const margin = onBack ? 44 : 16;
    const extra = this.payload.discard ? DISCARD_ROOM : 0;
    // TCG cards where they fit at a readable size (0.129), under a tighter
    // title and hint than the plain ones take; the plain cards elsewhere.
    const tcg = SkillPickScene.tcgLayout(count, usable, height - margin - 16 - TCG_HEAD - TCG_FOOT - extra);
    const head = tcg ? TCG_HEAD : 90;
    const foot = tcg ? TCG_FOOT : 40;
    const roomHigh = height - margin - 16 - head - foot - extra;
    this.tcg = tcg !== null;
    let columns: number;
    let cardWidth: number;
    let cardHeight: number;
    if (tcg) {
      ({ columns, w: cardWidth, h: cardHeight } = tcg);
    } else {
      // As many across as fit at 150 wide (at most three, the way the cards
      // read best), in as many rows as that takes.
      columns = Math.max(1, Math.min(3, count, Math.floor((usable + CARD_GAP) / (150 + CARD_GAP))));
      cardWidth = Math.min(columns === 1 ? 320 : CARD_MAX_WIDTH, (usable - CARD_GAP * (columns - 1)) / columns);
      cardHeight = Math.min(CARD_HEIGHT, (roomHigh - CARD_GAP * (Math.ceil(count / columns) - 1)) / Math.ceil(count / columns));
    }
    const rows = Math.ceil(count / columns);
    this.columns = columns;
    // A plain card under 200 high cannot hold its picture over its words: side by side then.
    const compact = cardHeight < 200;
    const block = head + rows * cardHeight + (rows - 1) * CARD_GAP + extra + foot;
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

    const firstY = top + head + cardHeight / 2;
    this.cards = this.payload.options.map((skill, index) => {
      const row = Math.floor(index / columns);
      const inRow = Math.min(columns, count - row * columns);
      const x = centerX + ((index % columns) - (inRow - 1) / 2) * (cardWidth + CARD_GAP);
      const y = firstY + row * (cardHeight + CARD_GAP);
      const made = this.children.list.length;
      const card = tcg
        ? this.buildTcgCard(index, skill, x, y, cardWidth, cardHeight)
        : this.buildCard(index, skill, x, y, cardWidth, cardHeight, compact);
      this.faces.push(this.wrap(made, x, y));
      return card;
    });
    const slotOf = (index: number): { x: number; y: number } => {
      const row = Math.floor(index / columns);
      const inRow = Math.min(columns, count - row * columns);
      return {
        x: centerX + ((index % columns) - (inRow - 1) / 2) * (cardWidth + CARD_GAP),
        y: firstY + row * (cardHeight + CARD_GAP),
      };
    };
    const { prophecy } = this.payload;
    if (prophecy) {
      const at = slotOf(this.payload.options.length);
      const made = this.children.list.length;
      this.buildBannedCard(prophecy, at.x, at.y, cardWidth, cardHeight);
      this.faces.push(this.wrap(made, at.x, at.y));
    }

    let lastBottom = count > 0 ? slotOf(count - 1).y + cardHeight / 2 : firstY;
    if (this.payload.discard) {
      lastBottom = this.addDiscard(centerX, lastBottom + 12 + DISCARD_H / 2, this.payload.discard.label) + DISCARD_H / 2;
    }
    fitText(
      this.add
        .text(centerX, Math.min(height - 16, lastBottom + foot - 12), prefersTouchControls() ? copy.hintTouch : copy.hintKeyboard, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.small,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui),
      width,
    );

    this.refresh();
    // Face down, then over one after another; nothing is taken until all are up.
    const turned = this.dealFaceDown(cardWidth, cardHeight);
    this.time.delayedCall(Math.max(SkillPickScene.INPUT_LOCK_MS, turned), () => { this.unlocked = true; });
    this.input.keyboard?.on('keydown', this.onKeyDown, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.onKeyDown, this);
    });
  }

  /**
   * The TCG grid (0.129): as many across as leave the biggest card at
   * SKILL_CARD.tcg.aspect, or null when even that is under its minimum —
   * the plain cards are used then.
   */
  private static tcgLayout(count: number, usable: number, roomHigh: number): { columns: number; w: number; h: number } | null {
    const { aspect, minWidth, minHeight, maxHeight } = SKILL_CARD.tcg;
    let best: { columns: number; w: number; h: number } | null = null;
    for (let columns = 1; columns <= count; columns++) {
      const rows = Math.ceil(count / columns);
      const h0 = Math.min(maxHeight, (roomHigh - CARD_GAP * (rows - 1)) / rows);
      const w = Math.min((usable - CARD_GAP * (columns - 1)) / columns, h0 * aspect);
      const h = w / aspect;
      if (!best || w > best.w) {
        best = { columns, w, h };
      }
    }
    return best && best.w >= minWidth && best.h >= minHeight ? best : null;
  }

  /** Gathers what was drawn since `from` into one card face at (x, y), so it can be turned over. */
  private wrap(from: number, x: number, y: number): Phaser.GameObjects.Container {
    const made = this.children.list.slice(from) as (Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform)[];
    const face = this.add.container(x, y).setDepth(DEPTH.ui + 1);
    made.forEach((part) => {
      part.setPosition(part.x - x, part.y - y);
      face.add(part);
    });
    return face;
  }

  /**
   * Every card dealt face down, turned over one after another (0.129):
   * a back that narrows to nothing, then the face that widens out of it.
   * Returns when the last is up.
   */
  private dealFaceDown(w: number, h: number): number {
    const { staggerMs, flipMs } = SKILL_CARD.flip;
    const back = SKILL_CARD.back;
    this.faces.forEach((face, i) => {
      const cover = this.add.container(face.x, face.y).setDepth(DEPTH.ui + 2);
      const g = this.add.graphics();
      g.fillStyle(back.fill, 1).fillRect(-w / 2, -h / 2, w, h);
      g.lineStyle(3, back.edge, 1).strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
      g.lineStyle(2, back.mark, 1).strokeRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20);
      const r = Math.min(w, h) * 0.22;
      g.fillStyle(back.mark, 1).fillPoints([new Phaser.Math.Vector2(0, -r), new Phaser.Math.Vector2(r * 0.7, 0),
        new Phaser.Math.Vector2(0, r), new Phaser.Math.Vector2(-r * 0.7, 0)], true);
      g.lineStyle(2, back.edge, 0.9).strokePoints([new Phaser.Math.Vector2(0, -r), new Phaser.Math.Vector2(r * 0.7, 0),
        new Phaser.Math.Vector2(0, r), new Phaser.Math.Vector2(-r * 0.7, 0)], true);
      cover.add(g);
      face.scaleX = 0;
      this.tweens.add({
        targets: cover,
        scaleX: 0,
        delay: i * staggerMs,
        duration: flipMs / 2,
        ease: 'Quad.easeIn',
        onComplete: () => {
          cover.destroy();
          this.tweens.add({ targets: face, scaleX: 1, duration: flipMs / 2, ease: 'Quad.easeOut' });
        },
      });
    });
    return this.faces.length === 0 ? 0 : (this.faces.length - 1) * staggerMs + flipMs + 20;
  }

  /**
   * One TCG card (0.129): its name on a banner with its icon, the skill's
   * picture framed in its colour, a type line (새 스킬 / 강화 and the tags),
   * and a text box with what holding it gives and what it does.
   */
  private buildTcgCard(index: number, skill: SkillId, x: number, y: number, w: number, h: number): CardView {
    const copy = t().skillPick;
    const owned = this.payload.owned.includes(skill);
    const tone = PLAYER_LOOK.bySkill[skill]?.glow ?? COLORS.panelEdge;
    const left = x - w / 2;
    const top = y - h / 2;
    const panel = this.add
      .rectangle(x, y, w, h, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui)
      .setInteractive({ useHandCursor: true });
    const frame = this.add.graphics().setDepth(DEPTH.ui);
    frame.lineStyle(2, tone, 0.85).strokeRect(left + 4, top + 4, w - 8, h - 8);

    // The banner: icon and name.
    const iconSize = Math.min(20, h * 0.09);
    const nameY = top + 10;
    const icon = SKILL_ICONS[skill];
    if (icon && this.textures.exists(icon.key)) {
      this.add.image(left + 10 + iconSize / 2, nameY + iconSize / 2, icon.key).setDisplaySize(iconSize, iconSize).setDepth(DEPTH.ui + 1);
    }
    const name = fitText(
      this.add
        .text(x + iconSize / 2, nameY, skillName(skill), { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.text })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.ui + 1),
      w - 24 - iconSize,
      0,
    );

    // The picture, framed in the skill's colour.
    const artW = w - 14;
    const artH = Math.min(artW * (SKILL_ART.height / SKILL_ART.width), h * 0.36);
    const artTop = nameY + Math.max(name.displayHeight, iconSize) + 6;
    this.add.image(x, artTop + artH / 2, skillArtTexture(skill)).setDisplaySize(artW, artH).setDepth(DEPTH.ui + 1);
    frame.lineStyle(2, tone, 1).strokeRect(x - artW / 2, artTop, artW, artH);

    // The type line.
    const level = this.payload.levels?.[skill];
    const badge = owned ? fill(copy.upgrade, { level: level ?? 1 }) : copy.new;
    const tags = SKILLS[skill].tags.map((tag) => tagName(tag)).join(' · ');
    const typeLine = fitText(
      this.add
        .text(x, artTop + artH + 5, `${badge} · ${tags}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.small,
          color: owned ? COLORS.accent : COLORS.gearText,
        })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.ui + 1),
      w - 16,
      0,
    );

    // The text box.
    const boxTop = typeLine.y + typeLine.displayHeight + 5;
    const boxH = top + h - 7 - boxTop;
    this.add.rectangle(x, boxTop + boxH / 2, w - 14, boxH, 0x0b0e14, 0.9).setStrokeStyle(1, COLORS.panelEdge, 1).setDepth(DEPTH.ui + 1);
    // In the box: what holding it gives (gold), then what it does — in the
    // card's own small print, as many lines as there is room for.
    const note = this.payload.notes?.[skill];
    const print = { fontFamily: 'system-ui, sans-serif', fontSize: SKILL_CARD.textPx, align: 'center', wordWrap: { width: w - 22 } };
    let at = boxTop + 4;
    if (!note) {
      const held = this.add
        .text(x, at, heldBonusText(skill).replace(/^[^—]*—\s*/, ''), { ...print, color: COLORS.gearText })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.ui + 2);
      held.setMaxLines(2);
      at += held.displayHeight + 2;
    }
    const body = this.add
      .text(x, at, note ? note.text : skillSummary(skill), {
        ...print,
        color: note?.warn ? COLORS.warnText : note ? COLORS.text : COLORS.muted,
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 2);
    const lineHeight = body.style.getTextMetrics().fontSize + body.lineSpacing;
    // Counted a little short: the game font's lines run taller than their size.
    body.setMaxLines(Math.max(1, Math.floor((boxTop + boxH - 4 - at) / (lineHeight * 1.15))));

    panel.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      if (!this.picked) {
        this.selected = index;
        this.refresh();
      }
    });
    panel.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.pick(index));
    return { skill, panel, name, x, y };
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

  /** Takes none of the cards, where that is offered. Public so a test can. */
  public discard(): void {
    const { discard } = this.payload;
    if (this.picked || !this.unlocked || !discard) {
      return;
    }
    this.picked = true;
    this.scene.stop();
    discard.onDiscard();
  }

  /** The 버리기 button under the cards; returns where its middle is. */
  private addDiscard(x: number, y: number, label: string): number {
    const plate = this.add
      .rectangle(x, y, DISCARD_W, DISCARD_H, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, prefersTouchControls() ? label : `${label}  (Esc)`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.warnText,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
    fitText(text, DISCARD_W - 10, 0);
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => plate.setStrokeStyle(3, COLORS.accentFill, 1));
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => plate.setStrokeStyle(2, COLORS.panelEdge, 1));
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.discard());
    this.discardButton = plate;
    return y;
  }

  /**
   * The day's banned skill (예언): its card dimmed under a red edge, its
   * picture greyed, and the prophecy laid over it in a framed note.
   */
  private buildBannedCard(
    prophecy: NonNullable<SkillPickData['prophecy']>,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const panel = this.add
      .rectangle(x, y, w, h, COLORS.panel, 0.6)
      .setStrokeStyle(2, COLORS.accentFill, 0.9)
      .setDepth(DEPTH.ui);
    // A TCG card (0.129) keeps its name and its picture, greyed under a
    // 금지 stamp, the prophecy in a note below; a plain card is all note,
    // the skill's icon greyed in its corner.
    let noteTop = y - h / 2 + 6;
    if (this.tcg) {
      const name = fitText(
        this.add
          .text(x, y - h / 2 + 10, skillName(prophecy.skill), { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.muted })
          .setOrigin(0.5, 0)
          .setDepth(DEPTH.ui + 1),
        w - 20,
        0,
      );
      // A shorter picture than a takeable card's: the prophecy needs the room.
      const artW = w - 14;
      const artH = Math.min(artW * (SKILL_ART.height / SKILL_ART.width), h * 0.22);
      const artTop = name.y + name.displayHeight + 6;
      this.add.image(x, artTop + artH / 2, skillArtTexture(prophecy.skill)).setDisplaySize(artW, artH).setTint(0x555a66).setDepth(DEPTH.ui + 1);
      this.add
        .text(x, artTop + artH / 2, t().daily.banned, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.heading,
          color: COLORS.warnText,
          stroke: '#1a0606',
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setAngle(-12)
        .setDepth(DEPTH.ui + 2);
      noteTop = artTop + artH + 6;
    }
    const noteH = y + h / 2 - 6 - noteTop;
    this.add
      .rectangle(x, noteTop + noteH / 2, w - 12, noteH, 0x1a1208, 0.92)
      .setStrokeStyle(2, COLORS.dailyFill, 1)
      .setDepth(DEPTH.ui + 2);
    const icon = SKILL_ICONS[prophecy.skill];
    const iconSize = this.tcg ? 0 : Math.min(SKILL_ICON_SIZE.drop, 28);
    if (!this.tcg && icon && this.textures.exists(icon.key)) {
      this.add
        .image(x - w / 2 + 12 + iconSize / 2, noteTop + 6 + iconSize / 2, icon.key)
        .setDisplaySize(iconSize, iconSize)
        .setTint(0x8a8f9c)
        .setAlpha(0.7)
        .setDepth(DEPTH.ui + 3);
    }
    const title = fitText(
      this.add
        .text(x, noteTop + 8, prophecy.title, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.daily })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.ui + 3),
      w - 24 - iconSize * 2,
      0,
    );
    const words = this.add
      .text(x, Math.max(noteTop + 12 + title.displayHeight, noteTop + 8 + iconSize), prophecy.lines.join('\n'), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: this.tcg ? SKILL_CARD.textPx : TEXT.size.small,
        color: COLORS.text,
        align: 'center',
        wordWrap: { width: w - 24 },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 3);
    // Shrunk to the note if the card is short (a phone lying down).
    const room = noteTop + noteH - 4 - words.y;
    if (words.displayHeight > room && words.displayHeight > 0) {
      words.setScale(Math.max(0.5, room / words.displayHeight));
    }
    this.bannedCard = { skill: prophecy.skill, panel, words };
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
    const body = this.add
      .text(textX, ty, note ? note.text : `${heldBonusText(skill)}
${skillSummary(skill)}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: note?.warn ? COLORS.warnText : note ? COLORS.text : COLORS.muted,
        align: compact ? 'left' : 'center',
        wordWrap: { width: textWidth },
      })
      .setOrigin(origin, 0)
      .setDepth(DEPTH.ui + 1);
    // As many lines as the card has room left for, by the font's own line
    // height (a fixed 17px let the game font's last line out of the card).
    const lineHeight = body.style.getTextMetrics().fontSize + body.lineSpacing;
    body.setMaxLines(Math.max(1, Math.min(4, Math.floor((y + h / 2 - 8 - ty) / lineHeight))));

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
      if (this.payload.onBack) {
        this.back();
      } else {
        this.discard();
      }
    }
  }
}
