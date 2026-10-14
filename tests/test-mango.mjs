import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 하얀 망고, the one drop rule every ordinary drop follows, a 제단 that
// stays on the map, and the ceiling on damage and attack-speed upgrades.

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
const run = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(800);
await cdp.evaluate(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. 하얀 망고 on the ground ---
const ground = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.dropMangoAt(s.player.x + 80, s.player.y);
  const d = s.combat.mangoDrops.getChildren().find((x) => x.active);
  return { label: d.nameplate.text, life: d.timeLeftMs, tex: d.texture.key, cfg: window.config.MANGO };
`);
check('하얀 망고 lies on the ground under its name, and lasts like any drop',
  ground.label === '하얀 망고' && ground.life > 0 && ground.tex === 'tex-mango', ground.label);
await run(`s.choosing = false; return 1;`);
await sleep(300);
await shot('mango-01-ground');

// --- 2. eaten: untouchable, twice as quick, and in colour ---
const eaten = await run(`
  s.choosing = true;
  const p = s.player;
  p.setInvulnerable(false); p.invulnerableUntil = 0; p.hp = p.maxHp;
  const before = { speed: p.moveSpeed, cd: s.cooldownOf('meleeStrike') };
  const d = s.combat.mangoDrops.getChildren().find((x) => x.active);
  s.combat.onMangoTouch(p, d);
  const during = { speed: p.moveSpeed, cd: s.cooldownOf('meleeStrike'), active: p.mangoActive,
                   left: p.mangoLeftMs, gone: !d.active };
  // Nothing gets through: not a body, not a bolt.
  const e = s.spawner.group.get(p.x, p.y); e.spawn(p.x, p.y, p, 'brute');
  s.combat.onEnemyTouch(p, e);
  p.takeDamage(50);
  const hp = p.hp;
  const tints = [];
  for (let i = 0; i < 4; i++) { s.time.now += 150; p.tickBuffs(1); tints.push(p.tintTopLeft); }
  s.spawner.clear();
  return { before, during, hp, max: p.maxHp, tints };
`);
console.log('eaten:', JSON.stringify(eaten));
check('eating it takes it off the ground and starts its clock',
  eaten.during.gone && eaten.during.active && eaten.during.left === ground.cfg.durationMs);
check('nothing hurts while it lasts — no body, no bolt', eaten.hp === eaten.max);
check('move speed is multiplied by the configured amount',
  Math.abs(eaten.during.speed - eaten.before.speed * ground.cfg.moveSpeedScale) < 1e-6,
  `${eaten.before.speed} -> ${eaten.during.speed}`);
check('and every skill fires that much faster',
  Math.abs(eaten.during.cd - eaten.before.cd / ground.cfg.attackSpeedScale) < 1,
  `${Math.round(eaten.before.cd)}ms -> ${Math.round(eaten.during.cd)}ms`);
check('the survivor runs through the rainbow while it lasts', new Set(eaten.tints).size >= 3,
  eaten.tints.map((c) => c.toString(16)).join(' '));
await run(`s.choosing = false; return 1;`);
await sleep(200);
await shot('mango-02-eaten');

// Its clock is the run's: frozen while a choice is open, and then it ends.
const clock = await run(`
  s.choosing = true;
  const left = s.player.mangoLeftMs;
  return { left };
`);
await sleep(700);
const held = await run(`return { left: s.player.mangoLeftMs };`);
check('it does not run down while the run is waiting on a choice', held.left === clock.left,
  `${clock.left} -> ${held.left}`);
const ended = await run(`
  const p = s.player;
  for (let t = 0; t < window.config.MANGO.durationMs + 100; t += 50) p.tickBuffs(50);
  const out = { active: p.mangoActive, tint: p.isTinted, speed: p.moveSpeed,
                base: window.config.PLAYER.speed * s.mods.passive.moveSpeedScale * s.mods.gear.moveSpeedScale };
  p.invulnerableUntil = 0;
  const hp = p.hp; p.takeDamage(5); out.hurt = hp - p.hp; p.hp = p.maxHp;
  s.choosing = false;
  return out;
`);
check('when it runs out, speed and colour are back and hits land again',
  !ended.active && !ended.tint && Math.abs(ended.speed - ended.base) < 1e-6 && ended.hurt === 5,
  JSON.stringify(ended));

// --- 3. one drop rule: +10% a 속성, +200% for a 우두머리 ---
// The roll is pinned: Math.random answers a fixed number, so each drop
// either clears its threshold or does not, with nothing left to chance.
const rule = await run(`
  s.choosing = true;
  // Phaser draws on Math.random when it makes a new text, so every pool a
  // kill can draw from is filled once first, with the real roll — the
  // pinned kills below then only reuse what is there.
  const P = s.player, cmb = s.combat;
  cmb.dropPotionAt(P.x, P.y); cmb.dropMangoAt(P.x, P.y); cmb.dropShardAt(P.x, P.y);
  cmb.dropOrbAt(P.x, P.y, 'chaos'); cmb.dropBoneAt(P.x, P.y, 'rib'); cmb.dropRandomSkillAt(P.x, P.y);
  cmb.dropAltarAt(P.x, P.y + 300, 'bosses');
  cmb.dropSkillAt(P.x, P.y, { id: 'fireball' });
  cmb.dropGearAt(P.x, P.y, { uid: 'warm', id: 'rustySword', prefixes: [], suffixes: [] });
  [cmb.potions, cmb.mangoDrops, cmb.shardDrops, cmb.orbDrops, cmb.boneDrops, cmb.randomSkillDrops,
   cmb.altars, cmb.skillDrops, cmb.gearDrops].forEach((g) => g.getChildren().forEach((d) => d.active && d.collect()));
  const c = window.config;
  const was = { potion: c.POTION.chance, mango: c.MANGO.chance };
  const roll = Math.random;
  const groups = { potion: s.combat.potions, mango: s.combat.mangoDrops, gear: s.combat.gearDrops };
  const clear = () => Object.values(groups).forEach((g) => g.getChildren().forEach((d) => d.active && d.collect()));
  const kill = (kind, affixes, r) => {
    clear();
    let e;
    if (affixes > 0) { e = s.spawner.spawnRare(kind); while (e.affixes.length !== affixes) { e.recycle(); e = s.spawner.spawnRare(kind); } }
    else { e = s.spawner.group.get(s.player.x + 300, s.player.y); e.spawn(s.player.x + 300, s.player.y, s.player, kind); }
    Math.random = () => r;
    s.combat.hit(e, 1e12);
    Math.random = roll;
    return Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, g.countActive(true)]));
  };
  c.POTION.chance = 0.2; c.MANGO.chance = 0.2;
  const per = c.RARE.dropBonusPerAffix, boss = 1 + c.BOSS.dropBonus;
  const out = {
    // Just above an ordinary kill's 20%: only what is raised clears it.
    plain: kill('grunt', 0, 0.2 + 0.001),
    rare2: kill('grunt', 2, 0.2 * (1 + 2 * per) - 0.001),
    rare2miss: kill('grunt', 2, 0.2 * (1 + 2 * per) + 0.001),
    bossKill: kill('boss', 0, 0.2 * boss - 0.001),
    per, boss,
  };
  c.POTION.chance = was.potion; c.MANGO.chance = was.mango;
  clear();
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('rule:', JSON.stringify(rule));
check('an ordinary kill rolls the plain chance', rule.plain.potion === 0 && rule.plain.mango === 0);
check('each 속성 on a rare raises it by its share — no more',
  rule.rare2.potion === 1 && rule.rare2.mango === 1 && rule.rare2miss.potion === 0,
  `two 속성: x${(1 + 2 * rule.per).toFixed(2)}`);
check('a 우두머리 raises it by its own bonus', rule.bossKill.potion === 1 && rule.bossKill.mango === 1,
  `x${rule.boss}`);
check('and what only a 우두머리 leaves is not raised — it still leaves exactly its weapon',
  rule.bossKill.gear === 1);

// --- 4. a 제단 stays on the map ---
const edges = await run(`
  s.choosing = true;
  const W = window.config.WORLD.width, H = window.config.WORLD.height;
  const out = [];
  for (const [x, y] of [[W / 2, 10], [W / 2, H - 10], [10, H / 2], [W - 10, 30], [5, 5]]) {
    s.combat.altars.getChildren().forEach((a) => a.active && a.collect());
    const b = s.spawner.group.get(x, y); b.spawn(x, y, s.player, 'boss');
    b.setPosition(x, y);
    s.combat.hit(b, 1e12);
    const a = s.combat.altars.getChildren().find((q) => q.active);
    out.push({ kill: [x, y], at: a ? [Math.round(a.x), Math.round(a.y)] : null,
               apart: a ? Math.round(Math.hypot(a.x - x, a.y - y)) : 0 });
  }
  s.combat.altars.getChildren().forEach((a) => a.active && a.collect());
  s.spawner.clear();
  s.choosing = false;
  return { out, W, H, reach: window.config.ALTAR.activateRadius };
`);
console.log('edges:', JSON.stringify(edges));
check('a 제단 off a 우두머리 at any edge or corner lands inside the map',
  edges.out.every((e) => e.at && e.at[0] >= 0 && e.at[0] <= edges.W && e.at[1] >= 0 && e.at[1] <= edges.H),
  edges.out.map((e) => `${e.kill.join(',')}→${e.at?.join(',')}`).join('  '));
check('and still out of reach of where the 우두머리 fell, wherever there is room',
  edges.out.filter((e) => e.kill[0] > 40 || e.kill[1] > 40).every((e) => e.apart > edges.reach),
  edges.out.map((e) => `${e.apart}px`).join(' '));

// --- 5. damage and attack speed stop at twenty picks ---
const capped = await run(`
  s.choosing = true;
  const id = 'meleeStrike';
  const base = window.config.SKILL_BASE[id];
  const max = window.config.UPGRADE_MAX_PICKS;
  for (let i = 0; i < 30; i++) { s.progression.apply(id, 'damage'); s.progression.apply(id, 'attackSpeed'); }
  const st = s.progression.statsFor(id);
  const step = (u) => base[u] * window.config.UPGRADE_PERCENT[u];
  // Count the level-up popups that would open now: 타격 has nothing left.
  s.owned.clear(); s.owned.add(id);
  let asked = 0;
  const q = s.queueChoice; s.queueChoice = () => { asked++; };
  s.onLevelUp(s.progression.level);
  s.queueChoice = q;
  s.choosing = false;
  return { damage: st.damage, attackSpeed: st.attackSpeed,
           wantDamage: base.damage + step('damage') * max.damage,
           wantSpeed: base.attackSpeed + step('attackSpeed') * max.attackSpeed,
           max, asked };
`);
console.log('capped:', JSON.stringify(capped));
check('damage stops at its ceiling of picks', Math.abs(capped.damage - capped.wantDamage) < 1e-6,
  `${capped.damage} after 30 tries (cap ${capped.max.damage})`);
check('and so does attack speed', Math.abs(capped.attackSpeed - capped.wantSpeed) < 1e-6,
  `${capped.attackSpeed.toFixed(2)} (cap ${capped.max.attackSpeed})`);
check('a skill with nothing left to take is not offered on a level-up', capped.asked === 0);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
