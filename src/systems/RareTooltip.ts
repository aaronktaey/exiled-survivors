import Phaser from 'phaser';

import { COLORS, DEPTH, TOOLTIP } from '@/config';
import { affixDetail, affixName, t } from '@/i18n';
import type { Enemy } from '@/entities/Enemy';

/**
 * The panel that lists a rare enemy's affixes while it is hovered or held.
 *
 * It is driven from outside rather than from its own update, because it has
 * to keep working while the run is paused: the pause screen asks it the same
 * question the running scene does.
 */
export class RareTooltip {
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly enemies: Phaser.Physics.Arcade.Group;

  private shown?: Enemy;

  /**
   * `camera` is the view those enemies are seen through, which is not always
   * this scene's own: the pause screen draws its own copy over a frozen run
   * and borrows that run's camera to place it.
   */
  public constructor(
    scene: Phaser.Scene,
    enemies: Phaser.Physics.Arcade.Group,
    camera: Phaser.Cameras.Scene2D.Camera = scene.cameras.main,
  ) {
    this.camera = camera;
    this.enemies = enemies;

    this.panel = scene.add
      .rectangle(0, 0, 10, 10, COLORS.panel, 0.94)
      .setStrokeStyle(1, COLORS.rareOutline, 1)
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 10)
      .setVisible(false);

    this.title = scene.add
      .text(0, 0, t().rare.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TOOLTIP.titleSize,
        color: COLORS.rareText,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 11)
      .setVisible(false);

    this.body = scene.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TOOLTIP.lineSize,
        color: COLORS.text,
        align: 'center',
        lineSpacing: 3,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 11)
      .setVisible(false);
  }

  /** The enemy currently being shown, if any. */
  public get target(): Enemy | undefined {
    return this.shown;
  }

  public get visible(): boolean {
    return this.panel.visible;
  }

  /** What the panel is listing, for tests and debug readouts. */
  public get text(): string {
    return this.body.text;
  }

  /**
   * Points at whatever rare sits under this screen position and shows its
   * affixes. Returns true if one was found.
   */
  public inspectAt(screenX: number, screenY: number): boolean {
    const world = this.camera.getWorldPoint(screenX, screenY);
    const enemy = this.pick(world.x, world.y);

    if (!enemy) {
      this.hide();
      return false;
    }

    this.show(enemy);
    return true;
  }

  /** Keeps the panel glued to its enemy, or drops it if that one is gone. */
  public refresh(): void {
    if (!this.shown) {
      return;
    }

    if (!this.shown.active || !this.shown.rare) {
      this.hide();
      return;
    }

    this.place(this.shown);
  }

  public hide(): void {
    this.shown = undefined;
    this.panel.setVisible(false);
    this.title.setVisible(false);
    this.body.setVisible(false);
  }

  /** The nearest rare the point falls inside, if any. */
  private pick(worldX: number, worldY: number): Enemy | undefined {
    let best: Enemy | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const child of this.enemies.getChildren()) {
      const enemy = child as Enemy;
      if (!enemy.active || !enemy.rare) {
        continue;
      }

      const distance = Phaser.Math.Distance.Between(worldX, worldY, enemy.x, enemy.y);
      if (distance <= enemy.pickRadius + TOOLTIP.grabPadding && distance < bestDistance) {
        bestDistance = distance;
        best = enemy;
      }
    }

    return best;
  }

  private show(enemy: Enemy): void {
    this.shown = enemy;
    this.title.setText(t().rare.title);
    this.body.setText(
      enemy.affixTally.map(({ affix, count }) => {
        const name = count > 1 ? `${affixName(affix.id)} x${count}` : affixName(affix.id);
        return `${name}  ${affixDetail(affix.id)}`;
      }),
    );

    // Panel and heading wear the same colour as the ring, so the tier reads
    // here too.
    const colour = enemy.outlineColor;
    this.panel.setStrokeStyle(1, colour, 1);
    this.title.setColor(`#${colour.toString(16).padStart(6, '0')}`);

    const width = Math.max(this.body.width, this.title.width) + TOOLTIP.paddingX * 2;
    const height = this.title.height + this.body.height + TOOLTIP.paddingY * 2 + 2;
    this.panel.setSize(width, height);

    this.panel.setVisible(true);
    this.title.setVisible(true);
    this.body.setVisible(true);
    this.place(enemy);
  }

  /** Puts the panel above the enemy, in screen space, clear of the edges. */
  private place(enemy: Enemy): void {
    const screenX = (enemy.x - this.camera.worldView.x) * this.camera.zoom;
    const screenY = (enemy.y - this.camera.worldView.y) * this.camera.zoom;

    const halfWidth = this.panel.width / 2;
    const x = Phaser.Math.Clamp(screenX, halfWidth + 4, this.camera.width - halfWidth - 4);
    const y = Phaser.Math.Clamp(screenY - enemy.pickRadius - TOOLTIP.gap, this.panel.height + 4, this.camera.height - 4);

    this.panel.setPosition(x, y);
    this.title.setPosition(x, y - this.panel.height + TOOLTIP.paddingY);
    this.body.setPosition(x, y - this.panel.height + TOOLTIP.paddingY + this.title.height + 2);
  }
}
