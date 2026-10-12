import type { Strings } from '@/i18n/types';

/** 日本語. */
export const ja: Strings = {
  native: '日本語',

  common: { back: '戻る', close: '閉じる', on: 'オン', off: 'オフ' },

  menu: {
    byline: 'created by whitemango',
    start: 'ゲーム開始',
    load: 'つづきから',
    noSave: 'セーブなし',
    settings: '設定',
    guide: '遊び方',
    patch: 'パッチノート',
    credits: 'クレジット',
    hintKeyboard: '↑ ↓ で移動   Space で決定   （クリックでも可）',
    hintTouch: '項目をタップして選択',
  },

  settings: {
    title: '設定',
    padSize: 'パッドの大きさ',
    padPlace: '固定パッドの位置',
    padPlaceOnlyFixed: '固定パッド専用',
    movement: 'モバイル操作方式',
    modeFixed: '固定パッド',
    modeFloating: '触れた位置に出す',
    modeTilt: '傾け操作',
    bgm: 'BGM音量',
    reset: '初期設定に戻す',
    hint: '↑ ↓ で移動   ◀ ▶ で調整   Space で決定   Esc で戻る',
    hintPlacing: '方向キーで動かすか画面を押して配置   ·   Space で確定',
    hintFloating: '画面のどこでも、触れた位置にパッドが出ます   ·   Esc で戻る',
    hintTilt: '端末を傾けて移動します。パッドは表示されません   ·   Esc で戻る',
    languageTitleOnly: '言語はタイトル画面でのみ変更できます',
    tiltRefused: 'この端末では傾け操作を使えません',
  },

  pause: {
    title: '一時停止',
    survived: '生存 {time}    Lv {level}',
    resume: 'つづける',
    quit: 'セーブしてタイトルへ',
    hint: 'Esc または戻るでつづける   ·   レア敵を指すと強化効果が見えます',
  },

  gameOver: {
    title: 'GAME OVER',
    survived: '生存 {time}    Lv {level}',
    retry: 'もう一度',
    toTitle: 'タイトルへ',
    hintKeyboard: '↑ ↓ で移動   Space で決定',
    hintTouch: '項目をタップして選択',
  },

  upgrade: {
    levelUp: 'LEVEL UP',
    level: 'Lv {level}',
    acquired: '習得',
    enhanced: '強化',
    hintKeyboard: '← → で移動   Space で決定   （1-4 で直接選択）',
    hintTouch: '選びたい方をタップ',
  },

  hud: {
    level: 'Lv {level}',
    enemies: '敵 {count}',
    damage: '攻撃力 {damage}',
    rate: '攻速 {rate}/s',
  },

  game: {
    intro: 'Exile, do something!',
    introHintKeyboard: 'WASD・方向キーで移動 — 攻撃は自動',
    introHintTouch: 'スティックを引いて移動 — 攻撃は自動',
    bossArrived: 'ボス出現',
    pickedUp: '{skill} 習得',
    enhancedPickup: '{skill} 強化',
  },

  rare: { title: 'レア' },

  info: {
    patchTitle: 'パッチノート',
    guideTitle: '遊び方',
    hintKeyboard: '↑ ↓ またはホイールでスクロール   ·   Esc で戻る',
    hintTouch: '上下にスワイプ   ·   閉じるで戻る',
  },

  credits: {
    title: 'クレジット',
    roleAuthor: '制作',
    roleDev: '開発',
    roleEngine: 'エンジン',
    roleIcons: 'アイコン',
    roleMusic: 'BGM',
    roleSfx: '効果音',
  },

  upgrades: {
    damage: { label: '攻撃力 +{n}', detail: '{skill}のダメージが {n} 増えます' },
    attackSpeed: { label: '攻撃速度 +{n}', detail: '{skill}の毎秒攻撃回数が {n} 増えます' },
    range: { label: '射程 +{n}', detail: '{skill}の射程が {n}px 伸びます' },
    projectileSpeed: { label: '弾速 +{n}', detail: '{skill}が毎秒 {n}px 速く飛びます' },
    chainCount: { label: '連鎖回数 +{n}', detail: '{skill}が {n} 体多く連鎖します' },
    pierceCount: { label: '貫通回数 +{n}', detail: '{skill}が {n} 体多く貫きます' },
    orbCount: { label: '球の数 +{n}', detail: '{skill}が {n} 個多く周回します' },
  },

  names: {
    skills: {
      meleeStrike: '打撃',
      fireball: '火球',
      chainLightning: '連鎖雷',
      iceSpear: '氷槍',
      voidOrb: '虚無球',
    },
    skillSummaries: {
      meleeStrike: '最も近い敵へ短く振り抜き、範囲内の敵をまとめて叩きます。',
      fireball: '最も近い敵へ火の玉を投げます。最初に当たった敵で弾けます。',
      chainLightning: '即着の雷が敵を打ち、近くの次の敵へ移ります。同じ敵は二度打ちません。',
      iceSpear: '敵を貫いて進み、かすめた敵すべてに冷却（移動速度 -15%）を与えます。',
      voidOrb: '球が時計回りに周回し、触れた敵を叩きます。狙いは不要です。',
    },
    tags: {
      물리: '物理',
      공격: '攻撃',
      근접: '近接',
      투사체: '投射物',
      원거리: '遠距離',
      주문: '呪文',
      화염: '火炎',
      번개: '雷',
      연쇄: '連鎖',
      냉기: '冷気',
      관통: '貫通',
      공허: '虚無',
    },
    enemies: { boss: 'ボス', grunt: '雑兵', brute: '巨漢', runner: '俊足', shooter: '射手' },
    affixes: { giant: '巨大', swift: '俊敏', critical: '致命', mighty: '剛力' },
    affixDetails: {
      giant: '体力 +50%',
      swift: '移動速度 +20%',
      critical: '会心率 20%',
      mighty: 'ダメージ +50%',
    },
  },

  guide: {
    goal: {
      heading: '目的',
      lines: [
        '果てしなく押し寄せる敵の中で、できるだけ長く生き延びます。',
        '体力は {hp}。敵に触れるか弾に当たると減り、0 になると終わりです。',
        '攻撃はすべて自動です。プレイヤーがするのは立ち位置を決めることと、何を強化するか選ぶことです。',
      ],
    },
    controls: {
      heading: '操作',
      lines: [
        'WASD または方向キーで移動します。',
        'Esc・左上のボタン・（モバイル）戻るで一時停止します。',
        '強化選択画面：方向キーでカーソルを動かし、Space・クリック・タッチ・数字キー 1~4 で決めます。',
        '移動キーでは決定できません。移動のために押しっぱなしのキーが代わりに選んでしまうのを防ぐためです。',
        'レア敵にマウスを乗せるか触れると強化効果が見えます。一時停止中でも確認できます。',
      ],
    },
    mobile: {
      heading: 'モバイル操作',
      lines: [
        '設定で三つから選べます。',
        '固定パッド — 設定した位置に固定されます。大きさと位置を変えられます。',
        '触れた位置に出す — 普段は見えず、指が触れた場所にパッドが出ます。',
        '傾け操作 — 端末を傾けて動きます。最初に読み取った角度が中立になります。',
      ],
    },
    growth: {
      heading: '成長',
      lines: [
        '敵を倒すと経験値ジェムを落とします。近づくと吸い寄せられます。',
        'レベルが上がると {starters} を強化する選択肢が出ます。',
        'スキルを拾うとそのスキルの強化選択肢が出ます。初めて拾うスキルは強化なしの基本性能で手に入ります。',
        '強化はスキルごとに別々です。火球を上げても打撃はそのままです。',
      ],
    },
    skills: {
      heading: 'スキル',
      stats: '   ダメージ {damage} · 毎秒 {rate} 回 · 射程 {range}px',
      upgrades: '   強化: {picks}',
      starter: '初期スキル',
    },
    enemies: {
      heading: '敵',
      stats: '{name}  体力 {hp} · 接触 {contact} · 経験値 {xp}',
      fromStart: '最初から登場',
      unlocksAt: '{time} 秒から登場',
      notes: {
        grunt: 'まっすぐ突っ込んできます。数が多いです。',
        brute: '遅いが非常に硬く、触れるだけで大きく削られます。',
        runner: '脆いが速い。逃げても追いついてきます。',
        boss: '1 分ごとに 1 体現れます。非常に硬く痛いですが、倒せば必ずスキルを落とします。',
        shooter: '距離を取って止まり、撃ってきます。近づくか、射程の長いスキルで倒しましょう。',
      },
    },
    rares: {
      heading: 'レア敵',
      lines: [
        '敵の {chance} がレアとして現れ、縁取りを帯びます。',
        '強化効果を {min}~{max} 個持ち、多いほど縁の色が濃くなります。同じ効果は重なって累積します。',
        '強化効果 1 個につきスキルのドロップ率が {dropBonus} 上がります。危険な分だけ見返りがあります。',
      ],
    },
    drops: {
      heading: 'ドロップ',
      lines: [
        '経験値ジェム — 倒すたびに落ち、消えません。',
        'スキル — {skillChance} の確率。すでに持っていれば強化の選択肢になります。',
        '回復ポーション — {potionChance} の確率。最大体力の {heal} を回復します。体力が満タンなら拾わず残します。',
        '経験値以外のドロップは {life} 秒で消えます。最後の {warning} 秒は点滅が速くなります。',
      ],
    },
    saving: {
      heading: 'セーブ',
      lines: [
        '{autosave} 秒ごと、そして一時停止のたびに自動セーブされます。',
        '一時停止メニューの「セーブしてタイトルへ」で抜け、タイトルの「つづきから」で再開できます。',
        '死ぬとセーブは消えます。中断して戻るためのもので、死をなかったことにするためのものではありません。',
      ],
    },
  },
};
