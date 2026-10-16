import Phaser from 'phaser';

import {
  BALANCE,
  COLORS,
  DEPTH,
  PAUSE_BUTTON,
  NO_BONES,
  SHARD,
  boneBonusFor,
  type BoneBonus,
  type AltarOfferId,
  type BoneId,
  type OrbId,
  STATS,
  SAVE,
  SCENES,
  SKILL_BASE,
  SKILL_DROP,
  SKILL_PICK,
  MANGO,
  TEXT,
  TEXTURES,
  TIMING,
  WORLD,
  SKILL_MASTERY,
  AUDIO,
} from '@/config';
import type { Enemy } from '@/entities/Enemy';
import { Player } from '@/entities/Player';
import { altarOfferText, boneName, fill, gearTitle, masteryText, orbName, skillName, t } from '@/i18n';
import { GameOverScene, type GameOverData } from '@/scenes/GameOverScene';
import { SkillPickScene, type SkillPickData } from '@/scenes/SkillPickScene';
import { UpgradeScene, type UpgradeChoiceData } from '@/scenes/UpgradeScene';
import {
  CombatSystem,
  upgradeOptionsFor,
  DamageNumbers,
  DebugOverlay,
  fitText,
  Hud,
  Progression,
  RunStats,
  gold,
  type LoadoutEntry,
  Separation,
  SpawnDirector,
  type SkillStats,
  type UpgradeId,
} from '@/systems';
import { EdgeMarkers } from '@/systems/EdgeMarkers';
import { WebField } from '@/systems/WebField';
import { RareTooltip } from '@/systems/RareTooltip';
import { sfx } from '@/systems/Sfx';
import { saveGame, type SavedRun } from '@/systems/SaveGame';
import { personal } from '@/systems/PersonalBest';
import {
  NO_BONUS,
  gear,
  gearBonusFor,
  rollGearFromKill,
  rollGearItem,
  type GearBonus,
  type GearItem,
} from '@/systems/Gear';
import {
  NO_MODIFIERS,
  attackSpeedFor,
  critMultiplierFor,
  damageFor,
  gearAttackSpeedFor,
  type RunModifiers,
} from '@/systems/Modifiers';
import { bones } from '@/systems/Bones';
import { orbs } from '@/systems/Orbs';
import { passives } from '@/systems/Passives';
import { settings } from '@/systems/Settings';
import { TiltInput, requestTiltPermission, tiltAvailable } from '@/systems/TiltInput';
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
  MeleeStrike,
  VoidOrb,
  ThunderStrike,
  UNSPUN_SKILL,
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
  thunderStrike: (scene) => new ThunderStrike(scene),
};

/** What the title screen hands over when a run starts. */
export interface GameSceneData {
  /** A run to resume, or null/absent for a fresh one. */
  readonly save?: SavedRun | null;
  /**
   * The 뼈다귀 spent on this run. Already taken out of the drawer by the
   * screen that picked them, so a restart does not spend them twice.
   */
  readonly bones?: readonly BoneId[];
  /**
   * Open on the three-card choice for the run's first skill. Every fresh run
   * from the title or from 다시하기 does; a resumed run already has its
   * skills, and the dev-only `#run` skips it so the harness lands in play.
   */
  readonly startPick?: boolean;
}

/** One queued upgrade popup, from a level-up or a skill pickup. */
/**
 * One queued popup: an upgrade for one skill (a level-up, a repeat pickup),
 * or the three cards a 무작위 스킬 opens.
 */
type ChoiceRequest =
  | { readonly kind: 'upgrade'; readonly title: string; readonly subtitle: string; readonly skill: SkillId }
  | { readonly kind: 'pick' };

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
  /** The 거미줄 on the ground. Public for tests. */
  public webs!: WebField;
  private debug!: DebugOverlay;
  private rareTooltip!: RareTooltip;
  /** The 뼈다귀 this run was started with, and what they add up to. */
  private bones: BoneId[] = [];
  public boneBonus: BoneBonus = NO_BONES;
  /** The rim of the screen, pointing at what is just off it. Public for tests. */
  public edgeMarkers!: EdgeMarkers;
  /** What the carried weapon is worth, read once as the run is built. */
  private gearBonus: GearBonus = NO_BONUS;
  /** 패시브 and 장비 together, in the order they are applied. */
  private mods: RunModifiers = NO_MODIFIERS;
  /** What this run has done, read out on the screen that ends it. */
  private stats!: RunStats;
  /** The touch steering in use, so a settings change can replace it. */
  private analog?: AnalogInput;
  /** Drops the settings subscription when the run ends. */
  private unwatchSettings?: () => void;

  private weapons: Weapon[] = [];
  private owned = new Set<SkillId>();
  /**
   * The run's main skill: the first one it held (the one picked off the
   * three cards). Every level-up upgrades it; a skill picked up later is
   * upgraded by picking it up again, never by a level. Public for tests.
   */
  public mainSkill: SkillId | null = null;
  /** Skills whose 각성 has been celebrated this run. Public for tests. */
  public awakened = new Set<SkillId>();
  /** The last 각성 banner shown. Public for tests. */
  public masteryBanner?: Phaser.GameObjects.Text;

  private elapsedMs = 0;
  private sinceSaveMs = 0;
  private resuming: SavedRun | null = null;
  /** A resumed run the developer tools had already changed. */
  private devUsedBefore = false;
  private startPick = false;
  /** Popups earned while one was already open. */
  private pendingChoices: ChoiceRequest[] = [];
  private choosing = false;
  /**
   * What the mouse is reading: a skill's card, a rare's 속성. Either holds
   * the run still until the pointer moves off it.
   */
  private inspecting = { skill: false, rare: false };
  private over = false;
  private invulnerable = false;
  /** Round-robin cursor for the debug drop key. */
  private nextDebugDrop = 0;

  public constructor() {
    super(GameScene.KEY);
  }

  public init(data?: GameSceneData): void {
    this.resuming = data?.save ?? null;
    this.devUsedBefore = data?.save?.devUsed === true;
    this.startPick = data?.startPick === true && !this.resuming && SKILL_PICK.atRunStart;
    // A resumed run keeps the 뼈다귀 it was started with; they were spent
    // once, at the start, and the save remembers them.
    this.bones = [...(data?.save?.bones ?? data?.bones ?? [])];
    this.boneBonus = boneBonusFor(this.bones);
  }

  public create(): void {
    this.elapsedMs = 0;
    this.sinceSaveMs = 0;
    this.pendingChoices = [];
    this.choosing = false;
    this.inspecting = { skill: false, rare: false };
    this.over = false;
    this.invulnerable = false;
    this.weapons = [];
    this.owned = new Set<SkillId>();
    this.mainSkill = null;
    this.awakened = new Set<SkillId>();

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);

    this.createFloor();

    // Both are picked on the title screen, so they are fixed for the run:
    // 패시브 first, then 장비, then whatever the run itself adds.
    this.gearBonus = gearBonusFor(gear.equipped);
    this.mods = { passive: passives.bonus, gear: this.gearBonus };

    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2);
    this.player.applyGear(this.gearBonus);
    this.player.applyPassives(this.mods.passive);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.progression = new Progression();
    // The hook is called later, during play, by which point combat exists.
    this.spawner = new SpawnDirector(this, this.player, () => this.boneBonus, {
      fireShot: (x, y, angle, spec) => this.combat.fireEnemyShot(x, y, angle, spec),
      onBossSpawned: () => this.announceBoss(),
    });
    this.separation = new Separation(this.spawner.group, this.player);
    this.damageNumbers = new DamageNumbers(this);
    this.webs = new WebField(this);
    this.stats = new RunStats();
    this.combat = new CombatSystem(
      this,
      this.player,
      this.spawner.group,
      this.progression,
      this.damageNumbers,
      this.stats,
      {
        rollSkillDrop: (bonus, guaranteed) => this.rollSkillDrop(bonus, guaranteed),
        onSkillCollected: (skill) => this.onSkillCollected(skill),
        rollGearDrop: (fromBoss, bonus) => this.rollGearDrop(fromBoss, bonus),
        onGearCollected: (found) => this.onGearCollected(found),
        rollShardDrop: (fromBoss) => fromBoss && Math.random() < SHARD.chance,
        onShardCollected: () => this.onShardCollected(),
        onOrbCollected: (id) => this.onOrbCollected(id),
        onBoneCollected: (id) => this.onBoneCollected(id),
        onAltarWoke: (offer, x, y) => this.onAltarWoke(offer, x, y),
        onRandomSkillCollected: () => this.queueChoice({ kind: 'pick' }),
        onWeb: (x, y, stacks) => this.webs.spawn(x, y, stacks),
        onMangoCollected: () =>
          this.announce(fill(t().game.mangoEaten, { seconds: Math.round(MANGO.durationMs / 1000) })),
        dropScale: () => this.boneBonus.dropScale,
        critMultiplier: () => critMultiplierFor(this.mods),
      },
    );
    this.hud = new Hud(this, this.progression, (hold) => this.setInspecting('skill', hold));
    this.debug = new DebugOverlay(this, this.debugActions());
    this.rareTooltip = new RareTooltip(this, this.spawner.group);
    // In the order they matter: a 우두머리 before a 신성한 조각, and both
    // before a skill lying in the grass.
    this.edgeMarkers = new EdgeMarkers(this, [
      {
        group: this.spawner.group,
        filter: (object) => (object as Enemy).isBoss === true,
        // The gold ring it wears on the field, so the rim says the same
        // thing about it that the field does.
        arrowColor: COLORS.bossOutline,
      },
      {
        // A 도망자 is the other thing worth walking a long way for.
        group: this.spawner.group,
        filter: (object) => (object as Enemy).kind === 'fugitive',
        arrowColor: COLORS.gold,
      },
      { group: this.combat.altars },
      { group: this.combat.shardDrops },
      { group: this.combat.orbDrops },
      { group: this.combat.gearDrops },
      { group: this.combat.mangoDrops },
      { group: this.combat.randomSkillDrops },
      { group: this.combat.skillDrops },
      { group: this.combat.potions },
    ]);
    this.armInspect();

    // There is no basic attack: a fresh run holds what the 슬롯머신 lands
    // on, a resumed one what it was saved with. Only when the reel is off —
    // the dev server's `#run`, the test harness — does it start on a fixed
    // skill instead, so they have something to fight with.
    if (this.resuming) {
      this.restore(this.resuming);
    } else if (!this.startPick) {
      this.acquire(UNSPUN_SKILL);
    }

    this.attachTouchControls();
    this.createPauseButton();
    this.armPauseInput();

    this.player.setLevel(this.progression.level);
    this.progression.on(Progression.LEVEL_UP, this.onLevelUp, this);
    this.player.once(Player.DIED, this.onPlayerDied, this);

    if (this.startPick) {
      this.openStartPick();
    } else if (!this.resuming) {
      this.showIntro();
    }
  }

  /**
   * The run's first skill: three cards, one to take — there is no basic
   * attack. The arena is frozen while the choice is open, the same hold an
   * upgrade puts on it, and the title card waits until the skill is in hand.
   */
  private openStartPick(): void {
    const options = this.randomSkills();
    if (options.length === 0) {
      this.showIntro();
      return;
    }

    this.choosing = true;
    this.physics.pause();

    const data: SkillPickData = {
      title: t().skillPick.startTitle,
      subtitle: t().skillPick.startSubtitle,
      options,
      owned: [...this.owned],
      onPick: (skill) => {
        this.choosing = false;
        if (!this.held) {
          this.physics.resume();
        }
        this.acquire(skill);
        this.announce(fill(t().game.pickedUp, { skill: skillName(skill) }));
        this.showIntro();
        // Anything earned while the cards were up — nothing, today — goes next.
        if (this.pendingChoices.length > 0) {
          this.openNextChoice();
        }
      },
    };
    this.scene.bringToTop(SkillPickScene.KEY);
    this.scene.launch(SkillPickScene.KEY, data);
  }

  /**
   * SKILL_PICK.choices different skills, at even odds, from every skill
   * there is — held ones included, which come up as 강화.
   */
  public randomSkills(): SkillId[] {
    const pool = DROPPABLE_SKILLS.map((skill) => skill.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, SKILL_PICK.choices);
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
        next.joystickScale !== last.joystickScale;
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

    // iOS hands out orientation only after a press, and 설정 is not the only
    // way into a run — ask again here, where starting one is the press. A
    // refusal is the one reliable sign that tilt will never work, so that is
    // what puts the pad back: a sensor that is merely slow to report is not
    // second-guessed, and the survivor is never left unable to move.
    if (this.analog instanceof TiltInput) {
      void requestTiltPermission().then((granted) => {
        if (granted || !this.scene.isActive() || !(this.analog instanceof TiltInput)) {
          return;
        }

        this.analog.destroy();
        this.analog = new VirtualJoystick(this);
        this.player.attachAnalog(this.analog);
      });
    }
  }

  public override update(_time: number, delta: number): void {
    // The overlay wants the real cost of the frame, not the clamped value.
    this.debug.update(delta);

    if (this.over || this.choosing) {
      return;
    }
    // Reading a card or a rare under the mouse: nothing moves meanwhile.
    if (this.held) {
      return;
    }

    // One long frame (a tab regaining focus, a GC pause) must not teleport
    // the world, so every system downstream runs on a clamped delta.
    const dt = Math.min(delta, TIMING.maxDeltaMs);
    this.elapsedMs += dt;

    this.player.webbed = this.webs.update(dt, this.player.x, this.player.y);
    this.player.update();
    this.player.tickBuffs(dt);
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
        cooldownMs: this.cooldownOf(id),
        range: this.progression.rangeFor(id),
        projectileSpeed: stats.projectileSpeed,
        chainCount: stats.chainCount,
        orbitSpeed: stats.orbitSpeed,
        pierceCount: stats.pierceCount,
        orbCount: stats.orbCount,
        extraProjectiles: this.gearBonus.extraProjectiles,
        hit: this.combat.hit,
        mastered: this.progression.levelFor(id) >= SKILL_MASTERY.level,
        enemyShots: this.combat.enemyShots,
      });
    }
    // 화염구's 각성: the ground it burst on keeps burning.
    this.combat.tickFireZones(dt);

    this.damageNumbers.update(dt);
    this.edgeMarkers.update();
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

    // The main skill first, so it is the one held first again.
    if (run.main && run.skills[run.main]) {
      this.acquire(run.main);
    }
    for (const [id, stats] of Object.entries(run.skills) as [SkillId, SkillStats][]) {
      this.acquire(id);
      Object.assign(this.progression.statsFor(id), stats);
      // Awakened before the save: already celebrated, not again.
      if (this.progression.levelFor(id) >= SKILL_MASTERY.level) {
        this.awakened.add(id);
      }
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
      main: this.mainSkill ?? undefined,
      bones: this.bones,
      devUsed: this.devRun,
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
    // Under a mouse the run waits while the list is read. A finger shows
    // it without the wait: on a phone that finger is usually steering.
    const inspect = (pointer: Phaser.Input.Pointer): void => {
      const found = this.rareTooltip.inspectAt(pointer.x, pointer.y);
      if (pointer.wasTouch) {
        // A finger is steering: whatever a mouse was reading, nobody is now.
        this.setInspecting('skill', false);
      }
      this.setInspecting('rare', found && !pointer.wasTouch);
    };
    this.input.on(Phaser.Input.Events.POINTER_MOVE, inspect);
    this.input.on(Phaser.Input.Events.POINTER_DOWN, inspect);
    // A mouse that leaves the window is not reading anything any more.
    this.input.on(Phaser.Input.Events.GAME_OUT, () => this.stopInspecting());
  }

  /** Whether something under the mouse is holding the run. */
  private get held(): boolean {
    return this.inspecting.skill || this.inspecting.rare;
  }

  /**
   * Starts or ends one kind of reading, and freezes or frees the arena when
   * that changes whether anything is being read. A popup already holds the
   * arena on its own, and lets it go only once nothing is being read.
   */
  private setInspecting(source: 'skill' | 'rare', on: boolean): void {
    const before = this.held;
    // A phone fires a pretend mouse event after a tap. Landing on a rare —
    // under a level-up card, say, near the survivor — it would freeze the
    // run with no real mouse ever coming to let it go. On a touch screen
    // reading never holds the run.
    this.inspecting[source] = on && !prefersTouchControls();
    if (before === this.held || this.over || this.choosing) {
      return;
    }
    if (this.held) {
      this.physics.pause();
    } else {
      this.physics.resume();
    }
  }

  private stopInspecting(): void {
    this.rareTooltip.hide();
    this.hud.point(-1);
    this.setInspecting('rare', false);
    this.setInspecting('skill', false);
  }

  /** Whether the run is standing still for a card or a rare. Public for tests. */
  public get inspectHeld(): boolean {
    return this.held;
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
    this.stopInspecting();
    this.scene.pause();
    this.scene.bringToTop(SCENES.pause);
    this.scene.launch(SCENES.pause, {
      elapsedMs: this.elapsedMs,
      level: this.progression.level,
      onResume: () => {
        this.scene.resume();
        this.analog?.release?.();
      },
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
    this.mainSkill ??= skill;

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
      this.queueChoice({ kind: 'upgrade', title: name, subtitle: t().upgrade.enhanced, skill });
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
   * The weapon a kill leaves behind. A 우두머리 always leaves one, from the
   * whole roster; an ordinary kill now and then leaves one of the swords
   * that can come off anything. What it is, and what it rolled, is Gear's
   * business.
   */
  private rollGearDrop(fromBoss: boolean, bonus = 1): GearItem | null {
    return fromBoss ? rollGearItem() : rollGearFromKill(bonus);
  }

  /**
   * A 신성한 조각. Ten of them finish a 신성한 구슬, which is a point in
   * the tree — and that is worth saying out loud when it happens.
   */
  private onShardCollected(): void {
    const completed = passives.addShard();
    const copy = t().game;
    this.announce(
      completed
        ? copy.orbMade
        : fill(copy.shardFound, { held: passives.value.shards, need: SHARD.perOrb }),
    );
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
   * A 구슬 goes into the drawer, not onto the weapon: what it is spent on is
   * a decision, and the 인벤토리 is where the weapons are.
   */
  private onOrbCollected(id: OrbId): void {
    orbs.add(id);
    this.announce(fill(t().game.orbFound, { orb: orbName(id) }));
  }

  /**
   * A 뼈다귀 goes into the drawer, not into this run: what it changes is
   * decided before a run starts, which is the whole of what it is for.
   */
  private onBoneCollected(id: BoneId): void {
    bones.add(id);
    this.announce(fill(t().game.boneFound, { bone: boneName(id) }));
  }

  /**
   * A 제단 the survivor walked up to: what it offered arrives, all at once,
   * in a ring around it. It is the one spawn the survivor asks for, so it
   * says what it is.
   */
  private onAltarWoke(offer: AltarOfferId, x: number, y: number): void {
    this.spawner.summon(x, y, offer);
    this.announce(fill(t().game.altarWoke, { enemies: altarOfferText(offer) }));
  }

  /**
   * One skill's damage per hit: the tree, then the weapon, then the run,
   * and the per-skill balance dial over the lot.
   */
  private damageOf(skill: SkillId): number {
    const upgraded = this.progression.statsFor(skill).damage;
    // Whole numbers: a percentage from the tree would otherwise put a
    // decimal point on every damage number that floats off an enemy.
    return Math.round(damageFor(skill, upgraded, this.mods) * (BALANCE.damageScale[skill] ?? 1));
  }

  /** The same fold, for how often that skill goes off. */
  private cooldownOf(skill: SkillId): number {
    const upgraded = this.progression.statsFor(skill).attackSpeed;
    // A 하얀 망고 doubles every skill's pace while it lasts.
    const mango = this.player?.mangoActive ? MANGO.attackSpeedScale : 1;
    const rate = attackSpeedFor(skill, upgraded, this.mods) * mango;
    return Math.max(STATS.minCooldownMs, 1000 / Math.max(rate, 0.01));
  }

  private loadout(): ReadonlyArray<LoadoutEntry> {
    return this.weapons.map((weapon) => {
      const id = weapon.definition.id;
      const stats = this.progression.statsFor(id);
      // Read off the same folds the run fights with, so the number on the
      // HUD is the number the enemies are getting.
      const perSecond = 1000 / this.cooldownOf(id);
      const { shots, orbs } = this.projectilesOf(id);
      const targets = (1 + stats.chainCount + stats.pierceCount + Math.max(0, orbs - 1)) * shots;
      const damage = this.damageOf(id);
      return {
        id,
        name: skillName(id),
        level: this.progression.levelFor(id),
        dps: damage * perSecond * targets,
        breakdown: this.breakdownOf(id, damage, perSecond, targets),
      };
    });
  }

  /**
   * What one cast puts in the air, with the weapon's extra projectile: shots
   * for a skill that throws, orbs for one that orbits, one for the rest.
   */
  private projectilesOf(skill: SkillId): { readonly shots: number; readonly orbs: number } {
    const stats = this.progression.statsFor(skill);
    const extra = this.gearBonus.extraProjectiles;
    return {
      shots: SKILL_BASE[skill].projectileSpeed > 0 ? 1 + extra : 1,
      orbs: stats.orbCount > 0 ? stats.orbCount + extra : 0,
    };
  }

  /**
   * The hover card's lines: the same folds as `damageOf` and `cooldownOf`,
   * written out factor by factor, so what the card adds up to is what the
   * bar says.
   */
  private breakdownOf(skill: SkillId, damage: number, perSecond: number, targets: number): string[] {
    const copy = t().hud;
    const stats = this.progression.statsFor(skill);
    const base = SKILL_BASE[skill];
    const num = (value: number, digits = 2): string => String(Number(value.toFixed(digits)));
    const runScale = (from: number, to: number): number => (from === 0 ? 1 : to / from);

    const scale = BALANCE.damageScale[skill] ?? 1;
    const damageLine =
      fill(copy.formulaDamage, {
        damage,
        base: num(base.damage),
        passive: num(this.mods.passive.damageScale),
        gear: num(this.mods.gear.attack),
        run: num(runScale(base.damage, stats.damage)),
      }) +
      (this.gearBonus.damageScale === 1
        ? ''
        : fill(copy.formulaGearScale, { scale: num(this.gearBonus.damageScale) })) +
      (scale === 1 ? '' : fill(copy.formulaScale, { scale: num(scale) }));

    const mango = this.player?.mangoActive ? MANGO.attackSpeedScale : 1;
    const rateLine =
      fill(copy.formulaRate, {
        rate: num(perSecond),
        base: num(base.attackSpeed),
        passive: num(this.mods.passive.attackSpeedScale),
        gear: num(gearAttackSpeedFor(skill, this.mods.gear)),
        run: num(runScale(base.attackSpeed, stats.attackSpeed)),
      }) + (mango === 1 ? '' : fill(copy.formulaMango, { mango: num(mango) }));
    const capped = this.cooldownOf(skill) <= STATS.minCooldownMs;

    const { shots, orbs } = this.projectilesOf(skill);
    const extras = [
      [copy.targetChain, stats.chainCount],
      [copy.targetPierce, stats.pierceCount],
      [copy.targetOrbs, Math.max(0, orbs - 1)],
    ] as const;
    const added = ['1', ...extras.filter(([, n]) => n > 0).map(([label, n]) => fill(label, { n }))];
    const sum = added.length > 1 && shots > 1 ? `(${added.join(' + ')})` : added.join(' + ');
    const parts = [shots > 1 ? sum + fill(copy.targetShots, { n: shots }) : sum];

    return [
      damageLine,
      rateLine,
      ...(capped ? [fill(copy.formulaCap, { rate: num(perSecond) })] : []),
      fill(copy.formulaTargets, { targets, parts: parts.join(' + ') }),
      fill(copy.formulaDps, {
        dps: num(damage * perSecond * targets, 1),
        damage,
        rate: num(perSecond),
        targets,
      }),
      copy.formulaNote,
    ];
  }

  /**
   * A 우두머리 arrives on its horn, and nothing else.
   *
   * It used to put a banner across the middle of the screen, which is where
   * the player is standing and where the 우두머리 is walking in from — the
   * one moment in a run when covering the field costs the most. The horn
   * says the same thing and hides nothing; the gold ring and the size say
   * the rest once it is on screen.
   */
  private announceBoss(): void {
    sfx.playBossAlert(this);
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
        altars: this.combat.altars.countActive(true),
        damageNumbers: this.damageNumbers.activeCount,
        hpScale: this.spawner.hpScale,
        rareChance: this.spawner.rareChance,
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

  /**
   * A level-up upgrades the run's main skill — the first one it held. Only
   * once that has taken every upgrade there is does a level go to another
   * skill in hand, picked at random; one at every ceiling would open a popup
   * with no cards in it. The card says which.
   */
  private onLevelUp(level: number): void {
    this.player.setLevel(level);
    const open = (id: SkillId) => upgradeOptionsFor(SKILLS[id], this.progression.statsFor(id)).length > 0;
    const others = [...this.owned].filter((id) => id !== this.mainSkill && open(id));
    const skill =
      this.mainSkill && open(this.mainSkill)
        ? this.mainSkill
        : others[Math.floor(Math.random() * others.length)];
    if (!skill) {
      return;
    }

    this.queueChoice({
      kind: 'upgrade',
      title: t().upgrade.levelUp,
      subtitle: `${fill(t().upgrade.level, { level })} · ${skillName(skill)}`,
      skill,
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
    // The finger steering now goes to the cards; the stick lets it go.
    this.analog?.release?.();

    if (request.kind === 'pick') {
      this.openPick();
      return;
    }

    // Worked out here, where the live stats are, so an upgrade that has hit
    // its ceiling is simply not offered — and a skill with none left gets no
    // popup at all.
    const options = upgradeOptionsFor(SKILLS[request.skill], this.progression.statsFor(request.skill));
    if (options.length === 0) {
      this.afterChoice();
      return;
    }

    const data: UpgradeChoiceData = {
      ...request,
      options,
      onPick: (upgrade) => this.onUpgradePicked(request.skill, upgrade),
    };
    this.scene.bringToTop(UpgradeScene.KEY);
    this.scene.launch(UpgradeScene.KEY, data);
  }

  /**
   * A 무작위 스킬's three cards. A skill not yet held is acquired; one held
   * already goes on to its own upgrade choice, ahead of anything else queued.
   */
  private openPick(): void {
    const data: SkillPickData = {
      title: t().skillPick.dropTitle,
      subtitle: t().skillPick.dropSubtitle,
      options: this.randomSkills(),
      owned: [...this.owned],
      levels: Object.fromEntries([...this.owned].map((id) => [id, this.progression.levelFor(id)])),
      onPick: (skill) => {
        if (this.owned.has(skill)) {
          this.pendingChoices.unshift({
            kind: 'upgrade',
            title: skillName(skill),
            subtitle: t().upgrade.enhanced,
            skill,
          });
        } else {
          this.acquire(skill);
          this.announce(fill(t().game.pickedUp, { skill: skillName(skill) }));
        }
        this.afterChoice();
      },
    };
    this.scene.bringToTop(SkillPickScene.KEY);
    this.scene.launch(SkillPickScene.KEY, data);
  }

  private onUpgradePicked(skill: SkillId, upgrade: UpgradeId): void {
    this.progression.apply(skill, upgrade);
    this.afterChoice();
    if (!this.awakened.has(skill) && this.progression.levelFor(skill) >= SKILL_MASTERY.level) {
      this.awakened.add(skill);
      this.celebrateMastery(skill);
    }
  }

  /**
   * A skill reaches SKILL_MASTERY.level: its 각성 is announced loudly — a
   * flash of gold over the screen, the banner and what it now does, rings
   * and sparks bursting off the survivor. It holds nothing up; the run goes
   * on underneath.
   */
  public celebrateMastery(skill: SkillId): void {
    const camera = this.cameras.main;
    const { width, height } = camera;
    const depth = DEPTH.ui + 30;
    const gold = 0xffc43a;

    const flash = this.add
      .rectangle(0, 0, width, height, 0xfff1b8, 0.55)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth);
    this.tweens.add({ targets: flash, alpha: 0, duration: 450, onComplete: () => flash.destroy() });
    camera.shake(220, 0.006);

    const title = this.add
      .text(width / 2, height * 0.26, fill(t().mastery.title, { skill: skillName(skill) }), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.screen,
        fontStyle: 'bold',
        color: '#ffd76a',
        stroke: '#3a2600',
        strokeThickness: 6,
      })
      .setShadow(0, 0, '#ffb300', 18, false, true)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(depth + 2);
    fitText(title, width);
    const settled = title.scale;
    title.setScale(settled * 0.3);
    const line = this.add
      .text(width / 2, height * 0.26 + 40, masteryText(skill), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: TEXT.size.body,
        color: COLORS.text,
        stroke: '#05070b',
        strokeThickness: 4,
        align: 'center',
        wordWrap: { width: width - 40 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(depth + 2)
      .setAlpha(0);
    this.masteryBanner = title;
    this.tweens.add({ targets: title, scale: settled, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: line, alpha: 1, delay: 250, duration: 300 });
    this.tweens.add({
      targets: [title, line],
      alpha: 0,
      delay: 2400,
      duration: 600,
      onComplete: () => {
        title.destroy();
        line.destroy();
      },
    });

    // Rings and sparks off the survivor, in the world.
    const { x, y } = this.player;
    for (let i = 0; i < 3; i++) {
      const ring = this.add.circle(x, y, 18).setStrokeStyle(4, gold, 1).setDepth(DEPTH.vfx + 1);
      this.tweens.add({
        targets: ring,
        scale: 7 + i * 2,
        alpha: 0,
        delay: i * 160,
        duration: 800,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy(),
      });
    }
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2;
      const spark = this.add
        .image(x, y, TEXTURES.glow)
        .setDisplaySize(14, 14)
        .setTint(i % 2 ? 0xfff4d6 : gold)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(DEPTH.vfx + 2);
      this.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * 170,
        y: y + Math.sin(angle) * 170,
        alpha: 0,
        duration: 900,
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
    // Stay quiet rather than warn if the clip failed to load.
    if (this.cache.audio.exists(AUDIO.drops.rare.key)) {
      this.sound.play(AUDIO.drops.rare.key, { volume: AUDIO.drops.rare.volume });
    }
  }

  /** One popup is done: open the next, or let the run go on. */
  private afterChoice(): void {
    this.choosing = false;
    this.analog?.release?.();

    if (this.pendingChoices.length > 0) {
      // Let the scene manager finish stopping the popup before relaunching it.
      this.time.delayedCall(0, () => this.openNextChoice());
      return;
    }

    if (!this.held) {
      this.physics.resume();
    }
  }

  /** Whether the developer tools changed this run, now or before it was saved. */
  private get devRun(): boolean {
    return this.devUsedBefore || this.debug.used;
  }

  private onPlayerDied(): void {
    this.over = true;
    this.physics.pause();
    // A save is somewhere to come back from, not a way to undo a death.
    saveGame.clear();

    // The run is paid for the damage it dealt, so one that ended badly still
    // moved the tree forward. Paid once, here, before the screen reads it.
    const damage = this.stats.damage;
    const earned = gold.earn(damage);
    // Every run goes on 내 기록, entered on the shared board or not — but
    // not one the developer tools played a part in.
    if (!this.devRun) {
      personal.record({
        damage: Math.floor(damage),
        level: this.progression.level,
        survivedMs: Math.floor(this.elapsedMs),
      });
    }

    const data: GameOverData = {
      summary: {
        damage,
        kills: this.stats.killCount,
        byKind: this.stats.byKind,
        skills: this.loadout().map((line) => ({
          name: line.name,
          level: line.level,
          dps: line.dps,
        })),
        survivedMs: this.elapsedMs,
        level: this.progression.level,
        gold: earned,
      },
      level: this.progression.level,
      survivedMs: this.elapsedMs,
      devRun: this.devRun,
      // Explicitly fresh. A restart with no data of its own keeps whatever
      // the scene was last started with, and after 불러오기 that is the
      // loaded run — which would quietly put a death back where it resumed.
      onRestart: (applied) => this.scene.restart({ save: null, bones: applied, startPick: true }),
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
