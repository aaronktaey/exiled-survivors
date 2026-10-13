import Phaser from 'phaser';

import { COLORS, DEPTH, ICON_BAR, TEXT } from '@/config';

export interface IconButton {
  readonly id: string;
  readonly texture: string;
  readonly label: () => string;
  readonly onSelect: () => void;
  /** A dot in the corner when there is something waiting behind it. */
  readonly badge?: () => boolean;
}

interface IconView {
  readonly button: IconButton;
  readonly image: Phaser.GameObjects.Image;
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  readonly badge: Phaser.GameObjects.Arc;
}

/**
 * The row of icons in the top-right corner: the screens you visit between
 * runs rather than pick off the list.
 *
 * Tapping or clicking one opens it. Tab walks them for anyone on a
 * keyboard, because a corner you can only reach with a pointer is a corner
 * half the players cannot reach at all.
 */
export class IconBar {
  private readonly scene: Phaser.Scene;
  /** The buttons, in order. Public so a test can press one. */
  public readonly views: IconView[] = [];
  /** Which one Tab has walked to; -1 is none of them. */
  private focused = -1;

  public constructor(scene: Phaser.Scene, buttons: readonly IconButton[]) {
    this.scene = scene;

    const { size, gap, margin, labelGap } = ICON_BAR;
    const right = scene.scale.width - margin;
    const y = margin + size / 2;

    buttons.forEach((button, index) => {
      const x = right - size / 2 - (buttons.length - 1 - index) * (size + gap);

      const plate = scene.add
        .rectangle(x, y, size, size, COLORS.panelActive, 0)
        .setDepth(DEPTH.ui)
        .setInteractive({ useHandCursor: true });

      const image = scene.add
        .image(x, y, button.texture)
        .setDisplaySize(size - 10, size - 10)
        .setDepth(DEPTH.ui + 1);

      const label = scene.add
        .text(x, y + size / 2 + labelGap, button.label(), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.ui + 1);

      const badge = scene.add
        .circle(x + size / 2 - 2, y - size / 2 + 2, ICON_BAR.badgeRadius, COLORS.accentFill)
        .setDepth(DEPTH.ui + 2)
        .setVisible(button.badge?.() ?? false);

      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.focus(index));
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        this.focus(index);
        button.onSelect();
      });

      this.views.push({ button, image, plate, label, badge });
    });

    scene.input.keyboard?.on('keydown', this.onKeyDown, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.refresh();
  }

  /** Opens one by name, the way a tap on it would. */
  public press(id: string): boolean {
    const index = this.views.findIndex((view) => view.button.id === id);
    if (index < 0) {
      return false;
    }

    this.focus(index);
    this.views[index]!.button.onSelect();
    return true;
  }

  /** Repaints the labels and the waiting dots; call after anything changes. */
  public refresh(): void {
    this.views.forEach((view, index) => {
      view.label.setText(view.button.label());
      view.label.setColor(index === this.focused ? COLORS.accent : COLORS.muted);
      view.plate.setFillStyle(COLORS.panelActive, index === this.focused ? 0.55 : 0);
      view.image.setAlpha(index === this.focused ? 1 : 0.85);
      view.badge.setVisible(view.button.badge?.() ?? false);
    });
  }

  public destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.onKeyDown, this);
  }

  private focus(index: number): void {
    this.focused = index;
    this.refresh();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Tab') {
      // Or the browser walks its own focus ring out of the canvas.
      event.preventDefault();
      this.focus((this.focused + 1) % this.views.length);
      return;
    }

    const chosen = this.views[this.focused];
    if (chosen && (event.code === 'Space' || event.code === 'Enter')) {
      event.preventDefault();
      chosen.button.onSelect();
    }
  }
}
