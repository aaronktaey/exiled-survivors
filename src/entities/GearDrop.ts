import Phaser from 'phaser';

import { COLORS, GEAR_DROP, TEXTURES } from '@/config';
import { GroundItem } from '@/entities/GroundItem';
import { gearLabel } from '@/i18n';
import { DropLabel } from '@/systems/DropLabel';
import { dropTierFor, type GearItem } from '@/systems/Gear';

/**
 * A weapon lying on the ground. Walk over it and it goes into the stash, to
 * be carried out of the title screen between runs.
 *
 * Its label is dressed by how many 속성 it rolled, so a six-line sword is
 * visible across the arena and an ordinary one does not shout.
 */
export class GearDrop extends GroundItem {
  /** The weapon as it was rolled, handed over when it is walked into. */
  public item: GearItem | null = null;

  /** The name above it. Public so a test can read what it says. */
  public readonly nameplate: DropLabel;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.gear, COLORS.gearGlow);
    this.setDisplaySize(GEAR_DROP.size, GEAR_DROP.size);

    this.nameplate = new DropLabel(scene, x, y);
  }

  public drop(x: number, y: number, item: GearItem): void {
    this.item = item;
    this.begin(x, y, GEAR_DROP.size);

    // "무쇠 검+3" — the base and how many 속성 it rolled, which is what you
    // need to know at a glance while something is chasing you.
    this.nameplate.show(gearLabel(item), dropTierFor(item));
    this.nameplate.place(x, y, GEAR_DROP.size);

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
