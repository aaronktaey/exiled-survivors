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

  menu: {
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
    attack2: '공격속도 +{percent}%',
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
    hintGear: '방향키 이동   Space 착용   {keys} 구슬   Del 버리기   Tab 탭   Esc 돌아가기',
    hintConsumables: '방향키 이동   Tab 탭   Esc 돌아가기',
    hintTouch: '칸을 눌러 살펴보기 — 착용·버리기·구슬은 오른쪽 버튼',
  },

  bones: {
    title: '뼈다귀',
    lead: '이번 판에만 적용됩니다. 최대 3개까지, 시작하면 사라집니다.',
    held: '{bone} x{count}',
    inUse: '적용 {count}',
    clear: '모두 빼기',
    start: '이대로 시작',
    slots: '적용한 뼈다귀',
    total: '합계',
    none: '아무것도 적용하지 않았습니다',
    sumHp: '적 체력 +{percent}%',
    sumDrop: '드랍률 +{percent}%',
    sumBosses: '희귀 적 대신 우두머리',
    hintKeyboard: '↑ ↓ 이동   Space 적용   Esc 돌아가기',
    hintTouch: '항목을 탭해서 적용',
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
    entryTitle: '랭킹 {place}위!',
    entryLead: '가한 피해 {damage} — 이름을 남기세요 (알파벳 3자 + 이모지 1개 + 국기)',
    confirm: '등록',
    skip: '건너뛰기',
    entryHintKeyboard: '← → 칸 이동   ↑ ↓ 또는 알파벳 입력   Enter 등록   Esc 건너뛰기',
    entryHintTouch: '▲ ▼로 글자와 이모지를 고르고 등록을 누르세요',
    register: '랭킹 등록',
    registered: '랭킹 {place}위로 등록했습니다',
    localNote: '이 기기의 기록입니다. 플레이어끼리 공유되는 랭킹은 준비 중입니다.',
    sharedNote: '모든 플레이어가 함께 보는 임시 랭킹입니다.',
    loadingNote: '공유 랭킹을 불러오는 중…',
    offlineNote: '공유 랭킹에 연결하지 못해 이 기기의 기록을 보여줍니다.',
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
  },

  game: {
    intro: 'Exile, do something!',
    introHintKeyboard: 'WASD · 방향키로 이동 — 공격은 자동',
    introHintTouch: '스틱을 끌어 이동 — 공격은 자동',
    gearFound: '{gear} 획득 — 메인화면에서 착용',
    orbFound: '{orb} 획득 — 인벤토리에서 사용',
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
    projectileSpeed: { label: '투사체 속도 +{n}%', detail: '{skill}{이가} 기본값의 {n}%만큼 더 빠르게 날아갑니다' },
    orbitSpeed: { label: '회전 속도 +{n}%', detail: '{skill}{이가} 기본값의 {n}%만큼 더 빠르게 공전합니다' },
    chainCount: { label: '연쇄 횟수 +{n}', detail: '{skill}{이가} {n}명에게 더 옮겨붙습니다' },
    pierceCount: { label: '관통 횟수 +{n}', detail: '{skill}{이가} {n}명을 더 꿰뚫고 지나갑니다' },
    orbCount: { label: '구체 수 +{n}', detail: '{skill}{이가} {n}개 더 공전합니다' },
  },

  guideChapters: {
    goal: '목표',
    controls: '조작',
    growth: '성장',
    skills: '스킬',
    enemies: '적',
  },

  guide: {
    goal: {
      heading: '목표',
      lines: [
        '끝없이 몰려드는 적 사이에서 최대한 오래 살아남습니다.',
        '체력은 {hp}이며, 적에게 닿거나 적의 탄에 맞으면 줄어듭니다. 0이 되면 끝납니다.',
        '공격은 전부 자동입니다. 플레이어가 하는 일은 위치를 잡는 것과, 무엇을 강화할지 고르는 것입니다.',
      ],
    },
    controls: {
      heading: '조작',
      lines: [
        'WASD 또는 방향키로 이동합니다.',
        'Esc · 좌측 상단 버튼 · (모바일) 뒤로가기로 일시정지합니다.',
        '강화 선택 화면: 방향키로 커서를 옮기고, Space · 클릭 · 터치 · 숫자키 1~4로 고릅니다.',
        '이동키로는 선택이 확정되지 않습니다. 이동하느라 누르고 있던 키가 대신 고르는 일을 막기 위해서입니다.',
        '희귀 적에 마우스를 올리거나 터치하면 속성을 볼 수 있습니다. 일시정지 중에도 됩니다.',
      ],
    },
    mobile: {
      heading: '모바일 조작',
      lines: [
        '설정에서 두 가지 중 고를 수 있습니다.',
        '터치 위치에 생성 — 평소에는 보이지 않다가, 손가락이 닿은 자리에 패드가 생깁니다. 패드 크기는 설정에서 바꿀 수 있습니다.',
        '기울이기 — 기기를 기울여 움직입니다. 처음 읽힌 각도가 중립이 되므로 편한 자세로 들면 됩니다.',
      ],
    },
    growth: {
      heading: '성장',
      lines: [
        '적을 처치하면 경험치 젬을 떨어뜨립니다. 가까이 가면 끌려옵니다.',
        '판을 시작하면 슬롯머신이 스킬 하나를 정해 줍니다. 기본 공격은 따로 없습니다.',
        '레벨이 오르면 가진 스킬 중 하나가 무작위로 골라지고, 그 스킬을 강화할 선택지가 나옵니다.',
        '스킬을 주웠을 때는 그 스킬을 강화할 선택지가 나옵니다. 처음 줍는 스킬은 강화 없이 기본 스펙으로 들어옵니다.',
        '강화는 스킬마다 따로 쌓입니다. 화염구를 올려도 타격은 그대로입니다.',
      ],
    },
    skills: {
      heading: '스킬',
      stats: '   단일피해 {damage} · 초당 {rate}회 · DPS {dps} · 사거리 {range}px',
      upgrades: '   강화: {picks}',
      starter: '시작 스킬',
    },
    enemies: {
      heading: '적',
      stats: '{name}  체력 {hp} · 접촉 피해 {contact} · 경험치 {xp}',
      fromStart: '처음부터 등장',
      unlocksAt: '{time}초부터 등장',
      notes: {
        grunt: '곧장 달려듭니다. 수가 많습니다.',
        brute: '느리지만 아주 단단하고, 스치기만 해도 크게 아픕니다.',
        runner: '약하지만 빠릅니다. 도망쳐도 따라붙습니다.',
        boss: '1분마다 한 마리씩 찾아옵니다. 아주 단단하고 아주 아프지만, 쓰러뜨리면 스킬을 반드시 떨어뜨립니다.',
        fugitive: '공격하지 않습니다. 단단하고 아주 빠르며, 맞을 때마다 달아나 조금 떨어진 곳에서 멈춥니다. 사라지기 전에 잡으면 스킬을 반드시 떨어뜨립니다 — 처음엔 {first}초에, 그 뒤로 {every}초마다 나타나고, 나타난 지 {life}초 뒤에 사라집니다.',
        shooter: '거리를 두고 멈춰 서서 탄을 쏩니다. 가까이 가거나 사거리가 긴 스킬로 잡으세요.',
      },
    },
    rares: {
      heading: '희귀 적',
      lines: [
        '적 {chance}는 희귀로 등장하며 테두리를 두릅니다.',
        '속성을 {min}~{max}개 가지며, 많을수록 테두리 색이 진해집니다. 같은 효과가 중복되면 효과는 누적됩니다.',
        '속성 1개당 스킬 드랍률이 {dropBonus} 올라갑니다. 위험한 만큼 값어치가 있습니다.',
      ],
    },
    drops: {
      heading: '드랍',
      lines: [
        '경험치 젬 — 처치할 때마다 떨어지며 사라지지 않습니다.',
        '스킬 — {skillChance} 확률. 이미 가진 스킬이면 강화 선택지가 열립니다.',
        '체력 포션 — {potionChance} 확률. 최대 체력의 {heal}를 회복합니다. 체력이 가득 차 있으면 줍지 않고 남겨둡니다.',
        '장비 — 우두머리를 처치할 때마다 검 한 자루가 떨어집니다. 주우면 보관함에 들어가고, 착용은 시작 화면의 장비에서 합니다.',
        '제단 — 우두머리를 처치하면 반드시 하나가 남습니다. 위에 적힌 적들을 불러내며, 다가가야만 깨어납니다. 지나쳐도 됩니다.',
        '떨어진 검은 확률에 따라 속성을 지닙니다 — 접두어는 공격, 접미어는 방어와 이동. 적의 속성과 같은 것들입니다.',
        '신성한 조각 — 우두머리가 절반의 확률로 떨어뜨립니다. 10개를 모으면 신성한 구슬이 되어 패시브 포인트 1점이 됩니다.',
        '플레이어에게 걸리는 효과는 패시브 → 장비 → 전투 중 강화 순서로 적용됩니다.',
        '경험치를 제외한 드랍은 {life}초 뒤에 사라집니다. 마지막 {warning}초 동안 점점 빠르게 깜빡입니다.',
      ],
    },
    saving: {
      heading: '저장',
      lines: [
        '{autosave}초마다, 그리고 일시정지할 때마다 자동 저장됩니다.',
        '일시정지 메뉴의 "저장하고 타이틀로"로 나간 뒤 시작 화면의 불러오기로 이어서 할 수 있습니다.',
        '사망하면 저장은 삭제됩니다. 저장은 잠시 멈추기 위한 것이지 죽음을 무르기 위한 것이 아닙니다.',
      ],
    },
  },
};
