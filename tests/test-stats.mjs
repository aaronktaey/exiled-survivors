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

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(1200);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. a fresh run starts from nothing ---
const fresh = await run(`
  return { damage: s.stats.damage, kills: s.stats.killCount, byKind: s.stats.byKind,
           gold: window.gold.value };
`);
check('a run starts with nothing counted',
  fresh.damage === 0 && fresh.kills === 0 && fresh.byKind.length === 0,
  `${fresh.damage} damage, ${fresh.kills} kills`);
check('and an empty purse the first time', fresh.gold === 0, `${fresh.gold} gold`);

// --- 2. what it dealt, and to what ---
const KINDS = { grunt: 120, brute: 8, runner: 15, shooter: 9 };
const fought = await run(`
  s.choosing = true;
  s.spawner.clear();
  const plan = ${JSON.stringify(KINDS)};
  let expected = 0;
  for (const [kind, n] of Object.entries(plan)) {
    for (let i = 0; i < n; i++) {
      const e = s.spawner.group.get(600, 600);
      e.spawn(600, 600, s.player, kind);
      expected += e.hp;
      s.combat.hit(e, 999999);
    }
  }
  const bosses = 2;
  for (let i = 0; i < bosses; i++) {
    const b = s.spawner.spawnBoss();
    expected += b.hp;
    s.combat.hit(b, 999999);
  }

  s.combat.gems.getChildren().forEach(g => g.active && g.collect());
  s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.shardDrops.getChildren().forEach(d => d.active && d.collect());
  s.spawner.clear();
  s.choosing = false;
  return { expected, bosses, damage: s.stats.damage, kills: s.stats.killCount,
           byKind: s.stats.byKind };
`);
console.log('fought:', JSON.stringify(fought));
const planned = Object.values(KINDS).reduce((a, b) => a + b, 0) + fought.bosses;
check('every kill is counted', fought.kills === planned, `${fought.kills} of ${planned}`);
check('and counted under the kind it was',
  fought.byKind.find((k) => k.kind === 'grunt')?.count === KINDS.grunt &&
    fought.byKind.find((k) => k.kind === 'brute')?.count === KINDS.brute &&
    fought.byKind.find((k) => k.kind === 'boss')?.count === fought.bosses,
  fought.byKind.map((k) => `${k.kind} ${k.count}`).join(' / '));
// A hit that kills something with two health left is worth two, not whatever
// the weapon rolled: overkill would otherwise pay out as gold.
check('damage is what the enemies actually absorbed, overkill aside',
  fought.damage === fought.expected,
  `${fought.damage} against ${fought.expected} of enemy health`);

// --- 3. the run is paid for it ---
const ECON = await ev(`(() => ({ ...window.config.ECONOMY }))()`);
const died = await run(`
  s.player.invulnerableUntil = 0;
  s.player.takeDamage(99999);
  return { damage: s.stats.damage };
`);
await sleep(1400);
const over = await scene('GameOverScene', `
  return { summary: s.payload.summary,
           lines: s.table.list.map(o => o.text),
           gold: window.gold.value };
`);
console.log('summary:', JSON.stringify({ ...over.summary, skills: over.summary.skills.length }));
check('the end-of-run screen is handed the run it just played',
  over.summary.damage === died.damage && over.summary.kills === planned,
  `${over.summary.damage} damage, ${over.summary.kills} kills`);
check('gold is the damage over the configured rate, rounded down',
  over.summary.gold === Math.floor(died.damage / ECON.damagePerGold) && over.gold === over.summary.gold,
  `${died.damage} damage -> ${over.summary.gold} gold`);

// --- 4. and reads it out ---
const table = over.lines.join(' | ');
console.log('table:', table);
check('the table shows what was dealt, killed and earned',
  /가한 피해/.test(table) && /처치/.test(table) && /획득 골드/.test(table) &&
    table.includes(over.summary.damage.toLocaleString('en-US')),
  table);
check('it breaks the kills down by kind',
  /일반 120/.test(table) && /거구 8/.test(table) && /우두머리 2/.test(table),
  over.lines.find((l) => /일반/.test(l)) ?? 'no kind line');
check('and lists the skills as they stood, with level and DPS',
  /타격 Lv \d+ · DPS/.test(table),
  over.lines.find((l) => /타격/.test(l)) ?? 'no skill line');
check('nothing in the table runs off the screen',
  await scene('GameOverScene', `
    const w = s.scale.width;
    return s.table.list.every(o => {
      const half = (o.width * o.scaleX) / 2;
      const x = s.table.x + o.x + (o.originX === 0 ? half : o.originX === 1 ? -half : 0);
      return x - half >= -2 && x + half <= w + 2;
    });
  `) === true, 'every line inside the canvas');
await shot('stats-01-summary');

// --- 5. gold buys a 신성한 조각 ---
await ev(`(() => {
  const s = window.game.scene.getScene('GameOverScene');
  const i = s.menu.rows.findIndex(r => r.item.id === 'menu');
  s.menu.selected = i; s.menu.refresh(); return i;
})()`);
await cdp.tap('Space', 32, ' ');
await sleep(1800);
await ev(`(() => window.game.scene.getScene('MenuScene').icons.press('passives'))()`);
await sleep(1000);

const poor = await scene('PassiveScene', `
  return { label: s.shopButton.label.text, enabled: s.shopOpen, gold: window.gold.value };
`);
console.log('shop, short of it:', JSON.stringify(poor));
check('the shop sits under the tree on 패시브',
  poor.label.includes(String(ECON.shardPrice)), poor.label);
check('and it is closed while the purse is short',
  poor.gold < ECON.shardPrice && poor.enabled === false, `${poor.gold} gold`);

// Enough damage for two and a half shards, whatever a shard and a gold cost.
await ev(`(() => { const e = window.config.ECONOMY;
  window.gold.earn(e.damagePerGold * e.shardPrice * 2.5); return 1; })()`);
await ev(`(() => { window.game.scene.getScene('PassiveScene').scene.restart({ onClose: () => {} }); return 1; })()`);
await sleep(900);
const rich = await scene('PassiveScene', `
  return { enabled: s.shopOpen, gold: window.gold.value, purse: s.purse.text };
`);
check('and opens once there is enough', rich.gold >= ECON.shardPrice && rich.enabled === true,
  `${rich.gold} gold`);
check('the purse is read out on the screen',
  rich.purse.includes(`골드 ${rich.gold}`), rich.purse);

await ev(`(() => {
  const s = window.game.scene.getScene('PassiveScene');
  s.shopButton.plate.emit('pointerdown'); return 1;
})()`);
await sleep(600);
const bought = await scene('PassiveScene', `
  return { gold: window.gold.value, purse: s.purse.text,
           stored: JSON.parse(localStorage.getItem('exiled-survivors:passives:v1')) };
`);
console.log('bought:', JSON.stringify(bought));
check('buying takes a hundred gold and leaves a shard',
  bought.gold === rich.gold - ECON.shardPrice && bought.stored.shards === 1,
  `${rich.gold} -> ${bought.gold} gold, ${bought.stored.shards} shard`);
await shot('stats-02-shop');

// Bought shards are held like found ones: the tree's eraser, not its points.
const tenth = await ev(`(() => {
  const s = window.game.scene.getScene('PassiveScene');
  const e = window.config.ECONOMY;
  window.gold.earn(e.damagePerGold * e.shardPrice * 10);
  for (let i = 0; i < 9; i++) {
    s.buy();
  }
  return { gold: window.gold.value,
           stored: JSON.parse(localStorage.getItem('exiled-survivors:passives:v1')) };
})()`);
console.log('ten bought:', JSON.stringify(tenth));
check('ten bought shards are ten held, and no point',
  tenth.stored.shards === 10 && tenth.stored.bonusPoints === 0,
  `${tenth.stored.shards} shards, ${tenth.stored.bonusPoints} points`);

// --- 6. the purse outlives the page ---
await cdp.send('Page.reload', {});
await sleep(4200);
const survived = await ev(`(() => ({ gold: window.gold.value }))()`);
check('the purse outlives the page', survived.gold === tenth.gold, `${survived.gold} gold`);

// --- 7. and a new run starts its own count ---
await ev(`(() => { window.game.scene.getScene('MenuScene')?.scene.start('GameScene', { save: null }); return 1; })()`);
await sleep(2200);
const second = await run(`return { damage: s.stats.damage, kills: s.stats.killCount };`);
check('a second run counts from zero again',
  second.damage === 0 && second.kills === 0,
  `${second.damage} damage, ${second.kills} kills`);

// --- 7. 가한 피해 is what enemies actually lost, from every skill, and survives a save ---
await cdp.send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
for (let i = 0; i < 40; i++) {
  await sleep(500);
  if ((await ev(`!!window.game?.scene.getScene('GameScene')?.player?.active`)) === true) break;
}
// Every point any enemy loses is counted beside the run's own tally: a
// skill that hurt enemies some other way than CombatSystem.hit would show
// as a gap. Overkill is not damage — the most a hit takes is what was left.
await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const Enemy = Object.getPrototypeOf(s.spawner.group.getFirstDead(true) ?? s.spawner.group.getChildren()[0]).constructor;
  window.__lost = 0;
  const real = Enemy.prototype.takeDamage;
  Enemy.prototype.takeDamage = function (amount) {
    if (this.active && this.hp > 0) window.__lost += Math.min(amount, this.hp);
    return real.call(this, amount);
  };
  s.player.setInvulnerable(true);
  for (const id of ['fireball', 'chainLightning', 'iceSpear', 'voidOrb', 'thunderStrike']) s.acquire(id);
  // Awakened too, so 화염구's burning ground and the rest are in it.
  for (const id of ['meleeStrike', 'fireball', 'chainLightning', 'iceSpear', 'voidOrb', 'thunderStrike']) {
    for (let i = 0; i < 30; i++) s.progression.apply(id, 'damage');
  }
  s.stats.reset();
  return 1;
})()`);
await sleep(9000);
const tally = await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  return { counted: s.stats.damageExact, lost: window.__lost, kills: s.stats.killCount };
})()`);
console.log('damage tally:', JSON.stringify(tally));
check('가한 피해 is exactly what enemies lost, from every skill at once, overkill left out',
  tally.lost > 0 && Math.abs(tally.counted - tally.lost) < 1e-6 * Math.max(1, tally.lost),
  `counted ${Math.round(tally.counted)} vs lost ${Math.round(tally.lost)}, ${tally.kills} kills`);

const saved = await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  s.writeSave();
  const save = JSON.parse(localStorage.getItem('exiled-survivors:save:v1'));
  window.__resumeWant = { damage: s.stats.damage, kills: s.stats.killCount };
  s.scene.restart({ save });
  return window.__resumeWant;
})()`);
await sleep(2500);
const resumed = await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  return { damage: s.stats.damage, kills: s.stats.killCount };
})()`);
console.log('resumed:', JSON.stringify({ saved, resumed }));
check('a saved run picks its 가한 피해 and kills back up when it is resumed',
  saved.damage > 0 && resumed.damage >= saved.damage && resumed.kills >= saved.kills,
  `saved ${saved.damage} / ${saved.kills} kills, resumed at ${resumed.damage} / ${resumed.kills}`);
await ev(`(() => { localStorage.removeItem('exiled-survivors:save:v1'); return 1; })()`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
