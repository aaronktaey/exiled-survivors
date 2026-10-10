import Phaser from 'phaser';

import { COLORS, DEPTH, SKILL_DROP, TEXTURES, WORLD } from '@/config';
import { Player } from '@/entities/Player';
import { GameOverScene, type GameOverData } from '@/scenes/GameOverScene';
import { LevelUpScene, type LevelUpData } from '@/scenes/LevelUpScene';
import { CombatSystem, Hud, Progression, SpawnDirector, type UpgradeId } from '@/systems';
import { VirtualJoystick, prefersTouchControls } from '@/systems/VirtualJoystick';
import {
  DROPPABLE_SKILLS,
  Fireball,
  MeleeStrike,
  SKILLS,
  STARTING_SKILLS,
  type SkillDefinition,
  type SkillId,
  type Weapon,
} from '@/weapons';

/** The run itself: player, spawning, weapons, pickups and progression. */
export class GameScene extends Phaser.Scene {
  public static readonly KEY = 'GameScene';

  private player!: Player;
  private spawner!: SpawnDirector;
  private combat!: CombatSystem;
  private progression!: Progression;
  private hud!: Hud;

  private weapons: Weapon[] = [];
  private owned = new Set<SkillId>();

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
    this.weapons = [];
    this.owned = new Set<SkillId>();

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);

    this.createFloor();

    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.progression = new Progression();
    this.spawner = new SpawnDirector(this, this.player);
    this.combat = new CombatSystem(this, this.player, this.spawner.group, this.progression, {
      rollSkillDrop: () => this.rollSkillDrop(),
      onSkillCollected: (skill) => this.acquire(skill),
    });
    this.hud = new Hud(this, this.player, this.progression);

    for (const skill of STARTING_SKILLS) {
      this.acquire(skill);
    }

    // Touch devices get a thumb stick; a mouse-and-keyboard session does not.
    if (prefersTouchControls()) {
      this.player.attachAnalog(new VirtualJoystick(this));
    }

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

    const context = {
      origin: this.player,
      facing: this.player.facing,
      enemies: this.spawner.group,
      damage: this.progression.damage,
      cooldownMs: this.progression.cooldownMs,
      hit: this.combat.hit,
    };
    for (const weapon of this.weapons) {
      weapon.update(delta, context);
    }

    this.hud.update(delta, this.spawner.alive, this.ownedNames());
  }

  private createFloor(): void {
    this.add
      .tileSprite(0, 0, WORLD.width, WORLD.height, TEXTURES.grid)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ground);
  }

  /** Adds a skill's weapon and wires whatever collisions it needs. */
  private acquire(skill: SkillId): void {
    if (this.owned.has(skill)) {
      return;
    }
    this.owned.add(skill);

    const weapon: Weapon = skill === 'fireball' ? new Fireball(this) : new MeleeStrike(this);
    this.weapons.push(weapon);

    if (weapon.projectiles) {
      this.combat.registerProjectiles(weapon.projectiles, this.spawner.group);
    }

    this.announce(`${SKILLS[skill].name} 획득`);
  }

  private rollSkillDrop(): SkillDefinition | null {
    const candidates = DROPPABLE_SKILLS.filter((skill) => !this.owned.has(skill.id));
    if (candidates.length === 0 || Math.random() >= SKILL_DROP.chance) {
      return null;
    }

    return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
  }

  private ownedNames(): string {
    return this.weapons.map((weapon) => weapon.definition.name).join(' · ');
  }

  /** Brief banner, used when a skill is picked up. */
  private announce(message: string): void {
    const camera = this.cameras.main;
    const label = this.add
      .text(camera.width / 2, camera.height - 70, message, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: COLORS.text,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);

    this.tweens.add({
      targets: label,
      alpha: 0,
      y: label.y - 24,
      delay: 900,
      duration: 700,
      onComplete: () => label.destroy(),
    });
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
      .text(
        camera.width / 2,
        camera.height / 2 + 32,
        prefersTouchControls() ? '스틱을 끌어 이동 — 공격은 자동' : 'WASD · 방향키로 이동 — 공격은 자동',
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '18px',
          color: COLORS.accent,
        },
      )
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
