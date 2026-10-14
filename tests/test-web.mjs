import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 거미: a rare 속성 that leaves a web where the rare dies, slowing the
// survivor inside it for a minute; more 거미 on one rare, a wider web.

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

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(800);
await cdp.evaluate(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. the 속성 ---
const affix = await cdp.evaluate(`(() => {
  const c = window.config;
  return { spec: c.AFFIXES.spider, onEnemies: c.ENEMY_AFFIXES.some((a) => a.id === 'spider'),
           onWeapons: [...c.PREFIXES, ...c.SUFFIXES].some((a) => a.id === 'spider'), web: { ...c.WEB } };
})()`);
check('거미 is a 속성 a rare can be born with, and never one a weapon rolls',
  affix.spec?.name === '거미' && affix.onEnemies && !affix.onWeapons);

// --- 2. a rare with it leaves a web; two of it, a wider one ---
const laid = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.webs.clear();
  const spider = window.config.AFFIXES.spider;
  const kill = (stacks, dx) => {
    const e = s.spawner.spawnRare('grunt');
    e.setPosition(s.player.x + dx, s.player.y);
    e.affixes = Array.from({ length: stacks }, () => spider);
    s.combat.hit(e, 1e12);
  };
  const plain = s.spawner.spawnRare('grunt');
  plain.affixes = [window.config.AFFIXES.mighty];
  s.combat.hit(plain, 1e12);
  const afterPlain = s.webs.count;
  kill(1, 400);
  kill(2, -400);
  const webs = s.webs.all;
  s.choosing = false;
  return { afterPlain, webs };
`);
console.log('laid:', JSON.stringify(laid));
check('a rare without 거미 leaves no web', laid.afterPlain === 0);
check('one with it leaves a web of the configured size',
  laid.webs[0]?.radius === affix.web.radius && laid.webs[0]?.leftMs === affix.web.durationMs);
check('and two 거미 make it wider by the configured step',
  laid.webs[1]?.radius === affix.web.radius + affix.web.radiusPerExtra, `${laid.webs.map((w) => w.radius).join(' / ')}`);

// --- 3. inside one, the survivor is slowed; two do not slow more ---
const slowed = await run(`
  s.choosing = true;
  const p = s.player;
  p.setInvulnerable(true);
  p.webbed = false;
  const free = p.moveSpeed;
  const w = s.webs.all[0];
  p.setPosition(w.x, w.y);
  p.webbed = s.webs.update(0, p.x, p.y);
  const inside = p.moveSpeed;
  // A second web on the same spot.
  s.webs.spawn(w.x, w.y, 1);
  p.webbed = s.webs.update(0, p.x, p.y);
  const twice = p.moveSpeed;
  p.setPosition(w.x + w.radius + 50, w.y);
  p.webbed = s.webs.update(0, p.x, p.y);
  const out = p.moveSpeed;
  s.choosing = false;
  return { free, inside, twice, out };
`);
console.log('slowed:', JSON.stringify(slowed));
check('standing in a web takes its share off the survivor’s speed',
  Math.abs(slowed.inside - slowed.free * (1 - affix.web.slow)) < 1e-6, `${slowed.free} -> ${slowed.inside}`);
check('standing in two is no slower than in one', slowed.twice === slowed.inside);
check('and stepping out gives it all back', slowed.out === slowed.free);
await sleep(200);
await shot('web-01');

// --- 4. a web lasts its minute by the run's clock, then goes ---
const before = await run(`s.choosing = true; return s.webs.all.map((w) => w.leftMs);`);
await sleep(700);
const held = await run(`return s.webs.all.map((w) => w.leftMs);`);
check('it does not run down while the run is waiting on a choice',
  JSON.stringify(before) === JSON.stringify(held));
const gone = await run(`
  for (let t = 0; t < window.config.WEB.durationMs + 100; t += 50) s.webs.update(50, -9999, -9999);
  const n = s.webs.count;
  s.choosing = false;
  return n;
`);
check('after its minute it is gone', gone === 0, `${gone} left`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
