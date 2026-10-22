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
  /** 지형지물: a dark stone with a lit top and rim, over its shadow. */
  rockShadow: 0x000000,
  rockBody: 0x2a2f3a,
  rockTop: 0x3c4352,
  rockRim: 0x5c6680,
  rockFleck: 0x4b5466,
  player: 0x8fd3ff,
  enemy: 0xe0564a,
  enemyBrute: 0xb44bd1,
  enemyRunner: 0xf2b134,
  enemyShooter: 0x5fc27e,
  /** 우두머리: a dark slab with a gold ring around it. */
  /** 우두머리: a grey giant (crimson until 2026-10-16), its crown and ring in gold. */
  enemyBoss: 0x7d838f,
  /** 도망자: drawn white so the cycling tint over it reads as pure colour. */
  enemyFugitive: 0xffffff,
  enemyErratic: 0x9b6bff,
  /** 키메라: a sand-gold lion's body, a dark mane, a green serpent tail. */
  enemyChimera: 0xc9a25a,
  chimeraMane: 0x6b3d22,
  chimeraTail: 0x4f9a5a,
  /** Its thorns: bone white with a grey spine. */
  thorn: 0xf6f3ea,
  thornEdge: 0x9a978f,
  /** Plain gold: the 랭킹 trophy, and the arrow that points at a 도망자. */
  gold: 0xffe066,
  /** 2위 and 3위's cups. */
  silver: 0xd9dee8,
  bronze: 0xd08a4e,
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
  /** "막음" over the survivor when 오니고로시 turns a shot aside. */
  blockText: "#9fd8ff",
  fireball: 0xffa63d,
  /** Bright core of a lightning arc, over a wider soft glow. */
  lightning: 0xdff1ff,
  lightningGlow: 0x5ea8ff,
  iceSpear: 0x9fe8ff,
  iceSpearEdge: 0x3f8fd0,
  /** 공허: a violet core inside a darker rim. */
  voidOrb: 0xb07cff,
  voidOrbCore: 0xefe4ff,
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
  /** 알수없는 룬: the line over the survivor as one is picked up. */
  runeText: '#e6c4ff',
  /** A 치명 hit of the survivor's own, so it reads apart from an ordinary one. */
  critText: '#ffb347',
  /** A run on the board the admin's review marks out of line. */
  suspectText: '#ff6b6b',
  /** A warning on a card: what a choice would cost. */
  warnText: '#ff6b6b',
} as const;

export const DEPTH = {
  ground: 0,
  /** 지형지물, on the floor and under everything that moves over it. */
  terrain: 5,
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
  /** A soft column of white, brightest at its foot, for the rarest drops. */
  lightPillar: "tex-light-pillar",
  /** A soft white dot, for light that gathers and bursts. */
  glow: "tex-glow",
  /** The 계정 icon on the title: a head and shoulders. */
  account: "tex-account",
  filter: "tex-filter",
  tuning: "tex-tuning",
  grid: "tex-grid",
  player: "tex-player",
  enemy: "tex-enemy",
  enemyBrute: "tex-enemy-brute",
  enemyRunner: "tex-enemy-runner",
  enemyShooter: "tex-enemy-shooter",
  enemyBoss: "tex-enemy-boss",
  enemyFugitive: "tex-enemy-fugitive",
  enemyErratic: "tex-enemy-erratic",
  enemyChimera: "tex-enemy-chimera",
  thorn: "tex-thorn",
  enemyShot: "tex-enemy-shot",
  projectile: "tex-projectile",
  iceShard: "tex-ice-shard",
  voidOrb: "tex-void-orb",
  potion: "tex-potion",
  gem: "tex-gem",
  skillOrb: "tex-skill-orb",
  gear: "tex-gear",
  boneSkull: "tex-bone-skull",
  boneRib: "tex-bone-rib",
  boneSpine: "tex-bone-spine",
  altar: "tex-altar",
  mango: "tex-mango",
  /** 철광석, and the padlock a 잠금 weapon wears in the 분해 grid (0.90). */
  ore: "tex-ore",
  lock: "tex-lock",
  drone: "tex-drone",
  voidVortex: "tex-void-vortex",
  magnet: "tex-magnet",
  orbTransmute: "tex-orb-transmute",
  orbChaos: "tex-orb-chaos",
  orbAwaken: "tex-orb-awaken",
  orbExplode: "tex-orb-explode",
  orbMango: "tex-orb-mango",
  passive: "tex-passive",
  trophy: "tex-trophy",
  /** 거미줄's slow, as an icon among the survivor's effects. */
  webIcon: "tex-web-icon",
  /** 2위 and 3위: the same cup in silver and bronze. */
  trophySilver: "tex-trophy-silver",
  trophyBronze: "tex-trophy-bronze",
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
  // Drawn at boot: a fist, so it is not mistaken for the sword in hand (a sword until 2026-10-16).
  meleeStrike: { key: 'tex-skill-meleeStrike-fist' },
  fireball: { file: 'assets/icons/skill-fireball.png', key: 'tex-skill-fireball' },
  chainLightning: { file: 'assets/icons/skill-chainLightning.png', key: 'tex-skill-chainLightning' },
  iceSpear: { file: 'assets/icons/skill-iceSpear.png', key: 'tex-skill-iceSpear' },
  voidOrb: { file: 'assets/icons/skill-voidOrb.png', key: 'tex-skill-voidOrb' },
  // No file: drawn at boot until the pack has a bolt that fits.
  thunderStrike: { key: 'tex-skill-thunderStrike' },
  // Drawn at boot: a little quadcopter (0.94).
  drone: { key: 'tex-skill-drone' },
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
    /** 희귀 (0.91): a yellow name, a size up from 마법, no pillar. */
    rare: {
      fontSize: "23px",
      text: "#ffd84a",
      plate: 0x000000,
      plateAlpha: 0,
      border: 0x000000,
      borderWidth: 0,
      outlined: true,
      pulse: 0,
    },
    /** 신화 (0.91): what 희귀 looked like before — the loudest there is. */
    mythic: {
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

/**
 * The sign-in buttons, each in its provider's own colours — what players
 * look for on a sign-in page, so it is what they are given here.
 */
export const ACCOUNT_BUTTONS: Record<string, { readonly fill: number; readonly text: string; readonly edge: number }> = {
  google: { fill: 0xffffff, text: '#1f1f1f', edge: 0xdadce0 },
  facebook: { fill: 0x1877f2, text: '#ffffff', edge: 0x1877f2 },
  twitter: { fill: 0x000000, text: '#ffffff', edge: 0x5b6170 },
  test: { fill: 0x2b3445, text: '#f4f1e8', edge: 0x5ea8ff },
};

/**
 * A pillar of pale light standing on a 희귀 drop, the way a rare item is
 * marked in a loot game: seen from anywhere on the screen, before the label
 * is. Only the drops whose label is the 희귀 tier stand in one.
 */
/** 하얀 망고's clock: a ring round the survivor that runs down as it does. */
export const MANGO_RING = {
  /** Its radius, from the survivor's middle. */
  radius: 22,
  width: 4,
  /** The whole ring, faint, under what is left of it. */
  trackAlpha: 0.25,
} as const;

export const LIGHT_PILLAR = {
  /** Drawn size; the texture is soft at its edges and fades to its top. */
  width: 34,
  height: 260,
  /** How see-through it is, at rest and at the top of its breath. */
  alpha: 0.32,
  alphaPeak: 0.5,
  /** One breath, in and out. */
  pulseMs: 1400,
  /** How far below the item's centre its foot is. */
  footOffset: 6,
} as const;

/**
 * 장비 합성: the light that leaves each sword offered, gathers in one place,
 * shines, and either bursts or flashes. Timings in milliseconds.
 */
export const COMBINE_FX = {
  /** How long the light takes to travel from the swords to the meeting point. */
  gatherMs: 300,
  /**
   * How long it shines there before the result. Three seconds at first; the
   * user found the whole thing far too long (2026-10-16), so all of it is
   * under half what it was — about two seconds from press to result.
   */
  chargeMs: 1100,
  /** The burst on a failure, and the flash on a success. */
  burstMs: 400,
  flashMs: 380,
  /** How the new sword pops in on a success. */
  popMs: 280,
  /** How long the result is held on screen before the inventory comes back. */
  holdMs: 350,
  /** The light's colours: a warm white while it shines, gold when it takes. */
  light: 0xfff4d6,
  success: 0xffe066,
  failure: 0xff6a3d,
  smoke: 0x6b6f7a,
  /** How dark the screen goes behind it. */
  scrim: 0.6,
} as const;

/** A 구슬 spent in the 인벤토리: it flies into the weapon and the weapon answers. */
export const ORB_FX = {
  /** How long the 구슬 takes to reach the weapon's cell. */
  flyMs: 220,
  /** The burst where it lands, in the 구슬's own colour. */
  burstMs: 300,
  /** How long the lines it changed stay lit once the screen is drawn again. */
  highlightMs: 1500,
  /** How strongly they are lit to begin with. */
  highlightAlpha: 0.38,
  /** A 폭발의 구슬 that went off. */
  destroyed: 0xff4a2a,
} as const;

/** 전투 알림: toasts in the top-right corner (systems/Toasts.ts). */
export const TOAST = {
  /** How long one stays before it fades. */
  lifeMs: 2000,
  fadeMs: 250,
  /** How many at once; past it the oldest goes. */
  max: 5,
  /** From the right edge, and from the top on a wide screen. */
  margin: 12,
  top: 12,
  /** On a narrow screen the clock and loadout take the top, so the stack starts under them. */
  narrowTop: 112,
  maxWidth: 300,
  narrowMaxWidth: 220,
  padding: 10,
  gap: 6,
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
  /**
   * What is acting on the survivor (장비, 패시브, 뼈다귀, 버프, 디버프), as
   * icons left of the skills: their size, the gap between two, and the gap
   * before the first skill. Without the room beside the skills they take a
   * row under them instead.
   */
  effectSlot: 28,
  effectGap: 4,
  effectsToSkills: 12,
  /** An effect's edge: a buff and a debuff say which they are by colour. */
  effectEdge: { buff: 0x7ef0b0, debuff: 0xe0564a } as const,
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
    rare: 0xf2c94c,
    mythic: 0xff4a4a,
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
/** 패시브's tree: how its nodes are drawn. */
export const PASSIVE_TREE = {
  /** A node's radius at most; it shrinks to fit a short or narrow window. */
  nodeRadius: 32,
  /** The root is this much bigger than a node. */
  rootScale: 1.2,
  /** The ring that fills as ranks are bought. */
  ringWidth: 5,
  ringTrack: 0x2b3445,
  ringFill: 0xffd34d,
  /** The edge round a node a point can go into now. */
  buyable: 0x7ef0b0,
  /** Branches: one that has a rank in it, one that is open, one that is shut. */
  edgeLit: 0xffd34d,
  edgeOpen: 0x6b7385,
  edgeShut: 0x2b3445,
  edgeWidth: 3,
  /** A shut node is drawn this faint. */
  shutAlpha: 0.4,
  /** The furthest apart two rows of the tree are drawn. */
  maxLevelGap: 120,
  /**
   * The closest they are drawn, along the tree and across it. A tree that
   * would need less runs off its window instead, and is dragged about.
   */
  minLevelGap: 96,
  minLeafGap: 92,
  /** How far past the tree's edge it can be dragged, in px. */
  dragMargin: 24,
} as const;

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
  championGap: 28,
  /** First place to the line under it with second and third, which adds this much. */
  podiumGap: 26,
  /** First place shines: its glow breathes between these, and a spark rises this often. */
  championGlow: { min: 2, max: 12, periodMs: 1100, color: '#ffb300' },
  championSparkMs: 240,
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

/**
 * The square a look is drawn on: the 32-unit figure set `inset` in from
 * each edge, so a prop thrust forward in a cast stays on the canvas.
 * PLAYER_LOOK.drawn is the whole square's size on screen.
 */
export const LOOK_CANVAS = { size: 56, inset: 12 } as const;

/** What a survivor carries in its look: drawn by BootScene.createLookTextures. */
export type LookProp = 'none' | 'sword' | 'staff' | 'wand' | 'spear' | 'orb' | 'rod' | 'remote';

export interface PlayerLook {
  /** The robe or tunic, its trim (belt, cuffs, hem), and the hood or hair. */
  readonly robe: number;
  readonly trim: number;
  readonly hood: number;
  readonly prop: LookProp;
  /** What the prop glows with (a staff's ember, a wand's spark). */
  readonly glow: number;
}

/**
 * ★ 외형 (0.76, the user's ask): the survivor is drawn as a figure, dressed
 * for the run's main skill — the look changes the moment it is taken. Before
 * that (and for a skill not listed) it wears `base`. A new skill gets a look
 * by a line here; BootScene draws every one.
 */
export const PLAYER_LOOK: {
  /** Drawn size, px; the body for hits stays PLAYER.size. */
  readonly drawn: number;
  readonly base: PlayerLook;
  readonly bySkill: Readonly<Record<string, PlayerLook>>;
} = {
  // The whole LOOK_CANVAS square: 30 for the 32-unit figure before the
  // canvas grew room for the cast (0.82), so the figure is drawn as large.
  drawn: 30 * (LOOK_CANVAS.size / 32),
  base: { robe: 0x6a7385, trim: 0x3a4152, hood: 0x4a3a2a, prop: 'none', glow: 0xffffff },
  bySkill: {
    meleeStrike: { robe: 0x8a5a3c, trim: 0xc0c6d0, hood: 0x9aa3b0, prop: 'sword', glow: 0xe8edf7 },
    fireball: { robe: 0xb3322a, trim: 0xf0a040, hood: 0x7a1e18, prop: 'staff', glow: 0xff8a3d },
    chainLightning: { robe: 0x2f5fb3, trim: 0x9bd3ff, hood: 0x1f3f7a, prop: 'wand', glow: 0x9bd3ff },
    iceSpear: { robe: 0xbfe3ff, trim: 0x5aa0e0, hood: 0x7fb8e8, prop: 'spear', glow: 0xd6f2ff },
    voidOrb: { robe: 0x4b2a7a, trim: 0xb07cff, hood: 0x2a1748, prop: 'orb', glow: 0xb07cff },
    thunderStrike: { robe: 0x2a2f55, trim: 0xf0d050, hood: 0x1a1d38, prop: 'rod', glow: 0xf0d050 },
    // 0.94: an engineer in green, a remote in hand.
    drone: { robe: 0x3d5a4a, trim: 0x7fe0c0, hood: 0x24382e, prop: 'remote', glow: 0x7fe0c0 },
  },
};


/** One pose a look is drawn in (BootScene.drawLook). */
export interface LookPose {
  readonly key: string;
  /** How far the front leg is ahead, px (the back one as far behind). */
  readonly stride: number;
  /** How far the body rises, px (negative is up). */
  readonly bob: number;
  /** Where the hand is, and the way what it holds points (degrees, 0 is forward, -90 up). */
  readonly hand: readonly [number, number];
  readonly angle: number;
  /** How high an orb is raised above the hand. */
  readonly lift: number;
  /** The flash at the prop's tip: its radius, 0 for none. */
  readonly flash: number;
}

/**
 * ★ 외형 동작 (0.82, the user's ask): the survivor walks, and swings or
 * thrusts what it carries each time the main skill goes off. `idle` is the
 * look standing; `walk0`–`walk3` the walk; `windup` and `release` the cast.
 */
export const LOOK_POSES: readonly LookPose[] = [
  { key: 'idle', stride: 0, bob: 0, hand: [25, 15], angle: -90, lift: 0, flash: 0 },
  { key: 'walk0', stride: 3, bob: 0, hand: [25, 15], angle: -84, lift: 0, flash: 0 },
  { key: 'walk1', stride: 0, bob: -1, hand: [25, 14], angle: -90, lift: 1, flash: 0 },
  { key: 'walk2', stride: -3, bob: 0, hand: [25, 15], angle: -96, lift: 0, flash: 0 },
  { key: 'walk3', stride: 0, bob: -1, hand: [25, 14], angle: -90, lift: 1, flash: 0 },
  { key: 'windup', stride: 0, bob: 0, hand: [22, 10], angle: -125, lift: 3, flash: 0 },
  { key: 'release', stride: 1, bob: 0, hand: [26, 16], angle: -25, lift: 5, flash: 3 },
];

/** How the poses are played: the walk's order and pace, the cast's poses and how long each is held. */
export const LOOK_ANIM = {
  walk: ['walk0', 'walk1', 'walk2', 'walk3'],
  walkFps: 8,
  cast: [
    { pose: 'windup', ms: 70 },
    { pose: 'release', ms: 150 },
  ],
} as const;

/** One pose of one look: `id` a skill in PLAYER_LOOK.bySkill, or `base`. */
export const lookFrame = (id: string, pose: string): string => `tex-look-${id}-${pose}`;

/** A look's texture standing still. */
export const lookTexture = (id: string): string => lookFrame(id, 'idle');

/** A look's walk or cast animation. */
export const lookAnim = (id: string, kind: 'walk' | 'cast'): string => `look-${id}-${kind}`;

/** 감전 (낙뢰 각성): the sparks that crackle round a shocked enemy. */
export const SHOCK_FX = {
  color: 0xf0d050,
  sparks: 4,
  /** How far out from the body's edge they start, px. */
  gap: 2,
  /** How far each kink strays. */
  jag: 7,
  /** How often they are thrown again — the flicker. */
  redrawMs: 70,
} as const;


/** 공허구체 각성's 공허: a purple vortex, drawn by BootScene.createVortexTexture. */
export const VOID_VORTEX_FX = {
  /** Its arms' colours, outer to inner, and the dark eye. */
  arms: [0x6b2fbf, 0x9b5cff, 0xd2b0ff],
  eye: 0x1a0830,
  /** Spiral arms, and how far each winds round (turns). */
  armCount: 4,
  winds: 1.1,
  spinPerSecond: 5,
  fadeMs: 250,
  /** How solid it is at its fullest: the field under it still shows. */
  alpha: 0.7,
} as const;

/** A 제단 being summoned: a red pillar (the light pillar's picture, tinted) comes down on the spot. */
export const ALTAR_SUMMON_FX = {
  tint: 0xff2a2a,
  width: 46,
  height: 300,
  alpha: 0.85,
  /** How long it takes to reach the ground, and how long it fades once the 제단 is there. */
  dropMs: 260,
  fadeMs: 420,
} as const;

/** A posed enemy's picture for a pose (EnemyKindSpec.poses): the kind's texture, or that with the pose's name. */
export type EnemyPose = 'stand' | 'leap' | 'cast';
export const enemyPose = (texture: string, pose: EnemyPose): string => (pose === 'stand' ? texture : `${texture}-${pose}`);

/**
 * 알수없는 룬's looks (0.89): the 룬 stones of 0.71–0.79, as they were drawn
 * then — 반복, 분열, 관통, 연쇄, 확장, 지속, 가속, 포격 — a dark stone with
 * its edge and its mark in its colour. Each drop wears one at random. The
 * mark is strokes from (x1, y1) to (x2, y2) on a 0–1 square.
 */
export const UNKNOWN_RUNE_LOOKS: readonly {
  readonly color: number;
  readonly glyph: readonly (readonly [number, number, number, number])[];
}[] = [
  { color: 0xf0d050, glyph: [[0.2, 0.3, 0.8, 0.3], [0.2, 0.5, 0.8, 0.5], [0.2, 0.7, 0.8, 0.7]] },
  { color: 0x5cb85c, glyph: [[0.5, 0.85, 0.5, 0.5], [0.5, 0.5, 0.2, 0.15], [0.5, 0.5, 0.8, 0.15]] },
  { color: 0x7fb8e8, glyph: [[0.15, 0.5, 0.85, 0.5], [0.6, 0.3, 0.85, 0.5], [0.6, 0.7, 0.85, 0.5], [0.35, 0.25, 0.35, 0.75]] },
  { color: 0x9bd3ff, glyph: [[0.2, 0.2, 0.45, 0.45], [0.45, 0.45, 0.3, 0.6], [0.3, 0.6, 0.8, 0.8], [0.55, 0.2, 0.8, 0.45]] },
  { color: 0xf0ad4e, glyph: [[0.5, 0.15, 0.5, 0.85], [0.15, 0.5, 0.85, 0.5], [0.25, 0.25, 0.75, 0.75], [0.75, 0.25, 0.25, 0.75]] },
  { color: 0x9b6bff, glyph: [[0.25, 0.2, 0.75, 0.2], [0.25, 0.8, 0.75, 0.8], [0.3, 0.2, 0.7, 0.8], [0.7, 0.2, 0.3, 0.8]] },
  { color: 0x6aa9ff, glyph: [[0.15, 0.35, 0.6, 0.35], [0.15, 0.65, 0.6, 0.65], [0.6, 0.2, 0.85, 0.5], [0.85, 0.5, 0.6, 0.8]] },
  { color: 0xd45f3a, glyph: [[0.3, 0.85, 0.7, 0.85], [0.35, 0.85, 0.35, 0.45], [0.65, 0.85, 0.65, 0.45], [0.35, 0.45, 0.65, 0.45], [0.5, 0.45, 0.8, 0.15]] },
];

/** The picture of one of those looks. */
export const unknownRuneTexture = (look: number): string => `tex-unknown-rune-${look}`;
