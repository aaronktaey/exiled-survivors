import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// What a run finds and how (0.71–0.72): the opening's slower spawns, a
// piece's 등급 deciding its line count, a 합성 that always works and stops
// short of tier 1, 구슬 drawn in like gems with no name over them and
// counted at the bottom right, and the run's second clock that the ranking
// weighs the shown one by.

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
const scene = (key, body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('${key}'); ${body} })()`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(800);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);
await run(`s.player.setInvulnerable(true); s.spawner.clear(); s.spawner.update = () => {}; return 1;`);

// --- 1. the opening: longer gaps between spawns, easing back after ---
const open = await run(`
  const c = window.config, sp = s.spawner, o = c.SPAWN.opening;
  const base = (ms) => c.SPAWN.minIntervalMs + (c.SPAWN.startIntervalMs - c.SPAWN.minIntervalMs) * Math.pow(1 - c.SPAWN.rampPerMinute, ms / 60000);
  const was = sp.elapsedMs, out = { scale: o.intervalScale };
  for (const [k, ms] of [['start', 0], ['end', o.untilMs], ['blend', o.untilMs + o.blendMs / 2], ['after', o.untilMs + o.blendMs]]) {
    sp.elapsedMs = ms;
    out[k] = Math.round((sp.intervalMs / base(ms)) * 1000) / 1000;
  }
  sp.elapsedMs = was;
  return out;
`);
check('through the opening every gap between spawns is stretched', open.start === open.scale && open.end === open.scale, JSON.stringify(open));
check('and after it eases back to the usual ramp', open.blend < open.scale && open.blend > 1 && open.after === 1, JSON.stringify(open));

// --- 3. a piece's 등급 decides how many lines it drops with ---
const grades = await ev(`(() => {
  const c = window.config, counts = {};
  const bases = Object.values(c.GEAR);
  for (let i = 0; i < 600; i++) {
    const item = window.rollGearItem(bases[i % bases.length]);
    const n = item.prefixes.length + item.suffixes.length;
    counts[n] = (counts[n] ?? 0) + 1;
  }
  const g = c.GEAR_DROP.grades;
  return { counts, want: [g.normal.lines, g.magic.lines, g.rare.lines] };
})()`);
const seen = Object.keys(grades.counts).map(Number).sort((a, b) => a - b);
check('every drop carries exactly its 등급’s count of lines', JSON.stringify(seen) === JSON.stringify(grades.want), JSON.stringify(grades.counts));

// --- 4. 합성: always, and never into tier 1 ---
const combine = await run(`
  const c = window.config, k = s.kit;
  const tierOf = (tier, slot) => Object.values(c.GEAR).find((g) => g.slot === slot && g.tier === tier);
  const low = tierOf(Math.max(...Object.values(c.GEAR).map((g) => g.tier)), 'armor');
  for (const item of [...k.bag]) k.remove(item.uid);
  for (let i = 0; i < c.GEAR_COMBINE.count; i++) k.store(window.rollGearItem(low));
  return { low: low.id, lowTier: low.tier, bag: k.bag.length };
`);
await run(`s.scene.launch('RunGearScene', { kit: s.kit, onClose: () => {} }); return 1;`);
await sleep(700);
await scene('RunGearScene', `s.select(s.cells.findIndex((c) => c.bag === 0)); s.combine(); return 1;`);
const asked = await scene('RunGearScene', `return { note: s.status.text, bag: s.kit.bag.length };`);
check('합성 asks once before it spends anything', asked.bag === combine.bag, JSON.stringify(asked));
await shot('runloot-01-combine-ask');
await scene('RunGearScene', `s.combine(); return 1;`);
await sleep(700);
const made = await scene('RunGearScene', `
  const c = window.config, bag = s.kit.bag;
  return { bag: bag.map((i) => ({ id: i.id, tier: c.GEAR[i.id].tier, slot: c.GEAR[i.id].slot, lines: i.prefixes.length + i.suffixes.length })),
           picked: s.picked?.uid === bag[0]?.uid, note: s.status.text, normal: c.GEAR_DROP.grades.normal.lines };
`);
check('and on the second, three of a base always make one a tier better, of the same slot', made.bag.length === 1 &&
  made.bag[0].tier === combine.lowTier - 1 && made.bag[0].slot === 'armor', JSON.stringify(made));
check('the piece it makes is an 일반 drop’s, and the cursor is on it', made.bag[0]?.lines === made.normal && made.picked, JSON.stringify(made));
await shot('runloot-02-combined');
const limits = await run(`
  const c = window.config, k = s.kit;
  const of = (tier) => Object.values(c.GEAR).find((g) => g.slot === 'weapon' && g.tier === tier);
  const out = {};
  for (const item of [...k.bag]) k.remove(item.uid);
  k.store(window.rollGearItem(of(4))); k.store(window.rollGearItem(of(4)));
  out.two = k.combine(k.bag[0].uid);
  for (const item of [...k.bag]) k.remove(item.uid);
  const best = c.GEAR_COMBINE.bestTier;
  for (let i = 0; i < c.GEAR_COMBINE.count; i++) k.store(window.rollGearItem(of(best)));
  out.top = k.combine(k.bag[0].uid);
  for (const item of [...k.bag]) k.remove(item.uid);
  for (let i = 0; i < c.GEAR_COMBINE.count; i++) k.store(window.rollGearItem(of(best + 1)));
  const up = k.combine(k.bag[0].uid);
  out.up = typeof up === 'string' ? up : c.GEAR[up.id].tier;
  out.best = best;
  out.bossOnly = Object.values(c.GEAR).filter((g) => g.tier < best).every((g) => g.fromKill === undefined);
  for (const item of [...k.bag]) k.remove(item.uid);
  return out;
`);
check('too few of a base is not combined', limits.two === 'count', JSON.stringify(limits));
check('a piece at the best tier a 합성 makes cannot go in, and one below reaches it', limits.top === 'top' && limits.up === limits.best,
  JSON.stringify(limits));
check('the tier above is a 우두머리’s only', limits.bossOnly);
await scene('RunGearScene', `s.close(); return 1;`);
await sleep(300);

// --- 5. 구슬: no name over it, drawn in like a gem, and a toast ---
const orb = await run(`
  const c = window.config, p = s.player;
  s.combat.orbDrops.getChildren().forEach((d) => d.active && d.collect());
  s.edgeMarkers.update();
  const markers = s.edgeMarkers.shown;
  s.combat.dropOrbAt(p.x + p.pickupRadius * 3, p.y, 'chaos');
  s.combat.dropOrbAt(p.x + p.pickupRadius * 0.6, p.y, 'transmute');
  const far = s.combat.orbDrops.getChildren().find((d) => d.active && d.orb === 'chaos');
  window.__farOrb = { x: far.x, y: far.y };
  s.edgeMarkers.update();
  return { markers, after: s.edgeMarkers.shown, label: 'nameplate' in far, held: s.kit.count('transmute') };
`);
check('a 구슬 on the ground carries no name over it', orb.label === false);
check('and no edge marker points at one', orb.after === orb.markers, `${orb.markers} -> ${orb.after}`);
await sleep(1500);
const pulled = await run(`
  const far = s.combat.orbDrops.getChildren().find((d) => d.active && d.orb === 'chaos');
  return { held: s.kit.count('transmute'), toast: s.toasts.lines.some((l) => l.includes(${JSON.stringify('')}) && l.length > 0),
           lines: s.toasts.lines, farMoved: far ? Math.hypot(far.x - window.__farOrb.x, far.y - window.__farOrb.y) : -1 };
`);
check('one inside the pickup radius is drawn in and taken, like a gem', pulled.held === orb.held + 1, JSON.stringify(pulled));
check('and its toast says so', pulled.lines.length > 0, JSON.stringify(pulled.lines));
check('one outside it lies where it fell', pulled.farMoved === 0, `${pulled.farMoved}`);
// And over the survivor, in the 구슬's own colour; several at once stack up.
const over = await run(`
  const c = window.config, p = s.player;
  const live = () => s.damageNumbers.pool.filter((f) => f.remainingMs > 0 && f.text.text.includes('구슬'));
  s.damageNumbers.reset();
  s.onOrbCollected('chaos');
  const one = live().map((f) => ({ text: f.text.text, x: f.text.x, y: f.text.y, color: f.text.style.color }));
  s.onOrbCollected('awaken');
  s.onOrbCollected('mango');
  const three = live().map((f) => f.text.y);
  for (const id of ['chaos', 'awaken', 'mango']) s.kit.spend(id);
  return { one, three, px: p.x, py: p.y, want: '#' + c.ORBS.chaos.color.toString(16).padStart(6, '0'), above: c.ORB_DROP.pickupText.above };
`);
check('a 구슬 picked up is said right over the survivor, in its own colour',
  over.one.length === 1 && /혼돈의 구슬/.test(over.one[0].text) && Math.abs(over.one[0].x - over.px) < 1 &&
    over.one[0].y < over.py && over.py - over.one[0].y <= over.above + 1 && over.one[0].color === over.want, JSON.stringify(over));
check('and several at once stack instead of printing over each other', new Set(over.three.map(Math.round)).size === 3, JSON.stringify(over.three));
const tray = await run(`
  const t = s.orbTray;
  const ids = t.entries.map((e) => e.orb);
  const held = Object.fromEntries(ids.map((id) => [id, s.kit.count(id)]));
  const faint = t.entries.filter((e) => s.kit.count(e.orb) === 0).every((e) => e.icon.alpha < 1);
  const lit = t.entries.filter((e) => s.kit.count(e.orb) > 0).every((e) => e.icon.alpha === 1);
  const h = s.scale.height, w = s.scale.width;
  const inside = t.entries.every((e) => e.icon.x > w / 2 && e.count.x <= w && e.icon.y > h - 60 && e.icon.y < h);
  s.kit.addOrb('mango');
  const after = t.counts.mango;
  s.kit.spend('mango');
  return { ids, held, counts: t.counts, faint, lit, inside, after, want: Object.keys(window.config.ORBS) };
`);
check('the 구슬 held are shown at the bottom right, every kind as its icon and count',
  JSON.stringify(tray.ids) === JSON.stringify(tray.want) && JSON.stringify(tray.counts) === JSON.stringify(tray.held) && tray.inside,
  JSON.stringify(tray));
check('a kind not held is faint, and the count follows the run at once', tray.faint && tray.lit && tray.after === (tray.held.mango ?? 0) + 1,
  JSON.stringify(tray));
await shot('runloot-03-orbs');

// --- 6. the second clock ---
await run(`s.choosing = false; return 1;`);
await sleep(3000);
const clock = await run(`const d = s.runDetail(); return { shown: s.elapsedMs, wall: d.wall };`);
check('the run hands in a second clock beside the shown one, close to it', clock.wall >= clock.shown * 0.97 && clock.wall <= clock.shown * 2 + 1000,
  JSON.stringify(clock));
const heldFrom = await run(`s.choosing = true; return s.runDetail().wall;`);
await sleep(1500);
const heldTo = await run(`const w = s.runDetail().wall; s.choosing = false; return w;`);
check('it stands still while the run is held', heldTo === heldFrom, `${heldFrom} -> ${heldTo}`);
const pausedFrom = await run(`const d = { shown: s.elapsedMs, wall: s.runDetail().wall }; s.scene.pause(); return d;`);
await sleep(1500);
await run(`s.scene.resume(); return 1;`);
await sleep(500);
const pausedTo = await run(`return { shown: s.elapsedMs, wall: s.runDetail().wall };`);
const drift = (pausedTo.wall - pausedFrom.wall) - (pausedTo.shown - pausedFrom.shown);
check('and a pause does not count either', drift < 400, `drift ${Math.round(drift)}ms`);
const saved = await run(`s.writeSave(); const o = window.openRecord('exiled-survivors:save:v1', localStorage.getItem('exiled-survivors:save:v1'));
  return { wallMs: o.value?.wallMs, wall: s.runDetail().wall, onScene: Object.values(s).some((v) => v === s.runDetail().wall) };`);
check('the save carries it (sealed), so a resumed run goes on counting', typeof saved.wallMs === 'number' && Math.abs(saved.wallMs - saved.wall) < 200,
  JSON.stringify(saved));
check('and it is not kept on the scene, where the shown clock is', saved.onScene === false);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
