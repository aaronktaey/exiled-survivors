import {
  AFFIXES,
  ENEMY_KINDS,
  GROUND_ITEM,
  POTION,
  PLAYER,
  RARE,
  SKILL_BASE,
  SKILL_DROP,
  SPAWN_TABLE,
  type EnemyKind,
} from '@/config';
import { objectParticle } from '@/systems/korean';
import { upgradeOptionsFor } from '@/systems/Progression';
import { ALL_SKILLS, DROPPABLE_SKILLS, STARTING_SKILLS } from '@/weapons/skills';

/** One block of the guide: a heading and the lines under it. */
export interface GuideSection {
  readonly heading: string;
  readonly lines: readonly string[];
}

/** What each enemy does, beyond the numbers the table already holds. */
const ENEMY_NOTES: Record<EnemyKind, string> = {
  grunt: '곧장 달려듭니다. 수가 많습니다.',
  brute: '느리지만 아주 단단하고, 스치기만 해도 크게 아픕니다.',
  runner: '약하지만 빠릅니다. 도망쳐도 따라붙습니다.',
  shooter: '거리를 두고 멈춰 서서 탄을 쏩니다. 가까이 가거나 사거리가 긴 스킬로 잡으세요.',
};

/** "레벨이 오르면 타격을 강화할…" — with the particle the name asks for. */
function levelUpLine(): string {
  const names = STARTING_SKILLS.map((id) => ALL_SKILLS.find((skill) => skill.id === id)?.name ?? '');
  const list = names.join(' · ');
  return `레벨이 오르면 ${list}${objectParticle(list)} 강화할 선택지가 나옵니다.`;
}

const seconds = (ms: number): string => `${Math.round(ms / 1000)}초`;
const percent = (fraction: number): string => `${Math.round(fraction * 100)}%`;

/** The whole guide, built from the live numbers so it cannot go stale. */
export function guideSections(): readonly GuideSection[] {
  return [
    {
      heading: '목표',
      lines: [
        '끝없이 몰려드는 적 사이에서 최대한 오래 살아남습니다.',
        `체력은 ${PLAYER.maxHp}이며, 적에게 닿거나 적의 탄에 맞으면 줄어듭니다. 0이 되면 끝납니다.`,
        '공격은 전부 자동입니다. 플레이어가 하는 일은 위치를 잡는 것과, 무엇을 강화할지 고르는 것입니다.',
      ],
    },
    {
      heading: '조작',
      lines: [
        'WASD 또는 방향키로 이동합니다.',
        'Esc · 좌측 상단 버튼 · (모바일) 뒤로가기로 일시정지합니다.',
        '강화 선택 화면: 방향키로 커서를 옮기고, Space · 클릭 · 터치 · 숫자키 1~4로 고릅니다.',
        '이동키로는 선택이 확정되지 않습니다. 이동하느라 누르고 있던 키가 대신 고르는 일을 막기 위해서입니다.',
        '희귀 적에 마우스를 올리거나 터치하면 강화효과를 볼 수 있습니다. 일시정지 중에도 됩니다.',
      ],
    },
    {
      heading: '모바일 조작',
      lines: [
        '설정에서 세 가지 중 고를 수 있습니다.',
        '고정 패드 — 설정에서 정한 자리에 패드가 고정됩니다. 크기와 위치를 바꿀 수 있습니다.',
        '터치 위치에 생성 — 평소에는 보이지 않다가, 손가락이 닿은 자리에 패드가 생깁니다.',
        '기울이기 — 기기를 기울여 움직입니다. 처음 읽힌 각도가 중립이 되므로 편한 자세로 들면 됩니다.',
      ],
    },
    {
      heading: '성장',
      lines: [
        '적을 처치하면 경험치 젬을 떨어뜨립니다. 가까이 가면 끌려옵니다.',
        levelUpLine(),
        '스킬을 주웠을 때는 그 스킬을 강화할 선택지가 나옵니다. 처음 줍는 스킬은 강화 없이 기본 스펙으로 들어옵니다.',
        '강화는 스킬마다 따로 쌓입니다. 화염구를 올려도 타격은 그대로입니다.',
      ],
    },
    {
      heading: '스킬',
      lines: ALL_SKILLS.flatMap((skill) => {
        const base = SKILL_BASE[skill.id];
        const picks = upgradeOptionsFor(skill).map((option) => option.label.replace(/ \+.*$/, ''));
        const dropped = DROPPABLE_SKILLS.some((candidate) => candidate.id === skill.id);
        return [
          `${skill.name}  [${skill.tags.join(' · ')}]${dropped ? '' : '  (시작 스킬)'}`,
          `   ${skill.summary}`,
          `   피해 ${base.damage} · 초당 ${base.attackSpeed}회 · 사거리 ${base.range}px`,
          `   강화: ${picks.join(' / ')}`,
        ];
      }),
    },
    {
      heading: '적',
      lines: ENEMY_KINDS_ORDER().flatMap((kind) => {
        const spec = ENEMY_KINDS[kind];
        const row = SPAWN_TABLE.find((entry) => entry.kind === kind);
        const unlock = row && row.unlockMs > 0 ? `${seconds(row.unlockMs)}부터 등장` : '처음부터 등장';
        return [
          `${spec.name}  체력 ${spec.maxHp} · 접촉 피해 ${spec.contactDamage} · 경험치 ${spec.xp}`,
          `   ${ENEMY_NOTES[kind]} (${unlock})`,
        ];
      }),
    },
    {
      heading: '희귀 적',
      lines: [
        `적 ${percent(RARE.chance)}는 희귀로 등장하며 노란 테두리를 두릅니다.`,
        `강화효과를 ${RARE.minAffixes}~${RARE.maxAffixes}개 가집니다.`,
        ...Object.values(AFFIXES).map((affix) => `   ${affix.name} — ${affix.detail}`),
        `강화효과 1개당 스킬 드랍률이 ${percent(RARE.dropBonusPerAffix)} 올라갑니다. 위험한 만큼 값어치가 있습니다.`,
      ],
    },
    {
      heading: '드랍',
      lines: [
        '경험치 젬 — 처치할 때마다 떨어지며 사라지지 않습니다.',
        `스킬 — ${percent(SKILL_DROP.chance)} 확률. 이미 가진 스킬이면 강화 선택지가 열립니다.`,
        `체력 포션 — ${percent(POTION.chance)} 확률. 최대 체력의 ${percent(POTION.healFraction)}를 회복합니다. 체력이 가득 차 있으면 줍지 않고 남겨둡니다.`,
        `경험치를 제외한 드랍은 ${seconds(GROUND_ITEM.lifespanMs)} 뒤에 사라집니다. 마지막 ${seconds(GROUND_ITEM.warningMs)} 동안 점점 빠르게 깜빡입니다.`,
      ],
    },
    {
      heading: '저장',
      lines: [
        `${seconds(10_000)}마다, 그리고 일시정지할 때마다 자동 저장됩니다.`,
        '일시정지 메뉴의 "저장하고 타이틀로"로 나간 뒤 시작 화면의 불러오기로 이어서 할 수 있습니다.',
        '사망하면 저장은 삭제됩니다. 저장은 잠시 멈추기 위한 것이지 죽음을 무르기 위한 것이 아닙니다.',
      ],
    },
  ];
}

/** The roster in the order the run meets it. */
function ENEMY_KINDS_ORDER(): readonly EnemyKind[] {
  return [...SPAWN_TABLE].sort((a, b) => a.unlockMs - b.unlockMs).map((entry) => entry.kind);
}
