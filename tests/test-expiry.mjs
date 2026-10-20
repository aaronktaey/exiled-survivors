import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

const cdp = await connect(9333);
const SP = process.argv[2];
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
const run = (body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);

await cdp.send('Page.reload', {});
await sleep(4000);

const DEF = `'power'`;

// --- 1. no cap any more ---
const uncapped = await run(`
  for (const d of [...s.combat.runeDrops.getChildren()]) d.collect();
  let placed = 0;
  for (let i = 0; i < 80; i++) {
    const d = s.combat.runeDrops.get();
    if (!d) break;
    d.drop(3000 + (i % 20) * 25, 3000 + Math.floor(i / 20) * 25, ${DEF});
    placed++;
  }
  const active = s.combat.runeDrops.countActive(true);
  for (const d of [...s.combat.runeDrops.getChildren()]) d.collect();
  return { placed, active, maxSize: s.combat.runeDrops.maxSize };
`);
check('ground cap removed', uncapped.placed === 80 && uncapped.active === 80,
  `placed=${uncapped.placed} active=${uncapped.active} maxSize=${uncapped.maxSize}`);

// --- 2. lifespan is 60s, and gems are exempt ---
const fresh = await run(`
  const d = s.combat.runeDrops.get();
  d.drop(s.player.x + 400, s.player.y, ${DEF});
  window.__drop = d;
  const g = s.combat.gems.get();
  g.drop(s.player.x + 420, s.player.y, 1, s.player);
  window.__gem = g;
  return { life: Math.round(d.timeLeftMs), gemHasTimer: 'timeLeftMs' in g };
`);
check('a 룬 on the ground starts with a 60s life', fresh.life === 60000, `${fresh.life}ms`);
check('xp gems have no expiry', fresh.gemHasTimer === false);

// --- 3. no blink while there is plenty of time left ---
const early = await run(`
  const d = window.__drop;
  let glowOnFrames = 0;
  for (let i = 0; i < 60; i++) { d.update(0, 16); if (d.glow.visible) glowOnFrames++; }
  return { left: Math.round(d.timeLeftMs), glowOnFrames };
`);
check('halo stays off outside the warning window', early.glowOnFrames === 0,
  `glow frames=${early.glowOnFrames} at ${Math.round(early.left / 1000)}s left`);

// --- 4. blink starts inside the last 10s, and speeds up ---
const blink = await run(`
  const d = window.__drop;
  // Count halo on/off transitions over one second of simulated time at two
  // points in the warning window.
  const sample = (atLeft) => {
    d.blinkPhase = 0;
    let flips = 0, prev = d.glow.visible;
    for (let i = 0; i < 100; i++) {         // 100 x 10ms = 1s
      d.remainingMs = atLeft;               // pin the clock for this sample
      d.update(0, 10);
      if (d.glow.visible !== prev) { flips++; prev = d.glow.visible; }
    }
    return flips;
  };
  const atNineSec = sample(9000);
  const atFiveSec = sample(5000);
  const atOneSec  = sample(1000);
  return { atNineSec, atFiveSec, atOneSec };
`);
console.log('blink flips per second:', JSON.stringify(blink));
check('halo blinks inside the warning window', blink.atNineSec > 0, `${blink.atNineSec} flips/s at 9s left`);
check('blink speeds up as time runs out',
  blink.atFiveSec > blink.atNineSec && blink.atOneSec > blink.atFiveSec,
  `9s=${blink.atNineSec} → 5s=${blink.atFiveSec} → 1s=${blink.atOneSec} flips/s`);

// --- 5. the halo is the drop's own colour ---
const colour = await run(`
  const d = window.__drop;
  return { glow: d.glow.fillColor, orb: window.config.RUNES.power.color };
`);
check('halo is lit in the 룬’s own colour', colour.glow === colour.orb,
  `glow=#${colour.glow.toString(16).toUpperCase()}`);

await run(`
  const d = window.__drop;
  d.remainingMs = 4000;
  d.blinkPhase = 0;
  for (let i = 0; i < 40 && !d.glow.visible; i++) { d.remainingMs = 4000; d.update(0, 10); }
  return { visible: d.glow.visible, left: Math.round(d.remainingMs) };
`);
await shot('expiry-01-blinking');

// --- 6. it actually disappears when the timer runs out ---
const gone = await run(`
  const d = window.__drop;
  d.drop(s.player.x + 400, s.player.y, ${DEF});
  const wasActive = d.active;
  d.remainingMs = 200;
  for (let i = 0; i < 30; i++) d.update(0, 16);
  return {
    wasActive, active: d.active, visible: d.visible,
    plate: d.nameplate.plate.visible, label: d.nameplate.label.visible, glow: d.glow.visible,
    gemStillThere: window.__gem.active,
  };
`);
check('drop vanishes at the end of its life',
  gone.wasActive === true && gone.active === false &&
  gone.plate === false && gone.label === false && gone.glow === false,
  `wasActive=${gone.wasActive} -> active=${gone.active} plate=${gone.plate} label=${gone.label} glow=${gone.glow}`);
check('the xp gem beside it is untouched', gone.gemStillThere === true);

// --- 7. an expired slot gets reused by the next drop ---
const reused = await run(`
  const before = s.combat.runeDrops.getLength();
  const d = s.combat.runeDrops.get();
  d.drop(s.player.x + 400, s.player.y, ${DEF});
  const after = s.combat.runeDrops.getLength();
  const life = Math.round(d.timeLeftMs);
  d.collect();
  return { before, after, life };
`);
check('an expired drop is recycled, not leaked', reused.after === reused.before,
  `pool ${reused.before} -> ${reused.after}`);
check('a recycled drop gets a fresh 60s', reused.life === 60000, `${reused.life}ms`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
