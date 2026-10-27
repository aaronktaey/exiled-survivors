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
    /** The weapon in hand takes no 구슬 (0.140). */
    readonly equipped: string;
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
      /** 각인의 구슬 (0.132): {min}. */
      readonly engraveMin: string;
      readonly engraveKeep: string;
      readonly engraveOnce: string;
    };
  };

  readonly passives: {
    readonly title: string;
    /** 0.102's dial screen: what the lines do, how much more often a stat's shard drops ({pct}), the reset, points of the whole. */
    readonly lead: string;
    readonly chance: string;
    readonly reset: string;
    readonly pointsOf: string;
    /** Points in hand, waiting to be spent. */
    readonly points: string;
    /** A line's rank, as "3 / 10". */
    readonly rank: string;
    readonly maxed: string;
    readonly spend: string;
    /** Shown when there is nothing to spend. */
    readonly noPoints: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
    /** Under the root of the tree, over the points in it. */
    readonly root: string;
    /** What one rank of a line is worth: {detail}. */
    readonly perRank: string;
    /** A shut line: it opens at {name} rank {rank}. */
    readonly locked: string;
  };

  /** 아이템 필터: the switches for what drops, reached from the title. */
  /** 재능의 파편 (0.102). {n} a percentage; {count} shards, {list} the short lines. */
  readonly shard: {
    readonly name: string;
    /** The cards' head, and why they came instead of a skill. */
    readonly pickTitle: string;
    /** Why a 무작위 스킬 opened shard cards: every skill it could offer is at its top. */
    readonly allMaxed: string;
    /** Why a level-up opened shard cards: the main skill is at its top (0.112). */
    readonly mainMaxed: string;
    /** Each stat's name on its card. */
    readonly stats: { readonly damage: string; readonly attackSpeed: string; readonly moveSpeed: string; readonly maxHp: string; readonly area: string; readonly potionHeal: string; };
    /** Each stat's shard, by name, on the ground and in the 필터's sense. */
    readonly drops: { readonly damage: string; readonly attackSpeed: string; readonly moveSpeed: string; readonly maxHp: string; readonly area: string; readonly potionHeal: string; };
    /** What one gives, over the survivor and on its card. */
    readonly gain: { readonly damage: string; readonly attackSpeed: string; readonly moveSpeed: string; readonly maxHp: string; readonly area: string; readonly potionHeal: string; };
    /** The HUD's short form, for what they add up to. */
    readonly short: { readonly damage: string; readonly attackSpeed: string; readonly moveSpeed: string; readonly maxHp: string; readonly area: string; readonly potionHeal: string; };
    readonly hud: string;
    readonly toast: string;
    /** 재능의 덩어리 (0.111): its name, its name on the ground ({stat}), and the line when it is taken. */
    readonly lumpName: string;
    readonly lumpDrop: string;
    readonly lumpToast: string;
  };
  readonly filter: {
    readonly title: string;
    /** Under the title icon. */
    readonly icon: string;
    readonly lead: string;
    readonly sections: { readonly supplies: string; readonly orbs: string; readonly bones: string; readonly rarity: string; readonly bases: string };
    readonly items: { readonly potion: string; readonly skill: string; readonly randomSkill: string; readonly mango: string; readonly magnet: string; readonly unknownRune: string; readonly talentShard: string; readonly talentLump: string };
    /** The same, short enough to sit under an icon. */
    readonly itemsShort: { readonly potion: string; readonly skill: string; readonly randomSkill: string; readonly mango: string; readonly magnet: string; readonly unknownRune: string; readonly talentShard: string; readonly talentLump: string };
    readonly rarity: { readonly normal: string; readonly magic: string; readonly rare: string; readonly mythic: string };
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
  /** 보유 효과 (SKILL_HELD_BONUS): the line, and each kind of bonus in it ({n}). */
  readonly heldBonus: {
    readonly line: string;
    readonly critChance: string;
    readonly areaScale: string;
    readonly damageScale: string;
    readonly attackSpeedScale: string;
    readonly moveSpeedScale: string;
    readonly maxHpScale: string;
    /** {n}% off what an enemy's body does (0.94: 공허구체). */
    readonly contactDamageScale: string;
    /** The 체력 포션's drop chance {n}% amplified (0.122: 독성폭발). */
    readonly potionChanceScale: string;
  };
  /** 오늘의 규칙 (0.126): a ranking day's banned skill, banned 재능 and strengthened enemy. */
  readonly daily: {
    /** {date} */
    readonly title: string;
    /** {month} {day} {weekday} */
    readonly date: string;
    /** Sunday first. */
    readonly weekdays: readonly string[];
    /** {skill} */
    readonly bannedSkill: string;
    /** {talent} */
    readonly bannedTalent: string;
    /** {enemy} */
    readonly enemy: string;
    /** One line for the title: {date} {skill} {talent} {enemy}. */
    readonly titleLine: string;
    /** The same, on a day with every strengthened enemy switched off: {date} {skill} {talent}. */
    readonly titleLineNoEnemy: string;
    /** On the first skill's cards: {skill}. */
    readonly startBanned: string;
    /** A strengthened enemy by stat: {kind} {n}. */
    readonly buffs: {
      readonly hp: string;
      readonly speed: string;
      readonly contact: string;
      readonly shotSpeed: string;
      readonly hopDistance: string;
      readonly rareChance: string;
    };
  };
  readonly mastery: {
    /** The banner when it happens: {skill}. */
    readonly title: string;
    /** On the skill's card: "각성 — {effect}". */
    readonly card: string;
    /** One line a skill. {bonus} {blastScale} {freeze} {shockSecs} {shockAmp} {heal} {healSecs} {droneTimes} filled from SKILL_MASTERY. */
    readonly effects: {
      readonly meleeStrike: string;
      readonly fireball: string;
      readonly chainLightning: string;
      readonly iceSpear: string;
      readonly voidOrb: string;
      readonly thunderStrike: string;
      readonly drone: string;
      /** {stacks} */
      readonly poisonNova: string;
    };
    /** 2차 각성 (SKILL_MASTERY.second): its banner, its card line, and one line a skill. */
    readonly title2: string;
    readonly card2: string;
    /** {arc} {blastScale} {forks} {shatter} {innerShare} {splashShare} {bombEvery} {bombShare} filled from SKILL_MASTERY.second. */
    readonly effects2: {
      readonly meleeStrike: string;
      readonly fireball: string;
      readonly chainLightning: string;
      readonly iceSpear: string;
      readonly voidOrb: string;
      readonly thunderStrike: string;
      readonly drone: string;
      /** {max} */
      readonly poisonNova: string;
    };
  };
  /** 밸런스: the admin's dial panel. */
  readonly tuning: {
    readonly title: string;
    /** Under the title icon and on the pause menu. */
    readonly icon: string;
    readonly tabs: { readonly skills: string; readonly enemies: string; readonly drops: string; readonly daily: string };
    /** The page that holds the dials for every skill at once. */
    readonly common: string;
    /** A kind's 등장 시점 dial (SPAWN_TABLE): {kind}. */
    readonly unlockAt: string;
    readonly fields: {
      readonly damage: string;
      readonly attackSpeed: string;
      readonly range: string;
      readonly projectileSpeed: string;
      readonly chainCount: string;
      readonly pierceCount: string;
      readonly orbCount: string;
      readonly orbitSpeed: string;
      readonly blastRadius: string;
      readonly recastChance: string;
      readonly droneCount: string;
      readonly attackCoeff: string;
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
    /** What a skill's stat does, by field — {skill}. Shown on the magnified dial. */
    readonly fieldDetails: Readonly<Record<string, string>>;
    /** What the other dials do, by path. */
    readonly details: Readonly<Record<string, string>>;
    /** A skill's 피해 배율 — {skill}. */
    readonly detailDamageScale: string;
    /** A skill's 무기 공격력 계수 dial (BALANCE.attackCoeff, 0.122): {skill}. */
    readonly detailAttackCoeff: string;
    /** 적 강화 (0.127): {buff}. */
    readonly detailDailyScale: string;
    readonly detailDailyOn: string;
    /** A switch's knob label: {buff}. */
    readonly dailyOn: string;
    readonly on: string;
    readonly off: string;
    /** An 등장 시점 (SPAWN_TABLE) — {kind}. */
    readonly detailUnlock: string;
    /** A 구슬's, a 뼈다귀's and a sword's drop rate — {name}. */
    readonly detailOrb: string;
    readonly detailBone: string;
    readonly detailGear: string;
    /** A sword only one kind leaves (0.137): {name}, {kind}. */
    readonly detailGearKind: string;
    /** The magnified dial (0.89). */
    readonly zoom: {
      /** {shared} everyone's value, {base} balance.ts's, {min}–{max} the range. */
      readonly facts: string;
      readonly reset: string;
      readonly close: string;
    };
  };
  readonly menu: {
    /** Over the title while it reloads onto a new version. */
    readonly updating: string;
    readonly byline: string;
    readonly start: string;
    readonly load: string;
    readonly noSave: string;
    readonly settings: string;
    /** 0.80's gift, said once on the title: {gear} the pieces ("오니고로시 2개"), {orbs} how many of each 구슬. */
    readonly gift: string;
    /** One piece of {gear}: {name} and {count}. */
    readonly giftGear: string;
    /** The gift with no sword in it (0.93): {orbs} of every 구슬. */
    readonly giftOrbs: string;
    /** 0.81's gift: {points} passive points, enough to fill every line. */
    readonly giftPassives: string;
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
    readonly modeTap: string;
    readonly bgm: string;
    /** 효과음 음량: every sound but the music. */
    readonly sfx: string;
    /** 데미지 숫자 표시 (0.101): the numbers off hits, on or off. */
    readonly damageNumbers: string;
    /** 맵 디자인 (0.105): the run's ground, or the old grid. */
    readonly mapDesign: string;
    /** The tabs (0.105). */
    readonly tabs: { readonly controls: string; readonly sound: string; readonly display: string };
    readonly reset: string;
    readonly hint: string;
    readonly hintFloating: string;
    readonly hintTilt: string;
    readonly hintTap: string;
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
    /** Beside 착용 중 while a saved run went out with another weapon: {name}. */
    readonly savedRunGear: string;
    readonly equipped: string;
    readonly equip: string;
    /** The button that opens 분해 (0.90; it sold the weapon before). */
    readonly discard: string;
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
    /** 착용 · 구슬 사용 · 합성's middle one (0.141). */
    readonly useOrb: string;
    /** 각인의 구슬 (0.132): {orb} {affix}. */
    readonly orbEngraved: string;
    /** After the engraved line in the read-out. */
    readonly engravedMark: string;
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
  /** 분해 (0.90): take swords apart one by one or in bulk, and make bare ones. */
  readonly forge: {
    readonly title: string;
    /** The two screens' own titles and the 인벤토리's buttons for them (0.141). */
    readonly salvageTitle: string;
    readonly craftTitle: string;
    readonly tabs: { readonly single: string; readonly bulk: string; readonly craft: string };
    /** {count} 철광석 held, under the title. */
    readonly ore: string;
    readonly oreName: string;
    /** Its cell on the 소모품 tab: where it comes from and goes. */
    readonly oreUse: string;
    /** {what} one gives back. */
    readonly yields: string;
    readonly yieldOre: string;
    /** {orb} {count}. */
    readonly yieldOrb: string;
    readonly salvage: string;
    readonly salvageConfirm: string;
    readonly lock: string;
    readonly unlock: string;
    readonly lockedNote: string;
    readonly equippedNote: string;
    /** {gear} taken apart for {what}. */
    readonly salvaged: string;
    readonly bulkTypes: string;
    /** {count} of a base in the stash. */
    readonly bulkHeld: string;
    /** {max} 속성 or fewer. */
    readonly bulkMax: string;
    readonly bulkCount: string;
    readonly bulkYield: string;
    readonly bulkNone: string;
    readonly bulkGo: string;
    readonly bulkConfirm: string;
    readonly bulkDone: string;
    /** {cost} 철광석. */
    readonly craftCost: string;
    readonly craftNo: string;
    readonly craftGo: string;
    readonly craftShort: string;
    /** {gear} made for {cost}. */
    readonly crafted: string;
    readonly hintSingle: string;
    readonly hintBulk: string;
    readonly hintCraft: string;
    readonly hintTouch: string;
  };
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

  /** 생존자 마을 (dev server only for now): its things' names and how to use them. */
  readonly village: {
    readonly stations: {
      readonly portal: string;
      readonly stash: string;
      readonly anvil: string;
      readonly obelisk: string;
      readonly board: string;
      readonly sieve: string;
      readonly shelf: string;
      readonly notice: string;
    };
    readonly useKey: string;
    readonly useTap: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
    /** Under the gate, when a run is saved. */
    readonly savedRun: string;
    /** Under the ranking board, first place today. */
    readonly champion: string;
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
    /** Under the score: how many were killed (0.116). */
    readonly scoreCaption: string;
    /** Over the kills' bar, and over the skills' row (0.116). */
    readonly killsTitle: string;
    readonly skillsTitle: string;
    /** Over the score when it beats every run on 내 기록 (0.127). */
    readonly newBest: string;
    /** The tip's head, and the tips themselves — one at random a run (0.116), placeholders from the guide's numbers. */
    readonly tipTitle: string;
    readonly tips: readonly string[];
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
      readonly passives: string;
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
    readonly passives: string;
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
    readonly formulaHeld: string;
    /** Appended to the damage line when the weapon's 고정 속성 scales damage. */
    /** The held skills' 보유 효과 on a damage or pace line: {scale}. */
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
      readonly passive: string;
      readonly bone: string;
      readonly buff: string;
      readonly debuff: string;
    };
    /** The passive icon's heading, and a line per line bought: {name} {rank} {detail}. */
    readonly effectPassive: string;
    readonly effectPassiveLine: string;
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
    /** A skill picked up with every 보조 스킬 slot taken: {skill}, {heal}. */
    readonly subSkillsFullHeal: string;
    /** Over the survivor when that happens. */
    readonly potionEffect: string;
    /** A toast as a 우두머리 walks in. */
    readonly bossArrived: string;
    /** 키메라 러시 begins: the field cleared, the ground shaking. */
    /** A 키메라 came on its clock. */
    readonly chimeraArrived: string;
    readonly intro: string;
    readonly introHintKeyboard: string;
    readonly introHintTouch: string;
    /** Banner when a piece of 장비 is walked over. {gear} is its name. */
    readonly gearFound: string;
    /** Shouted when a 구슬 is walked over. */
    readonly orbFound: string;
    /** And when a 뼈다귀 is. */
    readonly boneFound: string;
    /** A run off the ranking keeps nothing it finds (0.134): {item}. */
    readonly lootWithheld: string;
    /** 하얀 망고: its name on the ground, and what is shouted when eaten. */
    readonly mango: string;
    readonly mangoEaten: string;
    /** 알수없는 룬's name on the ground, and the line over the survivor as it is picked up. */
    readonly unknownRune: string;
    readonly unknownRuneFelt: string;
    /** 자석: its label on the ground, and the line when it is picked up. */
    readonly magnet: string;
    readonly magnetPulled: string;
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
    /** 패치노트's 더 보기 (0.118), with how many versions are still to come. */
    readonly patchMore: string;
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
    /** 폰트 (0.108): 갈무리's credit. */
    readonly roleFont: string;
    /** 음악 (0.109): the music's CC BY credit. */
    readonly roleMusic: string;
  };

  /** The one question the game asks before throwing a save away. */
  readonly confirm: {
    readonly newRunTitle: string;
    readonly newRunBody: string;
    readonly startAnyway: string;
    readonly loadInstead: string;
    readonly cancel: string;
    /** Before signing in (0.101): the account's records will replace this device's. */
    readonly loginTitle: string;
    readonly loginBody: string;
    /** What this device holds now: {swords} {orbs} {bones}. */
    readonly loginHeld: string;
    readonly loginGo: string;
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
    | 'orbCount'
    | 'blastRadius'
    | 'recastChance'
    | 'droneCount',
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
      /** The share of the weapon's attack a skill takes (0.122): {coeff}. */
      readonly skillCoeff: string;
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
      /** An 속성 that no longer rolls (0.143: 회피). */
      readonly affixRetired: string;
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
      /** Only {kind} drops it, at {chance} (0.137). */
      readonly gearFromKind: string;
      /** 분해 and 제작 on a sword's card (0.90): {ore}, {cost}. */
      readonly gearSalvage: string;
      readonly gearCraft: string;
      readonly gearNoCraft: string;
      /** A sword that never drops, only made (나르실). */
      readonly gearCraftOnly: string;
      readonly boneStack: string;
      readonly boneSingle: string;
      /** {detail} a rank, up to {max} ranks. */
      readonly passiveRank: string;
      readonly passiveNeeds: string;
    };
  };
}
