import Phaser from 'phaser';

import { COLORS, DEPTH, TEXTURES, WORLD } from '@/config';
import { Player } from '@/entities/Player';
import { Hud, SpawnDirector } from '@/systems';

/**
 * The run itself: player, spawning, weapons and pickups live here.
 * Weapons and damage are still to come.
 */
export class GameScene extends Phaser.Scene {
  public static readonly KEY = 'GameScene';

  private player!: Player;
  private spawner!: SpawnDirector;
  private hud!: Hud;

  public constructor() {
    super(GameScene.KEY);
  }

  public create(): void {
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);

    this.createFloor();

    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.spawner = new SpawnDirector(this, this.player);
    this.hud = new Hud(this);

    this.showIntro();
  }

  public override update(_time: number, delta: number): void {
    this.player.update();
    this.spawner.update(delta);
    this.hud.update(delta, this.spawner.alive);
  }

  private createFloor(): void {
    this.add
      .tileSprite(0, 0, WORLD.width, WORLD.height, TEXTURES.grid)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ground);
  }

  /** Title card that clears itself once the player gets going. */
  private showIntro(): void {
    const camera = this.cameras.main;

    const title = this.add
      .text(camera.width / 2, camera.height / 2 - 24, 'Hello Survivor', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '56px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);

    const hint = this.add
      .text(camera.width / 2, camera.height / 2 + 32, 'WASD · 방향키로 이동', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: COLORS.accent,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);

    this.tweens.add({
      targets: [title, hint],
      alpha: 0,
      delay: 2200,
      duration: 900,
      onComplete: () => {
        title.destroy();
        hint.destroy();
      },
    });
  }
}
