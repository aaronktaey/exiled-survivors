import Phaser from 'phaser';

import { AUDIO, COLORS, ENEMY, ICONS, PLAYER, SHOTS, SKILL_LABEL, TEXTURES } from '@/config';
import { GameScene } from '@/scenes/GameScene';
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

    this.load.image(TEXTURES.gem, `${base}${ICONS.gem.file}`);
    this.load.image(TEXTURES.projectile, `${base}${ICONS.projectile.file}`);
    this.load.image(TEXTURES.skillOrb, `${base}${ICONS.skillOrb.file}`);
  }

  public create(): void {
    this.createGridTexture();
    this.createSquareTexture(TEXTURES.player, PLAYER.size, COLORS.player);
    this.createSquareTexture(TEXTURES.enemy, ENEMY.size, COLORS.enemy);
    this.createShardTexture();

    for (const skill of ALL_SKILLS) {
      this.createSkillLabelTexture(skill);
    }

    this.scene.start(GameScene.KEY);
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
