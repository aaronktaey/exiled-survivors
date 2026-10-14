/**
 * The shape every locale fills in.
 *
 * Entries are plain data, never code: a line that needs a number carries a
 * {placeholder} and the caller fills it. Korean particles are placeholders
 * too — {이가} and {을를} resolve from the {skill} or {name} beside them —
 * so a translator never has to touch TypeScript.
 */
export type Language = 'ko' | 'en' | 'ja' | 'zh';

export interface GuideBlock {
  readonly heading: string;
  readonly lines: readonly string[];
}

export interface Strings {
  /** What this language calls itself, for the 설정 row. */
  readonly native: string;

  readonly common: {
    readonly back: string;
    readonly close: string;
    readonly on: string;
    readonly off: string;
  };

  /** 패시브: the tree, its currency, and the icon it is reached by. */
  readonly passives: {
    readonly title: string;
    /** Points in hand, waiting to be spent. */
    readonly points: string;
    /** Progress towards the next one: {held} of {need} shards. */
    readonly shards: string;
    /** A line's rank, as "3 / 10". */
    readonly rank: string;
    readonly maxed: string;
    readonly spend: string;
    /** Shown when there is nothing to spend. */
    readonly noPoints: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
    /** What one 신성한 조각 is called, over it on the ground. */
    readonly shardName: string;
    /** The shop row: a shard for {price} gold. */
    readonly buyShard: string;
    /** Gold in the purse. */
    readonly goldHeld: string;
    /** Said plainly: three lines today, a tree later. */
    readonly temporary: string;
  };

  readonly menu: {
    readonly byline: string;
    readonly start: string;
    readonly load: string;
    readonly noSave: string;
    readonly settings: string;
    readonly gear: string;
    readonly guide: string;
    readonly patch: string;
    readonly credits: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
  };

  readonly settings: {
    readonly title: string;
    readonly padSize: string;
    readonly movement: string;
    readonly modeFloating: string;
    readonly modeTilt: string;
    readonly bgm: string;
    readonly reset: string;
    readonly hint: string;
    readonly hintFloating: string;
    readonly hintTilt: string;
    readonly tiltRefused: string;
    /** Says the other way of steering exists. {mode} is its name. */
    readonly modeOther: string;
    /** Why the Language row is dim while a run is going. */
    readonly languageTitleOnly: string;
  };

  /** 장비창, and the words a rolled weapon is described with. */
  readonly gear: {
    readonly title: string;
    /** The weapon in hand, above the list. */
    readonly wearing: string;
    readonly equipped: string;
    readonly equip: string;
    /** The button that throws one away, and what it says once it is armed. */
    readonly discard: string;
    readonly discardConfirm: string;
    /** The 구슬 buttons: "변화 x3", and what one press asks before acting. */
    readonly orbCount: string;
    readonly orbConfirm: string;
    /** Shown when the stash holds none of a 구슬 at all. */
    readonly orbNone: string;
    /** What a 구슬 just did, said out loud afterwards. */
    readonly orbRerolled: string;
    readonly orbAdded: string;
    readonly orbUpgraded: string;
    readonly orbDestroyed: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
    /** Shown instead, while a saved run has a weapon in hand. */
    readonly lockedHint: string;
    /** "접두어" / "접미어", heading the slots of each kind. */
    readonly prefix: string;
    readonly suffix: string;
    /** Which rung an 속성 rolled. {tier} is the number; 1 is the best. */
    readonly tier: string;
    /** How a rolled name wears an affix. {affix} is its name. */
    readonly prefixWord: string;
    readonly suffixWord: string;
    /** The weapon's own line: flat attack power it adds to every skill. */
    readonly attack: string;
    /** ...and the attack speed beside it, when it has any. */
    readonly attack2: string;
    /** What a weapon with no affixes says. */
    readonly plain: string;
  };

  /** 뼈다귀 — the screen that decides what a run is going to be. */
  readonly bones: {
    readonly title: string;
    /** The line under the title, saying what this screen is for. */
    readonly lead: string;
    /** A row: "{bone} x{count}". */
    readonly held: string;
    /** The right-hand value on a row already in a slot. */
    readonly inUse: string;
    readonly clear: string;
    readonly start: string;
    /** Heading over the slots. */
    readonly slots: string;
    /** What the lot of them comes to. */
    readonly total: string;
    readonly none: string;
    readonly sumHp: string;
    readonly sumDrop: string;
    readonly sumBosses: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
  };

  readonly pause: {
    readonly title: string;
    readonly survived: string;
    readonly resume: string;
    readonly quit: string;
    readonly hint: string;
  };

  readonly gameOver: {
    readonly title: string;
    readonly survived: string;
    /** The table: what the run dealt, killed, earned, and was carrying. */
    readonly damageDealt: string;
    readonly killsDealt: string;
    readonly goldEarned: string;
    /** One skill's line: "타격 Lv 3 · DPS 21". */
    readonly skillLine: string;
    readonly retry: string;
    readonly toTitle: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
  };

  readonly upgrade: {
    readonly levelUp: string;
    readonly level: string;
    readonly acquired: string;
    readonly enhanced: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
  };

  readonly hud: {
    readonly level: string;
    readonly enemies: string;
    /** Damage one hit lands. */
    /** Damage per second, counting everything the skill touches. */
    readonly dps: string;
  };

  readonly game: {
    readonly intro: string;
    readonly introHintKeyboard: string;
    readonly introHintTouch: string;
    /** Banner when a piece of 장비 is walked over. {gear} is its name. */
    readonly gearFound: string;
    /** Shouted when a 구슬 is walked over. */
    readonly orbFound: string;
    /** And when a 뼈다귀 is. */
    readonly boneFound: string;
    /** 신성한 조각 picked up: {held} of {need} towards the next 구슬. */
    readonly shardFound: string;
    /** ...and the one that completed it. */
    readonly orbMade: string;
    readonly pickedUp: string;
    readonly enhancedPickup: string;
    /** The plate over a 제단: {enemies} is what it will call up. */
    readonly altarOffer: string;
    /** One offer's crowd: {kind} is the enemy's name, {count} how many. */
    readonly altarCrowd: string;
    /** ...and the same, when every one of them comes up rare. */
    readonly altarCrowdRare: string;
    /** Shouted when one wakes. */
    readonly altarWoke: string;
  };

  readonly rare: {
    readonly title: string;
  };

  readonly info: {
    readonly patchTitle: string;
    readonly guideTitle: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
  };

  readonly credits: {
    readonly title: string;
    readonly roleAuthor: string;
    readonly roleDev: string;
    readonly roleEngine: string;
  };

  /** The one question the game asks before throwing a save away. */
  readonly confirm: {
    readonly newRunTitle: string;
    readonly newRunBody: string;
    readonly startAnyway: string;
    readonly loadInstead: string;
    readonly cancel: string;
  };

  /** Upgrade picks. {n} is the step, {skill} the skill being upgraded. */
  readonly upgrades: Record<
    | 'damage'
    | 'attackSpeed'
    | 'range'
    | 'projectileSpeed'
    | 'orbitSpeed'
    | 'chainCount'
    | 'pierceCount'
    | 'orbCount',
    { readonly label: string; readonly detail: string }
  >;

  /**
   * Display names for the things the game data already names in Korean.
   * A locale lists only what it renames; anything missing falls back to the
   * Korean in the data, which keeps ko.ts from repeating itself.
   */
  readonly names?: {
    readonly skills?: Record<string, string>;
    readonly skillSummaries?: Record<string, string>;
    readonly tags?: Record<string, string>;
    readonly enemies?: Record<string, string>;
    readonly affixes?: Record<string, string>;
    readonly affixDetails?: Record<string, string>;
    /** Only for the 속성 whose weapon side reads differently. */
    readonly affixGearDetails?: Record<string, string>;
    readonly bones?: Record<string, string>;
    readonly boneShorts?: Record<string, string>;
    readonly boneDetails?: Record<string, string>;
    readonly orbs?: Record<string, string>;
    readonly orbShorts?: Record<string, string>;
    readonly orbDetails?: Record<string, string>;
    readonly gear?: Record<string, string>;
    readonly passives?: Record<string, string>;
    readonly passiveDetails?: Record<string, string>;
  };

  /** 게임 가이드. The builder fills the placeholders from the live config. */
  /** Chapter names for the guide's table of contents. */
  readonly guideChapters: {
    readonly goal: string;
    readonly controls: string;
    readonly growth: string;
    readonly skills: string;
    readonly enemies: string;
  };

  readonly guide: {
    readonly goal: GuideBlock;
    readonly controls: GuideBlock;
    readonly mobile: GuideBlock;
    readonly growth: GuideBlock;
    readonly skills: { readonly heading: string; readonly stats: string; readonly upgrades: string; readonly starter: string };
    readonly enemies: {
      readonly heading: string;
      readonly stats: string;
      readonly fromStart: string;
      readonly unlocksAt: string;
      /** A line each on how that kind behaves, keyed by enemy kind. */
      readonly notes: Record<string, string>;
    };
    readonly rares: { readonly heading: string; readonly lines: readonly string[] };
    readonly drops: { readonly heading: string; readonly lines: readonly string[] };
    readonly saving: GuideBlock;
  };
}
