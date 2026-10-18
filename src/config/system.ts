import type { SkillId } from '@/weapons/skills';

/**
 * Engine wiring: canvas and world size, scene keys, where saves and
 * settings live, frame pacing, and the paths to the audio files. These are
 * plumbing rather than tuning.
 */

export const GAME_WIDTH = 960;

export const GAME_HEIGHT = 540;

/** The arena is larger than the viewport; the camera follows the player. */
export const WORLD = {
  width: 2400,
  height: 2400,
} as const;

/**
 * Scene keys. They live here so two scenes can hand off to each other
 * without importing each other's class, which would be a cycle.
 */
export const SCENES = {
  boot: "BootScene",
  menu: "MenuScene",
  game: "GameScene",
  upgrade: "UpgradeScene",
  pause: "PauseScene",
  settings: "SettingsScene",
  credits: "CreditsScene",
  info: "InfoScene",
  confirm: "ConfirmScene",
  gameOver: "GameOverScene",
  inventory: "InventoryScene",
  orb: "OrbScene",
  bones: "BoneScene",
  passives: "PassiveScene",
  slot: "SlotScene",
  ranking: "RankingScene",
  skillPick: "SkillPickScene",
  rankEntry: "RankEntryScene",
  account: "AccountScene",
  conflict: "ConflictScene",
  filter: "FilterScene",
  tuning: "TuningScene",
  podium: "PodiumScene",
} as const;

/** Keys the browser keeps our state under. Bump the suffix to invalidate. */
export const STORAGE = {
  settings: "exiled-survivors:settings:v1",
  save: "exiled-survivors:save:v1",
  /** The equipment stash, which outlives any one run. */
  gear: "exiled-survivors:gear:v2",
  /** The passive tree, which outlives it too. */
  passives: "exiled-survivors:passives:v1",
  /** And the purse a run pays into. */
  gold: "exiled-survivors:gold:v1",
  /** The 구슬 drawer, which outlives a run beside the stash. */
  orbs: "exiled-survivors:orbs:v1",
  /** And the 뼈다귀 drawer, spent one run at a time. */
  bones: "exiled-survivors:bones:v1",
  /** The local ranking, until there is a shared one. */
  ranking: "exiled-survivors:ranking:v1",
  /** 내 기록: this player's own best runs, entered on the board or not. */
  personal: "exiled-survivors:personal:v1",
  /** The name, emoji and flag last entered on the ranking, to start on next time. */
  rankName: "exiled-survivors:rank-name:v1",
  /** 아이템 필터: the drops switched off. */
  itemFilter: "exiled-survivors:item-filter:v1",
  /** Which account this browser's records were last synced with, and when. */
  sync: "exiled-survivors:sync:v1",
  /** The board's day 어제의 랭킹 was last seen on, on this device. */
  podiumSeen: "exiled-survivors:podium-seen:v1",
  /**
   * A run waiting to be put on the ranking across a sign-in (sessionStorage:
   * it only has to outlive the trip to the provider and back).
   */
  pendingRank: "exiled-survivors:pending-rank",
} as const;

/**
 * 랭킹 — the best runs by damage dealt. Kept on this device for now; when it
 * becomes a board shared between players, the store behind it changes and
 * this shape does not.
 */
export const RANKING = {
  /** How many places it keeps. */
  size: 20,
  /** A name is up to this many letters, A to Z. */
  nameLength: 3,
  /** What the letter slots step through. The blank is "no letter here". */
  letters: ' ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  /** The one emoji a name may carry, picked from these. The blank is none. */
  emoji: ['', '😀', '😎', '🔥', '💀', '👑', '⚔️', '🐉', '👻', '🍀', '⭐', '💎', '🦊', '🐱'],
  /**
   * The flags a name may fly, by ISO code. Drawn at boot rather than written
   * as emoji: Windows has no flag emoji and would show "KR" in letters.
   * The blank is none.
   */
  flags: ['', 'KR', 'JP', 'CN', 'US', 'IN', 'TH', 'CA', 'MX', 'RU', 'TW'],
  /**
   * The board shared between players: the game's own Worker (server/), on
   * the same address as the game. When it cannot be reached the board falls
   * back to this device's records.
   */
  shared: {
    enabled: true as boolean,
    /** Same origin as the game, so it needs no CORS and no second domain. */
    url: '/api/ranking',
    /** 어제의 랭킹: the day before's first three (and `/seen` to say it was shown). */
    podiumUrl: '/api/ranking/podium',
    /**
     * The first board day 어제의 랭킹 shows (rankingDayStart, 10/18 KST): the
     * days before it were decided by hand afterwards (JSM's 10/17 cups) and
     * the board's order there no longer says who placed where.
     */
    podiumSince: 1792267200000,
    /** A request that takes longer than this is given up on. */
    timeoutMs: 6000,
    /** Above this a damage figure is not believed, and is not shown. */
    maxDamage: 1e10,
    /**
     * Turnstile's public site key: an invisible check that a person, not a
     * script, is handing a run in. Empty means no check is asked for — the
     * server only demands one once its secret is set.
     */
    turnstileSiteKey: '0x4AAAAAAFXSrV0Ay68wbrSe' as string,
  },
  /**
   * The shared board starts over every day at this hour, in the time zone
   * `utcOffsetHours` from UTC — 05:00 in Korea. 내 기록 does not.
   */
  dailyReset: { hour: 5, utcOffsetHours: 9 },
  /**
   * 이상치 검토, for the admin on the 랭킹 screen. Every run still goes on the
   * board at once; one is marked an outlier when its damage is at least
   * `factor` times the median of other accounts' runs whose length is within
   * `timeWindow` of its own (±25%), over the last `lookbackDays`. With fewer
   * than `minPeers` such runs there is nothing to compare it with, and it is
   * not marked. The Worker and the screen read the same numbers.
   */
  review: { factor: 10, timeWindow: 0.25, minPeers: 3, lookbackDays: 14 },
  /**
   * Whether the end of a run that made the board asks for a name at once.
   * The test harness turns it off so the end screen is what it expects;
   * test-ranking turns it back on.
   */
  promptOnDeath: true as boolean,
} as const;

/**
 * 실시간 업데이트 — how an open page finds out a new version is out
 * (systems/LiveUpdate.ts). It reloads only on the title screen.
 */
export const LIVE_UPDATE = {
  /** How often an open page asks. A static file: it costs nothing. */
  checkEveryMs: 5 * 60_000,
  /** The file every build ships, naming itself. */
  path: 'version.json',
  /** How long the title says it is updating before it reloads. */
  noticeMs: 1200,
} as const;

const DAY_MS = 86_400_000;

/** When the shared board's current day began, in ms since the epoch. */
export function rankingDayStart(now: number): number {
  const { hour, utcOffsetHours } = RANKING.dailyReset;
  const shift = (utcOffsetHours - hour) * 3_600_000;
  return Math.floor((now + shift) / DAY_MS) * DAY_MS - shift;
}

/** When the shared board next starts over. */
export function nextRankingReset(now: number): number {
  return rankingDayStart(now) + DAY_MS;
}

/**
 * 계정 — optional sign-in. Signed in, the player's records are copied to the
 * server and follow them between devices, and runs can go on the ranking.
 */
export const ACCOUNT = {
  enabled: true as boolean,
  /** How often a signed-in browser checks for changes to upload. */
  syncEveryMs: 20_000,
  /** A request that takes longer than this is given up on. */
  timeoutMs: 8_000,
  /** The privacy policy and data-deletion pages, served beside the game. */
  privacyUrl: '/privacy.html',
  deletionUrl: '/data-deletion.html',
  /**
   * The keys that never travel: the board is the server's, and the sync note
   * belongs to one browser.
   */
  // The admin's 밸런스 draft is this browser's experiment, not a record.
  localOnly: [
    "exiled-survivors:ranking:v1",
    "exiled-survivors:sync:v1",
    "exiled-survivors:tuning-draft:v1",
    // Written by every device each morning: synced, it would set them at odds.
    // The account keeps its own (users.podium_seen).
    "exiled-survivors:podium-seen:v1",
  ] as readonly string[],
} as const;

export const SAVE = {
  /** How often a run writes itself out while playing. */
  autosaveMs: 10_000,
} as const;

/** Bounds for the adjustable settings. */
export const SETTINGS_RANGE = {
  joystickScale: { min: 0.6, max: 1.8, step: 0.1 },
  bgmVolume: { min: 0, max: 1, step: 0.1 },
  /** Scales every effect's own volume (skills, drops, the horn, the 인벤토리's), 1 as mixed. */
  sfxVolume: { min: 0, max: 1, step: 0.1 },
} as const;

/** Tilt steering, for phones held flat-ish in two hands. */
export const TILT = {
  /** Degrees away from the held-still baseline that read as a full push. */
  fullTiltDeg: 22,
  /** Anything inside this reads as level, so a resting hand does not drift. */
  deadZoneDeg: 3.5,
  /** Smoothing on the raw sensor, 0-1 per frame. */
  smoothing: 0.25,
} as const;

/** Frame pacing. Everything in game logic runs off a clamped delta. */
export const TIMING = {
  /** Upper bound on the delta handed to game logic, in ms. */
  maxDeltaMs: 50,
} as const;

/** Enemies push each other apart instead of running full collisions. */
export const SEPARATION = {
  /**
   * How much room a pair keeps, as a share of their own two sizes. One flat
   * radius meant a 거구 sat half inside another 거구 while two 질주 had a
   * gap: the distance has to come off the pair, not off a constant.
   */
  spacing: 1.05,
  /** A floor under that, so the smallest two still do not share a pixel. */
  minDistance: 14,
  /**
   * And how much room they keep from the survivor, on the same reading of
   * their two sizes. Deliberately less than they keep from each other:
   * contact damage is an overlap, so an enemy that cannot touch the player
   * cannot hurt them either. This is enough to stop one sitting dead centre
   * on the sprite, and not enough to call off the fight.
   */
  playerSpacing: 0.6,
  /** Fraction of the overlap resolved per frame; 1 separates immediately. */
  strength: 0.7,
  /**
   * Spatial-hash cell size. Must be >= the largest distance kept above, or
   * the 3x3 lookup misses pairs: two 우두머리 want 44 x 1.05 of room.
   */
  cellSize: 48,
} as const;

export const DEBUG = {
  /**
   * The dev server opens the F1 tools to anyone; the deployed game only to an
   * account the server names (ADMIN_USERS). True here tries the deployed rule
   * on the dev server — a test does, and puts it back.
   */
  gatedInDev: false,
  /** Enemies added per press of the stress-test key. */
  stressSpawnCount: 100,
  /** Frames averaged for the frame-time readout. */
  sampleFrames: 60,
} as const;

/** How rare a drop is, which is what it sounds like when it lands. */
export type DropTier = 'normal' | 'magic' | 'rare';

export const AUDIO = {
  /**
   * What a drop sounds like, by how rare it is — Path of Exile's own ladder.
   * A weapon is normal up to two 속성, magic at three or four, rare at five
   * or six. A 신성한 조각 is rare whatever else is on the floor; a skill and
   * a potion are normal. It is the same ladder the nameplates use, so what
   * a drop looks like and what it sounds like can never disagree.
   *
   * The rare one is a single file: the hit and the swell behind it were two
   * recordings, mixed down to one so there is nothing to keep in step at
   * playback time. See assets/CREDITS.txt.
   */
  drops: {
    normal: { key: "sfx-drop-normal", file: "assets/normalDrop.mp3", volume: 0.55 },
    magic: { key: "sfx-drop-magic", file: "assets/magicDrop.mp3", volume: 0.5 },
    rare: { key: "sfx-drop-rare", file: "assets/rareDrop.mp3", volume: 0.6 },
  } as const,
  /**
   * How many 속성 a weapon needs to be the next rarity up. One ladder: it
   * is what the drop is labelled as and what it sounds like when it lands,
   * so the two can never disagree.
   */
  dropTiers: {
    magicFrom: 3,
    rareFrom: 5,
  } as const,
  /**
   * Background music. 5.6MB, so it is fetched after the menu is already on
   * screen rather than held in front of the first frame.
   */
  bgm: {
    key: "bgm-main",
    file: "assets/Constance.mp3",
    defaultVolume: 0.35,
  },
  /**
   * Per-skill sound. Several recordings for one skill are variants: each
   * use picks one at random. They are small, so they load at boot.
   */
  skills: {
    meleeStrike: {
      files: ['assets/attack1.mp3', 'assets/attack2.mp3', 'assets/attack3.mp3'],
      volume: 0.45,
    },
    chainLightning: {
      // The file is spelled "Lightening"; matched here rather than renamed.
      files: ['assets/chainLightening1.mp3'],
      volume: 0.45,
    },
    fireball: { files: ['assets/fireball.mp3'], volume: 0.4 },
    iceSpear: { files: ['assets/iceSpear.mp3'], volume: 0.4 },
    // The orbs touch something most frames, so this one is held well apart.
    voidOrb: { files: ['assets/voidSphere.mp3'], volume: 0.35, gapMs: 600 },
    // No clip of its own yet: it borrows 연쇄번개's crack, a little quieter.
    thunderStrike: { files: ['assets/chainLightening1.mp3'], volume: 0.35, gapMs: 200 },
  } as Partial<
    Record<
      SkillId,
      { readonly files: readonly string[]; readonly volume: number; readonly gapMs?: number }
    >
  >,
  /** A skill cannot be heard again inside this, however fast it attacks. */
  minGapMs: 70,
  /** The horn when a 우두머리 walks in. */
  bossAlert: {
    key: 'sfx-boss-alert',
    file: 'assets/bossAlert.mp3',
    volume: 0.6,
  },
  /**
   * The 슬롯머신, as one file in two parts: the spin (a seamless loop, for as
   * long as the reel turns) and the clunk when 확정 is pressed. Mixed from
   * the slotrunning and slotending clips in assets-src/slot by
   * tools/mix-slot.py, which prints these offsets — re-run it and copy them
   * here if the clips change. The jackpot clips there are kept for later.
   */
  slot: {
    key: 'sfx-slot',
    file: 'assets/slot.mp3',
    volume: 0.5,
    run: { start: 0, duration: 3.5 },
    stop: { start: 3.8, duration: 0.8 },
  },
} as const;

/**
 * How the canvas is sized for the window it lands in. The numbers are in
 * game units: see systems/Viewport.ts for how they are turned into a size.
 */
export const VIEWPORT = {
  /** The short side on a desktop — the shape the game was laid out in. */
  designShortSide: 540,
  /** Never smaller than this, or a menu has nowhere to go. */
  minShortSide: 420,
  /** Bounds on long ÷ short, so neither a square nor an ultrawide goes odd. */
  minAspect: 1.2,
  maxAspect: 2.2,
} as const;
