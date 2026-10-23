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
  return { enemyHp: Progression.enemyHealth, playerHp: s.player.hp };
})()`);
const FULL = CONFIG.enemyHp;
console.log('config:', JSON.stringify(CONFIG));


// --- 1. every kind spawns with its own stat line ---
const kinds = await run(`
  s.choosing = true;
  s.spawner.clear();
  const p = s.player;
  const out = {};
  for (const kind of ['grunt', 'brute', 'runner', 'shooter']) {
    const e = s.spawner.group.get(p.x + 300, p.y + 300);
    e.spawn(p.x + 300, p.y + 300, p, kind);
    out[kind] = {
      hp: e.hp, speed: Math.round(e.currentSpeed), contact: e.contactDamage, xp: e.xpValue,
      name: e.kindName, tex: e.texture.key,
      body: [Math.round(e.body.width), Math.round(e.body.height)],
      drawn: [Math.round(e.displayWidth), Math.round(e.displayHeight)],
    };
    e.recycle();
  }
  s.choosing = false;
  out.spec = Object.fromEntries(['grunt', 'brute', 'runner', 'shooter'].map((k) =>
    [k, { hp: window.config.ENEMY_KINDS[k].maxHp, contact: window.config.ENEMY_KINDS[k].contactDamage,
          speed: window.config.ENEMY_KINDS[k].speed, size: window.config.ENEMY_KINDS[k].size,
          drawn: window.config.ENEMY_KINDS[k].drawn ?? window.config.ENEMY_KINDS[k].size }]));
  out.variance = window.config.ENEMY.speedVariance;
  return out;
`);
const SPEC = kinds.spec;
// Each body is spawned at its kind's speed give or take ENEMY.speedVariance,
// so one spawn against another is a coin toss; the table is compared, and
// each spawn is checked to be inside its kind's band.
const inBand = (kind) => Math.abs(kinds[kind].speed - SPEC[kind].speed) <= SPEC[kind].speed * kinds.variance + 1;
console.log('kinds:', JSON.stringify(kinds, null, 1));
check('일반: the configured HP and contact', kinds.grunt.hp === FULL && kinds.grunt.contact === SPEC.grunt.contact,
  `hp=${kinds.grunt.hp} contact=${kinds.grunt.contact} speed≈${kinds.grunt.speed}`);
check('거구: its configured HP and the slowest of the four',
  kinds.brute.hp === SPEC.brute.hp && SPEC.brute.speed < SPEC.grunt.speed && inBand('brute'),
  `hp=${kinds.brute.hp} speed≈${kinds.brute.speed} vs 일반 ≈${kinds.grunt.speed}`);
check('거구 hits hardest on contact and pays the most XP',
  kinds.brute.contact === SPEC.brute.contact &&
    Object.values(SPEC).every((k) => k.contact <= SPEC.brute.contact) &&
    kinds.brute.xp > kinds.grunt.xp,
  `contact=${kinds.brute.contact} xp=${kinds.brute.xp} vs 일반 ${kinds.grunt.xp}`);
// Since 0.99 each of the four is a figure drawn at its kind's `drawn`, its body still `size`.
check('each is drawn at its kind’s picture size over a body of its own size, the 거구 the biggest',
  ['grunt', 'brute', 'runner', 'shooter'].every((k) => kinds[k].drawn[0] === SPEC[k].drawn && kinds[k].body[0] === SPEC[k].size) &&
    ['grunt', 'runner', 'shooter'].every((k) => SPEC[k].drawn < SPEC.brute.drawn && SPEC[k].size < SPEC.brute.size),
  ['grunt', 'brute', 'runner', 'shooter'].map((k) => `${k} drawn ${kinds[k].drawn[0]}/${SPEC[k].drawn} body ${kinds[k].body[0]}/${SPEC[k].size}`).join(', '));
check('질주: fastest and frailest',
  kinds.runner.hp === SPEC.runner.hp &&
    Object.values(SPEC).every((k) => k.hp >= SPEC.runner.hp) &&
    SPEC.runner.speed > SPEC.grunt.speed * 1.5 && inBand('runner'),
  `hp=${kinds.runner.hp} speed≈${kinds.runner.speed}`);
check('사수: its own stat line and texture',
  kinds.shooter.hp === SPEC.shooter.hp && kinds.shooter.tex === 'tex-enemy-shooter' &&
  kinds.shooter.xp >= kinds.grunt.xp,
  `hp=${kinds.shooter.hp} xp=${kinds.shooter.xp} ${kinds.shooter.tex}`);
check('each kind draws its own texture',
  new Set(['grunt', 'brute', 'runner', 'shooter'].map(k => kinds[k].tex)).size === 4,
  ['grunt', 'brute', 'runner', 'shooter'].map(k => kinds[k].tex.replace('tex-enemy', '')).join(' '));

// --- 2. stronger kinds unlock as the run goes on ---
// Each kind is checked just before and at its own unlockMs, read off config.
const unlocks = await run(`
  const at = (ms) => { s.spawner.elapsedMs = ms; return [...s.spawner.unlockedKinds]; };
  const rows = window.config.SPAWN_TABLE.map(r => ({
    kind: r.kind,
    at: r.unlockMs / 1000,
    before: r.unlockMs > 0 ? at(r.unlockMs - 1).includes(r.kind) : false,
    after: at(r.unlockMs).includes(r.kind),
  }));
  const out = { t0: at(0), rows };
  s.spawner.elapsedMs = 0;
  return out;
`);
console.log('unlocks:', JSON.stringify(unlocks));
check('the start is 일반 only',
  JSON.stringify(unlocks.t0) === JSON.stringify(['grunt']), `${unlocks.t0}`);
check('each kind joins exactly at its unlock time',
  unlocks.rows.every(r => !r.before && r.after),
  unlocks.rows.map(r => `${r.kind} ${r.at}s`).join(' | '));

// --- 3. the draw is weighted ---
// Past every unlock, each kind comes up at its share of the table's weights.
const mix = await run(`
  const table = window.config.SPAWN_TABLE;
  s.spawner.elapsedMs = Math.max(...table.map((r) => r.unlockMs)) + 1000;
  const seen = {};
  for (let i = 0; i < 20000; i++) { const k = s.spawner.pickKind(); seen[k] = (seen[k] ?? 0) + 1; }
  s.spawner.elapsedMs = 0;
  const total = table.reduce((sum, r) => sum + r.weight, 0);
  const want = Object.fromEntries(table.map((r) => [r.kind, r.weight / total]));
  return { seen, want };
`);
console.log('mix over 20k draws:', JSON.stringify(mix));
check('the mix follows the table weights',
  Object.entries(mix.want).every(([k, share]) => Math.abs((mix.seen[k] ?? 0) / 20000 - share) < 0.02),
  Object.entries(mix.seen).map(([k, n]) => `${k} ${(n / 200).toFixed(1)}% (want ${(mix.want[k] * 100).toFixed(1)}%)`).join('  '));

// --- 4. a 거구 really does soak four times the hits ---
const soak = await run(`
  s.choosing = true;
  s.spawner.clear();
  // Counting swings means counting ordinary ones: every survivor crits some
  // of the time now, which would land a kill a hit early at random.
  const crit = window.config.PLAYER.critChance;
  window.config.PLAYER.critChance = 0;
  const p = s.player;
  // One 얼음창 hit at its base line, whatever that is tuned to.
  const dmg = window.config.SKILL_BASE.iceSpear.damage;
  const take = (kind) => {
    const e = s.spawner.group.get(p.x + 300, p.y + 300);
    e.spawn(p.x + 300, p.y + 300, p, kind);
    const want = Math.ceil(e.hp / dmg);
    let hits = 0;
    while (e.active && hits < 400) { s.combat.hit(e, dmg); hits++; }
    return { hits, want };
  };
  const out = { dmg, grunt: take('grunt'), brute: take('brute'), runner: take('runner') };
  window.config.PLAYER.critChance = crit;
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('hits to kill:', JSON.stringify(soak));
check('each kind takes as many hits as its health says',
  ['grunt', 'brute', 'runner'].every((k) => soak[k].hits === soak[k].want) &&
    soak.brute.hits > soak.grunt.hits && soak.grunt.hits >= soak.runner.hits,
  `${soak.dmg} a hit: 일반 ${soak.grunt.hits} / 거구 ${soak.brute.hits} / 질주 ${soak.runner.hits}`);

// --- 5. a 사수 keeps its distance and shoots ---
await run(`
  s.spawner.clear();
  window.__shots = 0;
  const orig = s.combat.fireEnemyShot;
  s.combat.fireEnemyShot = (...a) => { window.__shots++; return orig(...a); };
  const p = s.player;
  window.__shooter = s.spawner.group.get(p.x + 100, p.y);
  window.__shooter.spawn(p.x + 100, p.y, p, 'shooter', { fireShot: s.combat.fireEnemyShot });
  // Its first shot is staggered up to a whole cooldown; 2.6s is no longer
  // long enough to be sure of one, so this one starts loaded.
  window.__shooter.shotCooldownMs = 0;
  window.__hpBefore = p.hp;
  return 1;
`);
await sleep(2600);
const ranged = await run(`
  const e = window.__shooter, p = s.player;
  return {
    shots: window.__shots,
    distance: Math.round(Math.hypot(e.x - p.x, e.y - p.y)),
    speed: Math.round(Math.hypot(e.body.velocity.x, e.body.velocity.y)),
    hpBefore: window.__hpBefore, hp: p.hp,
    inFlight: s.combat.enemyShots.countActive(true),
  };
`);
console.log('shooter:', JSON.stringify(ranged));
check('a 사수 opens fire', ranged.shots >= 1, `${ranged.shots} shots in 2.6s`);
check('it holds its standoff instead of closing',
  ranged.distance >= 95 && ranged.speed === 0,
  `sat at ${ranged.distance}px, velocity ${ranged.speed}`);
check('its shots hurt the player', ranged.hp < ranged.hpBefore,
  `hp ${ranged.hpBefore} -> ${ranged.hp}`);
await shot('enemies-01-shooter');

// --- 6. enemy fire is spent on contact ---
const spent = await run(`
  s.spawner.clear();
  const p = s.player;
  s.player.invulnerableUntil = 0;
  const before = p.hp;
  s.combat.fireEnemyShot(p.x - 40, p.y, 0, { damage: 2, speed: 200, cooldownMs: 1000,
    range: 300, standoff: 140, size: 8, lifespanMs: 2000 });
  const bolt = s.combat.enemyShots.getChildren().find(b => b.active);
  return { before, launched: !!bolt };
`);
await sleep(500);
const landed = await run(`
  return { hp: s.player.hp, inFlight: s.combat.enemyShots.countActive(true) };
`);
check('an enemy bolt lands for 2 and disappears',
  landed.hp === spent.before - 2 && landed.inFlight === 0,
  `hp ${spent.before} -> ${landed.hp}, ${landed.inFlight} still in flight`);

// --- 7. contact damage is per kind ---
const contact = await run(`
  s.spawner.clear();
  const p = s.player;
  // From a full bar: three bumps must not end the run the later checks need.
  p.hp = p.maxHp;
  const bump = (kind) => {
    p.invulnerableUntil = 0;
    const before = p.hp;
    const e = s.spawner.group.get(p.x, p.y);
    e.spawn(p.x, p.y, p, kind);
    s.combat.onEnemyTouch(p, e);
    e.recycle();
    return before - p.hp;
  };
  const out = { grunt: bump('grunt'), brute: bump('brute'), runner: bump('runner') };
  p.hp = p.maxHp;
  s.spawner.clear();
  return out;
`);
console.log('contact damage:', JSON.stringify(contact));
check('each kind costs its own contact damage',
  ['grunt', 'brute', 'runner'].every((k) => contact[k] === SPEC[k].contact) &&
    contact.brute > contact.grunt,
  `일반 ${contact.grunt} / 거구 ${contact.brute} / 질주 ${contact.runner}`);

// --- 8. the gem is worth what the kind is worth ---
const reward = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.gems.getChildren().forEach(g => g.active && g.collect());
  const p = s.player;
  const worth = (kind) => {
    const e = s.spawner.group.get(p.x + 400, p.y + 400);
    e.spawn(p.x + 400, p.y + 400, p, kind);
    s.combat.hit(e, 9999);
    const gem = s.combat.gems.getChildren().filter(g => g.active).pop();
    const value = gem ? gem.value : null;
    if (gem) gem.collect();
    return value;
  };
  const out = { grunt: worth('grunt'), brute: worth('brute'), runner: worth('runner'), shooter: worth('shooter') };
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('gem value:', JSON.stringify(reward));
// XP is worked out from the enemy's own stat line now, so assert the
// ordering rather than numbers that a balance change would move.
check('a tougher kind leaves a richer gem',
  reward.brute > reward.shooter && reward.shooter >= reward.grunt && reward.grunt >= 1,
  `일반 ${reward.grunt} / 거구 ${reward.brute} / 질주 ${reward.runner} / 사수 ${reward.shooter}`);

// --- 9. one pool for every kind ---
const pooling = await run(`
  s.choosing = true;
  s.spawner.clear();
  const poolBefore = s.spawner.pooled;
  s.spawner.spawnBurst(30, 'brute');
  const poolMid = s.spawner.pooled;
  s.spawner.group.getChildren().forEach(e => e.active && s.combat.hit(e, 9999));
  s.spawner.spawnBurst(30, 'runner');
  const after = s.spawner.aliveByKind;
  const poolAfter = s.spawner.pooled;
  const recycledTexture = s.spawner.group.getChildren().find(e => e.active).texture.key;
  s.spawner.clear();
  s.choosing = false;
  return { poolBefore, poolMid, poolAfter, after, recycledTexture };
`);
console.log('pooling:', JSON.stringify(pooling));
check('all kinds share one pool',
  pooling.poolAfter === pooling.poolMid && pooling.after.runner === 30 && pooling.after.brute === 0,
  `pool held at ${pooling.poolAfter} across 거구 -> 질주`);
check('a recycled sprite takes on its new kind',
  pooling.recycledTexture === 'tex-enemy-runner', pooling.recycledTexture);

// --- 10. 냉각 slows every kind ---
const chilled = await run(`
  s.choosing = true;
  s.spawner.clear();
  const p = s.player;
  const ratio = (kind) => {
    const e = s.spawner.group.get(p.x + 300, p.y + 300);
    e.spawn(p.x + 300, p.y + 300, p, kind);
    const base = e.currentSpeed;
    e.chill();
    const out = Number((e.currentSpeed / base).toFixed(2));
    e.recycle();
    return out;
  };
  const out = { grunt: ratio('grunt'), brute: ratio('brute'), runner: ratio('runner'), shooter: ratio('shooter') };
  s.choosing = false;
  return out;
`);
const CHILLED = Number((1 - await cdp.evaluate(`window.config.CHILL.slowFactor`)).toFixed(3));
check('냉각 slows every kind by its configured share',
  Object.values(chilled).every(r => r === CHILLED), JSON.stringify(chilled));

// --- 11. the debug overlay reports and summons the mix ---
await fkey('F1', 112);
// The skills held still for the count: a 기행종 hops straight at the
// survivor and a swing can take it before it is counted.
await run(`s.spawner.clear(); s.weaponsHeldForTest = s.weapons.splice(0); return 1;`);
await fkey('F7', 118);
const each = await run(`
  const out = { byKind: s.spawner.aliveByKind, text: s.debug.label.text };
  s.weapons.push(...(s.weaponsHeldForTest ?? []));
  return out;
`);
console.log('F7:', JSON.stringify(each.byKind));
// A normal spawn can land in the moment between the key and the count.
check('F7 spawns one of every kind',
  Object.values(each.byKind).every(n => n >= 1) &&
    Object.values(each.byKind).reduce((a, n) => a + n, 0) <= Object.keys(each.byKind).length + 1,
  JSON.stringify(each.byKind));
check('the overlay breaks the field down by kind',
  /일반/.test(each.text) && /거구/.test(each.text) && /질주/.test(each.text) && /사수/.test(each.text) &&
  /enemy shots/.test(each.text),
  each.text.split('\n').find(l => /일반/.test(l))?.trim());
await shot('enemies-02-overlay');
await fkey('F1', 112);

// --- 12. a real run, with the clock wound forward so every kind shows up ---
await run(`
  s.spawner.clear();
  s.spawner.elapsedMs = 120000;
  s.player.setInvulnerable(true);
  window.__kills = 0;
  const c = s.combat, orig = c.hit;
  c.hit = (e, d) => { const was = e.active; orig(e, d); if (was && !e.active) window.__kills++; };
  return 1;
`);
await sleep(14000);
await drain();
const live = await run(`
  return { byKind: s.spawner.aliveByKind, alive: s.spawner.alive, kills: window.__kills,
           shots: s.combat.enemyShots.countActive(true), over: s.over, lv: s.progression.level };
`);
console.log('after 14s at full roster:', JSON.stringify(live));
check('every kind turns up in a real run',
  Object.values(live.byKind).filter(n => n > 0).length >= 3 && live.over === false,
  `${Object.entries(live.byKind).map(([k, n]) => `${k} ${n}`).join(' / ')}, kills=${live.kills}`);
await shot('enemies-03-live');

// --- 9. the 사수 fires at the rate and speed it is tuned to ---
// Driven a frame at a time rather than in real time: Enemy.update clamps a
// delta to 50ms, so one giant step would be one frame's worth of cooldown.
const rate = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.enemyShots.getChildren().forEach(b => b.active && b.disableBody(true, true));

  const p = s.player;
  const e = s.spawner.group.get(p.x + 150, p.y);
  e.spawn(p.x + 150, p.y, p, 'shooter', { fireShot: s.combat.fireEnemyShot });
  // Its first shot is staggered on purpose; this is about the ones after it.
  e.shotCooldownMs = 0;

  const spec = window.config.ENEMY_KINDS.shooter.shot;
  const step = (ms) => { for (let i = 0; i < ms / 40; i++) e.update(0, 40); };

  step(40);
  const first = s.combat.enemyShots.countActive(true);
  const bolt = s.combat.enemyShots.getChildren().find(b => b.active);
  const speed = bolt ? Math.round(Math.hypot(bolt.body.velocity.x, bolt.body.velocity.y)) : 0;

  step(spec.cooldownMs - 400);
  const before = s.combat.enemyShots.countActive(true);
  step(800);
  const after = s.combat.enemyShots.countActive(true);

  s.combat.enemyShots.getChildren().forEach(b => b.active && b.disableBody(true, true));
  s.spawner.clear();
  s.choosing = false;
  return { spec, first, speed, before, after };
`);
console.log('사수 rate:', JSON.stringify(rate));
check('a 사수 bolt flies at the speed it is tuned to',
  rate.speed === rate.spec.speed && rate.spec.speed === 230,
  `${rate.speed}px/s against ${rate.spec.speed}`);
check('and it waits its whole cooldown before the next one',
  rate.first === 1 && rate.before === 1 && rate.after === 2 && rate.spec.cooldownMs >= 4000,
  `one shot, then nothing for ${rate.spec.cooldownMs}ms, then another`);

// --- 10. a crowd keeps the room its own sizes ask for ---
// One flat radius meant a 거구 sat half inside another 거구 while two 질주
// had a gap between them. The distance comes off the pair now.
const crowdOf = (kind, n) => `
  s.spawner.clear();
  s.player.setInvulnerable(true);
  const p = s.player;
  for (let i = 0; i < ${n}; i++) {
    const a = (i / ${n}) * Math.PI * 2;
    const e = s.spawner.group.get(p.x, p.y);
    e.spawn(p.x + Math.cos(a) * 170, p.y + Math.sin(a) * 170, p, '${kind}',
            { fireShot: s.combat.fireEnemyShot });
  }
  return 1;
`;
const packing = `
  const live = s.spawner.group.getChildren().filter(e => e.active);
  let worst = 0, overlapping = 0, pairs = 0, closest = 9999;
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const want = (a.bodySize + b.bodySize) / 2;
      if (d > want * 3) continue;
      pairs++;
      closest = Math.min(closest, d);
      const over = want - d;
      if (over > 0.5) { overlapping++; worst = Math.max(worst, over); }
    }
  }
  return { n: live.length, near: pairs, overlapping, worst: +worst.toFixed(1),
           closest: +closest.toFixed(1),
           share: +(overlapping / Math.max(1, pairs)).toFixed(3) };
`;

const packed = {};
for (const [kind, n] of [['grunt', 40], ['brute', 24]]) {
  await run(crowdOf(kind, n));
  await sleep(3000);
  packed[kind] = await run(packing);
}
console.log('packing:', JSON.stringify(packed));
check('a crowd of 일반 settles without sitting inside itself',
  packed.grunt.share < 0.12 && packed.grunt.worst < 5,
  `${(packed.grunt.share * 100).toFixed(0)}% of near pairs touching, worst by ${packed.grunt.worst}px`);
check('and the bigger 거구 take the bigger share of room',
  packed.brute.share < 0.12 && packed.brute.closest > packed.grunt.closest,
  `거구 sit ${packed.brute.closest}px apart, 일반 ${packed.grunt.closest}px`);
await shot('enemies-04-crowd');

// Nothing hides inside a 우두머리, and a crowd cannot walk it off its line.
const bossCrowd = await run(`
  s.spawner.clear();
  const p = s.player;
  const boss = s.spawner.spawnBoss();
  boss.setPosition(p.x + 200, p.y);
  boss.target = p;
  window.__bossAt = { x: boss.x, y: boss.y };
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const e = s.spawner.group.get(p.x, p.y);
    e.spawn(boss.x + Math.cos(a) * 60, boss.y + Math.sin(a) * 60, p, 'grunt',
            { fireShot: s.combat.fireEnemyShot });
  }
  return 1;
`);
await sleep(2500);
const held = await run(`
  const boss = s.spawner.group.getChildren().find(e => e.active && e.isBoss);
  const inside = s.spawner.group.getChildren()
    .filter(e => e.active && !e.isBoss && Math.hypot(e.x - boss.x, e.y - boss.y) < boss.bodySize / 2)
    .length;
  s.spawner.clear();
  s.player.setInvulnerable(false);
  return { inside, size: boss.bodySize };
`);
console.log('boss in a crowd:', JSON.stringify(held));
check('nothing stands inside a 우두머리',
  held.inside === 0, `${held.inside} of them within ${held.size / 2}px of its centre`);

// --- 11. nothing stands on the survivor ---
// A chaser used to walk to the exact centre of the sprite and sit there,
// which hides the one thing the player has to be able to see. It is kept
// off, but not so far off that contact damage stops landing — that would
// call off the fight rather than fix the view.
//
// Dropped exactly on the player and given one tick of separation, so this
// measures the rule rather than how far something happened to walk.
const kept = await run(`
  s.spawner.clear();
  const p = s.player;
  p.setInvulnerable(true);
  const out = {};
  for (const kind of ['grunt', 'brute']) {
    const e = s.spawner.group.get(p.x, p.y);
    e.spawn(p.x, p.y, p, kind, { fireShot: s.combat.fireEnemyShot });
    e.setVelocity(0, 0);
    const before = Math.hypot(e.x - p.x, e.y - p.y);
    s.separation.update();
    out[kind] = {
      before: +before.toFixed(1),
      after: +Math.hypot(e.x - p.x, e.y - p.y).toFixed(1),
      room: +(((20 + e.bodySize) / 2) * window.config.SEPARATION.playerSpacing).toFixed(1),
      touching: (20 + e.bodySize) / 2,
    };
    s.spawner.clear();
  }
  return out;
`);
console.log('dropped on the survivor:', JSON.stringify(kept));
check('an enemy on the survivor is pushed off the middle',
  kept.grunt.before < 1 && Math.abs(kept.grunt.after - kept.grunt.room) < 0.5 &&
    Math.abs(kept.brute.after - kept.brute.room) < 0.5,
  `일반 ${kept.grunt.before} -> ${kept.grunt.after}px, 거구 -> ${kept.brute.after}px`);
check('and the bigger one is pushed further, off its own size',
  kept.brute.after > kept.grunt.after,
  `거구 ${kept.brute.after}px against 일반 ${kept.grunt.after}px`);
check('but still close enough that the bodies touch',
  kept.grunt.after < kept.grunt.touching && kept.brute.after < kept.brute.touching,
  `${kept.grunt.after}px, bodies overlap under ${kept.grunt.touching}`);

// The kills above can have earned a level, and an open level-up popup holds
// the fight — which once made this check fail now and then for no reason of
// its own. Any popup is answered first, and no XP is taken while measuring.
for (let i = 0; i < 6; i++) {
  if (!(await cdp.evaluate(`window.game.scene.isActive('UpgradeScene')`))) break;
  await sleep(400);
  await cdp.tap('Space', 32, ' ');
  await sleep(400);
}
const hurt = await run(`
  s.spawner.clear();
  window.__addXp = s.progression.addXp;
  s.progression.addXp = () => {};
  const p = s.player;
  p.setInvulnerable(false);
  p.invulnerableUntil = 0;
  p.hp = 30;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const e = s.spawner.group.get(p.x, p.y);
    e.spawn(p.x + Math.cos(a) * 60, p.y + Math.sin(a) * 60, p, 'grunt',
            { fireShot: s.combat.fireEnemyShot });
  }
  return { before: p.hp };
`);
await sleep(2600);
const bled = await run(`
  const p = s.player;
  const near = s.spawner.group.getChildren().filter(e => e.active)
    .map(e => Math.round(Math.hypot(e.x - p.x, e.y - p.y)));
  const out = { hp: p.hp, choosing: s.choosing, paused: s.physics.world.isPaused,
    alive: near.length, nearest: Math.min(...near) };
  s.progression.addXp = window.__addXp;
  s.spawner.clear();
  p.hp = 30;
  return out;
`);
console.log('standing in a crowd:', JSON.stringify({ before: hurt.before, after: bled.hp }));
check('standing in a crowd still costs health',
  bled.hp < hurt.before, `${hurt.before} -> ${bled.hp} ${JSON.stringify(bled)}`);
await shot('enemies-05-player-room');

// --- 12. 연발 only goes where there is a shot to put it on ---
// An 속성 that adds bolts means nothing on something that walks up and hits
// you, so it rolls on the kinds that shoot and nowhere else.
const pools = await run(`
  s.choosing = true;
  s.spawner.clear();
  const seen = {};
  for (const kind of ['grunt', 'brute', 'runner', 'shooter']) {
    const ids = new Set();
    for (let i = 0; i < 500; i++) {
      const e = s.spawner.group.get(600, 600);
      e.spawn(600, 600, s.player, kind, undefined, true);
      e.affixes.forEach(a => ids.add(a.id));
      e.recycle();
    }
    seen[kind] = [...ids].sort();
  }
  s.spawner.clear();
  s.choosing = false;
  return seen;
`);
console.log('what each kind can roll:', JSON.stringify(pools));
check('연발 rolls on a 사수',
  pools.shooter.includes('volleying'), pools.shooter.join(' / '));
check('and on nothing that fights up close',
  !pools.grunt.includes('volleying') && !pools.brute.includes('volleying') &&
    !pools.runner.includes('volleying'),
  `일반 ${pools.grunt.length}, 거구 ${pools.brute.length}, 질주 ${pools.runner.length} kinds of 속성`);

const fan = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.enemyShots.getChildren().forEach(b => b.active && b.disableBody(true, true));

  const p = s.player;
  const plain = s.spawner.group.get(p.x + 150, p.y);
  plain.spawn(p.x + 150, p.y, p, 'shooter', { fireShot: s.combat.fireEnemyShot });
  plain.shotCooldownMs = 0;
  plain.update(0, 40);
  const one = s.combat.enemyShots.countActive(true);
  s.combat.enemyShots.getChildren().forEach(b => b.active && b.disableBody(true, true));

  const loud = s.spawner.group.get(p.x + 150, p.y);
  loud.spawn(p.x + 150, p.y, p, 'shooter', { fireShot: s.combat.fireEnemyShot });
  loud.applyAffixes([window.config.AFFIXES.volleying]);
  loud.shotCooldownMs = 0;
  loud.update(0, 40);
  const bolts = s.combat.enemyShots.getChildren().filter(b => b.active);
  const angles = bolts
    .map(b => Math.atan2(b.body.velocity.y, b.body.velocity.x) * 180 / Math.PI)
    .sort((a, b) => a - b);
  const gaps = angles.slice(1).map((a, i) => Math.round(a - angles[i]));

  s.combat.enemyShots.getChildren().forEach(b => b.active && b.disableBody(true, true));
  s.spawner.clear();
  s.choosing = false;
  return { one, many: bolts.length, gaps,
           extra: window.config.AFFIXES.volleying.enemy.extraShots };
`);
console.log('the fan:', JSON.stringify(fan));
check('a plain 사수 throws one bolt a shot',
  fan.one === 1, `${fan.one} bolt`);
check('and one wearing 연발 throws its extras with it',
  fan.many === 1 + fan.extra, `${fan.many} bolts for +${fan.extra}`);
check('spread in a fan around the aimed one, not stacked on it',
  fan.gaps.length === fan.many - 1 && fan.gaps.every((g) => g > 2),
  `gaps of ${fan.gaps.join(', ')}°`);
await shot('enemies-06-volley');

// --- 0.99: the four walk, face their way, the 사수 draws as it looses; a bolt is drawn big over a body its own size ---
await run(`
  s.spawner.clear(); s.player.setInvulnerable(true);
  const p = s.player, g = s.spawner.group;
  window.__walkers = ['grunt', 'brute', 'runner'].map((k, i) => { const e = g.get(p.x, p.y); e.spawn(p.x + 260, p.y - 60 + i * 60, p, k, s.spawner.hooks); return e; });
  window.__walkSeen = window.__walkers.map(() => new Set());
  return 1;
`);
for (let i = 0; i < 10; i++) {
  await run(`window.__walkers.forEach((e, j) => window.__walkSeen[j].add(e.texture.key)); return 1;`);
  await sleep(80);
}
const walked = await run(`
  const C = window.config;
  const out = window.__walkers.map((e, j) => ({ kind: e.kind, seen: [...window.__walkSeen[j]],
    want: Array.from({ length: C.ENEMY_WALK_STEPS }, (_, i) => C.enemyWalk(C.ENEMY_KINDS[e.kind].texture, i)), facesLeft: e.flipX }));
  s.spawner.clear();
  return out;
`);
check('일반 · 거구 · 질주 walk: their stride pictures go by as they come, facing the survivor’s side',
  walked.every((w) => w.seen.filter((k) => w.want.includes(k)).length >= 2 && w.facesLeft),
  JSON.stringify(walked.map((w) => ({ kind: w.kind, seen: w.seen.length, left: w.facesLeft }))));
const drew = await run(`
  const C = window.config, p = s.player, g = s.spawner.group;
  const e = g.get(p.x, p.y);
  e.spawn(p.x - 200, p.y, p, 'shooter', s.spawner.hooks);
  e.shotCooldownMs = 0;
  e.update(0, 16);
  const key = e.texture.key;
  const shot = s.combat.enemyShots.getChildren().find((x) => x.active);
  const spec = C.ENEMY_KINDS.shooter.shot;
  const out = { key, want: C.enemyPose(C.ENEMY_KINDS.shooter.texture, 'cast'), facesRight: !e.flipX,
    shot: shot ? { shown: Math.round(shot.displayWidth), body: Math.round(shot.body.width), size: spec.size, scale: C.ENEMY_SHOT_FX.drawnScale } : null };
  s.spawner.clear();
  return out;
`);
check('a 사수 draws its bow as it looses, facing the survivor', drew.key === drew.want && drew.facesRight, JSON.stringify(drew));
check('its bolt is drawn drawnScale × its size, its body still its size',
  !!drew.shot && drew.shot.shown === Math.round(drew.shot.size * drew.shot.scale) && drew.shot.body === drew.shot.size, JSON.stringify(drew.shot));

// --- 0.101: the 기행종 is a figure too — crouched standing, stretched out in the leap ---
const hopper = await run(`
  const C = window.config, p = s.player, g = s.spawner.group;
  s.spawner.clear();
  const e = g.get(p.x, p.y);
  e.spawn(p.x + 150, p.y, p, 'erratic', s.spawner.hooks);
  const tex = C.ENEMY_KINDS.erratic.texture;
  const standing = e.texture.key;
  const seen = new Set();
  for (let t = 0; t < 3000 && seen.size < 2; t += 16) { e.update(0, 16); seen.add(e.texture.key); }
  const out = { standing, seen: [...seen], stand: tex, leap: C.enemyPose(tex, 'leap'),
    drawn: Math.round(e.displayWidth), want: C.ENEMY_KINDS.erratic.drawn, body: Math.round(e.body.width), size: C.ENEMY_KINDS.erratic.size };
  s.spawner.clear();
  return out;
`);
check('기행종: drawn at its picture size over its own body, crouched until it leaps, then its leap',
  hopper.standing === hopper.stand && hopper.seen.includes(hopper.leap) && hopper.drawn === hopper.want && hopper.body === hopper.size,
  JSON.stringify(hopper));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
