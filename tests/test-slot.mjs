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

// --- 2. a fresh run opens on the reel ---
// #run turns the reel off so every other suite lands in play; on here.
await ev(`(() => {
  window.config.SLOT.atRunStart = true;
  window.game.scene.getScene('GameScene').scene.start('GameScene', { save: null, startSlot: true });
  return 1;
})()`);
await sleep(1500);
const opened = await ev(`(() => {
  const g = window.game.scene.getScene('GameScene');
  const s = window.game.scene.getScene('SlotScene');
  const droppable = window.config && Object.keys(window.config.SKILL_BASE)
    .filter((id) => id !== 'meleeStrike');
  return {
    active: window.game.scene.isActive('SlotScene'),
    choosing: g.choosing, physicsPaused: g.physics.world.isPaused,
    labels: s.payload.items.map((i) => i.label),
    icons: s.payload.items.every((i) => i.icon && s.textures.exists(i.icon)),
    owned: [...g.owned],
    spinning: s.reel.isSpinning,
    speed: s.reel.velocity,
    droppable,
  };
})()`);
console.log('opened:', JSON.stringify(opened));
check('a fresh run opens on the 슬롯머신, with the arena frozen',
  opened.active && opened.choosing === true && opened.physicsPaused === true);
check('the reel holds every drop skill, each with its icon',
  opened.labels.length === opened.droppable.length && opened.icons &&
    opened.labels.includes('낙뢰'),
  opened.labels.join(' / '));
check('and only the starting skill is in hand while it turns',
  JSON.stringify(opened.owned) === JSON.stringify(['meleeStrike']), opened.owned.join(' '));

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
const after = await run(`
  return { slot: window.game.scene.isActive('SlotScene'), choosing: s.choosing,
           paused: s.physics.world.isPaused, owned: [...s.owned],
           names: s.weapons.map((w) => w.definition.name) };
`);
console.log('after:', JSON.stringify(after));
check('the skill it stopped on is the one handed out',
  after.slot === false && after.owned.length === 2 &&
    after.names[1] === opened.labels[landed],
  `stopped on ${opened.labels[landed]}, got ${after.names.join(' + ')}`);
check('and the run picks up where it froze', after.choosing === false && after.paused === false);

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

// --- 5. 다시하기 spins again ---
await run(`s.player.invulnerableUntil = 0; s.player.setInvulnerable(false); s.player.takeDamage(1e9); return 1;`);
await sleep(1500);
await ev(`(() => { const s = window.game.scene.getScene('GameOverScene'); s.payload.onRestart(); return 1; })()`);
await sleep(1500);
const again = await ev(`(() => window.game.scene.isActive('SlotScene'))()`);
check('다시하기 opens on the reel too', again === true);
await slot(`s.press(); return 1;`);
await sleep(stopMs + 1400);

// --- 6. 화염구 bursts where it lands ---
const burst = await run(`
  s.choosing = true;
  s.spawner.clear();
  const crit = window.config.PLAYER.critChance;
  window.config.PLAYER.critChance = 0;
  const r = window.config.FIREBALL.blastRadius;
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
  const spec = fire.specFor({ damage: 1, projectileSpeed: 1, range: 1 });
  return { blast: spec.blastRadius, want: window.config.FIREBALL.blastRadius };
})()`);
check('and every 화염구 shot carries it', shotBlast.blast === shotBlast.want && shotBlast.want > 0,
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
  const ctx = (dmg) => ({ origin: p, enemies: s.spawner.group, damage: dmg, cooldownMs: 1,
    range: st.range, projectileSpeed: 0, chainCount: 0, pierceCount: 0, orbCount: 0,
    orbitSpeed: 0, hit: s.combat.hit });
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

  // Kills with a certain recast chain on; kills with it off strike once.
  const chance = window.config.THUNDER.recastChance;
  window.config.THUNDER.recastChance = 1;
  ring(6, st.range * 0.5);
  w.sinceCastMs = 99999;
  w.update(16, ctx(1e9));
  const chained = w.lastStrikes;
  s.spawner.clear();
  window.config.THUNDER.recastChance = 0;
  ring(6, st.range * 0.5);
  w.sinceCastMs = 99999;
  w.update(16, ctx(1e9));
  const single = w.lastStrikes;
  window.config.THUNDER.recastChance = chance;
  window.config.PLAYER.critChance = crit;
  s.spawner.clear();
  s.choosing = false;
  return { tags: w.definition.tags, base, stat: { damage: st.damage, attackSpeed: st.attackSpeed },
           hurt, outsideHurt, chained, single, chance };
`);
console.log('낙뢰:', JSON.stringify(thunder));
check('낙뢰 is 오라 · 주문 · 번개',
  JSON.stringify(thunder.tags) === JSON.stringify(['오라', '주문', '번개']), thunder.tags.join(' · '));
check('it starts on its configured stat line',
  thunder.stat.damage === thunder.base.damage && thunder.stat.attackSpeed === thunder.base.attackSpeed,
  `${thunder.stat.damage} damage, every ${(1000 / thunder.stat.attackSpeed).toFixed(0)}ms`);
check('one cast strikes one enemy within reach, and nothing beyond it',
  thunder.hurt === 1 && thunder.outsideHurt === false, `${thunder.hurt} struck`);
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
