import Phaser from 'phaser';

import {
  AUDIO,
  COLORS,
  ORBS,
  POTION,
  WEAPON,
  type DropTier,
  type EnemyShotSpec,
  type OrbId,
} from '@/config';
import { Enemy } from '@/entities/Enemy';
import { EnemyShot } from '@/entities/EnemyShot';
import { GearDrop } from '@/entities/GearDrop';
import { OrbDrop } from '@/entities/OrbDrop';
import { ShardDrop } from '@/entities/ShardDrop';
import { dropTierFor, rollOrbDrop, type GearItem } from '@/systems/Gear';
import type { RunStats } from '@/systems/RunStats';
import { HealthPotion } from '@/entities/HealthPotion';
import { Player } from '@/entities/Player';
import { Projectile } from '@/entities/Projectile';
import { SkillDrop } from '@/entities/SkillDrop';
import { XpGem } from '@/entities/XpGem';
import type { DamageNumbers } from '@/systems/DamageNumbers';
import type { Progression } from '@/systems/Progression';
import type { SkillDefinition, SkillId } from '@/weapons/skills';

export interface CombatHooks {
  /**
   * Picks a skill to drop on a kill, or null to drop nothing. `bonus`
   * multiplies the chance — a rare's affixes make it likelier — and
   * `guaranteed` skips the roll, which is what a 우두머리 is worth.
   */
  readonly rollSkillDrop: (bonus: number, guaranteed: boolean) => SkillDefinition | null;
  /** A weapon to leave behind, or null when nothing is owed. */
  readonly rollGearDrop: (fromBoss: boolean) => GearItem | null;
  readonly onGearCollected: (item: GearItem) => void;
  /** True when this kill also owes a 신성한 조각. */
  readonly rollShardDrop: (fromBoss: boolean) => boolean;
  readonly onShardCollected: () => void;
  /** Called when the player walks over a 구슬. */
  readonly onOrbCollected: (id: OrbId) => void;
  /** What one of the survivor's critical hits is worth. */
  readonly critMultiplier: () => number;
  /** Called when the player walks over a dropped skill. */
  readonly onSkillCollected: (skill: SkillId) => void;
}

/**
 * Resolves everything that touches: melee and projectile damage, enemy
 * contact, and pickups. Weapons call `hit` so kills follow one path.
 */
export class CombatSystem {
  public readonly gems: Phaser.Physics.Arcade.Group;
  public readonly skillDrops: Phaser.Physics.Arcade.Group;
  /** Everything the shooting kinds have thrown at the player. */
  public readonly enemyShots: Phaser.Physics.Arcade.Group;
  public readonly potions: Phaser.Physics.Arcade.Group;
  public readonly gearDrops: Phaser.Physics.Arcade.Group;
  public readonly shardDrops: Phaser.Physics.Arcade.Group;
  public readonly orbDrops: Phaser.Physics.Arcade.Group;

  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly progression: Progression;
  private readonly damageNumbers: DamageNumbers;
  private readonly hooks: CombatHooks;
  private readonly stats: RunStats;

  public constructor(
    scene: Phaser.Scene,
    player: Player,
    enemies: Phaser.Physics.Arcade.Group,
    progression: Progression,
    damageNumbers: DamageNumbers,
    stats: RunStats,
    hooks: CombatHooks,
  ) {
    this.scene = scene;
    this.player = player;
    this.progression = progression;
    this.damageNumbers = damageNumbers;
    this.stats = stats;
    this.hooks = hooks;

    this.gems = scene.physics.add.group({
      classType: XpGem,
      maxSize: WEAPON.maxProjectiles,
      runChildUpdate: true,
    });

    // No cap: drops expire on their own timer instead of being refused.
    this.skillDrops = scene.physics.add.group({
      classType: SkillDrop,
      runChildUpdate: true,
    });

    this.enemyShots = scene.physics.add.group({
      classType: EnemyShot,
      maxSize: WEAPON.maxProjectiles,
      runChildUpdate: true,
    });

    this.potions = scene.physics.add.group({ classType: HealthPotion, runChildUpdate: true });
    this.gearDrops = scene.physics.add.group({ classType: GearDrop, runChildUpdate: true });
    this.shardDrops = scene.physics.add.group({ classType: ShardDrop, runChildUpdate: true });
    this.orbDrops = scene.physics.add.group({ classType: OrbDrop, runChildUpdate: true });

    scene.physics.add.overlap(player, enemies, this.onEnemyTouch, undefined, this);
    scene.physics.add.overlap(player, this.enemyShots, this.onEnemyShotHit, undefined, this);
    scene.physics.add.overlap(player, this.potions, this.onPotionTouch, undefined, this);
    scene.physics.add.overlap(player, this.gems, this.onGemTouch, undefined, this);
    scene.physics.add.overlap(player, this.skillDrops, this.onSkillTouch, undefined, this);
    scene.physics.add.overlap(player, this.gearDrops, this.onGearTouch, undefined, this);
    scene.physics.add.overlap(player, this.shardDrops, this.onShardTouch, undefined, this);
    scene.physics.add.overlap(player, this.orbDrops, this.onOrbTouch, undefined, this);
  }

  /** Wires a newly acquired projectile weapon into enemy collisions. */
  public registerProjectiles(projectiles: Phaser.Physics.Arcade.Group, enemies: Phaser.Physics.Arcade.Group): void {
    this.scene.physics.add.overlap(projectiles, enemies, this.onProjectileHit, undefined, this);
  }

  /** Fires one enemy bolt. Handed to every enemy that can shoot. */
  public fireEnemyShot = (x: number, y: number, angle: number, spec: EnemyShotSpec): void => {
    const shot = this.enemyShots.get() as EnemyShot | null;
    shot?.fire(x, y, angle, spec);
  };

  /** Places a potion directly — used by the kill roll and by debug keys. */
  public dropPotionAt(x: number, y: number): void {
    const potion = this.potions.get() as HealthPotion | null;
    potion?.drop(x, y);
  }

  /** Places a 신성한 조각 directly — used by the kill and by debug keys. */
  public dropShardAt(x: number, y: number): void {
    const shard = this.shardDrops.get() as ShardDrop | null;
    if (!shard) {
      return;
    }

    shard.drop(x, y);
    // Its nameplate is the 희귀 one, so its sound is too: one ladder, or the
    // ear and the eye disagree about the same object on the floor.
    this.playDropSound('rare');
  }

  /** Places a 구슬 directly — used by the kill roll and by debug keys. */
  public dropOrbAt(x: number, y: number, id: OrbId): void {
    const drop = this.orbDrops.get() as OrbDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, id);
    this.playDropSound(ORBS[id]?.tier ?? 'normal');
  }

  /** Places a weapon directly — used by the 우두머리 kill and debug keys. */
  public dropGearAt(x: number, y: number, item: GearItem): void {
    const drop = this.gearDrops.get() as GearDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, item);
    this.playDropSound(dropTierFor(item));
  }

  /** Places a drop directly — used by the spawner's roll and by debug keys. */
  public dropSkillAt(x: number, y: number, skill: SkillDefinition): void {
    const drop = this.skillDrops.get() as SkillDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, skill);
    this.playDropSound();
  }

  /**
   * The drop's own sound, by how rare what landed is. A rare weapon's clip
   * carries its own swell behind the hit — one mixed file rather than two
   * played together, so there is nothing to keep in step.
   */
  private playDropSound(tier: DropTier = 'normal'): void {
    const clip = AUDIO.drops[tier];
    // Stay quiet rather than warn if the clip failed to load.
    if (this.scene.cache.audio.exists(clip.key)) {
      this.scene.sound.play(clip.key, { volume: clip.volume });
    }
  }

  /**
   * Single entry point for damage, so every kill drops the same things —
   * and so 치명 on the carried weapon lands on everything the survivor
   * throws, the same way a rare's 치명 lands on everything it throws.
   */
  public hit = (enemy: Enemy, amount: number): void => {
    if (!enemy.active) {
      return;
    }

    const crit = this.player.critChance > 0 && Math.random() < this.player.critChance;
    const dealt = crit ? Math.round(amount * this.hooks.critMultiplier()) : amount;

    this.damageNumbers.spawn(
      enemy.x,
      enemy.y - 10,
      dealt,
      crit ? { color: COLORS.critText, crit: true } : undefined,
    );
    // What the enemy actually absorbed: a hit that kills something with two
    // health left is worth two, not whatever the number on the card said.
    this.stats.recordDamage(Math.min(dealt, enemy.hp));

    if (enemy.takeDamage(dealt)) {
      this.killEnemy(enemy);
    }
  };

  private onProjectileHit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (a, b) => {
    const shot = a as unknown as Projectile;
    const enemy = b as unknown as Enemy;
    if (!shot.active || !enemy.active) {
      return;
    }

    // A piercing shot overlaps the same body for several frames on its way
    // through; only the frame that books the hit does anything.
    if (!shot.registerHit(enemy)) {
      return;
    }

    if (shot.chillMs > 0) {
      enemy.chill(shot.chillMs);
    }

    // Spend the pierce before the hit: a kill recycles the enemy, and the
    // shot has to know whether it is done either way.
    const carriesOn = shot.consumePierce();
    this.hit(enemy, shot.damage);

    if (!carriesOn) {
      shot.despawn();
    }
  };

  private onEnemyTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const enemy = b as unknown as Enemy;
    if (!enemy.active) {
      return;
    }

    // Each kind hits for its own weight: a 거구 costs far more to stand in,
    // and a rare adds whatever its affixes are worth.
    this.player.takeDamage(enemy.rollDamage(enemy.contactDamage));
  };

  private onEnemyShotHit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const shot = b as unknown as EnemyShot;
    if (!shot.active) {
      return;
    }

    shot.despawn();
    this.player.takeDamage(shot.damage);
  };

  private onGemTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const gem = b as unknown as XpGem;
    if (!gem.active) {
      return;
    }

    gem.collect();
    this.progression.addXp(gem.value);
  };

  private onPotionTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const potion = b as unknown as HealthPotion;
    if (!potion.active) {
      return;
    }

    // Walking over a full health bar would waste it, so leave it lying there.
    if (this.player.hp >= this.player.maxHp) {
      return;
    }

    potion.collect();
    const healed = this.player.heal(HealthPotion.healing);
    this.damageNumbers.spawn(this.player.x, this.player.y - 18, healed, {
      prefix: '+',
      color: COLORS.healText,
    });
  };

  private onSkillTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const drop = b as unknown as SkillDrop;
    if (!drop.active) {
      return;
    }

    const { skillId } = drop;
    drop.collect();
    this.hooks.onSkillCollected(skillId);
  };

  private onGearTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const drop = b as unknown as GearDrop;
    if (!drop.active) {
      return;
    }

    const { item } = drop;
    drop.collect();
    if (item) {
      this.hooks.onGearCollected(item);
    }
  };

  private onShardTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const shard = b as unknown as ShardDrop;
    if (!shard.active) {
      return;
    }

    shard.collect();
    this.hooks.onShardCollected();
  };

  private onOrbTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, object) => {
    const drop = object as OrbDrop;
    if (!drop.active) {
      return;
    }

    drop.collect();
    this.hooks.onOrbCollected(drop.orb);
  };

  private killEnemy(enemy: Enemy): void {
    const { x, y } = enemy;
    // Read the rewards before recycling, which resets the kind and affixes.
    this.stats.recordKill(enemy.kind);
    const worth = enemy.xpValue;
    const dropBonus = enemy.dropBonus;
    const wasBoss = enemy.isBoss;
    // Pooled: back to the spawner's pool rather than destroyed.
    enemy.recycle();

    const gem = this.gems.get() as XpGem | null;
    gem?.drop(x, y, worth, this.player);

    const skill = this.hooks.rollSkillDrop(dropBonus, wasBoss);
    if (skill) {
      this.dropSkillAt(x, y, skill);
    }

    // Rolled on its own, so a kill can leave both a skill and a potion.
    if (Math.random() < POTION.chance) {
      this.dropPotionAt(x, y);
    }

    // Only a 우두머리 leaves a weapon, and it always does.
    const found = this.hooks.rollGearDrop(wasBoss);
    if (found) {
      this.dropGearAt(x, y, found);
    }

    // And half of them leave a 신성한 조각 beside it.
    if (this.hooks.rollShardDrop(wasBoss)) {
      this.dropShardAt(x + 18, y);
    }

    // A 구슬 rolls off any kill at all, which is what gives the hundredth
    // 일반 of a run something to be.
    const orb = rollOrbDrop();
    if (orb) {
      this.dropOrbAt(x - 18, y, orb.id);
    }
  }
}
