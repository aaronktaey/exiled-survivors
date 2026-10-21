import { connect, sleep } from './cdp-lib.mjs';

const cdp = await connect(9333);
const results = [];
const check = (n, p, d = '') => {
  results.push({ n, p });
  console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
};
const run = (body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);
const drain = async () => {
  for (let i = 0; i < 8; i++) {
    const open = await cdp.evaluate(`({ open: window.game.scene.isActive('UpgradeScene') })`);
    if (!open.open) return;
    await sleep(350);
    await cdp.tap('Space', 32, ' ');
    await sleep(450);
  }
};

await cdp.send('Page.reload', {});
await sleep(4000);
await drain();

// --- 1. every clip is loaded ---
const cached = await run(`
  const keys = ['sfx-meleeStrike-0', 'sfx-meleeStrike-1', 'sfx-meleeStrike-2', 'sfx-chainLightning-0'];
  return {
    present: keys.filter(k => s.cache.audio.exists(k)),
    missing: keys.filter(k => !s.cache.audio.exists(k)),
    durations: keys.filter(k => s.cache.audio.exists(k))
      .map(k => Number((s.cache.audio.get(k).duration ?? 0).toFixed(2))),
  };
`);
console.log('cache:', JSON.stringify(cached));
check('all four clips are loaded', cached.missing.length === 0, `missing: ${cached.missing}`);
check('they decoded to real audio', cached.durations.every(d => d > 0),
  cached.durations.map(d => `${d}s`).join(' / '));

// --- 2. a swing is heard, and it is one of the 타격 variants ---
const swings = await run(`
  s.choosing = true;
  s.spawner.clear();
  const p = s.player;
  const w = s.weapons.find(w => w.definition.id === 'meleeStrike');
  const st = s.progression.statsFor('meleeStrike');
  const e = s.spawner.group.get(p.x + 20, p.y);
  e.spawn(p.x + 20, p.y, p);
  e.hp = 1000000;
  e.target = undefined;
  e.body.stop();

  window.__played = [];
  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  mgr.play = (key, cfg) => { window.__played.push({ key, volume: cfg && cfg.volume }); return orig(key, cfg); };

  const ctx = { origin: p, enemies: s.spawner.group, damage: 1, cooldownMs: 1,
    range: st.range, projectileSpeed: 0, chainCount: 0, pierceCount: 0, orbCount: 0,
    hit: s.combat.hit };
  // The clock has to move, or the gap limiter swallows the repeats.
  for (let i = 0; i < 40; i++) {
    s.time.now += 200;
    w.sinceSwingMs = 99999;
    w.update(16, ctx);
  }

  const played = window.__played.slice();
  mgr.play = orig;
  s.spawner.clear();
  s.choosing = false;
  return {
    count: played.length,
    keys: played.map(p => p.key),
    volume: played[0] && played[0].volume,
  };
`);
const variants = [...new Set(swings.keys)].sort();
let repeats = 0;
swings.keys.forEach((key, i) => {
  if (i > 0 && key === swings.keys[i - 1]) {
    repeats++;
  }
});
console.log('swings:', JSON.stringify({ count: swings.count, variants, repeats }));
check('every swing is heard', swings.count === 40, `${swings.count} of 40 swings played a clip`);
check('a swing only ever plays a 타격 clip',
  swings.keys.every(k => k.startsWith('sfx-meleeStrike-')), variants.join(' '));
check('all three recordings get used', variants.length === 3, variants.join(' '));
check('the same recording never plays twice in a row', repeats === 0,
  `${repeats} immediate repeats in 40 swings`);
check('at the configured volume', swings.volume === 0.45, `volume=${swings.volume}`);

// --- 3. the mix is random rather than a fixed rotation ---
// A fixed rotation would always follow a given clip with the same next one.
// Counting permutations instead was a coin flip at this sample size.
const order = swings.keys.map((k) => k.slice(-1)).join('');
const successors = new Map();
for (let i = 1; i < order.length; i++) {
  const from = order[i - 1];
  successors.set(from, (successors.get(from) ?? new Set()).add(order[i]));
}
const branching = [...successors.values()].filter((set) => set.size > 1).length;
check('the order is not a fixed rotation', branching >= 2,
  `${order.slice(0, 24)}… (${branching} of ${successors.size} clips lead to more than one)`);

// --- 4. 연쇄번개 has its own clip ---
const chain = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.onSkillCollected('chainLightning');
  const p = s.player;
  const w = s.weapons.find(w => w.definition.id === 'chainLightning');
  const st = s.progression.statsFor('chainLightning');
  const e = s.spawner.group.get(p.x + 60, p.y);
  e.spawn(p.x + 60, p.y, p);
  e.hp = 1000000;
  e.target = undefined;
  e.body.stop();

  window.__played = [];
  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  mgr.play = (key, cfg) => { window.__played.push(key); return orig(key, cfg); };

  const ctx = { origin: p, enemies: s.spawner.group, damage: 1, cooldownMs: 1,
    range: st.range, projectileSpeed: 0, chainCount: st.chainCount, pierceCount: 0, orbCount: 0,
    hit: s.combat.hit };
  for (let i = 0; i < 5; i++) { s.time.now += 200; w.sinceCastMs = 99999; w.update(16, ctx); }

  const played = window.__played.slice();
  mgr.play = orig;
  s.spawner.clear();
  s.choosing = false;
  return { played };
`);
console.log('chain:', JSON.stringify(chain));
check('a cast plays the 연쇄번개 clip',
  chain.played.length === 5 && chain.played.every(k => k === 'sfx-chainLightning-0'),
  `${chain.played.length} casts, keys ${[...new Set(chain.played)]}`);

// --- 5. a very fast weapon cannot stack copies ---
const burst = await run(`
  s.choosing = true;
  s.spawner.clear();
  const p = s.player;
  const w = s.weapons.find(w => w.definition.id === 'meleeStrike');
  const st = s.progression.statsFor('meleeStrike');
  const e = s.spawner.group.get(p.x + 20, p.y);
  e.spawn(p.x + 20, p.y, p);
  e.hp = 1000000;
  e.target = undefined;
  e.body.stop();

  window.__played = [];
  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  mgr.play = (key, cfg) => { window.__played.push(key); return orig(key, cfg); };

  const ctx = { origin: p, enemies: s.spawner.group, damage: 1, cooldownMs: 1,
    range: st.range, projectileSpeed: 0, chainCount: 0, pierceCount: 0, orbCount: 0,
    hit: s.combat.hit };
  // Past any gap left over from the sections above, then twenty swings
  // inside one instant of game time.
  s.time.now += 100000;
  for (let i = 0; i < 20; i++) { w.sinceSwingMs = 99999; w.update(1, ctx); }

  const played = window.__played.slice();
  mgr.play = orig;
  s.spawner.clear();
  s.choosing = false;
  return { count: played.length };
`);
check('twenty swings in one instant are heard once', burst.count === 1,
  `${burst.count} clips for 20 swings inside the 70ms gap`);

// --- 6. the newer clips are all there too ---
const newClips = await run(`
  const keys = ['sfx-fireball-0', 'sfx-iceSpear-0', 'sfx-voidOrb-0', 'sfx-boss-alert'];
  return {
    missing: keys.filter(k => !s.cache.audio.exists(k)),
    durations: keys.map(k => ({
      key: k,
      d: s.cache.audio.exists(k) ? Number((s.cache.audio.get(k).duration ?? 0).toFixed(2)) : 0,
    })),
  };
`);
console.log('new clips:', JSON.stringify(newClips.durations));
check('화염구 · 얼음창 · 공허구체 · 우두머리 all have a clip loaded',
  newClips.missing.length === 0, `missing: ${newClips.missing}`);
check('and every one of them decoded',
  newClips.durations.every(c => c.d > 0),
  newClips.durations.map(c => `${c.key.replace('sfx-', '')} ${c.d}s`).join(' / '));

// --- 7. the two new projectiles are heard when they fire ---
for (const skill of ['fireball', 'iceSpear']) {
  const cast = await run(`
    s.choosing = true;
    s.spawner.clear();
    s.onSkillCollected('${skill}');
    const w = s.weapons.find(w => w.definition.id === '${skill}');
    const st = s.progression.statsFor('${skill}');
    const p = s.player;
    const e = s.spawner.group.get(p.x + 60, p.y);
    e.spawn(p.x + 60, p.y, p);
    e.hp = 1000000;
    e.target = undefined;
    e.body.stop();

    window.__played = [];
    const mgr = s.sound;
    const orig = mgr.play.bind(mgr);
    mgr.play = (key, cfg) => { window.__played.push({ key, volume: cfg && cfg.volume }); return orig(key, cfg); };

    const ctx = { origin: p, enemies: s.spawner.group, damage: 1, cooldownMs: 1,
      range: st.range, projectileSpeed: st.projectileSpeed, chainCount: 0,
      pierceCount: st.pierceCount ?? 0, orbCount: 0, hit: s.combat.hit };
    for (let i = 0; i < 5; i++) { s.time.now += 400; w.sinceShotMs = 99999; w.update(16, ctx); }

    const played = window.__played.slice();
    mgr.play = orig;
    s.spawner.clear();
    s.choosing = false;
    return { keys: played.map(x => x.key), volume: played[0] && played[0].volume };
  `);
  console.log(`${skill}:`, JSON.stringify(cast));
  check(`every ${skill} shot is heard`,
    cast.keys.length === 5 && cast.keys.every(k => k === `sfx-${skill}-0`),
    `${cast.keys.length} shots, keys ${[...new Set(cast.keys)]}`);
  check(`${skill} plays at its configured volume`, cast.volume === 0.4, `volume=${cast.volume}`);
}

// --- 8. the orbs touch something constantly, and are held well apart ---
const orbs = await run(`
  s.choosing = true;
  s.spawner.clear();
  // Granted directly: the suite already holds three 보조 스킬 by here, and
  // past them a pickup is a potion (0.84).
  s.acquire('voidOrb');
  const w = s.weapons.find(w => w.definition.id === 'voidOrb');
  const st = s.progression.statsFor('voidOrb');
  const p = s.player;
  // A ring of targets right under the orbit, so an orb is always on one.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = p.x + Math.cos(a) * st.range;
    const y = p.y + Math.sin(a) * st.range;
    const e = s.spawner.group.get(x, y);
    e.spawn(x, y, p);
    e.hp = 1000000;
    e.target = undefined;
    e.body.stop();
    e.setPosition(x, y);
  }

  window.__played = [];
  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  mgr.play = (key, cfg) => { window.__played.push(key); return orig(key, cfg); };

  const ctx = { origin: p, enemies: s.spawner.group, damage: 0, cooldownMs: 1,
    range: st.range, projectileSpeed: 0, orbitSpeed: st.orbitSpeed, chainCount: 0,
    pierceCount: 0, orbCount: st.orbCount, hit: () => {} };
  // Three seconds of orbit, 50ms at a time. Every step touches a target.
  const STEPS = 60;
  for (let i = 0; i < STEPS; i++) {
    s.time.now += 50;
    w.update(50, ctx);
  }

  const played = window.__played.slice();
  mgr.play = orig;
  s.spawner.clear();
  s.choosing = false;
  return { steps: STEPS, keys: played };
`);
console.log('orb sweeps:', JSON.stringify({ count: orbs.keys.length, keys: [...new Set(orbs.keys)] }));
check('a sweep is heard at all', orbs.keys.length > 0 && orbs.keys.every(k => k === 'sfx-voidOrb-0'),
  `${orbs.keys.length} clips, keys ${[...new Set(orbs.keys)]}`);
check('but the orbit never drones — its own 600ms gap holds',
  orbs.keys.length <= 6,
  `${orbs.keys.length} clips across 3s of contact (${orbs.steps} frames)`);

// --- 9. the 우두머리 horn ---
const horn = await run(`
  s.spawner.clear();
  window.__played = [];
  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  mgr.play = (key, cfg) => { window.__played.push({ key, volume: cfg && cfg.volume }); return orig(key, cfg); };
  s.spawner.spawnBoss();
  const played = window.__played.slice();
  mgr.play = orig;
  s.spawner.clear();
  return { played };
`);
console.log('horn:', JSON.stringify(horn));
check('a 우두머리 arrives on a horn',
  horn.played.some(x => x.key === 'sfx-boss-alert'), horn.played.map(x => x.key).join(' '));
check('loud enough to notice',
  horn.played.find(x => x.key === 'sfx-boss-alert')?.volume === 0.6,
  `volume=${horn.played.find(x => x.key === 'sfx-boss-alert')?.volume}`);


console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
