import type { Strings } from '@/i18n/types';

/** English. */
export const en: Strings = {
  native: 'English',

  common: { back: 'Back', close: 'Close', on: 'On', off: 'Off' },

  menu: {
    byline: 'created by whitemango',
    start: 'New Run',
    load: 'Continue',
    noSave: 'No save',
    settings: 'Settings',
    gear: 'Equipment',
    guide: 'How to Play',
    patch: 'Patch Notes',
    credits: 'Credits',
    hintKeyboard: '↑ ↓ to move   Space to choose   (clicking works too)',
    hintTouch: 'Tap an entry to choose it',
  },

  settings: {
    title: 'Settings',
    padSize: 'Pad size',
    padPlace: 'Fixed pad position',
    padPlaceOnlyFixed: 'Fixed pad only',
    movement: 'Mobile movement',
    modeFixed: 'Fixed pad',
    modeFloating: 'Pad under finger',
    modeTilt: 'Tilt',
    bgm: 'Music volume',
    reset: 'Reset to defaults',
    hint: '↑ ↓ to move   ◀ ▶ to adjust   Space to choose   Esc to go back',
    hintPlacing: 'Arrows to nudge, or touch the screen to place   ·   Space to confirm',
    hintFloating: 'The pad appears wherever you touch the screen   ·   Esc to go back',
    hintTilt: 'Tilt the device to move. No pad is shown.   ·   Esc to go back',
    languageTitleOnly: 'The language can only be changed from the title screen',
    tiltRefused: 'This device will not give out tilt',
  },

  gear: {
    title: 'Equipment',
    wearing: 'Wearing',
    equipped: 'worn',
    equip: 'Wear',
    comingSoon: 'Equipment does nothing yet — the stats arrive in a later update.',
    hintKeyboard: '↑ ↓ to move   Space to wear   Esc to go back',
    hintTouch: 'Tap a piece to wear it',
  },

  pause: {
    title: 'PAUSED',
    survived: 'Survived {time}    Lv {level}',
    resume: 'Resume',
    quit: 'Save and quit to title',
    hint: 'Esc or Back to carry on   ·   point at a rare to see what it carries',
  },

  gameOver: {
    title: 'GAME OVER',
    survived: 'Survived {time}    Lv {level}',
    retry: 'Run again',
    toTitle: 'Title screen',
    hintKeyboard: '↑ ↓ to move   Space to choose',
    hintTouch: 'Tap an entry to choose it',
  },

  upgrade: {
    levelUp: 'LEVEL UP',
    level: 'Lv {level}',
    acquired: 'acquired',
    enhanced: 'upgrade',
    hintKeyboard: '← → to move   Space to take it   (or 1-4)',
    hintTouch: 'Tap the one you want',
  },

  hud: {
    level: 'Lv {level}',
    enemies: 'Enemies {count}',
    dps: 'DPS {dps}',
  },

  game: {
    intro: 'Exile, do something!',
    introHintKeyboard: 'WASD or arrows to move — attacks are automatic',
    introHintTouch: 'Drag the stick to move — attacks are automatic',
    bossArrived: 'A boss is here',
    gearFound: 'Found {gear} — wear it from the title screen',
    pickedUp: '{skill} acquired',
    enhancedPickup: '{skill} upgraded',
  },

  rare: { title: 'RARE' },

  info: {
    patchTitle: 'Patch Notes',
    guideTitle: 'How to Play',
    hintKeyboard: '↑ ↓ or the wheel to scroll   ·   Esc to go back',
    hintTouch: 'Swipe up and down   ·   Close to go back',
  },

  credits: {
    title: 'Credits',
    roleAuthor: 'Made by',
    roleDev: 'Built with',
    roleEngine: 'Engine',
  },

  confirm: {
    newRunTitle: 'There is a run waiting',
    newRunBody: 'Starting a new one throws the saved run away.',
    startAnyway: 'Start a new run',
    loadInstead: 'Carry on with it',
    cancel: 'Cancel',
  },

  upgrades: {
    damage: { label: 'Damage +{n}', detail: '{skill} hits for {n} more' },
    attackSpeed: { label: 'Attack speed +{n}', detail: '{skill} attacks {n} more time per second' },
    range: { label: 'Range +{n}', detail: '{skill} reaches {n}px further' },
    projectileSpeed: { label: 'Projectile speed +{n}', detail: '{skill} flies {n}px per second faster' },
    orbitSpeed: { label: 'Orbit speed +{n}', detail: '{skill} circles {n}px per second faster' },
    chainCount: { label: 'Chains +{n}', detail: '{skill} jumps to {n} more enemy' },
    pierceCount: { label: 'Pierce +{n}', detail: '{skill} passes through {n} more enemy' },
    orbCount: { label: 'Orbs +{n}', detail: '{skill} keeps {n} more orb in the air' },
  },

  names: {
    skills: {
      meleeStrike: 'Strike',
      fireball: 'Fireball',
      chainLightning: 'Chain Lightning',
      iceSpear: 'Ice Spear',
      voidOrb: 'Void Orb',
    },
    skillSummaries: {
      meleeStrike: 'A short swing at the nearest enemy, catching everything in the arc.',
      fireball: 'Throws a bolt at the nearest enemy. It bursts on the first body it meets.',
      chainLightning: 'An instant arc that jumps from victim to victim, never hitting the same one twice.',
      iceSpear: 'Runs a line through the crowd, chilling everything it passes (-15% move speed).',
      voidOrb: 'Orbs ride around you clockwise and hurt whatever they sweep through. No aiming.',
    },
    tags: {
      물리: 'physical',
      공격: 'attack',
      근접: 'melee',
      투사체: 'projectile',
      원거리: 'ranged',
      주문: 'spell',
      화염: 'fire',
      번개: 'lightning',
      연쇄: 'chain',
      냉기: 'cold',
      관통: 'pierce',
      공허: 'void',
    },
    enemies: { boss: 'Boss', grunt: 'Grunt', brute: 'Brute', runner: 'Runner', shooter: 'Shooter' },
    gear: {
      rustySword: 'Rusty Sword',
      chippedAxe: 'Chipped Axe',
      wornDagger: 'Worn Dagger',
      crackedWand: 'Cracked Wand',
    },
    affixes: { giant: 'Giant', swift: 'Swift', critical: 'Deadly', mighty: 'Mighty' },
    affixDetails: {
      giant: 'Health +50%',
      swift: 'Move speed +20%',
      critical: '20% chance to hit double',
      mighty: 'Damage +50%',
    },
  },

  guideChapters: {
    goal: 'The goal',
    controls: 'Controls',
    growth: 'Growing',
    skills: 'Skills',
    enemies: 'Enemies',
  },

  guide: {
    goal: {
      heading: 'The goal',
      lines: [
        'Stay alive as long as you can against a crowd that never stops coming.',
        'You have {hp} health. Touching an enemy or taking a bolt costs some of it; at zero the run ends.',
        'Every attack is automatic. Your job is where to stand, and what to upgrade.',
      ],
    },
    controls: {
      heading: 'Controls',
      lines: [
        'WASD or the arrow keys to move.',
        'Esc, the button in the top-left corner, or Back on a phone to pause.',
        'Upgrade screen: arrows move the caret; Space, a click, a tap or 1-4 takes a card.',
        'The movement keys cannot confirm. They are held down while playing, and a popup appearing under a held key used to pick for you.',
        'Point at a rare enemy — hover or press — to see what it is carrying. This works while paused too.',
      ],
    },
    mobile: {
      heading: 'On a phone',
      lines: [
        'Settings offers three ways to steer.',
        'Fixed pad — stays where you put it. Its size and position are yours to set.',
        'Pad under finger — invisible until you touch, then it appears right there.',
        'Tilt — tilt the device to move. The angle you are already holding becomes level.',
      ],
    },
    growth: {
      heading: 'Growing',
      lines: [
        'Every kill drops an XP gem. Walk near and it comes to you.',
        'A level-up offers upgrades for {starters}.',
        'Picking up a skill offers upgrades for that skill. The first copy arrives plain, with no upgrade.',
        'Upgrades are tracked per skill: raising Fireball leaves Strike exactly as it was.',
      ],
    },
    skills: {
      heading: 'Skills',
      stats: '   {damage} a hit · {rate}/s · {dps} DPS · {range}px reach',
      upgrades: '   Upgrades: {picks}',
      starter: 'starting skill',
    },
    enemies: {
      heading: 'Enemies',
      stats: '{name}  {hp} health · {contact} contact damage · {xp} XP',
      fromStart: 'from the start',
      unlocksAt: 'from {time}s',
      notes: {
        grunt: 'Walks straight at you. There are a lot of them.',
        brute: 'Slow, but very tough, and standing in one costs a great deal.',
        runner: 'Frail and fast. Running away does not shake it.',
        boss: 'One arrives every minute. Very tough and very painful, but killing it always leaves a skill.',
        shooter: 'Stops at a distance and fires. Walk it down, or bring something with reach.',
      },
    },
    rares: {
      heading: 'Rare enemies',
      lines: [
        '{chance} of enemies come up rare, wearing a coloured ring.',
        'A rare carries {min} to {max} affixes; the more it stacks, the deeper the ring. Repeats stack their effect.',
        'Each affix raises its skill drop chance by {dropBonus}. Dangerous, but worth killing.',
      ],
    },
    drops: {
      heading: 'Drops',
      lines: [
        'XP gems — one per kill, and they never expire.',
        'Skills — {skillChance} chance. A skill you already have opens an upgrade instead.',
        'Health potions — {potionChance} chance, worth {heal} of your maximum. A full health bar leaves them lying there.',
        'Everything except gems disappears after {life}s, blinking faster over the last {warning}s.',
      ],
    },
    saving: {
      heading: 'Saving',
      lines: [
        'The run saves itself every {autosave}s and whenever you pause.',
        'Quit from the pause menu with "Save and quit to title", then pick it up again with Continue.',
        'Dying clears the save. It is a way to stop and come back, not a way to undo a death.',
      ],
    },
  },
};
