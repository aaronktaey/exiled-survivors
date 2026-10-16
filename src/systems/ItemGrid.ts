import Phaser from 'phaser';

import { COLORS, INVENTORY, TEXT, type DropTier } from '@/config';

/** One thing in a cell. */
export interface GridItem {
  readonly id: string;
  readonly icon: string;
  /** How rare it is, which colours the cell's border. */
  readonly tier?: DropTier;
  /** A number in the corner — how many of a stackable thing are held. */
  readonly count?: () => number;
  /** A mark in the other corner — the weapon being carried. */
  readonly marked?: () => boolean;
  /** A small picture in the bottom-left corner — a weapon's 망고 상태. */
  readonly badge?: () => string | null;
  /** Read by the screen for a heading; the grid itself shows only icons. */
  readonly label: () => string;
  /** Space or Enter on it. */
  readonly onSelect?: () => void;
}

export interface ItemGridOptions {
  /** Top-left corner of the grid. */
  readonly x: number;
  readonly y: number;
  readonly cell: number;
  readonly depth: number;
  /** Called whenever the cursor lands on a different item. */
  readonly onMove?: () => void;
}

interface CellView {
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly icon: Phaser.GameObjects.Image;
  readonly count: Phaser.GameObjects.Text;
  readonly mark: Phaser.GameObjects.Rectangle;
  readonly badge: Phaser.GameObjects.Image;
}

/**
 * The inventory's grid: INVENTORY.cols across and INVENTORY.rows down, one
 * item per cell, drawn as its icon in a border the colour of its rarity.
 *
 * The cursor moves with the arrow keys (or WASD), lands on whatever the
 * mouse is over, and lands on whatever is tapped; Space or Enter is the
 * item's own `onSelect`. More items
 * than one grid holds turn into pages, and walking off the last row of one
 * page arrives on the next.
 *
 * It keeps the same handles a MenuList does — `items`, `selected`,
 * `selectedId`, `focus`, `step`, `refresh` — so a screen that used a list
 * swaps one for the other without its callers noticing.
 */
export class ItemGrid {
  public readonly items: readonly GridItem[];
  /** Index into `items` of the cell under the cursor. */
  public selected = 0;
  /** Public so a test can read where things are drawn. */
  public readonly cells: CellView[] = [];
  public readonly cursor: Phaser.GameObjects.Rectangle;

  private readonly options: ItemGridOptions;
  private readonly perPage = INVENTORY.cols * INVENTORY.rows;

  public constructor(scene: Phaser.Scene, items: readonly GridItem[], options: ItemGridOptions) {
    this.items = items;
    this.options = options;

    const { cell, depth } = options;
    for (let i = 0; i < this.perPage; i++) {
      const { x, y } = this.centreOf(i);
      const plate = scene.add
        .rectangle(x, y, cell, cell, INVENTORY.empty, 1)
        .setStrokeStyle(1, COLORS.panelEdge, 1)
        .setDepth(depth)
        .setInteractive({ useHandCursor: true });
      const icon = scene.add
        .image(x, y, '__DEFAULT')
        .setDisplaySize(cell * 0.86, cell * 0.86)
        .setDepth(depth + 1)
        .setVisible(false);
      const count = scene.add
        .text(x + cell / 2 - 3, y + cell / 2 - 1, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.text,
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(1, 1)
        .setDepth(depth + 2);
      const mark = scene.add
        .rectangle(x - cell / 2 + 5, y - cell / 2 + 5, 6, 6, INVENTORY.equipped, 1)
        .setDepth(depth + 2)
        .setVisible(false);

      const badge = scene.add
        .image(x - cell / 2 + cell * 0.2, y + cell / 2 - cell * 0.2, '__DEFAULT')
        .setDisplaySize(cell * 0.36, cell * 0.36)
        .setDepth(depth + 2)
        .setVisible(false);

      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.hover(i));
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.tap(i));
      this.cells.push({ plate, icon, count, mark, badge });
    }

    this.cursor = scene.add
      .rectangle(0, 0, cell + 4, cell + 4, 0x000000, 0)
      .setStrokeStyle(2, COLORS.accentFill, 1)
      .setDepth(depth + 3);

    this.refresh();
  }

  /** The id under the cursor, or undefined on an empty grid. */
  public get selectedId(): string | undefined {
    return this.items[this.selected]?.id;
  }

  /** Which page the cursor is on, from 0. */
  public get page(): number {
    return Math.floor(this.selected / this.perPage);
  }

  public get pages(): number {
    return Math.max(1, Math.ceil(this.items.length / this.perPage));
  }

  /** Full width and height of the grid, for laying out around it. */
  public get size(): { readonly width: number; readonly height: number } {
    const { cell } = this.options;
    return {
      width: INVENTORY.cols * cell + (INVENTORY.cols - 1) * INVENTORY.gap,
      height: INVENTORY.rows * cell + (INVENTORY.rows - 1) * INVENTORY.gap,
    };
  }

  /** Puts the cursor on an item by id, if it is there. */
  public focus(id: string): void {
    const index = this.items.findIndex((item) => item.id === id);
    if (index >= 0) {
      this.moveTo(index);
    }
  }

  /** Puts the cursor on the cell at this place in the list, or the last one if the list is shorter now. */
  public focusAt(index: number): void {
    if (this.items.length > 0) {
      this.moveTo(Phaser.Math.Clamp(index, 0, this.items.length - 1));
    }
  }

  /** Steps the cursor through the items in reading order. */
  public step(by: number): void {
    if (this.items.length === 0) {
      return;
    }
    this.moveTo(Phaser.Math.Clamp(this.selected + by, 0, this.items.length - 1));
  }

  /** One cell in a direction. Off the bottom of a page is the next page. */
  public move(dx: number, dy: number): void {
    if (this.items.length === 0) {
      return;
    }

    const col = this.selected % INVENTORY.cols;
    if (dx !== 0) {
      const nextCol = col + dx;
      if (nextCol < 0 || nextCol >= INVENTORY.cols) {
        return;
      }
      this.moveTo(Math.min(this.items.length - 1, this.selected + dx));
      return;
    }

    const next = this.selected + dy * INVENTORY.cols;
    if (next < 0) {
      return;
    }
    // Past the last item, the last row still takes the cursor — to its end.
    this.moveTo(Math.min(this.items.length - 1, next));
  }

  /** Space, Enter: the item's own action. */
  public activate(): void {
    this.items[this.selected]?.onSelect?.();
  }

  /** Repaints every cell of the page the cursor is on. */
  public refresh(): void {
    const first = this.page * this.perPage;
    this.cells.forEach((view, slot) => {
      const item = this.items[first + slot];
      if (!item) {
        view.plate.setFillStyle(INVENTORY.empty, 1).setStrokeStyle(1, COLORS.panelEdge, 1);
        view.icon.setVisible(false);
        view.count.setText('');
        view.mark.setVisible(false);
        view.badge.setVisible(false);
        return;
      }

      view.plate
        .setFillStyle(COLORS.panel, 1)
        .setStrokeStyle(2, INVENTORY.border[item.tier ?? 'normal'], 1);
      if (view.icon.texture.key !== item.icon) {
        const { cell } = this.options;
        view.icon.setTexture(item.icon).setDisplaySize(cell * 0.86, cell * 0.86);
      }
      view.icon.setVisible(true);
      const count = item.count?.();
      view.count.setText(count !== undefined ? String(count) : '');
      view.mark.setVisible(item.marked?.() === true);
      const badge = item.badge?.() ?? null;
      view.badge.setVisible(badge !== null);
      if (badge && view.badge.texture.key !== badge) {
        const { cell } = this.options;
        view.badge.setTexture(badge).setDisplaySize(cell * 0.36, cell * 0.36);
      }
    });

    const slot = this.selected - first;
    const { x, y } = this.centreOf(slot);
    this.cursor.setPosition(x, y).setVisible(this.items.length > 0);
  }

  private moveTo(index: number): void {
    if (index === this.selected) {
      return;
    }
    this.selected = index;
    this.refresh();
    this.options.onMove?.();
  }

  private hover(slot: number): void {
    const index = this.page * this.perPage + slot;
    if (index < this.items.length) {
      this.moveTo(index);
    }
  }

  /**
   * A tap only picks. A touch fires "over" before "down", so a tap that also
   * acted on the picked cell would act on the very first touch — wearing a
   * weapon the player only meant to look at. Acting is the buttons beside
   * the grid, or Space and Enter.
   */
  private tap(slot: number): void {
    this.hover(slot);
  }

  private centreOf(slot: number): { x: number; y: number } {
    const { x, y, cell } = this.options;
    const col = slot % INVENTORY.cols;
    const row = Math.floor(slot / INVENTORY.cols);
    return {
      x: x + col * (cell + INVENTORY.gap) + cell / 2,
      y: y + row * (cell + INVENTORY.gap) + cell / 2,
    };
  }
}
