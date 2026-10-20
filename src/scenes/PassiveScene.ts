import Phaser from 'phaser';

import {
  ALL_PASSIVE_NODES,
  COLORS,
  DEPTH,
  PASSIVE_NODES,
  PASSIVE_START,
  PASSIVE_TREE,
  TREE_SHAPE,
  SCENES,
  SCRIM,
  TEXT,
  type PassiveId,
  type PassiveNodeSpec,
} from '@/config';
import { fill, passiveLines, passiveName, t } from '@/i18n';
import { addBackButton, type BackButton } from '@/systems/BackButton';
import { fitText } from '@/systems/Layout';
import { passives } from '@/systems/Passives';
import { prefersTouchControls } from '@/systems/VirtualJoystick';
import { SKILLS } from '@/weapons/skills';

export interface PassiveSceneData {
  readonly onClose: () => void;
}

/** One node as drawn: its spot in the tree's space, its name (핵심 and 키스톤 only), what a tap lands on. */
interface DrawnNode {
  readonly spec: PassiveNodeSpec;
  readonly radius: number;
  readonly name?: Phaser.GameObjects.Text;
  readonly hit: Phaser.GameObjects.Arc;
}

interface PassiveButton {
  readonly plate: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
}

const TITLE_Y = 30;
const PURSE_Y = 58;
/** Where the window onto the tree starts, under the purse. */
const VIEW_TOP = PURSE_Y + 18;
const FOOTER = 30;
/** The detail lines and the buttons under the tree. */
const BELOW = 112;
/** How far a press has to travel before it is a drag rather than a tap. */
const DRAG_FROM_PX = 6;

/** Every tag some skill carries: a line about one no skill has yet says so. */
const LIVE_TAGS = new Set(Object.values(SKILLS).flatMap((skill) => skill.tags));

/**
 * 패시브 — the graph tree (config/passives.ts), seen through a window that
 * can be dragged and zoomed. A tap picks a node and says what it does and
 * whether it can be taken; the buttons under it take it or take it back.
 * Every link runs straight across or up and down, so an arrow key walks to
 * the node linked that way (0.72).
 *
 * The tree is drawn by a camera of its own (`treeCam`) whose viewport is
 * the window, and which zooms — `setMask` does nothing under WebGL in
 * Phaser 4, the same reason the guide does this. A press that travels is a
 * drag; only one that does not picks.
 */
export class PassiveScene extends Phaser.Scene {
  public static readonly KEY = SCENES.passives;
  public backButton?: BackButton;
  /** The points left. Public for tests. */
  public purse!: Phaser.GameObjects.Text;
  /** Every node, by id. Public so a test can read and press one. */
  public nodes = new Map<PassiveId, DrawnNode>();
  /** What the picked node is and does. Public for tests. */
  public detail!: Phaser.GameObjects.Text;
  public status!: Phaser.GameObjects.Text;
  /** The node picked. Public for tests. */
  public selected: PassiveId = PASSIVE_START;
  public takeButton!: PassiveButton;
  public refundButton!: PassiveButton;
  /** The camera the tree is seen through. Public for tests. */
  public treeCam!: Phaser.Cameras.Scene2D.Camera;

  private payload!: PassiveSceneData;
  private layer!: Phaser.GameObjects.Container;
  private edges!: Phaser.GameObjects.Graphics;
  private dots!: Phaser.GameObjects.Graphics;
  private view = new Phaser.Geom.Rectangle();
  private bounds = new Phaser.Geom.Rectangle();
  private dragFrom: { x: number; y: number; midX: number; midY: number } | null = null;
  private dragged = false;

  public constructor() {
    super(PassiveScene.KEY);
  }

  public init(data: PassiveSceneData): void {
    this.payload = data;
    this.nodes = new Map();
    this.selected = PASSIVE_START;
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
    this.purse = text(width / 2, PURSE_Y, '', TEXT.size.hint, COLORS.shardText);

    const below = height - FOOTER - BELOW;
    this.view.setTo(8, VIEW_TOP, width - 16, below - VIEW_TOP - 4);
    this.add
      .graphics()
      .setDepth(DEPTH.ui + 1)
      .lineStyle(1, COLORS.panelEdge, 0.8)
      .strokeRoundedRect(this.view.x, this.view.y, this.view.width, this.view.height, 10);

    this.layer = this.add.container(0, 0).setDepth(DEPTH.ui + 1);
    this.edges = this.add.graphics();
    this.dots = this.add.graphics();
    this.layer.add([this.edges, this.dots]);
    this.buildNodes();

    this.detail = this.add
      .text(width / 2, below + 4, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.hint,
        color: COLORS.text,
        align: 'center',
        lineSpacing: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.ui + 2);
    this.status = text(width / 2, below + BELOW - 58, '', TEXT.size.hint, COLORS.muted);

    const buttonY = below + BELOW - 24;
    const buttonW = Math.min(200, Math.floor((width - 40) / 2));
    const gap = 8;
    this.takeButton = this.button(width / 2 - buttonW / 2 - gap / 2, buttonY, buttonW, copy.allocate, () => this.allocate());
    this.refundButton = this.button(width / 2 + buttonW / 2 + gap / 2, buttonY, buttonW, copy.refund, () => this.refund());
    this.zoomButtons();

    fitText(
      text(width / 2, height - FOOTER / 2, prefersTouchControls() ? copy.hintTouch : copy.hintKeyboard, TEXT.size.hint, COLORS.muted),
      width - 16,
    );

    // The tree's own camera: the main one leaves the tree out, this one sees nothing else.
    this.cameras.main.ignore(this.layer);
    this.treeCam = this.cameras.add(this.view.x, this.view.y, this.view.width, this.view.height);
    this.treeCam.ignore(this.children.list.filter((child) => child !== this.layer));
    const first = this.view.height / (2 * PASSIVE_TREE.firstRings * TREE_SHAPE.cell);
    this.treeCam.setZoom(Phaser.Math.Clamp(first, PASSIVE_TREE.minZoom, PASSIVE_TREE.maxZoom));
    this.treeCam.centerOn(0, 0);

    this.armKeys();
    this.armDrag();
    this.refresh();
  }

  /** Picks a node: says what it is, and points the buttons at it. Public so a test can. */
  public select(id: PassiveId): void {
    if (PASSIVE_NODES[id]) {
      this.selected = id;
      this.refresh();
    }
  }

  /** Takes the picked node (or the one named). Public so a test can. */
  public allocate(id: PassiveId = this.selected): boolean {
    this.selected = id;
    const done = passives.allocate(id);
    this.refresh();
    return done;
  }

  /** Takes it back. Public so a test can. */
  public refund(id: PassiveId = this.selected): boolean {
    this.selected = id;
    const done = passives.refund(id);
    this.refresh();
    return done;
  }

  /** Moves the tree under its window by this much on screen, as a drag would. Public so a test can. */
  public pan(dx: number, dy: number): void {
    const zoom = this.treeCam.zoom;
    this.moveTo(this.treeCam.midPoint.x - dx / zoom, this.treeCam.midPoint.y - dy / zoom);
  }

  /** Zooms by this factor, keeping the middle of the window where it is. Public so a test can. */
  public zoomBy(factor: number): void {
    const mid = { x: this.treeCam.midPoint.x, y: this.treeCam.midPoint.y };
    this.treeCam.setZoom(Phaser.Math.Clamp(this.treeCam.zoom * factor, PASSIVE_TREE.minZoom, PASSIVE_TREE.maxZoom));
    this.moveTo(mid.x, mid.y);
    this.refreshNames();
  }

  /** Where a node is on screen now. Public for tests. */
  public screenOf(id: PassiveId): { x: number; y: number } {
    const spec = PASSIVE_NODES[id]!;
    const cam = this.treeCam;
    return {
      x: this.view.x + (spec.x - cam.worldView.x) * cam.zoom,
      y: this.view.y + (spec.y - cam.worldView.y) * cam.zoom,
    };
  }

  private moveTo(x: number, y: number): void {
    const m = PASSIVE_TREE.dragMargin;
    const b = this.bounds;
    this.treeCam.centerOn(Phaser.Math.Clamp(x, b.left - m, b.right + m), Phaser.Math.Clamp(y, b.top - m, b.bottom + m));
  }

  private buildNodes(): void {
    for (const spec of ALL_PASSIVE_NODES) {
      const radius = PASSIVE_TREE.radius[spec.kind];
      const named = spec.kind === 'notable' || spec.kind === 'keystone';
      const name = named
        ? this.add
            .text(spec.x, spec.y + radius + 4, passiveName(spec.id), {
              fontFamily: 'system-ui, sans-serif',
              fontSize: spec.kind === 'keystone' ? '15px' : '13px',
              color: spec.kind === 'keystone' ? COLORS.shardText : COLORS.text,
              stroke: '#05070b',
              strokeThickness: 3,
            })
            .setOrigin(0.5, 0)
        : undefined;
      const hit = this.add.circle(spec.x, spec.y, radius + 8, 0x000000, 0.001).setInteractive({ useHandCursor: true });
      hit.on(Phaser.Input.Events.GAMEOBJECT_POINTER_UP, () => {
        if (!this.dragged) {
          this.select(spec.id);
        }
      });
      this.layer.add([...(name ? [name] : []), hit]);
      this.nodes.set(spec.id, { spec, radius, ...(name ? { name } : {}), hit });
    }
    const xs = ALL_PASSIVE_NODES.map((n) => n.x);
    const ys = ALL_PASSIVE_NODES.map((n) => n.y);
    this.bounds.setTo(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  }

  /** Small names drop out when the tree is zoomed far out, and come back zoomed in. */
  private refreshNames(): void {
    const zoom = this.treeCam?.zoom ?? 1;
    for (const node of this.nodes.values()) {
      // Read at one size whatever the zoom: a name grows back against the camera.
      node.name
        ?.setScale(1 / zoom)
        .setY(node.spec.y + node.radius + 4 / zoom)
        .setVisible(node.spec.kind === 'keystone' || zoom >= 0.4);
    }
  }

  private button(x: number, y: number, w: number, label: string, onPress: () => void): PassiveButton {
    const plate = this.add
      .rectangle(x, y, w, 36, COLORS.panel, 1)
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

  /** + and − in the window's corner, for a screen without a wheel. */
  private zoomButtons(): void {
    const size = 30;
    const x = this.view.right - size / 2 - 6;
    [
      { label: '+', factor: PASSIVE_TREE.zoomStep, y: this.view.y + size / 2 + 6 },
      { label: '−', factor: 1 / PASSIVE_TREE.zoomStep, y: this.view.y + size * 1.5 + 12 },
    ].forEach(({ label, factor, y }) => {
      const plate = this.add
        .rectangle(x, y, size, size, COLORS.panel, 0.9)
        .setStrokeStyle(1, COLORS.panelEdge, 1)
        .setDepth(DEPTH.ui + 3)
        .setInteractive({ useHandCursor: true });
      this.add
        .text(x, y, label, { fontFamily: 'system-ui, sans-serif', fontSize: TEXT.size.body, color: COLORS.text })
        .setOrigin(0.5)
        .setDepth(DEPTH.ui + 4);
      plate.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (_p: unknown, _x: unknown, _y: unknown, event: { stopPropagation?: () => void }) => {
        event?.stopPropagation?.();
        this.zoomBy(factor);
      });
    });
  }

  private armDrag(): void {
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.dragged = false;
      this.dragFrom = this.view.contains(pointer.x, pointer.y)
        ? { x: pointer.x, y: pointer.y, midX: this.treeCam.midPoint.x, midY: this.treeCam.midPoint.y }
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
      const zoom = this.treeCam.zoom;
      this.moveTo(from.midX - dx / zoom, from.midY - dy / zoom);
    });
    const release = (): void => {
      this.dragFrom = null;
    };
    this.input.on(Phaser.Input.Events.POINTER_UP, release);
    this.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, release);
    this.input.on(
      Phaser.Input.Events.POINTER_WHEEL,
      (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
        if (this.view.contains(pointer.x, pointer.y) && dy !== 0) {
          this.zoomBy(dy < 0 ? PASSIVE_TREE.zoomStep : 1 / PASSIVE_TREE.zoomStep);
        }
      },
    );
  }

  private refresh(): void {
    const copy = t().passives;

    // Lines first, under the nodes.
    const e = this.edges.clear();
    const drawn = new Set<string>();
    for (const spec of ALL_PASSIVE_NODES) {
      for (const link of spec.links) {
        const key = spec.id < link ? `${spec.id}|${link}` : `${link}|${spec.id}`;
        if (drawn.has(key)) {
          continue;
        }
        drawn.add(key);
        const other = PASSIVE_NODES[link]!;
        const a = passives.isAllocated(spec.id);
        const b = passives.isAllocated(link);
        const color = a && b ? PASSIVE_TREE.edgeLit : a || b ? PASSIVE_TREE.edgeOpen : PASSIVE_TREE.edgeShut;
        e.lineStyle(PASSIVE_TREE.edgeWidth, color, 1);
        e.lineBetween(spec.x, spec.y, other.x, other.y);
      }
    }

    const g = this.dots.clear();
    for (const node of this.nodes.values()) {
      const { spec, radius } = node;
      const taken = passives.isAllocated(spec.id);
      const open = !taken && passives.isReachable(spec.id);
      const alpha = taken || open ? 1 : PASSIVE_TREE.shutAlpha;
      const fillColour = taken
        ? spec.branch
          ? PASSIVE_TREE.branchColors[spec.branch]
          : PASSIVE_TREE.taken
        : COLORS.panel;
      g.fillStyle(fillColour, alpha);
      if (spec.kind === 'keystone') {
        // A 키스톤 is a diamond, read apart at any zoom.
        g.fillPoints(PassiveScene.diamond(spec.x, spec.y, radius), true);
      } else {
        g.fillCircle(spec.x, spec.y, radius);
      }
      const rim = taken ? PASSIVE_TREE.taken : open && passives.freePoints > 0 ? PASSIVE_TREE.buyable : COLORS.panelEdge;
      g.lineStyle(spec.kind === 'small' ? 2 : 3, rim, alpha);
      if (spec.kind === 'keystone') {
        g.strokePoints(PassiveScene.diamond(spec.x, spec.y, radius), true, true);
      } else {
        g.strokeCircle(spec.x, spec.y, radius);
      }
      if (spec.kind === 'notable') {
        g.strokeCircle(spec.x, spec.y, radius + 4);
      }
      if (spec.id === this.selected) {
        g.lineStyle(3, COLORS.textFill, 1);
        g.strokeCircle(spec.x, spec.y, radius + 9);
      }
      node.name?.setAlpha(alpha);
    }
    this.refreshNames();

    // What the picked node is, does, and whether it can be taken or given back.
    const spec = PASSIVE_NODES[this.selected]!;
    const kind = spec.branch ? `${copy.branches[spec.branch]} · ${copy.kinds[spec.kind]}` : copy.kinds[spec.kind];
    const lines = spec.id === PASSIVE_START ? [copy.startNode] : passiveLines(spec.id);
    const dead = spec.mods.some((mod) => mod.tag && !LIVE_TAGS.has(mod.tag));
    this.detail
      .setScale(1)
      .setText([`${passiveName(spec.id)}   ${kind}`, lines.join('  ·  '), ...(dead ? [copy.noSkillYet] : [])].join('\n'));
    fitText(this.detail, this.scale.width - 24, 0);

    const taken = passives.isAllocated(spec.id);
    const status =
      spec.id === PASSIVE_START
        ? ''
        : taken
          ? passives.isLeaf(spec.id)
            ? copy.taken
            : copy.cutsOff
          : !passives.isReachable(spec.id)
            ? copy.needsLink
            : passives.freePoints <= 0
              ? copy.noPoints
              : copy.canTake;
    this.status.setScale(1).setText(status);
    fitText(this.status, this.scale.width - 24, 0);

    this.purse.setScale(1).setText(fill(copy.points, { points: passives.freePoints, total: passives.totalPoints }));
    fitText(this.purse, this.scale.width - 40);

    const paint = (button: PassiveButton, on: boolean) => {
      button.plate.setStrokeStyle(2, on ? PASSIVE_TREE.buyable : COLORS.panelEdge, 1);
      button.label.setAlpha(on ? 1 : 0.45);
    };
    paint(this.takeButton, passives.canAllocate(spec.id));
    paint(this.refundButton, passives.canRefund(spec.id));
  }

  /**
   * The node linked to `id` straight that way, or null: every link runs
   * across or up and down, at most one each way (config/passives.ts).
   * Public for tests.
   */
  public static linkedToward(id: PassiveId, dx: number, dy: number): PassiveId | null {
    const here = PASSIVE_NODES[id];
    if (!here) {
      return null;
    }
    for (const link of here.links) {
      const there = PASSIVE_NODES[link]!;
      if (Math.sign(there.x - here.x) === dx && Math.sign(there.y - here.y) === dy) {
        return link;
      }
    }
    return null;
  }

  private static diamond(x: number, y: number, r: number): Phaser.Math.Vector2[] {
    return [
      new Phaser.Math.Vector2(x, y - r),
      new Phaser.Math.Vector2(x + r, y),
      new Phaser.Math.Vector2(x, y + r),
      new Phaser.Math.Vector2(x - r, y),
    ];
  }

  /** Arrows walk along the link that way; Space takes, R gives back, +/− zoom, Esc out. */
  private armKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const step = (dx: number, dy: number): void => {
      const best = PassiveScene.linkedToward(this.selected, dx, dy);
      if (best) {
        this.select(best);
        this.showNode(best);
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
        case 'NumpadEnter':
          this.allocate();
          break;
        case 'KeyR':
        case 'Backspace':
          this.refund();
          break;
        case 'Equal':
        case 'NumpadAdd':
          this.zoomBy(PASSIVE_TREE.zoomStep);
          break;
        case 'Minus':
        case 'NumpadSubtract':
          this.zoomBy(1 / PASSIVE_TREE.zoomStep);
          break;
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

  /** Keeps a node the keyboard moved onto inside the window. */
  private showNode(id: PassiveId): void {
    const spec = PASSIVE_NODES[id]!;
    const view = this.treeCam.worldView;
    const margin = 40 / this.treeCam.zoom;
    if (spec.x < view.left + margin || spec.x > view.right - margin || spec.y < view.top + margin || spec.y > view.bottom - margin) {
      this.moveTo(spec.x, spec.y);
    }
  }

  private close(): void {
    const { onClose } = this.payload;
    this.scene.stop();
    onClose();
  }
}

