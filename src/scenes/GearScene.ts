import Phaser from 'phaser';

import {
  COLORS,
  DEPTH,
  MENU,
  SCENES,
  SCRIM,
  TEXT,
  TEXTURES,
  type AffixId,
  type AffixKind,
} from '@/config';
import { affixGearDetail, affixKindName, affixName, fill, gearTitle, t } from '@/i18n';
import { gear, gearBonusFor, type GearItem } from '@/systems/Gear';
import { centredTop, fitWidth } from '@/systems/Layout';
import { MenuList } from '@/systems/MenuList';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export interface GearSceneData {
  readonly onClose: () => void;
}

/** A percentage, as a reader would say it: "+50%", not "+50.0000001%". */
const percent = (scale: number): number => Math.round((scale - 1) * 100);

/** Roughly what one line of the read-out costs, for budgeting the layout. */
const LINE_HEIGHT = 24;
/** The air between the stash and the lines under it. */
const LINES_GAP = 24;
/** The footer hint, and the air above it. */
const FOOTER = 56;
/** Wide enough to stand the stash and the read-out beside each other. */
const COLUMNS_FROM = 760;
/** The 버리기 button under the read-out, and the air around it. */
const DISCARD_BLOCK = 44;
const DISCARD_HEIGHT = 30;
const DISCARD_WIDTH = 200;

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
  /**
   * Whether 버리기 has been pressed once already. A weapon six 속성 deep is
   * an hour of 우두머리 kills, so it does not go on a single tap.
   */
  public armed = false;

  public constructor() {
    super(GearScene.KEY);
  }

  public init(data: GearSceneData): void {
    this.payload = data;
    // The scene instance outlives a launch, and an armed button left over
    // from last time would throw the first weapon away on one press.
    this.armed = false;
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
    const lineCount =
      held.reduce((most, item) => Math.max(most, GearScene.describe(item).split('\n').length), 1) +
      // One spare, for a summary line long enough to wrap.
      1;
    const linesHeight = lineCount * LINE_HEIGHT;
    const sideBySide = width > height && width >= COLUMNS_FROM;

    const readOut = linesHeight + DISCARD_BLOCK;
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

    this.buildDiscard(
      sideBySide ? Math.round(width * 0.72) : width / 2,
      linesY + linesHeight + DISCARD_BLOCK / 2,
    );

    this.add
      .text(
        width / 2,
        height - 28,
        prefersTouchControls() ? copy.hintTouch : copy.hintKeyboard,
        { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.refreshWearing();
    this.showLines();
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
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-DELETE', this.pressDiscard, this);
      this.input.keyboard?.off('keydown-BACKSPACE', this.pressDiscard, this);
    });

    this.refreshDiscard();
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

    if (!this.armed) {
      this.armed = true;
      this.refreshDiscard();
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

    this.discard.setText(this.armed && live ? copy.discardConfirm : copy.discard);
    this.discard.setColor(this.armed && live ? COLORS.accent : COLORS.muted);
    this.discard.setAlpha(live ? 1 : 0.35);
    this.discardPlate.setFillStyle(COLORS.panelActive, this.armed && live ? 0.55 : 0);
    this.discardPlate.setAlpha(live ? 1 : 0.35);
  }

/**
   * "접두어  강력 ×2   피해 +50%" — a line per 속성 the weapon carries,
   * saying which half of the name it is, and what it actually does. Repeats
   * are counted rather than listed twice, the way a rare enemy's are.
   */
  private static affixLines(kind: AffixKind, ids: readonly AffixId[]): string[] {
    const counts = new Map<AffixId, number>();
    for (const id of ids) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    return [...counts].map(([id, n]) => {
      const name = n > 1 ? `${affixName(id)} ×${n}` : affixName(id);
      return `${affixKindName(kind)}  ${name}   ${affixGearDetail(id)}`;
    });
  }

  /**
   * What one weapon is worth: its own attack power, then every 속성 on it
   * spelled out, then what the lot adds up to for the survivor. The last
   * line is not the same as the ones above it — two 거대 read "+50%" each
   * and come to +125% together.
   */
  public static describe(item: GearItem): string {
    const copy = t().gear;
    const bonus = gearBonusFor(item);
    const out = [fill(copy.attack, { attack: bonus.attack })];
    if (bonus.attackSpeedScale !== 1) {
      out[0] += `   ${fill(copy.attack2, { percent: percent(bonus.attackSpeedScale) })}`;
    }

    out.push(
      ...GearScene.affixLines('prefix', item.prefixes),
      ...GearScene.affixLines('suffix', item.suffixes),
    );
    if (item.prefixes.length === 0 && item.suffixes.length === 0) {
      out.push(copy.plain);
    }

    // What that adds up to for the survivor, where it is not just damage.
    const summary: string[] = [];
    if (bonus.maxHpScale !== 1) {
      summary.push(fill(copy.summaryHp, { percent: percent(bonus.maxHpScale) }));
    }
    if (bonus.moveSpeedScale !== 1) {
      summary.push(fill(copy.summarySpeed, { percent: percent(bonus.moveSpeedScale) }));
    }
    if (bonus.critChance > 0) {
      summary.push(fill(copy.summaryCrit, { percent: Math.round(bonus.critChance * 100) }));
    }
    if (bonus.critMultiplierBonus > 0) {
      summary.push(fill(copy.summaryCritDamage, { percent: Math.round(bonus.critMultiplierBonus * 100) }));
    }
    if (bonus.regen > 0) {
      summary.push(fill(copy.summaryRegen, { amount: bonus.regen }));
    }
    if (bonus.invulnerableScale !== 1) {
      summary.push(fill(copy.summaryEvade, { percent: percent(bonus.invulnerableScale) }));
    }
    if (bonus.pickupScale !== 1) {
      summary.push(fill(copy.summaryPickup, { percent: percent(bonus.pickupScale) }));
    }
    if (summary.length > 0) {
      out.push(summary.join(' · '));
    }

    return out.join('\n');
  }

  /** Puts a weapon on and repaints the rows, so the mark follows it. */
  private wear(uid: string): void {
    gear.equip(uid);
    this.refreshWearing();
    this.menu.refresh();
    // What is now in hand cannot be thrown away, and what was may be.
    this.armed = false;
    this.refreshDiscard();
  }

  private refreshWearing(): void {
    this.wearing.setText(`${t().gear.wearing}  ${gearTitle(gear.equipped)}`);
  }

  /** The lines of whichever row the cursor is on; the back row has none. */
  private showLines(): void {
    const item = this.selected();
    this.lines.setText(item ? GearScene.describe(item) : '');
    // A question asked about one weapon does not carry over to the next.
    this.armed = false;
    this.refreshDiscard();
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
