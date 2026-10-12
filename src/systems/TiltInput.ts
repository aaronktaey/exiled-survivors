import Phaser from 'phaser';

import { TILT } from '@/config';
import type { AnalogInput } from '@/systems/VirtualJoystick';

interface OrientationPermissionApi {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

/** iOS only hands out orientation after an explicit, gesture-driven ask. */
export async function requestTiltPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
    return false;
  }

  const api = window.DeviceOrientationEvent as unknown as OrientationPermissionApi;
  if (typeof api.requestPermission !== 'function') {
    // Android and desktop: no gate, the events just arrive.
    return true;
  }

  try {
    return (await api.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** True where the device reports orientation at all. */
export function tiltAvailable(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/**
 * Steering by tilting the phone. The first reading becomes the neutral
 * pose, so it works at whatever angle the player is already holding the
 * device, and every later reading is measured against that.
 */
export class TiltInput implements AnalogInput {
  private readonly direction = new Phaser.Math.Vector2();
  private tilt = 0;

  /** Smoothed sensor angles, in degrees from the held-still pose. */
  private x = 0;
  private y = 0;
  private baseBeta: number | null = null;
  private baseGamma = 0;
  private receiving = false;

  public constructor(scene: Phaser.Scene) {
    window.addEventListener('deviceorientation', this.onOrientation);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  /** False until the sensor has actually reported something. */
  public get live(): boolean {
    return this.receiving;
  }

  public read(out: Phaser.Math.Vector2): number {
    out.copy(this.direction);
    return this.tilt;
  }

  /** Takes the current pose as level again. */
  public recentre(): void {
    this.baseBeta = null;
  }

  public destroy(): void {
    window.removeEventListener('deviceorientation', this.onOrientation);
  }

  private onOrientation = (event: DeviceOrientationEvent): void => {
    if (event.beta === null || event.gamma === null) {
      return;
    }

    this.receiving = true;
    if (this.baseBeta === null) {
      this.baseBeta = event.beta;
      this.baseGamma = event.gamma;
    }

    // Low-pass the sensor: raw orientation jitters by a degree or two even
    // on a table, which would read as a constant nudge.
    const targetX = event.gamma - this.baseGamma;
    const targetY = event.beta - this.baseBeta;
    this.x += (targetX - this.x) * TILT.smoothing;
    this.y += (targetY - this.y) * TILT.smoothing;

    this.apply();
  };

  private apply(): void {
    const magnitude = Math.hypot(this.x, this.y);
    if (magnitude <= TILT.deadZoneDeg) {
      this.tilt = 0;
      this.direction.set(0, 0);
      return;
    }

    // Degrees past the dead zone, as a fraction of the usable range.
    const usable = Math.max(1, TILT.fullTiltDeg - TILT.deadZoneDeg);
    this.tilt = Phaser.Math.Clamp((magnitude - TILT.deadZoneDeg) / usable, 0, 1);
    this.direction.set(this.x / magnitude, this.y / magnitude);
  }
}
