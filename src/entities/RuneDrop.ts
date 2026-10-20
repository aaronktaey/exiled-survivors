import Phaser from 'phaser';

import { RUNES, RUNE_DROP, runeTexture, type RuneId } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { runeName } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';

/**
 * A 룬 on the ground (0.74, where a 무작위 스킬 used to fall): its stone and
 * its name. Walked over, it goes among the run's 룬, to be set in a skill
 * from the pause menu.
 */
export class RuneDrop extends GroundItem {
  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;
  /** Which 룬 this is. Public for the pickup and for tests. */
  public rune: RuneId = 'power';

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, runeTexture('power'), RUNES.power.color);
    this.setDisplaySize(RUNE_DROP.size, RUNE_DROP.size);
    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number, id: RuneId): void {
    const spec = RUNES[id] ?? RUNES.power;
    this.rune = spec.id;
    this.setTexture(runeTexture(spec.id));
    this.begin(x, y, RUNE_DROP.size);
    this.setDisplaySize(RUNE_DROP.size, RUNE_DROP.size);
    this.glow.setFillStyle(spec.color, this.glow.fillAlpha);
    this.nameplate.show(runeName(spec.id), 'magic');
    this.nameplate.place(x, y, RUNE_DROP.size);
    this.pop();
  }

  public override destroy(fromScene?: boolean): void {
    this.nameplate.destroy(fromScene);
    super.destroy(fromScene);
  }

  protected override onHide(): void {
    this.nameplate.hide();
  }
}
