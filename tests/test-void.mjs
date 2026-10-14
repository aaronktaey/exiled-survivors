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
const popup = () => cdp.evaluate(`(() => {
  const g = window.game;
  if (!g.scene.isActive('UpgradeScene')) return { open: false };
  const u = g.scene.getScene('UpgradeScene');
  return { open: true, skill: u.payload.skill, title: u.payload.title, selected: u.selected,
           cards: u.cards.map(c => ({ id: c.option.id, label: c.option.label })) };
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
/** Where the orbs are, relative to the player. */
const orbState = () => run(`
  const w = s.weapons.find(w => w.definition.id === 'voidOrb');
  const p = s.player;
  const orbs = w.active.map(o => ({
    d: Math.round(Math.hypot(o.x - p.x, o.y - p.y)),
    a: Math.round((Math.atan2(o.y - p.y, o.x - p.x) * 180) / Math.PI),
    tex: o.texture.key,
    size: Math.round(o.displayWidth),
  }));
  return { count: orbs.length, orbs, stats: s.progression.statsFor('voidOrb') };
`);

await cdp.send('Page.reload', {});
await sleep(3800);
await drain();

// --- 1. the skill is registered as asked ---
const grant = await run(`
  s.onSkillCollected('voidOrb');
  const w = s.weapons.find(w => w.definition.id === 'voidOrb');
  const Progression = Object.getPrototypeOf(s.progression).constructor;
  return {
    name: w.definition.name, tags: w.definition.tags, upgrades: w.definition.upgrades,
    stats: s.progression.statsFor('voidOrb'),
    base: new Progression().statsFor('voidOrb'),
    popup: window.game.scene.isActive('UpgradeScene'),
  };
`);
console.log('granted:', JSON.stringify(grant));
check('공허구체 is 공허·주문·투사체',
  grant.name === '공허구체' && JSON.stringify(grant.tags) === JSON.stringify(['공허', '주문', '투사체']),
  `${grant.tags}`);
check('it is granted at its configured base line',
  JSON.stringify(grant.stats) === JSON.stringify(grant.base) && grant.stats.orbCount === 2,
  `orbs=${grant.stats.orbCount} dmg=${grant.stats.damage} radius=${grant.stats.range} speed=${grant.stats.projectileSpeed}`);
check('first pickup opens no popup', grant.popup === false);

// --- 2. the orbs ride the circle, evenly spaced ---
await sleep(300);
const placed = await orbState();
console.log('orbs:', JSON.stringify(placed));
check('one orb per orbCount is in the air', placed.count === placed.stats.orbCount,
  `${placed.count} orbs`);
check('they ride at the configured radius',
  placed.orbs.every(o => Math.abs(o.d - placed.stats.range) <= 2),
  placed.orbs.map(o => `${o.d}px`).join(' / '));
check('two orbs sit opposite each other',
  Math.abs(Math.abs(placed.orbs[0].a - placed.orbs[1].a) - 180) < 3,
  `${placed.orbs[0].a}° and ${placed.orbs[1].a}°`);
check('they are drawn from the void orb texture',
  placed.orbs.every(o => o.tex === 'tex-void-orb' && o.size === 18),
  `${placed.orbs[0].tex} at ${placed.orbs[0].size}px`);

// --- 3. clockwise, at the configured speed ---
const sweep = await run(`
  const w = s.weapons.find(w => w.definition.id === 'voidOrb');
  const st = s.progression.statsFor('voidOrb');
  const ctx = { origin: s.player, enemies: s.spawner.group, damage: 0, cooldownMs: 1000,
    range: st.range, projectileSpeed: 0, orbitSpeed: st.orbitSpeed, chainCount: 0, pierceCount: 0,
    orbCount: st.orbCount, hit: () => {} };
  const angleNow = () => Math.atan2(w.active[0].y - s.player.y, w.active[0].x - s.player.x);
  const before = angleNow();
  // A quarter of a second of orbit, stepped by hand.
  for (let i = 0; i < 10; i++) w.update(25, ctx);
  const after = angleNow();
  const TAU = Math.PI * 2;
  const wrap = (r) => ((r + Math.PI) % TAU + TAU) % TAU - Math.PI;
  const toDeg = (r) => (r * 180) / Math.PI;
  const stepped = wrap(after - before);
  const expected = (st.orbitSpeed / st.range) * 0.25;
  return { deg: Number(toDeg(stepped).toFixed(1)), expectedDeg: Number(toDeg(expected).toFixed(1)) };
`);
console.log('sweep:', JSON.stringify(sweep));
// Screen y grows downward, so a growing angle is clockwise on screen.
check('the orbs sweep clockwise', sweep.deg > 0, `${sweep.deg}° in 250ms`);
check('at the speed its stats ask for', Math.abs(sweep.deg - sweep.expectedDeg) < 2,
  `${sweep.deg}° vs ${sweep.expectedDeg}° expected`);

// --- 4. they follow the player ---
const followed = await run(`
  const w = s.weapons.find(w => w.definition.id === 'voidOrb');
  const st = s.progression.statsFor('voidOrb');
  const ctx = { origin: s.player, enemies: s.spawner.group, damage: 0, cooldownMs: 1000,
    range: st.range, projectileSpeed: 0, orbitSpeed: st.orbitSpeed, chainCount: 0, pierceCount: 0,
    orbCount: st.orbCount, hit: () => {} };
  s.player.setPosition(s.player.x + 400, s.player.y + 200);
  w.update(16, ctx);
  const p = s.player;
  return { far: w.active.map(o => Math.round(Math.hypot(o.x - p.x, o.y - p.y))) };
`);
check('the orbit follows the player', followed.far.every(d => Math.abs(d - placed.stats.range) <= 2),
  `${followed.far.join(' / ')}px from the player after a 450px jump`);

// --- 5. contact damage, once per cooldown rather than per frame ---
const contact = await run(`
  s.choosing = true;   // hold the scene's own weapons while we drive by hand
  s.spawner.clear();
  const w = s.weapons.find(w => w.definition.id === 'voidOrb');
  const st = s.progression.statsFor('voidOrb');
  const p = s.player;
  // Park an enemy right on the ring, where an orb has to sweep through it.
  const e = s.spawner.group.get(p.x + st.range, p.y);
  e.spawn(p.x + st.range, p.y, p);
  e.body.stop();
  e.target = undefined;
  const ctx = { origin: p, enemies: s.spawner.group, damage: st.damage,
    cooldownMs: s.progression.cooldownMsFor('voidOrb'), range: st.range,
    projectileSpeed: 0, orbitSpeed: st.orbitSpeed, chainCount: 0, pierceCount: 0,
    orbCount: st.orbCount, hit: s.combat.hit };
  const hpStart = e.hp;
  // Two seconds of orbiting, 16ms at a time.
  for (let i = 0; i < 125; i++) w.update(16, ctx);
  const out = { hpStart, hp: e.active ? e.hp : 0, cooldownMs: Math.round(ctx.cooldownMs),
                damage: ctx.damage };
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('contact:', JSON.stringify(contact));
const hits = (contact.hpStart - contact.hp) / contact.damage;
check('an orb hurts what it sweeps through', hits >= 1,
  `${hits} hits in 2s of orbiting`);
check('a pass through costs a hit, not a hit per frame', hits <= 4,
  `${hits} hits in 2s (a per-frame hit would be ~125)`);

// --- 5b. parked on the enemy: now the cooldown is what is being measured ---
const parked = await run(`
  s.choosing = true;
  s.spawner.clear();
  const w = s.weapons.find(w => w.definition.id === 'voidOrb');
  const st = s.progression.statsFor('voidOrb');
  const p = s.player;
  const e = s.spawner.group.get(p.x + st.range, p.y);
  e.spawn(p.x + st.range, p.y, p);
  e.body.stop();
  e.target = undefined;
  e.hp = 10000;
  // Speed 0 holds an orb on top of it, so only the re-hit timer matters.
  const ctx = { origin: p, enemies: s.spawner.group, damage: st.damage,
    cooldownMs: s.progression.cooldownMsFor('voidOrb'), range: st.range,
    projectileSpeed: 0, orbitSpeed: 0, chainCount: 0, pierceCount: 0, orbCount: st.orbCount, hit: s.combat.hit };
  w.angle = 0;   // orb 0 starts on the enemy
  const before = e.hp;
  for (let i = 0; i < 125; i++) w.update(16, ctx);
  const out = { hits: (before - e.hp) / st.damage, cooldownMs: Math.round(ctx.cooldownMs) };
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('parked:', JSON.stringify(parked));
check('a parked orb re-hits at its attack speed',
  Math.abs(parked.hits - 2000 / parked.cooldownMs) <= 1,
  `${parked.hits} hits in 2s at one per ${parked.cooldownMs}ms`);

// --- 6. a recycled enemy does not inherit the old one's cooldown ---
const recycled = await run(`
  s.choosing = true;
  s.spawner.clear();
  const w = s.weapons.find(w => w.definition.id === 'voidOrb');
  const st = s.progression.statsFor('voidOrb');
  const p = s.player;
  const ctx = { origin: p, enemies: s.spawner.group, damage: st.damage,
    cooldownMs: 100000, range: st.range, projectileSpeed: 0, orbitSpeed: 0, chainCount: 0,
    pierceCount: 0, orbCount: st.orbCount, hit: s.combat.hit };
  const place = () => {
    const e = s.spawner.group.get(w.active[0].x, w.active[0].y);
    e.spawn(w.active[0].x, w.active[0].y, p);
    e.body.stop();
    e.target = undefined;
    return e;
  };
  const first = place();
  w.update(16, ctx);
  const firstHp = first.hp;
  first.recycle();
  // Same pooled sprite, new life: the long cooldown must not carry over.
  const second = place();
  w.update(16, ctx);
  const out = { same: first === second, firstHp, secondHp: second.hp, full: second.hp + st.damage };
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('recycle:', JSON.stringify(recycled));
check('a respawned enemy is hit again straight away',
  recycled.same === true && recycled.secondHp < recycled.full,
  `same sprite=${recycled.same}, hp after re-spawn ${recycled.secondHp}`);

// --- 7. the upgrade screen: 구체 수 ---
await run(`s.onSkillCollected('voidOrb'); return 1;`);
await sleep(600);
const choice = await popup();
console.log('popup:', JSON.stringify(choice));
check('a repeat pickup opens the 공허구체 choice',
  choice.open === true && choice.skill === 'voidOrb' && choice.title === '공허구체');
check('it offers 공격력, 회전 속도, 구체 수',
  JSON.stringify(choice.cards?.map(c => c.id)) === JSON.stringify(['damage', 'orbitSpeed', 'orbCount']),
  choice.cards?.map(c => c.label).join(' | '));

// --- 8. the caret moves on the arrows, but they never confirm ---
await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(200);
const movedRight = await popup();
check('→ moves the caret', movedRight.open === true && movedRight.selected === 1,
  `selected=${movedRight.selected}`);
await cdp.tap('KeyD', 68, 'd');
await sleep(200);
const movedD = await popup();
check('D moves it too', movedD.open === true && movedD.selected === 2, `selected=${movedD.selected}`);
await cdp.tap('KeyA', 65, 'a');
await sleep(200);
const movedA = await popup();
check('A comes back', movedA.open === true && movedA.selected === 1, `selected=${movedA.selected}`);
await cdp.tap('KeyW', 87, 'w');
await cdp.tap('KeyS', 83, 's');
await sleep(250);
const afterWS = await popup();
check('W and S cannot confirm', afterWS.open === true, `popup still open=${afterWS.open}`);
await shot('void-01-choice');

// Space takes the highlighted card — 회전 속도, at index 1.
const beforePick = await run(`return s.progression.statsFor('voidOrb');`);
await cdp.tap('Space', 32, ' ');
await sleep(600);
const afterPick = await run(`return s.progression.statsFor('voidOrb');`);
check('Space takes the highlighted card',
  afterPick.orbitSpeed > beforePick.orbitSpeed && afterPick.orbCount === beforePick.orbCount,
  `orbit ${beforePick.orbitSpeed} -> ${afterPick.orbitSpeed}`);

// --- 9. 구체 수 +1 puts another orb in the air ---
await run(`s.onSkillCollected('voidOrb'); return 1;`);
await sleep(600);
await cdp.tap('Digit3', 51, '3');
await sleep(700);
const grown = await orbState();
console.log('after 구체 수 +1:', JSON.stringify(grown));
check('구체 수 +1 adds an orb', grown.count === 3 && grown.stats.orbCount === 3,
  `${grown.count} orbs`);
const spacing = grown.orbs
  .map((o) => (o.a + 360) % 360)
  .sort((a, b) => a - b)
  .map((a, i, all) => Math.round((all[(i + 1) % all.length] - a + 360) % 360));
check('three orbs are spaced 120° apart',
  spacing.every((gap) => Math.abs(gap - 120) <= 3),
  `gaps ${spacing.join('° / ')}°`);
await shot('void-02-orbs');

// --- 10. it joins the drop roll, with its own ground label ---
const rate = await run(`
  const seen = {};
  const N = 150000;
  let drops = 0;
  for (let i = 0; i < N; i++) {
    const d = s.rollSkillDrop();
    if (d) { drops++; seen[d.id] = (seen[d.id] ?? 0) + 1; }
  }
  return { rate: drops / N, seen, want: window.config.SKILL_DROP.chance };
`);
console.log('drop roll:', JSON.stringify(rate));
check('the total drop chance is the configured one', Math.abs(rate.rate - rate.want) < rate.want * 0.15,
  `measured ${(rate.rate * 100).toFixed(2)}%, configured ${(rate.want * 100).toFixed(2)}%`);
const kinds = Object.keys(rate.seen).length;
check('공허구체 joined the pool at an even share',
  Math.abs(rate.seen.voidOrb / (rate.rate * 150000) - 1 / kinds) < 0.25 / kinds,
  Object.entries(rate.seen).map(([k, n]) => `${k} ${n}`).join(' / '));

const label = await run(`
  s.combat.dropSkillAt(s.player.x + 220, s.player.y, {
    id: 'voidOrb', name: '공허구체', tags: ['공허','주문','투사체'],
    upgrades: ['damage','attackSpeed','orbCount'] });
  const d = s.combat.skillDrops.getChildren().find(x => x.active);
  return { label: d.nameplate.text, style: d.nameplate.style };
`);
check('its ground label reads 공허구체, in the ordinary dress',
  label.label === '공허구체' && label.style.plateAlpha === 0, `"${label.label}"`);

// --- 11. a real run with it ---
await run(`
  window.__kills = 0;
  const c = s.combat, orig = c.hit;
  c.hit = (e, d) => { const was = e.active; orig(e, d); if (was && !e.active) window.__kills++; };
  s.player.setInvulnerable(true);
  s.spawner.elapsedMs = 60000;
  return 1;
`);
await sleep(12000);
await drain();
const live = await run(`
  const w = s.weapons.find(w => w.definition.id === 'voidOrb');
  return { kills: window.__kills, orbs: w.active.length, alive: s.spawner.alive, over: s.over,
           weapons: s.weapons.map(w => w.definition.name) };
`);
console.log('after 12s:', JSON.stringify(live));
check('it keeps orbiting and killing in a real run',
  live.kills > 0 && live.orbs === 3 && live.over === false,
  `kills=${live.kills} orbs=${live.orbs} weapons=${live.weapons}`);
await shot('void-03-live');

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
