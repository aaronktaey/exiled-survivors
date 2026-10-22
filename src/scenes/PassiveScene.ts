import Phaser from 'phaser';

import {
  ALL_PASSIVES,
  COLORS,
  DEPTH,
  PASSIVES,
  PASSIVE_TREE,
  SCENES,
  SCRIM,
  TEXT,
  type PassiveId,
} from '@/config';
import { fill, passiveDetail, passiveName, t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { fitText } from '@/systems/Layout';
import { passives } from '@/systems/Passives';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

export interface PassiveSceneData {
  readonly onClose: () => void;
}

/** One line of the tree, as drawn. */
interface PassiveNode {
  readonly id: PassiveId;
  readonly x: number;
  readonly y: number;
  /** "3 / 10", inside the ring. */
  readonly rank: Phaser.GameObjects.Text;
  /** Its name, under the ring. */
  readonly name: Phaser.GameObjects.Text;
  readonly hit: Phaser.GameObjects.Arc;
}

/** One of the two buttons under the tree. */
interface PassiveButton {
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

const TITLE_Y = 34;
const PURSE_Y = 66;
/** Where the window onto the tree starts, under the purse. */
const VIEW_TOP = PURSE_Y + 22;
const FOOTER = 34;
/** The detail lines and the buttons under the tree. */
const BELOW = 54 + 44;
/** How far a press has to travel before it is a drag rather than a tap. */
const DRAG_FROM_PX = 6;

/**
 * 패시브 — what carries over between runs, as a tree.
 *
 * The root holds the points in hand; every line hangs from it or from the
 * line its `requires` names, and opens once that one holds enough ranks. A
 * ring round each node fills as its ranks are bought. Tap a node to pick it
 * and again to spend, or use 투자.
 * The shape is read off `PASSIVES`, so a new line places itself.
 *
 * The tree is drawn by a camera of its own (`treeCam`) whose viewport is the
 * window between the purse and the detail lines, so a tree bigger than the
 * screen is dragged (or wheeled) about under it rather than squeezed —
 * `setMask` does nothing under WebGL in Phaser 4, the same reason the guide
 * does this. A press that travels is a drag; only one that does not picks.
 */
export class PassiveScene extends Phaser.Scene {
  public static readonly KEY = SCENES.passives;
  /** The way out in the corner. Public so a test can press it. */
  public backButton?: BackButton;
  /** Points in hand. Public for tests. */
  public purse!: Phaser.GameObjects.Text;
  /** Every node, by its line. Public so a test can read and press one. */
  public nodes = new Map<PassiveId, PassiveNode>();
  /** What the picked node is and does. Public for tests. */
  public detail!: Phaser.GameObjects.Text;
  /** What is being pointed at: an index into the lines. */
  public focused = 0;
  /** The 투자 button. Public for tests. */
  public spendButton!: PassiveButton;
  /** The camera the tree is seen through; its scroll is where the tree has been dragged to. Public for tests. */
  public treeCam!: Phaser.Cameras.Scene2D.Camera;

  private payload!: PassiveSceneData;
  /** Everything the tree draws, seen by `treeCam` only. */
  private layer!: Phaser.GameObjects.Container;
  /** The window onto the tree, on screen. */
  private view = new Phaser.Geom.Rectangle();
  /** What the tree covers, its names included, in its own space. */
  private bounds = new Phaser.Geom.Rectangle();
  /** A press on the tree: where it started, and the scroll then. */
  private dragFrom: { x: number; y: number; scrollX: number; scrollY: number } | null = null;
  /** Whether the press now ending travelled far enough to be a drag. */
  private dragged = false;
  private drawn!: Phaser.GameObjects.Graphics;
  private rootPoints!: Phaser.GameObjects.Text;
  private root = { x: 0, y: 0, r: 0 };
  private radius: number = PASSIVE_TREE.nodeRadius;
  /** Lying on its side, the root on the left: a wide window. */
  private sideways = false;
  /** The line 투자 acts on: the last node picked, kept while the shop is pointed at. */
  private picked: PassiveId = ALL_PASSIVES[0]!.id;

  public constructor() {
    super(PassiveScene.KEY);
  }

  public init(data: PassiveSceneData): void {
    this.payload = data;
    this.nodes = new Map();
    this.focused = 0;
    this.picked = ALL_PASSIVES[0]!.id;
    this.dragFrom = null;
    this.dragged = false;
  }

  public create(): void {
    this.backButton = addBackButton(this, () => this.close());
    const { width, height } = this.scale;
    const copy = t().passives;
    const text = (x: number, y: number, value: string, size: string, color: string) =>
      this.add
        .text(x, y, value, { fontFamily: 'system-ui, sans-serif', fontSize: size, color })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 2);

    this.add.rectangle(0, 0, width, height, 0x05070b, SCRIM.reading).setOrigin(0, 0).setDepth(DEPTH.ui);
    fitText(text(width / 2, TITLE_Y, copy.title, TEXT.size.screen, COLORS.text), width - 220);

    this.purse = text(width / 2, PURSE_Y, '', TEXT.size.hint, COLORS.gearText);

    const below = height - FOOTER - 8 - BELOW;
    this.view.setTo(8, VIEW_TOP, width - 16, below - VIEW_TOP - 4);
    // A faint frame says where the tree can be moved about.
    this.add
      .graphics()
      .setDepth(DEPTH.ui + 1)
      .lineStyle(1, COLORS.panelEdge, 0.8)
      .strokeRoundedRect(this.view.x, this.view.y, this.view.width, this.view.height, 10);
    this.layer = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    this.layOut(this.view);
    this.detail = this.add
      .text(width / 2, below + 8, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.text,
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 2);

    const buttonY = below + 54 + 20;
    const buttonW = Math.min(220, Math.floor((width - 48) / 2));
    // The shop beside it went with the 신성한 조각 (0.83).
    this.spendButton = this.button(width / 2, buttonY, buttonW, copy.spend, () => this.spend(this.picked));

    fitText(
      text(width / 2, height - FOOTER / 2, prefersTouchControls() ? copy.hintTouch : copy.hintKeyboard, TEXT.size.hint, COLORS.muted),
      width,
    );

    // The tree's own camera: the main one leaves the tree out, this one sees nothing else.
    this.cameras.main.ignore(this.layer);
    this.treeCam = this.cameras.add(this.view.x, this.view.y, this.view.width, this.view.height);
    this.treeCam.ignore(this.children.list.filter((child) => child !== this.layer));
    this.treeCam.setScroll(...this.startScroll());

    this.armKeys();
    this.armDrag();
    this.refresh();
  }

  /** Moves the tree under its window by this much, as a drag would. Public so a test can. */
  public pan(dx: number, dy: number): void {
    this.scrollTo(this.treeCam.scrollX - dx, this.treeCam.scrollY - dy);
  }

  /**
   * Where the scroll may go on one axis: a tree that fits slides about
   * inside the window, one that does not can be dragged until either edge
   * shows — never off the window altogether.
   */
  private static range(low: number, high: number, size: number): [number, number] {
    const margin = PASSIVE_TREE.dragMargin;
    const a = low - margin;
    const b = high + margin - size;
    return [Math.min(a, b), Math.max(a, b)];
  }

  private scrollTo(x: number, y: number): void {
    const [x0, x1] = PassiveScene.range(this.bounds.left, this.bounds.right, this.view.width);
    const [y0, y1] = PassiveScene.range(this.bounds.top, this.bounds.bottom, this.view.height);
    this.treeCam.setScroll(Phaser.Math.Clamp(x, x0, x1), Phaser.Math.Clamp(y, y0, y1));
  }

  /**
   * Where the tree is first seen: centred when it fits; when it does not,
   * from the root's end, with the root in the middle across.
   */
  private startScroll(): [number, number] {
    const { view, bounds, root } = this;
    const axis = (low: number, high: number, size: number, rootAt: number, along: boolean): number => {
      const [from, to] = PassiveScene.range(low, high, size);
      if (high - low <= size) {
        return (low + high) / 2 - size / 2;
      }
      return along ? Math.min(from, to) : Phaser.Math.Clamp(rootAt - size / 2, from, to);
    };
    return [
      axis(bounds.left, bounds.right, view.width, root.x, this.sideways),
      axis(bounds.top, bounds.bottom, view.height, root.y, !this.sideways),
    ];
  }

  /** Keeps a node the keyboard moved onto inside the window. */
  private showNode(id: PassiveId): void {
    const node = this.nodes.get(id);
    if (!node) {
      return;
    }
    const margin = this.radius + 30;
    const cam = this.treeCam;
    let { scrollX: x, scrollY: y } = cam;
    x = Math.min(x, node.x - margin);
    x = Math.max(x, node.x + margin - this.view.width);
    y = Math.min(y, node.y - margin);
    y = Math.max(y, node.y + margin - this.view.height);
    this.scrollTo(x, y);
  }

  /** A press on the tree's window that travels drags the tree; the wheel moves it too. */
  private armDrag(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.dragged = false;
      this.dragFrom = this.view.contains(pointer.x, pointer.y)
        ? { x: pointer.x, y: pointer.y, scrollX: this.treeCam.scrollX, scrollY: this.treeCam.scrollY }
        : null;
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      const from = this.dragFrom;
      if (!from || !pointer.isDown) {
        return;
      }
      const dx = pointer.x - from.x;
      const dy = pointer.y - from.y;
      if (!this.dragged && Math.hypot(dx, dy) < DRAG_FROM_PX) {
        return;
      }
      this.dragged = true;
      this.scrollTo(from.scrollX - dx, from.scrollY - dy);
    });
    const release = (): void => {
      this.dragFrom = null;
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer, _over: unknown, dx: number, dy: number) => {
        if (this.view.contains(pointer.x, pointer.y)) {
          this.scrollTo(this.treeCam.scrollX + dx, this.treeCam.scrollY + dy);
        }
      },
    );
  }

  /** What a tap on a node does: the first picks it, the next spends. Public so a test can tap. */
  public press(id: PassiveId): void {
    const index = ALL_PASSIVES.findIndex((spec) => spec.id === id);
    if (this.focused === index) {
      this.spend(id);
      return;
    }
    this.point(index);
  }

  /** A point into a line. Public so a test can. */
  public spend(id: PassiveId): void {
    this.picked = id;
    this.focused = ALL_PASSIVES.findIndex((spec) => spec.id === id);
    passives.spend(id);
    this.refresh();
  }

  /**
   * Where each node sits, in the tree's own space (0, 0 is the window's top
   * left). Upright, the root is on top and each depth a row under it; on a
   * wide window it lies on its side, the root on the left. Leaves are spread
   * evenly and a parent sits level with its children. The spacing shrinks to
   * fit the window, but never below PASSIVE_TREE's least gaps: past that the
   * tree runs off the window and is dragged.
   */
  private layOut(view: Phaser.Geom.Rectangle): void {
    const { width } = view;
    const top = 0;
    this.drawn = this.add.graphics();
    this.layer.add(this.drawn);
    const children = (parent: PassiveId | null) =>
      ALL_PASSIVES.filter((spec) => (spec.requires?.id ?? null) === parent).map((spec) => spec.id);
    const depth = new Map<PassiveId, number>();
    const slot = new Map<PassiveId, number>();
    let leaves = 0;
    const place = (id: PassiveId, at: number): number => {
      depth.set(id, at);
      const under = children(id);
      if (under.length === 0) {
        slot.set(id, leaves++);
      } else {
        const spots = under.map((child) => place(child, at + 1));
        slot.set(id, (spots[0]! + spots[spots.length - 1]!) / 2);
      }
      return slot.get(id)!;
    };
    children(null).forEach((id) => place(id, 1));

    const levels = Math.max(1, ...depth.values()) + 1;
    const spread = Math.max(1, leaves);
    const room = view.height;
    this.sideways = width > room * 1.4;
    // A level and a leaf: how far apart, along the tree and across it.
    const fitGap = (wanted: number, most: number, least: number) => Math.max(least, Math.min(most, wanted));
    const levelGap = this.sideways
      ? fitGap((width - 64) / levels, PASSIVE_TREE.maxLevelGap * 1.6, PASSIVE_TREE.minLevelGap)
      : fitGap(room / levels, PASSIVE_TREE.maxLevelGap, PASSIVE_TREE.minLevelGap);
    const leafGap = this.sideways
      ? fitGap(room / spread, PASSIVE_TREE.maxLevelGap, PASSIVE_TREE.minLeafGap)
      : fitGap((width - 32) / spread, PASSIVE_TREE.maxLevelGap * 1.6, PASSIVE_TREE.minLeafGap);
    this.radius = Math.max(
      16,
      Math.min(PASSIVE_TREE.nodeRadius, (this.sideways ? leafGap : levelGap) * 0.3, (this.sideways ? levelGap : leafGap) * 0.32),
    );
    const treeH = this.sideways ? leafGap * spread : levelGap * levels;
    const treeTop = top + Math.max(0, (room - treeH) / 2);
    const at = (level: number, leaf: number) =>
      this.sideways
        ? { x: (width - levelGap * levels) / 2 + levelGap * (level + 0.5), y: treeTop + leafGap * (leaf + 0.5) - 8 }
        : { x: (width - leafGap * spread) / 2 + leafGap * (leaf + 0.5), y: treeTop + levelGap * (level + 0.5) - 8 };

    this.root = { ...at(0, (spread - 1) / 2), r: this.radius * PASSIVE_TREE.rootScale };
    // The root says what it holds inside it, so a branch leaves straight from its rim.
    const rootLabel = this.add
      .text(this.root.x, this.root.y - this.root.r * 0.32, t().passives.root, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.muted,
      })
      .setOrigin(0.5);
    fitText(rootLabel, this.root.r * 2 - 10, 0);
    this.rootPoints = this.add
      .text(this.root.x, this.root.y + this.root.r * 0.22, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
      .setOrigin(0.5);
    this.layer.add([rootLabel, this.rootPoints]);

    ALL_PASSIVES.forEach((spec) => {
      const { x, y } = at(depth.get(spec.id)!, slot.get(spec.id)!);
      const rank = this.add
        .text(x, y, '', { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text })
        .setOrigin(0.5);
      const name = this.add
        .text(x, y + this.radius + 6, passiveName(spec.id), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.text,
        })
        .setOrigin(0.5, 0);
      fitText(name, (this.sideways ? levelGap : leafGap) - 4, 0);
      const hit = this.add.circle(x, y, this.radius + 6, 0x000000, 0.001).setInteractive({ useHandCursor: true });
      // On the release, and only when the press did not travel: a drag that
      // starts or ends on a node is still a drag.
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (!this.dragged) {
          this.press(spec.id);
        }
      });
      this.layer.add([rank, name, hit]);
      this.nodes.set(spec.id, { id: spec.id, x, y, rank, name, hit });
    });

    // What the tree covers, the names under the nodes included.
    const spots = [{ x: this.root.x, y: this.root.y, r: this.root.r }, ...[...this.nodes.values()].map((n) => ({ x: n.x, y: n.y, r: this.radius }))];
    const reach = (this.sideways ? levelGap : leafGap) / 2;
    const left = Math.min(...spots.map((p) => p.x - Math.max(p.r, reach)));
    const right = Math.max(...spots.map((p) => p.x + Math.max(p.r, reach)));
    const upper = Math.min(...spots.map((p) => p.y - p.r - 4));
    const lower = Math.max(...spots.map((p) => p.y + p.r + 26));
    this.bounds.setTo(left, upper, right - left, lower - upper);
  }

  private button(x: number, y: number, w: number, label: string, onPress: () => void): PassiveButton {
    const plate = this.add
      .rectangle(x, y, w, 38, COLORS.panel, 1)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setDepth(DEPTH.ui + 1)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.hint, color: COLORS.text })
      .setOrigin(0.5)
      .setDepth(DEPTH.ui + 2);
    fitText(text, w - 12, 0);
    plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, onPress);
    return { plate, label: text };
  }

  private point(index: number): void {
    this.focused = index;
    const spec = ALL_PASSIVES[index];
    if (spec) {
      this.picked = spec.id;
    }
    this.refresh();
  }

  /** Whether a point could go into a line right now. */
  private static buyable(id: PassiveId): boolean {
    return passives.value.points > 0 && passives.isOpen(id) && passives.rankOf(id) < PASSIVES[id].maxRank;
  }

  private refresh(): void {
    const copy = t().passives;
    const g = this.drawn.clear();
    const { points } = passives.value;

    // Branches first, under the nodes: lit where a rank went in, faint where shut.
    // Where a branch leaves a node (under its name, or off its right side
    // lying down) and where it arrives (its top, or its left side).
    const centre = (id: PassiveId | undefined) => {
      const node = id ? this.nodes.get(id) : undefined;
      return node
        ? { x: node.x, y: node.y, r: this.radius, below: node.name.y + node.name.displayHeight + 3 }
        : { ...this.root, below: this.root.y + this.root.r + 4 };
    };
    for (const spec of ALL_PASSIVES) {
      const from = centre(spec.requires?.id);
      const to = centre(spec.id);
      const color = passives.rankOf(spec.id) > 0
        ? PASSIVE_TREE.edgeLit
        : passives.isOpen(spec.id)
          ? PASSIVE_TREE.edgeOpen
          : PASSIVE_TREE.edgeShut;
      g.lineStyle(PASSIVE_TREE.edgeWidth, color, 1);
      g.beginPath();
      if (this.sideways) {
        const bend = (from.x + from.r + to.x - to.r) / 2;
        g.moveTo(from.x + from.r + 4, from.y);
        g.lineTo(bend, from.y);
        g.lineTo(bend, to.y);
        g.lineTo(to.x - to.r - 4, to.y);
      } else {
        const bend = (from.below + to.y - to.r - 4) / 2;
        g.moveTo(from.x, from.below);
        g.lineTo(from.x, bend);
        g.lineTo(to.x, bend);
        g.lineTo(to.x, to.y - to.r - 4);
      }
      g.strokePath();
    }

    // The root: the points in hand.
    g.fillStyle(COLORS.panel, 1);
    g.fillCircle(this.root.x, this.root.y, this.root.r);
    g.lineStyle(3, points > 0 ? PASSIVE_TREE.buyable : COLORS.panelEdge, 1);
    g.strokeCircle(this.root.x, this.root.y, this.root.r);
    this.rootPoints.setText(String(points));

    ALL_PASSIVES.forEach((spec, index) => {
      const node = this.nodes.get(spec.id)!;
      const rank = passives.rankOf(spec.id);
      const open = passives.isOpen(spec.id);
      const focused = index === this.focused;
      const alpha = open || rank > 0 ? 1 : PASSIVE_TREE.shutAlpha;
      const r = this.radius;

      g.fillStyle(focused ? COLORS.panelActive : COLORS.panel, 1);
      g.fillCircle(node.x, node.y, r);
      g.lineStyle(PASSIVE_TREE.ringWidth, PASSIVE_TREE.ringTrack, alpha);
      g.strokeCircle(node.x, node.y, r - PASSIVE_TREE.ringWidth / 2);
      if (rank > 0) {
        const start = -Math.PI / 2;
        g.lineStyle(PASSIVE_TREE.ringWidth, PASSIVE_TREE.ringFill, alpha);
        g.beginPath();
        g.arc(node.x, node.y, r - PASSIVE_TREE.ringWidth / 2, start, start + (Math.PI * 2 * rank) / spec.maxRank, false);
        g.strokePath();
      }
      const edge = focused ? COLORS.textFill : PassiveScene.buyable(spec.id) ? PASSIVE_TREE.buyable : COLORS.panelEdge;
      g.lineStyle(focused ? 3 : 2, edge, alpha);
      g.strokeCircle(node.x, node.y, r + 3);

      node.rank.setText(rank >= spec.maxRank ? copy.maxed : fill(copy.rank, { rank, max: spec.maxRank }));
      fitText(node.rank.setScale(1), r * 2 - PASSIVE_TREE.ringWidth * 2 - 4, 0);
      node.rank.setAlpha(alpha);
      node.name.setAlpha(alpha);
    });

    // What the picked line is, and why it can or cannot take a point.
    const spec = PASSIVES[this.picked];
    const rank = passives.rankOf(spec.id);
    const needs = spec.requires;
    const status = !passives.isOpen(spec.id) && needs
      ? fill(copy.locked, { name: passiveName(needs.id), rank: needs.rank })
      : rank >= spec.maxRank
        ? copy.maxed
        : points <= 0
          ? copy.noPoints
          : '';
    const head = `${passiveName(spec.id)}  ${fill(copy.rank, { rank, max: spec.maxRank })}`;
    const what = fill(copy.perRank, { detail: passiveDetail(spec.id) });
    // Two lines at most, drawn smaller rather than wrapped onto the buttons.
    this.detail.setScale(1).setText(status ? `${head} · ${what}\n${status}` : `${head} · ${what}`);
    fitText(this.detail, this.scale.width - 24, 0);

    // Points in hand, when there are any (gold went in 0.90).
    const parts = points > 0 ? [fill(copy.points, { points })] : [];
    this.purse.setText(parts.join('   ·   '));
    fitText(this.purse.setScale(1), this.scale.width - 40);

    const paint = (button: PassiveButton, on: boolean, focused: boolean) => {
      button.plate.setFillStyle(focused ? COLORS.panelActive : COLORS.panel, 1);
      button.plate.setStrokeStyle(focused ? 3 : 2, focused ? COLORS.textFill : on ? PASSIVE_TREE.buyable : COLORS.panelEdge, 1);
      button.label.setAlpha(on ? 1 : 0.45);
    };
    paint(this.spendButton, PassiveScene.buyable(this.picked), false);
  }

  /** Arrows between nodes by where they sit (the shop is under them), Space to act, Esc out. */
  private armKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    // Nodes where they are on screen now, wherever the tree has been dragged.
    const spots = (): { x: number; y: number }[] => [
      ...ALL_PASSIVES.map((spec) => {
        const node = this.nodes.get(spec.id)!;
        return { x: this.view.x + node.x - this.treeCam.scrollX, y: this.view.y + node.y - this.treeCam.scrollY };
      }),
    ];
    const step = (dx: number, dy: number): void => {
      const all = spots();
      const here = all[this.focused]!;
      let best = -1;
      let bestScore = Infinity;
      all.forEach((spot, index) => {
        const along = (spot.x - here.x) * dx + (spot.y - here.y) * dy;
        const across = Math.abs((spot.x - here.x) * dy) + Math.abs((spot.y - here.y) * dx);
        if (index === this.focused || along <= 4) {
          return;
        }
        const score = along + across * 2;
        if (score < bestScore) {
          bestScore = score;
          best = index;
        }
      });
      if (best >= 0) {
        this.point(best);
        const spec = ALL_PASSIVES[best];
        if (spec) {
          this.showNode(spec.id);
        }
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      switch (event.code) {
        case 'ArrowLeft':
        case 'KeyA':
          step(-1, 0);
          break;
        case 'ArrowRight':
        case 'KeyD':
          step(1, 0);
          break;
        case 'ArrowUp':
        case 'KeyW':
          step(0, -1);
          break;
        case 'ArrowDown':
        case 'KeyS':
          step(0, 1);
          break;
        case 'Space':
        case 'Enter':
        case 'NumpadEnter': {
          const spec = ALL_PASSIVES[this.focused];
          if (spec) {
            this.spend(spec.id);
          }
          break;
        }
        case 'Escape':
          this.close();
          break;
        default:
          return;
      }
      event.preventDefault?.();
    };
    keyboard.on('keydown', onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => keyboard.off('keydown', onKey));
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}
