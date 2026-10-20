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
  | 'runes'
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
  /** 구슬 사용: the popup a 구슬 button opens over the 인벤토리. */
  readonly orbUse: {
    readonly title: string;
    readonly gearHeading: string;
    /** {count} of the picked 구슬 held. */
    readonly held: string;
    readonly use: string;
    readonly close: string;
    readonly ok: string;
    /** Why 사용 is greyed: none held, or it would do nothing to this weapon. */
    readonly none: string;
    readonly useless: string;
    readonly destroyedTitle: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
    /** Every rule of each kind of 구슬, its numbers filled from the table. */
    readonly rules: {
      readonly reroll: string;
      readonly add: string;
      readonly climb: string;
      readonly swap: string;
      readonly destroy: string;
      readonly noLines: string;
      readonly ward: string;
    };
  };

  /** 룬 and their 강화 슬롯 (0.74): the pause menu's 룬 screen, the 룬 끌's choice, the pickups. */
  readonly runes: {
    readonly title: string;
    readonly pauseRow: string;
    /** A skill's slots: {n} of {max}. */
    readonly slots: string;
    readonly held: string;
    readonly none: string;
    readonly empty: string;
    readonly noSlots: string;
    /** {rune} set in {skill}. */
    readonly set: string;
    readonly notFor: string;
    readonly pickSlot: string;
    /** Asked before a set 룬 is overwritten: {rune} goes. */
    readonly overwrite: string;
    /** A 룬 that does nothing for the skill cannot go in. */
    readonly cantSet: string;
    /** A 룬 just picked up asks for its skill: {rune}. */
    readonly pickTitle: string;
    readonly pickSubtitle: string;
    /** On a skill's card: a slot is free, {n} of {max} used. */
    readonly fitFree: string;
    /** On a full skill's card: {rune}, set longest ago, goes. */
    readonly fitReplace: string;
    /** Toasts: {rune} set in {skill}; and {old} pushed out of {skill}. */
    readonly fitted: string;
    readonly fittedOver: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
    readonly chisel: string;
    readonly chiselSubtitle: string;
    readonly chiselFull: string;
    /** {skill} gained a slot: {n} of {max}. */
    readonly chiselAdded: string;
    /** {rune} picked up. */
    readonly found: string;
    readonly chiselFound: string;
    /** The skills a 룬 works on: {skills}. */
    readonly worksOn: string;
    readonly worksOnAll: string;
    /** A stat limited to one tag: {tag} and {stat}. */
    readonly taggedStat: string;
    /** One modifier written out: {stat} {sign}{value}{unit}. */
    readonly statLine: string;
  };

  /** 아이템 필터: the switches for what drops, reached from the title. */
  readonly filter: {
    readonly title: string;
    /** Under the title icon. */
    readonly icon: string;
    readonly lead: string;
    readonly sections: { readonly supplies: string; readonly orbs: string; readonly bones: string; readonly rarity: string; readonly bases: string };
    readonly items: { readonly potion: string; readonly randomSkill: string; readonly mango: string; readonly magnet: string; readonly rune: string; readonly chisel: string };
    /** The same, short enough to sit under an icon. */
    readonly itemsShort: { readonly potion: string; readonly randomSkill: string; readonly mango: string; readonly magnet: string; readonly rune: string; readonly chisel: string };
    readonly rarity: { readonly normal: string; readonly magic: string; readonly rare: string };
    readonly shown: string;
    readonly hidden: string;
    readonly showAll: string;
    /** {count} switched off. */
    readonly hiddenCount: string;
    readonly allShown: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
  };
  /** 스킬 각성: what a skill does on top once it reaches SKILL_MASTERY.level. */
  readonly mastery: {
    /** The banner when it happens: {skill}. */
    readonly title: string;
    /** On the skill's card: "각성 — {effect}". */
    readonly card: string;
    /** One line a skill. {seconds} {share} {freeze} {bolts} filled from SKILL_MASTERY. */
    readonly effects: {
      readonly meleeStrike: string;
      readonly fireball: string;
      readonly chainLightning: string;
      readonly iceSpear: string;
      readonly voidOrb: string;
      readonly thunderStrike: string;
    };
  };
  /** 밸런스: the admin's dial panel. */
  readonly tuning: {
    readonly title: string;
    /** Under the title icon and on the pause menu. */
    readonly icon: string;
    readonly tabs: { readonly skills: string; readonly enemies: string; readonly drops: string };
    /** The page that holds the dials for every skill at once. */
    readonly common: string;
    readonly fields: {
      readonly damage: string;
      readonly attackSpeed: string;
      readonly range: string;
      readonly projectileSpeed: string;
      readonly chainCount: string;
      readonly pierceCount: string;
      readonly orbCount: string;
      readonly orbitSpeed: string;
      readonly damageScale: string;
    };
    /** By dial path, for the dials that are not a skill's stat or a 구슬 · 뼈다귀 · 검. */
    readonly labels: Readonly<Record<string, string>>;
    readonly cancel: string;
    readonly publish: string;
    readonly publishConfirm: string;
    readonly published: string;
    readonly publishFailed: string;
    /** The DPS line on a skill's page: {skill} in hand this run, {dps}. */
    readonly dpsRun: string;
    /** The same for a skill not in hand (or from the title): at level 1 off the dials. */
    readonly dpsBase: string;
    /** {count} dials turned on this game only. */
    readonly drafting: string;
    readonly clean: string;
    /** {when} everyone's values were last set. */
    readonly sharedAt: string;
    readonly never: string;
    readonly hint: string;
  };
  readonly menu: {
    /** Over the title while it reloads onto a new version. */
    readonly updating: string;
    readonly byline: string;
    /** The rainbow notice on the title (TITLE_NOTICE), wrapped at spaces (never at a no-break space,  ). */
    readonly notice: string;
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
    /** 효과음 음량: every sound but the music. */
    readonly sfx: string;
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
  /** 장비 in a run: the pause screen's 장비, and the popup a piece picked up opens. */
  readonly runGear: {
    readonly title: string;
    readonly slots: Record<'weapon' | 'armor' | 'accessory', string>;
    /** An empty slot: {slot}. */
    readonly emptySlot: string;
    readonly equipped: string;
    readonly orbs: string;
    readonly noOrbs: string;
    /** The 구슬 held: {list}. */
    readonly orbsHeld: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
    readonly pickTitle: string;
    readonly pickFound: string;
    readonly pickWorn: string;
    readonly pickNone: string;
    readonly pickWear: string;
    readonly pickDiscard: string;
    readonly pickHintKeyboard: string;
    readonly pickHintTouch: string;
    /** Toasts: {gear}. */
    readonly wore: string;
    /** The pause menu's row. */
    readonly pauseRow: string;
  };

  readonly gear: {
    readonly title: string;
    /** The weapon in hand, above the list. */
    readonly wearing: string;
    /** Beside 착용 중 while a saved run went out with another weapon: {name}. */
    readonly savedRunGear: string;
    readonly equipped: string;
    readonly equip: string;
    /** The button that throws one away, and what it says once it is armed. */
    readonly discard: string;
    readonly discardConfirm: string;
    /** The 팔기 button with its price: {price}. */
    readonly sellFor: string;
    /** After a sale: {gear}, {price}. */
    readonly sold: string;
    /** The 구슬 buttons: "변화 x3", and what one press asks before acting. */
    readonly orbCount: string;
    /** Shown when the stash holds none of a 구슬 at all. */
    readonly orbNone: string;
    /** What a 구슬 just did, said out loud afterwards. */
    readonly orbRerolled: string;
    readonly orbAdded: string;
    readonly orbUpgraded: string;
    readonly orbDestroyed: string;
    /** {orb}: the weapon is now in 망고 상태. */
    readonly orbWarded: string;
    /** {orb}: it would have broken, and the 망고 took the blow. */
    readonly orbSaved: string;
    /** First line of a weapon's read-out while it is in 망고 상태. */
    readonly mangoState: string;
    /** Added to an upgrade's note when the 폭발의 구슬 spent the weapon's 망고 상태. */
    readonly mangoSpent: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
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
    /** The line under the title, saying what this screen is for. {max}: how many a run takes. */
    readonly lead: string;
    readonly clear: string;
    readonly start: string;
    /** Under the slots while they are empty. */
    readonly none: string;
    readonly sumHp: string;
    readonly sumDrop: string;
    readonly sumBosses: string;
    /** {scale}: how many times as likely a rare is. */
    readonly sumRares: string;
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
    /** Why a run is on neither board: the F keys were used, or a 밸런스 experiment was on. */
    readonly devRunDebug: string;
    readonly devRunDraft: string;
    readonly title: string;
    readonly survived: string;
    /** The table: what the run dealt, killed, earned, and was carrying. */
    readonly damageDealt: string;
    readonly killsDealt: string;
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
    /** The shared board's column heads past the place: flag, skill, cups. */
    readonly flag: string;
    readonly skill: string;
    readonly trophies: string;
    readonly name: string;
    readonly damage: string;
    /** Under the logo: {name} and {damage} of first place. */
    readonly champion: string;
    /** Second and third under it on the title: {place}, {name}, {damage}. */
    readonly podium: string;
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
    readonly loadingNote: string;
    readonly offlineNote: string;
    /** On the entry popup when signing in comes first. */
    readonly loginToEnter: string;
    /** The two boards: everyone's best, and this player's own runs. */
    readonly tabShared: string;
    readonly tabPersonal: string;
    /** 내 기록's columns. */
    readonly date: string;
    readonly level: string;
    readonly time: string;
    readonly personalEmpty: string;
    readonly personalNote: string;
    readonly personalSyncedNote: string;
    /** Over the shared board: {hour} it starts over at, {left} as h:mm:ss. */
    readonly resetsIn: string;
    /** Under the board, signed in: {place} and {damage} of the account's best. */
    readonly mine: string;
    readonly mineNone: string;
    /** Said on the title after coming back signed in with a run waiting. */
    readonly enteredAfterLogin: string;
    /**
     * 랭킹 검토, the admin's only: which runs look out of line, each run's
     * 판 내역, and taking one off the board (asked twice).
     */
    readonly review: {
      readonly note: string;
      readonly title: string;
      readonly summary: string;
      readonly outlier: string;
      readonly normal: string;
      readonly unknown: string;
      readonly noDetail: string;
      readonly version: string;
      readonly resumed: string;
      readonly kills: string;
      readonly bosses: string;
      readonly bones: string;
      readonly gear: string;
      readonly skills: string;
      readonly runes: string;
      readonly none: string;
      readonly tier: string;
      readonly remove: string;
      readonly close: string;
      readonly confirmTitle: string;
      readonly confirmBody: string;
      readonly confirm: string;
      readonly cancel: string;
      readonly removed: string;
      readonly failed: string;
    };
  };

  /** 어제의 랭킹 — the day before's first three, shown once a day over the title. */
  readonly podium: {
    readonly title: string;
    /** {date}: the day the three are from. */
    readonly day: string;
    /** {level} and {time} under each place. */
    readonly stats: string;
    /** This account's place: {place} of {total}, with {damage}. */
    readonly mine: string;
    /** Signed in, but no run that day. */
    readonly mineNone: string;
    /** Signed out: there is no account to place. */
    readonly mineSignedOut: string;
    readonly ok: string;
  };

  /** 계정 — the sign-in screen, and what it says once signed in. */
  readonly account: {
    readonly title: string;
    /** The title screen's corner icon, signed out and signed in. */
    readonly iconSignedOut: string;
    readonly iconSignedIn: string;
    readonly leadSignedOut: string;
    /** When the ranking sent them here. */
    readonly leadRanking: string;
    readonly noProviders: string;
    readonly offline: string;
    readonly retry: string;
    /** {provider} and {name}. */
    readonly signedIn: string;
    /** "Google로 로그인", by provider. */
    readonly providers: Record<string, string>;
    /** "Google", by provider. */
    readonly providerNames: Record<string, string>;
    readonly logout: string;
    readonly remove: string;
    readonly removeConfirm: string;
    readonly privacy: string;
    readonly resolve: string;
    readonly syncOff: string;
    readonly syncing: string;
    /** {time}, when it last agreed. */
    readonly synced: string;
    readonly syncError: string;
    readonly syncConflict: string;
    /** Toasts on the title. */
    readonly loginOk: string;
    readonly loginError: string;
    readonly loginCancelled: string;
    readonly loggedOut: string;
    readonly removed: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
  };

  /** Two sets of records, this browser's and the account's: which to keep. */
  readonly conflict: {
    readonly title: string;
    readonly lead: string;
    readonly device: string;
    readonly cloud: string;
    readonly swords: string;
    readonly orbs: string;
    readonly bones: string;
    readonly savedRun: string;
    readonly noSavedRun: string;
    readonly useDevice: string;
    readonly useCloud: string;
    readonly later: string;
    /** Under the lead: a card is pressed to keep it. */
    readonly pick: string;
    /** The popup that asks once more: its question and what is lost, for each side. */
    readonly askDevice: string;
    readonly askCloud: string;
    readonly askDeviceBody: string;
    readonly askCloudBody: string;
    readonly cancel: string;
  };

  /** 무작위 스킬 — three skills on cards, one to take. */
  readonly skillPick: {
    /** A run's first skill. */
    readonly startTitle: string;
    readonly startSubtitle: string;
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
    /** A 무작위 스킬's spin: its title, the line under it, the two buttons once it lands ({n} spins left), the keys, and what was won. */
    readonly dropTitle: string;
    readonly dropSubtitle: string;
    readonly take: string;
    readonly reroll: string;
    readonly hintReroll: string;
    readonly subGained: string;
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
    /** A level-up with more than one skill held: which one it goes to. */
    readonly pickSkill: string;
    readonly main: string;
    readonly sub: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
    /** On a card: the stat {now} and {next} after the pick. */
    readonly values: string;
    /** And the picks it has had: {taken} of {max}, or {taken} with no ceiling. */
    readonly picks: string;
    readonly picksOpen: string;
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
    /** What each kind of effect is called, after its name on the card. */
    readonly effectKinds: {
      readonly gear: string;
      readonly bone: string;
      readonly buff: string;
      readonly debuff: string;
    };
    /** 하얀 망고 while it lasts: {scale} {seconds}. */
    readonly effectMango: string;
    /** 거미줄's slow: its name, and {slow} percent. */
    readonly effectWeb: string;
    readonly effectWebLine: string;
  };

  readonly game: {
    /** Said as a run starts while this device has a 밸런스 experiment on. */
    readonly draftRun: string;
    /** Over the survivor when a shot is turned aside (오니고로시). */
    readonly blocked: string;
    /** A level-up or pickup for a skill with every upgrade taken heals instead. */
    /** A level-up a fully upgraded {skill} turned into a potion: {heal} health back. */
    readonly maxedHeal: string;
    /** Over the survivor when that happens. */
    readonly potionEffect: string;
    /** A toast as a 우두머리 walks in. */
    readonly bossArrived: string;
    /** 키메라 러시 begins: the field cleared, the ground shaking. */
    readonly chimeraRush: string;
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
    /** 자석: its label on the ground, and the line when it is picked up. */
    readonly magnet: string;
    readonly magnetPulled: string;
    /** ...and the one that completed it. */
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
    readonly runes?: Record<string, string>;
    /** A 룬's `detail`, with its {placeholders}. Korean reads the table. */
    readonly runeDetails?: Record<string, string>;
    readonly stats?: Record<string, string>;
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
    };
  };
}
