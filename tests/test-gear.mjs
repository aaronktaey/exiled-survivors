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
/** 장비 and 패시브 are reached from the corner, not from the list. */
const openIcon = async (id) => {
  await cdp.evaluate(`(() => {
    const s = window.game.scene.getScene('MenuScene');
    const view = s.icons.views.find(v => v.button.id === '${id}');
    view.button.onSelect();
    return !!view;
  })()`);
  await sleep(900);
};
const pick = async (key, id) => {
  await cdp.evaluate(`(() => {
    const s = window.game.scene.getScene('${key}');
    const i = s.menu.rows.findIndex(r => r.item.id === '${id}');
    s.menu.selected = i; s.menu.refresh(); return i;
  })()`);
  await cdp.tap('Space', 32, ' ');
  await sleep(800);
};
const stash = () => ev(`(() => {
  const raw = localStorage.getItem('exiled-survivors:gear:v2');
  return raw ? JSON.parse(raw) : null;
})()`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(1200);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. the sword in hand is worth something ---
const start = await run(`
  return {
    bonus: s.gearBonus,
    hp: s.player.hp, max: s.player.maxHp,
    melee: s.damageOf('meleeStrike'),
    stat: s.progression.statsFor('meleeStrike').damage,
    loadout: s.hud.skillsLabel.text,
  };
`);
console.log('starter:', JSON.stringify(start));
check('the starting sword carries the first tier of attack power',
  start.bonus.attack === 1, `+${start.bonus.attack}`);
check('and it lands on what a skill hits for',
  start.melee === start.stat + start.bonus.attack,
  `${start.stat} + ${start.bonus.attack} = ${start.melee}`);
check('a plain sword changes nothing else',
  start.bonus.maxHpScale === 1 && start.bonus.moveSpeedScale === 1 && start.bonus.critChance === 0,
  JSON.stringify(start.bonus));

// --- 2. the tiers are a step of 3 apart ---
const tiers = await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const roll = s.rollGearDrop.bind(s);
  const seen = {};
  for (let i = 0; i < 4000 && Object.keys(seen).length < 4; i++) {
    const item = roll(true);
    seen[item.id] = seen[item.id] ?? { id: item.id };
  }
  return { ids: Object.keys(seen) };
})()`);
check('the roster is four swords', tiers.ids.length === 4, tiers.ids.join(' / '));

const attacks = await ev(`(() => {
  const ids = ['rustySword', 'ironSword', 'steelSword', 'runedSword'];
  return {
    attack: ids.map(id => window.gearBonusFor({ uid: 'probe', id, prefixes: [], suffixes: [] }).attack),
  };
})()`);
console.log('tier attack:', JSON.stringify(attacks.attack));
check('each step up the roster is worth one more attack',
  JSON.stringify(attacks.attack) === JSON.stringify([1, 2, 3, 4]),
  attacks.attack.join(' / '));

// --- 3. an ordinary kill leaves none, a 우두머리 always does ---
const drops = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());

  let ordinary = 0;
  for (let i = 0; i < 500; i++) {
    const e = s.spawner.group.get(600, 600);
    e.spawn(600, 600, s.player, 'grunt');
    s.combat.hit(e, 999999);
  }
  ordinary = s.combat.gearDrops.countActive(true);
  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());

  const N = 10;
  for (let i = 0; i < N; i++) {
    const boss = s.spawner.spawnBoss();
    s.combat.hit(boss, 999999);
  }
  const fromBosses = s.combat.gearDrops.countActive(true);

  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.gems.getChildren().forEach(g => g.active && g.collect());
  s.spawner.clear();
  s.choosing = false;
  return { ordinary, fromBosses, N };
`);
console.log('drops:', JSON.stringify(drops));
check('500 ordinary kills leave no equipment at all', drops.ordinary === 0,
  `${drops.ordinary} dropped`);
check('and every 우두머리 leaves one', drops.fromBosses === drops.N,
  `${drops.fromBosses} of ${drops.N}`);

// --- 4. the affix roll: a fifth per line, prefixes and suffixes capped at 3 ---
const spread = await run(`
  const roll = s.rollGearDrop.bind(s);
  const lines = {};
  let maxPrefix = 0, maxSuffix = 0, kinds = { prefix: 0, suffix: 0 };
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const item = roll(true);
    const n = item.prefixes.length + item.suffixes.length;
    lines[n] = (lines[n] ?? 0) + 1;
    maxPrefix = Math.max(maxPrefix, item.prefixes.length);
    maxSuffix = Math.max(maxSuffix, item.suffixes.length);
    kinds.prefix += item.prefixes.length;
    kinds.suffix += item.suffixes.length;
  }
  return { N, lines, maxPrefix, maxSuffix, kinds };
`);
const plainShare = (spread.lines[0] ?? 0) / spread.N;
const oneShare = (spread.lines[1] ?? 0) / spread.N;
console.log('affix spread:', JSON.stringify(spread));
check('four drops in five come out plain',
  Math.abs(plainShare - 0.8) < 0.02, `${(plainShare * 100).toFixed(1)}% plain`);
check('one in five carries a line, and the roll repeats from there',
  Math.abs(oneShare - 0.16) < 0.02 && (spread.lines[2] ?? 0) > 0,
  `${(oneShare * 100).toFixed(1)}% with one, ${spread.lines[2]} with two, ${spread.lines[3] ?? 0} with three`);
check('neither side ever goes past three',
  spread.maxPrefix <= 3 && spread.maxSuffix <= 3,
  `up to ${spread.maxPrefix} 접두어 and ${spread.maxSuffix} 접미어`);
check('and both sides do get rolled',
  spread.kinds.prefix > 0 && spread.kinds.suffix > 0,
  `${spread.kinds.prefix} prefixes, ${spread.kinds.suffix} suffixes`);

// --- 5. the affixes are the enemy's own, split by what they do ---
const rolled = await run(`
  const roll = s.rollGearDrop.bind(s);
  const prefixes = new Set(), suffixes = new Set(), tiers = new Set();
  for (let i = 0; i < 20000; i++) {
    const item = roll(true);
    item.prefixes.forEach(line => { prefixes.add(line.id); tiers.add(line.tier); });
    item.suffixes.forEach(line => { suffixes.add(line.id); tiers.add(line.tier); });
  }
  return { prefixes: [...prefixes].sort(), suffixes: [...suffixes].sort(),
           tiers: [...tiers].sort() };
`);
console.log('split:', JSON.stringify(rolled));
check('the offensive 속성 roll as 접두어',
  JSON.stringify(rolled.prefixes) ===
    JSON.stringify(['critical', 'cruel', 'frenzied', 'mighty']),
  rolled.prefixes.join(' / '));
check('the defensive and utility ones roll as 접미어',
  JSON.stringify(rolled.suffixes) ===
    JSON.stringify(['evasive', 'giant', 'magnetic', 'swift']),
  rolled.suffixes.join(' / '));
check('and every line comes out at one of the five rungs',
  JSON.stringify(rolled.tiers) === JSON.stringify([1, 2, 3, 4, 5]),
  rolled.tiers.join(' / '));
check('and neither side leaks into the other',
  rolled.prefixes.every((id) => !rolled.suffixes.includes(id)),
  'no overlap');

// The same table a rare enemy is born from, read the other way round.
const shared = await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const e = s.spawner.group.get(400, 400);
  e.spawn(400, 400, s.player, 'grunt');
  const before = { hp: e.hp, speed: Math.round(e.currentSpeed) };
  const AFFIX = e.affixes;
  e.recycle();
  return { ok: Array.isArray(AFFIX), before };
})()`);
check('an enemy still wears them the way it always did', shared.ok === true,
  JSON.stringify(shared.before));

// --- 6. what a rolled sword is worth, and what it is called ---
const worth = await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  s.combat.dropGearAt(-900, -900, { uid: 'loaded', id: 'runedSword',
    prefixes: [{ id: 'mighty', tier: 3 }, { id: 'mighty', tier: 3 }, { id: 'critical', tier: 3 }], suffixes: [{ id: 'giant', tier: 3 }, { id: 'swift', tier: 3 }] });
  const drop = s.combat.gearDrops.getChildren().find(d => d.active && d.item.uid === 'loaded');
  const name = drop.nameplate.text;
  drop.collect();
  return { name };
})()`);
console.log('loaded sword:', JSON.stringify(worth));
check('the label on the ground is the base and how many 속성 it rolled',
  worth.name === '룬 각인 검+5', worth.name);

// --- 7. walking over one stashes it; carrying it changes the next run ---
await run(`
  const p = s.player;
  s.combat.dropGearAt(p.x, p.y, { uid: 'found', id: 'steelSword',
    prefixes: [{ id: 'mighty', tier: 3 }], suffixes: [{ id: 'swift', tier: 3 }] });
  return 1;
`);
await sleep(1000);
const afterPickup = await run(`
  return { left: s.combat.gearDrops.countActive(true),
           banner: s.children.list.filter(o => o.type === 'Text').map(o => o.text) };
`);
const held = await stash();
check('walking over it takes it off the ground and into the stash',
  afterPickup.left === 0 && held.items.some((i) => i.uid === 'found'),
  `${afterPickup.left} left, ${held.items.length} in the stash`);
check('and it is not put on mid-run', held.equipped === 'starter', held.equipped);
check('a banner says where to put it on',
  afterPickup.banner.some((line) => /강철 검/.test(line) && /메인화면/.test(line)),
  afterPickup.banner.find((line) => /메인화면/.test(line)) ?? 'no banner');
await shot('gear-01-pickup');

await ev(`(() => { window.game.scene.getScene('GameScene').scene.start('MenuScene'); return 1; })()`);
await sleep(1700);
await openIcon('gear');
const screen = await scene('GearScene', `
  return { labels: s.menu.rows.map(r => r.label.text), wearing: s.wearing.text, lines: s.lines.text };
`);
console.log('장비창:', JSON.stringify(screen));
check('장비창 lists the stash, best first',
  screen.labels[0] === '강력의 강철 검 · 신속' && screen.labels.includes('녹슨 검'),
  screen.labels.join(' / '));
check('and reads out what the one under the cursor is worth',
  /공격력 \+\d+/.test(screen.lines) && /접두어/.test(screen.lines) &&
    /\d티어\s+강력\s+피해 \+\d+%/.test(screen.lines) &&
    /접미어/.test(screen.lines) && /\d티어\s+신속\s+이동속도 \+\d+%/.test(screen.lines),
  screen.lines.split('\n').join(' | '));
await shot('gear-02-screen');

await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GearScene');
  s.menu.selected = 0; s.menu.refresh(); return 1;
})()`);
await cdp.tap('Space', 32, ' ');
await sleep(600);
const stored = await stash();
check('wearing it sticks', stored.equipped === 'found', stored.equipped);

await cdp.tap('Escape', 27, 'Escape');
await sleep(800);
await pick('MenuScene', 'start');
await sleep(2400);
const carried = await run(`
  const rung = window.config.AFFIXES.swift.gearTiers.find(t => t.tier === 3);
  return { bonus: s.gearBonus, max: s.player.maxHp, hp: s.player.hp,
           wantSwift: rung.gear.moveSpeedScale,
           melee: s.damageOf('meleeStrike'), stat: s.progression.statsFor('meleeStrike').damage };
`);
console.log('carried into the run:', JSON.stringify(carried));
check('the next run goes out with it',
  carried.bonus.attack === 5 && carried.melee === carried.stat + 5,
  `+${carried.bonus.attack} attack, melee ${carried.melee}`);
check('and its 신속 is on the survivor, not just on paper',
  Math.abs(carried.bonus.moveSpeedScale - carried.wantSwift) < 0.001,
  `move x${carried.bonus.moveSpeedScale}, wanted x${carried.wantSwift}`);

// --- 8. 거대 raises the bar it starts on ---
await ev(`(() => {
  const raw = JSON.parse(localStorage.getItem('exiled-survivors:gear:v2'));
  raw.items.push({ uid: 'huge', id: 'rustySword', prefixes: [], suffixes: [{ id: 'giant', tier: 3 }] });
  raw.equipped = 'huge';
  localStorage.setItem('exiled-survivors:gear:v2', JSON.stringify(raw));
  return 1;
})()`);
await cdp.send('Page.reload', {});
await sleep(4300);
const bigger = await run(`
  // Read what 거대 is tuned to rather than carrying a copy of it: both the
  // rung's value and the survivor's own bar move in balance.ts.
  const rung = window.config.AFFIXES.giant.gearTiers.find(t => t.tier === 3);
  const want = Math.round(window.config.PLAYER.maxHp * rung.gear.maxHpScale);
  return { max: s.player.maxHp, hp: s.player.hp, plate: s.player.nameplate.text,
           scale: s.gearBonus.maxHpScale, wantScale: rung.gear.maxHpScale, want };
`);
console.log('거대:', JSON.stringify(bigger));
// An 속성 saved before tiers existed comes back at the middle rung, which
// for 거대 is +30%: 30 x 1.3 = 39.
check('거대 on a sword starts the run on a fuller bar',
  bigger.scale === bigger.wantScale && bigger.max === bigger.want &&
    bigger.hp === bigger.want && bigger.plate.includes(`${bigger.want}/${bigger.want}`),
  `${bigger.hp}/${bigger.max}, wanted ${bigger.want}`);

// --- 7. the label ladder: louder the rarer it is ---
const ladder = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.shardDrops.getChildren().forEach(d => d.active && d.collect());

  const read = (d) => ({
    text: d.nameplate.text,
    colour: String(d.nameplate.label.style.color),
    size: parseFloat(d.nameplate.label.style.fontSize),
    plateAlpha: d.nameplate.plate.fillAlpha,
    plateShown: d.nameplate.plate.visible,
    border: d.nameplate.plate.strokeColor,
    borderWidth: d.nameplate.plate.lineWidth,
    outline: d.nameplate.label.style.strokeThickness,
    outlineColour: String(d.nameplate.label.style.stroke),
  });

  const weapon = (prefixes, suffixes) => ({ uid: 'u' + Math.random(), id: 'steelSword', prefixes, suffixes });
  const out = {};

  s.combat.dropSkillAt(-800, -800, { id: 'fireball', name: '화염구', tags: [] });
  out.skill = read(s.combat.skillDrops.getChildren().find(d => d.active));

  const gearAt = (prefixes, suffixes) => {
    s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
    s.combat.dropGearAt(-800, -800, weapon(prefixes, suffixes));
    return read(s.combat.gearDrops.getChildren().find(d => d.active));
  };
  out.plain = gearAt([], []);
  out.two = gearAt(['mighty'], ['swift']);
  out.three = gearAt(['mighty', 'frenzied'], ['swift']);
  out.four = gearAt(['mighty', 'frenzied'], ['swift', 'giant']);
  out.five = gearAt(['mighty', 'frenzied', 'cruel'], ['swift', 'giant']);
  out.six = gearAt(['mighty', 'frenzied', 'cruel'], ['swift', 'giant', 'magnetic']);

  s.combat.dropShardAt(-800, -800);
  out.shard = read(s.combat.shardDrops.getChildren().find(d => d.active));

  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.shardDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  s.choosing = false;
  return out;
`);
console.log('ladder:', JSON.stringify(ladder, null, 1));

// No tier wears a plate any more: a slab behind the words covered the floor
// the drop was lying on. What tells them apart is the size, the colour and
// — on the loudest — the slow swell, every one of them over an outline.
const bare = (l) => l.plateShown === false && l.plateAlpha === 0 && l.outline >= 2;
const isNormal = (l) => bare(l) && l.colour === '#e8edf7';
const isMagic = (l) => bare(l) && l.colour === '#cfe8ff';
const isRare = (l) => bare(l) && l.colour === '#FE0000' && l.outlineColour === '#ffffff';

check('a skill is an ordinary drop, however good the skill is',
  isNormal(ladder.skill), `${ladder.skill.text} ${ladder.skill.colour}`);
check('a sword with up to two 속성 is ordinary too',
  isNormal(ladder.plain) && isNormal(ladder.two),
  `${ladder.plain.text} / ${ladder.two.text}`);
check('three or four 속성 reads as 마법 — its own colour, no plate',
  isMagic(ladder.three) && isMagic(ladder.four),
  `${ladder.three.text} / ${ladder.four.text}`);
check('five or six reads as 희귀 — the loudest colour, still no plate',
  isRare(ladder.five) && isRare(ladder.six),
  `${ladder.five.text} / ${ladder.six.text}`);
check('a 신성한 조각 is 희귀 whatever else is on the floor',
  isRare(ladder.shard) && ladder.shard.text === '신성한 조각', ladder.shard.text);

// Visibility goes up with rarity, and never down.
const steps = [ladder.plain, ladder.three, ladder.five];
check('each step up is drawn larger than the one below it',
  steps[0].size < steps[1].size && steps[1].size < steps[2].size,
  steps.map((s) => `${s.size}px`).join(' < '));
check('and no step puts a slab behind them',
  steps.every((s) => s.plateAlpha === 0 && s.plateShown === false),
  steps.map((s) => `alpha ${s.plateAlpha}`).join(' / '));
check('every one of them leans on an outline instead',
  steps.every((s) => s.outline >= 2),
  steps.map((s) => `${s.outline}px`).join(' / '));
// Three at once, so the pool hands out three objects rather than recycling
// one; the swell only starts once each pop has settled.
await run(`
  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
  const put = (uid, prefixes, suffixes) =>
    s.combat.dropGearAt(-800, -800, { uid, id: 'steelSword', prefixes, suffixes });
  put('b-plain', [], []);
  put('b-magic', ['mighty', 'frenzied'], ['swift']);
  put('b-rare', ['mighty', 'frenzied', 'cruel'], ['swift', 'giant']);
  return { onGround: s.combat.gearDrops.countActive(true) };
`);
await sleep(600);
const beats = await run(`
  const of = (uid) => s.combat.gearDrops.getChildren()
    .find(d => d.active && d.item.uid === uid)?.nameplate.pulsing ?? null;
  const out = { plain: of('b-plain'), magic: of('b-magic'), rare: of('b-rare') };
  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
  return out;
`);
console.log('breathing:', JSON.stringify(beats));
check('only the loudest one breathes',
  beats.rare === true && beats.magic === false && beats.plain === false,
  `plain=${beats.plain} magic=${beats.magic} rare=${beats.rare}`);
await shot('gear-04-labels');


// --- 9. the 장비창 says what every 속성 does, however long the stash is ---
// A 우두머리 leaves a weapon a minute, so the stash is the thing that has to
// give way; the read-out is the reason the screen exists.
const LOADED = [
  { uid: 'starter', id: 'rustySword', prefixes: [], suffixes: [] },
  { uid: 'l1', id: 'runedSword',
    prefixes: [{ id: 'mighty', tier: 1 }, { id: 'critical', tier: 2 }],
    suffixes: [{ id: 'giant', tier: 1 }, { id: 'swift', tier: 5 }, { id: 'magnetic', tier: 3 }] },
  { uid: 'l2', id: 'steelSword', prefixes: [{ id: 'frenzied', tier: 3 }], suffixes: [{ id: 'magnetic', tier: 3 }] },
  { uid: 'l3', id: 'steelSword', prefixes: [{ id: 'cruel', tier: 3 }], suffixes: [] },
  { uid: 'l4', id: 'ironSword', prefixes: [{ id: 'mighty', tier: 4 }], suffixes: [{ id: 'evasive', tier: 3 }] },
  { uid: 'l5', id: 'ironSword', prefixes: [], suffixes: [] },
  { uid: 'l6', id: 'rustySword', prefixes: [{ id: 'mighty', tier: 3 }], suffixes: [] },
  { uid: 'l7', id: 'rustySword', prefixes: [], suffixes: [{ id: 'giant', tier: 3 }] },
  { uid: 'l8', id: 'rustySword', prefixes: [{ id: 'critical', tier: 3 }], suffixes: [{ id: 'swift', tier: 3 }] },
  { uid: 'l9', id: 'ironSword', prefixes: [{ id: 'frenzied', tier: 3 }], suffixes: [{ id: 'giant', tier: 2 }] },
];
await ev(`(() => {
  localStorage.setItem('exiled-survivors:gear:v2', JSON.stringify(
    { items: ${JSON.stringify(LOADED)}, equipped: 'starter' }));
  return 1;
})()`);
await cdp.send('Page.reload', {});
await sleep(4300);
await ev(`(() => { window.game.scene.getScene('GameScene')?.scene.start('MenuScene'); return 1; })()`);
await sleep(1700);
await openIcon('gear');

const read = await scene('GearScene', `
  s.menu.selected = s.menu.items.findIndex(i => i.id === 'l1');
  s.menu.scrollTo(s.menu.selected);
  s.menu.refresh();
  s.showLines();
  return { canvas: [s.scale.width, s.scale.height],
           rows: s.menu.rows.length, items: s.menu.items.length,
           lines: s.lines.text.split('\\n'),
           bottom: Math.round(s.lines.y + s.lines.height),
           rowBottom: Math.round(Math.max(...s.menu.rows.map(r => r.panel.y + r.panel.height / 2))) };
`);
console.log('loaded weapon:', JSON.stringify(read, null, 1));
const block = read.lines.join(' | ');
check('the read-out is a 접두어 block and a 접미어 block, three slots each',
  read.lines.filter((l) => l === '접두어').length === 1 &&
    read.lines.filter((l) => l === '접미어').length === 1 &&
    read.lines.length === 9,
  block);
check('every 속성 fills a slot with its rung, its name and what it does',
  /1티어\s+강력\s+피해 \+75%/.test(block) &&
    /2티어\s+치명\s+치명타 확률 \+40%/.test(block) &&
    /1티어\s+거대\s+최대 체력 \+45%/.test(block) &&
    /5티어\s+신속\s+이동속도 \+12%/.test(block) &&
    /3티어\s+재생\s+5초당 체력 \+4/.test(block),
  block);
check('and a slot with nothing in it is drawn as a rule',
  read.lines.filter((l) => /^─+$/.test(l)).length === 1,
  `${read.lines.filter((l) => /^─+$/.test(l)).length} empty slots`);
check('with the weapon’s own attack power above the lot',
  /^공격력 \+\d+/.test(read.lines[0] ?? ''), read.lines[0]);
check('none of it runs off the bottom of the screen',
  read.bottom <= read.canvas[1] && read.rowBottom <= read.canvas[1],
  `read-out ends at ${read.bottom}, the stash at ${read.rowBottom}, of ${read.canvas[1]}`);
await shot('gear-05-affixes');

// A stash longer than the room it has scrolls rather than overflowing.
const walk = await scene('GearScene', `
  const seen = [];
  for (let i = 0; i < s.menu.items.length; i++) { s.menu.step(1); seen.push(s.menu.selectedId); }
  return { seen, rows: s.menu.rows.length, items: s.menu.items.length,
           more: s.menu.more.length, lines: s.lines.text.split('\\n').length };
`);
console.log('walked the stash:', JSON.stringify(walk));
check('a stash too long for the screen is windowed, with ▲ ▼ to say so',
  walk.rows < walk.items && walk.rows >= 2 && walk.more === 2,
  `${walk.rows} rows for ${walk.items} weapons`);
check('and every weapon in it is still reachable',
  new Set(walk.seen).size === walk.items,
  `${new Set(walk.seen).size} of ${walk.items} reached`);
await shot('gear-06-scrolled');

// --- 10. throwing one away ---
// Destructive, so it asks first, and what is being carried is not on offer
// at all — which is also what stops the stash from ever emptying.
const gearScene = (body) => scene('GearScene', body);
const armedLook = await gearScene(`
  const i = s.menu.items.findIndex(it => it.id === 'l1');
  s.menu.selected = i; s.menu.scrollTo(i); s.menu.refresh(); s.showLines();
  const resting = { text: s.discard.text, colour: String(s.discard.style.color), armed: s.armed };
  s.pressDiscard();
  return { resting, asking: { text: s.discard.text, colour: String(s.discard.style.color),
           armed: s.armed }, stash: window.gear.items.length };
`);
console.log('버리기 armed:', JSON.stringify(armedLook));
check('one press asks rather than throws',
  armedLook.resting.armed === null && armedLook.asking.armed === 'discard' &&
    armedLook.asking.text !== armedLook.resting.text && armedLook.stash === 10,
  `"${armedLook.resting.text}" -> "${armedLook.asking.text}", ${armedLook.stash} still held`);
await shot('gear-07-discard-asks');

const moved = await gearScene(`
  s.menu.step(1);
  return { armed: s.armed, text: s.discard.text };
`);
check('and moving the cursor takes the question back',
  moved.armed === null, `"${moved.text}"`);

const thrown = await gearScene(`
  const i = s.menu.items.findIndex(it => it.id === 'l1');
  s.menu.selected = i; s.menu.scrollTo(i); s.menu.refresh(); s.showLines();
  s.pressDiscard();
  s.pressDiscard();
  return { stash: window.gear.items.map(i => i.uid) };
`);
await sleep(900);
const afterThrow = await gearScene(`
  return { items: s.menu.items.length, rows: s.menu.rows.length,
           stash: window.gear.items.map(i => i.uid),
           stored: JSON.parse(localStorage.getItem('exiled-survivors:gear:v2')).items.map(i => i.uid) };
`);
console.log('thrown away:', JSON.stringify(afterThrow));
check('the second press throws it away for good',
  !afterThrow.stash.includes('l1') && !afterThrow.stored.includes('l1') &&
    afterThrow.stash.length === 9,
  `${afterThrow.stash.length} left, none of them l1`);
check('and the screen is measured again around what is left',
  afterThrow.items === afterThrow.stash.length + 1,
  `${afterThrow.items} rows of list for ${afterThrow.stash.length} weapons`);

const inHand = await gearScene(`
  const uid = window.gear.value.equipped;
  const i = s.menu.items.findIndex(it => it.id === uid);
  s.menu.selected = i; s.menu.scrollTo(i); s.menu.refresh(); s.showLines();
  s.pressDiscard();
  s.pressDiscard();
  return { uid, armed: s.armed, alpha: s.discard.alpha,
           stash: window.gear.items.map(i => i.uid) };
`);
console.log('the one in hand:', JSON.stringify(inHand));
check('what is being carried cannot be thrown away at all',
  inHand.stash.includes(inHand.uid) && inHand.armed === null && inHand.alpha < 1,
  `${inHand.uid} still held, button at ${inHand.alpha} alpha`);
await shot('gear-08-discard-equipped');

// 녹슨 검 is only forced back when there is nothing else, so it can go too.
await ev(`(() => { window.gear.equip('l2'); return 1; })()`);
const starter = await gearScene(`
  s.menu.refresh();
  const i = s.menu.items.findIndex(it => it.id === 'starter');
  s.menu.selected = i; s.menu.scrollTo(i); s.menu.refresh(); s.showLines();
  s.pressDiscard();
  s.pressDiscard();
  return 1;
`);
await sleep(900);
await cdp.send('Page.reload', {});
await sleep(4300);
const outlived = await ev(`(() => ({
  stash: JSON.parse(localStorage.getItem('exiled-survivors:gear:v2')).items.map(i => i.uid),
  equipped: JSON.parse(localStorage.getItem('exiled-survivors:gear:v2')).equipped,
}))()`);
console.log('녹슨 검 thrown away:', JSON.stringify(outlived));
check('even the 녹슨 검 goes, once something else is in hand, and stays gone',
  !outlived.stash.includes('starter') && outlived.equipped === 'l2' &&
    outlived.stash.length === 8,
  `${outlived.stash.length} left, carrying ${outlived.equipped}`);

// --- 11. 구슬: what they do to a weapon ---
const orbSpread = await ev(`(() => {
  const spread = (orbId, item, n) => {
    const counts = {};
    for (let i = 0; i < n; i++) {
      const out = window.orbApplied(item, window.config.ORBS[orbId]);
      if (!out || !out.item) { counts.none = (counts.none ?? 0) + 1; continue; }
      if (out.item.prefixes.length > 3 || out.item.suffixes.length > 3) counts.overflow = true;
      const lines = out.item.prefixes.length + out.item.suffixes.length;
      counts[lines] = (counts[lines] ?? 0) + 1;
    }
    return counts;
  };
  const weapon = (prefixes, suffixes) => ({ uid: 'probe', id: 'steelSword', prefixes, suffixes });
  return {
    transmute: spread('transmute', weapon([], []), 3000),
    chaos: spread('chaos', weapon(['mighty','critical'], ['giant','swift']), 3000),
    awakenOnFour: spread('awaken', weapon(['mighty','critical'], ['giant','swift']), 600),
    awakenOnSix: spread('awaken',
      weapon(['mighty','critical','cruel'], ['giant','swift','magnetic']), 100),
  };
})()`);
console.log('구슬 spreads:', JSON.stringify(orbSpread));
const only = (counts, allowed) =>
  Object.keys(counts).every((k) => allowed.includes(Number(k))) &&
  allowed.every((n) => counts[n] > 0);
check('변화의 구슬 rerolls a weapon to one or two 속성',
  only(orbSpread.transmute, [1, 2]),
  Object.entries(orbSpread.transmute).map(([k, v]) => k + ':' + v).join(' '));
check('혼돈의 구슬 rerolls it to between two and four',
  only(orbSpread.chaos, [2, 3, 4]),
  Object.entries(orbSpread.chaos).map(([k, v]) => k + ':' + v).join(' '));
check('각성의 구슬 adds one line to what is already there',
  only(orbSpread.awakenOnFour, [5]), Object.keys(orbSpread.awakenOnFour).join(' '));
check('and does nothing at all to a weapon already carrying six',
  orbSpread.awakenOnSix.none === 100, `${orbSpread.awakenOnSix.none} of 100 refused`);
// Three 접두어 and three 접미어 is the ceiling, whatever the count asked for.
check('no roll ever puts four of one kind on a weapon',
  !orbSpread.transmute.overflow && !orbSpread.chaos.overflow &&
    !orbSpread.awakenOnFour.overflow,
  'three of each is the ceiling');

// They land under their own name, and sound like the rarity they wear.
const orbDrops = await run(`
  s.choosing = true;
  s.spawner.clear();
  window.__played = [];
  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  mgr.play = (key, cfg) => { window.__played.push(key); return orig(key, cfg); };

  const out = {};
  for (const id of Object.keys(window.config.ORBS)) {
    window.__played.length = 0;
    s.combat.dropOrbAt(-900, -900, id);
    const d = s.combat.orbDrops.getChildren().find(x => x.active && x.orb === id);
    out[id] = { name: d.nameplate.text, sound: window.__played[0],
                texture: d.texture.key };
  }
  mgr.play = orig;
  s.combat.orbDrops.getChildren().forEach(d => d.active && d.collect());
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('구슬 on the ground:', JSON.stringify(orbDrops));
check('each 구슬 lands under its own name',
  orbDrops.transmute.name === '변화의 구슬' && orbDrops.chaos.name === '혼돈의 구슬' &&
    orbDrops.awaken.name === '각성의 구슬',
  Object.values(orbDrops).map((o) => o.name).join(' / '));
check('and sounds like the rarity it is labelled',
  orbDrops.transmute.sound === 'sfx-drop-magic' &&
    orbDrops.chaos.sound === 'sfx-drop-rare' && orbDrops.awaken.sound === 'sfx-drop-rare',
  Object.values(orbDrops).map((o) => String(o.sound).replace('sfx-drop-', '')).join(' / '));
// Three spheres in three colours are one dark floor away from being the
// same thing, so each carries its own mark as well.
check('and wears a sprite of its own',
  new Set(Object.values(orbDrops).map((o) => o.texture)).size ===
    Object.keys(orbDrops).length,
  Object.values(orbDrops).map((o) => o.texture.replace('tex-orb-', '')).join(' / '));

const rates = await ev(`(() => {
  const ORBS = window.config.ORBS;
  const N = 300000;
  const seen = {};
  const want = {};
  for (const orb of Object.values(ORBS)) { seen[orb.id] = 0; want[orb.id] = orb.chance; }
  // A 폭발의 구슬 only comes off a 우두머리, so it is rolled against those.
  for (let i = 0; i < N; i++) {
    for (const orb of Object.values(ORBS)) {
      if (orb.fromBossOnly) continue;
      if (Math.random() < orb.chance) { seen[orb.id]++; break; }
    }
  }
  const bossOnly = Object.values(ORBS).filter(o => o.fromBossOnly);
  for (const orb of bossOnly) {
    for (let i = 0; i < N; i++) if (Math.random() < orb.chance) seen[orb.id]++;
  }
  return { N, seen, want };
})()`);
console.log('구슬 rates:', JSON.stringify(rates));
check('they come off a kill at the rates the table says',
  Object.entries(rates.want).every(([id, want]) =>
    Math.abs(rates.seen[id] / rates.N - want) < want * 0.3),
  Object.entries(rates.seen)
    .map(([id, n]) => id + ' ' + (n / rates.N * 100).toFixed(3) + '%').join(' / '));

// Walking over one puts it in the drawer, which is written down.
await run(`
  const p = s.player;
  window.orbs.reset();
  s.combat.dropOrbAt(p.x, p.y, 'chaos');
  return 1;
`);
await sleep(1100);
const drawer = await ev(`(() => ({
  held: window.orbs.value, total: window.orbs.total,
  stored: JSON.parse(localStorage.getItem('exiled-survivors:orbs:v1')),
}))()`);
console.log('drawer:', JSON.stringify(drawer));
check('walking over a 구슬 puts it in the drawer and writes it down',
  drawer.held.chaos === 1 && drawer.total === 1 && drawer.stored.chaos === 1,
  `${drawer.total} held`);

// --- 12. spending one in the 장비창 ---
await ev(`(() => {
  window.gear.reset();
  window.gear.add({ uid: 'orbTarget', id: 'steelSword', prefixes: [{ id: 'mighty', tier: 3 }], suffixes: [{ id: 'giant', tier: 3 }] });
  window.orbs.reset();
  window.orbs.add('transmute', 3);
  window.orbs.add('chaos', 1);
  window.game.scene.getScene('GameScene').scene.start('MenuScene');
  return 1;
})()`);
await sleep(1700);
const orbBadge = await scene('MenuScene', `
  return { badge: s.icons.views.find(v => v.button.id === 'gear').badge.visible };
`);
check('the 장비 icon wears a dot while the drawer holds anything',
  orbBadge.badge === true);
await openIcon('gear');

const orbScreen = await scene('GearScene', `
  s.menu.focus('orbTarget');
  return { buttons: [...s.orbButtons].map(([id, o]) => ({ id, text: o.text, alpha: o.alpha })),
           hint: s.orbHint.text, armed: s.armed,
           kinds: Object.keys(window.config.ORBS).length,
           bottom: Math.round(s.orbHint.y + s.orbHint.height), canvas: s.scale.height };
`);
console.log('구슬 buttons:', JSON.stringify(orbScreen));
check('the 장비창 has a button per 구슬, each with its count',
  orbScreen.buttons.length === orbScreen.kinds &&
    orbScreen.buttons[0].text.includes('변화 x3') &&
    orbScreen.buttons[1].text.includes('혼돈 x1') &&
    orbScreen.buttons[2].text.includes('각성 x0'),
  orbScreen.buttons.map((b) => b.text).join(' / '));
check('one the drawer holds none of is dead on the screen',
  orbScreen.buttons[2].alpha < 1 && orbScreen.buttons[0].alpha === 1,
  `각성 at ${orbScreen.buttons[2].alpha} alpha`);
check('and none of the row runs off the bottom',
  orbScreen.bottom <= orbScreen.canvas,
  `${orbScreen.bottom} of ${orbScreen.canvas}`);

const asked = await scene('GearScene', `
  s.pressOrb('transmute');
  return { armed: s.armed, text: s.orbButtons.get('transmute').text, hint: s.orbHint.text,
           held: window.orbs.count('transmute') };
`);
console.log('asked:', JSON.stringify(asked));
check('one press asks rather than spending it',
  asked.armed === 'transmute' && asked.held === 3 && asked.text.includes('사용'),
  `"${asked.text}", ${asked.held} still held`);
check('and says what it would do',
  asked.hint.includes('변화의 구슬') && asked.hint.includes('1~2'), asked.hint);
await shot('gear-09-orb-asks');

await scene('GearScene', `s.pressOrb('transmute'); return 1;`);
await sleep(900);
const afterOrb = await scene('GearScene', `
  const item = window.gear.items.find(i => i.uid === 'orbTarget');
  return { held: window.orbs.count('transmute'), armed: s.armed,
           lines: item.prefixes.length + item.suffixes.length,
           selected: s.menu.selectedId,
           stored: JSON.parse(localStorage.getItem('exiled-survivors:gear:v2'))
             .items.find(i => i.uid === 'orbTarget') };
`);
console.log('spent:', JSON.stringify(afterOrb));
check('the second press spends it and rerolls the weapon',
  afterOrb.held === 2 && afterOrb.lines >= 1 && afterOrb.lines <= 2,
  `${afterOrb.held} left, the weapon now carries ${afterOrb.lines}`);
check('the reroll is written down, not just drawn',
  afterOrb.stored.prefixes.length + afterOrb.stored.suffixes.length === afterOrb.lines,
  `${afterOrb.stored.prefixes.length} 접두어 / ${afterOrb.stored.suffixes.length} 접미어 stored`);
check('and the cursor stays on the weapon it was spent on',
  afterOrb.selected === 'orbTarget', afterOrb.selected);
await shot('gear-10-orb-used');

// A 구슬 that would do nothing cannot be spent at all.
await ev(`(() => {
  window.gear.replace({ uid: 'orbTarget', id: 'steelSword',
    prefixes: [{ id: 'mighty', tier: 3 }, { id: 'critical', tier: 3 }, { id: 'cruel', tier: 3 }], suffixes: [{ id: 'giant', tier: 3 }, { id: 'swift', tier: 3 }, { id: 'magnetic', tier: 3 }] });
  window.orbs.add('awaken', 2);
  window.game.scene.getScene('GearScene').scene.restart({ onClose: () => {}, focus: 'orbTarget' });
  return 1;
})()`);
await sleep(1000);
const refused = await scene('GearScene', `
  const before = window.orbs.count('awaken');
  s.pressOrb('awaken');
  s.pressOrb('awaken');
  const item = window.gear.items.find(i => i.uid === 'orbTarget');
  return { before, after: window.orbs.count('awaken'), armed: s.armed,
           alpha: s.orbButtons.get('awaken').alpha,
           lines: item.prefixes.length + item.suffixes.length };
`);
console.log('on a full weapon:', JSON.stringify(refused));
check('각성의 구슬 is not spent on a weapon with nowhere to put a line',
  refused.before === 2 && refused.after === 2 && refused.armed === null &&
    refused.alpha < 1 && refused.lines === 6,
  `${refused.after} still held, the weapon at ${refused.lines} lines`);

// One key per 구슬, in the order they are drawn, however many there are.
await ev(`(() => { window.orbs.add('explode', 2); return 1; })()`);
const keyed = await scene('GearScene', `
  const hint = s.children.list.filter(o => o.type === 'Text')
    .map(o => o.text).find(t => /구슬/.test(t) && /Esc/.test(t)) ?? '';
  s.armed = null;
  s.menu.focus('orbTarget');
  s.onOrbKey({ code: 'Digit4', repeat: false });
  const armed = s.armed;
  s.armed = null;
  s.refreshOrbs();
  return { hint, armed, kinds: Object.keys(window.config.ORBS).length,
           lines: window.gear.items.find(i => i.uid === 'orbTarget') ?
             window.gear.items.find(i => i.uid === 'orbTarget').prefixes.length : 0 };
`);
console.log('orb keys:', JSON.stringify(keyed));
check('the last 구슬 has a key of its own, not just a button',
  keyed.armed === 'explode', `Digit4 armed ${keyed.armed}`);
check('and the hint names the keys there actually are',
  keyed.hint.includes(`1~${keyed.kinds}`), keyed.hint);

// --- 13. a saved run keeps the weapon it went out with ---
// The run in the save slot is resumed with whatever is in hand, so swapping
// now would quietly hand it a sword it never went out with.
await ev(`(() => {
  window.gear.reset();
  window.gear.add({ uid: 'spare', id: 'runedSword',
    prefixes: [{ id: 'mighty', tier: 2 }], suffixes: [] });
  localStorage.setItem('exiled-survivors:save:v1', JSON.stringify({
    version: 1, savedAt: Date.now(), elapsedMs: 120000, level: 4, xp: 2, hp: 12,
    skills: { meleeStrike: { damage: 15, cooldownMs: 1000, range: 90 } },
    spawnerMs: 120000,
  }));
  window.game.scene.getScene('GameScene').scene.start('MenuScene');
  return 1;
})()`);
await sleep(1800);
await openIcon('gear');
const lockedScreen = await scene('GearScene', `
  const before = window.gear.value.equipped;
  s.menu.focus('spare');
  s.menu.items.find(i => i.id === 'spare').onSelect();
  return { locked: s.locked, before, after: window.gear.value.equipped,
           hint: s.children.list.filter(o => o.type === 'Text')
             .map(o => o.text).find(t => /교체할 수 없|Esc/.test(t)) ?? '' };
`);
console.log('locked:', JSON.stringify(lockedScreen));
check('with a run in the save slot, the weapon cannot be swapped',
  lockedScreen.locked === true && lockedScreen.after === lockedScreen.before,
  `still carrying ${lockedScreen.after}`);
check('and the screen says why rather than just refusing',
  /교체할 수 없/.test(lockedScreen.hint), lockedScreen.hint);
await shot('gear-11-locked');

await ev(`(() => {
  localStorage.removeItem('exiled-survivors:save:v1');
  window.game.scene.getScene('GearScene').scene.restart({ onClose: () => {} });
  return 1;
})()`);
await sleep(900);
const unlocked = await scene('GearScene', `
  s.menu.focus('spare');
  s.menu.items.find(i => i.id === 'spare').onSelect();
  return { locked: s.locked, equipped: window.gear.value.equipped };
`);
check('with no run saved, it swaps as before',
  unlocked.locked === false && unlocked.equipped === 'spare',
  `carrying ${unlocked.equipped}`);

// --- 14. 폭발의 구슬 ---
const explode = await ev(`(() => {
  const spec = window.config.ORBS.explode;
  const item = { uid: 'x', id: 'steelSword',
    prefixes: [{ id: 'mighty', tier: 4 }, { id: 'critical', tier: 2 }],
    suffixes: [{ id: 'giant', tier: 3 }] };
  const out = { destroyed: 0, upgraded: 0, steps: new Set(), sameLines: 0, N: 4000 };
  for (let i = 0; i < out.N; i++) {
    const r = window.orbApplied(item, spec);
    if (r.kind === 'destroyed') { out.destroyed++; continue; }
    out.upgraded++;
    out.steps.add(r.from.tier - r.line.tier);
    const lines = r.item.prefixes.length + r.item.suffixes.length;
    if (lines === 3) out.sameLines++;
  }
  return { ...out, steps: [...out.steps],
           onBare: window.orbApplied(
             { uid: 'y', id: 'steelSword', prefixes: [], suffixes: [] }, spec),
           chance: spec.chance, bossOnly: spec.fromBossOnly === true };
})()`);
console.log('폭발:', JSON.stringify(explode));
check('폭발의 구슬 destroys the weapon about one use in five',
  Math.abs(explode.destroyed / explode.N - 0.2) < 0.03,
  `${(explode.destroyed / explode.N * 100).toFixed(1)}% of ${explode.N}`);
check('otherwise it swaps one 속성 for another a rung better',
  explode.steps.length === 1 && explode.steps[0] === 1 &&
    explode.sameLines === explode.upgraded,
  `every upgrade moved one rung, and the count of 속성 never changed`);
check('and it cannot be spent on a weapon with no 속성 to work on',
  explode.onBare === null);
check('it comes off a 우두머리 and nothing else, one kill in a hundred',
  explode.chance === 0.01 && explode.bossOnly === true,
  `${(explode.chance * 100).toFixed(0)}% from a 우두머리`);

// --- 15. a 구슬 says what it did ---
await ev(`(() => {
  window.gear.reset();
  window.gear.add({ uid: 'noted', id: 'runedSword',
    prefixes: [{ id: 'mighty', tier: 4 }], suffixes: [{ id: 'giant', tier: 3 }] });
  window.orbs.reset();
  window.orbs.add('transmute', 3);
  window.orbs.add('awaken', 3);
  window.game.scene.getScene('GearScene').scene.restart({ onClose: () => {}, focus: 'noted' });
  return 1;
})()`);
await sleep(1000);
const asksFirst = await scene('GearScene', `
  s.menu.focus('noted');
  s.pressOrb('transmute');
  return { hint: s.orbHint.text };
`);
check('arming a 구슬 says what it is about to do',
  asksFirst.hint.includes('변화의 구슬') && asksFirst.hint.includes('1~2'),
  asksFirst.hint);

await scene('GearScene', `s.pressOrb('transmute'); return 1;`);
await sleep(900);
const afterReroll = await scene('GearScene', `
  const item = window.gear.items.find(i => i.uid === 'noted');
  return { hint: s.orbHint.text,
           lines: item ? item.prefixes.length + item.suffixes.length : null };
`);
console.log('after a reroll:', JSON.stringify(afterReroll));
check('and spending it says what it actually did',
  afterReroll.hint.includes('변화의 구슬') &&
    afterReroll.hint.includes(String(afterReroll.lines)),
  afterReroll.hint);

await scene('GearScene', `
  s.menu.focus('noted');
  s.pressOrb('awaken');
  s.pressOrb('awaken');
  return 1;
`);
await sleep(900);
const afterAdd = await scene('GearScene', `return { hint: s.orbHint.text };`);
console.log('after an add:', JSON.stringify(afterAdd));
check('an added 속성 is named, with the rung it came out at',
  /각성의 구슬 —/.test(afterAdd.hint) && /\d티어/.test(afterAdd.hint),
  afterAdd.hint);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
