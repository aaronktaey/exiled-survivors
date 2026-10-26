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

// What ships (0.80, kept as it stood at 0.79): every skill stat it has at
// all and its 피해 배율, enemy health (overall, a minute, each tier) and every
// drop off a kill — read off the tables, so a new one without its dial fails.
const shipped = await ev(`(() => {
  const c = window.config;
  const paths = new Set(c.DIALS.map((d) => d.path));
  const want = ['BALANCE.enemyHpScale', 'DIFFICULTY.hpScalePerMinute',
    ...c.DIFFICULTY.hpStepTiers.flatMap((_, i) => ['DIFFICULTY.hpStepTiers.' + i + '.afterMinute', 'DIFFICULTY.hpStepTiers.' + i + '.multiplier']),
    // Spawn pace, the cap, the rare chance and each kind's arrival (0.85).
    'SPAWN.startIntervalMs', 'SPAWN.minIntervalMs', 'SPAWN.rampPerMinute', 'SPAWN.maxAlive',
    'RARE.chance', 'DIFFICULTY.rareChancePerMinute', 'DIFFICULTY.lateFromMinute', 'DIFFICULTY.lateMultiplier',
    ...c.SPAWN_TABLE.map((_, i) => 'SPAWN_TABLE.' + i + '.unlockMs'),
    'SKILL_DROP.chance', 'SKILL_PICK.dropChance', 'POTION.chance', 'MANGO.chance', 'MAGNET.chance', 'ALTAR.fromKill', 'ALTAR.fromBoss',
    ...Object.keys(c.ORBS).filter((id) => !c.ORBS[id].fromBossOnly).map((id) => 'ORBS.' + id + '.chance'),
    ...Object.keys(c.BONES).filter((id) => c.BONES[id].fromKill > 0).map((id) => 'BONES.' + id + '.fromKill'),
    ...Object.keys(c.GEAR).filter((id) => c.GEAR[id].fromKill !== undefined).map((id) => 'GEAR.' + id + '.fromKill'),
    ...Object.keys(c.SKILL_BASE).flatMap((id) => [
      ...Object.keys(c.SKILL_BASE[id]).filter((stat) => c.SKILL_BASE[id][stat] > 0).map((stat) => 'SKILL_BASE.' + id + '.' + stat),
      'BALANCE.attackCoeff.' + id, 'BALANCE.damageScale.' + id]),
    // 적 강화 (0.127): each strengthened enemy's multiplier and its switch.
    ...c.DAILY_RULES.enemyBuffs.flatMap((_, i) => ['DAILY_RULES.enemyBuffs.' + i + '.scale', 'DAILY_RULES.enemyBuffs.' + i + '.on'])];
  const value = (path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), c);
  return { missing: want.filter((p) => !paths.has(p)), loose: [...paths].filter((p) => typeof value(p) !== 'number'),
           extra: [...paths].filter((p) => !want.includes(p)) };
})()`);
check('it ships with a dial for every skill stat, enemy health and each tier, and every drop — and nothing else',
  shipped.missing.length === 0 && shipped.loose.length === 0 && shipped.extra.length === 0, JSON.stringify(shipped));

// --- 1. the panel, from the title ---
await scene('MenuScene', `s.icons.press('tuning'); return 1;`);
await sleep(700);
const panel = await scene('TuningScene', `return { active: s.scene.isActive(), knobs: s.knobs.map((k) => k.dial.path), back: !!s.backButton };`);
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
    fit.count >= 15 && fit.bottom < fit.status && fit.right < fit.width, JSON.stringify(fit));
  await shot(`tuning-03-drops-${shape}`);
  // The magnified dial (0.89): everything on it inside the window, nothing overlapping.
  const zoomFit = await scene('TuningScene', `
    s.openZoom(s.knobs[0].dial);
    const { width, height } = s.scale;
    const parts = s.zoom.root.list.slice(1).filter((o) => typeof o.getBounds === 'function').map((o) => o.getBounds());
    const inside = parts.every((r) => r.left >= -1 && r.top >= -1 && r.right <= width + 1 && r.bottom <= height + 1);
    const dialBottom = s.zoom.y + s.zoom.r + 26;
    const facts = s.zoom.facts.getBounds();
    const r = s.zoom.r;
    s.closeZoom();
    return { inside, dialBottom: Math.round(dialBottom), factsTop: Math.round(facts.top), r, width, height };
  `);
  check(`${shape}: the magnified dial and its buttons all sit inside the window, the dial clear of the lines under it`,
    zoomFit.inside && zoomFit.dialBottom <= zoomFit.factsTop + 4, JSON.stringify(zoomFit));
}
await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(2500);
await ev(standIn);
await sleep(300);

// --- 1b. the magnified dial (0.89) ---
await scene('MenuScene', `s.icons.press('tuning'); return 1;`);
await sleep(700);
const zoom = await scene('TuningScene', `
  const c = window.config;
  // Every dial says what it does.
  const blank = c.DIALS.filter((d) => !(s.detailOf(d) ?? '').trim() || /\{\w+\}/.test(s.detailOf(d))).map((d) => d.path);
  // A press on a knob opens it magnified.
  const knob = s.knobs.find((k) => k.dial.path === 'SKILL_BASE.meleeStrike.damage');
  knob.hit.emit('pointerdown');
  const opened = s.zoom?.dial.path ?? null;
  const shown = s.zoom ? { position: s.zoom.position.text, value: s.zoom.value.text, facts: s.zoom.facts.text } : null;
  const { min, max } = window.tuning.range(knob.dial);
  s.setZoomPosition(0);
  const atZero = window.tuning.valueOf(knob.dial.path);
  s.setZoomPosition(100);
  const atTop = window.tuning.valueOf(knob.dial.path);
  s.setZoomPosition(150);
  const clamped = s.zoomPosition;
  return { blank, opened, shown, min, max, atZero, atTop, clamped, shared: window.tuning.sharedOf(knob.dial.path) };
`);
console.log('zoom:', JSON.stringify(zoom));
check('every dial has a description of what it does, nothing left unfilled', zoom.blank.length === 0, zoom.blank.join(' '));
check('pressing a knob opens it magnified, its position, value and range written out',
  zoom.opened === 'SKILL_BASE.meleeStrike.damage' && /^\d+$/.test(zoom.shown?.position ?? '') && zoom.shown.value !== '' && zoom.shown.facts.includes('~'),
  JSON.stringify(zoom.shown));
check('the magnified dial reads 0 to 100 across the dial’s whole range, and stops at 100',
  Math.abs(zoom.atZero - zoom.min) < 1e-9 && Math.abs(zoom.atTop - zoom.max) < 1e-6 && zoom.clamped === 100,
  `0 → ${zoom.atZero} (min ${zoom.min}), 100 → ${zoom.atTop} (max ${zoom.max})`);
const zoomKeys = await scene('TuningScene', `
  const press = (code, shiftKey = false) => s.input.keyboard.emit('keydown', { code, shiftKey, preventDefault() {} });
  // A coarse dial (a count over a short range) still steps one position at a time.
  const coarse = window.config.DIALS.find((d) => d.kind === 'count' && d.tab === 'skills');
  s.openZoom(coarse);
  s.setZoomPosition(50);
  press('ArrowUp');
  const one = s.zoomPosition;
  press('ArrowUp', true);
  const ten = s.zoomPosition;
  press('ArrowDown');
  const back = s.zoomPosition;
  s.turn(coarse.path, window.tuning.sharedOf(coarse.path));
  const resetValue = window.tuning.valueOf(coarse.path);
  press('Escape');
  const closed = s.zoom === null;
  const stillOpen = s.scene.isActive();
  return { one, ten, back, resetValue, shared: window.tuning.sharedOf(coarse.path), closed, stillOpen, path: coarse.path };
`);
console.log('zoom keys:', JSON.stringify(zoomKeys));
check('↑ steps the magnified dial by one, Shift by ten, ↓ back by one — even on a coarse dial',
  zoomKeys.one === 51 && zoomKeys.ten === 61 && zoomKeys.back === 60, JSON.stringify(zoomKeys));
check('Esc closes the magnified dial and leaves the panel open', zoomKeys.closed && zoomKeys.stillOpen);
const resetButton = await scene('TuningScene', `
  const dial = s.knobs[0].dial;
  s.openZoom(dial);
  s.setZoomPosition(90);
  const turned = window.tuning.valueOf(dial.path);
  const buttons = s.zoom.root.list.filter((o) => o.type === 'Container');
  // The last two are 전체 값으로 and 닫기.
  const reset = buttons[buttons.length - 2];
  reset.list[0].emit('pointerdown');
  const after = window.tuning.valueOf(dial.path);
  const position = s.zoomPosition;
  const close = buttons[buttons.length - 1];
  close.list[0].emit('pointerdown');
  return { turned, after, shared: window.tuning.sharedOf(dial.path), position, closed: s.zoom === null, drafted: dial.path in window.tuning.draft };
`);
console.log('reset:', JSON.stringify(resetButton));
check('전체 값으로 sets the dial back to everyone’s value, and 닫기 closes it',
  resetButton.turned !== resetButton.shared && Math.abs(resetButton.after - resetButton.shared) < 1e-9 && !resetButton.drafted && resetButton.closed,
  JSON.stringify(resetButton));
await scene('TuningScene', `window.tuning.clearDraft(); s.close(); return 1;`);
await sleep(400);

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
await ev(`(() => { window.config.DEBUG.gatedInDev = true; return 1; })()`);
await ev(standIn);
await ev(`(() => { window.__balanceStandIn.overrides = { 'POTION.chance': 0.25 }; window.__balanceStandIn.updatedAt = 1; return 1; })()`);
const player = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  window.tuning.draft = { 'POTION.chance': 0.9 };
  await window.tuning.load(window.game);
  window.tuning.settle();
  // The title as it would be drawn for this player.
  window.game.scene.getScene('MenuScene').scene.restart();
  await new Promise((r) => setTimeout(r, 800));
  const icons = window.game.scene.getScene('MenuScene').icons.views.map((v) => v.button.id);
  return { potion: window.config.POTION.chance, icons };
})()` });
const pl = player.result?.result?.value ?? {};
check('a player who is not the admin plays on everyone’s values, never a draft, and has no 밸런스 icon',
  pl.potion === 0.25 && !pl.icons?.includes('tuning'), JSON.stringify(pl));
await ev(`(() => { window.config.DEBUG.gatedInDev = false; window.tuning.draft = {}; localStorage.removeItem('exiled-survivors:tuning-draft:v1'); return 1; })()`);

// --- 5. everyone's values as last heard play on even when the server does not answer (0.133) ---
// The dev server has no /api here: the load fails, and the values section 4
// settled must still be the ones the game plays on.
const heard = await ev(`(() => JSON.parse(localStorage.getItem(window.config.TUNING.sharedKey) ?? 'null'))()`);
await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await cdp.until(`window.tuning && window.game?.scene.isActive('MenuScene')`, 30000, 200);
const offline = await ev(`(() => ({ potion: window.config.POTION.chance, shared: window.tuning.shared['POTION.chance'] }))()`);
check('everyone’s values are kept on the device and laid over at boot, so a run before (or without) the server’s answer plays on them',
  heard?.overrides?.['POTION.chance'] === 0.25 && offline.potion === 0.25 && offline.shared === 0.25,
  JSON.stringify({ heard, offline }));
await ev(`(() => { localStorage.removeItem(window.config.TUNING.sharedKey); return 1; })()`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
