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

// --- 1. the clock sends the first in at firstMs, then one every intervalMs ---
const schedule = await run(`
  s.choosing = true;
  s.spawner.clear();
  const B = window.config.BOSS;
  s.spawner.untilBossMs = B.firstMs;
  const seen = [];
  // The first one and three more, a second at a time.
  const span = (B.firstMs + 3 * B.intervalMs) / 1000;
  const want = [0, 1, 2, 3].map(i => (B.firstMs + i * B.intervalMs) / 1000);
  for (let second = 1; second <= span; second++) {
    s.spawner.update(1000);
    const bosses = s.spawner.aliveBosses;
    if (bosses > seen.length) seen.push(second);
    // Clear the field so the ordinary spawn cap never gets in the way.
    for (const e of [...s.spawner.group.getChildren()]) if (e.active && !e.isBoss) e.recycle();
  }
  const out = { seen, want, every: B.intervalMs / 1000, alive: s.spawner.aliveBosses, nextIn: Math.round(s.spawner.nextBossMs / 1000) };
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('boss schedule:', JSON.stringify(schedule));
check('a 우두머리 arrives at the first mark and on every interval after',
  JSON.stringify(schedule.seen) === JSON.stringify(schedule.want),
  `at ${schedule.seen.join('s, ')}s (want ${schedule.want.join('s, ')}s)`);
check('the countdown to the next one is readable',
  schedule.nextIn >= 0 && schedule.nextIn <= schedule.every, `${schedule.nextIn}s to go`);

// --- 2. what it is ---
const stats = await run(`
  s.choosing = true;
  s.spawner.clear();
  const boss = s.spawner.spawnBoss();
  const grunt = s.spawner.group.get(0, 0);
  grunt.spawn(0, 0, s.player, 'grunt');
  const out = {
    kind: boss.kind, isBoss: boss.isBoss, hp: boss.hp, contact: boss.contactDamage, xp: boss.xpValue,
    size: Math.round(boss.displayWidth), gruntHp: grunt.hp,
    // A giant stands in a ring under its feet, not in the square a rare wears.
    ring: !!boss.footRing && boss.footRing.visible && !(boss.outline && boss.outline.visible),
    ringColour: boss.footRing ? boss.footRing.strokeColor.toString(16) : null,
    tex: boss.texture.key,
    rare: boss.rare,
  };
  grunt.recycle();
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('boss:', JSON.stringify(stats));
check('it is its own kind of enemy', stats.kind === 'boss' && stats.isBoss === true);
check('it is far tougher than anything else',
  stats.hp >= stats.gruntHp * 10, `${stats.hp} hp vs a grunt's ${stats.gruntHp}`);
check('and far bigger', stats.size >= 40, `${stats.size}px`);
check('it wears a gold ring', stats.ring === true && stats.ringColour === 'ffd34d',
  `#${stats.ringColour}`);
check('it is not a rare', stats.rare === false);

// --- 3. killing one always leaves a skill ---
const drops = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  let dropped = 0;
  const N = 40;
  for (let i = 0; i < N; i++) {
    const boss = s.spawner.spawnBoss();
    const before = s.combat.skillDrops.countActive(true);
    s.combat.hit(boss, 999999);
    if (s.combat.skillDrops.countActive(true) > before) dropped++;
    s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  }
  // And an ordinary kill still has to roll for it.
  let ordinary = 0;
  for (let i = 0; i < 400; i++) {
    const e = s.spawner.group.get(600, 600);
    e.spawn(600, 600, s.player, 'grunt');
    const before = s.combat.skillDrops.countActive(true);
    s.combat.hit(e, 999999);
    if (s.combat.skillDrops.countActive(true) > before) ordinary++;
    s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  }
  s.combat.gems.getChildren().forEach(g => g.active && g.collect());
  s.spawner.clear();
  s.choosing = false;
  return { N, dropped, ordinary };
`);
console.log('drops:', JSON.stringify(drops));
check('every 우두머리 kill leaves a skill', drops.dropped === drops.N,
  `${drops.dropped} of ${drops.N} kills`);
check('an ordinary kill still has to roll', drops.ordinary < 40,
  `${drops.ordinary} skills from 400 ordinary kills`);

// --- 4. it announces itself with the horn, and a toast in the corner ---
// A banner across the middle used to cover the field at the one moment it
// costs the most: where the player is standing and where the boss walks in.
// What it says goes in the top-right corner instead, out of the way.
const arrival = await run(`
  s.spawner.clear();
  // Its own health bar is a label on the 우두머리, not across the screen, so
  // it does not count as one here.
  const words = () => s.children.list.filter(o => o.type === 'Text')
    .map(o => o.text)
    .filter(w => !(w.indexOf('우두머리') === 0 && w.indexOf('/') > 0));

  window.__played = [];
  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  mgr.play = (key, cfg) => { window.__played.push({ key, volume: cfg && cfg.volume }); return orig(key, cfg); };

  const before = words();
  s.spawner.spawnBoss();
  const after = words();
  s.spawner.spawnBoss();
  const afterTwo = words();

  mgr.play = orig;
  const out = { before, after, afterTwo, played: window.__played.slice(),
                toasts: s.toasts.lines, corner: s.toasts.boxes.map((b) => ({ x: b.x, y: b.y })), width: s.cameras.main.width, height: s.cameras.main.height,
                pinned: s.children.list.filter(o => o.scrollFactorX === 0 && o.type === 'Rectangle').length };
  s.spawner.clear();
  return out;
`);
console.log('arrival:', JSON.stringify(arrival));
// The toast's own text sits inside its box, not loose on the screen.
check('a 우두머리 is announced by a toast, and nothing else is put on the screen',
  JSON.stringify(arrival.after) === JSON.stringify(arrival.before) && arrival.toasts.filter((l) => /우두머리/.test(l)).length >= 2,
  `${arrival.before.length} → ${arrival.after.length} labels; toasts: ${arrival.toasts.join(' | ')}`);
check('and the toasts sit in the top-right corner, out of the middle of the field',
  arrival.corner.length >= 1 && arrival.corner.every((c) => c.x > arrival.width * 0.6 && c.y < arrival.height * 0.4),
  JSON.stringify(arrival.corner));
check('it arrives on a horn instead',
  arrival.played.some((x) => x.key === 'sfx-boss-alert'),
  arrival.played.map((x) => x.key).join(' ') || 'nothing played');
check('loud enough to notice',
  arrival.played.find((x) => x.key === 'sfx-boss-alert')?.volume === 0.6,
  `volume=${arrival.played.find((x) => x.key === 'sfx-boss-alert')?.volume}`);
await shot('boss-03-arrival');

// --- 5. the debug key and the overlay ---
await fkey('F1', 112);
await run(`s.choosing = true; s.spawner.clear(); return 1;`);
await fkey('F10', 121);
const debug = await run(`
  const out = { bosses: s.spawner.aliveBosses, text: s.debug.label.text };
  s.choosing = false;
  return out;
`);
check('F10 sends one in', debug.bosses === 1, `${debug.bosses} on the field`);
check('the overlay counts them', /우두머리 \d+/.test(debug.text),
  debug.text.split('\n').find(l => /우두머리/.test(l))?.trim());
await shot('boss-01-overlay');
await fkey('F1', 112);

// --- 6. a live minute really does produce one ---
await run(`
  s.spawner.clear();
  s.spawner.untilBossMs = window.config.BOSS.intervalMs;
  s.player.setInvulnerable(true);
  window.__bosses = 0;
  const spawn = s.spawner.spawnBoss.bind(s.spawner);
  s.spawner.spawnBoss = () => { window.__bosses++; return spawn(); };
  // Wind the clock to just before the mark; the run does the last bit itself.
  s.spawner.untilBossMs = 2000;
  return 1;
`);
await sleep(3500);
const live = await run(`
  return { spawned: window.__bosses, alive: s.spawner.aliveBosses, over: s.over };
`);
console.log('live minute:', JSON.stringify(live));
check('the running game sends one in by itself',
  live.spawned >= 1 && live.alive >= 1 && live.over === false,
  `${live.spawned} spawned, ${live.alive} on the field`);
await shot('boss-02-live');

// --- 7. the ring of bolts it throws on its own clock ---
// Stepped a frame at a time: Enemy.update clamps a delta to 50ms, so one
// ten-second step would be one frame's worth of countdown.
const ring = await run(`
  s.choosing = true;
  // One of three since 0.137: this section is about the ring.
  window.__bossCasts ??= window.config.ENEMY_KINDS.boss.casts;
  window.config.ENEMY_KINDS.boss.casts = { ring: 1, laser: 0, leap: 0 };
  s.spawner.clear();
  s.combat.enemyShots.getChildren().forEach(b => b.active && b.disableBody(true, true));

  const p = s.player;
  p.setInvulnerable(true);
  const boss = s.spawner.spawnBoss();
  boss.setPosition(p.x + 300, p.y);
  boss.target = p;

  const spec = window.config.ENEMY_KINDS.boss.volley;
  const step = (ms) => { for (let i = 0; i < ms / 40; i++) boss.update(0, 40); };

  step(spec.cooldownMs - 400);
  const early = s.combat.enemyShots.countActive(true);
  step(800);

  const bolts = s.combat.enemyShots.getChildren().filter(b => b.active);
  const angles = bolts
    .map(b => Math.round(Math.atan2(b.body.velocity.y, b.body.velocity.x) * 180 / Math.PI))
    .sort((a, b) => a - b);
  const gaps = angles.slice(1).map((a, i) => a - angles[i]);
  const speeds = [...new Set(bolts.map(b => Math.round(Math.hypot(b.body.velocity.x, b.body.velocity.y))))];

  s.combat.enemyShots.getChildren().forEach(b => b.active && b.disableBody(true, true));
  s.spawner.clear();
  s.choosing = false;
  return { spec, early, fired: bolts.length, gaps, speeds };
`);
console.log('ring:', JSON.stringify(ring));
// The gap between rings is tuned in balance.ts, so this reads it rather
// than repeating it: what matters is that it waits, not what it waits for.
check('a 우두머리 holds its ring until its own clock comes round',
  ring.early === 0 && ring.spec.cooldownMs > 0,
  `nothing in the first ${ring.spec.cooldownMs - 400}ms of its ${ring.spec.cooldownMs}ms`);
check('then throws one bolt for every step of the circle',
  ring.fired === ring.spec.count && ring.spec.count === 18,
  `${ring.fired} bolts`);
check('spread evenly all the way round, none of them aimed',
  ring.gaps.length === ring.spec.count - 1 &&
    ring.gaps.every((g) => Math.abs(g - 360 / ring.spec.count) <= 1),
  `gaps of ${[...new Set(ring.gaps)].join(', ')}°`);
check('and every one of them at the tuned speed',
  ring.speeds.length === 1 && ring.speeds[0] === ring.spec.speed,
  `${ring.speeds.join('/')}px/s against ${ring.spec.speed}`);
await shot('boss-03-ring');

// --- 8. it wears the survivor's own health bar ---
// Everything else on the field is read by how much of it there is. A
// 우두머리 is read by how much of it is left, which needs a number.
const plate = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.spawner.seed(0);
  const p = s.player;
  const boss = s.spawner.spawnBoss();
  boss.setPosition(p.x + 150, p.y - 40);
  boss.target = p;
  boss.update(0, 16);

  const full = { text: boss.plate.text, plate: boss.plate.visible, bar: boss.healthBar.visible,
                 above: boss.plate.y < boss.y, hp: boss.hp, max: boss.maxHp };
  // No crit: one would double the hit and finish it off.
  const crit = window.config.PLAYER.critChance;
  window.config.PLAYER.critChance = 0;
  s.combat.hit(boss, Math.floor(boss.maxHp * 0.6));
  window.config.PLAYER.critChance = crit;
  boss.update(0, 16);
  const hurt = { text: boss.plate.text, hp: boss.hp, max: boss.maxHp };

  s.spawner.spawnBurst(1, 'grunt');
  const grunt = s.spawner.group.getChildren().find(x => x.active && !x.isBoss);
  grunt.setPosition(p.x - 150, p.y);
  grunt.update(0, 16);
  const ordinary = { plate: grunt.plate?.visible ?? false, bar: grunt.healthBar?.visible ?? false };

  return { full, hurt, ordinary };
`);
console.log('boss plate:', JSON.stringify(plate));
check('a 우두머리 carries a bar and a line, the way the survivor does',
  plate.full.plate === true && plate.full.bar === true && plate.full.above === true,
  `"${plate.full.text}" above it`);
check('which reads its name, and only that — the bar says what is left (0.139)',
  plate.full.text === '우두머리',
  plate.full.text);
check('and empties as it is worn down',
  plate.hurt.text === '우두머리' &&
    plate.hurt.hp < plate.full.hp,
  `${plate.full.hp} -> ${plate.hurt.hp} of ${plate.hurt.max}`);
check('nothing below that rank carries one',
  plate.ordinary.plate === false && plate.ordinary.bar === false,
  'an ordinary enemy has neither');
await shot('boss-04-bar');

const after = await run(`
  const boss = s.spawner.group.getChildren().find(x => x.active && x.isBoss);
  s.combat.hit(boss, 999999);
  const out = { plate: boss.plate.visible, bar: boss.healthBar.visible, active: boss.active };
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
check('and it goes with the 우두머리 that wore it',
  after.active === false && after.plate === false && after.bar === false,
  'bar and line both gone');

// --- 6. a fat giant: it strides while it walks, and spins as it throws ---
const motion = await run(`
  s.choosing = true;
  window.__bossCasts ??= window.config.ENEMY_KINDS.boss.casts;
  window.config.ENEMY_KINDS.boss.casts = { ring: 1, laser: 0, leap: 0 };
  s.spawner.clear();
  s.player.setInvulnerable(true);
  const p = s.player;
  const boss = s.spawner.group.get(p.x + 260, p.y);
  boss.spawn(p.x + 260, p.y, p, 'boss', { fireShot: () => {} });
  const G = window.config.ENEMY_KINDS.boss.giant;
  const seen = new Set([boss.texture.key]);
  // Frame-sized steps: Enemy.update clamps a longer one.
  for (let t = 0; t < G.stepMs * 6; t += 16) { boss.update(0, 16); seen.add(boss.texture.key); }
  const drawn = Math.round(boss.displayWidth);
  // Its ring, now: it turns as it throws.
  boss.volleyCooldownMs = 0;
  boss.update(0, 16);
  return { seen: [...seen], drawn, want: G.drawn, base: window.config.ENEMY_KINDS.boss.texture,
           spinning: !!boss.spin, spinMs: G.spinMs };
`);
// Mid-turn it shows its side or its back, never tipped over.
const turning = [];
for (let i = 0; i < 6; i++) {
  await sleep(motion.spinMs / 8);
  turning.push(await run(`const b = s.spawner.group.getChildren().find((e) => e.active && e.kind === 'boss');
    return b ? { key: b.texture.key, flip: b.flipX, angle: b.angle, scaleX: b.scaleX } : null;`));
}
await sleep(motion.spinMs);
const settled = await run(`
  const boss = s.spawner.group.getChildren().find((e) => e.active && e.kind === 'boss');
  const out = { angle: boss ? boss.angle : null, spinning: boss ? !!boss.spin : null,
                key: boss ? boss.texture.key : null, flip: boss ? boss.flipX : null };
  s.spawner.clear();
  s.player.setInvulnerable(false);
  s.choosing = false;
  return out;
`);
console.log('motion:', JSON.stringify({ motion, turning, settled }));
check('the 우두머리 is drawn as a giant, wider than its body for hits',
  motion.drawn === motion.want && motion.seen.includes(motion.base), `${motion.drawn}px`);
check('and steps through its walking pictures as it walks',
  motion.seen.length === 3, motion.seen.join(' / '));
check('it turns round on the spot as it throws its ring: side on, from behind, the other side',
  motion.spinning === true &&
    turning.some((p) => p?.key.endsWith('-stride-3') && !p.flip) &&
    turning.some((p) => p?.key.endsWith('-stride-4')) &&
    turning.some((p) => p?.key.endsWith('-stride-3') && p.flip),
  turning.map((p) => p && `${p.key.replace('tex-enemy-boss', '') || 'front'}${p.flip ? '(mirrored)' : ''}`).join(' / '));
check('without tipping over or being squashed (its body for hits stays as it is)',
  turning.every((p) => p && p.angle === 0 && p.scaleX === 1));
// Then it walks on: standing or a foot out, but facing front and not mirrored.
check('and faces front again once the turn is done',
  settled.spinning === false && !/-stride-[34]$/.test(settled.key) && settled.flip === false, JSON.stringify(settled));
await shot('boss-05-giant');

// --- its line is its name alone, whatever a hit took off (0.139: no count) ---
const wholeHp = await run(`
  s.choosing = true;
  s.spawner.clear();
  const boss = s.spawner.spawnBoss();
  boss.takeDamage(12.37);
  boss.update(0, 16);
  const text = boss.plate.text;
  s.spawner.clear();
  s.choosing = false;
  return { text, hp: boss.hp };
`);
check('the 우두머리’s line shows no number, however its health stands', wholeHp.text === '우두머리' && !/\d/.test(wholeHp.text),
  wholeHp.text);

// --- 타격 reaches what is drawn: a 우두머리's picture is far wider than its
// body, and a swing that visibly cut into it used to miss until its middle
// was in reach. Now any of it inside the arc is hit, and nothing beyond. ---
const reach = await run(`
  s.choosing = true;
  s.spawner.clear();
  const p = s.player;
  const w = s.weapons.find((x) => x.definition.id === 'meleeStrike');
  const range = s.progression.rangeFor('meleeStrike');
  const ctx = { origin: p, enemies: s.spawner.group, damage: 10, cooldownMs: 0, range,
    projectileSpeed: 0, orbitSpeed: 0, chainCount: 0, pierceCount: 0, orbCount: 0,
    hit: s.combat.hit, enemyShots: s.combat.enemyShots, mastered: false };
  const crit = window.config.PLAYER.critChance;
  window.config.PLAYER.critChance = 0;
  // One enemy of a kind at a distance straight to the right; is it hit by one swing?
  const swingAt = (kind, centre) => {
    s.spawner.clear();
    const e = kind === 'boss' ? s.spawner.spawnBoss() : s.spawner.group.get(0, 0);
    if (kind !== 'boss') e.spawn(0, 0, p, kind);
    e.setPosition(p.x + centre, p.y);
    e.body.reset(e.x, e.y);
    e.body.stop();
    e.target = undefined;
    e.hp = e.maxHp = 1e9;
    const before = e.hp;
    w.sinceSwingMs = 1e9;
    w.update(16, ctx);
    return before - e.hp > 0;
  };
  const boss = window.config.ENEMY_KINDS.boss, grunt = window.config.ENEMY_KINDS.grunt;
  // What is drawn is what is reached (MeleeStrike reads Enemy.shownRadius).
  const bossR = (boss.giant?.drawn ?? boss.size) / 2, gruntR = (grunt.drawn ?? grunt.size) / 2;
  const out = {
    range, bossR, gruntR,
    bossEdgeIn: swingAt('boss', range + bossR * 0.8),
    bossOut: swingAt('boss', range + bossR + 8),
    gruntEdgeIn: swingAt('grunt', range + gruntR - 2),
    gruntOut: swingAt('grunt', range + gruntR + 6),
  };
  window.config.PLAYER.critChance = crit;
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('melee reach:', JSON.stringify(reach));
check('타격 hits a 우두머리 as soon as the swing reaches its picture, not only its middle',
  reach.bossEdgeIn === true && reach.bossR > 0, JSON.stringify(reach));
check('and nothing past the edge of what is drawn, 우두머리 or not',
  reach.bossOut === false && reach.gruntOut === false && reach.gruntEdgeIn === true, JSON.stringify(reach));

// --- 0.137: each time, the ring, a laser or a leap — the last two shown first ---
const casts = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.enemyShots.getChildren().forEach(b => b.active && b.disableBody(true, true));
  const K = window.config.ENEMY_KINDS.boss;
  if (window.__bossCasts) K.casts = window.__bossCasts;
  const keep = K.casts;
  const p = s.player;
  const struck = [];
  const hooks = { fireShot: s.combat.fireEnemyShot, strikeSurvivor: (d) => struck.push(d) };
  const step = (e, ms) => { for (let t = 0; t < ms; t += 40) e.update(0, 40); };
  const put = (dx, dy) => { const b = s.spawner.group.get(p.x + dx, p.y + dy); b.spawn(p.x + dx, p.y + dy, p, 'boss', hooks); return b; };
  const out = { weights: { ...keep }, wantLaser: K.volley.damage, wantLeap: K.contactDamage * K.leap.contactTimes };
  try {
    // The laser: its line shown for its aim, nothing meanwhile, then the ring's hit all along it.
    K.casts = { ring: 0, laser: 1, leap: 0 };
    let b = put(300, 0);
    b.volleyCooldownMs = 0; b.update(0, 40);
    out.laser = { cast: b.cast?.kind };
    step(b, K.laser.aimMs - 200);
    out.laser.shown = b.castFx?.visible === true;
    out.laser.early = struck.length;
    // It walks on while it aims (0.138): stepped by hand, no physics frame passes, so read its pace.
    out.laser.walked = Math.hypot(b.body.velocity.x, b.body.velocity.y) > 0;
    out.laser.bolts = s.combat.enemyShots.countActive(true);
    step(b, 400);
    out.laser.hit = struck.splice(0);
    // Its line is set as it aims: a step aside is a miss.
    b.volleyCooldownMs = 0; b.update(0, 40);
    const home = { x: p.x, y: p.y };
    p.body.reset(p.x, p.y + 200);
    step(b, K.laser.aimMs + 200);
    out.laser.dodged = struck.splice(0).length;
    p.body.reset(home.x, home.y);
    b.recycle();
    // No end to it (0.141): from far off the screen it still reaches.
    b = put(1400, 0);
    b.volleyCooldownMs = 0; b.update(0, 40);
    step(b, K.laser.aimMs + 200);
    out.laser.far = struck.splice(0).length;
    b.recycle();
    // The leap: where the survivor stood, shown for its aim; then it lands there and hits round it.
    K.casts = { ring: 0, laser: 0, leap: 1 };
    b = put(250, 0);
    b.volleyCooldownMs = 0; b.update(0, 40);
    const spot = { x: b.cast?.toX, y: b.cast?.toY };
    out.leap = { cast: b.cast?.kind, onSurvivor: Math.hypot(spot.x - p.x, spot.y - p.y) < 1 };
    step(b, K.leap.aimMs - 200);
    out.leap.shown = b.castFx?.visible === true;
    out.leap.early = struck.length;
    out.leap.walked = Math.hypot(b.body.velocity.x, b.body.velocity.y) > 0;
    // Halfway through the jump it is up in its arc, above the straight line, and its body hurts no one.
    step(b, 200 + K.leap.leapMs / 2);
    out.leap.midair = b.airborne === true;
    const groundY = b.cast ? b.cast.fromY + (b.cast.toY - b.cast.fromY) * 0.5 : b.y;
    out.leap.above = groundY - b.y > K.leap.height * 0.5;
    step(b, K.leap.leapMs / 2 + 120);
    out.leap.landed = Math.hypot(b.x - spot.x, b.y - spot.y) < 2;
    out.leap.hit = struck.splice(0);
    b.recycle();
    // Too far for a leap (past its maxDistance): with only the leap to choose, it throws the ring.
    b = put(K.leap.maxDistance + 150, 0);
    b.volleyCooldownMs = 0; b.update(0, 40);
    out.far = { cast: b.cast?.kind ?? 'ring', bolts: s.combat.enemyShots.countActive(true) };
    b.recycle();
  } finally {
    K.casts = keep;
    s.combat.enemyShots.getChildren().forEach(b => b.active && b.disableBody(true, true));
    s.spawner.clear();
    s.choosing = false;
  }
  return out;
`);
console.log('casts:', JSON.stringify(casts));
check('a 우두머리 picks the ring, the laser or the leap, each as likely',
  casts.weights.ring > 0 && casts.weights.ring === casts.weights.laser && casts.weights.laser === casts.weights.leap,
  JSON.stringify(casts.weights));
check('its laser shows its line while it aims, walking on, hitting nothing yet',
  casts.laser.cast === 'laser' && casts.laser.shown && casts.laser.early === 0 && casts.laser.walked && casts.laser.bolts === 0,
  JSON.stringify(casts.laser));
check('then hits all along it at once for the ring’s damage — and misses one who stepped aside',
  casts.laser.hit.length === 1 && casts.laser.hit[0] === casts.wantLaser && casts.laser.dodged === 0 && casts.laser.far === 1,
  JSON.stringify(casts.laser));
check('its leap marks where the survivor stands, walking on while it aims, then rises in an arc that touches no one',
  casts.leap.cast === 'leap' && casts.leap.shown && casts.leap.onSurvivor && casts.leap.early === 0 && casts.leap.walked &&
    casts.leap.midair && casts.leap.above,
  JSON.stringify(casts.leap));
check('then lands there, hitting round it for twice its contact damage',
  casts.leap.landed && casts.leap.hit.length === 1 && casts.leap.hit[0] === casts.wantLeap, JSON.stringify(casts.leap));
check('and never leaps at a survivor out of its reach', casts.far.cast === 'ring' && casts.far.bolts > 0, JSON.stringify(casts.far));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
