import Phaser from 'phaser';

import { COLORS, DEPTH, TAP_MOVE } from '@/config';
import type { AnalogInput } from '@/systems/VirtualJoystick';

/**
 * 탭으로 이동 (설정's third way to steer on a phone, the user's ask): the
 * survivor walks to where the screen was pressed. Held and dragged, it
 * follows the finger; let go, it walks on to the last point and stops there.
 * A faint ring marks where it is going.
 *
 * Read like the pad (AnalogInput): full speed toward the point, nothing once
 * it is within TAP_MOVE.arriveRadius. A popup opening or closing releases it,
 * as it does the pad, so a tap taken for a card is not walked to afterwards.
 */
export class TapMove implements AnalogInput {
  private readonly scene: Phaser.Scene;
  private readonly origin: () => { readonly x: number; readonly y: number };
  private readonly marker: Phaser.GameObjects.Arc;
  private readonly target = new Phaser.Math.Vector2();
  private going = false;
  private pointerId: number | null = null;

  /** `origin`: where the survivor stands now, in the world. */
  public constructor(scene: Phaser.Scene, origin: () => { readonly x: number; readonly y: number }) {
    this.scene = scene;
    this.origin = origin;
    this.marker = scene.add
      .circle(0, 0, TAP_MOVE.markerRadius, COLORS.stick, 0.12)
      .setStrokeStyle(2, COLORS.stick, 0.7)
      .setDepth(DEPTH.pickups - 1)
      .setVisible(false);

    scene.input.addPointer(2);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  public read(out: Phaser.Math.Vector2): number {
    // Held still while the camera follows the survivor, the finger is over
    // a new spot of the world each frame: follow that, not where it landed.
    const held = this.held();
    if (held) {
      this.aim(held);
    }
    if (!this.going) {
      out.set(0, 0);
      return 0;
    }
    const at = this.origin();
    const dx = this.target.x - at.x;
    const dy = this.target.y - at.y;
    const left = Math.hypot(dx, dy);
    if (left <= TAP_MOVE.arriveRadius) {
      if (!held) {
        this.stop();
      }
      out.set(0, 0);
      return 0;
    }
    out.set(dx / left, dy / left);
    return 1;
  }

  public release(): void {
    this.pointerId = null;
    this.stop();
  }

  public destroy(): void {
    const { input, events } = this.scene;
    input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.marker.destroy();
  }

  private held(): Phaser.Input.Pointer | undefined {
    if (this.pointerId === null) {
      return undefined;
    }
    const pointer = this.scene.input.manager.pointers.find((p) => p.id === this.pointerId);
    return pointer?.isDown ? pointer : undefined;
  }

  private aim(pointer: Phaser.Input.Pointer): void {
    const world = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.target.set(world.x, world.y);
    this.going = true;
    this.marker.setPosition(world.x, world.y).setVisible(true);
  }

  private stop(): void {
    this.going = false;
    this.marker.setVisible(false);
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    // The newest finger is the one followed.
    this.pointerId = pointer.id;
    this.aim(pointer);
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.pointerId && pointer.isDown) {
      this.aim(pointer);
    }
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id === this.pointerId) {
      // Let go: on to the last point, then stop.
      this.pointerId = null;
    }
  }
}
