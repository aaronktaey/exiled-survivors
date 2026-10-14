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
const popup = () => cdp.evaluate(`(() => {
  const g = window.game;
  if (!g.scene.isActive('UpgradeScene')) return { open: false };
  const u = g.scene.getScene('UpgradeScene');
  return {
    open: true, title: u.payload.title, subtitle: u.payload.subtitle, skill: u.payload.skill,
    selected: u.selected, width: u.scale.width,
    cards: u.cards.map(c => ({ id: c.option.id, label: c.option.label, x: Math.round(c.x), w: Math.round(c.panel.width) })),
  };
})()`);
const drain = async () => {
  for (let i = 0; i < 8; i++) {
    const p = await popup();
    if (!p.open) return;
    await sleep(350);
    await cdp.tap('Space', 32, ' ');
    await sleep(450);
  }
};

// Say where to be rather than reload whatever the last suite left open —
// one that ends on the title screen would otherwise leave no run to read.
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(800);
await cdp.send('Page.reload', {});
await sleep(3800);
await drain();

// A plain enemy at full health, read from the live config so hand-tuning
// balance.ts cannot fail the suite.
const CONFIG = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const Progression = Object.getPrototypeOf(s.progression).constructor;
  return { enemyHp: Progression.enemyHealth, playerHp: s.player.hp };
})()`);
const FULL = CONFIG.enemyHp;
console.log('config:', JSON.stringify(CONFIG));


// --- 1. base stat lines ---
const base = await run(`
  const p = s.progression;
  return { melee: p.statsFor('meleeStrike'), fire: p.statsFor('fireball'),
           enemyHp: (() => { const e = s.spawner.group.get(0, 0); e.spawn(0, 0, s.player);
             const hp = e.hp; e.recycle(); return hp; })() };
`);
console.log('base stats:', JSON.stringify(base));
check('타격 and 화염구 start on the same damage', base.melee.damage === base.fire.damage,
  `타격 ${base.melee.damage} · 화염구 ${base.fire.damage}`);
check('화염구 hits for more than 타격 per cast', base.fire.damage >= base.melee.damage,
  `화염구 ${base.fire.damage} vs 타격 ${base.melee.damage}`);
// The exact numbers are tuning, so assert the shape of the rebalance: the
// swing is far shorter than the 88px it started at.
check('타격 reach is well under the old 88px', base.melee.range < 88,
  `range=${base.melee.range}px (was 88)`);
check('화염구 range is 100px', base.fire.range === 100, `range=${base.fire.range}px (was 520)`);
check('화염구 projectile speed halved to 230', base.fire.projectileSpeed === 230,
  `speed=${base.fire.projectileSpeed}px/s (was 460)`);

// --- 2. enemy base HP ---
const hp = await run(`
  s.spawner.clear();
  const e = s.spawner.group.get(600, 600);
  e.spawn(600, 600, s.player);
  const hp = e.hp;
  s.spawner.clear();
  return { hp };
`);
check('enemy base HP matches the config', hp.hp === FULL,
  `hp=${hp.hp} of a configured ${FULL} at enemyHpScale=1`);

// --- 3. a strike takes a plain enemy down in the expected number of swings ---
const trade = await run(`
  s.spawner.clear();
  // Every survivor crits some of the time now, which would land this trade
  // a hit early at random. Counting swings means counting ordinary ones.
  const crit = window.config.PLAYER.critChance;
  window.config.PLAYER.critChance = 0;

  const e = s.spawner.group.get(600, 600);
  e.spawn(600, 600, s.player);
  const dmg = s.damageOf('meleeStrike');
  const seen = [];
  for (let i = 0; i < 3; i++) { s.combat.hit(e, dmg); seen.push(e.active ? e.hp : 0); }

  window.config.PLAYER.critChance = crit;
  s.spawner.clear();
  return { dmg, seen };
`);
// Two hits at the tuned damage take a plain enemy down.
const toKill = Math.ceil(FULL / trade.dmg);
check('a plain enemy falls in the expected number of hits',
  trade.seen[toKill - 1] === 0 && (toKill < 2 || trade.seen[toKill - 2] > 0),
  `dmg=${trade.dmg}, hp after each hit: ${trade.seen.join(' -> ')}`);

// --- 4. melee reach really is 44px now ---
const reach = await run(`
  s.spawner.clear();
  const w = s.weapons.find(w => w.definition.id === 'meleeStrike');
  const p = s.player;
  const at = (dx) => { const e = s.spawner.group.get(p.x + dx, p.y); e.spawn(p.x + dx, p.y, p); return e; };
  const st = s.progression.statsFor('meleeStrike');
  // Placed relative to the configured reach, so tuning it does not break this.
  const near = at(Math.round(st.range * 0.6));
  const mid = at(Math.round(st.range * 1.4));
  const far = at(st.range * 4);
  w.update(5000, { origin: p, enemies: s.spawner.group, damage: 1,
    cooldownMs: 1, range: st.range, projectileSpeed: st.projectileSpeed, hit: s.combat.hit });
  const out = { near: near.hp, mid: mid.hp, far: far.hp, range: st.range };
  s.spawner.clear();
  return out;
`);
console.log('melee reach:', JSON.stringify(reach));
check('a swing lands inside the reach', reach.near < FULL,
  `hp=${reach.near}/${FULL} at ${Math.round(reach.range * 0.6)}px of ${reach.range}px reach`);
check('just past the reach is safe', reach.mid === FULL,
  `hp=${reach.mid}/${FULL} at ${Math.round(reach.range * 1.4)}px`);
check('well past the reach stays untouched', reach.far === FULL, `hp=${reach.far}/${FULL}`);

// --- 5. fireball flies at its own speed, and only as far as its range ---
const flight = await run(`
  s.onSkillCollected('fireball');
  const w = s.weapons.find(w => w.definition.id === 'fireball');
  const st = s.progression.statsFor('fireball');
  const bolt = w.projectiles.get();
  bolt.launch(400, 400, 0, { damage: st.damage, speed: st.projectileSpeed, range: st.range });
  const speed = Math.round(Math.hypot(bolt.body.velocity.x, bolt.body.velocity.y));
  let ms = 0;
  for (let i = 0; i < 100 && bolt.active; i++) { bolt.update(0, 50); ms += 50; }
  return { speed, lifeMs: ms, travelPx: Math.round((speed * ms) / 1000), active: bolt.active };
`);
console.log('flight:', JSON.stringify(flight));
check('bolt leaves at 230px/s', flight.speed === 230, `${flight.speed}px/s`);
check('bolt fizzles just past its 100px range', flight.travelPx >= 100 && flight.travelPx <= 160,
  `lived ${flight.lifeMs}ms = ~${flight.travelPx}px (100px range x 1.2 overshoot)`);

// --- 6. first fireball pickup grants the plain skill, no upgrade popup ---
const first = await run(`
  s.pendingChoices.length = 0;
  s.owned.delete('fireball');
  s.weapons = s.weapons.filter(w => w.definition.id !== 'fireball');
  s.progression.stats.delete('fireball');
  s.onSkillCollected('fireball');
  return {
    popup: window.game.scene.isActive('UpgradeScene'),
    pending: s.pendingChoices.length,
    owned: [...s.owned],
    stats: s.progression.statsFor('fireball'),
  };
`);
console.log('first pickup:', JSON.stringify(first));
check('first 화염구 pickup opens no popup', first.popup === false && first.pending === 0,
  `popup=${first.popup} pending=${first.pending}`);
check('first pickup grants the skill at base spec',
  first.owned.includes('fireball') && JSON.stringify(first.stats) === JSON.stringify(base.fire),
  `owned=${first.owned}, stats ${JSON.stringify(first.stats)}`);

// --- 7. a repeat pickup opens the four-option popup ---
await run(`s.onSkillCollected('fireball'); return 1;`);
await sleep(500);
const four = await popup();
console.log('popup:', JSON.stringify(four));
check('repeat pickup opens the 화염구 popup', four.open === true && four.skill === 'fireball',
  `skill=${four.skill} subtitle=${four.subtitle}`);
check('화염구 offers damage, rate, range and projectile speed',
  JSON.stringify(four.cards?.map(c => c.id)) ===
    JSON.stringify(['damage', 'attackSpeed', 'range', 'projectileSpeed']),
  `${four.cards?.map(c => c.label).join(' | ')}`);
const fits = four.cards?.every(c => c.x - c.w / 2 >= 0 && c.x + c.w / 2 <= four.width);
const gaps = four.cards?.slice(1).map((c, i) => Math.round(c.x - c.w / 2 - (four.cards[i].x + four.cards[i].w / 2)));
check('four cards fit on screen without overlapping',
  fits === true && gaps?.every(g => g > 0),
  `width=${four.width}, cards ${four.cards?.map(c => c.w).join('/')}px, gaps ${gaps?.join('/')}px`);
await shot('balance-01-four-options');

// --- 8. 사정거리 is the third card and raises range only ---
const beforeRange = await run(`return { fire: s.progression.statsFor('fireball'), melee: s.progression.statsFor('meleeStrike') };`);
await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(200);
const afterRightKey = await popup();
check('an arrow moves the caret without confirming',
  afterRightKey.selected === 1 && afterRightKey.open === true,
  `selected=${afterRightKey.selected}, popup still open=${afterRightKey.open}`);
check('사정거리 is the third card', afterRightKey.cards[2].id === 'range', afterRightKey.cards[2].label);
await cdp.tap('Digit3', 51, '3');
await sleep(600);
const afterRange = await run(`return { fire: s.progression.statsFor('fireball'), melee: s.progression.statsFor('meleeStrike') };`);
// An upgrade is a share of where the skill started, so the step is read
// from the base rather than written down here.
const rangeStep = await run(`
  const Progression = Object.getPrototypeOf(s.progression).constructor;
  return { base: new Progression().statsFor('fireball').range };
`);
const rangeGain = afterRange.fire.range - beforeRange.fire.range;
check('사정거리 raises fireball range by a share of its base, and nothing else',
  Math.abs(rangeGain / rangeStep.base - 0.15) < 0.001 &&
  afterRange.fire.damage === beforeRange.fire.damage &&
  afterRange.melee.range === beforeRange.melee.range,
  `fireball ${beforeRange.fire.range} -> ${afterRange.fire.range}px (+${rangeGain}, ${Math.round((rangeGain / rangeStep.base) * 100)}% of ${rangeStep.base}), melee still ${afterRange.melee.range}px`);

// And it reaches in play: something just past the old range is now fired at.
const longer = await run(`
  const was = s.choosing;
  s.choosing = true;
  s.spawner.clear();
  const w = s.weapons.find((x) => x.definition.id === 'fireball');
  const p = s.player;
  const st = s.progression.statsFor('fireball');
  const shoot = (dist, range) => {
    s.spawner.clear();
    w.projectiles.getChildren().forEach((b) => b.active && b.despawn());
    const e = s.spawner.group.get(p.x + dist, p.y); e.spawn(p.x + dist, p.y, p, 'brute');
    w.sinceShotMs = 99999;
    w.update(16, { origin: p, enemies: s.spawner.group, damage: 1, cooldownMs: 1, range,
      projectileSpeed: st.projectileSpeed, chainCount: 0, pierceCount: 0, orbCount: 0, orbitSpeed: 0, hit: () => {} });
    return w.projectiles.countActive(true);
  };
  const base = ${JSON.stringify(rangeStep.base)};
  const between = (base + st.range) / 2;
  const out = { atOld: shoot(between, base), atNew: shoot(between, st.range), between };
  s.spawner.clear();
  w.projectiles.getChildren().forEach((b) => b.active && b.despawn());
  s.choosing = was;
  return out;
`);
check('and the longer range is fired at in play, where the old one held off',
  longer.atOld === 0 && longer.atNew === 1, `an enemy at ${Math.round(longer.between)}px: ${longer.atOld} -> ${longer.atNew} shots`);

// --- 9. 투사체 속도 is the fourth card and raises speed only ---
await run(`s.onSkillCollected('fireball'); return 1;`);
await sleep(600);
const onSpeed = await popup();
check('투사체 속도 is the fourth card', onSpeed.cards[3].id === 'projectileSpeed',
  onSpeed.cards[3].label);
const beforeSpeed = await run(`return s.progression.statsFor('fireball');`);
await cdp.tap('Digit4', 52, '4');
await sleep(600);
const afterSpeed = await run(`return s.progression.statsFor('fireball');`);
const speedBase = await run(`
  const Progression = Object.getPrototypeOf(s.progression).constructor;
  return { base: new Progression().statsFor('fireball').projectileSpeed };
`);
const speedGain = afterSpeed.projectileSpeed - beforeSpeed.projectileSpeed;
check('투사체 속도 raises speed by a share of its base, and nothing else',
  Math.abs(speedGain / speedBase.base - 0.15) < 0.001 &&
  afterSpeed.range === beforeSpeed.range && afterSpeed.damage === beforeSpeed.damage,
  `${beforeSpeed.projectileSpeed} -> ${afterSpeed.projectileSpeed}px/s (+${speedGain}), range ${afterSpeed.range}px`);

// --- 10. a level-up spends on a skill in hand ---
// Which one is random; the roll is pinned to the first skill held (타격,
// which the harness starts on) so the two-card layout can be measured.
const held = await run(`
  const roll = Math.random;
  Math.random = () => 0;
  s.progression.addXp(s.progression.xpToNext);
  Math.random = roll;
  return [...s.owned];
`);
await sleep(600);
const level = await popup();
check('a level-up offers the picks of a skill in hand',
  level.open === true && held.includes(level.skill) && level.title === 'LEVEL UP' &&
    level.skill === held[0] && level.cards.length === 2,
  `skill=${level.skill} of ${held.join(', ')} cards=${level.cards?.map(c => c.label).join(' | ')}`);
check('two cards stay at full width', level.cards?.every(c => c.w === 260),
  `${level.cards?.map(c => c.w).join('/')}px`);
await shot('balance-02-level-up');
await cdp.tap('Space', 32, ' ');
await sleep(500);

// --- 11. the run keeps going afterwards ---
await sleep(1200);
const alive = await run(`return { over: s.over, choosing: s.choosing, paused: s.physics.world.isPaused, hp: s.player.hp };`);
check('play resumes after the picks', alive.over === false && alive.choosing === false && alive.paused === false,
  `over=${alive.over} choosing=${alive.choosing} paused=${alive.paused}`);

// --- the run gets harder for lasting ---
// Every whole minute compounds the health an enemy spawns with, and adds a
// point of a percent to how many of them come up rare.
const curve = await run(`
  const d = window.config.DIFFICULTY;
  const out = [];
  for (const m of [0, 1, 2, 5, 10]) {
    s.spawner.seed(m * 60000);
    out.push({ m, hp: s.spawner.hpScale, rare: s.spawner.rareChance });
  }
  s.spawner.seed(59000);
  const underAMinute = { hp: s.spawner.hpScale, rare: s.spawner.rareChance };
  s.spawner.seed(0);
  return { d, out, underAMinute, base: window.config.RARE.chance };
`);
console.log('the curve:', JSON.stringify(curve));
check('every minute multiplies the health an enemy spawns with',
  curve.out.every(({ m, hp }) => Math.abs(hp - curve.d.hpScalePerMinute ** m) < 1e-9) &&
    curve.d.hpScalePerMinute === 1.1,
  curve.out.map(({ m, hp }) => `${m}m x${hp.toFixed(2)}`).join(' / '));
check('and it compounds rather than adding up',
  Math.abs(curve.out.find((o) => o.m === 10).hp - 2.5937424601) < 1e-6,
  `ten minutes is x${curve.out.find((o) => o.m === 10).hp.toFixed(3)}, not x2`);
check('the same minute adds a point of a percent to the rares',
  curve.out.every(({ m, rare }) =>
    Math.abs(rare - (curve.base + curve.d.rareChancePerMinute * m)) < 1e-9) &&
    curve.d.rareChancePerMinute === 0.01,
  curve.out.map(({ m, rare }) => `${m}m ${(rare * 100).toFixed(0)}%`).join(' / '));
check('it steps on the minute rather than creeping up to it',
  curve.underAMinute.hp === 1 && curve.underAMinute.rare === curve.base,
  `at 59s still x${curve.underAMinute.hp}`);

// Past the late minute every step is lateMultiplier times as big.
const late = await run(`
  const d = window.config.DIFFICULTY;
  const out = [];
  for (const m of [d.lateFromMinute, d.lateFromMinute + 1, d.lateFromMinute + 2, d.lateFromMinute + 5]) {
    s.spawner.seed(m * 60000);
    out.push({ m, hp: s.spawner.hpScale, rare: s.spawner.rareChance });
  }
  s.spawner.seed(0);
  return { d, out, base: window.config.RARE.chance };
`);
const L = late.d.lateFromMinute;
const lateStep = 1 + (late.d.hpScalePerMinute - 1) * late.d.lateMultiplier;
check('from the late minute on, each minute’s health step is that many times bigger',
  late.out.every(({ m, hp }) =>
    Math.abs(hp - late.d.hpScalePerMinute ** L * lateStep ** (m - L)) < 1e-6 * hp),
  late.out.map(({ m, hp }) => `${m}m x${hp.toFixed(2)}`).join(' / '));
check('and so is the rare step',
  late.out.every(({ m, rare }) => Math.abs(rare - Math.min(1,
    late.base + late.d.rareChancePerMinute * (L + (m - L) * late.d.lateMultiplier))) < 1e-9),
  late.out.map(({ m, rare }) => `${m}m ${(rare * 100).toFixed(0)}%`).join(' / '));

const walked = await run(`
  s.choosing = true;
  const base = window.config.ENEMY_KINDS.grunt.maxHp;
  const at = (minutes) => {
    s.spawner.seed(minutes * 60000);
    s.spawner.clear();
    // Spawned by hand rather than by the director, so no rare roll muddies it.
    const e = s.spawner.group.get(600, 600);
    e.spawn(600, 600, s.player, 'grunt', undefined, false, s.spawner.hpScale);
    const boss = s.spawner.group.get(600, 600);
    boss.spawn(600, 600, s.player, 'boss', undefined, false, s.spawner.hpScale);
    const out = { minutes, grunt: e.hp, gruntMax: e.maxHp, boss: boss.hp };
    s.spawner.clear();
    return out;
  };
  const out = [0, 1, 5, 10].map(at);
  s.spawner.seed(0);
  s.choosing = false;
  return { base, out, bossBase: window.config.ENEMY_KINDS.boss.maxHp };
`);
console.log('what walks in:', JSON.stringify(walked));
check('an enemy walks in with the health the clock says',
  walked.out.every(({ minutes, grunt }) =>
    grunt === Math.round(walked.base * 1.1 ** minutes)),
  walked.out.map(({ minutes, grunt }) => `${minutes}m ${grunt}hp`).join(' / '));
check('and remembers it, so a bar has something to measure against',
  walked.out.every(({ grunt, gruntMax }) => grunt === gruntMax),
  'hp === maxHp on arrival');
check('the 우두머리 is on the same ladder',
  walked.out.every(({ minutes, boss }) =>
    boss === Math.round(walked.bossBase * 1.1 ** minutes)),
  walked.out.map(({ minutes, boss }) => `${minutes}m ${boss}hp`).join(' / '));

// The roll really does follow the number, not just the read-out.
const rolled = await run(`
  s.choosing = true;
  const share = (minutes) => {
    s.spawner.seed(minutes * 60000);
    let rare = 0;
    const N = 1500;
    for (let i = 0; i < N; i++) {
      s.spawner.clear();
      s.spawner.spawnBurst(1, 'grunt');
      const e = s.spawner.group.getChildren().find(x => x.active);
      if (e && e.rare) rare++;
    }
    s.spawner.clear();
    return { minutes, want: s.spawner.rareChance, got: rare / N };
  };
  const out = [0, 20].map(share);
  s.spawner.seed(0);
  s.choosing = false;
  return out;
`);
console.log('rares rolled:', JSON.stringify(rolled));
check('and the rares really do come up that often',
  rolled.every((r) => Math.abs(r.got - r.want) < 0.04),
  rolled.map((r) => `${r.minutes}m wanted ${(r.want * 100).toFixed(0)}%, got ${(r.got * 100).toFixed(1)}%`).join(' / '));

// --- a survivor crits on their own ---
// Before this, a run without 치명 on the weapon never crit at all, and the
// whole crit read-out was dead text until a 우두머리 happened to leave one.
const crit = await run(`
  const P = window.config.PLAYER;
  const bare = { uid: 'bare', id: 'rustySword', prefixes: [], suffixes: [] };
  const sharp = { uid: 'sharp', id: 'rustySword',
                  prefixes: [{ id: 'critical', tier: 1 }], suffixes: [] };
  const cruel = { uid: 'cruel', id: 'rustySword',
                  prefixes: [{ id: 'cruel', tier: 1 }], suffixes: [] };
  const mods = (item) => ({ passive: window.passives.bonus, gear: window.gearBonusFor(item) });
  return {
    base: P.critChance,
    baseMultiplier: P.critMultiplier,
    player: s.player.critChance,
    withAffix: window.gearBonusFor(sharp).critChance,
    multiplier: window.critMultiplierFor(mods(bare)),
    cruelMultiplier: window.critMultiplierFor(mods(cruel)),
  };
`);
console.log('crit:', JSON.stringify(crit));
check('every survivor crits sometimes without a weapon saying so',
  crit.base === 0.05 && crit.player === crit.base,
  `${(crit.base * 100).toFixed(0)}% with nothing on the sword`);
check('and one of those is worth half again',
  crit.baseMultiplier === 1.5 && Math.abs(crit.multiplier - 1.5) < 1e-9,
  `x${crit.multiplier}`);
check('치명 on a weapon adds to that rather than being the only source',
  crit.withAffix > 0, `+${(crit.withAffix * 100).toFixed(0)}% from a 1티어 치명`);
check('and 잔혹 raises what a crit is worth',
  crit.cruelMultiplier > crit.multiplier,
  `x${crit.multiplier} -> x${crit.cruelMultiplier}`);

// A crit is the one number worth looking at, so it is drawn to be looked at.
const shownCrit = await run(`
  s.choosing = true;
  s.damageNumbers.reset();
  s.damageNumbers.spawn(100, 100, 7);
  const plain = s.damageNumbers.pool.find(f => f.remainingMs > 0);
  const ordinary = { scale: plain.text.scaleX, colour: String(plain.text.style.color),
                     stroke: plain.text.style.strokeThickness, life: plain.remainingMs };

  s.damageNumbers.reset();
  s.damageNumbers.spawn(100, 100, 21, { color: window.config.COLORS.critText, crit: true });
  const big = s.damageNumbers.pool.find(f => f.remainingMs > 0);
  const popped = { scale: big.text.scaleX, colour: String(big.text.style.color),
                   stroke: big.text.style.strokeThickness, life: big.remainingMs };

  // Let the pop settle, then read it again.
  s.damageNumbers.update(window.config.DAMAGE_NUMBERS.critPopMs + 10);
  const settled = { scale: big.text.scaleX };

  s.damageNumbers.reset();
  s.choosing = false;
  return { ordinary, popped, settled, cfg: window.config.DAMAGE_NUMBERS };
`);
console.log('crit numbers:', JSON.stringify(shownCrit));
check('a critical hit is drawn larger than an ordinary one',
  shownCrit.settled.scale > shownCrit.ordinary.scale &&
    Math.abs(shownCrit.settled.scale - shownCrit.cfg.critScale) < 0.05,
  `x${shownCrit.settled.scale.toFixed(2)} against x${shownCrit.ordinary.scale}`);
check('and starts larger still, so the eye catches it before it reads it',
  Math.abs(shownCrit.popped.scale - shownCrit.cfg.critPopScale) < 0.01 &&
    shownCrit.popped.scale > shownCrit.settled.scale,
  `pops at x${shownCrit.popped.scale} and settles to x${shownCrit.settled.scale.toFixed(2)}`);
// Every number is outlined — they all land straight on the playfield — and
// a critical wears a heavier one along with everything else.
check('in its own colour, under a heavier outline than an ordinary hit',
  shownCrit.popped.colour !== shownCrit.ordinary.colour &&
    shownCrit.popped.stroke === shownCrit.cfg.critOutline &&
    shownCrit.ordinary.stroke === shownCrit.cfg.outline &&
    shownCrit.popped.stroke > shownCrit.ordinary.stroke,
  `${shownCrit.popped.colour} at ${shownCrit.popped.stroke}px against ${shownCrit.ordinary.stroke}px`);
check('and hangs about longer than an ordinary hit',
  shownCrit.popped.life > shownCrit.ordinary.life,
  `${shownCrit.popped.life}ms against ${shownCrit.ordinary.life}ms`);

// --- 속성 rungs ---
const rungs = await cdp.evaluate(`(() => {
  const out = {};
  for (const [id, affix] of Object.entries(window.config.AFFIXES)) {
    if (!affix.gearTiers) continue;
    out[id] = affix.gearTiers.map(t => ({ tier: t.tier, weight: t.weight, detail: t.detail }));
  }
  const N = 40000;
  const seen = {};
  for (let i = 0; i < N; i++) {
    const tier = window.config.rollAffixTier('mighty');
    seen[tier] = (seen[tier] ?? 0) + 1;
  }
  return { out, seen, N, weights: window.config.AFFIX_TIER_WEIGHTS };
})()`);
console.log('rungs:', JSON.stringify(rungs.seen), JSON.stringify(rungs.out.mighty));
check('every weapon 속성 has five rungs, tier 1 first',
  Object.values(rungs.out).every((ladder) =>
    ladder.length === 5 && ladder[0].tier === 1 && ladder[4].tier === 5),
  `${Object.keys(rungs.out).length} 속성, five rungs each`);
check('tier 1 is the best of them',
  parseFloat(rungs.out.mighty[0].detail.match(/\d+/)[0]) >
    parseFloat(rungs.out.mighty[4].detail.match(/\d+/)[0]),
  `${rungs.out.mighty[0].detail} against ${rungs.out.mighty[4].detail}`);
check('and the weak rungs are the ones that keep turning up',
  rungs.seen[5] > rungs.seen[4] && rungs.seen[4] > rungs.seen[3] &&
    rungs.seen[3] > rungs.seen[2] && rungs.seen[2] > rungs.seen[1],
  Object.entries(rungs.seen)
    .map(([t, n]) => `T${t} ${(n / rungs.N * 100).toFixed(1)}%`).join(' '));
check('the best rung is roughly one roll in thirty',
  Math.abs(rungs.seen[1] / rungs.N - 1 / 35) < 0.01,
  `${(rungs.seen[1] / rungs.N * 100).toFixed(2)}% came out tier 1`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
