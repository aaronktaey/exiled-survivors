import Phaser from 'phaser';

import { COLORS, DEPTH, JOYSTICK } from '@/config';

/** Anything that can supply a movement direction alongside the keyboard. */
export interface AnalogInput {
  /** Writes the unit direction into `out`; returns tilt from 0 to 1. */
  read(out: Phaser.Math.Vector2): number;
}

/** True when the device's primary pointer is a finger rather than a mouse. */
export function prefersTouchControls(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false;
  }
  return window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Thumb stick for touch devices, pinned to the bottom-left of the camera.
 * A touch anywhere within JOYSTICK.grabRadius takes hold of it, so the
 * player does not have to land exactly on the ring.
 */
export class VirtualJoystick implements AnalogInput {
  private readonly scene: Phaser.Scene;
  private readonly base: Phaser.GameObjects.Arc;
  private readonly thumb: Phaser.GameObjects.Arc;
  private readonly direction = new Phaser.Math.Vector2();

  private activePointerId: number | null = null;
  private tilt = 0;

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const x = JOYSTICK.margin;
    const y = scene.scale.height - JOYSTICK.margin;

    this.base = scene.add
      .circle(x, y, JOYSTICK.baseRadius, COLORS.stick, JOYSTICK.baseAlpha)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);
    this.base.setStrokeStyle(2, COLORS.stick, JOYSTICK.baseAlpha * 2);

    this.thumb = scene.add
      .circle(x, y, JOYSTICK.thumbRadius, COLORS.stick, JOYSTICK.thumbAlpha)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);

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
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.activePointerId !== null) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(pointer.x, pointer.y, this.base.x, this.base.y);
    if (distance > JOYSTICK.grabRadius) {
      return;
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

    const clamped = Math.min(length, JOYSTICK.baseRadius);
    const ratio = clamped / JOYSTICK.baseRadius;

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
