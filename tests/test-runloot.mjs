import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// What a run finds and how (0.71–0.78): the opening's slower spawns, a
// piece's 등급 deciding its line count, a piece picked up worn or let go
// (no 보관함 since 0.78), 구슬 drawn in like gems with no name over them and
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

// --- 4. a piece picked up: worn on the left, found on the right, 착용 or 버리기 (0.78) ---
const pickOpen = async () => {
  const offer = await run(`
    const c = window.config, k = s.kit;
    const base = Object.values(c.GEAR).find((g) => g.slot === 'armor' && g.id !== k.equipped.armor?.id);
    const item = window.rollGearItem(base);
    window.__found = item; window.__was = k.equipped.armor;
    s.onGearCollected(item);
    return { found: item.uid, was: k.equipped.armor?.uid ?? null };
  `);
  await sleep(700);
  return offer;
};
const look = () => scene('GearPickScene', `
  const g = s.arrow, a = s.arrowAt;
  return { open: s.scene.isActive(), choices: s.buttons.map((b) => b.choice),
    wornX: s.worn.container.x, foundX: s.found.container.x, wornY: s.worn.container.y, foundY: s.found.container.y,
    arrow: a, gold: window.config.COLORS.gold, width: s.scale.width,
    strokes: g?.commandBuffer?.length ?? 0 };
`);
const first = await pickOpen();
const desk = await look();
check('a piece picked up offers only 착용 and 버리기 — there is no 보관함',
  desk.open && JSON.stringify(desk.choices) === JSON.stringify(['wear', 'drop']), JSON.stringify(desk));
check('what is worn is on the left, the piece found on the right, a gold arrow pointing between them',
  desk.wornX < desk.foundX && desk.arrow.way === 'right' && desk.arrow.x > desk.wornX && desk.arrow.x < desk.foundX && desk.strokes > 0,
  JSON.stringify(desk));
await shot('runloot-01-gear-pick');
await scene('GearPickScene', `s.choose('wear'); return 1;`);
await sleep(400);
const wore = await run(`return { worn: s.kit.equipped.armor?.uid, was: window.__was ? s.kit.find(window.__was.uid) : null, state: Object.keys(s.kit.state) };`);
check('착용 puts it on and the old piece is gone, kept nowhere', wore.worn === first.found && wore.was === null && !wore.state.includes('bag'),
  JSON.stringify(wore));
const second = await pickOpen();
await scene('GearPickScene', `s.choose('drop'); return 1;`);
await sleep(400);
const dropped = await run(`return s.kit.equipped.armor?.uid;`);
check('버리기 leaves what is worn as it was', dropped === second.was, `${second.was} -> ${dropped}`);

// On a phone the two stack, worn on top, and the arrow points down.
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp.send('Page.reload', {});
await sleep(4500);
await run(`s.player.setInvulnerable(true); s.spawner.clear(); s.spawner.update = () => {}; return 1;`);
await pickOpen();
const phone = await look();
check('on a phone the worn piece is on top, the found one under it, the arrow pointing down',
  phone.wornY < phone.foundY && phone.arrow.way === 'down' && phone.arrow.y > phone.wornY && phone.arrow.y < phone.foundY,
  JSON.stringify(phone));
await shot('runloot-02-gear-pick-phone');
await scene('GearPickScene', `s.choose('drop'); return 1;`);
await sleep(300);
await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.reload', {});
await sleep(4500);
await run(`s.player.setInvulnerable(true); s.spawner.clear(); s.spawner.update = () => {}; return 1;`);

// The pause menu's 장비 is for 구슬 only: the three worn slots and 구슬 사용.
await run(`s.scene.launch('RunGearScene', { kit: s.kit, onClose: () => {} }); return 1;`);
await sleep(700);
const craft = await scene('RunGearScene', `return { cells: s.cells.map((c) => c.slot), combine: typeof s.combine, equip: typeof s.equip, orbs: !!s.orbButton };`);
check('the pause 장비 shows the three worn slots and 구슬 사용, nothing to wear, combine or drop',
  JSON.stringify(craft.cells) === JSON.stringify(['weapon', 'armor', 'accessory']) && craft.combine === 'undefined' && craft.equip === 'undefined' && craft.orbs,
  JSON.stringify(craft));
await shot('runloot-03-gear-craft');
await scene('RunGearScene', `s.close(); return 1;`);
await sleep(300);
// A save from before still holding a 보관함 comes back without it.
const restored = await run(`
  const old = { equipped: s.kit.state.equipped, bag: [window.rollGearItem(Object.values(window.config.GEAR)[0])], orbs: {} };
  const kit = s.kit.constructor.restore({ kit: old });
  return { keys: Object.keys(kit.state), worn: kit.equipped.armor?.uid === s.kit.equipped.armor?.uid };
`);
check('a save that still has a 보관함 comes back without it, worn as it was', !restored.keys.includes('bag') && restored.worn, JSON.stringify(restored));

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
await shot('runloot-04-orbs');

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
