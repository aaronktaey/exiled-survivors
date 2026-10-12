/**
 * How the game looks: colours, generated texture keys, draw order, and the
 * layout of the HUD and the menus. Numbers here move things around the
 * screen; they do not change how the game plays.
 */

export const COLORS = {
  background: "#0b0d12",
  text: "#f4f1e8",
  /** Same ink as a number, for shapes. */
  textFill: 0xf4f1e8,
  muted: "#8b93a7",
  accent: "#e0564a",
  /** Same accent as a number, for shapes (text takes the string form). */
  accentFill: 0xe0564a,
  grid: 0x1a1f2b,
  player: 0x8fd3ff,
  enemy: 0xe0564a,
  enemyBrute: 0xb44bd1,
  enemyRunner: 0xf2b134,
  enemyShooter: 0x5fc27e,
  /** 우두머리: a dark slab with a gold ring around it. */
  enemyBoss: 0x7a1f3d,
  bossOutline: 0xffd34d,
  /** Enemy fire, kept well away from any colour the player's own shots use. */
  enemyShot: 0xff7a9c,
  /** The ring around a rare at one affix, and its tooltip heading. */
  rareOutline: 0xffd34d,
  rareText: '#ffd34d',
  projectile: 0xffe9a3,
  gem: 0x7ef0b0,
  skillOrb: 0xffc14d,
  panel: 0x141924,
  panelActive: 0x1e2636,
  panelEdge: 0x2b3445,
  hpFill: 0xe0564a,
  xpFill: 0x7ef0b0,
  barTrack: 0x222a38,
  stick: 0xf4f1e8,
  meleeArc: 0xdfe7f5,
  /** The pixel logo: bone white over a red offset, like a stamped sign. */
  logo: 0xf4f1e8,
  logoShadow: 0xe0564a,
  damageText: "#ffe9a3",
  debugText: "#7ef0b0",
  fireball: 0xffa63d,
  /** Bright core of a lightning arc, over a wider soft glow. */
  lightning: 0xdff1ff,
  lightningGlow: 0x5ea8ff,
  iceSpear: 0x9fe8ff,
  iceSpearEdge: 0x3f8fd0,
  /** 공허: a violet core inside a darker rim. */
  voidOrb: 0xb07cff,
  voidOrbCore: 0xefe4ff,
  /** The potion: a white cross on crimson, haloed in pink as it expires. */
  potion: 0xd94452,
  potionCross: 0xfff2f2,
  potionGlow: 0xff8fa0,
  healText: '#7ef0b0',
} as const;

export const DEPTH = {
  ground: 0,
  pickups: 10,
  enemies: 20,
  player: 30,
  projectiles: 40,
  vfx: 50,
  /** The player's health bar sits above the crowd it is fighting. */
  healthBar: 55,
  /** Ground item labels read above the crowd. */
  skillDrop: 60,
  ui: 100,
} as const;

/** Texture keys generated at boot — placeholder art until real sprites land. */
export const TEXTURES = {
  grid: "tex-grid",
  player: "tex-player",
  enemy: "tex-enemy",
  enemyBrute: "tex-enemy-brute",
  enemyRunner: "tex-enemy-runner",
  enemyShooter: "tex-enemy-shooter",
  enemyBoss: "tex-enemy-boss",
  enemyShot: "tex-enemy-shot",
  projectile: "tex-projectile",
  iceShard: "tex-ice-shard",
  voidOrb: "tex-void-orb",
  potion: "tex-potion",
  gem: "tex-gem",
  skillOrb: "tex-skill-orb",
  logo: "tex-logo",
} as const;

/**
 * Sound effects. Paths go through BASE_URL so they resolve both on the dev
 * server (/) and on the Pages project site (/exiled-survivors/).
 */
/**
 * Hand-picked icons from the Raven Fantasy pack (see assets/icons/CREDITS.txt).
 * Sprites are 32x32 and drawn down to `size`; the rest of the art is still
 * generated at boot.
 */
export const ICONS = {
  gem: { file: "assets/icons/xp-gem.png", size: 14 },
  projectile: { file: "assets/icons/fireball.png", size: 16 },
  skillOrb: { file: "assets/icons/skill-orb.png", size: 22 },
} as const;

/** How each projectile skill's shot is drawn. Width runs along its flight. */
export const SHOTS = {
  fireball: {
    texture: TEXTURES.projectile,
    width: ICONS.projectile.size,
    height: ICONS.projectile.size,
  },
  iceSpear: { texture: TEXTURES.iceShard, width: 22, height: 8 },
} as const;

/** Ground label for a dropped skill, baked into a texture at boot. */
export const SKILL_LABEL = {
  text: "#FE0000",
  background: 0xffffff,
  border: 0xfe0000,
  borderWidth: 1,
  paddingX: 5,
  paddingY: 3,
  fontSize: "24px",
  /** Gap between the orb on the ground and the plate above it. */
  gap: 5,
} as const;

export const HUD = {
  margin: 16,
  /** Left edge of the run readout, clear of the pause button in the corner. */
  leftInset: 56,
  /** XP bar spans the full width along the very bottom edge. */
  xpBarHeight: 10,
  /** Health bar floats just above the player sprite. */
  healthBar: {
    width: 60,
    height: 6,
    /** Gap between the sprite's top edge and the bar. */
    gap: 6,
  },
} as const;

/** Where the shell screens — title, settings, credits, pause — are tuned. */
export const MENU = {
  buttonWidth: 300,
  /** Six rows have to fit under the logo, so the buttons are compact. */
  buttonHeight: 40,
  buttonGap: 8,
  /** Side of one logo pixel, in screen px. */
  logoPixel: 6,
  /** How far the logo drifts, and how long one full bob takes. */
  logoBobPx: 10,
  logoBobMs: 2600,
} as const;

/** 패치노트 and 게임 가이드: a long page that scrolls inside a window. */
export const INFO = {
  titleY: 44,
  /** The scrolling window, measured from the top and bottom of the screen. */
  contentTop: 82,
  contentBottom: 58,
  contentWidth: 720,
  headingSize: '17px',
  headingGap: 8,
  lineSize: '14px',
  lineSpacing: 5,
  sectionGap: 22,
  /** How far one press of an arrow key moves the page. */
  keyStep: 48,
} as const;

/**
 * A rare's ring, by how many affixes it carries: pale gold for one, deeper
 * and angrier the more it is stacking, so what is coming reads across the
 * screen before the tooltip does.
 */
export const RARE_OUTLINE_TIERS: readonly number[] = [
  0xffd34d, // 1
  0xffae2e, // 2
  0xff8a1f, // 3
  0xff6314, // 4
  0xf03a2a, // 5
  0xd41347, // 6
];

/** The panel that lists a rare's affixes when it is hovered or tapped. */
export const TOOLTIP = {
  paddingX: 10,
  paddingY: 8,
  /** How far above the enemy the panel floats. */
  gap: 14,
  /** A pointer within this of a rare's centre is pointing at it. */
  grabPadding: 6,
  titleSize: '13px',
  lineSize: '12px',
} as const;

export const PAUSE_BUTTON = {
  size: 34,
  margin: 10,
} as const;

export const JOYSTICK = {
  /** Radius of the outer ring. */
  baseRadius: 56,
  thumbRadius: 26,
  /** Distance from the bottom-left corner to the ring's centre. */
  margin: 96,
  /** Touches this far from the ring's centre still grab it. */
  grabRadius: 150,
  /** Below this tilt the stick reads as centred, to kill thumb jitter. */
  deadZone: 0.18,
  baseAlpha: 0.18,
  thumbAlpha: 0.38,
} as const;

export const DAMAGE_NUMBERS = {
  /** Pooled up front; the oldest is recycled once they are all in use. */
  poolSize: 96,
  lifespanMs: 650,
  /** Upward drift, px per second. */
  riseSpeed: 54,
  fontSize: "13px",
} as const;
