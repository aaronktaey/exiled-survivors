import Phaser from 'phaser';

import { ACCOUNT, COLORS, DEPTH, RANKING, SCENES, SCRIM, TEXT } from '@/config';
import { fill, t } from '@/i18n';
import { account, accountRequest } from '@/systems/Account';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { fitText } from '@/systems/Layout';
import { flagTexture, rankLabel, ranking } from '@/systems/Ranking';

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
  private layout!: {
    tableWidth: number;
    rowHeight: number;
    fontSize: string;
    columns: { place: number; flag: number; name: number; damage: number };
  };
  /** Everything the board's rows draw, so they can be drawn again. */
  private board?: Phaser.GameObjects.Container;
  private note!: Phaser.GameObjects.Text;
  /** The account's own best, once it is known. */
  private mine = '';
  private loading = false;

  public constructor() {
    super(RankingScene.KEY);
  }

  public init(data: RankingSceneData): void {
    this.payload = data;
    this.rows = [];
    // The scene outlives a launch, and someone else may be signed in now.
    this.mine = '';
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
    const columns = { place: left + 36, flag: left + 50, name: left + 84, damage: left + tableWidth };

    const head = (x: number, text: string, origin: number) =>
      this.add
        .text(x, HEAD_Y, text, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.muted })
        .setOrigin(origin, 0.5)
        .setDepth(DEPTH.ui + 1);
    head(columns.place, copy.place, 1);
    head(columns.flag, copy.name, 0);
    head(columns.damage, copy.damage, 1);

    this.layout = { tableWidth, rowHeight, fontSize, columns };
    this.note = this.add
      .text(width / 2, height - FOOTER / 2, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 1);

    // This device's board at once, and the shared one folded in when it
    // arrives — the rows are drawn again then, not the whole screen.
    this.drawBoard();
    this.loading = RANKING.shared.enabled;
    this.drawNote();
    const unwatch = ranking.onChange(() => {
      this.loading = false;
      this.drawBoard();
      this.drawNote();
    });
    void ranking.refresh().then(() => {
      if (this.scene.isActive()) {
        this.loading = false;
        this.drawNote();
      }
    });
    void this.lookUpMine();

    this.input.keyboard?.on('keydown-ESC', this.close, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      unwatch();
      this.input.keyboard?.off('keydown-ESC', this.close, this);
    });
  }

  /** The rows, from the store as it stands. */
  private drawBoard(): void {
    const { width } = this.scale;
    const copy = t().ranking;
    const { tableWidth, rowHeight, fontSize, columns } = this.layout;

    this.board?.destroy();
    this.board = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    this.rows = [];

    const top = ranking.top;
    if (top.length === 0) {
      this.board.add(
        this.add
          .text(width / 2, HEAD_Y + 60, copy.empty, {
            fontFamily: 'system-ui, sans-serif',
            fontSize: TEXT.size.body,
            color: COLORS.muted,
            align: 'center',
            wordWrap: { width: tableWidth },
          })
          .setOrigin(0.5, 0),
      );
    }

    top.forEach((entry, index) => {
      const place = index + 1;
      const y = HEAD_Y + 24 + index * rowHeight + rowHeight / 2;
      const lit = place === this.payload.highlight;
      // First place in gold; a place just entered in the accent colour.
      const color = lit ? COLORS.accent : place === 1 ? COLORS.gearText : COLORS.text;

      if (lit) {
        this.board!.add(this.add.rectangle(width / 2, y, tableWidth + 12, rowHeight, COLORS.panelActive, 1));
      }

      const cell = (x: number, text: string, origin: number) =>
        this.add
          .text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize, color })
          .setOrigin(origin, 0.5);
      const row = [
        cell(columns.place, String(place), 1),
        cell(columns.name, rankLabel(entry), 0),
        cell(columns.damage, grouped(entry.damage), 1),
      ];
      this.board!.add(row);
      if (entry.flag) {
        const h = Math.min(18, rowHeight - 4);
        this.board!.add(
          this.add.image(columns.flag, y, flagTexture(entry.flag)).setOrigin(0, 0.5).setDisplaySize(h * 1.5, h),
        );
      }
      this.rows.push(row);
    });
  }

  /** Where the board came from: shared, still coming, or this device only. */
  private drawNote(): void {
    const copy = t().ranking;
    const text = !RANKING.shared.enabled
      ? copy.localNote
      : this.loading
        ? copy.loadingNote
        : ranking.source === 'shared'
          ? copy.sharedNote
          : copy.offlineNote;
    this.note.setText(this.mine ? `${text}   ·   ${this.mine}` : text);
    fitText(this.note, this.scale.width - 16);
  }

  /** The signed-in account's own best, beside the note: where it stands, on the board or off it. */
  private async lookUpMine(): Promise<void> {
    if (!ACCOUNT.enabled || !RANKING.shared.enabled || !account.signedIn) {
      return;
    }
    const reply = await accountRequest('/api/ranking/me', { cache: 'no-store' });
    const body = reply.body as { best?: { damage?: number } | null; place?: number | null } | null;
    if (!reply.ok || !body || !this.scene.isActive()) {
      return;
    }
    const copy = t().ranking;
    this.mine = body.best
      ? fill(copy.mine, { place: body.place ?? 0, damage: Math.round(body.best.damage ?? 0).toLocaleString('en-US') })
      : copy.mineNone;
    this.drawNote();
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
