import Phaser from 'phaser';

import {
  ALTAR,
  AUDIO,
  BONES,
  boneChanceFor,
  COLORS,
  DEPTH,
  FIREBALL,
  MANGO,
  POTION,
  RUNE_CHISEL,
  RUNE_DROP,
  SHOT_CHAIN,
  type RuneId,
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
import { RuneDrop } from '@/entities/RuneDrop';
import { ChiselDrop } from '@/entities/ChiselDrop';
import { rollRune } from '@/systems/Runes';
import { MangoDrop } from '@/entities/MangoDrop';
import { MagnetDrop } from '@/entities/MagnetDrop';
import { dropTierFor, rollOrbDrop, type GearItem } from '@/systems/Gear';
import type { RunStats } from '@/systems/RunStats';
import { HealthPotion } from '@/entities/HealthPotion';
import type { GroundItem } from '@/entities/GroundItem';
import { Player } from '@/entities/Player';
import { Projectile } from '@/entities/Projectile';
import { XpGem } from '@/entities/XpGem';
import type { DamageNumbers } from '@/systems/DamageNumbers';
import type { Progression } from '@/systems/Progression';
import type { SkillId } from '@/weapons/skills';
import { effectVolume, sfx } from '@/systems/Sfx';

export interface CombatHooks {
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
  /** One skill's crit chance, and what one of its crits is worth (the gear's and its 룬). */
  readonly critChance: (skill: SkillId | undefined) => number;
  readonly critMultiplier: (skill: SkillId | undefined) => number;
  /** What every gem's experience is multiplied by. */
  readonly xpScale?: () => number;
  /** Called when the player walks over a 룬. */
  readonly onRuneCollected: (id: RuneId) => void;
  /** Called when the player walks over a 룬 끌. */
  readonly onChiselCollected: () => void;
  /** Whether a 룬 끌 would do anything now: some skill held still has room for a slot. */
  readonly chiselWanted: () => boolean;
  /** A rare with the 거미 속성 died here: lay its web. */
  readonly onWeb: (x: number, y: number, stacks: number) => void;
  /** Called when the player walks over a 하얀 망고. */
  readonly onMangoCollected: () => void;
  /** A 자석 was picked up, and everything on the map is on its way. */
  readonly onMagnetCollected: () => void;
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
  /** Everything the shooting kinds have thrown at the player. */
  public readonly enemyShots: Phaser.Physics.Arcade.Group;
  public readonly potions: Phaser.Physics.Arcade.Group;
  public readonly gearDrops: Phaser.Physics.Arcade.Group;
  public readonly orbDrops: Phaser.Physics.Arcade.Group;
  public readonly boneDrops: Phaser.Physics.Arcade.Group;
  /** 룬 and 룬 끌 lying on the ground. */
  public readonly runeDrops: Phaser.Physics.Arcade.Group;
  public readonly chiselDrops: Phaser.Physics.Arcade.Group;
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

    this.enemyShots = scene.physics.add.group({
      classType: EnemyShot,
      maxSize: WEAPON.maxProjectiles,
      runChildUpdate: true,
    });

    this.potions = scene.physics.add.group({ classType: HealthPotion, runChildUpdate: true });
    this.gearDrops = scene.physics.add.group({ classType: GearDrop, runChildUpdate: true });
    this.orbDrops = scene.physics.add.group({ classType: OrbDrop, runChildUpdate: true });
    this.boneDrops = scene.physics.add.group({ classType: BoneDrop, runChildUpdate: true });
    this.runeDrops = scene.physics.add.group({ classType: RuneDrop, runChildUpdate: true });
    this.chiselDrops = scene.physics.add.group({ classType: ChiselDrop, runChildUpdate: true });
    this.mangoDrops = scene.physics.add.group({ classType: MangoDrop, runChildUpdate: true });
    this.magnetDrops = scene.physics.add.group({ classType: MagnetDrop, runChildUpdate: true });
    // No overlap: an altar is woken by distance, in its own update.
    this.altars = scene.physics.add.group({ classType: Altar, runChildUpdate: true });

    scene.physics.add.overlap(player, enemies, this.onEnemyTouch, undefined, this);
    scene.physics.add.overlap(player, this.enemyShots, this.onEnemyShotHit, undefined, this);
    scene.physics.add.overlap(player, this.potions, this.onPotionTouch, undefined, this);
    scene.physics.add.overlap(player, this.gems, this.onGemTouch, undefined, this);
    scene.physics.add.overlap(player, this.gearDrops, this.onGearTouch, undefined, this);
    scene.physics.add.overlap(player, this.orbDrops, this.onOrbTouch, undefined, this);
    scene.physics.add.overlap(player, this.boneDrops, this.onBoneTouch, undefined, this);
    scene.physics.add.overlap(player, this.runeDrops, this.onRuneTouch, undefined, this);
    scene.physics.add.overlap(player, this.chiselDrops, this.onChiselTouch, undefined, this);
    scene.physics.add.overlap(player, this.mangoDrops, this.onMangoTouch, undefined, this);
    scene.physics.add.overlap(player, this.magnetDrops, this.onMagnetTouch, undefined, this);
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

    drop.drop(x, y, id, this.player);
    // No sound of its own either: a run finds dozens, drawn in like gems.
    this.land(drop, itemFilter.shows(`orb:${id}`), null);
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
    this.land(drop, itemFilter.shows('mango'), 'rare');
  }

  /** Places a 자석 directly — used by the kill roll and by tests. */
  public dropMagnetAt(x: number, y: number): void {
    [x, y] = this.onGround(x, y);
    const drop = this.magnetDrops.get() as MagnetDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y);
    this.land(drop, itemFilter.shows('magnet'), 'rare');
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
    take(this.gearDrops, this.onGearTouch);
    take(this.orbDrops, this.onOrbTouch);
    take(this.boneDrops, this.onBoneTouch);
    take(this.runeDrops, this.onRuneTouch);
    take(this.chiselDrops, this.onChiselTouch);
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

  /** Places a 룬 directly — one by weight when none is named. Used by the kill roll, debug keys and tests. */
  public dropRuneAt(x: number, y: number, id: RuneId = rollRune()): void {
    [x, y] = this.onGround(x, y);
    const drop = this.runeDrops.get() as RuneDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, id);
    this.land(drop, itemFilter.shows('rune'), 'magic');
  }

  /** Places a 룬 끌 directly — used by the kill roll, debug keys and tests. */
  public dropChiselAt(x: number, y: number): void {
    [x, y] = this.onGround(x, y);
    const drop = this.chiselDrops.get() as ChiselDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y);
    this.land(drop, itemFilter.shows('chisel'), 'rare');
  }

  /** Places a 제단 directly — used by the 우두머리 kill and by tests. */
  public dropAltarAt(x: number, y: number, offer: AltarOfferId): Altar | null {
    [x, y] = this.onGround(x, y);
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
    [x, y] = this.onGround(x, y);
    const drop = this.gearDrops.get() as GearDrop | null;
    if (!drop) {
      return;
    }

    drop.drop(x, y, item);
    this.land(drop, itemFilter.showsGear(item), dropTierFor(item));
  }

  /**
   * A fresh drop's sound — or, if the 아이템 필터 has it switched off, its
   * hiding: it still lies there to be walked over or taken by a 자석, it is
   * only not seen or heard (until 2026-10-18 it never landed at all).
   */
  private land(item: GroundItem, shown: boolean, tier: DropTier | null = 'normal'): void {
    if (!shown) {
      item.conceal();
      return;
    }
    if (tier) {
      this.playDropSound(tier);
    }
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
  public hit = (enemy: Enemy, amount: number, skill?: SkillId): void => {
    if (!enemy.active) {
      return;
    }

    const chance = this.hooks.critChance(skill);
    const crit = chance > 0 && Math.random() < chance;
    const dealt = crit ? Math.round(amount * this.hooks.critMultiplier(skill)) : Math.max(1, Math.round(amount));

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
    this.hit(enemy, shot.damage, shot.skill);

    if (shot.blastRadius > 0) {
      this.blast(x, y, shot.blastRadius, shot.damage, enemy, shot.skill);
      if (shot.fireZoneDps > 0) {
        this.burnGround(x, y, shot.blastRadius, shot.fireZoneDps, shot.fireZoneMs, shot.skill);
      }
    }

    if (carriesOn) {
      // 관통의 룬: every body passed through costs a share of what is left.
      shot.damage *= shot.pierceKeep;
      return;
    }
    // 연쇄: a shot that has used its pierce turns to the nearest enemy it has
    // not hit yet, from where it struck.
    if (shot.chainLeft > 0) {
      let next: Enemy | undefined;
      let best: number = SHOT_CHAIN.reach;
      for (const child of this.enemies.getChildren()) {
        const other = child as Enemy;
        if (!other.active || other === enemy || shot.hasStruck(other)) {
          continue;
        }
        const d = Phaser.Math.Distance.Between(x, y, other.x, other.y);
        if (d < best) {
          best = d;
          next = other;
        }
      }
      if (next && shot.chainTo(next.x, next.y, SHOT_CHAIN.reach)) {
        return;
      }
    }
    shot.despawn();
  };

  /**
   * A burst where a shot landed: everything within `radius` takes the same
   * damage, except the body it landed on, which has already had it. The
   * victims are gathered before any of them is hit, because a kill recycles
   * a sprite and the pool could hand it straight back.
   */
  public blast(
    x: number,
    y: number,
    radius: number,
    damage: number,
    spared?: Enemy,
    skill?: SkillId,
    color: number = COLORS.fireBlast,
  ): number {
    const caught: Enemy[] = [];
    for (const child of this.enemies.getChildren()) {
      const other = child as Enemy;
      if (other.active && other !== spared &&
          Phaser.Math.Distance.Between(x, y, other.x, other.y) <= radius) {
        caught.push(other);
      }
    }

    caught.forEach((other) => this.hit(other, damage, skill));

    const flash = this.scene.add
      .circle(x, y, radius, color, 0.35)
      .setStrokeStyle(2, color, 0.9)
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
  public readonly fireZones: {
    x: number;
    y: number;
    radius: number;
    dps: number;
    leftMs: number;
    sinceTickMs: number;
    skill?: SkillId;
    view: Phaser.GameObjects.Arc;
  }[] = [];

  /** Leaves the ground at (x, y) burning, for SKILL_MASTERY.fireZone.durationMs unless told otherwise. */
  public burnGround(
    x: number,
    y: number,
    radius: number,
    dps: number,
    durationMs: number = SKILL_MASTERY.fireZone.durationMs,
    skill?: SkillId,
  ): void {
    const view = this.scene.add
      .circle(x, y, radius, COLORS.fireBlast, 0.18)
      .setStrokeStyle(2, COLORS.fireBlast, 0.5)
      .setDepth(DEPTH.pickups - 1);
    this.scene.tweens.add({ targets: view, alpha: 0.7, duration: 260, yoyo: true, repeat: -1 });
    this.fireZones.push({ x, y, radius, dps, leftMs: durationMs || SKILL_MASTERY.fireZone.durationMs, sinceTickMs: 0, skill, view });
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
        caught.forEach((enemy) => this.hit(enemy, amount, zone.skill));
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
    const xp = gem.value * (this.hooks.xpScale?.() ?? 1);
    this.progression.addXp(xp);
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
    const healed = this.player.heal(HealthPotion.healingFor(this.player.maxHp, this.player.potionHealScale));
    this.damageNumbers.spawn(this.player.x, this.player.y - 18, healed, {
      prefix: '+',
      color: COLORS.healText,
    });
  };

  private onRuneTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const drop = b as unknown as RuneDrop;
    if (!drop.active) {
      return;
    }

    drop.collect();
    this.hooks.onRuneCollected(drop.rune);
  };

  private onChiselTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, b) => {
    const drop = b as unknown as ChiselDrop;
    if (!drop.active) {
      return;
    }

    drop.collect();
    this.hooks.onChiselCollected();
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

  private onMagnetTouch: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (_player, object) => {
    const drop = object as MagnetDrop;
    if (!drop.active) {
      return;
    }

    drop.collect();
    this.collectEverything();
    this.hooks.onMagnetCollected();
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
    const certainRune = enemy.alwaysDropsRune;
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

    // A 룬: a 우두머리 and a 도망자 always leave one (they left a skill
    // until 0.74); anything else at RUNE_DROP.chance.
    if (certainRune || Math.random() < RUNE_DROP.chance * bonus) {
      this.dropRuneAt(x + 18, y - 18);
    }

    // A 룬 끌, while some skill held still has room for a slot.
    if (this.hooks.chiselWanted() && Math.random() < RUNE_CHISEL.chance * bonus) {
      this.dropChiselAt(x - 18, y + 18);
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
