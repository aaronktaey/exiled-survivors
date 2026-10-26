import Phaser from 'phaser';

import {
  COLORS,
  DEPTH,
  GEAR,
  GEAR_DROP,
  INVENTORY,
  SCENES,
  SCRIM,
  TEXT,
  TEXTURES,
  gearTexture,
  type GearId,
} from '@/config';
import { fill, gearName, gearTitle, orbName, t } from '@/i18n';
import { InventoryScene } from '@/scenes/InventoryScene';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { canSalvage, dropTierFor, gear, salvageFor, totalSalvage, type GearItem, type SalvageTotal, type SalvageYield } from '@/systems/Gear';
import { ItemGrid } from '@/systems/ItemGrid';
import { fitText } from '@/systems/Layout';
import { ore } from '@/systems/Ore';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export type ForgeTab = 'single' | 'bulk' | 'craft';

const TABS: readonly ForgeTab[] = ['single', 'bulk', 'craft'];

export interface ForgeSceneData {
  /** Handed on to the 인벤토리 it goes back to. */
  readonly onClose: () => void;
  readonly tab?: ForgeTab;
  /** The weapon the cursor should land on (낱개 분해). */
  readonly focus?: string;
  /** Or the place it was at, when what was there is gone. */
  readonly focusIndex?: number;
  /** What the last action did, shown until something else happens. */
  readonly note?: string;
  /** 일괄 분해's settings, kept across a relayout. */
  readonly bulk?: { readonly types: readonly GearId[]; readonly maxLines: number };
}

const MARGIN = 16;
const HEADER = 108;
const FOOTER = 34;
const GUTTER = 24;
const TAB_WIDTH = 104;
const TAB_HEIGHT = 30;
const BUTTON_HEIGHT = 30;
const ROW_HEIGHT = 36;
/** The read-out's lines: the base, a heading and the slots for each kind. */
const READ_OUT_LINES = 1 + 1 + GEAR_DROP.maxPrefixes + 1 + GEAR_DROP.maxSuffixes;
const MAX_LINES = GEAR_DROP.maxPrefixes + GEAR_DROP.maxSuffixes;

/** Weakest first, the way the eye reads up a ladder. */
const ROSTER = (): GearId[] =>
  (Object.keys(GEAR) as GearId[]).sort((a, b) => GEAR[b].tier - GEAR[a].tier);

interface Button {
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

/**
 * 분해 (0.90, the user's ask — selling and gold went for it), reached from
 * the 인벤토리's 분해 button. Three tabs:
 *
 *   낱개 분해 — the stash's grid: take one sword apart (asked twice), or
 *               lock it so 분해 passes it by.
 *   일괄 분해 — pick the bases and the most 속성 to take; everything that
 *               matches, but the one in hand and the locked, goes at once.
 *   제작     — a bare sword of a base for its 철광석.
 *
 * What a sword gives back is GEAR[id].salvageOre and, by its 속성 count, a
 * 구슬 (SALVAGE_ORBS); what one costs is GEAR[id].craftOre.
 */
export class ForgeScene extends Phaser.Scene {
  public static readonly KEY = SCENES.forge;

  public backButton?: BackButton;
  public tab: ForgeTab = 'single';
  /** 낱개 분해's grid. Public for tests. */
  public menu?: ItemGrid;
  /** Public for tests: the buttons and lines a test reads or presses. */
  public salvageButton?: Button;
  public lockButton?: Button;
  public bulkButton?: Button;
  public oreLine!: Phaser.GameObjects.Text;
  public noteLine!: Phaser.GameObjects.Text;
  public preview?: Phaser.GameObjects.Text;
  public craftButtons = new Map<GearId, Button>();
  /** 일괄 분해's settings. */
  public bulkTypes = new Set<GearId>();
  public bulkMax = 1;
  /** What has been pressed once and waits for the second press. */
  public armed: 'salvage' | 'bulk' | null = null;

  private payload!: ForgeSceneData;
  private heading?: Phaser.GameObjects.Text;
  private lines?: Phaser.GameObjects.Text;
  private yieldLine?: Phaser.GameObjects.Text;
  private typeRows = new Map<GearId, { plate: Phaser.GameObjects.Rectangle; check: Phaser.GameObjects.Text; count: Phaser.GameObjects.Text }>();
  private maxLabel?: Phaser.GameObjects.Text;

  public constructor() {
    super(ForgeScene.KEY);
  }

  public init(data: ForgeSceneData): void {
    this.payload = data;
    this.tab = data.tab ?? 'single';
    this.menu = undefined;
    this.salvageButton = undefined;
    this.lockButton = undefined;
    this.bulkButton = undefined;
    this.preview = undefined;
    this.heading = undefined;
    this.lines = undefined;
    this.yieldLine = undefined;
    this.maxLabel = undefined;
    this.craftButtons = new Map();
    this.typeRows = new Map();
    this.bulkTypes = new Set(data.bulk?.types ?? []);
    this.bulkMax = data.bulk?.maxLines ?? 1;
    this.armed = null;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    const copy = t().forge;
    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);

    this.add
      .text(width / 2, MARGIN + 14, this.tab === 'craft' ? copy.craftTitle : copy.salvageTitle, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.screen, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
    this.oreLine = this.add
      .text(width / 2, MARGIN + 40, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.gearText })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    // 분해 and 제작 are two screens since 0.141 (the user's ask): 분해's two tabs, or 제작 alone.
    const tabs = this.tabs;
    tabs.forEach((tab, i) => {
      const x = width / 2 + (i - (tabs.length - 1) / 2) * (TAB_WIDTH + 6);
      const active = tab === this.tab;
      const plate = this.add
        .rectangle(x, MARGIN + 54 + TAB_HEIGHT / 2, TAB_WIDTH, TAB_HEIGHT, active ? COLORS.panelActive : COLORS.panel, 1)
        .setStrokeStyle(2, active ? COLORS.accentFill : COLORS.panelEdge, 1)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x, plate.y, copy.tabs[tab], { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: active ? COLORS.text : COLORS.muted })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      fitText(label, TAB_WIDTH - 6, 0);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.openTab(tab));
    });

    this.noteLine = this.add
      .text(width / 2, height - FOOTER - 12, this.payload.note ?? '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.gearText,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
    fitText(this.noteLine, width - 16, 0);

    if (this.tab === 'single') {
      this.buildSingle();
    } else if (this.tab === 'bulk') {
      this.buildBulk();
    } else {
      this.buildCraft();
    }

    fitText(
      this.add
        .text(width / 2, height - FOOTER / 2, this.footerHint(), { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width,
    );

    const keyboard = this.input.keyboard;
    keyboard?.on('keydown', this.onKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard?.off('keydown', this.onKey, this));
    this.refresh();
  }

  // --- 낱개 분해 ---

  private buildSingle(): void {
    const { width, height } = this.scale;
    const stacked = width < INVENTORY.sideBySideFrom;
    const linesStyle = {
      fontFamily: 'system-ui, sans-serif',
      fontSize: stacked ? TEXT.size.hint : TEXT.size.small,
      color: COLORS.muted,
      align: 'left',
      lineSpacing: stacked ? 1 : 5,
    } as const;
    const probe = this.add.text(0, 0, Array(READ_OUT_LINES).fill('가').join('\n'), linesStyle);
    const linesHeight = Math.ceil(probe.height);
    probe.destroy();
    const headingBlock = stacked ? 26 : 40;
    const detailHeight = headingBlock + linesHeight + 8 + 22 + 8 + BUTTON_HEIGHT;

    const top = HEADER;
    const bottom = height - FOOTER - 26;
    const span = (n: number, cell: number) => n * cell + (n - 1) * INVENTORY.gap;
    const fit = (roomH: number, roomW: number) =>
      Math.floor(
        Phaser.Math.Clamp(
          Math.min((roomH - (INVENTORY.rows - 1) * INVENTORY.gap) / INVENTORY.rows, (roomW - (INVENTORY.cols - 1) * INVENTORY.gap) / INVENTORY.cols),
          INVENTORY.cellMin,
          INVENTORY.cellMax,
        ),
      );
    const cell = stacked
      ? fit(bottom - top - 18 - detailHeight, width - MARGIN * 2)
      : fit(bottom - top - 18, (width - MARGIN * 2 - GUTTER) * 0.5);
    const gridWidth = span(INVENTORY.cols, cell);
    const gridLeft = stacked ? Math.round((width - gridWidth) / 2) : MARGIN;

    this.menu = new ItemGrid(
      this,
      gear.items.map((item) => ({
        id: item.uid,
        icon: gearTexture(item.id),
        tier: dropTierFor(item),
        marked: () => gear.value.equipped === item.uid,
        badge: () => (this.itemFor(item.uid)?.locked ? TEXTURES.lock : null),
        label: () => gearTitle(item),
        onSelect: () => this.pressSalvage(),
      })),
      { x: gridLeft, y: top, cell, depth: DEPTH.ui + 1, onMove: () => this.showItem() },
    );
    if (this.payload.focus) {
      this.menu.focus(this.payload.focus);
    } else if (this.payload.focusIndex !== undefined) {
      this.menu.focusAt(this.payload.focusIndex);
    }

    const paneLeft = stacked ? MARGIN : gridLeft + gridWidth + GUTTER;
    const paneWidth = stacked ? width - MARGIN * 2 : width - paneLeft - MARGIN;
    const x = paneLeft + paneWidth / 2;
    let y = stacked ? top + span(INVENTORY.rows, cell) + 14 : top;
    this.heading = this.add
      .text(x, y, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.label, color: COLORS.gearText, align: 'center' })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);
    y += headingBlock;
    this.lines = this.add.text(x, y, '', { ...linesStyle, wordWrap: { width: paneWidth } }).setOrigin(0.5, 0).setDepth(DEPTH.ui + 1);
    y += linesHeight + 8;
    this.yieldLine = this.add
      .text(x, y, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text, align: 'center' })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);
    y += 22 + 8 + BUTTON_HEIGHT / 2;
    const w = Math.min(150, (paneWidth - 12) / 2);
    this.salvageButton = this.button(x - w / 2 - 6, y, w, () => this.pressSalvage());
    this.lockButton = this.button(x + w / 2 + 6, y, w, () => this.pressLock());
  }

  private itemFor(uid: string | undefined): GearItem | undefined {
    return uid ? gear.items.find((held) => held.uid === uid) : undefined;
  }

  private selected(): GearItem | undefined {
    return this.itemFor(this.menu?.selectedId);
  }

  private showItem(): void {
    this.armed = null;
    this.refresh();
  }

  /** First press asks, the second takes it apart. Public so a test can. */
  public pressSalvage(): void {
    const item = this.selected();
    const copy = t().forge;
    if (!item) {
      return;
    }
    if (!canSalvage(item, gear.value.equipped)) {
      this.say(item.locked ? copy.lockedNote : copy.equippedNote);
      return;
    }
    if (this.armed !== 'salvage') {
      this.armed = 'salvage';
      this.refresh();
      return;
    }
    const at = this.menu?.selected ?? 0;
    const got = gear.salvage(item.uid);
    if (!got) {
      return;
    }
    this.relayout({ tab: 'single', focusIndex: at, note: fill(copy.salvaged, { gear: gearTitle(item), what: ForgeScene.yieldText(got) }) });
  }

  /** 잠금 on or off. Public so a test can. */
  public pressLock(): void {
    const item = this.selected();
    if (!item) {
      return;
    }
    gear.setLocked(item.uid, !item.locked);
    this.armed = null;
    this.menu?.refresh();
    this.refresh();
  }

  // --- 일괄 분해 ---

  private buildBulk(): void {
    const { width } = this.scale;
    const copy = t().forge;
    const w = Math.min(width - MARGIN * 2, 460);
    const left = width / 2 - w / 2;
    let y = HEADER;
    this.add
      .text(left, y, copy.bulkTypes, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
      .setOrigin(0, 0)
      .setDepth(DEPTH.ui + 1);
    y += 22;
    // Two columns when one would push the button into the hint (0.141: the
    // roster grew to eight, and lying down that ran off the bottom).
    const roster = ROSTER();
    const below = BUTTON_HEIGHT + 10 + 46 + BUTTON_HEIGHT + FOOTER + 30;
    const columns = roster.length * ROW_HEIGHT > this.scale.height - y - below && width >= 2 * 300 + MARGIN * 2 ? 2 : 1;
    const colW = columns === 2 ? Math.min((width - MARGIN * 2 - 12) / 2, 340) : w;
    const rows = Math.ceil(roster.length / columns);
    const top = y;
    roster.forEach((id, index) => {
      const col = Math.floor(index / rows);
      const row = index % rows;
      const cy = top + row * ROW_HEIGHT + ROW_HEIGHT / 2;
      const cx = width / 2 + (columns === 2 ? (col === 0 ? -1 : 1) * (colW / 2 + 6) : 0);
      const left = cx - colW / 2;
      const w = colW;
      const plate = this.add
        .rectangle(cx, cy, w, ROW_HEIGHT - 4, COLORS.panel, 1)
        .setStrokeStyle(1, COLORS.panelEdge, 1)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: true });
      const check = this.add
        .text(left + 16, cy, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.gearText })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      this.add.image(left + 44, cy, gearTexture(id)).setDisplaySize(24, 24).setDepth(DEPTH.ui + 2);
      this.add
        .text(left + 64, cy, gearName(id), { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.ui + 2);
      const count = this.add
        .text(left + w - 12, cy, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
        .setOrigin(1, 0.5)
        .setDepth(DEPTH.ui + 2);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.toggleType(id));
      this.typeRows.set(id, { plate, check, count });
    });
    y = top + rows * ROW_HEIGHT;

    y += 8;
    const cy = y + BUTTON_HEIGHT / 2;
    this.button(width / 2 - 110, cy, 40, () => this.setBulkMax(this.bulkMax - 1)).label.setText('−');
    this.button(width / 2 + 110, cy, 40, () => this.setBulkMax(this.bulkMax + 1)).label.setText('+');
    this.maxLabel = this.add
      .text(width / 2, cy, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);
    y += BUTTON_HEIGHT + 10;

    this.preview = this.add
      .text(width / 2, y, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text, align: 'center', lineSpacing: 4 })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);
    y += 46;
    this.bulkButton = this.button(width / 2, y + BUTTON_HEIGHT / 2, Math.min(240, w), () => this.pressBulk());
  }

  /** One base in or out of 일괄 분해. Public so a test can. */
  public toggleType(id: GearId): void {
    if (this.bulkTypes.has(id)) {
      this.bulkTypes.delete(id);
    } else {
      this.bulkTypes.add(id);
    }
    this.armed = null;
    this.refresh();
  }

  /** The most 속성 a sword may carry and still go. Public so a test can. */
  public setBulkMax(max: number): void {
    this.bulkMax = Phaser.Math.Clamp(Math.round(max), 0, MAX_LINES);
    this.armed = null;
    this.refresh();
  }

  /** First press asks, the second takes every match apart. Public so a test can. */
  public pressBulk(): void {
    const copy = t().forge;
    const going = gear.salvageable([...this.bulkTypes], this.bulkMax);
    if (going.length === 0) {
      this.say(copy.bulkNone);
      return;
    }
    if (this.armed !== 'bulk') {
      this.armed = 'bulk';
      this.refresh();
      return;
    }
    const done = gear.salvageMany([...this.bulkTypes], this.bulkMax);
    this.relayout({ tab: 'bulk', note: fill(copy.bulkDone, { count: done.count, what: ForgeScene.totalText(done.got) }) });
  }

  // --- 제작 ---

  private buildCraft(): void {
    const { width } = this.scale;
    const w = Math.min(width - MARGIN * 2, 460);
    const left = width / 2 - w / 2;
    let y = HEADER + 6;
    const rowHeight = ROW_HEIGHT + 8;
    ROSTER().forEach((id) => {
      const cy = y + rowHeight / 2;
      this.add
        .rectangle(width / 2, cy, w, rowHeight - 6, COLORS.panel, 1)
        .setStrokeStyle(1, COLORS.panelEdge, 1)
        .setDepth(DEPTH.ui + 1);
      this.add.image(left + 22, cy, gearTexture(id)).setDisplaySize(28, 28).setDepth(DEPTH.ui + 2);
      this.add
        .text(left + 44, cy - 9, gearName(id), { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.ui + 2);
      const cost = GEAR[id].craftOre;
      this.add
        .text(left + 44, cy + 10, cost === undefined ? t().forge.craftNo : fill(t().forge.craftCost, { cost }), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.ui + 2);
      if (cost !== undefined) {
        this.craftButtons.set(id, this.button(left + w - 56, cy, 96, () => this.pressCraft(id)));
      }
      y += rowHeight;
    });
  }

  /** Makes one bare sword of this base, when there is the 철광석. Public so a test can. */
  public pressCraft(id: GearId): void {
    const copy = t().forge;
    const cost = GEAR[id].craftOre;
    if (cost === undefined) {
      return;
    }
    if (ore.value < cost) {
      this.say(fill(copy.craftShort, { cost }));
      return;
    }
    const made = gear.craft(id);
    if (made) {
      this.say(fill(copy.crafted, { gear: gearName(id), cost }));
    }
    this.refresh();
  }

  // --- drawing ---

  private refresh(): void {
    const copy = t().forge;
    this.oreLine.setText(fill(copy.ore, { count: ore.value.toLocaleString('en-US') }));

    if (this.tab === 'single' && this.heading && this.lines && this.yieldLine) {
      const item = this.selected();
      this.heading.setText(item ? gearTitle(item) : t().inventory.empty);
      fitText(this.heading.setScale(1), this.scale.width / (this.scale.width < INVENTORY.sideBySideFrom ? 1 : 2) - 16, 0);
      this.lines.setText(item ? InventoryScene.describe(item) : '');
      const open = item !== undefined && canSalvage(item, gear.value.equipped);
      this.yieldLine.setText(
        !item ? '' : item.locked ? copy.lockedNote : !open ? copy.equippedNote : fill(copy.yields, { what: ForgeScene.yieldText(salvageFor(item)) }),
      );
      this.paint(this.salvageButton, this.armed === 'salvage' ? copy.salvageConfirm : copy.salvage, open, this.armed === 'salvage');
      this.paint(this.lockButton, item?.locked ? copy.unlock : copy.lock, item !== undefined, item?.locked === true);
    }

    if (this.tab === 'bulk' && this.preview) {
      for (const [id, row] of this.typeRows) {
        const on = this.bulkTypes.has(id);
        row.check.setText(on ? '☑' : '☐');
        row.plate.setStrokeStyle(on ? 2 : 1, on ? COLORS.accentFill : COLORS.panelEdge, 1);
        row.count.setText(fill(copy.bulkHeld, { count: gear.items.filter((held) => held.id === id).length }));
      }
      this.maxLabel?.setText(fill(copy.bulkMax, { max: this.bulkMax }));
      const going = gear.salvageable([...this.bulkTypes], this.bulkMax);
      this.preview.setText(
        going.length === 0
          ? copy.bulkNone
          : `${fill(copy.bulkCount, { count: going.length })}\n${fill(copy.bulkYield, { what: ForgeScene.totalText(totalSalvage(going)) })}`,
      );
      fitText(this.preview.setScale(1), this.scale.width - 16, 0);
      this.paint(
        this.bulkButton,
        this.armed === 'bulk' ? fill(copy.bulkConfirm, { count: going.length }) : copy.bulkGo,
        going.length > 0,
        this.armed === 'bulk',
      );
    }

    if (this.tab === 'craft') {
      for (const [id, button] of this.craftButtons) {
        this.paint(button, copy.craftGo, ore.value >= (GEAR[id].craftOre ?? Infinity), false);
      }
    }
  }

  private paint(button: Button | undefined, text: string, live: boolean, asking: boolean): void {
    if (!button) {
      return;
    }
    button.label.setText(text).setScale(1).setColor(asking ? COLORS.accent : live ? COLORS.text : COLORS.muted);
    fitText(button.label, button.plate.width - 8, 0);
    button.plate.setFillStyle(COLORS.panelActive, asking ? 0.55 : live ? 0.25 : 0);
    button.plate.setAlpha(live ? 1 : 0.4);
    button.label.setAlpha(live ? 1 : 0.4);
  }

  private button(x: number, y: number, w: number, onPress: () => void): Button {
    const plate = this.add
      .rectangle(x, y, w, BUTTON_HEIGHT, COLORS.panelActive, 0.25)
      .setStrokeStyle(1, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(x, y, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
    return { plate, label };
  }

  private say(text: string): void {
    this.noteLine.setText(text).setScale(1);
    fitText(this.noteLine, this.scale.width - 16, 0);
  }

  /** "철광석 3 · 변화의 구슬 1" */
  public static yieldText(got: SalvageYield): string {
    const copy = t().forge;
    return [fill(copy.yieldOre, { count: got.ore }), ...(got.orb ? [fill(copy.yieldOrb, { orb: orbName(got.orb), count: 1 })] : [])].join(' · ');
  }

  public static totalText(got: SalvageTotal): string {
    const copy = t().forge;
    return [
      fill(copy.yieldOre, { count: got.ore }),
      ...Object.entries(got.orbs).map(([id, count]) => fill(copy.yieldOrb, { orb: orbName(id as Parameters<typeof orbName>[0]), count: count ?? 0 })),
    ].join(' · ');
  }

  // --- keys and moving about ---

  private footerHint(): string {
    const copy = t().forge;
    if (prefersTouchControls()) {
      return copy.hintTouch;
    }
    return this.tab === 'single' ? copy.hintSingle : this.tab === 'bulk' ? copy.hintBulk : copy.hintCraft;
  }

  private onKey(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }
    switch (event.code) {
      case 'Escape':
        this.close();
        return;
      case 'Tab':
      case 'KeyE': {
        event.preventDefault?.();
        const tabs = this.tabs;
        if (tabs.length > 1) {
          this.openTab(tabs[(tabs.indexOf(this.tab) + 1) % tabs.length]!);
        }
        return;
      }
      case 'KeyQ': {
        const tabs = this.tabs;
        if (tabs.length > 1) {
          this.openTab(tabs[(tabs.indexOf(this.tab) + tabs.length - 1) % tabs.length]!);
        }
        return;
      }
      default:
        break;
    }

    if (this.tab === 'single') {
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
        ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
      };
      const move = moves[event.code];
      if (move) {
        this.menu?.move(move[0], move[1]);
      } else if (event.code === 'Space' || event.code === 'Enter' || event.code === 'Delete' || event.code === 'Backspace') {
        this.pressSalvage();
      } else if (event.code === 'KeyL') {
        this.pressLock();
      }
      return;
    }

    const digit = /^Digit(\d)$/.exec(event.code);
    const index = digit ? Number(digit[1]) - 1 : -1;
    if (this.tab === 'bulk') {
      const id = ROSTER()[index];
      if (id) {
        this.toggleType(id);
      } else if (event.code === 'ArrowLeft' || event.code === 'Minus') {
        this.setBulkMax(this.bulkMax - 1);
      } else if (event.code === 'ArrowRight' || event.code === 'Equal') {
        this.setBulkMax(this.bulkMax + 1);
      } else if (event.code === 'Enter' || event.code === 'Space') {
        this.pressBulk();
      }
      return;
    }

    const id = [...this.craftButtons.keys()][index];
    if (id) {
      this.pressCraft(id);
    }
  }

  /** Opens another tab. The screen is measured again for it. Public so a test can. */
  /** The tabs this screen has: 분해's two, or none on 제작 (0.141). */
  private get tabs(): readonly ForgeTab[] {
    return this.tab === 'craft' ? [] : TABS.filter((tab) => tab !== 'craft');
  }

  public openTab(tab: ForgeTab): void {
    if (tab !== this.tab) {
      this.relayout({ tab });
    }
  }

  private relayout(over: Partial<ForgeSceneData>): void {
    this.scene.restart({
      onClose: this.payload.onClose,
      bulk: { types: [...this.bulkTypes], maxLines: this.bulkMax },
      ...over,
    } satisfies ForgeSceneData);
  }

  /** Back to the 인벤토리, on the weapon the cursor was on. */
  private close(): void {
    this.scene.start(SCENES.inventory, { onClose: this.payload.onClose, tab: 'gear', focus: this.selected()?.uid });
  }
}
