import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 0.126: 오늘의 규칙 — every ranking day bans one skill, bans one 재능's
// 파편 and strengthens one enemy, the same draw for everyone that day.

const cdp = await connect(9333);
const SP = process.argv[2] ?? '.';
const results = [];
const check = (n, p, d = '') => {
  results.push({ n, p });
  console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
};
const shot = async (n) => {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SP}/${n}.png`, Buffer.from(r.result.data, 'base64'));
};
const ev = (expr) => cdp.evaluate(expr);
const run = (body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);

// --- 1. the draw: fixed by the day, never the same as the day before, from the tables ---
const draw = await ev(`(() => {
  const C = window.config, DAY = 86400000, first = C.rankingDayStart(C.DAILY_RULES.since);
  const days = Array.from({ length: 40 }, (_, i) => C.dailyRulesFor(first + i * DAY));
  const again = C.dailyRulesFor(first + 7 * DAY);
  const repeats = days.slice(1).filter((d, i) => d.bannedSkill === days[i].bannedSkill || d.bannedTalent === days[i].bannedTalent || d.enemyBuff.id === days[i].enemyBuff.id).length;
  const skills = window.game.scene.getScene('GameScene') ? null : null;
  return {
    before: C.dailyRulesFor(first - DAY), sameDay: JSON.stringify(again) === JSON.stringify(days[7]), repeats,
    skillsSeen: new Set(days.map((d) => d.bannedSkill)).size, talentsSeen: new Set(days.map((d) => d.bannedTalent)).size,
    buffsSeen: new Set(days.map((d) => d.enemyBuff.id)).size,
    poolSkills: [...C.DAILY_RULES.skills].sort().join(), tableSkills: Object.keys(C.SKILL_BASE).sort().join(),
    poolTalents: [...C.DAILY_RULES.talents].sort().join(), tableTalents: [...C.TALENT_SHARD.stats].sort().join(),
  };
})()`);
check('no rules before the first day; the same day always draws the same', draw.before === null && draw.sameDay, JSON.stringify(draw.before));
check('a day never repeats the day before’s pick, and over forty days every pool turns up',
  draw.repeats === 0 && draw.skillsSeen >= 6 && draw.talentsSeen >= 5 && draw.buffsSeen >= 6,
  `repeats ${draw.repeats}, skills ${draw.skillsSeen}, talents ${draw.talentsSeen}, buffs ${draw.buffsSeen}`);
check('the pools are the game’s own skills and 재능', draw.poolSkills === draw.tableSkills && draw.poolTalents === draw.tableTalents,
  `${draw.poolSkills} / ${draw.tableSkills}`);

// --- 2. a run under a day's rules ---
// A day whose strengthened enemy can be read straight off a spawn: its health.
const pick = await ev(`(() => {
  const C = window.config, DAY = 86400000, first = C.rankingDayStart(C.DAILY_RULES.since);
  for (let i = 0; i < 200; i++) { const r = C.dailyRulesFor(first + i * DAY); if (r.enemyBuff.stat === 'hp') return r; }
  return null;
})()`);
await ev(`(() => { window.__dailyOn = true; window.__dailyDay = ${pick.day}; return 1; })()`);
await run(`s.scene.restart({}); return 1;`);
await cdp.until(`window.game.scene.getScene('GameScene')?.player?.active && window.dailyRules.active`, 15000, 100);
await sleep(500);
const inRun = await run(`
  const R = window.dailyRules, rules = R.active, C = window.config;
  const offered = s.offeredSkills().map((k) => k.id);
  // Its 파편 never drop: a thousand rolls, none of it.
  let rolled = 0;
  for (let i = 0; i < 1000; i++) if (s.combat.rollShardStat() === rules.bannedTalent) rolled++;
  // The strengthened kind walks in with more health; another kind does not.
  const kind = rules.enemyBuff.kind, p = s.player;
  s.spawner.clear();
  const e = s.spawner.group.get(p.x + 300, p.y); e.spawn(p.x + 300, p.y, p, kind, s.spawner.hooks, false, 1);
  const strong = e.maxHp;
  R.begin(null);
  const f = s.spawner.group.get(p.x + 300, p.y); f.spawn(p.x + 300, p.y, p, kind, s.spawner.hooks, false, 1);
  const plain = f.maxHp;
  R.begin(rules.day);
  s.spawner.clear();
  const daily = s.effectsNow().find((x) => x.id === 'daily');
  s.writeSave();
  const saved = JSON.parse(localStorage.getItem('exiled-survivors:save:v1'));
  return { day: rules.day, banned: rules.bannedSkill, offered, rolled, talent: rules.bannedTalent, strong, plain, scale: rules.enemyBuff.scale,
           hud: daily ? [daily.title, ...daily.lines] : null, savedDay: saved.rulesDay };
`);
check('the day’s banned skill is never offered', !inRun.offered.includes(inRun.banned) && inRun.offered.length > 0,
  `${inRun.banned} / ${inRun.offered.join(',')}`);
check('the banned 재능’s 파편 never drop', inRun.rolled === 0, `${inRun.talent}: ${inRun.rolled} of 1000`);
check('the strengthened enemy walks in stronger by its scale',
  Math.abs(inRun.strong / inRun.plain - inRun.scale) < 0.02, `${inRun.plain} → ${inRun.strong} (×${inRun.scale})`);
check('the HUD carries the day’s three rules, dated', !!inRun.hud && inRun.hud.length === 4 && /\d+\/\d+/.test(inRun.hud[0]),
  JSON.stringify(inRun.hud));
check('the save keeps the day the run began on', inRun.savedDay === inRun.day, `${inRun.savedDay}`);
await shot('daily-01-run');

// A run resumed on another day keeps the rules it began with.
const resumed = await run(`
  const save = JSON.parse(localStorage.getItem('exiled-survivors:save:v1'));
  window.__dailyDay = ${pick.day} + 86400000;
  s.scene.restart({ save });
  return 1;
`);
void resumed;
await cdp.until(`window.game.scene.getScene('GameScene')?.player?.active && window.dailyRules.active`, 15000, 100);
const kept = await ev(`window.dailyRules.active.day`);
check('a run resumed the next day plays on under the rules it began with', kept === pick.day, `${kept} vs ${pick.day}`);

// --- 3. the title says what today's are ---
await ev(`(() => { localStorage.removeItem('exiled-survivors:save:v1'); window.__dailyDay = ${pick.day}; window.game.scene.getScene('GameScene').scene.start('MenuScene'); return 1; })()`);
await cdp.until(`window.game.scene.isActive('MenuScene')`, 10000, 100);
await sleep(600);
const title = await ev(`(() => { const m = window.game.scene.getScene('MenuScene'); const l = m.dailyLine;
  return l ? { text: l.text, inside: l.x - l.displayWidth / 2 >= 0 && l.x + l.displayWidth / 2 <= m.scale.width } : null; })()`);
check('the title shows today’s rules in one line, inside the screen', !!title && title.inside && title.text.length > 10,
  JSON.stringify(title));
await shot('daily-02-title');

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
