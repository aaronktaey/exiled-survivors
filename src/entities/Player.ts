import Phaser from 'phaser';

import { COLORS, DEPTH, HUD, PLAYER, TEXTURES } from '@/config';
import { fill, t } from '@/i18n';
import { NO_BONUS, type GearBonus } from '@/systems/Gear';
import type { AnalogInput } from '@/systems/VirtualJoystick';

type WasdKeys = Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>;

/**
 * The survivor. Moves on WASD or the arrow keys; diagonals are normalised so
 * they are not faster than cardinal movement.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  public static readonly DIED = 'player-died';

  public hp: number = PLAYER.maxHp;

  private readonly cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private readonly wasd?: WasdKeys;
  private readonly heading = new Phaser.Math.Vector2();
  /** Thin health bar that rides just above the sprite. */
  private readonly healthBar: Phaser.GameObjects.Graphics;
  /** "Lv 4   12/20", just above that bar. */
  private readonly nameplate: Phaser.GameObjects.Text;
  /** Where the level comes from. Set once the run has its progression. */
  private level = 1;
  /** What the carried weapon is worth to this survivor. */
  private gear: GearBonus = NO_BONUS;
  private maxHpValue: number = PLAYER.maxHp;
  private analog?: AnalogInput;
  private invulnerableUntil = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.player);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(DEPTH.player);
    this.setCollideWorldBounds(true);

    this.healthBar = scene.add.graphics().setDepth(DEPTH.healthBar);
    this.nameplate = scene.add
      .text(x, y, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: HUD.nameplateSize,
        color: COLORS.text,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.healthBar);
    this.drawHealthBar();

    // Keyboard is absent on touch-only devices; movement just stays idle there.
    const keyboard = scene.input.keyboard;
    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.wasd = keyboard.addKeys('W,A,S,D') as WasdKeys;
    }
  }

  public get isAlive(): boolean {
    return this.hp > 0;
  }

  /**
   * Sets the second direction source (the touch stick or the tilt sensor)
   * beside the keyboard. Passing nothing takes it away — a run can change
   * how it is steered while it is being played.
   */
  public attachAnalog(source?: AnalogInput): void {
    this.analog = source;
  }

  public override update(): void {
    const right = this.isDown(this.cursors?.right, this.wasd?.D);
    const left = this.isDown(this.cursors?.left, this.wasd?.A);
    const down = this.isDown(this.cursors?.down, this.wasd?.S);
    const up = this.isDown(this.cursors?.up, this.wasd?.W);

    this.heading.set(Number(right) - Number(left), Number(down) - Number(up));

    // Keys win when both are live; the stick is analogue, so a partial tilt
    // moves proportionally slower.
    let speed = PLAYER.speed * this.gear.moveSpeedScale;
    if (this.heading.lengthSq() > 0) {
      this.heading.normalize();
    } else if (this.analog) {
      speed = PLAYER.speed * this.gear.moveSpeedScale * this.analog.read(this.heading);
    }

    this.setVelocity(this.heading.x * speed, this.heading.y * speed);
    this.drawHealthBar();
  }

  /** Full health: what balance.ts tunes, after the carried weapon. */
  public get maxHp(): number {
    return this.maxHpValue;
  }

  /** Chance one of this survivor's hits lands for the crit multiplier. */
  public get critChance(): number {
    return Math.min(1, PLAYER.critChance + this.gear.critChance);
  }

  /** How far a gem has to be before it starts drifting over. */
  public get pickupRadius(): number {
    return PLAYER.pickupRadius * this.gear.pickupScale;
  }

  /**
   * Reads the carried weapon into the survivor. Health is rescaled rather
   * than topped up, so a weapon with 거대 on it starts the run at the fuller
   * bar it earns.
   */
  public applyGear(bonus: GearBonus): void {
    this.gear = bonus;
    this.maxHpValue = Math.max(1, Math.round(PLAYER.maxHp * bonus.maxHpScale));
    this.hp = this.maxHpValue;
    this.drawHealthBar();
  }

  /** Keeps the nameplate's level in step with progression. */
  public setLevel(level: number): void {
    this.level = level;
    this.drawHealthBar();
  }

  /** Debug switch: holds i-frames open indefinitely. */
  public setInvulnerable(on: boolean): void {
    this.invulnerableUntil = on ? Number.MAX_SAFE_INTEGER : 0;
  }

  /** Tops health back up, never past the maximum. */
  public heal(amount: number): number {
    if (!this.isAlive) {
      return 0;
    }

    const before = this.hp;
    this.hp = Math.min(this.maxHpValue, this.hp + amount);
    this.drawHealthBar();
    return this.hp - before;
  }

  public takeDamage(amount: number): void {
    const now = this.scene.time.now;
    if (!this.isAlive || now < this.invulnerableUntil) {
      return;
    }

    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableUntil = now + PLAYER.invulnerableMs * this.gear.invulnerableScale;

    // Blink for the duration of the i-frames.
    this.scene.tweens.add({
      targets: this,
      alpha: 0.25,
      duration: (PLAYER.invulnerableMs * this.gear.invulnerableScale) / 6,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.setAlpha(1),
    });

    this.drawHealthBar();

    if (!this.isAlive) {
      this.setVelocity(0, 0);
      this.emit(Player.DIED);
    }
  }

  private drawHealthBar(): void {
    const { width, height, gap } = HUD.healthBar;
    const left = this.x - width / 2;
    const top = this.y - PLAYER.size / 2 - gap - height;
    const ratio = Phaser.Math.Clamp(this.hp / this.maxHpValue, 0, 1);

    this.healthBar.clear();
    this.healthBar.fillStyle(COLORS.barTrack, 1);
    this.healthBar.fillRect(left, top, width, height);

    if (ratio > 0) {
      this.healthBar.fillStyle(COLORS.hpFill, 1);
      this.healthBar.fillRect(left, top, width * ratio, height);
    }

    const copy = t().hud;
    this.nameplate.setText(
      `${fill(copy.level, { level: this.level })}  ${this.hp}/${this.maxHpValue}`,
    );
    this.nameplate.setPosition(this.x, top - HUD.nameplateGap);
  }

  public override destroy(fromScene?: boolean): void {
    this.nameplate.destroy(fromScene);
    this.healthBar.destroy(fromScene);
    super.destroy(fromScene);
  }

  private isDown(...keys: ReadonlyArray<Phaser.Input.Keyboard.Key | undefined>): boolean {
    return keys.some((key) => key?.isDown === true);
  }
}
