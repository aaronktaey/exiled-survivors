import Phaser from 'phaser';

import {
  ALL_BONES,
  BONES,
  BONE_RUN,
  COLORS,
  DEPTH,
  INVENTORY,
  SCENES,
  SCRIM,
  TEXT,
  boneBonusFor,
  type BoneId,
} from '@/config';
import { boneDetail, boneName, boneShort, fill, t } from '@/i18n';
import { bones } from '@/systems/Bones';
import { centredTop, fitText, fitWidth } from '@/systems/Layout';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { addBackButton, type BackButton } from '@/systems/BackButton';

export interface BoneSceneData {
  /** Starts the run with these, having spent them. */
  readonly onStart: (applied: readonly BoneId[]) => void;
  readonly onCancel: () => void;
}

/** One thing on the screen that can be pointed at and pressed. */
export interface BoneChoice {
  readonly id: BoneId | 'clear' | 'start';
  readonly enabled: () => boolean;
  readonly onSelect: () => void;
}

/** A card per 뼈다귀 in the drawer, its sprite this big. */
const CARD = { w: 92, h: 92, gap: 12, icon: 44 };
/** A slot per 뼈다귀 a run can take. */
const SLOT = { size: 60, gap: 12, icon: 38 };
const BUTTON = { w: 168, h: 40, gap: 14 };
const FOOTER = 44;
/** The edge on whatever the keyboard is pointing at. */
const FOCUS_EDGE = 0xf4f1e8;

/**
 * 뼈다귀 — what this run is going to be, decided before it starts.
 *
 * Everything else the survivor carries is permanent and the choice is
 * therefore easy: carry the better sword. A 뼈다귀 is spent, so the choice
 * is a real one — a 갈비뼈 doubles what every enemy can take, and whether
 * that is worth half again the drops depends on the run you think you are
 * about to have.
 *
 * The screen is pictures rather than lines: a card per 뼈다귀 held, with how
 * many are left on it; pressing one drops it into the next of the run's
 * slots, and pressing a slot takes it out again. What the card does is read
 * out under the row for the one being pointed at, and what the slots come to
 * under them.
 */
export class BoneScene extends Phaser.Scene {
  public static readonly KEY = SCENES.bones;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;

  private payload!: BoneSceneData;
  /** Everything that can be pressed, cards first. Public so a test can drive it. */
  public choices: BoneChoice[] = [];
  /** Which of `choices` the keyboard is on. */
  public focused = 0;
  /** The slots' sprites, one per slot, hidden while it is empty. Public for tests. */
  public slotIcons: Phaser.GameObjects.Image[] = [];
  /** What the slots add up to. Public for tests. */
  public summary!: Phaser.GameObjects.Text;
  /** What the card being pointed at does. Public for tests. */
  public detail!: Phaser.GameObjects.Text;
  /** What has been put in the slots, in the order it went in. */
  public applied: BoneId[] = [];

  private plates: Phaser.GameObjects.Rectangle[] = [];
  private counts = new Map<BoneId, Phaser.GameObjects.Text>();
  private cards = new Map<BoneId, Phaser.GameObjects.GameObject[]>();
  private buttonLabels: Phaser.GameObjects.Text[] = [];

  public constructor() {
    super(BoneScene.KEY);
  }

  /**
   * The step before every fresh run — from 게임 시작 and from 다시하기 alike.
   * Opens this screen over `host`, which waits paused underneath; with an
   * empty drawer the screen would be a page of nothing between the button
   * and the game, so it goes straight on with no 뼈다귀.
   *
   * `onStart` gets what was spent; `onCancel` runs once this screen is gone
   * and `host` is running again.
   */
  public static before(
    host: Phaser.Scene,
    onStart: (applied: readonly BoneId[]) => void,
    onCancel: () => void,
  ): void {
    if (bones.total === 0) {
      onStart([]);
      return;
    }

    host.scene.pause();
    host.scene.bringToTop(SCENES.bones);
    host.scene.launch(SCENES.bones, {
      onStart: (applied: readonly BoneId[]) => {
        host.scene.resume();
        onStart(applied);
      },
      onCancel: () => {
        host.scene.stop(SCENES.bones);
        host.scene.resume();
        onCancel();
      },
    } satisfies BoneSceneData);
  }

  public init(data: BoneSceneData): void {
    this.payload = data;
    // The scene instance outlives a launch; last run's picks are not this
    // run's, and they were never spent.
    this.applied = [];
    this.choices = [];
    this.focused = 0;
    this.slotIcons = [];
    this.plates = [];
    this.counts = new Map();
    this.cards = new Map();
    this.buttonLabels = [];
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.payload.onCancel());
    const { width, height } = this.scale;
    const copy = t().bones;
    const held = ALL_BONES.filter((bone) => bones.count(bone.id) > 0);
    const compact = height < 480;

    this.add
      .rectangle(0, 0, width, height, 0x05070b, SCRIM.reading)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ui);

    // Title, lead, cards, what the card does, slots, their total, buttons.
    const cardScale = Math.min(1, (width - 32 + CARD.gap) / (held.length * (CARD.w + CARD.gap)));
    const cardW = Math.floor(CARD.w * cardScale);
    const cardH = compact ? Math.floor(CARD.h * 0.88) : CARD.h;
    const gaps = compact ? { lead: 14, cards: 6, detail: 12, slots: 8, summary: 14 } : { lead: 20, cards: 8, detail: 18, slots: 10, summary: 20 };
    const block =
      34 + 8 + 22 + gaps.lead + cardH + gaps.cards + 20 + gaps.detail + SLOT.size + gaps.slots + 22 + gaps.summary + BUTTON.h;
    let y = centredTop(height - FOOTER, block, 20);

    const text = (x: number, at: number, value: string, size: string, color: string) =>
      this.add
        .text(x, at, value, { fontFamily: 'system-ui, sans-serif', fontSize: size, color, align: 'center' })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1);

    fitText(text(width / 2, y + 17, copy.title, TEXT.size.screen, COLORS.text), width - 220);
    y += 34 + 8;
    fitText(text(width / 2, y + 11, fill(copy.lead, { max: BONE_RUN.maxApplied }), TEXT.size.body, COLORS.muted), width - 24);
    y += 22 + gaps.lead;

    // The drawer: a card per 뼈다귀 held.
    const rowWidth = held.length * cardW + (held.length - 1) * CARD.gap;
    held.forEach((bone, index) => {
      const x = (width - rowWidth) / 2 + index * (cardW + CARD.gap) + cardW / 2;
      const cy = y + cardH / 2;
      const plate = this.plate(x, cy, cardW, cardH, INVENTORY.border[bone.tier]);
      const icon = this.add
        .image(x, cy - 10, bone.texture)
        .setDisplaySize(CARD.icon * cardScale, CARD.icon * cardScale)
        .setDepth(DEPTH.ui + 2);
      const count = this.add
        .text(x + cardW / 2 - 6, cy - cardH / 2 + 4, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.gearText,
        })
        .setOrigin(1, 0)
        .setDepth(DEPTH.ui + 2);
      const name = fitText(
        text(x, cy + cardH / 2 - 14, boneShort(bone.id), TEXT.size.small, COLORS.text).setDepth(DEPTH.ui + 2),
        cardW - 8,
        0,
      );
      this.counts.set(bone.id, count);
      this.cards.set(bone.id, [icon, count, name]);
      this.addChoice(plate, {
        id: bone.id,
        enabled: () => bones.canApply(bone.id, this.applied),
        onSelect: () => this.apply(bone.id),
      });
    });
    y += cardH + gaps.cards;

    this.detail = text(width / 2, y + 10, '', TEXT.size.hint, COLORS.muted);
    y += 20 + gaps.detail;

    // The run's slots: pressing a full one takes it back out.
    const slotsWidth = BONE_RUN.maxApplied * SLOT.size + (BONE_RUN.maxApplied - 1) * SLOT.gap;
    for (let index = 0; index < BONE_RUN.maxApplied; index++) {
      const x = (width - slotsWidth) / 2 + index * (SLOT.size + SLOT.gap) + SLOT.size / 2;
      const cy = y + SLOT.size / 2;
      const slot = this.plate(x, cy, SLOT.size, SLOT.size, COLORS.panelEdge);
      slot.setFillStyle(INVENTORY.empty, 1);
      slot.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.takeOut(index));
      this.slotIcons.push(
        this.add
          .image(x, cy, BONES.skull.texture)
          .setDisplaySize(SLOT.icon, SLOT.icon)
          .setDepth(DEPTH.ui + 2)
          .setVisible(false),
      );
    }
    y += SLOT.size + gaps.slots;

    this.summary = text(width / 2, y + 11, '', TEXT.size.hint, COLORS.gearText);
    this.summary.setWordWrapWidth(fitWidth(560, width));
    y += 22 + gaps.summary;

    // 모두 빼기 and 이대로 시작, side by side.
    const buttonW = Math.min(BUTTON.w, (width - 32 - BUTTON.gap) / 2);
    const buttons: Array<Omit<BoneChoice, 'id'> & { id: 'clear' | 'start'; label: string }> = [
      { id: 'clear', label: copy.clear, enabled: () => this.applied.length > 0, onSelect: () => this.clear() },
      { id: 'start', label: copy.start, enabled: () => true, onSelect: () => this.start() },
    ];
    buttons.forEach((button, index) => {
      const x = width / 2 + (index === 0 ? -1 : 1) * (buttonW / 2 + BUTTON.gap / 2);
      const cy = y + BUTTON.h / 2;
      const plate = this.plate(x, cy, buttonW, BUTTON.h, index === 1 ? COLORS.accentFill : COLORS.panelEdge);
      this.buttonLabels.push(
        fitText(text(x, cy, button.label, TEXT.size.body, COLORS.text).setDepth(DEPTH.ui + 2), buttonW - 12, 0),
      );
      this.addChoice(plate, button);
    });

    fitText(
      text(width / 2, height - FOOTER / 2, prefersTouchControls() ? copy.hintTouch : copy.hintKeyboard, TEXT.size.hint, COLORS.muted),
      width - 16,
    );

    this.armKeys();
    this.refresh();
  }

  /** Points the keyboard at a choice, by id. */
  public focus(id: BoneChoice['id']): void {
    const index = this.choices.findIndex((choice) => choice.id === id);
    if (index >= 0) {
      this.focused = index;
      this.refresh();
    }
  }

  /** A plate that can be pressed, edged in `edge`. */
  private plate(x: number, y: number, w: number, h: number, edge: number): Phaser.GameObjects.Rectangle {
    return this.add
      .rectangle(x, y, w, h, COLORS.panel, 1)
      .setStrokeStyle(2, edge, 1)
      .setData('edge', edge)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
  }

  private addChoice(plate: Phaser.GameObjects.Rectangle, choice: BoneChoice): void {
    const index = this.choices.length;
    this.choices.push(choice);
    this.plates.push(plate);
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => {
      this.focused = index;
      this.refresh();
    });
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.focused = index;
      this.press();
    });
  }

  private press(): void {
    const choice = this.choices[this.focused];
    if (choice?.enabled()) {
      choice.onSelect();
    } else {
      this.refresh();
    }
  }

  /** ← → along the cards, ↑ ↓ between the cards and the buttons. */
  private armKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const firstButton = this.choices.findIndex((choice) => choice.id === 'clear');
    const move = (by: number): void => {
      this.focused = Phaser.Math.Wrap(this.focused + by, 0, this.choices.length);
      this.refresh();
    };
    const onKey = (event: KeyboardEvent): void => {
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          move(-1);
          break;
        case 'ArrowRight':
        case 'KeyD':
          move(1);
          break;
        case 'ArrowUp':
        case 'KeyW':
          this.focused = this.focused >= firstButton ? 0 : this.focused;
          this.refresh();
          break;
        case 'ArrowDown':
        case 'KeyS':
          this.focused = this.focused < firstButton ? firstButton + 1 : this.focused;
          this.refresh();
          break;
        case 'Space':
        case 'Enter':
        case 'NumpadEnter':
          this.press();
          break;
        case 'Backspace':
        case 'Delete':
          this.takeOut(this.applied.length - 1);
          break;
        case 'Escape':
          this.payload.onCancel();
          break;
        default:
          return;
      }
      event.preventDefault?.();
    };
    keyboard.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off('keydown', onKey));
  }

  /** How many of one 뼈다귀 are already in the slots. */
  private used(id: BoneId): number {
    return this.applied.filter((one) => one === id).length;
  }

  /** Puts one in a slot, if the run can still take it. */
  private apply(id: BoneId): void {
    if (!bones.canApply(id, this.applied)) {
      return;
    }

    this.applied.push(id);
    this.refresh();
    const icon = this.slotIcons[this.applied.length - 1];
    if (icon) {
      this.tweens.add({ targets: icon, scale: { from: icon.scale * 1.5, to: icon.scale }, duration: 160, ease: 'Back.out' });
    }
  }

  /** Takes the one in this slot back out; the ones after it move up. */
  private takeOut(index: number): void {
    if (index < 0 || index >= this.applied.length) {
      return;
    }
    this.applied.splice(index, 1);
    this.refresh();
  }

  /** Empties the slots. Nothing has been spent, so nothing is lost. */
  private clear(): void {
    this.applied = [];
    this.refresh();
  }

  /**
   * Spends what is in the slots and hands the run what was actually taken —
   * the store trims rather than refuses, so the two can never disagree.
   */
  private start(): void {
    const spent = bones.spend(this.applied);
    this.scene.stop();
    this.payload.onStart(spent);
  }

  private refresh(): void {
    const copy = t().bones;

    this.counts.forEach((count, id) => count.setText(`×${bones.count(id) - this.used(id)}`));
    this.choices.forEach((choice, index) => {
      const on = choice.enabled();
      const plate = this.plates[index];
      const focused = index === this.focused;
      plate.setFillStyle(focused ? COLORS.panelActive : COLORS.panel, 1);
      plate.setAlpha(on ? 1 : 0.45);
      // The one the keyboard is on wears a bright edge; the rest their tier's.
      plate.setStrokeStyle(focused ? 3 : 2, focused ? FOCUS_EDGE : (plate.getData('edge') as number), 1);
      this.cards.get(choice.id as BoneId)?.forEach((part) => (part as Phaser.GameObjects.Image).setAlpha(on ? 1 : 0.4));
    });
    const buttonsFrom = this.choices.findIndex((choice) => choice.id === 'clear');
    this.buttonLabels.forEach((label, index) =>
      label.setAlpha(this.choices[buttonsFrom + index]?.enabled() ? 1 : 0.4),
    );

    this.slotIcons.forEach((icon, index) => {
      const id = this.applied[index];
      icon.setVisible(id !== undefined);
      if (id !== undefined) {
        icon.setTexture(BONES[id].texture).setDisplaySize(SLOT.icon, SLOT.icon);
      }
    });

    // What the card being pointed at does.
    const pointed = this.choices[this.focused]?.id;
    this.detail.setText(pointed && pointed in BONES ? `${boneName(pointed as BoneId)} — ${boneDetail(pointed as BoneId)}` : '');
    fitText(this.detail.setScale(1), this.scale.width);

    // What the lot of them comes to, which is not what any one of them says:
    // two 갈비뼈 are four times the health, not twice.
    const bonus = boneBonusFor(this.applied);
    const parts: string[] = [];
    if (bonus.enemyHpScale !== 1) {
      parts.push(fill(copy.sumHp, { percent: Math.round((bonus.enemyHpScale - 1) * 100) }));
    }
    if (bonus.dropScale !== 1) {
      parts.push(fill(copy.sumDrop, { percent: Math.round((bonus.dropScale - 1) * 100) }));
    }
    if (bonus.raresBecomeBosses) {
      parts.push(copy.sumBosses);
    }
    if (bonus.rareChanceScale !== 1) {
      parts.push(fill(copy.sumRares, { scale: bonus.rareChanceScale }));
    }

    this.summary.setText(parts.length > 0 ? parts.join('  ·  ') : copy.none);
    this.summary.setColor(parts.length > 0 ? COLORS.gearText : COLORS.muted);
  }
}
