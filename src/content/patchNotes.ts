import type { Language } from '@/i18n/types';

/**
 * 패치노트 / Patch notes.
 *
 * Newest entry first. To add one, put another object at the top of the
 * array with a line list per language — the title and pause screens read
 * straight from here.
 */
export interface PatchNote {
  readonly version: string;
  readonly date: string;
  readonly changes: Record<Language, readonly string[]>;
}

export const PATCH_NOTES: readonly PatchNote[] = [
  {
    version: '0.16',
    date: '2026-10-13',
    changes: {
      ko: [
        '글씨를 전체적으로 키우고 밝게 바꿨습니다 — 가장 작은 글씨도 이전의 안내 문구보다 큽니다.',
        '모든 글씨에 어두운 테두리가 생겨, 적이나 효과 위에 겹쳐도 묻히지 않습니다.',
        '게임 가이드 · 패치노트 · 설정 화면이 뒤를 완전히 가립니다. 이전에는 로고와 선택지가 글 위로 비쳐 보였습니다.',
        '일시정지 · 레벨 업 · 게임 오버 화면도 바탕을 더 어둡게 해 글이 먼저 읽힙니다.',
        '스킬 현황표가 단일피해 대신 스킬 레벨을 보여줍니다 — 획득하면 Lv 1, 강화할 때마다 1씩 오릅니다.',
        '플레이어 레벨은 체력바 위에만 표시됩니다. 현황표의 스킬 레벨과 헷갈리지 않도록 좌측 상단에서 뺐습니다.',
      ],
      en: [
        'Text is larger and brighter throughout — the smallest line in the game is now bigger than the old hint text.',
        'Every label carries a dark outline, so nothing disappears into an enemy or an effect behind it.',
        'The guide, the patch notes and the settings now cover the screen completely. The logo and the menu used to show through the words.',
        'Pause, level up and game over darken the field further, so the words read first.',
        'The loadout shows a skill’s level instead of its single-hit damage — Lv 1 when you pick it up, one more for every upgrade.',
        'Your own level now appears only above the health bar; it left the top-left corner so it cannot be read as a skill level.',
      ],
      ja: [
        '文字を全体的に大きく、明るくしました — 最小の文字でも以前の案内文より大きくなっています。',
        'すべての文字に暗い縁取りが付き、敵やエフェクトに重なっても埋もれません。',
        '遊び方・パッチノート・設定が背景を完全に覆うようになりました。以前はロゴや項目が文字の上に透けていました。',
        '一時停止・レベルアップ・ゲームオーバーも背景をより暗くし、文字が先に読めるようにしました。',
        'スキル一覧が単発ダメージではなくスキルレベルを表示します — 入手で Lv 1、強化ごとに 1 ずつ上がります。',
        'プレイヤーのレベルは体力バーの上だけに表示します。一覧のスキルレベルと紛れないよう左上から外しました。',
      ],
      zh: [
        '整体放大并提亮了文字 — 游戏中最小的字也比过去的提示文字更大。',
        '所有文字都有深色描边，叠在敌人或特效上也不会被吞没。',
        '游戏指南、补丁说明与设置界面现在完全遮住背景。此前标志和选项会透过文字显现。',
        '暂停、升级与游戏结束界面的背景也更暗，文字更先被读到。',
        '技能列表改为显示技能等级，不再显示单次伤害 — 获得时为 Lv 1，每次强化加 1。',
        '玩家等级只显示在生命条上方；为避免与技能等级混淆，已从左上角移除。',
      ],
    },
  },
  {
    version: '0.15',
    date: '2026-10-12',
    changes: {
      ko: [
        '타격 · 화염구 · 연쇄번개 · 얼음창 · 공허구체에 각자의 아이콘이 생겼습니다 — 바닥에 떨어진 스킬과 강화 화면에서 보입니다.',
        '화염구 · 얼음창 · 공허구체에 효과음이 생겼습니다.',
        '우두머리가 올 때 뿔소리가 울리고, 등장 알림이 금색 글씨와 바탕을 갖춰 한눈에 들어옵니다.',
        '글자를 화면에 늘어나는 배율보다 곱게 그립니다 — 같은 속도로 더 또렷합니다.',
        '적 수가 시간 표시 바로 아래로 옮겨졌습니다.',
        '체력바 위에 현재 레벨과 남은 체력이 함께 표시됩니다.',
        '게임 가이드를 본 뒤 패치노트를 열면 화면이 멈추던 문제를 고쳤습니다.',
      ],
      en: [
        'Strike, Fireball, Chain Lightning, Ice Spear and Void Orb each wear their own icon — where they drop, and on the upgrade screen.',
        'Fireball, Ice Spear and Void Orb have sounds of their own.',
        'A boss arrives on a horn, and its banner now reads in gold on a plate you cannot miss.',
        'Text is drawn finer than the window stretches it — sharper, at the same frame rate.',
        'The enemy count moved directly under the clock.',
        'Your level and the health you have left now sit above the health bar.',
        'Fixed the freeze when the patch notes were opened straight after the guide.',
      ],
      ja: [
        '打撃・火球・連鎖雷・氷槍・虚無球にそれぞれのアイコンが付きました — 地面のドロップと強化画面に出ます。',
        '火球・氷槍・虚無球に専用の効果音が付きました。',
        'ボスが来るときに角笛が鳴り、出現の知らせが金色の文字と下地で目に入りやすくなりました。',
        '文字を画面の拡大率より細かく描くようにしました — 同じ速さでより鮮明です。',
        '敵の数を時間表示のすぐ下に移しました。',
        '体力バーの上に現在のレベルと残り体力を表示します。',
        '遊び方を見た直後にパッチノートを開くと固まる不具合を直しました。',
      ],
      zh: [
        '打击、火球、连锁闪电、冰枪、虚空球各有了自己的图标 — 掉在地上时和强化界面都能看到。',
        '火球、冰枪、虚空球有了各自的音效。',
        '首领到来时会响起号角，出现提示改为金色字配底板，一眼就能看到。',
        '文字以高于画面拉伸倍率的精度绘制 — 帧数不变，更加清晰。',
        '敌人数量移到了计时器正下方。',
        '生命条上方会一并显示当前等级与剩余生命。',
        '修复了看完游戏指南后打开补丁说明会卡住的问题。',
      ],
    },
  },
  {
    version: '0.14',
    date: '2026-10-12',
    changes: {
      ko: [
        '스킬의 기본 위력을 적 체력 기준으로 맞췄습니다 — 단일 대상 스킬은 초당 적 체력의 절반, 여럿을 치는 스킬은 1/3입니다.',
        '스킬 강화 한 번은 그 스킬이 처음 가진 위력의 약 20%만큼 세집니다.',
        '스킬 현황표가 공격력 대신 단일피해와 DPS를 보여줍니다.',
        '공허구체의 공격속도 강화가 회전 속도 강화로 바뀌었습니다.',
        '연쇄번개의 연쇄 횟수는 7회까지 올릴 수 있고, 한계에 닿으면 더 이상 선택지에 나오지 않습니다.',
        '얼음창의 관통이 사라졌습니다. 대신 사정거리를 강화할 수 있습니다.',
        '게임 가이드에 목차가 생겼습니다 — 목표 · 조작 · 성장 · 스킬 · 적을 방향키로 넘깁니다.',
      ],
      en: [
        'Skill power is set against enemy health — a single-target skill does half a plain enemy per second, one that hits several does a third.',
        'One upgrade is worth about a fifth of what that skill started with.',
        'The loadout now reads single-hit damage and DPS rather than attack power.',
        'Void Orb upgrades orbit speed where it used to upgrade attack speed.',
        'Chain Lightning chains up to seven times, and stops being offered once it is there.',
        'Ice Spear no longer pierces; it upgrades its range instead.',
        'The guide has a contents list — goal, controls, growing, skills, enemies — walked with the arrow keys.',
      ],
      ja: [
        'スキルの基本威力を敵の体力に合わせました — 単体スキルは毎秒で敵 1 体の半分、複数を叩くスキルは 1/3 です。',
        '強化 1 回でそのスキルの初期威力の約 2 割だけ強くなります。',
        'スキル一覧が攻撃力ではなく単発ダメージと DPS を表示します。',
        '虚無球の攻撃速度強化が回転速度の強化になりました。',
        '連鎖雷の連鎖回数は 7 回まで。上限に達すると選択肢に出なくなります。',
        '氷槍の貫通をなくし、代わりに射程を強化できるようにしました。',
        '遊び方に目次が付きました — 目的・操作・成長・スキル・敵を方向キーで移動します。',
      ],
      zh: [
        '技能基础强度以敌人生命为准 — 单体技能每秒造成约半只普通敌人的伤害，多目标技能为三分之一。',
        '每次强化约提升该技能初始强度的两成。',
        '技能列表改为显示单次伤害与 DPS，而不是攻击力。',
        '虚空球的攻击速度强化改为旋转速度强化。',
        '连锁闪电最多可连锁 7 次，达到上限后不再出现在选项中。',
        '冰枪不再穿透，改为可强化射程。',
        '游戏指南新增目录 — 目标、操作、成长、技能、敌人，用方向键切换。',
      ],
    },
  },
  {
    version: '0.13',
    date: '2026-10-12',
    changes: {
      ko: [
        '경험치가 적의 강함에 비례하도록 바뀌었습니다 — 체력과 피해량에서 계산되며, 희귀 적은 강화효과만큼 더 줍니다.',
        '저장된 기록이 있을 때 게임 시작을 누르면 경고하고, 이어서 하기 · 새로 시작 · 취소 중에 고를 수 있습니다.',
        '제작자 정보를 설정 하위로 옮겼습니다.',
        '브라우저 탭 아이콘으로 로고를 사용합니다.',
      ],
      en: [
        'XP now follows how strong an enemy is — worked out from its health and damage, and a rare pays for its affixes.',
        'Starting a new run with a save waiting asks first: carry on with it, start fresh, or cancel.',
        'Credits moved under Settings.',
        'The logo is the browser tab icon.',
      ],
      ja: [
        '経験値が敵の強さに比例するようになりました — 体力と攻撃力から算出し、レア敵は強化効果の分だけ多く入ります。',
        'セーブがある状態でゲーム開始を押すと確認し、つづきから・新しく始める・キャンセルから選べます。',
        'クレジットを設定の下に移しました。',
        'ブラウザのタブアイコンにロゴを使います。',
      ],
      zh: [
        '经验值改为与敌人强度成正比 — 由生命与伤害推算，稀有敌人按强化效果额外给予。',
        '已有存档时点击开始游戏会先确认：继续那一局、开始新游戏或取消。',
        '制作人员移到设置之下。',
        '浏览器标签图标改用游戏徽标。',
      ],
    },
  },
  {
    version: '0.12',
    date: '2026-10-12',
    changes: {
      ko: [
        '우두머리 추가 — 1분마다 한 마리씩 등장하며, 처치하면 스킬을 반드시 떨어뜨립니다.',
        '우두머리는 체력 900에 금색 테두리를 두르고, 등장할 때 알려줍니다.',
        '언어는 타이틀 화면에서만 바꿀 수 있습니다. 게임 도중 바꾸면 문제가 생길 수 있어 막았습니다.',
        '메인화면 · 일시정지 · 설정 화면의 선택지에서 테두리를 없애고 가운데 정렬했습니다.',
        '메인화면의 설정 항목은 어느 언어에서나 Settings로 표기됩니다.',
      ],
      en: [
        'Bosses — one arrives every minute, and killing it always leaves a skill.',
        'A boss has 900 health, wears a gold ring, and announces itself.',
        'The language can only be changed from the title screen; changing it mid-run could break things.',
        'The title, pause and settings rows lost their borders and found their centre.',
        'The title’s settings entry reads "Settings" in every language.',
      ],
      ja: [
        'ボスを追加 — 1 分ごとに 1 体現れ、倒すと必ずスキルを落とします。',
        'ボスは体力 900、金色の縁取りを帯び、出現時に知らせます。',
        '言語はタイトル画面でのみ変更できます。ゲーム中の変更は不具合の恐れがあるため塞ぎました。',
        'タイトル・一時停止・設定の項目から枠線を外し、中央揃えにしました。',
        'タイトルの設定項目はどの言語でも Settings と表示されます。',
      ],
      zh: [
        '新增首领 — 每分钟出现一只，击杀后必定掉落技能。',
        '首领拥有 900 生命、金色描边，出现时会有提示。',
        '语言只能在标题画面中更改，游戏途中更改可能导致问题，因此已禁用。',
        '标题、暂停与设置画面的选项去掉了边框并居中显示。',
        '标题画面的设置项在任何语言下都显示为 Settings。',
      ],
    },
  },
  {
    version: '0.11',
    date: '2026-10-12',
    changes: {
      ko: [
        '한국어 · English · 日本語 · 中文 지원을 추가했습니다. 설정의 Language에서 바꿀 수 있습니다.',
        '언어는 처음 실행할 때 브라우저 설정을 따라갑니다.',
      ],
      en: [
        'Added Korean, English, Japanese and Chinese. Change it under Language in Settings.',
        'The first run picks a language from your browser.',
      ],
      ja: [
        '韓国語・英語・日本語・中国語に対応しました。設定の Language から変更できます。',
        '初回起動時はブラウザの設定に従います。',
      ],
      zh: [
        '新增韩语、英语、日语和中文。可在设置的 Language 中切换。',
        '首次运行会跟随浏览器的语言设置。',
      ],
    },
  },
  {
    version: '0.10',
    date: '2026-10-12',
    changes: {
      ko: [
        '희귀 적의 강화효과 최대치를 6개로 늘렸습니다. 같은 효과가 중복될 수 있으며 효과는 누적됩니다.',
        '강화효과가 많을수록 테두리 색이 진해집니다 — 금색에서 시작해 6개에서 가장 진한 붉은색이 됩니다.',
        '강화효과 하나를 더 가질 확률은 45%입니다. 6개를 모두 가진 적은 희귀 적 중에서도 드뭅니다.',
        '시작 화면과 일시정지 화면에 패치노트와 게임 가이드를 추가했습니다.',
        '설정에서 마우스·터치로도 값을 내릴 수 있도록 ◀ ▶ 버튼을 실제 버튼으로 바꿨습니다.',
        '게임 오버 화면에서 다시하기 · 메인화면 · 옵션 중에 고를 수 있습니다.',
      ],
      en: [
        'A rare can now carry up to six affixes. Repeats are allowed and their effects stack.',
        'The ring deepens with every affix — gold at one, deep red at six.',
        'Each affix beyond the first has a 45% chance to appear, so a full stack is rare even among rares.',
        'Patch notes and a how-to-play guide, from both the title and the pause screen.',
        'The ◀ ▶ in Settings are real buttons now, so a mouse or finger can turn a value down.',
        'The end screen offers another run, the title, or the settings.',
      ],
      ja: [
        'レア敵の強化効果が最大 6 個になりました。同じ効果が重複し、効果は累積します。',
        '強化効果が多いほど縁の色が濃くなります — 1 個の金色から 6 個の濃い赤まで。',
        '2 個目以降が付く確率は 45% です。6 個そろった敵はレアの中でも稀です。',
        'タイトルと一時停止画面にパッチノートと遊び方を追加しました。',
        '設定の ◀ ▶ を実際のボタンにし、マウスやタッチでも値を下げられるようにしました。',
        'ゲームオーバー画面で「もう一度・タイトルへ・設定」から選べます。',
      ],
      zh: [
        '稀有敌人的强化效果上限提升到 6 个，可以重复且效果叠加。',
        '强化效果越多描边颜色越深 — 1 个为金色，6 个为最深的红色。',
        '第二个之后每个强化效果的出现概率为 45%，集满 6 个的敌人即便在稀有敌人中也很少见。',
        '标题画面与暂停画面新增更新日志和游戏指南。',
        '设置中的 ◀ ▶ 改为真正的按钮，鼠标和触摸也能调低数值。',
        '结算画面可以选择再来一局、返回标题或设置。',
      ],
    },
  },
  {
    version: '0.9',
    date: '2026-10-12',
    changes: {
      ko: [
        '희귀 적 추가 — 10% 확률로 등장하며 테두리를 두릅니다.',
        '희귀 적은 거대 · 신속 · 치명 · 강력 중에서 강화효과를 가집니다.',
        '희귀 적을 가리키면 강화효과 목록이 표시됩니다. 일시정지 중에도 확인할 수 있습니다.',
        '희귀 적은 강화효과 1개당 스킬 드랍률이 50% 올라갑니다.',
        '체력 포션 드랍률을 5% → 1%로 조정했습니다.',
      ],
      en: [
        'Rare enemies — one spawn in ten, wearing a ring.',
        'They carry affixes drawn from Giant, Swift, Deadly and Mighty.',
        'Point at one to list what it is carrying; this works while paused too.',
        'Each affix raises that enemy’s skill drop chance by 50%.',
        'Health potions now drop at 1% rather than 5%.',
      ],
      ja: [
        'レア敵を追加 — 10% の確率で現れ、縁取りを帯びます。',
        '巨大・俊敏・致命・剛力から強化効果を持ちます。',
        'レア敵を指すと強化効果の一覧が出ます。一時停止中でも確認できます。',
        '強化効果 1 個につきスキルのドロップ率が 50% 上がります。',
        '回復ポーションのドロップ率を 5% → 1% に調整しました。',
      ],
      zh: [
        '新增稀有敌人 — 10% 概率出现，带有描边。',
        '它们会从巨大、迅捷、致命、强力中获得强化效果。',
        '指向稀有敌人即可查看强化效果列表，暂停时同样可用。',
        '每个强化效果使其技能掉落率提高 50%。',
        '生命药水掉落率由 5% 调整为 1%。',
      ],
    },
  },
  {
    version: '0.8',
    date: '2026-10-12',
    changes: {
      ko: [
        '스킬 공허구체 추가 — 플레이어 주위를 시계방향으로 공전하며 스치는 적을 공격합니다.',
        '체력 포션 추가 — 최대 체력의 10%를 회복합니다.',
        '타격과 연쇄번개에 효과음을 넣었습니다. 변형이 여러 개면 무작위로 재생됩니다.',
        '모바일 이동 방식을 고정 패드 · 터치 위치에 생성 · 기울이기 세 가지에서 고를 수 있습니다.',
        '강화 선택 화면에서 방향키로 커서를 옮길 수 있습니다. 확정은 Space · 클릭 · 터치 · 숫자키입니다.',
      ],
      en: [
        'New skill, Void Orb — orbs ride around you clockwise and hurt what they sweep through.',
        'Health potions — worth a tenth of your maximum.',
        'Strike and Chain Lightning have sounds, picked at random when there are several.',
        'Mobile movement: fixed pad, a pad under your finger, or tilt.',
        'The upgrade screen takes the arrow keys for the caret again; Space, a click, a tap or a number takes the card.',
      ],
      ja: [
        '新スキル「虚無球」— 球が時計回りに周回し、触れた敵を攻撃します。',
        '回復ポーションを追加 — 最大体力の 10% を回復します。',
        '打撃と連鎖雷に効果音を追加。複数あるものはランダムで鳴ります。',
        'モバイル操作を固定パッド・触れた位置に出す・傾け操作の三つから選べます。',
        '強化選択画面で方向キーのカーソル移動が戻りました。決定は Space・クリック・タッチ・数字キーです。',
      ],
      zh: [
        '新技能「虚空球」— 球体顺时针环绕角色，扫到的敌人都会受伤。',
        '新增生命药水 — 回复最大生命的 10%。',
        '为打击与连锁闪电加入音效，多个版本时随机播放。',
        '移动端操作可在固定摇杆、触点生成摇杆、重力感应之间选择。',
        '强化选择界面恢复方向键移动光标，确认改为 Space、点击、触摸或数字键。',
      ],
    },
  },
  {
    version: '0.7',
    date: '2026-10-12',
    changes: {
      ko: [
        '시작 화면을 추가했습니다 — 게임 시작 · 불러오기 · 설정 · 제작자 정보.',
        '일시정지를 추가했습니다 — Esc · 모바일 뒤로가기 · 좌측 상단 버튼.',
        '자동 저장과 불러오기를 추가했습니다. 사망 시 저장은 삭제됩니다.',
        '설정 추가 — 터치패드 크기와 위치, 기울이기, 배경음 음량.',
        '배경음 Constance를 추가했습니다.',
      ],
      en: [
        'A title screen — new run, continue, settings, credits.',
        'Pausing, with Esc, the Android back gesture, or the corner button.',
        'Autosave and Continue. Dying clears the save.',
        'Settings — pad size and position, tilt, music volume.',
        'Constance plays as the background music.',
      ],
      ja: [
        'タイトル画面を追加 — ゲーム開始・つづきから・設定・クレジット。',
        '一時停止を追加 — Esc・モバイルの戻る・左上のボタン。',
        'オートセーブと「つづきから」を追加。死亡するとセーブは消えます。',
        '設定を追加 — パッドの大きさと位置、傾け操作、BGM 音量。',
        'BGM「Constance」を追加しました。',
      ],
      zh: [
        '新增标题画面 — 开始游戏、继续游戏、设置、制作人员。',
        '新增暂停 — Esc、移动端返回键、左上角按钮。',
        '新增自动存档与继续游戏，死亡后存档会被清除。',
        '新增设置 — 摇杆大小与位置、重力感应、背景音量。',
        '加入背景音乐 Constance。',
      ],
    },
  },
  {
    version: '0.6',
    date: '2026-10-11',
    changes: {
      ko: [
        '적 종류를 넷으로 늘렸습니다 — 일반 · 거구 · 질주 · 사수.',
        '사수는 거리를 두고 원거리 공격을 합니다.',
        '시간이 지나면 새로운 적 종류가 등장합니다.',
        '스킬 얼음창 추가 — 적을 관통하고 냉각(이동속도 -15%)을 겁니다.',
        '스킬 연쇄번개 추가 — 적 사이로 번개가 옮겨붙습니다.',
      ],
      en: [
        'Four kinds of enemy — Grunt, Brute, Runner and Shooter.',
        'Shooters keep their distance and fire.',
        'New kinds join the spawn as the run goes on.',
        'New skill, Ice Spear — pierces enemies and chills them (-15% move speed).',
        'New skill, Chain Lightning — jumps between enemies.',
      ],
      ja: [
        '敵の種類を 4 つに増やしました — 雑兵・巨漢・俊足・射手。',
        '射手は距離を取って撃ってきます。',
        '時間が経つと新しい種類が出現します。',
        '新スキル「氷槍」— 敵を貫通し、冷却（移動速度 -15%）を与えます。',
        '新スキル「連鎖雷」— 敵の間を雷が移ります。',
      ],
      zh: [
        '敌人种类增加到四种 — 杂兵、巨汉、疾走者、射手。',
        '射手会保持距离进行远程攻击。',
        '随着时间推移会出现新的敌人种类。',
        '新技能「冰枪」— 穿透敌人并附加冰冷（移动速度 -15%）。',
        '新技能「连锁闪电」— 在敌人之间跳跃。',
      ],
    },
  },
];
