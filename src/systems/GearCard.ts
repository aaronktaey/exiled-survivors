import Phaser from 'phaser';

import { COLORS, GEAR_NAME_COLORS, TEXT, gearTexture } from '@/config';
import { gearTitle } from '@/i18n';
import { dropTierFor, type GearItem } from '@/systems/Gear';
import { describeGear, gearKind } from '@/systems/GearText';

/** A card drawn: everything in it, and how tall it came out. */
export interface GearCardView {
  readonly container: Phaser.GameObjects.Container;
  readonly height: number;
  /** The name line, for tests. */
  readonly name?: Phaser.GameObjects.Text;
  /** The read-out, for tests. */
  readonly body?: Phaser.GameObjects.Text;
}

const PAD = 10;
const ICON = 40;

/**
 * One piece of gear as a card: a heading over it, its picture, its name in
 * the colour of its rarity with where it is worn under it, then its whole
 * read-out (attack, 고정 속성, every slot). With no piece, the heading and
 * `empty` instead. The card's top-left is the container's origin.
 */
export function drawGearCard(
  scene: Phaser.Scene,
  item: GearItem | null,
  options: { readonly heading: string; readonly width: number; readonly empty: string; readonly depth: number; readonly lit?: boolean },
): GearCardView {
  const { width, depth } = options;
  const container = scene.add.container(0, 0).setDepth(depth);
  const plate = scene.add.rectangle(0, 0, width, 10, COLORS.panel, 0.96).setOrigin(0, 0);
  plate.setStrokeStyle(2, options.lit ? COLORS.accentFill : COLORS.panelEdge, 1);
  container.add(plate);

  const heading = scene.add
    .text(PAD, PAD, options.heading, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
    .setOrigin(0, 0);
  container.add(heading);
  let y = PAD + heading.height + 6;

  if (!item) {
    const none = scene.add
      .text(PAD, y, options.empty, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
        wordWrap: { width: width - PAD * 2 },
      })
      .setOrigin(0, 0);
    container.add(none);
    y += none.height + PAD;
    plate.setSize(width, y);
    return { container, height: y };
  }

  container.add(scene.add.image(PAD + ICON / 2, y + ICON / 2, gearTexture(item.id)).setDisplaySize(ICON, ICON));
  const name = scene.add
    .text(PAD + ICON + 8, y, gearTitle(item), {
      fontFamily: 'system-ui, sans-serif',
      fontSize: TEXT.size.body,
      color: GEAR_NAME_COLORS[dropTierFor(item)],
      wordWrap: { width: width - PAD * 2 - ICON - 8 },
    })
    .setOrigin(0, 0);
  const kind = scene.add
    .text(PAD + ICON + 8, y + name.height + 2, gearKind(item), {
      fontFamily: 'system-ui, sans-serif',
      fontSize: TEXT.size.hint,
      color: COLORS.muted,
    })
    .setOrigin(0, 0);
  container.add([name, kind]);
  y += Math.max(ICON, name.height + kind.height + 2) + 8;

  const body = scene.add
    .text(PAD, y, describeGear(item), {
      fontFamily: 'system-ui, sans-serif',
      fontSize: TEXT.size.hint,
      color: COLORS.text,
      lineSpacing: 2,
      wordWrap: { width: width - PAD * 2 },
    })
    .setOrigin(0, 0);
  container.add(body);
  y += body.height + PAD;
  plate.setSize(width, y);
  return { container, height: y, name, body };
}
