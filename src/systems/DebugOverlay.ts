import Phaser from 'phaser';

import { COLORS, DEBUG, DEPTH, ENEMY_KINDS, TEXT, TIMING, type EnemyKind } from '@/config';
import { enemyName } from '@/i18n';
import { devToolsAllowed } from '@/systems/DevAccess';

/** Counts the overlay reads each frame. */
export interface DebugCounts {
  readonly enemies: number;
  readonly enemyPool: number;
  readonly byKind: Record<EnemyKind, number>;
  readonly rares: number;
  readonly bosses: number;
  readonly enemyShots: number;
  readonly projectiles: number;
  readonly gems: number;
  readonly drops: number;
  readonly potions: number;
  readonly damageNumbers: number;
  /** What the clock alone is doing to the field right now. */
  readonly hpScale: number;
  readonly rareChance: number;
}

/** Developer actions the overlay can trigger. */
export interface DebugActions {
  readonly counts: () => DebugCounts;
  /** Spawn a burst of enemies; returns how many actually spawned. */
  readonly stressSpawn: (count: number) => number;
  /** One of every kind, next to the player. */
  readonly spawnOneOfEach: () => number;
  readonly dropPotion: () => void;
  readonly spawnRare: () => void;
  readonly spawnBoss: () => void;
  readonly clearEnemies: () => void;
  readonly grantLevel: () => void;
  /** The main skill straight to its next 각성 (F11, for trying one). Returns what it did. */
  readonly awakenMain: () => string;
  readonly dropSkill: () => void;
  /** Returns the new state. */
  readonly toggleInvulnerable: () => boolean;
}

const KEYS = 'F1,F2,F3,F4,F5,F6,F7,F8,F9,F10,F11';

/**
 * F1 overlay: frame timings and live object counts, plus the dev keys used
 * to put the systems under load. Hidden by default and skipped entirely
 * while hidden, so it costs nothing in a normal run.
 */
export class DebugOverlay {
  private readonly scene: Phaser.Scene;
  private readonly actions: DebugActions;
  private readonly label: Phaser.GameObjects.Text;

  private shown = false;
  private invulnerable = false;
  /**
   * Whether any key here changed the run. Such a run goes on neither board:
   * a level for free or a field cleared is not a run anyone else played.
   */
  public used = false;
  private lastNote = '';

  /** Rolling frame-time window, in ms. */
  private readonly samples: number[] = [];
  private sampleAt = 0;
  private refreshMs = 0;

  public constructor(scene: Phaser.Scene, actions: DebugActions) {
    this.scene = scene;
    this.actions = actions;

    this.label = scene.add
      .text(16, 70, '', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: TEXT.size.hint,
        color: COLORS.debugText,
        backgroundColor: 'rgba(5, 7, 11, 0.72)',
        padding: { x: 8, y: 6 },
        lineSpacing: 3,
      })
      .setScrollFactor(0)
      .setDepth(DEPTH.ui)
      .setVisible(false);

    const keyboard = scene.input.keyboard;
    if (!keyboard) {
      return;
    }

    // Nothing at all for anyone not allowed the tools: not even the keys are
    // taken from the browser.
    if (!devToolsAllowed()) {
      return;
    }

    // Stop the browser acting on the function keys (F1 opens help).
    keyboard.addCapture(KEYS);
    keyboard.on('keydown-F1', this.toggle, this);
    keyboard.on('keydown-F2', this.onStress, this);
    keyboard.on('keydown-F3', this.onClear, this);
    keyboard.on('keydown-F4', this.onLevel, this);
    keyboard.on('keydown-F5', this.onDrop, this);
    keyboard.on('keydown-F6', this.onInvulnerable, this);
    keyboard.on('keydown-F7', this.onSpawnEach, this);
    keyboard.on('keydown-F8', this.onDropPotion, this);
    keyboard.on('keydown-F9', this.onSpawnRare, this);
    keyboard.on('keydown-F10', this.onSpawnBoss, this);
    keyboard.on('keydown-F11', this.onAwaken, this);
  }

  public get visible(): boolean {
    return this.shown;
  }

  /** Takes the raw, unclamped delta so the readout shows real frame cost. */
  public update(rawDelta: number): void {
    this.samples[this.sampleAt] = rawDelta;
    this.sampleAt = (this.sampleAt + 1) % DEBUG.sampleFrames;

    if (!this.shown) {
      return;
    }

    // Redraw a few times a second; the text itself is the expensive part.
    this.refreshMs -= rawDelta;
    if (this.refreshMs > 0) {
      return;
    }
    this.refreshMs = 120;

    this.label.setText(this.compose());
  }

  private compose(): string[] {
    let total = 0;
    let worst = 0;
    for (const sample of this.samples) {
      total += sample;
      if (sample > worst) {
        worst = sample;
      }
    }
    const avg = this.samples.length > 0 ? total / this.samples.length : 0;
    const c = this.actions.counts();

    return [
      `FPS ${this.scene.game.loop.actualFps.toFixed(1)}   frame ${avg.toFixed(1)}ms avg / ${worst.toFixed(1)}ms peak`,
      `delta cap ${TIMING.maxDeltaMs}ms`,
      `enemies ${c.enemies} (pool ${c.enemyPool})   projectiles ${c.projectiles}   gems ${c.gems}`,
      `  ${this.kindBreakdown(c)}   희귀 ${c.rares}   우두머리 ${c.bosses}   enemy shots ${c.enemyShots}`,
      `  난이도 체력 x${c.hpScale.toFixed(2)}   희귀 확률 ${(c.rareChance * 100).toFixed(0)}%`,
      `drops ${c.drops}   potions ${c.potions}   damage numbers ${c.damageNumbers}`,
      '',
      `F2 +${DEBUG.stressSpawnCount} enemies   F3 clear enemies   F4 level up`,
      `F5 drop skill   F6 invulnerable: ${this.invulnerable ? 'ON' : 'OFF'}`,
      `F7 one of each enemy   F8 drop potion   F9 rare   F10 boss`,
      'F11 main skill to its next awakening',
      'F1 close',
      this.lastNote,
    ];
  }

  /** "일반 12  질주 3  사수 1  거구 0" */
  private kindBreakdown(counts: DebugCounts): string {
    return (Object.keys(ENEMY_KINDS) as EnemyKind[])
      .map((kind) => `${enemyName(kind)} ${counts.byKind[kind] ?? 0}`)
      .join('  ');
  }

  private toggle(): void {
    if (!devToolsAllowed()) {
      return;
    }
    this.shown = !this.shown;
    this.label.setVisible(this.shown);
    this.refreshMs = 0;
  }

  private onStress(): void {
    if (!this.shown) {
      return;
    }
    const spawned = this.actions.stressSpawn(DEBUG.stressSpawnCount);
    this.note(`spawned ${spawned} enemies`);
  }

  private onClear(): void {
    if (!this.shown) {
      return;
    }
    this.actions.clearEnemies();
    this.note('cleared enemies');
  }

  private onLevel(): void {
    if (!this.shown) {
      return;
    }
    this.actions.grantLevel();
    this.note('granted a level');
  }

  private onAwaken(): void {
    if (!this.shown) {
      return;
    }
    this.note(this.actions.awakenMain());
  }

  private onDrop(): void {
    if (!this.shown) {
      return;
    }
    this.actions.dropSkill();
    this.note('dropped a skill');
  }

  private onSpawnEach(): void {
    if (!this.shown) {
      return;
    }
    const spawned = this.actions.spawnOneOfEach();
    this.note(`spawned ${spawned} enemies, one of each kind`);
  }

  private onDropPotion(): void {
    if (!this.shown) {
      return;
    }
    this.actions.dropPotion();
    this.note('dropped a potion');
  }

  private onSpawnRare(): void {
    if (!this.shown) {
      return;
    }
    this.actions.spawnRare();
    this.note('spawned a rare');
  }

  private onSpawnBoss(): void {
    if (!this.shown) {
      return;
    }
    this.actions.spawnBoss();
    this.note('sent in a boss');
  }

  private onInvulnerable(): void {
    if (!this.shown) {
      return;
    }
    this.invulnerable = this.actions.toggleInvulnerable();
    this.note(`invulnerable ${this.invulnerable ? 'on' : 'off'}`);
  }

  private note(message: string): void {
    this.used = true;
    this.lastNote = `> ${message}`;
    this.refreshMs = 0;
  }
}
