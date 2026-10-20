import Phaser from 'phaser';

import { COLORS, DEPTH, SCENES, SCRIM, SKILL_ICON_SIZE, SLOT, TEXT } from '@/config';
import { fill, t } from '@/i18n';
import { fitText } from '@/systems/Layout';
import { SlotReel, type SlotItem } from '@/systems/SlotReel';
import { sfx } from '@/systems/Sfx';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

/** What anything wanting a spin hands the slot machine. */
export interface SlotData {
  readonly title: string;
  readonly subtitle?: string;
  readonly items: readonly SlotItem[];
  /**
   * Which item it lands on. Decided when 확정 is pressed rather than read off
   * wherever the reel happened to be, so the odds are the caller's to set.
   * Even odds when left out.
   */
  readonly choose?: () => number;
  /** Called once the reel has stopped and the result has been shown. */
  readonly onResult: (index: number) => void;
  /**
   * Spins again allowed once it lands (a 무작위 스킬 has one): it then waits
   * on 획득 or 다시 돌리기 instead of closing by itself.
   */
  readonly rerolls?: number;
}

/** Space is the press; Enter comes along for free. */
const CONFIRM_CODES = ['Space', 'Enter', 'NumpadEnter'];

const REEL_WIDTH = 300;
const ROW_HEIGHT = 46;
const VISIBLE_ROWS = 5;
const BUTTON_WIDTH = 180;
const BUTTON_HEIGHT = 48;

/**
 * 슬롯머신: a reel turning top to bottom until 확정 is pressed, then slowing
 * over SLOT.stopMs onto the result. Any system that wants a spin launches
 * this with its own items and is handed back the index it stopped on — the
 * run's first skill is the first user, a weapon reroll can be the next.
 *
 * The scene that launched it is expected to be frozen while it is open.
 * Input is locked briefly on open, the same as the upgrade picker, so a key
 * held down from play cannot press 확정 for the player.
 */
export class SlotScene extends Phaser.Scene {
  public static readonly KEY = SCENES.slot;
  private static readonly INPUT_LOCK_MS = 260;

  /** Public so a test can watch it turn and stop. */
  public reel!: SlotReel;
  public payload!: SlotData;
  private button!: Phaser.GameObjects.Rectangle;
  private buttonLabel!: Phaser.GameObjects.Text;
  private unlocked = false;
  private pressed = false;
  private done = false;
  /** Spins again still allowed, and what it landed on while waiting for 획득. Public for tests. */
  public rerollsLeft = 0;
  public landed: number | null = null;
  private rerollButton?: Phaser.GameObjects.Rectangle;
  private rerollLabel?: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  /** The spin's loop, while it plays. Public so a test can hear it. */
  public spin: Phaser.Sound.BaseSound | null = null;

  public constructor() {
    super(SlotScene.KEY);
  }

  public init(data: SlotData): void {
    this.payload = data;
    this.pressed = false;
    this.done = false;
    this.unlocked = false;
    this.rerollsLeft = data.rerolls ?? 0;
    this.landed = null;
    this.rerollButton = undefined;
    this.rerollLabel = undefined;
  }

  public create(): void {
    const { width, height } = this.scale;
    const centerX = width / 2;
    const windowHeight = ROW_HEIGHT * VISIBLE_ROWS;
    // Title, reel and button as one block, centred in whatever height there
    // is — landscape is only ~540 tall.
    const block = 40 + 30 + 16 + windowHeight + 24 + BUTTON_HEIGHT + 28;
    const top = Math.max(12, (height - block) / 2);

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.upgrade).setOrigin(0, 0).setDepth(DEPTH.ui);

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

    if (this.payload.subtitle) {
      this.add
        .text(centerX, top + 55, this.payload.subtitle, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.label,
          color: COLORS.accent,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui);
    }

    const reelY = top + 86 + windowHeight / 2;
    this.reel = new SlotReel(this, centerX, reelY, this.payload.items, {
      width: Math.min(REEL_WIDTH, width - 32),
      rowHeight: ROW_HEIGHT,
      visibleRows: VISIBLE_ROWS,
      iconSize: SKILL_ICON_SIZE.card,
      depth: DEPTH.ui + 1,
    });

    const buttonY = reelY + windowHeight / 2 + 24 + BUTTON_HEIGHT / 2;
    this.button = this.add
      .rectangle(centerX, buttonY, BUTTON_WIDTH, BUTTON_HEIGHT, COLORS.accentFill, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 2)
      .setInteractive({ useHandCursor: true });
    this.buttonLabel = this.add
      .text(centerX, buttonY, t().slot.confirm, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.label,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 3);
    this.button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.press());

    this.hint = this.add
      .text(
        centerX,
        buttonY + BUTTON_HEIGHT / 2 + 16,
        prefersTouchControls() ? t().slot.hintTouch : t().slot.hintKeyboard,
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.small,
          color: COLORS.muted,
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui);

    // A fresh scene's `time.now` is still 0 in create(), so compare against
    // a flag the clock flips instead of a precomputed timestamp.
    this.time.delayedCall(SlotScene.INPUT_LOCK_MS, () => { this.unlocked = true; });
    this.input.keyboard?.on('keydown', this.onKeyDown, this);
    // The reel's sound, under it for as long as it turns.
    this.spin = sfx.startSlotSpin(this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.onKeyDown, this);
      this.reel.destroy();
      this.tweens.killTweensOf(this.spin ?? {});
      this.spin?.destroy();
      this.spin = null;
    });
  }

  public override update(_time: number, delta: number): void {
    this.reel.update(delta);
  }

  /**
   * 확정: decides the result and lets the reel slow onto it. Only the first
   * press counts. Public so a test can press it without hunting for the
   * button.
   */
  public press(): void {
    if (this.pressed || !this.unlocked) {
      return;
    }

    this.pressed = true;
    this.button.disableInteractive().setFillStyle(COLORS.panelEdge, 1);
    this.buttonLabel.setColor(COLORS.muted);

    const count = this.payload.items.length;
    const chosen = this.payload.choose?.() ?? Math.floor(Math.random() * count);
    const index = Phaser.Math.Clamp(Math.floor(chosen), 0, Math.max(0, count - 1));
    this.reel.stop(index, (landed) => this.land(landed));

    // The clunk of the brake, and the spin dying away with the reel.
    sfx.playSlot(this, 'stop');
    const spin = this.spin;
    if (spin) {
      this.tweens.add({
        targets: spin,
        volume: 0,
        duration: SLOT.stopMs,
        onComplete: () => spin.stop(),
      });
    }
  }

  /**
   * Holds the result up for a moment, then hands it back and closes — or,
   * with a reroll left, waits on 획득 or 다시 돌리기.
   */
  private land(index: number): void {
    if (this.rerollsLeft > 0) {
      this.offerReroll(index);
      return;
    }
    this.time.delayedCall(SLOT.holdMs, () => {
      if (this.done) {
        return;
      }

      this.done = true;
      const { onResult } = this.payload;
      this.scene.stop();
      onResult(index);
    });
  }

  /** Landed with a spin left: the button becomes 획득, and 다시 돌리기 comes up beside it. */
  private offerReroll(index: number): void {
    this.landed = index;
    const copy = t().slot;
    const centre = this.scale.width / 2;
    const y = this.button.y;
    const half = BUTTON_WIDTH / 2 + 8;
    this.button.setX(centre - half).setInteractive({ useHandCursor: true }).setFillStyle(COLORS.accentFill, 1);
    this.buttonLabel.setX(centre - half).setText(copy.take).setColor(COLORS.text);
    this.rerollButton = this.add
      .rectangle(centre + half, y, BUTTON_WIDTH, BUTTON_HEIGHT, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.accentFill, 1)
      .setDepth(DEPTH.ui + 2)
      .setInteractive({ useHandCursor: true });
    this.rerollLabel = this.add
      .text(centre + half, y, fill(copy.reroll, { n: this.rerollsLeft }), { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 3);
    fitText(this.rerollLabel, BUTTON_WIDTH - 12, 0);
    this.rerollButton.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.reroll());
    this.hint.setText(copy.hintReroll);
  }

  /** 획득: takes what it landed on. Public so a test can. */
  public take(): void {
    if (this.done || this.landed === null) {
      return;
    }
    this.done = true;
    const { onResult } = this.payload;
    const index = this.landed;
    this.scene.stop();
    onResult(index);
  }

  /** 다시 돌리기: spends a reroll and turns the reel again. Public so a test can. */
  public reroll(): void {
    if (this.done || this.landed === null || this.rerollsLeft <= 0) {
      return;
    }
    this.rerollsLeft -= 1;
    this.landed = null;
    this.rerollButton?.destroy();
    this.rerollLabel?.destroy();
    this.rerollButton = undefined;
    this.rerollLabel = undefined;
    const centre = this.scale.width / 2;
    this.button.setX(centre).setFillStyle(COLORS.accentFill, 1);
    this.buttonLabel.setX(centre).setText(t().slot.confirm).setColor(COLORS.text);
    this.hint.setText(prefersTouchControls() ? t().slot.hintTouch : t().slot.hintKeyboard);
    this.pressed = false;
    this.reel.respin();
    this.spin = sfx.startSlotSpin(this);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }
    if (this.landed !== null) {
      if (CONFIRM_CODES.includes(event.code)) {
        this.take();
      } else if (event.code === 'KeyR') {
        this.reroll();
      }
      return;
    }
    if (CONFIRM_CODES.includes(event.code)) {
      this.press();
    }
  }
}
