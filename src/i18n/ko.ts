import type { Strings } from '@/i18n/types';

/**
 * 한국어. The default, and the language the game data itself is written in:
 * skill, enemy and affix names come from that data, so this file does not
 * repeat them.
 */
export const ko: Strings = {
  native: '한국어',

  common: { back: '돌아가기', close: '닫기', on: '켜짐', off: '꺼짐' },

  passives: {
    title: '패시브',
    points: '포인트 {points}',
    shards: '신성한 조각 {held}/{need}',
    rank: '{rank} / {max}',
    maxed: '최대',
    spend: '투자',
    noPoints: '포인트가 없습니다 — 우두머리를 처치해 신성한 조각을 모으세요.',
    hintKeyboard: '↑ ↓ 이동   Space 투자   Esc 돌아가기',
    hintTouch: '항목을 탭해서 투자',
    shardName: '신성한 조각',
    buyShard: '신성한 조각 구매  {price}골드',
    goldHeld: '골드 {gold}',
    temporary: '임시 구성입니다 — 지금은 줄마다 따로 올리고, 갈래가 나뉘는 트리는 다음 작업입니다.',
  },

  filter: {
    title: '아이템 필터',
    icon: '필터',
    lead: '눌러서 끈 아이템은 게임에서 떨어지지 않습니다 · 장비는 등급과 종류가 모두 켜져 있어야 보입니다',
    sections: { supplies: '소모품', orbs: '구슬', bones: '뼈다귀', rarity: '장비 등급', bases: '장비 종류' },
    items: { potion: '체력 포션', skill: '스킬', randomSkill: '무작위 스킬', mango: '하얀 망고', shard: '신성한 조각' },
    itemsShort: { potion: '포션', skill: '스킬', randomSkill: '무작위', mango: '망고', shard: '조각' },
    rarity: { normal: '일반', magic: '마법', rare: '희귀' },
    shown: '보임',
    hidden: '숨김',
    showAll: '모두 보이기',
    hiddenCount: '{count}개 숨김',
    allShown: '모두 보이는 중',
    hintKeyboard: '방향키 이동   Space 켜기/끄기   Esc 돌아가기',
    hintTouch: '아이콘을 눌러 켜고 끕니다',
  },
  menu: {
    updating: '새 버전으로 업데이트합니다…',
    byline: 'created by whitemango',
    start: '게임 시작',
    load: '불러오기',
    noSave: '저장 없음',
    settings: '설정',
    gear: '인벤토리',
    guide: '게임 가이드',
    patch: '패치노트',
    credits: '제작자 정보',
    hintKeyboard: '↑ ↓ 이동   Space 선택   (마우스 클릭도 가능)',
    hintTouch: '항목을 탭해서 선택',
  },

  settings: {
    title: '설정',
    padSize: '터치패드 크기',
    movement: '모바일 이동 방식',
    modeFloating: '터치 위치에 생성',
    modeTilt: '기울이기',
    bgm: '배경음 음량',
    reset: '기본값으로',
    hint: '↑ ↓ 이동   ◀ ▶ 값 조절   Space 선택   Esc 돌아가기',
    hintFloating: '화면 아무 곳이나 누른 자리에 패드가 생깁니다   ·   Esc 돌아가기',
    hintTilt: '기기를 기울여 움직입니다. 패드는 표시되지 않습니다   ·   Esc 돌아가기',
    languageTitleOnly: '언어는 타이틀 화면에서만 바꿀 수 있습니다',
    tiltRefused: '이 기기에서는 기울이기를 쓸 수 없습니다',
    modeOther: '◀ ▶ 로 {mode}{으로} 바꿀 수 있습니다',
  },

  gear: {
    title: '장비',
    wearing: '착용 중',
    equipped: '착용 중',
    equip: '착용',
    discard: '버리기',
    discardConfirm: '정말 버릴까요?',
    orbCount: '{orb} x{count}',
    orbConfirm: '{orb} 사용?',
    orbNone: '{orb} 없음',
    orbRerolled: '{orb} — 속성을 {count}개로 다시 굴렸습니다',
    orbAdded: '{orb} — {affix} 추가',
    orbUpgraded: '{orb} — {from} → {to}',
    orbDestroyed: '{orb} — 장비가 파괴되었습니다',
    hintKeyboard: '↑ ↓ 이동   Space 착용   {keys} 구슬   Del 버리기   Esc 돌아가기',
    hintTouch: '탭해서 착용 — 버리기와 구슬은 아래 버튼',
    lockedHint: '저장된 판이 있어 교체할 수 없습니다 — 그 판을 끝내거나 새로 시작하세요',
    prefix: '접두어',
    suffix: '접미어',
    tier: '{tier}티어',
    prefixWord: '{affix}의',
    suffixWord: '· {affix}',
    attack: '공격력 +{attack}',
    implicit: '고정: {text}',
    combine: '합성',
    combinePick: '합성 {n}/{count}',
    combineGo: '합성하기',
    combineHint: '{gear} {count}자루를 고르세요 ({n}/{count}) — 합성 · Space로 넣고 빼기, Esc 취소',
    combineReady: '{chance} 확률로 속성 없는 {target} — 실패해도 고른 {count}자루는 사라집니다. 합성하기를 누르세요',
    combineEquipped: '착용 중인 검은 합성에 쓸 수 없습니다',
    combineTop: '가장 높은 티어의 검이라 합성할 수 없습니다',
    combineShort: '착용하지 않은 같은 검이 {count}자루 있어야 합성할 수 있습니다',
    combineSuccess: '합성 성공 — {gear} 획득!',
    combineFail: '합성 실패 — {gear} {count}자루가 사라졌습니다',
    plain: '속성 없음',
  },

  inventory: {
    title: '인벤토리',
    tabGear: '장비',
    tabConsumables: '소모품',
    empty: '비어 있음',
    held: '보유 {count}',
    orbUse: '장비 탭에서 무기를 골라 사용합니다.',
    boneUse: '게임 시작 때 적용합니다. 그 판에만 효과가 있습니다.',
    hintGear: '방향키 이동   Space 착용   {keys} 구슬   Del 버리기   C 합성   Tab 탭   Esc 돌아가기',
    hintConsumables: '방향키 이동   Tab 탭   Esc 돌아가기',
    hintTouch: '칸을 눌러 살펴보기 — 착용·버리기·구슬은 오른쪽 버튼',
  },

  bones: {
    title: '뼈다귀',
    lead: '이번 판에만 · 최대 {max}개 · 시작하면 사라집니다',
    clear: '모두 빼기',
    start: '이대로 시작',
    none: '아무것도 적용하지 않았습니다',
    sumHp: '적 체력 +{percent}%',
    sumDrop: '드랍률 +{percent}%',
    sumBosses: '희귀 적 대신 우두머리',
    hintKeyboard: '← → 고르기   Space 넣기   Backspace 빼기   Esc 돌아가기',
    hintTouch: '뼈다귀를 눌러 넣고, 칸을 눌러 뺍니다',
  },

  pause: {
    title: '일시정지',
    survived: '생존 {time}    Lv {level}',
    resume: '계속하기',
    quit: '저장하고 타이틀로',
    hint: 'Esc 또는 뒤로가기로 이어서 진행   ·   희귀 적을 가리키면 속성이 보입니다',
  },

  gameOver: {
    title: 'GAME OVER',
    damageDealt: '가한 피해',
    killsDealt: '처치',
    goldEarned: '획득 골드',
    skillLine: '{skill} Lv {level} · DPS {dps}',
    survived: '생존 {time}    Lv {level}',
    retry: '다시하기',
    toTitle: '메인화면',
    hintKeyboard: '↑ ↓ 이동   Space 선택',
    hintTouch: '항목을 탭해서 선택',
  },

  ranking: {
    title: '랭킹',
    icon: '랭킹',
    empty: '아직 기록이 없습니다 — 한 판 끝내면 이름을 올릴 수 있습니다.',
    place: '순위',
    name: '이름',
    damage: '가한 피해',
    champion: '1위  {name}  {damage}',
    podium: '{place}위  {name}  {damage}',
    entryTitle: '랭킹 {place}위!',
    entryLead: '가한 피해 {damage} — 이름을 남기세요 (알파벳 3자 + 이모지 1개 + 국기)',
    confirm: '등록',
    skip: '건너뛰기',
    entryHintKeyboard: '← → 칸 이동   ↑ ↓ 또는 알파벳 입력   Enter 등록   Esc 건너뛰기',
    entryHintTouch: '▲ ▼로 글자와 이모지를 고르고 등록을 누르세요',
    register: '랭킹 등록',
    registered: '랭킹 {place}위로 등록했습니다',
    localNote: '이 기기의 기록입니다. 플레이어끼리 공유되는 랭킹은 준비 중입니다.',
    loadingNote: '공유 랭킹을 불러오는 중…',
    offlineNote: '공유 랭킹에 연결하지 못해 이 기기의 기록을 보여줍니다.',
    loginToEnter: '로그인하고 등록',
    tabShared: '전체 랭킹',
    tabPersonal: '내 기록',
    date: '날짜',
    level: '레벨',
    time: '시간',
    personalEmpty: '아직 끝낸 판이 없습니다. 한 판 하고 오세요!',
    personalNote: '이 기기에 남은 내 기록입니다 — 로그인하면 계정과 함께 저장됩니다.',
    personalSyncedNote: '계정과 함께 저장되는 내 기록입니다.',
    resetsIn: '매일 오전 {hour}시(한국 시간) 초기화 · {left} 남음',
    mine: '내 최고 기록: {place}위 · {damage}',
    mineNone: '아직 올린 기록이 없습니다',
    enteredAfterLogin: '로그인했습니다 — 기록을 랭킹에 올렸습니다',
  },

  account: {
    title: '계정',
    iconSignedOut: '로그인',
    iconSignedIn: '계정',
    leadSignedOut: '로그인하면 기록이 계정에 저장되어 다른 기기에서도 이어서 할 수 있고, 랭킹에 기록을 올릴 수 있습니다. 로그인하지 않아도 지금처럼 플레이할 수 있습니다.',
    leadRanking: '랭킹에 올리려면 로그인이 필요합니다. 로그인하고 돌아오면 이 기록이 바로 올라갑니다.',
    noProviders: '아직 사용할 수 있는 로그인이 없습니다.',
    offline: '서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
    retry: '다시 시도',
    signedIn: '{provider} 계정으로 로그인 중 — {name}',
    providers: { google: 'Google로 로그인', facebook: 'Facebook으로 로그인', twitter: 'X로 로그인', test: '시험 로그인' },
    providerNames: { google: 'Google', facebook: 'Facebook', twitter: 'X', test: '시험' },
    logout: '로그아웃',
    remove: '계정 삭제',
    removeConfirm: '정말 삭제할까요? 한 번 더 누르면 삭제됩니다',
    privacy: '개인정보처리방침',
    resolve: '기록 고르기',
    syncOff: '기록 동기화 꺼짐',
    syncing: '기록 저장 중…',
    synced: '기록 동기화됨 · {time}',
    syncError: '동기화하지 못했습니다 — 연결되면 다시 시도합니다',
    syncConflict: '이 기기와 계정의 기록이 다릅니다 — 어느 쪽을 쓸지 골라 주세요',
    loginOk: '로그인했습니다',
    loginError: '로그인하지 못했습니다. 다시 시도해 주세요',
    loginCancelled: '로그인을 취소했습니다',
    loggedOut: '로그아웃했습니다',
    removed: '계정을 삭제했습니다',
    hintKeyboard: '↑ ↓ 이동   Space 선택   Esc 돌아가기',
    hintTouch: '항목을 눌러 선택',
  },

  conflict: {
    title: '어느 기록을 쓸까요?',
    lead: '이 기기와 계정에 서로 다른 기록이 있습니다. 고르지 않은 쪽의 기록은 사라집니다.',
    device: '이 기기',
    cloud: '계정',
    swords: '검 {n}자루',
    passives: '패시브 {n}단계 · 남은 포인트 {points}',
    orbs: '구슬 {n}개',
    bones: '뼈다귀 {n}개',
    savedRun: '저장된 판 있음',
    noSavedRun: '저장된 판 없음',
    useDevice: '이 기기의 기록 쓰기',
    useCloud: '계정의 기록 쓰기',
    later: '나중에 고르기',
  },

  skillPick: {
    startTitle: '시작 스킬',
    startSubtitle: '이번 판에 가지고 들어갈 스킬 하나를 고르세요',
    dropTitle: '무작위 스킬',
    dropSubtitle: '셋 중 하나를 고르세요 — 가진 스킬이면 강화합니다',
    drop: '무작위 스킬',
    new: '새 스킬',
    upgrade: '강화 · Lv {level}',
    hintKeyboard: '← → 이동   Space 선택   (1-3 로 바로 선택)',
    hintTouch: '원하는 카드를 누르세요',
  },

  slot: {
    startTitle: '시작 스킬',
    startSubtitle: '이번 판에 가지고 들어갈 스킬 하나',
    confirm: '확정',
    hintKeyboard: 'Space 또는 Enter로 확정',
    hintTouch: '확정을 눌러 멈추기',
    won: '{skill} 획득',
  },

  upgrade: {
    levelUp: 'LEVEL UP',
    level: 'Lv {level}',
    acquired: '획득',
    enhanced: '강화',
    hintKeyboard: '← → 이동   Space 선택   (1-4 로 바로 선택)',
    hintTouch: '원하는 쪽을 터치하세요',
  },

  hud: {
    level: 'Lv {level}',
    enemies: '적 {count}',
    dps: 'DPS {dps}',
    formulaDamage: '피해 {damage} = (기본 {base} × 패시브 {passive} + 장비 {gear}) × 강화 {run}',
    formulaRate: '초당 {rate}회 = 기본 {base} × 패시브 {passive} × 장비 {gear} × 강화 {run}',
    formulaMango: ' × 망고 {mango}',
    formulaScale: ' × 보정 {scale}',
    formulaGearScale: ' × 장비 피해 {scale}',
    formulaCap: '초당 최대 {rate}회 (재사용 대기 하한)',
    formulaTargets: '대상 {targets} = {parts}',
    targetChain: '연쇄 {n}',
    targetPierce: '관통 {n}',
    targetOrbs: '추가 구체 {n}',
    targetShots: ' × 투사체 {n}',
    formulaDps: 'DPS {dps} = {damage} × {rate} × {targets}',
    formulaNote: '치명타는 들어가지 않은 값입니다',
  },

  game: {
    blocked: '막음',
    intro: 'Exile, do something!',
    introHintKeyboard: 'WASD · 방향키로 이동 — 공격은 자동',
    introHintTouch: '스틱을 끌어 이동 — 공격은 자동',
    gearFound: '{gear} 획득 — 메인화면에서 착용',
    orbFound: '{orb} 획득 — 인벤토리에서 사용',
    mango: '하얀 망고',
    mangoEaten: '하얀 망고! {seconds}초간 무적 · 공격속도와 이동속도 +100%',
    boneFound: '{bone} 획득 — 다음 판 시작 전에 적용',
    shardFound: '신성한 조각 {held}/{need}',
    orbMade: '신성한 구슬 완성 — 패시브 포인트 +1',
    pickedUp: '{skill} 획득',
    enhancedPickup: '{skill} 강화',
    altarOffer: '제단 · {enemies}',
    altarCrowd: '{kind} {count}마리',
    altarCrowdRare: '희귀 {kind} {count}마리',
    altarWoke: '제단이 깨어났습니다 — {enemies}',
  },

  rare: { title: '희귀' },

  info: {
    patchTitle: '패치노트',
    guideTitle: '게임 가이드',
    hintKeyboard: '↑ ↓ 또는 휠로 스크롤   ·   Esc 로 돌아가기',
    hintTouch: '위아래로 쓸어 넘기기   ·   닫기를 눌러 돌아가기',
    guideHintKeyboard: '↑ ↓ 장   ← → 탭   휠 · PageUp/Down 스크롤   Esc 돌아가기',
    guideHintTouch: '장과 탭을 눌러 고르기   ·   위아래로 쓸어 넘기기',
  },

  credits: {
    title: '제작자 정보',
    roleAuthor: '제작',
    roleDev: '개발',
    roleEngine: '엔진',
  },

  confirm: {
    newRunTitle: '진행 중인 기록이 있습니다',
    newRunBody: '새로 시작하면 저장된 기록은 사라집니다.',
    startAnyway: '새로 시작',
    loadInstead: '이어서 하기',
    cancel: '취소',
  },

  upgrades: {
    damage: { label: '공격력 +{n}%', detail: '{skill}의 피해가 기본값의 {n}%만큼 늘어납니다' },
    attackSpeed: { label: '공격속도 +{n}%', detail: '{skill}의 초당 공격 횟수가 기본값의 {n}%만큼 늘어납니다' },
    range: { label: '사정거리 +{n}%', detail: '{skill}의 사정거리가 기본값의 {n}%만큼 늘어납니다' },
    projectileSpeed: { label: '투사체 속도 +{n}%', detail: '{skill}{이가} 기본값의 {n}%만큼 더 빠르게, 그만큼 더 멀리 날아갑니다' },
    orbitSpeed: { label: '회전 속도 +{n}%', detail: '{skill}{이가} 기본값의 {n}%만큼 더 빠르게 공전합니다' },
    chainCount: { label: '연쇄 횟수 +{n}', detail: '{skill}{이가} {n}명에게 더 옮겨붙습니다' },
    pierceCount: { label: '관통 횟수 +{n}', detail: '{skill}{이가} {n}명을 더 꿰뚫고 지나갑니다' },
    orbCount: { label: '구체 수 +{n}', detail: '{skill}{이가} {n}개 더 공전합니다' },
  },

  guideChapters: {
    basics: '기본',
    combat: '전투',
    skills: '스킬',
    enemies: '적',
    items: '아이템',
    progress: '영구 성장',
  },

  guideTabs: {
    goal: '목표',
    controls: '조작',
    mobile: '모바일',
    saving: '저장',
    levels: '레벨업',
    getSkills: '스킬 얻기',
    damage: '피해 계산',
    common: '일반 적',
    boss: '우두머리',
    fugitive: '도망자',
    rares: '희귀 적',
    difficulty: '난이도',
    dropRules: '드랍 규칙',
    field: '필드 아이템',
    gear: '장비',
    affixes: '속성',
    orbs: '구슬',
    bones: '뼈다귀',
    passives: '패시브',
    inventory: '인벤토리',
    ranking: '랭킹',
  },

  guide: {
    cards: {
      goal: [
        {
          title: '목표',
          lines: [
            '끝없이 몰려드는 적 사이에서 최대한 오래 살아남습니다.',
            '체력은 {hp}입니다. 적의 몸에 닿거나 적의 탄에 맞으면 줄고, 0이 되면 끝납니다.',
            '공격은 전부 자동입니다. 할 일은 위치를 잡는 것과, 무엇을 강화할지 고르는 것입니다.',
          ],
        },
        {
          title: '한 판의 흐름',
          lines: [
            '게임 시작 → 뼈다귀 고르기(가진 것이 있을 때) → 스킬 {choices}장 중 하나 고르기 → 전투.',
            '우두머리는 {bossFirst}초에 처음 오고, 그 뒤로 {bossEvery}초마다 옵니다.',
            '시간이 갈수록 새로 나오는 적이 단단해지고 희귀 적이 늘어납니다.',
            '죽으면 결과 화면에서 그 판을 돌아보고, 다시하기 · 타이틀 · 설정 중 하나로 나갑니다.',
          ],
        },
      ],
      controls: [
        {
          title: '키보드 · 마우스',
          lines: [
            'WASD 또는 방향키로 이동합니다.',
            'Esc 또는 왼쪽 위 버튼으로 일시정지합니다.',
            '왼쪽 위 스킬 아이콘에 마우스를 올리면 그 스킬의 DPS 계산식이, 희귀 적에 올리면 속성이 나옵니다. 읽는 동안 전투가 멈춥니다.',
          ],
        },
        {
          title: '선택 화면',
          lines: [
            '방향키로 커서를 옮기고, Space · 클릭 · 터치 · 숫자키로 고릅니다.',
            '이동키로는 선택이 확정되지 않습니다. 이동하느라 누르고 있던 키가 대신 고르는 일을 막기 위해서입니다.',
            '선택 화면이 열린 직후 잠깐은 입력을 받지 않습니다.',
          ],
        },
        {
          title: '메뉴',
          lines: [
            '모든 화면은 왼쪽 위 뒤로 버튼이나 Esc로 나갑니다.',
            '이 가이드는 ↑↓로 장, ←→로 탭을 넘기고, 휠 · 끌기 · PageUp/PageDown으로 스크롤합니다.',
          ],
        },
      ],
      mobile: [
        {
          title: '이동',
          lines: [
            '설정에서 두 가지 중 고릅니다.',
            '터치 위치에 생성 — 평소에는 보이지 않다가, 손가락이 닿은 자리에 패드가 생깁니다. 패드 크기는 설정에서 바꿉니다.',
            '기울이기 — 기기를 기울여 움직입니다. 처음 읽힌 각도가 중립이 되므로 편한 자세로 들면 됩니다.',
          ],
        },
        {
          title: '터치',
          lines: [
            '스킬 아이콘이나 희귀 적을 터치하면 같은 정보가 나옵니다. 그 손가락이 이동에도 쓰이므로 전투는 멈추지 않습니다.',
            '기기의 뒤로가기는 일시정지입니다.',
          ],
        },
      ],
      saving: [
        {
          title: '자동 저장',
          lines: [
            '{autosave}초마다, 그리고 일시정지할 때마다 저장됩니다.',
            '일시정지 메뉴의 "저장하고 타이틀로"로 나간 뒤, 시작 화면의 불러오기로 이어서 합니다.',
            '죽으면 저장은 지워집니다. 저장은 잠시 멈추기 위한 것이지 죽음을 무르기 위한 것이 아닙니다.',
          ],
        },
        {
          title: '저장된 판이 있는 동안',
          lines: [
            '장착한 무기를 바꿀 수 없습니다. 불러온 판이 들고 나간 무기와 달라지지 않게 하기 위해서입니다.',
            '판 도중에는 언어를 바꿀 수 없습니다.',
          ],
        },
        {
          title: '계정',
          lines: [
            '로그인은 선택입니다. 시작 화면의 계정에서 Google 같은 소셜 계정으로 로그인하면 기록(장비·패시브·구슬·뼈다귀·저장된 판·설정)이 계정에 저장되어 다른 기기에서도 이어서 할 수 있습니다.',
            '이 기기와 계정의 기록이 서로 다르면 어느 쪽을 쓸지 묻습니다. 고르지 않은 쪽은 사라집니다.',
            '로그인에는 계정 고유번호와 표시 이름만 쓰며 이메일은 받지 않습니다. 계정 화면에서 로그아웃하거나 계정을 삭제할 수 있습니다.',
          ],
        },
      ],
      levels: [
        {
          title: '경험치',
          lines: [
            '적을 처치하면 경험치 젬이 떨어집니다. {pickup}px 안에 들어오면 끌려오고, 사라지지 않습니다.',
            '단단한 적일수록 경험치를 더 줍니다. 희귀 적은 속성만큼 더 줍니다.',
          ],
        },
        {
          title: '레벨업',
          lines: [
            '레벨이 오르면 가진 스킬 중 하나가 무작위로 골라지고, 그 스킬의 강화 선택지가 나옵니다.',
            '강화는 스킬마다 따로 쌓입니다. 화염구를 올려도 타격은 그대로입니다.',
            '수치 강화는 기본값의 일정 비율씩 더해집니다. 세 번 고른 +20%는 기본값의 +60%입니다.',
            '피해와 공격속도 강화는 스킬당 {maxPicks}번까지, 연쇄 횟수는 {chainCap}까지입니다. 다 올린 강화는 선택지에 나오지 않습니다.',
          ],
        },
        {
          title: '스킬 레벨',
          lines: [
            '스킬 아이콘 귀퉁이의 숫자가 그 스킬의 레벨입니다. 얻은 순간 1이고, 강화 하나마다 1씩 오릅니다.',
          ],
        },
      ],
      getSkills: [
        {
          title: '첫 스킬',
          lines: [
            '판을 시작하면 스킬 {choices}장 중 하나를 고릅니다. 기본 공격은 따로 없습니다.',
          ],
        },
        {
          title: '스킬 드랍',
          lines: [
            '적은 {skillChance} 확률로 스킬을 떨어뜨립니다. 우두머리와 도망자는 반드시 떨어뜨립니다.',
            '처음 줍는 스킬은 기본 스펙으로 들어오고, 이미 가진 스킬이면 그 스킬의 강화 선택지가 열립니다.',
          ],
        },
        {
          title: '무작위 스킬',
          lines: [
            '적이 {randomSkillChance} 확률로 떨어뜨립니다. 주우면 스킬 {choices}장 중 하나를 고릅니다.',
            '이미 가진 스킬을 고르면 그 스킬의 강화가 곧바로 이어집니다.',
          ],
        },
      ],
      damage: [
        {
          title: '한 번의 피해',
          lines: [
            '(스킬 피해 × 패시브 + 장비 공격력) × 장비 고정 속성 × 전투 중 강화 × 스킬별 보정.',
            '효과는 패시브 → 장비 → 전투 중 강화 순서로 적용되고, 층끼리는 곱해집니다. 같은 층 안의 강화는 기본값에 더해집니다.',
          ],
        },
        {
          title: '치명타',
          lines: [
            '모든 공격은 {critChance} 확률로 치명타가 되어 {critMulti}배 피해를 줍니다.',
            '무기의 {critAffix} 속성이 확률을, {cruelAffix} 속성이 배율을 올립니다.',
          ],
        },
        {
          title: '공격속도',
          lines: [
            '초당 공격 횟수 = 스킬 기본값 × 패시브 × 장비 × 전투 중 강화. 하얀 망고를 먹은 동안은 ×{mangoRate}.',
            '공격 간격은 {minCooldown}ms 아래로 내려가지 않습니다.',
          ],
        },
        {
          title: 'DPS 카드',
          lines: [
            '전투 중 스킬 아이콘에 마우스를 올리면 위 계산이 그 스킬의 숫자로 펼쳐집니다. 치명타는 들어가지 않은 값입니다.',
          ],
        },
      ],
      common: [
        {
          title: '일반 적',
          lines: [
            '화면 바깥에서 나타나 다가옵니다. 시간이 지날수록 종류가 늘어납니다.',
            '몸에 닿으면 적마다 따로 피해를 줍니다. 여럿에게 둘러싸이면 한꺼번에 아픕니다.',
            '적이 나오는 간격은 {spawnStart}초에서 시작해 {spawnMin}초까지 줄어듭니다. 한 번에 최대 {maxAlive}마리까지 있습니다.',
          ],
        },
      ],
      boss: [
        {
          title: '우두머리가 남기는 것',
          lines: [
            '스킬 하나와 검 한 자루를 반드시 떨어뜨리고, 제단 하나를 반드시 남깁니다.',
            '신성한 조각을 {shardChance} 확률로 떨어뜨립니다. 신성한 조각은 우두머리만 떨어뜨립니다.',
            '그 밖의 모든 드랍은 확률이 {bossBonus} 올라갑니다.',
          ],
        },
      ],
      fugitive: [
        {
          title: '잡는 법',
          lines: [
            '화면 가장자리의 표시가 도망자가 있는 쪽을 가리킵니다.',
            '사거리가 긴 스킬이나 여러 번 맞히는 스킬이 유리합니다. 맞을 때마다 조금 떨어진 곳으로 달아납니다.',
          ],
        },
      ],
      rares: [
        {
          title: '희귀 적',
          lines: [
            '적의 {rareChance}가 희귀로 나오고, 시간이 갈수록 늘어납니다. 테두리를 둘러 알아볼 수 있습니다.',
            '속성을 {rareMin}~{rareMax}개 가지며, 많을수록 테두리 색이 진해집니다. 같은 속성이 겹치면 효과도 쌓입니다.',
            '마우스를 올리거나 터치하면 가진 속성이 나옵니다.',
            '속성 1개당 모든 드랍률이 {dropBonus} 올라갑니다. 위험한 만큼 값어치가 있습니다.',
          ],
        },
      ],
      difficulty: [
        {
          title: '시간이 갈수록',
          lines: [
            '1분이 지날 때마다 새로 나오는 적의 체력이 {hpStep} 늘어나고(곱연산), 희귀 적이 {rareStep} 늘어납니다.',
            '{lateFrom}분부터는 한 걸음이 {lateMult}배가 됩니다 — 체력 분당 {hpLate}, 희귀 적 분당 {rareLate}.',
            '이미 나와 있는 적은 그대로이고, 새로 나오는 적부터 바뀝니다.',
          ],
        },
        {
          title: '등장 시각',
          lines: [
            '질주는 {runnerAt}초, 사수는 {shooterAt}초, 거구는 {bruteAt}초부터 나옵니다.',
            '우두머리는 {bossFirst}초에 처음, 그 뒤로 {bossEvery}초마다 옵니다. 도망자는 {fugFirst}초에 처음, 그 뒤로 {fugEvery}초마다 나타납니다.',
          ],
        },
      ],
      dropRules: [
        {
          title: '드랍률 규칙',
          lines: [
            '희귀 적은 속성 1개당 모든 드랍률이 {dropBonus}, 우두머리는 {bossBonus} 올라갑니다.',
            '우두머리만 떨어뜨리는 것과 반드시 떨어지는 것은 이 보너스를 받지 않습니다.',
            '갈비뼈를 넣은 판은 모든 드랍률이 그만큼 더 오릅니다.',
          ],
        },
        {
          title: '바닥에 떨어진 것',
          lines: [
            '경험치를 제외한 드랍은 {life}초 뒤에 사라집니다. 마지막 {warning}초 동안 점점 빠르게 깜빡입니다.',
            '드랍은 등급에 따라 이름표 색과 떨어지는 소리가 다릅니다.',
            '희귀 등급의 드랍은 반투명한 흰 빛기둥 안에 놓여, 멀리서도 눈에 띕니다.',
          ],
        },
      ],
      field: [
        {
          title: '경험치 젬',
          lines: ['처치할 때마다 떨어지며 사라지지 않습니다. 가까이 가면 끌려옵니다.'],
        },
        {
          title: '스킬',
          lines: ['{skillChance} 확률. 처음 줍는 스킬은 그대로 들어오고, 가진 스킬이면 강화 선택지가 열립니다.'],
        },
        {
          title: '무작위 스킬',
          lines: ['{randomSkillChance} 확률. 주우면 스킬 {choices}장 중 하나를 고릅니다.'],
        },
        {
          title: '체력 포션',
          lines: [
            '{potionChance} 확률. 최대 체력의 {heal}를 회복합니다.',
            '체력이 가득 차 있으면 줍지 않고 남겨둡니다.',
          ],
        },
        {
          title: '하얀 망고',
          lines: [
            '어떤 적을 잡아도 {mangoChance} 확률이며, 희귀 적·우두머리·갈비뼈로 오르지 않습니다. 먹으면 {mangoSecs}초 동안 피해를 받지 않고, 모든 스킬의 공격속도와 이동속도가 {mangoBoost} 오릅니다.',
          ],
        },
        {
          title: '아이템 필터',
          lines: [
            '시작 화면의 필터에서 아이템마다 켜고 끌 수 있습니다. 끈 아이템은 게임에서 떨어지지 않습니다.',
            '장비는 등급(일반·마법·희귀)과 종류가 모두 켜져 있어야 떨어집니다. 설정은 계정과 함께 저장됩니다.',
          ],
        },
        {
          title: '제단',
          lines: [
            '우두머리는 반드시, 다른 적은 {altarChance} 확률로 남깁니다.',
            '위에 적힌 적들을 불러냅니다. 다가가야만 깨어나고, 지나쳐도 됩니다. 한 번 멀어졌다가 다가와야 깨어납니다.',
            '나올 수 있는 것: {altarOffers}.',
          ],
        },
        {
          title: '신성한 조각',
          lines: [
            '우두머리가 {shardChance} 확률로 떨어뜨립니다. {perOrb}개를 모으면 신성한 구슬이 되어 패시브 포인트 {points}점이 됩니다.',
          ],
        },
      ],
      gear: [
        {
          title: '장비',
          lines: [
            '우두머리는 처치할 때마다 검 한 자루를 반드시 떨어뜨립니다. {fromKillTiers}티어 검은 일반 적도 드물게 떨어뜨립니다.',
            '검의 티어는 숫자가 낮을수록 강합니다. 공격력은 모든 스킬의 한 번 피해에 더해집니다.',
            '주운 검은 보관함에 들어가고, 착용은 시작 화면의 인벤토리에서 합니다.',
            '검은 접두어(공격)와 접미어(방어 · 이동)를 각각 {maxPrefix}개까지 지닐 수 있습니다. 속성 한 줄이 붙을 확률은 {affixChance}이고, 붙을 때마다 다음 줄을 다시 굴립니다.',
            '고정 속성은 검 종류마다 정해져 있으며, 접두어 · 접미어 개수와 상관없이 늘 붙어 있습니다.',
            '합성 — 착용하지 않은 같은 검 {combineCount}자루를 인벤토리에서 합성하면 {combineChance} 확률로 한 티어 위의 검을 속성 없이 얻습니다. 실패해도 넣은 검은 사라집니다.',
          ],
        },
      ],
      affixes: [
        {
          title: '속성',
          lines: [
            '희귀 적과 무기가 같은 속성을 씁니다. 접두어는 공격, 접미어는 방어와 이동입니다.',
            '무기의 속성은 {tierCount}단계 티어가 있고, 1티어가 가장 강하며 가장 드뭅니다.',
          ],
        },
      ],
      orbs: [
        {
          title: '구슬',
          lines: [
            '무기의 속성을 다시 굴리거나 더하는 소모품입니다. 인벤토리의 장비 탭에서 무기를 골라 씁니다.',
          ],
        },
      ],
      bones: [
        {
          title: '뼈다귀',
          lines: [
            '판을 시작하기 전에 최대 {maxBones}개까지 넣어 그 판을 바꿉니다. 넣은 뼈다귀는 소모됩니다.',
            '뼈다귀 그림을 누르면 아래 칸에 들어가고, 칸을 누르면 다시 빠집니다. 고른 것의 효과와 합계가 바로 아래에 나옵니다.',
            '게임 시작과 다시하기 모두 뼈다귀 창을 거칩니다. 가진 것이 없으면 건너뜁니다.',
            '불러온 판은 처음 넣었던 뼈다귀를 그대로 씁니다.',
            '고대 두개골을 넣어도 우두머리는 한 번에 {maxBosses}마리까지만 있고, 그 뒤의 희귀 적 자리는 일반 적이 됩니다.',
          ],
        },
      ],
      passives: [
        {
          title: '패시브',
          lines: [
            '신성한 조각 {perOrb}개가 신성한 구슬 1개, 구슬 1개가 패시브 포인트 {points}점입니다.',
            '포인트는 시작 화면의 패시브에서 씁니다. 패시브는 모든 판에 늘 적용됩니다.',
          ],
        },
      ],
      inventory: [
        {
          title: '장비 탭',
          lines: [
            '가진 검이 {cols}×{rows} 칸에 놓입니다. 칸을 고르면 옆에 공격력 · 고정 속성 · 속성이 나옵니다.',
            '착용 · 버리기 · 구슬 사용은 옆의 버튼이나 Space로 합니다. 착용 중인 검은 버릴 수 없습니다.',
          ],
        },
        {
          title: '소모품 탭',
          lines: ['가진 구슬과 뼈다귀가 몇 개인지, 어디에 쓰는지 보여 줍니다.'],
        },
      ],
      ranking: [
        {
          title: '랭킹',
          lines: [
            '랭킹에는 로그인한 계정만 올릴 수 있고, 그 판에 준 총 피해로 순위를 매깁니다. 이름 {nameLength}글자와 아이콘 · 국기를 고르며, 계정마다 이름 하나와 최고 기록 하나만 올라갑니다.',
            '상위 {rankSize}명까지 보여 주며, 다른 플레이어와 함께 쓰는 순위표입니다. 매일 오전 {rankResetHour}시(한국 시간)에 새로 시작하고, 로그인하면 오늘의 내 최고 기록과 순위도 보입니다.',
            '내 기록 탭에는 로그인과 상관없이 내가 끝낸 판 중 상위 {rankSize}개가 날짜 · 레벨 · 버틴 시간과 함께 남습니다. ← → 로 탭을 바꿉니다.',
          ],
        },
      ],
    },
    labels: {
      skillStats: '피해 {damage} · 초당 {rate}회 · DPS {dps}',
      skillRange: '사거리 {range}px',
      skillProjectile: '투사체 속도 {speed} — 속도가 오르면 사거리도 같은 비율로 늘어납니다',
      skillUpgrades: '강화: {picks}',
      skillScale: '스킬별 피해 보정 ×{scale}',
      enemyStats: '체력 {hp} · 접촉 피해 {contact} · 경험치 {xp} · 이동속도 {speed}',
      fromStart: '처음부터 등장',
      unlocksAt: '{time}초부터 등장',
      shot: '탄 피해 {damage} · {every}초마다 · 사거리 {range}px',
      volley: '{every}초마다 탄 {count}발을 사방으로 · 한 발 피해 {damage}',
      enemyNotes: {
        grunt: '곧장 달려듭니다. 수가 많습니다.',
        brute: '느리지만 아주 단단하고, 스치기만 해도 크게 아픕니다.',
        runner: '약하지만 빠릅니다. 도망쳐도 따라붙습니다.',
        shooter: '거리를 두고 멈춰 서서 탄을 쏩니다. 가까이 가거나 사거리가 긴 스킬로 잡으세요.',
        boss: '처음엔 {first}초에, 그 뒤로 {every}초마다 한 마리씩 찾아옵니다. 아주 단단하고 아주 아픕니다.',
        fugitive: '공격하지 않습니다. 단단하고 아주 빠르며, 맞을 때마다 달아나 조금 떨어진 곳에서 멈춥니다. 처음엔 {first}초에, 그 뒤로 {every}초마다 나타나고, {life}초 뒤에 사라집니다. 잡으면 스킬을 반드시 떨어뜨립니다.',
      },
      affixEnemy: '희귀 적: {detail}',
      affixWeapon: '무기: {ladder}',
      affixRung: '{tier}티어 {value}',
      affixRangedOnly: '탄을 쏘는 적에게만 붙습니다',
      affixWeaponOnly: '무기에만 붙습니다',
      affixEnemyOnly: '희귀 적에게만 붙습니다',
      chanceKill: '적 처치 시 {chance}',
      chanceBoss: '우두머리 처치 시 {chance}',
      gearTier: '{tier}티어 · 공격력 +{attack}',
      gearImplicit: '고정: {text}',
      gearBossShare: '우두머리가 떨어뜨리는 검 중 {share}',
      gearFromKill: '일반 적 처치 시 {chance}',
      gearBossOnly: '우두머리만 떨어뜨립니다',
      boneStack: '한 판에 여러 개 넣을 수 있습니다',
      boneSingle: '한 판에 하나만 넣을 수 있습니다',
      passiveRank: '단계당 {detail} · 최대 {max}단계',
    },
  },
};
