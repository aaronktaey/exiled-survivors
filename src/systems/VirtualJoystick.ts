import Phaser from 'phaser';

import { COLORS, DEPTH, JOYSTICK } from '@/config';
import { settings } from '@/systems/Settings';

/** Anything that can supply a movement direction alongside the keyboard. */
export interface AnalogInput {
  /** Writes the unit direction into `out`; returns tilt from 0 to 1. */
  read(out: Phaser.Math.Vector2): number;
  /** Lets go of whatever it listens to. Called when it is swapped out. */
  destroy(): void;
  /**
   * Forgets the finger it was following and comes to rest. A popup or the
   * pause screen over the run can take a finger's lift-off for itself, and
   * a stick still waiting for that finger would ignore every touch after.
   */
  release?(): void;
}

/** True when the device's primary pointer is a finger rather than a mouse. */
export function prefersTouchControls(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Thumb stick for touch devices.
 *
 * It is invisible until a finger lands, and then appears right under it,
 * wherever that is. There is no second flavour: a pad pinned to one corner
 * asked the player to find it before they could move, and on a phone that
 * is a hit taken for free.
 *
 * Its size comes from the settings, because thumbs and phones differ.
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

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const { joystickScale } = settings.value;
    this.scale = joystickScale;
    // Off screen until a finger says where it belongs.
    const x = -1000;
    const y = -1000;

    this.base = scene.add
      .circle(x, y, JOYSTICK.baseRadius * joystickScale, COLORS.stick, JOYSTICK.baseAlpha)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);
    this.base.setStrokeStyle(2, COLORS.stick, JOYSTICK.baseAlpha * 2);

    this.thumb = scene.add
      .circle(x, y, JOYSTICK.thumbRadius * joystickScale, COLORS.stick, JOYSTICK.thumbAlpha)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);

    this.base.setVisible(false);
    this.thumb.setVisible(false);

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

  public release(): void {
    this.activePointerId = null;
    this.tilt = 0;
    this.direction.set(0, 0);
    this.thumb.setPosition(this.base.x, this.base.y);
    this.base.setVisible(false);
    this.thumb.setVisible(false);
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.activePointerId !== null) {
      // Still following a finger — unless that finger lifted while something
      // over the run had the touch, and this stick never heard it.
      const held = this.scene.input.manager.pointers.find((p) => p.id === this.activePointerId);
      if (held?.isDown && held.id !== pointer.id) {
        return;
      }
      this.release();
    }

    // Wherever the finger landed is where the pad is, this time round.
    this.base.setPosition(pointer.x, pointer.y).setVisible(true);
    this.thumb.setPosition(pointer.x, pointer.y).setVisible(true);

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
    this.release();
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
