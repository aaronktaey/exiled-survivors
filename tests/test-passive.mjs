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
const stored = () => ev(`(() => {
  const raw = localStorage.getItem('exiled-survivors:passives:v1');
  return raw ? JSON.parse(raw) : null;
})()`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(1200);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. 신성한 조각: half of 우두머리 kills, and nothing else ---
const drops = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.shardDrops.getChildren().forEach(d => d.active && d.collect());

  for (let i = 0; i < 400; i++) {
    const e = s.spawner.group.get(600, 600);
    e.spawn(600, 600, s.player, 'grunt');
    s.combat.hit(e, 999999);
  }
  const fromGrunts = s.combat.shardDrops.countActive(true);
  s.combat.shardDrops.getChildren().forEach(d => d.active && d.collect());

  const N = 800;
  let fromBosses = 0;
  for (let i = 0; i < N; i++) {
    const boss = s.spawner.spawnBoss();
    s.combat.hit(boss, 999999);
    fromBosses += s.combat.shardDrops.countActive(true);
    s.combat.shardDrops.getChildren().forEach(d => d.active && d.collect());
  }

  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.gems.getChildren().forEach(g => g.active && g.collect());
  s.spawner.clear();
  s.choosing = false;
  return { fromGrunts, fromBosses, N, rate: Number((fromBosses / N).toFixed(3)) };
`);
console.log('shards:', JSON.stringify(drops));
check('400 ordinary kills leave no 신성한 조각', drops.fromGrunts === 0, `${drops.fromGrunts}`);
check('about half of 우두머리 kills leave one',
  Math.abs(drops.rate - 0.5) < 0.06, `${(drops.rate * 100).toFixed(1)}% of ${drops.N}`);

// --- 2. ten shards make a 구슬, which is a point ---
const counted = await run(`
  const p = s.player;
  window.gear ? null : null;
  const seen = [];
  for (let i = 0; i < 9; i++) {
    s.combat.dropShardAt(p.x, p.y);
  }
  return { dropped: s.combat.shardDrops.countActive(true) };
`);
await sleep(1300);
const nine = await stored();
console.log('nine shards:', JSON.stringify(nine), counted.dropped);
check('nine of them is nine, and no point yet',
  nine.shards === 9 && nine.points === 0, `${nine.shards} shards, ${nine.points} points`);

await run(`s.combat.dropShardAt(s.player.x, s.player.y); return 1;`);
await sleep(1000);
const ten = await stored();
const banner = await run(`
  return { lines: s.children.list.filter(o => o.type === 'Text').map(o => o.text) };
`);
console.log('tenth shard:', JSON.stringify(ten));
check('the tenth completes a 신성한 구슬, worth one point',
  ten.shards === 0 && ten.points === 1, `${ten.shards} shards, ${ten.points} points`);
check('and it says so', banner.lines.some((line) => /신성한 구슬/.test(line)),
  banner.lines.find((line) => /신성한/.test(line)) ?? 'no banner');
await shot('passive-01-shards');

// --- 3. the corner icons, not the list ---
await ev(`(() => { window.game.scene.getScene('GameScene').scene.start('MenuScene'); return 1; })()`);
await sleep(1700);
const title = await scene('MenuScene', `
  return {
    rows: s.menu.rows.map(r => r.item.id),
    icons: s.icons.views.map(v => ({
      id: v.button.id, label: v.label.text,
      x: Math.round(v.plate.x), y: Math.round(v.plate.y), badge: v.badge.visible,
    })),
    width: s.scale.width,
  };
`);
console.log('title:', JSON.stringify(title));
check('장비 and 패시브 have left the list', !title.rows.includes('gear'), title.rows.join(' / '));
check('and sit as icons in the top-right corner',
  title.icons.length === 2 && title.icons.every((i) => i.x > title.width * 0.8 && i.y < 60),
  title.icons.map((i) => `${i.label} at ${i.x},${i.y}`).join(' / '));
check('the 패시브 icon wears a dot while a point is waiting',
  title.icons.find((i) => i.id === 'passives').badge === true);
await shot('passive-02-title');

// --- 4. spending a point ---
await openIcon('passives');
const screen = await scene('PassiveScene', `
  return { labels: s.menu.rows.map(r => r.label.text), details: s.menu.rows.map(r => r.detail.text),
           purse: s.purse.text, enabled: s.menu.rows.map(r => r.item.enabled ? r.item.enabled() : true) };
`);
console.log('패시브:', JSON.stringify(screen));
// The first row is the shop; the lines follow it, and 돌아가기 ends it.
// 재생 is not among them any more: that is the sword's line to carry.
check('패시브 lists its lines, each at rank zero',
  screen.labels.slice(1, 3).join(' / ') === '피해 +10% / 공격속도 +10%' &&
    screen.details.slice(1, 3).every((d) => d === '0 / 10') &&
    !screen.labels.some((l) => /5초당/.test(l)),
  screen.labels.join(' / '));
check('and reads out the point in hand', /포인트 1/.test(screen.purse), screen.purse);
check('every line can be bought while a point is held',
  screen.enabled.slice(1, 3).every(Boolean));

await ev(`(() => {
  const s = window.game.scene.getScene('PassiveScene');
  s.menu.selected = s.menu.rows.findIndex(r => r.item.id === 'damage');
  s.menu.refresh(); return 1;
})()`);
await cdp.tap('Space', 32, ' ');
await sleep(600);
const spent = await scene('PassiveScene', `
  return { details: s.menu.rows.map(r => r.detail.text), purse: s.purse.text,
           enabled: s.menu.rows.map(r => r.item.enabled ? r.item.enabled() : true) };
`);
const afterSpend = await stored();
console.log('spent:', JSON.stringify({ spent, afterSpend }));
check('spending puts a rank on that line and takes the point',
  afterSpend.ranks.damage === 1 && afterSpend.points === 0 && spent.details[1] === '1 / 10',
  `${spent.details[1]}, ${afterSpend.points} points left`);
check('with none left, no line can be bought',
  spent.enabled.slice(1, 3).every((e) => e === false), spent.purse);
await shot('passive-03-spent');

await cdp.tap('Escape', 27, 'Escape');
await sleep(800);
const badgeGone = await scene('MenuScene', `
  return { badge: s.icons.views.find(v => v.button.id === 'passives').badge.visible };
`);
check('and the waiting dot goes with it', badgeGone.badge === false);

// --- 5. 패시브 > 장비 > 전투 내 효과, in that order ---
await ev(`(() => {
  localStorage.setItem('exiled-survivors:passives:v1', JSON.stringify({
    shards: 0, points: 0, ranks: { damage: 2, attackSpeed: 1 },
  }));
  localStorage.setItem('exiled-survivors:gear:v2', JSON.stringify({
    items: [
      { uid: 'starter', id: 'rustySword', prefixes: [], suffixes: [] },
      { uid: 'loaded', id: 'steelSword', prefixes: [{ id: 'mighty', tier: 3 }, { id: 'honed', tier: 3 }], suffixes: [{ id: 'giant', tier: 3 }, { id: 'regrowth', tier: 3 }] },
    ],
    equipped: 'loaded',
  }));
  return 1;
})()`);
// Navigating to the same hash does not reload the document, and both stores
// are already in memory; reload so they read what was just written.
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(900);
await cdp.send('Page.reload', {});
await sleep(4500);

const folded = await run(`
  return {
    passive: s.mods.passive,
    gear: s.mods.gear,
    damage: s.damageOf('meleeStrike'),
    stat: s.progression.statsFor('meleeStrike').damage,
    cooldown: Math.round(s.cooldownOf('meleeStrike')),
    maxHp: s.player.maxHp,
    // The sword is its tier's attack scaled by 강력. The save also carries
    // 예리 and 재생, which are gone: they must fall off rather than count.
    wantAttack: Math.round(
      window.config.attackForTier(window.config.GEAR.steelSword.tier) *
        window.config.AFFIXES.mighty.gearTiers.find(t => t.tier === 3).gear.attackScale,
    ),
    lines: [...window.gear.equipped.prefixes, ...window.gear.equipped.suffixes].map(l => l.id),
    wantMaxHp: Math.round(
      window.config.PLAYER.maxHp *
        window.config.AFFIXES.giant.gearTiers.find(t => t.tier === 3).gear.maxHpScale,
    ),
  };
`);
console.log('folded:', JSON.stringify(folded));
// The base, lifted by the tree, with the weapon added to the result.
const wantDamage = Math.round(
  15 * folded.passive.damageScale + folded.gear.attack,
);
check('패시브 lifts the skill, then 장비 is added to the result',
  folded.damage === wantDamage,
  `15 x ${folded.passive.damageScale.toFixed(2)} + ${folded.gear.attack} = ${folded.damage}`);
check('and the sword is the tier, scaled by 강력',
  folded.gear.attack === folded.wantAttack,
  `+${folded.gear.attack}, wanted +${folded.wantAttack}`);
check('a saved 예리 and 재생 fall off the weapon instead of counting',
  JSON.stringify(folded.lines) === JSON.stringify(['mighty', 'giant']),
  folded.lines.join(' / '));
check('attack speed folds the same way',
  Math.abs(folded.cooldown - 1000 / (1 * 1.1 * 1)) < 2,
  `${folded.cooldown}ms`);
// Written without a rung, so 거대 comes back at the middle one. Both the
// rung and the survivor's own bar are tuned in balance.ts, so read them.
check('거대 is on the bar it starts the run with',
  folded.maxHp === folded.wantMaxHp, `${folded.maxHp}, wanted ${folded.wantMaxHp}`);

// Within a layer the picks add up on the base; between layers they multiply.
const stacked = await run(`
  const base = 15;
  const before = s.damageOf('meleeStrike');
  // Five picks of +20% is +100% of the base, not 1.2 to the fifth.
  for (let i = 0; i < 5; i++) s.progression.apply('meleeStrike', 'damage');
  return {
    base,
    before,
    stat: s.progression.statsFor('meleeStrike').damage,
    after: s.damageOf('meleeStrike'),
    passive: s.mods.passive.damageScale,
    gear: s.mods.gear.attack,
  };
`);
console.log('stacked:', JSON.stringify(stacked));
check('picks within the run add up on the base, rather than compounding',
  stacked.stat === stacked.base * 2,
  `${stacked.base} with five picks of +20% -> ${stacked.stat}`);
check('and the layers multiply with each other',
  stacked.after === Math.round((stacked.base * stacked.passive + stacked.gear) * 2),
  `(${stacked.base} x ${stacked.passive.toFixed(2)} + ${stacked.gear}) x 2 = ${stacked.after}`);

// --- 6. 재생 comes off the sword, and only off the sword ---
const regen = await run(`
  s.player.hp = 5;
  s.sinceRegenMs = 0;
  const before = s.player.hp;
  s.regenerate(5000);
  const once = s.player.hp;
  s.regenerate(5000);
  return { before, once, twice: s.player.hp, gear: s.mods.gear.regen,
           tree: Object.keys(window.passives.value.ranks),
           offered: window.config.ALL_PASSIVES.map(p => p.id) };
`);
console.log('regen:', JSON.stringify(regen));
check('재생 pays out in whole points every five seconds',
  regen.once === regen.before + regen.gear && regen.twice === regen.once + regen.gear,
  `${regen.before} -> ${regen.once} -> ${regen.twice} (+${regen.gear} a payout)`);
check('and the tree has no line of its own for it',
  !regen.offered.includes('regen') && regen.offered.length === 2,
  regen.offered.join(' / '));
await shot('passive-04-run');

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
