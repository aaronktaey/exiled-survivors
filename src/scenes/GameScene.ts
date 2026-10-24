import Phaser from 'phaser';

import {
  AFFIXES,
  BALANCE,
  BONES,
  AFFIX_TIMING,
  COLORS,
  GEAR,
  WEB,
  gearTexture,
  DEPTH,
  ENEMY_KINDS,
  orbsHeld,
  PAUSE_BUTTON,
  NO_BONES,
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
  XP,
  SKILL_MASTERY,
  SUB_SKILLS,
  NO_HELD_BONUS,
  heldBonusFor,
  AUDIO,
  TERRAIN,
  UPGRADE_PERCENT,
  TALENT_SHARD,
  TALENT_SHARD_FX,
  shardBonusFor,
  type ShardStat,
  type ArenaThemeId,
} from '@/config';
import type { Enemy } from '@/entities/Enemy';
import { Player } from '@/entities/Player';
import {
  affixGearDetail,
  altarOfferText,
  boneDetail,
  boneName,
  fill,
  gearImplicitText,
  gearTitle,
  masteryText,
  orbName,
  skillName,
  t,
} from '@/i18n';
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
  type EffectEntry,
  Progression,
  RunStats,
  type LoadoutEntry,
  Separation,
  SpawnDirector,
  type SkillStats,
  type UpgradeId,
} from '@/systems';
import { EdgeMarkers } from '@/systems/EdgeMarkers';
import { WebField } from '@/systems/WebField';
import { Terrain } from '@/systems/Terrain';
import { RareTooltip } from '@/systems/RareTooltip';
import { sfx, effectVolume } from '@/systems/Sfx';
import { saveGame, type SavedRun } from '@/systems/SaveGame';
import { runLedger } from '@/systems/RunLedger';
import { runTally } from '@/systems/RunTally';
import { skillOffered } from '@/systems/SkillGate';
import { arenaLookOn, drawArenaDecals, ensureArenaFloor, themeFor } from '@/systems/Arena';
import { personal } from '@/systems/PersonalBest';
import { tuning } from '@/systems/Tuning';
import { dropTierFor } from '@/systems/Gear';
import { Toasts, type ToastTone } from '@/systems/Toasts';
import { HealthPotion } from '@/entities/HealthPotion';
import {
  NO_BONUS,
  gear,
  gearBonusFor,
  onCurrentLadder,
  rollGearFromKill,
  rollGearItem,
  type GearBonus,
  type GearItem,
} from '@/systems/Gear';
import {
  NO_MODIFIERS,
  NO_SHARDS,
  attackSpeedFor,
  critMultiplierFor,
  damageFor, damageParts,
  gearAttackSpeedFor,
  type RunModifiers,
} from '@/systems/Modifiers';
import { bones } from '@/systems/Bones';
import { orbs } from '@/systems/Orbs';
import { passives } from '@/systems/Passives';
import { liveUpdate } from '@/systems/LiveUpdate';
import type { RunDetail } from '@/systems/Ranking';
import { PATCH_NOTES } from '@/content/patchNotes';
import { settings } from '@/systems/Settings';
import { TiltInput, requestTiltPermission, tiltAvailable } from '@/systems/TiltInput';
import {
  VirtualJoystick,
  prefersTouchControls,
  type AnalogInput,
} from '@/systems/VirtualJoystick';
import { TapMove } from '@/systems/TapMove';
import {
  ChainLightning,
  DROPPABLE_SKILLS,
  SKILLS,
  Fireball,
  IceSpear,
  MeleeStrike,
  VoidOrb,
  Drone,
  PoisonNova,
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
  drone: (scene) => new Drone(scene),
  poisonNova: (scene) => new PoisonNova(scene),
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
  | { readonly kind: 'pick' }
  /** 재능의 파편 cards (0.102): a level-up or a 무작위 스킬 with no skill left to raise. */
  | { readonly kind: 'shard'; readonly subtitle: string };

/** How far from a rock's edge a drop is let fall, so it can be walked up to and seen whole. */
const DROP_ROOM = 20;

/** The run itself: player, spawning, weapons, pickups and progression. */
export class GameScene extends Phaser.Scene {
  public static readonly KEY = 'GameScene';

  private player!: Player;
  private spawner!: SpawnDirector;
  private combat!: CombatSystem;
  private progression!: Progression;
  private hud!: Hud;
  private separation!: Separation;
  /** 지형지물, or null on a run without them. */
  private terrain: Terrain | null = null;
  private terrainSeed = 0;
  /** The run's ground (전투 배경, 0.105), from its terrain seed. Public for tests. */
  public arenaTheme: ArenaThemeId = 'earth';
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
  /** The effects that last the whole run (장비, 패시브, 뼈다귀), built on the first look. */
  private lastingEffects?: EffectEntry[];
  /** The weapon this run went out with, as it was then; what the save carries. Public for tests. */
  public runGear: GearItem | null = null;
  /** 패시브 and 장비 together, in the order they are applied. */
  private mods: RunModifiers = NO_MODIFIERS;
  /** Every held skill's 보유 효과, folded (0.84): rebuilt each time a skill is taken. Public for tests. */
  public heldBonus = NO_HELD_BONUS;
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
  /** What the main skill's weapon is handed as `onCast`: the survivor's cast. */
  private readonly castLook = (targetX?: number): void => this.player.castLook(targetX);
  /** Skills whose 각성 has been celebrated this run. Public for tests. */
  public awakened = new Set<SkillId>();
  /** The skills past their 2차 각성 (SKILL_MASTERY.second.level). Public for tests. */
  public awakenedTwice = new Set<SkillId>();
  /** 전투 알림, top right. Public for tests. */
  public toasts!: Toasts;
  /** The last 각성 banner shown. Public for tests. */
  public masteryBanner?: Phaser.GameObjects.Text;
  /** The line under it, cleared with it when the next banner comes. */
  private masteryLine?: Phaser.GameObjects.Text;

  private elapsedMs = 0;
  private sinceSaveMs = 0;
  private resuming: SavedRun | null = null;
  /** A resumed run the developer tools had already changed. */
  private devUsedBefore = false;
  /** The admin's 밸런스 draft was on during this run. */
  private tunedRun = false;
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
  /** 활력: run time since the weapon last gave health back. */
  private regenMs = 0;
  /** The run's 재능의 파편, by stat, what they add up to, and the clock on their health (0.102). */
  private shards: Record<ShardStat, number> = GameScene.noShards();
  private shardBonus = shardBonusFor({});
  private shardRegenMs = 0;
  /** Round-robin cursor for the debug drop key. */
  private nextDebugDrop = 0;

  public constructor() {
    super(GameScene.KEY);
  }

  public init(data?: GameSceneData): void {
    this.resuming = data?.save ?? null;
    this.devUsedBefore = data?.save?.devUsed === true;
    this.tunedRun = tuning.drafting;
    this.startPick = data?.startPick === true && !this.resuming && SKILL_PICK.atRunStart;
    // A resumed run keeps the 뼈다귀 it was started with; they were spent
    // once, at the start, and the save remembers them.
    this.bones = [...(data?.save?.bones ?? data?.bones ?? [])];
    this.boneBonus = boneBonusFor(this.bones);
  }

  public create(): void {
    // The scene outlives a run: what the last one wore, spent and bought is
    // not this one's (the icons left of the skills once showed it).
    this.lastingEffects = undefined;
    this.elapsedMs = 0;
    runLedger.begin(0);
    runTally.begin();
    // Back from the pause menu: the wait there is not play.
    this.events.off(Phaser.Scenes.Events.RESUME, runLedger.hold);
    this.events.on(Phaser.Scenes.Events.RESUME, runLedger.hold);
    this.sinceSaveMs = 0;
    this.pendingChoices = [];
    this.choosing = false;
    this.inspecting = { skill: false, rare: false };
    this.over = false;
    this.invulnerable = false;
    this.regenMs = 0;
    this.shards = GameScene.noShards();
    this.shardBonus = shardBonusFor({});
    this.shardRegenMs = 0;
    this.weapons = [];
    this.owned = new Set<SkillId>();
    this.mainSkill = null;
    this.awakened = new Set<SkillId>();
    this.awakenedTwice = new Set<SkillId>();

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);

    // The ground is the terrain seed's: a resumed run stands on the one it had.
    this.terrainSeed = this.resuming?.terrainSeed ?? Terrain.newSeed();
    this.arenaTheme = themeFor(this.terrainSeed);
    this.createFloor();

    // Both are picked on the title screen, so they are fixed for the run:
    // 패시브 first, then 장비, then whatever the run itself adds. A resumed
    // run takes the weapon it went out with, not whatever is in hand now.
    this.runGear = GameScene.gearFor(this.resuming);
    this.gearBonus = gearBonusFor(this.runGear);
    this.mods = { passive: passives.bonus, gear: this.gearBonus, shard: NO_SHARDS };
    this.heldBonus = NO_HELD_BONUS;

    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2);
    this.player.applyGear(this.gearBonus);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.progression = new Progression();
    // The hook is called later, during play, by which point combat exists.
    this.spawner = new SpawnDirector(this, this.player, () => this.boneBonus, {
      fireShot: (x, y, angle, spec) => this.combat.fireEnemyShot(x, y, angle, spec),
      onBossSpawned: () => this.announceBoss(),
      onChimeraSpawned: () => this.announce(t().game.chimeraArrived, 'warning'),
    });
    this.separation = new Separation(this.spawner.group, this.player);
    // A resumed run lays the rocks it had; a new one rolls a field of its own.
    if (arenaLookOn()) {
      drawArenaDecals(this, this.terrainSeed, this.arenaTheme);
    }
    this.terrain = GameScene.terrainOn()
      ? new Terrain(this, this.terrainSeed, this.player, this.spawner.group)
      : null;
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
        onOrbCollected: (id) => this.onOrbCollected(id),
        onBoneCollected: (id) => this.onBoneCollected(id),
        onAltarWoke: (offer, x, y) => this.onAltarWoke(offer, x, y),
        onRandomSkillCollected: () => this.queueChoice({ kind: 'pick' }),
        onWeb: (x, y, stacks) => this.webs.spawn(x, y, stacks),
        onMangoCollected: () =>
          this.announce(fill(t().game.mangoEaten, { seconds: Math.round(MANGO.durationMs / 1000) })),
        onMagnetCollected: () => this.announce(t().game.magnetPulled),
        onUnknownRuneCollected: () => this.feelUnknownRune(),
        onTalentShardCollected: (stat, count) => this.gainShard(stat, count),
        shardWeight: (stat) => this.mods.passive.shardWeights[stat] ?? 1,
        dropScale: () => this.boneBonus.dropScale,
        potionScale: () => this.heldBonus.potionChanceScale,
        shatter: () =>
          this.mainSkill === 'iceSpear' && this.masteryOf('iceSpear') >= 2
            ? { radius: SKILL_MASTERY.second.iceShatter.radius * this.heldBonus.areaScale }
            : null,
        critMultiplier: () => critMultiplierFor(this.mods),
        clearOfTerrain: (x, y) => this.terrain?.clear(x, y, DROP_ROOM) ?? [x, y],
      },
    );
    this.hud = new Hud(this, this.progression, (hold) => this.setInspecting('skill', hold));
    this.toasts = new Toasts(this);
    this.debug = new DebugOverlay(this, this.debugActions());
    this.rareTooltip = new RareTooltip(this, this.spawner.group);
    // A 밸런스 experiment on this device keeps the run off both boards: said
    // at once, not only at the end.
    if (this.tunedRun) {
      this.announce(t().game.draftRun);
    }
    // In the order they matter: a 우두머리 before what lies on the ground,
    // and that before a skill lying in the grass.
    this.edgeMarkers = new EdgeMarkers(this, [
      {
        group: this.spawner.group,
        filter: (object) => (object as Enemy).isBoss === true,
        // Its standing picture: the one it shows mid-stride would flicker on the rim.
        texture: ENEMY_KINDS.boss.texture,
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
      { group: this.combat.orbDrops },
      { group: this.combat.gearDrops },
      { group: this.combat.mangoDrops },
      { group: this.combat.magnetDrops },
      { group: this.combat.unknownRuneDrops },
      { group: this.combat.talentShardDrops },
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
    const unwatchTuning = tuning.onChange((path, was, now) => this.retune(path, was, now));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unwatchTuning);
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
  /** What this player may be offered (SkillGate): every skill but a trial one, and any already held. */
  private offeredSkills(): readonly SkillDefinition[] {
    return DROPPABLE_SKILLS.filter((skill) => skillOffered(skill.id) || this.owned.has(skill.id));
  }

  private openStartPick(): void {
    // Every skill there is (0.82, the user's ask; three at random before).
    const options = this.offeredSkills().map((skill) => skill.id);
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
   * there is — held ones included, which come up as 강화, but never one held
   * at its top (0.112, the user's ask): it would have nothing to give. With
   * nothing left, none — and openPick offers 재능의 파편 cards instead.
   */
  public randomSkills(): SkillId[] {
    // With every 보조 스킬 slot taken, only the skills held come up (0.84).
    const pool = this.offeredSkills()
      .map((skill) => skill.id)
      .filter((id) => !this.subSkillsFull || this.owned.has(id))
      .filter((id) => !(this.owned.has(id) && this.maxed(id)));
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

    // Tilt falls back to a pad on anything without the sensor; 탭으로 이동
    // walks to where the screen is pressed.
    const mode = settings.value.movementMode;
    this.analog =
      mode === 'tilt' && tiltAvailable()
        ? new TiltInput(this)
        : mode === 'tap'
          ? new TapMove(this, () => this.player)
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
      runLedger.hold();
      return;
    }
    // Reading a card or a rare under the mouse: nothing moves meanwhile.
    if (this.held) {
      runLedger.hold();
      return;
    }

    // One long frame (a tab regaining focus, a GC pause) must not teleport
    // the world, so every system downstream runs on a clamped delta.
    const dt = Math.min(delta, TIMING.maxDeltaMs);
    this.elapsedMs += dt;
    runLedger.step(dt);

    this.player.webbed = this.webs.update(dt, this.player.x, this.player.y);
    this.player.update();
    this.player.tickBuffs(dt);
    this.regenerate(dt);
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
        // 타격's swing and 독성폭발's ring are areas too: the held 효과범위 widens them (0.84, 0.122).
        range: this.progression.rangeFor(id) * (id === 'meleeStrike' || id === 'poisonNova' ? this.areaScale : 1),
        projectileSpeed: stats.projectileSpeed,
        chainCount: stats.chainCount,
        orbitSpeed: stats.orbitSpeed,
        blastRadius: stats.blastRadius,
        areaScale: this.areaScale,
        recastChance: stats.recastChance,
        pierceCount: stats.pierceCount,
        orbCount: stats.orbCount,
        extraProjectiles: this.gearBonus.extraProjectiles,
        hit: this.hitFor(id),
        mastered: this.masteryOf(id) >= 1,
        masteredTwice: this.masteryOf(id) >= 2,
        enemyShots: this.combat.enemyShots,
        onCast: id === this.mainSkill ? this.castLook : undefined,
        repeatChance: this.gearBonus.repeatChance,
        droneCount: stats.droneCount,
        heal: this.healBy,
      });
    }

    // What waits on the run's clock: a 제단 being summoned.
    this.combat.update(dt);

    this.damageNumbers.update(dt);
    this.edgeMarkers.update();
    this.hud.update(dt, this.spawner.alive, this.loadout(), this.effectsNow());
    // The panel is glued to its enemy, which is still walking around.
    this.rareTooltip.refresh();

    this.sinceSaveMs += dt;
    if (this.sinceSaveMs >= SAVE.autosaveMs) {
      this.sinceSaveMs = 0;
      this.writeSave();
    }
  }

  /** Each skill's way into CombatSystem.hit, naming itself so its damage counts to it (0.121). */
  private readonly hitters = new Map<SkillId, (enemy: Enemy, amount: number, startles?: boolean) => void>();
  private hitFor(id: SkillId): (enemy: Enemy, amount: number, startles?: boolean) => void {
    let hitter = this.hitters.get(id);
    if (!hitter) {
      hitter = (enemy, amount, startles) => this.combat.hit(enemy, amount, id, startles);
      this.hitters.set(id, hitter);
    }
    return hitter;
  }

  /** Puts a saved run back together: stats, skills, clocks and health. */
  private restore(run: SavedRun): void {
    this.progression.level = run.level;
    // A save from before 0.120 counted XP in units ten times coarser.
    this.progression.xp = run.xpUnit === XP.unit ? run.xp : run.xp * XP.unit;

    // The main skill first, so it is the one held first again.
    if (run.main && run.skills[run.main]) {
      this.acquire(run.main);
    }
    for (const [id, stats] of Object.entries(run.skills) as [SkillId, SkillStats][]) {
      this.acquire(id);
      // Never under today's base: a save from before 0.83 has 화염구 and
      // 얼음창 at their old speed and reach, and 연쇄번개 at one chain — and
      // none of the stats 0.83 added, which stay at their base.
      const live = this.progression.statsFor(id) as Record<string, number>;
      for (const [field, value] of Object.entries(stats)) {
        if (typeof value === 'number' && Number.isFinite(value) && field in live) {
          live[field] = Math.max(live[field]!, value);
        }
      }
      // Awakened before the save: already celebrated, not again.
      const tier = this.masteryOf(id);
      if (tier >= 1) {
        this.awakened.add(id);
      }
      if (tier >= 2) {
        this.awakenedTwice.add(id);
      }
    }

    // Its 재능의 파편 back before the health, so a bar they had grown holds it.
    for (const stat of TALENT_SHARD.stats) {
      this.shards[stat] = Math.max(0, Math.floor(run.shards?.[stat] ?? 0));
    }
    this.applyShards();
    this.player.hp = run.hp;
    this.elapsedMs = run.elapsedMs;
    // A save from before the second clock counts its own as the shown one.
    runLedger.begin(run.wallMs ?? run.elapsedMs);
    this.hud.seed(run.elapsedMs);
    this.spawner.seed(run.spawnerMs);
    // What it had dealt and killed before the save still counts at the end.
    this.stats.seed(run.damage ?? 0, run.kills ?? {}, run.scoreByKind ?? {}, run.damageBySkill ?? {});
    // And what it had counted gaining — or, from an older save, what it holds.
    runTally.begin(run.tally ?? { levelUps: run.level - 1, skillLevels: this.totalSkillLevels() });
  }

  /**
   * The weapon a run fights with: a resumed run's own (checked, since it
   * comes from storage), or else — a new run, or a save from before saves
   * carried one — the one in hand now, copied so later changes to it in the
   * 인벤토리 do not reach this run.
   */
  private static gearFor(save: SavedRun | null): GearItem | null {
    const saved = save?.gear;
    if (saved === undefined) {
      const inHand = gear.equipped;
      return inHand ? { ...inHand, prefixes: [...inHand.prefixes], suffixes: [...inHand.suffixes] } : null;
    }
    if (saved === null || typeof saved.id !== 'string' || !Array.isArray(saved.prefixes) || !Array.isArray(saved.suffixes)) {
      return null;
    }
    // Rolled before 0.88's seven rungs, its lines move down onto them.
    return onCurrentLadder(saved);
  }

  /**
   * What is acting on the survivor, for the icons left of the skills: the
   * weapon the run went out with, the 패시브 bought, the 뼈다귀 spent, then
   * whatever is on them right now (하얀 망고, 거미줄). The first three are
   * fixed for the run and built once.
   */
  private effectsNow(): EffectEntry[] {
    if (!this.lastingEffects) {
      this.lastingEffects = this.buildLastingEffects();
    }
    const out = [...this.lastingEffects];
    const copy = t().hud;
    // 재능의 파편 (0.106: an icon with the count, in place of 0.102's line of text).
    const held = TALENT_SHARD.stats.reduce((sum, stat) => sum + this.shards[stat], 0);
    if (held > 0) {
      const shard = t().shard;
      out.push({
        id: 'shard', kind: 'buff', icon: TEXTURES.talentShard, tint: TALENT_SHARD_FX.tint.attackSpeed, count: held,
        title: fill(shard.hud, { count: held, list: '' }).replace(/\s*·\s*$/, ''),
        lines: TALENT_SHARD.stats
          .filter((stat) => this.shards[stat] > 0)
          .map((stat) => fill(shard.gain[stat], GameScene.shardValues(this.shards[stat]))),
      });
    }
    if (this.player.mangoLeftMs > 0) {
      out.push({
        id: 'mango', kind: 'buff', icon: TEXTURES.mango, title: t().filter.items.mango,
        lines: [fill(copy.effectMango, { scale: MANGO.attackSpeedScale, seconds: Math.ceil(this.player.mangoLeftMs / 1000) })],
      });
    }
    if (this.player.webbed) {
      out.push({
        id: 'web', kind: 'debuff', icon: TEXTURES.webIcon, title: copy.effectWeb,
        lines: [fill(copy.effectWebLine, { slow: Math.round(WEB.slow * 100) })],
      });
    }
    return out;
  }

  private buildLastingEffects(): EffectEntry[] {
    const out: EffectEntry[] = [];
    const item = this.runGear;
    if (item && GEAR[item.id]) {
      const lines = [
        gearImplicitText(item.id),
        ...[...item.prefixes, ...item.suffixes]
          .filter((line) => AFFIXES[line.id] !== undefined)
          .map((line) => affixGearDetail(line.id, line.tier)),
      ].filter(Boolean);
      out.push({ id: 'gear', kind: 'gear', icon: gearTexture(item.id), title: gearTitle(item), lines });
    }
    // No 패시브 icon since 0.106 (the user's ask): the tree only weighs the shards now.
    for (const id of this.bones) {
      const bone = BONES[id];
      if (bone) {
        out.push({ id: `bone:${id}`, kind: 'bone', icon: bone.texture, title: boneName(id), lines: [boneDetail(id)] });
      }
    }
    return out;
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
      gear: this.runGear,
      main: this.mainSkill ?? undefined,
      bones: this.bones,
      devUsed: this.devRun,
      elapsedMs: this.elapsedMs,
      wallMs: runLedger.ms,
      tally: runTally.value,
      level: this.progression.level,
      xp: this.progression.xp,
      xpUnit: XP.unit,
      hp: this.player.hp,
      skills,
      spawnerMs: this.spawner.clockMs,
      damage: this.stats.damageExact,
      kills: this.stats.killsByKind,
      scoreByKind: this.stats.scoreByKind,
      damageBySkill: this.stats.damageBySkill,
      terrainSeed: this.terrainSeed,
      shards: { ...this.shards },
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
      dps: () => this.loadout().map((line) => ({ id: line.id, name: line.name, dps: line.dps })),
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

  /** 지형지물 are tried on the dev server first; `TERRAIN.devOnly` off ships them. */
  private static terrainOn(): boolean {
    return TERRAIN.enabled && (import.meta.env.DEV || !TERRAIN.devOnly);
  }

  /** The grid, or — while 전투 배경 is tried (arenaLookOn) — the flagstones. */
  private createFloor(): void {
    this.add
      .tileSprite(0, 0, WORLD.width, WORLD.height, arenaLookOn() ? ensureArenaFloor(this, this.arenaTheme) : TEXTURES.grid)
      .setOrigin(0, 0)
      .setDepth(DEPTH.ground);
  }

  /** Adds a skill's weapon and wires whatever collisions it needs. */
  private acquire(skill: SkillId): void {
    if (this.owned.has(skill)) {
      return;
    }
    this.owned.add(skill);
    // Taking a skill is its first level (a resumed run's are re-counted after).
    runTally.skillLevel();
    this.mainSkill ??= skill;
    // What holding it gives every skill and the survivor (0.84).
    this.heldBonus = heldBonusFor(this.owned);
    this.player.applyHeld(this.heldBonus);
    // The survivor dresses for the main skill (0.76's look, kept in 0.80).
    if (this.mainSkill === skill) {
      this.player.wearLook(skill);
    }

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
    // No room for another (0.84): one that dropped before the last slot filled is a potion.
    if (isNew && this.subSkillsFull) {
      this.drinkForMaxedSkill(skill, 'full');
      return;
    }
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
    const offered = this.offeredSkills();
    if (offered.length === 0) {
      return null;
    }

    if (!guaranteed && Math.random() >= SKILL_DROP.chance * bonus) {
      return null;
    }

    // With every 보조 스킬 slot taken, only a skill already held drops (0.84).
    const pool = this.subSkillsFull ? offered.filter((skill) => this.owned.has(skill.id)) : offered;
    return pool[Math.floor(Math.random() * pool.length)] ?? null;
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
   * A weapon goes straight into the stash, which outlives the run. Putting
   * it on is the title screen's business, so a run is never interrupted.
   */
  private onGearCollected(found: GearItem): void {
    gear.add(found);
    this.announce(fill(t().game.gearFound, { gear: gearTitle(found) }), dropTierFor(found) === 'rare' ? 'rare' : 'normal');
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
    this.announce(fill(t().game.altarWoke, { enemies: altarOfferText(offer) }), 'warning');
  }

  /**
   * One skill's damage per hit: the tree, then the weapon, then the run,
   * and the per-skill balance dial over the lot.
   */
  private damageOf(skill: SkillId): number {
    const upgraded = this.progression.statsFor(skill).damage;
    // Whole numbers: a percentage from the tree would otherwise put a
    // decimal point on every damage number that floats off an enemy.
    return Math.round(damageFor(skill, upgraded, this.mods) * (BALANCE.damageScale[skill] ?? 1) * this.heldBonus.damageScale);
  }

  /** The same fold, for how often that skill goes off. */
  private cooldownOf(skill: SkillId): number {
    const upgraded = this.progression.statsFor(skill).attackSpeed;
    // A 하얀 망고 doubles every skill's pace while it lasts.
    const mango = this.player?.mangoActive ? MANGO.attackSpeedScale : 1;
    const rate = attackSpeedFor(skill, upgraded, this.mods) * mango * this.heldBonus.attackSpeedScale;
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
        mastery: this.masteryOf(id),
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
      orbs: stats.orbCount > 0 ? orbsHeld(stats.orbCount, extra) : 0,
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
    // 플랫 × 증가 × 증폭 (0.93): the held 얼음창 is one more 증폭.
    const layers = damageParts(skill, stats.damage, this.mods);
    const damageLine =
      fill(copy.formulaDamage, {
        damage,
        base: num(layers.base),
        gear: num(layers.attack),
        coeff: num(layers.coeff),
        increase: num(layers.increase),
        amplify: num(layers.amplify * this.heldBonus.damageScale),
      }) + (scale === 1 ? '' : fill(copy.formulaScale, { scale: num(scale) }));

    const mango = this.player?.mangoActive ? MANGO.attackSpeedScale : 1;
    const rateLine =
      fill(copy.formulaRate, {
        rate: num(perSecond),
        base: num(base.attackSpeed),
        passive: num(this.mods.shard.attackSpeed),
        gear: num(gearAttackSpeedFor(skill, this.mods.gear)),
        run: num(runScale(base.attackSpeed, stats.attackSpeed)),
      }) + (mango === 1 ? '' : fill(copy.formulaMango, { mango: num(mango) })) +
      (this.heldBonus.attackSpeedScale === 1 ? '' : fill(copy.formulaHeld, { scale: num(this.heldBonus.attackSpeedScale) }));
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
    this.announce(t().game.bossArrived, 'warning');
  }

  /** A line for the player — a pickup, a 우두머리 — as a toast in the top-right corner. */
  private announce(message: string, tone: ToastTone = 'normal'): void {
    this.toasts.show(message, tone);
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
      // F11: the main skill's picks taken one after another until its next 각성.
      awakenMain: () => {
        const skill = this.mainSkill;
        if (!skill) {
          return 'no main skill yet';
        }
        const goal = this.masteryOf(skill) >= 1 ? SKILL_MASTERY.second.level : SKILL_MASTERY.level;
        for (let guard = 0; guard < 200 && this.progression.levelFor(skill) < goal; guard++) {
          const before = this.progression.levelFor(skill);
          for (const upgrade of SKILLS[skill].upgrades) {
            this.progression.apply(skill, upgrade);
            if (this.progression.levelFor(skill) > before) {
              break;
            }
          }
          if (this.progression.levelFor(skill) === before) {
            break;
          }
        }
        const tier = this.masteryOf(skill);
        if (tier >= 1 && !this.awakened.has(skill)) {
          this.awakened.add(skill);
          this.celebrateMastery(skill, 1);
        } else if (tier >= 2 && !this.awakenedTwice.has(skill)) {
          this.awakenedTwice.add(skill);
          this.celebrateMastery(skill, 2);
        }
        return `${skill} Lv ${this.progression.levelFor(skill)} (awakening ${tier})`;
      },
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
   * A level-up upgrades the run's main skill — the first one it held. Once
   * that has taken every upgrade there is, the level is a 체력 포션 instead
   * (drinkForMaxedSkill), said plainly so it does not look lost.
   */
  private onLevelUp(level: number): void {
    runTally.levelUp();
    this.player.setLevel(level);
    const skill = this.mainSkill;
    if (!skill) {
      return;
    }
    // Nothing left to take: the level is a 재능의 파편 to choose instead (0.102; a potion
    // before), and the cards say why — the main skill, not every skill, is at its top (0.112).
    if (this.maxed(skill)) {
      this.queueChoice({ kind: 'shard', subtitle: `${fill(t().upgrade.level, { level })} · ${t().shard.mainMaxed}` });
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
    if (request.kind === 'shard') {
      this.openShardPick(request.subtitle);
      return;
    }

    // Worked out here, where the live stats are, so an upgrade that has hit
    // its ceiling is simply not offered — and a skill with none left gets no
    // popup at all.
    const options = upgradeOptionsFor(SKILLS[request.skill], this.progression.statsFor(request.skill));
    if (options.length === 0) {
      // A skill with every upgrade taken: what would have been one is a potion.
      this.drinkForMaxedSkill(request.skill);
      this.afterChoice();
      return;
    }

    const data: UpgradeChoiceData = {
      ...request,
      options,
      onPick: (upgrade) => this.onUpgradePicked(request.skill, upgrade as UpgradeId),
    };
    this.scene.bringToTop(UpgradeScene.KEY);
    this.scene.launch(UpgradeScene.KEY, data);
  }

  /**
   * A 무작위 스킬's three cards. A skill not yet held is acquired; one held
   * already goes on to its own upgrade choice, ahead of anything else queued.
   */
  private openPick(): void {
    const options = this.randomSkills();
    // Every skill it could offer at its top — none left to offer: 재능의 파편 cards instead (0.102).
    if (options.length === 0 || options.every((skill) => this.owned.has(skill) && this.maxed(skill))) {
      this.openShardPick(`${t().skillPick.dropTitle} · ${t().shard.allMaxed}`);
      return;
    }
    const data: SkillPickData = {
      title: t().skillPick.dropTitle,
      subtitle: t().skillPick.dropSubtitle,
      options,
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
        } else if (this.subSkillsFull) {
          this.drinkForMaxedSkill(skill, 'full');
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
    const before = this.progression.levelFor(skill);
    this.progression.apply(skill, upgrade);
    runTally.skillLevel(this.progression.levelFor(skill) - before);
    this.afterChoice();
    const tier = this.masteryOf(skill);
    if (tier >= 1 && !this.awakened.has(skill)) {
      this.awakened.add(skill);
      this.celebrateMastery(skill, 1);
    } else if (tier >= 2 && !this.awakenedTwice.has(skill)) {
      this.awakenedTwice.add(skill);
      this.celebrateMastery(skill, 2);
    }
  }

  /**
   * How far a skill is awakened: 0, 1 at SKILL_MASTERY.level, 2 at
   * SKILL_MASTERY.second.level — the main skill only (0.83, the user's ask).
   * Public for tests.
   */
  public masteryOf(skill: SkillId): 0 | 1 | 2 {
    if (skill !== this.mainSkill) {
      return 0;
    }
    const level = this.progression.levelFor(skill);
    return level >= SKILL_MASTERY.second.level ? 2 : level >= SKILL_MASTERY.level ? 1 : 0;
  }

  /**
   * What a level-up or a repeat pickup gives a skill that has taken every
   * upgrade there is: a 체력 포션's worth of health, said over the survivor.
   */
  /**
   * A skill with every upgrade taken: the level-up (or the repeat pickup)
   * that would have gone into it is a 체력 포션 instead. Said three ways, so
   * it is not mistaken for a level-up that went nowhere: 포션 효과! over the
   * survivor with the health it gave, a green burst round them, and a toast
   * naming the skill.
   */
  /** Every 보조 스킬 slot taken (SUB_SKILLS.max besides the main skill): no other skill can come in. */
  public get subSkillsFull(): boolean {
    return [...this.owned].filter((id) => id !== this.mainSkill).length >= SUB_SKILLS.max;
  }

  /** Whether a skill has taken every upgrade there is. */
  private maxed(skill: SkillId): boolean {
    return upgradeOptionsFor(SKILLS[skill], this.progression.statsFor(skill)).length === 0;
  }

  private static noShards(): Record<ShardStat, number> {
    return Object.fromEntries(TALENT_SHARD.stats.map((stat) => [stat, 0])) as Record<ShardStat, number>;
  }

  /** Every radius the run widens: the held 화염구's, and the shards' 효과범위 (0.102). */
  private get areaScale(): number {
    return this.heldBonus.areaScale * this.shardBonus.area;
  }

  /**
   * 재능의 파편's cards: TALENT_SHARD.choices of the stats, evenly — the
   * tree does not weigh these (the user's word). Taking one is a shard.
   */
  private openShardPick(subtitle: string): void {
    const copy = t().shard;
    const picks = Phaser.Utils.Array.Shuffle([...TALENT_SHARD.stats]).slice(0, TALENT_SHARD.choices);
    const data: UpgradeChoiceData = {
      title: copy.pickTitle,
      subtitle,
      icon: TEXTURES.talentShard,
      options: picks.map((stat) => ({
        id: stat,
        label: copy.stats[stat],
        detail: fill(copy.gain[stat], GameScene.shardValues(1)),
      })),
      onPick: (stat) => {
        this.gainShard(stat as ShardStat);
        this.afterChoice();
      },
    };
    this.scene.bringToTop(UpgradeScene.KEY);
    this.scene.launch(UpgradeScene.KEY, data);
  }

  /** The numbers a shard line fills in, for `count` shards. */
  private static shardValues(count: number): { n: number; heal: number; secs: number } {
    return {
      n: Math.round(count * TALENT_SHARD.amplify * 100),
      heal: count * TALENT_SHARD.regen,
      secs: TALENT_SHARD.regenEveryMs / 1000,
    };
  }

  /** One 재능의 파편 more of `stat`: folded in at once, said over the survivor. */
  private gainShard(stat: ShardStat, count = 1): void {
    this.shards[stat] += count;
    this.applyShards();
    const { x, y } = this.player;
    const line = fill(t().shard.gain[stat], GameScene.shardValues(count));
    const tint = TALENT_SHARD_FX.tint[stat];
    this.damageNumbers.spawn(x, y - 70, 0, { text: line, color: Phaser.Display.Color.IntegerToColor(tint).rgba, crit: true });
    const glow = this.add
      .image(x, y, TEXTURES.glow)
      .setDisplaySize(70, 70)
      .setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.player + 1);
    this.tweens.add({
      targets: glow,
      alpha: 0,
      scale: glow.scale * 2.4,
      duration: 700,
      ease: 'Quad.easeOut',
      onComplete: () => glow.destroy(),
    });
    this.announce(fill(count > 1 ? t().shard.lumpToast : t().shard.toast, { line }), 'heal');
  }

  /** What the run's shards add up to, everywhere they act, and the line on the HUD. */
  private applyShards(): void {
    this.shardBonus = shardBonusFor(this.shards);
    this.mods = { ...this.mods, shard: { damage: this.shardBonus.damage, attackSpeed: this.shardBonus.attackSpeed } };
    this.player.applyShards({ moveSpeedScale: this.shardBonus.moveSpeed, maxHpScale: this.shardBonus.maxHp });
  }

  /**
   * 활력 (a weapon 속성, 0.88): every AFFIX_TIMING.regenEveryMs of the run's
   * own clock the survivor gets the weapon's health back, shown in green
   * over them when it filled anything. The 재능의 파편's 체력회복 (0.102)
   * runs on its own clock beside it.
   */
  private regenerate(dt: number): void {
    const fromShards = this.shardBonus.regen;
    if (fromShards > 0) {
      this.shardRegenMs += dt;
      if (this.shardRegenMs >= TALENT_SHARD.regenEveryMs) {
        this.shardRegenMs -= TALENT_SHARD.regenEveryMs;
        const healed = this.player.heal(fromShards);
        if (healed > 0) {
          this.damageNumbers.spawn(this.player.x, this.player.y - 46, healed, { prefix: '+', color: COLORS.healText });
        }
      }
    }
    const amount = this.gearBonus.regen;
    if (amount <= 0) {
      return;
    }
    this.regenMs += dt;
    if (this.regenMs < AFFIX_TIMING.regenEveryMs) {
      return;
    }
    this.regenMs -= AFFIX_TIMING.regenEveryMs;
    const healed = this.player.heal(amount);
    if (healed > 0) {
      this.damageNumbers.spawn(this.player.x, this.player.y - 46, healed, { prefix: '+', color: COLORS.healText });
    }
  }

  /**
   * 알수없는 룬 (0.89): it does nothing yet — only the line over the
   * survivor and a violet glow say a great power is felt.
   */
  private feelUnknownRune(): void {
    const { x, y } = this.player;
    this.damageNumbers.spawn(x, y - 70, 0, { text: t().game.unknownRuneFelt, color: COLORS.runeText, crit: true });
    const glow = this.add
      .image(x, y, TEXTURES.glow)
      .setDisplaySize(70, 70)
      .setTint(0xb07cff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.player + 1);
    this.tweens.add({
      targets: glow,
      alpha: 0,
      scale: glow.scale * 2.4,
      duration: 700,
      ease: 'Quad.easeOut',
      onComplete: () => glow.destroy(),
    });
  }

  private drinkForMaxedSkill(skill: SkillId, why: 'maxed' | 'full' = 'maxed'): void {
    const healed = this.player.heal(HealthPotion.healingFor(this.player.maxHp));
    const { x, y } = this.player;
    // Over the survivor's own name and health, not on them.
    this.damageNumbers.spawn(x, y - 70, 0, { text: t().game.potionEffect, color: COLORS.healText, crit: true });
    this.damageNumbers.spawn(x, y - 46, healed, { prefix: '+', color: COLORS.healText });
    const burst = this.add
      .image(x, y, TEXTURES.glow)
      .setDisplaySize(70, 70)
      .setTint(0x7ef0b0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DEPTH.player + 1);
    this.tweens.add({
      targets: burst,
      alpha: 0,
      scale: burst.scale * 2.4,
      duration: 600,
      ease: 'Quad.easeOut',
      onComplete: () => burst.destroy(),
    });
    this.announce(fill(why === 'full' ? t().game.subSkillsFullHeal : t().game.maxedHeal, { skill: skillName(skill), heal: Math.round(healed) }), 'heal');
  }


  /**
   * A skill reaches SKILL_MASTERY.level: its 각성 is announced loudly — a
   * flash of gold over the screen, the banner and what it now does, rings
   * and sparks bursting off the survivor. It holds nothing up; the run goes
   * on underneath.
   */
  public celebrateMastery(skill: SkillId, tier: 1 | 2 = 1): void {
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
      .text(width / 2, height * 0.26, fill(tier === 2 ? t().mastery.title2 : t().mastery.title, { skill: skillName(skill) }), {
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
      .text(width / 2, height * 0.26 + 40, masteryText(skill, tier), {
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
    // A banner still up gives way to the new one, so two never sit on each other.
    for (const old of [this.masteryBanner, this.masteryLine]) {
      if (old?.active) {
        this.tweens.killTweensOf(old);
        old.destroy();
      }
    }
    this.masteryBanner = title;
    this.masteryLine = line;
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
    // The clip it has always had (마법's, which 희귀 borrowed until 0.111).
    const clip = AUDIO.drops.magic;
    if (clip && this.cache.audio.exists(clip.key)) {
      this.sound.play(clip.key, { volume: effectVolume(clip.volume) });
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
    return this.devUsedBefore || this.debug.used || this.tunedRun;
  }

  /**
   * A 밸런스 dial turned while the run is on. Everything but a skill's own
   * stats is read where it is used and needs nothing here; a skill's stats
   * were copied when it was picked up, so they are moved by what moved —
   * scaled, for a stat that upgrades by a share of its base (which keeps the
   * picks it has taken, and so its level), and shifted for one that counts.
   */
  private retune(path: string, was: number, now: number): void {
    if (tuning.drafting) {
      this.tunedRun = true;
    }
    const base = /^SKILL_BASE\.(\w+)\.(\w+)$/.exec(path);
    if (base) {
      const [, skill, field] = base as unknown as [string, SkillId, keyof SkillStats];
      if (!this.owned.has(skill)) {
        return;
      }
      const stats = this.progression.statsFor(skill) as Record<string, number>;
      stats[field] = field in UPGRADE_PERCENT && was > 0 ? (stats[field]! * now) / was : stats[field]! + (now - was);
      return;
    }
    const share = /^UPGRADE_PERCENT\.(\w+)$/.exec(path);
    if (share && was > 0) {
      const field = share[1] as keyof SkillStats;
      for (const skill of this.owned) {
        const stats = this.progression.statsFor(skill) as Record<string, number>;
        const start = SKILL_BASE[skill][field as keyof typeof SKILL_BASE.meleeStrike];
        stats[field] = start + (stats[field]! - start) * (now / was);
      }
    }
  }

  /** Health back from a skill (0.94: 공허구체's 각성). Bound, so a weapon can hold it. */
  private healBy = (amount: number): void => {
    this.player.heal(amount);
  };

  /** Every held skill's level, added up — what the run's tally counts toward. */
  private totalSkillLevels(): number {
    let total = 0;
    for (const id of this.owned) {
      total += this.progression.levelFor(id);
    }
    return total;
  }

  private onPlayerDied(): void {
    this.over = true;
    this.physics.pause();
    // A save is somewhere to come back from, not a way to undo a death.
    saveGame.clear();

    const damage = this.stats.damage;
    const score = this.stats.score;
    // Every run goes on 내 기록, entered on the shared board or not — but
    // not one the developer tools played a part in. Ranked by its score (0.116).
    if (!this.devRun) {
      personal.record({
        damage: Math.floor(damage),
        score,
        level: this.progression.level,
        survivedMs: Math.floor(this.elapsedMs),
      });
    }

    const data: GameOverData = {
      summary: {
        damage,
        score,
        kills: this.stats.killCount,
        byKind: this.stats.byKind,
        skills: this.loadout().map((line) => ({
          id: line.id,
          name: line.name,
          level: line.level,
          damage: this.stats.damageOf(line.id),
        })),
        survivedMs: this.elapsedMs,
        level: this.progression.level,
      },
      level: this.progression.level,
      survivedMs: this.elapsedMs,
      devRun: this.devRun,
      // Levels that do not come to what was counted: off the board, no reason given.
      refused: !runTally.matches(this.progression.level, this.totalSkillLevels()),
      devReason: this.devUsedBefore || this.debug.used ? 'debug' : this.tunedRun ? 'draft' : undefined,
      mainSkill: this.mainSkill ?? undefined,
      detail: this.runDetail(),
      // Explicitly fresh. A restart with no data of its own keeps whatever
      // the scene was last started with, and after 불러오기 that is the
      // loaded run — which would quietly put a death back where it resumed.
      onRestart: (applied) => this.scene.restart({ save: null, bones: applied, startPick: true }),
    };
    this.scene.bringToTop(GameOverScene.KEY);
    this.scene.launch(GameOverScene.KEY, data);
  }

  /**
   * 판 내역: what the run hands the ranking about itself — build, version,
   * kills by kind, 뼈다귀, weapon, skills, 패시브, and whether it came back
   * from a save — for the admin to read when a run looks out of line.
   */
  private runDetail(): RunDetail {
    const gear = this.runGear;
    const lines = (list: readonly { id: string; tier: number }[]) => list.map(({ id, tier }) => ({ id, tier }));
    return {
      build: liveUpdate.current,
      version: PATCH_NOTES[0]?.version ?? '',
      kills: this.stats.killsByKind as Record<string, number>,
      bones: [...this.bones],
      gear: gear ? { id: gear.id, prefixes: lines(gear.prefixes), suffixes: lines(gear.suffixes) } : null,
      skills: this.loadout().map((line) => ({ id: line.id, level: line.level })),
      passives: { ...passives.value.ranks } as Record<string, number>,
      resumed: this.resuming !== null,
      wall: runLedger.ms,
    };
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
