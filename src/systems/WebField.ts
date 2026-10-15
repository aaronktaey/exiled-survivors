import Phaser from 'phaser';

import { DEPTH, WEB } from '@/config';

/** One web on the ground. */
interface Web {
  readonly graphics: Phaser.GameObjects.Graphics;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  leftMs: number;
}

/** How long before it goes that a web starts to fade. */

/**
 * 거미줄 — the webs rares with the 거미 속성 leave where they die.
 *
 * Each is a patch of ground drawn as a faint web, lying there for
 * WEB.durationMs; the survivor is slowed by WEB.slow while standing in any
 * of them (not more for standing in two). The run ticks it with its own
 * clock, so a web does not run out behind an open choice.
 */
export class WebField {
  private readonly scene: Phaser.Scene;
  private readonly webs: Web[] = [];

  public constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** How many webs are on the ground. Public for tests. */
  public get count(): number {
    return this.webs.length;
  }

  /** The webs as they stand, for tests. */
  public get all(): readonly { x: number; y: number; radius: number; leftMs: number }[] {
    return this.webs.map(({ x, y, radius, leftMs }) => ({ x, y, radius, leftMs }));
  }

  /** Lays a web. `stacks` is how many 거미 the rare carried. */
  public spawn(x: number, y: number, stacks: number): void {
    if (stacks <= 0) {
      return;
    }

    const radius = WEB.radius + WEB.radiusPerExtra * (stacks - 1);
    const graphics = this.scene.add.graphics({ x, y }).setDepth(DEPTH.pickups - 2);
    graphics.fillStyle(0xdfe6f0, WEB.fillAlpha);
    graphics.fillCircle(0, 0, radius);
    graphics.lineStyle(WEB.strandWidth, 0xe8eef7, WEB.strandAlpha);
    // Spokes, then rings round them: the shape says "web" at a glance.
    const spokes = 8;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      graphics.lineBetween(0, 0, Math.cos(a) * radius, Math.sin(a) * radius);
    }
    for (let ring = 1; ring <= 3; ring++) {
      const r = (radius * ring) / 3;
      graphics.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * Math.PI * 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) {
          graphics.moveTo(px, py);
        } else {
          graphics.lineTo(px, py);
        }
      }
      graphics.strokePath();
    }

    this.webs.push({ graphics, x, y, radius, leftMs: WEB.durationMs });
    while (this.webs.length > WEB.maxActive) {
      this.webs.shift()?.graphics.destroy();
    }
  }

  /**
   * Runs every web down and fades the ones nearly gone. Returns true when
   * the point given — the survivor — is inside one.
   */
  public update(delta: number, x: number, y: number): boolean {
    let inside = false;
    for (let i = this.webs.length - 1; i >= 0; i--) {
      const web = this.webs[i]!;
      web.leftMs -= delta;
      if (web.leftMs <= 0) {
        web.graphics.destroy();
        this.webs.splice(i, 1);
        continue;
      }

      web.graphics.setAlpha(Math.min(1, web.leftMs / WEB.fadeMs));
      if (!inside && Phaser.Math.Distance.Between(x, y, web.x, web.y) <= web.radius) {
        inside = true;
      }
    }
    return inside;
  }

  public clear(): void {
    this.webs.forEach((web) => web.graphics.destroy());
    this.webs.length = 0;
  }
}
