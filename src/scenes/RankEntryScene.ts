import Phaser from 'phaser';

import { COLORS, DEPTH, RANKING, SCENES, SCRIM, TEXT } from '@/config';
import { fill, t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { fitText } from '@/systems/Layout';
import { ranking, type RankSubmission } from '@/systems/Ranking';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export interface RankEntryData {
  /** The run being entered, without its name. */
  readonly run: Omit<RankSubmission, 'name' | 'emoji'>;
  /** The place it took, or 0 when it was skipped. */
  readonly onDone: (place: number) => void;
}

const SLOT = 52;
const SLOT_GAP = 12;
const ARROW = 30;
const BUTTON_WIDTH = 130;
const BUTTON_HEIGHT = 40;

interface SlotView {
  readonly box: Phaser.GameObjects.Rectangle;
  readonly text: Phaser.GameObjects.Text;
}

/**
 * Entering a name for the board: three letters and one emoji, the way an
 * arcade cabinet asks — a slot each, stepped with ▲ ▼, so a phone with no
 * keyboard can do it as easily as a desk can. A keyboard can also just type
 * the letters.
 *
 * Up to three letters: a slot can be left blank. The emoji slot starts
 * empty, and leaving it so is fine.
 */
export class RankEntryScene extends Phaser.Scene {
  public static readonly KEY = SCENES.rankEntry;
  /** The way out in the corner — the same as 건너뛰기. Public for tests. */
  public backButton?: BackButton;
  /** Which choice each slot is on: indexes into letters, then emoji. Public for tests. */
  public picks: number[] = [];
  /** Which slot the keyboard is on. Public for tests. */
  public cursor = 0;

  private payload!: RankEntryData;
  private slots: SlotView[] = [];
  private done = false;

  public constructor() {
    super(RankEntryScene.KEY);
  }

  public init(data: RankEntryData): void {
    this.payload = data;
    this.done = false;
    this.cursor = 0;
    this.slots = [];
    // Start on the name entered last time, so a second entry is one press.
    const letters = RANKING.letters;
    const last = ranking.lastName.padEnd(RANKING.nameLength, ' ');
    this.picks = [
      ...[...last].slice(0, RANKING.nameLength).map((ch) => Math.max(0, letters.indexOf(ch))),
      Math.max(0, (RANKING.emoji as readonly string[]).indexOf(ranking.lastEmoji)),
    ];
    // A first entry starts on "A", not on a blank.
    if (!ranking.lastName) {
      this.picks[0] = 1;
    }
  }

  /** The name as it stands: the letters with the blanks taken out. */
  public get name(): string {
    return this.picks
      .slice(0, RANKING.nameLength)
      .map((i) => RANKING.letters[i] ?? ' ')
      .join('')
      .replace(/ /g, '');
  }

  public get emoji(): string {
    return RANKING.emoji[this.picks[RANKING.nameLength] ?? 0] ?? '';
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.finish(false));
    const { width, height } = this.scale;
    const copy = t().ranking;
    const place = ranking.placeFor(this.payload.run.damage);

    // Opaque: the end screen waits underneath, and its table showing through
    // the letters made both unreadable.
    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);

    const block = 60 + 40 + ARROW + SLOT + ARROW + 30 + BUTTON_HEIGHT + 40;
    const top = Math.max(56, (height - block) / 2);

    fitText(
      this.add
        .text(width / 2, top + 20, fill(copy.entryTitle, { place }), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.banner,
          color: COLORS.gearText,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 16,
    );
    fitText(
      this.add
        .text(width / 2, top + 62, fill(copy.entryLead, {
          damage: Math.round(this.payload.run.damage).toLocaleString('en-US'),
        }), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.small,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 16,
    );

    // Three letter slots, a gap, and the emoji slot.
    const count = RANKING.nameLength + 1;
    const span = count * SLOT + (count - 1) * SLOT_GAP + SLOT_GAP;
    const slotY = top + 100 + ARROW + SLOT / 2;
    for (let i = 0; i < count; i++) {
      const x = width / 2 - span / 2 + SLOT / 2 + i * (SLOT + SLOT_GAP) + (i === count - 1 ? SLOT_GAP : 0);
      this.buildSlot(i, x, slotY);
    }

    const buttonsY = slotY + SLOT / 2 + ARROW + 30 + BUTTON_HEIGHT / 2;
    this.button(width / 2 - BUTTON_WIDTH / 2 - 8, buttonsY, copy.confirm, COLORS.accentFill, () => this.finish(true));
    this.button(width / 2 + BUTTON_WIDTH / 2 + 8, buttonsY, copy.skip, COLORS.panel, () => this.finish(false));

    fitText(
      this.add
        .text(width / 2, buttonsY + BUTTON_HEIGHT / 2 + 22, prefersTouchControls() ? copy.entryHintTouch : copy.entryHintKeyboard, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 16,
    );

    this.refresh();
    this.input.keyboard?.on('keydown', this.onKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.onKey, this);
    });
  }

  /** Steps one slot's choice up or down, round and round. */
  public step(slot: number, by: number): void {
    const size = slot < RANKING.nameLength ? RANKING.letters.length : RANKING.emoji.length;
    this.picks[slot] = (((this.picks[slot] ?? 0) + by) % size + size) % size;
    this.cursor = slot;
    this.refresh();
  }

  /** 등록 or 건너뛰기. Either way the popup closes and says where it landed. */
  public finish(enter: boolean): void {
    if (this.done) {
      return;
    }
    this.done = true;

    const place = enter
      ? ranking.submit({ ...this.payload.run, name: this.name, emoji: this.emoji })
      : 0;
    const { onDone } = this.payload;
    this.scene.stop();
    onDone(place);
  }

  private buildSlot(index: number, x: number, y: number): void {
    const box = this.add
      .rectangle(x, y, SLOT, SLOT, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.cursor = index;
      this.refresh();
    });

    const text = this.add
      .text(x, y, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.banner, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);

    const arrow = (dy: number, glyph: string, by: number) => {
      const hit = this.add
        .rectangle(x, y + dy, SLOT, ARROW, COLORS.panel, 0.001)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, y + dy, glyph, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.muted })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.step(index, by));
    };
    arrow(-(SLOT / 2 + ARROW / 2), '▲', 1);
    arrow(SLOT / 2 + ARROW / 2, '▼', -1);

    this.slots.push({ box, text });
  }

  private button(x: number, y: number, label: string, fillColor: number, onPress: () => void): void {
    const plate = this.add
      .rectangle(x, y, BUTTON_WIDTH, BUTTON_HEIGHT, fillColor, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
  }

  private refresh(): void {
    this.slots.forEach((slot, i) => {
      const isEmoji = i === RANKING.nameLength;
      const value = isEmoji ? RANKING.emoji[this.picks[i] ?? 0] : RANKING.letters[this.picks[i] ?? 0];
      // A blank slot shows a dot, so it reads as "empty" rather than broken.
      slot.text.setText(value && value !== ' ' ? value : '·');
      slot.box.setStrokeStyle(i === this.cursor ? 3 : 2, i === this.cursor ? COLORS.accentFill : COLORS.panelEdge, 1);
    });
  }

  private onKey(event: KeyboardEvent): void {
    if (this.done) {
      return;
    }

    const last = RANKING.nameLength;
    switch (event.code) {
      case 'ArrowLeft':
        this.cursor = Math.max(0, this.cursor - 1);
        this.refresh();
        return;
      case 'ArrowRight':
        this.cursor = Math.min(last, this.cursor + 1);
        this.refresh();
        return;
      case 'ArrowUp':
        this.step(this.cursor, 1);
        return;
      case 'ArrowDown':
        this.step(this.cursor, -1);
        return;
      case 'Enter':
      case 'NumpadEnter':
        this.finish(true);
        return;
      case 'Escape':
        this.finish(false);
        return;
      case 'Backspace':
        if (this.cursor < last) {
          this.picks[this.cursor] = 0;
        }
        this.cursor = Math.max(0, this.cursor - 1);
        this.refresh();
        return;
      default:
        break;
    }

    // A letter typed goes in the slot under the cursor, and the cursor moves on.
    const key = event.key?.toUpperCase() ?? '';
    if (/^[A-Z]$/.test(key) && this.cursor < last) {
      this.picks[this.cursor] = RANKING.letters.indexOf(key);
      this.cursor = Math.min(last, this.cursor + 1);
      this.refresh();
    }
  }
}
