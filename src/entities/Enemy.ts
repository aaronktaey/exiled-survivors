import Phaser from 'phaser';

import {
  BALANCE,
  BOSS,
  CHILL,
  COLORS,
  SHOCK_FX,
  DEPTH,
  ENEMY,
  ENEMY_KINDS,
  HUD,
  RARE,
  RARE_OUTLINE_TIERS,
  TEXTURES,
  ENEMY_AFFIXES,
  TIMING,
  WORLD,
  xpFor,
  type AffixSpec,
  type EnemyKind,
  type EnemyFleeSpec,
  type EnemyShotSpec,
  type EnemyVolleySpec,
  type EnemyHopSpec,
  GIANT_STRIDE,
  GIANT_TURN,
  giantFrame,
  type EnemyGiantSpec,
} from '@/config';
import { enemyName } from '@/i18n';
import { sfx } from '@/systems/Sfx';

/** Only the 속성 that mean something on an enemy. */
const ENEMY_AFFIX_POOL = ENEMY_AFFIXES;

/**
 * What a rare is carrying. It always gets minAffixes; after that each
 * further one has to win its own roll, so most rares carry one or two and
 * a full stack is something you meet rarely and remember.
 *
 * Repeats are allowed — there are fewer affix kinds than the ceiling, and
 * a doubled 거대 is a fine way to say "much bigger".
 */
/**
 * The 속성 this kind has anywhere to put. 연발 adds bolts to a shot, which
 * means nothing on something that walks up and hits you, so it only goes on
 * the kinds that shoot.
 */
function poolFor(kind: EnemyKind): readonly AffixSpec[] {
  const ranged = ENEMY_KINDS[kind]?.shot !== undefined;
  return ranged ? ENEMY_AFFIX_POOL : ENEMY_AFFIX_POOL.filter((affix) => !affix.rangedOnly);
}

function rollAffixes(kind: EnemyKind): readonly AffixSpec[] {
  const picked: AffixSpec[] = [];
  const pool = poolFor(kind);

  while (picked.length < RARE.maxAffixes) {
    if (picked.length >= RARE.minAffixes && Math.random() >= RARE.extraAffixChance) {
      break;
    }

    const affix = pool[Math.floor(Math.random() * pool.length)];
    if (affix) {
      picked.push(affix);
    }
  }

  return picked;
}

/** What an enemy needs from the world around it. */
export interface EnemyHooks {
  /** Fires one enemy shot. Only the kinds that shoot ever call it. */
  readonly fireShot: (x: number, y: number, angle: number, spec: EnemyShotSpec) => void;
  /** Announces a 우두머리, so the run can say something about it. */
  readonly onBossSpawned?: () => void;
  /** A 키메라 came on its clock (SpawnDirector.spawnChimera). */
  readonly onChimeraSpawned?: () => void;
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
  /** What it walked in with, for anything that draws a bar. */
  public maxHp = 0;
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
  /** Scene time before which this one's body cannot hurt the survivor again. */
  public contactReadyAt = 0;
  /** Left of a kind's lifespan, for the kinds that have one. Public for tests. */
  public lifeLeftMs = Infinity;
  /** Where a 도망자 is running to, while it runs. Public for tests. */
  public fleeTo?: Phaser.Math.Vector2;

  private spec = ENEMY_KINDS.grunt;
  private speed: number = ENEMY.speed;
  private target?: Phaser.GameObjects.Components.Transform;
  private hooks?: EnemyHooks;
  /** Countdown on the white hit flash, ticked in update. */
  private flashMs = 0;
  /** Countdown on the 냉각 debuff, ticked in update. */
  private chillMs = 0;
  /** Frozen solid (얼음창 각성): it neither moves nor shoots. */
  private frozenMs = 0;
  /** 감전 (낙뢰 각성): every hit on it lands harder while this lasts. */
  private shockMs = 0;
  /** The crackle round a 감전 enemy, redrawn every SHOCK_FX.redrawMs. */
  private shockFx?: Phaser.GameObjects.Graphics;
  private shockFxMs = 0;
  /** A 기행종's hop: how long the current one or the rest after it has left, and where it goes. */
  private hopLeftMs = 0;
  private hopping = false;
  private hopAngle = 0;
  /** Countdown to the next ring, for the kinds that throw one. */
  private volleyCooldownMs = 0;
  /** Countdown to the next shot, for the kinds that have one. */
  private shotCooldownMs = 0;
  /** The yellow ring, made on the first rare this sprite is used for. */
  private outline?: Phaser.GameObjects.Rectangle;
  /** A giant's gold ring under its feet, in place of the square one. Public for tests. */
  public footRing?: Phaser.GameObjects.Ellipse;
  /** A giant's walk: where it is in GIANT_STRIDE, and how long that step has shown. */
  private strideAt = 0;
  private strideMs = 0;
  /** The turn a giant takes when it throws, while it lasts. */
  private spin?: Phaser.Tweens.Tween;
  /** 우두머리's health bar and the line above it, made on its first one. */
  private healthBar?: Phaser.GameObjects.Graphics;
  private plate?: Phaser.GameObjects.Text;
  private hpScale = 1;
  /** Bolts beyond the aimed one, from 연발. */
  private extraShots = 0;
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

  /**
   * What this kill multiplies every ordinary drop chance by: +10% a 속성 on
   * a rare, +200% for a 우두머리 (both tuned in balance.ts).
   */
  public get dropBonus(): number {
    if (this.isBoss) {
      return 1 + BOSS.dropBonus;
    }
    return 1 + this.affixes.length * RARE.dropBonusPerAffix;
  }

  /** "거대 · 치명" — what the tooltip lists. */
  public get affixNames(): readonly string[] {
    return this.affixes.map((affix) => affix.name);
  }

  /** The ring's colour: gold for a boss, deepening with a rare's affixes. */
  public get outlineColor(): number {
    if (this.isBoss) {
      return COLORS.bossOutline;
    }

    const tier = Phaser.Math.Clamp(this.affixes.length, 1, RARE_OUTLINE_TIERS.length) - 1;
    return RARE_OUTLINE_TIERS[tier] ?? COLORS.rareOutline;
  }

  /** Affixes folded into "거대 x2" counts, in the order they were drawn. */
  public get affixTally(): readonly { readonly affix: AffixSpec; readonly count: number }[] {
    const tally: { affix: AffixSpec; count: number }[] = [];
    for (const affix of this.affixes) {
      const seen = tally.find((entry) => entry.affix.id === affix.id);
      if (seen) {
        seen.count += 1;
      } else {
        tally.push({ affix, count: 1 });
      }
    }
    return tally;
  }

  /** Half the sprite's width, plus the ring. What counts as "pointing at it". */
  public get pickRadius(): number {
    return this.spec.size / 2 + RARE.outlinePadding;
  }

  /** Side of the sprite, for anything that has to give it room. */
  public get bodySize(): number {
    return this.spec.size;
  }

  /**
   * How far from its middle it is drawn: half its side, or half the giant's
   * picture — wider than the body physics uses. A swing that touches what is
   * seen is a swing that lands (MeleeStrike).
   */
  public get shownRadius(): number {
    return (this.spec.giant?.drawn ?? this.spec.size) / 2;
  }

  /** XP its gem is worth, from its own stat line and its affixes. */
  public get xpValue(): number {
    return xpFor(this.spec, this.hpScale, this.damageScale);
  }

  public get kindName(): string {
    return this.spec.name;
  }

  /** 우두머리 arrives on the clock and always leaves a skill behind. */
  public get isBoss(): boolean {
    return this.kind === 'boss';
  }

  /** A 우두머리 and a 도망자 both always leave a skill. */
  public get alwaysDropsSkill(): boolean {
    return this.isBoss || this.spec.guaranteedSkill === true;
  }

  /** How many 거미 this one carries — how wide a web it leaves. */
  public get webStacks(): number {
    return this.affixes.filter((affix) => affix.enemy?.web === true).length;
  }

  /** True while a 도망자 is running from a hit. */
  public get isFleeing(): boolean {
    return this.fleeTo !== undefined;
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
    timeScale = 1,
  ): void {
    const spec = ENEMY_KINDS[kind];
    this.lives += 1;
    this.kind = kind;
    this.spec = spec;
    this.hooks = hooks;
    this.target = target;
    this.applyAffixes(rare ? rollAffixes(kind) : []);
    // Three things decide what it walks in with: the kind, whatever 속성 it
    // was born with, and how long the run has already lasted.
    this.hp = Math.max(
      1,
      Math.round(spec.maxHp * this.hpScale * BALANCE.enemyHpScale * timeScale),
    );
    this.maxHp = this.hp;
    this.flashMs = 0;
    this.chillMs = 0;
    this.frozenMs = 0;
    this.shockMs = 0;
    this.shockFx?.clear();
    this.hopLeftMs = 0;
    this.hopping = false;
    this.contactReadyAt = 0;
    this.lifeLeftMs = spec.lifespanMs ?? Infinity;
    this.fleeTo = undefined;
    this.setScale(1);
    this.clearTint();
    this.stopSpin();
    this.strideAt = 0;
    this.strideMs = 0;

    // A little spread so a pack does not move as one rigid blob.
    // Only the roll is baked in here; the affix multiplier is applied when
    // the speed is read, so an affix can be added or dropped at any time.
    this.speed = spec.speed * Phaser.Math.FloatBetween(1 - ENEMY.speedVariance, 1 + ENEMY.speedVariance);
    // Stagger the first shot, or a wave of shooters fires in one volley.
    this.shotCooldownMs = spec.shot ? Phaser.Math.Between(0, spec.shot.cooldownMs) : 0;
    // A ring, though, waits its full count: one the instant it walks in
    // would go off before the player has seen what arrived.
    this.volleyCooldownMs = spec.volley?.cooldownMs ?? 0;

    this.setTexture(spec.texture);
    this.enableBody(true, x, y, true, true);
    this.body?.setSize(spec.size, spec.size, true);
    this.setVelocity(0, 0);
    this.drawOutline();
    this.drawHealthBar();
    sfx.playEnemy(this.scene, kind, 'appear');
  }

  /** Reads a set of affixes into the multipliers the rest of the class uses. */
  private applyAffixes(affixes: readonly AffixSpec[]): void {
    this.affixes = affixes;
    this.rare = affixes.length > 0;
    this.hpScale = 1;
    this.speedScale = 1;
    this.damageScale = 1;
    this.critChance = 0;
    this.extraShots = 0;

    for (const affix of affixes) {
      // The same affix can be drawn twice, and then it stacks: the scales
      // multiply, while crit chance adds up and stops at certain.
      const effect = affix.enemy;
      if (!effect) {
        continue;
      }

      this.hpScale *= effect.hpScale ?? 1;
      this.speedScale *= effect.speedScale ?? 1;
      this.damageScale *= effect.damageScale ?? 1;
      this.critChance = Math.min(1, this.critChance + (effect.critChance ?? 0));
      this.extraShots += effect.extraShots ?? 0;
    }
  }

  /** The ring that marks a rare, made once and reused by the pool. */
  private drawOutline(): void {
    const giant = this.spec.giant;
    this.footRing?.setVisible(false);
    if (giant) {
      // A square round a giant reads as a box; it stands in a ring instead.
      this.outline?.setVisible(false);
      if (!this.footRing) {
        this.footRing = this.scene.add.ellipse(this.x, this.y, 1, 1).setFillStyle(undefined, 0).setDepth(DEPTH.enemies - 1);
      }
      this.footRing
        .setSize(giant.drawn * 0.95, giant.drawn * 0.36)
        .setStrokeStyle(RARE.outlineWidth, this.outlineColor, 1)
        .setVisible(true);
      this.placeFootRing();
      return;
    }
    if (!this.rare && !this.isBoss) {
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
      .setStrokeStyle(RARE.outlineWidth, this.outlineColor, 1)
      .setPosition(this.x, this.y)
      .setVisible(true);
  }

  /**
   * The bar a 우두머리 wears, drawn the way the survivor's own is: a track,
   * the fill over it, and its name and count on a line above. Nothing below
   * that rank gets one — a field of forty bars would say nothing at all.
   */
  private drawHealthBar(): void {
    if (!this.isBoss) {
      this.healthBar?.setVisible(false);
      this.plate?.setVisible(false);
      return;
    }

    const { width, height, gap } = HUD.bossBar;
    const left = this.x - width / 2;
    const top = this.y - this.spec.size / 2 - gap - height;
    const ratio = Phaser.Math.Clamp(this.hp / Math.max(1, this.maxHp), 0, 1);

    if (!this.healthBar) {
      this.healthBar = this.scene.add.graphics().setDepth(DEPTH.healthBar);
      this.plate = this.scene.add
        .text(this.x, top, '', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: HUD.nameplateSize,
          color: COLORS.text,
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.healthBar);
    }

    this.healthBar.clear();
    this.healthBar.fillStyle(COLORS.barTrack, 1);
    this.healthBar.fillRect(left, top, width, height);
    if (ratio > 0) {
      this.healthBar.fillStyle(COLORS.hpFill, 1);
      this.healthBar.fillRect(left, top, width * ratio, height);
    }
    this.healthBar.setVisible(true);

    // Whole numbers: a hit can take off a fraction (연쇄번개 각성, a crit), the count shows none.
    this.plate?.setText(`${enemyName(this.kind)}  ${Math.max(0, Math.ceil(this.hp))}/${Math.ceil(this.maxHp)}`);
    this.plate?.setPosition(this.x, top - HUD.nameplateGap);
    this.plate?.setVisible(true);
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
    this.frozenMs = 0;
    this.shockMs = 0;
    this.shockFx?.clear();
    this.hopLeftMs = 0;
    this.hopping = false;
    this.rare = false;
    this.affixes = [];
    this.fleeTo = undefined;
    this.setScale(1);
    this.stopSpin();
    this.outline?.setVisible(false).setScale(1);
    this.footRing?.setVisible(false);
    this.healthBar?.setVisible(false);
    this.plate?.setVisible(false);
    this.clearTint();
    this.disableBody(true, true);
  }

  public override destroy(fromScene?: boolean): void {
    this.outline?.destroy(fromScene);
    this.footRing?.destroy(fromScene);
    this.healthBar?.destroy(fromScene);
    this.plate?.destroy(fromScene);
    this.shockFx?.destroy(fromScene);
    super.destroy(fromScene);
  }

  /** True while 감전 (낙뢰 각성). */
  public get isShocked(): boolean {
    return this.shockMs > 0;
  }

  /** 감전 for `durationMs`, starting over if it already is. */
  public shock(durationMs: number): void {
    if (this.active) {
      this.shockMs = durationMs;
    }
  }

  /**
   * The crackle: a few short jagged sparks round the body, thrown again
   * every SHOCK_FX.redrawMs so they flicker — the 찌릿찌릿 the user asked for.
   */
  private drawShock(dt: number): void {
    if (this.shockMs <= 0) {
      return;
    }
    this.shockMs -= dt;
    this.shockFx ??= this.scene.add.graphics().setDepth(DEPTH.vfx);
    if (this.shockMs <= 0) {
      this.shockFx.clear();
      return;
    }
    this.shockFxMs -= dt;
    if (this.shockFxMs > 0) {
      this.shockFx.setPosition(this.x, this.y);
      return;
    }
    this.shockFxMs = SHOCK_FX.redrawMs;
    const r = this.shownRadius + SHOCK_FX.gap;
    const g = this.shockFx.clear().setPosition(this.x, this.y);
    for (let i = 0; i < SHOCK_FX.sparks; i++) {
      const a = Math.random() * Math.PI * 2;
      let px = Math.cos(a) * r;
      let py = Math.sin(a) * r;
      g.lineStyle(i % 2 ? 1 : 2, i % 2 ? 0xffffff : SHOCK_FX.color, 1);
      g.beginPath();
      g.moveTo(px, py);
      for (let k = 0; k < 3; k++) {
        px += (Math.random() - 0.5) * SHOCK_FX.jag + Math.cos(a) * 3;
        py += (Math.random() - 0.5) * SHOCK_FX.jag + Math.sin(a) * 3;
        g.lineTo(px, py);
      }
      g.strokePath();
    }
  }

  /** True while frozen solid. */
  public get isFrozen(): boolean {
    return this.frozenMs > 0;
  }

  /** Frozen solid for a moment (얼음창 각성): no step, no shot. */
  public freeze(durationMs: number): void {
    // A 키메라 (`unstoppable`) shrugs it off.
    if (this.active && !this.spec.unstoppable) {
      this.frozenMs = Math.max(this.frozenMs, durationMs);
    }
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

    if (this.hp > 0 && this.spec.flee && !this.fleeTo) {
      this.startFleeing(this.spec.flee);
    }

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
    this.drawShock(dt);

    this.outline?.setPosition(this.x, this.y);
    this.placeFootRing();
    if (this.isBoss) {
      this.drawHealthBar();
    }

    // A kind with a lifespan leaves when it runs out, and leaves nothing.
    if (this.lifeLeftMs !== Infinity) {
      this.lifeLeftMs -= dt;
      if (this.lifeLeftMs <= 0) {
        this.recycle();
        return;
      }
    }

    if (this.spec.flashy) {
      this.shimmer();
    }

    if (!this.target || !this.body) {
      return;
    }

    if (this.frozenMs > 0) {
      this.frozenMs -= dt;
      this.setVelocity(0, 0);
      return;
    }

    if (this.spec.flee) {
      this.run();
      return;
    }

    // The ring goes off whatever else it is doing — a 키메라 throws it mid-hop.
    if (this.spec.volley) {
      this.throwRing(dt, this.spec.volley);
    }

    if (this.spec.hop) {
      this.hopAbout(dt, this.spec.hop);
      return;
    }

    const distance = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);

    if (this.spec.shot && this.fightAtRange(dt, distance, this.spec.shot)) {
      return;
    }

    this.scene.physics.moveTo(this, this.target.x, this.target.y, this.currentSpeed);
    if (this.spec.giant) {
      this.stride(dt, this.spec.giant);
    }
  }

  /** A giant's walk: the next picture each `stepMs` while it moves, standing when it does not. */
  private stride(delta: number, giant: EnemyGiantSpec): void {
    // Mid-turn, the turn decides the picture.
    if (this.spin) {
      return;
    }
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    const moving = !!body && body.velocity.lengthSq() > 4;
    if (!moving) {
      this.strideAt = 0;
      this.strideMs = 0;
      this.showFrame(this.spec.texture);
      return;
    }
    this.strideMs += delta;
    if (this.strideMs >= giant.stepMs) {
      this.strideMs -= giant.stepMs;
      this.strideAt = (this.strideAt + 1) % GIANT_STRIDE.length;
    }
    this.showFrame(giantFrame(this.spec.texture, GIANT_STRIDE[this.strideAt]!));
  }

  /** Every frame asks; only a change of picture swaps it. */
  private showFrame(key: string): void {
    if (this.texture.key !== key) {
      this.setTexture(key);
    }
  }

  /** The ring under a giant's feet, where its feet are. */
  private placeFootRing(): void {
    const giant = this.spec.giant;
    if (this.footRing?.visible && giant) {
      this.footRing.setPosition(this.x, this.y + giant.drawn * 0.4);
    }
  }

  /**
   * A whole turn round on the spot (or `spinTurns` of them) as a giant
   * throws its ring: the pictures in GIANT_TURN, a quarter turn each. The
   * sprite is never squashed or rotated, so its body for hits stays as it is.
   */
  private spinAround(giant: EnemyGiantSpec): void {
    this.stopSpin();
    const turn = { done: 0 };
    this.spin = this.scene.tweens.add({
      targets: turn,
      done: giant.spinTurns,
      duration: giant.spinMs,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const quarter = Math.floor((turn.done % 1) * GIANT_TURN.length);
        const pose = GIANT_TURN[Math.min(quarter, GIANT_TURN.length - 1)]!;
        this.showFrame(giantFrame(this.spec.texture, pose.frame));
        this.setFlipX(pose.mirrored);
      },
      onComplete: () => {
        this.spin = undefined;
        this.setFlipX(false);
        this.showFrame(this.spec.texture);
      },
    });
  }

  private stopSpin(): void {
    this.spin?.stop();
    this.spin = undefined;
    this.setFlipX(false);
  }

  /**
   * A 기행종: a hop, a rest, a hop. A survivor within one hop is hopped at;
   * further off a hop goes anywhere, except the share aimed at them anyway.
   * It is in the air only while hopping, for as long as the distance takes
   * at its speed — so 냉각 shortens nothing, it only slows the hop.
   */
  private hopAbout(dt: number, hop: EnemyHopSpec): void {
    this.hopLeftMs -= dt;
    if (this.hopLeftMs <= 0) {
      this.hopping = !this.hopping;
      this.hopLeftMs = this.hopping ? (hop.distance / Math.max(1, this.currentSpeed)) * 1000 : hop.restMs;
      if (this.hopping) {
        const target = this.target;
        const inReach =
          target !== undefined && Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y) <= hop.distance;
        this.hopAngle =
          target && (inReach || Math.random() < hop.lungeChance)
            ? Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y)
            : Math.random() * Math.PI * 2;
      }
    }
    if (this.hopping) {
      this.scene.physics.velocityFromRotation(this.hopAngle, this.currentSpeed, (this.body as Phaser.Physics.Arcade.Body).velocity);
    } else {
      this.setVelocity(0, 0);
    }
  }

  /** True mid-hop (a 기행종 in the air). Public for tests. */
  public get isHopping(): boolean {
    return this.hopping;
  }

/**
   * Throws a ring of bolts outward on its own clock, aimed at nothing. It
   * goes off wherever the 우두머리 is and whatever it is doing, so standing
   * beside one is a decision rather than a default.
   */
  /** Throws its ring at once, whatever its clock says (a 제단's 키메라 arriving). */
  public castVolleyNow(): void {
    const volley = this.spec.volley;
    if (this.active && volley) {
      this.volleyCooldownMs = 0;
      this.throwRing(0, volley);
    }
  }

  private throwRing(delta: number, volley: EnemyVolleySpec): void {
    this.volleyCooldownMs -= delta;
    if (this.volleyCooldownMs > 0 || volley.count <= 0) {
      return;
    }

    this.volleyCooldownMs = volley.cooldownMs;
    sfx.playEnemy(this.scene, this.kind, 'cast');

    const step = (Math.PI * 2) / volley.count;
    // A different starting angle each time, or the gaps are always in the
    // same place and standing in one of them is the whole answer.
    const offset = Math.random() * step;
    for (let i = 0; i < volley.count; i++) {
      this.hooks?.fireShot(this.x, this.y, offset + i * step, {
        ...volley,
        damage: this.rollDamage(volley.damage),
      });
    }
    if (this.spec.giant) {
      this.spinAround(this.spec.giant);
    }
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

      // 연발 throws the extra bolts in a fan around the aimed one, so a
      // 사수 wearing it covers a wedge rather than a line: stepping aside
      // is still the answer, but one step is no longer enough.
      const total = 1 + this.extraShots;
      const spread = ENEMY.fanRadians * (total - 1);
      for (let i = 0; i < total; i++) {
        const offset = total === 1 ? 0 : -spread / 2 + (spread / (total - 1)) * i;
        // A rare's bolt carries its own multipliers, rolled as it leaves.
        this.hooks?.fireShot(this.x, this.y, angle + offset, {
          ...shot,
          damage: this.rollDamage(shot.damage),
        });
      }
    }

    if (distance > shot.standoff) {
      return false;
    }

    this.setVelocity(0, 0);
    return true;
  }

  /**
   * Picks where to run: away from the survivor, give or take half the arc,
   * as far as one scare carries it — and never off the edge of the world.
   */
  private startFleeing(flee: EnemyFleeSpec): void {
    const from = this.target ?? { x: this.x - 1, y: this.y };
    const away = Phaser.Math.Angle.Between(from.x, from.y, this.x, this.y);
    const angle = away + Phaser.Math.FloatBetween(-flee.arc / 2, flee.arc / 2);
    const margin = this.spec.size;
    this.fleeTo = new Phaser.Math.Vector2(
      Phaser.Math.Clamp(this.x + Math.cos(angle) * flee.distance, margin, WORLD.width - margin),
      Phaser.Math.Clamp(this.y + Math.sin(angle) * flee.distance, margin, WORLD.height - margin),
    );
  }

  /** Runs to where it was scared to, then stands still until the next hit. */
  private run(): void {
    if (!this.fleeTo) {
      this.setVelocity(0, 0);
      return;
    }

    const left = Phaser.Math.Distance.Between(this.x, this.y, this.fleeTo.x, this.fleeTo.y);
    // Close enough that the next frame would carry it past.
    if (left <= Math.max(4, (this.currentSpeed * TIMING.maxDeltaMs) / 1000)) {
      this.fleeTo = undefined;
      this.setVelocity(0, 0);
      return;
    }

    this.scene.physics.moveTo(this, this.fleeTo.x, this.fleeTo.y, this.currentSpeed);
  }

  /**
   * What makes a 도망자 impossible to miss: its colour runs round the
   * rainbow, and it breathes in and out. No ring — the colour is enough.
   */
  private shimmer(): void {
    const now = this.scene.time.now;
    const pulse = 1 + 0.12 * Math.sin(now / 140);
    this.setScale(pulse);
    if (this.flashMs <= 0 && this.chillMs <= 0) {
      const hue = (now / 1200) % 1;
      this.setTint(Phaser.Display.Color.HSVToRGB(hue, 0.55, 1).color).setTintMode(Phaser.TintModes.MULTIPLY);
    }
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
