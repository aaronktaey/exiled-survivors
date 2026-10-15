/**
 * The shape every locale fills in.
 *
 * Entries are plain data, never code: a line that needs a number carries a
 * {placeholder} and the caller fills it. Korean particles are placeholders
 * too — {이가} and {을를} resolve from the {skill} or {name} beside them —
 * so a translator never has to touch TypeScript.
 */
export type Language = 'ko' | 'en' | 'ja' | 'zh';

/** One card of the guide as a locale writes it: a title and its lines. */
export interface GuideCardCopy {
  readonly title: string;
  readonly lines: readonly string[];
}

/** The guide's chapters, down the contents list. */
export type GuideChapterId = 'basics' | 'combat' | 'skills' | 'enemies' | 'items' | 'progress';

/**
 * Every tab that is written out in prose. The 스킬 chapter's tabs are the
 * skills themselves, named by the skills, so they are not here.
 */
export type GuideTabId =
  | 'goal'
  | 'controls'
  | 'mobile'
  | 'saving'
  | 'levels'
  | 'getSkills'
  | 'damage'
  | 'common'
  | 'boss'
  | 'fugitive'
  | 'rares'
  | 'difficulty'
  | 'dropRules'
  | 'field'
  | 'gear'
  | 'affixes'
  | 'orbs'
  | 'bones'
  | 'passives'
  | 'inventory'
  | 'ranking';

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
    /** Said plainly: separate lines today, a tree later. */
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
    /** The base's 고정 속성, beside its attack power. {text} is what it does. */
    readonly implicit: string;
    /** 합성: the button, while picking ({n}/{count}), and once ready to run. */
    readonly combine: string;
    readonly combinePick: string;
    readonly combineGo: string;
    /** The line under the buttons while picking: {gear}, {n}, {count}. */
    readonly combineHint: string;
    /** ...and once enough are picked: {chance}, {target}, {count}. */
    readonly combineReady: string;
    /** Why a 합성 cannot start from this sword. */
    readonly combineEquipped: string;
    readonly combineTop: string;
    readonly combineShort: string;
    /** What came of it: {gear} made, or {count} of {gear} lost. */
    readonly combineSuccess: string;
    readonly combineFail: string;
    /** What a weapon with no affixes says. */
    readonly plain: string;
  };

  /** 인벤토리 — the tabs everything kept between runs lives in. */
  readonly inventory: {
    readonly title: string;
    readonly tabGear: string;
    readonly tabConsumables: string;
    /** In the details pane when the cursor has nothing under it. */
    readonly empty: string;
    /** How many of a stackable thing are held. */
    readonly held: string;
    /** Where a 구슬 is spent, and when a 뼈다귀 is. */
    readonly orbUse: string;
    readonly boneUse: string;
    /** {keys} is the 구슬 keys, "1~4". */
    readonly hintGear: string;
    readonly hintConsumables: string;
    readonly hintTouch: string;
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

  /** 랭킹 — the board, the line under the logo, and entering a name. */
  readonly ranking: {
    readonly title: string;
    /** The icon's label on the title screen. */
    readonly icon: string;
    readonly empty: string;
    /** Column heads. */
    readonly place: string;
    readonly name: string;
    readonly damage: string;
    /** Under the logo: {name} and {damage} of first place. */
    readonly champion: string;
    /** The name-entry popup. {place} is where the run would land. */
    readonly entryTitle: string;
    readonly entryLead: string;
    readonly confirm: string;
    readonly skip: string;
    readonly entryHintKeyboard: string;
    readonly entryHintTouch: string;
    /** The end screen's row, before and after a name went in. */
    readonly register: string;
    readonly registered: string;
    /** A board shared between players is coming; this one is this device's. */
    readonly localNote: string;
    /** Under the board while it is the shared one, fetching it, or unreachable. */
    readonly sharedNote: string;
    readonly loadingNote: string;
    readonly offlineNote: string;
  };

  /** 무작위 스킬 — three skills on cards, one to take. */
  readonly skillPick: {
    /** A run's first skill. */
    readonly startTitle: string;
    readonly startSubtitle: string;
    /** A 무작위 스킬 walked over. */
    readonly dropTitle: string;
    readonly dropSubtitle: string;
    /** Its name on the ground. */
    readonly drop: string;
    /** On a card: not held yet, or held at {level}. */
    readonly new: string;
    readonly upgrade: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
  };

  /** 슬롯머신 — the reel a new run spins for its first skill. */
  readonly slot: {
    /** Over the reel when a run starts. */
    readonly startTitle: string;
    readonly startSubtitle: string;
    readonly confirm: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
    /** Banner once the skill is in hand: {skill} is its name. */
    readonly won: string;
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
    /** Damage per second, counting everything the skill touches. */
    readonly dps: string;
    /**
     * The lines of a skill's hover card, which spell its DPS out the way the
     * run computes it. {placeholders} are filled with the live numbers.
     */
    readonly formulaDamage: string;
    readonly formulaRate: string;
    /** Added to the rate line while a 하얀 망고 is working. */
    readonly formulaMango: string;
    /** Appended to the damage line when the skill's balance dial is not 1. */
    readonly formulaScale: string;
    /** Appended to the damage line when the weapon's 고정 속성 scales damage. */
    readonly formulaGearScale: string;
    /** A line of its own when the cooldown floor holds the rate down. */
    readonly formulaCap: string;
    readonly formulaTargets: string;
    readonly targetChain: string;
    readonly targetPierce: string;
    readonly targetOrbs: string;
    /** "× 투사체 {n}": every shot of a cast counted, with an extra projectile. */
    readonly targetShots: string;
    readonly formulaDps: string;
    readonly formulaNote: string;
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
    /** 하얀 망고: its name on the ground, and what is shouted when eaten. */
    readonly mango: string;
    readonly mangoEaten: string;
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
    /** The guide's own, which has chapters and tabs to walk as well. */
    readonly guideHintKeyboard: string;
    readonly guideHintTouch: string;
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
    /** A weapon's line at one rung: "Damage +{value}%". Korean reads the table. */
    readonly affixGearDetails?: Record<string, string>;
    readonly bones?: Record<string, string>;
    readonly boneShorts?: Record<string, string>;
    readonly boneDetails?: Record<string, string>;
    readonly orbs?: Record<string, string>;
    readonly orbShorts?: Record<string, string>;
    readonly orbDetails?: Record<string, string>;
    readonly gear?: Record<string, string>;
    /** A base's 고정 속성, with {value} and {skill}. Korean reads the table. */
    readonly gearImplicits?: Record<string, string>;
    readonly passives?: Record<string, string>;
    readonly passiveDetails?: Record<string, string>;
  };

  /**
   * 게임 가이드: chapters down the side, tabs across each chapter, cards on
   * each tab. The builder fills every {placeholder} from the live config, so
   * a number is never written here.
   */
  readonly guideChapters: Record<GuideChapterId, string>;
  readonly guideTabs: Record<GuideTabId, string>;

  readonly guide: {
    /** The prose each tab opens on; the cards built from tables follow it. */
    readonly cards: Record<GuideTabId, readonly GuideCardCopy[]>;
    /** The pieces the cards built from the tables are put together from. */
    readonly labels: {
      /** "피해 {damage} · 초당 {rate}회 · DPS {dps}" */
      readonly skillStats: string;
      readonly skillRange: string;
      /** For a skill that throws: its speed, and that reach follows it. */
      readonly skillProjectile: string;
      readonly skillUpgrades: string;
      /** When the per-skill balance dial is not 1. */
      readonly skillScale: string;
      readonly enemyStats: string;
      readonly fromStart: string;
      readonly unlocksAt: string;
      /** A 사수's bolt: {damage}, {every} seconds, {range} px. */
      readonly shot: string;
      /** A 우두머리's ring: {count} bolts of {damage}, every {every} seconds. */
      readonly volley: string;
      /** A line each on how that kind behaves, keyed by enemy kind. */
      readonly enemyNotes: Record<string, string>;
      /** What an 속성 does on a rare: {detail}. */
      readonly affixEnemy: string;
      /** What it does on a weapon, rung by rung: {ladder}. */
      readonly affixWeapon: string;
      /** One rung of that ladder: {tier}, {value}. */
      readonly affixRung: string;
      readonly affixRangedOnly: string;
      readonly affixWeaponOnly: string;
      readonly affixEnemyOnly: string;
      /** Drop chances: off any kill, off a 우두머리 only. */
      readonly chanceKill: string;
      readonly chanceBoss: string;
      readonly gearTier: string;
      readonly gearImplicit: string;
      /** Its share of what a 우두머리 leaves: {share}. */
      readonly gearBossShare: string;
      readonly gearFromKill: string;
      readonly gearBossOnly: string;
      readonly boneStack: string;
      readonly boneSingle: string;
      /** {detail} a rank, up to {max} ranks. */
      readonly passiveRank: string;
    };
  };
}
