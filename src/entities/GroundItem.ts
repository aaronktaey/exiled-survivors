import Phaser from 'phaser';

import { DEPTH, GROUND_ITEM, TIMING } from '@/config';

/**
 * Anything that lies on the ground waiting to be walked over, except XP
 * gems — those never expire.
 *
 * It holds the part every such item shares: a lifespan, and a halo that
 * blinks behind it over the last stretch, faster and faster, so a drop
 * about to vanish says so. What the item *is* — a skill orb with a name
 * plate, a potion — is the subclass's business.
 */
export abstract class GroundItem extends Phaser.Physics.Arcade.Image {
  /** The warning halo. Public so tests and debug code can read it. */
  public readonly glow: Phaser.GameObjects.Arc;

  /**
   * 아이템 필터: switched off, it still lands and is still taken by walking
   * over it or by a 자석, but nothing of it is drawn — no sprite, name,
   * pillar or warning halo — and no edge marker points at it.
   */
  public concealed = false;

  protected remainingMs = 0;
  /** Blink cycles elapsed; the fractional part drives the on/off state. */
  protected blinkPhase = 0;

  protected constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    glowColor: number,
  ) {
    super(scene, x, y, texture);
    this.setDepth(DEPTH.pickups);

    this.glow = scene.add
      .circle(x, y, GROUND_ITEM.glowRadius, glowColor, GROUND_ITEM.glowAlpha)
      .setDepth(DEPTH.pickups - 1)
      .setVisible(false);
  }

  /** Milliseconds left before this item vanishes. */
  public get timeLeftMs(): number {
    return this.remainingMs;
  }

  public collect(): void {
    this.hide();
  }

  /** Lies here unseen until it is taken or runs out (see `concealed`). */
  public conceal(): void {
    this.concealed = true;
    this.setVisible(false);
    this.glow.setVisible(false);
    this.onHide();
  }

  public override update(_time: number, delta: number): void {
    // Held with the world while a popup holds the run (0.115, the user's ask —
    // as the shots were in 0.114): a level-up's cards no longer eat its minute.
    if (!this.active || this.scene.physics.world.isPaused) {
      return;
    }

    const dt = Math.min(delta, TIMING.maxDeltaMs);

    this.remainingMs -= dt;
    if (this.remainingMs <= 0) {
      this.hide();
      return;
    }

    this.updateBlink(dt);
  }

  public override destroy(fromScene?: boolean): void {
    this.glow.destroy(fromScene);
    super.destroy(fromScene);
  }

  /** Starts a life on the ground: body on, clock and halo reset. */
  protected begin(x: number, y: number, size: number): void {
    this.remainingMs = GROUND_ITEM.lifespanMs;
    this.blinkPhase = 0;
    this.concealed = false;

    this.enableBody(true, x, y, true, true);
    this.setDisplaySize(size, size);
    this.body?.setSize(size, size, true);
    this.setVelocity(0, 0);

    this.glow.setPosition(x, y).setVisible(false);
  }

  /** A small pop, so a fresh drop stands out against the static grid. */
  protected pop(extras: Phaser.GameObjects.GameObject[] = []): void {
    // The sprite is usually an icon drawn smaller than its source, so its
    // pop has to end at that scale rather than at 1.
    const settled = this.scaleX;
    this.scene.tweens.killTweensOf([this, ...extras]);

    this.setScale(settled * 0.6);
    extras.forEach((extra) => (extra as Phaser.GameObjects.Image).setScale(0.6));

    this.scene.tweens.add({ targets: this, scale: settled, duration: 180, ease: 'Back.easeOut' });
    if (extras.length > 0) {
      this.scene.tweens.add({ targets: extras, scale: 1, duration: 180, ease: 'Back.easeOut' });
    }
  }

  /** Subclasses clear whatever extras they drew alongside the sprite. */
  protected onHide(): void {}

  protected hide(): void {
    this.scene.tweens.killTweensOf(this);
    this.glow.setVisible(false);
    this.remainingMs = 0;
    this.onHide();
    this.disableBody(true, true);
  }

  /**
   * Blinks the halo once the item is nearly out of time, shortening the
   * period as it goes so the flashing visibly speeds up.
   */
  private updateBlink(delta: number): void {
    if (this.concealed) {
      return;
    }
    if (this.remainingMs > GROUND_ITEM.warningMs) {
      if (this.glow.visible) {
        this.glow.setVisible(false);
      }
      return;
    }

    const urgency = 1 - this.remainingMs / GROUND_ITEM.warningMs;
    const period = Phaser.Math.Linear(GROUND_ITEM.blinkSlowMs, GROUND_ITEM.blinkFastMs, urgency);

    // Accumulating phase rather than deriving it from the clock keeps the
    // blink continuous while the period shrinks.
    this.blinkPhase += delta / period;
    this.glow.setVisible(this.blinkPhase % 1 < 0.5);
  }
}
