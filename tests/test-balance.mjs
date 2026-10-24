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
  return { melee: p.statsFor('meleeStrike'), fire: p.statsFor('fireball'), fireBase: window.config.SKILL_BASE.fireball,
           meleeBase: window.config.SKILL_BASE.meleeStrike,
           enemyHp: (() => { const e = s.spawner.group.get(0, 0); e.spawn(0, 0, s.player);
             const hp = e.hp; e.recycle(); return hp; })() };
`);
console.log('base stats:', JSON.stringify(base));
// How the two compare is tuning (the live values moved them apart in
// 2026-10); what holds is that each starts on its own line.
check('타격 and 화염구 start on their configured damage',
  base.melee.damage === base.meleeBase.damage && base.fire.damage === base.fireBase.damage,
  `타격 ${base.melee.damage} · 화염구 ${base.fire.damage}`);
check('화염구 starts on the range its table gives', base.fire.range === base.fireBase.range,
  `range=${base.fire.range}px, table ${base.fireBase.range}px`);
check('and on its projectile speed', base.fire.projectileSpeed === base.fireBase.projectileSpeed,
  `speed=${base.fire.projectileSpeed}px/s, table ${base.fireBase.projectileSpeed}px/s`);

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
  return { speed, lifeMs: ms, travelPx: Math.round((speed * ms) / 1000), active: bolt.active,
           want: st.projectileSpeed, range: st.range };
`);
console.log('flight:', JSON.stringify(flight));
check('bolt leaves at its own speed', flight.speed === flight.want, `${flight.speed}px/s, wanted ${flight.want}`);
check('bolt fizzles just past its range', flight.travelPx >= flight.range && flight.travelPx <= flight.range * 1.6,
  `lived ${flight.lifeMs}ms = ~${flight.travelPx}px (${flight.range}px range)`);

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

// --- 7. a repeat pickup opens the upgrade popup ---
await run(`s.onSkillCollected('fireball'); return 1;`);
await sleep(500);
const four = await popup();
console.log('popup:', JSON.stringify(four));
check('repeat pickup opens the 화염구 popup', four.open === true && four.skill === 'fireball',
  `skill=${four.skill} subtitle=${four.subtitle}`);
// 투사체 속도 went in 0.83 (its eight-pick state is the base); 폭발 범위 came.
check('화염구 offers damage, rate and 폭발 범위 — no 투사체 속도 or 사거리 of its own',
  JSON.stringify(four.cards?.map(c => c.id)) ===
    JSON.stringify(['damage', 'attackSpeed', 'blastRadius']),
  `${four.cards?.map(c => c.label).join(' | ')}`);
const fits = four.cards?.every(c => c.x - c.w / 2 >= 0 && c.x + c.w / 2 <= four.width);
const gaps = four.cards?.slice(1).map((c, i) => Math.round(c.x - c.w / 2 - (four.cards[i].x + four.cards[i].w / 2)));
check('the cards fit on screen without overlapping',
  fits === true && gaps?.every(g => g > 0),
  `width=${four.width}, cards ${four.cards?.map(c => c.w).join('/')}px, gaps ${gaps?.join('/')}px`);
await shot('balance-01-four-options');

// --- 8. 폭발 범위 is the third card, and it widens the burst alone ---
const rangeOf = `return { fire: s.progression.statsFor('fireball'), reach: s.progression.rangeFor('fireball'),
  melee: s.progression.statsFor('meleeStrike') };`;
const beforeBlast = await run(rangeOf);
await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(200);
const afterRightKey = await popup();
check('an arrow moves the caret without confirming',
  afterRightKey.selected === 1 && afterRightKey.open === true,
  `selected=${afterRightKey.selected}, popup still open=${afterRightKey.open}`);
check('폭발 범위 is the third card', afterRightKey.cards[2]?.id === 'blastRadius',
  afterRightKey.cards[2]?.label);
await cdp.tap('Digit3', 51, '3');
await sleep(600);
const afterBlast = await run(rangeOf);
// An upgrade is a share of where the skill started, so the step is read
// from the base rather than written down here.
const blastBase = await run(`
  const b = window.config.SKILL_BASE.fireball;
  return { radius: b.blastRadius, share: window.config.UPGRADE_PERCENT.blastRadius };
`);
const blastGain = afterBlast.fire.blastRadius - beforeBlast.fire.blastRadius;
check('폭발 범위 widens the burst by a share of its base, and nothing else',
  Math.abs(blastGain / blastBase.radius - blastBase.share) < 0.001 &&
  afterBlast.fire.damage === beforeBlast.fire.damage && afterBlast.fire.projectileSpeed === beforeBlast.fire.projectileSpeed &&
  afterBlast.reach === beforeBlast.reach,
  `${beforeBlast.fire.blastRadius} -> ${afterBlast.fire.blastRadius}px (+${blastGain})`);

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
    level.skill === held[0] && level.cards.length === 3,
  `skill=${level.skill} of ${held.join(', ')} cards=${level.cards?.map(c => c.label).join(' | ')}`);
// 타격 has three picks since 0.83 (공격 범위): three cards, every one as wide as the next.
check('its cards share one width, and fit', level.cards?.every(c => c.w === level.cards[0].w && c.w >= 200),
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
// Every whole minute compounds the health an enemy spawns with — by the base
// step, then by that step times its tier (DIFFICULTY.hpStepTiers) — and adds
// a point of a percent to how many of them come up rare.
const curve = await run(`
  const d = window.config.DIFFICULTY;
  const out = [];
  const last = Math.max(...d.hpStepTiers.map((t) => t.afterMinute)) + 4;
  for (let m = 0; m <= last; m++) {
    s.spawner.seed(m * 60000);
    out.push({ m, hp: s.spawner.hpScale, rare: s.spawner.rareChance });
  }
  s.spawner.seed(59000);
  const underAMinute = { hp: s.spawner.hpScale, rare: s.spawner.rareChance };
  s.spawner.seed(0);
  return { d, out, underAMinute, base: window.config.RARE.chance };
`);
console.log('the curve:', JSON.stringify(curve.out.map(({ m, hp }) => `${m}m x${hp.toFixed(3)}`)));
const step = curve.d.hpScalePerMinute - 1;
const tierOf = (minute) => {
  let mult = 1, passed = -Infinity;
  for (const t of curve.d.hpStepTiers) if (minute > t.afterMinute && t.afterMinute >= passed) { passed = t.afterMinute; mult = t.multiplier; }
  return mult;
};
const firstTier = Math.min(...curve.d.hpStepTiers.map((t) => t.afterMinute));
check('before the first tier, every minute multiplies the health an enemy spawns with by the base step',
  curve.out.filter(({ m }) => m <= firstTier).every(({ m, hp }) => Math.abs(hp - curve.d.hpScalePerMinute ** m) < 1e-9),
  curve.out.filter(({ m }) => m <= firstTier).map(({ m, hp }) => `${m}m x${hp.toFixed(3)}`).join(' / '));
check('and past each tier the minute’s step is that tier’s multiple of it, compounding',
  curve.out.every(({ m, hp }, i) => i === 0 || Math.abs(hp / curve.out[i - 1].hp - (1 + step * tierOf(m))) < 1e-9) &&
    curve.d.hpStepTiers.every((t) => Math.abs(curve.out[t.afterMinute + 1].hp / curve.out[t.afterMinute].hp - (1 + step * t.multiplier)) < 1e-9),
  curve.out.slice(1).map(({ m, hp }, i) => `${m}m x${(hp / curve.out[i].hp).toFixed(3)}`).join(' / '));
check('the same minute adds a point of a percent to the rares',
  curve.out.filter(({ m }) => m <= curve.d.lateFromMinute).every(({ m, rare }) =>
    Math.abs(rare - Math.min(1, curve.base + curve.d.rareChancePerMinute * m)) < 1e-9),
  curve.out.map(({ m, rare }) => `${m}m ${(rare * 100).toFixed(0)}%`).join(' / '));
check('it steps on the minute rather than creeping up to it',
  curve.underAMinute.hp === 1 && curve.underAMinute.rare === curve.base,
  `at 59s still x${curve.underAMinute.hp}`);

// Past the late minute the rare step is lateMultiplier times as big; health
// does not follow it any more.
const late = await run(`
  const d = window.config.DIFFICULTY;
  const out = [];
  for (const m of [d.lateFromMinute, d.lateFromMinute + 1, d.lateFromMinute + 2, d.lateFromMinute + 5]) {
    s.spawner.seed(m * 60000);
    out.push({ m, rare: s.spawner.rareChance, hp: s.spawner.hpScale, want: window.config.enemyHpScaleAt(m * 60000) });
  }
  s.spawner.seed(0);
  return { d, out, base: window.config.RARE.chance };
`);
const L = late.d.lateFromMinute;
check('from the late minute on, the rare step is that many times bigger',
  late.out.every(({ m, rare }) => Math.abs(rare - Math.min(1,
    late.base + late.d.rareChancePerMinute * (L + (m - L) * late.d.lateMultiplier))) < 1e-9),
  late.out.map(({ m, rare }) => `${m}m ${(rare * 100).toFixed(0)}%`).join(' / '));
check('while health keeps to its tiers there',
  late.out.every(({ m, hp, want }, i) => Math.abs(hp - want) < 1e-9 * want &&
    (i === 0 || Math.abs(hp / late.out[i - 1].hp - (1 + step * tierOf(m)) ** (m - late.out[i - 1].m)) < 1e-9)),
  late.out.map(({ m, hp }) => `${m}m x${hp.toFixed(2)}`).join(' / '));

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
    // What the clock says, read off the config rather than written here.
    const scale = window.config.enemyHpScaleAt(minutes * 60000) * window.config.BALANCE.enemyHpScale * window.config.ENEMY_DAMPEN.hp;
    const out = { minutes, grunt: e.hp, gruntMax: e.maxHp, boss: boss.hp, scale };
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
    grunt === Math.round(walked.base * walked.out.find((o) => o.minutes === minutes).scale)),
  walked.out.map(({ minutes, grunt }) => `${minutes}m ${grunt}hp`).join(' / '));
check('and remembers it, so a bar has something to measure against',
  walked.out.every(({ grunt, gruntMax }) => grunt === gruntMax),
  'hp === maxHp on arrival');
check('the 우두머리 is on the same ladder',
  walked.out.every(({ minutes, boss }) =>
    boss === Math.round(walked.bossBase * walked.out.find((o) => o.minutes === minutes).scale)),
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
  // Two 치명 on one weapon: the base chance raised by both shares of itself.
  const A = window.config.AFFIXES;
  const rung = (id, tier) => A[id].gearTiers.find((t) => t.tier === tier).gear;
  const twice = { uid: 'twice', id: 'rustySword', prefixes: [{ id: 'critical', tier: 1 }, { id: 'critical', tier: 2 }], suffixes: [] };
  const was = s.player.critChance;
  s.player.applyGear(window.gearBonusFor(twice));
  const doubled = s.player.critChance;
  s.player.applyGear(s.mods.gear);
  // And two 거대 on one weapon add up rather than compounding.
  const hearty = { uid: 'hearty', id: 'rustySword', prefixes: [], suffixes: [{ id: 'giant', tier: 1 }, { id: 'giant', tier: 2 }] };
  return {
    base: P.critChance,
    baseMultiplier: P.critMultiplier,
    player: was,
    withAffix: window.gearBonusFor(sharp).critChanceIncrease,
    twice: { increase: window.gearBonusFor(twice).critChanceIncrease, chance: doubled,
             want: rung('critical', 1).critChance + rung('critical', 2).critChance },
    hearty: { scale: window.gearBonusFor(hearty).maxHpScale,
              want: 1 + (rung('giant', 1).maxHpScale - 1) + (rung('giant', 2).maxHpScale - 1) },
    multiplier: window.critMultiplierFor(mods(bare)),
    cruelMultiplier: window.critMultiplierFor(mods(cruel)),
  };
`);
console.log('crit:', JSON.stringify(crit));
check('every survivor crits sometimes without a weapon saying so',
  crit.base > 0 && crit.player === crit.base,
  `${(crit.base * 100).toFixed(0)}% with nothing on the sword`);
check('and one of those is worth more than a plain hit, by the configured amount',
  crit.baseMultiplier > 1 && Math.abs(crit.multiplier - crit.baseMultiplier) < 1e-9,
  `x${crit.multiplier}`);
check('치명 on a weapon raises that rather than being the only source',
  crit.withAffix > 0, `+${(crit.withAffix * 100).toFixed(0)}% of the base from a 1티어 치명`);
check('two 치명 on one weapon raise the base chance by both their shares of it, added',
  Math.abs(crit.twice.increase - crit.twice.want) < 1e-9 &&
    Math.abs(crit.twice.chance - Math.min(1, crit.base * (1 + crit.twice.want))) < 1e-9,
  `${(crit.base * 100).toFixed(1)}% × (1 + ${crit.twice.want}) = ${(crit.twice.chance * 100).toFixed(2)}%`);
check('and two 거대 on one weapon add up: +50% twice is +100%, not ×1.5 twice',
  Math.abs(crit.hearty.scale - crit.hearty.want) < 1e-9, `×${crit.hearty.scale} (want ×${crit.hearty.want})`);
check('and 잔혹 raises what a crit is worth',
  crit.cruelMultiplier > crit.multiplier,
  `x${crit.multiplier} -> x${crit.cruelMultiplier}`);

// 강력, 광포, 치명 and 잔혹 are balanced as three 접두어 together (see the
// note above AFFIXES): a weapon's best three of 강력/광포 come to about what
// its best three with 치명 and 잔혹 do, at every rung, and a lone 치명 or 잔혹
// is not worth more than a lone 강력.
const parity = await run(`
  const c = window.config, A = c.AFFIXES, P = c.PLAYER;
  const at = (id, tier) => A[id].gearTiers.find((t) => t.tier === tier).gear;
  // Average damage per second of a weapon with these three lines, against none.
  const worth = (lines, tier) => {
    let dmg = 1, speed = 1, share = 0, bonus = 0;
    for (const id of lines) {
      const g = at(id, tier);
      dmg += (g.damageScale ?? 1) - 1;
      speed += (g.attackSpeedScale ?? 1) - 1;
      share += g.critChance ?? 0;
      bonus += g.critMultiplierBonus ?? 0;
    }
    const hit = 1 + Math.min(1, P.critChance * (1 + share)) * (P.critMultiplier - 1 + bonus);
    return (dmg * speed * hit) / (1 + P.critChance * (P.critMultiplier - 1));
  };
  const plain = [['mighty', 'mighty', 'frenzied'], ['frenzied', 'frenzied', 'mighty'], ['mighty', 'mighty', 'mighty'], ['frenzied', 'frenzied', 'frenzied']];
  const crit = [['critical', 'critical', 'cruel'], ['critical', 'cruel', 'cruel'], ['critical', 'cruel', 'mighty'], ['critical', 'cruel', 'frenzied']];
  const pct = (x) => +((x - 1) * 100).toFixed(1);
  return Array.from({ length: c.AFFIX_RUNGS }, (_, i) => i + 1).map((tier) => ({
    tier,
    plain: pct(Math.max(...plain.map((l) => worth(l, tier)))),
    crit: pct(Math.max(...crit.map((l) => worth(l, tier)))),
    loneMighty: pct(worth(['mighty'], tier)),
    loneCrit: pct(worth(['critical'], tier)),
    loneCruel: pct(worth(['cruel'], tier)),
  }));
`);
console.log('affix parity:', JSON.stringify(parity));
check('the best three of 강력/광포 come to about what the best three with 치명 and 잔혹 do, at every rung',
  parity.every((r) => Math.abs(r.plain - r.crit) <= Math.max(1.5, r.plain * 0.1)),
  parity.map((r) => `${r.tier}티어 +${r.plain}% vs +${r.crit}%`).join(' · '));
check('and a lone 치명 or 잔혹 is worth no more than a lone 강력',
  parity.every((r) => r.loneCrit <= r.loneMighty + 0.5 && r.loneCruel <= r.loneMighty + 0.5),
  parity.map((r) => `${r.tier}티어 ${r.loneMighty}/${r.loneCrit}/${r.loneCruel}%`).join(' · '));

// A hit for a fraction (연쇄번개 각성, a crit's multiplier) shows a whole number.
const whole = await run(`
  s.choosing = true;
  const read = (amount) => {
    s.damageNumbers.reset();
    s.damageNumbers.spawn(100, 100, amount);
    return s.damageNumbers.pool.find(f => f.remainingMs > 0).text.text;
  };
  const out = { a: read(12.7), b: read(12.2), tiny: read(0.3) };
  s.damageNumbers.reset();
  s.choosing = false;
  return out;
`);
check('a damage number never shows a decimal point',
  whole.a === '13' && whole.b === '12' && whole.tiny === '1', JSON.stringify(whole));

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
    out[id] = affix.gearTiers.map(t => ({ tier: t.tier, weight: t.weight, detail: t.detail, value: t.value }));
  }
  const N = 40000;
  const seen = {};
  for (let i = 0; i < N; i++) {
    const tier = window.config.rollAffixTier('mighty');
    seen[tier] = (seen[tier] ?? 0) + 1;
  }
  return { out, seen, N, weights: window.config.AFFIX_TIER_WEIGHTS, rungs: window.config.AFFIX_RUNGS };
})()`);
console.log('rungs:', JSON.stringify(rungs.seen), JSON.stringify(rungs.out.mighty));
check('every weapon 속성 has the same rungs (seven since 0.88), tier 1 first',
  rungs.rungs === 7 && Object.values(rungs.out).every((ladder) =>
    ladder.length === rungs.rungs && ladder.every((rung, i) => rung.tier === i + 1)),
  `${Object.keys(rungs.out).length} 속성, ${rungs.rungs} rungs each`);
check('tier 1 is the best of them',
  parseFloat(rungs.out.mighty[0].detail.match(/[\d.]+/)[0]) >
    parseFloat(rungs.out.mighty[rungs.rungs - 1].detail.match(/[\d.]+/)[0]),
  `${rungs.out.mighty[0].detail} against ${rungs.out.mighty[rungs.rungs - 1].detail}`);
check('and the weak rungs are the ones that keep turning up',
  Array.from({ length: rungs.rungs - 1 }, (_, i) => i + 1).every((t) => (rungs.seen[t + 1] ?? 0) > (rungs.seen[t] ?? 0)),
  Object.entries(rungs.seen)
    .map(([t, n]) => `T${t} ${(n / rungs.N * 100).toFixed(1)}%`).join(' '));
{
  const total = rungs.weights.reduce((a, b) => a + b, 0);
  const want = rungs.weights[0] / total;
  check('the best rung comes out at its weight’s share — rarest of all',
    Math.abs((rungs.seen[1] ?? 0) / rungs.N - want) < 0.005 && rungs.weights[0] === Math.min(...rungs.weights),
    `${((rungs.seen[1] ?? 0) / rungs.N * 100).toFixed(2)}% came out tier 1, wanted ${(want * 100).toFixed(2)}%`);
}
// Each ladder bends (0.88): a step up is never worth more than the step below it.
check('every ladder bends — each step up adds no more than the one below it',
  Object.entries(rungs.out).every(([, ladder]) => {
    const v = ladder.map((r) => r.value);
    for (let i = 0; i + 2 < v.length; i++) {
      if (v[i] - v[i + 1] > v[i + 1] - v[i + 2] + 1e-9) return false;
    }
    return v.every((x, i) => i === 0 || v[i - 1] > x);
  }),
  Object.entries(rungs.out).map(([id, l]) => `${id} ${l.map((r) => r.value).join('/')}`).join(' · '));

// 반복 against 광포, rung for rung (0.114, the user's ask): better on a slow
// skill, worse on a fast one. A repeat comes repeatDelayMs (or half the
// cooldown) after its cast and the cooldown runs again from it, so what it
// adds is (1 + p) / (1 + p × delay / cooldown) − 1.
{
  const delay = await cdp.evaluate(`window.config.AFFIX_TIMING.repeatDelayMs`);
  const gain = (p, cd) => (1 + p) / (1 + p * Math.min(delay, cd / 2) / cd) - 1;
  const rep = rungs.out.echoing.map((r) => r.value / 100);
  const fren = rungs.out.frenzied.map((r) => r.value / 100);
  const slow = 1600, fast = 250;
  check('반복 beats 광포 at every rung on a slow skill (1.6s), and falls short on a fast one (0.25s)',
    rep.every((p, i) => gain(p, slow) > fren[i] && gain(p, fast) < fren[i]),
    rep.map((p, i) => `T${i + 1} ${(gain(p, slow) * 100).toFixed(1)}/${(gain(p, fast) * 100).toFixed(1)} vs ${(fren[i] * 100).toFixed(0)}`).join(' · '));
}

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
