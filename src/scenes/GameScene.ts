import Phaser from 'phaser';

import {
  BALANCE,
  BOSS_BANNER,
  COLORS,
  DEPTH,
  GEAR_DROP,
  PAUSE_BUTTON,
  SAVE,
  SCENES,
  SKILL_DROP,
  TEXT,
  TEXTURES,
  TIMING,
  WORLD,
} from '@/config';
import { Player } from '@/entities/Player';
import { fill, gearTitle, skillName, t } from '@/i18n';
import { GameOverScene, type GameOverData } from '@/scenes/GameOverScene';
import { UpgradeScene, type UpgradeChoiceData } from '@/scenes/UpgradeScene';
import {
  CombatSystem,
  upgradeOptionsFor,
  DamageNumbers,
  DebugOverlay,
  fitText,
  Hud,
  Progression,
  type LoadoutEntry,
  Separation,
  SpawnDirector,
  type SkillStats,
  type UpgradeId,
} from '@/systems';
import { RareTooltip } from '@/systems/RareTooltip';
import { sfx } from '@/systems/Sfx';
import { saveGame, type SavedRun } from '@/systems/SaveGame';
import {
  NO_BONUS,
  gear,
  gearBonusFor,
  rollGearItem,
  type GearBonus,
  type GearItem,
} from '@/systems/Gear';
import { settings } from '@/systems/Settings';
import { TiltInput, tiltAvailable } from '@/systems/TiltInput';
import {
  VirtualJoystick,
  prefersTouchControls,
  type AnalogInput,
} from '@/systems/VirtualJoystick';
import {
  ChainLightning,
  DROPPABLE_SKILLS,
  SKILLS,
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
  /** What the carried weapon is worth, read once as the run is built. */
  private gearBonus: GearBonus = NO_BONUS;
  /** The touch steering in use, so a settings change can replace it. */
  private analog?: AnalogInput;
  /** Drops the settings subscription when the run ends. */
  private unwatchSettings?: () => void;
  private bossBanner?: Phaser.GameObjects.Text;
  private bossPlate?: Phaser.GameObjects.Rectangle;

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

    // The weapon is picked on the title screen, so it is fixed for the run.
    this.gearBonus = gearBonusFor(gear.equipped);

    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2);
    this.player.applyGear(this.gearBonus);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.progression = new Progression();
    // The hook is called later, during play, by which point combat exists.
    this.spawner = new SpawnDirector(this, this.player, {
      fireShot: (x, y, angle, spec) => this.combat.fireEnemyShot(x, y, angle, spec),
      onBossSpawned: () => this.announceBoss(),
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
        rollGearDrop: (fromBoss) => this.rollGearDrop(fromBoss),
        onGearCollected: (found) => this.onGearCollected(found),
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

    this.player.setLevel(this.progression.level);
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
   *
   * 설정 is reachable from the pause screen, so the choice can change in the
   * middle of a run. The steering is rebuilt when it does, rather than
   * waiting for the next run to pick it up.
   */
  private attachTouchControls(): void {
    this.buildAnalog();

    let last = settings.value;
    this.unwatchSettings = settings.onChange((next) => {
      const moved =
        next.movementMode !== last.movementMode ||
        next.joystickScale !== last.joystickScale ||
        next.joystickX !== last.joystickX ||
        next.joystickY !== last.joystickY;
      last = next;

      if (moved) {
        this.buildAnalog();
      }
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unwatchSettings?.();
      this.unwatchSettings = undefined;
    });
  }

  /** Throws away the steering in hand and builds what 설정 now asks for. */
  private buildAnalog(): void {
    this.analog?.destroy();
    this.analog = undefined;
    this.player.attachAnalog(undefined);

    if (!prefersTouchControls()) {
      return;
    }

    // Tilt falls back to a pad on anything without the sensor.
    this.analog =
      settings.value.movementMode === 'tilt' && tiltAvailable()
        ? new TiltInput(this)
        : new VirtualJoystick(this);
    this.player.attachAnalog(this.analog);
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
        orbitSpeed: stats.orbitSpeed,
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
    this.scene.bringToTop(SCENES.pause);
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

  /**
   * The weapon a kill leaves behind. Only a 우두머리 leaves one, and it
   * always does — one a minute, which is what makes walking towards one
   * worth the trouble. What it is, and what it rolled, is Gear's business.
   */
  private rollGearDrop(fromBoss: boolean): GearItem | null {
    if (GEAR_DROP.fromBossOnly && !fromBoss) {
      return null;
    }

    return rollGearItem();
  }

  /**
   * A weapon goes straight into the stash, which outlives the run. Putting
   * it on is the title screen's business, so a run is never interrupted.
   */
  private onGearCollected(found: GearItem): void {
    gear.add(found);
    this.announce(fill(t().game.gearFound, { gear: gearTitle(found) }));
  }

  /**
   * Upgraded damage after the carried weapon and the balance dial for that
   * skill. The weapon's attack power is flat and lands before the dial, so a
   * skill tuned down gets a tuned-down share of it too.
   */
  private damageOf(skill: SkillId): number {
    const base = this.progression.statsFor(skill).damage + this.gearBonus.attack;
    return base * (BALANCE.damageScale[skill] ?? 1);
  }

  private loadout(): ReadonlyArray<LoadoutEntry> {
    return this.weapons.map((weapon) => {
      const id = weapon.definition.id;
      const scale = this.damageOf(id) / this.progression.statsFor(id).damage;
      return {
        name: skillName(id),
        level: this.progression.levelFor(id),
        // The dial scales damage, so it scales the DPS with it.
        dps: this.progression.dpsFor(id) * scale,
      };
    });
  }

  /**
   * The 우두머리 announcement: louder than a pickup banner, and only ever one
   * at a time, so two bosses in quick succession cannot overlap into mush.
   */
  private announceBoss(): void {
    sfx.playBossAlert(this);

    const camera = this.cameras.main;
    const x = camera.width / 2;
    const y = camera.height / 2 - 120;

    this.bossBanner?.destroy();
    this.bossPlate?.destroy();

    this.bossPlate = this.add
      .rectangle(x, y, BOSS_BANNER.width, BOSS_BANNER.height, COLORS.panel, 0.9)
      .setStrokeStyle(2, COLORS.bossOutline, 1)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui);

    this.bossBanner = this.add
      .text(x, y, t().game.bossArrived, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: BOSS_BANNER.fontSize,
        color: COLORS.bossText,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.ui + 1);

    const parts = [this.bossPlate, this.bossBanner];
    parts.forEach((part) => part.setScale(0.8));
    this.tweens.add({ targets: parts, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: parts,
      alpha: 0,
      delay: BOSS_BANNER.holdMs,
      duration: 500,
      onComplete: () => {
        this.bossPlate?.destroy();
        this.bossBanner?.destroy();
        this.bossPlate = undefined;
        this.bossBanner = undefined;
      },
    });
  }

  /** Brief banner, used when a skill is picked up. */
  private announce(message: string): void {
    const camera = this.cameras.main;
    const label = this.add
      .text(camera.width / 2, camera.height - 70, message, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.heading,
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
    this.player.setLevel(level);
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
      // Worked out here, where the live stats are, so an upgrade that has
      // hit its ceiling is simply not offered.
      options: upgradeOptionsFor(SKILLS[request.skill], this.progression.statsFor(request.skill)),
      onPick: (upgrade) => this.onUpgradePicked(request.skill, upgrade),
    };
    this.scene.bringToTop(UpgradeScene.KEY);
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
    this.scene.bringToTop(GameOverScene.KEY);
    this.scene.launch(GameOverScene.KEY, data);
  }

  /** Title card that clears itself once the player gets going. */
  private showIntro(): void {
    const camera = this.cameras.main;

    // The line is sized for a 960-wide canvas; a phone's is 420, where it
    // used to run off both sides.
    const title = fitText(
      this.add
        .text(camera.width / 2, camera.height / 2 - 24, t().game.intro, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: TEXT.size.huge,
          color: COLORS.text,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui),
      camera.width,
    );

    const hint = fitText(
      this.add
        .text(
          camera.width / 2,
          camera.height / 2 + 32,
          prefersTouchControls() ? t().game.introHintTouch : t().game.introHintKeyboard,
          {
            fontFamily: 'system-ui, sans-serif',
            fontSize: TEXT.size.label,
            color: COLORS.accent,
          },
        )
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(DEPTH.ui),
      camera.width,
    );

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
