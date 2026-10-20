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
const fkey = async (code, vk) => {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(250);
};

await cdp.send('Page.reload', {});
await sleep(4000);
// A slow load (a cold module cache after a long run of suites) is not a failure.
for (let i = 0; i < 60; i++) {
  if (await cdp.evaluate(`(() => !!window.game?.scene?.isActive('GameScene'))()`)) break;
  await sleep(250);
}

// --- 1. enemies are pooled, not destroyed ---
const pooling = await run(`
  s.spawner.clear();
  const poolBefore = s.spawner.pooled;
  s.spawner.spawnBurst(50);
  const poolAfterSpawn = s.spawner.pooled;
  const aliveAfterSpawn = s.spawner.alive;
  for (const c of [...s.spawner.group.getChildren()]) if (c.active) s.combat.hit(c, 9999);
  const aliveAfterKill = s.spawner.alive;
  const poolAfterKill = s.spawner.pooled;
  s.spawner.spawnBurst(50);
  const poolAfterRespawn = s.spawner.pooled;
  return { poolBefore, poolAfterSpawn, aliveAfterSpawn, aliveAfterKill, poolAfterKill, poolAfterRespawn };
`);
console.log('pooling:', JSON.stringify(pooling));
check('killing an enemy keeps it in the pool',
  pooling.aliveAfterKill === 0 && pooling.poolAfterKill === pooling.poolAfterSpawn,
  `alive ${pooling.aliveAfterSpawn} -> ${pooling.aliveAfterKill}, pool held at ${pooling.poolAfterKill}`);
check('respawning reuses the pool instead of growing it',
  pooling.poolAfterRespawn === pooling.poolAfterKill,
  `pool ${pooling.poolAfterKill} -> ${pooling.poolAfterRespawn} after 50 more spawns`);

// --- 2. no enemy-vs-enemy collider; separation instead ---
const colliders = await run(`
  const list = s.physics.world.colliders.getActive();
  const enemyGroup = s.spawner.group;
  const enemyVsEnemy = list.filter(c => c.object1 === enemyGroup && c.object2 === enemyGroup && !c.overlapOnly);
  return { total: list.length, enemyVsEnemy: enemyVsEnemy.length, hasSeparation: !!s.separation };
`);
check('enemy-vs-enemy collider removed', colliders.enemyVsEnemy === 0, `found ${colliders.enemyVsEnemy}`);
check('separation system is in place', colliders.hasSeparation === true);

// --- 3. separation actually pushes a stack apart ---
const separated = await run(`
  s.spawner.clear();
  const spread = () => {
    const xs = s.spawner.group.getChildren().filter(e => e.active).map(e => e.x);
    const ys = s.spawner.group.getChildren().filter(e => e.active).map(e => e.y);
    let worst = Infinity;
    for (let i = 0; i < xs.length; i++)
      for (let j = i + 1; j < xs.length; j++)
        worst = Math.min(worst, Math.hypot(xs[i] - xs[j], ys[i] - ys[j]));
    return worst;
  };
  // Pile 20 enemies onto almost the same spot.
  for (let i = 0; i < 20; i++) {
    const e = s.spawner.group.get(600, 600);
    e.spawn(600 + (i % 3) * 0.5, 600 + (i % 2) * 0.5, s.player);
  }
  const before = spread();
  for (let i = 0; i < 120; i++) s.separation.update();
  const after = spread();
  s.spawner.clear();
  return { before: Number(before.toFixed(2)), after: Number(after.toFixed(2)) };
`);
console.log('separation:', JSON.stringify(separated));
check('separation spreads a stack out', separated.after > separated.before && separated.after > 5,
  `closest pair ${separated.before}px -> ${separated.after}px`);

// --- 4. delta is clamped at 50ms ---
const clamp = await run(`
  s.spawner.clear();
  const before = s.elapsedMs;
  s.update(0, 5000);          // one absurd 5s frame
  const jump = s.elapsedMs - before;
  return { jump: Math.round(jump) };
`);
check('a 5000ms frame advances the clock by at most 50ms', clamp.jump <= 50, `advanced ${clamp.jump}ms`);

// --- 5. damage numbers are pooled ---
const dmg = await run(`
  s.damageNumbers.reset();
  const poolSize = s.damageNumbers.pool.length;
  for (let i = 0; i < 500; i++) s.damageNumbers.spawn(100 + i, 100, 7);
  const afterBurst = s.damageNumbers.pool.length;
  const active = s.damageNumbers.activeCount;
  return { poolSize, afterBurst, active };
`);
console.log('damage numbers:', JSON.stringify(dmg));
check('damage numbers come from a fixed pool',
  dmg.afterBurst === dmg.poolSize && dmg.active <= dmg.poolSize,
  `500 spawns kept the pool at ${dmg.afterBurst} (active ${dmg.active})`);

const dmgFade = await run(`
  s.damageNumbers.reset();
  s.damageNumbers.spawn(500, 500, 3);
  const before = s.damageNumbers.activeCount;
  for (let i = 0; i < 100; i++) s.damageNumbers.update(16);
  return { before, after: s.damageNumbers.activeCount };
`);
check('damage numbers expire and free their slot', dmgFade.before === 1 && dmgFade.after === 0,
  `${dmgFade.before} -> ${dmgFade.after}`);

// --- 6. debug overlay: F1 toggles, keys act ---
const hiddenAtStart = await run(`return { shown: s.debug.visible };`);
check('debug overlay hidden by default', hiddenAtStart.shown === false);

await fkey('F1', 112);
const opened = await run(`return { shown: s.debug.visible, text: s.debug.label.text };`);
check('F1 opens the overlay', opened.shown === true);
check('overlay reports fps, frame time and counts',
  /FPS/.test(opened.text) && /frame/.test(opened.text) && /enemies/.test(opened.text) &&
  /projectiles/.test(opened.text) && /gems/.test(opened.text),
  opened.text.split('\\n')[0]);

await run(`s.spawner.clear(); return 1;`);
await fkey('F2', 113);
const stressed = await run(`return { alive: s.spawner.alive };`);
check('F2 stress-spawns 100 enemies', stressed.alive >= 100 && stressed.alive <= 104,
  `alive=${stressed.alive} (100 from F2, plus any normal spawn in the gap)`);
await shot('perf-01-debug-overlay');

await fkey('F3', 114);
const cleared = await run(`return { alive: s.spawner.alive };`);
check('F3 clears the field', cleared.alive <= 1,
  `alive=${cleared.alive} (0, or 1 from a normal spawn in the gap)`);

const lvBefore = await run(`return { lv: s.progression.level, popup: window.game.scene.isActive('UpgradeScene') };`);
await fkey('F4', 115);
const lvAfter = await run(`return { lv: s.progression.level, popup: window.game.scene.isActive('UpgradeScene') };`);
check('F4 grants a level', lvAfter.lv === lvBefore.lv + 1 && lvAfter.popup === true,
  `lv ${lvBefore.lv} -> ${lvAfter.lv}, popup=${lvAfter.popup}`);
// Clear the popup it opened.
await cdp.tap('Space', 32, ' ');
await sleep(500);

await fkey('F5', 116);
const dropped = await run(`return { drops: s.combat.runeDrops.countActive(true) };`);
check('F5 drops a 룬 (and a 룬 끌)', dropped.drops >= 1, `drops=${dropped.drops}`);

await fkey('F6', 117);
const god = await run(`
  const hpBefore = s.player.hp;
  s.player.takeDamage(5);
  return { hpBefore, hpAfter: s.player.hp };
`);
check('F6 makes the player invulnerable', god.hpAfter === god.hpBefore, `hp ${god.hpBefore} -> ${god.hpAfter}`);
await fkey('F6', 117);
const mortal = await run(`
  const hpBefore = s.player.hp;
  s.player.invulnerableUntil = 0;
  s.player.takeDamage(5);
  return { hpBefore, hpAfter: s.player.hp };
`);
check('F6 again restores damage', mortal.hpAfter < mortal.hpBefore, `hp ${mortal.hpBefore} -> ${mortal.hpAfter}`);

// --- the deployed rule: F1 is an admin account's, and a run it touched is on no board ---
const restart = async () => {
  await run(`s.scene.restart({ save: null }); return 1;`);
  await sleep(1500);
};
await cdp.evaluate(`(() => { window.config.DEBUG.gatedInDev = true; window.account.user = null; return 1; })()`);
await restart();
await fkey('F1', 112);
const locked = await run(`return { shown: s.debug.visible };`);
check('signed out (or not an admin), F1 opens nothing', locked.shown === false, JSON.stringify(locked));

await cdp.evaluate(`(() => { window.account.user = { id: 'me', provider: 'google', name: 'me',
  rank: { name: '', emoji: '', flag: '' }, admin: true }; return 1; })()`);
await restart();
await fkey('F1', 112);
await fkey('F4', 115);
const adminOpened = await run(`return { shown: s.debug.visible, used: s.debug.used };`);
check('an account the server names as admin opens it', adminOpened.shown === true && adminOpened.used === true,
  JSON.stringify(adminOpened));

const died = async () => {
  const before = await cdp.evaluate(`(() => window.personal.runs.length)()`);
  await cdp.evaluate(`(() => { window.ranking.reset(); window.config.RANKING.promptOnDeath = true; return 1; })()`);
  await run(`s.stats.recordDamage(5000); s.player.setInvulnerable(false); s.player.invulnerableUntil = 0;
    s.player.takeDamage(1e9); return 1;`);
  await sleep(2200);
  const out = await cdp.evaluate(`(() => ({ asked: window.game.scene.isActive('RankEntryScene'),
    kept: window.personal.runs.length }))()`);
  await cdp.evaluate(`(() => { const g = window.game.scene;
    if (g.isActive('RankEntryScene')) g.stop('RankEntryScene');
    if (g.isActive('GameOverScene') || g.isPaused('GameOverScene')) g.stop('GameOverScene');
    window.config.RANKING.promptOnDeath = false; return 1; })()`);
  return { ...out, before };
};
const devDeath = await died();
check('a run F4 touched is not offered to the ranking, nor kept on 내 기록',
  devDeath.asked === false && devDeath.kept === devDeath.before, JSON.stringify(devDeath));
await restart();
const fairDeath = await died();
check('while the next one, played straight, is',
  fairDeath.asked === true && fairDeath.kept === fairDeath.before + 1, JSON.stringify(fairDeath));
await cdp.evaluate(`(() => { window.config.DEBUG.gatedInDev = false; window.account.user = null; return 1; })()`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
