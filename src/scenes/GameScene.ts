import Phaser from 'phaser';

import {
  BALANCE,
  COLORS,
  DEPTH,
  PAUSE_BUTTON,
  SAVE,
  SCENES,
  SKILL_DROP,
  TEXTURES,
  TIMING,
  WORLD,
} from '@/config';
import { Player } from '@/entities/Player';
import { fill, skillName, t } from '@/i18n';
import { GameOverScene, type GameOverData } from '@/scenes/GameOverScene';
import { UpgradeScene, type UpgradeChoiceData } from '@/scenes/UpgradeScene';
import {
  CombatSystem,
  DamageNumbers,
  DebugOverlay,
  Hud,
  Progression,
  Separation,
  SpawnDirector,
  type SkillStats,
  type UpgradeId,
} from '@/systems';
import { RareTooltip } from '@/systems/RareTooltip';
import { saveGame, type SavedRun } from '@/systems/SaveGame';
import { settings } from '@/systems/Settings';
import { TiltInput, tiltAvailable } from '@/systems/TiltInput';
import { VirtualJoystick, prefersTouchControls } from '@/systems/VirtualJoystick';
import {
  ChainLightning,
  DROPPABLE_SKILLS,
  Fireball,
  IceSpear,
  LEVEL_UP_SKILL,
  MeleeStrike,
  VoidOrb,
  STARTING_SKILLS,
  type SkillDefinition,
  type SkillId,
  type Weapon,
} from '@/weapons';

/** How each skill turns into the weapon that runs it. */
const WEAPONS: Record<SkillId, (scene: Phaser.Scene) => Weapon> = {
  meleeStrike: (scene) => new MeleeStrike(scene),
  fireball: (scene) => new Fireball(scene),
  chainLightning: (scene) => new ChainLightning(scene),
  iceSpear: (scene) => new IceSpear(scene),
  voidOrb: (scene) => new VoidOrb(scene),
};

/** What the title screen hands over when a run starts. */
export interface GameSceneData {
  /** A run to resume, or null/absent for a fresh one. */
  readonly save?: SavedRun | null;
}

/** One queued upgrade popup, from a level-up or a skill pickup. */
interface ChoiceRequest {
  readonly title: string;
  readonly subtitle: string;
  readonly skill: SkillId;
}

/** The run itself: player, spawning, weapons, pickups and progression. */
export class GameScene extends Phaser.Scene {
  public static readonly KEY = 'GameScene';

  private player!: Player;
  private spawner!: SpawnDirector;
  private combat!: CombatSystem;
  private progression!: Progression;
  private hud!: Hud;
  private separation!: Separation;
  private damageNumbers!: DamageNumbers;
  private debug!: DebugOverlay;
  private rareTooltip!: RareTooltip;

  private weapons: Weapon[] = [];
  private owned = new Set<SkillId>();

  private elapsedMs = 0;
  private sinceSaveMs = 0;
  private resuming: SavedRun | null = null;
  /** Popups earned while one was already open. */
  private pendingChoices: ChoiceRequest[] = [];
  private choosing = false;
  private over = false;
  private invulnerable = false;
  /** Round-robin cursor for the debug drop key. */
  private nextDebugDrop = 0;

  public constructor() {
    super(GameScene.KEY);
  }

  public init(data?: GameSceneData): void {
    this.resuming = data?.save ?? null;
  }

  public create(): void {
    this.elapsedMs = 0;
    this.sinceSaveMs = 0;
    this.pendingChoices = [];
    this.choosing = false;
    this.over = false;
    this.invulnerable = false;
    this.weapons = [];
    this.owned = new Set<SkillId>();

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);

    this.createFloor();

    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.progression = new Progression();
    // The hook is called later, during play, by which point combat exists.
    this.spawner = new SpawnDirector(this, this.player, {
      fireShot: (x, y, angle, spec) => this.combat.fireEnemyShot(x, y, angle, spec),
      onBossSpawned: () => this.announce(t().game.bossArrived),
    });
    this.separation = new Separation(this.spawner.group);
    this.damageNumbers = new DamageNumbers(this);
    this.combat = new CombatSystem(
      this,
      this.player,
      this.spawner.group,
      this.progression,
      this.damageNumbers,
      {
        rollSkillDrop: (bonus, guaranteed) => this.rollSkillDrop(bonus, guaranteed),
        onSkillCollected: (skill) => this.onSkillCollected(skill),
      },
    );
    this.hud = new Hud(this, this.progression);
    this.debug = new DebugOverlay(this, this.debugActions());
    this.rareTooltip = new RareTooltip(this, this.spawner.group);
    this.armInspect();

    for (const skill of STARTING_SKILLS) {
      this.acquire(skill);
    }

    if (this.resuming) {
      this.restore(this.resuming);
    }

    this.attachTouchControls();
    this.createPauseButton();
    this.armPauseInput();

    this.progression.on(Progression.LEVEL_UP, this.onLevelUp, this);
    this.player.once(Player.DIED, this.onPlayerDied, this);

    if (!this.resuming) {
      this.showIntro();
    }
  }

  /**
   * Touch devices steer whichever way 설정 says: a pad where they pinned it,
   * a pad under the finger, or the tilt sensor. A mouse-and-keyboard session
   * gets none of them.
   */
  private attachTouchControls(): void {
    if (!prefersTouchControls()) {
      return;
    }

    // Tilt falls back to a pad on anything without the sensor.
    if (settings.value.movementMode === 'tilt' && tiltAvailable()) {
      this.player.attachAnalog(new TiltInput(this));
      return;
    }

    this.player.attachAnalog(new VirtualJoystick(this));
  }

  public override update(_time: number, delta: number): void {
    // The overlay wants the real cost of the frame, not the clamped value.
    this.debug.update(delta);

    if (this.over || this.choosing) {
      return;
    }

    // One long frame (a tab regaining focus, a GC pause) must not teleport
    // the world, so every system downstream runs on a clamped delta.
    const dt = Math.min(delta, TIMING.maxDeltaMs);
    this.elapsedMs += dt;

    this.player.update();
    this.spawner.update(dt);
    this.separation.update();

    // Each weapon runs on its own stats, so upgrades stay on their skill.
    for (const weapon of this.weapons) {
      const id = weapon.definition.id;
      const stats = this.progression.statsFor(id);
      weapon.update(dt, {
        origin: this.player,
        enemies: this.spawner.group,
        damage: this.damageOf(id),
        cooldownMs: this.progression.cooldownMsFor(id),
        range: stats.range,
        projectileSpeed: stats.projectileSpeed,
        chainCount: stats.chainCount,
        pierceCount: stats.pierceCount,
        orbCount: stats.orbCount,
        hit: this.combat.hit,
      });
    }

    this.damageNumbers.update(dt);
    this.hud.update(dt, this.spawner.alive, this.loadout());
    // The panel is glued to its enemy, which is still walking around.
    this.rareTooltip.refresh();

    this.sinceSaveMs += dt;
    if (this.sinceSaveMs >= SAVE.autosaveMs) {
      this.sinceSaveMs = 0;
      this.writeSave();
    }
  }

  /** Puts a saved run back together: stats, skills, clocks and health. */
  private restore(run: SavedRun): void {
    this.progression.level = run.level;
    this.progression.xp = run.xp;

    for (const [id, stats] of Object.entries(run.skills) as [SkillId, SkillStats][]) {
      this.acquire(id);
      Object.assign(this.progression.statsFor(id), stats);
    }

    this.player.hp = run.hp;
    this.elapsedMs = run.elapsedMs;
    this.hud.seed(run.elapsedMs);
    this.spawner.seed(run.spawnerMs);
  }

  /** The single autosave slot, written on a timer and when pausing. */
  private writeSave(): void {
    if (this.over) {
      return;
    }

    const skills: Partial<Record<SkillId, SkillStats>> = {};
    for (const id of this.owned) {
      skills[id] = { ...this.progression.statsFor(id) };
    }

    saveGame.write({
      elapsedMs: this.elapsedMs,
      level: this.progression.level,
      xp: this.progression.xp,
      hp: this.player.hp,
      skills,
      spawnerMs: this.spawner.clockMs,
    });
  }

  /**
   * Hovering a rare lists what it is carrying; on a touch screen, holding
   * it does the same. The pause screen calls `inspectAt` itself, so the
   * list can be read while the run is frozen.
   */
  private armInspect(): void {
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      this.rareTooltip.inspectAt(pointer.x, pointer.y);
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.rareTooltip.inspectAt(pointer.x, pointer.y);
    });
  }

  /** The live enemies, for anything drawing over a frozen run. */
  public get enemyGroup(): Phaser.Physics.Arcade.Group {
    return this.spawner.group;
  }

  /** Points at whatever rare is under a screen position. */
  public inspectAt(screenX: number, screenY: number): boolean {
    return this.rareTooltip.inspectAt(screenX, screenY);
  }

  public clearInspect(): void {
    this.rareTooltip.hide();
  }

  /** Esc on a keyboard, the back gesture on a phone, the corner button. */
  private armPauseInput(): void {
    this.input.keyboard?.on('keydown-ESC', this.pauseRun, this);

    // One history entry to swallow, so Android's back pauses instead of
    // leaving the page. It is re-armed each time it is spent.
    window.history.pushState({ exiledSurvivors: true }, '');
    window.addEventListener('popstate', this.onBrowserBack);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown-ESC', this.pauseRun, this);
      window.removeEventListener('popstate', this.onBrowserBack);
    });
  }

  private onBrowserBack = (): void => {
    window.history.pushState({ exiledSurvivors: true }, '');
    this.pauseRun();
  };

  private createPauseButton(): void {
    const { size, margin } = PAUSE_BUTTON;
    const x = margin + size / 2;
    const y = margin + size / 2;

    const button = this.add
      .rectangle(x, y, size, size, COLORS.panel, 0.85)
      .setStrokeStyle(2, COLORS.panelEdge, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui)
      .setInteractive({ useHandCursor: true });

    const bar = (offset: number) =>
      this.add
        .rectangle(x + offset, y, 4, size * 0.44, COLORS.textFill, 0.9)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui + 1);
    bar(-5);
    bar(5);

    button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.pauseRun, this);
  }

  /** Freezes the run and opens the pause menu over it. */
  private pauseRun(): void {
    if (this.over || this.choosing || this.scene.isPaused()) {
      return;
    }

    this.writeSave();
    this.rareTooltip.hide();
    this.scene.pause();
    this.scene.launch(SCENES.pause, {
      elapsedMs: this.elapsedMs,
      level: this.progression.level,
      onResume: () => this.scene.resume(),
      onQuit: () => {
        this.writeSave();
        this.scene.start(SCENES.menu);
      },
    });
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

    const weapon = WEAPONS[skill](this);
    this.weapons.push(weapon);

    if (weapon.projectiles) {
      this.combat.registerProjectiles(weapon.projectiles, this.spawner.group);
    }
  }

  /**
   * The first pickup simply grants the skill at its base stats. Every later
   * one opens that skill's own upgrade choice, so repeat drops stay worth
   * walking over.
   */
  private onSkillCollected(skill: SkillId): void {
    const isNew = !this.owned.has(skill);
    this.acquire(skill);

    const name = skillName(skill);
    const copy = t().game;
    this.announce(fill(isNew ? copy.pickedUp : copy.enhancedPickup, { skill: name }));

    if (!isNew) {
      this.queueChoice({ title: name, subtitle: t().upgrade.enhanced, skill });
    }
  }

  /**
   * Droppable skills keep dropping; a repeat drop upgrades instead.
   * `bonus` is the killed enemy's drop multiplier — 1 for anything ordinary.
   */
  private rollSkillDrop(bonus = 1, guaranteed = false): SkillDefinition | null {
    if (DROPPABLE_SKILLS.length === 0) {
      return null;
    }

    if (!guaranteed && Math.random() >= SKILL_DROP.chance * bonus) {
      return null;
    }

    return DROPPABLE_SKILLS[Math.floor(Math.random() * DROPPABLE_SKILLS.length)] ?? null;
  }

  /** Upgraded damage after the balance dial for that skill. */
  private damageOf(skill: SkillId): number {
    return this.progression.statsFor(skill).damage * (BALANCE.damageScale[skill] ?? 1);
  }

  private loadout(): ReadonlyArray<{ name: string; damage: number; attackSpeed: number }> {
    return this.weapons.map((weapon) => {
      const id = weapon.definition.id;
      return {
        name: skillName(id),
        damage: this.damageOf(id),
        attackSpeed: this.progression.statsFor(id).attackSpeed,
      };
    });
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

  private debugActions() {
    return {
      counts: () => ({
        enemies: this.spawner.alive,
        enemyPool: this.spawner.pooled,
        byKind: this.spawner.aliveByKind,
        rares: this.spawner.aliveRares,
        bosses: this.spawner.aliveBosses,
        enemyShots: this.combat.enemyShots.countActive(true),
        projectiles: this.weapons.reduce((n, w) => n + (w.projectiles?.countActive(true) ?? 0), 0),
        gems: this.combat.gems.countActive(true),
        drops: this.combat.skillDrops.countActive(true),
        potions: this.combat.potions.countActive(true),
        damageNumbers: this.damageNumbers.activeCount,
      }),
      stressSpawn: (count: number) => this.spawner.spawnBurst(count),
      spawnOneOfEach: () => this.spawner.spawnOneOfEach(),
      spawnRare: () => {
        this.spawner.spawnRare();
      },
      spawnBoss: () => {
        this.spawner.spawnBoss();
      },
      clearEnemies: () => this.spawner.clear(),
      grantLevel: () => this.progression.addXp(this.progression.xpToNext),
      dropSkill: () => {
        const skill = DROPPABLE_SKILLS[this.nextDebugDrop % DROPPABLE_SKILLS.length];
        this.nextDebugDrop += 1;
        if (skill) {
          this.combat.dropSkillAt(this.player.x + 60, this.player.y, skill);
        }
      },
      dropPotion: () => this.combat.dropPotionAt(this.player.x + 60, this.player.y),
      toggleInvulnerable: () => {
        this.invulnerable = !this.invulnerable;
        this.player.setInvulnerable(this.invulnerable);
        return this.invulnerable;
      },
    };
  }

  /** Level-up points are spent on the basic attack only. */
  private onLevelUp(level: number): void {
    this.queueChoice({
      title: t().upgrade.levelUp,
      subtitle: fill(t().upgrade.level, { level }),
      skill: LEVEL_UP_SKILL,
    });
  }

  private queueChoice(request: ChoiceRequest): void {
    this.pendingChoices.push(request);
    if (!this.choosing) {
      this.openNextChoice();
    }
  }

  private openNextChoice(): void {
    const request = this.pendingChoices.shift();
    if (this.over || !request) {
      return;
    }

    this.choosing = true;
    // Freeze the arena so enemies do not close in while choosing.
    this.physics.pause();

    const data: UpgradeChoiceData = {
      ...request,
      onPick: (upgrade) => this.onUpgradePicked(request.skill, upgrade),
    };
    this.scene.launch(UpgradeScene.KEY, data);
  }

  private onUpgradePicked(skill: SkillId, upgrade: UpgradeId): void {
    this.progression.apply(skill, upgrade);
    this.choosing = false;

    if (this.pendingChoices.length > 0) {
      // Let the scene manager finish stopping the popup before relaunching it.
      this.time.delayedCall(0, () => this.openNextChoice());
      return;
    }

    this.physics.resume();
  }

  private onPlayerDied(): void {
    this.over = true;
    this.physics.pause();
    // A save is somewhere to come back from, not a way to undo a death.
    saveGame.clear();

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
      .text(camera.width / 2, camera.height / 2 - 24, t().game.intro, {
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
        prefersTouchControls() ? t().game.introHintTouch : t().game.introHintKeyboard,
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
