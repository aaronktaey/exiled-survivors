import Phaser from 'phaser';

import { COLORS, DEPTH, TEXT, VILLAGE, lookAnim, lookTexture, type VillageStationId } from '@/config';
import { t } from '@/i18n';
import { ensureArenaFloor } from '@/systems/Arena';
import { prefersTouchControls } from '@/systems/VirtualJoystick';

/** One thing in the village that opens a screen. */
export interface VillageStation {
  readonly id: VillageStationId;
  readonly label: () => string;
  /** A second line under the name — first place on the board, a run waiting — or nothing. */
  readonly note?: () => string;
  /** A dot on it: something to do in there. */
  readonly badge?: () => boolean;
  readonly open: () => void;
}

interface Placed {
  readonly station: VillageStation;
  readonly image: Phaser.GameObjects.Image;
  readonly name: Phaser.GameObjects.Text;
  readonly note: Phaser.GameObjects.Text;
  readonly dot: Phaser.GameObjects.Arc;
  readonly x: number;
  readonly y: number;
}

/**
 * 생존자 마을 (dev server only for now, the user's ask): the title as a place,
 * the way Path of Exile's hideout is — the survivor walks about a yard and
 * what the title's menu and corner icons opened are things standing in it:
 * the gate out on a run, the stash, the anvil, the talents' stone, the
 * ranking board, the sorting table, the bookshelf, the notice board.
 *
 * Walked with the keys (WASD, arrows) or by pointing: a press on the ground
 * walks there, a press on a thing walks to it and opens it. Standing at one,
 * Space or Enter opens it. MenuScene keeps everything else the title does —
 * the account, the podium, a new version — and hands this the stations.
 */
export class Village {
  /** Public so a test can drive and read it. */
  public readonly survivor: Phaser.GameObjects.Sprite;
  public readonly placed: Placed[] = [];
  /** The station within reach, if any. */
  public near: VillageStation | null = null;
  private readonly scene: Phaser.Scene;
  private readonly prompt: Phaser.GameObjects.Text;
  private readonly bounds: Phaser.Geom.Rectangle;
  private target: { x: number; y: number; station?: VillageStation } | null = null;
  private readonly keys?: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private readonly onUse = (): void => {
    if (!this.keysElsewhere?.()) {
      this.use();
    }
  };
  private readonly keysElsewhere?: () => boolean;

  /** `keysElsewhere`: true while the corner icons hold the keyboard (Tab), so Space is theirs. */
  public constructor(scene: Phaser.Scene, stations: readonly VillageStation[], keysElsewhere?: () => boolean) {
    this.scene = scene;
    this.keysElsewhere = keysElsewhere;
    const { width, height } = scene.scale;
    const wide = width >= height;
    const top = VILLAGE.top[wide ? 'wide' : 'tall'];
    this.bounds = new Phaser.Geom.Rectangle(
      VILLAGE.margin.side,
      top,
      width - VILLAGE.margin.side * 2,
      height - top - VILLAGE.margin.bottom,
    );
    Village.paint(scene);

    // The yard: the earth ground, darkened at its edges.
    scene.add.tileSprite(0, 0, width, height, ensureArenaFloor(scene, 'earth')).setOrigin(0, 0).setDepth(DEPTH.ground);
    scene.add.rectangle(0, 0, width, height, 0x05070b, 0.25).setOrigin(0, 0).setDepth(DEPTH.ground + 1);

    const at = (share: readonly [number, number]): { x: number; y: number } => ({
      x: this.bounds.x + this.bounds.width * share[0],
      y: this.bounds.y + this.bounds.height * share[1],
    });

    // The fire in the middle, flickering: somewhere to stand, nothing to open.
    const fire = at(VILLAGE.campfire[wide ? 'wide' : 'tall']);
    const flame = scene.add.image(fire.x, fire.y, VILLAGE_TEXTURE.campfire).setDepth(DEPTH.pickups).setDisplaySize(52, 52);
    scene.tweens.add({ targets: flame, scaleY: flame.scaleY * 1.08, duration: 380, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const size = VILLAGE.stationSize;
    for (const station of stations) {
      const spot = at(VILLAGE.layout[wide ? 'wide' : 'tall'][station.id]);
      const image = scene.add
        .image(spot.x, spot.y, VILLAGE_TEXTURE[station.id])
        .setDisplaySize(size, size)
        .setDepth(DEPTH.pickups)
        .setInteractive({ useHandCursor: true });
      image.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
        this.target = { x: spot.x, y: spot.y + size * 0.55, station };
      });
      const name = scene.add
        .text(spot.x, spot.y + size / 2 + 2, station.label(), {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.text,
          stroke: TEXT.outline.color,
          strokeThickness: 3,
        })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.ui);
      const note = scene.add
        .text(spot.x, name.y + name.height, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.hint,
          color: COLORS.gearText,
          stroke: TEXT.outline.color,
          strokeThickness: 3,
        })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.ui);
      const dot = scene.add
        .circle(spot.x + size / 2 - 6, spot.y - size / 2 + 6, 5, 0xff4d4d, 1)
        .setDepth(DEPTH.ui + 1)
        .setVisible(false);
      this.placed.push({ station, image, name, note, dot, x: spot.x, y: spot.y });
    }

    const start = { x: fire.x, y: fire.y + (wide ? 70 : 80) };
    this.survivor = scene.add.sprite(start.x, start.y, lookTexture('base')).setDepth(DEPTH.player);
    this.survivor.setDisplaySize(VILLAGE.survivorSize, VILLAGE.survivorSize);

    this.prompt = scene.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.small,
        color: COLORS.accent,
        stroke: TEXT.outline.color,
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.ui + 2)
      .setVisible(false);

    // A press on the ground walks there.
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0 && this.bounds.contains(pointer.worldX, pointer.worldY)) {
        this.target = { x: pointer.worldX, y: pointer.worldY };
      }
    });
    const keyboard = scene.input.keyboard;
    if (keyboard) {
      const K = Phaser.Input.Keyboard.KeyCodes;
      this.keys = keyboard.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D }) as Village['keys'];
      keyboard.on('keydown-SPACE', this.onUse);
      keyboard.on('keydown-ENTER', this.onUse);
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard?.off('keydown-SPACE', this.onUse);
      keyboard?.off('keydown-ENTER', this.onUse);
    });
    this.refresh();
  }

  /** Names, notes and dots read again: after a screen closes, or the language changes. */
  public refresh(): void {
    for (const spot of this.placed) {
      spot.name.setText(spot.station.label());
      spot.note.setText(spot.station.note?.() ?? '');
      spot.dot.setVisible(spot.station.badge?.() === true);
    }
  }

  /** Opens the station within reach, if there is one. */
  public use(): void {
    if (this.near && this.scene.scene.isActive()) {
      this.target = null;
      this.near.open();
    }
  }

  public update(deltaMs: number): void {
    const dt = Math.min(deltaMs, 50) / 1000;
    let dx = 0;
    let dy = 0;
    const k = this.keys;
    if (k) {
      dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    }
    if (dx !== 0 || dy !== 0) {
      this.target = null;
    } else if (this.target) {
      const tx = this.target.x - this.survivor.x;
      const ty = this.target.y - this.survivor.y;
      const left = Math.hypot(tx, ty);
      if (left < 6) {
        const arrived = this.target.station;
        this.target = null;
        if (arrived) {
          arrived.open();
          return;
        }
      } else {
        dx = tx / left;
        dy = ty / left;
      }
    }

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const length = Math.hypot(dx, dy);
      this.survivor.x += (dx / length) * VILLAGE.walkSpeed * dt;
      this.survivor.y += (dy / length) * VILLAGE.walkSpeed * dt;
      if (dx !== 0) {
        this.survivor.setFlipX(dx < 0);
      }
      // Nothing walks through a station: out along the line from its middle.
      for (const spot of this.placed) {
        const ox = this.survivor.x - spot.x;
        const oy = this.survivor.y - spot.y;
        const d = Math.hypot(ox, oy);
        const min = VILLAGE.stationSize * 0.42;
        if (d > 0 && d < min) {
          this.survivor.x = spot.x + (ox / d) * min;
          this.survivor.y = spot.y + (oy / d) * min;
        }
      }
      this.survivor.x = Phaser.Math.Clamp(this.survivor.x, this.bounds.left, this.bounds.right);
      this.survivor.y = Phaser.Math.Clamp(this.survivor.y, this.bounds.top, this.bounds.bottom);
    }
    const walk = lookAnim('base', 'walk');
    if (moving && this.scene.anims.exists(walk)) {
      if (this.survivor.anims.currentAnim?.key !== walk || !this.survivor.anims.isPlaying) {
        this.survivor.play(walk);
      }
    } else if (!moving && this.survivor.anims.isPlaying) {
      this.survivor.stop();
      this.survivor.setTexture(lookTexture('base'));
    }

    // The nearest station within reach is lit, and says how to open it.
    let near: Placed | null = null;
    let best = VILLAGE.reach;
    for (const spot of this.placed) {
      const d = Phaser.Math.Distance.Between(this.survivor.x, this.survivor.y, spot.x, spot.y);
      if (d < best) {
        best = d;
        near = spot;
      }
    }
    for (const spot of this.placed) {
      spot.image.setTint(spot === near ? 0xfff2b0 : 0xffffff);
    }
    this.near = near?.station ?? null;
    if (near) {
      this.prompt
        .setText(`${near.station.label()} · ${prefersTouchControls() ? t().village.useTap : t().village.useKey}`)
        .setPosition(near.x, near.y - VILLAGE.stationSize / 2 - 4)
        .setVisible(true);
    } else {
      this.prompt.setVisible(false);
    }
  }

  /**
   * The stations' pictures, drawn once a game: 64 units square each, the
   * way the rest of the art is drawn in code.
   */
  public static paint(scene: Phaser.Scene): void {
    const make = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void): void => {
      if (scene.textures.exists(key)) {
        return;
      }
      const g = scene.add.graphics();
      draw(g);
      g.generateTexture(key, 64, 64);
      g.destroy();
    };
    const wood = 0x8a5a32;
    const woodDark = 0x5a3a20;
    const stone = 0x7d8494;
    const stoneDark = 0x4c5260;
    const gold = 0xffd34d;

    make(VILLAGE_TEXTURE.portal, (g) => {
      g.fillStyle(stoneDark, 1).fillRect(8, 14, 12, 48).fillRect(44, 14, 12, 48);
      g.fillStyle(stone, 1).fillRect(10, 16, 8, 46).fillRect(46, 16, 8, 46);
      g.fillStyle(stoneDark, 1).fillRect(6, 6, 52, 12);
      g.fillStyle(stone, 1).fillRect(8, 8, 48, 8);
      g.fillStyle(0x6a3fd0, 0.9).fillEllipse(32, 40, 26, 40);
      g.fillStyle(0xb08cff, 0.9).fillEllipse(32, 40, 16, 28);
      g.fillStyle(0xffffff, 0.8).fillEllipse(32, 40, 6, 12);
    });
    make(VILLAGE_TEXTURE.stash, (g) => {
      g.fillStyle(woodDark, 1).fillRect(8, 24, 48, 34);
      g.fillStyle(wood, 1).fillRect(10, 26, 44, 30);
      g.fillStyle(woodDark, 1).fillRect(6, 18, 52, 10);
      g.fillStyle(wood, 1).fillRect(8, 19, 48, 7);
      g.fillStyle(gold, 1).fillRect(8, 30, 48, 3).fillRect(28, 26, 8, 12);
      g.fillStyle(0x3a2412, 1).fillRect(31, 31, 2, 4);
    });
    make(VILLAGE_TEXTURE.anvil, (g) => {
      g.fillStyle(woodDark, 1).fillRect(20, 44, 24, 16);
      g.fillStyle(0x3c3f48, 1).fillRect(14, 26, 36, 10).fillRect(24, 36, 16, 10);
      g.fillTriangle(50, 26, 60, 30, 50, 34);
      g.fillStyle(0x6b7080, 1).fillRect(16, 26, 32, 3);
      g.fillStyle(0xff7a2a, 0.9).fillCircle(30, 22, 3);
      g.fillStyle(0xffd34d, 0.9).fillCircle(36, 18, 2);
      g.fillStyle(0x9aa0b0, 1).fillRect(38, 10, 3, 14).fillRect(34, 8, 11, 5);
    });
    make(VILLAGE_TEXTURE.obelisk, (g) => {
      g.fillStyle(stoneDark, 1).fillRect(14, 54, 36, 8);
      g.fillStyle(stoneDark, 1).fillTriangle(22, 56, 42, 56, 32, 4);
      g.fillStyle(stone, 1).fillTriangle(24, 54, 38, 54, 32, 8);
      g.fillStyle(gold, 0.95).fillRect(30, 24, 4, 14).fillRect(26, 29, 12, 3);
      g.fillStyle(gold, 0.25).fillCircle(32, 31, 12);
    });
    make(VILLAGE_TEXTURE.board, (g) => {
      g.fillStyle(woodDark, 1).fillRect(12, 30, 5, 32).fillRect(47, 30, 5, 32);
      g.fillStyle(wood, 1).fillRect(6, 8, 52, 34);
      g.fillStyle(woodDark, 1).fillRect(6, 8, 52, 3).fillRect(6, 39, 52, 3);
      g.fillStyle(gold, 1).fillRect(24, 14, 16, 12).fillRect(29, 26, 6, 5).fillRect(25, 31, 14, 4);
      g.fillStyle(0xfff2b0, 1).fillRect(26, 15, 4, 6);
    });
    make(VILLAGE_TEXTURE.sieve, (g) => {
      g.fillStyle(woodDark, 1).fillRect(12, 40, 6, 22).fillRect(46, 40, 6, 22);
      g.fillStyle(wood, 1).fillRect(6, 34, 52, 8);
      g.fillStyle(0x9aa0b0, 1).fillEllipse(32, 24, 44, 18);
      g.fillStyle(0x2b2f3a, 1).fillEllipse(32, 24, 36, 12);
      g.lineStyle(1, 0x9aa0b0, 1);
      for (let x = 18; x <= 46; x += 5) g.lineBetween(x, 19, x, 29);
      g.fillStyle(0x7ef0a0, 1).fillCircle(24, 22, 2).fillCircle(38, 26, 2);
      g.fillStyle(0xffd34d, 1).fillCircle(31, 21, 2);
    });
    make(VILLAGE_TEXTURE.shelf, (g) => {
      g.fillStyle(woodDark, 1).fillRect(8, 4, 48, 58);
      g.fillStyle(0x2a1a10, 1).fillRect(12, 8, 40, 50);
      g.fillStyle(wood, 1).fillRect(12, 24, 40, 3).fillRect(12, 42, 40, 3);
      const books = [0xd94452, 0x5fb0ff, 0x7ef0a0, 0xffd34d, 0xc08cff, 0xff9f43];
      books.forEach((c, i) => {
        g.fillStyle(c, 1).fillRect(14 + i * 6, 11, 5, 13);
        g.fillStyle(books[(i + 2) % books.length]!, 1).fillRect(14 + i * 6, 29, 5, 13);
        g.fillStyle(books[(i + 4) % books.length]!, 1).fillRect(14 + i * 6, 47, 5, 11);
      });
    });
    make(VILLAGE_TEXTURE.notice, (g) => {
      g.fillStyle(woodDark, 1).fillRect(29, 34, 6, 28);
      g.fillStyle(wood, 1).fillRect(8, 6, 48, 32);
      g.fillStyle(0xf4e8c8, 1).fillRect(12, 10, 18, 22).fillRect(34, 12, 18, 16);
      g.fillStyle(0x8a7a5a, 1).fillRect(14, 14, 14, 2).fillRect(14, 19, 12, 2).fillRect(14, 24, 13, 2).fillRect(36, 16, 14, 2).fillRect(36, 21, 10, 2);
      g.fillStyle(0xd94452, 1).fillCircle(21, 10, 2).fillCircle(43, 12, 2);
    });
    make(VILLAGE_TEXTURE.cog, (g) => {
      g.fillStyle(0xc8d0de, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillCircle(32 + Math.cos(a) * 20, 32 + Math.sin(a) * 20, 7);
      }
      g.fillCircle(32, 32, 20);
      g.fillStyle(0x151a24, 1).fillCircle(32, 32, 8);
    });
    make(VILLAGE_TEXTURE.campfire, (g) => {
      g.fillStyle(0x6a6f7a, 1).fillCircle(14, 52, 5).fillCircle(50, 52, 5).fillCircle(32, 58, 5).fillCircle(20, 58, 4).fillCircle(44, 58, 4);
      g.fillStyle(woodDark, 1).fillRect(16, 48, 32, 6);
      g.fillStyle(0xff5a1f, 1).fillTriangle(18, 50, 46, 50, 32, 14);
      g.fillStyle(0xffc23d, 1).fillTriangle(24, 50, 40, 50, 32, 26);
      g.fillStyle(0xfff6c8, 1).fillTriangle(28, 50, 36, 50, 32, 36);
    });
  }
}

/** The stations' picture keys, and the fire's. */
export const VILLAGE_TEXTURE: Record<VillageStationId | 'campfire' | 'cog', string> = {
  portal: 'tex-village-portal',
  stash: 'tex-village-stash',
  anvil: 'tex-village-anvil',
  obelisk: 'tex-village-obelisk',
  board: 'tex-village-board',
  sieve: 'tex-village-sieve',
  shelf: 'tex-village-shelf',
  notice: 'tex-village-notice',
  campfire: 'tex-village-campfire',
  cog: 'tex-village-cog',
};

/**
 * Whether the title is the village: only on the dev server while
 * VILLAGE.devOnly, and never on the harness (or `#run`) unless a page sets
 * `window.__villageOn` — the suites drive the menu.
 */
export function villageOn(): boolean {
  if (VILLAGE.devOnly && !import.meta.env.DEV) {
    return false;
  }
  const page = window as Window & { __harness?: boolean; __villageOn?: boolean };
  const harness = page.__harness === true || window.location.hash === '#run';
  return !harness || page.__villageOn === true;
}

