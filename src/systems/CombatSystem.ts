import Phaser from 'phaser';

import {
  ALTAR,
  ALTAR_SUMMON_FX,
  TEXTURES,
  AUDIO,
  BONES,
  CHILL,
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
  UNKNOWN_RUNE,
  UNKNOWN_RUNE_LOOKS,
  TALENT_SHARD,
  ALTAR_OFFERS,
  GEAR,
  type ShardStat,
} from '@/config';
import { t } from '@/i18n';
import { itemFilter } from '@/systems/ItemFilter';
import { settings } from '@/systems/Settings';
import { Altar } from '@/entities/Altar';
import { Enemy } from '@/entities/Enemy';
import { EnemyShot } from '@/entities/EnemyShot';
import { GearDrop } from '@/entities/GearDrop';
import { BoneDrop } from '@/entities/BoneDrop';
import { OrbDrop } from '@/entities/OrbDrop';
import { RandomSkillDrop } from '@/entities/RandomSkillDrop';
import { MangoDrop } from '@/entities/MangoDrop';
import { MagnetDrop } from '@/entities/MagnetDrop';
import { UnknownRuneDrop } from '@/entities/UnknownRuneDrop';
import { TalentShardDrop } from '@/entities/TalentShardDrop';
import type { DropLabel } from '@/systems/DropLabel';
import { dropTierFor, rollOrbDrop, type GearItem } from '@/systems/Gear';
import type { RunStats } from '@/systems/RunStats';
import { HealthPotion } from '@/entities/HealthPotion';
import type { GroundItem } from '@/entities/GroundItem';
import { Player } from '@/entities/Player';
import { Projectile } from '@/entities/Projectile';
import { SkillDrop } from '@/entities/SkillDrop';
import { XpGem } from '@/entities/XpGem';
import type { DamageNumbers } from '@/systems/DamageNumbers';
import type { Progression } from '@/systems/Progression';
import type { SkillDefinition, SkillId } from '@/weapons/skills';
import { effectVolume, sfx } from '@/systems/Sfx';

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
  /** Called when the player walks over a 구슬. */
  readonly onOrbCollected: (id: OrbId) => void;
  /** Called when the player walks over a 뼈다귀. */
  readonly onBoneCollected: (id: BoneId) => void;
  /**
   * What this run's 뼈다귀 do to a rolled chance. A 갈비뼈 pays for the
   * health it gives every enemy by making everything likelier to drop.
   */
  readonly dropScale: () => number;
  /**
   * 행운 (0.83): what the passive tree multiplies every drop an enemy's
   * 속성 raise by — 1 + its share. What only a 우두머리 leaves, what is
   * certain, and the flat 망고 and 자석 it does not touch.
   */
  /**
   * 얼음창 2차 각성 (0.84): how far an enemy that dies frozen spreads the
   * freeze, and for how long — null while it is not the main skill's.
   */
  readonly shatter: () => { readonly radius: number } | null;
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
  /** An 알수없는 룬 was picked up. */
  readonly onUnknownRuneCollected: () => void;
  /** A 재능의 파편 taken (0.102): what it gives. */
  readonly onTalentShardCollected: (stat: ShardStat) => void;
  /** A stat's weight when a shard lands: the passive tree's line for it. */
  readonly shardWeight: (stat: ShardStat) => number;
  /** Called when the player walks over a 무작위 스킬: offer the cards. */
  readonly onRandomSkillCollected: () => void;
  /** Called when the survivor walks up to a 제단: call up what it offered. */
  readonly onAltarWoke: (offer: AltarOfferId, x: number, y: number) => void;
  /** The nearest spot to (x, y) not on a 지형지물: nothing is dropped on a rock. */
  readonly clearOfTerrain?: (x: number, y: number) => [number, number];
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
  public readonly orbDrops: Phaser.Physics.Arcade.Group;
  public readonly boneDrops: Phaser.Physics.Arcade.Group;
  /** 무작위 스킬 lying on the ground. */
  public readonly randomSkillDrops: Phaser.Physics.Arcade.Group;
  /** 하얀 망고 lying on the ground. */
  public readonly mangoDrops: Phaser.Physics.Arcade.Group;
  /** 자석 lying on the ground. */
  public readonly magnetDrops: Phaser.Physics.Arcade.Group;
  /** 알수없는 룬 lying on the ground. */
  public readonly unknownRuneDrops: Phaser.Physics.Arcade.Group;
  public readonly talentShardDrops: Phaser.Physics.Arcade.Group;
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
    this.orbDrops = scene.physics.add.group({ classType: OrbDrop, runChildUpdate: true });
    this.boneDrops = scene.physics.add.group({ classType: BoneDrop, runChildUpdate: true });
    this.randomSkillDrops = scene.physics.add.group({ classType: RandomSkillDrop, runChildUpdate: true });
    this.mangoDrops = scene.physics.add.group({ classType: MangoDrop, runChildUpdate: true });
    this.magnetDrops = scene.physics.add.group({ classType: MagnetDrop, runChildUpdate: true });
    this.unknownRuneDrops = scene.physics.add.group({ classType: UnknownRuneDrop, runChildUpdate: true });
    this.talentShardDrops = scene.physics.add.group({ classType: TalentShardDrop, runChildUpdate: true });
    // No overlap: an altar is woken by distance, in its own update.
    this.altars = scene.physics.add.group({ classType: Altar, runChildUpdate: true });

    scene.physics.add.overlap(player, enemies, this.onEnemyTouch, undefined, this);
    scene.physics.add.overlap(player, this.enemyShots, this.onEnemyShotHit, undefined, this);
    scene.physics.add.overlap(player, this.potions, this.onPotionTouch, undefined, this);
    scene.physics.add.overlap(player, this.gems, this.onGemTouch, undefined, this);
    scene.physics.add.overlap(player, this.skillDrops, this.onSkillTouch, undefined, this);
    scene.physics.add.overlap(player, this.gearDrops, this.onGearTouch, undefined, this);
    scene.physics.add.overlap(player, this.orbDrops, this.onOrbTouch, undefined, this);
    scene.physics.add.overlap(player, this.boneDrops, this.onBoneTouch, undefined, this);
    scene.physics.add.overlap(player, this.randomSkillDrops, this.onRandomSkillTouch, undefined, this);
    scene.physics.add.overlap(player, this.mangoDrops, this.onMangoTouch, undefined, this);
    scene.physics.add.overlap(player, this.magnetDrops, this.onMagnetTouch, undefined, this);
    scene.physics.add.overlap(player, this.unknownRuneDrops, this.onUnknownRuneTouch, undefined, this);
    scene.physics.add.overlap(player, this.talentShardDrops, this.onTalentShardTouch, undefined, this);
  }

  /** Where a drop meant for (x, y) lands: inside the world and off any rock. */
  private onGround(x: number, y: number): [number, number] {
    [x, y] = inWorld(x, y);
    if (this.hooks.clearOfTerrain) {
      [x, y] = inWorld(...this.hooks.clearOfTerrain(x, y));
    }
    return [x, y];
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
    [x, y] = this.onGround(x, y);
    const potion = this.potions.get() as HealthPotion | null;
    if (!potion) {
      return;
    }

    potion.drop(x, y);
    this.land(potion, itemFilter.shows('potion'), null);
  }

  /** Places a 구슬 directly — used by the kill roll and by debug keys. */
  public dropOrbAt(x: number, y: number, id: OrbId): void {
    [x, y] = this.onGround(x, y);
    const drop = this.orbDrops.get() as OrbDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, id);
    this.land(drop, itemFilter.shows(`orb:${id}`), ORBS[id]?.tier ?? 'normal', ORBS[id]?.extremeSound === true);
  }

  /** Places a 뼈다귀 directly — used by the kill roll and by debug keys. */
  public dropBoneAt(x: number, y: number, id: BoneId): void {
    [x, y] = this.onGround(x, y);
    const drop = this.boneDrops.get() as BoneDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, id);
    this.land(drop, itemFilter.shows(`bone:${id}`), BONES[id]?.tier ?? 'normal');
  }

  /** Places a 하얀 망고 directly — used by the kill roll and by tests. */
  public dropMangoAt(x: number, y: number): void {
    [x, y] = this.onGround(x, y);
    const drop = this.mangoDrops.get() as MangoDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y);
    this.land(drop, itemFilter.shows('mango'), 'mythic', true);
  }

  /** Which stat a 재능의 파편 that lands is: each weighed by the passive tree's line for it. Public for tests. */
  public rollShardStat(): ShardStat {
    const total = TALENT_SHARD.stats.reduce((sum, stat) => sum + this.hooks.shardWeight(stat), 0);
    let roll = Math.random() * total;
    return TALENT_SHARD.stats.find((stat) => (roll -= this.hooks.shardWeight(stat)) < 0) ?? TALENT_SHARD.stats[0]!;
  }

  /** Places a 재능의 파편 of a stat directly — used by the kill roll and by tests. */
  public dropTalentShardAt(x: number, y: number, stat: ShardStat): void {
    [x, y] = this.onGround(x, y);
    const drop = this.talentShardDrops.get() as TalentShardDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, stat);
    this.land(drop, itemFilter.shows('talentShard'), 'mythic', true);
  }

  /**
   * Places an 알수없는 룬 directly — used by the kill roll and by tests —
   * in one of its looks, at random unless one is named.
   */
  public dropUnknownRuneAt(x: number, y: number, look = Math.floor(Math.random() * UNKNOWN_RUNE_LOOKS.length)): void {
    [x, y] = this.onGround(x, y);
    const drop = this.unknownRuneDrops.get() as UnknownRuneDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, look);
    this.land(drop, itemFilter.shows('unknownRune'), 'mythic');
  }

  /** Places a 자석 directly — used by the kill roll and by tests. */
  public dropMagnetAt(x: number, y: number): void {
    [x, y] = this.onGround(x, y);
    const drop = this.magnetDrops.get() as MagnetDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y);
    this.land(drop, itemFilter.shows('magnet'), 'mythic');
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
        // One hidden by the 아이템 필터 is taken without being shown flying in.
        if (ghosts < MAGNET.ghosts && item.visible) {
          ghosts += 1;
          this.flyIn(item);
        }
        touch.call(this, player as never, item as never);
      }
    };
    take(this.gems, this.onGemTouch);
    take(this.skillDrops, this.onSkillTouch);
    take(this.gearDrops, this.onGearTouch);
    take(this.orbDrops, this.onOrbTouch);
    take(this.boneDrops, this.onBoneTouch);
    take(this.randomSkillDrops, this.onRandomSkillTouch);
    take(this.unknownRuneDrops, this.onUnknownRuneTouch);
    take(this.talentShardDrops, this.onTalentShardTouch);
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
    [x, y] = this.onGround(x, y);
    const drop = this.randomSkillDrops.get() as RandomSkillDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y);
    this.land(drop, itemFilter.shows('randomSkill'), 'magic');
  }

  /** Places a 제단 directly — used by the 우두머리 kill and by tests. */
  /** 제단 on their way (summonAltarAt): the pillar, where, what, and how long to go. Public for tests. */
  public readonly summoning: { x: number; y: number; offer: AltarOfferId; leftMs: number; pillar: Phaser.GameObjects.Image }[] = [];

  /**
   * A 제단 summoned (0.85, the user's ask): a red pillar comes down on the
   * spot, and ALTAR.summonDelayMs later the 제단 stands there. Stepped by
   * `update`, so a pause holds it.
   */
  public summonAltarAt(x: number, y: number, offer: AltarOfferId): void {
    [x, y] = this.onGround(x, y);
    const fx = ALTAR_SUMMON_FX;
    const pillar = this.scene.add
      .image(x, y + ALTAR.size / 2, TEXTURES.lightPillar)
      .setOrigin(0.5, 1)
      .setDisplaySize(fx.width, fx.height)
      .setTint(fx.tint)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(fx.alpha)
      .setDepth(DEPTH.pickups + 1);
    // It comes down from above: grown from nothing at its top to its full length.
    const full = pillar.scaleY;
    pillar.setScale(pillar.scaleX, 0).setY(y + ALTAR.size / 2 - fx.height);
    this.scene.tweens.add({ targets: pillar, scaleY: full, y: y + ALTAR.size / 2, duration: fx.dropMs, ease: 'Quad.easeIn' });
    this.summoning.push({ x, y, offer, leftMs: ALTAR.summonDelayMs, pillar });
  }

  /** Steps what waits on the run's clock: the 제단 on their way. */
  public update(delta: number): void {
    for (let i = this.summoning.length - 1; i >= 0; i--) {
      const pending = this.summoning[i]!;
      pending.leftMs -= delta;
      if (pending.leftMs > 0) {
        continue;
      }
      this.summoning.splice(i, 1);
      this.dropAltarAt(pending.x, pending.y, pending.offer);
      const { pillar } = pending;
      this.scene.tweens.killTweensOf(pillar);
      this.scene.tweens.add({ targets: pillar, alpha: 0, duration: ALTAR_SUMMON_FX.fadeMs, onComplete: () => pillar.destroy() });
    }
  }

  public dropAltarAt(x: number, y: number, offer: AltarOfferId): Altar | null {
    [x, y] = this.onGround(x, y);
    const altar = this.altars.get() as Altar | null;
    if (!altar) {
      return null;
    }

    altar.drop(x, y, offer, this.player, (woke) =>
      this.hooks.onAltarWoke(woke.offer, woke.x, woke.y),
    );
    this.playDropSound(ALTAR_OFFERS[offer]?.extremeSound ? 'extreme' : Altar.tierFor(offer));
    return altar;
  }

  /** Places a weapon directly — used by the 우두머리 kill and debug keys. */
  public dropGearAt(x: number, y: number, item: GearItem): void {
    [x, y] = this.onGround(x, y);
    const drop = this.gearDrops.get() as GearDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, item);
    this.land(drop, itemFilter.showsGear(item), dropTierFor(item), GEAR[item.id]?.extremeSound === true);
  }

  /** Places a drop directly — used by the spawner's roll and by debug keys. */
  public dropSkillAt(x: number, y: number, skill: SkillDefinition): void {
    [x, y] = this.onGround(x, y);
    const drop = this.skillDrops.get() as SkillDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, skill);
    this.land(drop, itemFilter.shows('skill'));
  }

  /**
   * A fresh drop's sound — or, if the 아이템 필터 has it switched off, its
   * hiding: it still lies there to be walked over or taken by a 자석, it is
   * only not seen or heard (until 2026-10-18 it never landed at all).
   */
  /**
   * Every drop ends here: hidden by the 아이템 필터, or heard. An `extreme`
   * one (0.102: 재능의 파편, 하얀 망고, 망고의 구슬, 오니고로시) lands with
   * AUDIO.drops.extreme and stands in a red pillar.
   */
  private land(item: GroundItem, shown: boolean, tier: DropTier | null = 'normal', extreme = false): void {
    if (!shown) {
      item.conceal();
      return;
    }
    if (extreme) {
      this.playDropSound('extreme');
      (item as GroundItem & { nameplate?: DropLabel }).nameplate?.blaze();
    } else if (tier) {
      this.playDropSound(tier);
    }
  }

  /**
   * The drop's own sound, by how rare what landed is. A rare weapon's clip
   * carries its own swell behind the hit — one mixed file rather than two
   * played together, so there is nothing to keep in step.
   */
  private playDropSound(tier: DropTier | 'extreme' = 'normal'): void {
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
    // 감전 (낙뢰 각성): every hit on it lands harder while it lasts.
    const shocked = enemy.isShocked ? 1 + SKILL_MASTERY.thunderShock.amplify : 1;
    const dealt = Math.round(amount * shocked * (crit ? this.hooks.critMultiplier() : 1));

    // 설정's 데미지 숫자 표시 (0.101) hides these, and only these.
    if (settings.value.damageNumbers) {
      this.damageNumbers.spawn(
        enemy.x,
        enemy.y - 10,
        dealt,
        crit ? { color: COLORS.critText, crit: true } : undefined,
      );
    }
    // What the enemy actually absorbed: a hit that kills something with two
    // health left is worth two, not whatever the number on the card said.
    const absorbed = Math.min(dealt, enemy.hp);
    this.stats.recordDamage(absorbed);

    if (enemy.takeDamage(dealt)) {
      this.killEnemy(enemy);
    }
  };

  /**
   * 얼음창 2차 각성: every enemy within the shatter's reach of (x, y) is put
   * under 냉각 — a ring of frost says where. One of them dying spreads it on.
   */
  private shatterAt(x: number, y: number): void {
    const shatter = this.hooks.shatter();
    if (!shatter) {
      return;
    }
    for (const child of this.enemies.getChildren()) {
      const other = child as Enemy;
      if (other.active && Phaser.Math.Distance.Between(x, y, other.x, other.y) <= shatter.radius) {
        other.chill(CHILL.durationMs);
      }
    }
    const ring = this.scene.add
      .circle(x, y, shatter.radius, CHILL.tint, 0.18)
      .setStrokeStyle(2, CHILL.tint, 0.9)
      .setDepth(DEPTH.vfx)
      .setScale(0.4);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 320, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
  }

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
    const healed = this.player.heal(HealthPotion.healingFor(this.player.maxHp));
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

  private onTalentShardTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, object) => {
    const drop = object as TalentShardDrop;
    if (!drop.active) {
      return;
    }

    drop.collect();
    this.hooks.onTalentShardCollected(drop.stat);
  };

  private onUnknownRuneTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, object) => {
    const drop = object as UnknownRuneDrop;
    if (!drop.active) {
      return;
    }

    drop.collect();
    this.hooks.onUnknownRuneCollected();
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
    sfx.playEnemy(this.scene, enemy.kind, 'death');
    const worth = enemy.xpValue;
    const dropBonus = enemy.dropBonus;
    const wasBoss = enemy.isBoss;
    const kind = enemy.kind;
    const certainSkill = enemy.alwaysDropsSkill;
    const certainShard = enemy.alwaysDropsShard;
    const webStacks = enemy.webStacks;
    const diedChilled = enemy.isChilled;
    const scale = this.hooks.dropScale();
    // Every ordinary drop below is raised by what this kill was: a rare's
    // 속성, a 우두머리. What only a 우두머리 leaves, and what is certain, is not.
    const bonus = scale * dropBonus;
    // Pooled: back to the spawner's pool rather than destroyed.
    enemy.recycle();

    const gem = this.gems.get() as XpGem | null;
    gem?.drop(x, y, worth, this.player);

    // 얼음창 2차 각성: dying under 냉각, it freezes what stands round it.
    if (diedChilled) {
      this.shatterAt(x, y);
    }

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

    // 알수없는 룬: only off its kind (the 키메라), and as flat as the 망고.
    if (kind === UNKNOWN_RUNE.from && Math.random() < UNKNOWN_RUNE.chance) {
      this.dropUnknownRuneAt(x, y - 36);
    }

    // 재능의 파편 (0.104): one roll for them all, as flat as the 망고 — and
    // certain off a 도망자 or a 키메라. Which stat it is, the tree weighs.
    if (certainShard || Math.random() < TALENT_SHARD.chance) {
      this.dropTalentShardAt(x - 18, y + 18, this.rollShardStat());
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

    // And a 제단 — always off a 우두머리, now and then off anything else —
    // set back from the rest so that picking those up does not wake it.
    const altarChance = wasBoss ? ALTAR.fromBoss : ALTAR.fromKill * bonus;
    if (Math.random() < altarChance) {
      // Above the kill, or below it when above would be off the map — set
      // back either way, so picking the loot up does not wake it.
      const above = y - ALTAR.dropOffset;
      const altarY = above >= DROP_MARGIN ? above : y + ALTAR.dropOffset;
      this.summonAltarAt(x, altarY, rollAltarOffer());
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
