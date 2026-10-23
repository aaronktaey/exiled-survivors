import Phaser from 'phaser';

import {
  ALTAR,
  ALTAR_OFFERS,
  COLORS,
  TEXTURES,
  type AltarOfferId,
  type DropTier,
  ENEMY_KINDS,
} from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { altarOfferText, fill, t } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';

/** Whoever has to walk up to it. */
export type AltarTarget = Phaser.GameObjects.Components.Transform;

/** Called once, when the survivor wakes it. */
export type AltarWake = (altar: Altar) => void;

/**
 * A 제단: what a 우두머리 leaves behind, offering a crowd.
 *
 * It is never picked up. It waits, with what it will call up written over
 * it, and wakes when the survivor comes within ALTAR.activateRadius — then
 * it is spent and the crowd arrives. It lasts as long as any other drop and
 * blinks the same warning before it goes.
 *
 * It only arms once the survivor is outside that radius: one that lands
 * where they are already standing has to be walked away from and back to,
 * so it is never set off by the kill that made it.
 */
export class Altar extends GroundItem {
  /** What it says. Public so a test can read it. */
  public readonly nameplate: DropLabel;
  /** What it will call up. Public for the summon and for tests. */
  public offer: AltarOfferId = 'bosses';
  /** False until the survivor has been outside its reach once. */
  public armed = false;

  private target?: AltarTarget;
  private onWake?: AltarWake;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.altar, COLORS.altarFlame);
    this.setDisplaySize(ALTAR.size, ALTAR.size);

    // An offer, not a prize: it is walked up to, never picked up, so it
    // does not stand in the light a rare drop does.
    this.nameplate = new DropLabel(scene, x, y, { pillar: false });
  }

  /** How loudly it reads: a 우두머리 offer (or one that always leaves a skill or a shard) loudest, a rare pack next. */
  public static tierFor(offer: AltarOfferId): DropTier {
    const spec = ALTAR_OFFERS[offer];
    const kind = spec ? ENEMY_KINDS[spec.kind] : undefined;
    if (spec?.kind === 'boss' || kind?.guaranteedSkill || kind?.guaranteedShard) {
      return 'mythic';
    }

    return spec?.rare ? 'magic' : 'normal';
  }

  public drop(
    x: number,
    y: number,
    offer: AltarOfferId,
    target: AltarTarget,
    onWake: AltarWake,
  ): void {
    this.offer = ALTAR_OFFERS[offer] ? offer : 'bosses';
    this.target = target;
    this.onWake = onWake;

    this.begin(x, y, ALTAR.size);
    this.setDisplaySize(ALTAR.size, ALTAR.size);
    // Read where it now stands, not wherever the pooled sprite last was.
    this.armed = !this.inReach();

    this.nameplate.show(
      fill(t().game.altarOffer, { enemies: altarOfferText(this.offer) }),
      Altar.tierFor(this.offer),
    );
    this.nameplate.place(x, y, ALTAR.size);

    this.pop();
  }

  public override update(time: number, delta: number): void {
    super.update(time, delta);
    if (!this.active || !this.target) {
      return;
    }

    const near = this.inReach();
    if (!this.armed) {
      this.armed = !near;
      return;
    }

    if (near) {
      this.wake();
    }
  }

  /** Spends it, and hands the summon to whoever placed it. */
  public wake(): void {
    if (!this.active) {
      return;
    }

    const onWake = this.onWake;
    this.hide();
    onWake?.(this);
  }

  public override destroy(fromScene?: boolean): void {
    this.nameplate.destroy(fromScene);
    super.destroy(fromScene);
  }

  protected override onHide(): void {
    this.nameplate.hide();
  }

  private inReach(): boolean {
    if (!this.target) {
      return false;
    }

    return (
      Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y) <=
      ALTAR.activateRadius
    );
  }
}
