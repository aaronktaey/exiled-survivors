import type { Strings } from '@/i18n/types';

/** English. */
export const en: Strings = {
  native: 'English',

  common: { back: 'Back', close: 'Close', on: 'On', off: 'Off' },

  passives: {
    title: 'Passives',
    points: '{points} points',
    shards: 'Divine Shards {held}/{need}',
    rank: '{rank} / {max}',
    maxed: 'max',
    spend: 'Spend',
    noPoints: 'No points yet — kill a Boss and collect Divine Shards.',
    hintKeyboard: '↑ ↓ to move   Space to spend   Esc to go back',
    hintTouch: 'Tap a line to spend a point',
    shardName: 'Divine Shard',
    buyShard: 'Buy a Divine Shard  {price} gold',
    goldHeld: '{gold} gold',
    temporary: 'A placeholder: separate lines today, a tree with branches next.',
  },

  menu: {
    byline: 'created by whitemango',
    start: 'New Run',
    load: 'Continue',
    noSave: 'No save',
    settings: 'Settings',
    gear: 'Inventory',
    guide: 'How to Play',
    patch: 'Patch Notes',
    credits: 'Credits',
    hintKeyboard: '↑ ↓ to move   Space to choose   (clicking works too)',
    hintTouch: 'Tap an entry to choose it',
  },

  settings: {
    title: 'Settings',
    padSize: 'Pad size',
    movement: 'Mobile movement',
    modeFloating: 'Pad under finger',
    modeTilt: 'Tilt',
    bgm: 'Music volume',
    reset: 'Reset to defaults',
    hint: '↑ ↓ to move   ◀ ▶ to adjust   Space to choose   Esc to go back',
    hintFloating: 'The pad appears wherever you touch the screen   ·   Esc to go back',
    hintTilt: 'Tilt the device to move. No pad is shown.   ·   Esc to go back',
    languageTitleOnly: 'The language can only be changed from the title screen',
    tiltRefused: 'This device will not give out tilt',
    modeOther: '◀ ▶ to switch to {mode}',
  },

  gear: {
    title: 'Equipment',
    wearing: 'Carrying',
    equipped: 'carried',
    equip: 'Carry',
    discard: 'Discard',
    discardConfirm: 'Throw it away?',
    orbCount: '{orb} x{count}',
    orbConfirm: 'Use {orb}?',
    orbNone: 'No {orb}',
    orbRerolled: '{orb} — rerolled to {count} modifiers',
    orbAdded: '{orb} — added {affix}',
    orbUpgraded: '{orb} — {from} → {to}',
    orbDestroyed: '{orb} — the weapon did not survive it',
    hintKeyboard: '↑ ↓ move   Space carry   {keys} orbs   Del discard   Esc back',
    hintTouch: 'Tap to carry — discard and orbs are the buttons below',
    lockedHint: 'A saved run is holding this weapon — finish it, or start a new one',
    prefix: 'Prefix',
    suffix: 'Suffix',
    tier: 'T{tier}',
    prefixWord: '{affix}',
    suffixWord: 'of {affix}',
    attack: '+{attack} attack power',
    implicit: 'Implicit: {text}',
    plain: 'No modifiers',
  },

  inventory: {
    title: 'Inventory',
    tabGear: 'Gear',
    tabConsumables: 'Consumables',
    empty: 'Empty',
    held: 'Held: {count}',
    orbUse: 'Spent on a weapon from the Gear tab.',
    boneUse: 'Applied when a run starts, for that run only.',
    hintGear: 'Arrows move   Space equip   {keys} orbs   Del discard   Tab tabs   Esc back',
    hintConsumables: 'Arrows move   Tab tabs   Esc back',
    hintTouch: 'Tap a cell to inspect it — equip, discard and orbs are the buttons beside it',
  },

  bones: {
    title: 'Bones',
    lead: 'Spent on this run alone. Up to three, and gone once it starts.',
    held: '{bone} x{count}',
    inUse: '{count} in',
    clear: 'Take them all out',
    start: 'Start like this',
    slots: 'In the slots',
    total: 'Together',
    none: 'Nothing applied',
    sumHp: 'Enemy health +{percent}%',
    sumDrop: 'Drops +{percent}%',
    sumBosses: 'Bosses in place of rares',
    hintKeyboard: '↑ ↓ to move   Space to apply   Esc to go back',
    hintTouch: 'Tap one to apply it',
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
    damageDealt: 'Damage dealt',
    killsDealt: 'Kills',
    goldEarned: 'Gold earned',
    skillLine: '{skill} Lv {level} · {dps} DPS',
    survived: 'Survived {time}    Lv {level}',
    retry: 'Run again',
    toTitle: 'Title screen',
    hintKeyboard: '↑ ↓ to move   Space to choose',
    hintTouch: 'Tap an entry to choose it',
  },

  ranking: {
    title: 'Ranking',
    icon: 'Ranking',
    empty: 'No records yet — finish a run to put your name up.',
    place: '#',
    name: 'Name',
    damage: 'Damage dealt',
    champion: '#1  {name}  {damage}',
    entryTitle: 'Ranked #{place}!',
    entryLead: '{damage} damage dealt — leave your name (3 letters + 1 emoji + a flag)',
    confirm: 'Enter',
    skip: 'Skip',
    entryHintKeyboard: '← → slot   ↑ ↓ or type a letter   Enter to save   Esc to skip',
    entryHintTouch: 'Pick letters and an emoji with ▲ ▼, then press Enter',
    register: 'Enter ranking',
    registered: 'Entered at #{place}',
    localNote: 'Records on this device. A ranking shared between players is on its way.',
    sharedNote: 'A temporary ranking shared by every player.',
    loadingNote: 'Loading the shared ranking…',
    offlineNote: 'Could not reach the shared ranking — showing this device’s records.',
  },

  skillPick: {
    startTitle: 'Starting skill',
    startSubtitle: 'Pick the one skill to take into this run',
    dropTitle: 'Random skill',
    dropSubtitle: 'Pick one of three — one you hold is upgraded',
    drop: 'Random skill',
    new: 'New',
    upgrade: 'Upgrade · Lv {level}',
    hintKeyboard: '← → to move   Space to pick   (1-3 picks directly)',
    hintTouch: 'Tap the card you want',
  },

  slot: {
    startTitle: 'Starting skill',
    startSubtitle: 'One skill to take into this run',
    confirm: 'Stop',
    hintKeyboard: 'Space or Enter to stop',
    hintTouch: 'Tap Stop to stop the reel',
    won: '{skill} acquired',
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
    formulaDamage: 'Damage {damage} = (base {base} × passive {passive} + weapon {gear}) × upgrades {run}',
    formulaRate: '{rate}/s = base {base} × passive {passive} × weapon {gear} × upgrades {run}',
    formulaMango: ' × mango {mango}',
    formulaScale: ' × balance {scale}',
    formulaGearScale: ' × weapon damage {scale}',
    formulaCap: 'capped at {rate}/s (shortest cooldown)',
    formulaTargets: 'Targets {targets} = {parts}',
    targetChain: 'chain {n}',
    targetPierce: 'pierce {n}',
    targetOrbs: 'extra orbs {n}',
    targetShots: ' × projectiles {n}',
    formulaDps: 'DPS {dps} = {damage} × {rate} × {targets}',
    formulaNote: 'Critical hits are not counted',
  },

  game: {
    intro: 'Exile, do something!',
    introHintKeyboard: 'WASD or arrows to move — attacks are automatic',
    introHintTouch: 'Drag the stick to move — attacks are automatic',
    gearFound: 'Found {gear} — wear it from the title screen',
    orbFound: '{orb} — use it from the Inventory',
    mango: 'White Mango',
    mangoEaten: 'White Mango! Untouchable for {seconds}s · attack and move speed +100%',
    boneFound: '{bone} — apply it before the next run',
    shardFound: 'Divine Shard {held}/{need}',
    orbMade: 'A Divine Orb — one passive point',
    pickedUp: '{skill} acquired',
    enhancedPickup: '{skill} upgraded',
    altarOffer: 'Altar · {enemies}',
    altarCrowd: '{count} × {kind}',
    altarCrowdRare: '{count} × Rare {kind}',
    altarWoke: 'The altar wakes — {enemies}',
  },

  rare: { title: 'RARE' },

  info: {
    patchTitle: 'Patch Notes',
    guideTitle: 'How to Play',
    hintKeyboard: '↑ ↓ or the wheel to scroll   ·   Esc to go back',
    hintTouch: 'Swipe up and down   ·   Close to go back',
    guideHintKeyboard: '↑ ↓ chapter   ← → tab   wheel · PageUp/Down scroll   Esc back',
    guideHintTouch: 'Tap a chapter or tab   ·   swipe up and down',
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
    damage: { label: 'Damage +{n}%', detail: '{skill} hits for {n}% more of its base damage' },
    attackSpeed: { label: 'Attack speed +{n}%', detail: '{skill} attacks {n}% more often than its base rate' },
    range: { label: 'Range +{n}%', detail: '{skill} reaches {n}% further than its base range' },
    projectileSpeed: { label: 'Projectile speed +{n}%', detail: '{skill} flies {n}% faster than its base speed, and reaches as much further' },
    orbitSpeed: { label: 'Orbit speed +{n}%', detail: '{skill} circles {n}% faster than its base speed' },
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
      thunderStrike: 'Thunderstrike',
    },
    skillSummaries: {
      meleeStrike: 'A short swing at the nearest enemy, catching everything in the arc.',
      fireball: 'Throws a bolt at the nearest enemy. It bursts on the first body it meets, and everything close by burns with it.',
      chainLightning: 'An instant arc that jumps from victim to victim, never hitting the same one twice.',
      iceSpear: 'Runs a line through the crowd, chilling everything it passes (-30% move speed).',
      voidOrb: 'Orbs ride around you clockwise and hurt whatever they sweep through. No aiming.',
      thunderStrike: 'Calls a bolt out of the sky onto one enemy near you. If it dies, there is an even chance another bolt falls at once.',
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
      오라: 'aura',
    },
    enemies: { boss: 'Boss', fugitive: 'Runaway', grunt: 'Grunt', brute: 'Brute', runner: 'Runner', shooter: 'Shooter' },
    gear: {
      rustySword: 'Rusty Sword',
      onigoroshi: 'Onigoroshi',
      ironSword: 'Iron Sword',
      steelSword: 'Steel Sword',
      runedSword: 'Runed Sword',
    },
    gearImplicits: {
      onigoroshi: 'Leeches {value} of damage dealt as life',
      runedSword: '+{value} projectile on skills',
      steelSword: '+{value} damage',
      ironSword: '+{value} attack speed',
      rustySword: '+{value} {skill} attack speed',
    },
    affixes: {
      giant: 'Giant',
      swift: 'Swift',
      critical: 'Deadly',
      mighty: 'Mighty',
      cruel: 'Cruel',
      frenzied: 'Frenzied',
      evasive: 'Evasive',
      magnetic: 'Magnetic',
      volleying: 'Volleying',
      spider: 'Spider',
    },
    affixDetails: {
      giant: 'Health +50%',
      swift: 'Move speed +20%',
      critical: '20% critical chance',
      mighty: 'Damage +50%',
      cruel: 'Critical damage +50%',
      frenzied: 'Attack speed +15%',
      evasive: 'Invulnerable window +30%',
      magnetic: 'Pickup range +40%',
      volleying: '+2 projectiles',
      spider: 'Leaves a web where it dies — -30% move speed for a minute',
    },
    affixGearDetails: {
      mighty: 'Damage +{value}%',
      critical: 'Critical chance +{value}%',
      cruel: 'Critical damage +{value}%',
      frenzied: 'Attack speed +{value}%',
      giant: 'Maximum life +{value}%',
      swift: 'Move speed +{value}%',
      evasive: 'Invulnerable window +{value}%',
      magnetic: 'Pickup range +{value}%',
    },
    orbs: {
      transmute: 'Transmutation Orb',
      chaos: 'Chaos Orb',
      awaken: 'Awakening Orb',
      explode: 'Explosion Orb',
    },
    orbShorts: {
      transmute: 'Trans',
      chaos: 'Chaos',
      awaken: 'Awaken',
      explode: 'Blast',
    },
    orbDetails: {
      transmute: 'Rerolls the weapon to 1–2 modifiers',
      chaos: 'Rerolls the weapon to 2–4 modifiers',
      awaken: 'Adds one modifier (up to 6)',
      explode: 'Turns one modifier into another a tier higher — 20% chance to destroy the weapon',
    },
    bones: {
      skull: 'Ancient Skull',
      rib: 'Rib',
    },
    boneShorts: {
      skull: 'Skull',
      rib: 'Rib',
    },
    boneDetails: {
      skull: 'Bosses walk in where rares would have',
      rib: 'All enemies +100% health, drop rate +50%',
    },
    passives: { damage: 'Damage', attackSpeed: 'Attack speed', moveSpeed: 'Move speed', luck: 'Luck' },
    passiveDetails: {
      damage: 'Damage +10%',
      attackSpeed: 'Attack speed +10%',
      moveSpeed: 'Move speed +1%',
      luck: 'Luck +1% (no effect yet)',
    },
  },

  guideChapters: {
    basics: 'Basics',
    combat: 'Combat',
    skills: 'Skills',
    enemies: 'Enemies',
    items: 'Items',
    progress: 'Progression',
  },

  guideTabs: {
    goal: 'The goal',
    controls: 'Controls',
    mobile: 'Mobile',
    saving: 'Saving',
    levels: 'Levelling',
    getSkills: 'Getting skills',
    damage: 'Damage',
    common: 'Enemies',
    boss: 'Boss',
    fugitive: 'Runaway',
    rares: 'Rares',
    difficulty: 'Difficulty',
    dropRules: 'Drop rules',
    field: 'On the ground',
    gear: 'Gear',
    affixes: 'Affixes',
    orbs: 'Orbs',
    bones: 'Bones',
    passives: 'Passives',
    inventory: 'Inventory',
    ranking: 'Ranking',
  },

  guide: {
    cards: {
      goal: [
        {
          title: 'The goal',
          lines: [
            'Stay alive as long as you can while the enemies keep coming.',
            'You have {hp} health. Touching an enemy or being hit by its shots takes some away, and at 0 the run is over.',
            'Every attack fires on its own. Your part is where you stand, and what you choose to upgrade.',
          ],
        },
        {
          title: 'How a run goes',
          lines: [
            'New Run → pick Bones (if you have any) → pick one of {choices} skill cards → fight.',
            'The first Boss arrives at {bossFirst}s, then one every {bossEvery}s.',
            'The longer it lasts, the tougher new enemies are and the more of them come up rare.',
            'When you die, the results screen sums the run up, and you leave by Run again, the title screen or Settings.',
          ],
        },
      ],
      controls: [
        {
          title: 'Keyboard and mouse',
          lines: [
            'WASD or the arrow keys to move.',
            'Esc or the button at the top left to pause.',
            'Hover a skill icon at the top left for how its DPS is worked out, or a rare for its affixes. The fight waits while you read.',
          ],
        },
        {
          title: 'Choice screens',
          lines: [
            'Arrows move the caret; Space, a click, a tap or a number key picks.',
            'Movement keys never confirm a pick, so a key held down to walk cannot choose for you.',
            'For a moment after a choice screen opens, it takes no input.',
          ],
        },
        {
          title: 'Menus',
          lines: [
            'Every screen is left by the back button at the top left, or Esc.',
            'In this guide ↑↓ turn the chapter, ←→ the tab, and the wheel, a drag or PageUp/PageDown scroll.',
          ],
        },
      ],
      mobile: [
        {
          title: 'Moving',
          lines: [
            'Choose one of two in Settings.',
            'Pad where you touch — nothing is shown until a finger lands, and the pad appears there. Its size is in Settings.',
            'Tilt — tilt the device to move. The angle it first reads is neutral, so hold it however is comfortable.',
          ],
        },
        {
          title: 'Touch',
          lines: [
            'Tapping a skill icon or a rare shows the same as hovering does. That finger is also steering, so the fight does not wait.',
            'The device’s back button pauses.',
          ],
        },
      ],
      saving: [
        {
          title: 'Autosave',
          lines: [
            'The run saves every {autosave}s and every time you pause.',
            'Leave with "Save and quit to title" on the pause menu, then pick it up again with Continue on the title screen.',
            'Dying deletes the save. A save is for stopping for a while, not for taking a death back.',
          ],
        },
        {
          title: 'While a run is saved',
          lines: [
            'The weapon in hand cannot be swapped, so the run you load is played with the sword it went out with.',
            'The language cannot be changed mid-run.',
          ],
        },
      ],
      levels: [
        {
          title: 'Experience',
          lines: [
            'Kills drop XP gems. Within {pickup}px they drift to you, and they never disappear.',
            'Tougher enemies are worth more, and a rare is worth more for each of its affixes.',
          ],
        },
        {
          title: 'Levelling up',
          lines: [
            'On a level up one of your skills is picked at random, and you choose an upgrade for it.',
            'Upgrades stay on their own skill: raising Fireball leaves Strike as it was.',
            'Number upgrades add a share of the base each time: three picks of +20% are +60% of the base.',
            'Damage and attack speed can each be taken {maxPicks} times per skill, and chains go up to {chainCap}. A maxed upgrade is no longer offered.',
          ],
        },
        {
          title: 'Skill level',
          lines: [
            'The number in a skill icon’s corner is its level: 1 when you get it, and one more for every upgrade.',
          ],
        },
      ],
      getSkills: [
        {
          title: 'The first skill',
          lines: ['A run starts by choosing one of {choices} skill cards. There is no basic attack.'],
        },
        {
          title: 'Skill drops',
          lines: [
            'Enemies drop a skill {skillChance} of the time. Bosses and Runaways always drop one.',
            'A skill you do not have comes in at its base stats; one you have opens its upgrade choice.',
          ],
        },
        {
          title: 'Random skill',
          lines: [
            'Enemies drop one {randomSkillChance} of the time. Walking over it offers {choices} skill cards to choose from.',
            'Choosing a skill you already have goes straight on to its upgrade.',
          ],
        },
      ],
      damage: [
        {
          title: 'One hit',
          lines: [
            '(skill damage × passives + weapon attack) × weapon implicit × run upgrades × per-skill balance.',
            'Effects apply passives → weapon → run upgrades, and the layers multiply. Within a layer, picks add up on the base.',
          ],
        },
        {
          title: 'Critical hits',
          lines: [
            'Any hit has a {critChance} chance to be critical and deal {critMulti}× damage.',
            '{critAffix} on the weapon raises the chance, {cruelAffix} the multiplier.',
          ],
        },
        {
          title: 'Attack speed',
          lines: [
            'Attacks per second = skill base × passives × weapon × run upgrades, and ×{mangoRate} while a White Mango lasts.',
            'The gap between attacks never goes below {minCooldown}ms.',
          ],
        },
        {
          title: 'The DPS card',
          lines: [
            'Hover a skill icon mid-run and the sum above is spelled out with that skill’s numbers. Crits are not counted in it.',
          ],
        },
      ],
      common: [
        {
          title: 'Enemies',
          lines: [
            'They appear off screen and close in, and more kinds join as the run goes on.',
            'Each body hurts on its own when it touches you, so being surrounded hurts all at once.',
            'The gap between spawns starts at {spawnStart}s and shrinks to {spawnMin}s, with at most {maxAlive} on the field.',
          ],
        },
      ],
      boss: [
        {
          title: 'What a Boss leaves',
          lines: [
            'A skill and a sword every time, and an altar every time.',
            'A Divine Shard {shardChance} and a Rib {ribChance} of the time. {bossOnlyOrbs} also comes only from Bosses.',
            'Every other drop is {bossBonus} more likely.',
          ],
        },
      ],
      fugitive: [
        {
          title: 'Catching one',
          lines: [
            'The marker on the edge of the screen points the way to it.',
            'Long reach and many hits help. Every hit sends it a little further off.',
          ],
        },
      ],
      rares: [
        {
          title: 'Rares',
          lines: [
            '{rareChance} of enemies come up rare, more as the run goes on. A ring around them marks them out.',
            'They carry {rareMin}–{rareMax} affixes, and the more they carry the deeper the ring. The same affix twice stacks.',
            'Hover or tap one to see its affixes.',
            'Every affix makes every drop {dropBonus} more likely. Worth the risk.',
          ],
        },
      ],
      difficulty: [
        {
          title: 'As time goes on',
          lines: [
            'Every minute, new enemies get {hpStep} health (compounding) and {rareStep} more of them come up rare.',
            'From minute {lateFrom} each step is {lateMult}× as big — {hpLate} health and {rareLate} rares a minute.',
            'Enemies already out stay as they are; it changes the ones that arrive after.',
          ],
        },
        {
          title: 'When they arrive',
          lines: [
            'Runners from {runnerAt}s, Shooters from {shooterAt}s, Brutes from {bruteAt}s.',
            'The first Boss at {bossFirst}s, then every {bossEvery}s. The first Runaway at {fugFirst}s, then every {fugEvery}s.',
          ],
        },
      ],
      dropRules: [
        {
          title: 'Drop chances',
          lines: [
            'Each affix on a rare raises every drop chance by {dropBonus}, and a Boss raises them by {bossBonus}.',
            'What only a Boss leaves, and what is certain anyway, does not get this bonus.',
            'A run with Ribs in it raises every drop chance further.',
          ],
        },
        {
          title: 'On the ground',
          lines: [
            'Everything but XP disappears after {life}s, blinking faster and faster for the last {warning}s.',
            'A drop’s rarity shows in the colour of its label and the sound it lands with.',
          ],
        },
      ],
      field: [
        {
          title: 'XP gem',
          lines: ['Every kill drops one, and it never disappears. It drifts to you once you are close.'],
        },
        {
          title: 'Skill',
          lines: ['{skillChance} of the time. New skills come in as they are; one you have opens its upgrade choice.'],
        },
        {
          title: 'Random skill',
          lines: ['{randomSkillChance} of the time. Walking over it offers {choices} skill cards to choose from.'],
        },
        {
          title: 'Health potion',
          lines: [
            '{potionChance} of the time. Restores {heal} of your maximum health.',
            'At full health it is left where it is rather than wasted.',
          ],
        },
        {
          title: 'White Mango',
          lines: [
            '{mangoChance} of the time. For {mangoSecs}s after eating it you take no damage, and every skill’s attack speed and your move speed are {mangoBoost}.',
          ],
        },
        {
          title: 'Altar',
          lines: [
            'Every Boss leaves one, and other enemies {altarChance} of the time.',
            'It calls up the enemies written over it. It only wakes when you walk up to it, and you may walk past — you have to have been away from it once before it can wake.',
            'What it can call: {altarOffers}.',
          ],
        },
        {
          title: 'Divine Shard',
          lines: [
            'Bosses drop one {shardChance} of the time. {perOrb} make a Divine Orb, which is {points} passive point.',
          ],
        },
      ],
      gear: [
        {
          title: 'Gear',
          lines: [
            'Every Boss drops a sword. Tier {fromKillTiers} swords also rarely drop from ordinary enemies.',
            'The lower a sword’s tier number, the stronger it is. Its attack power is added to every skill’s hit.',
            'Swords you pick up go to the stash; you equip them from the Inventory on the title screen.',
            'A sword can carry up to {maxPrefix} prefixes (offence) and {maxPrefix} suffixes (defence and movement). Each line is a {affixChance} roll, and every success rolls for another.',
            'The implicit is fixed by the kind of sword, and is always there however many prefixes and suffixes it has.',
          ],
        },
      ],
      affixes: [
        {
          title: 'Affixes',
          lines: [
            'Rares and weapons share the same affixes. Prefixes are offence; suffixes are defence and movement.',
            'On a weapon an affix comes in {tierCount} tiers, and tier 1 is the strongest and the rarest.',
          ],
        },
      ],
      orbs: [
        {
          title: 'Orbs',
          lines: [
            'Consumables that reroll or add to a weapon’s affixes. Use them on a sword from the Gear tab of the Inventory.',
          ],
        },
      ],
      bones: [
        {
          title: 'Bones',
          lines: [
            'Before a run, put in up to {maxBones} to change that run. Bones put in are spent.',
            'Both New Run and Run again go through the Bones screen; with none to spend it is skipped.',
            'A loaded run keeps the Bones it was started with.',
            'Even with an Ancient Skull, only {maxBosses} Bosses are out at once; past that the rare spawns are ordinary enemies.',
          ],
        },
      ],
      passives: [
        {
          title: 'Passives',
          lines: [
            '{perOrb} Divine Shards make a Divine Orb, and an orb is {points} passive point.',
            'Spend points from Passives on the title screen. Passives apply to every run.',
          ],
        },
      ],
      inventory: [
        {
          title: 'Gear tab',
          lines: [
            'Your swords sit in a {cols}×{rows} grid. Pick a cell and its attack power, implicit and affixes are read out beside it.',
            'Equip, discard and orbs are the buttons beside it, or Space. The sword in hand cannot be discarded.',
          ],
        },
        {
          title: 'Consumables tab',
          lines: ['How many orbs and Bones you hold, and where each is spent.'],
        },
      ],
      ranking: [
        {
          title: 'Ranking',
          lines: [
            'When you die, the total damage of the run can go on the ranking. Pick a {nameLength}-letter name, an icon and a flag.',
            'It shows the top {rankSize}, and the board is shared with other players.',
          ],
        },
      ],
    },
    labels: {
      skillStats: 'Damage {damage} · {rate}/s · DPS {dps}',
      skillRange: 'Range {range}px',
      skillProjectile: 'Projectile speed {speed} — reach grows with it, in proportion',
      skillUpgrades: 'Upgrades: {picks}',
      skillScale: 'Per-skill damage balance ×{scale}',
      enemyStats: 'Health {hp} · Contact {contact} · XP {xp} · Speed {speed}',
      fromStart: 'From the start',
      unlocksAt: 'From {time}s',
      shot: 'Shot damage {damage} · every {every}s · range {range}px',
      volley: 'Every {every}s, {count} shots in every direction · {damage} each',
      enemyNotes: {
        grunt: 'Walks straight at you. There are a lot of them.',
        brute: 'Slow, but very tough, and standing in one costs a great deal.',
        runner: 'Frail and fast. Running away does not shake it.',
        shooter: 'Stops at a distance and fires. Walk it down, or bring something with reach.',
        boss: 'The first arrives at {first}s, then one every {every}s. Very tough and very painful.',
        fugitive: 'Never fights back. Tough and very fast; every hit sends it running off, and it stops a way on. The first turns up at {first}s, then every {every}s, and each is gone {life}s later. Catch it for a sure skill.',
      },
      affixEnemy: 'On a rare: {detail}',
      affixWeapon: 'On a weapon: {ladder}',
      affixRung: 'T{tier} {value}',
      affixRangedOnly: 'Only on enemies that shoot',
      affixWeaponOnly: 'Weapons only',
      affixEnemyOnly: 'Rares only',
      chanceKill: '{chance} per kill',
      chanceBoss: '{chance} per Boss kill',
      gearTier: 'Tier {tier} · +{attack} attack power',
      gearImplicit: 'Implicit: {text}',
      gearBossShare: '{share} of the swords a Boss leaves',
      gearFromKill: '{chance} per ordinary kill',
      gearBossOnly: 'Only Bosses drop it',
      boneStack: 'More than one can go into a run',
      boneSingle: 'Only one can go into a run',
      passiveRank: '{detail} a rank · up to {max} ranks',
    },
  },
};
