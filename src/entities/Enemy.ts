import Phaser from 'phaser';

import {
  AFFIXES,
  BALANCE,
  CHILL,
  COLORS,
  DEPTH,
  ENEMY,
  ENEMY_KINDS,
  RARE,
  TEXTURES,
  TIMING,
  type AffixId,
  type AffixSpec,
  type EnemyKind,
  type EnemyShotSpec,
} from '@/config';

const AFFIX_IDS = Object.keys(AFFIXES) as AffixId[];

/** One to RARE.maxAffixes distinct affixes, drawn at random. */
function rollAffixes(): readonly AffixSpec[] {
  const pool = [...AFFIX_IDS];
  const count = Phaser.Math.Between(RARE.minAffixes, Math.min(RARE.maxAffixes, pool.length));
  const picked: AffixSpec[] = [];

  for (let i = 0; i < count; i++) {
    const [id] = pool.splice(Math.floor(Math.random() * pool.length), 1);
    if (id) {
      picked.push(AFFIXES[id]);
    }
  }

  return picked;
}

/** What an enemy needs from the world around it. */
export interface EnemyHooks {
  /** Fires one enemy shot. Only the kinds that shoot ever call it. */
  readonly fireShot: (x: number, y: number, angle: number, spec: EnemyShotSpec) => void;
}

/**
 * A chaser. Which chaser it is comes from its kind: ENEMY_KINDS holds the
 * health, speed, size and reward of every variant, so a new enemy is an
 * entry in that table rather than a subclass. The one behavioural branch is
 * the kinds that shoot — they stop at their standoff and open fire instead
 * of walking into the player.
 *
 * Pooled by SpawnDirector's group, so a kill disables it rather than
 * destroying it and `spawn` is what actually starts a life.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public hp = 0;
  public kind: EnemyKind = 'grunt';
  /**
   * How many times this sprite has been spawned. Anything that remembers a
   * per-enemy timer across frames pairs it with this, so a recycled sprite
   * does not inherit the last occupant's cooldowns.
   */
  public lives = 0;
  /** Rares wear a yellow ring and carry affixes; the rest carry none. */
  public rare = false;
  public affixes: readonly AffixSpec[] = [];

  private spec = ENEMY_KINDS.grunt;
  private speed: number = ENEMY.speed;
  private target?: Phaser.GameObjects.Components.Transform;
  private hooks?: EnemyHooks;
  /** Countdown on the white hit flash, ticked in update. */
  private flashMs = 0;
  /** Countdown on the 냉각 debuff, ticked in update. */
  private chillMs = 0;
  /** Countdown to the next shot, for the kinds that have one. */
  private shotCooldownMs = 0;
  /** The yellow ring, made on the first rare this sprite is used for. */
  private outline?: Phaser.GameObjects.Rectangle;
  private hpScale = 1;
  private speedScale = 1;
  private damageScale = 1;
  private critChance = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.enemy);
    this.setDepth(DEPTH.enemies);
  }

  /** Contact damage before a rare's own multipliers. */
  public get contactDamage(): number {
    return this.spec.contactDamage;
  }

  /** How much more likely this one is to leave a skill behind. */
  public get dropBonus(): number {
    return 1 + this.affixes.length * RARE.dropBonusPerAffix;
  }

  /** "거대 · 치명" — what the tooltip lists. */
  public get affixNames(): readonly string[] {
    return this.affixes.map((affix) => affix.name);
  }

  /** Half the sprite's width, plus the ring. What counts as "pointing at it". */
  public get pickRadius(): number {
    return this.spec.size / 2 + RARE.outlinePadding;
  }

  /** XP its gem is worth. */
  public get xpValue(): number {
    return this.spec.xp;
  }

  public get kindName(): string {
    return this.spec.name;
  }

  /** True while 냉각 is slowing it down. */
  public get isChilled(): boolean {
    return this.chillMs > 0;
  }

  /** Current move speed, after its affixes and 냉각. */
  public get currentSpeed(): number {
    const moving = this.speed * this.speedScale;
    return this.isChilled ? moving * (1 - CHILL.slowFactor) : moving;
  }

  /** (Re)starts this enemy at a position. Safe to call on a recycled one. */
  public spawn(
    x: number,
    y: number,
    target: Phaser.GameObjects.Components.Transform,
    kind: EnemyKind = 'grunt',
    hooks?: EnemyHooks,
    rare = false,
  ): void {
    const spec = ENEMY_KINDS[kind];
    this.lives += 1;
    this.kind = kind;
    this.spec = spec;
    this.hooks = hooks;
    this.target = target;
    this.applyAffixes(rare ? rollAffixes() : []);
    this.hp = Math.max(1, Math.round(spec.maxHp * this.hpScale * BALANCE.enemyHpScale));
    this.flashMs = 0;
    this.chillMs = 0;
    this.clearTint();

    // A little spread so a pack does not move as one rigid blob.
    // Only the roll is baked in here; the affix multiplier is applied when
    // the speed is read, so an affix can be added or dropped at any time.
    this.speed = spec.speed * Phaser.Math.FloatBetween(1 - ENEMY.speedVariance, 1 + ENEMY.speedVariance);
    // Stagger the first shot, or a wave of shooters fires in one volley.
    this.shotCooldownMs = spec.shot ? Phaser.Math.Between(0, spec.shot.cooldownMs) : 0;

    this.setTexture(spec.texture);
    this.enableBody(true, x, y, true, true);
    this.body?.setSize(spec.size, spec.size, true);
    this.setVelocity(0, 0);
    this.drawOutline();
  }

  /** Reads a set of affixes into the multipliers the rest of the class uses. */
  private applyAffixes(affixes: readonly AffixSpec[]): void {
    this.affixes = affixes;
    this.rare = affixes.length > 0;
    this.hpScale = 1;
    this.speedScale = 1;
    this.damageScale = 1;
    this.critChance = 0;

    for (const affix of affixes) {
      this.hpScale *= affix.hpScale ?? 1;
      this.speedScale *= affix.speedScale ?? 1;
      this.damageScale *= affix.damageScale ?? 1;
      // Two 치명 rolls cannot happen — affixes are drawn without repeats —
      // so the highest one simply wins.
      this.critChance = Math.max(this.critChance, affix.critChance ?? 0);
    }
  }

  /** The ring that marks a rare, made once and reused by the pool. */
  private drawOutline(): void {
    if (!this.rare) {
      this.outline?.setVisible(false);
      return;
    }

    const side = this.spec.size + RARE.outlinePadding * 2;
    if (!this.outline) {
      this.outline = this.scene.add
        .rectangle(this.x, this.y, side, side)
        .setFillStyle(undefined, 0)
        .setDepth(DEPTH.enemies - 1);
    }

    this.outline
      .setSize(side, side)
      .setStrokeStyle(RARE.outlineWidth, COLORS.rareOutline, 1)
      .setPosition(this.x, this.y)
      .setVisible(true);
  }

  /** One hit's worth of damage, after 강력 and a roll for 치명. */
  public rollDamage(base: number): number {
    const crit = this.critChance > 0 && Math.random() < this.critChance;
    const amount = base * this.damageScale * (crit ? RARE.critMultiplier : 1);
    return Math.max(1, Math.round(amount));
  }

  /** Returns it to the pool without destroying it. */
  public recycle(): void {
    this.target = undefined;
    this.hooks = undefined;
    this.chillMs = 0;
    this.rare = false;
    this.affixes = [];
    this.outline?.setVisible(false);
    this.clearTint();
    this.disableBody(true, true);
  }

  public override destroy(fromScene?: boolean): void {
    this.outline?.destroy(fromScene);
    super.destroy(fromScene);
  }

  /**
   * Applies 냉각. Re-applying refreshes the timer rather than stacking the
   * slow, so a shot through a crowd does not freeze it solid.
   */
  public chill(durationMs: number = CHILL.durationMs): void {
    if (!this.active) {
      return;
    }

    this.chillMs = Math.max(this.chillMs, durationMs);
    this.applyTint();
  }

  /** Returns true when this hit killed it. */
  public takeDamage(amount: number): boolean {
    this.hp -= amount;

    if (this.hp > 0) {
      // Flash timed in update rather than a per-hit delayedCall, which would
      // allocate a timer for every single hit.
      this.flashMs = 60;
      this.applyTint();
      return false;
    }

    return true;
  }

  public override update(_time: number, delta: number): void {
    if (!this.active) {
      return;
    }

    const dt = Math.min(delta, TIMING.maxDeltaMs);

    if (this.flashMs > 0) {
      this.flashMs -= dt;
      if (this.flashMs <= 0) {
        this.applyTint();
      }
    }

    if (this.chillMs > 0) {
      this.chillMs -= dt;
      if (this.chillMs <= 0) {
        this.applyTint();
      }
    }

    this.outline?.setPosition(this.x, this.y);

    if (!this.target || !this.body) {
      return;
    }

    const distance = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);

    if (this.spec.shot && this.fightAtRange(dt, distance, this.spec.shot)) {
      return;
    }

    this.scene.physics.moveTo(this, this.target.x, this.target.y, this.currentSpeed);
  }

  /**
   * Shoots when the player is in range. Returns true once inside the
   * standoff, where it holds position instead of closing further.
   */
  private fightAtRange(delta: number, distance: number, shot: EnemyShotSpec): boolean {
    this.shotCooldownMs -= delta;

    if (distance <= shot.range && this.shotCooldownMs <= 0 && this.target) {
      this.shotCooldownMs = shot.cooldownMs;
      const angle = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
      // A rare's bolt carries its own multipliers, rolled as it leaves.
      this.hooks?.fireShot(this.x, this.y, angle, { ...shot, damage: this.rollDamage(shot.damage) });
    }

    if (distance > shot.standoff) {
      return false;
    }

    this.setVelocity(0, 0);
    return true;
  }

  /** The hit flash wins while it lasts, then 냉각 shows through under it. */
  private applyTint(): void {
    if (this.flashMs > 0) {
      this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      return;
    }

    if (this.chillMs > 0) {
      // FILL, not MULTIPLY: multiplying ice blue into a red enemy just
      // muddies it, while a flat frost colour reads at a glance.
      this.setTint(CHILL.tint).setTintMode(Phaser.TintModes.FILL);
      return;
    }

    this.clearTint();
  }
}
