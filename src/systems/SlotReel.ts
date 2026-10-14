import Phaser from 'phaser';

import { COLORS, SLOT, TEXT } from '@/config';

/** One thing the reel can land on. */
export interface SlotItem {
  readonly label: string;
  /** A texture to draw beside the label, when there is one. */
  readonly icon?: string;
}

export interface SlotReelOptions {
  readonly width: number;
  /** Height of one row; the window shows `visibleRows` of them. */
  readonly rowHeight: number;
  /** Odd, so one row sits dead centre. */
  readonly visibleRows: number;
  readonly iconSize: number;
  readonly depth: number;
}

type ReelState = 'spinning' | 'stopping' | 'stopped';

/**
 * A slot-machine reel: the items, in order, turning from the top of a window
 * to the bottom, round and round.
 *
 * `stop(index)` slows it over SLOT.stopMs and lands it exactly on `index`.
 * The slowing is one smooth curve that starts at the speed it was turning
 * and ends at rest, chosen so the distance it covers comes out on the right
 * row — the reel never jumps, never speeds up and never creeps back.
 *
 * It knows nothing about skills: anything that wants a spin hands it labels
 * and icons and is told which one it stopped on. Its owner calls `update`
 * every frame.
 */
export class SlotReel {
  /** Everything the reel draws. Public for layout. */
  public readonly container: Phaser.GameObjects.Container;

  private readonly items: readonly SlotItem[];
  private readonly options: SlotReelOptions;
  private readonly rows: { readonly icon?: Phaser.GameObjects.Image; readonly text: Phaser.GameObjects.Text; readonly holder: Phaser.GameObjects.Container }[] = [];

  /** Rows travelled, as a float. The item at the centre is `round(pos) mod n`. */
  private pos = 0;
  private state: ReelState = 'spinning';
  private speed: number;

  // The stop, once it has been asked for.
  private stopFrom = 0;
  private stopDistance = 0;
  private stopBend = 0;
  private stopElapsed = 0;
  private stopTarget = 0;
  private onStopped?: (index: number) => void;

  public constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    items: readonly SlotItem[],
    options: SlotReelOptions,
  ) {
    this.items = items;
    this.options = options;

    // Fast enough that the slowing curve can always land on the right row
    // without ever speeding up or running backwards: a stop may have to
    // cover up to half a lap (plus rounding) more or less than an even
    // slowdown would, and the curve absorbs that only while the reel turns
    // at least 3(n + 1) rows over the stop.
    const n = Math.max(1, items.length);
    this.speed = Math.max(SLOT.spinRowsPerSec, (3 * (n + 1)) / (SLOT.stopMs / 1000));
    // Start somewhere random, so two spins do not open on the same row.
    this.pos = Math.random() * n;

    this.container = scene.add.container(x, y).setDepth(options.depth);

    const windowHeight = options.rowHeight * options.visibleRows;
    const frame = scene.add
      .rectangle(0, 0, options.width, windowHeight, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1);
    this.container.add(frame);

    // Enough rows to fill the window and one spare above and below, reused
    // as the reel turns: what a row shows is rewritten when it wraps.
    for (let i = 0; i < options.visibleRows + 2; i++) {
      const holder = scene.add.container(0, 0);
      const text = scene.add
        .text(0, 0, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.panel,
          color: COLORS.text,
        })
        .setOrigin(0, 0.5);
      holder.add(text);

      let icon: Phaser.GameObjects.Image | undefined;
      if (items.some((item) => item.icon)) {
        icon = scene.add.image(0, 0, '__DEFAULT').setDisplaySize(options.iconSize, options.iconSize);
        holder.add(icon);
      }

      this.container.add(holder);
      this.rows.push({ icon, text, holder });
    }

    // The pay line: an outline round the centre row.
    const line = scene.add
      .rectangle(0, 0, options.width - 4, options.rowHeight, COLORS.accentFill, 0)
      .setStrokeStyle(3, COLORS.accentFill, 1);
    this.container.add(line);

    this.layout();
  }

  /** The item at the centre row right now. */
  public get centred(): number {
    const n = this.items.length;
    return (((Math.round(this.pos) % n) + n) % n);
  }

  public get isSpinning(): boolean {
    return this.state === 'spinning';
  }

  public get isStopped(): boolean {
    return this.state === 'stopped';
  }

  /** Rows per second right now. Public so a test can watch it slow. */
  public get velocity(): number {
    if (this.state === 'spinning') {
      return this.speed;
    }
    if (this.state === 'stopped') {
      return 0;
    }

    const u = Math.min(1, this.stopElapsed / SLOT.stopMs);
    return this.speed * (1 - u) + this.stopBend * u * (1 - u);
  }

  /**
   * Slows to a stop on `index` over SLOT.stopMs. Called once; later calls
   * are ignored, so a second press of the button cannot move the result.
   */
  public stop(index: number, onStopped?: (index: number) => void): void {
    if (this.state !== 'spinning' || this.items.length === 0) {
      return;
    }

    const n = this.items.length;
    const T = SLOT.stopMs / 1000;
    // An even slowdown from `speed` to rest covers speed * T / 2 rows. Pick
    // the landing row nearest that, then bend the curve by the difference.
    const even = (this.speed * T) / 2;
    const target = ((index % n) + n) % n;
    let landing = Math.round(this.pos + even);
    landing += (((target - landing) % n) + n) % n;
    if (landing - this.pos - even > n / 2) {
      landing -= n;
    }

    this.stopFrom = this.pos;
    this.stopDistance = landing - this.pos;
    // v(u) = speed (1 - u) + bend u (1 - u) integrates to the distance over T.
    this.stopBend = (6 * (this.stopDistance - even)) / T;
    this.stopElapsed = 0;
    this.stopTarget = target;
    this.onStopped = onStopped;
    this.state = 'stopping';
  }

  public update(delta: number): void {
    if (this.state === 'spinning') {
      this.pos += (this.speed * delta) / 1000;
    } else if (this.state === 'stopping') {
      this.stopElapsed = Math.min(SLOT.stopMs, this.stopElapsed + delta);
      const T = SLOT.stopMs / 1000;
      const u = this.stopElapsed / SLOT.stopMs;
      // The integral of v(u) above, times T.
      this.pos =
        this.stopFrom +
        T * (this.speed * (u - (u * u) / 2) + this.stopBend * ((u * u) / 2 - (u * u * u) / 3));

      if (this.stopElapsed >= SLOT.stopMs) {
        this.pos = this.stopFrom + this.stopDistance;
        this.state = 'stopped';
        this.layout();
        this.onStopped?.(this.stopTarget);
        return;
      }
    } else {
      return;
    }

    this.layout();
  }

  public destroy(): void {
    this.container.destroy();
  }

  /**
   * Places each row. Row k sits at (pos - k) rows below the centre, so as
   * pos grows every row slides down and the next item comes in at the top.
   */
  private layout(): void {
    const n = this.items.length;
    if (n === 0) {
      return;
    }

    const { rowHeight, visibleRows, iconSize } = this.options;
    const half = Math.floor(visibleRows / 2) + 1;
    const base = Math.floor(this.pos);

    this.rows.forEach((row, slot) => {
      // Slots cover k = base - half .. base + half.
      const k = base - half + slot;
      const item = this.items[((k % n) + n) % n]!;
      row.holder.setY((this.pos - k) * rowHeight);

      if (row.text.text !== item.label) {
        row.text.setText(item.label);
      }

      const gap = item.icon ? iconSize + 10 : 0;
      const width = row.text.width + gap;
      row.text.setX(-width / 2 + gap);
      if (row.icon) {
        row.icon.setVisible(item.icon !== undefined);
        if (item.icon && row.icon.texture.key !== item.icon) {
          row.icon.setTexture(item.icon).setDisplaySize(iconSize, iconSize);
        }
        row.icon.setX(-width / 2 + iconSize / 2);
      }

      // No mask in Phaser 4's WebGL, so the window is made by fading: a row
      // dims as it leaves the centre and is gone by the frame's edge.
      const edge = visibleRows / 2;
      const distance = Math.abs(this.pos - k);
      row.holder.setVisible(distance < edge);
      row.holder.setAlpha(Phaser.Math.Clamp(1 - (distance / edge) ** 2, 0, 1));
    });
  }
}
