import Phaser from 'phaser';

import { COLORS, DEPTH, RANKING, SCENES, SCRIM, TEXT } from '@/config';
import { t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { fitText } from '@/systems/Layout';
import { rankLabel, ranking } from '@/systems/Ranking';

export interface RankingSceneData {
  readonly onClose: () => void;
  /** A place to light up — the one a name was just entered at. */
  readonly highlight?: number;
}

/** "12,345" — thousands marked, because the damage number gets long. */
const grouped = (value: number): string => Math.round(value).toLocaleString('en-US');

const TITLE_Y = 34;
const HEAD_Y = 74;
const FOOTER = 52;

/**
 * 랭킹 — the best runs by damage dealt, 1 to RANKING.size, one line each:
 * the place, the name with its emoji, and the damage.
 *
 * It is this device's board for now. The rows read from the store's `top`
 * and nothing else, so when the board is shared the screen does not change.
 */
export class RankingScene extends Phaser.Scene {
  public static readonly KEY = SCENES.ranking;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;
  /** One text per row on the board, best first. Public for tests. */
  public rows: Phaser.GameObjects.Text[][] = [];

  private payload!: RankingSceneData;

  public constructor() {
    super(RankingScene.KEY);
  }

  public init(data: RankingSceneData): void {
    this.payload = data;
    this.rows = [];
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    const copy = t().ranking;

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);

    fitText(
      this.add
        .text(width / 2, TITLE_Y, copy.title, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.screen,
          color: COLORS.text,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 220,
    );

    // Twenty rows have to fit a 540-tall window lying down, so the row
    // height is whatever is left, capped at something comfortable to read.
    const tableWidth = Math.min(460, width - 32);
    const left = (width - tableWidth) / 2;
    const rowHeight = Math.min(30, (height - HEAD_Y - 24 - FOOTER) / RANKING.size);
    const fontSize = rowHeight >= 24 ? TEXT.size.body : TEXT.size.hint;
    const columns = { place: left + 36, name: left + 56, damage: left + tableWidth };

    const head = (x: number, text: string, origin: number) =>
      this.add
        .text(x, HEAD_Y, text, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
        .setOrigin(origin, 0.5)
        .setDepth(DEPTH.ui + 1);
    head(columns.place, copy.place, 1);
    head(columns.name, copy.name, 0);
    head(columns.damage, copy.damage, 1);

    const board = ranking.top;
    if (board.length === 0) {
      this.add
        .text(width / 2, HEAD_Y + 60, copy.empty, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.body,
          color: COLORS.muted,
          align: 'center',
          wordWrap: { width: tableWidth },
        })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.ui + 1);
    }

    board.forEach((entry, index) => {
      const place = index + 1;
      const y = HEAD_Y + 24 + index * rowHeight + rowHeight / 2;
      const lit = place === this.payload.highlight;
      // First place in gold; a place just entered in the accent colour.
      const color = lit ? COLORS.accent : place === 1 ? COLORS.gearText : COLORS.text;

      if (lit) {
        this.add
          .rectangle(width / 2, y, tableWidth + 12, rowHeight, COLORS.panelActive, 1)
          .setDepth(DEPTH.ui);
      }

      const cell = (x: number, text: string, origin: number) =>
        this.add
          .text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize, color })
          .setOrigin(origin, 0.5)
          .setDepth(DEPTH.ui + 1);
      this.rows.push([
        cell(columns.place, String(place), 1),
        cell(columns.name, rankLabel(entry), 0),
        cell(columns.damage, grouped(entry.damage), 1),
      ]);
    });

    fitText(
      this.add
        .text(width / 2, height - FOOTER / 2, copy.localNote, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.muted,
        })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 1),
      width - 16,
    );

    this.input.keyboard?.on('keydown-ESC', this.close, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.close, this);
    });
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
