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
const ev = (expr) => cdp.evaluate(expr);
const run = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);
const scene = (key, body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('${key}'); ${body} })()`);
const openIcon = async (id) => {
  await ev(`(() => window.game.scene.getScene('MenuScene').icons.press('${id}'))()`);
  await sleep(900);
};
const KEY = 'exiled-survivors:passives:v1';
const stored = () => ev(`(() => {
  const raw = localStorage.getItem('${KEY}');
  return raw ? JSON.parse(raw) : null;
})()`);
const reload = async () => {
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
  await sleep(900);
  await cdp.send('Page.reload', {});
  await sleep(4500);
};

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(1200);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. no 신성한 조각 since 0.83: nothing drops one, nothing makes a point of one ---
const gone = await run(`
  s.choosing = true;
  s.spawner.clear();
  for (let i = 0; i < 100; i++) {
    const e = s.spawner.group.get(600, 600);
    e.spawn(600, 600, s.player, 'grunt');
    s.combat.hit(e, 999999);
  }
  for (let i = 0; i < 40; i++) {
    const boss = s.spawner.spawnBoss();
    s.combat.hit(boss, 999999);
  }
  const named = s.children.list.filter((o) => o.type === 'Text' && /신성한 조각/.test(o.text)).length;
  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.talentShardDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.gems.getChildren().forEach(g => g.active && g.collect());
  s.spawner.clear();
  s.choosing = false;
  const c = window.config;
  return { named, group: 'shardDrops' in s.combat, drop: typeof s.combat.dropShardAt,
           add: typeof window.passives.addShard, buy: typeof window.passives.buyShard,
           dial: c.DIALS.some((d) => d.path.startsWith('SHARD')), table: 'SHARD' in c,
           filter: c.ALL_FILTER_KEYS.some((key) => key === 'shard' || key.includes('divine')) };
`);
console.log('shards gone:', JSON.stringify(gone));
check('no kill, 우두머리 or not, leaves a 신성한 조각, and nothing is there to drop or make one',
  gone.named === 0 && !gone.group && gone.drop === 'undefined' && gone.add === 'undefined' && gone.buy === 'undefined' &&
    !gone.dial && !gone.table && !gone.filter, JSON.stringify(gone));

// --- 2. (0.102) a tree from before starts over: every player holds PASSIVE_POINTS, in the 재능의 파편 lines ---
await ev(`(() => {
  localStorage.setItem('${KEY}', window.sealRecord('${KEY}', { points: 1, ranks: { damage: 3, luck: 2 } }));
  return 1;
})()`);
await reload();
const fresh = await ev(`({ value: window.passives.value, total: window.config.PASSIVE_POINTS,
  lines: window.config.ALL_PASSIVES.map((p) => ({ id: p.id, stat: p.shardStat, max: p.maxRank, per: p.shardWeight })),
  stats: window.config.TALENT_SHARD.stats })`);
const kept = await stored();
console.log('fresh:', JSON.stringify(fresh));
check('a tree from before 0.102 starts over at PASSIVE_POINTS, its old lines gone',
  fresh.value.points === fresh.total && Object.keys(fresh.value.ranks).length === 0 && fresh.value.scheme === 2 &&
    kept.points === fresh.total && typeof kept._s === 'string',
  JSON.stringify({ value: fresh.value, stored: { points: kept.points } }));
check('there is one line for each 재능의 파편 stat, none capped short of every point',
  fresh.stats.every((stat) => fresh.lines.some((l) => l.stat === stat && l.max >= fresh.total)) && fresh.lines.length === fresh.stats.length,
  fresh.lines.map((l) => `${l.id}:${l.stat}`).join(' / '));

// --- 3. the corner icon: a dot while points wait, and a day's spotlight (ICON_SPOTLIGHT) ---
await ev(`(() => { window.game.scene.getScene('GameScene').scene.start('MenuScene'); return 1; })()`);
await sleep(1700);
const title = await scene('MenuScene', `
  const v = s.icons.views.find(v => v.button.id === 'passives');
  return { badge: v.badge.visible, ring: !!v.ring, until: window.config.ICON_SPOTLIGHT.passives, now: Date.now(),
    others: s.icons.views.filter(o => o.button.id !== 'passives').some(o => !!o.ring) };
`);
check('the 패시브 icon wears a dot while points wait',
  title.badge === true, JSON.stringify(title));
check('and a ring pulses round it until ICON_SPOTLIGHT.passives, round no other icon',
  title.ring === (title.now < title.until) && !title.others, JSON.stringify(title));
await shot('passive-02-title');

// --- 4. the dials (0.102, the user's ask: no tree) ---
await openIcon('passives');
const dials = `[...s.knobs.values()].map(k => ({ id: k.id, rank: k.rank.text, chance: k.chance.text, x: Math.round(k.x), y: Math.round(k.y) }))`;
const screen = await scene('PassiveScene', `return { dials: ${dials}, purse: s.purse.text, width: s.scale.width, height: s.scale.height,
  tree: 'treeCam' in s || 'nodes' in s };`);
console.log('dials:', JSON.stringify(screen));
// Under each dial, how much more often its shard drops (0.103: the increase, not the chance).
const rateText = (mult) => `${Math.round((mult - 1) * 100)}% 증가`;
check('패시브 is a grid of dials, one a line, each at 0 and 0% 증가 — no tree, no raw drop chance',
  screen.dials.length === fresh.lines.length && screen.dials.every((d) => d.rank === '0' && d.chance === rateText(1)) && !screen.tree,
  screen.dials.map((d) => `${d.id} ${d.rank} ${d.chance}`).join(' / '));
check('every dial sits on the screen, and the purse reads every point',
  screen.dials.every((d) => d.x > 0 && d.x < screen.width && d.y > 0 && d.y < screen.height) && /30 \/ 30/.test(screen.purse),
  screen.purse);

const first = fresh.lines[0].id;
const spent = await scene('PassiveScene', `
  for (let i = 0; i < 3; i++) s.spend('${first}');
  return { dials: ${dials}, purse: s.purse.text, points: window.passives.value.points, rank: window.passives.rankOf('${first}') };
`);
const want = rateText(1 + 3 * fresh.lines[0].per);
check('a press puts a point in: the rank, the purse and that shard’s drop rate go up',
  spent.rank === 3 && spent.points === 27 && spent.dials[0].rank === '3' && spent.dials[0].chance === want,
  `${spent.dials[0].rank} ${spent.dials[0].chance} (want ${want}%), ${spent.purse}`);
const back = await scene('PassiveScene', `s.refund('${first}'); return { points: window.passives.value.points, rank: window.passives.rankOf('${first}') };`);
check('its − takes one back', back.rank === 2 && back.points === 28, JSON.stringify(back));
const full = await scene('PassiveScene', `
  for (let i = 0; i < 40; i++) s.spend('${first}');
  return { rank: window.passives.rankOf('${first}'), points: window.passives.value.points };
`);
check('a line has no cap of its own: it takes every point there is, and no more',
  full.rank === 30 && full.points === 0, JSON.stringify(full));
await scene('PassiveScene', `for (let i = 0; i < 30; i++) s.refund('${first}'); for (let i = 0; i < 10; i++) s.spend('${first}'); return 1;`);
await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(150);
await cdp.tap('Space', 32, ' ');
await sleep(300);
const keyed = await scene('PassiveScene', `return { focused: s.focused, rank: window.passives.rankOf(window.config.ALL_PASSIVES[1].id) };`);
check('the arrows walk the dials and Space spends on the one the keys are on', keyed.focused === 1 && keyed.rank === 1, JSON.stringify(keyed));
await shot('passive-03-spent');
await scene('PassiveScene', `s.resetButton.plate.emit('pointerdown'); return 1;`);
await sleep(300);
const reset = await scene('PassiveScene', `return { value: window.passives.value, dials: ${dials} };`);
const afterReset = await stored();
check('초기화 gives every point back, and it is kept',
  reset.value.points === 30 && Object.keys(reset.value.ranks).length === 0 && reset.dials.every((d) => d.rank === '0') &&
    afterReset.points === 30,
  JSON.stringify(reset.value));
// A last point spent, so the run below has a line to read.
await scene('PassiveScene', `for (let i = 0; i < 30; i++) s.spend('${first}'); return 1;`);
await cdp.tap('Escape', 27, 'Escape');
await sleep(800);
const badgeGone = await scene('MenuScene', `return { active: s.scene.isActive(), passive: window.game.scene.isActive('PassiveScene'),
  badge: s.icons.views.find(v => v.button.id === 'passives').badge.visible, points: window.passives.value.points };`);
check('Esc leaves for the title, and with points still waiting the dot stays',
  badgeGone.passive === false && badgeGone.badge === (badgeGone.points > 0), JSON.stringify(badgeGone));

// --- 5. 장비 > 재능의 파편 > 전투 내 효과: damage is 플랫 × 증가 × 증폭 ---
await ev(`(() => {
  localStorage.setItem('exiled-survivors:gear:v2', JSON.stringify({
    items: [
      { uid: 'starter', id: 'rustySword', prefixes: [], suffixes: [] },
      { uid: 'loaded', id: 'steelSword', prefixes: [{ id: 'mighty', tier: 3 }, { id: 'honed', tier: 3 }], suffixes: [{ id: 'giant', tier: 3 }, { id: 'regrowth', tier: 3 }], rungs: window.config.AFFIX_RUNGS },
    ],
    equipped: 'loaded',
  }));
  return 1;
})()`);
await reload();
const folded = await run(`
  s.gainShard('damage'); s.gainShard('damage'); s.gainShard('attackSpeed');
  return {
    shard: s.mods.shard,
    gear: s.mods.gear,
    damage: s.damageOf('meleeStrike'),
    cooldown: s.cooldownOf('meleeStrike'),
    maxHp: s.player.maxHp,
    wantAttack: window.config.attackForTier(window.config.GEAR.steelSword.tier),
    wantAmplify: (window.config.GEAR.steelSword.implicit?.damageScale ?? 1) +
      window.config.AFFIXES.mighty.gearTiers.find(t => t.tier === 3).gear.damageScale - 1,
    scale: window.config.BALANCE.damageScale.meleeStrike ?? 1,
    base: window.config.SKILL_BASE.meleeStrike.damage,
    baseRate: window.config.SKILL_BASE.meleeStrike.attackSpeed,
    lines: [...window.gear.equipped.prefixes, ...window.gear.equipped.suffixes].map(l => l.id),
    amp: window.config.TALENT_SHARD.amplify,
    wantMaxHp: Math.round(
      window.config.PLAYER.maxHp *
        window.config.AFFIXES.giant.gearTiers.find(t => t.tier === 3).gear.maxHpScale *
        s.heldBonus.maxHpScale,
    ),
  };
`);
console.log('folded:', JSON.stringify(folded));
const wantDamage = Math.round(
  (folded.base + folded.gear.attack) * (1 + folded.gear.damageIncrease) * folded.shard.damage * folded.gear.damageAmplify * folded.scale,
);
check('the weapon’s attack joins the base, then 증가 and 증폭 (the shards’, the weapon’s) multiply the lot',
  folded.damage === wantDamage && Math.abs(folded.shard.damage - (1 + 2 * folded.amp)) < 1e-9,
  `(${folded.base} + ${folded.gear.attack}) x ${1 + folded.gear.damageIncrease} x ${folded.shard.damage} x ${folded.gear.damageAmplify} = ${folded.damage}`);
check('and the sword is its tier’s attack, its 강력 and 고정 속성 added into one 증폭',
  folded.gear.attack === folded.wantAttack && Math.abs(folded.gear.damageAmplify - folded.wantAmplify) < 1e-9,
  `+${folded.gear.attack}, 증폭 ×${folded.gear.damageAmplify}`);
check('a saved 예리 and 재생 fall off the weapon instead of counting',
  JSON.stringify(folded.lines) === JSON.stringify(['mighty', 'giant']), folded.lines.join(' / '));
check('attack speed folds the same way, the shards’ an 증폭 of it',
  Math.abs(folded.cooldown - 1000 / (folded.baseRate * folded.shard.attackSpeed)) < 2,
  `${Math.round(folded.cooldown)}ms at x${folded.shard.attackSpeed}`);
check('거대 is on the bar it starts the run with', folded.maxHp === folded.wantMaxHp, `${folded.maxHp}, wanted ${folded.wantMaxHp}`);

const stacked = await run(`
  const base = window.config.SKILL_BASE.meleeStrike.damage;
  for (let i = 0; i < 5; i++) s.progression.apply('meleeStrike', 'damage');
  return { base, stat: s.progression.statsFor('meleeStrike').damage, after: s.damageOf('meleeStrike'),
    shard: s.mods.shard.damage, gear: s.mods.gear.attack, increase: s.mods.gear.damageIncrease,
    amplify: s.mods.gear.damageAmplify, scale: window.config.BALANCE.damageScale.meleeStrike ?? 1 };
`);
check('picks within the run add up on the base, rather than compounding',
  Math.abs(stacked.stat - stacked.base * 2) < 1e-6, `${stacked.base} with five picks of +20% -> ${stacked.stat}`);
check('damage is 플랫 × 증가 × 증폭: the picks and 강력 add, the shards multiply',
  stacked.after === Math.round((stacked.base + stacked.gear) * (2 + stacked.increase) * stacked.shard * stacked.amplify * stacked.scale),
  `(${stacked.base} + ${stacked.gear}) x ${2 + stacked.increase} x ${stacked.shard} x ${stacked.amplify} = ${stacked.after}`);
await shot('passive-04-run');

// --- 0.131: 체력회복 went; points spent on it come back as the tree loads ---
await ev(`(() => {
  const C = window.config;
  localStorage.setItem(C.STORAGE.passives, window.sealRecord(C.STORAGE.passives,
    { scheme: C.PASSIVE_SCHEME, points: 20, ranks: { shardDamage: 4, shardRegen: 6 } }));
  return 1;
})()`);
await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await cdp.until(`window.passives && window.game?.scene.getScene('GameScene')?.player?.active`, 30000, 200);
const returned = await ev(`(() => {
  const v = window.passives.value, C = window.config;
  const stored = window.openRecord(C.STORAGE.passives, localStorage.getItem(C.STORAGE.passives)).value;
  return { points: v.points, ranks: v.ranks, all: C.PASSIVE_POINTS, stored: stored.points, line: 'shardRegen' in C.PASSIVES };
})()`);
check('a tree with points on 체력회복 gets them back to spend, and the line is gone',
  returned.points === 26 && returned.ranks.shardDamage === 4 && returned.ranks.shardRegen === undefined &&
    returned.stored === 26 && returned.line === false,
  JSON.stringify(returned));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
