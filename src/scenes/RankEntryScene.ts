import Phaser from 'phaser';

import { ACCOUNT, COLORS, DEPTH, RANKING, SCENES, SCRIM, TEXT } from '@/config';
import { fill, language, t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { fitText } from '@/systems/Layout';
import { flagTexture, ranking, type RankSubmission } from '@/systems/Ranking';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { account } from '@/systems/Account';
import { keepPendingRank } from '@/systems/PendingRank';

export interface RankEntryData {
  /** The run being entered, without its name. */
  readonly run: Omit<RankSubmission, 'name' | 'emoji' | 'flag'>;
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
  /** Only the flag slot draws one. */
  readonly image?: Phaser.GameObjects.Image;
}

/** A first entry's flag, guessed from the language the game is in. */
const FLAG_FOR_LANGUAGE: Record<string, string> = { ko: 'KR', ja: 'JP', zh: 'CN', en: 'US' };

/** Slots in order: the letters, then the emoji, then the flag. */
const EMOJI_SLOT = RANKING.nameLength;
const FLAG_SLOT = RANKING.nameLength + 1;
const SLOT_COUNT = RANKING.nameLength + 2;

/**
 * Entering a name for the board: three letters, one emoji and a flag, the way an
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
    // Start on the account's own name on the board, or the name entered last
    // time, so a second entry is one press.
    const letters = RANKING.letters;
    const mine = account.user?.rank;
    const lastName = mine?.name || ranking.lastName;
    const last = lastName.padEnd(RANKING.nameLength, ' ');
    const flag = (mine?.name ? mine.flag : ranking.lastFlag) || FLAG_FOR_LANGUAGE[language()] || '';
    const emoji = mine?.name ? mine.emoji : ranking.lastEmoji;
    this.picks = [
      ...[...last].slice(0, RANKING.nameLength).map((ch) => Math.max(0, letters.indexOf(ch))),
      Math.max(0, (RANKING.emoji as readonly string[]).indexOf(emoji)),
      Math.max(0, (RANKING.flags as readonly string[]).indexOf(flag)),
    ];
    // A first entry starts on "A", not on a blank.
    if (!lastName) {
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
    return RANKING.emoji[this.picks[EMOJI_SLOT] ?? 0] ?? '';
  }

  public get flag(): string {
    return RANKING.flags[this.picks[FLAG_SLOT] ?? 0] ?? '';
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

    // Three letter slots, a gap, then the emoji and the flag. On a narrow
    // screen the slots shrink rather than run off the sides.
    const span = SLOT_COUNT * SLOT + (SLOT_COUNT - 1) * SLOT_GAP + SLOT_GAP;
    const fit = Math.min(1, (width - 24) / span);
    const slotY = top + 100 + ARROW + SLOT / 2;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const offset = SLOT / 2 + i * (SLOT + SLOT_GAP) + (i >= EMOJI_SLOT ? SLOT_GAP : 0);
      this.buildSlot(i, width / 2 + (offset - span / 2) * fit, slotY, SLOT * fit);
    }

    const buttonsY = slotY + SLOT / 2 + ARROW + 30 + BUTTON_HEIGHT / 2;
    this.button(
      width / 2 - BUTTON_WIDTH / 2 - 8,
      buttonsY,
      this.needsSignIn ? copy.loginToEnter : copy.confirm,
      COLORS.accentFill,
      () => this.finish(true),
    );
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
    const size =
      slot < RANKING.nameLength
        ? RANKING.letters.length
        : slot === EMOJI_SLOT
          ? RANKING.emoji.length
          : RANKING.flags.length;
    this.picks[slot] = (((this.picks[slot] ?? 0) + by) % size + size) % size;
    this.cursor = slot;
    this.refresh();
  }

  /** 등록 or 건너뛰기. Either way the popup closes and says where it landed. */
  /**
   * The shared board takes runs from accounts only: signed out, entering
   * goes by way of signing in, and the run waits for it (PendingRank).
   */
  public get needsSignIn(): boolean {
    return RANKING.shared.enabled && ACCOUNT.enabled && !account.signedIn;
  }

  public finish(enter: boolean): void {
    if (this.done) {
      return;
    }
    if (enter && this.needsSignIn) {
      this.signInFirst();
      return;
    }
    this.done = true;

    const place = enter
      ? ranking.submit({ ...this.payload.run, name: this.name, emoji: this.emoji, flag: this.flag })
      : 0;
    const { onDone } = this.payload;
    this.scene.stop();
    onDone(place);
  }

  private buildSlot(index: number, x: number, y: number, size: number): void {
    const box = this.add
      .rectangle(x, y, size, size, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    box.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.cursor = index;
      this.refresh();
    });

    const text = this.add
      .text(x, y, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: size >= SLOT ? TEXT.size.banner : TEXT.size.heading,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    const image =
      index === FLAG_SLOT
        ? this.add.image(x, y, '__DEFAULT').setDepth(DEPTH.ui + 2).setVisible(false)
        : undefined;

    const arrow = (dy: number, glyph: string, by: number) => {
      const hit = this.add
        .rectangle(x, y + dy, size, ARROW, COLORS.panel, 0.001)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, y + dy, glyph, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.muted })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.step(index, by));
    };
    arrow(-(size / 2 + ARROW / 2), '▲', 1);
    arrow(size / 2 + ARROW / 2, '▼', -1);

    this.slots.push({ box, text, image });
  }

  /** The account screen, over this one; the run goes with the trip to the provider. */
  private signInFirst(): void {
    const run: RankSubmission = { ...this.payload.run, name: this.name, emoji: this.emoji, flag: this.flag };
    this.scene.pause();
    this.scene.launch(SCENES.account, {
      reason: 'ranking',
      onBeforeLogin: () => keepPendingRank(run),
      onClose: () => this.scene.resume(),
    });
    this.scene.bringToTop(SCENES.account);
  }

  private button(x: number, y: number, label: string, fillColor: number, onPress: () => void): void {
    const plate = this.add
      .rectangle(x, y, BUTTON_WIDTH, BUTTON_HEIGHT, fillColor, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    fitText(
      this.add
        .text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.text })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2),
      BUTTON_WIDTH + 24,
    );
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
  }

  private refresh(): void {
    this.slots.forEach((slot, i) => {
      const value =
        i === EMOJI_SLOT
          ? RANKING.emoji[this.picks[i] ?? 0]
          : i === FLAG_SLOT
            ? RANKING.flags[this.picks[i] ?? 0]
            : RANKING.letters[this.picks[i] ?? 0];
      // A flag is drawn; a blank slot shows a dot, so it reads as "empty".
      const drawn = i === FLAG_SLOT && value ? flagTexture(value) : '';
      if (slot.image) {
        slot.image.setVisible(drawn !== '');
        if (drawn) {
          slot.image.setTexture(drawn).setDisplaySize(slot.box.width * 0.72, slot.box.width * 0.48);
        }
      }
      slot.text.setText(drawn ? '' : value && value !== ' ' ? value : '·');
      slot.box.setStrokeStyle(i === this.cursor ? 3 : 2, i === this.cursor ? COLORS.accentFill : COLORS.panelEdge, 1);
    });
  }

  private onKey(event: KeyboardEvent): void {
    if (this.done) {
      return;
    }

    const last = FLAG_SLOT;
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
        if (this.cursor < RANKING.nameLength) {
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
    if (/^[A-Z]$/.test(key) && this.cursor < RANKING.nameLength) {
      this.picks[this.cursor] = RANKING.letters.indexOf(key);
      this.cursor = Math.min(last, this.cursor + 1);
      this.refresh();
    }
  }
}
