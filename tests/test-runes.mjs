import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 룬 (0.74): a run's first skill out of every skill, with a way back to the
// title; the main skill's 강화 슬롯; 룬 and 룬 끌 dropping in place of skills;
// the 룬 screen setting them; what a 룬 does to its skill; and the passive
// tree gone from the title.

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
const active = (key) => ev(`(() => window.game.scene.isActive('${key}'))()`);

// --- 1. the title: no passive tree, and its old record cleared ---
await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(1200);
await ev(`(() => { localStorage.clear(); localStorage.setItem('exiled-survivors:passives:v1', '{"version":3,"allocated":["warrior.s1"]}');
  localStorage.setItem('exiled-survivors:bones:v1', JSON.stringify({ rib: 2 })); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4200);
const title = await scene('MenuScene', `return { icons: s.icons.views.map((v) => v.button.id), tree: localStorage.getItem('exiled-survivors:passives:v1') };`);
check('the title has no 패시브 any more, and the old tree is cleared', !title.icons.includes('passives') && title.tree === null, JSON.stringify(title));

// --- 2. the first skill: every skill, and back to the title ---
const startRun = async () => {
  await ev(`(() => { window.config.SKILL_PICK.atRunStart = true;
    window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null, bones: ['rib'], startPick: true }); return 1; })()`);
  await sleep(1500);
};
await ev(`(() => { window.bones.spend(['rib']); return 1; })()`);
await startRun();
const pick = await scene('SkillPickScene', `return { options: s.payload.options, all: Object.keys(window.config.SKILL_BASE),
  back: typeof s.payload.onBack === 'function', columns: s.columns,
  inside: s.cards.every((c) => c.panel.getBounds().right <= s.scale.width && c.panel.getBounds().bottom <= s.scale.height) };`);
check('a run opens on every skill to choose from', JSON.stringify([...pick.options].sort()) === JSON.stringify([...pick.all].sort()), JSON.stringify(pick.options));
check('laid out in rows that fit the screen, with a way back', pick.back && pick.columns > 1 && pick.inside, JSON.stringify(pick));
await shot('runes-01-pick');
const ribsBefore = await ev(`(() => window.bones.count('rib'))()`);
await scene('SkillPickScene', `s.back(); return 1;`);
await sleep(1500);
const backed = await ev(`(() => ({ menu: window.game.scene.isActive('MenuScene'), game: window.game.scene.isActive('GameScene'),
  ribs: window.bones.count('rib'), save: localStorage.getItem('exiled-survivors:save:v1') }))()`);
check('돌아가기 goes back to the title, with no run saved', backed.menu && !backed.game && backed.save === null, JSON.stringify(backed));
check('and the 뼈다귀 put in come back', backed.ribs === ribsBefore + 1, `${ribsBefore} -> ${backed.ribs}`);

// --- 3. the main skill comes with its slot ---
await startRun();
await sleep(400);
await scene('SkillPickScene', `s.pick(s.payload.options.indexOf('fireball')); return 1;`);
await sleep(600);
const fresh = await run(`
  s.player.setInvulnerable(true); s.spawner.clear(); s.spawner.update = () => {};
  const c = window.config;
  return { main: s.mainSkill, slots: s.kit.socketsOf('fireball').length, other: s.kit.socketsOf('meleeStrike').length,
           want: c.RUNE_SLOTS.main, held: s.skillsHeld };
`);
check('the skill taken is the main skill, with RUNE_SLOTS.main 강화 슬롯', fresh.main === 'fireball' && fresh.slots === fresh.want && fresh.other === 0,
  JSON.stringify(fresh));

// --- 4. 룬 on the ground, and picked up ---
const picked = await run(`
  const p = s.player, c = s.combat;
  c.dropRuneAt(p.x + 30, p.y, 'power');
  const d = c.runeDrops.getChildren().find((x) => x.active && x.rune === 'power');
  const label = d.nameplate.text;
  c.onRuneTouch(p, d);
  return { label, held: s.kit.runeCount('power'), toast: s.toasts.lines.slice(-1)[0] ?? '',
           over: s.damageNumbers.pool.some((f) => f.remainingMs > 0 && f.text.text.includes('위력의 룬')) };
`);
check('a 룬 lies under its name and is taken by walking over it', picked.label === '위력의 룬' && picked.held === 1, JSON.stringify(picked));
check('and the pickup is said, in a toast and over the survivor', /위력의 룬/.test(picked.toast) && picked.over, JSON.stringify(picked));

// No skill drops in a run; a 우두머리 leaves a 룬 for certain.
const boss = await run(`
  const c = window.config, before = s.combat.runeDrops.countActive(true);
  const b = s.spawner.spawnBoss(); s.combat.hit(b, 1e9);
  const out = { runes: s.combat.runeDrops.countActive(true) - before, skillGroups: 'skillDrops' in s.combat || 'randomSkillDrops' in s.combat };
  for (const g of [s.combat.runeDrops, s.combat.chiselDrops, s.combat.gearDrops, s.combat.gems, s.combat.orbDrops, s.combat.altars, s.combat.boneDrops])
    g.getChildren().forEach((d) => d.active && d.collect());
  s.pendingChoices.length = 0;
  return out;
`);
check('nothing drops a skill any more, and a 우두머리 always leaves a 룬', boss.runes >= 1 && boss.skillGroups === false, JSON.stringify(boss));

// --- 5. setting it in the main skill's slot ---
const before = await run(`return { damage: s.damageOf('fireball'), sheet: s.mods.runes.fireball ?? null };`);
await run(`window.game.scene.getScene('GameScene').scene.pause(); s.scene.launch('RuneScene', { kit: s.kit, skills: s.skillsHeld, onClose: () => s.scene.resume() }); return 1;`);
await sleep(700);
await shot('runes-02-screen-empty');
const setIt = await scene('RuneScene', `
  const ok = s.setRune('power');
  return { ok, held: s.payload.kit.runeCount('power'), slot: s.payload.kit.socketsOf('fireball')[0], note: s.status.text };
`);
check('the 룬 screen sets a held 룬 in the slot picked', setIt.ok && setIt.held === 0 && setIt.slot === 'power', JSON.stringify(setIt));
await sleep(200);
await shot('runes-03-screen-set');
const after = await run(`
  const c = window.config, v = c.RUNES.power.mods[0].value;
  return { damage: s.damageOf('fireball'), scale: s.mods.runes.fireball?.scale('damage'), want: 1 + v / 100 };
`);
check('and the skill takes it at once: 위력 raises its damage by the 룬’s share', before.sheet === null && Math.abs(after.scale - after.want) < 1e-9 &&
  after.damage > before.damage, `${before.damage} -> ${after.damage}, ×${after.scale}`);
const out = await scene('RuneScene', `
  const ok = s.takeOut();
  return { ok, held: s.payload.kit.runeCount('power'), slot: s.payload.kit.socketsOf('fireball')[0], note: s.status.text };
`);
check('빼기 takes it back out, among the 룬 held', out.ok && out.held === 1 && out.slot === null, JSON.stringify(out));
const wrong = await scene('RuneScene', `
  s.payload.kit.addRune('chain');
  s.setRune('chain');
  return { note: s.status.text, slot: s.payload.kit.socketsOf('fireball')[0] };
`);
check('a 룬 that does nothing for the skill is still set, and says so', wrong.slot === 'chain' && /효과가 없습니다/.test(wrong.note), JSON.stringify(wrong));
await scene('RuneScene', `s.takeOut(); s.close(); return 1;`);
await sleep(300);

// --- 6. what the 룬 do ---
const effects = await run(`
  const k = s.kit;
  const shots0 = s.projectilesOf('fireball').shots;
  const crit0 = s.combat.hooks.critChance('fireball');
  const multi0 = s.combat.hooks.critMultiplier('fireball');
  k.ensureSlots('fireball', 3);
  for (const id of ['split', 'precision', 'brutality']) k.addRune(id);
  k.socket('fireball', 0, 'split'); k.socket('fireball', 1, 'precision'); k.socket('fireball', 2, 'brutality');
  const c = window.config;
  const out = { shots0, shots1: s.projectilesOf('fireball').shots, crit0, crit1: s.combat.hooks.critChance('fireball'),
    melee: s.combat.hooks.critChance('meleeStrike'), multi0, multi1: s.combat.hooks.critMultiplier('fireball'),
    wantCrit: Math.min(1, crit0 * (1 + c.RUNES.precision.mods[0].value / 100) / (1) ),
    wantMulti: multi0 + c.RUNES.brutality.mods[0].value / 100 };
  for (let i = 0; i < 3; i++) k.unsocket('fireball', i);
  return out;
`);
check('분열 adds a shot to the skill it is in', effects.shots1 === effects.shots0 + 1, JSON.stringify(effects));
check('정밀 and 잔혹 raise that skill’s crits, and no other skill’s',
  effects.crit1 > effects.crit0 && Math.abs(effects.multi1 - effects.wantMulti) < 1e-9 && effects.melee === effects.crit0, JSON.stringify(effects));

// --- 7. 룬 끌 ---
await run(`s.combat.dropChiselAt(s.player.x + 30, s.player.y); const d = s.combat.chiselDrops.getChildren().find((x) => x.active);
  s.combat.onChiselTouch(s.player, d); return 1;`);
await sleep(700);
const chisel = await scene('RuneChiselScene', `return { rows: s.rows.map((r) => ({ skill: r.skill, open: r.open })), held: window.game.scene.getScene('GameScene').choosing };`);
check('a 룬 끌 picked up asks which skill gets the slot, holding the run', (await active('RuneChiselScene')) && chisel.held && chisel.rows[0]?.skill === 'fireball',
  JSON.stringify(chisel));
await shot('runes-04-chisel');
await sleep(300);
await scene('RuneChiselScene', `s.choose(0); return 1;`);
await sleep(300);
const added = await run(`return { slots: s.kit.socketsOf('fireball').length, choosing: s.choosing, toast: s.toasts.lines.slice(-1)[0] ?? '' };`);
check('and taking one adds a 강화 슬롯 to it', added.slots === 4 && !added.choosing && /\+1/.test(added.toast), JSON.stringify(added));
const full = await run(`
  const c = window.config;
  return { canAdd: s.kit.canAddSlot('fireball'), max: c.RUNE_SLOTS.max, slots: s.kit.socketsOf('fireball').length,
           wanted: s.combat.hooks.chiselWanted() };
`);
check('a skill stops at RUNE_SLOTS.max, and with every skill full no 룬 끌 falls', full.slots === full.max && !full.canAdd && full.wanted === false,
  JSON.stringify(full));

// --- 8. a saved run carries its 룬 and slots ---
const saved = await run(`
  s.kit.addRune('haste'); s.kit.socket('fireball', 1, 'haste'); s.kit.addRune('pierce');
  s.writeSave();
  const save = window.openRecord('exiled-survivors:save:v1', localStorage.getItem('exiled-survivors:save:v1')).value;
  window.__save = save;
  s.scene.restart({ save });
  return { sockets: save.kit.sockets, runes: save.kit.runes };
`);
await sleep(1500);
const resumed = await run(`return { sockets: s.kit.socketsOf('fireball'), pierce: s.kit.runeCount('pierce'), sheet: !!s.mods.runes.fireball };`);
check('a saved run comes back with its 강화 슬롯, what is set in them and the 룬 held',
  JSON.stringify(resumed.sockets) === JSON.stringify(saved.sockets.fireball) && resumed.pierce === 1 && resumed.sheet, JSON.stringify({ saved, resumed }));
await run(`localStorage.removeItem('exiled-survivors:save:v1'); return 1;`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
