import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 전술 교본 (0.147): an order for every choice a run puts up, switched on at
// 전투 준비 — and then the run takes the first of each list it is offered
// instead of showing the cards.

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
const scene = (key, body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('${key}'); ${body} })()`);
const active = (key) => ev(`window.game.scene.isActive('${key}')`);
const toTitle = async () => {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
  await cdp.until(`window.game?.scene.isActive('MenuScene') && window.autoPicks`, 30000, 200);
  await sleep(500);
};

// The harness skips 전투 준비 with an empty drawer; this suite wants it.
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__prepOn = true;' });
await toTitle();
await ev(`(() => { localStorage.clear(); window.autoPicks.reload(); return 1; })()`);
await toTitle();

// --- 1. the title's icon opens the lists ---
await scene('MenuScene', `return s.icons.press('autoPick');`);
await cdp.until(`window.game.scene.isActive('AutoPickScene')`, 8000);
const opened = await scene('AutoPickScene', `return { tab: s.tab, names: s.rowNames.map((t) => t.text), toggle: s.toggleLabel.text,
  skills: window.autoPicks.value.skills, enabled: window.autoPicks.enabled };`);
check('the title’s 전술 교본 icon opens the lists, on the skills, every skill a row, switched off',
  opened.tab === 'skills' && opened.names.length === opened.skills.length && opened.names.length >= 8 && !opened.enabled &&
    opened.toggle.includes('끔'),
  JSON.stringify(opened));
await shot('autopick-01-skills');

// --- 2. moving a row changes the order, kept; 기본 순서로 puts it back ---
const moved = await scene('AutoPickScene', `
  const before = [...window.autoPicks.value.skills];
  s.selected = 2; s.moveSelected(-1);
  const after = [...window.autoPicks.value.skills];
  const stored = JSON.parse(localStorage.getItem('exiled-survivors:auto-pick:v1')).skills;
  const names = s.rowNames.map((t) => t.text);
  return { before, after, stored, names, selected: s.selected };`);
check('▲ moves the selected skill up one place, the selection with it, and the order is stored',
  moved.after[1] === moved.before[2] && moved.after[2] === moved.before[1] && moved.selected === 1 &&
    JSON.stringify(moved.stored) === JSON.stringify(moved.after),
  JSON.stringify({ before: moved.before.slice(0, 3), after: moved.after.slice(0, 3) }));
const reset = await scene('AutoPickScene', `s.resetTab(); return window.autoPicks.value.skills;`);
check('기본 순서로 puts the list back', JSON.stringify(reset) === JSON.stringify(moved.before), reset.join(','));

const tabs = await scene('AutoPickScene', `
  s.openTab('upgrades'); const up = s.rowNames.length;
  s.openTab('shards'); const sh = s.rowNames.map((t) => t.text);
  return { up, upWant: window.autoPicks.value.upgrades.length, sh, shWant: window.config.TALENT_SHARD.stats.length };`);
check('the 강화 and 재능 tabs list every upgrade and every 재능', tabs.up === tabs.upWant && tabs.up >= 8 && tabs.sh.length === tabs.shWant,
  JSON.stringify(tabs));
await shot('autopick-02-shards');

// --- 3. the switch, here ---
const flipped = await scene('AutoPickScene', `s.flip(); return { on: window.autoPicks.enabled, text: s.toggleLabel.text };`);
check('the switch turns runs choosing by the plan on', flipped.on === true && flipped.text.includes('켬'), JSON.stringify(flipped));
await scene('AutoPickScene', `s.backButton.press?.() ?? s.input.keyboard.emit('keydown', { code: 'Escape', preventDefault() {} }); return 1;`);
await cdp.until(`!window.game.scene.isActive('AutoPickScene') && window.game.scene.isActive('MenuScene')`, 8000);
check('and the way back returns to the title', (await active('AutoPickScene')) === false && (await active('MenuScene')) === true);

// --- 4. 전투 준비 carries the switch and the way to the lists ---
await scene('MenuScene', `s.onStart(); return 1;`);
await cdp.until(`window.game.scene.isActive('BoneScene')`, 8000);
const prep = await scene('BoneScene', `return { ids: s.choices.map((c) => c.id), label: s.autoLabel?.text ?? '' };`);
check('전투 준비 shows even with an empty drawer, with the 전술 교본 switch (on) and its lists',
  prep.ids.includes('auto') && prep.ids.includes('plan') && prep.ids.includes('start') && prep.label.includes('켬'), JSON.stringify(prep));
await shot('autopick-03-prep');
const toggled = await scene('BoneScene', `
  const i = s.choices.findIndex((c) => c.id === 'auto');
  s.choices[i].onSelect(); const off = { on: window.autoPicks.enabled, label: s.autoLabel.text };
  s.choices[i].onSelect(); const on = { on: window.autoPicks.enabled, label: s.autoLabel.text };
  return { off, on };`);
check('pressing the switch there turns it off and on again',
  toggled.off.on === false && toggled.off.label.includes('끔') && toggled.on.on === true && toggled.on.label.includes('켬'),
  JSON.stringify(toggled));
await scene('BoneScene', `s.openPlan(); return 1;`);
await cdp.until(`window.game.scene.isActive('AutoPickScene')`, 8000);
await scene('AutoPickScene', `s.input.keyboard.emit('keydown', { code: 'Escape', preventDefault() {} }); return 1;`);
await cdp.until(`!window.game.scene.isActive('AutoPickScene')`, 8000);
check('the lists open over it and close back onto it', (await active('BoneScene')) === true && (await active('AutoPickScene')) === false);

// --- 5. a run started with it on takes its first skill by the plan, no cards ---
const plan = await ev(`(() => {
  const P = window.autoPicks, C = window.config;
  // 얼음창 first; 공격속도 first among the upgrades; 효과범위 first among the 재능.
  P.setOrder('skills', ['iceSpear', ...P.value.skills.filter((id) => id !== 'iceSpear')]);
  P.setOrder('upgrades', ['attackSpeed', ...P.value.upgrades.filter((id) => id !== 'attackSpeed')]);
  P.setOrder('shards', ['area', ...P.value.shards.filter((id) => id !== 'area')]);
  C.SKILL_PICK.atRunStart = true;
  return { skills: P.value.skills.slice(0, 2), upgrades: P.value.upgrades.slice(0, 2), shards: P.value.shards.slice(0, 2) };
})()`);
await scene('BoneScene', `s.choices.find((c) => c.id === 'start').onSelect(); return 1;`);
await cdp.until(`window.game.scene.getScene('GameScene')?.mainSkill`, 15000);
await sleep(300);
const started = await scene('GameScene', `return { auto: s.autoPick, main: s.mainSkill, pick: window.game.scene.isActive('SkillPickScene'),
  toasts: s.toasts?.lines ?? [] };`);
check('a run started with it on chooses its first skill by the plan — no cards, a toast saying so',
  started.auto === true && started.main === 'iceSpear' && started.pick === false && started.toasts.some((line) => line.includes('자동 선택')),
  JSON.stringify(started));

// --- 6. a level-up takes the top-ranked upgrade among those offered ---
const levelled = await scene('GameScene', `
  s.player.setInvulnerable(true);
  const before = { ...s.progression.statsFor('iceSpear') };
  s.progression.addXp(s.progression.xpToNext);
  const after = s.progression.statsFor('iceSpear');
  return { speed: after.attackSpeed > before.attackSpeed, damage: after.damage === before.damage,
           upgrade: window.game.scene.isActive('UpgradeScene'), choosing: s.choosing, paused: s.physics.world.isPaused };`);
check('a level-up takes the plan’s first upgrade (공격속도) by itself, and the run goes on',
  levelled.speed && levelled.damage && !levelled.upgrade && !levelled.choosing, JSON.stringify(levelled));

// --- 7. a 무작위 스킬 takes the plan's best of its cards ---
const picked = await scene('GameScene', `
  const P = window.autoPicks;
  P.setOrder('skills', ['iceSpear', 'chainLightning', ...P.value.skills.filter((id) => id !== 'iceSpear' && id !== 'chainLightning')]);
  s.randomSkills = () => ['fireball', 'chainLightning', 'drone'];
  s.queueChoice({ kind: 'pick' });
  return { owned: [...s.owned], pick: window.game.scene.isActive('SkillPickScene') };`);
check('a 무작위 스킬 takes the highest-ranked of its cards (연쇄번개 over 화염구 and 드론)',
  picked.owned.includes('chainLightning') && !picked.owned.includes('fireball') && !picked.owned.includes('drone') && !picked.pick,
  JSON.stringify(picked));

// --- 8. 재능의 파편 cards take the plan's first ---
const shard = await scene('GameScene', `
  const C = window.config, was = C.TALENT_SHARD.choices;
  C.TALENT_SHARD.choices = C.TALENT_SHARD.stats.length;
  try { s.queueChoice({ kind: 'shard', subtitle: '' }); } finally { C.TALENT_SHARD.choices = was; }
  return { area: s.shards.area, total: Object.values(s.shards).reduce((a, b) => a + b, 0), upgrade: window.game.scene.isActive('UpgradeScene') };`);
check('재능의 파편 cards take the plan’s first (효과범위)', shard.area === 1 && shard.total === 1 && !shard.upgrade, JSON.stringify(shard));
await sleep(400);
await shot('autopick-04-run');

// --- 9. switched off, the cards come back ---
await toTitle();
await ev(`(() => { window.autoPicks.setEnabled(false); window.config.SKILL_PICK.atRunStart = true; return 1; })()`);
await scene('MenuScene', `s.onStart(); return 1;`);
await cdp.until(`window.game.scene.isActive('BoneScene')`, 8000);
await scene('BoneScene', `s.choices.find((c) => c.id === 'start').onSelect(); return 1;`);
await cdp.until(`window.game.scene.isActive('SkillPickScene')`, 15000);
const manual = await scene('GameScene', `return { auto: s.autoPick, pick: window.game.scene.isActive('SkillPickScene') };`);
check('with it off, a run shows the cards as before', manual.auto === false && manual.pick === true, JSON.stringify(manual));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed: ' + failed.map((r) => r.n).join(' | '));
console.log(`RESULT: ${failed.length ? 'FAIL' : 'PASS'}`);
cdp.close();
process.exit(failed.length ? 1 : 0);
