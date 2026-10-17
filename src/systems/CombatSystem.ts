import Phaser from 'phaser';

import {
  ALTAR,
  AUDIO,
  BONES,
  boneChanceFor,
  COLORS,
  DEPTH,
  FIREBALL,
  ORBS,
  MANGO,
  POTION,
  SKILL_PICK,
  WEAPON,
  WORLD,
  rollAltarOffer,
  type AltarOfferId,
  type BoneId,
  type DropTier,
  type EnemyShotSpec,
  type OrbId,
  SKILL_MASTERY,
  MAGNET,
} from '@/config';
import { t } from '@/i18n';
import { itemFilter } from '@/systems/ItemFilter';
import { Altar } from '@/entities/Altar';
import { Enemy } from '@/entities/Enemy';
import { EnemyShot } from '@/entities/EnemyShot';
import { GearDrop } from '@/entities/GearDrop';
import { BoneDrop } from '@/entities/BoneDrop';
import { OrbDrop } from '@/entities/OrbDrop';
import { RandomSkillDrop } from '@/entities/RandomSkillDrop';
import { MangoDrop } from '@/entities/MangoDrop';
import { MagnetDrop } from '@/entities/MagnetDrop';
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
import { effectVolume } from '@/systems/Sfx';

export interface CombatHooks {
  /**
   * Picks a skill to drop on a kill, or null to drop nothing. `bonus`
   * multiplies the chance — a rare's affixes make it likelier — and
   * `guaranteed` skips the roll, which is what a 우두머리 is worth.
   */
  readonly rollSkillDrop: (bonus: number, guaranteed: boolean) => SkillDefinition | null;
  /** A weapon to leave behind, or null when nothing is owed. */
  readonly rollGearDrop: (fromBoss: boolean, bonus: number) => GearItem | null;
  readonly onGearCollected: (item: GearItem) => void;
  /** True when this kill also owes a 신성한 조각. */
  readonly rollShardDrop: (fromBoss: boolean) => boolean;
  readonly onShardCollected: () => void;
  /** Called when the player walks over a 구슬. */
  readonly onOrbCollected: (id: OrbId) => void;
  /** Called when the player walks over a 뼈다귀. */
  readonly onBoneCollected: (id: BoneId) => void;
  /**
   * What this run's 뼈다귀 do to a rolled chance. A 갈비뼈 pays for the
   * health it gives every enemy by making everything likelier to drop.
   */
  readonly dropScale: () => number;
  /** What one of the survivor's critical hits is worth. */
  readonly critMultiplier: () => number;
  /** Called when the player walks over a dropped skill. */
  readonly onSkillCollected: (skill: SkillId) => void;
  /** A rare with the 거미 속성 died here: lay its web. */
  readonly onWeb: (x: number, y: number, stacks: number) => void;
  /** Called when the player walks over a 하얀 망고. */
  readonly onMangoCollected: () => void;
  /** A 자석 was picked up, and everything on the map is on its way. */
  readonly onMagnetCollected: () => void;
  /** Called when the player walks over a 무작위 스킬: offer the cards. */
  readonly onRandomSkillCollected: () => void;
  /** Called when the survivor walks up to a 제단: call up what it offered. */
  readonly onAltarWoke: (offer: AltarOfferId, x: number, y: number) => void;
}

/** How far inside the edge of the world anything is let fall. */
const DROP_MARGIN = 24;

/**
 * A spot on the ground, pulled back inside the world. Drops are placed a
 * little way off the kill — a 제단 a long way — and a kill near the edge
 * would otherwise leave them where nobody can walk.
 */
function inWorld(x: number, y: number): [number, number] {
  return [
    Phaser.Math.Clamp(x, DROP_MARGIN, WORLD.width - DROP_MARGIN),
    Phaser.Math.Clamp(y, DROP_MARGIN, WORLD.height - DROP_MARGIN),
  ];
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
  public readonly boneDrops: Phaser.Physics.Arcade.Group;
  /** 무작위 스킬 lying on the ground. */
  public readonly randomSkillDrops: Phaser.Physics.Arcade.Group;
  /** 하얀 망고 lying on the ground. */
  public readonly mangoDrops: Phaser.Physics.Arcade.Group;
  /** 자석 lying on the ground. */
  public readonly magnetDrops: Phaser.Physics.Arcade.Group;
  /** The 제단 a 우두머리 left. Never picked up; they wake instead. */
  public readonly altars: Phaser.Physics.Arcade.Group;

  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly progression: Progression;
  private readonly damageNumbers: DamageNumbers;
  private readonly hooks: CombatHooks;
  private readonly stats: RunStats;
  private readonly enemies: Phaser.Physics.Arcade.Group;

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
    this.enemies = enemies;

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
    this.boneDrops = scene.physics.add.group({ classType: BoneDrop, runChildUpdate: true });
    this.randomSkillDrops = scene.physics.add.group({ classType: RandomSkillDrop, runChildUpdate: true });
    this.mangoDrops = scene.physics.add.group({ classType: MangoDrop, runChildUpdate: true });
    this.magnetDrops = scene.physics.add.group({ classType: MagnetDrop, runChildUpdate: true });
    // No overlap: an altar is woken by distance, in its own update.
    this.altars = scene.physics.add.group({ classType: Altar, runChildUpdate: true });

    scene.physics.add.overlap(player, enemies, this.onEnemyTouch, undefined, this);
    scene.physics.add.overlap(player, this.enemyShots, this.onEnemyShotHit, undefined, this);
    scene.physics.add.overlap(player, this.potions, this.onPotionTouch, undefined, this);
    scene.physics.add.overlap(player, this.gems, this.onGemTouch, undefined, this);
    scene.physics.add.overlap(player, this.skillDrops, this.onSkillTouch, undefined, this);
    scene.physics.add.overlap(player, this.gearDrops, this.onGearTouch, undefined, this);
    scene.physics.add.overlap(player, this.shardDrops, this.onShardTouch, undefined, this);
    scene.physics.add.overlap(player, this.orbDrops, this.onOrbTouch, undefined, this);
    scene.physics.add.overlap(player, this.boneDrops, this.onBoneTouch, undefined, this);
    scene.physics.add.overlap(player, this.randomSkillDrops, this.onRandomSkillTouch, undefined, this);
    scene.physics.add.overlap(player, this.mangoDrops, this.onMangoTouch, undefined, this);
    scene.physics.add.overlap(player, this.magnetDrops, this.onMagnetTouch, undefined, this);
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
    if (!itemFilter.shows('potion')) {
      return;
    }
    [x, y] = inWorld(x, y);
    const potion = this.potions.get() as HealthPotion | null;
    potion?.drop(x, y);
  }

  /** Places a 신성한 조각 directly — used by the kill and by debug keys. */
  public dropShardAt(x: number, y: number): void {
    if (!itemFilter.shows('shard')) {
      return;
    }
    [x, y] = inWorld(x, y);
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
    if (!itemFilter.shows(`orb:${id}`)) {
      return;
    }
    [x, y] = inWorld(x, y);
    const drop = this.orbDrops.get() as OrbDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, id);
    this.playDropSound(ORBS[id]?.tier ?? 'normal');
  }

  /** Places a 뼈다귀 directly — used by the kill roll and by debug keys. */
  public dropBoneAt(x: number, y: number, id: BoneId): void {
    if (!itemFilter.shows(`bone:${id}`)) {
      return;
    }
    [x, y] = inWorld(x, y);
    const drop = this.boneDrops.get() as BoneDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, id);
    this.playDropSound(BONES[id]?.tier ?? 'normal');
  }

  /** Places a 하얀 망고 directly — used by the kill roll and by tests. */
  public dropMangoAt(x: number, y: number): void {
    if (!itemFilter.shows('mango')) {
      return;
    }
    [x, y] = inWorld(x, y);
    const drop = this.mangoDrops.get() as MangoDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y);
    this.playDropSound('rare');
  }

  /** Places a 자석 directly — used by the kill roll and by tests. */
  public dropMagnetAt(x: number, y: number): void {
    if (!itemFilter.shows('magnet')) {
      return;
    }
    [x, y] = inWorld(x, y);
    const drop = this.magnetDrops.get() as MagnetDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y);
    this.playDropSound('rare');
  }

  /**
   * A 자석: every XP gem and every item on the map is picked up at once, the
   * way walking over it would — so nothing can hold it up halfway, a
   * level-up included. What a survivor might be keeping for later is left
   * where it lies: the 하얀 망고, another 자석, a 포션 and the 제단. What it
   * took is then seen flying in, which is only a picture. Public so a test can.
   */
  public collectEverything(): void {
    const player = this.player;
    let ghosts = 0;
    const take = (
      group: Phaser.Physics.Arcade.Group,
      touch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
    ): void => {
      for (const child of [...group.getChildren()]) {
        const item = child as Phaser.Physics.Arcade.Image;
        if (!item.active) {
          continue;
        }
        if (ghosts < MAGNET.ghosts) {
          ghosts += 1;
          this.flyIn(item);
        }
        touch.call(this, player as never, item as never);
      }
    };
    take(this.gems, this.onGemTouch);
    take(this.skillDrops, this.onSkillTouch);
    take(this.gearDrops, this.onGearTouch);
    take(this.shardDrops, this.onShardTouch);
    take(this.orbDrops, this.onOrbTouch);
    take(this.boneDrops, this.onBoneTouch);
    take(this.randomSkillDrops, this.onRandomSkillTouch);
  }

  /** A copy of something just taken, flying from where it lay into the survivor. */
  private flyIn(item: Phaser.Physics.Arcade.Image): void {
    const ghost = this.scene.add
      .image(item.x, item.y, item.texture.key)
      .setDisplaySize(item.displayWidth, item.displayHeight)
      .setDepth(DEPTH.pickups + 1);
    this.scene.tweens.add({
      targets: ghost,
      x: this.player.x,
      y: this.player.y,
      scale: ghost.scale * 0.5,
      alpha: 0.4,
      duration: MAGNET.flyMs,
      ease: 'Quad.easeIn',
      onComplete: () => ghost.destroy(),
    });
  }

  /** Places a 무작위 스킬 directly — used by the kill roll and by tests. */
  public dropRandomSkillAt(x: number, y: number): void {
    if (!itemFilter.shows('randomSkill')) {
      return;
    }
    [x, y] = inWorld(x, y);
    const drop = this.randomSkillDrops.get() as RandomSkillDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y);
    this.playDropSound('magic');
  }

  /** Places a 제단 directly — used by the 우두머리 kill and by tests. */
  public dropAltarAt(x: number, y: number, offer: AltarOfferId): Altar | null {
    [x, y] = inWorld(x, y);
    const altar = this.altars.get() as Altar | null;
    if (!altar) {
      return null;
    }

    altar.drop(x, y, offer, this.player, (woke) =>
      this.hooks.onAltarWoke(woke.offer, woke.x, woke.y),
    );
    this.playDropSound(Altar.tierFor(offer));
    return altar;
  }

  /** Places a weapon directly — used by the 우두머리 kill and debug keys. */
  public dropGearAt(x: number, y: number, item: GearItem): void {
    // 아이템 필터: a switched-off drop never lands.
    if (!itemFilter.showsGear(item)) {
      return;
    }
    [x, y] = inWorld(x, y);
    const drop = this.gearDrops.get() as GearDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, item);
    this.playDropSound(dropTierFor(item));
  }

  /** Places a drop directly — used by the spawner's roll and by debug keys. */
  public dropSkillAt(x: number, y: number, skill: SkillDefinition): void {
    if (!itemFilter.shows('skill')) {
      return;
    }
    [x, y] = inWorld(x, y);
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
      this.scene.sound.play(clip.key, { volume: effectVolume(clip.volume) });
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
    const absorbed = Math.min(dealt, enemy.hp);
    this.stats.recordDamage(absorbed);

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

    // 얼음창 각성: one already under 냉각 is frozen solid by the next spear.
    if (shot.freezeMs > 0 && enemy.isChilled) {
      enemy.freeze(shot.freezeMs);
    }
    if (shot.chillMs > 0) {
      enemy.chill(shot.chillMs);
    }

    // Spend the pierce before the hit: a kill recycles the enemy, and the
    // shot has to know whether it is done either way.
    const carriesOn = shot.consumePierce();
    const { x, y } = enemy;
    this.hit(enemy, shot.damage);

    if (shot.blastRadius > 0) {
      this.blast(x, y, shot.blastRadius, shot.damage, enemy);
      if (shot.fireZoneDps > 0) {
        this.burnGround(x, y, shot.blastRadius, shot.fireZoneDps);
      }
    }

    if (!carriesOn) {
      shot.despawn();
    }
  };

  /**
   * A burst where a shot landed: everything within `radius` takes the same
   * damage, except the body it landed on, which has already had it. The
   * victims are gathered before any of them is hit, because a kill recycles
   * a sprite and the pool could hand it straight back.
   */
  public blast(x: number, y: number, radius: number, damage: number, spared?: Enemy): number {
    const caught: Enemy[] = [];
    for (const child of this.enemies.getChildren()) {
      const other = child as Enemy;
      if (other.active && other !== spared &&
          Phaser.Math.Distance.Between(x, y, other.x, other.y) <= radius) {
        caught.push(other);
      }
    }

    caught.forEach((other) => this.hit(other, damage));

    const flash = this.scene.add
      .circle(x, y, radius, COLORS.fireBlast, 0.35)
      .setStrokeStyle(2, COLORS.fireBlast, 0.9)
      .setDepth(DEPTH.vfx)
      .setScale(0.4);
    this.scene.tweens.add({
      targets: flash,
      scale: 1,
      alpha: 0,
      duration: FIREBALL.flashMs,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });

    return caught.length;
  }

  /** 화염구 각성: the patches of ground still burning. Public for tests. */
  public readonly fireZones: { x: number; y: number; radius: number; dps: number; leftMs: number; sinceTickMs: number; view: Phaser.GameObjects.Arc }[] = [];

  /** Leaves the ground at (x, y) burning for SKILL_MASTERY.fireZone.durationMs. */
  public burnGround(x: number, y: number, radius: number, dps: number): void {
    const view = this.scene.add
      .circle(x, y, radius, COLORS.fireBlast, 0.18)
      .setStrokeStyle(2, COLORS.fireBlast, 0.5)
      .setDepth(DEPTH.pickups - 1);
    this.scene.tweens.add({ targets: view, alpha: 0.7, duration: 260, yoyo: true, repeat: -1 });
    this.fireZones.push({ x, y, radius, dps, leftMs: SKILL_MASTERY.fireZone.durationMs, sinceTickMs: 0, view });
  }

  /** Burns whatever stands in a fire, once every SKILL_MASTERY.fireZone.tickMs. */
  public tickFireZones(delta: number): void {
    const { tickMs } = SKILL_MASTERY.fireZone;
    for (let i = this.fireZones.length - 1; i >= 0; i--) {
      const zone = this.fireZones[i]!;
      zone.leftMs -= delta;
      zone.sinceTickMs += delta;
      if (zone.sinceTickMs >= tickMs) {
        zone.sinceTickMs -= tickMs;
        const amount = Math.max(1, Math.round((zone.dps * tickMs) / 1000));
        const caught: Enemy[] = [];
        for (const child of this.enemies.getChildren()) {
          const enemy = child as Enemy;
          if (enemy.active && Phaser.Math.Distance.Between(zone.x, zone.y, enemy.x, enemy.y) <= zone.radius) {
            caught.push(enemy);
          }
        }
        caught.forEach((enemy) => this.hit(enemy, amount));
      }
      if (zone.leftMs <= 0) {
        this.scene.tweens.killTweensOf(zone.view);
        zone.view.destroy();
        this.fireZones.splice(i, 1);
      }
    }
  }

  private onEnemyTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const enemy = b as unknown as Enemy;
    if (!enemy.active) {
      return;
    }

    // Each body keeps its own cooldown, so every enemy pressed against the
    // survivor hurts — a crowd is not one hit. Something that does not fight
    // (a 도망자) never hurts at all.
    const now = this.scene.time.now;
    if (enemy.contactDamage <= 0 || now < enemy.contactReadyAt || this.player.shielded) {
      return;
    }
    enemy.contactReadyAt = now + this.player.contactCooldownMs;

    // Each kind hits for its own weight: a 거구 costs far more to stand in,
    // and a rare adds whatever its affixes are worth.
    this.player.takeContact(enemy.rollDamage(enemy.contactDamage));
  };

  private onEnemyShotHit: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const shot = b as unknown as EnemyShot;
    if (!shot.active) {
      return;
    }

    shot.despawn();
    // 오니고로시: a share of the shots that would land are turned aside.
    // Only one that would hurt is rolled — not one inside the window after a hit.
    if (this.player.wouldTakeShot && Math.random() < this.player.projectileBlock) {
      this.damageNumbers.spawn(this.player.x, this.player.y - 18, 0, {
        text: t().game.blocked,
        color: COLORS.blockText,
      });
      return;
    }
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

  private onMangoTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, object) => {
    const drop = object as MangoDrop;
    if (!drop.active) {
      return;
    }

    drop.collect();
    this.player.eatMango();
    this.hooks.onMangoCollected();
  };

  private onMagnetTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, object) => {
    const drop = object as MagnetDrop;
    if (!drop.active) {
      return;
    }

    drop.collect();
    this.collectEverything();
    this.hooks.onMagnetCollected();
  };

  private onRandomSkillTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, object) => {
    const drop = object as RandomSkillDrop;
    if (!drop.active) {
      return;
    }

    drop.collect();
    this.hooks.onRandomSkillCollected();
  };

  private onBoneTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, object) => {
    const drop = object as BoneDrop;
    if (!drop.active) {
      return;
    }

    drop.collect();
    this.hooks.onBoneCollected(drop.bone);
  };

  private killEnemy(enemy: Enemy): void {
    const { x, y } = enemy;
    // Read the rewards before recycling, which resets the kind and affixes.
    this.stats.recordKill(enemy.kind);
    const worth = enemy.xpValue;
    const dropBonus = enemy.dropBonus;
    const wasBoss = enemy.isBoss;
    const certainSkill = enemy.alwaysDropsSkill;
    const webStacks = enemy.webStacks;
    const scale = this.hooks.dropScale();
    // Every ordinary drop below is raised by what this kill was: a rare's
    // 속성, a 우두머리. What only a 우두머리 leaves, and what is certain, is not.
    const bonus = scale * dropBonus;
    // Pooled: back to the spawner's pool rather than destroyed.
    enemy.recycle();

    const gem = this.gems.get() as XpGem | null;
    gem?.drop(x, y, worth, this.player);

    // A 거미 leaves its web where it fell.
    if (webStacks > 0) {
      this.hooks.onWeb(x, y, webStacks);
    }

    // A 우두머리 and a 도망자 always leave one.
    const skill = this.hooks.rollSkillDrop(dropBonus, certainSkill);
    if (skill) {
      this.dropSkillAt(x, y, skill);
    }

    // A 무작위 스킬 on its own roll: three cards to choose from, not one.
    if (Math.random() < SKILL_PICK.dropChance * bonus) {
      this.dropRandomSkillAt(x + 18, y - 18);
    }

    // 하얀 망고: the same off every kill — nothing raises it.
    if (Math.random() < MANGO.chance) {
      this.dropMangoAt(x - 18, y - 18);
    }

    // 자석: as rare as the 망고, and as flat.
    if (Math.random() < MAGNET.chance) {
      this.dropMagnetAt(x + 18, y + 18);
    }

    // Rolled on its own, so a kill can leave both a skill and a potion.
    if (Math.random() < POTION.chance * bonus) {
      this.dropPotionAt(x, y);
    }

    // A 우두머리 always leaves a weapon; anything else, rarely, a good one.
    const found = this.hooks.rollGearDrop(wasBoss, bonus);
    if (found) {
      this.dropGearAt(x, y, found);
    }

    // And half of them leave a 신성한 조각 beside it.
    if (this.hooks.rollShardDrop(wasBoss)) {
      this.dropShardAt(x + 18, y);
    }

    // And a 제단 — always off a 우두머리, now and then off anything else —
    // set back from the rest so that picking those up does not wake it.
    const altarChance = wasBoss ? ALTAR.fromBoss : ALTAR.fromKill * bonus;
    if (Math.random() < altarChance) {
      // Above the kill, or below it when above would be off the map — set
      // back either way, so picking the loot up does not wake it.
      const above = y - ALTAR.dropOffset;
      const altarY = above >= DROP_MARGIN ? above : y + ALTAR.dropOffset;
      this.dropAltarAt(x, altarY, rollAltarOffer());
    }

    // A 구슬 rolls off any kill at all, which is what gives the hundredth
    // 일반 of a run something to be.
    const orb = rollOrbDrop(scale, wasBoss, dropBonus);
    if (orb) {
      this.dropOrbAt(x - 18, y, orb.id);
    }

    // And a 뼈다귀, worth more off something that was worth more.
    for (const bone of Object.values(BONES)) {
      if (Math.random() < boneChanceFor(bone, { isBoss: wasBoss, bonus: dropBonus }) * scale) {
        this.dropBoneAt(x, y + 18, bone.id);
        break;
      }
    }
  }
}
