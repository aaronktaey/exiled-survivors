import Phaser from 'phaser';

import {
  ALL_ORBS,
  AUDIO,
  COLORS,
  ENEMY_KINDS,
  GEAR_DROP,
  ICONS,
  SHARD,
  SKILL_ICONS,
  PLAYER,
  POTION,
  SHOTS,
  TEXTURES,
  VOID_ORB,
} from '@/config';
import { MENU, SCENES } from '@/config';
import { createPixelTextTexture } from '@/systems/PixelFont';
import { sfx } from '@/systems/Sfx';


const GRID_TILE = 64;

/**
 * Loads assets needed before gameplay starts, then hands off to GameScene.
 * There is no art yet, so the placeholder textures are drawn at runtime.
 */
export class BootScene extends Phaser.Scene {
  public static readonly KEY = 'BootScene';

  public constructor() {
    super(BootScene.KEY);
  }

  public preload(): void {
    const base = import.meta.env.BASE_URL;

    for (const clip of Object.values(AUDIO.drops)) {
      this.load.audio(clip.key, `${base}${clip.file}`);
    }
    sfx.preload(this);

    this.load.image(TEXTURES.gem, `${base}${ICONS.gem.file}`);
    this.load.image(TEXTURES.projectile, `${base}${ICONS.projectile.file}`);
    this.load.image(TEXTURES.skillOrb, `${base}${ICONS.skillOrb.file}`);

    for (const icon of Object.values(SKILL_ICONS)) {
      this.load.image(icon.key, `${base}${icon.file}`);
    }
  }

  public create(): void {
    this.createGridTexture();
    this.createSquareTexture(TEXTURES.player, PLAYER.size, COLORS.player);
    for (const kind of Object.values(ENEMY_KINDS)) {
      this.createSquareTexture(kind.texture, kind.size, kind.color);
    }
    this.createSquareTexture(TEXTURES.enemyShot, 8, COLORS.enemyShot);
    this.createShardTexture();
    this.createVoidOrbTexture();
    this.createPotionTexture();
    this.createGearTexture();
    this.createDivineShardTexture();
    this.createPassiveTexture();
    this.createOrbTextures();


    createPixelTextTexture(this, TEXTURES.logo, ['EXILED', 'SURVIVORS'], {
      pixel: MENU.logoPixel,
      color: COLORS.logo,
      shadow: COLORS.logoShadow,
    });

    this.paintAdColumns();

    // Dev-only shortcut past the title, so the integration harness can drive
    // a run without clicking through the menu first.
    const skipMenu = import.meta.env.DEV && window.location.hash === '#run';
    this.scene.start(skipMenu ? SCENES.game : SCENES.menu);
  }

  /** One tile of the arena floor, repeated by a TileSprite. */
  private createGridTexture(): void {
    const graphics = this.add.graphics();

    graphics.fillStyle(0x0f131b, 1);
    graphics.fillRect(0, 0, GRID_TILE, GRID_TILE);
    graphics.lineStyle(1, COLORS.grid, 1);
    graphics.strokeRect(0.5, 0.5, GRID_TILE - 1, GRID_TILE - 1);

    graphics.generateTexture(TEXTURES.grid, GRID_TILE, GRID_TILE);
    graphics.destroy();
  }

  private createSquareTexture(key: string, size: number, color: number): void {
    const graphics = this.add.graphics();

    graphics.fillStyle(color, 1);
    graphics.fillRect(0, 0, size, size);

    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  /** The void orb: a pale core inside a violet shell. */
  private createVoidOrbTexture(): void {
    const size = VOID_ORB.radius * 4;
    const graphics = this.add.graphics();

    graphics.fillStyle(COLORS.voidOrb, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2);
    graphics.fillStyle(COLORS.voidOrbCore, 0.9);
    graphics.fillCircle(size / 2, size / 2, size / 4);

    graphics.generateTexture(TEXTURES.voidOrb, size, size);
    graphics.destroy();
  }

  /**
   * Hands the baked logo to the page as a data URL, so the reserved ad
   * columns can wear it while they are still empty. Pure decoration: if
   * anything goes wrong the columns simply stay blank.
   */
  private paintAdColumns(): void {
    try {
      const source = this.textures.get(TEXTURES.logo).getSourceImage();
      if (!(source instanceof HTMLCanvasElement)) {
        return;
      }

      document.documentElement.style.setProperty('--ad-logo', 'url(' + source.toDataURL() + ')');
    } catch {
      // No document, or a texture that cannot be read back.
    }
  }

  /** The potion: a white cross on a crimson field, read at a glance. */
  /** 신성한 조각: a pale four-pointed sliver, lit like a gem. */
  private createShardTexture(): void {
    const size = SHARD.size * 2;
    const half = size / 2;
    const graphics = this.add.graphics();

    graphics.fillStyle(COLORS.shardEdge, 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(half, 0),
        new Phaser.Math.Vector2(size, half),
        new Phaser.Math.Vector2(half, size),
        new Phaser.Math.Vector2(0, half),
      ],
      true,
    );
    graphics.fillStyle(COLORS.shard, 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(half, size * 0.18),
        new Phaser.Math.Vector2(size * 0.82, half),
        new Phaser.Math.Vector2(half, size * 0.82),
        new Phaser.Math.Vector2(size * 0.18, half),
      ],
      true,
    );

    graphics.generateTexture(TEXTURES.shard, size, size);
    graphics.destroy();
  }

  /**
   * The three 구슬. A sphere each, in its own colour, with its own mark cut
   * into the face — colour alone would not tell them apart on a dark floor,
   * and a 각성의 구슬 is a thousand kills apart from a 변화의 구슬.
   */
  private createOrbTextures(): void {
    for (const orb of ALL_ORBS) {
      const size = 32;
      const half = size / 2;
      const graphics = this.add.graphics();

      graphics.fillStyle(orb.color, 1);
      graphics.fillCircle(half, half, half - 1);
      // A darker lower half, so it reads as a sphere rather than a disc.
      graphics.fillStyle(0x000000, 0.22);
      graphics.fillCircle(half, half + size * 0.14, half - size * 0.16);

      graphics.fillStyle(0xffffff, 0.92);
      if (orb.id === 'transmute') {
        // A ring: the same thing, come round again.
        graphics.lineStyle(Math.round(size * 0.09), 0xffffff, 0.92);
        graphics.strokeCircle(half, half, size * 0.2);
      } else if (orb.id === 'chaos') {
        // Four points thrown outward.
        graphics.fillPoints(
          [
            new Phaser.Math.Vector2(half, size * 0.2),
            new Phaser.Math.Vector2(half + size * 0.1, half - size * 0.06),
            new Phaser.Math.Vector2(size * 0.8, half),
            new Phaser.Math.Vector2(half + size * 0.06, half + size * 0.1),
            new Phaser.Math.Vector2(half, size * 0.8),
            new Phaser.Math.Vector2(half - size * 0.1, half + size * 0.06),
            new Phaser.Math.Vector2(size * 0.2, half),
            new Phaser.Math.Vector2(half - size * 0.06, half - size * 0.1),
          ],
          true,
        );
      } else {
        // A cross with the arms stepping outward: one more of something.
        const arm = size * 0.07;
        graphics.fillRect(half - arm / 2, size * 0.22, arm, size * 0.56);
        graphics.fillRect(size * 0.22, half - arm / 2, size * 0.56, arm);
      }

      // A highlight, last, so it sits over the mark.
      graphics.fillStyle(0xffffff, 0.55);
      graphics.fillCircle(size * 0.33, size * 0.3, size * 0.08);

      graphics.generateTexture(orb.texture, size, size);
      graphics.destroy();
    }
  }

  /** 패시브's icon: a lit node with a ring around it. */
  private createPassiveTexture(): void {
    const size = 48;
    const half = size / 2;
    const graphics = this.add.graphics();

    graphics.lineStyle(Math.round(size * 0.1), COLORS.passiveEdge, 1);
    graphics.strokeCircle(half, half, half - size * 0.1);
    graphics.fillStyle(COLORS.passive, 1);
    graphics.fillCircle(half, half, size * 0.24);

    graphics.generateTexture(TEXTURES.passive, size, size);
    graphics.destroy();
  }

  /**
   * 장비: a sword, point up. The same sprite on the ground, in the corner of
   * the title screen and beside 착용 중 — what you walk over and the screen
   * you take it to should be the same object.
   */
  private createGearTexture(): void {
    const size = GEAR_DROP.size * 2;
    const half = size / 2;
    const graphics = this.add.graphics();

    const bladeWidth = Math.max(3, Math.round(size * 0.16));
    const guardWidth = Math.round(size * 0.62);
    const guardHeight = Math.max(2, Math.round(size * 0.09));
    const guardY = Math.round(size * 0.66);

    // Blade: a tapered point over a straight edge.
    graphics.fillStyle(COLORS.gearEdge, 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(half, size * 0.05),
        new Phaser.Math.Vector2(half + bladeWidth / 2, size * 0.2),
        new Phaser.Math.Vector2(half + bladeWidth / 2, guardY),
        new Phaser.Math.Vector2(half - bladeWidth / 2, guardY),
        new Phaser.Math.Vector2(half - bladeWidth / 2, size * 0.2),
      ],
      true,
    );
    // A fuller down the middle, so the blade has a side lit and a side not.
    graphics.fillStyle(COLORS.gear, 1);
    graphics.fillRect(half, size * 0.18, Math.max(1, bladeWidth / 2 - 1), guardY - size * 0.18);

    // Crossguard and grip.
    graphics.fillStyle(COLORS.gear, 1);
    graphics.fillRect(half - guardWidth / 2, guardY, guardWidth, guardHeight);
    graphics.fillRect(
      half - Math.max(1, bladeWidth / 3),
      guardY + guardHeight,
      Math.max(2, (bladeWidth * 2) / 3),
      size * 0.22,
    );
    graphics.fillStyle(COLORS.gearEdge, 1);
    graphics.fillCircle(half, size * 0.95, Math.max(2, size * 0.08));

    graphics.generateTexture(TEXTURES.gear, size, size);
    graphics.destroy();
  }

  private createPotionTexture(): void {
    const size = POTION.size * 2;
    const arm = size * 0.22;
    const graphics = this.add.graphics();

    graphics.fillStyle(COLORS.potion, 1);
    graphics.fillRect(0, 0, size, size);
    graphics.fillStyle(COLORS.potionCross, 1);
    graphics.fillRect(size / 2 - arm / 2, size * 0.2, arm, size * 0.6);
    graphics.fillRect(size * 0.2, size / 2 - arm / 2, size * 0.6, arm);

    graphics.generateTexture(TEXTURES.potion, size, size);
    graphics.destroy();
  }

  /** The ice shard: a diamond, long along the axis it is fired down. */
  private createDivineShardTexture(): void {
    const { width, height } = SHOTS.iceSpear;
    const graphics = this.add.graphics();

    // Phaser 4 wants real Vector2s here; Geom.Point is gone.
    const points = [
      new Phaser.Math.Vector2(0, height / 2),
      new Phaser.Math.Vector2(width * 0.35, 0),
      new Phaser.Math.Vector2(width, height / 2),
      new Phaser.Math.Vector2(width * 0.35, height),
    ];

    graphics.fillStyle(COLORS.iceSpear, 1);
    graphics.fillPoints(points, true);
    graphics.lineStyle(1, COLORS.iceSpearEdge, 1);
    graphics.strokePoints(points, true);

    graphics.generateTexture(TEXTURES.iceShard, width, height);
    graphics.destroy();
  }

}
