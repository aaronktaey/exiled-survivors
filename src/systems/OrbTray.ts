import Phaser from 'phaser';

import { ALL_ORBS, COLORS, DEPTH, HUD, TEXT, type OrbId } from '@/config';
import type { RunKit } from '@/systems/RunKit';

interface TrayEntry {
  readonly orb: OrbId;
  readonly icon: Phaser.GameObjects.Image;
  readonly count: Phaser.GameObjects.Text;
}

/**
 * The 구슬 held, on screen through the run (0.72, the user's ask): each kind
 * as its icon and a number, in a row at the bottom right above the XP bar.
 * One not held is drawn faint, so the row never shifts about. It follows the
 * run's kit; nothing is pressed here — 구슬 are spent from the pause menu.
 */
export class OrbTray {
  /** Each kind, in ORBS order. Public for tests. */
  public readonly entries: TrayEntry[] = [];
  private readonly unwatch: () => void;

  public constructor(scene: Phaser.Scene, private readonly kit: RunKit) {
    const { icon, gap, bottom } = HUD.orbTray;
    const y = scene.scale.height - HUD.xpBarHeight - bottom - icon / 2;
    let right = scene.scale.width - HUD.margin;
    for (const spec of [...ALL_ORBS].reverse()) {
      const count = scene.add
        .text(right, y, '0', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text })
        .setOrigin(1, 0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui)
        .setStroke('#05070b', 3);
      // Wide enough for two digits, so a count going up does not push the icons.
      const numberRoom = Math.max(count.width, 20);
      const image = scene.add
        .image(right - numberRoom - 3 - icon / 2, y, spec.texture)
        .setDisplaySize(icon, icon)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui);
      this.entries.unshift({ orb: spec.id, icon: image, count });
      right -= numberRoom + 3 + icon + gap;
    }
    this.refresh();
    this.unwatch = kit.onChange(() => this.refresh());
  }

  /** What the row reads, kind by kind. Public for tests. */
  public get counts(): Record<OrbId, number> {
    return Object.fromEntries(this.entries.map((entry) => [entry.orb, Number(entry.count.text)])) as Record<OrbId, number>;
  }

  public destroy(): void {
    this.unwatch();
    for (const entry of this.entries) {
      entry.icon.destroy();
      entry.count.destroy();
    }
  }

  private refresh(): void {
    for (const entry of this.entries) {
      const held = this.kit.count(entry.orb);
      entry.count.setText(String(held));
      const alpha = held > 0 ? 1 : HUD.orbTray.emptyAlpha;
      entry.icon.setAlpha(alpha);
      entry.count.setAlpha(alpha);
    }
  }
}
