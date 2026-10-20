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

  // 연쇄번개: five in a row, five links — each hit amplified by the jumps still to come.
  const chain = weapon('chainLightning');
  const a = put(80, 0);
  for (let i = 1; i < 5; i++) put(80 + i * 30, 0);
  const record = () => { const amounts = []; return { ctx: ctx({ hit: (e, amt) => amounts.push(amt) }), amounts }; };
  let probe = record();
  chain.strike({ ...probe.ctx, mastered: false }, a);
  out.chainPlain = probe.amounts;
  probe = record();
  chain.strike(probe.ctx, a);
  out.chainAwake = probe.amounts;
  out.chainBonus = window.config.SKILL_MASTERY.chainBonusPerJump;
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

  // 낙뢰: awakened, a kill always strikes again. The roll is pinned high, where
  // an ordinary recast never comes and an awakened one (100%) always does.
  const thunder = weapon('thunderStrike');
  const crowd = () => { s.spawner.clear(); for (let i = 0; i < 3; i++) put(60 + i * 30, 0, 1); };
  const real = Math.random;
  const pinned = (fn) => { Math.random = () => 0.999; try { fn(); } finally { Math.random = real; } };
  crowd();
  pinned(() => thunder.update(16, ctx({ mastered: false })));
  out.boltsPlain = thunder.lastStrikes;
  crowd();
  pinned(() => thunder.update(16, ctx({})));
  out.boltsAwake = thunder.lastStrikes;
  out.boltsWant = 3;
  s.spawner.clear();

  // 공허구체: two orbs on the same enemy hit it twice; the same orb again, not at once.
  const voidOrb = s.weapons.find((w) => w.definition.id === 'voidOrb');
  voidOrb.update(16, ctx({ orbCount: 2, range: 120, mastered: false }));
  const struck = put(0, 200);
  let hits = 0;
  const counting = ctx({ hit: (e, a) => { hits++; }, orbCount: 2, cooldownMs: 1000 });
  voidOrb.active.forEach((o) => o.setPosition(struck.x, struck.y));
  voidOrb.sweep(counting, 2);
  out.twoOrbs = hits;
  voidOrb.sweep(counting, 2);
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
check('화염구: the burst leaves a fire that burns at its share a second, then goes out',
  effects.zones === 1 && Math.abs(effects.burnt - effects.wantBurn) <= 2 && effects.zonesLater === 0,
  `burnt ${effects.burnt} in 1s, want ${effects.wantBurn}`);
check('얼음창: an enemy already chilled is frozen; one that was not, is not',
  effects.frozen === true && effects.warmFrozen === false);
check('공허구체: an enemy near the orbit is drawn toward the survivor, one far off is not',
  Math.abs(effects.pulled - effects.pullWant) < 1 && Math.abs(effects.farPulled) < 1e-6,
  `${effects.pulled.toFixed(1)}px in 1s, want ${effects.pullWant}; far ${effects.farPulled}`);
check('낙뢰: awakened, every kill strikes again',
  effects.boltsPlain === 1 && effects.boltsAwake === effects.boltsWant, `${effects.boltsPlain} → ${effects.boltsAwake} strikes on 3 weak enemies`);
check('공허구체: each orb hits an enemy it sweeps; the same orb not again inside its cooldown',
  effects.twoOrbs === 2 && effects.again === 0, `two orbs: ${effects.twoOrbs} hits, at once again: ${effects.again}`);

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
  return { pierce: st.pierceCount, cap: window.config.UPGRADE_CAP.pierceCount };
`);
check('얼음창 offers 투사체 속도, and 낙뢰 no longer offers 사거리',
  iceCards?.includes('projectileSpeed') && thunderCards && !thunderCards.includes('range'),
  `얼음창 ${iceCards?.join(',')} / 낙뢰 ${thunderCards?.join(',')}`);
check('얼음창 runs through at most five', pierce.cap === 5 && pierce.pierce === 5, JSON.stringify(pierce));

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
            chainMax: Math.ceil((c.UPGRADE_CAP.chainCount - base.chainCount) / c.UPGRADE_STEP.chainCount) } };
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

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
