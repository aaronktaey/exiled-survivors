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

// --- 1b. 적 강화 on the 밸런스 panel (0.127): the number shown follows the dial; a switched-off one is never drawn ---
const dials = await ev(`(() => {
  const C = window.config, T = window.tuning, DAY = 86400000, first = C.rankingDayStart(C.DAILY_RULES.since);
  const days = () => Array.from({ length: 60 }, (_, i) => C.dailyRulesFor(first + i * DAY));
  const i = C.DAILY_RULES.enemyBuffs.findIndex((b) => b.id === 'runnerContact');
  const buff = C.DAILY_RULES.enemyBuffs[i];
  T.set('DAILY_RULES.enemyBuffs.' + i + '.scale', 1.8);
  const day = days().find((r) => r.enemyBuff?.id === 'runnerContact');
  const turned = { scale: day?.enemyBuff.scale, said: day ? window.config && day.enemyBuff.scale : null };
  T.set('DAILY_RULES.enemyBuffs.' + i + '.on', 0);
  const offDrawn = days().filter((r) => r.enemyBuff?.id === 'runnerContact').length;
  const stillDrawn = days().filter((r) => r.enemyBuff).length;
  C.DAILY_RULES.enemyBuffs.forEach((_, k) => T.set('DAILY_RULES.enemyBuffs.' + k + '.on', 0));
  const none = C.dailyRulesFor(first);
  T.clearDraft();
  return { turned, offDrawn, stillDrawn, noneBuff: none ? none.enemyBuff : 'x', noneSkill: none?.bannedSkill, back: buff.scale, backOn: buff.on };
})()`);
check('a 적 강화 dial sets the multiplier a day lays on', dials.turned.scale === 1.8, JSON.stringify(dials.turned));
check('a switched-off one is never drawn, and the days it fell on draw another', dials.offDrawn === 0 && dials.stillDrawn === 60,
  `drawn ${dials.offDrawn}, days with one ${dials.stillDrawn}`);
check('with every one off a day has no strengthened enemy, and still bans a skill', dials.noneBuff === null && !!dials.noneSkill,
  JSON.stringify({ buff: dials.noneBuff, skill: dials.noneSkill }));
check('and clearing the draft puts them back', dials.back !== 1.8 && dials.backOn === 1, `${dials.back} ${dials.backOn}`);

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

// 0.127: the first skill's cards show the banned one, greyed, with the prophecy over it.
await run(`s.openStartPick(); return 1;`);
await cdp.until(`window.game.scene.isActive('SkillPickScene')`, 10000, 100);
await sleep(400);
const pickView = await ev(`(() => {
  const sp = window.game.scene.getScene('SkillPickScene'), rules = window.dailyRules.active;
  const b = sp.bannedCard;
  return { banned: rules.bannedSkill, card: b?.skill, words: b?.words.text ?? '', takeable: sp.cards.map((c) => c.skill),
           inside: b ? b.panel.y + b.panel.height / 2 <= sp.scale.height : false };
})()`);
check('the first skill’s screen shows the banned skill’s card with the prophecy over it, and it cannot be taken',
  pickView.card === pickView.banned && pickView.words.split('\n').length >= 2 && !pickView.takeable.includes(pickView.banned) && pickView.inside,
  JSON.stringify(pickView));
await shot('daily-01b-pick');
await ev(`(() => { const sp = window.game.scene.getScene('SkillPickScene'); sp.pick(0); return 1; })()`);
await cdp.until(`!window.game.scene.isActive('SkillPickScene')`, 5000, 100);

// 0.127 (도파민): a 재능의 덩어리 bursts wide; a single 파편 only a blink of sparkles. No coins since 0.128.
const fx = await run(`
  const count = (key) => s.children.list.filter((o) => o.texture && o.texture.key === key).length;
  const before = count('tex-sparkle');
  s.gainShard('damage', 3);
  const lump = count('tex-sparkle') - before;
  s.gainShard('damage', 1);
  const one = count('tex-sparkle') - before - lump;
  const C = window.config.CELEBRATE;
  return { lump, one, big: C.big.count, quick: C.quick.count, coins: s.textures.exists('tex-coin') };
`);
check('a 재능의 덩어리 bursts wide; a single 파편 only blinks; nothing throws coins',
  fx.lump === fx.big && fx.one === fx.quick && !fx.coins, JSON.stringify(fx));

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
  return l ? { text: l.text, heading: m.prophecyTitle?.text ?? '', inside: l.x - l.displayWidth / 2 >= 0 && l.x + l.displayWidth / 2 <= m.scale.width } : null; })()`);
check('the title shows today’s rules in one line, inside the screen', !!title && title.inside && title.text.length > 10,
  JSON.stringify(title));
// Turned on the panel, the number players read on the title follows (0.127).
const shown = await ev(`(() => {
  const C = window.config, T = window.tuning, rules = window.dailyRules.today(), m = window.game.scene.getScene('MenuScene');
  const i = C.DAILY_RULES.enemyBuffs.indexOf(rules.enemyBuff);
  const before = m.dailyLine.text;
  T.set('DAILY_RULES.enemyBuffs.' + i + '.scale', 2.2);
  const after = m.dailyLine.text;
  T.clearDraft();
  return { before, after, back: m.dailyLine.text };
})()`);
check('the title’s number follows the 적 강화 dial', /\+120%/.test(shown.after) && !/\+120%/.test(shown.before) && shown.back === shown.before,
  JSON.stringify(shown));
await shot('daily-02-title');

// On an upright phone the prophecy is a plate over the menu, clear of it (0.127).
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 420, height: 860, deviceScaleFactor: 2, mobile: false });
await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await cdp.until(`window.game?.scene.isActive('MenuScene') && window.dailyRules`, 30000, 200);
await ev(`(() => { window.__dailyOn = true; window.__dailyDay = ${pick.day}; window.game.scene.getScene('MenuScene').scene.restart(); return 1; })()`);
await sleep(900);
const upright = await ev(`(() => {
  const m = window.game.scene.getScene('MenuScene');
  const start = m.children.list.find((o) => o.type === 'Text' && o.text === '게임 시작');
  const frame = m.children.list.find((o) => o.type === 'Rectangle' && o.strokeColor === window.config.COLORS.dailyFill);
  if (!frame) return null;
  const bottom = frame.y + frame.height / 2, left = frame.x - frame.width / 2, right = frame.x + frame.width / 2;
  return { bottom, firstRow: start ? start.y - start.displayHeight / 2 : null, left, right, width: m.scale.width,
           heading: m.prophecyTitle?.text ?? '' };
})()`);
check('upright, the prophecy is a plate over the menu, inside the screen and clear of the first row',
  !!upright && upright.left >= 0 && upright.right <= upright.width && upright.firstRow !== null && upright.bottom < upright.firstRow,
  JSON.stringify(upright));
await shot('daily-02b-upright');
await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await cdp.until(`window.game?.scene.isActive('MenuScene') && window.dailyRules`, 30000, 200);
await ev(`(() => { window.__dailyOn = true; window.__dailyDay = ${pick.day}; window.game.scene.getScene('MenuScene').scene.restart(); return 1; })()`);
await sleep(700);

// --- 4. the 적 강화 tab: a knob each, a switch that flips on a press ---
await ev(`(() => { const m = window.game.scene.getScene('MenuScene'); m.openOverlay('TuningScene', { tab: 'daily' }); return 1; })()`);
await cdp.until(`window.game.scene.isActive('TuningScene') && window.game.scene.getScene('TuningScene').knobs?.length > 0`, 10000, 100);
await sleep(400);
const tab = await ev(`(() => {
  const s = window.game.scene.getScene('TuningScene'), C = window.config, T = window.tuning;
  const switches = s.knobs.filter((k) => k.dial.kind === 'toggle');
  const sw = switches[0];
  const was = T.valueOf(sw.dial.path);
  s.press(sw.dial);
  const flipped = T.valueOf(sw.dial.path);
  const reads = sw.value.text;
  s.press(sw.dial);
  const back = T.valueOf(sw.dial.path);
  T.clearDraft();
  return { knobs: s.knobs.length, want: C.DAILY_RULES.enemyBuffs.length * 2, switches: switches.length, was, flipped, back, reads,
           labels: s.knobs.slice(0, 4).map((k) => k.label.text) };
})()`);
check('the 적 강화 tab has a multiplier and a switch for every strengthened enemy', tab.knobs === tab.want && tab.switches === tab.want / 2,
  `${tab.knobs} knobs · ${tab.labels.join(' | ')}`);
check('a press flips a switch, and it reads off', tab.was === 1 && tab.flipped === 0 && tab.back === 1 && tab.reads.length > 0,
  JSON.stringify({ was: tab.was, flipped: tab.flipped, back: tab.back, reads: tab.reads }));
await shot('daily-03-tab');

// --- 5. 도파민 on the end screen (0.127): a new personal best ---
await ev(`(() => { const t = window.game.scene.getScene('TuningScene'); if (t?.scene.isActive()) t.close?.(); return 1; })()`);
await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await cdp.until(`window.game?.scene.getScene('GameScene')?.player?.active`, 30000, 200);
await sleep(500);
await run(`
  localStorage.removeItem('exiled-survivors:personal:v1');
  const p = s.player, e = s.spawner.group.get(p.x + 300, p.y);
  e.spawn(p.x + 300, p.y, p, 'brute', s.spawner.hooks); s.combat.hit(e, 1e9);
  p.invulnerableUntil = 0; p.takeDamage(99999);
  return 1;
`);
await cdp.until(`window.game.scene.isActive('GameOverScene')`, 10000, 100);
await sleep(600);
const record = await ev(`(() => { const g = window.game.scene.getScene('GameOverScene');
  return { newBest: g.payload.newBest, label: g.recordLabel?.text ?? null,
           stars: g.children.list.filter((o) => o.texture && o.texture.key === 'tex-sparkle').length }; })()`);
check('a run that beats every run on 내 기록 is celebrated: a badge by the score and a burst over it',
  record.newBest === true && !!record.label && record.stars > 0, JSON.stringify(record));
await shot('daily-04-record');

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
