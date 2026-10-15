import Phaser from 'phaser';

import { COLORS, DEPTH, MENU, TEXT } from '@/config';
import { fitWidth } from '@/systems/Layout';
import { outlineWidth } from '@/systems/SharpText';

export interface MenuItem {
  readonly id: string;
  /** Read every refresh, so a row can show live values. */
  readonly label: () => string;
  /** Right-hand value, for settings rows. */
  readonly detail?: () => string;
  /** A disabled row is dimmed and cannot be chosen. */
  readonly enabled?: () => boolean;
  readonly onSelect?: () => void;
  /** Left/right on this row, for the rows that are really sliders. */
  readonly onAdjust?: (direction: -1 | 1) => void;
  /**
   * A row that stands for something with colours of its own — a sign-in
   * button — wears them: a border, and a tint that deepens under the cursor.
   */
  readonly accent?: number;
  /** The words on such a row, in its own colours too. */
  readonly accentText?: string;
}

export interface MenuListOptions {
  readonly x: number;
  readonly y: number;
  readonly items: readonly MenuItem[];
  readonly width?: number;
  /**
   * At most this many rows on screen at once. Anything past that scrolls
   * under the cursor, with ▲ ▼ to say there is more either way. A windowed
   * list is a list of choices: value rows are not expected to scroll.
   */
  readonly maxVisible?: number;
  /** Escape, or the back button. */
  readonly onCancel?: () => void;
  /** The cursor landed on a different row. */
  readonly onMove?: (id: string) => void;
  /**
   * True while something else on the screen has the keyboard — the title's
   * corner icons, walked to with Tab. Space and Enter are theirs then, not
   * the list's, or one press would open an icon and start a run at once.
   */
  readonly keysElsewhere?: () => boolean;
}

const UP_CODES = ['KeyW', 'ArrowUp'];
const DOWN_CODES = ['KeyS', 'ArrowDown'];
const LEFT_CODES = ['KeyA', 'ArrowLeft'];
const RIGHT_CODES = ['KeyD', 'ArrowRight'];
const SELECT_CODES = ['Space', 'Enter', 'NumpadEnter'];

interface Row {
  /** Which item this slot is showing; a windowed list re-points it. */
  item: MenuItem;
  readonly panel: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  readonly detail: Phaser.GameObjects.Text;
  /** The ◀ ▶ buttons, on the rows that hold a value. */
  readonly arrows: Phaser.GameObjects.Text[];
}

/**
 * The vertical button list every shell screen is built from: title, pause,
 * settings and credits.
 *
 * Works on keyboard (up/down to move, left/right to adjust a value row,
 * space or enter to choose) and on pointer or finger (hover highlights, tap
 * chooses). Input is locked briefly on open so the key that opened the
 * screen cannot fall through onto a button.
 *
 * A row is a slot rather than an item: a list longer than `maxVisible`
 * scrolls its items through the slots it has, which is what keeps the 장비창
 * the same height however many weapons the stash has collected.
 */
export class MenuList {
  private static readonly INPUT_LOCK_MS = 220;

  private readonly scene: Phaser.Scene;
  private readonly rows: Row[] = [];
  private readonly items: readonly MenuItem[];
  private readonly listX: number;
  private readonly listWidth: number;
  /** Narrow screen: a row with a value on its right cannot also be centred. */
  private readonly tightLayout: boolean;
  /** ▲ and ▼, on a list too long to show at once. */
  private readonly more: Phaser.GameObjects.Text[] = [];
  private readonly onCancel?: () => void;
  private readonly keysElsewhere?: () => boolean;
  private readonly onMove?: (id: string) => void;

  /** Index into the items, not into the rows. */
  private selected = 0;
  /** Which item the first row is showing. */
  private offset = 0;
  private unlocked = false;
  private inputOn = true;

  public constructor(scene: Phaser.Scene, options: MenuListOptions) {
    this.scene = scene;
    this.items = options.items;
    this.onCancel = options.onCancel;
    this.keysElsewhere = options.keysElsewhere;
    this.onMove = options.onMove;

    const width = fitWidth(options.width ?? MENU.buttonWidth, scene.scale.width);
    const step = MENU.buttonHeight + MENU.buttonGap;
    this.listX = options.x;
    this.listWidth = width;
    this.tightLayout = scene.scale.width < MENU.tightWidth;

    const visible = Math.min(options.items.length, options.maxVisible ?? options.items.length);

    for (let slot = 0; slot < visible; slot++) {
      const item = options.items[slot]!;
      const y = options.y + slot * step;

      // No border: a row is just its words, and the one in hand is the one
      // lit up. The panel stays for the hit area and the highlight.
      const panel = scene.add
        .rectangle(options.x, y, width, MENU.buttonHeight, COLORS.panelActive, 0)
        .setDepth(DEPTH.ui)
        .setInteractive({ useHandCursor: true });

      const label = scene.add
        .text(options.x, y, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.label,
          color: COLORS.text,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH.ui + 1);

      const detail = scene.add
        .text(options.x + width / 2 - 14, y, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.body,
          color: COLORS.muted,
        })
        .setOrigin(1, 0.5)
        .setDepth(DEPTH.ui + 1);

      panel.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.moveTo(slot));
      panel.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        this.moveTo(slot);
        this.activate();
      });

      // Real buttons, not decoration: without them a mouse or a finger could
      // only ever raise a value, because tapping the row means "select".
      const arrows = item.onAdjust
        ? ([-1, 1] as const).map((direction) =>
            this.buildArrow(options.x + width / 2 - (direction < 0 ? 34 : 14), y, direction, slot),
          )
        : [];

      this.rows.push({ item, panel, label, detail, arrows });
    }

    if (visible < options.items.length) {
      const lastY = options.y + (visible - 1) * step;
      this.more.push(
        this.buildMore(options.x, options.y - MENU.buttonHeight / 2 - 12, '▲'),
        this.buildMore(options.x, lastY + MENU.buttonHeight / 2 + 12, '▼'),
      );
    }

    this.selected = Math.max(
      0,
      this.items.findIndex((item) => item.enabled?.() !== false),
    );
    this.scrollTo(this.selected);

    this.refresh();
    scene.time.delayedCall(MenuList.INPUT_LOCK_MS, () => {
      this.unlocked = true;
    });
    scene.input.keyboard?.on('keydown', this.onKeyDown, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Off while another mode owns the keys, such as placing the stick. */
  public setInputEnabled(on: boolean): void {
    this.inputOn = on;
  }

  /** One ◀ or ▶ button, which adjusts its row without selecting it. */
  private buildArrow(
    x: number,
    y: number,
    direction: -1 | 1,
    slot: number,
  ): Phaser.GameObjects.Text {
    const arrow = this.scene.add
      .text(x, y, direction < 0 ? '◀' : '▶', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2)
      .setInteractive({ useHandCursor: true });

    arrow.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.moveTo(slot));
    arrow.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.moveTo(slot);
      this.adjust(direction);
    });

    return arrow;
  }

  /** The ▲ or ▼ that says the list carries on past the window. */
  private buildMore(x: number, y: number, glyph: string): Phaser.GameObjects.Text {
    return this.scene.add
      .text(x, y, glyph, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1)
      .setVisible(false);
  }

  public get selectedId(): string {
    return this.items[this.selected]?.id ?? '';
  }

  /**
   * Puts the cursor on one item by id, scrolling it into the window. Used by
   * a screen that rebuilt itself and wants the cursor back where it was.
   */
  public focus(id: string): boolean {
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) {
      return false;
    }

    this.selected = index;
    this.scrollTo(index);
    this.refresh();
    this.onMove?.(this.selectedId);
    return true;
  }

  /** Repaints labels and values; call after anything a row displays changes. */
  public refresh(): void {
    this.rows.forEach((row, slot) => {
      const index = this.offset + slot;
      const item = this.items[index];
      if (!item) {
        row.panel.setVisible(false);
        row.label.setVisible(false);
        row.detail.setVisible(false);
        row.arrows.forEach((arrow) => arrow.setVisible(false));
        return;
      }

      row.item = item;
      const active = index === this.selected;
      const enabled = item.enabled?.() !== false;

      row.panel.setVisible(true);
      if (item.accent !== undefined) {
        // Its own colours, solid; the cursor is a ring in the menu's accent.
        row.panel.setFillStyle(item.accent, active ? 1 : 0.88);
        row.panel.setStrokeStyle(active ? 3 : 1, active ? COLORS.accentFill : item.accent, 1);
      } else {
        row.panel.setFillStyle(COLORS.panelActive, active ? 0.55 : 0);
        row.panel.setStrokeStyle();
      }
      row.panel.setAlpha(enabled ? 1 : 0.45);

      // Centred normally; on a narrow screen a row with a value on its
      // right has to give that value somewhere to be.
      const tight = this.tightLayout && item.detail !== undefined;
      row.label.setVisible(true);
      row.label.setX(tight ? this.listX - this.listWidth / 2 + 14 : this.listX);
      row.label.setOrigin(tight ? 0 : 0.5, 0.5);
      row.label.setText(item.label());
      row.label.setColor(
        !enabled ? COLORS.muted : item.accentText ?? (active ? COLORS.accent : COLORS.text),
      );
      // Dark words on a light button need no dark outline — it only smears them.
      row.label.setStroke(TEXT.outline.color, item.accentText ? 0 : outlineWidth(TEXT.size.label));
      row.label.setAlpha(enabled ? 1 : 0.5);

      // A value row keeps its arrows clear of the read-out.
      row.detail.setVisible(true);
      row.detail.setX(this.listX + this.listWidth / 2 - (item.onAdjust ? 46 : 14));
      row.detail.setText(item.detail?.() ?? '');
      row.detail.setAlpha(enabled ? 1 : 0.6);

      row.arrows.forEach((arrow) => {
        arrow.setVisible(item.onAdjust !== undefined);
        arrow.setColor(active && enabled ? COLORS.accent : COLORS.muted);
        arrow.setAlpha(enabled ? 1 : 0.4);
      });
    });

    const [up, down] = this.more;
    up?.setVisible(this.offset > 0);
    down?.setVisible(this.offset + this.rows.length < this.items.length);
  }

  public destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.onKeyDown, this);
  }

  private isEnabled(item: MenuItem | undefined): boolean {
    return item !== undefined && item.enabled?.() !== false;
  }

  private moveTo(slot: number): void {
    const index = this.offset + slot;
    if (!this.unlocked || !this.inputOn || index === this.selected || !this.items[index]) {
      return;
    }

    this.selected = index;
    this.refresh();
    this.onMove?.(this.selectedId);
  }

  /** Keeps the cursor inside the window, on a list longer than it. */
  private scrollTo(index: number): void {
    const visible = this.rows.length;
    if (index < this.offset) {
      this.offset = index;
    } else if (index >= this.offset + visible) {
      this.offset = index - visible + 1;
    }

    this.offset = Phaser.Math.Clamp(this.offset, 0, Math.max(0, this.items.length - visible));
  }

  /** Steps to the next selectable row, skipping disabled ones. */
  private step(direction: -1 | 1): void {
    for (let i = 1; i <= this.items.length; i++) {
      const index = Phaser.Math.Wrap(this.selected + direction * i, 0, this.items.length);
      if (this.isEnabled(this.items[index])) {
        this.selected = index;
        this.scrollTo(index);
        this.refresh();
        this.onMove?.(this.selectedId);
        return;
      }
    }
  }

  private activate(): void {
    if (!this.unlocked || !this.inputOn) {
      return;
    }

    const item = this.items[this.selected];
    if (!this.isEnabled(item)) {
      return;
    }

    item?.onSelect?.();
  }

  private adjust(direction: -1 | 1): void {
    if (!this.unlocked || !this.inputOn) {
      return;
    }

    const item = this.items[this.selected];
    if (!this.isEnabled(item) || !item?.onAdjust) {
      return;
    }

    item.onAdjust(direction);
    this.refresh();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || !this.unlocked || !this.inputOn) {
      return;
    }

    if (UP_CODES.includes(event.code)) {
      this.step(-1);
    } else if (DOWN_CODES.includes(event.code)) {
      this.step(1);
    } else if (LEFT_CODES.includes(event.code)) {
      this.adjust(-1);
    } else if (RIGHT_CODES.includes(event.code)) {
      this.adjust(1);
    } else if (SELECT_CODES.includes(event.code)) {
      if (this.keysElsewhere?.()) {
        return;
      }
      this.activate();
    } else if (event.code === 'Escape') {
      this.onCancel?.();
    }
  }
}
