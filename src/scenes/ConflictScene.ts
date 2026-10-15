import Phaser from 'phaser';

import { COLORS, DEPTH, MENU, SCENES, SCRIM, TEXT } from '@/config';
import { fill, t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { cloudSave, summarize, type SaveData } from '@/systems/CloudSave';
import { centredTop, fitText, fitWidth } from '@/systems/Layout';
import { MenuList } from '@/systems/MenuList';

export interface ConflictSceneData {
  readonly onClose: () => void;
}

const CARD_WIDTH = 230;
const CARD_HEIGHT = 176;

/**
 * 어느 기록을 쓸까요 — this browser and the account each hold records, and
 * they differ. Both are read out side by side, swords to saved run, and the
 * player keeps one. The other is gone, which is why it is asked at all.
 * Putting it off leaves syncing paused until it is answered.
 */
export class ConflictScene extends Phaser.Scene {
  public static readonly KEY = SCENES.conflict;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;
  /** The rows. Public so a test can drive them. */
  public menu!: MenuList;
  /** The two read-outs, and the name over each. Public for tests. */
  public cards: Phaser.GameObjects.Text[] = [];
  public headings: Phaser.GameObjects.Text[] = [];

  private payload!: ConflictSceneData;

  public constructor() {
    super(ConflictScene.KEY);
  }

  public init(data: ConflictSceneData): void {
    this.payload = data;
    this.cards = [];
    this.headings = [];
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    const copy = t().conflict;
    const conflict = cloudSave.conflict;
    const step = MENU.buttonHeight + MENU.buttonGap;
    const side = width >= CARD_WIDTH * 2 + 60;
    const cardsHeight = side ? CARD_HEIGHT : CARD_HEIGHT * 2 + 12;
    const top = centredTop(height, MENU.titleBlockHeight + 60 + cardsHeight + 24 + step * 3);

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);
    fitText(
      this.add
        .text(width / 2, top + 16, copy.title, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.screen,
          color: COLORS.text,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width,
    );
    this.add
      .text(width / 2, top + MENU.titleBlockHeight + 20, copy.lead, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.muted,
        align: 'center',
        wordWrap: { width: fitWidth(560, width) },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    const cardsTop = top + MENU.titleBlockHeight + 60;
    const at = (index: number): { x: number; y: number } =>
      side
        ? { x: width / 2 + (index === 0 ? -1 : 1) * (CARD_WIDTH / 2 + 10), y: cardsTop + CARD_HEIGHT / 2 }
        : { x: width / 2, y: cardsTop + CARD_HEIGHT / 2 + index * (CARD_HEIGHT + 12) };
    this.card(at(0), copy.device, conflict?.local ?? {});
    this.card(at(1), copy.cloud, conflict?.server ?? {});

    this.menu = new MenuList(this, {
      x: width / 2,
      y: cardsTop + cardsHeight + 24 + MENU.buttonHeight / 2,
      width: 380,
      onCancel: () => this.close(),
      items: [
        { id: 'device', label: () => copy.useDevice, onSelect: () => void this.keep('local') },
        { id: 'cloud', label: () => copy.useCloud, onSelect: () => void this.keep('server') },
        { id: 'later', label: () => copy.later, onSelect: () => this.close() },
      ],
    });
  }

  /** One side's records, read out on a bordered card. */
  private card(at: { x: number; y: number }, heading: string, data: SaveData): void {
    const copy = t().conflict;
    const s = summarize(data);
    this.add
      .rectangle(at.x, at.y, CARD_WIDTH, CARD_HEIGHT, COLORS.panel, 0.92)
      .setStrokeStyle(2, COLORS.gear, 1)
      .setDepth(DEPTH.ui + 1);
    const title = this.add
      .text(at.x, at.y - CARD_HEIGHT / 2 + 20, heading, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.label,
        color: COLORS.gearText,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    this.headings.push(title);
    const text = this.add
      .text(
        at.x,
        at.y + 14,
        [
          fill(copy.swords, { n: s.swords }),
          fill(copy.passives, { n: s.passiveRanks, points: s.points }),
          fill(copy.orbs, { n: s.orbs }),
          fill(copy.bones, { n: s.bones }),
          s.savedRun ? copy.savedRun : copy.noSavedRun,
        ].join('\n'),
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.small,
          color: COLORS.text,
          align: 'center',
          lineSpacing: 4,
        },
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    this.cards.push(text);
  }

  private async keep(which: 'local' | 'server'): Promise<void> {
    await cloudSave.resolve(which);
    // Keeping the account's reloads the page; keeping this device's goes on.
    this.close();
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
