import Phaser from 'phaser';

import {
  ALL_PASSIVES,
  COLORS,
  DEPTH,
  ECONOMY,
  MENU,
  SCENES,
  SCRIM,
  SHARD,
  TEXT,
  TEXTURES,
} from '@/config';
import { fill, passiveDetail, t } from '@/i18n';
import { centredTop, fitWidth } from '@/systems/Layout';
import { MenuList } from '@/systems/MenuList';
import { gold } from '@/systems/Gold';
import { passives } from '@/systems/Passives';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { addBackButton, type BackButton } from '@/systems/BackButton';

export interface PassiveSceneData {
  readonly onClose: () => void;
}

/**
 * 패시브 — what carries over between runs.
 *
 * Three lines, each bought a rank at a time with a point, and a point comes
 * from ten 신성한 조각 a 우두머리 left behind. It says on the screen that
 * this is the placeholder shape: the branches come later, and nothing under
 * them — the currency, the points, the order they are applied in — has to
 * move when they do.
 */
export class PassiveScene extends Phaser.Scene {
  public static readonly KEY = SCENES.passives;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;

  private payload!: PassiveSceneData;
  /** This screen's list of choices. Public so a test can drive it. */
  public menu!: MenuList;
  /** Points and shards in hand. Public for tests. */
  public purse!: Phaser.GameObjects.Text;

  public constructor() {
    super(PassiveScene.KEY);
  }

  public init(data: PassiveSceneData): void {
    this.payload = data;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    const copy = t().passives;

    this.add
      .rectangle(0, 0, width, height, 0x05070b, SCRIM.reading)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ui);

    const listHeight =
      (ALL_PASSIVES.length + 2) * (MENU.buttonHeight + MENU.buttonGap) - MENU.buttonGap;
    const top = centredTop(height, MENU.titleBlockHeight + 64 + listHeight + 70);

    this.add
      .text(width / 2, top + 16, copy.title, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    const purseY = top + MENU.titleBlockHeight + 8;
    this.add
      .image(width / 2 - 100, purseY, TEXTURES.shard)
      .setDisplaySize(22, 22)
      .setDepth(DEPTH.ui + 1);

    this.purse = this.add
      .text(width / 2 - 80, purseY, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.shardText,
      })
      .setOrigin(0, 0.5)
      .setDepth(DEPTH.ui + 1);

    const listTop = top + MENU.titleBlockHeight + 64;
    this.menu = new MenuList(this, {
      x: width / 2,
      y: listTop + MENU.buttonHeight / 2,
      width: 440,
      onCancel: () => this.close(),
      items: [
        {
          id: 'buyShard',
          label: () => fill(copy.buyShard, { price: ECONOMY.shardPrice }),
          detail: () => fill(copy.goldHeld, { gold: gold.value }),
          enabled: () => gold.value >= ECONOMY.shardPrice,
          onSelect: () => this.buy(),
        },
        ...ALL_PASSIVES.map((spec) => ({
          id: spec.id,
          // The name and what it does say the same thing for these three,
          // so the row carries the one that is worth reading.
          label: () => passiveDetail(spec.id),
          detail: () => this.rankOf(spec.id),
          enabled: () => passives.value.points > 0 && passives.rankOf(spec.id) < spec.maxRank,
          onSelect: () => this.spend(spec.id),
        })),
        { id: 'back', label: () => t().common.back, onSelect: () => this.close() },
      ],
    });

    this.add
      .text(width / 2, listTop + listHeight + 18, copy.temporary, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
        align: 'center',
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

    this.refreshPurse();
  }

  /** "3 / 10", or 최대 when it cannot take another. */
  private rankOf(id: (typeof ALL_PASSIVES)[number]['id']): string {
    const spec = ALL_PASSIVES.find((one) => one.id === id);
    const rank = passives.rankOf(id);
    if (spec && rank >= spec.maxRank) {
      return t().passives.maxed;
    }

    return fill(t().passives.rank, { rank, max: spec?.maxRank ?? 0 });
  }

  private spend(id: (typeof ALL_PASSIVES)[number]['id']): void {
    if (passives.spend(id)) {
      this.refreshPurse();
      this.menu.refresh();
    }
  }

  /** Gold for a shard — the slow, certain road to a point. */
  private buy(): void {
    if (passives.buyShard()) {
      this.refreshPurse();
      this.menu.refresh();
    }
  }

  private refreshPurse(): void {
    const copy = t().passives;
    const { points, shards } = passives.value;
    const purse = fill(copy.points, { points });
    const towards = fill(copy.shards, { held: shards, need: SHARD.perOrb });
    const coins = fill(copy.goldHeld, { gold: gold.value });
    this.purse.setText(
      points > 0 ? `${purse}   ·   ${towards}   ·   ${coins}` : `${towards}   ·   ${coins}`,
    );
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
