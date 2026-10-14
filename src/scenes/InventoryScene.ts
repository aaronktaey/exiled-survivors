import Phaser from 'phaser';

import {
  ALL_BONES,
  ALL_ORBS,
  COLORS,
  DEPTH,
  GEAR_DROP,
  INVENTORY,
  ORBS,
  SCENES,
  SCRIM,
  TEXT,
  TEXTURES,
  type AffixLine,
  type OrbId,
} from '@/config';
import {
  affixGearDetail,
  affixName,
  boneDetail,
  boneName,
  fill,
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
  gearBonusFor,
  orbApplied,
  type GearItem,
  type OrbOutcome,
} from '@/systems/Gear';
import { ItemGrid, type GridItem } from '@/systems/ItemGrid';
import { fitText } from '@/systems/Layout';
import { orbs } from '@/systems/Orbs';
import { saveGame } from '@/systems/SaveGame';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { addBackButton, type BackButton } from '@/systems/BackButton';

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
  /** What the last 구슬 did, shown until the cursor moves off the weapon. */
  readonly note?: string;
}

/** A percentage, as a reader would say it: "+50%", not "+50.0000001%". */
const percent = (scale: number): number => Math.round((scale - 1) * 100);

const MARGIN = 16;
const TITLE_BLOCK = 54;
const TAB_HEIGHT = 30;
const TAB_WIDTH = 96;
const FOOTER = 34;
/** Space between the grid and the details beside or under it. */
const GUTTER = 24;
const BUTTON_HEIGHT = 30;
/** An 속성 slot with nothing in it. */
const EMPTY_SLOT = '─'.repeat(18);
/** The weapon's own line, a heading and the slots for each kind. */
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
  /** The lines of whatever is under the cursor. Public for tests. */
  public lines!: Phaser.GameObjects.Text;
  /** 착용, 버리기, and the plates behind them. Public so a test can press them. */
  public equip?: Phaser.GameObjects.Text;
  private equipPlate?: Phaser.GameObjects.Rectangle;
  public discard?: Phaser.GameObjects.Text;
  private discardPlate?: Phaser.GameObjects.Rectangle;
  /** The 구슬 buttons, by id. Public so a test can press one. */
  public orbButtons = new Map<OrbId, Phaser.GameObjects.Text>();
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
  public armed: 'discard' | OrbId | null = null;
  /**
   * True while a run is sitting in the save slot. That run went out with
   * one weapon and will be resumed with whatever is in hand, so swapping
   * now would quietly hand it a different sword than it was played with.
   */
  public locked = false;
  /** Where the bottom of the details pane landed. Public for layout tests. */
  public detailBottom = 0;
  private rowGap = 8;

  public constructor() {
    super(InventoryScene.KEY);
  }

  public init(data: InventorySceneData): void {
    this.payload = data;
    this.tab = data.tab ?? 'gear';
    this.locked = saveGame.read() !== null;
    // The scene instance outlives a launch, and an armed button left over
    // from last time would throw the first weapon away on one press.
    this.armed = null;
    this.tabs = new Map();
    this.orbButtons = new Map();
    this.orbPlates = new Map();
    this.orbIcons = new Map();
    this.equip = undefined;
    this.equipPlate = undefined;
    this.discard = undefined;
    this.discardPlate = undefined;
    this.orbHint = undefined;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
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
      .text(width / 2, MARGIN + 38, '', {
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
        icon: TEXTURES.gear,
        tier: dropTierFor(item),
        marked: () => gear.value.equipped === item.uid,
        label: () => gearTitle(item),
        onSelect: () => this.wear(item.uid),
      }));
    }

    // One cell per kind held, 구슬 first, then 뼈다귀.
    return [
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
      case 'Delete':
      case 'Backspace':
        if (!event.repeat) {
          this.pressDiscard();
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
    if (this.tab === 'gear' && this.locked) {
      return t().gear.lockedHint;
    }
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

    if (this.tab === 'gear') {
      const item = this.selected();
      this.heading.setColor(COLORS.gearText);
      this.heading.setText(item ? gearTitle(item) : t().inventory.empty);
      this.lines.setText(item ? InventoryScene.describe(item) : '');
      this.refreshEquip();
      this.refreshDiscard();
      this.refreshOrbs();
      return;
    }

    const id = this.menu.selectedId;
    const copy = t().inventory;
    this.heading.setColor(COLORS.text);
    if (!id) {
      this.heading.setText(copy.empty);
      this.lines.setText('');
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
    this.wearing.setText(`${t().gear.wearing}  ${gearTitle(gear.equipped)}`);
  }

  // --- 장비: put on, throw away, spend a 구슬 ---

  /** The weapon under the cursor, if the 장비 tab is open and it is on one. */
  private selected(): GearItem | undefined {
    if (this.tab !== 'gear') {
      return undefined;
    }
    return gear.items.find((held) => held.uid === this.menu.selectedId);
  }

  /** 착용 and 버리기, side by side. Returns the bottom of the row. */
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

    const discard = make(x + width / 2 + 6, () => this.pressDiscard());
    this.discard = discard.label;
    this.discardPlate = discard.plate;

    return y + BUTTON_HEIGHT / 2;
  }

  /**
   * The 구슬 row: one button per kind, each saying how many are held. A
   * press arms it, a second press spends it. Greyed out when the drawer is
   * empty of that kind, or when it would do nothing to this weapon.
   * Returns the bottom of the line under it.
   */
  private buildOrbs(x: number, y: number, paneWidth: number): number {
    const slot = Math.min(110, Math.floor(paneWidth / ALL_ORBS.length));
    const left = x - (slot * ALL_ORBS.length) / 2 + slot / 2;

    ALL_ORBS.forEach((orb, index) => {
      const cx = Math.round(left + index * slot);
      const plate = this.add
        .rectangle(cx, y, slot - 6, BUTTON_HEIGHT, COLORS.panelActive, 0)
        .setDepth(DEPTH.ui + 1)
        .setInteractive({ useHandCursor: true });
      // Its own sprite beside the word, so the row reads as different things
      // rather than a row of counts.
      const icon = this.add
        .image(cx - slot / 2 + 14, y, orb.texture)
        .setDisplaySize(16, 16)
        .setDepth(DEPTH.ui + 2);
      const label = this.add
        .text(cx + 8, y, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
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

  /** First press asks, second press spends it. */
  public pressOrb(id: OrbId): void {
    const item = this.selected();
    const spec = ORBS[id];
    if (!item || !spec || !this.canUse(id)) {
      return;
    }

    if (this.armed !== id) {
      this.armed = id;
      this.refreshDiscard();
      this.refreshOrbs();
      return;
    }

    const outcome = orbApplied(item, spec);
    if (!outcome || !orbs.spend(id)) {
      return;
    }

    if (outcome.item) {
      gear.replace(outcome.item);
    } else {
      // A 폭발의 구슬 that went off. The weapon is gone; the store puts a
      // 녹슨 검 back if that leaves the survivor with nothing at all.
      gear.discardAnyway(item.uid);
    }

    // The weapon reads differently now and may have changed rarity, so the
    // screen is drawn again — with the cursor left on the weapon it was spent
    // on and a line saying what the 구슬 actually did.
    this.scene.restart({
      onClose: this.payload.onClose,
      tab: 'gear',
      focus: outcome.item ? item.uid : undefined,
      note: InventoryScene.noteFor(spec.id, outcome),
    });
  }

  /**
   * What a 구슬 just did, in one line. A reroll that came up short and a
   * weapon that did not survive a 폭발의 구슬 are both things to be told
   * rather than left to work out from a read-out that changed.
   */
  private static noteFor(id: OrbId, outcome: OrbOutcome): string {
    const copy = t().gear;
    const orb = orbName(id);

    if (outcome.kind === 'destroyed') {
      return fill(copy.orbDestroyed, { orb });
    }

    if (outcome.kind === 'upgrade' && outcome.line && outcome.from) {
      return fill(copy.orbUpgraded, {
        orb,
        from: `${affixName(outcome.from.id)} ${fill(copy.tier, { tier: outcome.from.tier })}`,
        to: `${affixName(outcome.line.id)} ${fill(copy.tier, { tier: outcome.line.tier })}`,
      });
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
      const asking = this.armed === orb.id && live;

      label.setText(
        asking
          ? fill(copy.orbConfirm, { orb: orbShort(orb.id) })
          : fill(copy.orbCount, { orb: orbShort(orb.id), count: held }),
      );
      label.setColor(asking ? COLORS.accent : COLORS.muted);
      label.setAlpha(live ? 1 : 0.35);
      plate.setFillStyle(COLORS.panelActive, asking ? 0.55 : 0);
      plate.setAlpha(live ? 1 : 0.35);
      this.orbIcons.get(orb.id)?.setAlpha(live ? 1 : 0.3);
    });

    if (!this.orbHint) {
      return;
    }

    const armedOrb = ALL_ORBS.find((orb) => orb.id === this.armed);
    if (armedOrb) {
      this.orbHint.setColor(COLORS.muted);
      this.orbHint.setText(`${orbName(armedOrb.id)} — ${orbDetail(armedOrb.id)}`);
      return;
    }

    // Nothing armed: the line carries what the last one did instead.
    this.orbHint.setColor(this.payload.note ? COLORS.gearText : COLORS.muted);
    this.orbHint.setText(this.payload.note ?? '');
  }

  /** Only something the survivor is not carrying can be thrown away. */
  private canDiscard(item: GearItem | undefined): boolean {
    return item !== undefined && gear.value.equipped !== item.uid;
  }

  /** First press asks, second press throws it away. */
  public pressDiscard(): void {
    const item = this.selected();
    if (!this.canDiscard(item) || !item) {
      return;
    }

    if (this.armed !== 'discard') {
      this.armed = 'discard';
      this.refreshDiscard();
      this.refreshOrbs();
      return;
    }

    gear.discard(item.uid);
    // A weapon shorter, so the grid is laid out again around what is left.
    this.scene.restart({ onClose: this.payload.onClose, tab: 'gear' });
  }

  private refreshDiscard(): void {
    if (!this.discard || !this.discardPlate) {
      return;
    }

    const copy = t().gear;
    const live = this.canDiscard(this.selected());
    const asking = this.armed === 'discard' && live;
    this.discard.setText(asking ? copy.discardConfirm : copy.discard);
    this.discard.setColor(asking ? COLORS.accent : COLORS.muted);
    this.discard.setAlpha(live ? 1 : 0.35);
    this.discardPlate.setFillStyle(COLORS.panelActive, asking ? 0.55 : 0);
    this.discardPlate.setAlpha(live ? 1 : 0.35);
  }

  private refreshEquip(): void {
    if (!this.equip || !this.equipPlate) {
      return;
    }

    const item = this.selected();
    const wearing = item !== undefined && gear.value.equipped === item.uid;
    const live = item !== undefined && !wearing && !this.locked;
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
   * What one weapon is worth: its own attack power, then every 접두어 slot,
   * then every 접미어 slot. Each filled slot says which rung it rolled —
   * tier 1 is the best there is — so two weapons with the same 속성 on them
   * can be told apart.
   */
  public static describe(item: GearItem): string {
    const copy = t().gear;
    const bonus = gearBonusFor(item);
    const head = fill(copy.attack, { attack: bonus.attack });

    return [
      bonus.attackSpeedScale !== 1
        ? `${head}   ${fill(copy.attack2, { percent: percent(bonus.attackSpeedScale) })}`
        : head,
      copy.prefix,
      ...InventoryScene.slots(item.prefixes, GEAR_DROP.maxPrefixes),
      copy.suffix,
      ...InventoryScene.slots(item.suffixes, GEAR_DROP.maxSuffixes),
    ].join('\n');
  }

  /**
   * Puts a weapon on. Refused while a run is saved: that run is resumed with
   * whatever is in hand, and swapping now would hand it a sword it never
   * went out with.
   */
  private wear(uid: string): void {
    if (this.locked) {
      return;
    }

    gear.equip(uid);
    this.refreshWearing();
    this.menu.refresh();
    // What is now in hand cannot be thrown away, and what was may be.
    this.armed = null;
    this.refreshEquip();
    this.refreshDiscard();
    this.refreshOrbs();
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
