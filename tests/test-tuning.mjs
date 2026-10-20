import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 밸런스: the admin's dials. A turn changes this game at once — a skill in
// hand keeps its picks — and keeps the run off the boards; 전체 적용 makes it
// everyone's, which a player who is not the admin takes on the title.

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

// A stand-in for the Worker's /api/balance, so nothing here reaches a server.
const standIn = `(() => {
  if (window.__balanceStandIn) return 1;
  window.__balanceStandIn = { overrides: {}, updatedAt: 0, puts: [] };
  const real = window.fetch;
  window.fetch = async (url, init) => {
    if (String(url).startsWith('/api/balance')) {
      const b = window.__balanceStandIn;
      if (init?.method === 'PUT') {
        const body = JSON.parse(init.body);
        b.puts.push(body.overrides);
        b.overrides = body.overrides; b.updatedAt = Date.now();
      }
      return new Response(JSON.stringify({ ok: true, overrides: b.overrides, updatedAt: b.updatedAt }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return real(url, init);
  };
  return 1;
})()`;

await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(2500);
await ev(standIn);
// A dial ships only when the user asks for it (2026-10-19); the skill ones
// are added here for the test, beside what ships (0.77: enemy health, drops).
const addDials = `(() => {
  window.tuning.addDial({ path: 'SKILL_BASE.meleeStrike.damage', kind: 'number', tab: 'skills', skill: 'meleeStrike' });
  window.tuning.addDial({ path: 'BALANCE.damageScale.meleeStrike', kind: 'scale', tab: 'skills', skill: 'meleeStrike' });
  window.tuning.addDial({ path: 'POTION.chance', kind: 'chance', tab: 'drops', max: 0.3 });
  return 1;
})()`;
// What ships: enemy health — overall, a minute, every tier of it — and
// every drop off a kill, read off the tables so a new one without its dial fails.
const shipped = await ev(`(() => {
  const c = window.config;
  const paths = new Set(c.DIALS.map((d) => d.path));
  const want = ['BALANCE.enemyHpScale', 'DIFFICULTY.hpScalePerMinute',
    ...c.DIFFICULTY.hpStepTiers.flatMap((_, i) => ['DIFFICULTY.hpStepTiers.' + i + '.afterMinute', 'DIFFICULTY.hpStepTiers.' + i + '.multiplier']),
    'RUNE_DROP.chance', 'RUNE_CHISEL.chance', 'RANDOM_SKILL.chance', 'POTION.chance', 'MANGO.chance', 'MAGNET.chance', 'ALTAR.fromKill',
    ...Object.keys(c.ORBS).filter((id) => !c.ORBS[id].fromBossOnly).map((id) => 'ORBS.' + id + '.chance'),
    ...Object.keys(c.BONES).filter((id) => c.BONES[id].fromKill > 0).map((id) => 'BONES.' + id + '.fromKill'),
    ...Object.keys(c.GEAR).filter((id) => c.GEAR[id].fromKill !== undefined).map((id) => 'GEAR.' + id + '.fromKill'),
    // Every skill's stats (0.79): each one it has at all, and its 피해 배율.
    ...Object.keys(c.SKILL_BASE).flatMap((id) => [
      ...Object.keys(c.SKILL_BASE[id]).filter((stat) => c.SKILL_BASE[id][stat] > 0).map((stat) => 'SKILL_BASE.' + id + '.' + stat),
      'BALANCE.damageScale.' + id])];
  const value = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), c);
  return { missing: want.filter((p) => !paths.has(p)), loose: [...paths].filter((p) => typeof value(p) !== 'number'),
           tabs: [...new Set(c.DIALS.map((d) => d.tab))] };
})()`);
await ev(addDials);

// --- 1. the panel, from the title ---
await scene('MenuScene', `s.icons.press('tuning'); return 1;`);
await sleep(700);
const panel = await scene('TuningScene', `return { active: s.scene.isActive(), knobs: s.knobs.map((k) => k.dial.path), back: !!s.backButton };`);
check('it ships with a dial for every skill stat, enemy health, a minute and each tier, and every drop off a kill',
  shipped.missing.length === 0 && shipped.loose.length === 0, JSON.stringify(shipped));
check('the title’s 밸런스 icon opens the dials, a page a skill',
  panel.active && panel.back && panel.knobs.includes('SKILL_BASE.meleeStrike.damage') && panel.knobs.includes('BALANCE.damageScale.meleeStrike'),
  panel.knobs.join(' '));
await shot('tuning-01-panel');
// The busiest page, 드랍, on a phone and lying down: every knob inside, above the buttons.
for (const [w, h, shape] of [[0, 0, 'landscape'], [420, 860, 'upright']]) {
  if (w) {
    // The canvas takes the window's shape when the page loads, so load it again.
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
    await sleep(2500);
    await ev(addDials);
    await scene('MenuScene', `s.icons.press('tuning'); return 1;`);
    await sleep(600);
  }
  await scene('TuningScene', `s.scene.restart({ ...s.payload, tab: 'drops' }); return 1;`);
  await sleep(600);
  const fit = await scene('TuningScene', `
    const bottom = Math.max(...s.knobs.map((k) => k.label.y + k.label.displayHeight / 2));
    return { count: s.knobs.length, bottom: Math.round(bottom), status: Math.round(s.status.y - s.status.displayHeight / 2),
             right: Math.max(...s.knobs.map((k) => k.x)), width: s.scale.width };
  `);
  check(`${shape}: every 드랍 dial fits above the buttons`,
    fit.count >= 1 && fit.bottom < fit.status && fit.right < fit.width, JSON.stringify(fit));
  await shot(`tuning-03-drops-${shape}`);
}
await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(2500);
await ev(addDials);
await ev(standIn);
await sleep(300);

// --- 2. turned mid-run: this game at once, picks kept ---
await ev(`(() => { window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
await sleep(1500);
const before = await scene('GameScene', `
  s.player.setInvulnerable(true);
  s.progression.apply('meleeStrike', 'damage');
  s.progression.apply('meleeStrike', 'damage');
  return { dmg: s.damageOf('meleeStrike'), stat: s.progression.statsFor('meleeStrike').damage,
           level: s.progression.levelFor('meleeStrike'),
           base: window.config.SKILL_BASE.meleeStrike.damage, tuned: s.tunedRun };
`);
await scene('GameScene', `s.pauseRun(); return 1;`);
await sleep(500);
const paused = await ev(`(() => {
  const p = window.game.scene.getScene('PauseScene');
  const row = p.menu.rows.find((r) => r.item.id === 'tuning');
  if (row) row.item.onSelect();
  return !!row;
})()`);
await sleep(600);
const turned = await scene('TuningScene', `
  s.turn('SKILL_BASE.meleeStrike.damage', ${before.base} * 2);
  return { dps: s.dpsLine?.text ?? '', drafted: Object.keys(window.tuning.draft) };
`);
await shot('tuning-02-midrun');
// The line under the skill row reads out the page's skill: in this run when
// it is in hand, at level 1 when it is not.
const pageLine = async (page) => {
  await scene('TuningScene', `s.reopen({ tab: 'skills', page: '${page}' }); return 1;`);
  await sleep(400);
  return scene('TuningScene', `return s.dpsLine?.text ?? '';`);
};
const meleeLine = await pageLine('meleeStrike');
const fireLine = await pageLine('fireball');
const runDps = await scene('GameScene', `return Math.round(s.loadout().find((l) => l.id === 'meleeStrike').dps).toLocaleString('en-US');`);
console.log('dps lines:', JSON.stringify({ meleeLine, fireLine, runDps }));
check('the DPS line is the chosen skill’s: one in hand, as this run has it',
  /타격/.test(meleeLine) && /이번 판/.test(meleeLine) && meleeLine.includes(runDps), meleeLine);
check('and one not in hand, at level 1', /화염구/.test(fireLine) && /1레벨/.test(fireLine) && !/타격/.test(fireLine), fireLine);
await scene('TuningScene', `s.backButton.press(); return 1;`);
await sleep(300);
const after = await scene('GameScene', `
  return { dmg: s.damageOf('meleeStrike'), stat: s.progression.statsFor('meleeStrike').damage,
           level: s.progression.levelFor('meleeStrike'), tuned: s.tunedRun,
           base: window.config.SKILL_BASE.meleeStrike.damage };
`);
console.log('turned:', JSON.stringify({ before, turned, after }));
check('the pause menu has the dials too, with the run’s DPS over them', paused && /DPS/.test(turned.dps), turned.dps);
check('turning a skill’s base doubles what that skill in hand does, and keeps its level',
  after.base === before.base * 2 && Math.abs(after.stat / before.stat - 2) < 1e-9 && after.dmg > before.dmg * 1.9 &&
    after.level === before.level,
  `stat ${before.stat} → ${after.stat}, damage ${before.dmg} → ${after.dmg}, level ${before.level} → ${after.level}`);
check('and the run it was turned in stays off the boards', before.tuned === false && after.tuned === true);

// A run started while the experiment is on says so at once, and its end
// screen says why no name is asked for (an admin once set a record so and
// was never asked).
await ev(`(() => { window.game.scene.getScene('GameScene').scene.restart({ save: null }); return 1; })()`);
await sleep(1500);
const started = await scene('GameScene', `return { tuned: s.tunedRun, toasts: s.toasts.lines };`);
check('a run started with an experiment on says at once that it is off the boards',
  started.tuned === true && started.toasts.some((line) => /밸런스 실험 중/.test(line)), JSON.stringify(started));
await scene('GameScene', `s.player.invulnerableUntil = 0; s.player.setInvulnerable(false); s.player.takeDamage(1e9); return 1;`);
await sleep(1500);
const ended = await ev(`(() => {
  const g = window.game.scene.getScene('GameOverScene');
  const note = g.children.list.find((o) => o.name === 'devRunNote');
  return { open: window.game.scene.isActive('GameOverScene'), note: note?.text ?? '', rank: g.menu.rows.some((r) => r.item.id === 'rank'),
           entry: window.game.scene.isActive('RankEntryScene') };
})()`);
check('and its end says why: an experiment was on, with where to drop or apply it, and no name is asked for',
  ended.open && /밸런스 실험 중인 판/.test(ended.note) && /실험 취소/.test(ended.note) && !ended.rank && !ended.entry,
  JSON.stringify(ended));
await ev(`(() => { window.game.scene.getScene('GameOverScene').scene.stop(); window.game.scene.getScene('GameScene').scene.start('MenuScene'); return 1; })()`);
await sleep(800);

// --- 3. made everyone's ---
const published = await ev(`(async () => 1)()`);
void published;
const pub = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  const ok = await window.tuning.publish();
  return { ok, draft: Object.keys(window.tuning.draft).length, shared: window.tuning.shared, put: window.__balanceStandIn.puts.at(-1) };
})()` });
const p = pub.result?.result?.value ?? {};
check('전체 적용 hands the draft to the server and it becomes everyone’s value',
  p.ok === true && p.draft === 0 && p.shared?.['SKILL_BASE.meleeStrike.damage'] === before.base * 2 &&
    p.put?.['SKILL_BASE.meleeStrike.damage'] === before.base * 2, JSON.stringify(p));

// --- 4. a player who is not the admin: everyone's values, not a draft ---
await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(2500);
await ev(addDials);
await ev(`(() => { window.config.DEBUG.gatedInDev = true; return 1; })()`);
await ev(standIn);
await ev(`(() => { window.__balanceStandIn.overrides = { 'POTION.chance': 0.25, 'SPAWN.maxAlive': 5 }; window.__balanceStandIn.updatedAt = 1;
  window.__chaosWas = window.config.SPAWN.maxAlive; return 1; })()`);
const player = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  window.tuning.draft = { 'POTION.chance': 0.9 };
  await window.tuning.load(window.game);
  window.tuning.settle();
  // The title as it would be drawn for this player.
  window.game.scene.getScene('MenuScene').scene.restart();
  await new Promise((r) => setTimeout(r, 800));
  const icons = window.game.scene.getScene('MenuScene').icons.views.map((v) => v.button.id);
  return { potion: window.config.POTION.chance, icons, chaos: window.config.SPAWN.maxAlive, chaosWas: window.__chaosWas };
})()` });
const pl = player.result?.result?.value ?? {};
check('a player who is not the admin plays on everyone’s values, never a draft, and has no 밸런스 icon',
  pl.potion === 0.25 && !pl.icons?.includes('tuning'), JSON.stringify(pl));
check('a value the server still holds for a path that is no dial changes nothing', pl.chaos === pl.chaosWas, JSON.stringify(pl));
await ev(`(() => { window.config.DEBUG.gatedInDev = false; window.tuning.draft = {}; localStorage.removeItem('exiled-survivors:tuning-draft:v1'); return 1; })()`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
