import Phaser from 'phaser';

import {
  ALL_BONES,
  combineTargets,
  ALL_ORBS,
  AUDIO,
  COLORS,
  COMBINE_FX,
  DEPTH,
  GEAR_COMBINE,
  GEAR_DROP,
  GEAR,
  INVENTORY,
  ORBS,
  attackForTier,
  PAUSE_BUTTON,
  SCENES,
  SCRIM,
  TEXT,
  TEXTURES,
  gearTexture,
  type AffixLine,
  type OrbId,
} from '@/config';
import {
  affixGearDetail,
  affixName,
  boneDetail,
  boneName,
  fill,
  gearImplicitText,
  gearName,
  gearTitle,
  orbDetail,
  orbName,
  orbShort,
  t,
} from '@/i18n';
import { bones } from '@/systems/Bones';
import {
  dropTierFor,
  gear,
  orbApplied,
  type CombineOutcome,
  type GearItem,
  type OrbOutcome,
} from '@/systems/Gear';
import { ItemGrid, type GridItem } from '@/systems/ItemGrid';
import { fitText } from '@/systems/Layout';
import { ore } from '@/systems/Ore';
import { orbs } from '@/systems/Orbs';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { effectVolume } from '@/systems/Sfx';
import { saveGame } from '@/systems/SaveGame';

export type InventoryTab = 'gear' | 'consumables';

/** The tabs, in the order they are drawn and cycled. */
const TABS: readonly InventoryTab[] = ['gear', 'consumables'];

export interface InventorySceneData {
  readonly onClose: () => void;
  /** Which tab to open on. 장비 when left out. */
  readonly tab?: InventoryTab;
  /**
   * The item the cursor should land on. A 구슬 relays the screen — the
   * read-out is a different height once the lines change — and without this
   * the cursor would jump to the first cell on every single reroll.
   */
  readonly focus?: string;
  /**
   * Or the place in the list the cursor was at, when what was under it is
   * gone (sold, or spent on a 합성 that failed): it stays there rather than
   * jumping back to the first cell.
   */
  readonly focusIndex?: number;
  /** What the last 구슬 did, shown until the cursor moves off the weapon. */
  readonly note?: string;
}

/** The same weapon: the same base with the same lines, wherever the copy came from. */
const sameGear = (a: GearItem | null, b: GearItem | null): boolean =>
  !!a && !!b && a.id === b.id &&
  JSON.stringify([a.prefixes, a.suffixes]) === JSON.stringify([b.prefixes, b.suffixes]);

const MARGIN = 16;
const TITLE_BLOCK = 54;
/** A 구슬 button's icon and the gap after it, before the word. */
const ORB_ICON_ROOM = 20;
const TAB_HEIGHT = 30;
const TAB_WIDTH = 96;
const FOOTER = 34;
/** Space between the grid and the details beside or under it. */
const GUTTER = 24;
const BUTTON_HEIGHT = 30;
/** An 속성 slot with nothing in it. */
const EMPTY_SLOT = '─'.repeat(18);
/** The base's own line (attack and 고정 속성), a heading and the slots for each kind. */
const READ_OUT_LINES = 1 + 1 + GEAR_DROP.maxPrefixes + 1 + GEAR_DROP.maxSuffixes;
/** The name over the read-out, and the air under it. */
const HEADING_BLOCK = 48;
/** The read-out's style: measured once, so the layout budgets what it draws. */
const LINES_STYLE = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: TEXT.size.small,
  color: COLORS.muted,
  // Left, so the 접두어 / 접미어 column lines up and the eye can run down it;
  // the block as a whole is still centred on its column.
  align: 'left',
  lineSpacing: 5,
} as const;

/**
 * 인벤토리 — everything the survivor keeps between runs, a tab per kind.
 *
 * Each tab is the same grid: six across, twelve down, an icon per item in a
 * border the colour of its rarity. The arrow keys, the mouse and a tap all
 * move the cursor; what is under it is read out beside the grid, with what
 * can be done to it.
 *
 *   장비   — the weapons. Put one on, throw one away, spend a 구슬 on it.
 *            A weapon reads the way an item reads in Path of Exile: its own
 *            line, then its 접두어 and 접미어, each named and spelled out.
 *   소모품 — the 구슬 and 뼈다귀, one cell per kind with how many are held.
 *            What each does, and where it is spent.
 */
export class InventoryScene extends Phaser.Scene {
  public static readonly KEY = SCENES.inventory;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;

  private payload!: InventorySceneData;
  public tab: InventoryTab = 'gear';
  /** The grid of the open tab. Named for the list it replaced; public for tests. */
  public menu!: ItemGrid;
  /** The tab buttons, by tab. Public so a test can press one. */
  public tabs = new Map<InventoryTab, Phaser.GameObjects.Rectangle>();
  public wearing!: Phaser.GameObjects.Text;
  /** The name of whatever is under the cursor. Public for tests. */
  public heading!: Phaser.GameObjects.Text;
  /** Under the name: a weapon's 망고 상태. Public for tests. */
  public stateLine?: Phaser.GameObjects.Text;
  /** The lines of whatever is under the cursor. Public for tests. */
  public lines!: Phaser.GameObjects.Text;
  /** 착용, 버리기, and the plates behind them. Public so a test can press them. */
  public equip?: Phaser.GameObjects.Text;
  private equipPlate?: Phaser.GameObjects.Rectangle;
  /** 분해 · 제작, top-right (0.91). Public for tests. */
  public forgeButton?: Phaser.GameObjects.Rectangle;
  /** 합성, and the plate behind it. Public so a test can press it. */
  public combineButton?: Phaser.GameObjects.Text;
  private combinePlate?: Phaser.GameObjects.Rectangle;
  /**
   * The swords picked for a 합성, in the order they were picked, or null
   * when no 합성 is being put together. Public so a test can read it.
   */
  public combining: string[] | null = null;
  /** True while the light is playing out; nothing else is taken meanwhile. */
  public busy = false;
  /** The gold frames over the picked cells, one per sword a 합성 takes. */
  private combineMarks: Phaser.GameObjects.Rectangle[] = [];
  /** Why the last press of 합성 did nothing, until the cursor moves. */
  public combineWhy: string | null = null;
  /** Where the light gathers: the middle of the grid. */
  private gridCentre = { x: 0, y: 0 };
  /** The 구슬 buttons, by id. Public so a test can press one. */
  public orbButtons = new Map<OrbId, Phaser.GameObjects.Text>();
  /** How wide each 구슬 button is, for fitting its word (buildOrbs). */
  private orbSlot = 0;
  private orbPlates = new Map<OrbId, Phaser.GameObjects.Rectangle>();
  private orbIcons = new Map<OrbId, Phaser.GameObjects.Image>();
  /** What the armed 구슬 would do, or what the last one did. Public for tests. */
  public orbHint?: Phaser.GameObjects.Text;
  /** "1 / 2" under the grid, when a tab holds more than one grid's worth. */
  public pageLabel!: Phaser.GameObjects.Text;
  /**
   * What has been pressed once and is waiting to be pressed again: 'discard',
   * a 구슬's id, or nothing. Everything here that cannot be undone asks
   * first — a weapon six 속성 deep is an hour of 우두머리 kills, and a
   * 각성의 구슬 is a thousand ordinary ones.
   */
  public armed: 'discard' | null = null;
  /** Where the bottom of the details pane landed. Public for layout tests. */
  public detailBottom = 0;
  private rowGap = 8;

  public constructor() {
    super(InventoryScene.KEY);
  }

  public init(data: InventorySceneData): void {
    this.payload = data;
    this.tab = data.tab ?? 'gear';
    // The scene instance outlives a launch, and an armed button left over
    // from last time would throw the first weapon away on one press.
    this.armed = null;
    this.tabs = new Map();
    this.orbButtons = new Map();
    this.orbPlates = new Map();
    this.orbIcons = new Map();
    this.equip = undefined;
    this.equipPlate = undefined;
    this.combineButton = undefined;
    this.combinePlate = undefined;
    this.combining = null;
    this.busy = false;
    this.combineWhy = null;
    this.combineMarks = [];
    this.orbHint = undefined;
    this.stateLine = undefined;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    this.forgeButton = this.addForgeButton();
    const { width, height } = this.scale;
    const copy = t().inventory;

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);

    this.add
      .text(width / 2, MARGIN + 14, copy.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    // The details go beside the grid when there is the width, and under it
    // on a phone held upright — where they are set tighter, because the
    // grid's twelve rows have to share the height with them.
    const stacked = width < INVENTORY.sideBySideFrom;
    const linesStyle = stacked
      ? { ...LINES_STYLE, fontSize: TEXT.size.hint, lineSpacing: 1 }
      : LINES_STYLE;
    const headingBlock = stacked ? 28 : HEADING_BLOCK;
    const gutter = stacked ? 6 : GUTTER;
    // Between the read-out and the buttons, and between the two rows of them.
    this.rowGap = stacked ? 4 : 8;

    // The read-out is always the same number of lines on the 장비 tab, so its
    // height is measured once off a stand-in rather than guessed at.
    const probe = this.add.text(0, 0, Array(READ_OUT_LINES).fill('가').join('\n'), linesStyle);
    const linesHeight = Math.ceil(probe.height);
    probe.destroy();
    // What the details pane costs on the 장비 tab: the name, the read-out,
    // two rows of buttons and the line under them. Nothing in it scrolls.
    const detailHeight = headingBlock + linesHeight + (BUTTON_HEIGHT + this.rowGap) * 2 + 30;

    // The grid is the fixed thing: twelve rows, however small a cell has to
    // be to get them on.
    const gridTop = MARGIN + TITLE_BLOCK + TAB_HEIGHT + 8;
    const rowsSpan = (cell: number) => INVENTORY.rows * cell + (INVENTORY.rows - 1) * INVENTORY.gap;
    const colsSpan = (cell: number) => INVENTORY.cols * cell + (INVENTORY.cols - 1) * INVENTORY.gap;
    const fitCell = (roomH: number, roomW: number) =>
      Math.floor(
        Phaser.Math.Clamp(
          Math.min(
            (roomH - (INVENTORY.rows - 1) * INVENTORY.gap) / INVENTORY.rows,
            (roomW - (INVENTORY.cols - 1) * INVENTORY.gap) / INVENTORY.cols,
          ),
          INVENTORY.cellMin,
          INVENTORY.cellMax,
        ),
      );

    const cell = stacked
      ? fitCell(height - gridTop - 16 - gutter - detailHeight - FOOTER, width - MARGIN * 2)
      : fitCell(height - gridTop - 20 - FOOTER, (width - MARGIN * 2 - GUTTER) * 0.5);
    const gridWidth = colsSpan(cell);
    const gridLeft = stacked ? Math.round((width - gridWidth) / 2) : MARGIN;

    this.buildTabs(gridLeft, MARGIN + TITLE_BLOCK + TAB_HEIGHT / 2);

    this.menu = new ItemGrid(this, this.itemsFor(this.tab), {
      x: gridLeft,
      y: gridTop,
      cell,
      depth: DEPTH.ui + 1,
      onMove: () => this.showDetails(),
    });
    this.gridCentre = { x: gridLeft + gridWidth / 2, y: gridTop + rowsSpan(cell) / 2 };
    this.combineMarks = Array.from({ length: GEAR_COMBINE.count }, () =>
      this.add
        .rectangle(0, 0, cell + 2, cell + 2, COMBINE_FX.success, 0.18)
        .setStrokeStyle(2, COMBINE_FX.success, 1)
        .setDepth(DEPTH.ui + 3)
        .setVisible(false),
    );

    this.pageLabel = this.add
      .text(gridLeft + gridWidth / 2, gridTop + rowsSpan(cell) + 8, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    // The details pane: beside the grid, or under it.
    const paneLeft = stacked ? MARGIN : gridLeft + gridWidth + GUTTER;
    const paneWidth = stacked ? width - MARGIN * 2 : width - paneLeft - MARGIN;
    const paneX = paneLeft + paneWidth / 2;
    let y = stacked ? gridTop + rowsSpan(cell) + 16 + gutter : gridTop;

    // The weapon in hand, under the title, on every tab.
    this.wearing = this.add
      .text(width / 2, MARGIN + 41, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.gearText,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.heading = this.add
      .text(paneX, y, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.label,
        color: COLORS.gearText,
        align: 'center',
        wordWrap: { width: paneWidth },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);
    // 망고 상태, in the air under the name rather than one more line of the
    // read-out, which is budgeted to the line for the screen's height.
    this.stateLine = this.add
      .text(paneX, y + 26, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: '#ffd76a',
        align: 'center',
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);
    y += headingBlock;

    this.lines = this.add
      .text(paneX, y, '', { ...linesStyle, wordWrap: { width: paneWidth } })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);

    if (this.tab === 'gear') {
      y += linesHeight + this.rowGap;
      y = this.buildActions(paneX, y + BUTTON_HEIGHT / 2, paneWidth);
      y = this.buildOrbs(paneX, y + this.rowGap + BUTTON_HEIGHT / 2, paneWidth);
    }

    fitText(
      this.add
        .text(width / 2, height - FOOTER / 2, this.footerHint(), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width,
    );

    this.armKeys();
    this.refreshWearing();
    // Back onto whatever the last 구슬 was spent on, rather than the first
    // cell. Last, because it repaints the buttons built just above.
    if (this.payload.focus) {
      this.menu.focus(this.payload.focus);
    } else if (this.payload.focusIndex !== undefined) {
      this.menu.focusAt(this.payload.focusIndex);
    }
    this.showDetails();
    this.detailBottom = Math.max(y, this.lines.y + this.lines.height);
  }

  // --- tabs ---

  private buildTabs(left: number, y: number): void {
    const copy = t().inventory;
    TABS.forEach((tab, index) => {
      const x = left + TAB_WIDTH / 2 + index * (TAB_WIDTH + 6);
      const active = tab === this.tab;
      const plate = this.add
        .rectangle(x, y, TAB_WIDTH, TAB_HEIGHT, active ? COLORS.panelActive : COLORS.panel, 1)
        .setStrokeStyle(2, active ? COLORS.accentFill : COLORS.panelEdge, 1)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, y, tab === 'gear' ? copy.tabGear : copy.tabConsumables, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.body,
          color: active ? COLORS.text : COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.openTab(tab));
      this.tabs.set(tab, plate);
    });
  }

  /** Opens another tab. The screen is measured again for it. */
  public openTab(tab: InventoryTab): void {
    if (tab === this.tab) {
      return;
    }
    this.scene.restart({ onClose: this.payload.onClose, tab });
  }

  private cycleTab(by: number): void {
    const index = TABS.indexOf(this.tab);
    const next = TABS[(index + by + TABS.length) % TABS.length];
    if (next) {
      this.openTab(next);
    }
  }

  /** What one tab holds, in the order it is laid out. */
  private itemsFor(tab: InventoryTab): GridItem[] {
    if (tab === 'gear') {
      return gear.items.map((item) => ({
        id: item.uid,
        icon: gearTexture(item.id),
        tier: dropTierFor(item),
        marked: () => gear.value.equipped === item.uid,
        badge: () => (item.mango ? TEXTURES.mango : null),
        label: () => gearTitle(item),
        onSelect: () => (this.combining ? this.togglePick(item.uid) : this.wear(item.uid)),
      }));
    }

    // One cell per kind held: 철광석, then 구슬, then 뼈다귀.
    return [
      ...(ore.value > 0
        ? [{ id: 'ore', icon: TEXTURES.ore, tier: 'normal' as const, count: () => ore.value, label: () => t().forge.oreName }]
        : []),
      ...ALL_ORBS.filter((orb) => orbs.count(orb.id) > 0).map((orb) => ({
        id: `orb:${orb.id}`,
        icon: orb.texture,
        tier: orb.tier,
        count: () => orbs.count(orb.id),
        label: () => orbName(orb.id),
      })),
      ...ALL_BONES.filter((bone) => bones.count(bone.id) > 0).map((bone) => ({
        id: `bone:${bone.id}`,
        icon: bone.texture,
        tier: bone.tier,
        count: () => bones.count(bone.id),
        label: () => boneName(bone.id),
      })),
    ];
  }

  // --- keys ---

  private armKeys(): void {
    const keyboard = this.input.keyboard;
    keyboard?.on('keydown', this.onKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard?.off('keydown', this.onKey, this));
  }

  private onKey(event: KeyboardEvent): void {
    // While the light plays out, the screen is watched, not driven.
    if (this.busy) {
      return;
    }
    // Esc backs out of a 합성 being put together before it leaves the screen.
    if (event.code === 'Escape' && this.combining) {
      this.cancelCombine();
      return;
    }

    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.menu.move(-1, 0);
        return;
      case 'ArrowRight':
      case 'KeyD':
        this.menu.move(1, 0);
        return;
      case 'ArrowUp':
      case 'KeyW':
        this.menu.move(0, -1);
        return;
      case 'ArrowDown':
      case 'KeyS':
        this.menu.move(0, 1);
        return;
      case 'Tab':
      case 'KeyE':
        event.preventDefault?.();
        this.cycleTab(1);
        return;
      case 'KeyQ':
        this.cycleTab(-1);
        return;
      case 'Space':
      case 'Enter':
      case 'NumpadEnter':
        if (!event.repeat) {
          this.menu.activate();
        }
        return;
      case 'KeyF':
        if (!event.repeat) {
          this.openForge();
        }
        return;
      case 'KeyC':
        if (!event.repeat && this.tab === 'gear') {
          this.pressCombine();
        }
        return;
      case 'Escape':
        this.close();
        return;
      default:
        break;
    }

    if (event.repeat || this.tab !== 'gear') {
      return;
    }
    // One key per 구슬, in the order they are drawn, however many there are.
    const orb = ALL_ORBS.find((_, i) => event.code === `Digit${i + 1}`);
    if (orb) {
      this.pressOrb(orb.id);
    }
  }

  private footerHint(): string {
    const copy = t().inventory;
    if (prefersTouchControls()) {
      return copy.hintTouch;
    }
    return this.tab === 'gear'
      ? fill(copy.hintGear, { keys: `1~${ALL_ORBS.length}` })
      : copy.hintConsumables;
  }

  // --- the details pane ---

  /** Reads out whatever is under the cursor, and what can be done to it. */
  private showDetails(): void {
    const pages = this.menu.pages;
    this.pageLabel.setText(pages > 1 ? `${this.menu.page + 1} / ${pages}` : '');

    // A question asked about one thing does not carry over to the next.
    this.armed = null;
    this.combineWhy = null;

    if (this.tab === 'gear') {
      const item = this.selected();
      this.heading.setColor(COLORS.gearText);
      this.heading.setText(item ? gearTitle(item) : t().inventory.empty);
      this.stateLine?.setText(item?.mango ? t().gear.mangoState : '');
      if (this.stateLine) {
        fitText(this.stateLine.setScale(1), this.lines.style.wordWrapWidth ?? this.scale.width / 2, 0);
      }
      this.lines.setText(item ? InventoryScene.describe(item) : '');
      this.refreshEquip();
      this.refreshOrbs();
      this.refreshCombine();
      return;
    }

    const id = this.menu.selectedId;
    const copy = t().inventory;
    this.heading.setColor(COLORS.text);
    this.stateLine?.setText('');
    if (!id) {
      this.heading.setText(copy.empty);
      this.lines.setText('');
      return;
    }

    if (id === 'ore') {
      this.heading.setText(t().forge.oreName);
      this.lines.setText([fill(copy.held, { count: ore.value }), '', t().forge.oreUse].join('\n'));
      return;
    }

    const [kind, key] = id.split(':') as ['orb' | 'bone', string];
    if (kind === 'orb') {
      const orb = key as OrbId;
      this.heading.setText(orbName(orb));
      this.lines.setText(
        [fill(copy.held, { count: orbs.count(orb) }), '', orbDetail(orb), '', copy.orbUse].join('\n'),
      );
      return;
    }

    const bone = key as Parameters<typeof boneName>[0];
    this.heading.setText(boneName(bone));
    this.lines.setText(
      [fill(copy.held, { count: bones.count(bone) }), '', boneDetail(bone), '', copy.boneUse].join('\n'),
    );
  }

  private refreshWearing(): void {
    const copy = t().gear;
    const parts = [`${copy.wearing}  ${gearTitle(gear.equipped)}`];
    // A saved run keeps the weapon it went out with (SavedRun.gear): when
    // that is not the one in hand, say so, or a swap looks as if it did nothing.
    const savedGear = saveGame.read()?.gear;
    if (savedGear && !sameGear(savedGear, gear.equipped)) {
      parts.push(fill(copy.savedRunGear, { name: gearTitle(savedGear) }));
    }
    this.wearing.setText(parts.join('   ·   ')).setScale(1);
    fitText(this.wearing, this.scale.width, 8);
  }

  // --- 장비: put on, throw away, spend a 구슬 ---

  /** The weapon under the cursor, if the 장비 tab is open and it is on one. */
  private selected(): GearItem | undefined {
    if (this.tab !== 'gear') {
      return undefined;
    }
    return gear.items.find((held) => held.uid === this.menu.selectedId);
  }

  /** 착용 and 합성, side by side (분해 · 제작 is top-right since 0.91). Returns the bottom of the row. */
  private buildActions(x: number, y: number, paneWidth: number): number {
    const width = Math.min(150, (paneWidth - 12) / 2);
    const make = (cx: number, onPress: () => void) => {
      const plate = this.add
        .rectangle(cx, y, width, BUTTON_HEIGHT, COLORS.panelActive, 0)
        .setStrokeStyle(1, COLORS.panelEdge, 1)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(cx, y, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.body,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
      return { plate, label };
    };

    const equip = make(x - width / 2 - 6, () => {
      const item = this.selected();
      if (item) {
        this.wear(item.uid);
      }
    });
    this.equip = equip.label;
    this.equipPlate = equip.plate;

    const combine = make(x + width / 2 + 6, () => this.pressCombine());
    this.combineButton = combine.label;
    this.combinePlate = combine.plate;

    return y + BUTTON_HEIGHT / 2;
  }

  /**
   * The 구슬 row: one button per kind, each saying how many are held. A
   * press opens 구슬 사용 on it (OrbScene). Greyed out when the drawer is
   * empty of that kind, or when it would do nothing to this weapon.
   * Returns the bottom of the line under it.
   */
  private buildOrbs(x: number, y: number, paneWidth: number): number {
    const slot = Math.min(110, Math.floor(paneWidth / ALL_ORBS.length));
    this.orbSlot = slot;
    const left = x - (slot * ALL_ORBS.length) / 2 + slot / 2;

    ALL_ORBS.forEach((orb, index) => {
      const cx = Math.round(left + index * slot);
      const plate = this.add
        .rectangle(cx, y, slot - 6, BUTTON_HEIGHT, COLORS.panelActive, 0)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: true });
      // Its own sprite beside the word, so the row reads as different things
      // rather than a row of counts. The two are centred as a pair once the
      // word is known (refreshOrbs).
      const icon = this.add
        .image(cx, y, orb.texture)
        .setDisplaySize(16, 16)
        .setDepth(DEPTH.ui + 2);
      const label = this.add
        .text(cx, y, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH.ui + 2);

      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.pressOrb(orb.id));
      this.orbIcons.set(orb.id, icon);
      this.orbPlates.set(orb.id, plate);
      this.orbButtons.set(orb.id, label);
    });

    this.orbHint = this.add
      .text(x, y + BUTTON_HEIGHT / 2 + 4, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: paneWidth },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);

    return y + BUTTON_HEIGHT / 2 + 30;
  }

  /** True when spending this 구슬 on the weapon under the cursor would do something. */
  private canUse(id: OrbId): boolean {
    const item = this.selected();
    const spec = ORBS[id];
    if (!item || !spec || orbs.count(id) <= 0) {
      return false;
    }

    return orbApplied(item, spec) !== null;
  }

  /**
   * Opens 구슬 사용 over the 인벤토리, on the weapon under the cursor with this
   * 구슬 picked: the popup spells out what it does, spends it on 사용 and
   * stays for the next. When it closes the 인벤토리 is drawn again on what is
   * left — the same weapon, or the same place in the list if it is gone.
   */
  public pressOrb(id: OrbId): void {
    if (this.combining || this.busy) {
      return;
    }
    const item = this.selected();
    if (!item || !ORBS[id]) {
      return;
    }

    const at = this.menu.selected;
    this.armed = null;
    this.scene.pause();
    this.scene.launch(SCENES.orb, {
      uid: item.uid,
      orb: id,
      onClose: (result: { readonly uid: string | null; readonly note?: string }) => {
        this.scene.resume();
        this.scene.restart({
          onClose: this.payload.onClose,
          tab: 'gear',
          focus: result.uid ?? undefined,
          focusIndex: result.uid ? undefined : at,
          note: result.note,
        });
      },
    });
    this.scene.bringToTop(SCENES.orb);
  }

  /**
   * What a 구슬 just did, in one line. A reroll that came up short and a
   * weapon that did not survive a 폭발의 구슬 are both things to be told
   * rather than left to work out from a read-out that changed.
   */
  public static noteFor(id: OrbId, outcome: OrbOutcome): string {
    const copy = t().gear;
    const orb = orbName(id);

    if (outcome.kind === 'destroyed') {
      return fill(copy.orbDestroyed, { orb });
    }

    if (outcome.kind === 'ward') {
      return fill(copy.orbWarded, { orb });
    }

    if (outcome.kind === 'saved') {
      return fill(copy.orbSaved, { orb });
    }

    if ((outcome.kind === 'upgrade' || outcome.kind === 'swap') && outcome.line && outcome.from) {
      const upgraded = fill(copy.orbUpgraded, {
        orb,
        from: `${affixName(outcome.from.id)} ${fill(copy.tier, { tier: outcome.from.tier })}`,
        to: `${affixName(outcome.line.id)} ${fill(copy.tier, { tier: outcome.line.tier })}`,
      });
      return outcome.wardSpent ? `${upgraded}${copy.mangoSpent}` : upgraded;
    }

    if (outcome.kind === 'add' && outcome.line) {
      return fill(copy.orbAdded, {
        orb,
        affix: `${affixName(outcome.line.id)} ${fill(copy.tier, { tier: outcome.line.tier })}`,
      });
    }

    const lines = (outcome.item?.prefixes.length ?? 0) + (outcome.item?.suffixes.length ?? 0);
    return fill(copy.orbRerolled, { orb, count: lines });
  }

  private refreshOrbs(): void {
    const copy = t().gear;
    ALL_ORBS.forEach((orb) => {
      const label = this.orbButtons.get(orb.id);
      const plate = this.orbPlates.get(orb.id);
      if (!label || !plate) {
        return;
      }

      const held = orbs.count(orb.id);
      const live = this.canUse(orb.id);

      label.setText(fill(copy.orbCount, { orb: orbShort(orb.id), count: held })).setScale(1);
      // Icon, a gap, the word: shrunk to the slot (an upright phone's is
      // narrow) and centred on it, so the icon never sits on the word.
      fitText(label, this.orbSlot - 6 - ORB_ICON_ROOM, 2);
      const pairLeft = plate.x - (ORB_ICON_ROOM + label.displayWidth) / 2;
      this.orbIcons.get(orb.id)?.setX(pairLeft + 8);
      label.setX(pairLeft + ORB_ICON_ROOM);
      label.setColor(COLORS.muted);
      label.setAlpha(live ? 1 : 0.35);
      plate.setFillStyle(COLORS.panelActive, 0);
      plate.setAlpha(live ? 1 : 0.35);
      this.orbIcons.get(orb.id)?.setAlpha(live ? 1 : 0.3);
    });

    if (!this.orbHint) {
      return;
    }

    // What the last one did, until the cursor moves off the weapon.
    this.orbHint.setColor(this.payload.note ? COLORS.gearText : COLORS.muted);
    this.orbHint.setText(this.payload.note ?? '');
  }

  /**
   * 분해 · 제작, in the top-right corner — the 인벤토리 is the only way in
   * (0.91, the user's ask: the 분해 button among the weapon's own buttons
   * read as if 제작 lived inside 분해). Mirrors the back button opposite.
   */
  private addForgeButton(): Phaser.GameObjects.Rectangle {
    const { size, margin } = PAUSE_BUTTON;
    const y = margin + size / 2;
    const label = this.add
      .text(0, y, t().forge.title, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 21);
    const width = Math.max(size, Math.ceil(label.width) + 24);
    const x = this.scale.width - margin - width / 2;
    label.setX(x);
    const plate = this.add
      .rectangle(x, y, width, size, COLORS.panel, 0.85)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 20)
      .setInteractive({ useHandCursor: true });
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.openForge());
    return plate;
  }

  /** Opens 분해 · 제작, on the weapon under the cursor when there is one. Public so a test can. */
  public openForge(): void {
    if (this.combining || this.busy) {
      return;
    }
    this.scene.start(SCENES.forge, { onClose: this.payload.onClose, focus: this.selected()?.uid });
  }

  private refreshEquip(): void {
    if (!this.equip || !this.equipPlate) {
      return;
    }

    const item = this.selected();
    const wearing = item !== undefined && gear.value.equipped === item.uid;
    const live = item !== undefined && !wearing;
    this.equip.setText(wearing ? t().gear.equipped : t().gear.equip);
    this.equip.setColor(wearing ? COLORS.gearText : COLORS.muted);
    this.equip.setAlpha(live || wearing ? 1 : 0.35);
    this.equipPlate.setAlpha(live ? 1 : 0.35);
  }

  /**
   * One slot, filled or empty: "1티어  치명  치명타 확률 +50%", or a rule
   * where nothing has been rolled yet. The empty ones are drawn on purpose —
   * what a weapon could still take is as much use to read as what it has.
   */
  private static slots(lines: readonly AffixLine[], count: number): string[] {
    const copy = t().gear;
    const rows = lines
      .slice(0, count)
      .map(
        (line) =>
          `${fill(copy.tier, { tier: line.tier })}  ${affixName(line.id)}   ` +
          affixGearDetail(line.id, line.tier),
      );

    while (rows.length < count) {
      rows.push(EMPTY_SLOT);
    }

    return rows;
  }

  /**
   * What one weapon is worth: what the base gives — its attack power and its
   * 고정 속성, on one line — then every 접두어 slot, then every 접미어 slot.
   * Each filled slot says which rung it rolled — tier 1 is the best there
   * is — so two weapons with the same 속성 on them can be told apart.
   *
   * One line for the base on purpose: on a short phone the pane has no room
   * for another, and the buttons under it would run off the screen.
   */
  public static describe(item: GearItem): string {
    const copy = t().gear;
    // The base's own attack, as its tier gives it: a 고정 속성 that adds
    // attack (나르실) is read on its own line after, not folded in (0.92).
    const head = fill(copy.attack, { attack: attackForTier(GEAR[item.id].tier) });
    const implicit = gearImplicitText(item.id);

    return [
      implicit ? `${head} · ${fill(copy.implicit, { text: implicit })}` : head,
      copy.prefix,
      ...InventoryScene.slots(item.prefixes, GEAR_DROP.maxPrefixes),
      copy.suffix,
      ...InventoryScene.slots(item.suffixes, GEAR_DROP.maxSuffixes),
    ].join('\n');
  }

  /**
   * Puts a weapon on. Allowed while a run is saved too: that run carries the
   * weapon it went out with in the save (SavedRun.gear), so this changes only
   * the runs started from here on.
   */
  private wear(uid: string): void {
    if (this.combining || this.busy) {
      return;
    }

    gear.equip(uid);
    this.refreshWearing();
    this.menu.refresh();
    // What is now in hand cannot be thrown away, and what was may be.
    this.armed = null;
    this.refreshEquip();
    this.refreshOrbs();
  }

  // --- 합성: three of the same sword for a chance at the one above ---

  /** The swords that could go into a 합성 with this one: the same kind, not in hand. */
  private combinable(id: GearItem['id']): GearItem[] {
    return gear.items.filter((held) => held.id === id && held.uid !== gear.value.equipped);
  }

  /** Why a 합성 cannot start from this sword, or null when it can. */
  private combineBlock(item: GearItem | undefined): string | null {
    const copy = t().gear;
    if (!item) {
      return '';
    }
    if (item.uid === gear.value.equipped) {
      return copy.combineEquipped;
    }
    if (combineTargets(item.id).length === 0) {
      return copy.combineTop;
    }
    if (this.combinable(item.id).length < GEAR_COMBINE.count) {
      return fill(copy.combineShort, { count: GEAR_COMBINE.count });
    }
    return null;
  }

  /**
   * One button, three jobs: starts a 합성 from the sword under the cursor,
   * adds or takes back the sword under the cursor while one is being put
   * together, and — once enough are picked — runs it.
   */
  public pressCombine(): void {
    if (this.busy || this.tab !== 'gear') {
      return;
    }

    const item = this.selected();
    if (!this.combining) {
      const block = this.combineBlock(item);
      if (block !== null) {
        this.combineWhy = block || null;
        this.refreshCombine();
        return;
      }
      if (!item) {
        return;
      }
      this.combining = [item.uid];
      this.armed = null;
      this.showDetails();
      return;
    }

    // Once enough are picked the button runs it; taking one back out is Space
    // on its cell.
    if (this.combining.length >= GEAR_COMBINE.count) {
      this.runCombine();
      return;
    }
    if (item) {
      this.togglePick(item.uid);
    }
  }

  /** Adds a sword to the 합성 being put together, or takes it back out. */
  public togglePick(uid: string): void {
    if (!this.combining || this.busy) {
      return;
    }

    const first = gear.items.find((held) => held.uid === this.combining?.[0]);
    const item = gear.items.find((held) => held.uid === uid);
    if (!item) {
      return;
    }

    if (this.combining.includes(uid)) {
      this.combining = this.combining.filter((picked) => picked !== uid);
      if (this.combining.length === 0) {
        this.combining = null;
      }
    } else if (
      first &&
      item.id === first.id &&
      uid !== gear.value.equipped &&
      this.combining.length < GEAR_COMBINE.count
    ) {
      this.combining = [...this.combining, uid];
    }
    this.showDetails();
  }

  /** Puts the 합성 back down, nothing spent. */
  public cancelCombine(): void {
    if (this.busy) {
      return;
    }
    this.combining = null;
    this.showDetails();
  }

  /** The button's words, the frames over the picked cells, and the line under the 구슬. */
  private refreshCombine(): void {
    const copy = t().gear;
    const picked = this.combining ?? [];
    const first = gear.items.find((held) => held.uid === picked[0]);

    // Frames over the picked swords on this page; the rest of the page dims
    // to what could still join them.
    const perPage = INVENTORY.cols * INVENTORY.rows;
    const start = this.menu.page * perPage;
    let mark = 0;
    this.combineMarks.forEach((frame) => frame.setVisible(false));
    this.menu.cells.forEach((view, slot) => {
      const uid = this.menu.items[start + slot]?.id;
      const held = uid ? gear.items.find((item) => item.uid === uid) : undefined;
      const fits =
        !this.combining ||
        !held ||
        (first !== undefined && held.id === first.id && held.uid !== gear.value.equipped);
      view.plate.setAlpha(fits ? 1 : 0.3);
      view.icon.setAlpha(fits ? 1 : 0.3);
      if (uid && picked.includes(uid)) {
        this.combineMarks[mark++]?.setPosition(view.plate.x, view.plate.y).setVisible(true);
      }
    });

    if (!this.combineButton || !this.combinePlate) {
      return;
    }

    const ready = picked.length >= GEAR_COMBINE.count;
    const block = this.combining ? null : this.combineBlock(this.selected());
    const live = this.combining !== null || block === null;
    this.combineButton.setText(
      !this.combining
        ? copy.combine
        : ready
          ? copy.combineGo
          : fill(copy.combinePick, { n: picked.length, count: GEAR_COMBINE.count }),
    );
    this.combineButton.setColor(this.combining ? COLORS.accent : COLORS.muted);
    this.combineButton.setAlpha(live ? 1 : 0.35);
    this.combinePlate.setFillStyle(COLORS.panelActive, this.combining ? 0.55 : 0);
    this.combinePlate.setAlpha(live ? 1 : 0.35);

    if (!this.orbHint) {
      return;
    }
    if (this.combining && first) {
      const above = combineTargets(first.id)
        .map((spec) => gearName(spec.id))
        .join(' / ');
      this.orbHint.setColor(COLORS.gearText);
      this.orbHint.setText(
        ready
          ? fill(copy.combineReady, {
              chance: `${Math.round(GEAR_COMBINE.successChance * 100)}%`,
              target: above,
              count: GEAR_COMBINE.count,
            })
          : fill(copy.combineHint, { gear: gearName(first.id), n: picked.length, count: GEAR_COMBINE.count }),
      );
      return;
    }
    // Pressed on something that cannot be combined: say why, in place of the 구슬 line.
    if (this.combineWhy) {
      this.orbHint.setColor(COLORS.accent);
      this.orbHint.setText(this.combineWhy);
    }
  }

  /**
   * Spends the picked swords — the outcome is decided and saved first — then
   * plays the light out and brings the screen back on whatever came of it.
   */
  private runCombine(): void {
    const picked = this.combining ?? [];
    const first = gear.items.find((held) => held.uid === picked[0]);
    if (!first || gear.combineProblem(picked) !== null) {
      return;
    }

    // Where each sword's light starts: its own cell if it is on this page,
    // the middle of the grid's edge if it is on another.
    const perPage = INVENTORY.cols * INVENTORY.rows;
    const start = this.menu.page * perPage;
    const sources = picked.map((uid) => {
      const slot = this.menu.items.findIndex((cell) => cell.id === uid) - start;
      const view = slot >= 0 && slot < perPage ? this.menu.cells[slot] : undefined;
      return view ? { x: view.plate.x, y: view.plate.y } : { x: this.gridCentre.x, y: this.menu.cells[0]?.plate.y ?? 0 };
    });

    const outcome = gear.combine(picked);
    if (!outcome) {
      return;
    }

    this.busy = true;
    this.combining = null;
    this.combineMarks.forEach((frame) => frame.setVisible(false));
    const copy = t().gear;
    const note = outcome.success && outcome.item
      ? fill(copy.combineSuccess, { gear: gearName(outcome.item.id) })
      : fill(copy.combineFail, { gear: gearName(first.id), count: GEAR_COMBINE.count });

    // On a success, onto the new sword; on a failure, where the cursor was.
    const at = this.menu.selected;
    this.playCombine(sources, this.gridCentre, outcome, () => {
      this.busy = false;
      this.scene.restart({
        onClose: this.payload.onClose,
        tab: 'gear',
        focus: outcome.item?.uid,
        focusIndex: at,
        note,
      });
    });
  }

  /**
   * The light: out of each sword, into one point, three seconds of shining
   * that grows brighter and quicker, then a burst of smoke and sparks on a
   * failure or a white flash and the new sword on a success.
   */
  private playCombine(
    sources: readonly { x: number; y: number }[],
    target: { x: number; y: number },
    outcome: CombineOutcome,
    done: () => void,
  ): void {
    const fx = COMBINE_FX;
    const depth = DEPTH.ui + 20;
    const { width, height } = this.scale;
    const add = Phaser.BlendModes.ADD;
    const glow = (x: number, y: number, size: number, tint: number, alpha = 1) =>
      this.add
        .image(x, y, TEXTURES.glow)
        .setDisplaySize(size, size)
        .setTint(tint)
        .setBlendMode(add)
        .setAlpha(alpha)
        .setDepth(depth + 2);
    const fade = (target: Phaser.GameObjects.Image, ms: number, grow = 1) =>
      this.tweens.add({
        targets: target,
        alpha: 0,
        scaleX: target.scaleX * grow,
        scaleY: target.scaleY * grow,
        duration: ms,
        onComplete: () => target.destroy(),
      });

    // The screen darkens, and takes every press for itself until it is done.
    const scrim = this.add
      .rectangle(0, 0, width, height, 0x000000, fx.scrim)
      .setOrigin(0, 0)
      .setDepth(depth)
      .setAlpha(0)
      .setInteractive();
    this.tweens.add({ targets: scrim, alpha: 1, duration: 250 });

    // 1. Light leaves each sword and travels to the meeting point, trailing.
    const motes = sources.map((from) => {
      fade(glow(from.x, from.y, 60, fx.light, 0.9), 450, 1.6);
      return glow(from.x, from.y, 30, fx.light);
    });
    const trail = this.time.addEvent({
      delay: 40,
      loop: true,
      callback: () => motes.forEach((mote) => fade(glow(mote.x, mote.y, 18, fx.light, 0.6), 320, 0.4)),
    });
    this.tweens.add({
      targets: motes,
      x: target.x,
      y: target.y,
      duration: fx.gatherMs,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        trail.remove();
        motes.forEach((mote) => mote.destroy());
        charge();
      },
    });

    // 2. Gathered: it shines for three seconds, brighter and quicker.
    const charge = () => {
      const halo = glow(target.x, target.y, 150, fx.light, 0.3);
      const core = glow(target.x, target.y, 44, 0xffffff);
      const rays = this.add.graphics().setDepth(depth + 1).setBlendMode(add).setPosition(target.x, target.y);
      rays.fillStyle(fx.light, 1);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        rays.fillTriangle(0, 0, Math.cos(a - 0.05) * 120, Math.sin(a - 0.05) * 120, Math.cos(a + 0.05) * 120, Math.sin(a + 0.05) * 120);
      }
      rays.setAlpha(0);

      this.tweens.add({ targets: core, scale: core.scale * 2.2, duration: fx.chargeMs, ease: 'Sine.easeIn' });
      this.tweens.add({ targets: rays, alpha: 0.35, angle: 220, duration: fx.chargeMs, ease: 'Sine.easeIn' });
      const breath = this.tweens.add({
        targets: halo,
        alpha: 0.7,
        duration: 320,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      // Sparks drawn in from all round, faster as the light builds.
      let gap = 140;
      const spark = (): void => {
        const a = Math.random() * Math.PI * 2;
        const r = 90 + Math.random() * 60;
        const mote = glow(target.x + Math.cos(a) * r, target.y + Math.sin(a) * r, 14, fx.light, 0.9);
        this.tweens.add({
          targets: mote,
          x: target.x,
          y: target.y,
          alpha: 0.2,
          duration: 380,
          ease: 'Quad.easeIn',
          onComplete: () => mote.destroy(),
        });
        gap = Math.max(35, gap * 0.93);
        sparks = this.time.delayedCall(gap, spark);
      };
      let sparks = this.time.delayedCall(gap, spark);

      this.time.delayedCall(fx.chargeMs, () => {
        sparks.remove();
        breath.remove();
        rays.destroy();
        if (outcome.success) {
          succeed(core, halo);
        } else {
          fail(core, halo);
        }
      });
    };

    // 3a. It does not take: a pop, sparks and smoke.
    const fail = (core: Phaser.GameObjects.Image, halo: Phaser.GameObjects.Image) => {
      core.setTint(fx.failure);
      fade(core, 220, 2.4);
      fade(halo, 260, 1.8);
      fade(glow(target.x, target.y, 200, fx.failure, 0.9), fx.burstMs * 0.6, 1.8);
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 70 + Math.random() * 120;
        const bit = glow(target.x, target.y, 10 + Math.random() * 10, i % 3 === 0 ? 0xffffff : fx.failure);
        this.tweens.add({
          targets: bit,
          x: target.x + Math.cos(a) * r,
          y: target.y + Math.sin(a) * r,
          alpha: 0,
          duration: fx.burstMs,
          ease: 'Cubic.easeOut',
          onComplete: () => bit.destroy(),
        });
      }
      for (let i = 0; i < 6; i++) {
        const puff = this.add
          .image(target.x + (Math.random() - 0.5) * 40, target.y + (Math.random() - 0.5) * 40, TEXTURES.glow)
          .setDisplaySize(60, 60)
          .setTint(fx.smoke)
          .setAlpha(0.7)
          .setDepth(depth + 1);
        this.tweens.add({
          targets: puff,
          y: puff.y - 30,
          alpha: 0,
          scale: puff.scale * 2.4,
          duration: fx.burstMs * 1.6,
          ease: 'Sine.easeOut',
          onComplete: () => puff.destroy(),
        });
      }
      this.cameras.main.shake(260, 0.012);
      this.play('sfx-fireball-0', 0.6);
      this.time.delayedCall(fx.burstMs + fx.holdMs, done);
    };

    // 3b. It takes: a white flash, a starburst, and the new sword in the light.
    const succeed = (core: Phaser.GameObjects.Image, halo: Phaser.GameObjects.Image) => {
      core.setTint(fx.success);
      fade(core, fx.flashMs, 3);
      fade(halo, fx.flashMs, 3);
      const flash = this.add
        .rectangle(0, 0, width, height, 0xffffff, 1)
        .setOrigin(0, 0)
        .setDepth(depth + 4)
        .setAlpha(0);
      this.tweens.add({
        targets: flash,
        alpha: 0.85,
        duration: fx.flashMs * 0.25,
        yoyo: true,
        hold: 60,
        onComplete: () => flash.destroy(),
      });
      const burst = this.add.graphics().setDepth(depth + 1).setBlendMode(add).setPosition(target.x, target.y);
      burst.fillStyle(fx.success, 1);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 === 0 ? 220 : 140;
        burst.fillTriangle(0, 0, Math.cos(a - 0.04) * r, Math.sin(a - 0.04) * r, Math.cos(a + 0.04) * r, Math.sin(a + 0.04) * r);
      }
      burst.setScale(0.2).setAlpha(0.9);
      this.tweens.add({
        targets: burst,
        scale: 1.4,
        alpha: 0,
        angle: 30,
        duration: fx.flashMs + 300,
        ease: 'Cubic.easeOut',
        onComplete: () => burst.destroy(),
      });

      const backing = glow(target.x, target.y, 120, fx.success, 0.7);
      const sword = this.add
        .image(target.x, target.y, outcome.item ? gearTexture(outcome.item.id) : TEXTURES.gear)
        .setDepth(depth + 3)
        .setDisplaySize(72, 72);
      const settled = sword.scale;
      sword.setScale(settled * 0.2);
      this.tweens.add({ targets: sword, scale: settled, duration: fx.popMs, ease: 'Back.easeOut' });
      this.tweens.add({ targets: backing, alpha: 0.35, duration: fx.holdMs / 2, yoyo: true });
      // The clip it has always had (마법's, which 희귀 borrowed until 0.111).
      this.play(AUDIO.drops.magic!.key, AUDIO.drops.magic!.volume);
      this.time.delayedCall(fx.flashMs + fx.holdMs, done);
    };
  }

  /** A clip, if it loaded; silence rather than a warning if it did not. */
  private play(key: string, volume: number): void {
    if (this.cache.audio.exists(key)) {
      this.sound.play(key, { volume: effectVolume(volume) });
    }
  }

  private close(): void {
    if (this.busy) {
      return;
    }
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
