import type { Strings } from '@/i18n/types';

/** 简体中文. */
export const zh: Strings = {
  native: '中文',

  common: { back: '返回', close: '关闭', on: '开', off: '关' },

  passives: {
    title: '被动',
    points: '点数 {points}',
    shards: '神圣碎片 {held}/{need}',
    rank: '{rank} / {max}',
    maxed: '已满',
    spend: '投入',
    noPoints: '还没有点数 — 击杀首领以收集神圣碎片。',
    hintKeyboard: '↑ ↓ 移动   Space 投入   Esc 返回',
    hintTouch: '点击条目投入点数',
    shardName: '神圣碎片',
    buyShard: '购买神圣碎片  {price} 金币',
    goldHeld: '金币 {gold}',
    temporary: '这是临时版本 — 目前各条线分别提升，分支树是下一步的工作。',
  },

  menu: {
    byline: 'created by whitemango',
    start: '开始游戏',
    load: '继续游戏',
    noSave: '没有存档',
    settings: '设置',
    gear: '背包',
    guide: '游戏指南',
    patch: '更新日志',
    credits: '制作人员',
    hintKeyboard: '↑ ↓ 移动   Space 选择   （也可点击）',
    hintTouch: '点按条目进行选择',
  },

  settings: {
    title: '设置',
    padSize: '摇杆大小',
    movement: '移动端操作方式',
    modeFloating: '触点生成摇杆',
    modeTilt: '重力感应',
    bgm: '背景音量',
    reset: '恢复默认',
    hint: '↑ ↓ 移动   ◀ ▶ 调整   Space 选择   Esc 返回',
    hintFloating: '摇杆会出现在你触摸屏幕的位置   ·   Esc 返回',
    hintTilt: '倾斜设备进行移动，不显示摇杆   ·   Esc 返回',
    languageTitleOnly: '语言只能在标题画面中更改',
    tiltRefused: '此设备无法使用重力感应',
    modeOther: '◀ ▶ 可切换为{mode}',
  },

  gear: {
    title: '装备',
    wearing: '装备中',
    equipped: '装备中',
    equip: '装备',
    discard: '丢弃',
    discardConfirm: '确定丢弃？',
    orbCount: '{orb} x{count}',
    orbConfirm: '使用{orb}？',
    orbNone: '没有{orb}',
    orbRerolled: '{orb} — 已重掷为 {count} 个属性',
    orbAdded: '{orb} — 新增 {affix}',
    orbUpgraded: '{orb} — {from} → {to}',
    orbDestroyed: '{orb} — 装备被摧毁了',
    hintKeyboard: '↑ ↓ 移动   Space 装备   {keys} 宝珠   Del 丢弃   Esc 返回',
    hintTouch: '点击装备 — 丢弃与宝珠在下方按钮',
    lockedHint: '存档中的一局正持有该武器 — 请先结束该局或重新开始',
    prefix: '词缀前缀',
    suffix: '词缀后缀',
    tier: 'T{tier}',
    prefixWord: '{affix}的',
    suffixWord: '· {affix}',
    attack: '攻击力 +{attack}',
    implicit: '固定: {text}',
    combine: '合成',
    combinePick: '合成 {n}/{count}',
    combineGo: '开始合成',
    combineHint: '请选择 {count} 把{gear}（{n}/{count}）— 合成 · Space 放入或取出，Esc 取消',
    combineReady: '{chance} 几率获得无属性的{target} — 失败时所选的 {count} 把也会消失。请按开始合成',
    combineEquipped: '装备中的剑不能用于合成',
    combineTop: '已是最高阶的剑，无法合成',
    combineShort: '需要 {count} 把未装备的同种剑才能合成',
    combineSuccess: '合成成功 — 获得{gear}！',
    combineFail: '合成失败 — {count} 把{gear}消失了',
    plain: '没有属性',
  },

  inventory: {
    title: '背包',
    tabGear: '装备',
    tabConsumables: '消耗品',
    empty: '空',
    held: '持有 {count}',
    orbUse: '在装备标签中选择武器后使用。',
    boneUse: '在开始游戏时生效，只对那一局有效。',
    hintGear: '方向键 移动   Space 装备   {keys} 宝珠   Del 丢弃   C 合成   Tab 标签   Esc 返回',
    hintConsumables: '方向键 移动   Tab 标签   Esc 返回',
    hintTouch: '点击格子查看 — 装备、丢弃与宝珠在旁边的按钮',
  },

  bones: {
    title: '骨头',
    lead: '仅作用于本局。最多 3 个，开始后即消耗。',
    held: '{bone} x{count}',
    inUse: '已用 {count}',
    clear: '全部取下',
    start: '以此开始',
    slots: '已应用的骨头',
    total: '合计',
    none: '未应用任何骨头',
    sumHp: '敌人生命 +{percent}%',
    sumDrop: '掉落率 +{percent}%',
    sumBosses: '以首领取代稀有敌人',
    hintKeyboard: '↑ ↓ 移动   Space 应用   Esc 返回',
    hintTouch: '点击条目即可应用',
  },

  pause: {
    title: '暂停',
    survived: '生存 {time}    Lv {level}',
    resume: '继续',
    quit: '保存并返回标题',
    hint: 'Esc 或返回键继续   ·   指向稀有敌人可查看属性',
  },

  gameOver: {
    title: 'GAME OVER',
    damageDealt: '造成伤害',
    killsDealt: '击杀',
    goldEarned: '获得金币',
    skillLine: '{skill} Lv {level} · DPS {dps}',
    survived: '生存 {time}    Lv {level}',
    retry: '再来一局',
    toTitle: '返回标题',
    hintKeyboard: '↑ ↓ 移动   Space 选择',
    hintTouch: '点按条目进行选择',
  },

  ranking: {
    title: '排行榜',
    icon: '排行榜',
    empty: '还没有记录 — 打完一局即可登记名字。',
    place: '名次',
    name: '名字',
    damage: '造成伤害',
    champion: '第 1 名  {name}  {damage}',
    entryTitle: '排行榜第 {place} 名！',
    entryLead: '造成伤害 {damage} — 留下名字吧（3 个字母 + 1 个表情 + 国旗）',
    confirm: '登记',
    skip: '跳过',
    entryHintKeyboard: '← → 切换格子   ↑ ↓ 或输入字母   Enter 登记   Esc 跳过',
    entryHintTouch: '用 ▲ ▼ 选择字母与表情，然后按登记',
    register: '登记排行',
    registered: '已登记为第 {place} 名',
    localNote: '这是本设备的记录。玩家之间共享的排行榜正在准备中。',
    sharedNote: '所有玩家共享的临时排行榜。',
    loadingNote: '正在载入共享排行榜…',
    offlineNote: '无法连接共享排行榜，显示本设备的记录。',
    loginToEnter: '登录后登记',
    mine: '我的最佳：第 {place} 名 · {damage}',
    mineNone: '还没有登记的记录',
    enteredAfterLogin: '已登录 — 记录已登上排行榜',
  },

  account: {
    title: '账号',
    iconSignedOut: '登录',
    iconSignedIn: '账号',
    leadSignedOut: '登录后记录会保存到账号，可以在其他设备上继续游玩，也能把记录登上排行榜。不登录也可以照常游玩。',
    leadRanking: '登上排行榜需要登录。登录回来后，这条记录会马上登记。',
    noProviders: '目前还没有可用的登录方式。',
    offline: '无法连接服务器。请稍后再试。',
    retry: '重试',
    signedIn: '已用 {provider} 登录 — {name}',
    providers: { google: '使用 Google 登录', kakao: '使用 Kakao 登录', facebook: '使用 Facebook 登录', twitter: '使用 X 登录', test: '测试登录' },
    providerNames: { google: 'Google', kakao: 'Kakao', facebook: 'Facebook', twitter: 'X', test: '测试' },
    logout: '退出登录',
    remove: '删除账号',
    removeConfirm: '确定删除吗？再按一次即删除',
    privacy: '隐私政策',
    resolve: '选择记录',
    syncOff: '同步已关闭',
    syncing: '正在保存记录…',
    synced: '记录已同步 · {time}',
    syncError: '同步失败 — 连接后会再试',
    syncConflict: '本设备与账号的记录不同 — 请选择要保留哪一份',
    loginOk: '已登录',
    loginError: '登录失败，请再试一次',
    loginCancelled: '已取消登录',
    loggedOut: '已退出登录',
    removed: '账号已删除',
    hintKeyboard: '↑ ↓ 移动   Space 选择   Esc 返回',
    hintTouch: '点按条目进行选择',
  },

  conflict: {
    title: '要使用哪一份记录？',
    lead: '本设备与账号中有不同的记录。没有选择的那一份将会丢失。',
    device: '本设备',
    cloud: '账号',
    swords: '剑 {n} 把',
    passives: '被动 {n} 阶 · 剩余点数 {points}',
    orbs: '宝珠 {n} 个',
    bones: '骨头 {n} 个',
    savedRun: '有存档',
    noSavedRun: '没有存档',
    useDevice: '使用本设备的记录',
    useCloud: '使用账号的记录',
    later: '稍后选择',
  },

  skillPick: {
    startTitle: '初始技能',
    startSubtitle: '选择本局带入的一个技能',
    dropTitle: '随机技能',
    dropSubtitle: '三选一 — 已持有的技能会被强化',
    drop: '随机技能',
    new: '新技能',
    upgrade: '强化 · Lv {level}',
    hintKeyboard: '← → 移动   Space 选择   (1-3 直接选择)',
    hintTouch: '点击想要的卡片',
  },

  slot: {
    startTitle: '初始技能',
    startSubtitle: '本局带入的一个技能',
    confirm: '确定',
    hintKeyboard: '按 Space 或 Enter 确定',
    hintTouch: '点击确定停下',
    won: '获得 {skill}',
  },

  upgrade: {
    levelUp: 'LEVEL UP',
    level: 'Lv {level}',
    acquired: '获得',
    enhanced: '强化',
    hintKeyboard: '← → 移动   Space 选择   （1-4 直接选）',
    hintTouch: '点按想要的一项',
  },

  hud: {
    level: 'Lv {level}',
    enemies: '敌人 {count}',
    dps: 'DPS {dps}',
    formulaDamage: '伤害 {damage} = (基础 {base} × 被动 {passive} + 装备 {gear}) × 强化 {run}',
    formulaRate: '每秒 {rate} 次 = 基础 {base} × 被动 {passive} × 装备 {gear} × 强化 {run}',
    formulaMango: ' × 芒果 {mango}',
    formulaScale: ' × 修正 {scale}',
    formulaGearScale: ' × 装备伤害 {scale}',
    formulaCap: '每秒最多 {rate} 次（冷却下限）',
    formulaTargets: '目标 {targets} = {parts}',
    targetChain: '连锁 {n}',
    targetPierce: '穿透 {n}',
    targetOrbs: '额外球体 {n}',
    targetShots: ' × 投射物 {n}',
    formulaDps: 'DPS {dps} = {damage} × {rate} × {targets}',
    formulaNote: '不含暴击',
  },

  game: {
    intro: 'Exile, do something!',
    introHintKeyboard: 'WASD 或方向键移动 — 攻击自动进行',
    introHintTouch: '拖动摇杆移动 — 攻击自动进行',
    gearFound: '获得 {gear} — 可在主界面装备',
    orbFound: '获得{orb} — 在背包中使用',
    mango: '白芒果',
    mangoEaten: '白芒果！{seconds} 秒无敌 · 攻击速度与移动速度 +100%',
    boneFound: '获得{bone} — 在下一局开始前应用',
    shardFound: '神圣碎片 {held}/{need}',
    orbMade: '神圣宝珠完成 — 被动点数 +1',
    pickedUp: '获得 {skill}',
    enhancedPickup: '强化 {skill}',
    altarOffer: '祭坛 · {enemies}',
    altarCrowd: '{kind} ×{count}',
    altarCrowdRare: '稀有{kind} ×{count}',
    altarWoke: '祭坛苏醒了 — {enemies}',
  },

  rare: { title: '稀有' },

  info: {
    patchTitle: '更新日志',
    guideTitle: '游戏指南',
    hintKeyboard: '↑ ↓ 或滚轮滚动   ·   Esc 返回',
    hintTouch: '上下滑动   ·   点击关闭返回',
    guideHintKeyboard: '↑ ↓ 章   ← → 标签   滚轮 · PageUp/Down 滚动   Esc 返回',
    guideHintTouch: '点击章节或标签   ·   上下滑动',
  },

  credits: {
    title: '制作人员',
    roleAuthor: '制作',
    roleDev: '开发',
    roleEngine: '引擎',
  },

  confirm: {
    newRunTitle: '有一局还没结束',
    newRunBody: '开始新游戏会清除已保存的记录。',
    startAnyway: '开始新游戏',
    loadInstead: '继续那一局',
    cancel: '取消',
  },

  upgrades: {
    damage: { label: '攻击力 +{n}%', detail: '{skill}的伤害按基础值提高 {n}%' },
    attackSpeed: { label: '攻击速度 +{n}%', detail: '{skill}每秒攻击次数按基础值提高 {n}%' },
    range: { label: '射程 +{n}%', detail: '{skill}的射程按基础值增加 {n}%' },
    projectileSpeed: { label: '弹速 +{n}%', detail: '{skill}按基础值提速 {n}%，射程也同样增加' },
    orbitSpeed: { label: '旋转速度 +{n}%', detail: '{skill}按基础值加快环绕 {n}%' },
    chainCount: { label: '连锁次数 +{n}', detail: '{skill}多连锁 {n} 个敌人' },
    pierceCount: { label: '穿透次数 +{n}', detail: '{skill}多穿透 {n} 个敌人' },
    orbCount: { label: '球体数量 +{n}', detail: '{skill}多环绕 {n} 个球体' },
  },

  names: {
    skills: {
      meleeStrike: '打击',
      fireball: '火球',
      chainLightning: '连锁闪电',
      iceSpear: '冰枪',
      voidOrb: '虚空球',
      thunderStrike: '落雷',
    },
    skillSummaries: {
      meleeStrike: '朝最近的敌人短促挥击，范围内的敌人一并命中。',
      fireball: '向最近的敌人投出火球，命中第一个敌人后炸开，周围的敌人也会被波及。',
      chainLightning: '瞬发闪电命中敌人后跳向最近的下一个，不会重复命中同一个。',
      iceSpear: '穿透敌人前进，并给掠过的所有敌人附加冰冷（移动速度 -30%）。',
      voidOrb: '球体顺时针环绕你，扫到的敌人都会受伤，无需瞄准。',
      thunderStrike: '从天上降下一道雷劈向你周围的一名敌人。若其死亡，有一半概率立刻再落一道。',
    },
    tags: {
      물리: '物理',
      공격: '攻击',
      근접: '近战',
      투사체: '弹道',
      원거리: '远程',
      주문: '法术',
      화염: '火焰',
      번개: '闪电',
      연쇄: '连锁',
      냉기: '冰冷',
      관통: '穿透',
      공허: '虚空',
      오라: '光环',
    },
    enemies: { boss: '首领', fugitive: '逃亡者', grunt: '杂兵', brute: '巨汉', runner: '疾走者', shooter: '射手' },
    gear: {
      rustySword: '生锈的剑',
      onigoroshi: '鬼杀',
      ironSword: '铁剑',
      steelSword: '钢剑',
      runedSword: '符文剑',
    },
    gearImplicits: {
      onigoroshi: '造成伤害的 {value} 转为吸血',
      runedSword: '技能投射物 +{value} 个',
      steelSword: '伤害 +{value}',
      ironSword: '攻击速度 +{value}',
      rustySword: '{skill}的攻击速度 +{value}',
    },
    affixes: {
      giant: '巨大',
      swift: '迅捷',
      critical: '致命',
      mighty: '强力',
      cruel: '残酷',
      frenzied: '狂乱',
      evasive: '闪避',
      magnetic: '磁力',
      volleying: '连射',
      spider: '蜘蛛',
    },
    affixDetails: {
      giant: '生命 +50%',
      swift: '移动速度 +20%',
      critical: '暴击几率 20%',
      mighty: '伤害 +50%',
      cruel: '暴击伤害 +50%',
      frenzied: '攻击速度 +15%',
      evasive: '无敌时间 +30%',
      magnetic: '拾取范围 +40%',
      volleying: '弹射物 +2',
      spider: '死亡处留下蛛网 — 1 分钟内移动速度 -30%',
    },
    affixGearDetails: {
      mighty: '伤害 +{value}%',
      critical: '暴击几率 +{value}%',
      cruel: '暴击伤害 +{value}%',
      frenzied: '攻击速度 +{value}%',
      giant: '最大生命 +{value}%',
      swift: '移动速度 +{value}%',
      evasive: '无敌时间 +{value}%',
      magnetic: '拾取范围 +{value}%',
    },
    orbs: {
      transmute: '变化宝珠',
      chaos: '混沌宝珠',
      awaken: '觉醒宝珠',
      explode: '爆炸宝珠',
    },
    orbShorts: {
      transmute: '变化',
      chaos: '混沌',
      awaken: '觉醒',
      explode: '爆炸',
    },
    orbDetails: {
      transmute: '将词缀重新随机为 1~2 条',
      chaos: '将词缀重新随机为 2~4 条',
      awaken: '追加 1 条词缀（最多 6 条）',
      explode: '把一条词缀换成高一阶的另一条 — 20% 概率摧毁装备',
    },
    bones: {
      skull: '远古头骨',
      rib: '肋骨',
    },
    boneShorts: {
      skull: '头骨',
      rib: '肋骨',
    },
    boneDetails: {
      skull: '稀有敌人改为首领出现',
      rib: '所有敌人生命 +100%，掉落率 +50%',
    },
    passives: { damage: '伤害', attackSpeed: '攻击速度', moveSpeed: '移动速度', luck: '幸运' },
    passiveDetails: {
      damage: '伤害 +10%',
      attackSpeed: '攻击速度 +10%',
      moveSpeed: '移动速度 +1%',
      luck: '幸运 +1%（暂无效果）',
    },
  },

  guideChapters: {
    basics: '基础',
    combat: '战斗',
    skills: '技能',
    enemies: '敌人',
    items: '道具',
    progress: '永久成长',
  },

  guideTabs: {
    goal: '目标',
    controls: '操作',
    mobile: '移动端',
    saving: '存档',
    levels: '升级',
    getSkills: '获得技能',
    damage: '伤害计算',
    common: '普通敌人',
    boss: '首领',
    fugitive: '逃亡者',
    rares: '稀有敌人',
    difficulty: '难度',
    dropRules: '掉落规则',
    field: '场上道具',
    gear: '装备',
    affixes: '属性',
    orbs: '宝珠',
    bones: '骨头',
    passives: '被动',
    inventory: '背包',
    ranking: '排行榜',
  },

  guide: {
    cards: {
      goal: [
        {
          title: '目标',
          lines: [
            '在源源不断涌来的敌人中尽可能活得更久。',
            '生命值为 {hp}。碰到敌人的身体或被敌人的子弹击中会减少，归零即结束。',
            '攻击全部自动进行。你要做的是站位，以及选择强化什么。',
          ],
        },
        {
          title: '一局的流程',
          lines: [
            '开始游戏 → 选择骨头（有的话）→ 从 {choices} 张技能卡中选一张 → 战斗。',
            '首领在第 {bossFirst} 秒首次出现，之后每 {bossEvery} 秒出现一只。',
            '时间越久，新出现的敌人越坚硬，稀有敌人也越多。',
            '死亡后在结算画面回顾这一局，并选择再来一局 · 返回标题 · 设置之一离开。',
          ],
        },
      ],
      controls: [
        {
          title: '键盘 · 鼠标',
          lines: [
            '用 WASD 或方向键移动。',
            '按 Esc 或左上角按钮暂停。',
            '把鼠标移到左上角的技能图标上会显示该技能的 DPS 计算式，移到稀有敌人上会显示属性。查看期间战斗会暂停。',
          ],
        },
        {
          title: '选择画面',
          lines: [
            '用方向键移动光标，按 Space · 点击 · 触摸 · 数字键选择。',
            '移动键不会确认选择，以免为了移动而按住的键替你做出选择。',
            '选择画面刚打开的一小段时间内不接受输入。',
          ],
        },
        {
          title: '菜单',
          lines: [
            '每个画面都可以用左上角的返回按钮或 Esc 离开。',
            '本指南用 ↑↓ 切换章节，←→ 切换标签，滚轮 · 拖动 · PageUp/PageDown 滚动。',
          ],
        },
      ],
      mobile: [
        {
          title: '移动',
          lines: [
            '在设置中二选一。',
            '在触摸处生成 — 平时不显示，手指按下的位置会出现摇杆。摇杆大小可在设置中调整。',
            '倾斜 — 倾斜设备来移动。最初读取的角度即为中立，以舒服的姿势拿着即可。',
          ],
        },
        {
          title: '触摸',
          lines: [
            '点击技能图标或稀有敌人会显示同样的信息。那根手指也在操控移动，所以战斗不会暂停。',
            '设备的返回键为暂停。',
          ],
        },
      ],
      saving: [
        {
          title: '自动存档',
          lines: [
            '每 {autosave} 秒以及每次暂停时自动存档。',
            '用暂停菜单的「保存并返回标题」离开，之后在标题画面的「继续游戏」接着玩。',
            '死亡后存档会被删除。存档是为了暂时停下，而不是为了撤销死亡。',
          ],
        },
        {
          title: '存在存档期间',
          lines: [
            '无法更换装备中的武器，以免读取的那一局与带出去的武器不一致。',
            '游戏进行中无法更改语言。',
          ],
        },
        {
          title: '账号',
          lines: [
            '登录是可选的。在标题画面的账号中用 Google、Kakao 等社交账号登录后，记录（装备·被动·宝珠·骨头·存档·设置）会保存到账号，可以在其他设备上继续游玩。',
            '本设备与账号的记录不同时，会询问要保留哪一份。没有选择的那一份将会丢失。',
            '登录只使用账号的唯一编号和显示名称，不收集电子邮箱。可以在账号画面退出登录或删除账号。',
          ],
        },
      ],
      levels: [
        {
          title: '经验',
          lines: [
            '击杀敌人会掉落经验宝石。进入 {pickup}px 范围内会被吸过来，且不会消失。',
            '越坚硬的敌人经验越多，稀有敌人按属性数量给得更多。',
          ],
        },
        {
          title: '升级',
          lines: [
            '升级时会从持有的技能中随机选出一个，并给出该技能的强化选项。',
            '强化按技能分别累积。强化火球不会影响打击。',
            '数值强化每次增加基础值的一定比例。选三次 +20% 即为基础值的 +60%。',
            '伤害和攻击速度强化每个技能最多 {maxPicks} 次，连锁次数最多 {chainCap}。已满的强化不会再出现。',
          ],
        },
        {
          title: '技能等级',
          lines: ['技能图标角落的数字是该技能的等级。获得时为 1，每强化一次加 1。'],
        },
      ],
      getSkills: [
        {
          title: '第一个技能',
          lines: ['开局从 {choices} 张技能卡中选一张。没有基础攻击。'],
        },
        {
          title: '技能掉落',
          lines: [
            '敌人有 {skillChance} 几率掉落技能。首领和逃亡者必定掉落。',
            '第一次拾取的技能以基础属性加入，已持有的技能则会打开它的强化选项。',
          ],
        },
        {
          title: '随机技能',
          lines: [
            '敌人有 {randomSkillChance} 几率掉落。拾取后从 {choices} 张技能卡中选一张。',
            '选择已持有的技能会紧接着进行该技能的强化。',
          ],
        },
      ],
      damage: [
        {
          title: '一次伤害',
          lines: [
            '（技能伤害 × 被动 + 装备攻击力）× 装备固定属性 × 战斗中强化 × 技能修正。',
            '效果按 被动 → 装备 → 战斗中强化 的顺序生效，各层之间相乘。同一层内的强化在基础值上相加。',
          ],
        },
        {
          title: '暴击',
          lines: [
            '所有攻击有 {critChance} 几率暴击，造成 {critMulti} 倍伤害。',
            '武器的{critAffix}属性提高几率，{cruelAffix}属性提高倍率。',
          ],
        },
        {
          title: '攻击速度',
          lines: [
            '每秒攻击次数 = 技能基础值 × 被动 × 装备 × 战斗中强化。吃下白芒果期间 ×{mangoRate}。',
            '攻击间隔不会低于 {minCooldown}ms。',
          ],
        },
        {
          title: 'DPS 卡片',
          lines: ['战斗中把鼠标移到技能图标上，上面的计算会以该技能的数值展开。不含暴击。'],
        },
      ],
      common: [
        {
          title: '普通敌人',
          lines: [
            '从画面外出现并逼近。时间越久种类越多。',
            '敌人碰到你时各自造成伤害，被包围时会同时受伤。',
            '敌人出现的间隔从 {spawnStart} 秒开始，缩短到 {spawnMin} 秒。场上同时最多 {maxAlive} 只。',
          ],
        },
      ],
      boss: [
        {
          title: '首领留下的东西',
          lines: [
            '必定掉落一个技能和一把剑，并必定留下一座祭坛。',
            '有 {shardChance} 几率掉落神圣碎片，{ribChance} 几率掉落肋骨。{bossOnlyOrbs}也只由首领掉落。',
            '其余所有掉落的几率提高 {bossBonus}。',
          ],
        },
      ],
      fugitive: [
        {
          title: '如何抓住',
          lines: [
            '画面边缘的标记指向逃亡者所在的方向。',
            '射程长或能多次命中的技能更有利。每次被击中它都会逃到稍远的地方。',
          ],
        },
      ],
      rares: [
        {
          title: '稀有敌人',
          lines: [
            '{rareChance} 的敌人会以稀有出现，并随时间增多。带有描边，容易辨认。',
            '拥有 {rareMin}~{rareMax} 个属性，越多描边颜色越深。相同属性叠加时效果也会叠加。',
            '鼠标移上去或点击会显示它的属性。',
            '每个属性使所有掉落率提高 {dropBonus}。越危险越值钱。',
          ],
        },
      ],
      difficulty: [
        {
          title: '随着时间推移',
          lines: [
            '每过 1 分钟，新出现敌人的生命增加 {hpStep}（乘算），稀有敌人增加 {rareStep}。',
            '从第 {lateFrom} 分钟起，每一步变为 {lateMult} 倍 — 生命每分钟 {hpLate}，稀有敌人每分钟 {rareLate}。',
            '已出现的敌人不变，从新出现的敌人开始改变。',
          ],
        },
        {
          title: '出现时间',
          lines: [
            '疾走者从 {runnerAt} 秒、射手从 {shooterAt} 秒、巨汉从 {bruteAt} 秒开始出现。',
            '首领在 {bossFirst} 秒首次出现，之后每 {bossEvery} 秒。逃亡者在 {fugFirst} 秒首次出现，之后每 {fugEvery} 秒。',
          ],
        },
      ],
      dropRules: [
        {
          title: '掉落率规则',
          lines: [
            '稀有敌人每个属性使所有掉落率提高 {dropBonus}，首领提高 {bossBonus}。',
            '只由首领掉落的东西和必定掉落的东西不享受此加成。',
            '放入肋骨的一局，所有掉落率会进一步提高。',
          ],
        },
        {
          title: '掉在地上的东西',
          lines: [
            '除经验外的掉落物会在 {life} 秒后消失，最后 {warning} 秒内会越闪越快。',
            '掉落物按等级有不同的名牌颜色和落地声音。',
            '稀有等级的掉落物会立在半透明的白色光柱中，远处也很显眼。',
          ],
        },
      ],
      field: [
        {
          title: '经验宝石',
          lines: ['每次击杀都会掉落，且不会消失。靠近时会被吸过来。'],
        },
        {
          title: '技能',
          lines: ['{skillChance} 几率。新技能直接加入，已持有的技能会打开强化选项。'],
        },
        {
          title: '随机技能',
          lines: ['{randomSkillChance} 几率。拾取后从 {choices} 张技能卡中选一张。'],
        },
        {
          title: '生命药水',
          lines: [
            '{potionChance} 几率。恢复最大生命的 {heal}。',
            '生命已满时不会拾取，而是留在原地。',
          ],
        },
        {
          title: '白芒果',
          lines: [
            '{mangoChance} 几率。吃下后 {mangoSecs} 秒内不受伤害，所有技能的攻击速度和移动速度提高 {mangoBoost}。',
          ],
        },
        {
          title: '祭坛',
          lines: [
            '首领必定留下，其他敌人有 {altarChance} 几率留下。',
            '会召唤上面写着的敌人。只有靠近才会苏醒，也可以直接走过。需要先离开一次再靠近才会苏醒。',
            '可能出现的：{altarOffers}。',
          ],
        },
        {
          title: '神圣碎片',
          lines: [
            '首领有 {shardChance} 几率掉落。集齐 {perOrb} 个变成神圣宝珠，即 {points} 点被动点数。',
          ],
        },
      ],
      gear: [
        {
          title: '装备',
          lines: [
            '每击杀一只首领必定掉落一把剑。{fromKillTiers} 阶的剑普通敌人也会偶尔掉落。',
            '剑的阶数越小越强。攻击力会加到所有技能的单次伤害上。',
            '拾取的剑进入仓库，在标题画面的背包中装备。',
            '剑最多可带 {maxPrefix} 个词缀前缀（攻击）和 {maxPrefix} 个词缀后缀（防御 · 移动）。每条属性出现的几率为 {affixChance}，每出现一条就再掷下一条。',
            '固定属性由剑的种类决定，与前缀 · 后缀数量无关，始终存在。',
            '合成 — 在背包中把 {combineCount} 把未装备的同种剑合成，有 {combineChance} 几率获得高一阶的无属性剑。失败时放入的剑也会消失。',
          ],
        },
      ],
      affixes: [
        {
          title: '属性',
          lines: [
            '稀有敌人与武器使用相同的属性。前缀为攻击，后缀为防御与移动。',
            '武器上的属性有 {tierCount} 个阶级，1 阶最强也最稀有。',
          ],
        },
      ],
      orbs: [
        {
          title: '宝珠',
          lines: ['重掷或增加武器属性的消耗品。在背包的装备标签中选择剑后使用。'],
        },
      ],
      bones: [
        {
          title: '骨头',
          lines: [
            '开局前最多放入 {maxBones} 个来改变这一局。放入的骨头会被消耗。',
            '开始游戏和再来一局都会经过骨头界面。没有骨头时跳过。',
            '读取的那一局沿用最初放入的骨头。',
            '即使放入远古头骨，同时在场的首领最多 {maxBosses} 只，之后稀有敌人的位置会变成普通敌人。',
          ],
        },
      ],
      passives: [
        {
          title: '被动',
          lines: [
            '{perOrb} 个神圣碎片 = 1 个神圣宝珠，1 个宝珠 = {points} 点被动点数。',
            '点数在标题画面的被动中使用。被动对每一局始终生效。',
          ],
        },
      ],
      inventory: [
        {
          title: '装备标签',
          lines: [
            '持有的剑排列在 {cols}×{rows} 的格子中。选中格子后旁边会显示攻击力 · 固定属性 · 属性。',
            '装备 · 丢弃 · 使用宝珠通过旁边的按钮或 Space 进行。装备中的剑不能丢弃。',
          ],
        },
        {
          title: '消耗品标签',
          lines: ['显示持有的宝珠和骨头数量，以及在哪里使用。'],
        },
      ],
      ranking: [
        {
          title: '排行榜',
          lines: [
            '只有已登录的账号可以登上排行榜，按这一局造成的总伤害排名。选择 {nameLength} 个字母的名字和图标 · 国旗，每个账号在榜上只有一个名字和一条最佳记录。',
            '显示前 {rankSize} 名，是与其他玩家共享的排行榜。登录后还会显示自己的最佳记录和名次。',
          ],
        },
      ],
    },
    labels: {
      skillStats: '伤害 {damage} · 每秒 {rate} 次 · DPS {dps}',
      skillRange: '射程 {range}px',
      skillProjectile: '弹速 {speed} — 弹速提高时射程也按同样比例增加',
      skillUpgrades: '强化：{picks}',
      skillScale: '技能伤害修正 ×{scale}',
      enemyStats: '生命 {hp} · 接触伤害 {contact} · 经验 {xp} · 移动速度 {speed}',
      fromStart: '一开始就出现',
      unlocksAt: '第 {time} 秒起出现',
      shot: '子弹伤害 {damage} · 每 {every} 秒 · 射程 {range}px',
      volley: '每 {every} 秒向四周发射 {count} 发子弹 · 每发伤害 {damage}',
      enemyNotes: {
        grunt: '径直冲向你，数量很多。',
        brute: '移动缓慢但非常坚硬，被碰到就会掉很多血。',
        runner: '脆弱但速度快，逃跑也甩不掉。',
        shooter: '会保持距离停下射击。走过去解决，或者用射程长的技能。',
        boss: '第 {first} 秒出现第一只，之后每 {every} 秒出现一只。非常坚硬也非常疼。',
        fugitive: '从不反击。坚硬且非常快，每次受击都会逃开，跑一段后停下。第一个在 {first} 秒出现，此后每 {every} 秒一个，{life} 秒后消失。击杀必定掉落技能。',
      },
      affixEnemy: '稀有敌人：{detail}',
      affixWeapon: '武器：{ladder}',
      affixRung: '{tier}阶 {value}',
      affixRangedOnly: '只出现在会射击的敌人身上',
      affixWeaponOnly: '只出现在武器上',
      affixEnemyOnly: '只出现在稀有敌人身上',
      chanceKill: '击杀敌人时 {chance}',
      chanceBoss: '击杀首领时 {chance}',
      gearTier: '{tier} 阶 · 攻击力 +{attack}',
      gearImplicit: '固定：{text}',
      gearBossShare: '首领掉落的剑中占 {share}',
      gearFromKill: '击杀普通敌人时 {chance}',
      gearBossOnly: '只由首领掉落',
      boneStack: '一局可以放入多个',
      boneSingle: '一局只能放入一个',
      passiveRank: '每阶 {detail} · 最多 {max} 阶',
    },
  },
};
