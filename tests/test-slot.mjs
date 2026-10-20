import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// The 슬롯머신 a fresh run opens on, 화염구's burst, and 낙뢰.

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
  console.log('shot:', n);
};
const ev = (expr) => cdp.evaluate(expr);
const run = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);
const slot = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('SlotScene'); ${body} })()`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(1200);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. the harness's #run lands in play, with no reel in the way ---
const plain = await ev(`(() => ({
  slot: window.game.scene.isActive('SlotScene'),
  choosing: window.game.scene.getScene('GameScene').choosing,
}))()`);
check('#run goes straight into play', plain.slot === false && plain.choosing === false,
  JSON.stringify(plain));

// --- 2. the reel, on its own ---
// A run no longer starts on it (the first skill is three cards now), so it
// is launched here the way anything that wants a spin would launch it.
await ev(`(() => {
  const g = window.game.scene.getScene('GameScene');
  g.choosing = true;
  window.__slotResult = null;
  const skills = Object.keys(window.config.SKILL_BASE);
  window.__slotLabels = skills;
  g.scene.launch('SlotScene', {
    title: 'probe',
    items: skills.map((id) => ({ label: id, icon: window.config.SKILL_ICONS[id]?.key })),
    onResult: (i) => { window.__slotResult = i; },
  });
  return 1;
})()`);
await sleep(800);
const opened = await ev(`(() => {
  const s = window.game.scene.getScene('SlotScene');
  return {
    active: window.game.scene.isActive('SlotScene'),
    labels: s.payload.items.map((i) => i.label),
    icons: s.payload.items.every((i) => i.icon && s.textures.exists(i.icon)),
    spinning: s.reel.isSpinning,
    speed: s.reel.velocity,
    configured: window.config.SLOT.spinRowsPerSec,
    sound: !!s.spin && s.spin.isPlaying,
  };
})()`);
console.log('opened:', JSON.stringify(opened));
check('the reel opens with every item it was handed, each with its icon',
  opened.active && opened.labels.length >= 5 && opened.icons, opened.labels.join(' / '));
check('it turns at the configured, readable speed',
  Math.abs(opened.speed - Math.max(opened.configured, 6)) < 1e-6 && opened.speed <= 8,
  `${opened.speed} rows/s`);
check('and its sound plays under it', opened.sound === true);

const turning = [];
for (let i = 0; i < 4; i++) {
  turning.push(await slot(`return s.reel.centred;`));
  await sleep(90);
}
check('it turns on its own until it is stopped',
  new Set(turning).size > 1 && opened.spinning === true, turning.join(' '));
await shot('slot-01-spinning');

// --- 3. 확정 slows it to a stop on one row, about a second later ---
await slot(`s.press(); return 1;`);
const t0 = Date.now();
const samples = [];
while (Date.now() - t0 < 1600) {
  const r = await slot(`return { v: s.reel.velocity, stopped: s.reel.isStopped, at: s.reel.centred };`);
  samples.push({ ...r, ms: Date.now() - t0 });
  await sleep(60);
}
console.log('stopping:', JSON.stringify(samples.map((x) => `${x.ms}:${x.v.toFixed(1)}`)));
const moving = samples.filter((x) => !x.stopped);
const firstStop = samples.find((x) => x.stopped);
check('it slows down from the moment 확정 is pressed, never speeding up',
  moving.length >= 3 && moving.every((x, i) => i === 0 || x.v <= moving[i - 1].v + 1e-6) &&
    moving[0].v <= opened.speed + 1e-6,
  `${moving.map((x) => x.v.toFixed(1)).join(' > ')}`);
const stopMs = await ev(`window.config.SLOT.stopMs`);
check('and comes to rest about the configured second later',
  firstStop && firstStop.ms >= stopMs * 0.8 && firstStop.ms <= stopMs + 400,
  `stopped at ~${firstStop?.ms}ms (configured ${stopMs}ms)`);
await shot('slot-02-stopped');
const landed = firstStop?.at;

// A second press is ignored rather than respun.
await slot(`s.press(); return 1;`);

await sleep(1200);
const result = await ev(`window.__slotResult`);
check('the row it stopped on is the one handed back',
  result === landed, `stopped on ${landed}, handed back ${result}`);

// The reel's own sound stops with it.
const quiet = await ev(`(() => {
  const s = window.game.scene.getScene('SlotScene');
  return { spin: s.spin === null || !s.spin.isPlaying };
})()`);
check('and the spin sound is gone once it has', quiet.spin === true);

// --- 3b. a level-up upgrades the main skill, not one picked up later ---
const levels = await run(`
  s.choosing = false;
  s.acquire('fireball');
  const seen = {};
  const was = s.queueChoice;
  s.queueChoice = (req) => { seen[req.skill] = (seen[req.skill] ?? 0) + 1; };
  for (let i = 0; i < 200; i++) s.onLevelUp(s.progression.level);
  s.queueChoice = was;
  return { seen, owned: [...s.owned] };
`);
console.log('level-ups:', JSON.stringify(levels));
check('a level-up offers the main skill every time, not the one picked up later',
  levels.owned.includes('fireball') && Object.keys(levels.seen).length === 1 &&
    (levels.seen[levels.owned[0]] ?? 0) === 200,
  Object.entries(levels.seen).map(([k, n]) => `${k} ${n}`).join(' / '));

// --- 4. its odds are the caller's ---
await ev(`(() => {
  const g = window.game.scene.getScene('GameScene');
  g.choosing = true;
  window.__slotResult = null;
  g.scene.launch('SlotScene', {
    title: 'probe', items: [{ label: 'a' }, { label: 'b' }, { label: 'c' }, { label: 'd' }],
    choose: () => 2, onResult: (i) => { window.__slotResult = i; },
  });
  return 1;
})()`);
await sleep(500);
await slot(`s.press(); return 1;`);
await sleep(stopMs + 1200);
const forced = await ev(`window.__slotResult`);
check('a caller that sets the result gets exactly that row', forced === 2, `landed on ${forced}`);
await run(`s.choosing = false; return 1;`);

// --- 6. 화염구 bursts where it lands ---
const burst = await run(`
  s.choosing = true;
  s.spawner.clear();
  const crit = window.config.PLAYER.critChance;
  window.config.PLAYER.critChance = 0;
  const r = window.config.SKILL_BASE.fireball.blastRadius;
  const p = s.player;
  const at = (dx, dy) => { const e = s.spawner.group.get(p.x + dx, p.y + dy);
    e.spawn(p.x + dx, p.y + dy, p, 'brute'); return e; };
  const first = at(200, 0);
  const near = at(200 + r * 0.6, 0);
  const far = at(200 + r * 1.6, 0);
  const full = near.hp;
  s.combat.blast(first.x, first.y, r, 50, first);
  const out = { r, near: full - near.hp, far: full - far.hp, first: full - first.hp };
  window.config.PLAYER.critChance = crit;
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('burst:', JSON.stringify(burst));
check('화염구 bursts: everything within its radius is hurt',
  burst.near === 50, `${burst.near} to one ${burst.r * 0.6}px away`);
check('but not outside it, nor the body it landed on twice',
  burst.far === 0 && burst.first === 0, `far ${burst.far}, first ${burst.first}`);
const shotBlast = await ev(`(() => {
  const g = window.game.scene.getScene('GameScene');
  const fire = g.weapons.find((w) => w.definition.id === 'fireball')
    ?? (g.acquire('fireball'), g.weapons.find((w) => w.definition.id === 'fireball'));
  // The burst is the skill's own stat since 0.83, handed in with the rest.
  const want = g.progression.statsFor('fireball').blastRadius;
  const spec = fire.specFor({ damage: 1, projectileSpeed: 1, range: 1, blastRadius: want });
  return { blast: spec.blastRadius, want, base: window.config.SKILL_BASE.fireball.blastRadius };
})()`);
check('and every 화염구 shot carries it — its own blastRadius stat', shotBlast.blast === shotBlast.want && shotBlast.want >= shotBlast.base && shotBlast.base > 0,
  `${shotBlast.blast}px`);

// --- 7. 낙뢰 ---
const thunder = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.acquire('thunderStrike');
  const w = s.weapons.find((x) => x.definition.id === 'thunderStrike');
  const st = s.progression.statsFor('thunderStrike');
  const base = window.config.SKILL_BASE.thunderStrike;
  const p = s.player;
  const crit = window.config.PLAYER.critChance;
  window.config.PLAYER.critChance = 0;
  // The recast chance is the skill's own stat since 0.83 (SKILL_BASE.thunderStrike.recastChance).
  let recast = st.recastChance;
  const ctx = (dmg) => ({ origin: p, enemies: s.spawner.group, damage: dmg, cooldownMs: 1,
    range: st.range, projectileSpeed: 0, chainCount: 0, pierceCount: 0, orbCount: 0,
    orbitSpeed: 0, recastChance: recast, hit: s.combat.hit });
  const ring = (n, dist) => [...Array(n)].map((_, i) => {
    const a = (i / n) * Math.PI * 2;
    const e = s.spawner.group.get(p.x, p.y);
    e.spawn(p.x + Math.cos(a) * dist, p.y + Math.sin(a) * dist, p, 'brute');
    return e;
  });

  // One strike, on one enemy in range; the one outside is left alone.
  const inside = ring(3, st.range * 0.5);
  const outside = ring(1, st.range * 2)[0];
  const full = inside[0].hp;
  w.sinceCastMs = 99999;
  w.update(16, ctx(70));
  const hurt = inside.filter((e) => e.hp < full).length;
  const outsideHurt = outside.hp < full;
  s.spawner.clear();

  // It falls on the nearest one in range, every time.
  let nearestHit = 0;
  for (let i = 0; i < 6; i++) {
    const far = ring(4, st.range * 0.8);
    const near = s.spawner.group.get(p.x, p.y);
    const a = Math.random() * Math.PI * 2;
    near.spawn(p.x + Math.cos(a) * st.range * 0.3, p.y + Math.sin(a) * st.range * 0.3, p, 'brute');
    w.sinceCastMs = 99999;
    w.update(16, ctx(70));
    if (near.hp < full && far.every((e) => e.hp === full)) nearestHit++;
    s.spawner.clear();
  }

  // Kills with a certain recast chain on; kills with it off strike once.
  const chance = st.recastChance;
  recast = 1;
  ring(6, st.range * 0.5);
  w.sinceCastMs = 99999;
  w.update(16, ctx(1e9));
  const chained = w.lastStrikes;
  s.spawner.clear();
  recast = 0;
  ring(6, st.range * 0.5);
  w.sinceCastMs = 99999;
  w.update(16, ctx(1e9));
  const single = w.lastStrikes;
  recast = chance;
  window.config.PLAYER.critChance = crit;
  s.spawner.clear();
  s.choosing = false;
  return { tags: w.definition.tags, base, stat: { damage: st.damage, attackSpeed: st.attackSpeed },
           hurt, outsideHurt, nearestHit, chained, single, chance };
`);
console.log('낙뢰:', JSON.stringify(thunder));
check('낙뢰 is 오라 · 주문 · 번개',
  JSON.stringify(thunder.tags) === JSON.stringify(['오라', '주문', '번개']), thunder.tags.join(' · '));
check('it starts on its configured stat line',
  thunder.stat.damage === thunder.base.damage && thunder.stat.attackSpeed === thunder.base.attackSpeed,
  `${thunder.stat.damage} damage, every ${(1000 / thunder.stat.attackSpeed).toFixed(0)}ms`);
check('one cast strikes one enemy within reach, and nothing beyond it',
  thunder.hurt === 1 && thunder.outsideHurt === false, `${thunder.hurt} struck`);
check('and that one is the nearest in range, every time', thunder.nearestHit === 6, `${thunder.nearestHit} of 6`);
check('a kill strikes again while the recast keeps winning',
  thunder.chained === 6, `${thunder.chained} strikes through six`);
check('and a kill that loses the roll ends the cast',
  thunder.single === 1, `${thunder.single} strike`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
