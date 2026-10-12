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

  readonly menu: {
    readonly byline: string;
    readonly start: string;
    readonly load: string;
    readonly noSave: string;
    readonly settings: string;
    readonly guide: string;
    readonly patch: string;
    readonly credits: string;
    readonly hintKeyboard: string;
    readonly hintTouch: string;
  };

  readonly settings: {
    readonly title: string;
    readonly padSize: string;
    readonly padPlace: string;
    readonly padPlaceOnlyFixed: string;
    readonly movement: string;
    readonly modeFixed: string;
    readonly modeFloating: string;
    readonly modeTilt: string;
    readonly bgm: string;
    readonly reset: string;
    readonly hint: string;
    readonly hintPlacing: string;
    readonly hintFloating: string;
    readonly hintTilt: string;
    readonly tiltRefused: string;
    /** Why the Language row is dim while a run is going. */
    readonly languageTitleOnly: string;
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
    readonly bossArrived: string;
    readonly pickedUp: string;
    readonly enhancedPickup: string;
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
