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
// Which screen each corner icon opens: waited for, not slept on (a fixed
// sleep was too short with several Chromes sharing the machine).
const OPENS = { gear: 'InventoryScene', passives: 'PassiveScene', ranking: 'RankingScene', filter: 'FilterScene', tuning: 'TuningScene', account: 'AccountScene' };
const openIcon = async (id) => {
  await cdp.until(`window.game?.scene?.isActive('MenuScene') && !!window.game.scene.getScene('MenuScene').icons`);
  await cdp.evaluate(`(() => {
    const s = window.game.scene.getScene('MenuScene');
    const view = s.icons.views.find(v => v.button.id === '${id}');
    view.button.onSelect();
    return !!view;
  })()`);
  await cdp.until(`window.game.scene.isActive('${OPENS[id]}')`);
  await sleep(300);
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
    loadout: s.hud.loadoutText,
    first: window.config.attackForTier(window.config.GEAR[window.config.STARTING_GEAR].tier),
    lowest: window.config.GEAR_BASE.lowestAttack,
  };
`);
console.log('starter:', JSON.stringify(start));
check('the starting sword is the weakest tier, worth the lowest attack power',
  start.bonus.attack === start.first && start.first === start.lowest, `+${start.bonus.attack}`);
check('and it lands on what a skill hits for',
  start.melee === start.stat + start.bonus.attack,
  `${start.stat} + ${start.bonus.attack} = ${start.melee}`);
check('a plain sword changes nothing else',
  start.bonus.maxHpScale === 1 && start.bonus.moveSpeedScale === 1 && start.bonus.critChanceIncrease === 0,
  JSON.stringify(start.bonus));

// --- 2. the roster is a ladder: tier 1 is the best, one step of attack apart ---
const tiers = await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const roll = s.rollGearDrop.bind(s);
  // A base no 우두머리 leaves (weight 0 — the 나르실, only made) is not on it.
  const roster = Object.keys(window.config.GEAR).filter((id) => window.config.GEAR[id].weight > 0);
  const seen = {};
  for (let i = 0; i < 8000 && Object.keys(seen).length < roster.length; i++) {
    const item = roll(true);
    seen[item.id] = seen[item.id] ?? { id: item.id };
  }
  return { ids: Object.keys(seen), roster };
})()`);
check('a 우두머리 can leave every sword on the roster, 오니고로시 included — never the 나르실',
  tiers.ids.length === tiers.roster.length && tiers.ids.includes('onigoroshi') && !tiers.ids.includes('narsil'),
  tiers.ids.join(' / '));

const attacks = await ev(`(() => {
  // The ladder the drops climb; the 나르실 (made, 고정 속성 공격력) is read on its own.
  const ids = Object.keys(window.config.GEAR).filter((id) => window.config.GEAR[id].weight > 0)
    .sort((a, b) => window.config.GEAR[a].tier - window.config.GEAR[b].tier);
  const narsil = window.config.GEAR.narsil;
  return {
    narsil: { attack: window.gearBonusFor({ uid: 'n', id: 'narsil', prefixes: [], suffixes: [] }).attack,
              want: window.config.attackForTier(narsil.tier) + narsil.implicit.attack,
              oni: window.config.attackForTier(window.config.GEAR.onigoroshi.tier) },
    ids,
    tiers: ids.map(id => window.config.GEAR[id].tier),
    attack: ids.map(id => window.gearBonusFor({ uid: 'probe', id, prefixes: [], suffixes: [] }).attack),
    want: ids.map(id => window.config.attackForTier(window.config.GEAR[id].tier)),
    step: window.config.GEAR_BASE.attackPerTier,
  };
})()`);
console.log('tier attack:', JSON.stringify(attacks.attack));
check('a lower tier number is one more step of attack',
  JSON.stringify(attacks.attack) === JSON.stringify(attacks.want) &&
    attacks.attack.every((a, i) => i === 0 ||
      attacks.attack[i - 1] - a === (attacks.tiers[i] - attacks.tiers[i - 1]) * attacks.step),
  attacks.ids.map((id, i) => `${id} T${attacks.tiers[i]} +${attacks.attack[i]}`).join(' / '));
check('나르실 is the 오니고로시’s attack, with its 고정 속성’s on top',
  attacks.narsil.attack === attacks.narsil.want && attacks.narsil.want > attacks.narsil.oni, JSON.stringify(attacks.narsil));
check('the ladder is 오니고로시 > 룬 각인 검 > 강철 검 > 무쇠 검 > 녹슨 검',
  JSON.stringify(attacks.ids) ===
    JSON.stringify(['onigoroshi', 'runedSword', 'steelSword', 'ironSword', 'rustySword']) &&
    new Set(attacks.tiers).size === attacks.tiers.length,
  attacks.ids.join(' > '));

// --- 3. an ordinary kill leaves only the swords marked fromKill; a 우두머리 always one ---
const drops = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());

  // Raise every fromKill sword's chance for the measurement, then put it back.
  const G = window.config.GEAR;
  const marked = Object.values(G).filter(g => g.fromKill !== undefined);
  const was = marked.map(g => g.fromKill);
  marked.forEach(g => { g.fromKill = 0.05; });
  const ordinaryIds = {};
  for (let i = 0; i < 1000; i++) {
    const e = s.spawner.group.get(600, 600);
    e.spawn(600, 600, s.player, 'grunt');
    s.combat.hit(e, 999999);
    for (const d of s.combat.gearDrops.getChildren()) {
      if (d.active && d.item) { ordinaryIds[d.item.id] = (ordinaryIds[d.item.id] ?? 0) + 1; d.collect(); }
    }
  }
  marked.forEach((g, i) => { g.fromKill = was[i]; });
  const allowed = marked.map(g => g.id);
  const bossOnly = Object.values(G).filter(g => g.fromKill === undefined && g.weight > 0).map(g => g.id);
  const lowTiers = Object.values(G).filter(g => g.fromKill === undefined && g.weight > 0).map(g => g.tier);
  const ordinary = Object.values(ordinaryIds).reduce((a, b) => a + b, 0);

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
  return { ordinary, ordinaryIds, allowed, bossOnly, lowTiers, fromBosses, N };
`);
console.log('drops:', JSON.stringify(drops));
check('tier 1 and 2 swords are boss-only, the rest can drop off any kill',
  JSON.stringify([...new Set(drops.lowTiers)].sort()) === JSON.stringify([1, 2]) &&
    JSON.stringify([...drops.bossOnly].sort()) === JSON.stringify(['onigoroshi', 'runedSword']) &&
    drops.allowed.length > 0,
  `boss-only ${drops.bossOnly.join(', ')}; any kill: ${drops.allowed.join(', ')}`);
check('ordinary kills leave only the swords marked fromKill',
  drops.ordinary > 0 && Object.keys(drops.ordinaryIds).every(id => drops.allowed.includes(id)),
  JSON.stringify(drops.ordinaryIds));
check('and every 우두머리 leaves one', drops.fromBosses === drops.N,
  `${drops.fromBosses} of ${drops.N}`);

// --- 4. the affix roll: GEAR_DROP.affixChance a line, prefixes and suffixes capped at 3 ---
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
  return { N, lines, maxPrefix, maxSuffix, kinds, chance: window.config.GEAR_DROP.affixChance };
`);
const plainShare = (spread.lines[0] ?? 0) / spread.N;
const oneShare = (spread.lines[1] ?? 0) / spread.N;
console.log('affix spread:', JSON.stringify(spread));
// Each line is its own roll at the table's chance, so none is 1 − c, one is c(1 − c).
const c = spread.chance;
check('a drop comes out plain at 1 − the line chance',
  Math.abs(plainShare - (1 - c)) < 0.02, `${(plainShare * 100).toFixed(1)}% plain (want ${((1 - c) * 100).toFixed(1)}%)`);
check('one line at c × (1 − c), and the roll repeats from there',
  Math.abs(oneShare - c * (1 - c)) < 0.02 && (spread.lines[2] ?? 0) > 0,
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
  const c = window.config;
  return { prefixes: [...prefixes].sort(), suffixes: [...suffixes].sort(),
           tiers: [...tiers].sort((a, b) => a - b),
           wantPrefixes: c.PREFIXES.map((a) => a.id).sort(), wantSuffixes: c.SUFFIXES.map((a) => a.id).sort(),
           wantTiers: Array.from({ length: c.AFFIX_RUNGS }, (_, i) => i + 1) };
`);
console.log('split:', JSON.stringify(rolled));
check('the offensive 속성 roll as 접두어',
  JSON.stringify(rolled.prefixes) === JSON.stringify(rolled.wantPrefixes) &&
    ['critical', 'cruel', 'frenzied', 'mighty'].every((id) => rolled.prefixes.includes(id)),
  rolled.prefixes.join(' / '));
check('the defensive and utility ones roll as 접미어',
  JSON.stringify(rolled.suffixes) === JSON.stringify(rolled.wantSuffixes) &&
    ['evasive', 'giant', 'magnetic', 'swift'].every((id) => rolled.suffixes.includes(id)),
  rolled.suffixes.join(' / '));
check('and every line comes out at one of the rungs, every rung turning up',
  JSON.stringify(rolled.tiers) === JSON.stringify(rolled.wantTiers),
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
           banner: s.toasts.lines };
`);
const held = await stash();
check('walking over it takes it off the ground and into the stash',
  afterPickup.left === 0 && held.items.some((i) => i.uid === 'found'),
  `${afterPickup.left} left, ${held.items.length} in the stash`);
check('and it is not put on mid-run', held.equipped === 'starter', held.equipped);
check('a toast names what was found, and nothing about where to use it',
  afterPickup.banner.some((line) => /강철 검/.test(line)) && !afterPickup.banner.some((line) => /메인화면|인벤토리/.test(line)),
  afterPickup.banner.join(' | ') || 'no toast');
await shot('gear-01-pickup');

await ev(`(() => { window.game.scene.getScene('GameScene').scene.start('MenuScene'); return 1; })()`);
await sleep(1700);
await openIcon('gear');
const screen = await scene('InventoryScene', `
  return { labels: s.menu.items.map(i => i.label()), wearing: s.wearing.text, lines: s.lines.text };
`);
console.log('장비창:', JSON.stringify(screen));
check('장비창 lists the stash, best first',
  screen.labels[0] === '강력의 강철 검 · 신속' && screen.labels.includes('녹슨 검'),
  screen.labels.join(' / '));
check('and reads out what the one under the cursor is worth',
  /공격력 \+\d+/.test(screen.lines) && /접두어/.test(screen.lines) &&
    /\d티어\s+강력\s+피해 증폭 \+\d+%/.test(screen.lines) &&
    /접미어/.test(screen.lines) && /\d티어\s+신속\s+이동속도 \+\d+%/.test(screen.lines),
  screen.lines.split('\n').join(' | '));
await shot('gear-02-screen');

await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('InventoryScene');
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
  const mighty = window.config.AFFIXES.mighty.gearTiers.find(t => t.tier === 3);
  return { bonus: s.gearBonus, max: s.player.maxHp, hp: s.player.hp,
           wantAttack: window.config.attackForTier(window.config.GEAR.steelSword.tier),
           // 강력 and the base's 피해 고정 속성 are the weapon's 증폭, added within it (0.93).
           wantIncrease: 0,
           wantAmplify: (window.config.GEAR.steelSword.implicit?.damageScale ?? 1) + mighty.gear.damageScale - 1,
           passive: s.mods.shard.damage, base: window.config.SKILL_BASE.meleeStrike.damage,
           wantSwift: rung.gear.moveSpeedScale,
           melee: s.damageOf('meleeStrike'), stat: s.progression.statsFor('meleeStrike').damage };
`);
console.log('carried into the run:', JSON.stringify(carried));
check('the next run goes out with it',
  carried.bonus.attack === carried.wantAttack &&
    carried.bonus.damageIncrease === carried.wantIncrease && Math.abs(carried.bonus.damageAmplify - carried.wantAmplify) < 1e-9 &&
    carried.melee === Math.round((carried.base + carried.wantAttack) * (carried.stat / carried.base + carried.wantIncrease) *
      carried.passive * carried.wantAmplify),
  `+${carried.bonus.attack} attack, 증가 +${carried.bonus.damageIncrease}, 증폭 ×${carried.bonus.damageAmplify}, melee ${carried.melee}`);
check('and its 신속 is on the survivor, not just on paper',
  Math.abs(carried.bonus.moveSpeedScale - carried.wantSwift) < 0.001,
  `move x${carried.bonus.moveSpeedScale}, wanted x${carried.wantSwift}`);

// --- 8. 거대 raises the bar it starts on ---
await ev(`(() => {
  const raw = JSON.parse(localStorage.getItem('exiled-survivors:gear:v2'));
  raw.items.push({ uid: 'huge', id: 'rustySword', prefixes: [], suffixes: [{ id: 'giant', tier: 3 }], rungs: window.config.AFFIX_RUNGS });
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
  // The held skills' 보유 효과 multiplies the bar too (0.84: 타격 is held).
  const want = Math.round(window.config.PLAYER.maxHp * rung.gear.maxHpScale * s.heldBonus.maxHpScale);
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


  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  s.choosing = false;
  return out;
`);
console.log('ladder:', JSON.stringify(ladder, null, 1));

// No tier wears a plate any more: a slab behind the words covered the floor
// the drop was lying on. What tells them apart is the size, the colour and
// — on the loudest — the slow swell, every one of them over an outline.
// Each tier's colour read off DROP_LABEL.tiers (0.111 made 마법 a plainer blue).
const tierText = await ev(`(() => Object.fromEntries(Object.entries(window.config.DROP_LABEL.tiers).map(([k, v]) => [k, v.text])))()`);
const bare = (l) => l.plateShown === false && l.plateAlpha === 0 && l.outline >= 2;
const isNormal = (l) => bare(l) && l.colour === tierText.normal;
const isMagic = (l) => bare(l) && l.colour === tierText.magic;
const isRare = (l) => bare(l) && l.colour === tierText.rare;
const isMythic = (l) => bare(l) && l.colour === tierText.mythic && l.outlineColour === '#ffffff';

check('a skill is an ordinary drop, however good the skill is',
  isNormal(ladder.skill), `${ladder.skill.text} ${ladder.skill.colour}`);
// 0.91 (the user's ask): 2 속성 마법 (blue), 3–4 희귀 (yellow), 5–6 신화 (red).
check('a sword with no 속성 is ordinary too, and one with two reads as 마법',
  isNormal(ladder.plain) && isMagic(ladder.two),
  `${ladder.plain.text} / ${ladder.two.text}`);
check('three or four 속성 reads as 희귀 — yellow, no plate',
  isRare(ladder.three) && isRare(ladder.four),
  `${ladder.three.text} ${ladder.three.colour} / ${ladder.four.text}`);
check('five or six reads as 신화 — the loudest colour, still no plate',
  isMythic(ladder.five) && isMythic(ladder.six),
  `${ladder.five.text} / ${ladder.six.text}`);

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
    { items: ${JSON.stringify(LOADED)}.map((i) => ({ ...i, rungs: window.config.AFFIX_RUNGS })), equipped: 'starter' }));
  return 1;
})()`);
await cdp.send('Page.reload', {});
await sleep(4300);
await ev(`(() => { window.game.scene.getScene('GameScene')?.scene.start('MenuScene'); return 1; })()`);
await sleep(1700);
await openIcon('gear');

const read = await scene('InventoryScene', `
  s.menu.selected = s.menu.items.findIndex(i => i.id === 'l1');
    s.menu.refresh();
  s.showDetails();
  return { canvas: [s.scale.width, s.scale.height],
           cells: s.menu.cells.length, items: s.menu.items.length,
           lines: s.lines.text.split('\\n'),
           bottom: Math.round(s.lines.y + s.lines.height),
           rowBottom: Math.round(Math.max(...s.menu.cells.map(c => c.plate.y + c.plate.height / 2))) };
`);
console.log('loaded weapon:', JSON.stringify(read, null, 1));
const block = read.lines.join(' | ');
check('the read-out is the base (attack and 고정 속성), then a 접두어 block and a 접미어 block, three slots each',
  /^공격력 \+\d+ · 고정: /.test(read.lines[0]) &&
    read.lines.filter((l) => l === '접두어').length === 1 &&
    read.lines.filter((l) => l === '접미어').length === 1 &&
    read.lines.length === 9,
  block);
check('every 속성 fills a slot with its rung, its name and what it does',
  /1티어\s+강력\s+피해 증폭 \+\d+%/.test(block) &&
    /2티어\s+치명\s+기본 치명타 확률 \+\d+%/.test(block) &&
    /1티어\s+거대\s+최대 체력 \+[\d.]+%/.test(block) &&
    /5티어\s+신속\s+이동속도 \+[\d.]+%/.test(block) &&
    /3티어\s+자력\s+획득 범위 \+\d+%/.test(block),
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

// The stash is a grid: six across, twelve down, and every weapon in it is
// reachable from the keys alone.
const walk = await scene('InventoryScene', `
  s.menu.focus(s.menu.items[0].id);
  const seen = [s.menu.selectedId];
  for (let i = 0; i < s.menu.items.length; i++) { s.menu.move(1, 0); seen.push(s.menu.selectedId);
    if (s.menu.selected % window.config.INVENTORY.cols === window.config.INVENTORY.cols - 1 ||
        s.menu.selected === s.menu.items.length - 1) {
      // Down a row, then back to its first cell.
      s.menu.move(0, 1);
      for (let k = 0; k < window.config.INVENTORY.cols; k++) s.menu.move(-1, 0);
      seen.push(s.menu.selectedId);
    } }
  return { seen, cells: s.menu.cells.length, items: s.menu.items.length, pages: s.menu.pages,
           shape: [window.config.INVENTORY.cols, window.config.INVENTORY.rows] };
`);
console.log('walked the stash:', JSON.stringify({ ...walk, seen: walk.seen.length }));
check('the stash is a grid of six across and twelve down',
  walk.cells === walk.shape[0] * walk.shape[1] && walk.shape[0] === 6 && walk.shape[1] === 12 &&
    walk.pages === 1,
  `${walk.cells} cells, ${walk.pages} page`);
check('and the arrow keys reach every weapon in it',
  new Set(walk.seen).size === walk.items,
  `${new Set(walk.seen).size} of ${walk.items} reached`);
await shot('gear-06-scrolled');

// --- 10. 분해 (0.90): selling went, and gold with it ---
// The 인벤토리's 분해 button opens the 분해 screen on the weapon under the
// cursor: one at a time (asked twice), in bulk by base and 속성 count, and 제작.
const gearScene = (body) => scene('InventoryScene', body);
const forge = (body) => scene('ForgeScene', body);
const forgeOpened = await gearScene(`
  s.menu.focus('l1'); s.showDetails();
  const b = s.forgeButton.getBounds();
  const label = s.children.list.find((o) => o.type === 'Text' && o.text === '분해 · 제작')?.text ?? null;
  const topRight = b.right > s.scale.width - 20 && b.top < 20;
  s.forgeButton.emit('pointerdown');
  return { label, topRight };
`);
await sleep(900);
const atForge = await forge(`return { active: s.scene.isActive(), tab: s.tab, on: s.menu?.selectedId, back: !!s.backButton };`);
check('the 인벤토리’s top-right 분해 · 제작 button opens that screen on the weapon under the cursor',
  forgeOpened.label === '분해 · 제작' && forgeOpened.topRight && atForge.active && atForge.tab === 'single' && atForge.on === 'l1' && atForge.back, JSON.stringify({ forgeOpened, atForge }));

const asked = await forge(`
  s.pressSalvage();
  const asking = { armed: s.armed, text: s.salvageButton.label.text, stash: window.gear.items.length };
  s.menu.step(1);
  const moved = s.armed;
  s.menu.focus('l1');
  return { asking, moved };
`);
check('one press asks rather than takes it apart, and moving the cursor takes the question back',
  asked.asking.armed === 'salvage' && asked.asking.stash === 10 && asked.moved === null, JSON.stringify(asked));

const before = await forge(`
  const c = window.config, item = window.gear.items.find((i) => i.uid === 'l1');
  const lines = item.prefixes.length + item.suffixes.length, T = c.AUDIO.dropTiers;
  const tier = lines >= T.mythicFrom ? 'mythic' : lines >= T.rareFrom ? 'rare' : lines >= T.magicFrom ? 'magic' : 'normal';
  const band = c.SALVAGE_ORBS[tier] ? { orb: c.SALVAGE_ORBS[tier] } : null;
  const at = s.menu.selected;
  const was = { ore: window.ore.value, orb: band ? window.orbs.count(band.orb) : 0 };
  s.pressSalvage();
  s.pressSalvage();
  return { at, was, wantOre: c.GEAR[item.id].salvageOre, orb: band?.orb ?? null };
`);
await sleep(900);
const salvaged = await forge(`
  return { stash: window.gear.items.map((i) => i.uid), stored: JSON.parse(localStorage.getItem('exiled-survivors:gear:v2')).items.map((i) => i.uid),
           ore: window.ore.value, orb: ${JSON.stringify(before.orb)} ? window.orbs.count(${JSON.stringify(before.orb)}) : 0,
           note: s.noteLine.text, cells: s.menu.items.length, selected: s.menu.selected };
`);
console.log('분해:', JSON.stringify({ before, salvaged }));
check('the second press takes it apart for good: its base’s 철광석, and the 구슬 its rarity earns (5 속성: 신화 → 각성)',
  !salvaged.stash.includes('l1') && !salvaged.stored.includes('l1') && salvaged.ore - before.was.ore === before.wantOre &&
    before.orb === 'awaken' && salvaged.orb - before.was.orb === 1 && /분해/.test(salvaged.note),
  JSON.stringify({ ore: [before.was.ore, salvaged.ore], orb: before.orb, note: salvaged.note }));
check('the grid is laid out again around what is left, the cursor where it was',
  salvaged.cells === salvaged.stash.length && salvaged.selected === Math.min(before.at, salvaged.cells - 1), `${before.at} → ${salvaged.selected}`);

const forgeRefused = await forge(`
  const uid = window.gear.value.equipped;
  s.menu.focus(uid);
  s.pressSalvage(); s.pressSalvage();
  const inHand = { kept: window.gear.items.some((i) => i.uid === uid), note: s.noteLine.text };
  s.menu.focus('l2');
  s.pressLock();
  s.pressSalvage(); s.pressSalvage();
  const locked = { kept: window.gear.items.some((i) => i.uid === 'l2'), flag: window.gear.items.find((i) => i.uid === 'l2').locked === true,
                   badge: s.menu.items.find((it) => it.id === 'l2').badge(), lock: window.config.TEXTURES.lock, note: s.noteLine.text };
  return { inHand, locked };
`);
console.log('forgeRefused:', JSON.stringify(forgeRefused));
check('the weapon in hand cannot be taken apart, and it says why', forgeRefused.inHand.kept && /착용 중/.test(forgeRefused.inHand.note), JSON.stringify(forgeRefused.inHand));
check('잠금 keeps a weapon from 분해, and its cell wears the padlock',
  forgeRefused.locked.kept && forgeRefused.locked.flag && forgeRefused.locked.badge === forgeRefused.locked.lock && /잠긴/.test(forgeRefused.locked.note), JSON.stringify(forgeRefused.locked));
await shot('gear-07-forge-single');

// 일괄 분해: the bases ticked, at most so many 속성 — never the one in hand, never a locked one.
await forge(`s.openTab('bulk'); return 1;`);
await sleep(800);
const bulk = await forge(`
  const c = window.config;
  const types = ['rustySword', 'ironSword', 'steelSword'];
  types.forEach((id) => s.toggleType(id));
  s.setBulkMax(2);
  const eq = window.gear.value.equipped;
  const want = window.gear.items.filter((i) => types.includes(i.id) && i.prefixes.length + i.suffixes.length <= 2 && i.uid !== eq && !i.locked);
  const wantOre = want.reduce((sum, i) => sum + c.GEAR[i.id].salvageOre, 0);
  const T = c.AUDIO.dropTiers;
  const wantTransmute = want.filter((i) => { const n = i.prefixes.length + i.suffixes.length; return n >= T.magicFrom && n < T.rareFrom; }).length;
  const was = { ore: window.ore.value, transmute: window.orbs.count('transmute'), stash: window.gear.items.length };
  s.pressBulk();
  const asking = { armed: s.armed, stash: window.gear.items.length, preview: s.preview.text };
  s.pressBulk();
  return { want: want.map((i) => i.uid), wantOre, wantTransmute, was, asking, eq };
`);
await sleep(900);
const afterBulk = await forge(`
  return { stash: window.gear.items.map((i) => i.uid), ore: window.ore.value, transmute: window.orbs.count('transmute'),
           note: s.noteLine.text, kept: { types: [...s.bulkTypes], max: s.bulkMax } };
`);
console.log('일괄 분해:', JSON.stringify({ bulk, afterBulk }));
check('일괄 분해 asks first, its preview counting what would go',
  bulk.asking.armed === 'bulk' && bulk.asking.stash === bulk.was.stash && bulk.asking.preview.includes(String(bulk.want.length)), JSON.stringify(bulk.asking));
check('then takes every match apart at once — the ticked bases with that many 속성 or fewer',
  bulk.want.length > 0 && bulk.want.every((uid) => !afterBulk.stash.includes(uid)) &&
    afterBulk.ore - bulk.was.ore === bulk.wantOre && afterBulk.transmute - bulk.was.transmute === bulk.wantTransmute,
  `${bulk.want.length} gone: ore +${afterBulk.ore - bulk.was.ore} (want ${bulk.wantOre}), 변화 +${afterBulk.transmute - bulk.was.transmute} (want ${bulk.wantTransmute})`);
check('but never the one in hand nor a locked one, and the settings stay',
  afterBulk.stash.includes(bulk.eq) && afterBulk.stash.includes('l2') && afterBulk.kept.max === 2 && afterBulk.kept.types.length === 3,
  JSON.stringify(afterBulk.stash));
await shot('gear-08-forge-bulk');

// 제작: a bare sword for its 철광석; not without enough, never an 오니고로시.
await forge(`s.openTab('craft'); return 1;`);
await sleep(800);
const craft = await forge(`
  const c = window.config, cost = c.GEAR.rustySword.craftOre;
  window.ore.reset(); window.ore.add(cost);
  const was = window.gear.items.length;
  s.pressCraft('rustySword');
  const made = window.gear.items[window.gear.items.length - 1];
  const after = { stash: window.gear.items.length, ore: window.ore.value, bare: made.prefixes.length + made.suffixes.length === 0 && made.id === 'rustySword' };
  s.pressCraft('rustySword');
  const short = { stash: window.gear.items.length, note: s.noteLine.text };
  return { was, after, short, oni: s.craftButtons.has('onigoroshi'), oniCost: c.GEAR.onigoroshi.craftOre ?? null };
`);
console.log('제작:', JSON.stringify(craft));
check('제작 makes a bare sword of that base and spends its 철광석',
  craft.after.stash === craft.was + 1 && craft.after.ore === 0 && craft.after.bare, JSON.stringify(craft.after));
check('without enough 철광석 it makes nothing and says so', craft.short.stash === craft.after.stash && /부족/.test(craft.short.note), JSON.stringify(craft.short));
check('an 오니고로시 cannot be made', craft.oni === false && craft.oniCost === null);
await shot('gear-09-forge-craft');

await forge(`s.input.keyboard.emit('keydown', { code: 'Escape', repeat: false, preventDefault() {} }); return 1;`);
await sleep(800);
const backHome = await ev(`(() => ({ forge: window.game.scene.isActive('ForgeScene'), inventory: window.game.scene.isActive('InventoryScene') }))()`);
check('Esc goes back to the 인벤토리', backHome.inventory && !backHome.forge, JSON.stringify(backHome));
await cdp.send('Page.reload', {});
await sleep(4300);
const outlived = await ev(`(() => {
  const raw = JSON.parse(localStorage.getItem('exiled-survivors:gear:v2'));
  return { stash: raw.items.map((i) => i.uid), locked: raw.items.find((i) => i.uid === 'l2')?.locked === true, ore: window.ore.value };
})()`);
check('what was taken apart stays gone, and 잠금 outlives the page', !outlived.stash.includes('l1') && outlived.locked, JSON.stringify(outlived));

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
    const clip = window.config.AUDIO.drops[window.config.ORBS[id].tier];
    out[id] = { name: d.nameplate.text, sound: window.__played[0], want: clip ? clip.key : undefined,
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
// 0.111: each tier's own clip (AUDIO.drops), read off the table.
check('and sounds like the rarity it is labelled',
  Object.values(orbDrops).every((o) => o.sound === o.want) && orbDrops.transmute.sound !== orbDrops.chaos.sound,
  Object.entries(orbDrops).map(([id, o]) => `${id} ${o.sound} (want ${o.want})`).join(' / '));
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
  // A 구슬 only a 우두머리 leaves (none now) would be rolled against those.
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
  // Within 30%, or four standard deviations for a rare one with few draws.
  Object.entries(rates.want).every(([id, want]) =>
    Math.abs(rates.seen[id] - want * rates.N) <= Math.max(want * rates.N * 0.3, 4 * Math.sqrt(want * rates.N))),
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

const orbScreen = await scene('InventoryScene', `
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

// One press opens 구슬 사용 over the 인벤토리 rather than spending anything.
const popupNow = `(() => {
  const p = window.game.scene.getScene('OrbScene');
  const texts = p.layer ? p.layer.list.filter((o) => o.type === 'Text').map((o) => o.text) : [];
  return { open: window.game.scene.isActive('OrbScene'), paused: window.game.scene.isPaused('InventoryScene'),
           orb: p.orb, usable: p.usable, note: p.note, destroyed: p.destroyed, texts };
})()`;
await scene('InventoryScene', `s.menu.focus('orbTarget'); s.pressOrb('transmute'); return 1;`);
await sleep(700);
const opened = await ev(popupNow);
console.log('popup:', JSON.stringify({ ...opened, texts: opened.texts.slice(0, 6) }));
check('one press opens 구슬 사용 over the 인벤토리 instead of spending it',
  opened.open && opened.paused && opened.orb === 'transmute' && (await ev(`window.orbs.count('transmute')`)) === 3,
  `${opened.orb}, open ${opened.open}`);
check('and it spells out what the 구슬 does, every rule, beside the weapon it would go on',
  opened.texts.some((t) => /변화의 구슬/.test(t)) && opened.texts.some((t) => t.includes('1~2')) &&
    opened.texts.some((t) => /다시 굴|새로 굴/.test(t)) && opened.texts.some((t) => /강철 검/.test(t)),
  opened.texts.filter((t) => /구슬|굴|검/.test(t)).slice(0, 4).join(' | '));
await shot('gear-09-orb-popup');

const spentOnce = await ev(`(() => {
  const p = window.game.scene.getScene('OrbScene');
  p.use();
  const item = window.gear.items.find((i) => i.uid === 'orbTarget');
  return { held: window.orbs.count('transmute'), lines: item.prefixes.length + item.suffixes.length,
           stored: JSON.parse(localStorage.getItem('exiled-survivors:gear:v2')).items.find((i) => i.uid === 'orbTarget') };
})()`);
await sleep(300);
const afterUse = await ev(popupNow);
console.log('spent:', JSON.stringify({ spentOnce, note: afterUse.note }));
check('사용 spends one and rerolls the weapon, written down',
  spentOnce.held === 2 && spentOnce.lines >= 1 && spentOnce.lines <= 2 &&
    spentOnce.stored.prefixes.length + spentOnce.stored.suffixes.length === spentOnce.lines,
  `${spentOnce.held} left, the weapon now carries ${spentOnce.lines}`);
check('and the popup stays open, saying what it did',
  afterUse.open && /변화의 구슬/.test(afterUse.note) && afterUse.texts.some((t) => t === afterUse.note), afterUse.note);
await shot('gear-10-orb-used');

// The row along the top switches 구슬 without leaving.
const switched = await ev(`(() => { const p = window.game.scene.getScene('OrbScene'); p.pick('chaos'); return { orb: p.orb, usable: p.usable }; })()`);
check('the row along the top picks another 구슬 without leaving', switched.orb === 'chaos' && switched.usable === true,
  JSON.stringify(switched));

// Closing goes back to the 인벤토리, on the weapon, with the line saying what was done.
await ev(`(() => { window.game.scene.getScene('OrbScene').close(); return 1; })()`);
await sleep(900);
const back = await scene('InventoryScene', `return { selected: s.menu.selectedId, hint: s.orbHint.text, open: window.game.scene.isActive('OrbScene') };`);
check('closing it goes back to the 인벤토리 on the same weapon, with what the 구슬 did',
  !back.open && back.selected === 'orbTarget' && back.hint === afterUse.note, `${back.selected}: ${back.hint}`);

// A 구슬 that would do nothing cannot be spent at all.
await ev(`(() => {
  window.gear.replace({ uid: 'orbTarget', id: 'steelSword',
    prefixes: [{ id: 'mighty', tier: 3 }, { id: 'critical', tier: 3 }, { id: 'cruel', tier: 3 }], suffixes: [{ id: 'giant', tier: 3 }, { id: 'swift', tier: 3 }, { id: 'magnetic', tier: 3 }] });
  window.orbs.add('awaken', 2);
  window.game.scene.getScene('InventoryScene').scene.restart({ onClose: () => {}, focus: 'orbTarget' });
  return 1;
})()`);
await sleep(1000);
const deadButton = await scene('InventoryScene', `return s.orbButtons.get('awaken').alpha;`);
await scene('InventoryScene', `s.pressOrb('awaken'); return 1;`);
await sleep(600);
const refused = await ev(`(() => {
  const p = window.game.scene.getScene('OrbScene');
  const before = window.orbs.count('awaken');
  p.use();
  const item = window.gear.items.find((i) => i.uid === 'orbTarget');
  const out = { before, after: window.orbs.count('awaken'), usable: p.usable,
                lines: item.prefixes.length + item.suffixes.length,
                why: p.layer.list.filter((o) => o.type === 'Text').map((o) => o.text).find((t) => /쓸 수 없/.test(t)) ?? '' };
  p.close();
  return out;
})()`);
await sleep(900);
console.log('on a full weapon:', JSON.stringify(refused));
check('각성의 구슬 is not spent on a weapon with nowhere to put a line, and the popup says why',
  refused.before === 2 && refused.after === 2 && refused.usable === false && deadButton < 1 &&
    refused.lines === 6 && refused.why !== '',
  `${refused.after} still held, the weapon at ${refused.lines} lines: ${refused.why}`);

// One key per 구슬, in the order they are drawn, however many there are.
await ev(`(() => { window.orbs.add('explode', 2); return 1; })()`);
const keyed = await scene('InventoryScene', `
  const hint = s.children.list.filter(o => o.type === 'Text')
    .map(o => o.text).find(t => /구슬/.test(t) && /Esc/.test(t)) ?? '';
  s.menu.focus('orbTarget');
  s.onKey({ code: 'Digit4', repeat: false });
  return { hint, kinds: Object.keys(window.config.ORBS).length };
`);
await sleep(600);
const keyedPopup = await ev(popupNow);
check('the fourth 구슬 has a key of its own, opening the popup on it',
  keyedPopup.open && keyedPopup.orb === 'explode', `Digit4 opened ${keyedPopup.orb}`);
check('and the hint names the keys there actually are',
  keyed.hint.includes(`1~${keyed.kinds}`), keyed.hint);

// A 구슬 that destroys the weapon turns the popup into the news, and 확인 goes back.
const blownUp = await ev(`(() => {
  const p = window.game.scene.getScene('OrbScene');
  const real = Math.random;
  Math.random = () => 0;
  try { p.use(); } finally { Math.random = real; }
  return { destroyed: p.destroyed, note: p.note, gone: !window.gear.items.some((i) => i.uid === 'orbTarget') };
})()`);
await sleep(400);
const news = await ev(popupNow);
console.log('destroyed:', JSON.stringify({ blownUp, texts: news.texts }));
check('a 폭발의 구슬 that destroys the weapon says so in the popup, with 확인 to go back',
  blownUp.destroyed && blownUp.gone && news.open && news.texts.some((t) => /장비가 파괴되었습니다/.test(t)) &&
    news.texts.some((t) => t === '확인'),
  news.texts.join(' | '));
await shot('gear-11-orb-destroyed');
await ev(`(() => { window.game.scene.getScene('OrbScene').close(); return 1; })()`);
await sleep(900);
const afterNews = await scene('InventoryScene', `return { open: window.game.scene.isActive('OrbScene'), hint: s.orbHint ? s.orbHint.text : '' };`);
check('and 확인 lands back in the 인벤토리', afterNews.open === false);

// --- 13. a saved run keeps the weapon it went out with ---
// The weapon in hand can be swapped while a run is saved; the save carries
// the one that run went out with, and a resumed run fights with that.
await ev(`(() => {
  window.gear.reset();
  window.gear.add({ uid: 'spare', id: 'runedSword', prefixes: [{ id: 'mighty', tier: 2 }], suffixes: [] });
  window.gear.add({ uid: 'wornOut', id: 'ironSword', prefixes: [{ id: 'mighty', tier: 5 }], suffixes: [] });
  window.gear.equip('wornOut');
  localStorage.setItem('exiled-survivors:save:v1', window.sealRecord('exiled-survivors:save:v1', {
    version: 1, savedAt: Date.now(), elapsedMs: 120000, level: 4, xp: 2, hp: 12,
    skills: { meleeStrike: { damage: 15, cooldownMs: 1000, range: 90 } },
    spawnerMs: 120000,
    gear: { uid: 'wornOut', id: 'ironSword', prefixes: [{ id: 'mighty', tier: 5 }], suffixes: [] },
  }));
  window.game.scene.getScene('GameScene').scene.start('MenuScene');
  return 1;
})()`);
await sleep(1800);
await openIcon('gear');
const swapped = await scene('InventoryScene', `
  const before = window.gear.value.equipped;
  const lineBefore = s.wearing.text;
  s.menu.focus('spare');
  s.menu.items.find(i => i.id === 'spare').onSelect();
  return { before, after: window.gear.value.equipped, lineBefore, lineAfter: s.wearing.text };
`);
console.log('swapped:', JSON.stringify(swapped));
check('with a run in the save slot, the weapon can still be swapped',
  swapped.before === 'wornOut' && swapped.after === 'spare', `${swapped.before} -> ${swapped.after}`);
check('and once the one in hand is not the saved run’s, the line under the title says the saved run goes on with its own',
  !/이어하기는 저장 당시 무기/.test(swapped.lineBefore) && /이어하기는 저장 당시 무기/.test(swapped.lineAfter),
  `${swapped.lineBefore} -> ${swapped.lineAfter}`);
await shot('gear-11-swapped');

// Load the saved run: it fights with the sword it went out with, not the new one.
const resumed = await ev(`(() => {
  const save = JSON.parse(localStorage.getItem('exiled-survivors:save:v1'));
  window.game.scene.getScene('InventoryScene').scene.stop();
  window.game.scene.getScene('MenuScene').scene.start('GameScene', { save });
  return 1;
})()`);
void resumed;
await sleep(1500);
const loaded = await scene('GameScene', `
  return { runGear: s.runGear?.uid ?? null, attack: s.mods.gear.attack,
           wantOld: window.gearBonusFor(window.gear.items.find((i) => i.uid === 'wornOut')).attack,
           wantNew: window.gearBonusFor(window.gear.items.find((i) => i.uid === 'spare')).attack,
           saved: JSON.parse(localStorage.getItem('exiled-survivors:save:v1') ?? 'null')?.gear?.uid ?? null };
`);
// And the save it writes keeps carrying that sword.
await scene('GameScene', `s.writeSave(); return 1;`);
const rewritten = await ev(`JSON.parse(localStorage.getItem('exiled-survivors:save:v1') ?? 'null')?.gear?.uid ?? null`);
console.log('resumed:', JSON.stringify({ loaded, rewritten }));
check('the resumed run has the effect of the weapon it went out with, not the one now in hand',
  loaded.runGear === 'wornOut' && loaded.attack === loaded.wantOld && loaded.wantOld !== loaded.wantNew,
  `+${loaded.attack} (went out with +${loaded.wantOld}, in hand +${loaded.wantNew})`);
check('and keeps carrying it in the saves it writes', rewritten === 'wornOut', `${rewritten}`);

// A save from before saves carried a weapon takes the one in hand.
await ev(`(() => {
  const save = JSON.parse(localStorage.getItem('exiled-survivors:save:v1'));
  delete save.gear;
  window.game.scene.getScene('GameScene').scene.start('GameScene', { save });
  return 1;
})()`);
await sleep(1500);
const older = await scene('GameScene', `return { runGear: s.runGear?.uid ?? null };`);
check('a save written before that takes the weapon in hand', older.runGear === 'spare', `${older.runGear}`);

await ev(`(() => {
  localStorage.removeItem('exiled-survivors:save:v1');
  window.game.scene.getScene('GameScene').scene.start('MenuScene');
  return 1;
})()`);
await sleep(1500);

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
           // Every line a 1티어: one is traded for a different 1티어 instead.
           onTop: (() => {
             const held = ['mighty', 'giant'];
             const seen = { swap: 0, destroyed: 0, other: 0, ok: true, N: 1000 };
             for (let i = 0; i < seen.N; i++) {
               const r = window.orbApplied({ uid: 'z', id: 'steelSword', prefixes: [{ id: 'mighty', tier: 1 }], suffixes: [{ id: 'giant', tier: 1 }] }, spec);
               if (!r) { seen.other++; continue; }
               if (r.kind === 'destroyed') { seen.destroyed++; continue; }
               if (r.kind !== 'swap') { seen.other++; continue; }
               seen.swap++;
               const lines = [...r.item.prefixes, ...r.item.suffixes];
               if (lines.length !== 2 || lines.some((l) => l.tier !== 1) || held.includes(r.line.id) ||
                   r.line.tier !== 1 || r.from.tier !== 1 || !held.includes(r.from.id)) seen.ok = false;
             }
             return seen;
           })(),
           fromTiers: [...new Set(Array.from({ length: 400 }, () => {
             const r = window.orbApplied({ uid: 'w', id: 'steelSword', prefixes: [{ id: 'mighty', tier: 1 }],
               suffixes: [{ id: 'giant', tier: 3 }] }, spec);
             return r.kind === 'upgrade' ? r.from.tier + '>' + r.line.tier : r.kind;
           }))],
           chance: spec.chance, bossOnly: spec.fromBossOnly === true, risk: spec.upgrade.destroyChance };
})()`);
console.log('폭발:', JSON.stringify(explode));
check('폭발의 구슬 destroys the weapon about one use in five',
  Math.abs(explode.destroyed / explode.N - explode.risk) < 0.03,
  `${(explode.destroyed / explode.N * 100).toFixed(1)}% of ${explode.N}`);
check('it leaves a 1티어 line alone while there is a line to climb',
  explode.fromTiers.every((t) => t === '3>2' || t === 'destroyed'), JSON.stringify(explode.fromTiers));
check('on a weapon all of 1티어 it trades one line for a different 1티어 one, at the same risk',
  explode.onTop.other === 0 && explode.onTop.ok && explode.onTop.swap > 0 &&
    Math.abs(explode.onTop.destroyed / explode.onTop.N - explode.risk) < 0.05,
  JSON.stringify(explode.onTop));
check('otherwise it swaps one 속성 for another a rung better',
  explode.steps.length === 1 && explode.steps[0] === 1 &&
    explode.sameLines === explode.upgraded,
  `every upgrade moved one rung, and the count of 속성 never changed`);
check('and it cannot be spent on a weapon with no 속성 to work on',
  explode.onBare === null);
check('it comes off any kill now, at its own chance',
  explode.chance > 0 && explode.bossOnly === false,
  `${(explode.chance * 100).toFixed(2)}% a kill`);

// --- 14b. 망고의 구슬: 망고 상태 lasts one 폭발의 구슬, which cannot destroy it ---
const mango = await ev(`(() => {
  const c = window.config, ORBS = c.ORBS;
  const sword = { uid: 'm1', id: 'steelSword', prefixes: [{ id: 'mighty', tier: 3 }], suffixes: [] };
  const warded = window.orbApplied(sword, ORBS.mango);
  const twice = window.orbApplied(warded.item, ORBS.mango);
  const real = Math.random;
  Math.random = () => 0;
  const saved = window.orbApplied(warded.item, ORBS.explode);
  const plain = window.orbApplied(sword, ORBS.explode);
  // A roll that does not destroy spends it all the same.
  Math.random = () => 0.99;
  const climbed = window.orbApplied(warded.item, ORBS.explode);
  Math.random = real;
  // Written down and read back with the stash.
  window.gear.add(warded.item);
  const stored = JSON.parse(localStorage.getItem('exiled-survivors:gear:v2')).items.find((i) => i.uid === 'm1');
  return {
    chance: ORBS.mango.chance, explode: ORBS.explode.chance, tier: ORBS.mango.tier,
    warded: { kind: warded?.kind, mango: warded?.item?.mango },
    twice,
    saved: { kind: saved?.kind, kept: saved?.item?.uid, mango: saved?.item?.mango ?? false,
             lines: saved?.item ? saved.item.prefixes.length + saved.item.suffixes.length : null },
    plain: { kind: plain?.kind, item: plain?.item },
    climbed: { kind: climbed?.kind, mango: climbed?.item?.mango ?? false, spent: climbed?.wardSpent === true },
    stored: stored?.mango,
  };
})()`);
console.log('망고:', JSON.stringify(mango));
// Its own chance (a tenth of the 폭발의 구슬's when it was made; the live
// values have parted them since).
check('망고의 구슬 drops, rarer than the 폭발의 구슬, labelled rare',
  mango.chance > 0 && mango.chance < mango.explode && mango.tier === 'mythic', `${mango.chance} vs ${mango.explode}`);
check('it puts a weapon in 망고 상태, kept with the stash, and is not spent on one already there',
  mango.warded.kind === 'ward' && mango.warded.mango === true && mango.twice === null && mango.stored === true,
  JSON.stringify(mango.warded));
check('a 폭발의 구슬 that would destroy it is stopped: the weapon stays as it was, its 망고 spent',
  mango.saved.kind === 'saved' && mango.saved.kept === 'm1' && mango.saved.mango === false && mango.saved.lines === 1,
  JSON.stringify(mango.saved));
check('without one, the same roll destroys it', mango.plain.kind === 'destroyed' && mango.plain.item === null);
check('and a 폭발의 구슬 that climbs spends the 망고 too: it lasts one use, whatever the roll',
  mango.climbed.kind === 'upgrade' && mango.climbed.mango === false && mango.climbed.spent === true,
  JSON.stringify(mango.climbed));
await ev(`(() => { window.game.scene.getScene('InventoryScene').scene.restart({ onClose: () => {}, focus: 'm1' }); return 1; })()`);
await sleep(900);
const mangoShown = await scene('InventoryScene', `
  s.menu.focus('m1'); s.showDetails();
  const i = s.menu.items.findIndex((it) => it.id === 'm1');
  const view = s.menu.cells[i - s.menu.page * 72];
  return { badge: view?.badge.visible, key: view?.badge.texture.key, first: s.stateLine?.text ?? '',
           linesTop: s.lines.y, stateBottom: s.stateLine ? s.stateLine.y + s.stateLine.displayHeight : 0 };
`);
check('the 인벤토리 shows it: a 망고 on the cell, and a line under its name that keeps clear of the read-out',
  mangoShown.badge === true && mangoShown.key === 'tex-mango' && /망고 상태/.test(mangoShown.first) &&
    mangoShown.stateBottom <= mangoShown.linesTop, JSON.stringify(mangoShown));
await shot('gear-12-mango');
await ev(`(() => { window.gear.discard('m1'); return 1; })()`);

// --- 15. a 구슬 says what it did ---
await ev(`(() => {
  window.gear.reset();
  window.gear.add({ uid: 'noted', id: 'runedSword',
    prefixes: [{ id: 'mighty', tier: 4 }], suffixes: [{ id: 'giant', tier: 3 }] });
  window.orbs.reset();
  window.orbs.add('transmute', 3);
  window.orbs.add('awaken', 3);
  window.game.scene.getScene('InventoryScene').scene.restart({ onClose: () => {}, focus: 'noted' });
  return 1;
})()`);
await sleep(1000);
await scene('InventoryScene', `s.menu.focus('noted'); s.pressOrb('transmute'); return 1;`);
await sleep(600);
const afterReroll = await ev(`(() => {
  const p = window.game.scene.getScene('OrbScene');
  p.use();
  const item = window.gear.items.find((i) => i.uid === 'noted');
  return { note: p.note, lines: item ? item.prefixes.length + item.suffixes.length : null };
})()`);
console.log('after a reroll:', JSON.stringify(afterReroll));
check('spending one says what it actually did',
  afterReroll.note.includes('변화의 구슬') && afterReroll.note.includes(String(afterReroll.lines)),
  afterReroll.note);

const afterAdd = await ev(`(() => {
  const p = window.game.scene.getScene('OrbScene');
  p.pick('awaken');
  p.use();
  return { note: p.note, changed: p.changed };
})()`);
await sleep(400);
await shot('gear-11-orb-highlight');
console.log('after an add:', JSON.stringify(afterAdd));
check('an added 속성 is named, with the rung it came out at',
  /각성의 구슬 —/.test(afterAdd.note) && /\d티어/.test(afterAdd.note), afterAdd.note);
check('and the line it added is lit up in the popup',
  afterAdd.changed.length >= 1 && afterAdd.changed.some((line) => /\d/.test(line)), JSON.stringify(afterAdd.changed));
await ev(`(() => { window.game.scene.getScene('OrbScene').close(); return 1; })()`);
await sleep(900);

// --- 고정 속성: every sword of a base carries its own, outside the slots ---
await ev(`(() => { localStorage.removeItem('exiled-survivors:save:v1'); return 1; })()`);
// The page may already be on #run, where navigating there again is only a
// hash change and the run never restarts — so reload as well.
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await cdp.send('Page.reload', {});
await sleep(4200);
await run(`s.player.setInvulnerable(true); return 1;`);
const hold = (id) => run(`
  const item = { uid: 'probe-${id}', id: '${id}', prefixes: [], suffixes: [] };
  const b = window.gearBonusFor(item);
  s.gearBonus = b; s.mods = { ...s.mods, gear: b }; s.player.applyGear(b);
  return b;
`);

const implicits = await ev(`(() => {
  const G = window.config.GEAR;
  const bare = (id) => window.gearBonusFor({ uid: 'i', id, prefixes: [], suffixes: [] });
  const full = (id) => window.gearBonusFor({ uid: 'f', id,
    prefixes: [{ id: 'mighty', tier: 1 }, { id: 'critical', tier: 1 }, { id: 'cruel', tier: 1 }],
    suffixes: [{ id: 'giant', tier: 1 }, { id: 'giant', tier: 1 }, { id: 'giant', tier: 1 }] });
  const out = {};
  for (const id of Object.keys(G)) {
    const im = G[id].implicit ?? {};
    // 강력 adds its share to the base's own damage scale; nothing else does.
    const mighty = (lines) => lines * (window.config.AFFIXES.mighty.gearTiers[0].gear.damageScale - 1);
    const ok = (b, lines = 0) =>
      b.projectileBlock === (im.projectileBlock ?? 0) &&
      b.extraProjectiles === (im.extraProjectiles ?? 0) &&
      b.damageIncrease === 0 && Math.abs(b.damageAmplify - ((im.damageScale ?? 1) + mighty(lines))) < 1e-9 &&
      (im.skillAttackSpeed ? b.skillAttackSpeed[im.skillAttackSpeed.skill] === im.skillAttackSpeed.scale
                           : Object.keys(b.skillAttackSpeed).length === 0);
    out[id] = { has: !!G[id].implicit, bare: ok(bare(id)), full: ok(full(id), 1),
      speed: bare(id).attackSpeedScale, want: im.attackSpeedScale ?? 1 };
  }
  return out;
})()`);
console.log('implicits:', JSON.stringify(implicits));
check('every sword on the roster has a 고정 속성',
  Object.values(implicits).every(i => i.has), Object.keys(implicits).join(', '));
check('and it is there whatever the 접두어 / 접미어 slots hold, full or empty',
  Object.values(implicits).every(i => i.bare && i.full && i.speed === i.want),
  JSON.stringify(implicits));

// 강철 검: every skill's damage, after the flat attack.
const steelBonus = await hold('steelSword');
const steel = await run(`
  const c = window.config, base = c.SKILL_BASE.meleeStrike.damage;
  const st = s.progression.statsFor('meleeStrike');
  // 0.93: its 고정 속성 is an 증폭 on the whole hit.
  const want = Math.round((base + ${steelBonus.attack}) * (st.damage / base + ${steelBonus.damageIncrease}) *
    s.mods.shard.damage * ${steelBonus.damageAmplify} * (c.BALANCE.damageScale.meleeStrike ?? 1) * s.heldBonus.damageScale);
  return { got: s.damageOf('meleeStrike'), want, scale: ${steelBonus.damageAmplify} };
`);
check('강철 검 scales every skill’s damage by its 고정 속성',
  steel.got === steel.want && steel.scale > 1, `${steel.got} (want ${steel.want}, ×${steel.scale})`);

// 무쇠 검 every skill's attack speed; 녹슨 검 only 타격's.
const pace = async (id) => {
  await hold(id);
  return run(`
    if (!s.owned.has('fireball')) s.onSkillCollected('fireball');
    const c = window.config;
    const plain = (skill) => {
      const base = c.SKILL_BASE[skill].attackSpeed;
      return base * s.mods.shard.attackSpeed * (s.progression.statsFor(skill).attackSpeed / base);
    };
    const want = (skill) => plain(skill) * s.gearBonus.attackSpeedScale * (s.gearBonus.skillAttackSpeed[skill] ?? 1);
    return { melee: 1000 / s.cooldownOf('meleeStrike'), fire: 1000 / s.cooldownOf('fireball'),
      wantMelee: want('meleeStrike'), wantFire: want('fireball'),
      plainMelee: plain('meleeStrike'), plainFire: plain('fireball') };
  `);
};
const close = (a, b) => Math.abs(a - b) < 1e-6;
const iron = await pace('ironSword');
const rusty = await pace('rustySword');
console.log('pace:', JSON.stringify({ iron, rusty }));
check('무쇠 검 raises every skill’s attack speed',
  close(iron.melee, iron.wantMelee) && close(iron.fire, iron.wantFire) &&
    iron.melee > iron.plainMelee && iron.fire > iron.plainFire,
  `타격 ${iron.melee.toFixed(3)}/s, 화염구 ${iron.fire.toFixed(3)}/s`);
check('녹슨 검 raises 타격’s attack speed and no other skill’s',
  close(rusty.melee, rusty.wantMelee) && rusty.melee > rusty.plainMelee && close(rusty.fire, rusty.plainFire),
  `타격 ${rusty.melee.toFixed(3)}/s (plain ${rusty.plainMelee.toFixed(3)}), 화염구 ${rusty.fire.toFixed(3)}/s`);

// 룬 각인 검: one more shot a cast, one more orb in the air.
await hold('runedSword');
const runed = await run(`
  s.choosing = true;
  if (!s.owned.has('fireball')) s.onSkillCollected('fireball');
  if (!s.owned.has('voidOrb')) s.onSkillCollected('voidOrb');
  const p = s.player;
  const w = s.weapons.find(x => x.definition.id === 'fireball');
  const st = s.progression.statsFor('fireball');
  const cast = (count) => {
    s.spawner.clear();
    w.projectiles.getChildren().forEach(b => b.active && b.despawn());
    for (let i = 0; i < count; i++) {
      const e = s.spawner.group.get(p.x + 40 + i * 10, p.y + i * 20);
      e.spawn(p.x + 40 + i * 10, p.y + i * 20, p, 'brute');
    }
    w.sinceShotMs = 99999;
    w.update(16, { origin: p, enemies: s.spawner.group, damage: 1, cooldownMs: 1,
      range: s.progression.rangeFor('fireball'), projectileSpeed: st.projectileSpeed,
      chainCount: 0, pierceCount: 0, orbCount: 0, orbitSpeed: 0,
      extraProjectiles: s.gearBonus.extraProjectiles, hit: () => {} });
    return w.projectiles.countActive(true);
  };
  const out = { extra: s.gearBonus.extraProjectiles, two: cast(2), one: cast(1) };
  s.spawner.clear();
  w.projectiles.getChildren().forEach(b => b.active && b.despawn());
  out.card = s.loadout().find(l => l.id === 'fireball').breakdown.join(' | ');
  s.choosing = false;
  return out;
`);
await sleep(400);
const orbsUp = await run(`
  const w = s.weapons.find(x => x.definition.id === 'voidOrb');
  return { live: w.active.length, own: s.progression.statsFor('voidOrb').orbCount, extra: s.gearBonus.extraProjectiles };
`);
console.log('runed:', JSON.stringify({ runed, orbsUp }));
check('룬 각인 검: a throwing skill fires one more shot a cast',
  runed.extra >= 1 && runed.two === 1 + runed.extra && runed.one === 1 + runed.extra,
  `${runed.two} shots at two enemies, ${runed.one} at one`);
check('and an orbiting skill keeps one more orb in the air',
  orbsUp.live === orbsUp.own + orbsUp.extra, `${orbsUp.live} orbs (own ${orbsUp.own} + ${orbsUp.extra})`);
check('the DPS card counts the extra shot',
  runed.card.includes('투사체 ' + (1 + runed.extra)), runed.card);

// 오니고로시: a share of the enemy's shots are turned aside. The roll is
// pinned either side of the configured chance, so nothing is left to luck.
const shoot = (id, roll) => hold(id).then(() => run(`
  const p = s.player;
  p.hp = p.maxHp;
  p.invulnerableUntil = 0;
  const shot = { active: true, damage: 10, despawn() { this.active = false; } };
  const real = Math.random;
  Math.random = () => ${roll};
  s.combat.onEnemyShotHit(p, shot);
  Math.random = real;
  const out = { lost: p.maxHp - p.hp, gone: !shot.active, chance: p.projectileBlock };
  p.hp = p.maxHp;
  p.invulnerableUntil = 0;
  return out;
`));
const blockAt = await ev(`(() => window.config.GEAR.onigoroshi.implicit.projectileBlock)()`);
const blocked = await shoot('onigoroshi', blockAt - 0.001);
const through = await shoot('onigoroshi', blockAt + 0.001);
const plain = await shoot('rustySword', 0);
console.log('block:', JSON.stringify({ blockAt, blocked, through, plain }));
check('오니고로시 stops a shot under its chance — no damage, the shot is gone',
  blockAt > 0 && blocked.lost === 0 && blocked.gone && blocked.chance === blockAt,
  `${blockAt * 100}%: lost ${blocked.lost}`);
check('and one over it lands as usual', through.lost > 0, `lost ${through.lost}`);
check('a sword without it stops nothing', plain.lost > 0 && plain.chance === 0, `lost ${plain.lost}`);

// The 인벤토리 reads it out, on its own line.
const readout = await ev(`(() => {
  const Inv = window.game.scene.getScene('InventoryScene').constructor;
  const G = window.config.GEAR;
  const text = Inv.describe({ uid: 'r', id: 'onigoroshi', prefixes: [], suffixes: [] });
  return { text, want: Number((G.onigoroshi.implicit.projectileBlock * 100).toFixed(2)) + '%' };
})()`);
check('the 인벤토리 reads the 고정 속성 out with its number',
  readout.text.split('\n')[0].endsWith(' · 고정: ' + readout.want + ' 확률로 적의 투사체를 막아냄'),
  readout.text.split('\n')[0]);

// --- 장비 합성: three of the same sword for a chance at the one above ---
const rules = await ev(`(() => {
  const G = window.config.GEAR, C = window.config.GEAR_COMBINE, g = window.gear;
  const fill = (id, n, prefix) => { for (let i = 0; i < n; i++) g.add({ uid: prefix + i, id, prefixes: [], suffixes: [] }); };
  g.reset();
  fill('rustySword', C.count, 'r'); fill('onigoroshi', C.count, 'o'); fill('ironSword', 1, 'i');
  const starter = g.value.equipped;
  const out = {
    count: C.count,
    short: g.combineProblem(['r0', 'r1']),
    mixed: g.combineProblem(['r0', 'r1', 'i0']),
    equipped: g.combineProblem(['r0', 'r1', starter]),
    top: g.combineProblem(['o0', 'o1', 'o2']),
    fine: g.combineProblem(['r0', 'r1', 'r2']),
  };

  // A success and a failure, the roll pinned for the one call that decides it.
  const pinned = (value, uids) => { const roll = Math.random; Math.random = () => value;
    try { return g.combine(uids); } finally { Math.random = roll; } };
  const win = pinned(0, ['r0', 'r1', 'r2']);
  out.win = { success: win?.success, id: win?.item?.id, lines: win ? win.item.prefixes.length + win.item.suffixes.length : -1,
    tierUp: win?.item ? G[win.item.id].tier === G.rustySword.tier - 1 : false,
    spent: ['r0', 'r1', 'r2'].every(uid => !g.value.items.some(it => it.uid === uid)),
    kept: g.value.items.some(it => it.uid === win?.item?.uid) };
  fill('rustySword', C.count, 'q');
  const before = g.value.items.length;
  const lose = pinned(0.999, ['q0', 'q1', 'q2']);
  out.lose = { success: lose?.success, item: lose?.item, lost: before - g.value.items.length };

  // And how often it takes, over many — against the configured chance.
  let wins = 0; const N = 600;
  for (let i = 0; i < N; i++) {
    fill('ironSword', C.count, 'm' + i + '_');
    if (g.combine(['m' + i + '_0', 'm' + i + '_1', 'm' + i + '_2'])?.success) wins++;
    for (const it of [...g.value.items]) if (it.uid !== g.value.equipped) g.discard(it.uid);
  }
  out.rate = wins / N; out.want = C.successChance;
  g.reset();
  return out;
})()`);
console.log('combine rules:', JSON.stringify(rules));
check('합성 takes exactly that many of one sword, none in hand, and not the top tier',
  rules.short === 'count' && rules.mixed === 'mixed' && rules.equipped === 'equipped' &&
    rules.top === 'top' && rules.fine === null,
  `${rules.short} / ${rules.mixed} / ${rules.equipped} / ${rules.top} / ${rules.fine}`);
check('a success spends the three and gives the sword one tier up, with no 속성',
  rules.win.success === true && rules.win.tierUp && rules.win.lines === 0 && rules.win.spent && rules.win.kept,
  JSON.stringify(rules.win));
check('a failure spends the three and gives nothing',
  rules.lose.success === false && rules.lose.item === null && rules.lose.lost === rules.count,
  JSON.stringify(rules.lose));
check('and it takes about as often as configured',
  Math.abs(rules.rate - rules.want) < 0.06, `${(rules.rate * 100).toFixed(1)}% (want ${rules.want * 100}%)`);

// On the screen: pick, run, watch, and land on what came of it.
const combineScreen = async (roll) => {
  await ev(`(() => {
    const g = window.gear; g.reset();
    for (let i = 0; i < 3; i++) g.add({ uid: 'c' + i, id: 'ironSword', prefixes: [], suffixes: [] });
    return 1;
  })()`);
  await ev(`(() => { const s = window.game.scene.getScene('InventoryScene');
    if (window.game.scene.isActive('InventoryScene')) s.scene.restart({ onClose: s.payload.onClose, tab: 'gear' });
    return 1; })()`);
  await sleep(700);
  const picking = await scene('InventoryScene', `
    // Started from the last of the three, so the cursor is not on the first cell to begin with.
    s.menu.focus('c2'); s.pressCombine(); s.togglePick('c0'); s.togglePick('c1');
    return { picked: [...s.combining], button: s.combineButton.text, hint: s.orbHint.text, at: s.menu.selected };
  `);
  const started = await scene('InventoryScene', `
    const roll = Math.random; Math.random = () => ${roll};
    try { s.pressCombine(); } finally { Math.random = roll; }
    return { busy: s.busy, items: window.gear.items.length };
  `);
  // Keys are ignored while it plays out.
  await cdp.tap('Escape', 27, 'Escape');
  const fx = await ev(`window.config.COMBINE_FX`);
  await sleep(fx.gatherMs + 900);
  const mid = await scene('InventoryScene', `return { busy: s.busy, open: window.game.scene.isActive('InventoryScene') };`);
  await sleep(fx.chargeMs + Math.max(fx.flashMs, fx.burstMs) + fx.holdMs);
  const after = await scene('InventoryScene', `return { busy: s.busy, note: s.orbHint?.text ?? '',
    heading: s.heading.text, items: window.gear.items.map(i => i.id), selected: s.menu.selected, cells: s.menu.items.length };`);
  return { picking, started, mid, after };
};
// From a fresh title, whatever screen the checks above left open.
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await cdp.send('Page.reload', {});
await sleep(4200);
await openIcon('gear');
const lost = await combineScreen(0.999);
console.log('combine (fail):', JSON.stringify(lost));
check('picking three puts them in the 합성 and the button says so',
  lost.picking.picked.length === 3 && lost.picking.button === '합성하기' && /20%|%/.test(lost.picking.hint),
  `${lost.picking.button} — ${lost.picking.hint}`);
check('the light plays out over the screen, which takes no keys meanwhile',
  lost.started.busy === true && lost.mid.busy === true && lost.mid.open === true,
  JSON.stringify({ started: lost.started, mid: lost.mid }));
check('a failure comes back with the three gone and says so',
  lost.after.busy === false && /합성 실패/.test(lost.after.note) && !lost.after.items.includes('ironSword'),
  `${lost.after.note} — ${lost.after.items.join(', ')}`);
check('and the cursor stays where it was, not back on the first cell',
  lost.after.selected === Math.min(lost.picking.at, lost.after.cells - 1) && lost.picking.at > 0,
  `${lost.picking.at} → ${lost.after.selected}`);
await shot('gear-combine-fail');

const won = await combineScreen(0);
console.log('combine (success):', JSON.stringify(won));
check('a success comes back on the new sword, one tier up, and says so',
  won.after.busy === false && /합성 성공/.test(won.after.note) && won.after.items.includes('steelSword') &&
    won.after.heading === '강철 검',
  `${won.after.note} — ${won.after.heading}`);
await shot('gear-combine-success');

const combineReset = await scene('InventoryScene', `
  window.gear.reset();
  s.scene.restart({ onClose: s.payload.onClose, tab: 'gear' });
  return 1;
`);
await sleep(700);
const why = await scene('InventoryScene', `
  s.menu.focus(window.gear.value.equipped); s.pressCombine();
  return { combining: s.combining, why: s.combineWhy, line: s.orbHint.text };
`);
check('pressing 합성 on the sword in hand says why it cannot',
  combineReset === 1 && why.combining === null && /착용 중/.test(why.line), why.line);
await cdp.tap('Escape', 27, 'Escape');
await sleep(500);

// --- 희귀 and 신화 drops stand in a pillar of light, in their tier's colour (0.111) ---
// By way of a blank page: a reload of the page in hand could still be on its
// old run when the wait below first looks, and the probe then lands mid-load.
await cdp.send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
// Until the run is really up: a fixed wait was too short on a busy machine.
for (let i = 0; i < 40; i++) {
  await sleep(500);
  const up = await ev(`!!window.game?.scene.getScene('GameScene')?.player?.active`);
  if (up === true) break;
}
const pillars = await run(`
  s.player.setInvulnerable(true);
  s.choosing = true;
  s.spawner.clear();
  const p = s.player;
  const full = { prefixes: [{ id: 'mighty', tier: 1 }, { id: 'critical', tier: 1 }, { id: 'cruel', tier: 1 }],
    suffixes: [{ id: 'giant', tier: 1 }, { id: 'swift', tier: 1 }, { id: 'magnetic', tier: 1 }] };
  s.combat.dropGearAt(p.x - 300, p.y, { uid: 'loud', id: 'runedSword', ...full });
  s.combat.dropGearAt(p.x + 300, p.y, { uid: 'plain', id: 'ironSword', prefixes: [], suffixes: [] });
  // 희귀 at three lines, 마법 at two (AUDIO.dropTiers).
  s.combat.dropGearAt(p.x, p.y + 200, { uid: 'yellow', id: 'ironSword',
    prefixes: full.prefixes.slice(0, 2), suffixes: full.suffixes.slice(0, 1) });
  s.combat.dropGearAt(p.x + 200, p.y + 200, { uid: 'blue', id: 'ironSword',
    prefixes: full.prefixes.slice(0, 1), suffixes: full.suffixes.slice(0, 1) });
  const drops = s.combat.gearDrops.getChildren().filter(d => d.active);
  const loud = drops.find(d => d.item.uid === 'loud'), plain = drops.find(d => d.item.uid === 'plain');
  const yellow = drops.find(d => d.item.uid === 'yellow'), blue = drops.find(d => d.item.uid === 'blue');
  const tiers = window.config.DROP_LABEL.tiers;
  const out = {
    loud: { on: loud.nameplate.pillar.visible, x: Math.round(loud.nameplate.pillar.x - loud.x),
      under: loud.nameplate.pillar.depth < loud.depth, alpha: loud.nameplate.pillar.alpha,
      red: loud.nameplate.tier === 'mythic' && loud.nameplate.pillar.tintTopLeft === tiers.mythic.pillar },
    yellow: { tier: yellow.nameplate.tier, on: yellow.nameplate.pillar.visible,
      tinted: yellow.nameplate.pillar.tintTopLeft === tiers.rare.pillar },
    blue: { tier: blue.nameplate.tier, on: blue.nameplate.pillar.visible },
    plain: plain.nameplate.pillar.visible,
  };
  s.combat.dropMangoAt(p.x, p.y - 300);
  const mango = s.combat.mangoDrops.getChildren().find(d => d.active);
  out.mango = mango?.nameplate.pillar?.visible === true;
  loud.collect();
  out.gone = loud.nameplate.pillar.visible;
  s.combat.dropAltarAt(p.x, p.y + 300, 'bosses');
  const altar = s.combat.altars.getChildren().find(a => a.active);
  out.altar = altar?.nameplate.pillar === undefined;
  return out;
`);
console.log('pillars:', JSON.stringify(pillars));
check('a 신화 drop stands in a red pillar of light, see-through, under it and centred on it',
  pillars.loud.on === true && pillars.loud.red && pillars.loud.x === 0 && pillars.loud.under &&
    pillars.loud.alpha > 0 && pillars.loud.alpha < 1 && pillars.mango === true,
  JSON.stringify(pillars.loud));
check('a 희귀 one in a yellow pillar; a 마법 one in none',
  pillars.yellow.tier === 'rare' && pillars.yellow.on === true && pillars.yellow.tinted &&
    pillars.blue.tier === 'magic' && pillars.blue.on === false,
  JSON.stringify({ yellow: pillars.yellow, blue: pillars.blue }));
check('an ordinary drop has none, and a picked-up one takes its pillar with it',
  pillars.plain === false && pillars.gone === false, JSON.stringify({ plain: pillars.plain, gone: pillars.gone }));
check('an altar, which is not picked up, stands in none', pillars.altar === true);
await shot('gear-pillar');

// --- 0.88: 기교 · 반복 · 활력, and weapons from before the seven rungs ---
const added = await run(`
  const c = window.config, A = c.AFFIXES;
  const at = (id, t) => A[id].gearTiers.find((r) => r.tier === t);
  // 기교 adds to the base's own block (오니고로시's 고정 속성), as lines add.
  const oni = { uid: 'o', id: 'onigoroshi', prefixes: [], suffixes: [{ id: 'deft', tier: 1 }] };
  const block = window.gearBonusFor(oni).projectileBlock;
  const wantBlock = c.GEAR.onigoroshi.implicit.projectileBlock + at('deft', 1).gear.projectileBlock;
  // 반복: a cast clock comes round soon once, then starts over — never twice running.
  const w = s.weapons.find((x) => x.definition.id === 'meleeStrike');
  const keep = Math.random;
  Math.random = () => 0;
  let r1, r2, r3, short;
  try {
    r1 = w.repeat.restart({ repeatChance: 0.5, cooldownMs: 1000 });
    r2 = w.repeat.restart({ repeatChance: 0.5, cooldownMs: 1000 });
    short = w.repeat.restart({ repeatChance: 0.5, cooldownMs: 200 });
    w.repeat.restart({ repeatChance: 0.5, cooldownMs: 200 });
    r3 = w.repeat.restart({ repeatChance: 0, cooldownMs: 1000 });
  } finally {
    Math.random = keep;
  }
  // 활력: health back every AFFIX_TIMING.regenEveryMs of the run's clock.
  const wasBonus = s.gearBonus;
  s.gearBonus = window.gearBonusFor({ uid: 'v', id: 'rustySword', prefixes: [], suffixes: [{ id: 'vital', tier: 1 }] });
  const every = c.AFFIX_TIMING.regenEveryMs;
  s.player.hp = 10;
  s.regenMs = 0;
  for (let t = 0; t < every - 50; t += 50) s.regenerate(50);
  const early = s.player.hp;
  s.regenerate(50);
  const healed = s.player.hp;
  s.player.hp = s.player.maxHp;
  // And the scene hands the weapon's 반복 to its skills.
  s.gearBonus = window.gearBonusFor({ uid: 'e', id: 'rustySword', prefixes: [{ id: 'echoing', tier: 1 }], suffixes: [] });
  window.__echoSeen = undefined;
  const update = w.update;
  w.update = function (d, ctx) { window.__echoSeen = ctx.repeatChance; return update.call(this, d, ctx); };
  // The section before left the run held; let it tick for this.
  const wasChoosing = s.choosing;
  s.choosing = false;
  window.__echoUndo = () => { w.update = update; s.gearBonus = wasBonus; s.choosing = wasChoosing; };
  return { block, wantBlock, r1, r2, r3, short, delay: c.AFFIX_TIMING.repeatDelayMs,
           early, healed, regen: at('vital', 1).gear.regen, wantEcho: at('echoing', 1).gear.repeatChance };
`);
await sleep(400);
const echoSeen = await ev(`(() => { const v = window.__echoSeen; window.__echoUndo(); return v; })()`);
console.log('0.88 속성:', JSON.stringify({ ...added, echoSeen }));
check('기교 adds its chance to the base’s own projectile block',
  Math.abs(added.block - added.wantBlock) < 1e-9, `${added.block} vs ${added.wantBlock}`);
check('반복: a cast that wins the roll goes off again AFFIX_TIMING.repeatDelayMs later, and the repeat does not repeat',
  added.r1 === 1000 - added.delay && added.r2 === 0 && added.r3 === 0, JSON.stringify(added));
check('on a short cooldown the repeat comes at half of it', added.short === 100, String(added.short));
check('the weapon’s 반복 chance reaches the skills', echoSeen === added.wantEcho, `${echoSeen} vs ${added.wantEcho}`);
check('활력 gives its health back once the interval is up, not before',
  added.early === 10 && added.healed === 10 + added.regen, JSON.stringify(added));

// A weapon from before 0.88 (no rungs on it) has each line moved down two:
// its tier 1 is read as tier 3, the number it always had.
await ev(`(() => {
  const raw = JSON.parse(localStorage.getItem('exiled-survivors:gear:v2'));
  raw.items.push({ uid: 'old', id: 'steelSword', prefixes: [{ id: 'mighty', tier: 1 }], suffixes: [{ id: 'giant', tier: 5 }] });
  localStorage.setItem('exiled-survivors:gear:v2', JSON.stringify(raw));
  return 1;
})()`);
await cdp.send('Page.reload', {});
await sleep(4300);
const laddered = await run(`
  const c = window.config;
  const it = window.gear.items.find((i) => i.uid === 'old');
  const fresh = window.gear.items.find((i) => i.uid !== 'old' && i.rungs === c.AFFIX_RUNGS);
  const saved = s.constructor.gearFor({ gear: { uid: 'r', id: 'steelSword', prefixes: [{ id: 'mighty', tier: 2 }], suffixes: [] } });
  return { lines: it && [...it.prefixes, ...it.suffixes].map((l) => l.tier), rungs: it?.rungs, want: c.AFFIX_RUNGS,
           before: c.AFFIX_RUNGS_BEFORE, others: !!fresh, saved: saved.prefixes[0].tier, savedRungs: saved.rungs };
`);
console.log('ladder:', JSON.stringify(laddered));
const rungShift = laddered.want - laddered.before;
check('a stashed weapon from before 0.88 has its lines laddered down onto the seven rungs',
  JSON.stringify(laddered.lines) === JSON.stringify([1 + rungShift, 5 + rungShift]) && laddered.rungs === laddered.want, JSON.stringify(laddered));
check('a saved run’s weapon from before is laddered the same way as it resumes',
  laddered.saved === 2 + rungShift && laddered.savedRungs === laddered.want, JSON.stringify(laddered));

// --- 0.91: no 합성 makes an 오니고로시; 나르실 is made; borders by rarity; 불러오기 clear of its line ---
const v091 = await ev(`(() => {
  const c = window.config, R = c.AFFIX_RUNGS;
  window.gear.reset();
  const runed = ['r1', 'r2', 'r3'].map((uid) => ({ uid, id: 'runedSword', prefixes: [], suffixes: [], rungs: R }));
  runed.forEach((item) => window.gear.add(item));
  const problem = window.gear.combineProblem(['r1', 'r2', 'r3']);
  const targets = c.combineTargets('runedSword').map((g) => g.id);
  const steel = c.combineTargets('ironSword').map((g) => g.id);
  // 나르실: made for its 철광석, taken apart for its own.
  window.ore.reset(); window.ore.add(c.GEAR.narsil.craftOre);
  const made = window.gear.craft('narsil');
  const oreAfter = window.ore.value;
  const back = made ? window.gear.salvage(made.uid) : null;
  return { problem, targets, steel, made: made?.id ?? null, oreAfter, back, oniCombine: c.GEAR.onigoroshi.combineInto, narsilWeight: c.GEAR.narsil.weight };
})()`);
console.log('0.91 gear:', JSON.stringify(v091));
check('룬 각인 검 has no 합성: no 합성 makes an 오니고로시 (or a 나르실)',
  v091.problem === 'top' && v091.targets.length === 0 && v091.oniCombine === false && v091.steel.length > 0, JSON.stringify(v091));
const narsilRead = await ev(`(() => {
  const InventoryScene = window.game.scene.getScene('InventoryScene').constructor;
  const c = window.config, item = { uid: 'n', id: 'narsil', prefixes: [], suffixes: [] };
  return { first: InventoryScene.describe(item).split(String.fromCharCode(10))[0], base: c.attackForTier(c.GEAR.narsil.tier),
           implicit: c.GEAR.narsil.implicit.attack, total: window.gearBonusFor(item).attack };
})()`);
check('나르실 reads its base attack and its 고정 속성 apart — and fights with both',
  narsilRead.first.startsWith(`공격력 +${narsilRead.base} `) && narsilRead.first.includes(`공격력 +${narsilRead.implicit}`) &&
    narsilRead.total === narsilRead.base + narsilRead.implicit, JSON.stringify(narsilRead));
check('나르실 is made for its 철광석, never dropped, and gives back 50 when taken apart',
  v091.made === 'narsil' && v091.oreAfter === 0 && v091.back?.ore === 50 && v091.narsilWeight === 0, JSON.stringify(v091));

// Borders in the 인벤토리 by rarity: 2 마법, 3–4 희귀, 5–6 신화.
await ev(`(() => {
  const R = window.config.AFFIX_RUNGS, L = (id) => ({ id, tier: 5 });
  window.gear.reset();
  window.gear.add({ uid: 'b2', id: 'steelSword', prefixes: [L('mighty')], suffixes: [L('giant')], rungs: R });
  window.gear.add({ uid: 'b3', id: 'steelSword', prefixes: [L('mighty'), L('cruel')], suffixes: [L('giant')], rungs: R });
  window.gear.add({ uid: 'b5', id: 'steelSword', prefixes: [L('mighty'), L('cruel'), L('critical')], suffixes: [L('giant'), L('swift')], rungs: R });
  window.game.scene.getScenes(true).forEach((sc) => sc.scene.key !== 'MenuScene' && sc.scene.stop());
  window.game.scene.getScene('MenuScene').scene.start();
  return 1;
})()`);
await sleep(1500);
await ev(`(() => { window.game.scene.getScene('MenuScene').openOverlay('InventoryScene', {}); return 1; })()`);
await sleep(900);
const borders = await scene('InventoryScene', `
  const B = window.config.INVENTORY.border;
  const of = (uid) => { const i = s.menu.items.findIndex((it) => it.id === uid); return s.menu.cells[i]?.plate.strokeColor; };
  return { two: of('b2'), three: of('b3'), five: of('b5'), want: { magic: B.magic, rare: B.rare, mythic: B.mythic } };
`);
check('인벤토리 borders: 2 속성 blue (마법), 3–4 yellow (희귀), 5–6 red (신화)',
  borders.two === borders.want.magic && borders.three === borders.want.rare && borders.five === borders.want.mythic &&
    borders.want.rare !== borders.want.mythic, JSON.stringify(borders));

// The title's 불러오기 row: its name never runs into the run read out beside it.
for (const [w, h, shape] of [[0, 0, 'landscape'], [360, 740, 'narrow phone']]) {
  if (w) await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true });
  else await cdp.send('Emulation.clearDeviceMetricsOverride', {});
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
  await sleep(4500);
  await ev(`(() => {
    const s = window.game.scene.getScene('GameScene');
    s.runGear = { uid: 'long', id: 'runedSword', prefixes: [{ id: 'mighty', tier: 1 }], suffixes: [{ id: 'vital', tier: 1 }], rungs: window.config.AFFIX_RUNGS };
    s.writeSave(); s.scene.start('MenuScene'); return 1; })()`);
  await sleep(1500);
  const row = await scene('MenuScene', `
    const r = s.menu.rows.find((x) => x.item.id === 'load');
    const a = r.label.getBounds(), b = r.detail.getBounds();
    return { label: r.label.text, detail: r.detail.text, gap: Math.round(b.left - a.right), inside: b.right <= s.scale.width && a.left >= 0 };
  `);
  check(`${shape}: the title’s 불러오기 name and its run read-out do not touch`, row.gap >= 8 && row.inside, JSON.stringify(row));
}
await cdp.send('Emulation.clearDeviceMetricsOverride', {});

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
