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
  GEAR,
  SKILL_ICONS,
  gearTexture,
  SKILL_PICK,
  RANKING,
  ROLLBACK_GIFT,
  PLAYER,
  POTION,
  SHOTS,
  TERRAIN,
  TEXTURES,
  PLAYER_LOOK,
  VOID_VORTEX_FX,
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
import { createPixelTextTexture } from '@/systems/PixelFont';
import { sfx } from '@/systems/Sfx';


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

    for (const clip of Object.values(AUDIO.drops)) {
      this.load.audio(clip.key, `${base}${clip.file}`);
    }
    sfx.preload(this);

    this.load.image(TEXTURES.gem, `${base}${ICONS.gem.file}`);
    this.load.image(TEXTURES.projectile, `${base}${ICONS.projectile.file}`);
    this.load.image(TEXTURES.skillOrb, `${base}${ICONS.skillOrb.file}`);

    for (const icon of Object.values(SKILL_ICONS)) {
      if (icon.file) {
        this.load.image(icon.key, `${base}${icon.file}`);
      }
    }
    for (const spec of Object.values(GEAR)) {
      this.load.image(gearTexture(spec.id), `${base}${spec.icon}`);
    }
  }

  public create(): void {
    this.createGridTexture();
    this.createSquareTexture(TEXTURES.player, PLAYER.size, COLORS.player);
    for (const kind of Object.values(ENEMY_KINDS)) {
      if (kind.flashy) {
        this.createFlashyTexture(kind.texture, kind.size);
      } else if (kind.giant) {
        this.createGiantTextures(kind.texture, kind.giant.drawn, kind.color);
      } else if (kind.id === 'chimera') {
        this.createChimeraTexture(kind.texture, kind.size);
      } else {
        this.createSquareTexture(kind.texture, kind.size, kind.color);
      }
    }
    this.createSquareTexture(TEXTURES.enemyShot, 8, COLORS.enemyShot);
    this.createThornTexture();
    this.createVoidOrbTexture();
    this.createPotionTexture();
    this.createGearTexture();
    this.createDivineShardTexture();
    this.createPassiveTexture();
    this.createOrbTextures();
    this.createBoneTextures();
    this.createAltarTexture();
    this.createThunderIcon();
    this.createStrikeIcon();
    this.createTrophyTexture();
    this.createWebIcon();
    this.createFlagTextures();
    this.createLookTextures();
    this.createVortexTexture();
    this.createMangoTexture();
    this.createMagnetTexture();
    this.createLightPillarTexture();
    this.createGlowTexture();
    this.createAccountTexture();
    this.createFilterTexture();
    this.createTuningTexture();


    createPixelTextTexture(this, TEXTURES.logo, ['EXILED', 'SURVIVORS'], {
      pixel: MENU.logoPixel,
      color: COLORS.logo,
      shadow: COLORS.logoShadow,
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
  private createChimeraTexture(key: string, size: number): void {
    const k = size / 30;
    const g = this.add.graphics();
    // The serpent tail, behind everything else.
    g.lineStyle(3.2 * k, COLORS.chimeraTail, 1);
    g.beginPath();
    g.moveTo(7 * k, 19 * k);
    g.lineTo(3 * k, 15 * k);
    g.lineTo(3.5 * k, 9 * k);
    g.lineTo(6.5 * k, 6 * k);
    g.strokePath();
    g.fillStyle(COLORS.chimeraTail, 1);
    g.fillEllipse(8 * k, 5.5 * k, 5.5 * k, 4 * k);
    g.fillStyle(0xffe066, 1);
    g.fillCircle(9 * k, 5 * k, 0.8 * k);
    // Legs, then the body over them.
    const legs = Phaser.Display.Color.ValueToColor(COLORS.enemyChimera).darken(30).color;
    g.fillStyle(legs, 1);
    for (const x of [8, 12, 18, 22]) {
      g.fillRoundedRect((x - 1.6) * k, 20 * k, 3.2 * k, 8 * k, 1.2 * k);
    }
    g.fillStyle(COLORS.enemyChimera, 1);
    g.fillEllipse(15 * k, 19 * k, 20 * k, 11 * k);
    // The mane, the head in it, and the horns over both.
    g.fillStyle(COLORS.chimeraMane, 1);
    g.fillCircle(21.5 * k, 12.5 * k, 7.5 * k);
    g.fillStyle(COLORS.enemyChimera, 1);
    g.fillCircle(23 * k, 13 * k, 4.6 * k);
    g.fillStyle(COLORS.thorn, 1);
    g.fillTriangle(17.5 * k, 7 * k, 20 * k, 6 * k, 15.5 * k, 1 * k);
    g.fillTriangle(22 * k, 6 * k, 24.5 * k, 7 * k, 25.5 * k, 0.5 * k);
    g.fillStyle(0xd23b2a, 1);
    g.fillCircle(25 * k, 12 * k, 1 * k);
    g.fillStyle(COLORS.chimeraMane, 1);
    g.fillTriangle(26 * k, 15 * k, 28.5 * k, 14 * k, 26.5 * k, 16.5 * k);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  /** A 키메라's thorn: a white spike, its point to the right (the way it flies). */
  private createThornTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.thornEdge, 1);
    g.fillTriangle(0, 1, 22, 4, 0, 7);
    g.fillStyle(COLORS.thorn, 1);
    g.fillTriangle(1, 2, 21, 4, 1, 6);
    g.fillRect(0, 2.5, 4, 3);
    g.generateTexture(TEXTURES.thorn, 22, 8);
    g.destroy();
  }

  /** The void orb: a pale core inside a violet shell. */
  private createVoidOrbTexture(): void {
    const size = VOID_ORB.radius * 4;
    const graphics = this.add.graphics();

    graphics.fillStyle(COLORS.voidOrb, 1);
    graphics.fillCircle(size / 2, size / 2, size / 2);
    graphics.fillStyle(COLORS.voidOrbCore, 0.9);
    graphics.fillCircle(size / 2, size / 2, size / 4);

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

  private createPotionTexture(): void {
    const size = POTION.size * 2;
    const arm = size * 0.22;
    const graphics = this.add.graphics();

    graphics.fillStyle(COLORS.potion, 1);
    graphics.fillRect(0, 0, size, size);
    graphics.fillStyle(COLORS.potionCross, 1);
    graphics.fillRect(size / 2 - arm / 2, size * 0.2, arm, size * 0.6);
    graphics.fillRect(size * 0.2, size / 2 - arm / 2, size * 0.6, arm);

    graphics.generateTexture(TEXTURES.potion, size, size);
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
