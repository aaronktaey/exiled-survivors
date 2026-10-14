import Phaser from 'phaser';

import {
  ALL_BONES,
  ALL_ORBS,
  AUDIO,
  COLORS,
  ENEMY_KINDS,
  GEAR_DROP,
  ICONS,
  SHARD,
  SKILL_ICONS,
  SLOT,
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
      if (icon.file) {
        this.load.image(icon.key, `${base}${icon.file}`);
      }
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
    this.createBoneTextures();
    this.createAltarTexture();
    this.createThunderIcon();


    createPixelTextTexture(this, TEXTURES.logo, ['EXILED', 'SURVIVORS'], {
      pixel: MENU.logoPixel,
      color: COLORS.logo,
      shadow: COLORS.logoShadow,
    });

    this.paintAdColumns();

    // Dev-only shortcut past the title, so the integration harness can drive
    // a run without clicking through the menu first.
    const skipMenu = import.meta.env.DEV && window.location.hash === '#run';
    const harness = (window as { __harness?: boolean }).__harness === true;
    if (import.meta.env.DEV && (skipMenu || harness)) {
      // The test harness (it marks the page) and `#run` both want to be in
      // play at once, and a reel waiting for 확정 would freeze every run
      // they start — from the title as much as from `#run`.
      (SLOT as { atRunStart: boolean }).atRunStart = false;
    }
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
   * The 뼈다귀: a skull and a rib, drawn plainly enough to read at 18px.
   * Bone-coloured rather than tinted, because what tells them apart on the
   * floor is the shape.
   */
  private createBoneTextures(): void {
    for (const bone of ALL_BONES) {
      const size = 32;
      const graphics = this.add.graphics();

      graphics.fillStyle(bone.color, 1);
      if (bone.id === 'skull') {
        // A dome with a jaw under it, and two sockets cut into the face.
        graphics.fillRoundedRect(size * 0.16, size * 0.12, size * 0.68, size * 0.56, size * 0.22);
        graphics.fillRect(size * 0.3, size * 0.6, size * 0.4, size * 0.2);
        graphics.fillStyle(0x15181f, 1);
        graphics.fillCircle(size * 0.36, size * 0.38, size * 0.1);
        graphics.fillCircle(size * 0.64, size * 0.38, size * 0.1);
        graphics.fillRect(size * 0.46, size * 0.52, size * 0.08, size * 0.1);
        // The teeth, as gaps in the jaw.
        graphics.fillRect(size * 0.42, size * 0.6, size * 0.04, size * 0.2);
        graphics.fillRect(size * 0.54, size * 0.6, size * 0.04, size * 0.2);
      } else {
        // A shaft with a knob at each end, laid on the diagonal.
        graphics.fillRect(size * 0.2, size * 0.44, size * 0.6, size * 0.12);
        graphics.fillCircle(size * 0.22, size * 0.4, size * 0.11);
        graphics.fillCircle(size * 0.22, size * 0.6, size * 0.11);
        graphics.fillCircle(size * 0.78, size * 0.4, size * 0.11);
        graphics.fillCircle(size * 0.78, size * 0.6, size * 0.11);
        graphics.fillStyle(0x15181f, 0.25);
        graphics.fillRect(size * 0.2, size * 0.52, size * 0.6, size * 0.04);
      }

      graphics.generateTexture(bone.texture, size, size);
      graphics.destroy();
    }
  }

  /**
   * 낙뢰's icon, drawn rather than loaded: a yellow bolt on a dark disc, the
   * same 32px the pack's icons are, so the drop and the card size it alike.
   */
  private createThunderIcon(): void {
    const key = SKILL_ICONS.thunderStrike?.key;
    if (!key || this.textures.exists(key)) {
      return;
    }

    const size = 32;
    const graphics = this.add.graphics();
    graphics.fillStyle(0x1b2340, 1);
    graphics.fillCircle(size / 2, size / 2, size * 0.47);
    graphics.lineStyle(2, COLORS.lightningGlow, 1);
    graphics.strokeCircle(size / 2, size / 2, size * 0.44);
    graphics.fillStyle(0xffe066, 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(size * 0.58, size * 0.1),
        new Phaser.Math.Vector2(size * 0.28, size * 0.55),
        new Phaser.Math.Vector2(size * 0.48, size * 0.55),
        new Phaser.Math.Vector2(size * 0.38, size * 0.9),
        new Phaser.Math.Vector2(size * 0.74, size * 0.42),
        new Phaser.Math.Vector2(size * 0.53, size * 0.42),
      ],
      true,
    );
    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  /**
   * The 제단: a stepped stone block with an ember burning on top. Grey and
   * squat where every pickup is bright and round, so it does not read as
   * something to walk over for free.
   */
  private createAltarTexture(): void {
    const size = 32;
    const graphics = this.add.graphics();

    // Base step, the block, and the slab across the top.
    graphics.fillStyle(COLORS.altarStone, 1);
    graphics.fillRect(size * 0.12, size * 0.8, size * 0.76, size * 0.14);
    graphics.fillRect(size * 0.24, size * 0.5, size * 0.52, size * 0.32);
    graphics.fillRect(size * 0.16, size * 0.42, size * 0.68, size * 0.1);
    // A seam down the block, so it reads as stone rather than a box.
    graphics.fillStyle(0x15181f, 0.35);
    graphics.fillRect(size * 0.48, size * 0.52, size * 0.04, size * 0.28);

    // The ember: a wide flame with a hotter core.
    graphics.fillStyle(COLORS.altarFlame, 1);
    graphics.fillTriangle(size * 0.3, size * 0.42, size * 0.7, size * 0.42, size * 0.5, size * 0.06);
    graphics.fillStyle(0xffd34d, 1);
    graphics.fillTriangle(size * 0.4, size * 0.42, size * 0.6, size * 0.42, size * 0.5, size * 0.2);

    graphics.generateTexture(TEXTURES.altar, size, size);
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
      } else if (orb.id === 'awaken') {
        // A cross with the arms stepping outward: one more of something.
        const arm = size * 0.07;
        graphics.fillRect(half - arm / 2, size * 0.22, arm, size * 0.56);
        graphics.fillRect(size * 0.22, half - arm / 2, size * 0.56, arm);
      } else {
        // A crack across the face: it may not survive its own use.
        graphics.fillPoints(
          [
            new Phaser.Math.Vector2(half - size * 0.04, size * 0.18),
            new Phaser.Math.Vector2(half + size * 0.12, half - size * 0.04),
            new Phaser.Math.Vector2(half + size * 0.02, half),
            new Phaser.Math.Vector2(half + size * 0.14, size * 0.82),
            new Phaser.Math.Vector2(half - size * 0.06, half + size * 0.04),
            new Phaser.Math.Vector2(half + size * 0.02, half - size * 0.02),
          ],
          true,
        );
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
