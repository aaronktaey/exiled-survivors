import Phaser from 'phaser';

import { COLORS, DEPTH, MENU, TEXT } from '@/config';
import { fitWidth } from '@/systems/Layout';

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
}

export interface MenuListOptions {
  readonly x: number;
  readonly y: number;
  readonly items: readonly MenuItem[];
  readonly width?: number;
  /** Escape, or the back button. */
  readonly onCancel?: () => void;
  /** The cursor landed on a different row. */
  readonly onMove?: (id: string) => void;
}

const UP_CODES = ['KeyW', 'ArrowUp'];
const DOWN_CODES = ['KeyS', 'ArrowDown'];
const LEFT_CODES = ['KeyA', 'ArrowLeft'];
const RIGHT_CODES = ['KeyD', 'ArrowRight'];
const SELECT_CODES = ['Space', 'Enter', 'NumpadEnter'];

interface Row {
  readonly item: MenuItem;
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
 */
export class MenuList {
  private static readonly INPUT_LOCK_MS = 220;

  private readonly scene: Phaser.Scene;
  private readonly rows: Row[] = [];
  private readonly onCancel?: () => void;
  private readonly onMove?: (id: string) => void;

  private selected = 0;
  private unlocked = false;
  private inputOn = true;

  public constructor(scene: Phaser.Scene, options: MenuListOptions) {
    this.scene = scene;
    this.onCancel = options.onCancel;
    this.onMove = options.onMove;

    const width = fitWidth(options.width ?? MENU.buttonWidth, scene.scale.width);
    const step = MENU.buttonHeight + MENU.buttonGap;

    options.items.forEach((item, index) => {
      const y = options.y + index * step;
      // No border: a row is just its words, and the one in hand is the one
      // lit up. The panel stays for the hit area and the highlight.
      const panel = scene.add
        .rectangle(options.x, y, width, MENU.buttonHeight, COLORS.panelActive, 0)
        .setDepth(DEPTH.ui)
        .setInteractive({ useHandCursor: true });

      // Centred normally; on a narrow screen a row with a value on its
      // right has to give that value somewhere to be.
      const tight = scene.scale.width < MENU.tightWidth && item.detail !== undefined;
      const label = scene.add
        .text(tight ? options.x - width / 2 + 14 : options.x, y, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.label,
          color: COLORS.text,
        })
        .setOrigin(tight ? 0 : 0.5, 0.5)
        .setDepth(DEPTH.ui + 1);

      // A value row keeps its arrows clear of the read-out.
      const detailRight = item.onAdjust ? options.x + width / 2 - 46 : options.x + width / 2 - 14;
      const detail = scene.add
        .text(detailRight, y, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.body,
          color: COLORS.muted,
        })
        .setOrigin(1, 0.5)
        .setDepth(DEPTH.ui + 1);

      panel.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.moveTo(index));
      panel.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
        this.moveTo(index);
        this.activate();
      });

      // Real buttons, not decoration: without them a mouse or a finger could
      // only ever raise a value, because tapping the row means "select".
      const arrows = item.onAdjust
        ? ([-1, 1] as const).map((direction) =>
            this.buildArrow(options.x + width / 2 - (direction < 0 ? 34 : 14), y, direction, index),
          )
        : [];

      this.rows.push({ item, panel, label, detail, arrows });
    });

    this.selected = this.rows.findIndex((row) => this.isEnabled(row));
    if (this.selected < 0) {
      this.selected = 0;
    }

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
  private buildArrow(x: number, y: number, direction: -1 | 1, index: number): Phaser.GameObjects.Text {
    const arrow = this.scene.add
      .text(x, y, direction < 0 ? '◀' : '▶', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2)
      .setInteractive({ useHandCursor: true });

    arrow.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.moveTo(index));
    arrow.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
      this.moveTo(index);
      this.adjust(direction);
    });

    return arrow;
  }

  public get selectedId(): string {
    return this.rows[this.selected]?.item.id ?? '';
  }

  /** Repaints labels and values; call after anything a row displays changes. */
  public refresh(): void {
    this.rows.forEach((row, index) => {
      const active = index === this.selected;
      const enabled = this.isEnabled(row);

      row.panel.setFillStyle(COLORS.panelActive, active ? 0.55 : 0);
      row.panel.setAlpha(enabled ? 1 : 0.45);

      row.label.setText(row.item.label());
      row.label.setColor(enabled ? (active ? COLORS.accent : COLORS.text) : COLORS.muted);
      row.label.setAlpha(enabled ? 1 : 0.5);

      row.detail.setText(row.item.detail?.() ?? '');
      row.detail.setAlpha(enabled ? 1 : 0.6);

      row.arrows.forEach((arrow) => {
        arrow.setColor(active && enabled ? COLORS.accent : COLORS.muted);
        arrow.setAlpha(enabled ? 1 : 0.4);
      });
    });
  }

  public destroy(): void {
    this.scene.input.keyboard?.off('keydown', this.onKeyDown, this);
  }

  private isEnabled(row: Row): boolean {
    return row.item.enabled?.() !== false;
  }

  private moveTo(index: number): void {
    if (!this.unlocked || !this.inputOn || index === this.selected) {
      return;
    }
    this.selected = index;
    this.refresh();
    this.onMove?.(this.selectedId);
  }

  /** Steps to the next selectable row, skipping disabled ones. */
  private step(direction: -1 | 1): void {
    for (let i = 1; i <= this.rows.length; i++) {
      const index = Phaser.Math.Wrap(this.selected + direction * i, 0, this.rows.length);
      const row = this.rows[index];
      if (row && this.isEnabled(row)) {
        this.selected = index;
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

    const row = this.rows[this.selected];
    if (!row || !this.isEnabled(row)) {
      return;
    }

    row.item.onSelect?.();
  }

  private adjust(direction: -1 | 1): void {
    if (!this.unlocked || !this.inputOn) {
      return;
    }

    const row = this.rows[this.selected];
    if (!row || !this.isEnabled(row) || !row.item.onAdjust) {
      return;
    }

    row.item.onAdjust(direction);
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
      this.activate();
    } else if (event.code === 'Escape') {
      this.onCancel?.();
    }
  }
}
