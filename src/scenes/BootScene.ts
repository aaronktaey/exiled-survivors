import Phaser from 'phaser';

import {
  ACCOUNT,
  ALL_BONES,
  ALL_ORBS,
  AUDIO,
  COLORS,
  ENEMY_KINDS,
  giantFrame,
  GEAR_DROP,
  ICONS,
  PIXEL_ICON_SCALE,
  PIXEL_ICONS,
  GEAR,
  SKILL_ICONS,
  POISON_NOVA_FX,
  gearTexture,
  SKILL_PICK,
  RANKING,
  ROLLBACK_GIFT,
  PLAYER,
  SHOTS,
  TERRAIN,
  TEXTURES,
  PLAYER_LOOK,
  VOID_VORTEX_FX,
  VOID_ORB_FX,
  TALENT_SHARD_FX,
  ENEMY_SHOT_FX,
  ENEMY_WALK_STEPS,
  enemyWalk,
  fineTexture,
  MONSTER_ERAS,
  UNKNOWN_RUNE_LOOKS,
  enemyPose,
  unknownRuneTexture,
  LOOK_ANIM,
  LOOK_CANVAS,
  LOOK_POSES,
  lookAnim,
  lookFrame,
  type LookPose,
  type PlayerLook,
  VOID_ORB,
} from '@/config';
import { MENU, SCENES } from '@/config';
import type { EnemyKindSpec, PixelIcon, PixelIconId } from '@/config';
import { createGlowLogoTexture } from '@/systems/PixelFont';
import { sfx } from '@/systems/Sfx';
import { paintEraTextures } from '@/systems/MonsterArt';
import { pixelateOn, pixelateWorld } from '@/systems/Pixelate';


const GRID_TILE = 64;

/**
 * Loads assets needed before gameplay starts, then hands off to GameScene.
 * There is no art yet, so the placeholder textures are drawn at runtime.
 */
export class BootScene extends Phaser.Scene {
  public static readonly KEY = 'BootScene';

  public constructor() {
    super(BootScene.KEY);
  }

  public preload(): void {
    const base = import.meta.env.BASE_URL;

    // Two tiers may share a clip: each file is loaded once.
    const dropKeys = new Set<string>();
    for (const clip of Object.values(AUDIO.drops)) {
      if (clip && !dropKeys.has(clip.key)) {
        dropKeys.add(clip.key);
        this.load.audio(clip.key, `${base}${clip.file}`);
      }
    }
    sfx.preload(this);
  }

  public create(): void {
    this.createPixelIcons();
    this.createGridTexture();
    this.createSquareTexture(TEXTURES.player, PLAYER.size, COLORS.player);
    for (const kind of Object.values(ENEMY_KINDS)) {
      if (kind.flashy) {
        this.createFlashyTexture(kind.texture, kind.size);
        this.createFlashyTexture(fineTexture(kind.texture), kind.size * MONSTER_ERAS.flashyResolution);
      } else if (kind.giant) {
        this.createGiantTextures(kind.texture, kind.giant.drawn, kind.color);
      } else if (kind.id === 'chimera') {
        this.createChimeraTexture(kind.texture, kind.drawn ?? kind.size);
      } else if (kind.walk) {
        this.createWalkerTextures(kind);
      } else if (kind.hop) {
        this.createHopperTextures(kind);
      } else {
        this.createSquareTexture(kind.texture, kind.size, kind.color);
      }
    }
    this.createEnemyShotTexture();
    this.createThornTexture();
    this.createVoidOrbTexture();
    this.createGearTexture();
    this.createDivineShardTexture();
    this.createPassiveTexture();
    this.createOrbTextures();
    this.createBoneTextures();
    this.createAltarTexture();
    this.createThunderIcon();
    this.createPoisonNovaIcon();
    this.createStrikeIcon();
    this.createTrophyTexture();
    this.createWebIcon();
    this.createDailyRulesIcon();
    this.createCelebrateTextures();
    this.createFlagTextures();
    this.createLookTextures();
    // 시대별 몬스터 (0.146): painted only where they can be worn.
    if (!MONSTER_ERAS.devOnly || import.meta.env.DEV) {
      paintEraTextures(this);
    }
    this.createDroneTextures();
    this.createVortexTexture();
    this.createMangoTexture();
    this.createMagnetTexture();
    this.createOreTexture();
    this.createLockTexture();
    this.createUnknownRuneTextures();
    this.createTalentShardTexture();
    this.createTalentLumpTexture();
    this.createLightPillarTexture();
    this.createGlowTexture();
    this.createAccountTexture();
    this.createFilterTexture();
    this.createTuningTexture();
    this.createMenuIconTextures();
    // One dot size on the field (0.146): the rest re-drawn to the monsters' dot.
    if (pixelateOn()) {
      pixelateWorld(this);
    }


    // Nox Survivors (0.158): NOX three times over, SURVIVORS under it, glowing.
    createGlowLogoTexture(this, TEXTURES.logo, [{ text: 'NOX', scale: 3 }, { text: 'SURVIVORS', scale: 1 }], {
      pixel: MENU.logoPixel,
      face: COLORS.logo,
      lower: COLORS.logoLower,
      shade: COLORS.logoShadow,
      outline: COLORS.logoOutline,
      glow: MENU.logoGlow,
      pad: MENU.logoGlowPad,
    });

    this.paintAdColumns();

    // Dev-only shortcut past the title, so the integration harness can drive
    // a run without clicking through the menu first.
    const skipMenu = import.meta.env.DEV && window.location.hash === '#run';
    const harness = (window as { __harness?: boolean }).__harness === true;
    if (import.meta.env.DEV && (skipMenu || harness)) {
      // The test harness (it marks the page) and `#run` both want to be in
      // play at once, and a reel waiting for 확정 would freeze every run
      // they start — from the title as much as from `#run`.
      (SKILL_PICK as { atRunStart: boolean }).atRunStart = false;
      // And the end of a run does not stop to ask for a name.
      (RANKING as { promptOnDeath: boolean }).promptOnDeath = false;
      // And never touches the shared board: a test run must not land on the
      // ranking every player sees. test-ranking points it at a stand-in, and
      // test-account keeps it on (window.__sharedOn) behind one of its own.
      if (!(window as { __sharedOn?: boolean }).__sharedOn) {
        (RANKING.shared as { enabled: boolean }).enabled = false;
      }
      // And gives no 0.80 gift: it would fill every suite's stash. test-gift
      // turns it on (window.__giftOn).
      if (!(window as { __giftOn?: boolean }).__giftOn) {
        ROLLBACK_GIFT.enabled = false;
      }
    }
    if (import.meta.env.DEV && (skipMenu || harness)) {
      // And no sign-in: the dev server has no /api of its own unless
      // `wrangler dev` is running, and a suite expects the title as it was.
      // test-account keeps it on (window.__accountOn) behind a stand-in server.
      if (!(window as { __accountOn?: boolean }).__accountOn) {
        (ACCOUNT as { enabled: boolean }).enabled = false;
      }
    }
    if (import.meta.env.DEV && harness && !(window as { __terrainOn?: boolean }).__terrainOn) {
      // A suite places enemies by hand and walks the survivor about; a rock
      // in the way would move them. test-terrain keeps them (window.__terrainOn).
      (TERRAIN as { enabled: boolean }).enabled = false;
    }
    if (import.meta.env.DEV) {
      // Turnstile only knows the real domain, and `wrangler dev` has no secret
      // to check a token with — so on the dev server nothing is asked for.
      (RANKING.shared as { turnstileSiteKey: string }).turnstileSiteKey = '';
    }
    this.scene.start(skipMenu ? SCENES.game : SCENES.menu);
  }

  /**
   * The pillar a 희귀 drop stands in: white, brightest at its foot and
   * fading to nothing at its top, soft at both sides. Drawn once on a canvas
   * because a graphics path has no gradients.
   */
  private createLightPillarTexture(): void {
    const width = 64;
    const height = 256;
    const texture = this.textures.createCanvas(TEXTURES.lightPillar, width, height);
    const ctx = texture?.getContext();
    if (!texture || !ctx) {
      return;
    }

    const up = ctx.createLinearGradient(0, height, 0, 0);
    up.addColorStop(0, 'rgba(255,255,255,1)');
    up.addColorStop(0.15, 'rgba(255,255,255,0.85)');
    up.addColorStop(0.6, 'rgba(255,255,255,0.35)');
    up.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = up;
    ctx.fillRect(0, 0, width, height);

    // Then keep only a soft band down the middle.
    ctx.globalCompositeOperation = 'destination-in';
    const across = ctx.createLinearGradient(0, 0, width, 0);
    across.addColorStop(0, 'rgba(0,0,0,0)');
    across.addColorStop(0.3, 'rgba(0,0,0,0.7)');
    across.addColorStop(0.5, 'rgba(0,0,0,1)');
    across.addColorStop(0.7, 'rgba(0,0,0,0.7)');
    across.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = across;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'source-over';
    texture.refresh();
  }

  /** The 계정 icon: a head over a pair of shoulders, in the menu's own pale colour. */
  private createAccountTexture(): void {
    const size = 48;
    const g = this.add.graphics();
    g.fillStyle(COLORS.textFill, 1);
    g.fillCircle(size / 2, size * 0.36, size * 0.17);
    g.fillRoundedRect(size * 0.2, size * 0.6, size * 0.6, size * 0.3, { tl: size * 0.3, tr: size * 0.3, bl: 4, br: 4 });
    g.generateTexture(TEXTURES.account, size, size);
    g.destroy();
  }

  /** The 밸런스 icon: a dial, its pointer turned up and to the right. */
  private createTuningTexture(): void {
    const size = 48;
    const half = size / 2;
    const g = this.add.graphics();
    g.lineStyle(4, COLORS.textFill, 1);
    g.beginPath();
    g.arc(half, half, size * 0.36, Math.PI * 0.75, Math.PI * 2.25, false);
    g.strokePath();
    g.fillStyle(COLORS.textFill, 1);
    g.fillCircle(half, half, size * 0.1);
    g.lineStyle(4, COLORS.textFill, 1);
    g.lineBetween(half, half, half + size * 0.22, half - size * 0.2);
    g.generateTexture(TEXTURES.tuning, size, size);
    g.destroy();
  }

  /**
   * 설정, 게임 가이드 and 패치노트 as title icons (0.150, the user's ask: rows
   * on the menu before) — a cog, a closed book, a page of notes, in the
   * menu's own pale colour like the rest of the corner.
   */
  private createMenuIconTextures(): void {
    const size = 48;
    const half = size / 2;
    const pale = COLORS.textFill;

    // 설정: a cog with a hole through it, drawn on a canvas so the hole can be cut.
    const cog = this.textures.createCanvas(TEXTURES.settings, size, size);
    const ctx = cog?.getContext();
    if (cog && ctx) {
      ctx.fillStyle = `#${pale.toString(16).padStart(6, '0')}`;
      const teeth = 8;
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        ctx.save();
        ctx.translate(half, half);
        ctx.rotate(a);
        ctx.fillRect(size * 0.22, -size * 0.065, size * 0.2, size * 0.13);
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(half, half, size * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(half, half, size * 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      cog.refresh();
    }

    // 게임 가이드: a closed book, its spine on the left and a ribbon hanging out.
    let g = this.add.graphics();
    g.fillStyle(pale, 1);
    g.fillRoundedRect(size * 0.2, size * 0.12, size * 0.6, size * 0.74, 4);
    g.fillStyle(0x8a8478, 1);
    g.fillRect(size * 0.2, size * 0.12, size * 0.1, size * 0.74);
    g.fillRect(size * 0.36, size * 0.3, size * 0.34, size * 0.05);
    g.fillRect(size * 0.36, size * 0.4, size * 0.26, size * 0.05);
    g.fillStyle(COLORS.dailyFill, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(size * 0.6, size * 0.86),
        new Phaser.Math.Vector2(size * 0.7, size * 0.86),
        new Phaser.Math.Vector2(size * 0.7, size * 0.98),
        new Phaser.Math.Vector2(size * 0.65, size * 0.93),
        new Phaser.Math.Vector2(size * 0.6, size * 0.98),
      ],
      true,
    );
    g.generateTexture(TEXTURES.guide, size, size);
    g.destroy();

    // 패치노트: a page with its corner folded down and lines of writing.
    g = this.add.graphics();
    g.fillStyle(pale, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(size * 0.22, size * 0.1),
        new Phaser.Math.Vector2(size * 0.62, size * 0.1),
        new Phaser.Math.Vector2(size * 0.8, size * 0.28),
        new Phaser.Math.Vector2(size * 0.8, size * 0.9),
        new Phaser.Math.Vector2(size * 0.22, size * 0.9),
      ],
      true,
    );
    g.fillStyle(0x8a8478, 1);
    g.fillTriangle(size * 0.62, size * 0.1, size * 0.62, size * 0.28, size * 0.8, size * 0.28);
    for (const [y, w] of [[0.42, 0.44], [0.54, 0.44], [0.66, 0.44], [0.78, 0.28]] as const) {
      g.fillRect(size * 0.3, size * y, size * w, size * 0.045);
    }
    g.generateTexture(TEXTURES.patchNotes, size, size);
    g.destroy();
  }

  /** The 아이템 필터 icon: a funnel, in the menu's own pale colour. */
  private createFilterTexture(): void {
    const size = 48;
    const g = this.add.graphics();
    g.fillStyle(COLORS.textFill, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(size * 0.12, size * 0.16),
        new Phaser.Math.Vector2(size * 0.88, size * 0.16),
        new Phaser.Math.Vector2(size * 0.58, size * 0.52),
        new Phaser.Math.Vector2(size * 0.58, size * 0.84),
        new Phaser.Math.Vector2(size * 0.42, size * 0.74),
        new Phaser.Math.Vector2(size * 0.42, size * 0.52),
      ],
      true,
    );
    g.generateTexture(TEXTURES.filter, size, size);
    g.destroy();
  }

  /** A soft white dot: light that gathers, shines and bursts is made of it. */
  private createGlowTexture(): void {
    const size = 64;
    const texture = this.textures.createCanvas(TEXTURES.glow, size, size);
    const ctx = texture?.getContext();
    if (!texture || !ctx) {
      return;
    }

    const glow = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    glow.addColorStop(0, 'rgba(255,255,255,1)');
    glow.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    texture.refresh();
  }

  /** One tile of the arena floor, repeated by a TileSprite. */
  private createGridTexture(): void {
    const graphics = this.add.graphics();

    graphics.fillStyle(0x0f131b, 1);
    graphics.fillRect(0, 0, GRID_TILE, GRID_TILE);
    graphics.lineStyle(1, COLORS.grid, 1);
    graphics.strokeRect(0.5, 0.5, GRID_TILE - 1, GRID_TILE - 1);

    graphics.generateTexture(TEXTURES.grid, GRID_TILE, GRID_TILE);
    graphics.destroy();
  }

  private createSquareTexture(key: string, size: number, color: number): void {
    const graphics = this.add.graphics();

    graphics.fillStyle(color, 1);
    graphics.fillRect(0, 0, size, size);

    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  /**
   * 키메라, facing right: a lion's body and maned head, a goat's horns on
   * top, and a serpent for a tail coiling up behind.
   */
  /**
   * A 키메라 in each pose (EnemyKindSpec.poses), facing right on a square
   * `size` across: standing; mid-leap — body up, legs tucked, tail streaming,
   * a shadow left on the ground under it; and casting — reared, mane bristling
   * with thorns, jaws open. Drawn in 30 units, set in a 36-unit square, scaled.
   */
  private createChimeraTexture(key: string, size: number): void {
    for (const pose of ['stand', 'leap', 'cast'] as const) {
      const g = this.add.graphics();
      // The 30-unit figure with room round it (horns up in a leap, thorns out in a cast).
      const k = size / 36;
      g.translateCanvas(3 * k, 5 * k);
      this.drawChimera(g, k, pose);
      g.generateTexture(enemyPose(key, pose), size, size);
      g.destroy();
    }
  }

  private drawChimera(g: Phaser.GameObjects.Graphics, k: number, pose: 'stand' | 'leap' | 'cast'): void {
    const leap = pose === 'leap';
    const cast = pose === 'cast';
    const lift = leap ? 5 : 0;
    const rear = cast ? 3 : 0;
    // A shadow on the ground while it is in the air.
    if (leap) {
      g.fillStyle(0x000000, 0.35);
      g.fillEllipse(15 * k, 28 * k, 16 * k, 3.5 * k);
    }
    // The serpent tail, behind everything else — streaming back in a leap, raised in a cast.
    g.lineStyle(3.2 * k, COLORS.chimeraTail, 1);
    g.beginPath();
    g.moveTo(7 * k, (19 - lift) * k);
    if (leap) {
      g.lineTo(2 * k, (16 - lift) * k);
      g.lineTo(0.5 * k, (12 - lift) * k);
      g.lineTo(2.5 * k, (9 - lift) * k);
    } else {
      g.lineTo(3 * k, (15 - rear) * k);
      g.lineTo(3.5 * k, (9 - rear * 1.5) * k);
      g.lineTo(6.5 * k, (6 - rear * 1.5) * k);
    }
    g.strokePath();
    const tailHead = leap ? [3.5, 8 - lift] : [8, 5.5 - rear * 1.5];
    g.fillStyle(COLORS.chimeraTail, 1);
    g.fillEllipse(tailHead[0]! * k, tailHead[1]! * k, 5.5 * k, 4 * k);
    g.fillStyle(0xffe066, 1);
    g.fillCircle((tailHead[0]! + 1) * k, (tailHead[1]! - 0.5) * k, 0.8 * k);
    // Legs — tucked under in a leap, braced in a cast — then the body over them.
    const legs = Phaser.Display.Color.ValueToColor(COLORS.enemyChimera).darken(30).color;
    g.fillStyle(legs, 1);
    for (const x of [8, 12, 18, 22]) {
      if (leap) {
        const back = x < 15;
        g.fillRoundedRect((x - 1.6 + (back ? -1.5 : 1.5)) * k, (20 - lift) * k, 3.2 * k, 4.5 * k, 1.2 * k);
      } else {
        const brace = cast && x > 15 ? 1.2 : 0;
        g.fillRoundedRect((x - 1.6 + brace) * k, 20 * k, 3.2 * k, 8 * k, 1.2 * k);
      }
    }
    g.fillStyle(COLORS.enemyChimera, 1);
    g.fillEllipse(15 * k, (19 - lift - rear * 0.5) * k, 20 * k, 11 * k);
    // The mane, the head in it, and the horns over both.
    const hx = 21.5 + (leap ? 1 : 0);
    const hy = 12.5 - lift - rear;
    if (cast) {
      // Bristling: thorns out of the mane all round.
      g.fillStyle(COLORS.thorn, 1);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const r1 = 6.5;
        const r2 = 11;
        g.fillTriangle(
          (hx + Math.cos(a - 0.18) * r1) * k, (hy + Math.sin(a - 0.18) * r1) * k,
          (hx + Math.cos(a + 0.18) * r1) * k, (hy + Math.sin(a + 0.18) * r1) * k,
          (hx + Math.cos(a) * r2) * k, (hy + Math.sin(a) * r2) * k,
        );
      }
    }
    g.fillStyle(COLORS.chimeraMane, 1);
    g.fillCircle(hx * k, hy * k, (cast ? 8.3 : 7.5) * k);
    g.fillStyle(COLORS.enemyChimera, 1);
    g.fillCircle((hx + 1.5) * k, (hy + 0.5) * k, 4.6 * k);
    g.fillStyle(COLORS.thorn, 1);
    g.fillTriangle((hx - 4) * k, (hy - 5.5) * k, (hx - 1.5) * k, (hy - 6.5) * k, (hx - 6) * k, (hy - 11.5) * k);
    g.fillTriangle((hx + 0.5) * k, (hy - 6.5) * k, (hx + 3) * k, (hy - 5.5) * k, (hx + 4) * k, (hy - 12) * k);
    g.fillStyle(0xd23b2a, 1);
    g.fillCircle((hx + 3.5) * k, (hy - 0.5) * k, 1 * k);
    if (cast) {
      // Jaws open, roaring.
      g.fillStyle(0x3a0d0d, 1);
      g.fillTriangle((hx + 3.5) * k, (hy + 1.5) * k, (hx + 7.5) * k, (hy + 0.5) * k, (hx + 7) * k, (hy + 4.5) * k);
    } else {
      g.fillStyle(COLORS.chimeraMane, 1);
      g.fillTriangle((hx + 4.5) * k, (hy + 2.5) * k, (hx + 7) * k, (hy + 1.5) * k, (hx + 5) * k, (hy + 4) * k);
    }
  }

  /**
   * The four walkers (0.99, the user's ask: plain squares before), facing
   * right on a square `drawn` across: standing, the ENEMY_WALK_STEPS
   * pictures of the stride (`enemyWalk`), and — for a kind with `poses`, the
   * 사수 — the draw (`enemyPose(texture, 'cast')`). Drawn in 32 units, scaled.
   */
  private createWalkerTextures(kind: EnemyKindSpec): void {
    const size = kind.drawn ?? kind.size;
    const k = size / 32;
    const frames: { key: string; step: number | null; cast: boolean }[] = [{ key: kind.texture, step: null, cast: false }];
    for (let step = 0; step < ENEMY_WALK_STEPS; step++) {
      frames.push({ key: enemyWalk(kind.texture, step), step, cast: false });
    }
    if (kind.poses) {
      frames.push({ key: enemyPose(kind.texture, 'cast'), step: null, cast: true });
    }
    for (const frame of frames) {
      const g = this.add.graphics();
      // Legs forward and back, and the body up a little as they pass.
      const swing = frame.step === null ? 0 : [1, 0, -1, 0][frame.step % 4]!;
      const passing = frame.step !== null && frame.step % 2 === 1;
      this.paintWalker(kind, g, k, { swing, passing, cast: frame.cast, leap: false });
      g.generateTexture(frame.key, size, size);
      g.destroy();
    }
  }

  /**
   * A hopper that is not the 키메라 (the 기행종, 0.101): standing — crouched
   * — and its leap (`enemyPose(texture, 'leap')`), on a square `drawn` across.
   */
  private createHopperTextures(kind: EnemyKindSpec): void {
    const size = kind.drawn ?? kind.size;
    const k = size / 32;
    for (const leap of [false, true]) {
      const g = this.add.graphics();
      this.paintWalker(kind, g, k, { swing: 0, passing: false, cast: false, leap });
      g.generateTexture(leap ? enemyPose(kind.texture, 'leap') : kind.texture, size, size);
      g.destroy();
    }
  }

  private paintWalker(
    kind: EnemyKindSpec,
    g: Phaser.GameObjects.Graphics,
    k: number,
    gait: { readonly swing: number; readonly passing: boolean; readonly cast: boolean; readonly leap: boolean },
  ): void {
    const base = kind.color;
    const dark = Phaser.Display.Color.ValueToColor(base).darken(30).color;
    const light = Phaser.Display.Color.ValueToColor(base).lighten(18).color;
    const line = (w: number, color: number, x1: number, y1: number, x2: number, y2: number): void => {
      g.lineStyle(w * k, color, 1);
      g.lineBetween(x1 * k, y1 * k, x2 * k, y2 * k);
      // Round the ends, so a limb is not cut square.
      g.fillStyle(color, 1);
      g.fillCircle(x1 * k, y1 * k, (w / 2) * k);
      g.fillCircle(x2 * k, y2 * k, (w / 2) * k);
    };
    const shadow = (w: number): void => {
      g.fillStyle(0x000000, 0.3);
      g.fillEllipse(16 * k, 30 * k, w * k, 3 * k);
    };
    const { swing } = gait;
    switch (kind.id) {
      case 'grunt': {
        // 일반: a hunched ghoul, head low and forward, claws reaching.
        const b = gait.passing ? -1 : 0;
        shadow(14);
        line(3.2, dark, 14, 21 + b, 14 - 3.5 * swing, 29);
        line(2.6, dark, 18, 13 + b, 23 + 1.5 * swing, 19 + b);
        g.fillStyle(base, 1);
        g.fillEllipse(15 * k, (17 + b) * k, 12 * k, 11 * k);
        // The ridge of its back.
        g.fillStyle(dark, 1);
        for (const [x, y] of [[10, 14], [12.5, 12], [15, 11]] as const) {
          g.fillTriangle((x - 1.4) * k, (y + 1.5 + b) * k, (x + 1.4) * k, (y + 1.5 + b) * k, (x - 0.5) * k, (y - 1.5 + b) * k);
        }
        line(3.2, base, 17, 21 + b, 17 + 3.5 * swing, 29);
        line(2.6, light, 19, 14 + b, 25 - 1.5 * swing, 18 + b);
        g.lineStyle(0.8 * k, 0xf2e6d0, 1);
        for (const dy of [-1, 0.2, 1.4]) {
          const hx = 25 - 1.5 * swing;
          g.lineBetween((hx + 0.5) * k, (18 + dy + b) * k, (hx + 2.4) * k, (18 + dy * 1.4 + b) * k);
        }
        g.fillStyle(light, 1);
        g.fillCircle(21.5 * k, (10 + b) * k, 4.6 * k);
        g.fillStyle(dark, 1);
        g.fillTriangle(18.5 * k, (7.5 + b) * k, 20.5 * k, (6.5 + b) * k, 17 * k, (3 + b) * k);
        g.fillStyle(0xffe066, 1);
        g.fillCircle(23.4 * k, (9.2 + b) * k, 1.2 * k);
        g.fillStyle(0x3a0d0d, 1);
        g.fillTriangle(22.5 * k, (12 + b) * k, 26 * k, (11.3 + b) * k, 25 * k, (13.4 + b) * k);
        break;
      }
      case 'shooter': {
        // 사수: a goblin with a long ear, a pointed nose and a bow — drawn to its cheek in the cast.
        const b = gait.passing ? -1 : 0;
        const leather = 0x6b4a2b;
        shadow(12);
        line(2.6, dark, 14.5, 23 + b, 14.5 - 3 * swing, 29);
        g.fillStyle(leather, 1);
        g.fillRoundedRect(10.5 * k, (14.5 + b) * k, 10 * k, 9.5 * k, 2.5 * k);
        g.fillStyle(0x3a2614, 1);
        g.fillRect(10.5 * k, (20 + b) * k, 10 * k, 1.6 * k);
        line(2.6, dark, 17.5, 23 + b, 17.5 + 3 * swing, 29);
        // Head, ear back, nose forward, a red eye.
        g.fillStyle(base, 1);
        g.fillTriangle(12.5 * k, (8.5 + b) * k, 7 * k, (5 + b) * k, 13 * k, (11.5 + b) * k);
        g.fillCircle(16 * k, (10 + b) * k, 5 * k);
        g.fillTriangle(20.2 * k, (9.5 + b) * k, 24.5 * k, (11.8 + b) * k, 20.2 * k, (12.4 + b) * k);
        g.fillStyle(0xff4040, 1);
        g.fillCircle(18.6 * k, (8.9 + b) * k, 1.1 * k);
        const wood = 0x8a5a2b;
        if (gait.cast) {
          // The draw: bow out front, string back to the cheek, an arrow on it.
          g.lineStyle(1.6 * k, wood, 1);
          g.beginPath();
          g.arc(19 * k, 16 * k, 7.5 * k, -1.15, 1.15, false);
          g.strokePath();
          const top = [19 + Math.cos(-1.15) * 7.5, 16 + Math.sin(-1.15) * 7.5];
          const bottom = [19 + Math.cos(1.15) * 7.5, 16 + Math.sin(1.15) * 7.5];
          g.lineStyle(0.6 * k, 0xe8e0c8, 1);
          g.lineBetween(top[0]! * k, top[1]! * k, 14 * k, 16 * k);
          g.lineBetween(bottom[0]! * k, bottom[1]! * k, 14 * k, 16 * k);
          line(1, 0xe8e0c8, 14, 16, 28, 16);
          g.fillStyle(COLORS.enemyShot, 1);
          g.fillTriangle(27 * k, 14.6 * k, 30.5 * k, 16 * k, 27 * k, 17.4 * k);
          line(2.2, base, 15, 17, 14, 16);
          line(2.2, base, 17, 17, 26, 16);
        } else {
          // Carried upright before it, swinging a little with the stride.
          const bx = 21 + 0.6 * swing;
          g.lineStyle(1.6 * k, wood, 1);
          g.beginPath();
          g.arc((bx - 3) * k, (17 + b) * k, 7 * k, -1.1, 1.1, false);
          g.strokePath();
          g.lineStyle(0.6 * k, 0xe8e0c8, 1);
          g.lineBetween((bx - 3 + Math.cos(-1.1) * 7) * k, (17 + b + Math.sin(-1.1) * 7) * k, (bx - 3 + Math.cos(1.1) * 7) * k, (17 + b + Math.sin(1.1) * 7) * k);
          line(2.2, base, 17, 17 + b, bx + 2.5, 17 + b);
        }
        break;
      }
      case 'runner': {
        // 질주: a lean jackal at the gallop — stretched out, then gathered under.
        const b = swing > 0 ? -1.5 : swing < 0 ? 0.5 : 0;
        const feetY = swing > 0 ? 27 : 28.5;
        shadow(16);
        line(2, dark, 7, 17 + b, 3, 12 + b - swing);
        // The far legs, a little behind the near ones.
        line(1.8, dark, 11, 20 + b, 11 - 2 * swing + 1, feetY);
        line(1.8, dark, 21, 20 + b, 21 + 2 * swing - 1, feetY);
        g.fillStyle(base, 1);
        g.fillEllipse(15.5 * k, (18 + b) * k, 17 * k, 7 * k);
        g.fillStyle(light, 1);
        g.fillEllipse(16 * k, (20 + b) * k, 10 * k, 2.6 * k);
        line(2, base, 10, 20 + b, 10 - 4 * swing, feetY);
        line(2, base, 22, 20 + b, 22 + 4 * swing, feetY);
        // Neck, head, snout, ear.
        line(3, base, 21, 17 + b, 24, 14 + b);
        g.fillStyle(base, 1);
        g.fillEllipse(24.5 * k, (13.5 + b) * k, 7 * k, 5 * k);
        g.fillStyle(light, 1);
        g.fillTriangle(26.5 * k, (12.5 + b) * k, 31 * k, (15 + b) * k, 26.5 * k, (16 + b) * k);
        g.fillStyle(dark, 1);
        g.fillTriangle(22.5 * k, (12 + b) * k, 23.2 * k, (6.5 + b) * k, 25.6 * k, (11.6 + b) * k);
        g.fillStyle(0x2a1a08, 1);
        g.fillCircle(30.6 * k, (14.8 + b) * k, 0.8 * k);
        g.fillStyle(0xfff2b0, 1);
        g.fillCircle(25.8 * k, (12.8 + b) * k, 0.9 * k);
        break;
      }
      case 'brute': {
        // 거구: a troll, all shoulders and fists, a little head sunk between them.
        const b = gait.passing ? -1.2 : 0;
        shadow(22);
        line(4.6, dark, 12.5, 23 + b, 12.5 - 2.5 * swing, 29.5);
        line(4.4, dark, 12, 13 + b, 11 + 2.5 * swing, 25 + b);
        g.fillStyle(dark, 1);
        g.fillCircle((11 + 2.5 * swing) * k, (25.5 + b) * k, 3 * k);
        g.fillStyle(base, 1);
        g.fillEllipse(15.5 * k, (17 + b) * k, 20 * k, 15 * k);
        g.fillStyle(light, 1);
        g.fillEllipse(17 * k, (20 + b) * k, 10 * k, 7 * k);
        g.fillStyle(0x4a2a1a, 1);
        g.fillRect(9 * k, (21.5 + b) * k, 13 * k, 3 * k);
        line(4.6, base, 18.5, 23 + b, 18.5 + 2.5 * swing, 29.5);
        // Head forward, low brow, a yellow eye, a tusk.
        g.fillStyle(base, 1);
        g.fillCircle(21.5 * k, (9.5 + b) * k, 4.3 * k);
        g.fillStyle(dark, 1);
        g.fillRect(19.5 * k, (7 + b) * k, 6 * k, 1.6 * k);
        g.fillStyle(0xffe066, 1);
        g.fillCircle(23.4 * k, (9.4 + b) * k, 1.1 * k);
        g.fillStyle(0xf4efe0, 1);
        g.fillTriangle(23 * k, (12.4 + b) * k, 24.2 * k, (10.4 + b) * k, 24.8 * k, (12.8 + b) * k);
        // The near arm last, over the body, swinging against the near leg.
        line(4.6, light, 19.5, 13.5 + b, 21.5 - 2.5 * swing, 25 + b);
        g.fillStyle(light, 1);
        g.fillCircle((21.5 - 2.5 * swing) * k, (25.5 + b) * k, 3.2 * k);
        break;
      }
      case 'erratic': {
        // 기행종: lanky and lopsided — one eye far too big, a grin too wide —
        // crouched on knees that bend the wrong way, knuckles on the ground;
        // in the leap it is all stretched out, a small shadow left below.
        if (gait.leap) {
          g.fillStyle(0x000000, 0.25);
          g.fillEllipse(16 * k, 30 * k, 9 * k, 2 * k);
          line(2.2, dark, 12, 15, 4, 20);
          line(2.2, dark, 14, 15, 6, 23);
          g.fillStyle(base, 1);
          g.fillEllipse(15 * k, 13 * k, 13 * k, 7.5 * k);
          line(2, dark, 18, 11, 28, 7);
          line(2, light, 19, 12, 29, 11);
          g.fillStyle(light, 1);
          g.fillCircle(23 * k, 7 * k, 4.6 * k);
          g.fillStyle(0xffffff, 1);
          g.fillCircle(24.5 * k, 5.6 * k, 1.9 * k);
          g.fillStyle(0x16081f, 1);
          g.fillCircle(25 * k, 5.6 * k, 0.9 * k);
          g.fillStyle(0xffffff, 1);
          g.fillCircle(21.4 * k, 5.2 * k, 0.8 * k);
          g.fillStyle(0x2a0d3a, 1);
          g.fillEllipse(24.5 * k, 9.2 * k, 5.5 * k, 2.4 * k);
          g.fillStyle(0xf4efe0, 1);
          g.fillRect(22.6 * k, 8.4 * k, 3.8 * k, 0.8 * k);
        } else {
          g.fillStyle(0x000000, 0.3);
          g.fillEllipse(16 * k, 30 * k, 16 * k, 3 * k);
          // Legs folded: hip, a knee out behind, the foot under.
          line(2.2, dark, 13, 19, 8, 23);
          line(2.2, dark, 8, 23, 11, 29);
          line(2, dark, 18, 13, 22, 29);
          g.fillStyle(base, 1);
          g.fillEllipse(14.5 * k, 16 * k, 11 * k, 9 * k);
          line(2.2, base, 16, 19, 21, 22);
          line(2.2, base, 21, 22, 18, 29);
          line(2, light, 19, 13, 25.5, 29);
          // The head, lopsided, with its spiky tuft.
          g.fillStyle(dark, 1);
          for (const [x, y] of [[17.5, 5.5], [19.5, 4.5], [21.5, 4.8]] as const) {
            g.fillTriangle((x - 1.2) * k, (y + 2) * k, (x + 1.2) * k, (y + 2) * k, (x + 0.3) * k, (y - 1.8) * k);
          }
          g.fillStyle(light, 1);
          g.fillCircle(21 * k, 10 * k, 5 * k);
          g.fillStyle(0xffffff, 1);
          g.fillCircle(22.6 * k, 8.6 * k, 2 * k);
          g.fillStyle(0x16081f, 1);
          g.fillCircle(23.2 * k, 8.8 * k, 1 * k);
          g.fillStyle(0xffffff, 1);
          g.fillCircle(19.6 * k, 8.2 * k, 0.8 * k);
          g.fillStyle(0x2a0d3a, 1);
          g.fillEllipse(22.4 * k, 12.6 * k, 6.5 * k, 2.6 * k);
          g.fillStyle(0xf4efe0, 1);
          g.fillRect(19.8 * k, 11.8 * k, 5.4 * k, 0.9 * k);
        }
        break;
      }
      default:
        g.fillStyle(base, 1);
        g.fillRect(((32 - (kind.size / k)) / 2) * k, ((32 - (kind.size / k)) / 2) * k, kind.size, kind.size);
    }
  }

  /** An enemy's bolt (ENEMY_SHOT_FX): halo, pink ring, pale inner, white core, four spikes to show it spin. */
  private createEnemyShotTexture(): void {
    const { canvas, ring, inner, core, spike, halo } = ENEMY_SHOT_FX;
    const c = canvas / 2;
    const g = this.add.graphics();
    g.fillStyle(halo, 0.16);
    g.fillCircle(c, c, c - 0.5);
    g.fillStyle(halo, 0.28);
    g.fillCircle(c, c, c * 0.78);
    g.fillStyle(spike, 0.95);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const side = a + Math.PI / 2;
      g.fillTriangle(
        c + Math.cos(side) * 2.2, c + Math.sin(side) * 2.2,
        c - Math.cos(side) * 2.2, c - Math.sin(side) * 2.2,
        c + Math.cos(a) * (c - 1), c + Math.sin(a) * (c - 1),
      );
    }
    g.fillStyle(ring, 1);
    g.fillCircle(c, c, c * 0.55);
    g.fillStyle(inner, 1);
    g.fillCircle(c, c, c * 0.38);
    g.fillStyle(core, 1);
    g.fillCircle(c, c, c * 0.22);
    g.generateTexture(TEXTURES.enemyShot, canvas, canvas);
    g.destroy();
  }

  /**
   * A thorn: a white spike, its point to the right (the way it flies), edged
   * by whose it is — the 키메라's red, the survivor's own green (0.146).
   */
  private createThornTexture(): void {
    for (const [key, edge] of [[TEXTURES.thornPlayer, COLORS.thornPlayerEdge], [TEXTURES.thorn, COLORS.thornEdge]] as const) {
      const g = this.add.graphics();
      g.fillStyle(edge, 1);
      g.fillTriangle(0, 0, 22, 4, 0, 8);
      g.fillStyle(COLORS.thorn, 1);
      g.fillTriangle(2, 2.4, 18.5, 4, 2, 5.6);
      g.generateTexture(key, 22, 8);
      g.destroy();
    }
  }

  /** The void orb: a hollow violet rim (VOID_ORB_FX). */
  private createVoidOrbTexture(): void {
    // A rim over a faint fill (VOID_ORB_FX, 0.101; a solid orb with a pale core before).
    const size = VOID_ORB.radius * 4;
    const { rim, rimWidth, fill, fillAlpha } = VOID_ORB_FX;
    const graphics = this.add.graphics();

    graphics.fillStyle(fill, fillAlpha);
    graphics.fillCircle(size / 2, size / 2, size / 2 - 1);
    graphics.lineStyle(rimWidth * 2, rim, 1);
    graphics.strokeCircle(size / 2, size / 2, size / 2 - rimWidth);

    graphics.generateTexture(TEXTURES.voidOrb, size, size);
    graphics.destroy();
  }

  /**
   * Hands the baked logo to the page as a data URL, so the reserved ad
   * columns can wear it while they are still empty. Pure decoration: if
   * anything goes wrong the columns simply stay blank.
   */
  private paintAdColumns(): void {
    try {
      const source = this.textures.get(TEXTURES.logo).getSourceImage();
      if (!(source instanceof HTMLCanvasElement)) {
        return;
      }

      document.documentElement.style.setProperty('--ad-logo', 'url(' + source.toDataURL() + ')');
    } catch {
      // No document, or a texture that cannot be read back.
    }
  }

  /** The potion: a white cross on a crimson field, read at a glance. */
  /**
   * The 뼈다귀: a skull and a rib, drawn plainly enough to read at 18px.
   * Bone-coloured rather than tinted, because what tells them apart on the
   * floor is the shape.
   */
  private createBoneTextures(): void {
    for (const bone of ALL_BONES) {
      const size = 32;
      const graphics = this.add.graphics();

      graphics.fillStyle(bone.color, 1);
      if (bone.id === 'skull') {
        // A dome with a jaw under it, and two sockets cut into the face.
        graphics.fillRoundedRect(size * 0.16, size * 0.12, size * 0.68, size * 0.56, size * 0.22);
        graphics.fillRect(size * 0.3, size * 0.6, size * 0.4, size * 0.2);
        graphics.fillStyle(0x15181f, 1);
        graphics.fillCircle(size * 0.36, size * 0.38, size * 0.1);
        graphics.fillCircle(size * 0.64, size * 0.38, size * 0.1);
        graphics.fillRect(size * 0.46, size * 0.52, size * 0.08, size * 0.1);
        // The teeth, as gaps in the jaw.
        graphics.fillRect(size * 0.42, size * 0.6, size * 0.04, size * 0.2);
        graphics.fillRect(size * 0.54, size * 0.6, size * 0.04, size * 0.2);
      } else if (bone.id === 'tailbone') {
        // A curl of vertebrae, each smaller than the last, down to the tip.
        const links = [
          [0.3, 0.2, 0.13], [0.5, 0.3, 0.11], [0.64, 0.46, 0.095], [0.68, 0.63, 0.08], [0.6, 0.77, 0.065], [0.47, 0.84, 0.05],
        ] as const;
        for (const [x, y, r] of links) {
          graphics.fillCircle(size * x, size * y, size * r);
        }
        graphics.fillStyle(0x15181f, 0.3);
        for (const [x, y, r] of links) {
          graphics.fillCircle(size * x, size * y, size * r * 0.35);
        }
      } else if (bone.id === 'spine') {
        // A column of vertebrae, each with a spur either side.
        for (let i = 0; i < 4; i++) {
          const y = size * (0.16 + i * 0.2);
          graphics.fillRoundedRect(size * 0.36, y, size * 0.28, size * 0.14, size * 0.05);
          graphics.fillRect(size * 0.22, y + size * 0.04, size * 0.56, size * 0.06);
        }
        graphics.fillStyle(0x15181f, 0.3);
        graphics.fillRect(size * 0.48, size * 0.16, size * 0.04, size * 0.74);
      } else {
        // A shaft with a knob at each end, laid on the diagonal.
        graphics.fillRect(size * 0.2, size * 0.44, size * 0.6, size * 0.12);
        graphics.fillCircle(size * 0.22, size * 0.4, size * 0.11);
        graphics.fillCircle(size * 0.22, size * 0.6, size * 0.11);
        graphics.fillCircle(size * 0.78, size * 0.4, size * 0.11);
        graphics.fillCircle(size * 0.78, size * 0.6, size * 0.11);
        graphics.fillStyle(0x15181f, 0.25);
        graphics.fillRect(size * 0.2, size * 0.52, size * 0.6, size * 0.04);
      }

      graphics.generateTexture(bone.texture, size, size);
      graphics.destroy();
    }
  }

  /**
   * 공허구체 각성's 공허: spiral arms winding into a dark eye, in
   * VOID_VORTEX_FX's purples — turned by the weapon, so it swirls.
   */
  private createVortexTexture(): void {
    const size = 128;
    const c = size / 2;
    const { arms, eye, armCount, winds } = VOID_VORTEX_FX;
    const g = this.add.graphics();
    g.fillStyle(arms[0]!, 0.22);
    g.fillCircle(c, c, c - 2);
    for (let arm = 0; arm < armCount; arm++) {
      const start = (arm / armCount) * Math.PI * 2;
      arms.forEach((color, layer) => {
        g.lineStyle(7 - layer * 2, color, 0.9);
        g.beginPath();
        for (let step = 0; step <= 40; step++) {
          const t = step / 40;
          const r = (c - 4) * (1 - t) + 6 * t;
          const a = start + t * winds * Math.PI * 2 + layer * 0.12;
          const x = c + Math.cos(a) * r;
          const y = c + Math.sin(a) * r;
          if (step === 0) {
            g.moveTo(x, y);
          } else {
            g.lineTo(x, y);
          }
        }
        g.strokePath();
      });
    }
    g.fillStyle(eye, 1);
    g.fillCircle(c, c, 9);
    g.generateTexture(TEXTURES.voidVortex, size, size);
    g.destroy();
  }

  /**
   * 드론 (0.94): the drone itself — a body with a lens and four rotors — and
   * its skill icon, the same machine on the icons' round plate.
   */
  private createDroneTextures(): void {
    const drawDrone = (g: Phaser.GameObjects.Graphics, cx: number, cy: number, k: number): void => {
      g.lineStyle(2 * k, 0x9aa3b0, 1);
      g.lineBetween(cx - 9 * k, cy - 9 * k, cx + 9 * k, cy + 9 * k);
      g.lineBetween(cx - 9 * k, cy + 9 * k, cx + 9 * k, cy - 9 * k);
      g.fillStyle(0xc9d3df, 0.85);
      for (const [dx, dy] of [[-9, -9], [9, -9], [-9, 9], [9, 9]] as const) {
        g.fillEllipse(cx + dx * k, cy + dy * k, 9 * k, 3.5 * k);
      }
      g.fillStyle(0x3d5a4a, 1);
      g.fillRoundedRect(cx - 6 * k, cy - 5 * k, 12 * k, 10 * k, 3 * k);
      g.fillStyle(0x7fe0c0, 1);
      g.fillCircle(cx, cy + 0.5 * k, 2.6 * k);
      g.fillStyle(0xff5a4a, 1);
      g.fillCircle(cx + 3.5 * k, cy - 2.8 * k, 1 * k);
    };
    const size = 32;
    const g = this.add.graphics();
    drawDrone(g, size / 2, size / 2, 1.2);
    g.generateTexture(TEXTURES.drone, size, size);
    g.clear();
    const key = SKILL_ICONS.drone?.key;
    if (key && !this.textures.exists(key)) {
      g.fillStyle(0x1b2a26, 1);
      g.fillCircle(size / 2, size / 2, size * 0.47);
      g.lineStyle(2, 0x7fe0c0, 1);
      g.strokeCircle(size / 2, size / 2, size * 0.44);
      drawDrone(g, size / 2, size / 2, 1);
      g.generateTexture(key, size, size);
    }
    g.destroy();
  }

  /**
   * Every survivor look (PLAYER_LOOK), in every pose (LOOK_POSES), and the
   * two animations Player plays with them: a walk that swings the legs and
   * bobs the body, and a cast that raises the prop (`windup`) and thrusts
   * it forward with a flash at its tip (`release`). The figure faces right
   * on a LOOK_CANVAS square with room round it for the thrust; Player flips
   * it to face the way it walks, or what it strikes.
   */
  private createLookTextures(): void {
    const looks: [string, PlayerLook][] = [['base', PLAYER_LOOK.base], ...Object.entries(PLAYER_LOOK.bySkill)];
    for (const [id, look] of looks) {
      for (const pose of LOOK_POSES) {
        const g = this.add.graphics();
        this.drawLook(g, look, pose);
        g.generateTexture(lookFrame(id, pose.key), LOOK_CANVAS.size, LOOK_CANVAS.size);
        g.destroy();
      }
      this.anims.create({
        key: lookAnim(id, 'walk'),
        frames: LOOK_ANIM.walk.map((pose) => ({ key: lookFrame(id, pose) })),
        frameRate: LOOK_ANIM.walkFps,
        repeat: -1,
      });
      this.anims.create({
        key: lookAnim(id, 'cast'),
        frames: LOOK_ANIM.cast.map(({ pose, ms }) => ({ key: lookFrame(id, pose), duration: ms })),
        frameRate: 1000,
        repeat: 0,
      });
    }
  }

  /** One pose of one look: the 32-unit figure, set LOOK_CANVAS.inset in from the edge. */
  private drawLook(g: Phaser.GameObjects.Graphics, look: PlayerLook, pose: LookPose): void {
    const o = LOOK_CANVAS.inset;
    const V = (x: number, y: number): Phaser.Math.Vector2 => new Phaser.Math.Vector2(x + o, y + o);
    const rect = (x: number, y: number, w: number, h: number): void => {
      g.fillRect(x + o, y + o, w, h);
    };
    const circle = (x: number, y: number, r: number): void => {
      g.fillCircle(x + o, y + o, r);
    };
    const stroke = (color: number, width: number, x1: number, y1: number, x2: number, y2: number): void => {
      g.lineStyle(width, color, 1);
      g.lineBetween(x1 + o, y1 + o, x2 + o, y2 + o);
    };
    const bob = pose.bob;

    // Legs and boots: one forward, one back as it walks.
    g.fillStyle(0x2a2420, 1);
    rect(11 + pose.stride, 25, 4, 6);
    rect(17 - pose.stride, 25, 4, 6);
    // The robe, wider at the hem, and its trim.
    g.fillStyle(look.robe, 1);
    g.fillPoints([V(10, 12 + bob), V(22, 12 + bob), V(24, 27), V(8, 27)], true);
    g.fillStyle(look.trim, 1);
    rect(10, 18 + bob, 12, 2);
    rect(8, 26, 16, 2);
    // Head and hood.
    g.fillStyle(0xf2c9a0, 1);
    circle(16, 8 + bob, 5);
    g.fillStyle(look.hood, 1);
    rect(10, 2 + bob, 12, 4);
    rect(10, 2 + bob, 3, 9);
    g.fillStyle(0x1a1a1a, 1);
    rect(17, 7 + bob, 2, 2);

    // The arm out to the hand, and what it holds along the pose's angle.
    const [hx, handY] = pose.hand;
    const hy = handY + bob;
    stroke(look.robe, 3, 21, 14 + bob, hx, hy);
    const a = Phaser.Math.DegToRad(pose.angle);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const at = (t: number): [number, number] => [hx + dx * t, hy + dy * t];
    const along = (color: number, width: number, from: number, to: number): void => {
      const [x1, y1] = at(from);
      const [x2, y2] = at(to);
      stroke(color, width, x1, y1, x2, y2);
    };
    let tip: [number, number] = at(0);
    switch (look.prop) {
      case 'sword': {
        along(0x6a4a2a, 2, -3, 1);
        // The guard, across the blade.
        const [gx, gy] = at(1);
        stroke(look.trim, 2, gx - dy * 3, gy + dx * 3, gx + dy * 3, gy - dx * 3);
        along(look.glow, 2, 1, 13);
        tip = at(13);
        break;
      }
      case 'staff':
      case 'rod':
        along(0x6a4a2a, 2, -10, 12);
        tip = at(13);
        g.fillStyle(look.glow, 1);
        if (look.prop === 'staff') {
          circle(tip[0], tip[1], 3);
        } else {
          g.fillTriangle(tip[0] + o, tip[1] - 3 + o, tip[0] - 2 + o, tip[1] + 2 + o, tip[0] + 2 + o, tip[1] + 1 + o);
        }
        break;
      case 'spear': {
        along(look.trim, 2, -10, 12);
        tip = at(16);
        const [bx, by] = at(12);
        g.fillStyle(look.glow, 1);
        g.fillTriangle(tip[0] + o, tip[1] + o, bx - dy * 3 + o, by + dx * 3 + o, bx + dy * 3 + o, by - dx * 3 + o);
        break;
      }
      case 'wand': {
        along(0x3a3a3a, 2, -1, 7);
        tip = at(9);
        const [wx, wy] = at(7);
        stroke(look.glow, 2, wx, wy, tip[0] + 2, tip[1] - 1);
        stroke(look.glow, 2, tip[0] + 2, tip[1] - 1, tip[0] - 1, tip[1] - 3);
        break;
      }
      case 'remote': {
        // 드론's: a little box in the hand, an aerial up off it, its tip lit.
        const [rx, ry] = at(2);
        g.fillStyle(0x2a2f38, 1);
        g.fillRect(rx - 3 + o, ry - 2.5 + o, 6, 5);
        g.fillStyle(look.trim, 1);
        g.fillRect(rx - 1.5 + o, ry - 0.5 + o, 1.2, 1.2);
        g.fillRect(rx + 0.6 + o, ry - 0.5 + o, 1.2, 1.2);
        stroke(0x9aa3b0, 1, rx + 2, ry - 2.5, rx + 3, ry - 8);
        tip = [rx + 3, ry - 8];
        g.fillStyle(look.glow, 1);
        circle(tip[0], tip[1], 1.4);
        break;
      }
      case 'orb':
        // Held up in the open hand, a little above it — higher as it casts.
        tip = [hx + 2, hy - 3 - pose.lift];
        g.fillStyle(look.glow, 0.45);
        circle(tip[0], tip[1], 5 + pose.lift / 2);
        g.fillStyle(look.glow, 1);
        circle(tip[0], tip[1], 3);
        break;
      default:
        break;
    }
    // The release flashes at the tip (at the hand, with nothing in it).
    if (pose.flash > 0) {
      g.fillStyle(look.glow, 0.35);
      circle(tip[0], tip[1], pose.flash + 2);
      g.fillStyle(0xffffff, 0.8);
      circle(tip[0], tip[1], Math.max(1, pose.flash - 2));
    }
  }

  /**
   * The 랭킹 flags, 48 × 32, simplified enough to read at the size a row
   * of the board draws them. Drawn rather than written as emoji because
   * Windows has no flag emoji at all — it shows the two letters instead.
   */
  private createFlagTextures(): void {
    const W = 48;
    const H = 32;
    const g = this.add.graphics();
    const stripes = (colors: readonly number[], vertical = false, weights?: readonly number[]) => {
      const w = weights ?? colors.map(() => 1);
      const total = w.reduce((a, b) => a + b, 0);
      let at = 0;
      colors.forEach((color, i) => {
        const span = ((vertical ? W : H) * (w[i] ?? 1)) / total;
        g.fillStyle(color, 1);
        if (vertical) {
          g.fillRect(at, 0, Math.ceil(span), H);
        } else {
          g.fillRect(0, at, W, Math.ceil(span));
        }
        at += span;
      });
    };
    const star = (cx: number, cy: number, r: number, color: number) => {
      const points: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? r : r * 0.42;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        points.push(new Phaser.Math.Vector2(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius));
      }
      g.fillStyle(color, 1);
      g.fillPoints(points, true);
    };
    const draw: Record<string, () => void> = {
      KR: () => {
        stripes([0xffffff]);
        g.fillStyle(0xcd2e3a, 1);
        g.beginPath();
        g.slice(W / 2, H / 2, 8, Math.PI, 0, false);
        g.fillPath();
        g.fillStyle(0x0047a0, 1);
        g.beginPath();
        g.slice(W / 2, H / 2, 8, 0, Math.PI, false);
        g.fillPath();
        g.fillStyle(0x000000, 1);
        for (const [x, y] of [[8, 6], [W - 14, 6], [8, H - 10], [W - 14, H - 10]]) {
          for (let i = 0; i < 3; i++) g.fillRect(x!, y! + i * 2, 6, 1);
        }
      },
      JP: () => {
        stripes([0xffffff]);
        g.fillStyle(0xbc002d, 1);
        g.fillCircle(W / 2, H / 2, 9);
      },
      CN: () => {
        stripes([0xde2910]);
        star(10, 9, 6, 0xffde00);
        star(19, 4, 2, 0xffde00);
        star(22, 8, 2, 0xffde00);
        star(22, 13, 2, 0xffde00);
        star(19, 17, 2, 0xffde00);
      },
      US: () => {
        stripes(Array.from({ length: 13 }, (_, i) => (i % 2 === 0 ? 0xb22234 : 0xffffff)));
        g.fillStyle(0x3c3b6e, 1);
        g.fillRect(0, 0, 20, 17);
        g.fillStyle(0xffffff, 1);
        for (let y = 3; y < 16; y += 4) for (let x = 3; x < 19; x += 4) g.fillRect(x, y, 1.5, 1.5);
      },
      IN: () => {
        stripes([0xff9933, 0xffffff, 0x138808]);
        g.lineStyle(1.5, 0x000080, 1);
        g.strokeCircle(W / 2, H / 2, 4.5);
      },
      TH: () => stripes([0xa51931, 0xf4f5f8, 0x2d2a4a, 0xf4f5f8, 0xa51931], false, [1, 1, 2, 1, 1]),
      CA: () => {
        stripes([0xd52b1e, 0xffffff, 0xd52b1e], true, [1, 2, 1]);
        g.fillStyle(0xd52b1e, 1);
        g.fillTriangle(W / 2, 7, W / 2 - 8, 19, W / 2 + 8, 19);
        g.fillTriangle(W / 2 - 9, 12, W / 2 + 9, 12, W / 2, 22);
        g.fillRect(W / 2 - 1, 20, 2, 6);
      },
      MX: () => {
        stripes([0x006847, 0xffffff, 0xce1126], true);
        g.fillStyle(0x8c5a2b, 1);
        g.fillCircle(W / 2, H / 2, 4);
      },
      RU: () => stripes([0xffffff, 0x0039a6, 0xd52b1e]),
      TW: () => {
        stripes([0xfe0000]);
        g.fillStyle(0x000095, 1);
        g.fillRect(0, 0, 24, 16);
        star(12, 8, 5.5, 0xffffff);
        g.fillStyle(0x000095, 1);
        g.fillCircle(12, 8, 2.6);
        g.fillStyle(0xffffff, 1);
        g.fillCircle(12, 8, 2);
      },
    };

    for (const code of RANKING.flags) {
      const paint = draw[code];
      if (!code || !paint) {
        continue;
      }
      g.clear();
      paint();
      g.lineStyle(1, 0x000000, 0.35);
      g.strokeRect(0.5, 0.5, W - 1, H - 1);
      g.generateTexture(`tex-flag-${code}`, W, H);
    }
    g.destroy();
  }

  /**
   * 하얀 망고: a pale, almost white mango leaning on its side, with a green
   * leaf at the stem and a soft blush, so it reads as fruit and not a gem.
   */
  /** 자석: a red horseshoe magnet with silver tips, and two sparks at its mouth. */
  /** 철광석: a dark lump of rock, rust-red veins through it and a bright glint. */
  private createOreTexture(): void {
    const size = 32;
    const g = this.add.graphics();
    g.fillStyle(0x4a4f5a, 1);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(6, 18), new Phaser.Math.Vector2(10, 8), new Phaser.Math.Vector2(19, 5),
        new Phaser.Math.Vector2(27, 11), new Phaser.Math.Vector2(28, 21), new Phaser.Math.Vector2(20, 28),
        new Phaser.Math.Vector2(9, 27),
      ],
      true,
    );
    g.fillStyle(0x6b717e, 1);
    g.fillTriangle(10, 8, 19, 5, 15, 15);
    g.fillStyle(0x363a43, 1);
    g.fillTriangle(20, 28, 28, 21, 18, 18);
    g.lineStyle(2, 0xb5562e, 1);
    g.lineBetween(9, 20, 16, 16);
    g.lineBetween(16, 16, 23, 19);
    g.lineBetween(13, 11, 17, 13);
    g.fillStyle(0xe8edf5, 1);
    g.fillCircle(21, 10, 1.6);
    g.fillCircle(12, 23, 1.2);
    g.generateTexture(TEXTURES.ore, size, size);
    g.destroy();
  }

  /** 잠금: a small gold padlock, worn in a cell's corner in the 분해 grid. */
  private createLockTexture(): void {
    const size = 32;
    const g = this.add.graphics();
    g.lineStyle(4, 0xd9b44a, 1);
    g.beginPath();
    g.arc(16, 13, 7, Math.PI, 0, false);
    g.strokePath();
    g.lineBetween(9, 13, 9, 16);
    g.lineBetween(23, 13, 23, 16);
    g.fillStyle(0xf2d08a, 1);
    g.fillRoundedRect(5, 15, 22, 15, 3);
    g.fillStyle(0x3a2e14, 1);
    g.fillCircle(16, 21, 2.4);
    g.fillRect(15, 21, 2, 5);
    g.generateTexture(TEXTURES.lock, size, size);
    g.destroy();
  }

  private createMagnetTexture(): void {
    const size = 48;
    const g = this.add.graphics();
    // The horseshoe: a thick red arc, open at the top.
    g.lineStyle(11, 0xd93a3a, 1);
    g.beginPath();
    g.arc(24, 22, 13, 0, Math.PI, false);
    g.strokePath();
    g.fillStyle(0xd93a3a, 1);
    g.fillRect(5.5, 10, 11, 12);
    g.fillRect(31.5, 10, 11, 12);
    // Silver tips.
    g.fillStyle(0xe6e9ef, 1);
    g.fillRect(5.5, 4, 11, 8);
    g.fillRect(31.5, 4, 11, 8);
    // A shine down one side.
    g.lineStyle(2, 0xff9a8a, 0.9);
    g.beginPath();
    g.arc(24, 22, 16, Math.PI * 0.55, Math.PI * 0.95, false);
    g.strokePath();
    // Sparks at the mouth.
    g.lineStyle(2, 0xffe066, 1);
    g.lineBetween(20, 6, 22, 1);
    g.lineBetween(28, 6, 26, 1);
    g.generateTexture(TEXTURES.magnet, size, size);
    g.destroy();
  }

  /** 알수없는 룬, in each of its looks: a dark stone, its edge and its mark in its colour (as 0.79 drew its 룬). */
  /**
   * 재능의 파편 (TALENT_SHARD_FX, 0.102): a pale crystal stood on its point, tinted by its stat where drawn —
   * a long diamond, its left facets lit, its right in shade, a glint near the
   * top — on a 64-px square, drawn smaller where it lies.
   */
  private createTalentShardTexture(): void {
    const size = 64;
    const { body, light, dark } = TALENT_SHARD_FX;
    const g = this.add.graphics();
    g.fillStyle(light, 0.16);
    g.fillCircle(32, 34, 26);
    const top = [32, 4] as const;
    const left = [18, 30] as const;
    const right = [46, 30] as const;
    const bottom = [32, 60] as const;
    const waist = [33, 28] as const;
    g.fillStyle(dark, 1);
    g.fillTriangle(top[0], top[1], right[0], right[1], waist[0], waist[1]);
    g.fillTriangle(waist[0], waist[1], right[0], right[1], bottom[0], bottom[1]);
    g.fillStyle(body, 1);
    g.fillTriangle(top[0], top[1], left[0], left[1], waist[0], waist[1]);
    g.fillTriangle(left[0], left[1], bottom[0], bottom[1], waist[0], waist[1]);
    g.fillStyle(light, 0.9);
    g.fillTriangle(top[0], top[1], 24, 26, waist[0] - 1, waist[1] - 2);
    g.lineStyle(2, 0x3a3a46, 1);
    g.strokePoints([new Phaser.Math.Vector2(...top), new Phaser.Math.Vector2(...right), new Phaser.Math.Vector2(...bottom), new Phaser.Math.Vector2(...left)], true, true);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(27, 17, 2.4);
    g.generateTexture(TEXTURES.talentShard, size, size);
    g.destroy();
  }

  /**
   * The 재능의 덩어리 (0.111): three of the shard's crystals grown together —
   * a tall one in the middle, two leaning off it — grey-white like the
   * shard, so the drop's tint gives it its stat's colour.
   */
  private createTalentLumpTexture(): void {
    const size = 64;
    const { body, light, dark } = TALENT_SHARD_FX;
    const g = this.add.graphics();
    g.fillStyle(light, 0.18);
    g.fillCircle(32, 36, 28);
    const crystal = (cx: number, top: number, bottom: number, half: number, lean: number): void => {
      const t = new Phaser.Math.Vector2(cx + lean, top);
      const l = new Phaser.Math.Vector2(cx - half, (top + bottom) / 2);
      const r = new Phaser.Math.Vector2(cx + half, (top + bottom) / 2);
      const b = new Phaser.Math.Vector2(cx, bottom);
      g.fillStyle(dark, 1);
      g.fillTriangle(t.x, t.y, r.x, r.y, b.x, b.y);
      g.fillStyle(body, 1);
      g.fillTriangle(t.x, t.y, l.x, l.y, b.x, b.y);
      g.fillStyle(light, 0.85);
      g.fillTriangle(t.x, t.y, l.x + 3, l.y - 2, cx, (top + bottom) / 2 - 2);
      g.lineStyle(2, 0x3a3a46, 1);
      g.strokePoints([t, r, b, l], true, true);
    };
    crystal(17, 20, 58, 9, -6);
    crystal(47, 22, 58, 9, 6);
    crystal(32, 4, 60, 12, 0);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(27, 18, 2.6);
    g.fillCircle(13, 31, 1.6);
    g.generateTexture(TEXTURES.talentLump, size, size);
    g.destroy();
  }

  private createUnknownRuneTextures(): void {
    const size = 32;
    UNKNOWN_RUNE_LOOKS.forEach((look, i) => {
      const graphics = this.add.graphics();
      graphics.fillStyle(0x2b2f3a, 1);
      graphics.fillRoundedRect(2, 2, size - 4, size - 4, 7);
      graphics.lineStyle(2, look.color, 0.9);
      graphics.strokeRoundedRect(2, 2, size - 4, size - 4, 7);
      graphics.lineStyle(3, look.color, 1);
      const pad = 7;
      const span = size - pad * 2;
      for (const [x1, y1, x2, y2] of look.glyph) {
        graphics.lineBetween(pad + x1 * span, pad + y1 * span, pad + x2 * span, pad + y2 * span);
      }
      graphics.generateTexture(unknownRuneTexture(i), size, size);
      graphics.destroy();
    });
  }

  private createMangoTexture(): void {
    const size = 32;
    const g = this.add.graphics();
    g.fillStyle(0xfff8e6, 1);
    g.fillEllipse(size * 0.5, size * 0.56, size * 0.78, size * 0.62);
    g.fillStyle(0xffe7b8, 1);
    g.fillEllipse(size * 0.6, size * 0.64, size * 0.42, size * 0.3);
    g.fillStyle(0xffffff, 0.9);
    g.fillEllipse(size * 0.36, size * 0.46, size * 0.16, size * 0.1);
    g.lineStyle(1.5, 0xd9c79a, 1);
    g.strokeEllipse(size * 0.5, size * 0.56, size * 0.78, size * 0.62);
    g.fillStyle(0x4caf50, 1);
    g.fillTriangle(size * 0.5, size * 0.26, size * 0.74, size * 0.12, size * 0.66, size * 0.3);
    g.lineStyle(2, 0x6b4f2a, 1);
    g.lineBetween(size * 0.5, size * 0.28, size * 0.48, size * 0.18);
    g.generateTexture(TEXTURES.mango, size, size);
    g.destroy();
  }

  /**
   * A fat giant — legs, arms out at its sides, a round belly under a small
   * crowned head — in the pictures `giantFrame` names: from the front
   * standing (0) and with each foot out (1, 2; the arms swinging against the
   * legs, the body dipping a pixel on the step), side on facing right (3),
   * and from behind (4). The last two are the turn it takes as it throws.
   */
  private createGiantTextures(texture: string, size: number, skin: number): void {
    const k = size / 72;
    const tone = (by: number) =>
      by < 0
        ? Phaser.Display.Color.ValueToColor(skin).darken(-by).color
        : Phaser.Display.Color.ValueToColor(skin).lighten(by).color;
    const dark = tone(-35);
    const feet = tone(-55);
    const belly = tone(12);
    const gold = COLORS.bossOutline;
    for (const frame of [0, 1, 2, 3, 4]) {
      const g = this.add.graphics();
      const side = frame === 3;
      const back = frame === 4;
      // Which foot is out: -1 the left, 1 the right, 0 neither.
      const out = frame === 1 ? -1 : frame === 2 ? 1 : 0;
      const dip = out === 0 ? 0 : 1;
      const leg = (x: number, reach: number, toe = 0) => {
        g.fillStyle(dark, 1);
        g.fillRoundedRect((x - 6) * k, 46 * k, 12 * k, (15 + reach) * k, 4 * k);
        g.fillStyle(feet, 1);
        g.fillEllipse((x + toe) * k, (61 + reach) * k, 16 * k, 8 * k);
      };
      const arm = (x: number, swing: number) => {
        g.fillStyle(skin, 1);
        g.fillEllipse(x * k, (35 + dip + swing) * k, 14 * k, 24 * k);
        g.fillStyle(dark, 1);
        g.fillCircle(x * k, (46 + dip + swing) * k, 5 * k);
      };
      const crown = (x: number, w: number) => {
        g.fillStyle(gold, 1);
        g.fillRect((x - w / 2) * k, (3 + dip) * k, w * k, 3 * k);
        const points = w > 10 ? [-w / 2 + 2, 0, w / 2 - 2] : [-w / 2 + 2, w / 2 - 2];
        for (const dx of points) {
          g.fillTriangle((x + dx - 2) * k, (3 + dip) * k, (x + dx) * k, (-2 + dip) * k + 1, (x + dx + 2) * k, (3 + dip) * k);
        }
      };

      if (side) {
        // Side on: the far leg a shade behind the near one, toes forward,
        // one arm hanging in front, the belly pushed out ahead of it.
        leg(32, 0, 3);
        leg(40, 0, 3);
        g.fillStyle(skin, 1);
        g.fillEllipse(34 * k, 34 * k, 42 * k, 40 * k);
        g.fillStyle(belly, 1);
        g.fillEllipse(45 * k, 38 * k, 20 * k, 26 * k);
        g.lineStyle(2 * k, dark, 1);
        g.strokeEllipse(34 * k, 34 * k, 42 * k, 40 * k);
        g.fillStyle(dark, 1);
        g.fillRect(19 * k, 44 * k, 32 * k, 4 * k);
        arm(32, 0);
        // Outlined, or the arm in front of the body is lost against it.
        g.lineStyle(2 * k, dark, 1);
        g.strokeEllipse(32 * k, 35 * k, 14 * k, 24 * k);
        g.fillStyle(skin, 1);
        g.fillCircle(40 * k, 14 * k, 10 * k);
        g.lineStyle(2 * k, dark, 1);
        g.strokeCircle(40 * k, 14 * k, 10 * k);
        g.fillStyle(gold, 1);
        g.fillCircle(45 * k, 13 * k, 2 * k);
        g.fillStyle(0xf4f1e8, 1);
        g.fillTriangle(45 * k, 18 * k, 47 * k, 18 * k, 46 * k, 22 * k);
        crown(40, 10);
      } else {
        leg(26, out === -1 ? 4 : out === 1 ? -3 : 0);
        leg(46, out === 1 ? 4 : out === -1 ? -3 : 0);
        // Arms swing against the legs: the left one forward with the right foot.
        arm(9, out * -3);
        arm(63, out * 3);
        g.fillStyle(skin, 1);
        g.fillEllipse(36 * k, (34 + dip) * k, 54 * k, 40 * k);
        if (!back) {
          g.fillStyle(belly, 1);
          g.fillEllipse(36 * k, (38 + dip) * k, 34 * k, 24 * k);
        }
        g.lineStyle(2 * k, dark, 1);
        g.strokeEllipse(36 * k, (34 + dip) * k, 54 * k, 40 * k);
        // A belt under the belly, buckled in gold at the front.
        g.fillStyle(dark, 1);
        g.fillRect(17 * k, (44 + dip) * k, 38 * k, 4 * k);
        if (!back) {
          g.fillStyle(gold, 1);
          g.fillRect(33 * k, (43 + dip) * k, 6 * k, 6 * k);
        }
        // The head, small on that body; from the front, gold eyes and two tusks.
        g.fillStyle(back ? dark : skin, 1);
        g.fillCircle(36 * k, (14 + dip) * k, 11 * k);
        g.lineStyle(2 * k, dark, 1);
        g.strokeCircle(36 * k, (14 + dip) * k, 11 * k);
        if (!back) {
          g.fillStyle(gold, 1);
          g.fillCircle(32 * k, (13 + dip) * k, 2 * k);
          g.fillCircle(40 * k, (13 + dip) * k, 2 * k);
          g.fillStyle(0xf4f1e8, 1);
          g.fillTriangle(31 * k, (18 + dip) * k, 33 * k, (18 + dip) * k, 32 * k, (22 + dip) * k);
          g.fillTriangle(39 * k, (18 + dip) * k, 41 * k, (18 + dip) * k, 40 * k, (22 + dip) * k);
        }
        // A crown: what makes it the 우두머리 and not just big.
        crown(36, 14);
      }

      g.generateTexture(giantFrame(texture, frame), size, size);
      g.destroy();
    }
  }

  /** 도파민 (0.127): a four-point sparkle. */
  private createCelebrateTextures(): void {
    if (!this.textures.exists(TEXTURES.sparkle)) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillPoints([new Phaser.Math.Vector2(16, 0), new Phaser.Math.Vector2(19, 13), new Phaser.Math.Vector2(32, 16),
        new Phaser.Math.Vector2(19, 19), new Phaser.Math.Vector2(16, 32), new Phaser.Math.Vector2(13, 19),
        new Phaser.Math.Vector2(0, 16), new Phaser.Math.Vector2(13, 13)], true);
      g.generateTexture(TEXTURES.sparkle, 32, 32);
      g.destroy();
    }
  }

  /** 오늘의 규칙 (0.126), as an icon among the survivor's effects: a red no-entry sign. */
  private createDailyRulesIcon(): void {
    const size = 32;
    const c = size / 2;
    const g = this.add.graphics();
    g.fillStyle(0x2a1416, 1).fillCircle(c, c, 14);
    g.lineStyle(4, 0xe0564a, 1).strokeCircle(c, c, 12);
    g.lineBetween(c - 8, c + 8, c + 8, c - 8);
    g.generateTexture(TEXTURES.dailyRules, size, size);
    g.destroy();
  }

  /** 거미줄, as an icon among the survivor's effects: spokes and two rings. */
  private createWebIcon(): void {
    const size = 32;
    const c = size / 2;
    const g = this.add.graphics();
    g.lineStyle(2, 0xd8dde6, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.lineBetween(c, c, c + Math.cos(a) * 15, c + Math.sin(a) * 15);
    }
    g.strokeCircle(c, c, 6);
    g.strokeCircle(c, c, 11);
    g.generateTexture(TEXTURES.webIcon, size, size);
    g.destroy();
  }

  /** 랭킹's icon in the title's corner: a gold cup on a stem and a base — and the same in silver and bronze for 2위 and 3위. */
  private createTrophyTexture(): void {
    const size = 48;
    const cups: [string, number][] = [
      [TEXTURES.trophy, COLORS.gold],
      [TEXTURES.trophySilver, COLORS.silver],
      [TEXTURES.trophyBronze, COLORS.bronze],
    ];
    for (const [key, color] of cups) {
      const graphics = this.add.graphics();
      graphics.fillStyle(color, 1);
      // The handles, then the cup over them.
      graphics.lineStyle(4, color, 1);
      graphics.strokeCircle(size * 0.26, size * 0.32, size * 0.1);
      graphics.strokeCircle(size * 0.74, size * 0.32, size * 0.1);
      graphics.fillRoundedRect(size * 0.28, size * 0.14, size * 0.44, size * 0.38, size * 0.14);
      graphics.fillRect(size * 0.45, size * 0.5, size * 0.1, size * 0.18);
      graphics.fillRect(size * 0.3, size * 0.68, size * 0.4, size * 0.12);
      graphics.fillStyle(0xffffff, 0.45);
      graphics.fillRect(size * 0.36, size * 0.2, size * 0.06, size * 0.22);
      graphics.generateTexture(key, size, size);
      graphics.destroy();
    }
  }

  /**
   * A 도망자: a white four-pointed star, drawn white so the colour cycling
   * over it in play is pure colour. Everything else on the
   * field is a square; this is the one thing that is not.
   */
  private createFlashyTexture(key: string, size: number): void {
    const s = Math.round(size * 1.8);
    const c = s / 2;
    const star = (r: number, inner: number) => {
      const points: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 8; i++) {
        const radius = i % 2 === 0 ? r : inner;
        const angle = -Math.PI / 2 + (i * Math.PI) / 4;
        points.push(new Phaser.Math.Vector2(c + Math.cos(angle) * radius, c + Math.sin(angle) * radius));
      }
      return points;
    };

    const graphics = this.add.graphics();
    graphics.fillStyle(0xffffff, 1);
    graphics.fillPoints(star(s * 0.5, s * 0.2), true);
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(c, c, s * 0.12);
    graphics.generateTexture(key, s, s);
    graphics.destroy();
  }

  /**
   * 낙뢰's icon, drawn rather than loaded: a yellow bolt on a dark disc, the
   * same 32px the pack's icons are, so the drop and the card size it alike.
   */
  /**
   * 타격: a fist punching up and right, with impact lines off its knuckles —
   * in the same round badge as 낙뢰's, and nothing like the sword in hand.
   */
  private createStrikeIcon(): void {
    const key = SKILL_ICONS.meleeStrike?.key;
    if (!key || this.textures.exists(key)) {
      return;
    }

    const size = 64;
    const skin = 0xf2c38b;
    const edge = 0x7a4a25;
    const g = this.add.graphics();
    g.fillStyle(0x2a1a14, 1);
    g.fillCircle(size / 2, size / 2, size * 0.47);
    g.lineStyle(3, 0xff8a3d, 1);
    g.strokeCircle(size / 2, size / 2, size * 0.44);

    // The back of the hand, then four knuckles across its top, then the
    // thumb folded over the front.
    g.fillStyle(skin, 1);
    g.fillRoundedRect(17, 27, 28, 20, 6);
    g.lineStyle(2, edge, 1);
    g.strokeRoundedRect(17, 27, 28, 20, 6);
    for (let i = 0; i < 4; i++) {
      const x = 16 + i * 7.5;
      g.fillStyle(skin, 1);
      g.fillRoundedRect(x, 18, 8, 13, 4);
      g.lineStyle(2, edge, 1);
      g.strokeRoundedRect(x, 18, 8, 13, 4);
    }
    g.fillStyle(skin, 1);
    g.fillRoundedRect(13, 33, 22, 9, 4);
    g.lineStyle(2, edge, 1);
    g.strokeRoundedRect(13, 33, 22, 9, 4);
    // The wrist.
    g.fillStyle(0xb5543a, 1);
    g.fillRect(21, 47, 20, 7);

    // Impact, off the knuckles.
    g.lineStyle(3, 0xffe066, 1);
    g.lineBetween(47, 19, 52, 13);
    g.lineBetween(49, 27, 55, 26);
    g.lineBetween(41, 14, 42, 8);

    g.generateTexture(key, size, size);
    g.destroy();
  }

  /**
   * The game's own pixel icons (PIXEL_ICONS): the pickups and the shot under
   * their TEXTURES keys, the skills that name one, and every sword under
   * `gearTexture(id)` — a rectangle a run of one colour in a row.
   */
  private createPixelIcons(): void {
    const wanted: [string, PixelIconId][] = [
      [TEXTURES.gem, ICONS.gem.pixel],
      [TEXTURES.projectile, ICONS.projectile.pixel],
      [TEXTURES.skillOrb, ICONS.skillOrb.pixel],
      [TEXTURES.randomSkill, ICONS.randomSkill.pixel],
      [TEXTURES.battlePlan, ICONS.battlePlan.pixel],
      [TEXTURES.potion, ICONS.potion.pixel],
      ...Object.values(SKILL_ICONS).flatMap((icon): [string, PixelIconId][] => (icon.pixel ? [[icon.key, icon.pixel]] : [])),
      ...Object.values(GEAR).map((spec): [string, PixelIconId] => [gearTexture(spec.id), spec.icon]),
    ];
    const px = PIXEL_ICON_SCALE;
    for (const [key, id] of wanted) {
      if (this.textures.exists(key)) {
        continue;
      }
      const icon: PixelIcon = PIXEL_ICONS[id];
      const g = this.add.graphics();
      icon.rows.forEach((row, y) => {
        let x = 0;
        while (x < row.length) {
          const cell = row[x]!;
          let end = x + 1;
          while (end < row.length && row[end] === cell) {
            end += 1;
          }
          const color = icon.palette[cell];
          if (cell !== '.' && color !== undefined) {
            g.fillStyle(color, 1);
            g.fillRect(x * px, y * px, (end - x) * px, px);
          }
          x = end;
        }
      });
      g.generateTexture(key, icon.rows[0]!.length * px, icon.rows.length * px);
      g.destroy();
    }
  }

  /** 독성폭발 (0.122): a drop of poison inside a ring going out. */
  private createPoisonNovaIcon(): void {
    const key = SKILL_ICONS.poisonNova?.key;
    if (!key || this.textures.exists(key)) {
      return;
    }

    const size = 32;
    const c = size / 2;
    const graphics = this.add.graphics();
    graphics.fillStyle(0x1a2a14, 1);
    graphics.fillCircle(c, c, size * 0.47);
    graphics.lineStyle(2, POISON_NOVA_FX.edge, 1);
    graphics.strokeCircle(c, c, size * 0.42);
    graphics.lineStyle(1, POISON_NOVA_FX.color, 0.8);
    graphics.strokeCircle(c, c, size * 0.32);
    // The drop: a round belly and a point on top.
    graphics.fillStyle(POISON_NOVA_FX.color, 1);
    graphics.fillCircle(c, c + 3, 6);
    graphics.fillTriangle(c, c - 8, c - 5.2, c + 0.5, c + 5.2, c + 0.5);
    graphics.fillStyle(0xe8ffd0, 0.9);
    graphics.fillCircle(c - 2, c + 1.5, 1.6);
    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private createThunderIcon(): void {
    const key = SKILL_ICONS.thunderStrike?.key;
    if (!key || this.textures.exists(key)) {
      return;
    }

    const size = 32;
    const graphics = this.add.graphics();
    graphics.fillStyle(0x1b2340, 1);
    graphics.fillCircle(size / 2, size / 2, size * 0.47);
    graphics.lineStyle(2, COLORS.lightningGlow, 1);
    graphics.strokeCircle(size / 2, size / 2, size * 0.44);
    graphics.fillStyle(0xffe066, 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(size * 0.58, size * 0.1),
        new Phaser.Math.Vector2(size * 0.28, size * 0.55),
        new Phaser.Math.Vector2(size * 0.48, size * 0.55),
        new Phaser.Math.Vector2(size * 0.38, size * 0.9),
        new Phaser.Math.Vector2(size * 0.74, size * 0.42),
        new Phaser.Math.Vector2(size * 0.53, size * 0.42),
      ],
      true,
    );
    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  /**
   * The 제단: a stepped stone block with an ember burning on top. Grey and
   * squat where every pickup is bright and round, so it does not read as
   * something to walk over for free.
   */
  private createAltarTexture(): void {
    const size = 32;
    const graphics = this.add.graphics();

    // Base step, the block, and the slab across the top.
    graphics.fillStyle(COLORS.altarStone, 1);
    graphics.fillRect(size * 0.12, size * 0.8, size * 0.76, size * 0.14);
    graphics.fillRect(size * 0.24, size * 0.5, size * 0.52, size * 0.32);
    graphics.fillRect(size * 0.16, size * 0.42, size * 0.68, size * 0.1);
    // A seam down the block, so it reads as stone rather than a box.
    graphics.fillStyle(0x15181f, 0.35);
    graphics.fillRect(size * 0.48, size * 0.52, size * 0.04, size * 0.28);

    // The ember: a wide flame with a hotter core.
    graphics.fillStyle(COLORS.altarFlame, 1);
    graphics.fillTriangle(size * 0.3, size * 0.42, size * 0.7, size * 0.42, size * 0.5, size * 0.06);
    graphics.fillStyle(0xffd34d, 1);
    graphics.fillTriangle(size * 0.4, size * 0.42, size * 0.6, size * 0.42, size * 0.5, size * 0.2);

    graphics.generateTexture(TEXTURES.altar, size, size);
    graphics.destroy();
  }

  /**
   * The three 구슬. A sphere each, in its own colour, with its own mark cut
   * into the face — colour alone would not tell them apart on a dark floor,
   * and a 각성의 구슬 is a thousand kills apart from a 변화의 구슬.
   */
  private createOrbTextures(): void {
    for (const orb of ALL_ORBS) {
      const size = 32;
      const half = size / 2;
      const graphics = this.add.graphics();

      graphics.fillStyle(orb.color, 1);
      graphics.fillCircle(half, half, half - 1);
      // A darker lower half, so it reads as a sphere rather than a disc.
      graphics.fillStyle(0x000000, 0.22);
      graphics.fillCircle(half, half + size * 0.14, half - size * 0.16);

      graphics.fillStyle(0xffffff, 0.92);
      if (orb.id === 'transmute') {
        // A ring: the same thing, come round again.
        graphics.lineStyle(Math.round(size * 0.09), 0xffffff, 0.92);
        graphics.strokeCircle(half, half, size * 0.2);
      } else if (orb.id === 'chaos') {
        // Four points thrown outward.
        graphics.fillPoints(
          [
            new Phaser.Math.Vector2(half, size * 0.2),
            new Phaser.Math.Vector2(half + size * 0.1, half - size * 0.06),
            new Phaser.Math.Vector2(size * 0.8, half),
            new Phaser.Math.Vector2(half + size * 0.06, half + size * 0.1),
            new Phaser.Math.Vector2(half, size * 0.8),
            new Phaser.Math.Vector2(half - size * 0.1, half + size * 0.06),
            new Phaser.Math.Vector2(size * 0.2, half),
            new Phaser.Math.Vector2(half - size * 0.06, half - size * 0.1),
          ],
          true,
        );
      } else if (orb.id === 'awaken') {
        // A cross with the arms stepping outward: one more of something.
        const arm = size * 0.07;
        graphics.fillRect(half - arm / 2, size * 0.22, arm, size * 0.56);
        graphics.fillRect(size * 0.22, half - arm / 2, size * 0.56, arm);
      } else if (orb.id === 'engrave') {
        // A rune cut into it: an upright stroke with two arms — what stays as it is.
        const w = size * 0.08;
        graphics.fillRect(half - w / 2, size * 0.24, w, size * 0.52);
        graphics.lineStyle(w, 0xffffff, 0.92);
        graphics.lineBetween(half, size * 0.36, half + size * 0.18, size * 0.24);
        graphics.lineBetween(half, size * 0.52, half - size * 0.18, size * 0.4);
      } else if (orb.id === 'mango') {
        // A small mango with its leaf: what keeps the weapon whole.
        graphics.fillStyle(0xffb347, 1);
        graphics.fillEllipse(half, half + size * 0.04, size * 0.38, size * 0.44);
        graphics.fillStyle(0x6fcf5a, 1);
        graphics.fillEllipse(half + size * 0.1, half - size * 0.2, size * 0.2, size * 0.1);
      } else {
        // A crack across the face: it may not survive its own use.
        graphics.fillPoints(
          [
            new Phaser.Math.Vector2(half - size * 0.04, size * 0.18),
            new Phaser.Math.Vector2(half + size * 0.12, half - size * 0.04),
            new Phaser.Math.Vector2(half + size * 0.02, half),
            new Phaser.Math.Vector2(half + size * 0.14, size * 0.82),
            new Phaser.Math.Vector2(half - size * 0.06, half + size * 0.04),
            new Phaser.Math.Vector2(half + size * 0.02, half - size * 0.02),
          ],
          true,
        );
      }

      // A highlight, last, so it sits over the mark.
      graphics.fillStyle(0xffffff, 0.55);
      graphics.fillCircle(size * 0.33, size * 0.3, size * 0.08);

      graphics.generateTexture(orb.texture, size, size);
      graphics.destroy();
    }
  }

  /** 패시브's icon: a lit node with a ring around it. */
  private createPassiveTexture(): void {
    const size = 48;
    const half = size / 2;
    const graphics = this.add.graphics();

    graphics.lineStyle(Math.round(size * 0.1), COLORS.passiveEdge, 1);
    graphics.strokeCircle(half, half, half - size * 0.1);
    graphics.fillStyle(COLORS.passive, 1);
    graphics.fillCircle(half, half, size * 0.24);

    graphics.generateTexture(TEXTURES.passive, size, size);
    graphics.destroy();
  }

  /**
   * 장비: a sword, point up. The same sprite on the ground, in the corner of
   * the title screen and beside 착용 중 — what you walk over and the screen
   * you take it to should be the same object.
   */
  private createGearTexture(): void {
    const size = GEAR_DROP.size * 2;
    const half = size / 2;
    const graphics = this.add.graphics();

    const bladeWidth = Math.max(3, Math.round(size * 0.16));
    const guardWidth = Math.round(size * 0.62);
    const guardHeight = Math.max(2, Math.round(size * 0.09));
    const guardY = Math.round(size * 0.66);

    // Blade: a tapered point over a straight edge.
    graphics.fillStyle(COLORS.gearEdge, 1);
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(half, size * 0.05),
        new Phaser.Math.Vector2(half + bladeWidth / 2, size * 0.2),
        new Phaser.Math.Vector2(half + bladeWidth / 2, guardY),
        new Phaser.Math.Vector2(half - bladeWidth / 2, guardY),
        new Phaser.Math.Vector2(half - bladeWidth / 2, size * 0.2),
      ],
      true,
    );
    // A fuller down the middle, so the blade has a side lit and a side not.
    graphics.fillStyle(COLORS.gear, 1);
    graphics.fillRect(half, size * 0.18, Math.max(1, bladeWidth / 2 - 1), guardY - size * 0.18);

    // Crossguard and grip.
    graphics.fillStyle(COLORS.gear, 1);
    graphics.fillRect(half - guardWidth / 2, guardY, guardWidth, guardHeight);
    graphics.fillRect(
      half - Math.max(1, bladeWidth / 3),
      guardY + guardHeight,
      Math.max(2, (bladeWidth * 2) / 3),
      size * 0.22,
    );
    graphics.fillStyle(COLORS.gearEdge, 1);
    graphics.fillCircle(half, size * 0.95, Math.max(2, size * 0.08));

    graphics.generateTexture(TEXTURES.gear, size, size);
    graphics.destroy();
  }

  /** The ice shard: a diamond, long along the axis it is fired down. */
  private createDivineShardTexture(): void {
    const { width, height } = SHOTS.iceSpear;
    const graphics = this.add.graphics();

    // Phaser 4 wants real Vector2s here; Geom.Point is gone.
    const points = [
      new Phaser.Math.Vector2(0, height / 2),
      new Phaser.Math.Vector2(width * 0.35, 0),
      new Phaser.Math.Vector2(width, height / 2),
      new Phaser.Math.Vector2(width * 0.35, height),
    ];

    graphics.fillStyle(COLORS.iceSpear, 1);
    graphics.fillPoints(points, true);
    graphics.lineStyle(1, COLORS.iceSpearEdge, 1);
    graphics.strokePoints(points, true);

    graphics.generateTexture(TEXTURES.iceShard, width, height);
    graphics.destroy();
  }

}
