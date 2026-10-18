import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 지형지물: a field of rocks per run that neither the survivor nor an enemy
// walks through — laid clear of the start and of each other, kept the same
// across 불러오기, walked round by a chaser, never dropped on — and off for
// every other suite.

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
const run = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);
const key = (type, code, k, vk) =>
  cdp.send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });

const { result: hook } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
  source: 'window.__terrainOn = true;',
});
await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(800);
await cdp.evaluate(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// A quiet arena: nothing new walks in, nothing hurts.
const QUIET = `
  s.player.setInvulnerable(true);
  s.spawner.clear();
  s.spawner.update = () => {};
`;

// The inside test the checks share: how deep a point (grown by r) is in any rock.
const DEPTH = `
  const edge = (rock, a) => {
    const n = rock.radii.length, turn = Math.PI * 2;
    const at = (((a % turn) + turn) % turn) / turn * n, i = Math.floor(at) % n, f = at - Math.floor(at);
    return rock.radii[i] * (1 - f) + rock.radii[(i + 1) % n] * f;
  };
  const depth = (x, y, r) => Math.max(0, ...s.terrain.rocks.map((k) =>
    edge(k, Math.atan2(y - k.y, x - k.x)) + r - Math.hypot(x - k.x, y - k.y)));
`;

// --- 1. the field ---
const field = await run(`
  ${QUIET}
  const T = window.config.TERRAIN, W = window.config.WORLD;
  const rocks = s.terrain?.rocks ?? [];
  const cx = W.width / 2, cy = W.height / 2;
  let nearStart = 0, crowded = 0, nearEdge = 0;
  rocks.forEach((a, i) => {
    if (Math.hypot(a.x - cx, a.y - cy) < T.startClear + a.reach - 0.5) nearStart++;
    if (a.x - a.reach < T.gap - 0.5 || a.y - a.reach < T.gap - 0.5 ||
        W.width - a.x - a.reach < T.gap - 0.5 || W.height - a.y - a.reach < T.gap - 0.5) nearEdge++;
    rocks.forEach((b, j) => {
      if (j > i && Math.hypot(a.x - b.x, a.y - b.y) < a.reach + b.reach + T.gap - 0.5) crowded++;
    });
  });
  const reaches = rocks.map((r) => r.reach);
  const shapes = rocks.map((r) => Math.max(...r.radii) / Math.min(...r.radii));
  return { on: !!s.terrain, count: rocks.length, tried: T.count, nearStart, crowded, nearEdge,
           minReach: Math.min(...reaches), maxReach: Math.max(...reaches),
           roundest: Math.min(...shapes), longest: Math.max(...shapes), seed: s.terrainSeed };
`);
console.log('field:', JSON.stringify(field));
check('a run with 지형지물 on lays a field of rocks', field.on && field.count >= Math.min(8, field.tried),
  `${field.count} of ${field.tried}`);
check('none within startClear of where the survivor starts', field.nearStart === 0);
check('every two keep the gap between them', field.crowded === 0);
check('and every one keeps it from the edge of the world', field.nearEdge === 0);
check('the shapes vary: round ones and long ones', field.longest > field.roundest * 1.5,
  `outline long/short ${field.roundest.toFixed(2)}–${field.longest.toFixed(2)}`);

// Look at it: the survivor beside the nearest rock.
await run(`
  const p = s.player;
  const rock = [...s.terrain.rocks].sort((a, b) =>
    Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  p.x = rock.x - rock.reach - 60; p.y = rock.y;
  return 1;
`);
await sleep(700);
await shot('terrain-field');

// --- 2. the survivor cannot stand in one, or walk into one ---
const dropped = await run(`
  ${DEPTH}
  const p = s.player, rock = s.terrain.rocks[0];
  p.x = rock.x; p.y = rock.y;
  return { rock: { x: rock.x, y: rock.y }, r: window.config.PLAYER.size / 2 };
`);
await sleep(300);
const out = await run(`
  ${DEPTH}
  const p = s.player;
  return { x: p.x, y: p.y, depth: depth(p.x, p.y, window.config.PLAYER.size / 2),
           moved: Math.hypot(p.x - ${dropped.rock.x}, p.y - ${dropped.rock.y}) };
`);
check('set down inside a rock, the survivor is put outside it', out.depth < 0.5 && out.moved > 10,
  `${out.depth.toFixed(2)}px in, ${out.moved.toFixed(0)}px from the centre`);

// Walk right, into a rock, for a second and a half.
const walk = await run(`
  ${DEPTH}
  const p = s.player;
  // The rock with open ground on its left.
  const r = window.config.PLAYER.size / 2;
  const rock = s.terrain.rocks.find((k) => depth(k.x - k.reach - 50, k.y, r) === 0 &&
    k.x - k.reach - 50 > 40);
  p.x = rock.x - rock.reach - 50; p.y = rock.y;
  window.__walk = { deepest: 0, rock: { x: rock.x, y: rock.y }, startX: p.x };
  window.__walkTimer = setInterval(() => {
    window.__walk.deepest = Math.max(window.__walk.deepest, depth(p.x, p.y, r));
  }, 16);
  return { edgeX: rock.x - rock.radii[rock.radii.length / 2], startX: p.x };
`);
await sleep(200);
await key('keyDown', 'KeyD', 'd', 68);
await sleep(1500);
await key('keyUp', 'KeyD', 'd', 68);
const walked = await run(`
  clearInterval(window.__walkTimer);
  const p = s.player;
  return { ...window.__walk, x: p.x, speed: window.config.PLAYER.speed };
`);
console.log('walk:', JSON.stringify(walked));
check('walking into a rock, the survivor stops at its edge', walked.x > walk.startX + 20 &&
  walked.x < walk.edgeX, `from ${walk.startX.toFixed(0)} to ${walked.x.toFixed(0)}, edge at ${walk.edgeX.toFixed(0)}`);
check('and is never drawn inside it on the way', walked.deepest < 1, `${walked.deepest.toFixed(2)}px at worst`);

// --- 3. a chaser behind a rock walks round it ---
const chase = await run(`
  ${DEPTH}
  s.spawner.clear();
  const p = s.player;
  // The biggest rock, the survivor on one side of it and a grunt on the other.
  const rock = [...s.terrain.rocks].sort((a, b) => b.reach - a.reach)[0];
  const r = window.config.PLAYER.size / 2;
  let angle = 0;
  for (let a = 0; a < 32; a++) {
    const t = (a / 32) * Math.PI * 2;
    const px = rock.x + Math.cos(t) * (rock.reach + 70), py = rock.y + Math.sin(t) * (rock.reach + 70);
    const ex = rock.x - Math.cos(t) * (rock.reach + 40), ey = rock.y - Math.sin(t) * (rock.reach + 40);
    const W = window.config.WORLD;
    const inside = (x, y) => x > 40 && y > 40 && x < W.width - 40 && y < W.height - 40;
    if (inside(px, py) && inside(ex, ey) && depth(px, py, r) === 0 && depth(ex, ey, 20) === 0) { angle = t; break; }
  }
  p.x = rock.x + Math.cos(angle) * (rock.reach + 70);
  p.y = rock.y + Math.sin(angle) * (rock.reach + 70);
  // No weapon, so it is not cut down on arrival.
  s.weapons.length = 0;
  const e = s.spawner.group.get(0, 0);
  e.spawn(rock.x - Math.cos(angle) * (rock.reach + 40), rock.y - Math.sin(angle) * (rock.reach + 40), p, 'grunt');
  window.__chase = { e, closest: Infinity, deepest: 0, start: Math.hypot(e.x - p.x, e.y - p.y) };
  window.__chaseTimer = setInterval(() => {
    const c = window.__chase;
    c.closest = Math.min(c.closest, Math.hypot(c.e.x - p.x, c.e.y - p.y));
    c.deepest = Math.max(c.deepest, depth(c.e.x, c.e.y, c.e.bodySize / 2));
  }, 16);
  return { reach: rock.reach, start: window.__chase.start, speed: e.currentSpeed };
`);
await sleep(1500);
await shot('terrain-chase');
await sleep(6500);
const chased = await run(`
  clearInterval(window.__chaseTimer);
  const c = window.__chase;
  return { closest: c.closest, deepest: c.deepest, active: c.e.active };
`);
console.log('chase:', JSON.stringify({ ...chase, ...chased }));
check('a grunt behind a rock walks round it to the survivor', chased.closest < 60,
  `${chase.start.toFixed(0)}px away at first, ${chased.closest.toFixed(0)}px at closest`);
check('and is never inside the rock on the way', chased.deepest < 1, `${chased.deepest.toFixed(2)}px at worst`);

// --- 4. drops never land on a rock ---
const drops = await run(`
  ${DEPTH}
  s.spawner.clear();
  const rocks = s.terrain.rocks;
  for (const k of rocks) s.combat.dropPotionAt(k.x, k.y);
  const potions = s.combat.potions.getChildren().filter((d) => d.active);
  const worst = Math.max(...potions.map((d) => depth(d.x, d.y, 0)));
  return { dropped: rocks.length, landed: potions.length, worst };
`);
check('a drop meant for the middle of a rock lands beside it', drops.landed >= drops.dropped && drops.worst === 0,
  `${drops.landed} of ${drops.dropped}, ${drops.worst.toFixed(2)}px in at worst`);

// --- 5. 불러오기 finds the same field ---
const resumed = await run(`
  s.writeSave();
  const saved = JSON.parse(localStorage.getItem(window.config.STORAGE.save));
  const before = s.terrain.rocks.map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.reach)]).join('|');
  window.__before = before;
  s.scene.restart({ save: saved });
  return { seed: saved.terrainSeed, sceneSeed: s.terrainSeed };
`);
await sleep(1500);
const after = await run(`
  return { same: s.terrain.rocks.map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.reach)]).join('|') === window.__before,
           seed: s.terrainSeed };
`);
check('the save keeps the field’s seed', resumed.seed === resumed.sceneSeed, `${resumed.seed}`);
check('and a resumed run lays the same rocks', after.same && after.seed === resumed.seed);
const fresh = await run(`
  s.scene.restart({ save: null });
  return 1;
`);
await sleep(1500);
const other = await run(`
  return { differs: s.terrain.rocks.map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.reach)]).join('|') !== window.__before };
`);
check('a new run lays a field of its own', fresh === 1 && other.differs);

// --- 6. off for every other suite ---
await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook.identifier });
await cdp.send('Page.reload', {});
await sleep(4500);
const off = await run(`return { terrain: s.terrain === null, enabled: window.config.TERRAIN.enabled };`);
check('without __terrainOn the harness runs with no rocks', off.terrain && off.enabled === false);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
