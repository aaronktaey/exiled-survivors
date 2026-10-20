import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 패시브 트리 (the graph, 0.72): the same PASSIVE_POINTS for every player
// and nothing else feeding it (no 신성한 조각, gold or account level), a
// grid where every link runs straight across or up and down — so the arrow
// keys walk it — the rules for taking a node and taking it back, the
// screen, and what nodes and 키스톤 do in a run.

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

// --- 1. points: the same for everyone, and nothing a run brings in ---
const points = await run(`
  s.choosing = true;
  const p = window.passives;
  const before = { free: p.freePoints, total: p.totalPoints, want: window.config.PASSIVE_POINTS };
  for (let i = 0; i < 20; i++) {
    const e = s.spawner.group.get(s.player.x, s.player.y);
    e.spawn(s.player.x + 30, s.player.y, s.player, 'brute');
    s.combat.hit(e, 9999999);
  }
  const boss = s.spawner.spawnBoss();
  s.combat.hit(boss, 9999999);
  s.combat.collectEverything();
  s.writeSave();
  const after = { free: p.freePoints, total: p.totalPoints };
  for (const g of [s.combat.gearDrops, s.combat.skillDrops, s.combat.gems]) g.getChildren().forEach(d => d.active && d.collect());
  s.spawner.clear();
  s.choosing = false;
  return { before, after, shards: 'shardDrops' in s.combat, stored: JSON.parse(localStorage.getItem('${KEY}') || 'null'),
           handles: ['addXp', 'addShard', 'buyShard', 'account'].filter((k) => k in p) };
`);
check('every player has PASSIVE_POINTS to spend', points.before.free === points.before.want && points.before.total === points.before.want,
  JSON.stringify(points.before));
check('and nothing a run does adds to them — no account level, no 신성한 조각',
  points.after.free === points.before.free && points.shards === false && points.handles.length === 0, JSON.stringify(points));

// --- 2. a tree from before 0.72 starts empty ---
await loadRun({ version: 2, shards: 4, xp: 99999, bonusPoints: 8, allocated: ['warrior.s1', 'warrior.s2'] });
const moved = await ev(`(() => ({ v: window.passives.value, free: window.passives.freePoints }))()`);
check('a tree from before the grid starts empty, with every point to spend',
  moved.v.version === 3 && moved.v.allocated.length === 0 && moved.free === points.before.want && !('shards' in moved.v),
  JSON.stringify(moved));

// --- 3. the shape of the tree ---
const shape = await ev(`(() => {
  const N = window.config.PASSIVE_NODES, V = window.config.NODE_VALUES, cell = window.config.TREE_SHAPE.cell;
  const all = Object.values(N);
  const asym = all.filter(n => n.links.some(l => !N[l] || !N[l].links.includes(n.id))).map(n => n.id);
  const hops = { start: 0 }; const q = ['start'];
  while (q.length) { const at = q.shift(); for (const l of N[at].links) if (hops[l] === undefined) { hops[l] = hops[at] + 1; q.push(l); } }
  const branches = [...new Set(all.map(n => n.branch).filter(Boolean))];
  const keystones = all.filter(n => n.kind === 'keystone');
  // Each branch's 키스톤 is its furthest node, counted in links from the start.
  const keyFurthest = keystones.every(k => all.filter(n => n.branch === k.branch).every(n => hops[n.id] <= hops[k.id]));
  const outward = Object.values(V).every(([a, b, c]) => a <= b && b <= c);
  // The grid: every node on it, every link straight across or up and down,
  // at most one each way from a node, and none running over another node.
  const offGrid = all.filter(n => n.x % cell !== 0 || n.y % cell !== 0).map(n => n.id);
  const bent = [], doubled = [], over = [];
  for (const n of all) {
    const ways = new Set();
    for (const l of n.links) {
      const o = N[l];
      const dx = Math.sign(o.x - n.x), dy = Math.sign(o.y - n.y);
      if (dx !== 0 && dy !== 0) bent.push(n.id + '-' + l);
      const way = dx + ',' + dy;
      if (ways.has(way)) doubled.push(n.id + ' ' + way);
      ways.add(way);
      for (const m of all) {
        if (m.id === n.id || m.id === l) continue;
        const between = dx === 0
          ? m.x === n.x && (m.y - n.y) * (m.y - o.y) < 0
          : m.y === n.y && (m.x - n.x) * (m.x - o.x) < 0;
        if (between) over.push(n.id + '-' + l + ' over ' + m.id);
      }
    }
  }
  const spots = new Set(all.map(n => n.x + ',' + n.y));
  return { count: all.length, asym, reach: Object.keys(hops).length, branches: branches.length,
           perBranch: branches.map(b => all.filter(n => n.branch === b).length),
           keystones: keystones.length, keyFurthest, outward, offGrid, bent, doubled, over: over.slice(0, 5),
           stacked: all.length - spots.size, keyHops: keystones.map(k => hops[k.id]) };
})()`);
console.log('shape:', JSON.stringify(shape));
check('the tree is six branches out of one start', shape.branches === 6 && shape.perBranch.every((n) => n === shape.perBranch[0]),
  shape.perBranch.join(','));
check('every link goes both ways, and every node is joined to the start',
  shape.asym.length === 0 && shape.reach === shape.count, `${shape.reach}/${shape.count} ${shape.asym.join(',')}`);
check('each branch ends in its 키스톤', shape.keystones === 6 && shape.keyFurthest, shape.keyHops.join(','));
check('and further out is better: no small node is paid less than one nearer in', shape.outward);
check('every node sits on the grid, no two on one spot', shape.offGrid.length === 0 && shape.stacked === 0, JSON.stringify(shape.offGrid));
check('every link runs straight across or straight up and down', shape.bent.length === 0, shape.bent.join(' '));
check('a node has at most one link each way, and no link runs over a node',
  shape.doubled.length === 0 && shape.over.length === 0, `${shape.doubled.join(' ')} ${shape.over.join(' ')}`);
check('every 키스톤 is within the points', shape.keyHops.every((h) => h <= points.before.want), shape.keyHops.join(','));

// --- 4. taking and giving back ---
const rules = await ev(`(() => {
  const p = window.passives;
  p.reset();
  const out = {};
  out.farOff = p.allocate('warrior.s3');
  out.first = p.allocate('warrior.s1');
  out.second = p.allocate('warrior.s2');
  out.third = p.allocate('warrior.s3');
  out.middleBack = p.refund('warrior.s2');
  out.free = p.freePoints;
  out.endBack = p.refund('warrior.s3');
  out.freeAfter = p.freePoints;
  out.afterEnd = p.value.allocated.slice();
  while (p.freePoints > 0) { const next = Object.values(window.config.PASSIVE_NODES).find(n => p.canAllocate(n.id)); if (!next) break; p.allocate(next.id); }
  out.taken = p.value.allocated.length;
  out.full = p.allocate(Object.values(window.config.PASSIVE_NODES).find(n => !p.isAllocated(n.id) && p.isReachable(n.id))?.id);
  return out;
})()`);
console.log('rules:', JSON.stringify(rules));
check('a node not joined to one taken cannot be taken', rules.farOff === false);
check('a node joined to one taken can, a point each', rules.first && rules.second && rules.third);
check('one that would cut others off cannot be given back', rules.middleBack === false);
check('an end can, for nothing — its point comes back', rules.endBack === true && !rules.afterEnd.includes('warrior.s3') &&
  rules.freeAfter === rules.free + 1, `${rules.afterEnd.join(',')}; ${rules.free} -> ${rules.freeAfter}`);
check('with every point spent, nothing more is taken', rules.full === false && rules.taken === points.before.want, `${rules.taken}`);
await ev(`(() => {
  const many = ['warrior.s1', 'hunter.s5', 'warrior.s2', 'warrior.s3', 'made.up'];
  localStorage.setItem('${KEY}', window.sealRecord('${KEY}', { version: 3, allocated: many }));
  return 1;
})()`);
await cdp.send('Page.reload', {});
await sleep(4200);
const cleanedLive = await ev(`(() => window.passives.value.allocated)()`);
check('a hand-edited tree keeps only what is joined to the start',
  JSON.stringify(cleanedLive) === JSON.stringify(['warrior.s1', 'warrior.s2', 'warrior.s3']), JSON.stringify(cleanedLive));
await ev(`(() => {
  const N = window.config.PASSIVE_NODES;
  const joined = ['warrior.s1','warrior.s2','warrior.s3','warrior.s4','warrior.s5','warrior.s6','warrior.s7',
    'voidcaller.s1','voidcaller.s2','voidcaller.s3','voidcaller.s4','voidcaller.s5','voidcaller.s6','voidcaller.s7','util.1','util.2'];
  localStorage.setItem('${KEY}', window.sealRecord('${KEY}', { version: 3, allocated: joined }));
  return 1;
})()`);
await cdp.send('Page.reload', {});
await sleep(4200);
const capped = await ev(`(() => window.passives.value.allocated)()`);
check('and no more than the points, the last taken going first', capped.length === points.before.want && !capped.includes('util.2'),
  `${capped.length}: ${capped.slice(-2).join(',')}`);

// --- 5. the screen ---
await loadRun({ version: 3, allocated: [] });
await ev(`(() => { window.game.scene.getScene('GameScene').scene.start('MenuScene'); return 1; })()`);
await sleep(1600);
const badge = await scene('MenuScene', `return s.icons.views.find(v => v.button.id === 'passives').badge.visible;`);
check('the 패시브 icon wears a dot while a point is free', badge === true);
await ev(`(() => window.game.scene.getScene('MenuScene').icons.press('passives'))()`);
await sleep(1000);
const screen = await scene('PassiveScene', `
  return { nodes: s.nodes.size, all: Object.keys(window.config.PASSIVE_NODES).length, purse: s.purse.text,
           buttons: ['takeButton', 'refundButton', 'shopButton'].filter((k) => s[k]),
           zoom: s.treeCam.zoom, view: { x: s.view.x, y: s.view.y, w: s.view.width, h: s.view.height },
           start: s.screenOf('start'), s1: s.screenOf('warrior.s1') };
`);
check('every node is drawn', screen.nodes === screen.all, `${screen.nodes}/${screen.all}`);
check('the screen reads the points and nothing else, and has no shop',
  screen.purse.includes(`${points.before.want}/${points.before.want}`) && !/조각|골드|계정/.test(screen.purse) &&
    JSON.stringify(screen.buttons) === JSON.stringify(['takeButton', 'refundButton']), `${screen.purse} ${screen.buttons}`);
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
check('and 찍기 takes it, for a point', took.taken && took.free === points.before.want - 1);

// The arrow keys walk along the links.
const walk = [];
await scene('PassiveScene', `s.select('start'); return 1;`);
for (const [code, vk] of [['ArrowUp', 38], ['ArrowUp', 38], ['ArrowLeft', 37], ['ArrowDown', 40], ['ArrowRight', 39], ['ArrowDown', 40],
  ['ArrowDown', 40], ['ArrowRight', 39], ['ArrowDown', 40]]) {
  await cdp.tap(code, vk, code);
  await sleep(80);
  walk.push(await scene('PassiveScene', `return s.selected;`));
}
const ways = await ev(`(() => {
  const N = window.config.PASSIVE_NODES, S = window.game.scene.getScene('PassiveScene').constructor;
  let ok = 0, all = 0;
  for (const n of Object.values(N)) for (const l of n.links) {
    all += 1;
    if (S.linkedToward(n.id, Math.sign(N[l].x - n.x), Math.sign(N[l].y - n.y)) === l) ok += 1;
  }
  return { ok, all };
})()`);
console.log('walk:', walk.join(' → '));
check('arrow keys walk the links: up the 전사 spine, onto its arm and back, through the start to the side',
  JSON.stringify(walk) === JSON.stringify(['warrior.s1', 'warrior.s2', 'warrior.l3', 'warrior.l3', 'warrior.s2', 'warrior.s1', 'start', 'util.1', 'elementalist.s1']),
  walk.join(' → '));
check('and every link is one arrow press away, from either end', ways.ok === ways.all, `${ways.ok}/${ways.all}`);

// A drag moves the view, and picks nothing.
await scene('PassiveScene', `s.select('warrior.s1'); return 1;`);
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
await scene('PassiveScene', `s.zoomBy(1.6); s.select('warrior.s2'); return 1;`);
await shot('passive-01-tree');

// --- 7. what nodes and 키스톤 do in a run ---
// Fifteen points hold two branches at most, so the 키스톤 are tried two at a time.
const groupA = [...spine('warrior'), ...spine('voidcaller')];
await loadRun({ version: 3, allocated: groupA });
const a = await run(`
  s.choosing = true;
  const c = window.config, N = c.PASSIVE_NODES, K = c.KEYSTONES;
  const sum = (stat, tags) => ${JSON.stringify(groupA)}.flatMap(id => N[id].mods)
    .filter(m => m.stat === stat && (!m.tag || (tags || []).includes(m.tag))).reduce((t, m) => t + m.value, 0);
  const p = s.player;
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
    burst, wantBurst: Math.round(victim.maxHp * K.slaughter.burstShare),
    cooldown: s.cooldownOf('meleeStrike'),
    wantCooldown: 1000 / (c.SKILL_BASE.meleeStrike.attackSpeed * (1 + sum('attackSpeed', ['물리','공격','근접','범위']) / 100) * K.eternity.attackSpeedMore * s.mods.gear.attackSpeedScale * (s.mods.gear.skillAttackSpeed.meleeStrike ?? 1)),
    damage: s.damageOf('meleeStrike'),
    wantDamage: Math.round((c.SKILL_BASE.meleeStrike.damage * (1 + sum('damage', ['물리','공격','근접','범위']) / 100) + s.mods.gear.attack) * s.mods.gear.damageScale * (c.BALANCE.damageScale.meleeStrike ?? 1)),
  };
`);
console.log('group A:', JSON.stringify(a));
check('학살자: a 근접 kill bursts on what stands by it', a.burst === a.wantBurst, `${a.burst} / ${a.wantBurst}`);
check('영원의 계약 and the attack-speed nodes fold into the cooldown', Math.abs(a.cooldown - a.wantCooldown) < 1,
  `${a.cooldown.toFixed(1)} / ${a.wantCooldown.toFixed(1)}`);
check('근접 damage nodes lift 타격', a.damage === a.wantDamage, `${a.damage} / ${a.wantDamage}`);

const groupG = ['util.3', ...spine('guardian'), ...spine('assassin')];
await loadRun({ version: 3, allocated: groupG });
const g = await run(`
  s.choosing = true;
  const c = window.config, N = c.PASSIVE_NODES, K = c.KEYSTONES;
  const sum = (stat) => ${JSON.stringify(groupG)}.flatMap(id => N[id].mods).filter(m => m.stat === stat && !m.tag).reduce((t, m) => t + m.value, 0);
  const p = s.player;
  p.setInvulnerable(false); p.invulnerableUntil = 0;
  // 철인: two shots at once both land, each smaller.
  const hp0 = p.hp; p.takeDamage(100); const one = hp0 - p.hp; p.takeDamage(100); const two = hp0 - p.hp - one;
  const takenScale = (1 - sum('damageTaken') / 100) * K.ironWill.damageTakenMore * s.mods.gear.damageTakenScale;
  return {
    allocated: window.passives.value.allocated.length, want: ${groupG.length},
    maxHp: p.maxHp, wantHp: Math.round(c.PLAYER.maxHp * s.mods.gear.maxHpScale * (1 + sum('maxHp') / 100)),
    one, two, wantOne: Math.max(1, Math.round(100 * takenScale)),
    crit: s.player.critChance,
    wantCrit: Math.min(1, c.PLAYER.critChance * (1 + s.mods.gear.critChanceIncrease + sum('critChance') / 100) * K.assassinMark.critChanceMore),
  };
`);
console.log('group G:', JSON.stringify(g));
check('two branches off the side fit in the points', g.allocated === g.want, `${g.allocated}/${g.want}`);
check('최대 체력 nodes raise the bar the run starts on', g.maxHp === g.wantHp, `${g.maxHp} / ${g.wantHp}`);
check('철인: no window after a hit — two shots at once both land', g.one > 0 && g.two === g.one);
check('and every hit is smaller by the tree, the armour and 철인', g.one === g.wantOne, `${g.one} / ${g.wantOne}`);
check('암살자의 표식 and the crit nodes multiply the crit chance', Math.abs(g.crit - g.wantCrit) < 1e-9, `${g.crit} / ${g.wantCrit}`);

const groupB = ['util.1', ...spine('hunter'), ...spine('elementalist')];
await loadRun({ version: 3, allocated: groupB });
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
    shots: s.projectilesOf('fireball').shots,
    critHit, before, charged, more: K.overload.elementalMore,
  };
`);
console.log('group B:', JSON.stringify(b));
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
