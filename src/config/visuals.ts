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
  muted: "#a9b3c9",
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
  /** 도망자: drawn white so the cycling tint over it reads as pure colour. */
  enemyFugitive: 0xffffff,
  /** Plain gold: the 랭킹 trophy, and the arrow that points at a 도망자. */
  gold: 0xffe066,
  bossOutline: 0xffd34d,
  /** 화염구's burst where it lands. */
  fireBlast: 0xff8a3d,
  /** 제단: dark stone with an ember on top, so it reads as a threat. */
  altarStone: 0x4a4f5c,
  altarFlame: 0xff5a3c,
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
  /** 신성한 조각: a pale shard, lit the way a gem is. */
  shard: 0xd6ecff,
  shardEdge: 0x7fb8e8,
  shardGlow: 0xaad4ff,
  shardText: '#d6ecff',
  /** 패시브, on its icon and its screen. */
  passive: 0x7ef0b0,
  passiveEdge: 0xcdfbe2,
  /** 장비 on the ground: a brass crate, lit gold, named in gold. */
  gear: 0xc08a3e,
  gearEdge: 0xf2d08a,
  gearGlow: 0xffd34d,
  gearText: '#f2d08a',
  /** The potion: a white cross on crimson, haloed in pink as it expires. */
  potion: 0xd94452,
  potionCross: 0xfff2f2,
  potionGlow: 0xff8fa0,
  healText: '#7ef0b0',
  /** A 치명 hit of the survivor's own, so it reads apart from an ordinary one. */
  critText: '#ffb347',
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
  /** Edge markers sit over the field but under anything pinned to the HUD. */
  edgeMarker: 70,
  ui: 100,
} as const;

/**
 * The little icons around the rim of the screen that say where something
 * worth walking to is, when it is off the edge of the view.
 *
 * A 우두머리 walks in from outside the view by design, and a weapon it left
 * can expire on a part of the floor the camera never showed. Both of those
 * are things the player would have gone and got, had they known.
 */
export const EDGE_MARKERS = {
  /** How far inside the screen edge a marker sits, clear of the HUD row. */
  margin: 34,
  /** Side of the icon, and of the arrow behind it. */
  size: 18,
  arrow: 7,
  /**
   * Most markers at once. The nearest win, so a floor covered in drops does
   * not turn the rim of the screen into a second crowd.
   */
  max: 10,
  alpha: 0.9,
  /** Anything this far outside the view is too far to bother pointing at. */
  rangePx: 1400,
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
  enemyFugitive: "tex-enemy-fugitive",
  enemyShot: "tex-enemy-shot",
  projectile: "tex-projectile",
  iceShard: "tex-ice-shard",
  voidOrb: "tex-void-orb",
  potion: "tex-potion",
  gem: "tex-gem",
  skillOrb: "tex-skill-orb",
  gear: "tex-gear",
  shard: "tex-shard",
  boneSkull: "tex-bone-skull",
  boneRib: "tex-bone-rib",
  altar: "tex-altar",
  mango: "tex-mango",
  orbTransmute: "tex-orb-transmute",
  orbChaos: "tex-orb-chaos",
  orbAwaken: "tex-orb-awaken",
  orbExplode: "tex-orb-explode",
  passive: "tex-passive",
  trophy: "tex-trophy",
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
/**
 * One icon per skill, from the Raven Fantasy pack (see
 * assets/icons/CREDITS.txt). Stand-ins until there is art of our own: the
 * drop on the ground wears it, and so does the upgrade card.
 */
export const SKILL_ICONS: Record<string, { readonly file?: string; readonly key: string }> = {
  meleeStrike: { file: 'assets/icons/skill-meleeStrike.png', key: 'tex-skill-meleeStrike' },
  fireball: { file: 'assets/icons/skill-fireball.png', key: 'tex-skill-fireball' },
  chainLightning: { file: 'assets/icons/skill-chainLightning.png', key: 'tex-skill-chainLightning' },
  iceSpear: { file: 'assets/icons/skill-iceSpear.png', key: 'tex-skill-iceSpear' },
  voidOrb: { file: 'assets/icons/skill-voidOrb.png', key: 'tex-skill-voidOrb' },
  // No file: drawn at boot until the pack has a bolt that fits.
  thunderStrike: { key: 'tex-skill-thunderStrike' },
};

/** How big a skill icon is drawn, on the ground and on a card. */
export const SKILL_ICON_SIZE = {
  drop: 24,
  card: 34,
} as const;

/**
 * How finely text is rendered. The canvas is 960 wide and gets stretched to
 * the window, so glyphs are drawn at this multiple of it and sampled back
 * down: sharp edges for texture memory, and nothing per frame.
 */
export const TEXT = {
  resolution: 2,
  /** A ceiling, so a 3x phone does not bake enormous glyph canvases. */
  maxResolution: 3,
  /**
   * Every size in the game, by what the text is for. Nothing sets a size by
   * hand: one ladder means a screen read at arm's length stays readable
   * everywhere, and raising a step raises it everywhere at once.
   */
  size: {
    /** Footer hints and the debug readout — the smallest thing we print. */
    hint: '15px',
    /** Dense lists: the run readout, a card's fine print. */
    small: '16px',
    /** Ordinary body copy. */
    body: '17px',
    /** A row's own name in a menu, and a skill's name on a card. */
    label: '20px',
    /** A section heading, and the run clock. */
    heading: '22px',
    /** The headline on a small panel. */
    panel: '28px',
    /** A screen's own title. */
    screen: '34px',
    /** 일시정지, 레벨 업 — a word thrown across the middle of the screen. */
    banner: '40px',
    /** 게임 오버. */
    hero: '48px',
    /** The line a run opens on. */
    huge: '56px',
  },
  /**
   * A dark outline behind every label. The run readout and the damage
   * numbers sit straight on the playfield, where a pale enemy or a lit
   * effect can swallow them; an outline is measured into the glyph box (a
   * shadow is not, so it clips), costs nothing per frame, and keeps centred
   * text centred.
   */
  outline: {
    color: '#05070b',
    /** Share of the font size, clamped — thin on small text, not hairline. */
    share: 0.14,
    minPx: 2,
    maxPx: 5,
  },
} as const;

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
/**
 * The name floating over something on the ground, by how rare it is.
 *
 * The ladder is about being seen. A 일반 drop is bare text, read against
 * whatever is behind it on the field. A 마법 drop sits on a dark plate with
 * a lit edge. A 희귀 drop keeps the white-on-red plate every drop used to
 * wear — the loudest thing on the screen — and breathes, so the eye catches
 * it from across the arena.
 */
export const DROP_LABEL = {
  /** Gap between the item on the ground and the plate above it. */
  gap: 5,
  paddingX: 6,
  paddingY: 3,
  /**
   * No tier wears a plate any more: a slab behind the words covered the floor
   * the drop was lying on, and three slabs at once covered the fight. What
   * tells them apart is the size, the colour and — on the loudest — the slow
   * swell. Every one of them leans on its outline to stay readable.
   */
  tiers: {
    normal: {
      fontSize: "20px",
      text: "#e8edf7",
      /** No plate: the dark outline every label carries is enough. */
      plate: 0x000000,
      plateAlpha: 0,
      border: 0x000000,
      borderWidth: 0,
      /** Dark text on a pale plate needs no outline; bare text does. */
      outlined: true,
      pulse: 0,
    },
    magic: {
      fontSize: "22px",
      text: "#cfe8ff",
      plate: 0x000000,
      plateAlpha: 0,
      border: 0x000000,
      borderWidth: 0,
      outlined: true,
      pulse: 0,
    },
    rare: {
      fontSize: "24px",
      text: "#FE0000",
      plate: 0x000000,
      plateAlpha: 0,
      border: 0x000000,
      borderWidth: 0,
      outlined: true,
      /**
       * White, where every other label is outlined in the dark the field is
       * made of. Red on near-black needs the light behind it, and it is the
       * one name worth seeing from across the floor.
       */
      outline: "#ffffff",
      /** How far the words swell and settle again, forever. */
      pulse: 0.06,
    },
  },
  /** How long the label takes to pop in, before it starts breathing. */
  popMs: 180,
  /** One full breath of the 희귀 plate. */
  pulseMs: 900,
} as const;

export const HUD = {
  margin: 16,
  /** How far under the clock the enemy count sits. */
  countGap: 30,
  /**
   * Under this canvas width the loadout would run under the clock, so it
   * drops below the clock block instead of sitting beside it.
   */
  narrowWidth: 640,
  /** Where the loadout starts once it has dropped: under the enemy count. */
  narrowTop: 70,
  /** One skill in the loadout bar, and the gap between two. */
  skillSlot: 34,
  skillGap: 6,
  /** Left edge of the run readout, clear of the pause button in the corner. */
  leftInset: 56,
  /** XP bar spans the full width along the very bottom edge. */
  xpBarHeight: 10,
  /** The level and health line that sits above that bar. */
  nameplateSize: TEXT.size.hint,
  nameplateGap: 4,
  /** Health bar floats just above the player sprite. */
  healthBar: {
    width: 60,
    height: 6,
    /** Gap between the sprite's top edge and the bar. */
    gap: 6,
  },
  /**
   * A 우두머리 wears the same bar the survivor does, only wider: it is the
   * one enemy whose health is a thing you plan around rather than a thing
   * you notice going down.
   */
  bossBar: {
    width: 96,
    height: 7,
    gap: 8,
  },
} as const;

/**
 * How much of what is behind an overlay still shows through it. A screen
 * you read covers the field outright — a logo ghosting through a paragraph
 * is the quickest way to make it unreadable. One you act on mid-run leaves
 * enough of the field to see what you walked into.
 */
/**
 * 인벤토리 — the grid every tab of it is drawn on. Six across and twelve
 * down, the shape asked for; a cell shrinks to fit the window between the
 * two bounds, and a tab holding more than one grid's worth turns pages.
 */
export const INVENTORY = {
  cols: 6,
  rows: 12,
  cellMax: 40,
  cellMin: 18,
  /** Space between cells. */
  gap: 3,
  /** A cell's border, by how rare what is in it is. */
  border: {
    normal: 0x5a6478,
    magic: 0x6aa9ff,
    rare: 0xff4a4a,
  },
  /** An empty cell. */
  empty: 0x151a24,
  /** The weapon being carried wears a small mark in its corner. */
  equipped: 0xf2d08a,
  /** Wide enough to stand the grid and the details side by side. */
  sideBySideFrom: 640,
} as const;

export const SCRIM = {
  /** 게임 가이드 · 패치노트 · 설정 · 제작자 정보 · 확인 창. */
  reading: 1,
  pause: 0.88,
  upgrade: 0.86,
  gameOver: 0.92,
  /** The grid behind the title. */
  title: 0.62,
} as const;

/**
 * The two icons in the top-right corner of the title: 장비 and 패시브, the
 * screens you go to between runs rather than from a row in the list.
 */
export const ICON_BAR = {
  size: 38,
  gap: 12,
  margin: 18,
  /** The caption under each one. */
  labelGap: 6,
  /** A dot in the corner when one of them has something waiting. */
  badgeRadius: 7,
} as const;

/** Where the shell screens — title, settings, credits, pause — are tuned. */
export const MENU = {
  /** Wide enough that a row's name and its value never touch. */
  buttonWidth: 360,
  /** Six rows have to fit under the logo, so the buttons are compact. */
  buttonHeight: 40,
  buttonGap: 8,
  /** Side of one logo pixel, in screen px. */
  logoPixel: 6,
  /** Roughly how tall the baked logo comes out, for centring the title. */
  logoHeight: 104,
  /** Air kept either side of it on a screen too narrow for its full size. */
  logoMargin: 20,
  /** That logo plus the byline under it. */
  logoBlockHeight: 150,
  /** Byline to the 랭킹 first-place line under it, which adds this much. */
  championGap: 26,
  /** Gap between that block and the first row, and the same on a short one. */
  logoGap: 34,
  logoGapShort: 18,
  /** Under this canvas height the title uses the shorter gap. */
  shortHeight: 600,
  /** A screen's title and the air under it, before its first row. */
  titleBlockHeight: 76,
  /**
   * Under this screen width a centred name and a right-aligned value collide
   * in the same row, so the name moves to the left edge instead.
   */
  tightWidth: 560,
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
  /** Narrower screens keep at least this much air at each edge. */
  sideMargin: 24,
  /** The contents list down the left of the guide. */
  tocWidth: 180,
  /** ...which gives up width first, but never below this. */
  tocMinWidth: 96,
  /** One chapter's plate in the contents list, and the gap under it. */
  tocItemHeight: 34,
  tocItemGap: 6,
  /** Space between the contents list and the page beside it. */
  tocGutter: 14,
  headingSize: '20px',
  headingGap: 8,
  lineSize: '16px',
  lineSpacing: 7,
  sectionGap: 22,
  /** The row of tabs over a chapter's page, wrapping onto more rows. */
  tabHeight: 30,
  tabGap: 6,
  tabPadX: 12,
  tabSize: '15px',
  /** Air between the last row of tabs and the page under it. */
  tabsBottomGap: 10,
  /** One card on the page: its padding, the gap to the next, its corners. */
  cardPad: 14,
  cardGap: 12,
  cardRadius: 8,
  cardEdge: 1.5,
  /** The coloured bar down a card's left side. */
  cardBar: 4,
  cardFill: 0x141924,
  cardFillAlpha: 0.92,
  cardTitleSize: '18px',
  /** A card's quick facts, under its title, smaller and lighter. */
  factSize: '14px',
  factColor: '#b9c7e0',
  /** How far one press of an arrow key moves the page. */
  keyStep: 48,
} as const;

/**
 * What a guide card is about, which is what colour its edge and title are:
 * a skill reads gold, an enemy red, an item green — the same colours those
 * things are on the field, so the page and the run agree.
 */
export type GuideTone =
  | 'info'
  | 'tip'
  | 'skill'
  | 'enemy'
  | 'boss'
  | 'rare'
  | 'item'
  | 'gear'
  | 'orb'
  | 'bone'
  | 'passive'
  | 'patch';

export const GUIDE_TONES: Record<GuideTone, { readonly edge: number; readonly title: string }> = {
  info: { edge: 0x5ea8ff, title: '#9fd0ff' },
  tip: { edge: 0x7ef0b0, title: '#9ff5c6' },
  skill: { edge: 0xffc14d, title: '#ffd27a' },
  enemy: { edge: 0xe0564a, title: '#ff8a7e' },
  boss: { edge: 0xffd34d, title: '#ffd34d' },
  rare: { edge: 0xff8a1f, title: '#ffae2e' },
  item: { edge: 0x7ef0b0, title: '#9ff5c6' },
  gear: { edge: 0xc08a3e, title: '#f2d08a' },
  orb: { edge: 0xb07cff, title: '#d2b6ff' },
  bone: { edge: 0xd8c79f, title: '#e9e3d2' },
  passive: { edge: 0x5fd3c0, title: '#a8f0e4' },
  patch: { edge: 0x5ea8ff, title: '#9fd0ff' },
};

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

/** The table the end-of-run screen reads the run out in. */
export const GAME_OVER = {
  /** Title and the line under it, before the table starts. */
  headHeight: 104,
  /** One label-and-figure row. */
  lineHeight: 24,
  /** Air under a wrapped line, which may be one row tall or three. */
  wrapGap: 10,
  /** Between the table and the first button. */
  tableGap: 24,
  tableWidth: 420,
} as const;

/** The panel that lists a rare's affixes when it is hovered or tapped. */
export const TOOLTIP = {
  paddingX: 10,
  paddingY: 8,
  /** How far above the enemy the panel floats. */
  gap: 14,
  /** A pointer within this of a rare's centre is pointing at it. */
  grabPadding: 6,
  titleSize: '16px',
  lineSize: '15px',
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
  fontSize: "16px",
  /**
   * A critical hit is the one number worth looking at, so it is drawn half
   * again as large, outlined against whatever it lands on, and it starts
   * larger still and settles — the eye catches the movement before it reads
   * the number.
   */
  /** The dark edge every number carries over the field it lands on. */
  outline: 2,
  critScale: 1.55,
  critPopScale: 2.1,
  critPopMs: 140,
  critOutline: 3,
  /** A crit hangs about longer than an ordinary hit. */
  critLifespanMs: 900,
} as const;
