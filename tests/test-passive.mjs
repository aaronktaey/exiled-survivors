import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 패시브 트리 (the graph): 신성한 조각 from 우두머리 as the eraser, account
// experience from every gem as the points, the shape of the tree, the rules
// for taking a node and taking it back, the screen, and what nodes and
// 키스톤 do in a run.

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
const ev = (expr) => cdp.evaluate(expr);
const run = (body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);
const scene = (key, body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('${key}'); ${body} })()`);
const KEY = 'exiled-survivors:passives:v1';
const stored = () => ev(`(() => JSON.parse(localStorage.getItem('${KEY}') || 'null'))()`);
/** Writes the tree's storage and comes back into a run that reads it. */
const loadRun = async (state) => {
  // Written sealed, as the game writes it (systems/Seal.ts): an unsealed one is refused once the grace is over.
  await ev(`(() => { localStorage.setItem('${KEY}', window.sealRecord('${KEY}', ${JSON.stringify(state)})); return 1; })()`);
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
  await sleep(900);
  await cdp.send('Page.reload', {});
  await sleep(4500);
};
const spine = (branch, to = 7) => Array.from({ length: to }, (_, i) => `${branch}.s${i + 1}`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(1200);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. 신성한 조각: half of 우두머리 kills, and nothing else; now only counted ---
const drops = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.shardDrops.getChildren().forEach(d => d.active && d.collect());
  for (let i = 0; i < 300; i++) {
    const e = s.spawner.group.get(600, 600);
    e.spawn(600, 600, s.player, 'grunt');
    s.combat.hit(e, 999999);
  }
  const fromGrunts = s.combat.shardDrops.countActive(true);
  const N = 600;
  let fromBosses = 0;
  for (let i = 0; i < N; i++) {
    const boss = s.spawner.spawnBoss();
    s.combat.hit(boss, 999999);
    fromBosses += s.combat.shardDrops.countActive(true);
    s.combat.shardDrops.getChildren().forEach(d => d.active && d.collect());
  }
  for (const g of [s.combat.gearDrops, s.combat.skillDrops, s.combat.gems]) g.getChildren().forEach(d => d.active && d.collect());
  s.spawner.clear();
  s.choosing = false;
  return { fromGrunts, rate: fromBosses / N, chance: window.config.SHARD.chance };
`);
check('ordinary kills leave no 신성한 조각', drops.fromGrunts === 0, `${drops.fromGrunts}`);
check('우두머리 leave one at SHARD.chance', Math.abs(drops.rate - drops.chance) < 0.07,
  `${(drops.rate * 100).toFixed(1)}% against ${drops.chance * 100}%`);

await run(`for (let i = 0; i < 3; i++) s.combat.dropShardAt(s.player.x, s.player.y); return 1;`);
await sleep(1200);
const three = await stored();
const toast = await run(`return s.toasts.lines;`);
check('a shard picked up is one more held, and no point any more',
  three.shards === 3 && three.version === 2 && three.bonusPoints === 0, JSON.stringify(three));
check('and the run says how many are held', toast.some((l) => l.includes('신성한 조각') && l.includes('3')), toast.join(' | '));

// --- 2. every gem is account experience too ---
const xp = await run(`
  s.choosing = true;
  const p = s.player;
  const before = window.passives.value.xp;
  let worth = 0;
  for (let i = 0; i < 20; i++) {
    const e = s.spawner.group.get(p.x, p.y);
    e.spawn(p.x + 30, p.y, p, 'brute');
    worth += e.xpValue;
    s.combat.hit(e, 9999999);
  }
  s.combat.collectEverything();
  const pending = s.pendingAccountXp;
  s.writeSave();
  s.choosing = false;
  return { before, after: window.passives.value.xp, worth, pending };
`);
check('the gems a run picks up go into the account when it saves',
  xp.after - xp.before === Math.floor(xp.pending) && xp.pending >= xp.worth * 0.99,
  `${xp.before} -> ${xp.after}, ${xp.worth} worth of gems`);
const curve = await ev(`(() => {
  const A = window.config.ACCOUNT_LEVEL;
  const cost = (n) => Math.round(A.base * Math.pow(n, A.power));
  let need = 0; for (let n = 1; n < 6; n++) need += cost(n);
  const p = window.passives;
  const at = (xp) => { p.reset(); p.addXp(xp); return p.account.level; };
  const out = { below: at(need - 1), exactly: at(need), free: p.freePoints };
  p.reset();
  return out;
})()`);
check('the account level follows ACCOUNT_LEVEL, a point a level past the first',
  curve.below === 5 && curve.exactly === 6 && curve.free === 5, JSON.stringify(curve));

// --- 3. the old tree's points come back to spend again ---
await loadRun({ shards: 4, points: 2, ranks: { damage: 3, attackSpeed: 1, moveSpeed: 2 } });
const moved = await ev(`(() => ({ v: window.passives.value, free: window.passives.freePoints }))()`);
check('a tree from before the graph comes back as points, its shards kept',
  moved.v.version === 2 && moved.v.bonusPoints === 8 && moved.v.shards === 4 && moved.v.allocated.length === 0 && moved.free === 8,
  JSON.stringify(moved));

// --- 4. the shape of the tree ---
const shape = await ev(`(() => {
  const N = window.config.PASSIVE_NODES, V = window.config.NODE_VALUES;
  const all = Object.values(N);
  const asym = all.filter(n => n.links.some(l => !N[l] || !N[l].links.includes(n.id))).map(n => n.id);
  const seen = new Set(['start']); const q = ['start'];
  while (q.length) { for (const l of N[q.pop()].links) if (!seen.has(l)) { seen.add(l); q.push(l); } }
  const branches = [...new Set(all.map(n => n.branch).filter(Boolean))];
  const keystones = all.filter(n => n.kind === 'keystone');
  const far = (n) => Math.hypot(n.x, n.y);
  // Each branch's 키스톤 is its furthest node.
  const keyFurthest = keystones.every(k => all.filter(n => n.branch === k.branch).every(n => far(n) <= far(k) + 0.5));
  // A small node out at ring 5 gives at least what one at ring 1 does, stat for stat.
  const outward = Object.values(V).every(([a, b, c]) => a <= b && b <= c);
  const smallOut = all.filter(n => n.kind === 'small' && n.mods.length === 1);
  return { count: all.length, asym, reach: seen.size, branches: branches.length,
           perBranch: branches.map(b => all.filter(n => n.branch === b).length),
           keystones: keystones.length, keyFurthest, outward, small: smallOut.length,
           notables: all.filter(n => n.kind === 'notable').length };
})()`);
console.log('shape:', JSON.stringify(shape));
check('the tree is six branches out of one start', shape.branches === 6 && shape.perBranch.every((n) => n === shape.perBranch[0]),
  shape.perBranch.join(','));
check('every link goes both ways, and every node is joined to the start',
  shape.asym.length === 0 && shape.reach === shape.count, `${shape.reach}/${shape.count} ${shape.asym.join(',')}`);
check('each branch ends in its 키스톤', shape.keystones === 6 && shape.keyFurthest);
check('and further out is better: no small node is paid less than one nearer in', shape.outward);

// --- 5. taking and giving back ---
const rules = await ev(`(() => {
  const p = window.passives;
  const out = {};
  out.farOff = p.allocate('warrior.s3');
  out.first = p.allocate('warrior.s1');
  out.second = p.allocate('warrior.s2');
  out.third = p.allocate('warrior.s3');
  out.middleBack = p.refund('warrior.s2');
  out.endBack = p.refund('warrior.s3');
  out.afterEnd = p.value.allocated.slice();
  out.shards = p.value.shards;
  while (p.freePoints > 0) { const next = Object.values(window.config.PASSIVE_NODES).find(n => p.canAllocate(n.id)); if (!next) break; p.allocate(next.id); }
  out.full = p.allocate(Object.values(window.config.PASSIVE_NODES).find(n => !p.isAllocated(n.id) && p.isReachable(n.id))?.id);
  // Out of shards, nothing comes back.
  const v = p.value;
  localStorage.setItem('${KEY}', JSON.stringify({ ...v, shards: 0 }));
  return out;
})()`);
console.log('rules:', JSON.stringify(rules));
check('a node not joined to one taken cannot be taken', rules.farOff === false);
check('a node joined to one taken can, a point each', rules.first && rules.second && rules.third);
check('one that would cut others off cannot be given back', rules.middleBack === false);
check('an end can, for PASSIVE_RESPEC.shardCost shards', rules.endBack === true && !rules.afterEnd.includes('warrior.s3') && rules.shards === 3,
  `${rules.afterEnd.join(',')}; ${rules.shards} shards`);
check('with no point free, nothing more is taken', rules.full === false);
const sane = await ev(`(() => {
  localStorage.setItem('${KEY}', window.sealRecord('${KEY}', { version: 2, shards: 0, xp: 0, bonusPoints: 2,
    allocated: ['warrior.s1', 'hunter.s5', 'warrior.s2', 'warrior.s3', 'made.up'] }));
  return 1;
})()`);
void sane;
await cdp.send('Page.reload', {});
await sleep(4200);
const cleaned = await stored();
const cleanedLive = await ev(`(() => window.passives.value.allocated)()`);
check('a hand-edited tree keeps only what is joined to the start, and no more than its points',
  JSON.stringify(cleanedLive) === JSON.stringify(['warrior.s1', 'warrior.s2']), JSON.stringify(cleanedLive));
void cleaned;

// --- 6. the screen ---
await loadRun({ version: 2, shards: 2, xp: 0, bonusPoints: 3, allocated: [] });
await ev(`(() => { window.game.scene.getScene('GameScene').scene.start('MenuScene'); return 1; })()`);
await sleep(1600);
const badge = await scene('MenuScene', `return s.icons.views.find(v => v.button.id === 'passives').badge.visible;`);
check('the 패시브 icon wears a dot while a point is free', badge === true);
await ev(`(() => window.game.scene.getScene('MenuScene').icons.press('passives'))()`);
await sleep(1000);
const screen = await scene('PassiveScene', `
  return { nodes: s.nodes.size, all: Object.keys(window.config.PASSIVE_NODES).length, purse: s.purse.text,
           zoom: s.treeCam.zoom, view: { x: s.view.x, y: s.view.y, w: s.view.width, h: s.view.height },
           start: s.screenOf('start'), s1: s.screenOf('warrior.s1') };
`);
check('every node is drawn', screen.nodes === screen.all, `${screen.nodes}/${screen.all}`);
check('the purse reads level, points and shards', /계정 Lv 1/.test(screen.purse) && /포인트 3/.test(screen.purse) && /신성한 조각 2/.test(screen.purse), screen.purse);
check('the first look is centred on the start',
  Math.abs(screen.start.x - (screen.view.x + screen.view.w / 2)) < 2 && Math.abs(screen.start.y - (screen.view.y + screen.view.h / 2)) < 2);

const page = await ev(`(() => { const r = window.game.canvas.getBoundingClientRect();
  return { left: r.left, top: r.top, k: r.width / window.game.scale.width }; })()`);
const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', {
  type, x: page.left + x * page.k, y: page.top + y * page.k, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
// A tap on a node picks it; the button takes it.
await mouse('mousePressed', screen.s1.x, screen.s1.y);
await mouse('mouseReleased', screen.s1.x, screen.s1.y);
await sleep(250);
const picked = await scene('PassiveScene', `return { selected: s.selected, detail: s.detail.text, status: s.status.text };`);
check('a tap on a node picks it and says what it gives', picked.selected === 'warrior.s1' && /근접 스킬 피해 \+\d+%/.test(picked.detail),
  `${picked.selected}: ${picked.detail.replace(/\n/g, ' / ')}`);
await scene('PassiveScene', `s.takeButton.plate.emit('pointerdown'); return 1;`);
await sleep(200);
const took = await ev(`(() => ({ taken: window.passives.isAllocated('warrior.s1'), free: window.passives.freePoints }))()`);
check('and 찍기 takes it, for a point', took.taken && took.free === 2);
// A drag moves the view, and picks nothing.
const v = screen.view;
const mid0 = await scene('PassiveScene', `return [s.treeCam.midPoint.x, s.treeCam.midPoint.y];`);
await mouse('mousePressed', v.x + 20, v.y + v.h - 20);
for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', v.x + 20 + i * 8, v.y + v.h - 20 - i * 6); await sleep(30); }
await mouse('mouseReleased', v.x + 68, v.y + v.h - 56);
await sleep(200);
const after = await scene('PassiveScene', `return { mid: [s.treeCam.midPoint.x, s.treeCam.midPoint.y], selected: s.selected };`);
check('a drag on the window moves the tree', Math.hypot(after.mid[0] - mid0[0], after.mid[1] - mid0[1]) > 10);
check('and picks nothing on the way', after.selected === 'warrior.s1');
const zoomed = await scene('PassiveScene', `const a = s.treeCam.zoom; s.zoomBy(1.2); const b = s.treeCam.zoom;
  s.zoomBy(100); const c = s.treeCam.zoom; s.zoomBy(0.001); return { a, b, c, d: s.treeCam.zoom,
  min: window.config.PASSIVE_TREE.minZoom, max: window.config.PASSIVE_TREE.maxZoom };`);
check('it zooms, inside its bounds', zoomed.b > zoomed.a && zoomed.c === zoomed.max && zoomed.d === zoomed.min, JSON.stringify(zoomed));
await scene('PassiveScene', `s.zoomBy(2); s.select('warrior.s2'); return 1;`);
await shot('passive-01-tree');

// --- 7. what nodes and 키스톤 do in a run ---
const groupA = [...spine('warrior'), ...spine('guardian'), ...spine('voidcaller')];
await loadRun({ version: 2, shards: 0, xp: 0, bonusPoints: groupA.length, allocated: groupA });
const a = await run(`
  s.choosing = true;
  const c = window.config, N = c.PASSIVE_NODES, K = c.KEYSTONES;
  const sum = (stat, tags) => ${JSON.stringify(groupA)}.flatMap(id => N[id].mods)
    .filter(m => m.stat === stat && (!m.tag || (tags || []).includes(m.tag))).reduce((t, m) => t + m.value, 0);
  const p = s.player;
  p.setInvulnerable(false); p.invulnerableUntil = 0;
  // 철인: two shots at once both land, each smaller.
  const hp0 = p.hp; p.takeDamage(100); const one = hp0 - p.hp; p.takeDamage(100); const two = hp0 - p.hp - one;
  const takenScale = (1 - sum('damageTaken') / 100) * K.ironWill.damageTakenMore;
  // 학살자: a 근접 kill hurts the one standing by it.
  s.spawner.clear();
  const victim = s.spawner.group.get(p.x, p.y); victim.spawn(p.x + 200, p.y, p, 'brute');
  const by = s.spawner.group.get(p.x, p.y); by.spawn(p.x + 230, p.y, p, 'brute');
  const byHp = by.hp;
  // Crits off for the measurement: a crit doubles the burst.
  const savedCrit = c.PLAYER.critChance; c.PLAYER.critChance = 0;
  s.combat.hit(victim, victim.hp + 1, 'meleeStrike');
  c.PLAYER.critChance = savedCrit;
  const burst = byHp - by.hp;
  s.spawner.clear();
  return {
    maxHp: p.maxHp, wantHp: Math.round(c.PLAYER.maxHp * s.mods.gear.maxHpScale * (1 + sum('maxHp') / 100)),
    one, two, wantOne: Math.max(1, Math.round(100 * takenScale)),
    burst, wantBurst: Math.round(victim.maxHp * K.slaughter.burstShare),
    cooldown: s.cooldownOf('meleeStrike'),
    wantCooldown: 1000 / (c.SKILL_BASE.meleeStrike.attackSpeed * (1 + sum('attackSpeed', ['물리','공격','근접','범위']) / 100) * K.eternity.attackSpeedMore * s.mods.gear.attackSpeedScale * (s.mods.gear.skillAttackSpeed.meleeStrike ?? 1)),
    damage: s.damageOf('meleeStrike'),
    wantDamage: Math.round((c.SKILL_BASE.meleeStrike.damage * (1 + sum('damage', ['물리','공격','근접','범위']) / 100) + s.mods.gear.attack) * s.mods.gear.damageScale * (c.BALANCE.damageScale.meleeStrike ?? 1)),
  };
`);
console.log('group A:', JSON.stringify(a));
check('최대 체력 nodes raise the bar the run starts on', a.maxHp === a.wantHp, `${a.maxHp} / ${a.wantHp}`);
check('철인: no window after a hit — two shots at once both land', a.one > 0 && a.two === a.one);
check('and every hit is smaller by the tree and 철인', a.one === a.wantOne, `${a.one} / ${a.wantOne}`);
check('학살자: a 근접 kill bursts on what stands by it', a.burst === a.wantBurst, `${a.burst} / ${a.wantBurst}`);
check('영원의 계약 and the attack-speed nodes fold into the cooldown', Math.abs(a.cooldown - a.wantCooldown) < 1,
  `${a.cooldown.toFixed(1)} / ${a.wantCooldown.toFixed(1)}`);
check('근접 damage nodes lift 타격', a.damage === a.wantDamage, `${a.damage} / ${a.wantDamage}`);

const groupB = [...spine('hunter'), ...spine('assassin'), ...spine('elementalist')];
await loadRun({ version: 2, shards: 0, xp: 0, bonusPoints: groupB.length, allocated: groupB });
const b = await run(`
  s.choosing = true;
  const c = window.config, N = c.PASSIVE_NODES, K = c.KEYSTONES;
  const sum = (stat) => ${JSON.stringify(groupB)}.flatMap(id => N[id].mods).filter(m => m.stat === stat && !m.tag).reduce((t, m) => t + m.value, 0);
  s.acquire('fireball');
  const before = s.damageOf('fireball');
  // 원소 과부하: a crit charges 원소 skills.
  const saved = c.PLAYER.critChance; c.PLAYER.critChance = 1;
  s.spawner.clear();
  const e = s.spawner.group.get(s.player.x, s.player.y); e.spawn(s.player.x + 300, s.player.y, s.player, 'brute');
  const hp = e.hp; s.combat.hit(e, 10, 'meleeStrike'); const critHit = hp - e.hp;
  c.PLAYER.critChance = saved;
  const charged = s.damageOf('fireball');
  s.spawner.clear();
  return {
    crit: s.player.critChance,
    wantCrit: Math.min(1, c.PLAYER.critChance * (1 + s.mods.gear.critChanceIncrease + sum('critChance') / 100) * K.assassinMark.critChanceMore),
    shots: s.projectilesOf('fireball').shots,
    critHit, before, charged, more: K.overload.elementalMore,
  };
`);
console.log('group B:', JSON.stringify(b));
check('암살자의 표식 and the crit nodes multiply the crit chance', Math.abs(b.crit - b.wantCrit) < 1e-9, `${b.crit} / ${b.wantCrit}`);
check('일점사: a thrown skill throws one, whatever adds more', b.shots === 1);
check('원소 과부하: a crit hits for no more than its number', b.critHit === 10, `${b.critHit}`);
check('and charges 원소 skills for a while', Math.abs(b.charged / b.before - b.more) < 0.02, `${b.before} -> ${b.charged}`);
await shot('passive-02-run');

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
