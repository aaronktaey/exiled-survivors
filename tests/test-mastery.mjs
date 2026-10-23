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

// --- 2. reaching the level awakens the main skill, loudly — and only the main skill (0.83) ---
const woke = await run(`
  const L = window.config.SKILL_MASTERY.level;
  const other = 'fireball';
  while (s.progression.levelFor(other) < L) s.progression.apply(other, 'damage');
  s.onUpgradePicked(other, 'damage');
  const otherWoke = s.awakened.has(other) || s.masteryOf(other) > 0;
  const id = s.mainSkill;
  while (s.progression.levelFor(id) < L - 1) s.progression.apply(id, 'damage');
  const before = s.awakened.has(id);
  s.onUpgradePicked(id, 'damage');
  return { L, id, level: s.progression.levelFor(id), before, after: s.awakened.has(id), otherWoke,
           banner: s.masteryBanner?.text ?? '' };
`);
await sleep(500);
await shot('mastery-01-banner');
console.log('woke:', JSON.stringify(woke));
check('the main skill reaching the level is awakened, once — a skill found later never is',
  woke.level === woke.L && !woke.before && woke.after && woke.otherWoke === false, JSON.stringify(woke));
check('and says so in a banner of its own', /타격/.test(woke.banner) && /각성/.test(woke.banner), woke.banner);
const hud = await run(`
  const i = s.loadout().findIndex((l) => l.id === s.mainSkill);
  const slot = s.hud.slots[i];
  s.hud.point(i);
  const card = s.hud.cardText.text;
  s.hud.point(-1);
  return { stroke: slot.plate.strokeColor, level: slot.level.style.color, card };
`);
check('the HUD wears it in gold, and its card says what it now does',
  hud.level === '#ffd76a' && /각성/.test(hud.card) && /파괴/.test(hud.card), JSON.stringify(hud));

// --- 2b. and again at SKILL_MASTERY.second.level: the 2차 각성 ---
const twice = await run(`
  const L2 = window.config.SKILL_MASTERY.second.level;
  const id = s.mainSkill;
  while (s.progression.levelFor(id) < L2 - 1) s.progression.apply(id, 'damage');
  const before = s.awakenedTwice.has(id);
  s.onUpgradePicked(id, 'damage');
  const i = s.loadout().findIndex((l) => l.id === id);
  // The HUD reads the loadout it was last handed: hand it the new one.
  s.hud.update(0, s.spawner.alive, s.loadout(), s.effectsNow());
  s.hud.point(i);
  const card = s.hud.cardText.text;
  s.hud.point(-1);
  return { L2, level: s.progression.levelFor(id), before, after: s.awakenedTwice.has(id), tier: s.masteryOf(id),
           banner: s.masteryBanner?.text ?? '', card, edge: s.hud.slots[i].plate.lineWidth };
`);
await sleep(400);
await shot('mastery-02-second');
console.log('twice:', JSON.stringify(twice));
check('at the second level the main skill awakens again, with a banner of its own',
  twice.level === twice.L2 && !twice.before && twice.after && twice.tier === 2 && /2차 각성/.test(twice.banner), JSON.stringify(twice));
check('and its card carries both lines, its edge a heavier gold',
  /각성 —/.test(twice.card) && /2차 각성 —/.test(twice.card) && twice.edge === 3, twice.card);

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
    chainCount: 4, pierceCount: 0, orbCount: 2, orbitSpeed: 100, extraProjectiles: 0, recastChance: 0.3, blastRadius: 30,
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

  // 연쇄번개: five in a row, five links — each hit amplified by the jumps still to come.
  const chain = weapon('chainLightning');
  const a = put(80, 0);
  for (let i = 1; i < 5; i++) put(80 + i * 30, 0);
  const record = () => { const amounts = []; return { ctx: ctx({ hit: (e, amt) => amounts.push(amt) }), amounts }; };
  let probe = record();
  chain.struck.clear();
  chain.strike({ ...probe.ctx, mastered: false }, a);
  out.chainPlain = probe.amounts;
  probe = record();
  chain.struck.clear();
  chain.strike(probe.ctx, a);
  out.chainAwake = probe.amounts;
  out.chainBonus = window.config.SKILL_MASTERY.chainBonusPerJump;
  s.spawner.clear();

  // 화염구 (0.84): the burst is SKILL_MASTERY.fireBlastScale as wide, and twice again at the second.
  const fire = weapon('fireball');
  const radiusOf = (over) => fire.specFor(ctx({ blastRadius: 30, areaScale: 1, ...over })).blastRadius;
  out.blast = { plain: radiusOf({ mastered: false, masteredTwice: false }), once: radiusOf({ masteredTwice: false }),
                twice: radiusOf({ masteredTwice: true }), area: radiusOf({ mastered: false, masteredTwice: false, areaScale: 1.2 }),
                k1: window.config.SKILL_MASTERY.fireBlastScale, k2: window.config.SKILL_MASTERY.second.fireBlastScale };
  const critWas = window.config.PLAYER.critChance;
  window.config.PLAYER.critChance = 0;

  // 얼음창: a chilled enemy struck again is frozen; an unchilled one is not.
  const cold = put(300, 0), warm = put(-300, 0);
  cold.chill(2000);
  const spear = () => ({ active: true, damage: 1, chillMs: 2000, freezeMs: window.config.SKILL_MASTERY.freezeMs, blastRadius: 0,
    registerHit: () => true, consumePierce: () => true, despawn() {} });
  c.onProjectileHit(spear(), cold);
  c.onProjectileHit(spear(), warm);
  out.frozen = cold.isFrozen;
  out.warmFrozen = warm.isFrozen;
  s.spawner.clear();

  // 공허구체 (0.98): awakened, a 공허 opens on the thickest crowd near the survivor, draws enemies in,
  // heals healPerEnemy a head inside every healEveryMs, then closes. Orbs far out, so none hits.
  const orb = weapon('voidOrb');
  const V = window.config.SKILL_MASTERY.voidVortex;
  const lone = put(60, 0);
  const crowd = [put(-150, 0), put(-160, 20), put(-140, -20)];
  let healed = 0;
  const heal = (n) => { healed += n; };
  const orbCtx = (over) => ctx({ range: 120, damage: 0, heal, ...over });
  for (let t = 0; t < V.everyMs + 100; t += 50) orb.update(50, orbCtx({ mastered: false }));
  out.vortexPlain = orb.vortices.length;
  // Its clock runs only once awakened.
  for (let t = 0; t < V.everyMs && orb.vortices.length === 0; t += 50) orb.update(50, orbCtx({}));
  const vortex = orb.vortices[0];
  out.vortexOpen = orb.vortices.length;
  out.vortexOnCrowd = vortex ? Math.hypot(vortex.view.x - crowd[0].x, vortex.view.y - crowd[0].y) < 30 : false;
  if (vortex) {
    const edge = crowd[1];
    const d0 = Math.hypot(edge.x - vortex.view.x, edge.y - vortex.view.y);
    for (let t = 0; t < V.healEveryMs; t += 50) orb.update(50, orbCtx({}));
    out.vortexPulled = d0 > 2 ? d0 - Math.hypot(edge.x - vortex.view.x, edge.y - vortex.view.y) : -1;
    out.vortexHealed = healed;
    out.vortexWantHeal = crowd.length * V.healPerEnemy;
    out.loneLeft = Math.hypot(lone.x - vortex.view.x, lone.y - vortex.view.y) > vortex.reach;
    for (let t = 0; t < V.lifeMs; t += 50) orb.update(50, orbCtx({ mastered: false }));
    out.vortexGone = orb.vortices.length;
  }
  s.spawner.clear();

  // 낙뢰 (0.84): what it hits is 감전, and every hit on it lands harder while it lasts.
  const thunder = weapon('thunderStrike');
  const shockedOne = put(60, 0);
  thunder.sinceCastMs = 1e9;
  thunder.update(16, ctx({ mastered: false }));
  out.shockPlain = shockedOne.isShocked;
  thunder.sinceCastMs = 1e9;
  thunder.update(16, ctx({}));
  out.shocked = shockedOne.isShocked;
  const h0 = shockedOne.hp;
  c.hit(shockedOne, 100);
  out.shockHit = { took: h0 - shockedOne.hp, want: Math.round(100 * (1 + window.config.SKILL_MASTERY.thunderShock.amplify)) };
  for (let t = 0; t < window.config.SKILL_MASTERY.thunderShock.durationMs + 100; t += 50) shockedOne.update(0, 50);
  out.shockLater = shockedOne.isShocked;
  window.config.PLAYER.critChance = critWas;
  s.spawner.clear();

  // 공허구체: two orbs on the same enemy hit it twice; the same orb again, not at once.
  const voidOrb = s.weapons.find((w) => w.definition.id === 'voidOrb');
  voidOrb.update(16, ctx({ orbCount: 2, range: 120, mastered: false }));
  const struck = put(0, 200);
  let hits = 0;
  const counting = ctx({ hit: (e, a) => { hits++; }, orbCount: 2, cooldownMs: 1000 });
  voidOrb.active.forEach((o) => o.setPosition(struck.x, struck.y));
  voidOrb.sweep(counting, voidOrb.active, 2, 0, 10);
  out.twoOrbs = hits;
  voidOrb.sweep(counting, voidOrb.active, 2, 0, 10);
  out.again = hits - out.twoOrbs;
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('effects:', JSON.stringify(effects));
check('타격: an enemy shot inside the swing is destroyed — only when awakened',
  effects.shotsBefore >= 1 && effects.shotsPlain === effects.shotsBefore && effects.shotsAfter === effects.shotsBefore - 1 &&
    effects.strikes === 1, JSON.stringify(effects));
// chainCount 4 is five links: the first has four jumps still to come, the last none.
check('연쇄번개: each strike is amplified by the jumps still to come, and still never strikes one twice',
  effects.chainPlain.length === 5 && effects.chainPlain.every((d) => d === 10) &&
    effects.chainAwake.length === 5 &&
    effects.chainAwake.every((d, i) => Math.abs(d - 10 * (1 + effects.chainBonus * (4 - i))) < 1e-9),
  `${effects.chainPlain.join(',')} → ${effects.chainAwake.map((d) => d.toFixed(1)).join(',')}`);
check('화염구: awakened, the burst is fireBlastScale as wide, and that again at the second; 효과범위 on top',
  effects.blast.once === effects.blast.plain * effects.blast.k1 && effects.blast.twice === effects.blast.once * effects.blast.k2 &&
    Math.abs(effects.blast.area - effects.blast.plain * 1.2) < 1e-9, JSON.stringify(effects.blast));
check('얼음창: an enemy already chilled is frozen; one that was not, is not',
  effects.frozen === true && effects.warmFrozen === false);
check('공허구체: awakened, a 공허 opens on the thickest crowd, not the nearest enemy, draws enemies in, then closes',
  effects.vortexPlain === 0 && effects.vortexOpen === 1 && effects.vortexOnCrowd && effects.vortexPulled > 0 && effects.vortexGone === 0,
  JSON.stringify({ plain: effects.vortexPlain, open: effects.vortexOpen, onCrowd: effects.vortexOnCrowd, pulled: effects.vortexPulled, gone: effects.vortexGone }));
check('and every healEveryMs it heals healPerEnemy for each enemy inside it',
  effects.vortexHealed === effects.vortexWantHeal && effects.loneLeft, `${effects.vortexHealed} vs ${effects.vortexWantHeal}`);
check('낙뢰: awakened, what it hits is 감전, takes more from every hit, and it wears off',
  effects.shockPlain === false && effects.shocked === true && effects.shockHit.took === effects.shockHit.want && effects.shockLater === false,
  JSON.stringify({ shocked: effects.shocked, hit: effects.shockHit, later: effects.shockLater }));
check('공허구체: each orb hits an enemy it sweeps; the same orb not again inside its cooldown',
  effects.twoOrbs === 2 && effects.again === 0, `two orbs: ${effects.twoOrbs} hits, at once again: ${effects.again}`);

// --- 3x. what each 2차 각성 does (0.83) ---
const second = await run(`
  s.choosing = true;
  s.spawner.clear();
  const p = s.player, c = s.combat, g = s.spawner.group, S2 = window.config.SKILL_MASTERY.second;
  const put = (dx, dy, hp = 1e9) => {
    const e = g.get(p.x + dx, p.y + dy);
    e.spawn(p.x + dx, p.y + dy, p, 'brute', undefined, false, hp / window.config.ENEMY_KINDS.brute.maxHp);
    return e;
  };
  const ctx = (over) => ({ origin: p, enemies: g, damage: 10, cooldownMs: 0, range: 220, projectileSpeed: 400,
    chainCount: 1, pierceCount: 0, orbCount: 3, orbitSpeed: 100, extraProjectiles: 0, recastChance: 0, blastRadius: 30,
    hit: c.hit, mastered: true, masteredTwice: true, enemyShots: c.enemyShots, ...over });
  const weapon = (id) => { s.acquire(id); return s.weapons.find((w) => w.definition.id === id); };
  const critWas = window.config.PLAYER.critChance;
  window.config.PLAYER.critChance = 0;
  const out = {};

  // 타격: one standing off to the side, out of the old arc but inside 180°, is cut only at the second.
  const melee = weapon('meleeStrike');
  // Past the old arc and the width it allows for a body, inside 180°.
  const front = put(60, 0), side = put(-5, 60);
  const sideHp = side.hp;
  melee.swing(ctx({ masteredTwice: false }), front);
  out.sidePlain = sideHp - side.hp;
  melee.swing(ctx({}), front);
  out.sideTwice = sideHp - side.hp;
  s.spawner.clear();

  // 연쇄번개: two arcs from one cast, each from its own nearest enemy.
  const chain = weapon('chainLightning');
  put(80, 0); put(-80, 0); put(160, 0); put(-160, 0);
  const amounts = [];
  chain.sinceCastMs = 1e9;
  chain.update(16, ctx({ hit: (e, a) => amounts.push(a), chainCount: 1, mastered: false }));
  out.forks = amounts.length;
  out.forksWant = S2.chainForks * 2;
  s.spawner.clear();

  // 얼음창 (0.87): an enemy that dies under 냉각 chills what stands within the shatter's reach.
  // It is the main skill's 2차 각성: 얼음창 is made the main one, awakened twice, for the probe.
  const mainWas = s.mainSkill;
  s.acquire('iceSpear');
  s.mainSkill = 'iceSpear';
  while (s.progression.levelFor('iceSpear') < S2.level) s.progression.apply('iceSpear', 'damage');
  const doomed = put(300, 0, 1), close = put(300 + S2.iceShatter.radius - 15, 0), away = put(300 + S2.iceShatter.radius + 60, 0);
  doomed.chill(2000);
  c.hit(doomed, 1e6);
  out.shatter = { close: close.isChilled, away: away.isChilled };
  s.mainSkill = mainWas;
  out.shatterOff = (() => { const d2 = put(-300, 0, 1), c2 = put(-300 + 20, 0); d2.chill(2000); c.hit(d2, 1e6); return c2.isChilled; })();
  s.spawner.clear();

  // 공허구체: an inner ring as many orbs, turning the other way.
  const orb = weapon('voidOrb');
  orb.update(16, ctx({ masteredTwice: false, range: 120 }));
  out.innerPlain = orb.inner.filter((o) => o.visible).length;
  orb.update(16, ctx({ range: 120 }));
  const inner = orb.inner.filter((o) => o.visible);
  out.inner = { count: inner.length, outer: orb.active.length,
    radius: inner.length ? Math.round(Math.hypot(inner[0].x - p.x, inner[0].y - p.y)) : 0, want: Math.round(120 * S2.voidInner.radiusShare),
    // 0.99 (and the outer ring since 0.101): drawn under the enemies, so they no longer hide what they circle.
    under: [...inner, ...orb.active].every((o) => o.depth < window.config.DEPTH.enemies),
    fainter: inner.every((o) => o.alpha < orb.active[0].alpha) };
  orb.update(16, ctx({ masteredTwice: false, range: 120 }));
  s.spawner.clear();

  // 낙뢰: what stands round the strike takes its share.
  const thunder = weapon('thunderStrike');
  const struck = put(60, 0), near = put(60 + S2.thunderSplash.radius - 10, 0), far = put(60 + S2.thunderSplash.radius + 60, 0);
  const n0 = near.hp, f0 = far.hp;
  thunder.sinceCastMs = 1e9;
  thunder.update(16, ctx({ masteredTwice: false }));
  out.splashPlain = n0 - near.hp;
  thunder.sinceCastMs = 1e9;
  thunder.update(16, ctx({}));
  out.splash = { near: n0 - near.hp, far: f0 - far.hp, want: 10 * S2.thunderSplash.damageShare };
  s.spawner.clear();

  window.config.PLAYER.critChance = critWas;
  s.choosing = false;
  return out;
`);
console.log('second:', JSON.stringify(second));
check('2차 각성 타격: the swing opens to 180°, cutting what stood beside the target',
  second.sidePlain === 0 && second.sideTwice > 0, JSON.stringify(second));
check('2차 각성 연쇄번개: one cast runs down more arcs', second.forks === second.forksWant, `${second.forks} strikes, want ${second.forksWant}`);
check('2차 각성 얼음창: an enemy that dies under 냉각 chills those close by, not those further — and only as the main skill’s',
  second.shatter.close === true && second.shatter.away === false && second.shatterOff === false,
  JSON.stringify({ shatter: second.shatter, off: second.shatterOff }));
check('2차 각성 공허구체: an inner ring as many orbs, at its share of the radius',
  second.innerPlain === 0 && second.inner.count === second.inner.outer && Math.abs(second.inner.radius - second.inner.want) <= 2,
  JSON.stringify(second.inner));
check('both rings are drawn under the enemies, the inner one fainter (0.99, 0.101)', second.inner.under && second.inner.fainter, JSON.stringify(second.inner));
check('2차 각성 낙뢰: what stands round the strike takes its share, what stands further does not',
  second.splashPlain === 0 && second.splash.near === second.splash.want && second.splash.far === 0, JSON.stringify(second.splash));

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
  return { hp: s.player.hp, queued: queued.length, want: Math.min(s.player.maxHp, 10 + Math.max(1, Math.round(s.player.maxHp * window.config.POTION.healFraction))) };
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

// --- 3e. the upgrade lists: 얼음창 offers shot speed, 낙뢰 no range, 관통 stops at five ---
// What a popup offers is read off its own payload (private in TypeScript only).
const cardsFor = async (id) => {
  await run(`s.choosing = false; s.pendingChoices.length = 0; s.acquire('${id}'); s.onSkillCollected('${id}'); return 1;`);
  await sleep(500);
  const ids = await cdp.evaluate(`(() => {
    const up = window.game.scene.getScene('UpgradeScene');
    const out = window.game.scene.isActive('UpgradeScene') ? up.payload.options.map((o) => o.id) : null;
    if (out) { up.payload.onPick(out[0]); up.scene.stop(); }
    return out;
  })()`);
  await sleep(300);
  return ids;
};
const iceCards = await cardsFor('iceSpear');
const thunderCards = await cardsFor('thunderStrike');
const pierce = await run(`
  const st = s.progression.statsFor('iceSpear');
  for (let i = 0; i < 20; i++) s.progression.apply('iceSpear', 'pierceCount');
  const c = window.config;
  return { pierce: st.pierceCount, want: c.SKILL_BASE.iceSpear.pierceCount + c.UPGRADE_MAX_PICKS.pierceCount };
`);
check('얼음창 no longer offers 투사체 속도, and 낙뢰 offers 처치 시 재시전 (0.83)',
  iceCards && !iceCards.includes('projectileSpeed') && thunderCards?.includes('recastChance') && !thunderCards.includes('range'),
  `얼음창 ${iceCards?.join(',')} / 낙뢰 ${thunderCards?.join(',')}`);
check('관통 stops at five picks', pierce.pierce === pierce.want, JSON.stringify(pierce));

// --- 3f. each card says where its stat is, where the pick takes it, and how far it can go ---
await run(`
  s.choosing = false; s.pendingChoices.length = 0;
  s.acquire('chainLightning');
  s.progression.apply('chainLightning', 'damage');
  s.progression.apply('chainLightning', 'chainCount');
  s.onSkillCollected('chainLightning');
  return 1;
`);
await sleep(600);
const cardValues = await cdp.evaluate(`(() => {
  const up = window.game.scene.getScene('UpgradeScene');
  const c = window.config;
  const gs = window.game.scene.getScene('GameScene');
  const st = gs.progression.statsFor('chainLightning');
  const base = c.SKILL_BASE.chainLightning;
  const cards = up.cards.map((card) => ({ id: card.option.id, now: card.option.now, next: card.option.next,
    taken: card.option.taken, max: card.option.maxPicks, values: card.values?.text ?? '', picks: card.picks?.text ?? '' }));
  const out = { cards, stats: { damage: st.damage, chainCount: st.chainCount },
    want: { damageNext: st.damage + base.damage * c.UPGRADE_PERCENT.damage, damageMax: c.UPGRADE_MAX_PICKS.damage,
            chainMax: c.UPGRADE_MAX_PICKS.chainCount } };
  up.payload.onPick(cards[0].id); up.scene.stop();
  return out;
})()`);
await sleep(300);
console.log('card values:', JSON.stringify(cardValues));
const dmg = cardValues.cards.find((c) => c.id === 'damage');
const chain = cardValues.cards.find((c) => c.id === 'chainCount');
check('a card shows its stat now and after the pick',
  dmg && Math.abs(dmg.now - cardValues.stats.damage) < 1e-9 && Math.abs(dmg.next - cardValues.want.damageNext) < 1e-9 &&
    /현재/.test(dmg.values) && /강화 후/.test(dmg.values),
  dmg?.values);
check('and how many times it has been taken of how many it can be',
  dmg && dmg.taken === 1 && dmg.max === cardValues.want.damageMax && dmg.picks.includes(`1/${cardValues.want.damageMax}`) &&
    chain && chain.taken === 1 && chain.max === cardValues.want.chainMax && chain.picks.includes(`1/${cardValues.want.chainMax}`),
  `${dmg?.picks} · ${chain?.picks}`);

// --- 3g. every upgrade has a ceiling, and a skill past all of them heals, saying so ---
const ceilings = await cdp.evaluate(`(() => {
  const c = window.config;
  return ['range', 'projectileSpeed', 'orbitSpeed', 'damage', 'attackSpeed'].map((id) => [id, c.UPGRADE_MAX_PICKS[id] ?? null]);
})()`);
check('투사체 속도, 회전 속도 and 사정거리 stop at a number of picks too',
  ceilings.every(([, max]) => typeof max === 'number' && max > 0), JSON.stringify(ceilings));

const potion = await run(`
  s.choosing = false; s.pendingChoices.length = 0;
  const p = s.player;
  p.setInvulnerable(true);
  const id = s.mainSkill;
  // Take every upgrade the main skill has, to its ceiling.
  for (let i = 0; i < 200; i++) {
    const opts = window.game.scene.getScene('GameScene').progression;
    for (const up of ['damage', 'attackSpeed', 'range', 'projectileSpeed', 'orbitSpeed', 'chainCount', 'pierceCount', 'orbCount']) opts.apply(id, up);
  }
  p.hp = Math.max(1, p.maxHp - 50);
  const hp = p.hp;
  s.damageNumbers.reset();
  s.onLevelUp(s.progression.level + 1);
  const floaters = s.damageNumbers.pool.filter((f) => f.remainingMs > 0).map((f) => f.text.text);
  return { id, healed: p.hp - hp, upgradeOpen: window.game.scene.isActive('UpgradeScene'),
           toast: s.toasts.lines.find((l) => /포션/.test(l)) ?? '', floaters,
           name: s.hud.loadout?.find?.((e) => e.id === id)?.name ?? null };
`);
console.log('maxed potion:', JSON.stringify(potion));
check('a level-up on a skill with every upgrade taken heals instead of opening the cards',
  potion.healed > 0 && potion.upgradeOpen === false, `+${potion.healed}`);
check('and says so plainly: 포션 효과! over the survivor, and a toast naming the skill',
  potion.floaters.includes('포션 효과!') && /강화 완료/.test(potion.toast) && /포션/.test(potion.toast) &&
    potion.floaters.some((f) => /^\+\d+/.test(f)),
  `${potion.toast} · ${potion.floaters.join(' ')}`);
await run(`s.player.setInvulnerable(false); return 1;`);

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

// --- 드론 (0.95): one enemy each, no more than DRONE.perEnemy on one; twice as many at the 1차, a bomb every so many shots at the 2차 (0.98) ---
const drone = await run(`
  const c = s.combat, g = s.spawner.group, p = s.player, C = window.config;
  s.spawner.clear();
  const put = (dx, dy) => { const e = g.get(p.x + dx, p.y + dy); e.spawn(p.x + dx, p.y + dy, p, 'brute', undefined, false, 1e6); e.update = () => {}; return e; };
  const ctx = (over) => ({ origin: p, enemies: g, damage: 1, cooldownMs: 100, range: 270, projectileSpeed: 0, chainCount: 0, pierceCount: 0,
    orbCount: 0, orbitSpeed: 0, extraProjectiles: 0, recastChance: 0, blastRadius: 0, hit: c.hit, mastered: false, masteredTwice: false,
    enemyShots: c.enemyShots, droneCount: 5, ...over });
  if (!s.owned.has('drone')) s.acquire('drone');
  const w = s.weapons.find((x) => x.definition.id === 'drone');
  const step = (ms, over) => { for (let t = 0; t < ms; t += 50) w.update(50, ctx(over)); };
  const on = () => w.drones.filter((d) => d.view.visible);
  const lone = put(140, 0);
  step(1500);
  const capped = { onLone: on().filter((d) => d.target === lone).length, idle: on().filter((d) => !d.target).length, cap: C.DRONE.perEnemy };
  const more = [put(-150, 30), put(0, 170)];
  step(1500);
  const spread = [lone, ...more].map((e) => on().filter((d) => d.target === e).length);
  const far = put(500, 0);
  step(500);
  const farHeld = on().some((d) => d.target === far);
  step(200, { mastered: true, extraProjectiles: 1 });
  const twice = on().length;
  const bombs0 = w.bombs;
  step(1500, { mastered: true });
  const bombsOnce = w.bombs - bombs0;
  step(1500, { mastered: true, masteredTwice: true });
  const bombs = w.bombs - bombs0 - bombsOnce;
  const shots = on().reduce((n, d) => n + d.shots, 0);
  s.spawner.clear();
  return { capped, spread, farHeld, bombsOnce, bombs, twice, wantTwice: (5 + 1) * C.SKILL_MASTERY.droneTimes, every: C.SKILL_MASTERY.second.droneBomb.every, shots };
`);
console.log('drone:', JSON.stringify(drone));
check('드론: no more than DRONE.perEnemy on one enemy; the rest circle the survivor',
  drone.capped.onLone === drone.capped.cap && drone.capped.idle === 5 - drone.capped.cap, JSON.stringify(drone.capped));
check('and with more enemies in reach they spread out — every one held', drone.spread.every((n) => n >= 1), JSON.stringify(drone.spread));
check('one out of reach is left alone', drone.farHeld === false);
check('1차 각성 (0.98): twice the drones, the Runed Sword’s +1 counted before the doubling', drone.twice === drone.wantTwice, `${drone.twice} vs ${drone.wantTwice}`);
check('2차 각성 (0.98): a bomb every so many shots of a drone — none at the 1차 alone', drone.bombsOnce === 0 && drone.bombs > 0, `${drone.bombsOnce} → ${drone.bombs} bombs`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
