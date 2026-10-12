import Phaser from 'phaser';

import {
  AUDIO,
  COLORS,
  ENEMY_KINDS,
  ICONS,
  PLAYER,
  POTION,
  SHOTS,
  SKILL_LABEL,
  TEXTURES,
  VOID_ORB,
} from '@/config';
import { MENU, SCENES } from '@/config';
import { createPixelTextTexture } from '@/systems/PixelFont';
import { sfx } from '@/systems/Sfx';
import { ALL_SKILLS, type SkillDefinition } from '@/weapons/skills';

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

    this.load.audio(AUDIO.skillDrop.key, `${base}${AUDIO.skillDrop.file}`);
    sfx.preload(this);

    this.load.image(TEXTURES.gem, `${base}${ICONS.gem.file}`);
    this.load.image(TEXTURES.projectile, `${base}${ICONS.projectile.file}`);
    this.load.image(TEXTURES.skillOrb, `${base}${ICONS.skillOrb.file}`);
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

    for (const skill of ALL_SKILLS) {
      this.createSkillLabelTexture(skill);
    }

    createPixelTextTexture(this, TEXTURES.logo, ['EXILED', 'SURVIVORS'], {
      pixel: MENU.logoPixel,
      color: COLORS.logo,
      shadow: COLORS.logoShadow,
    });

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

  /** The potion: a white cross on a crimson field, read at a glance. */
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
  private createShardTexture(): void {
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

  /**
   * Bakes the plate a dropped skill sits on, sized to its name. The name
   * itself is a Text drawn on top by SkillDrop — DynamicTexture, which would
   * let the whole label be one texture, bakes empty on Phaser 4 here.
   */
  private createSkillLabelTexture(skill: SkillDefinition): void {
    const { borderWidth, paddingX, paddingY } = SKILL_LABEL;

    // Measure the name, then throw the probe away.
    const probe = this.add.text(0, 0, skill.name, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: SKILL_LABEL.fontSize,
      color: SKILL_LABEL.text,
    });
    const width = Math.ceil(probe.width) + paddingX * 2;
    const height = Math.ceil(probe.height) + paddingY * 2;
    probe.destroy();

    const plate = this.add.graphics();
    plate.fillStyle(SKILL_LABEL.background, 1);
    plate.fillRect(0, 0, width, height);
    plate.lineStyle(borderWidth, SKILL_LABEL.border, 1);
    plate.strokeRect(borderWidth / 2, borderWidth / 2, width - borderWidth, height - borderWidth);

    plate.generateTexture(skill.labelTexture, width, height);
    plate.destroy();
  }
}
