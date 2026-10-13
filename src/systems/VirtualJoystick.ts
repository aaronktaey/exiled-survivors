import Phaser from 'phaser';

import { COLORS, DEPTH, JOYSTICK } from '@/config';
import { settings } from '@/systems/Settings';

/** Anything that can supply a movement direction alongside the keyboard. */
export interface AnalogInput {
  /** Writes the unit direction into `out`; returns tilt from 0 to 1. */
  read(out: Phaser.Math.Vector2): number;
  /** Lets go of whatever it listens to. Called when it is swapped out. */
  destroy(): void;
}

/** True when the device's primary pointer is a finger rather than a mouse. */
export function prefersTouchControls(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Thumb stick for touch devices, in two flavours.
 *
 * Pinned ('fixed'), it sits where the player put it in 설정 and a touch
 * anywhere within the scaled grab radius takes hold, so they do not have to
 * land exactly on the ring. Summoned ('floating'), it is invisible until a
 * finger lands and then appears right under it — wherever that is.
 *
 * Its size comes from the settings either way, because thumbs and phones
 * differ.
 */
export class VirtualJoystick implements AnalogInput {
  private readonly scene: Phaser.Scene;
  private readonly base: Phaser.GameObjects.Arc;
  private readonly thumb: Phaser.GameObjects.Arc;
  private readonly direction = new Phaser.Math.Vector2();

  private activePointerId: number | null = null;
  private tilt = 0;
  /** Everything about the ring scales with this. */
  private readonly scale: number;
  /** True when the pad appears under the finger instead of staying put. */
  private readonly floating: boolean;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const { joystickScale, joystickX, joystickY, movementMode } = settings.value;
    this.scale = joystickScale;
    this.floating = movementMode === 'floating';
    const x = Phaser.Math.Clamp(joystickX, 0, scene.scale.width);
    const y = Phaser.Math.Clamp(joystickY, 0, scene.scale.height);

    this.base = scene.add
      .circle(x, y, JOYSTICK.baseRadius * joystickScale, COLORS.stick, JOYSTICK.baseAlpha)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);
    this.base.setStrokeStyle(2, COLORS.stick, JOYSTICK.baseAlpha * 2);

    this.thumb = scene.add
      .circle(x, y, JOYSTICK.thumbRadius * joystickScale, COLORS.stick, JOYSTICK.thumbAlpha)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);

    // A floating pad has nowhere to be until a finger says where.
    if (this.floating) {
      this.base.setVisible(false);
      this.thumb.setVisible(false);
    }

    // A second pointer keeps the stick responsive if another finger is down.
    scene.input.addPointer(2);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);

    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  public read(out: Phaser.Math.Vector2): number {
    out.copy(this.direction);
    return this.tilt;
  }

  public destroy(): void {
    const { input, events } = this.scene;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    // Swapped out mid-run, the ring would otherwise stay on screen.
    this.base.destroy();
    this.thumb.destroy();
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.activePointerId !== null) {
      return;
    }

    if (this.floating) {
      // Wherever the finger landed is where the pad is, this time round.
      this.base.setPosition(pointer.x, pointer.y).setVisible(true);
      this.thumb.setPosition(pointer.x, pointer.y).setVisible(true);
    } else {
      const distance = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.base.x, this.base.y);
      if (distance > JOYSTICK.grabRadius * this.scale) {
        return;
      }
    }

    this.activePointerId = pointer.id;
    this.apply(pointer);
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.activePointerId) {
      this.apply(pointer);
    }
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.activePointerId) {
      return;
    }

    this.activePointerId = null;
    this.tilt = 0;
    this.direction.set(0, 0);
    this.thumb.setPosition(this.base.x, this.base.y);

    if (this.floating) {
      this.base.setVisible(false);
      this.thumb.setVisible(false);
    }
  }

  private apply(pointer: Phaser.Input.Pointer): void {
    const dx = pointer.x - this.base.x;
    const dy = pointer.y - this.base.y;
    const length = Math.hypot(dx, dy);

    if (length === 0) {
      this.tilt = 0;
      this.direction.set(0, 0);
      this.thumb.setPosition(this.base.x, this.base.y);
      return;
    }

    const reach = JOYSTICK.baseRadius * this.scale;
    const clamped = Math.min(length, reach);
    const ratio = clamped / reach;

    this.thumb.setPosition(this.base.x + (dx / length) * clamped, this.base.y + (dy / length) * clamped);

    if (ratio < JOYSTICK.deadZone) {
      this.tilt = 0;
      this.direction.set(0, 0);
      return;
    }

    this.tilt = ratio;
    this.direction.set(dx / length, dy / length);
  }
}
