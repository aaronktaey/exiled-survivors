import Phaser from 'phaser';

import { COLORS, DEPTH, MENU, SCENES, SCRIM, TEXT, TEXTURES, type AffixId } from '@/config';
import { affixName, fill, gearTitle, t } from '@/i18n';
import { gear, gearBonusFor, type GearItem } from '@/systems/Gear';
import { centredTop, fitWidth } from '@/systems/Layout';
import { MenuList } from '@/systems/MenuList';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export interface GearSceneData {
  readonly onClose: () => void;
}

/** A percentage, as a reader would say it: "+50%", not "+50.0000001%". */
const percent = (scale: number): number => Math.round((scale - 1) * 100);

/**
 * 장비창 — the stash, and which weapon goes out with you next time.
 *
 * A weapon reads the way an item reads in Path of Exile: its own line first
 * (the flat attack power its tier is worth), then its 접두어 and its 접미어,
 * each one named and spelled out. What is written on the weapon is the same
 * set of 강화효과 a rare enemy wears, which is why the words are familiar.
 */
export class GearScene extends Phaser.Scene {
  public static readonly KEY = SCENES.gear;

  private payload!: GearSceneData;
  /** This screen's list of choices. Public so a test can drive it. */
  public menu!: MenuList;
  private wearing!: Phaser.GameObjects.Text;
  /** The lines of whichever weapon is under the cursor. Public for tests. */
  public lines!: Phaser.GameObjects.Text;

  public constructor() {
    super(GearScene.KEY);
  }

  public init(data: GearSceneData): void {
    this.payload = data;
  }

  public create(): void {
    const { width, height } = this.scale;
    const copy = t().gear;
    const held = gear.items;

    this.add
      .rectangle(0, 0, width, height, 0x05070b, SCRIM.reading)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ui);

    // Title, the weapon in hand, the stash, and its lines underneath.
    const listHeight = (held.length + 1) * (MENU.buttonHeight + MENU.buttonGap) - MENU.buttonGap;
    const linesHeight = 96;
    const top = centredTop(height, MENU.titleBlockHeight + 64 + listHeight + linesHeight);

    this.add
      .text(width / 2, top + 16, copy.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    const wearingY = top + MENU.titleBlockHeight + 8;
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

    const listTop = top + MENU.titleBlockHeight + 64;
    this.menu = new MenuList(this, {
      x: width / 2,
      y: listTop + MENU.buttonHeight / 2,
      onCancel: () => this.close(),
      onMove: () => this.showLines(),
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

    const linesY = Math.min(listTop + listHeight + 20, height - 56 - linesHeight);
    this.lines = this.add
      .text(width / 2, linesY, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.muted,
        align: 'center',
        lineSpacing: 5,
        wordWrap: { width: fitWidth(520, width) },
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 1);

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

/** "강력 ×2 · 치명" — one line per kind, repeats counted rather than listed. */
  private static tally(ids: readonly AffixId[]): string {
    const counts = new Map<AffixId, number>();
    for (const id of ids) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    return [...counts]
      .map(([id, n]) => (n > 1 ? `${affixName(id)} ×${n}` : affixName(id)))
      .join(' · ');
  }

  /**
   * What one weapon is worth, in at most four lines: its own attack power,
   * its 접두어, its 접미어, and what the lot adds up to for the survivor.
   */
  public static describe(item: GearItem): string {
    const copy = t().gear;
    const bonus = gearBonusFor(item);
    const out = [fill(copy.attack, { attack: bonus.attack })];

    if (item.prefixes.length > 0) {
      out.push(`${copy.prefix}  ${GearScene.tally(item.prefixes)}`);
    }
    if (item.suffixes.length > 0) {
      out.push(`${copy.suffix}  ${GearScene.tally(item.suffixes)}`);
    }
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
  }

  private refreshWearing(): void {
    this.wearing.setText(`${t().gear.wearing}  ${gearTitle(gear.equipped)}`);
  }

  /** The lines of whichever row the cursor is on; the back row has none. */
  private showLines(): void {
    const item = gear.items.find((held) => held.uid === this.menu.selectedId);
    this.lines.setText(item ? GearScene.describe(item) : '');
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
