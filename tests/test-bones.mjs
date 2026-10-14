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
const bs = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('BoneScene'); ${body} })()`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(1200);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. what each kill is worth in 뼈다귀 ---
const chances = await ev(`(() => {
  const f = window.config.boneChanceFor;
  const B = window.config.BONES;
  return {
    skullPlain: f(B.skull, { isBoss: false, affixes: 0 }),
    skullRare1: f(B.skull, { isBoss: false, affixes: 1 }),
    skullRare6: f(B.skull, { isBoss: false, affixes: 6 }),
    skullBoss: f(B.skull, { isBoss: true, affixes: 0 }),
    ribPlain: f(B.rib, { isBoss: false, affixes: 3 }),
    ribBoss: f(B.rib, { isBoss: true, affixes: 0 }),
  };
})()`);
console.log('chances:', JSON.stringify(chances));
check('고대 두개골 comes off one ordinary kill in a thousand',
  chances.skullPlain === 0.001, `${(chances.skullPlain * 100).toFixed(2)}%`);
check('and off a rare by how many 속성 it was carrying',
  chances.skullRare1 === 0.002 && chances.skullRare6 === 0.007,
  `one 속성 ${(chances.skullRare1 * 100).toFixed(1)}%, six ${(chances.skullRare6 * 100).toFixed(1)}%`);
check('a 우두머리 never leaves one — it is what the skull makes more of',
  chances.skullBoss === 0);
check('갈비뼈 comes off a 우두머리 and nothing else',
  chances.ribBoss === 0.05 && chances.ribPlain === 0,
  `${(chances.ribBoss * 100).toFixed(0)}% off a 우두머리`);

// --- 2. they land, read right, and go into the drawer ---
const drops = await run(`
  s.choosing = true;
  s.spawner.clear();
  window.__played = [];
  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  mgr.play = (key, cfg) => { window.__played.push(key); return orig(key, cfg); };

  const out = {};
  for (const id of Object.keys(window.config.BONES)) {
    window.__played.length = 0;
    s.combat.dropBoneAt(-900, -900, id);
    const d = s.combat.boneDrops.getChildren().find(x => x.active && x.bone === id);
    out[id] = { name: d.nameplate.text, sound: window.__played[0], texture: d.texture.key };
  }
  mgr.play = orig;
  s.combat.boneDrops.getChildren().forEach(d => d.active && d.collect());
  s.choosing = false;
  return out;
`);
console.log('on the ground:', JSON.stringify(drops));
check('each 뼈다귀 lands under its own name and its own sprite',
  drops.skull.name === '고대 두개골' && drops.rib.name === '갈비뼈' &&
    drops.skull.texture !== drops.rib.texture,
  `${drops.skull.name} / ${drops.rib.name}`);
check('and sounds like the rarity it is',
  drops.skull.sound === 'sfx-drop-rare' && drops.rib.sound === 'sfx-drop-magic',
  `${drops.skull.sound} / ${drops.rib.sound}`);

await run(`
  const p = s.player;
  window.bones.reset();
  s.combat.dropBoneAt(p.x, p.y, 'rib');
  return 1;
`);
await sleep(1100);
const drawer = await ev(`(() => ({
  held: window.bones.value, total: window.bones.total,
  stored: JSON.parse(localStorage.getItem('exiled-survivors:bones:v1')),
}))()`);
console.log('drawer:', JSON.stringify(drawer));
check('walking over one puts it in the drawer and writes it down',
  drawer.held.rib === 1 && drawer.total === 1 && drawer.stored.rib === 1,
  `${drawer.total} held`);

// --- 3. the pick screen ---
await ev(`(() => {
  window.bones.reset();
  window.bones.add('rib', 4);
  window.bones.add('skull', 2);
  window.game.scene.getScene('GameScene').scene.start('MenuScene');
  return 1;
})()`);
await sleep(1800);
await ev(`(() => {
  const s = window.game.scene.getScene('MenuScene');
  const i = s.menu.rows.findIndex(r => r.item.id === 'start');
  s.menu.selected = i; s.menu.refresh(); s.menu.rows[i].item.onSelect(); return i;
})()`);
await sleep(1400);
const opened = await bs(`
  return { rows: s.menu.items.map(i => i.id), applied: s.applied,
           slots: s.slots.text.split(String.fromCharCode(10)),
           summary: s.summary.text, max: window.config.BONE_RUN.maxApplied,
           bottom: Math.round(s.summary.y + s.summary.height), canvas: s.scale.height };
`);
console.log('opened:', JSON.stringify(opened));
check('게임 시작 stops at the 뼈다귀 screen when the drawer has any',
  opened.rows.includes('skull') && opened.rows.includes('rib') &&
    opened.rows.includes('start') && opened.rows.includes('back'),
  opened.rows.join(' / '));
check('and draws a slot per 뼈다귀 a run can take, empty to begin with',
  opened.slots.length === opened.max + 1 &&
    opened.slots.slice(1).every((l) => /^─+$/.test(l)),
  `${opened.max} slots`);
check('with nothing applied, it says so',
  opened.applied.length === 0 && opened.summary.includes('아무것도'), opened.summary);
check('and none of it runs off the bottom',
  opened.bottom <= opened.canvas, `${opened.bottom} of ${opened.canvas}`);
await shot('bones-01-open');

// --- 4. three slots, and what stacks ---
const applied = await bs(`
  s.menu.focus('rib');
  s.menu.items.find(i => i.id === 'rib').onSelect();
  s.menu.items.find(i => i.id === 'rib').onSelect();
  s.menu.items.find(i => i.id === 'skull').onSelect();
  // A fourth would be one too many, and a second 두개골 does nothing anyway.
  s.menu.items.find(i => i.id === 'rib').onSelect();
  s.menu.items.find(i => i.id === 'skull').onSelect();
  return { applied: s.applied, slots: s.slots.text.split(String.fromCharCode(10)),
           summary: s.summary.text,
           ribOpen: s.menu.items.find(i => i.id === 'rib').enabled(),
           skullOpen: s.menu.items.find(i => i.id === 'skull').enabled(),
           held: JSON.parse(JSON.stringify(window.bones.value)) };
`);
console.log('applied:', JSON.stringify(applied));
check('a run takes three and no more',
  applied.applied.length === 3 && applied.ribOpen === false,
  applied.applied.join(' + '));
check('갈비뼈 stacks, 고대 두개골 does not',
  applied.applied.filter((b) => b === 'rib').length === 2 &&
    applied.applied.filter((b) => b === 'skull').length === 1 &&
    applied.skullOpen === false,
  applied.applied.join(' + '));
check('the slots read out what is in them',
  applied.slots.slice(1).every((l) => !/^─+$/.test(l)),
  applied.slots.slice(1).join(' | '));
check('and the total compounds rather than adding up',
  applied.summary.includes('+300%') && applied.summary.includes('+125%') &&
    applied.summary.includes('우두머리'),
  applied.summary);
check('nothing is spent until the run starts',
  applied.held.rib === 4 && applied.held.skull === 2,
  `${applied.held.rib} 갈비뼈 and ${applied.held.skull} 고대 두개골 still in the drawer`);
await shot('bones-02-applied');

// --- 5. starting spends them, and the run plays by them ---
await bs(`s.menu.items.find(i => i.id === 'start').onSelect(); return 1;`);
await sleep(2600);
const started = await run(`
  return { bonus: s.boneBonus, held: JSON.parse(JSON.stringify(window.bones.value)) };
`);
console.log('started:', JSON.stringify(started));
check('starting takes them out of the drawer',
  started.held.rib === 2 && started.held.skull === 1,
  `${started.held.rib} 갈비뼈 and ${started.held.skull} 고대 두개골 left`);
check('and the run is played on what they add up to',
  started.bonus.enemyHpScale === 4 && Math.abs(started.bonus.dropScale - 2.25) < 1e-9 &&
    started.bonus.raresBecomeBosses === true,
  `x${started.bonus.enemyHpScale} health, x${started.bonus.dropScale} drops`);

const ribbed = await run(`
  s.choosing = true;
  s.spawner.clear();
  const e = s.spawner.group.get(600, 600);
  e.spawn(600, 600, s.player, 'grunt', undefined, false, s.spawner.hpScale);
  const base = window.config.ENEMY_KINDS.grunt.maxHp;
  const out = { hp: e.hp, base, scale: s.spawner.hpScale };
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('a 일반 under two 갈비뼈:', JSON.stringify(ribbed));
check('갈비뼈 is on every enemy that walks in',
  ribbed.hp === Math.round(ribbed.base * 4),
  `${ribbed.base} -> ${ribbed.hp}`);

const skulled = await run(`
  s.choosing = true;
  s.spawner.clear();
  const was = window.config.RARE.chance;
  window.config.RARE.chance = 1;
  let bosses = 0, rares = 0, plain = 0;
  for (let i = 0; i < 12; i++) {
    s.spawner.spawnBurst(1);
    const live = s.spawner.group.getChildren().filter(e => e.active);
    const last = live[live.length - 1];
    if (last && last.isBoss) bosses++; else if (last && last.rare) rares++; else if (last) plain++;
  }
  window.config.RARE.chance = was;
  const out = { bosses, rares, plain, alive: s.spawner.aliveBosses,
                cap: window.config.BONE_RUN.maxBosses };
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('under a 고대 두개골:', JSON.stringify(skulled));
check('고대 두개골 sends a 우두머리 in place of a rare',
  skulled.bosses > 0, `${skulled.bosses} of 12 spawns`);
check('up to what the field can hold, and never a rare past that',
  skulled.bosses === skulled.cap && skulled.rares === 0 && skulled.plain > 0,
  `${skulled.bosses} 우두머리 (cap ${skulled.cap}), then ${skulled.plain} plain, ${skulled.rares} rares`);

// --- 6. a resumed run is still played by them ---
await run(`s.writeSave(); return 1;`);
const saved = await ev(`(() => {
  const raw = JSON.parse(localStorage.getItem('exiled-survivors:save:v1'));
  return raw.bones;
})()`);
check('the save remembers what the run was started with',
  JSON.stringify(saved) === JSON.stringify(['rib', 'rib', 'skull']),
  (saved ?? []).join(' + '));

await ev(`(() => {
  window.game.scene.getScene('GameScene').scene.start('GameScene',
    { save: JSON.parse(localStorage.getItem('exiled-survivors:save:v1')) });
  return 1;
})()`);
await sleep(2600);
const resumed = await run(`return { bonus: s.boneBonus };`);
check('and a resumed run plays by them without spending them again',
  resumed.bonus.enemyHpScale === 4 && resumed.bonus.raresBecomeBosses === true,
  `x${resumed.bonus.enemyHpScale} health`);

// --- 7. an empty drawer skips the screen entirely ---
await ev(`(() => {
  window.bones.reset();
  localStorage.removeItem('exiled-survivors:save:v1');
  window.game.scene.getScene('GameScene').scene.start('MenuScene');
  return 1;
})()`);
await sleep(1800);
await ev(`(() => {
  const s = window.game.scene.getScene('MenuScene');
  const i = s.menu.rows.findIndex(r => r.item.id === 'start');
  s.menu.selected = i; s.menu.refresh(); s.menu.rows[i].item.onSelect(); return i;
})()`);
await sleep(2600);
const skipped = await ev(`(() => ({
  bone: window.game.scene.isActive('BoneScene'),
  game: window.game.scene.isActive('GameScene'),
}))()`);
console.log('empty drawer:', JSON.stringify(skipped));
check('with nothing to spend, the screen is skipped rather than shown empty',
  skipped.bone === false && skipped.game === true,
  `BoneScene active=${skipped.bone}, GameScene active=${skipped.game}`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
