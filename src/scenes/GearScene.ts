import Phaser from 'phaser';

import {
  COLORS,
  DEPTH,
  MENU,
  SCENES,
  SCRIM,
  TEXT,
  TEXTURES,
  ALL_ORBS,
  GEAR_DROP,
  ORBS,
  type AffixLine,
  type OrbId,
} from '@/config';
import {
  affixGearDetail,
  affixName,
  fill,
  gearTitle,
  orbDetail,
  orbName,
  orbShort,
  t,
} from '@/i18n';
import { gear, gearBonusFor, orbApplied, type GearItem, type OrbOutcome } from '@/systems/Gear';
import { orbs } from '@/systems/Orbs';
import { saveGame } from '@/systems/SaveGame';
import { centredTop, fitText, fitWidth } from '@/systems/Layout';
import { MenuList } from '@/systems/MenuList';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export interface GearSceneData {
  readonly onClose: () => void;
  /**
   * The weapon the cursor should land on. A 구슬 relays the screen — the
   * read-out is a different height once the lines change — and without this
   * the cursor would jump to the top of the stash on every single reroll.
   */
  readonly focus?: string;
  /** What the last 구슬 did, shown until the cursor moves off the weapon. */
  readonly note?: string;
}

/** A percentage, as a reader would say it: "+50%", not "+50.0000001%". */
const percent = (scale: number): number => Math.round((scale - 1) * 100);

/** Roughly what one line of the read-out costs, for budgeting the layout. */
const LINE_HEIGHT = 24;
/** The air between the stash and the lines under it. */
const LINES_GAP = 24;
/** The footer hint, and the air above it. */
const FOOTER = 56;
/** An 속성 slot with nothing in it. */
const EMPTY_SLOT = '─'.repeat(22);
/**
 * What the read-out always costs: the weapon's own line, a heading and three
 * slots for the 접두어, and the same for the 접미어. Fixed, because the slots
 * are drawn whether or not anything is in them — which is the point of
 * drawing them. Nothing in it wraps, so there is no spare line.
 */
const READ_OUT_LINES = 1 + (1 + GEAR_DROP.maxPrefixes) + (1 + GEAR_DROP.maxSuffixes);
/** Wide enough to stand the stash and the read-out beside each other. */
const COLUMNS_FROM = 760;
/** The 버리기 button under the read-out, and the air around it. */
const DISCARD_BLOCK = 44;
const DISCARD_HEIGHT = 30;
const DISCARD_WIDTH = 200;
/** The row of 구슬 buttons under that, and the line explaining one. */
const ORB_BLOCK = 40;
const ORB_DETAIL_BLOCK = 34;

/**
 * 장비창 — the stash, and which weapon goes out with you next time.
 *
 * A weapon reads the way an item reads in Path of Exile: its own line first
 * (the flat attack power its tier is worth), then its 접두어 and its 접미어,
 * each one named and spelled out. What is written on the weapon is the same
 * set of 속성 a rare enemy wears, which is why the words are familiar.
 */
export class GearScene extends Phaser.Scene {
  public static readonly KEY = SCENES.gear;

  private payload!: GearSceneData;
  /** This screen's list of choices. Public so a test can drive it. */
  public menu!: MenuList;
  private wearing!: Phaser.GameObjects.Text;
  /** The lines of whichever weapon is under the cursor. Public for tests. */
  public lines!: Phaser.GameObjects.Text;
  /** 버리기, and the plate behind it. Public so a test can press it. */
  public discard!: Phaser.GameObjects.Text;
  private discardPlate!: Phaser.GameObjects.Rectangle;
  /** The 구슬 buttons, by id. Public so a test can press one. */
  public orbButtons = new Map<OrbId, Phaser.GameObjects.Text>();
  private orbPlates = new Map<OrbId, Phaser.GameObjects.Rectangle>();
  private orbIcons = new Map<OrbId, Phaser.GameObjects.Image>();
  /** What the armed 구슬 would do, or empty. Public for tests. */
  public orbHint!: Phaser.GameObjects.Text;
  /**
   * What has been pressed once and is waiting to be pressed again: 'discard',
   * a 구슬's id, or nothing. Everything on this screen that cannot be undone
   * asks first — a weapon six 속성 deep is an hour of 우두머리 kills, and a
   * 각성의 구슬 is a thousand ordinary ones.
   */
  public armed: 'discard' | OrbId | null = null;
  /**
   * True while a run is sitting in the save slot. That run went out with
   * one weapon and will be resumed with whatever is in hand, so swapping
   * now would quietly hand it a different sword than it was played with.
   * Public so a test can read it.
   */
  public locked = false;

  public constructor() {
    super(GearScene.KEY);
  }

  public init(data: GearSceneData): void {
    this.payload = data;
    this.locked = saveGame.read() !== null;
    // The scene instance outlives a launch, and an armed button left over
    // from last time would throw the first weapon away on one press.
    this.armed = null;
    this.orbButtons = new Map();
    this.orbPlates = new Map();
    this.orbIcons = new Map();
  }

  public create(): void {
    const { width, height } = this.scale;
    const copy = t().gear;
    const held = gear.items;

    this.add
      .rectangle(0, 0, width, height, 0x05070b, SCRIM.reading)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ui);

    // Title, the weapon in hand, the stash, and what the one under the
    // cursor is worth.
    //
    // A weapon with six 속성 needs eight lines to read out, and a stash grows
    // by one weapon per 우두머리, so the two of them cannot both just take
    // what they want. Upright there is height to stack them; in landscape
    // there is only 540 of it, and the width to stand them side by side
    // instead. Either way the stash is what scrolls, never the read-out.
    const step = MENU.buttonHeight + MENU.buttonGap;
    const linesHeight = READ_OUT_LINES * LINE_HEIGHT;
    const sideBySide = width > height && width >= COLUMNS_FROM;

    const readOut = linesHeight + DISCARD_BLOCK + ORB_BLOCK + ORB_DETAIL_BLOCK;
    // On a short landscape window the weapon in hand gives up some of its
    // air, because the read-out under it cannot give up any lines.
    const headRoom = height < 480 ? 44 : 64;
    const bodyRoom = height - 24 - MENU.titleBlockHeight - headRoom - FOOTER;
    const listRoom = sideBySide ? bodyRoom : bodyRoom - LINES_GAP - readOut;
    const rows = Phaser.Math.Clamp(
      Math.floor((listRoom + MENU.buttonGap) / step),
      2,
      held.length + 1,
    );
    const listHeight = rows * step - MENU.buttonGap;
    const bodyHeight = sideBySide
      ? Math.max(listHeight, readOut)
      : listHeight + LINES_GAP + readOut;
    const top = centredTop(height, MENU.titleBlockHeight + headRoom + bodyHeight);

    this.add
      .text(width / 2, top + 16, copy.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    const wearingY = top + MENU.titleBlockHeight + headRoom / 2 - 24;
    this.add
      .image(width / 2 - 80, wearingY, TEXTURES.gear)
      .setDisplaySize(26, 26)
      .setDepth(DEPTH.ui + 1);

    this.wearing = this.add
      .text(width / 2 - 56, wearingY, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.gearText,
      })
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.ui + 1);

    const listTop = top + MENU.titleBlockHeight + headRoom;
    this.menu = new MenuList(this, {
      x: sideBySide ? Math.round(width * 0.28) : width / 2,
      y: listTop + MENU.buttonHeight / 2,
      width: sideBySide ? Math.round(width * 0.44) : undefined,
      onCancel: () => this.close(),
      onMove: () => this.showLines(),
      maxVisible: rows,
      items: [
        ...held.map((item) => ({
          id: item.uid,
          label: () => gearTitle(item),
          detail: () => (gear.value.equipped === item.uid ? t().gear.equipped : ''),
          onSelect: () => this.wear(item.uid),
        })),
        { id: 'back', label: () => t().common.back, onSelect: () => this.close() },
      ],
    });


    const linesY = sideBySide
      ? listTop
      : Math.min(listTop + listHeight + LINES_GAP, height - FOOTER - readOut);
    this.lines = this.add
      .text(sideBySide ? Math.round(width * 0.72) : width / 2, linesY, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.muted,
        // Left, so the 접두어 / 접미어 column lines up and the eye can run
        // down it; the block as a whole is still centred on its column.
        align: 'left',
        lineSpacing: 5,
        wordWrap: { width: sideBySide ? Math.round(width * 0.44) : fitWidth(520, width) },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);

    const columnX = sideBySide ? Math.round(width * 0.72) : width / 2;
    const columnWidth = sideBySide ? Math.round(width * 0.44) : fitWidth(520, width);
    this.buildDiscard(columnX, linesY + linesHeight + DISCARD_BLOCK / 2);
    this.buildOrbs(columnX, linesY + linesHeight + DISCARD_BLOCK + ORB_BLOCK / 2, columnWidth);

    // The hint has four things to say on a keyboard, which is wider than a
    // phone's canvas; shrink it rather than let it run off the sides.
    fitText(
      this.add
        .text(
          width / 2,
          height - 28,
          this.locked
            ? copy.lockedHint
            : prefersTouchControls()
              ? copy.hintTouch
              : fill(copy.hintKeyboard, { keys: `1~${ALL_ORBS.length}` }),
          { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted },
        )
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width,
    );

    this.refreshWearing();
    this.showLines();
    // Back onto whatever the last 구슬 was spent on, rather than the top of
    // the stash. Last, because it repaints the buttons built just above.
    if (this.payload.focus) {
      this.menu.focus(this.payload.focus);
    }
  }

  /**
   * 버리기 — the one destructive thing on this screen, so it is a button
   * rather than a key alone, and it asks before it does anything. Delete
   * does the same from a keyboard; moving the cursor takes the question back.
   */
  private buildDiscard(x: number, y: number): void {
    this.discardPlate = this.add
      .rectangle(x, y, DISCARD_WIDTH, DISCARD_HEIGHT, COLORS.panelActive, 0)
      .setDepth(DEPTH.ui)
      .setInteractive({ useHandCursor: true });

    this.discard = this.add
      .text(x, y, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.discardPlate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.pressDiscard());
    this.input.keyboard?.on('keydown-DELETE', this.pressDiscard, this);
    this.input.keyboard?.on('keydown-BACKSPACE', this.pressDiscard, this);
    // 1, 2, 3 for the 구슬, in the order they are drawn.
    this.input.keyboard?.on('keydown', this.onOrbKey, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-DELETE', this.pressDiscard, this);
      this.input.keyboard?.off('keydown-BACKSPACE', this.pressDiscard, this);
      this.input.keyboard?.off('keydown', this.onOrbKey, this);
    });

    this.refreshDiscard();
  }

  /**
   * The 구슬 row: one button per kind, each saying how many are held. A
   * press arms it, a second press spends it. Greyed out when the drawer is
   * empty of that kind, or when it would do nothing to this weapon.
   */
  private buildOrbs(x: number, y: number, columnWidth: number): void {
    const slot = Math.min(140, Math.floor(columnWidth / ALL_ORBS.length));
    const left = x - (slot * ALL_ORBS.length) / 2 + slot / 2;

    ALL_ORBS.forEach((orb, index) => {
      const cx = Math.round(left + index * slot);
      const plate = this.add
        .rectangle(cx, y, slot - 6, DISCARD_HEIGHT, COLORS.panelActive, 0)
        .setDepth(DEPTH.ui)
        .setInteractive({ useHandCursor: true });

      // Its own sprite beside the word, so the row reads as three different
      // things rather than three counts.
      const icon = this.add
        .image(cx - slot / 2 + 16, y, orb.texture)
        .setDisplaySize(18, 18)
        .setDepth(DEPTH.ui + 1);

      const label = this.add
        .text(cx + 8, y, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.small,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1);

      this.orbIcons.set(orb.id, icon);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => this.pressOrb(orb.id));
      this.orbPlates.set(orb.id, plate);
      this.orbButtons.set(orb.id, label);
    });

    // Clamped clear of the footer: this line is the longest thing on the
    // screen and it is the one that says what a 구슬 just did.
    const hintY = Math.min(y + ORB_BLOCK / 2 + 4, this.scale.height - FOOTER - 16);
    this.orbHint = this.add
      .text(x, hintY, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: columnWidth },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);

    this.refreshOrbs();
  }

  private onOrbKey(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }

    // One key per 구슬, in the order they are drawn, however many there are.
    const index = ALL_ORBS.findIndex((_, i) => event.code === `Digit${i + 1}`);
    const orb = index >= 0 ? ALL_ORBS[index] : undefined;
    if (orb) {
      this.pressOrb(orb.id);
    }
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

    // The weapon is a different height to read out now, so the whole screen
    // is measured again — with the cursor left on the weapon it was spent on
    // and a line saying what the 구슬 actually did.
    this.scene.restart({
      ...this.payload,
      focus: outcome.item ? item.uid : undefined,
      note: GearScene.noteFor(spec.id, outcome),
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

  /** The weapon under the cursor, if the cursor is on one at all. */
  private selected(): GearItem | undefined {
    return gear.items.find((held) => held.uid === this.menu.selectedId);
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
    // The stash is a weapon shorter, so the whole screen is measured again
    // rather than patched: the window, the read-out and the rows all change.
    this.scene.restart(this.payload);
  }

  private refreshDiscard(): void {
    const copy = t().gear;
    const live = this.canDiscard(this.selected());

    const asking = this.armed === 'discard' && live;
    this.discard.setText(asking ? copy.discardConfirm : copy.discard);
    this.discard.setColor(asking ? COLORS.accent : COLORS.muted);
    this.discard.setAlpha(live ? 1 : 0.35);
    this.discardPlate.setFillStyle(COLORS.panelActive, asking ? 0.55 : 0);
    this.discardPlate.setAlpha(live ? 1 : 0.35);
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
      ...GearScene.slots(item.prefixes, GEAR_DROP.maxPrefixes),
      copy.suffix,
      ...GearScene.slots(item.suffixes, GEAR_DROP.maxSuffixes),
    ].join('\n');
  }

  /**
   * Puts a weapon on and repaints the rows, so the mark follows it. Refused
   * while a run is saved: that run is resumed with whatever is in hand, and
   * swapping now would hand it a sword it never went out with.
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
    this.refreshDiscard();
    this.refreshOrbs();
  }

  private refreshWearing(): void {
    this.wearing.setText(`${t().gear.wearing}  ${gearTitle(gear.equipped)}`);
  }

  /** The lines of whichever row the cursor is on; the back row has none. */
  private showLines(): void {
    const item = this.selected();
    this.lines.setText(item ? GearScene.describe(item) : '');
    // A question asked about one weapon does not carry over to the next.
    this.armed = null;
    this.refreshDiscard();
    this.refreshOrbs();
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
