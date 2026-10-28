import Phaser from 'phaser';

import { COLORS, DEPTH, ICON_BAR, ICON_SPOTLIGHT, TEXT } from '@/config';

export interface IconButton {
  readonly id: string;
  readonly texture: string;
  readonly label: () => string;
  readonly onSelect: () => void;
  /** A dot in the corner when there is something waiting behind it. */
  readonly badge?: () => boolean;
  /** A ring pulsing round it while true: something new behind it (ICON_SPOTLIGHT, 0.102). */
  readonly spotlight?: () => boolean;
  /** A few small letters over the picture's lower-right corner (0.155: the latest version on 패치노트). */
  readonly corner?: () => string;
}

interface IconView {
  readonly button: IconButton;
  readonly image: Phaser.GameObjects.Image;
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  readonly badge: Phaser.GameObjects.Arc;
  readonly ring?: Phaser.GameObjects.Arc;
  readonly corner?: Phaser.GameObjects.Text;
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
  /** How many rows they took: two where one would run into `avoid` (more only where the screen is too narrow). Public for tests. */
  public rows = 1;
  /** Where the icons stand, captions and all. */
  public bounds = new Phaser.Geom.Rectangle();

  /**
   * `avoid`: what the icons must stay clear of (the title's logo); where one
   * row would run into it they wrap onto more, right-aligned (0.148).
   */
  public constructor(scene: Phaser.Scene, buttons: readonly IconButton[], avoid?: Phaser.Geom.Rectangle) {
    this.scene = scene;

    const { size, margin, labelGap } = ICON_BAR;
    const y = margin + size / 2;

    // Built at x = 0 and placed afterwards: a slot is as wide as its icon or
    // its label, whichever is wider, so "인벤토리" and "패시브" side by side
    // do not run into one word.
    buttons.forEach((button, index) => {
      const x = 0;

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

      // The spotlight: a ring round the icon, swelling and fading on a loop.
      const ring = button.spotlight?.()
        ? scene.add
            .circle(x, y, size / 2 + 2)
            .setStrokeStyle(3, ICON_SPOTLIGHT.color, 1)
            .setDepth(DEPTH.ui + 2)
        : undefined;
      if (ring) {
        scene.tweens.add({
          targets: ring,
          scale: 1.35,
          alpha: 0.15,
          duration: ICON_SPOTLIGHT.pulseMs,
          ease: 'Sine.easeOut',
          repeat: -1,
        });
        label.setColor(Phaser.Display.Color.IntegerToColor(ICON_SPOTLIGHT.color).rgba);
      }

      const corner = button.corner
        ? scene.add
            .text(x + size / 2 - 2, y + size / 2 - 1, button.corner(), { fontFamily: 'system-ui, sans-serif', ...ICON_BAR.corner })
            .setOrigin(1, 1)
            .setDepth(DEPTH.ui + 2)
        : undefined;

      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.focus(index));
      // Leaving it hands the keyboard back, or Space would stay the icon's.
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => {
        if (this.focused === index) {
          this.focus(-1);
        }
      });
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        this.focus(index);
        button.onSelect();
      });

      this.views.push({ button, image, plate, label, badge, ring, corner });
    });

    this.layCorner(avoid);

    scene.input.keyboard?.on('keydown', this.onKeyDown, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.refresh();
  }

  /**
   * A grid in the corner, every slot as wide as the widest caption and every
   * row as tall as the tallest (0.148, the user's ask: the gaps were uneven,
   * each slot as wide as its own caption). One row while it stays clear of
   * `avoid`, else as many as it takes; a short last row keeps to the right.
   */
  public layCorner(avoid?: Phaser.Geom.Rectangle): void {
    const { size, gap, rowGap, margin } = ICON_BAR;
    const width = this.scene.scale.width;
    const count = this.views.length;
    if (count === 0) {
      return;
    }
    const { slot, rowH } = this.cell();
    const block = (rows: number): Phaser.Geom.Rectangle => {
      const cols = Math.ceil(count / rows);
      const w = cols * slot + (cols - 1) * gap;
      return new Phaser.Geom.Rectangle(width - margin - w, margin, w, rows * rowH + (rows - 1) * rowGap);
    };
    // As few rows as stay on the screen and clear of what is to be avoided —
    // but no more than ICON_BAR.maxRows for that: past it the title makes
    // room instead (MenuScene moves its column left).
    const offScreen = (rows: number): boolean => block(rows).x < margin;
    const overlaps = (rows: number): boolean => avoid !== undefined && Phaser.Geom.Intersects.RectangleToRectangle(block(rows), avoid);
    this.rows = 1;
    while (this.rows < count && (offScreen(this.rows) || (this.rows < ICON_BAR.maxRows && overlaps(this.rows)))) {
      this.rows += 1;
    }
    this.bounds = block(this.rows);
    const cols = Math.ceil(count / this.rows);
    this.views.forEach((view, index) => {
      const row = Math.floor(index / cols);
      const inRow = Math.min(cols, count - row * cols);
      const col = cols - inRow + (index % cols);
      this.place(view, width - margin - slot / 2 - (cols - 1 - col) * (slot + gap), margin + size / 2 + row * (rowH + rowGap), slot);
    });
  }

  /** Every slot as wide as the widest caption, every row as tall as the tallest. */
  private cell(): { slot: number; rowH: number } {
    const { size, labelGap } = ICON_BAR;
    return {
      slot: Math.max(size, ...this.views.map((view) => Math.ceil(view.label.width) + 6)),
      rowH: size + labelGap + Math.max(...this.views.map((view) => Math.ceil(view.label.height))),
    };
  }

  private place(view: IconView, x: number, y: number, slot: number): void {
    const { size, labelGap } = ICON_BAR;
    view.plate.setPosition(x, y).setSize(slot, size);
    view.image.setPosition(x, y);
    view.label.setPosition(x, y + size / 2 + labelGap);
    view.badge.setPosition(x + size / 2 - 2, y - size / 2 + 2);
    view.ring?.setPosition(x, y);
    view.corner?.setPosition(x + size / 2 - 2, y + size / 2 - 1);
  }

  /** How many to a row, and how many rows, laid centred in `maxWidth`: rows as even as they go. */
  private centredGrid(maxWidth: number): { cols: number; rows: number } {
    const { slot } = this.cell();
    const count = Math.max(1, this.views.length);
    const fit = Math.max(1, Math.floor((maxWidth + ICON_BAR.gap) / (slot + ICON_BAR.gap)));
    const rows = Math.ceil(count / fit);
    return { cols: Math.ceil(count / rows), rows };
  }

  /** How tall the centred grid comes out in `maxWidth`, before it is placed. */
  public centredHeight(maxWidth: number): number {
    const { rowH } = this.cell();
    const { rows } = this.centredGrid(maxWidth);
    return rows * rowH + (rows - 1) * ICON_BAR.rowGap;
  }

  /**
   * On a phone, under 게임 시작 rather than in the corner (0.150, the user's
   * ask): a grid centred on `centreX` from `top`, each row centred.
   */
  public layCentred(centreX: number, top: number, maxWidth: number): void {
    const { size, gap, rowGap } = ICON_BAR;
    const count = this.views.length;
    if (count === 0) {
      return;
    }
    const { slot, rowH } = this.cell();
    const { cols, rows } = this.centredGrid(maxWidth);
    this.rows = rows;
    const full = cols * slot + (cols - 1) * gap;
    this.bounds = new Phaser.Geom.Rectangle(centreX - full / 2, top, full, rows * rowH + (rows - 1) * rowGap);
    this.views.forEach((view, index) => {
      const row = Math.floor(index / cols);
      const inRow = Math.min(cols, count - row * cols);
      const w = inRow * slot + (inRow - 1) * gap;
      const x = centreX - w / 2 + slot / 2 + (index % cols) * (slot + gap);
      this.place(view, x, top + size / 2 + row * (rowH + rowGap), slot);
    });
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
      view.label.setColor(
        index === this.focused
          ? COLORS.accent
          : view.ring
            ? Phaser.Display.Color.IntegerToColor(ICON_SPOTLIGHT.color).rgba
            : COLORS.muted,
      );
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

  /** True while Tab has walked to one of the icons. */
  public get hasFocus(): boolean {
    return this.focused >= 0;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Tab') {
      // Or the browser walks its own focus ring out of the canvas.
      event.preventDefault();
      this.focus((this.focused + 1) % this.views.length);
      return;
    }

    // Up and down are the list's: they take the keyboard back from the icons.
    if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(event.code)) {
      if (this.focused >= 0) {
        this.focus(-1);
      }
      return;
    }

    const chosen = this.views[this.focused];
    if (chosen && (event.code === 'Space' || event.code === 'Enter')) {
      event.preventDefault();
      chosen.button.onSelect();
    }
  }
}
