import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// The run's main skill takes every level-up; a skill at SKILL_MASTERY.level
// awakens, with a show, and does its extra thing; the 척추 doubles rares.

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
const run = (body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);

await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(3000);
await run(`s.player.setInvulnerable(true); return 1;`);

// --- 1. level-ups go to the main skill, whatever else is picked up ---
const levels = await run(`
  s.choosing = true;
  s.onSkillCollected('fireball');
  s.pendingChoices.length = 0;
  const seen = [];
  const queue = s.queueChoice;
  s.queueChoice = (request) => seen.push(request.skill);
  for (let i = 0; i < 12; i++) s.onLevelUp(2 + i);
  s.queueChoice = queue;
  s.writeSave();
  const saved = JSON.parse(localStorage.getItem('exiled-survivors:save:v1'));
  s.choosing = false;
  return { main: s.mainSkill, seen, savedMain: saved.main, owned: [...s.owned] };
`);
console.log('levels:', JSON.stringify(levels));
check('the first skill is the main one, and a skill picked up later does not take its place',
  levels.main === 'meleeStrike' && levels.owned.includes('fireball'), JSON.stringify(levels.owned));
check('every level-up goes to the main skill',
  levels.seen.length === 12 && levels.seen.every((id) => id === 'meleeStrike'), levels.seen.join(','));
check('and the save remembers which it is', levels.savedMain === 'meleeStrike');

// --- 2. reaching the level awakens it, loudly ---
const woke = await run(`
  const L = window.config.SKILL_MASTERY.level;
  const id = 'fireball';
  while (s.progression.levelFor(id) < L - 1) s.progression.apply(id, 'damage');
  const before = s.awakened.has(id);
  s.onUpgradePicked(id, 'damage');
  return { L, level: s.progression.levelFor(id), before, after: s.awakened.has(id),
           banner: s.masteryBanner?.text ?? '' };
`);
await sleep(500);
await shot('mastery-01-banner');
console.log('woke:', JSON.stringify(woke));
check('a skill reaching the level is awakened, once',
  woke.level === woke.L && !woke.before && woke.after, JSON.stringify(woke));
check('and says so in a banner of its own', /화염구/.test(woke.banner) && /각성/.test(woke.banner), woke.banner);
const hud = await run(`
  const i = s.loadout().findIndex((l) => l.id === 'fireball');
  const slot = s.hud.slots[i];
  s.hud.point(i);
  const card = s.hud.cardText.text;
  s.hud.point(-1);
  return { stroke: slot.plate.strokeColor, level: slot.level.style.color, card };
`);
check('the HUD wears it in gold, and its card says what it now does',
  hud.level === '#ffd76a' && /각성/.test(hud.card) && /화염지대/.test(hud.card), JSON.stringify(hud));

// --- 3. what each awakening does ---
const effects = await run(`
  s.choosing = true;
  s.spawner.clear();
  const p = s.player, c = s.combat, g = s.spawner.group;
  const put = (dx, dy, hp = 1e9) => {
    const e = g.get(p.x + dx, p.y + dy);
    e.spawn(p.x + dx, p.y + dy, p, 'brute', undefined, false, hp / window.config.ENEMY_KINDS.brute.maxHp);
    return e;
  };
  const ctx = (over) => ({ origin: p, enemies: g, damage: 10, cooldownMs: 0, range: 220, projectileSpeed: 400,
    chainCount: 4, pierceCount: 0, orbCount: 2, orbitSpeed: 100, extraProjectiles: 0,
    hit: c.hit, mastered: true, enemyShots: c.enemyShots, ...over });
  const weapon = (id) => { s.acquire(id); return s.weapons.find((w) => w.definition.id === id); };
  const out = {};

  // 타격: a shot inside the swing is struck down.
  const melee = weapon('meleeStrike');
  const target = put(60, 0);
  c.fireEnemyShot(p.x + 40, p.y, Math.PI, window.config.ENEMY_KINDS.shooter.shot);
  const shotsUp = () => c.enemyShots.getChildren().filter((x) => x.active).length;
  out.shotsBefore = shotsUp();
  melee.strikes = 0;
  melee.swing(ctx({ mastered: false }), target);
  out.shotsPlain = shotsUp();
  melee.swing(ctx({}), target);
  out.shotsAfter = shotsUp();
  out.strikes = melee.strikes;
  s.spawner.clear();
  c.enemyShots.getChildren().forEach((x) => x.active && x.despawn());

  // 연쇄번개: two enemies, five links — back and forth when awakened.
  const chain = weapon('chainLightning');
  const a = put(80, 0), b = put(110, 0);
  const count = () => { let n = 0; const real = c.hit; return { ctx: ctx({ hit: (e, amt) => { n++; real(e, amt); } }), n: () => n }; };
  let probe = count();
  chain.strike({ ...probe.ctx, mastered: false }, a);
  out.chainPlain = probe.n();
  probe = count();
  chain.strike(probe.ctx, a);
  out.chainAwake = probe.n();
  s.spawner.clear();

  // 화염구: the burst leaves fire that keeps burning.
  const burnt = put(300, 0);
  const hp0 = burnt.hp;
  const fake = { active: true, damage: 10, chillMs: 0, freezeMs: 0, blastRadius: 30, fireZoneDps: 40,
    registerHit: () => true, consumePierce: () => false, despawn() { this.active = false; } };
  c.onProjectileHit(fake, burnt);
  out.zones = c.fireZones.length;
  const hp1 = burnt.hp;
  for (let t = 0; t < 1000; t += 50) c.tickFireZones(50);
  out.burnt = hp1 - burnt.hp;
  out.wantBurn = 40;
  for (let t = 0; t < 6000; t += 50) c.tickFireZones(50);
  out.zonesLater = c.fireZones.length;
  s.spawner.clear();

  // 얼음창: a chilled enemy struck again is frozen; an unchilled one is not.
  const cold = put(300, 0), warm = put(-300, 0);
  cold.chill(2000);
  const spear = () => ({ active: true, damage: 1, chillMs: 2000, freezeMs: 100, blastRadius: 0, fireZoneDps: 0,
    registerHit: () => true, consumePierce: () => true, despawn() {} });
  c.onProjectileHit(spear(), cold);
  c.onProjectileHit(spear(), warm);
  out.frozen = cold.isFrozen;
  out.warmFrozen = warm.isFrozen;
  s.spawner.clear();

  // 공허구체: an enemy near an orb is drawn in.
  const orb = weapon('voidOrb');
  orb.update(16, ctx({ orbCount: 1, range: 120 }));
  const o = orb.active[0];
  const near = put(o.x - p.x + 60, o.y - p.y);
  const d0 = Math.hypot(near.x - o.x, near.y - o.y);
  orb.pull(ctx({}), 1, 1000);
  out.pulled = d0 - Math.hypot(near.x - o.x, near.y - o.y);
  out.pullWant = window.config.SKILL_MASTERY.voidPull.speed;
  s.spawner.clear();

  // 낙뢰: two bolts a cast.
  const thunder = weapon('thunderStrike');
  put(80, 0); put(-80, 0);
  thunder.update(16, ctx({ mastered: false }));
  out.boltsPlain = thunder.lastStrikes;
  thunder.update(16, ctx({}));
  out.boltsAwake = thunder.lastStrikes;
  out.boltsWant = window.config.SKILL_MASTERY.thunderBolts;
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('effects:', JSON.stringify(effects));
check('타격: an enemy shot inside the swing is destroyed — only when awakened',
  effects.shotsBefore >= 1 && effects.shotsPlain === effects.shotsBefore && effects.shotsAfter === effects.shotsBefore - 1 &&
    effects.strikes === 1, JSON.stringify(effects));
check('연쇄번개: may chain back to an enemy it has struck',
  effects.chainPlain === 2 && effects.chainAwake === 5, `${effects.chainPlain} → ${effects.chainAwake}`);
check('화염구: the burst leaves a fire that burns at its share a second, then goes out',
  effects.zones === 1 && Math.abs(effects.burnt - effects.wantBurn) <= 2 && effects.zonesLater === 0,
  `burnt ${effects.burnt} in 1s, want ${effects.wantBurn}`);
check('얼음창: an enemy already chilled is frozen; one that was not, is not',
  effects.frozen === true && effects.warmFrozen === false);
check('공허구체: an enemy near an orb is drawn toward it',
  Math.abs(effects.pulled - effects.pullWant) < 1, `${effects.pulled.toFixed(1)}px in 1s, want ${effects.pullWant}`);
check('낙뢰: more bolts fall at once',
  effects.boltsPlain === 1 && effects.boltsAwake === effects.boltsWant, `${effects.boltsPlain} → ${effects.boltsAwake}`);

// --- 4. 척추 ---
const spine = await cdp.evaluate(`(() => {
  const c = window.config;
  return { scale: c.boneBonusFor(['spine']).rareChanceScale, stack: c.BONES.spine.stackable,
           detail: c.BONES.spine.detail, both: c.boneBonusFor(['spine', 'rib']).rareChanceScale };
})()`);
await run(`s.scene.restart({ save: null, bones: ['spine'] }); return 1;`);
await sleep(1500);
const rares = await run(`return { got: s.spawner.rareChance, want: Math.min(1, window.config.rareChanceAt(s.spawner.clockMs) * 2) };`);
check('척추 doubles the rare chance, and only one goes into a run',
  spine.scale === 2 && spine.both === 2 && spine.stack === false && Math.abs(rares.got - rares.want) < 1e-9,
  JSON.stringify({ spine, rares }));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
