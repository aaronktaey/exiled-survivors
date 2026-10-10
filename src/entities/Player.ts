import Phaser from 'phaser';

import { DEPTH, PLAYER, TEXTURES } from '@/config';
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
  /** Last direction actually moved; melee swings along this. */
  public readonly facing = new Phaser.Math.Vector2(1, 0);
  private analog?: AnalogInput;
  private invulnerableUntil = 0;

  public constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEXTURES.player);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(DEPTH.player);
    this.setCollideWorldBounds(true);

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

  /** Adds a second direction source (the touch stick) beside the keyboard. */
  public attachAnalog(source: AnalogInput): void {
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
    let speed = PLAYER.speed;
    if (this.heading.lengthSq() > 0) {
      this.heading.normalize();
    } else if (this.analog) {
      speed = PLAYER.speed * this.analog.read(this.heading);
    }

    if (this.heading.lengthSq() > 0) {
      this.facing.copy(this.heading);
    }

    this.setVelocity(this.heading.x * speed, this.heading.y * speed);
  }

  public takeDamage(amount: number): void {
    const now = this.scene.time.now;
    if (!this.isAlive || now < this.invulnerableUntil) {
      return;
    }

    this.hp = Math.max(0, this.hp - amount);
    this.invulnerableUntil = now + PLAYER.invulnerableMs;

    // Blink for the duration of the i-frames.
    this.scene.tweens.add({
      targets: this,
      alpha: 0.25,
      duration: PLAYER.invulnerableMs / 6,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.setAlpha(1),
    });

    if (!this.isAlive) {
      this.setVelocity(0, 0);
      this.emit(Player.DIED);
    }
  }

  private isDown(...keys: ReadonlyArray<Phaser.Input.Keyboard.Key | undefined>): boolean {
    return keys.some((key) => key?.isDown === true);
  }
}
