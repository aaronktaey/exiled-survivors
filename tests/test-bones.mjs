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
// A kill's own bonus — +10% a 속성 on a rare, +200% for a 우두머리 — raises
// both 뼈다귀 like any drop: the 갈비뼈 comes off any kill now, the same as
// a 혼돈의 구슬. Every number is read off the config.
const chances = await ev(`(() => {
  const c = window.config;
  const f = c.boneChanceFor;
  const B = c.BONES;
  const rare = (n) => 1 + n * c.RARE.dropBonusPerAffix;
  const boss = 1 + c.BOSS.dropBonus;
  return {
    base: B.skull.fromKill, ribBase: B.rib.fromKill, chaos: c.ORBS.chaos.chance, rare1: rare(1), rare3: rare(3), rare6: rare(6), boss,
    skullPlain: f(B.skull, { isBoss: false, bonus: 1 }),
    skullRare1: f(B.skull, { isBoss: false, bonus: rare(1) }),
    skullRare6: f(B.skull, { isBoss: false, bonus: rare(6) }),
    skullBoss: f(B.skull, { isBoss: true, bonus: boss }),
    ribPlain: f(B.rib, { isBoss: false, bonus: rare(3) }),
    ribBoss: f(B.rib, { isBoss: true, bonus: boss }),
  };
})()`);
console.log('chances:', JSON.stringify(chances));
const near = (a, b) => Math.abs(a - b) < 1e-12;
check('두개골 comes off an ordinary kill at its own chance',
  chances.skullPlain === chances.base && chances.base > 0, `${(chances.skullPlain * 100).toFixed(2)}%`);
check('and off a rare by its 속성, the same bonus as every drop',
  near(chances.skullRare1, chances.base * chances.rare1) && near(chances.skullRare6, chances.base * chances.rare6),
  `one 속성 ${(chances.skullRare1 * 100).toFixed(3)}%, six ${(chances.skullRare6 * 100).toFixed(3)}%`);
check('a 우두머리 raises it too, by the 우두머리 bonus',
  near(chances.skullBoss, chances.base * chances.boss), `${(chances.skullBoss * 100).toFixed(2)}%`);
// Its own chance (it was a 혼돈의 구슬's when it was made; the live values
// have parted them since).
check('갈비뼈 comes off any kill at its own chance, raised like every drop',
  chances.ribBase > 0 &&
    near(chances.ribPlain, chances.ribBase * chances.rare3) && near(chances.ribBoss, chances.ribBase * chances.boss),
  `${(chances.ribBase * 100).toFixed(2)}%, ${(chances.ribBoss * 100).toFixed(2)}% off a 우두머리`);

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
    const clip = window.config.AUDIO.drops[window.config.BONES[id].tier];
    out[id] = { name: d.nameplate.text, sound: window.__played[0], want: clip ? clip.key : undefined, texture: d.texture.key };
  }
  mgr.play = orig;
  s.combat.boneDrops.getChildren().forEach(d => d.active && d.collect());
  s.choosing = false;
  return out;
`);
console.log('on the ground:', JSON.stringify(drops));
check('each 뼈다귀 lands under its own name and its own sprite',
  drops.skull.name === '두개골' && drops.rib.name === '갈비뼈' &&
    drops.skull.texture !== drops.rib.texture,
  `${drops.skull.name} / ${drops.rib.name}`);
// 0.111: each tier's own clip (AUDIO.drops), read off the table — not a name here.
check('and sounds like the rarity it is',
  Object.values(drops).every((d) => d.sound && d.sound === d.want),
  Object.entries(drops).map(([id, d]) => `${id} ${d.sound} (want ${d.want})`).join(' / '));

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
  const shown = s.children.list.filter((o) => o.visible && o.getBounds);
  return { rows: s.choices.map(i => i.id), applied: s.applied,
           slots: s.slotIcons.map((i) => i.visible), back: !!s.backButton,
           summary: s.summary.text, max: window.config.BONE_RUN.maxApplied,
           bottom: Math.round(Math.max(...shown.map((o) => o.getBounds().bottom))), canvas: s.scale.height };
`);
console.log('opened:', JSON.stringify(opened));
check('게임 시작 stops at the 뼈다귀 screen when the drawer has any',
  opened.rows.includes('skull') && opened.rows.includes('rib') &&
    opened.rows.includes('start') && opened.back,
  opened.rows.join(' / '));
check('and draws a slot per 뼈다귀 a run can take, empty to begin with',
  opened.slots.length === opened.max && opened.slots.every((shown) => !shown),
  `${opened.max} slots`);
check('with nothing applied, it says so',
  opened.applied.length === 0 && opened.summary.includes('아무것도'), opened.summary);
check('and none of it runs off the bottom',
  opened.bottom <= opened.canvas, `${opened.bottom} of ${opened.canvas}`);
await shot('bones-01-open');

// --- 4. three slots, and what stacks ---
const applied = await bs(`
  s.focus('rib');
  const pick = (id) => { const c = s.choices.find(i => i.id === id); if (c.enabled()) c.onSelect(); };
  pick('rib');
  pick('rib');
  pick('skull');
  // A fourth would be one too many, and a second 두개골 does nothing anyway.
  pick('rib');
  pick('skull');
  return { applied: s.applied, slots: s.slotIcons.map((i) => i.visible ? i.texture.key : ''),
           summary: s.summary.text, detail: s.detail.text,
           ribOpen: s.choices.find(i => i.id === 'rib').enabled(),
           skullOpen: s.choices.find(i => i.id === 'skull').enabled(),
           held: JSON.parse(JSON.stringify(window.bones.value)) };
`);
console.log('applied:', JSON.stringify(applied));
check('a run takes three and no more',
  applied.applied.length === 3 && applied.ribOpen === false,
  applied.applied.join(' + '));
check('갈비뼈 stacks, 두개골 does not',
  applied.applied.filter((b) => b === 'rib').length === 2 &&
    applied.applied.filter((b) => b === 'skull').length === 1 &&
    applied.skullOpen === false,
  applied.applied.join(' + '));
check('the slots show what is in them, in the order it went in',
  applied.slots.join(',') === 'tex-bone-rib,tex-bone-rib,tex-bone-skull',
  applied.slots.join(' | '));
check('and the card being pointed at says what it does',
  applied.detail.includes('갈비뼈') && applied.detail.includes('%'), applied.detail);
check('and the total compounds rather than adding up',
  applied.summary.includes('+300%') && applied.summary.includes('+125%') &&
    applied.summary.includes('우두머리'),
  applied.summary);
check('nothing is spent until the run starts',
  applied.held.rib === 4 && applied.held.skull === 2,
  `${applied.held.rib} 갈비뼈 and ${applied.held.skull} 두개골 still in the drawer`);
await shot('bones-02-applied');

// --- 5. starting spends them, and the run plays by them ---
// A slot pressed gives its 뼈다귀 back, and the ones after it move up.
const tookOut = await bs(`
  s.takeOut(0); const after = [...s.applied];
  s.choices.find(i => i.id === 'rib').onSelect();
  return { after, again: [...s.applied] };
`);
check('pressing a slot takes that one back out',
  tookOut.after.join(',') === 'rib,skull' && tookOut.again.join(',') === 'rib,skull,rib',
  JSON.stringify(tookOut));
await bs(`s.choices.find(i => i.id === 'start').onSelect(); return 1;`);
await sleep(2600);
const started = await run(`
  return { bonus: s.boneBonus, held: JSON.parse(JSON.stringify(window.bones.value)) };
`);
console.log('started:', JSON.stringify(started));
check('starting takes them out of the drawer',
  started.held.rib === 2 && started.held.skull === 1,
  `${started.held.rib} 갈비뼈 and ${started.held.skull} 두개골 left`);
check('and the run is played on what they add up to',
  started.bonus.enemyHpScale === 4 && Math.abs(started.bonus.dropScale - 2.25) < 1e-9 &&
    started.bonus.raresBecomeBosses === true,
  `x${started.bonus.enemyHpScale} health, x${started.bonus.dropScale} drops`);

const ribbed = await run(`
  s.choosing = true;
  s.spawner.clear();
  const e = s.spawner.group.get(600, 600);
  e.spawn(600, 600, s.player, 'grunt', undefined, false, s.spawner.hpScale);
  const base = window.config.ENEMY_KINDS.grunt.maxHp * window.config.BALANCE.enemyHpScale * window.config.ENEMY_DAMPEN.hp;
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
console.log('under a 두개골:', JSON.stringify(skulled));
check('두개골 sends a 우두머리 in place of a rare',
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
  JSON.stringify([...(saved ?? [])].sort()) === JSON.stringify(['rib', 'rib', 'skull']),
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

// --- 6b. 다시하기 after a death stops at the 뼈다귀 screen too ---
const overAndRetry = async () => {
  await run(`
    s.player.invulnerableUntil = 0;
    s.player.takeDamage(99999);
    return 1;
  `);
  await sleep(1300);
  return ev(`(() => {
    const s = window.game.scene.getScene('GameOverScene');
    if (!window.game.scene.isActive('GameOverScene')) return { over: false };
    s.menu.items.find(i => i.id === 'retry').onSelect();
    return { over: true };
  })()`);
};
await ev(`(() => { window.bones.reset(); window.bones.add('rib'); window.bones.add('rib'); return 1; })()`);
const retry = await overAndRetry();
await sleep(700);
const retryScreen = await ev(`(() => ({
  bone: window.game.scene.isActive('BoneScene'),
  over: window.game.scene.isActive('GameOverScene') || window.game.scene.isPaused('GameOverScene'),
  rows: window.game.scene.getScene('BoneScene').choices?.map(i => i.id),
}))()`);
console.log('retry:', JSON.stringify({ retry, retryScreen }));
check('다시하기 opens the 뼈다귀 screen when the drawer has any',
  retry.over === true && retryScreen.bone === true && retryScreen.rows?.includes('rib'),
  `BoneScene active=${retryScreen.bone}, rows ${retryScreen.rows?.join(', ')}`);
await shot('bones-03-retry');

// Backing out of it goes back to the end screen, nothing spent.
await bs(`s.backButton.press(); return 1;`);
await sleep(600);
const backed = await ev(`(() => ({
  bone: window.game.scene.isActive('BoneScene'),
  over: window.game.scene.isActive('GameOverScene'),
  rib: window.bones.count('rib'),
}))()`);
check('backing out of it returns to the end screen with nothing spent',
  backed.bone === false && backed.over === true && backed.rib === 2,
  `BoneScene=${backed.bone}, GameOverScene=${backed.over}, 갈비뼈 ${backed.rib}`);

// And picking one starts the next run on it.
await ev(`(() => {
  window.game.scene.getScene('GameOverScene').menu.items.find(i => i.id === 'retry').onSelect();
  return 1;
})()`);
await sleep(700);
await bs(`
  s.choices.find(i => i.id === 'rib').onSelect();
  s.choices.find(i => i.id === 'start').onSelect();
  return 1;
`);
await sleep(2600);
const retried = await run(`return { bonus: s.boneBonus, over: s.over, rib: window.bones.count('rib'),
  gameOver: window.game.scene.isActive('GameOverScene') };`);
console.log('retried:', JSON.stringify(retried));
check('and starting from it plays the new run on what was picked',
  retried.over === false && retried.gameOver === false && retried.rib === 1 &&
    retried.bonus.enemyHpScale > 1,
  `x${retried.bonus.enemyHpScale} health, ${retried.rib} 갈비뼈 left`);

// With an empty drawer, 다시하기 goes straight into the next run.
await ev(`(() => { window.bones.reset(); return 1; })()`);
await overAndRetry();
await sleep(2600);
const straight = await ev(`(() => ({
  bone: window.game.scene.isActive('BoneScene'),
  game: window.game.scene.isActive('GameScene'),
  over: window.game.scene.getScene('GameScene').over,
}))()`);
check('with an empty drawer, 다시하기 goes straight into the next run',
  straight.bone === false && straight.game === true && straight.over === false,
  `BoneScene=${straight.bone}, GameScene=${straight.game}, over=${straight.over}`);

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

// --- 0.136: 꼬리뼈 — every 우두머리 a 키메라 ---
const tail = await cdp.evaluate(`(() => {
  const C = window.config, s = window.game.scene.getScene('GameScene');
  const spec = C.BONES.tailbone;
  const was = s.boneBonus;
  const kinds = {};
  try {
    s.spawner.clear();
    s.boneBonus = C.boneBonusFor(['tailbone']);
    kinds.clock = s.spawner.spawnBoss()?.kind;
    s.spawner.clear();
    // A 제단's 우두머리 too.
    const p = s.player;
    s.spawner.summon(p.x + 300, p.y, 'bosses');
    kinds.altar = s.spawner.group.getChildren().filter((e) => e.active).map((e) => e.kind);
    s.spawner.clear();
    // And a 두개골's, up to its ceiling, with the 꼬리뼈 beside it.
    s.boneBonus = C.boneBonusFor(['skull', 'tailbone']);
    // Through place(), the one way every rare spawn goes.
    for (let i = 0; i < C.BONE_RUN.maxBosses + 3; i++) {
      const e = s.spawner.group.get(p.x + 200, p.y);
      s.spawner.place(e, p.x + 200, p.y + i * 30, 'grunt', true);
    }
    const field = s.spawner.group.getChildren().filter((e) => e.active).map((e) => e.kind);
    kinds.skull = { chimeras: field.filter((k) => k === 'chimera').length, bosses: field.filter((k) => k === 'boss').length };
    s.spawner.clear();
    // Without it, a 우두머리 is a 우두머리.
    s.boneBonus = C.boneBonusFor([]);
    kinds.plain = s.spawner.spawnBoss()?.kind;
    s.spawner.clear();
  } finally {
    s.boneBonus = was;
  }
  return { stackable: spec.stackable, fromKill: spec.fromKill, skull: C.BONES.skull.fromKill, max: C.BONE_RUN.maxBosses,
           texture: s.textures.exists(spec.texture), kinds };
})()`);
console.log('꼬리뼈:', JSON.stringify(tail));
check('꼬리뼈: one a run, as common as a 두개골, with a picture of its own',
  tail.stackable === false && tail.fromKill === tail.skull && tail.texture === true, JSON.stringify(tail));
check('under it every 우두머리 is a 키메라 — the clock’s, a 제단’s, and a 두개골’s up to its ceiling',
  tail.kinds.clock === 'chimera' && tail.kinds.altar.length > 0 && tail.kinds.altar.every((k) => k === 'chimera') &&
    tail.kinds.skull.chimeras === tail.max && tail.kinds.skull.bosses === 0,
  JSON.stringify(tail.kinds));
check('and without it a 우두머리 is still a 우두머리', tail.kinds.plain === 'boss', JSON.stringify(tail.kinds));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
