import Phaser from 'phaser';

import { COLORS, DEPTH, TEXTURES, WORLD } from '@/config';
import { Player } from '@/entities/Player';
import { GameOverScene, type GameOverData } from '@/scenes/GameOverScene';
import { LevelUpScene, type LevelUpData } from '@/scenes/LevelUpScene';
import { CombatSystem, Hud, Progression, SpawnDirector, type UpgradeId } from '@/systems';
import { BoltWeapon } from '@/weapons';

/** The run itself: player, spawning, weapons, pickups and progression. */
export class GameScene extends Phaser.Scene {
  public static readonly KEY = 'GameScene';

  private player!: Player;
  private spawner!: SpawnDirector;
  private weapon!: BoltWeapon;
  private progression!: Progression;
  private hud!: Hud;

  private elapsedMs = 0;
  /** Level-ups earned while the popup was already open. */
  private pendingLevelUps = 0;
  private choosing = false;
  private over = false;

  public constructor() {
    super(GameScene.KEY);
  }

  public create(): void {
    this.elapsedMs = 0;
    this.pendingLevelUps = 0;
    this.choosing = false;
    this.over = false;

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);

    this.createFloor();

    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.progression = new Progression();
    this.spawner = new SpawnDirector(this, this.player);
    this.weapon = new BoltWeapon(this);
    // Registers the overlaps; nothing else needs a handle on it.
    new CombatSystem(
      this,
      this.player,
      this.spawner.group,
      this.weapon.projectiles,
      this.progression,
    );
    this.hud = new Hud(this, this.player, this.progression);

    this.progression.on(Progression.LEVEL_UP, this.onLevelUp, this);
    this.player.once(Player.DIED, this.onPlayerDied, this);

    this.showIntro();
  }

  public override update(_time: number, delta: number): void {
    if (this.over || this.choosing) {
      return;
    }

    this.elapsedMs += delta;

    this.player.update();
    this.spawner.update(delta);
    this.weapon.update(delta, {
      origin: this.player,
      enemies: this.spawner.group,
      damage: this.progression.damage,
      cooldownMs: this.progression.cooldownMs,
    });
    this.hud.update(delta, this.spawner.alive);
  }

  private createFloor(): void {
    this.add
      .tileSprite(0, 0, WORLD.width, WORLD.height, TEXTURES.grid)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ground);
  }

  private onLevelUp(): void {
    this.pendingLevelUps += 1;
    if (!this.choosing) {
      this.openLevelUp();
    }
  }

  private openLevelUp(): void {
    if (this.over || this.pendingLevelUps <= 0) {
      return;
    }

    this.pendingLevelUps -= 1;
    this.choosing = true;
    // Freeze the arena so enemies do not close in while choosing.
    this.physics.pause();

    const data: LevelUpData = {
      level: this.progression.level,
      onPick: (upgrade) => this.onUpgradePicked(upgrade),
    };
    this.scene.launch(LevelUpScene.KEY, data);
  }

  private onUpgradePicked(upgrade: UpgradeId): void {
    this.progression.apply(upgrade);
    this.choosing = false;

    if (this.pendingLevelUps > 0) {
      // Let the scene manager finish stopping the popup before relaunching it.
      this.time.delayedCall(0, () => this.openLevelUp());
      return;
    }

    this.physics.resume();
  }

  private onPlayerDied(): void {
    this.over = true;
    this.physics.pause();

    const data: GameOverData = {
      level: this.progression.level,
      survivedMs: this.elapsedMs,
      onRestart: () => this.scene.restart(),
    };
    this.scene.launch(GameOverScene.KEY, data);
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
      .text(camera.width / 2, camera.height / 2 + 32, 'WASD · 방향키로 이동 — 공격은 자동', {
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
