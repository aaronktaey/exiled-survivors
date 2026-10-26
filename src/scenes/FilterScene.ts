import Phaser from 'phaser';

import type { DropTier } from '@/config';
import {
  COLORS,
  DEPTH,
  GEAR,
  INVENTORY,
  ITEM_FILTER,
  SCENES,
  SCRIM,
  TEXT,
  type BoneId,
  type FilterEntry,
  type FilterSupply,
  type GearId,
  type OrbId,
} from '@/config';
import { boneName, boneShort, fill, gearName, orbName, orbShort, t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { itemFilter } from '@/systems/ItemFilter';
import { fitText } from '@/systems/Layout';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export interface FilterSceneData {
  readonly onClose: () => void;
}

/** One switch on the screen. */
interface FilterCell {
  readonly entry: FilterEntry;
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly icon: Phaser.GameObjects.Image;
  readonly caption: Phaser.GameObjects.Text;
  /** The red stroke across a switched-off one. */
  readonly cross: Phaser.GameObjects.Graphics;
  readonly row: number;
  readonly col: number;
}

const TITLE_Y = 34;
const FOOTER = 34;
const OFF_EDGE = 0xe0564a;

/**
 * 아이템 필터 — a switch per kind of drop, reached from the title's corner.
 *
 * A row per section (소모품, 구슬, 뼈다귀, 장비 등급, 장비 종류), an icon per
 * switch in its rarity's border. Pressing one switches it off: the icon dims
 * and is struck through, and that drop no longer lands in a run. What the one
 * under the cursor is, and whether it shows, is read out under the grid.
 */
export class FilterScene extends Phaser.Scene {
  public static readonly KEY = SCENES.filter;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;
  /** Every switch, by its key. Public so a test can press one. */
  public cells = new Map<string, FilterCell>();
  /** What the switch under the cursor is. Public for tests. */
  public detail!: Phaser.GameObjects.Text;
  /** How many are off. Public for tests. */
  public summary!: Phaser.GameObjects.Text;
  /** The switch the keyboard is on, as an index into `order`; `order.length` is 모두 보이기. */
  public focused = 0;

  private payload!: FilterSceneData;
  private order: FilterCell[] = [];
  private showAllPlate?: Phaser.GameObjects.Rectangle;

  public constructor() {
    super(FilterScene.KEY);
  }

  public init(data: FilterSceneData): void {
    this.payload = data;
    this.cells = new Map();
    this.order = [];
    this.focused = 0;
    this.showAllPlate = undefined;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    const copy = t().filter;

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);
    const text = (x: number, y: number, value: string, size: string, color: string) =>
      this.add
        .text(x, y, value, { fontFamily: 'system-ui, sans-serif', fontSize: size, color })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1);

    fitText(text(width / 2, TITLE_Y, copy.title, TEXT.size.screen, COLORS.text), width - 220);
    // Wrapped rather than squeezed: on a phone it is two lines, not a smudge.
    const lead = this.add
      .text(width / 2, TITLE_Y + 24, copy.lead, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: Math.min(width - 32, 820) },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);

    // The grid: a row a section, a label to its left, as big as the window allows.
    const sections = ITEM_FILTER.length;
    const widest = Math.max(...ITEM_FILTER.map((section) => section.entries.length));
    const top = lead.y + lead.height + 14;
    const bottomBlock = 34 + 22 + 40 + FOOTER;
    const rowH = Math.min(76, Math.floor((height - top - bottomBlock) / sections));
    const labelW = Math.min(110, Math.floor(width * 0.22));
    const gap = 8;
    const cell = Math.max(
      22,
      Math.min(52, rowH - 22, Math.floor((width - 24 - labelW) / widest) - gap),
    );
    const gridW = labelW + widest * (cell + gap) - gap;
    const left = Math.round((width - gridW) / 2);

    ITEM_FILTER.forEach((section, row) => {
      const y = top + row * rowH + cell / 2;
      const label = this.add
        .text(left, y, copy.sections[section.id], {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.ui + 1);
      fitText(label, labelW - 6, 0);

      section.entries.forEach((entry, col) => {
        const x = left + labelW + col * (cell + gap) + cell / 2;
        const plate = this.add
          .rectangle(x, y, cell, cell, INVENTORY.empty, 1)
          .setStrokeStyle(2, INVENTORY.border[entry.tier], 1)
          .setDepth(DEPTH.ui + 1)
          .setInteractive({ useHandCursor: true })
          .setData('flat', true);
        const icon = this.add
          .image(x, y, entry.texture)
          .setDisplaySize(cell - 12, cell - 12)
          .setDepth(DEPTH.ui + 2);
        const caption = this.add
          .text(x, y + cell / 2 + 3, FilterScene.captionFor(entry.key), {
            fontFamily: 'system-ui, sans-serif',
            fontSize: TEXT.size.hint,
            color: COLORS.muted,
          })
          .setOrigin(0.5, 0)
          .setDepth(DEPTH.ui + 1);
        fitText(caption, cell + gap, 0);
        const cross = this.add.graphics().setDepth(DEPTH.ui + 3);
        cross.lineStyle(3, OFF_EDGE, 0.9);
        cross.lineBetween(x - cell / 2 + 4, y + cell / 2 - 4, x + cell / 2 - 4, y - cell / 2 + 4);

        const view: FilterCell = { entry, plate, icon, caption, cross, row, col };
        const index = this.order.length;
        this.order.push(view);
        this.cells.set(entry.key, view);
        plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.focus(index));
        plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => {
          this.focus(index);
          this.press(entry.key);
        });
      });
    });

    const below = top + sections * rowH;
    this.detail = text(width / 2, below + 12, '', TEXT.size.hint, COLORS.text);
    this.summary = text(width / 2, below + 34, '', TEXT.size.hint, COLORS.gearText);

    const buttonY = below + 34 + 32;
    this.showAllPlate = this.add
      .rectangle(width / 2, buttonY, Math.min(200, width - 40), 36, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    text(width / 2, buttonY, copy.showAll, TEXT.size.body, COLORS.text).setDepth(DEPTH.ui + 2);
    this.showAllPlate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OVER, () => this.focus(this.order.length));
    this.showAllPlate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.showAll());

    fitText(
      text(width / 2, height - FOOTER / 2, prefersTouchControls() ? copy.hintTouch : copy.hintKeyboard, TEXT.size.hint, COLORS.muted),
      width,
    );

    this.armKeys();
    this.refresh();
  }

  /** Switches one off, or back on. Public so a test can. */
  public press(key: string): void {
    const index = this.order.findIndex((view) => view.entry.key === key);
    if (index >= 0) {
      this.focused = index;
    }
    itemFilter.toggle(key);
    this.refresh();
  }

  /** Everything back on. */
  public showAll(): void {
    itemFilter.reset();
    this.refresh();
  }

  /** What a switch is called under its icon: the short form where there is one. */
  private static captionFor(key: string): string {
    const [kind, id] = key.split(':') as [string, string | undefined];
    const copy = t().filter;
    switch (kind) {
      case 'orb':
        return orbShort(id as OrbId);
      case 'bone':
        return boneShort(id as BoneId);
      case 'rarity':
        return copy.rarity[id as DropTier];
      case 'gear':
        return fill(t().gear.tier, { tier: GEAR[id as GearId].tier });
      default:
        return copy.itemsShort[kind as FilterSupply];
    }
  }

  /** And in full, for the line under the grid. */
  private static nameFor(key: string): string {
    const [kind, id] = key.split(':') as [string, string | undefined];
    switch (kind) {
      case 'orb':
        return orbName(id as OrbId);
      case 'bone':
        return boneName(id as BoneId);
      case 'rarity':
        return `${t().filter.sections.rarity} · ${t().filter.rarity[id as DropTier]}`;
      case 'gear':
        return `${gearName(id as GearId)} (${fill(t().gear.tier, { tier: GEAR[id as GearId].tier })})`;
      default:
        return t().filter.items[kind as FilterSupply];
    }
  }

  private focus(index: number): void {
    this.focused = index;
    this.refresh();
  }

  private refresh(): void {
    const copy = t().filter;
    this.order.forEach((view, index) => {
      const on = itemFilter.shows(view.entry.key);
      const focused = index === this.focused;
      view.icon.setAlpha(on ? 1 : 0.25);
      view.caption.setColor(on ? COLORS.muted : '#6b7385');
      view.cross.setVisible(!on);
      view.plate.setFillStyle(focused ? COLORS.panelActive : INVENTORY.empty, 1);
      view.plate.setStrokeStyle(focused ? 3 : 2, focused ? 0xf4f1e8 : INVENTORY.border[view.entry.tier], 1);
    });
    this.showAllPlate?.setStrokeStyle(2, this.focused === this.order.length ? 0xf4f1e8 : COLORS.panelEdge, 1);

    const pointed = this.order[this.focused];
    this.detail.setText(
      pointed
        ? `${FilterScene.nameFor(pointed.entry.key)} — ${itemFilter.shows(pointed.entry.key) ? copy.shown : copy.hidden}`
        : '',
    );
    fitText(this.detail.setScale(1), this.scale.width);
    const off = itemFilter.hiddenCount;
    this.summary.setText(off > 0 ? fill(copy.hiddenCount, { count: off }) : copy.allShown);
    this.summary.setColor(off > 0 ? COLORS.gearText : COLORS.muted);
  }

  /** Arrows along a row and between rows, Space to switch, Esc out. */
  private armKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const step = (dx: number, dy: number): void => {
      const here = this.order[this.focused];
      if (!here) {
        // On 모두 보이기: up goes back into the grid, anything else stays.
        if (dy < 0) {
          this.focus(this.order.length - 1);
        }
        return;
      }
      if (dx !== 0) {
        this.focus(Phaser.Math.Clamp(this.focused + dx, 0, this.order.length - 1));
        return;
      }
      const row = here.row + dy;
      const inRow = this.order.filter((view) => view.row === row);
      if (inRow.length === 0) {
        if (dy > 0) {
          this.focus(this.order.length);
        }
        return;
      }
      const target = inRow[Math.min(here.col, inRow.length - 1)]!;
      this.focus(this.order.indexOf(target));
    };
    const onKey = (event: KeyboardEvent): void => {
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          step(-1, 0);
          break;
        case 'ArrowRight':
        case 'KeyD':
          step(1, 0);
          break;
        case 'ArrowUp':
        case 'KeyW':
          step(0, -1);
          break;
        case 'ArrowDown':
        case 'KeyS':
          step(0, 1);
          break;
        case 'Space':
        case 'Enter':
        case 'NumpadEnter': {
          const view = this.order[this.focused];
          if (view) {
            this.press(view.entry.key);
          } else {
            this.showAll();
          }
          break;
        }
        case 'Escape':
          this.close();
          break;
        default:
          return;
      }
      event.preventDefault?.();
    };
    keyboard.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off('keydown', onKey));
  }

  private close(): void {
    this.scene.stop();
    this.payload.onClose();
  }
}
