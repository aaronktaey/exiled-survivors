import Phaser from 'phaser';

import {
  AFFIXES,
  ALL_RUNES,
  RUNES,
  RUNE_SLOTS,
  TURRET,
  LEVEL_UP,
  SKILL_SLOT,
  SUB_SKILLS,
  SKILL_ICONS,
  type RuneId,
  BALANCE,
  BONES,
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
  SKILL_PICK,
  MANGO,
  TEXT,
  TEXTURES,
  TIMING,
  WORLD,
  SKILL_MASTERY,
  AUDIO,
  TERRAIN,
  GEAR_SLOTS,
  CHIMERA_RUSH,
  ORBS,
  ORB_DROP,
  UPGRADE_PERCENT,
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
  runeName,
  skillName,
  t,
} from '@/i18n';
import { GameOverScene, type GameOverData } from '@/scenes/GameOverScene';
import { SkillPickScene, type SkillPickData } from '@/scenes/SkillPickScene';
import { UpgradeScene, type UpgradeChoiceData } from '@/scenes/UpgradeScene';
import type { SlotData } from '@/scenes/SlotScene';
import type { UpgradeOption } from '@/systems/Progression';
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
import { personal } from '@/systems/PersonalBest';
import { tuning } from '@/systems/Tuning';
import { dropTierFor } from '@/systems/Gear';
import { Toasts, type ToastTone } from '@/systems/Toasts';
import { HealthPotion } from '@/entities/HealthPotion';
import type { EnemyShot } from '@/entities/EnemyShot';
import {
  NO_BONUS,
  rollGearFromKill,
  rollGearItem,
  slotOf,
  type GearBonus,
  type GearItem,
} from '@/systems/Gear';
import { RunKit } from '@/systems/RunKit';
import { runLedger } from '@/systems/RunLedger';
import { OrbTray } from '@/systems/OrbTray';
import { itemFilter } from '@/systems/ItemFilter';
import { GearPickScene, type GearPickChoice, type GearPickData } from '@/scenes/GearPickScene';
import { RuneChiselScene, type RuneChiselData } from '@/scenes/RuneChiselScene';
import {
  NO_MODIFIERS,
  areaRadiusFor,
  attackSpeedFor,
  critMultiplierFor,
  damageFor,
  durationScaleFor,
  extraChainsFor,
  extraPierceFor,
  extraProjectilesFor,
  gearAttackSpeedFor,
  byTurretFor,
  critChanceFor,
  pierceKeepFor,
  projectileSpeedScaleFor,
  repeatsFor,
  runeAttackSpeedFor,
  runesOf,
  type RunModifiers,
} from '@/systems/Modifiers';
import { bones } from '@/systems/Bones';
import { StatSheet } from '@/systems/StatSheet';
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
  type SkillId,
  type Weapon,
  type WeaponContext,
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

/**
 * One queued popup: an upgrade for one skill (a level-up), a piece of gear
 * picked up, or a 룬 끌's choice of skill.
 */
type ChoiceRequest =
  | { readonly kind: 'upgrade'; readonly title: string; readonly subtitle: string; readonly skill: SkillId }
  /** A level-up with more than one skill that can take it: which skill, first. */
  | { readonly kind: 'levelPick'; readonly level: number }
  /** A 무작위 스킬: the 슬롯머신 for a 보조 스킬. */
  | { readonly kind: 'slot' }
  | { readonly kind: 'chisel' }
  | { readonly kind: 'gear'; readonly item: GearItem };

/** 포격의 룬: one turret — the skill's own weapon, cast from where the turret stands. */
interface Turret {
  readonly skill: SkillId;
  readonly weapon: Weapon;
  readonly body: Phaser.GameObjects.Container;
  leftMs: number;
}

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
  /** 포격의 룬's turrets, kept and reused, and when each skill sets its next one down. */
  private turrets: Turret[] = [];
  private turretClock = new Map<SkillId, number>();
  /** When the last 구슬 pickup was said over the survivor, and on which row (ORB_DROP.pickupText). */
  private orbTextAt = -Infinity;
  private orbTextRow = 0;
  /** The 구슬 held, bottom right. Public for tests. */
  public orbTray?: OrbTray;
  /** The weapon this run went out with, as it was then; what the save carries. Public for tests. */
  /** What this run wears, keeps and holds (2026-10-19: gear lives and dies with the run). */
  public kit: RunKit = RunKit.fresh();
  /** The piece the 장비 획득 popup is asking about, while it is up. Public for tests. */
  public gearOnOffer: GearItem | null = null;
  /** The kit's listener, let go when the scene shuts down. */
  private unwatchKit?: () => void;
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
  /** 전투 알림, top right. Public for tests. */
  public toasts!: Toasts;
  /** The last 각성 banner shown. Public for tests. */
  public masteryBanner?: Phaser.GameObjects.Text;

  private elapsedMs = 0;
  private sinceSaveMs = 0;
  private resuming: SavedRun | null = null;
  /** A resumed run the developer tools had already changed. */
  private devUsedBefore = false;
  /** The admin's 밸런스 draft was on during this run. */
  private tunedRun = false;
  /** Account experience picked up since it was last handed to the tree's store, and in the whole of this sitting. */
  /** 원소 과부하: until when (scene clock) the elements are charged. */
  /** Each weapon's hit, booked to its skill, made once a weapon. */
  private hitters = new Map<SkillId, (enemy: Enemy, amount: number) => void>();
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
    this.turrets = [];
    this.turretClock = new Map();
    this.elapsedMs = 0;
    this.orbTextAt = -Infinity;
    this.orbTextRow = 0;
    runLedger.begin(0);
    // Back from the pause menu: the wait there is not play.
    this.events.off(Phaser.Scenes.Events.RESUME, runLedger.hold);
    this.events.on(Phaser.Scenes.Events.RESUME, runLedger.hold);
    this.sinceSaveMs = 0;
    this.pendingChoices = [];
    this.hitters = new Map();
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

    // The kit is the run's own: fresh (the starting gear) or the saved run's —
    // its gear, its 구슬, its 룬 and every skill's 강화 슬롯.
    this.kit = RunKit.restore(this.resuming);
    this.gearOnOffer = null;
    this.gearBonus = this.kit.bonus;
    this.mods = { runes: this.runeSheets(), gear: this.gearBonus };
    this.unwatchKit?.();
    this.unwatchKit = this.kit.onChange(() => this.refitGear());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unwatchKit?.();
      this.unwatchKit = undefined;
    });

    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2);
    this.player.applyGear(this.gearBonus);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.progression = new Progression();
    // The hook is called later, during play, by which point combat exists.
    this.spawner = new SpawnDirector(this, this.player, () => this.boneBonus, {
      fireShot: (x, y, angle, spec) => this.combat.fireEnemyShot(x, y, angle, spec),
      onBossSpawned: () => this.announceBoss(),
      onChimeraRush: () => this.startChimeraRush(),
    });
    this.separation = new Separation(this.spawner.group, this.player);
    // A resumed run lays the rocks it had; a new one rolls a field of its own.
    this.terrainSeed = this.resuming?.terrainSeed ?? Terrain.newSeed();
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
        onRuneCollected: (id) => this.onRuneCollected(id),
        onChiselCollected: () => this.queueChoice({ kind: 'chisel' }),
        chiselWanted: () => [...this.owned].some((skill) => this.kit.canAddSlot(skill)),
        onRandomSkillCollected: () => this.queueChoice({ kind: 'slot' }),
        randomSkillWanted: () => this.slotSkills().length > 0,
        rollGearDrop: (fromBoss, bonus) => this.rollGearDrop(fromBoss, bonus),
        onGearCollected: (found) => this.onGearCollected(found),
        onOrbCollected: (id) => this.onOrbCollected(id),
        onBoneCollected: (id) => this.onBoneCollected(id),
        onAltarWoke: (offer, x, y) => this.onAltarWoke(offer, x, y),
        onWeb: (x, y, stacks) => this.webs.spawn(x, y, stacks),
        onMangoCollected: () =>
          this.announce(fill(t().game.mangoEaten, { seconds: Math.round(MANGO.durationMs / 1000) })),
        onMagnetCollected: () => this.announce(t().game.magnetPulled),
        // 아이템 발견 from the gear, on top of what the 뼈다귀 do.
        dropScale: () => this.boneBonus.dropScale * this.gearBonus.itemFindScale,
        // A skill's crits: the gear's, and that skill's 룬.
        critChance: (skill) => critChanceFor(skill, this.mods),
        critMultiplier: (skill) => critMultiplierFor(this.mods, skill),
        xpScale: () => this.gearBonus.xpGainScale,
        clearOfTerrain: (x, y) => this.terrain?.clear(x, y, DROP_ROOM) ?? [x, y],
      },
    );
    this.hud = new Hud(this, this.progression, (hold) => this.setInspecting('skill', hold));
    this.toasts = new Toasts(this);
    this.orbTray = new OrbTray(this, this.kit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.orbTray?.destroy());
    this.debug = new DebugOverlay(this, this.debugActions());
    this.rareTooltip = new RareTooltip(this, this.spawner.group);
    // A 밸런스 experiment on this device keeps the run off both boards: said
    // at once, not only at the end.
    if (this.tunedRun) {
      this.announce(t().game.draftRun);
    }
    // In the order they matter: a 우두머리 before a 신성한 조각, and both
    // before a skill lying in the grass.
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
      { group: this.combat.gearDrops },
      { group: this.combat.mangoDrops },
      { group: this.combat.magnetDrops },
      { group: this.combat.runeDrops },
      { group: this.combat.randomSkillDrops },
      { group: this.combat.chiselDrops },
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
  private openStartPick(): void {
    const options = DROPPABLE_SKILLS.map((skill) => skill.id);
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
      // Back to the title instead: nothing has been played, so the 뼈다귀 put
      // in for this run go back in the drawer.
      onBack: () => {
        for (const id of this.bones) {
          bones.add(id);
        }
        this.bones = [];
        this.over = true;
        this.scene.start(SCENES.menu);
      },
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

    // Reading a card or a rare under the mouse holds the run too: nothing moves meanwhile.
    if (this.over || this.choosing || this.held) {
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
    this.spawner.update(dt);
    this.separation.update();

    // Each weapon runs on its own stats, so upgrades stay on their skill.
    for (const weapon of this.weapons) {
      const id = weapon.definition.id;
      const context = this.contextFor(id);
      // 포격의 룬: the survivor does not cast it; the turrets do.
      if (byTurretFor(id, this.mods)) {
        weapon.rest?.();
        this.tickTurrets(id, dt, context);
        continue;
      }
      weapon.update(dt, context);
    }
    this.retireStrayTurrets();
    // 화염구's 각성: the ground it burst on keeps burning.
    this.combat.tickFireZones(dt);

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
    // A save from before the second clock counts its own as the shown one.
    runLedger.begin(run.wallMs ?? run.elapsedMs);
    this.hud.seed(run.elapsedMs);
    this.spawner.seed(run.spawnerMs);
    // What it had dealt and killed before the save still counts at the end.
    this.stats.seed(run.damage ?? 0, run.kills ?? {});
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
    for (const slot of GEAR_SLOTS) {
      const item = this.kit.equipped[slot];
      if (!item || !GEAR[item.id]) {
        continue;
      }
      const lines = [
        gearImplicitText(item.id),
        ...[...item.prefixes, ...item.suffixes]
          .filter((line) => AFFIXES[line.id] !== undefined)
          .map((line) => affixGearDetail(line.id, line.tier)),
      ].filter(Boolean);
      out.push({ id: `gear:${slot}`, kind: 'gear', icon: gearTexture(item.id), title: gearTitle(item), lines });
    }
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
      kit: this.kit.state,
      main: this.mainSkill ?? undefined,
      bones: this.bones,
      devUsed: this.devRun,
      elapsedMs: this.elapsedMs,
      wallMs: runLedger.ms,
      level: this.progression.level,
      xp: this.progression.xp,
      hp: this.player.hp,
      skills,
      spawnerMs: this.spawner.clockMs,
      damage: this.stats.damageExact,
      kills: this.stats.killsByKind,
      terrainSeed: this.terrainSeed,
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
    // The main skill comes with its 강화 슬롯 (a save already holds them),
    // and the survivor dresses for it.
    if (this.mainSkill === skill) {
      this.kit.ensureSlots(skill, RUNE_SLOTS.main);
      this.player.wearLook(skill);
    }

    const weapon = WEAPONS[skill](this);
    this.weapons.push(weapon);

    if (weapon.projectiles) {
      this.combat.registerProjectiles(weapon.projectiles, this.spawner.group);
    }
  }

  /**
   * Gives a skill the way a pickup did before 0.74: one not held is
   * acquired at its base stats, one held opens its upgrade choice. Nothing
   * in play drops a skill any more; the F-keys and the harness give one
   * through here.
   */
  public onSkillCollected(skill: SkillId): void {
    const isNew = !this.owned.has(skill);
    this.acquire(skill);

    const name = skillName(skill);
    const copy = t().game;
    this.announce(fill(isNew ? copy.pickedUp : copy.enhancedPickup, { skill: name }));

    if (!isNew) {
      this.queueChoice({ kind: 'upgrade', title: name, subtitle: t().upgrade.enhanced, skill });
    }
  }

  /** A 룬 picked up goes among the run's, to be set from the pause menu — said at once, and over the survivor. */
  private onRuneCollected(id: RuneId): void {
    this.kit.addRune(id);
    const line = fill(t().runes.found, { rune: runeName(id) });
    this.announce(line);
    this.sayOverhead(line, RUNES[id]?.color ?? 0xffffff);
  }

  /**
   * A 룬 끌's choice: every skill held, the full ones shut. Taking one adds
   * a 강화 슬롯 to it; with nothing to take (all full) it says so and goes.
   */
  private openChiselPick(): void {
    const skills = this.skillsHeld;
    if (!skills.some((skill) => this.kit.canAddSlot(skill))) {
      this.announce(t().runes.chiselFull);
      this.afterChoice();
      return;
    }
    const data: RuneChiselData = {
      kit: this.kit,
      skills,
      onPick: (skill) => {
        if (this.kit.addSlot(skill)) {
          this.announce(fill(t().runes.chiselAdded, { skill: skillName(skill), n: this.kit.socketsOf(skill).length, max: RUNE_SLOTS.max }));
        }
        this.afterChoice();
      },
    };
    this.scene.bringToTop(RuneChiselScene.KEY);
    this.scene.launch(RuneChiselScene.KEY, data);
  }

  /** The skills held, the main one first. Public for the 룬 screens and for tests. */
  public get skillsHeld(): SkillId[] {
    const main = this.mainSkill;
    return [...(main && this.owned.has(main) ? [main] : []), ...[...this.owned].filter((skill) => skill !== main)];
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
   * A piece picked up: the run stops on the choice of wearing it (what was
   * worn goes into the 보관함) or keeping it. One the 아이템 필터 hides was
   * not wanted in sight, so it goes into the 보관함 without asking — or, with
   * no room, is let go.
   */
  private onGearCollected(found: GearItem): void {
    if (!itemFilter.showsGear(found)) {
      this.keepGear(found);
      return;
    }
    this.queueChoice({ kind: 'gear', item: found });
  }

  /** Into the 보관함, said; let go and said when it is full. */
  private keepGear(item: GearItem): void {
    const copy = t().runGear;
    if (this.kit.store(item)) {
      this.announce(fill(copy.kept, { gear: gearTitle(item) }));
    } else {
      this.announce(fill(copy.bagFull, { gear: gearTitle(item) }), 'warning');
    }
  }

  /** The 장비 획득 popup for one piece. */
  private openGearPick(item: GearItem): void {
    this.gearOnOffer = item;
    const data: GearPickData = {
      item,
      worn: this.kit.equipped[slotOf(item)],
      bagFull: this.kit.bagFull,
      onChoose: (choice: GearPickChoice) => {
        this.gearOnOffer = null;
        if (choice === 'wear') {
          this.kit.equip(item);
          this.announce(fill(t().runGear.wore, { gear: gearTitle(item) }), dropTierFor(item) === 'rare' ? 'rare' : 'normal');
        } else if (choice === 'keep') {
          this.keepGear(item);
        }
        this.afterChoice();
      },
    };
    this.scene.bringToTop(GearPickScene.KEY);
    this.scene.launch(GearPickScene.KEY, data);
  }

  /**
   * What is worn changed (a piece put on, a 구슬 spent, a piece gone): the
   * survivor is refitted at once — health kept as it is, only held under the
   * new full bar — and the icons left of the skills say what is worn now.
   */
  private refitGear(): void {
    this.gearBonus = this.kit.bonus;
    this.mods = { runes: this.runeSheets(), gear: this.gearBonus };
    this.player?.applyGear(this.gearBonus, true);
    this.lastingEffects = undefined;
  }

  /** A 구슬 picked up goes into the run's kit, to be spent while paused. */
  private onOrbCollected(id: OrbId): void {
    this.kit.addOrb(id);
    const line = fill(t().game.orbFound, { orb: orbName(id) });
    this.announce(line);
    // And over the survivor, in the 구슬's colour (0.73, the user's ask).
    this.sayOverhead(line, ORBS[id]?.color ?? 0xffffff);
  }

  /** A pickup said over the survivor; ones close together stack up (ORB_DROP.pickupText). */
  private sayOverhead(line: string, color: number): void {
    const { above, step, windowMs, max } = ORB_DROP.pickupText;
    const now = this.time.now;
    this.orbTextRow = now - this.orbTextAt < windowMs ? (this.orbTextRow + 1) % max : 0;
    this.orbTextAt = now;
    const colour = `#${color.toString(16).padStart(6, '0')}`;
    this.damageNumbers.spawn(this.player.x, this.player.y - above - this.orbTextRow * step, 0, { text: line, color: colour, crit: true });
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
    return Math.round(damageFor(skill, upgraded, this.mods) * (BALANCE.damageScale[skill] ?? 1));
  }

  /** Every 룬 set in any skill, counted by kind — what the run hands the ranking. */
  private runeCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const skill of Object.keys(SKILLS) as SkillId[]) {
      for (const rune of this.kit.runesIn(skill)) {
        out[rune] = (out[rune] ?? 0) + 1;
      }
    }
    return out;
  }

  /** What one skill is cast with this frame: its stats, folded with its 룬 and the gear. */
  private contextFor(id: SkillId): WeaponContext {
    const stats = this.progression.statsFor(id);
    const speedScale = projectileSpeedScaleFor(id, this.mods);
    const durationScale = durationScaleFor(id, this.mods);
    const thrown = stats.projectileSpeed > 0;
    return {
      origin: this.player,
      enemies: this.spawner.group,
      damage: this.damageOf(id),
      cooldownMs: this.cooldownOf(id),
      // A thrown skill's reach is how far it flies: faster, or longer in the
      // air (가속의 룬, 지속의 룬), is further.
      range: this.progression.rangeFor(id) * (thrown ? speedScale * durationScale : 1),
      projectileSpeed: stats.projectileSpeed * speedScale,
      chainCount: this.chainsOf(id),
      orbitSpeed: stats.orbitSpeed,
      pierceCount: this.piercesOf(id),
      orbCount: stats.orbCount,
      extraProjectiles: extraProjectilesFor(id, this.mods),
      areaScale: areaRadiusFor(id, this.mods),
      durationScale,
      repeats: repeatsFor(id, this.mods),
      pierceKeep: pierceKeepFor(id, this.mods),
      hit: this.hitterFor(id),
      mastered: this.progression.levelFor(id) >= SKILL_MASTERY.level,
      enemyShots: this.combat.enemyShots,
    };
  }

  /**
   * 포격의 룬: a turret is set down where the survivor stands every
   * TURRET.everyMs, lasts TURRET.lifeMs, and casts the skill from where it
   * stands with the skill's own stats. Each turret is a weapon of its own
   * (its own cooldown and shots), kept and reused once it has gone.
   */
  private tickTurrets(id: SkillId, dt: number, context: WeaponContext): void {
    const next = (this.turretClock.get(id) ?? 0) - dt;
    this.turretClock.set(id, next <= 0 ? next + TURRET.everyMs : next);
    if (next <= 0) {
      this.placeTurret(id);
    }
    for (const turret of this.turrets) {
      if (turret.skill !== id || turret.leftMs <= 0) {
        continue;
      }
      turret.leftMs -= dt;
      if (turret.leftMs <= 0) {
        this.retireTurret(turret);
        continue;
      }
      // The last second fades it out, so its going is no surprise.
      turret.body.setAlpha(Math.min(1, turret.leftMs / 1000));
      turret.weapon.update(dt, { ...context, origin: turret.body });
    }
  }

  private placeTurret(id: SkillId): void {
    let turret = this.turrets.find((t) => t.skill === id && t.leftMs <= 0);
    if (!turret) {
      const weapon = WEAPONS[id](this);
      if (weapon.projectiles) {
        this.combat.registerProjectiles(weapon.projectiles, this.spawner.group);
      }
      const icon = SKILL_ICONS[id];
      const body = this.add.container(0, 0, [
        this.add.image(0, 0, TEXTURES.turret).setDisplaySize(TURRET.size, TURRET.size),
        ...(icon && this.textures.exists(icon.key) ? [this.add.image(0, -4, icon.key).setDisplaySize(TURRET.size * 0.55, TURRET.size * 0.55)] : []),
      ]).setDepth(DEPTH.pickups + 1);
      turret = { skill: id, weapon, body, leftMs: 0 };
      this.turrets.push(turret);
    }
    turret.leftMs = TURRET.lifeMs;
    turret.body.setPosition(this.player.x, this.player.y).setVisible(true).setAlpha(1);
  }

  private retireTurret(turret: Turret): void {
    turret.leftMs = 0;
    turret.body.setVisible(false);
    turret.weapon.rest?.();
  }

  /** Turrets whose skill no longer carries 포격의 룬 go at once. */
  private retireStrayTurrets(): void {
    for (const turret of this.turrets) {
      if (turret.leftMs > 0 && !byTurretFor(turret.skill, this.mods)) {
        this.retireTurret(turret);
      }
    }
  }

  /** The turrets standing now, for tests. */
  public get liveTurrets(): readonly Turret[] {
    return this.turrets.filter((turret) => turret.leftMs > 0);
  }

  /** Each skill's 룬, as the one sheet the folds read (Modifiers.ts). */
  private runeSheets(): RunModifiers['runes'] {
    const out: RunModifiers['runes'] = {};
    for (const skill of Object.keys(SKILLS) as SkillId[]) {
      const runes = this.kit.runesIn(skill);
      if (runes.length > 0) {
        out[skill] = new StatSheet(runes.flatMap((rune) => RUNES[rune].mods));
      }
    }
    return out;
  }

  /** Enemies an arc jumps on to, and bodies a shot passes through: the run's picks and the tree's. */
  private chainsOf(skill: SkillId): number {
    return this.progression.statsFor(skill).chainCount + extraChainsFor(skill, this.mods);
  }

  private piercesOf(skill: SkillId): number {
    return this.progression.statsFor(skill).pierceCount + extraPierceFor(skill, this.mods);
  }

  /** One hit function per skill, so every hit and kill knows which skill made it. */
  private hitterFor(skill: SkillId): (enemy: Enemy, amount: number) => void {
    let hitter = this.hitters.get(skill);
    if (!hitter) {
      hitter = (enemy, amount) => this.combat.hit(enemy, amount, skill);
      this.hitters.set(skill, hitter);
    }
    return hitter;
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
      // Read off the same folds the run fights with, so the number on the
      // HUD is the number the enemies are getting.
      const perSecond = 1000 / this.cooldownOf(id);
      const { shots, orbs } = this.projectilesOf(id);
      const targets = (1 + this.chainsOf(id) + this.piercesOf(id) + Math.max(0, orbs - 1)) * shots;
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
    const extra = extraProjectilesFor(skill, this.mods);
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
    const damageLine =
      fill(copy.formulaDamage, {
        damage,
        base: num(base.damage),
        passive: num(runesOf(skill, this.mods).scale('damage')),
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
        passive: num(runeAttackSpeedFor(skill, this.mods)),
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
    this.announce(t().game.bossArrived, 'warning');
  }

  /**
   * 키메라 러시 begins: the field is already empty of enemies (the spawner
   * cleared it); their shots in the air go too, the screen shakes, the horn
   * goes, and the run says what is coming.
   */
  private startChimeraRush(): void {
    for (const child of this.combat.enemyShots.getChildren()) {
      const shot = child as EnemyShot;
      if (shot.active) {
        shot.despawn();
      }
    }
    this.cameras.main.shake(CHIMERA_RUSH.shakeMs, CHIMERA_RUSH.shakeIntensity);
    sfx.playBossAlert(this);
    this.announce(t().game.chimeraRush, 'warning');
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
        drops: this.combat.runeDrops.countActive(true),
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
        // A 룬 now, in turn, and a 룬 끌 beside it: there are no skill drops any more.
        const rune = ALL_RUNES[this.nextDebugDrop % ALL_RUNES.length];
        this.nextDebugDrop += 1;
        if (rune) {
          this.combat.dropRuneAt(this.player.x + 60, this.player.y, rune.id);
        }
        this.combat.dropChiselAt(this.player.x + 60, this.player.y + 40);
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
   * A level-up (0.76): the skill first — the main skill or a 보조 스킬, any
   * that can still take an upgrade — then 피해 or 공격속도 for it
   * (LEVEL_UP.upgrades). With one skill to choose from, straight to its
   * upgrade; with none, the level is a 체력 포션 instead (drinkForMaxedSkill).
   */
  private onLevelUp(level: number): void {
    this.player.setLevel(level);
    const main = this.mainSkill;
    if (!main) {
      return;
    }
    const open = this.skillsHeld.filter((skill) => this.levelOptions(skill).length > 0);
    if (open.length === 0) {
      this.drinkForMaxedSkill(main);
      return;
    }
    if (open.length > 1) {
      this.queueChoice({ kind: 'levelPick', level });
      return;
    }
    this.queueLevelUpgrade(open[0]!, level);
  }

  /** The upgrades a level-up can give a skill: LEVEL_UP.upgrades, while under their ceilings. */
  private levelOptions(skill: SkillId): UpgradeOption[] {
    // Every skill is offered these, whether or not its own list names them:
    // 공허구체 has an 공격속도 (how often an orb hits again) but never had the card.
    const upgrades = LEVEL_UP.upgrades as readonly UpgradeId[];
    return [...upgradeOptionsFor({ ...SKILLS[skill], upgrades }, this.progression.statsFor(skill))];
  }

  private queueLevelUpgrade(skill: SkillId, level: number, first = false): void {
    const role = skill === this.mainSkill ? t().upgrade.main : t().upgrade.sub;
    const request: ChoiceRequest = {
      kind: 'upgrade',
      title: t().upgrade.levelUp,
      subtitle: `${fill(t().upgrade.level, { level })} · ${skillName(skill)} (${role})`,
      skill,
    };
    if (first) {
      this.pendingChoices.unshift(request);
      return;
    }
    this.queueChoice(request);
  }

  /** Which skill a level-up goes to: the cards of every skill that can take one. */
  private openLevelPick(level: number): void {
    const options = this.skillsHeld.filter((skill) => this.levelOptions(skill).length > 0);
    const data: SkillPickData = {
      title: t().upgrade.levelUp,
      subtitle: `${fill(t().upgrade.level, { level })} · ${t().upgrade.pickSkill}`,
      options,
      owned: options,
      levels: Object.fromEntries(options.map((id) => [id, this.progression.levelFor(id)])),
      onPick: (skill) => {
        this.queueLevelUpgrade(skill, level, true);
        this.afterChoice();
      },
    };
    this.scene.bringToTop(SkillPickScene.KEY);
    this.scene.launch(SkillPickScene.KEY, data);
  }

  /** The skills a 무작위 스킬 can give: not held, while there is room for a 보조 스킬. */
  private slotSkills(): SkillId[] {
    if (this.skillsHeld.length - 1 >= SUB_SKILLS.max) {
      return [];
    }
    return DROPPABLE_SKILLS.map((skill) => skill.id).filter((id) => !this.owned.has(id));
  }

  /**
   * A 무작위 스킬: the 슬롯머신 spins over the skills not held, with
   * SKILL_SLOT.rerolls more spins allowed; what it lands on is a 보조 스킬.
   */
  private openSkillSlot(): void {
    const skills = this.slotSkills();
    if (skills.length === 0) {
      this.afterChoice();
      return;
    }
    const copy = t().slot;
    const data: SlotData = {
      title: copy.dropTitle,
      subtitle: copy.dropSubtitle,
      items: skills.map((id) => ({ label: skillName(id), icon: SKILL_ICONS[id]?.key })),
      rerolls: SKILL_SLOT.rerolls,
      onResult: (index) => {
        const skill = skills[index];
        if (skill) {
          this.acquire(skill);
          this.announce(fill(copy.subGained, { skill: skillName(skill) }));
        }
        this.afterChoice();
      },
    };
    this.scene.bringToTop(SCENES.slot);
    this.scene.launch(SCENES.slot, data);
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

    if (request.kind === 'chisel') {
      this.openChiselPick();
      return;
    }
    if (request.kind === 'slot') {
      this.openSkillSlot();
      return;
    }
    if (request.kind === 'levelPick') {
      this.openLevelPick(request.level);
      return;
    }
    if (request.kind === 'gear') {
      this.openGearPick(request.item);
      return;
    }

    // Worked out here, where the live stats are, so an upgrade that has hit
    // its ceiling is simply not offered — and a skill with none left gets no
    // popup at all.
    const options = this.levelOptions(request.skill);
    if (options.length === 0) {
      // A skill with every upgrade taken: what would have been one is a potion.
      this.drinkForMaxedSkill(request.skill);
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

  private onUpgradePicked(skill: SkillId, upgrade: UpgradeId): void {
    this.progression.apply(skill, upgrade);
    this.afterChoice();
    if (!this.awakened.has(skill) && this.progression.levelFor(skill) >= SKILL_MASTERY.level) {
      this.awakened.add(skill);
      this.celebrateMastery(skill);
    }
  }

  /**
   * A skill with every upgrade taken: the level-up (or the repeat pickup)
   * that would have gone into it is a 체력 포션 instead. Said three ways, so
   * it is not mistaken for a level-up that went nowhere: 포션 효과! over the
   * survivor with the health it gave, a green burst round them, and a toast
   * naming the skill.
   */
  private drinkForMaxedSkill(skill: SkillId): void {
    const healed = this.player.heal(HealthPotion.healingFor(this.player.maxHp, this.player.potionHealScale));
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
    this.announce(fill(t().game.maxedHeal, { skill: skillName(skill), heal: Math.round(healed) }), 'heal');
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
      this.sound.play(AUDIO.drops.rare.key, { volume: effectVolume(AUDIO.drops.rare.volume) });
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

  private onPlayerDied(): void {
    this.over = true;
    this.physics.pause();
    // A save is somewhere to come back from, not a way to undo a death.
    saveGame.clear();
    const damage = this.stats.damage;
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
      },
      level: this.progression.level,
      survivedMs: this.elapsedMs,
      devRun: this.devRun,
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
    const gear = this.kit.equipped.weapon;
    const lines = (list: readonly { id: string; tier: number }[]) => list.map(({ id, tier }) => ({ id, tier }));
    return {
      build: liveUpdate.current,
      version: PATCH_NOTES[0]?.version ?? '',
      kills: this.stats.killsByKind as Record<string, number>,
      bones: [...this.bones],
      gear: gear ? { id: gear.id, prefixes: lines(gear.prefixes), suffixes: lines(gear.suffixes) } : null,
      skills: this.loadout().map((line) => ({ id: line.id, level: line.level })),
      runes: this.runeCounts(),
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
