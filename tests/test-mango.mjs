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
  // Its clock, as a ring round the survivor: drawn once it starts to run.
  p.tickBuffs(1);
  during.ring = p.mangoRing.commandBuffer.length;
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
check('a ring round the survivor shows how long it has left', eaten.during.ring > 0, `${eaten.during.ring} draw commands`);
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
  const out = { active: p.mangoActive, tint: p.isTinted, speed: p.moveSpeed, ring: p.mangoRing.commandBuffer.length,
                base: window.config.PLAYER.speed * s.mods.passive.scale('moveSpeed') * s.mods.gear.moveSpeedScale };
  p.invulnerableUntil = 0;
  const hp = p.hp; p.takeDamage(5); out.hurt = hp - p.hp; p.hp = p.maxHp;
  s.choosing = false;
  return out;
`);
check('when it runs out, speed and colour are back, the ring gone, and hits land again',
  !ended.active && !ended.tint && Math.abs(ended.speed - ended.base) < 1e-6 && ended.hurt === 5 && ended.ring === 0,
  JSON.stringify(ended));

// --- 3. one drop rule: +10% a 속성, +200% for a 우두머리 (not the 망고) ---
// The roll is pinned: Math.random answers a fixed number, so each drop
// either clears its threshold or does not, with nothing left to chance.
const rule = await run(`
  s.choosing = true;
  // Phaser draws on Math.random when it makes a new text, so every pool a
  // kill can draw from is filled once first, with the real roll — the
  // pinned kills below then only reuse what is there.
  const P = s.player, cmb = s.combat;
  cmb.dropPotionAt(P.x, P.y); cmb.dropMangoAt(P.x, P.y); cmb.dropMagnetAt(P.x, P.y); cmb.dropShardAt(P.x, P.y);
  cmb.dropOrbAt(P.x, P.y, 'chaos'); cmb.dropBoneAt(P.x, P.y, 'rib'); cmb.dropRandomSkillAt(P.x, P.y);
  cmb.dropAltarAt(P.x, P.y + 300, 'bosses');
  cmb.dropSkillAt(P.x, P.y, { id: 'fireball' });
  cmb.dropGearAt(P.x, P.y, { uid: 'warm', id: 'rustySword', prefixes: [], suffixes: [] });
  [cmb.potions, cmb.mangoDrops, cmb.magnetDrops, cmb.shardDrops, cmb.orbDrops, cmb.boneDrops, cmb.randomSkillDrops,
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
    plainHit: kill('grunt', 0, 0.2 - 0.001),
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
  rule.rare2.potion === 1 && rule.rare2miss.potion === 0,
  `two 속성: x${(1 + 2 * rule.per).toFixed(2)}`);
check('a 우두머리 raises it by its own bonus', rule.bossKill.potion === 1,
  `x${rule.boss}`);
check('하얀 망고 is the same off every kill: nothing raises it',
  rule.plainHit.mango === 1 && rule.rare2.mango === 0 && rule.bossKill.mango === 0,
  JSON.stringify({ plain: rule.plainHit.mango, rare: rule.rare2.mango, boss: rule.bossKill.mango }));
check('and what only a 우두머리 leaves is not raised — it still leaves exactly its weapon',
  rule.bossKill.gear === 1);

// --- 4. a 제단 stays on the map ---
const edges = await run(`
  s.choosing = true;
  const W = window.config.WORLD.width, H = window.config.WORLD.height;
  const out = [];
  // Where it lands, not whether: a certain one for each kill.
  const was = window.config.ALTAR.fromBoss;
  window.config.ALTAR.fromBoss = 1;
  for (const [x, y] of [[W / 2, 10], [W / 2, H - 10], [10, H / 2], [W - 10, 30], [5, 5]]) {
    s.combat.altars.getChildren().forEach((a) => a.active && a.collect());
    const b = s.spawner.group.get(x, y); b.spawn(x, y, s.player, 'boss');
    b.setPosition(x, y);
    s.combat.hit(b, 1e12);
    const a = s.combat.altars.getChildren().find((q) => q.active);
    out.push({ kill: [x, y], at: a ? [Math.round(a.x), Math.round(a.y)] : null,
               apart: a ? Math.round(Math.hypot(a.x - x, a.y - y)) : 0 });
  }
  window.config.ALTAR.fromBoss = was;
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

// --- 6. 자석: picked up, everything on the map flies in and is picked up ---
const magnetRate = await run(`
  s.choosing = true;
  s.spawner.clear();
  const c = window.config;
  const roll = Math.random;
  // The same pinned rolls as the drop rule above, at a chance of 20%, so
  // every pool a kill can draw from is already filled.
  const was = c.MAGNET.chance;
  c.MAGNET.chance = 0.2;
  const out = { chance: was, mango: c.MANGO.chance };
  const kill = (affixes, r) => {
    s.combat.magnetDrops.getChildren().forEach((d) => d.active && d.collect());
    let e;
    if (affixes > 0) { e = s.spawner.spawnRare('grunt'); while (e.affixes.length !== affixes) { e.recycle(); e = s.spawner.spawnRare('grunt'); } }
    else { e = s.spawner.group.get(s.player.x + 300, s.player.y); e.spawn(s.player.x + 300, s.player.y, s.player, 'grunt'); }
    Math.random = () => r;
    try { s.combat.hit(e, 1e12); } finally { Math.random = roll; }
    return s.combat.magnetDrops.countActive(true);
  };
  try {
    out.under = kill(0, 0.2 - 0.001);
    out.over = kill(0, 0.2 + 0.001);
    // A rare's 속성 raise every ordinary drop, but not this one.
    out.rare = kill(2, 0.2 + 0.001);
  } finally {
    c.MAGNET.chance = was;
  }
  s.combat.magnetDrops.getChildren().forEach((d) => d.active && d.collect());
  [s.combat.gems, s.combat.skillDrops, s.combat.potions, s.combat.gearDrops, s.combat.shardDrops, s.combat.orbDrops,
   s.combat.boneDrops, s.combat.randomSkillDrops, s.combat.mangoDrops, s.combat.altars]
    .forEach((g) => g.getChildren().forEach((d) => d.active && d.collect()));
  s.choosing = false;
  return out;
`);
console.log('magnet rate:', JSON.stringify(magnetRate));
// Its own flat chance (it was the 하얀 망고's when it was made; the live
// values have parted them since, and both are the user's).
check('자석 drops off a kill at its own chance',
  magnetRate.under === 1 && magnetRate.over === 0,
  `${magnetRate.chance} (망고 ${magnetRate.mango})`);
check('and a rare does not raise it', magnetRate.rare === 0);

// Scatter things all over the map, far out of reach, then pick a 자석 up.
// Enough XP among them for a level-up: that popup must not hold anything up.
const magnet = await run(`
  s.spawner.clear();
  const p = s.player, c = s.combat;
  p.setInvulnerable(true);
  p.hp = Math.max(1, p.maxHp - 40);
  const far = [[-900, -700], [1100, 600], [-1200, 800], [900, -900]];
  const at = (i) => ({ x: p.x + far[i % far.length][0], y: p.y + far[i % far.length][1] });
  const need = s.progression.xpToNext;
  for (let i = 0; i < 6; i++) { const g = c.gems.get(); const q = at(i); g.drop(q.x, q.y, Math.ceil(need / 3), p); }
  let q = at(0); c.dropOrbAt(q.x, q.y, 'chaos');
  q = at(1); c.dropShardAt(q.x, q.y);
  q = at(2); c.dropGearAt(q.x, q.y, { uid: 'pulled', id: 'rustySword', prefixes: [], suffixes: [] });
  // What a survivor might be keeping for later: it stays put.
  q = at(3); c.dropPotionAt(q.x, q.y);
  q = at(0); c.dropMangoAt(q.x + 60, q.y);
  q = at(2); c.dropMagnetAt(q.x + 60, q.y);
  q = at(1); c.dropAltarAt(q.x, q.y + 120, 'bosses');
  c.dropMagnetAt(p.x + 60, p.y);
  const before = {
    gems: c.gems.countActive(true), orbs: s.kit.count('chaos'), shards: window.passives.value.shards,
    gear: s.kit.find('pulled') !== null || s.pendingChoices.some((r) => r.kind === 'gear' && r.item.uid === 'pulled') ||
      s.gearOnOffer?.uid === 'pulled',
    level: s.progression.level,
    label: c.magnetDrops.getChildren().find((d) => d.active && Math.abs(d.x - p.x - 60) < 2)?.nameplate.text ?? null,
  };
  const picked = c.magnetDrops.getChildren().find((d) => d.active && Math.abs(d.x - p.x - 60) < 2);
  c.onMagnetTouch(p, picked);
  // The very same moment: everything is already taken.
  const after = {
    gems: c.gems.countActive(true), orbs: s.kit.count('chaos'), shards: window.passives.value.shards,
    gear: s.kit.find('pulled') !== null || s.pendingChoices.some((r) => r.kind === 'gear' && r.item.uid === 'pulled') ||
      s.gearOnOffer?.uid === 'pulled',
    level: s.progression.level,
    potions: c.potions.countActive(true), mangos: c.mangoDrops.countActive(true),
    magnets: c.magnetDrops.countActive(true), altars: c.altars.countActive(true),
    toast: s.toasts.lines.some((l) => /자석/.test(l)),
  };
  return { before, after };
`);
await sleep(1200);
const later = await run(`
  const c = s.combat;
  const out = { potions: c.potions.countActive(true), mangos: c.mangoDrops.countActive(true),
                magnets: c.magnetDrops.countActive(true), altars: c.altars.countActive(true),
                upgradeOpen: window.game.scene.isActive('UpgradeScene') };
  // Tidy: close any popup the level-ups opened, and clear the ground.
  const up = window.game.scene.getScene('UpgradeScene');
  if (window.game.scene.isActive('UpgradeScene')) { up.payload.onPick(up.payload.options[0].id); up.scene.stop(); }
  const pick = window.game.scene.getScene('GearPickScene');
  if (window.game.scene.isActive('GearPickScene')) { pick.choose('keep'); }
  s.pendingChoices.length = 0;
  [c.potions, c.mangoDrops, c.magnetDrops, c.altars].forEach((g) => g.getChildren().forEach((d) => d.active && d.collect()));
  s.player.setInvulnerable(false);
  return out;
`);
console.log('magnet:', JSON.stringify({ magnet, later }));
check('자석 lies on the ground under its name', magnet.before.label === '자석', `${magnet.before.label}`);
check('picked up, every gem and item on the map is taken at that instant — the XP, the 구슬, the 조각, the sword',
  magnet.after.gems === 0 && magnet.after.level > magnet.before.level &&
    magnet.after.orbs === magnet.before.orbs + 1 && magnet.after.shards === magnet.before.shards + 1 &&
    magnet.after.gear === true && magnet.after.toast,
  JSON.stringify(magnet.after));
check('but what might be kept for later stays: the 포션, the 하얀 망고, the other 자석 and the 제단',
  magnet.after.potions === 1 && magnet.after.mangos === 1 && magnet.after.magnets === 1 && magnet.after.altars === 1 &&
    later.potions === 1 && later.mangos === 1 && later.magnets === 1 && later.altars === 1,
  JSON.stringify(later));

// Switched off in the 필터, it lands hidden.
const filtered = await run(`
  window.itemFilter.toggle('magnet');
  s.combat.magnetDrops.getChildren().forEach((d) => d.active && d.collect());
  s.combat.dropMagnetAt(s.player.x + 600, s.player.y);
  const d = s.combat.magnetDrops.getChildren().find((m) => m.active);
  window.itemFilter.toggle('magnet');
  const out = { active: !!d, visible: d?.visible, label: d?.nameplate.label.visible };
  d?.collect();
  return out;
`);
check('switched off in the 필터, it lands but is not seen',
  filtered.active && filtered.visible === false && filtered.label === false, JSON.stringify(filtered));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
