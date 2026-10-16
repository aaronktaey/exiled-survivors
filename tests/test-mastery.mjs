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

  // 화염구: the burst leaves fire that keeps burning. Crits off for the count.
  const critWas = window.config.PLAYER.critChance;
  window.config.PLAYER.critChance = 0;
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
  window.config.PLAYER.critChance = critWas;
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

  // 공허구체: an enemy just past the orbit is drawn toward the survivor; one far off is not.
  const orb = weapon('voidOrb');
  const pullReach = window.config.SKILL_MASTERY.voidPull.reach;
  const near = put(120 + pullReach - 10, 0), far = put(-(120 + pullReach + 80), 0);
  const d0 = Math.hypot(near.x - p.x, near.y - p.y), f0 = Math.hypot(far.x - p.x, far.y - p.y);
  orb.pull(ctx({ range: 120 }), 1, 1000);
  out.pulled = d0 - Math.hypot(near.x - p.x, near.y - p.y);
  out.farPulled = f0 - Math.hypot(far.x - p.x, far.y - p.y);
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
check('공허구체: an enemy near the orbit is drawn toward the survivor, one far off is not',
  Math.abs(effects.pulled - effects.pullWant) < 1 && Math.abs(effects.farPulled) < 1e-6,
  `${effects.pulled.toFixed(1)}px in 1s, want ${effects.pullWant}; far ${effects.farPulled}`);
check('낙뢰: more bolts fall at once',
  effects.boltsPlain === 1 && effects.boltsAwake === effects.boltsWant, `${effects.boltsPlain} → ${effects.boltsAwake}`);

// --- 3b. a skill with every upgrade taken: a level is a potion ---
const maxed = await run(`
  s.choosing = true;
  s.mainSkill = 'meleeStrike';
  const st = s.progression.statsFor('meleeStrike');
  let guard = 0;
  // Take every upgrade there is.
  while (guard++ < 500) {
    const left = (() => { const q = []; const was = s.queueChoice; s.queueChoice = (r) => q.push(r); s.onLevelUp(2); s.queueChoice = was; return q; })();
    if (left.length === 0) break;
    for (const id of ['damage', 'attackSpeed', 'range']) s.progression.apply('meleeStrike', id);
  }
  s.player.hp = 10;
  const queued = [];
  const was = s.queueChoice;
  s.queueChoice = (r) => queued.push(r);
  s.onLevelUp(99);
  s.queueChoice = was;
  s.choosing = false;
  return { hp: s.player.hp, queued: queued.length, want: Math.min(s.player.maxHp, 10 + Math.round(window.config.PLAYER.maxHp * window.config.POTION.healFraction)) };
`);
console.log('maxed:', JSON.stringify(maxed));
check('a level-up for a main skill with nothing left to take heals a potion’s worth instead',
  maxed.queued === 0 && maxed.hp === maxed.want, JSON.stringify(maxed));

// --- 3c. 기행종: far hops; at you when you are within one, anywhere otherwise ---
const odd = await run(`
  s.choosing = false;
  s.spawner.clear();
  const p = s.player;
  const spec = window.config.ENEMY_KINDS.erratic;
  const reach = spec.hop.distance;
  // Held at one distance from the survivor, it is watched through many hops.
  const watch = (away) => {
    const e = s.spawner.group.get(p.x + away, p.y);
    e.spawn(p.x + away, p.y, p, 'erratic');
    let hops = 0, at = 0, wasHopping = false, travelled = 0, longest = 0, from = null;
    for (let t = 0; t < 20000; t += 20) {
      const startX = e.x, startY = e.y;
      e.update(0, 20);
      if (e.isHopping && !wasHopping) {
        hops++;
        const v = e.body.velocity;
        const toward = Math.atan2(p.y - e.y, p.x - e.x);
        const d = Math.atan2(v.y, v.x) - toward;
        if (Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 0.01) at++;
        from = { x: startX, y: startY };
        travelled = 0;
      }
      if (e.isHopping) travelled += Math.hypot(e.body.velocity.x, e.body.velocity.y) * 0.02;
      if (!e.isHopping && wasHopping) longest = Math.max(longest, travelled);
      wasHopping = e.isHopping;
      e.body.reset(p.x + away, p.y);
    }
    e.recycle();
    return { hops, at, longest: Math.round(longest) };
  };
  const out = { hp: spec.maxHp, gruntHp: window.config.ENEMY_KINDS.grunt.maxHp, reach,
                near: watch(reach * 0.6), far: watch(reach * 2), inTable: window.config.SPAWN_TABLE.some((r) => r.kind === 'erratic') };
  s.spawner.clear();
  return out;
`);
console.log('odd:', JSON.stringify(odd));
check('기행종: a plain enemy’s health, in the spawn table, and each hop carries it its configured distance',
  odd.hp === odd.gruntHp && odd.inTable && Math.abs(odd.near.longest - odd.reach) <= odd.reach * 0.1,
  `hop ${odd.near.longest}px, want ${odd.reach}`);
check('within one hop of the survivor every hop is at them; further off only some are',
  odd.near.hops > 10 && odd.near.at === odd.near.hops && odd.far.hops > 10 && odd.far.at > 0 && odd.far.at < odd.far.hops,
  `near ${odd.near.at}/${odd.near.hops}, far ${odd.far.at}/${odd.far.hops}`);

// --- 3d. 전투 알림: toasts, at most TOAST.max, the oldest first out, gone after TOAST.lifeMs ---
const toastRun = await run(`
  s.toasts.clear();
  for (let i = 1; i <= 7; i++) s.toasts.show('알림 ' + i);
  return { lines: s.toasts.lines, max: window.config.TOAST.max, life: window.config.TOAST.lifeMs };
`);
await sleep(toastRun.life + 600);
const toastLater = await run(`return { lines: s.toasts.lines };`);
check('toasts stack up to the limit, the oldest going first',
  toastRun.lines.length === toastRun.max && toastRun.lines[0] === '알림 3' && toastRun.lines.at(-1) === '알림 7',
  toastRun.lines.join(' | '));
check('and each is gone once its time is up', toastLater.lines.length === 0, toastLater.lines.join(' | '));

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
