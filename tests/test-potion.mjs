import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

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
const run = (body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);
const fkey = async (code, vk) => {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(300);
};
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
await sleep(3800);
await drain();

// A plain enemy at full health, and the player at full health, both read
// from the live config so hand-tuning balance.ts cannot fail the suite.
const CONFIG = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const Progression = Object.getPrototypeOf(s.progression).constructor;
  return { enemyHp: Progression.enemyHealth, playerHp: s.player.maxHp };
})()`);
const FULL = CONFIG.enemyHp;
const MAX = CONFIG.playerHp;
console.log('config:', JSON.stringify(CONFIG));


// --- 1. one kill in twenty leaves a potion ---
const rate = await run(`
  s.choosing = true;
  s.spawner.clear();
  let potions = 0;
  const orig = s.combat.dropPotionAt.bind(s.combat);
  s.combat.dropPotionAt = (x, y) => { potions++; };   // count, do not litter
  const KILLS = 10000;
  for (let round = 0; round < 50; round++) {
    s.spawner.spawnBurst(200);
    for (const child of [...s.spawner.group.getChildren()]) {
      if (child.active) s.combat.hit(child, 99999);
    }
  }
  s.combat.dropPotionAt = orig;
  s.combat.gems.getChildren().forEach(g => g.active && g.collect());
  s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  s.spawner.clear();
  s.choosing = false;
  return { kills: KILLS, potions, rate: potions / KILLS };
`);
console.log('drop rate:', JSON.stringify(rate));
const potionChance = await ev(`window.config.POTION.chance`);
check('potions drop at the rate balance.ts asks for',
  Math.abs(rate.rate - potionChance) < Math.max(0.004, potionChance * 0.35),
  `${(rate.rate * 100).toFixed(2)}% over ${rate.kills} kills, tuned to ${(potionChance * 100).toFixed(1)}%`),

// --- 2. what one is worth ---
// Measured away from the player and after the drop's pop has settled —
// mid-pop it is deliberately 60% of its size.
await run(`
  s.combat.potions.getChildren().forEach(x => x.active && x.collect());
  s.combat.dropPotionAt(s.player.x + 320, s.player.y);
  return 1;
`);
await sleep(350);
const healing = await run(`
  const far = s.combat.potions.getChildren().find(x => x.active);
  const out = { size: Math.round(far.displayWidth), want: window.config.POTION.size, tex: far.texture.key,
                life: Math.round(far.timeLeftMs), before: 10 };
  far.collect();
  s.player.hp = 10;
  s.combat.dropPotionAt(s.player.x, s.player.y);
  return out;
`);
console.log('potion:', JSON.stringify(healing));
check('it is drawn from its own texture at the configured size',
  healing.tex === 'tex-potion' && healing.size === healing.want, `${healing.tex} at ${healing.size}px (want ${healing.want})`);
check('it lies there for a minute like any other drop',
  healing.life > 59000 && healing.life <= 60000,
  `${(healing.life / 1000).toFixed(1)}s left of 60s, a moment after dropping`);
await shot('potion-01-dropped');

// Walking over it is a physics overlap, so let the world run a moment.
await sleep(700);
const picked = await run(`
  return { hp: s.player.hp, left: s.combat.potions.countActive(true),
           // A potion is a share of this survivor's own bar, 거대 and all.
           want: Math.max(1, Math.round(
             s.player.maxHp * window.config.POTION.healFraction)) };
`);
console.log('pickup:', JSON.stringify(picked));
const HEAL = picked.hp - healing.before;
check('walking over it heals, and takes the potion off the ground',
  HEAL > 0 && picked.left === 0, `hp ${healing.before} -> ${picked.hp} of ${MAX}`);
// What a potion is worth is tuned in balance.ts, so read it rather than
// carrying a copy of the fraction here.
check('it heals the share of the survivor’s own bar it is tuned to',
  HEAL === picked.want, `+${HEAL} of a ${MAX} bar, wanted +${picked.want}`);

// --- 3. the heal says so on screen ---
const floater = await run(`
  s.damageNumbers.reset();
  // One point short of full, so what it heals is exactly one point and does
  // not depend on how big the bar or the potion happen to be tuned to be.
  s.player.hp = s.player.maxHp - 1;
  s.combat.dropPotionAt(s.player.x, s.player.y);
  return { active: s.damageNumbers.activeCount };
`);
await sleep(600);
const shown = await run(`
  const live = s.damageNumbers.pool.filter(f => f.remainingMs > 0).map(f => ({ text: f.text.text, color: f.text.style.color }));
  return { live, hp: s.player.hp };
`);
console.log('floater:', JSON.stringify(shown));
check('the pickup floats a green +N rather than a hit number',
  shown.live.some((f) => f.text === '+1' && f.color === '#7ef0b0'),
  shown.live.map(f => `${f.text} ${f.color}`).join(' / '));

// --- 4. a full health bar leaves it on the ground ---
const full = await run(`
  s.combat.potions.getChildren().forEach(x => x.active && x.collect());
  s.player.hp = s.player.maxHp;
  s.combat.dropPotionAt(s.player.x, s.player.y);
  return { hp: s.player.hp, onGround: s.combat.potions.countActive(true) };
`);
await sleep(600);
const stillThere = await run(`return { hp: s.player.hp, onGround: s.combat.potions.countActive(true) };`);
check('a full health bar leaves the potion where it is',
  stillThere.hp === MAX && stillThere.onGround === 1,
  `hp=${stillThere.hp}, ${stillThere.onGround} still on the ground`);

// --- 5. it expires, with the same warning blink as a skill drop ---
const expiry = await run(`
  const potion = s.combat.potions.getChildren().find(x => x.active);
  // Outside the warning window: no halo.
  potion.remainingMs = 30000;
  potion.blinkPhase = 0;
  let early = 0;
  for (let i = 0; i < 60; i++) { potion.remainingMs = 30000; potion.update(0, 16); if (potion.glow.visible) early++; }
  // Inside it: the halo blinks.
  potion.remainingMs = 4000;
  potion.blinkPhase = 0;
  let flips = 0, prev = potion.glow.visible;
  for (let i = 0; i < 120; i++) {
    potion.remainingMs = 4000;
    potion.update(0, 16);
    if (potion.glow.visible !== prev) { flips++; prev = potion.glow.visible; }
  }
  const glowColour = potion.glow.fillColor;
  // And then it goes.
  potion.remainingMs = 50;
  potion.update(0, 100);
  return { early, flips, glowColour, gone: !potion.active, visible: potion.visible, halo: potion.glow.visible };
`);
console.log('expiry:', JSON.stringify(expiry));
check('no halo outside the last ten seconds', expiry.early === 0, `${expiry.early} lit frames`);
check('the halo blinks as it runs out', expiry.flips >= 4, `${expiry.flips} flips in ~2s`);
check('the potion vanishes when its time is up',
  expiry.gone === true && expiry.halo === false, `active=${!expiry.gone}`);

// --- 6. pooled like everything else ---
const pooling = await run(`
  s.combat.potions.getChildren().forEach(x => x.active && x.collect());
  const before = s.combat.potions.getLength();
  for (let i = 0; i < 12; i++) s.combat.dropPotionAt(s.player.x + 300 + i * 20, s.player.y + 300);
  const grown = s.combat.potions.getLength();
  s.combat.potions.getChildren().forEach(x => x.active && x.collect());
  for (let i = 0; i < 12; i++) s.combat.dropPotionAt(s.player.x + 300 + i * 20, s.player.y + 300);
  const after = s.combat.potions.getLength();
  s.combat.potions.getChildren().forEach(x => x.active && x.collect());
  return { before, grown, after };
`);
check('potions come back out of the pool', pooling.after === pooling.grown,
  `pool ${pooling.before} -> ${pooling.grown} -> ${pooling.after} across 24 drops`);

// --- 7. the debug key and the overlay ---
await fkey('F1', 112);
await fkey('F8', 119);
const debug = await run(`
  return { potions: s.combat.potions.countActive(true), text: s.debug.label.text };
`);
check('F8 drops a potion', debug.potions >= 1, `${debug.potions} on the ground`);
check('the overlay counts potions', /potions \d+/.test(debug.text),
  debug.text.split('\n').find(l => /potions/.test(l))?.trim());
await shot('potion-02-overlay');
await fkey('F1', 112);

// --- 8. a real run picks them up ---
await run(`
  s.combat.potions.getChildren().forEach(x => x.active && x.collect());
  s.spawner.clear();
  s.player.hp = 8;
  window.__heals = 0;
  const p = s.player;
  const orig = p.heal.bind(p);
  p.heal = (n) => { const got = orig(n); window.__heals += got; return got; };
  // Enough kills that a potion is all but certain at a 1% roll, right where
  // the player is standing: 6 rounds left a 1-in-40 chance of none at all.
  for (let round = 0; round < 14; round++) {
    s.spawner.spawnBurst(60);
    for (const child of [...s.spawner.group.getChildren()]) {
      if (child.active) { child.setPosition(p.x, p.y); s.combat.hit(child, 99999); }
    }
  }
  return { potions: s.combat.potions.countActive(true), hp: p.hp };
`);
await sleep(900);
const healed = await run(`
  return { healed: window.__heals, hp: s.player.hp, left: s.combat.potions.countActive(true) };
`);
console.log('live:', JSON.stringify(healed));
check('potions dropped by real kills heal the player',
  healed.healed > 0 && healed.hp > 8, `+${healed.healed} hp, now ${healed.hp}/${MAX}`);
await shot('potion-03-live');

// --- a potion is a share of the survivor's own bar: 거대 makes it heal more ---
const scaled = await run(`
  s.choosing = true;
  const p = s.player;
  const plain = p.maxHp;
  const hearty = window.gearBonusFor({ uid: 'h', id: 'rustySword', prefixes: [], suffixes: [{ id: 'giant', tier: 1 }, { id: 'giant', tier: 1 }] });
  p.applyGear(hearty);
  const big = p.maxHp;
  p.hp = 1;
  s.combat.potions.getChildren().forEach((d) => d.active && d.collect());
  s.combat.dropPotionAt(p.x, p.y);
  const potion = s.combat.potions.getChildren().find((d) => d.active);
  s.combat.onPotionTouch(p, potion);
  const healed = p.hp - 1;
  p.applyGear(s.mods.gear);
  p.hp = p.maxHp;
  s.choosing = false;
  return { plain, big, healed, want: Math.max(1, Math.round(big * window.config.POTION.healFraction)) };
`);
console.log('scaled potion:', JSON.stringify(scaled));
check('with 거대 stretching the bar, a potion heals that share of the stretched bar',
  scaled.big > scaled.plain && scaled.healed === scaled.want,
  `+${scaled.healed} of a ${scaled.big} bar (was ${scaled.plain}), wanted +${scaled.want}`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
