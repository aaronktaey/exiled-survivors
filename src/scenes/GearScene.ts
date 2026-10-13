import Phaser from 'phaser';

import { COLORS, DEPTH, MENU, SCENES, SCRIM, TEXT, TEXTURES } from '@/config';
import { gearName, t } from '@/i18n';
import { gear } from '@/systems/Gear';
import { centredTop } from '@/systems/Layout';
import { MenuList } from '@/systems/MenuList';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export interface GearSceneData {
  readonly onClose: () => void;
}

/**
 * 장비창 — the stash, and which piece goes out with you next time.
 *
 * It is deliberately thin: a piece has a name and nothing else, because the
 * equipment system itself is still to be built. What is real here is the
 * loop around it — a piece found during a run is in this list afterwards,
 * and putting one on sticks between runs — so the rest can be dropped in
 * later without moving any of this.
 */
export class GearScene extends Phaser.Scene {
  public static readonly KEY = SCENES.gear;

  private payload!: GearSceneData;
  /** This screen's list of choices. Public so a test can drive it. */
  public menu!: MenuList;
  private wearing!: Phaser.GameObjects.Text;

  public constructor() {
    super(GearScene.KEY);
  }

  public init(data: GearSceneData): void {
    this.payload = data;
  }

  public create(): void {
    const { width, height } = this.scale;
    const copy = t().gear;
    const owned = gear.owned;

    this.add
      .rectangle(0, 0, width, height, 0x05070b, SCRIM.reading)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ui);

    // Title, the piece in hand, the stash, and a way back.
    const listHeight = (owned.length + 1) * (MENU.buttonHeight + MENU.buttonGap) - MENU.buttonGap;
    const top = centredTop(height, MENU.titleBlockHeight + 76 + listHeight);

    this.add
      .text(width / 2, top + 16, copy.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    this.add
      .image(width / 2 - 70, top + MENU.titleBlockHeight + 10, TEXTURES.gear)
      .setDisplaySize(26, 26)
      .setDepth(DEPTH.ui + 1);

    this.wearing = this.add
      .text(width / 2 - 44, top + MENU.titleBlockHeight + 10, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.gearText,
      })
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.ui + 1);
    this.refreshWearing();

    this.menu = new MenuList(this, {
      x: width / 2,
      y: top + MENU.titleBlockHeight + 76 + MENU.buttonHeight / 2,
      onCancel: () => this.close(),
      items: [
        ...owned.map((spec) => ({
          id: spec.id,
          label: () => gearName(spec.id),
          detail: () => (gear.value.equipped === spec.id ? t().gear.equipped : ''),
          onSelect: () => this.wear(spec.id),
        })),
        { id: 'back', label: () => t().common.back, onSelect: () => this.close() },
      ],
    });

    this.add
      .text(width / 2, top + MENU.titleBlockHeight + 76 + listHeight + 34, copy.comingSoon, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: width - 48 },
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
  }

  /** Puts a piece on and repaints the rows, so the mark follows it. */
  private wear(id: string): void {
    gear.equip(id as Parameters<typeof gear.equip>[0]);
    this.refreshWearing();
    this.menu.refresh();
  }

  private refreshWearing(): void {
    this.wearing.setText(`${t().gear.wearing}  ${gearName(gear.equipped.id)}`);
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
