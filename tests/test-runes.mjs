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
  c.dropRuneAt(p.x + 30, p.y, 'split');
  const d = c.runeDrops.getChildren().find((x) => x.active && x.rune === 'split');
  const label = d.nameplate.text;
  c.onRuneTouch(p, d);
  return { label, held: s.kit.runeCount('split'), toast: s.toasts.lines.slice(-1)[0] ?? '',
           over: s.damageNumbers.pool.some((f) => f.remainingMs > 0 && f.text.text.includes('분열의 룬')),
           gone: ['power', 'haste', 'precision', 'brutality'].filter((id) => id in window.config.RUNES),
           kinds: Object.keys(window.config.RUNES) };
`);
check('a 룬 lies under its name and is taken by walking over it', picked.label === '분열의 룬' && picked.held === 1, JSON.stringify(picked));
check('and the pickup is said, in a toast and over the survivor', /분열의 룬/.test(picked.toast) && picked.over, JSON.stringify(picked));
check('위력 · 신속 · 정밀 · 잔혹 are gone; 반복 and 포격 are there (0.75)',
  picked.gone.length === 0 && picked.kinds.includes('repeat') && picked.kinds.includes('bombard'), picked.kinds.join(','));

// No skill drops in a run; a 우두머리 leaves a 룬 for certain.
const boss = await run(`
  const before = s.combat.runeDrops.countActive(true);
  const b = s.spawner.spawnBoss(); s.combat.hit(b, 1e9);
  const out = { runes: s.combat.runeDrops.countActive(true) - before, skillGroups: 'skillDrops' in s.combat || 'randomSkillDrops' in s.combat };
  for (const g of [s.combat.runeDrops, s.combat.chiselDrops, s.combat.gearDrops, s.combat.gems, s.combat.orbDrops, s.combat.altars, s.combat.boneDrops])
    g.getChildren().forEach((d) => d.active && d.collect());
  s.pendingChoices.length = 0;
  return out;
`);
check('nothing drops a skill any more, and a 우두머리 always leaves a 룬', boss.runes >= 1 && boss.skillGroups === false, JSON.stringify(boss));

// --- 5. setting it in the main skill's slot ---
const before = await run(`return { damage: s.damageOf('fireball'), sheet: s.mods.runes.fireball ?? null, shots: s.projectilesOf('fireball').shots };`);
await run(`window.game.scene.getScene('GameScene').scene.pause(); s.scene.launch('RuneScene', { kit: s.kit, skills: s.skillsHeld, onClose: () => s.scene.resume() }); return 1;`);
await sleep(700);
await shot('runes-02-screen-empty');
const setIt = await scene('RuneScene', `
  const ok = s.setRune('split');
  return { ok, held: s.payload.kit.runeCount('split'), slot: s.payload.kit.socketsOf('fireball')[0], note: s.status.text };
`);
check('the 룬 screen sets a held 룬 in the slot picked', setIt.ok && setIt.held === 0 && setIt.slot === 'split', JSON.stringify(setIt));
await sleep(200);
await shot('runes-03-screen-set');
const after = await run(`
  const c = window.config, mods = c.RUNES.split.mods;
  return { damage: s.damageOf('fireball'), scale: s.mods.runes.fireball?.scale('damage'), shots: s.projectilesOf('fireball').shots,
           want: 1 + mods.find((m) => m.stat === 'damage').value / 100, more: mods.find((m) => m.stat === 'projectileCount').value };
`);
check('and the skill takes it at once: 분열 throws one more, for less damage each',
  before.sheet === null && after.shots === before.shots + after.more && Math.abs(after.scale - after.want) < 1e-9 && after.damage < before.damage,
  `${before.shots} -> ${after.shots} shots, ${before.damage} -> ${after.damage} (×${after.scale})`);
const out = await scene('RuneScene', `
  const ok = s.takeOut();
  return { ok, held: s.payload.kit.runeCount('split'), slot: s.payload.kit.socketsOf('fireball')[0], note: s.status.text };
`);
check('빼기 takes it back out, among the 룬 held', out.ok && out.held === 1 && out.slot === null, JSON.stringify(out));
const wrong = await scene('RuneScene', `
  s.payload.kit.addRune('bombard');
  s.payload.kit.addRune('chain');
  return 1;
`);
void wrong;
await scene('RuneScene', `s.close(); return 1;`);
await sleep(300);

// --- 6. what each 룬 does ---
// Each is set in the main skill's one slot in turn, its effect read, and taken out again.
const tryRune = (rune, body) => run(`
  const c = window.config, k = s.kit;
  k.addRune('${rune}'); k.socket('fireball', 0, '${rune}');
  let out;
  try { out = (() => { ${body} })(); } finally { k.unsocket('fireball', 0); }
  return out;
`);
const fan = await run(`
  s.spawner.clear();
  const p = s.player, k = s.kit;
  k.addRune('split'); k.socket('fireball', 0, 'split');
  const e = s.spawner.group.get(p.x + 80, p.y); e.spawn(p.x + 80, p.y, p, 'brute'); e.setVelocity(0, 0); e.target = undefined;
  const w = s.weapons.find((x) => x.definition.id === 'fireball');
  w.projectiles.getChildren().forEach((x) => x.active && x.despawn());
  w.castAtNearest(s.contextFor('fireball'));
  const shots = w.projectiles.getChildren().filter((x) => x.active).map((x) => x.rotation);
  w.projectiles.getChildren().forEach((x) => x.active && x.despawn());
  k.unsocket('fireball', 0);
  s.spawner.clear();
  return { shots, aim: Math.atan2(e.y - p.y, e.x - p.x), spread: window.config.WEAPON.extraShotSpread };
`);
const mean = fan.shots.reduce((a, b) => a + b, 0) / Math.max(1, fan.shots.length);
check('extra shots fan out round the aim, together, instead of going for other enemies',
  fan.shots.length === 2 && Math.abs(mean - fan.aim) < 0.01 && Math.abs(Math.abs(fan.shots[0] - fan.shots[1]) - fan.spread) < 0.01,
  JSON.stringify(fan));

const repeat = await run(`
  s.spawner.clear();
  const p = s.player, k = s.kit, c = window.config;
  k.addRune('repeat'); k.socket('fireball', 0, 'repeat');
  const e = s.spawner.group.get(p.x + 80, p.y); e.spawn(p.x + 80, p.y, p, 'brute'); e.setVelocity(0, 0); e.target = undefined;
  e.hp = e.maxHp = 1e9;
  const w = s.weapons.find((x) => x.definition.id === 'fireball');
  w.projectiles.getChildren().forEach((x) => x.active && x.despawn());
  const ctx = { ...s.contextFor('fireball'), cooldownMs: 1e9 };
  w.sinceShotMs = 1e9;
  const live = () => w.projectiles.getChildren().filter((x) => x.active).length;
  w.update(1, ctx); const one = live();
  const gap = c.RUNE_REPEAT.gapMs;
  w.update(gap, ctx); const two = live();
  w.update(gap, ctx); const three = live();
  w.update(gap, ctx); const four = live();
  const scale = s.mods.runes.fireball.scale('damage');
  w.projectiles.getChildren().forEach((x) => x.active && x.despawn());
  k.unsocket('fireball', 0);
  s.spawner.clear();
  const mods = c.RUNES.repeat.mods;
  return { one, two, three, four, scale, casts: 1 + mods.find((m) => m.stat === 'repeatCount').value,
           want: 1 + mods.find((m) => m.stat === 'damage').value / 100 };
`);
check('반복 casts the skill three times, a gap apart, and no more', repeat.one === 1 && repeat.two === 2 && repeat.three === 3 && repeat.four === 3 && repeat.casts === 3,
  JSON.stringify(repeat));
check('for less damage each', Math.abs(repeat.scale - repeat.want) < 1e-9, JSON.stringify(repeat));

const pierce = await run(`
  s.spawner.clear();
  const p = s.player, k = s.kit, c = window.config;
  k.addRune('pierce'); k.socket('fireball', 0, 'pierce');
  const ctx = s.contextFor('fireball');
  const w = s.weapons.find((x) => x.definition.id === 'fireball');
  const shot = w.projectiles.get();
  shot.launch(p.x, p.y, 0, { ...w.specFor(ctx), chain: 0, pierceKeep: ctx.pierceKeep });
  const at = (dx) => { const e = s.spawner.group.get(p.x + dx, p.y); e.spawn(p.x + dx, p.y, p, 'brute'); e.hp = e.maxHp = 1e9; return e; };
  const d0 = shot.damage;
  s.combat.onProjectileHit(shot, at(100)); const d1 = shot.damage;
  s.combat.onProjectileHit(shot, at(140)); const d2 = shot.damage;
  const alive = shot.active;
  shot.despawn(); k.unsocket('fireball', 0); s.spawner.clear();
  const decay = c.RUNES.pierce.mods.find((m) => m.stat === 'pierceDecay').value / 100;
  return { d0, d1, d2, alive, keep: 1 - decay, pierce: ctx.pierceCount };
`);
check('관통 lets a fireball through two more, each costing a compounding share of its damage',
  pierce.pierce >= 2 && pierce.alive && Math.abs(pierce.d1 - pierce.d0 * pierce.keep) < 1e-6 && Math.abs(pierce.d2 - pierce.d0 * pierce.keep ** 2) < 1e-6,
  JSON.stringify(pierce));

const chain = await run(`
  s.spawner.clear();
  const p = s.player, k = s.kit;
  k.addRune('chain'); k.socket('fireball', 0, 'chain');
  const ctx = s.contextFor('fireball');
  const w = s.weapons.find((x) => x.definition.id === 'fireball');
  const shot = w.projectiles.get();
  shot.launch(p.x, p.y, 0, { ...w.specFor(ctx), chain: ctx.chainCount, pierceKeep: 1 });
  const a = s.spawner.group.get(p.x + 100, p.y); a.spawn(p.x + 100, p.y, p, 'brute'); a.hp = a.maxHp = 1e9;
  const b = s.spawner.group.get(p.x + 100, p.y + 150); b.spawn(p.x + 100, p.y + 150, p, 'brute'); b.hp = b.maxHp = 1e9;
  shot.setPosition(p.x + 100, p.y);
  s.combat.onProjectileHit(shot, a);
  const out = { alive: shot.active, heading: Math.atan2(shot.body.velocity.y, shot.body.velocity.x), want: Math.atan2(150, 0), left: shot.chainLeft };
  shot.despawn(); k.unsocket('fireball', 0); s.spawner.clear();
  return out;
`);
check('연쇄 on a fireball: a shot that has hit turns to the next enemy', chain.alive && Math.abs(chain.heading - chain.want) < 0.05 && chain.left === 0,
  JSON.stringify(chain));

const reach = await run(`
  const base = s.contextFor('fireball').range;
  const k = s.kit, c = window.config;
  const withRune = (rune) => { k.addRune(rune); k.socket('fireball', 0, rune); const r = s.contextFor('fireball').range; k.unsocket('fireball', 0); return r; };
  return { base, linger: withRune('linger'), velocity: withRune('velocity'),
           dur: 1 + c.RUNES.linger.mods[0].value / 100, speed: 1 + c.RUNES.velocity.mods[0].value / 100 };
`);
check('지속 and 가속 both carry a thrown skill further',
  Math.abs(reach.linger / reach.base - reach.dur) < 1e-6 && Math.abs(reach.velocity / reach.base - reach.speed) < 1e-6, JSON.stringify(reach));

// The 확장의 룬 on 공허구체: the orbs themselves grow.
const orbs = await run(`
  s.onSkillCollected('voidOrb');
  s.pendingChoices.length = 0;
  const k = s.kit, w = s.weapons.find((x) => x.definition.id === 'voidOrb');
  k.ensureSlots('voidOrb', 1);
  w.update(16, s.contextFor('voidOrb'));
  const small = w.active[0].displayWidth;
  k.addRune('expanse'); k.socket('voidOrb', 0, 'expanse');
  w.update(16, s.contextFor('voidOrb'));
  const big = w.active[0].displayWidth;
  k.unsocket('voidOrb', 0);
  return { small, big, want: Math.sqrt(1 + window.config.RUNES.expanse.mods[0].value / 100) };
`);
check('확장 on 공허구체 makes the orbs bigger', Math.abs(orbs.big / orbs.small - orbs.want) < 0.01, JSON.stringify(orbs));

// 포격: turrets cast it, set down every TURRET.everyMs, gone after TURRET.lifeMs.
const bombardOn = await run(`
  s.spawner.clear();
  const k = s.kit;
  k.addRune('bombard'); k.socket('fireball', 0, 'bombard');
  window.__at = { x: s.player.x, y: s.player.y, t: s.time.now };
  return { scale: s.mods.runes.fireball.scale('damage'), want: 1 + window.config.RUNES.bombard.mods.find((m) => m.stat === 'damage').value / 100 };
`);
await sleep(700);
const placed = await run(`return { turrets: s.liveTurrets.map((t) => ({ skill: t.skill, x: Math.round(t.body.x), y: Math.round(t.body.y), left: t.leftMs })),
  at: window.__at, life: window.config.TURRET.lifeMs };`);
check('포격 sets a turret down where the survivor stands, casting that skill',
  placed.turrets.length >= 1 && placed.turrets[0].skill === 'fireball' && Math.abs(placed.turrets[0].x - placed.at.x) < 2 && placed.turrets[0].left <= placed.life,
  JSON.stringify(placed));
check('for less damage', Math.abs(bombardOn.scale - bombardOn.want) < 1e-9, JSON.stringify(bombardOn));
await shot('runes-05-turret');
const off = await run(`s.kit.unsocket('fireball', 0); return 1;`);
void off;
await sleep(300);
const gone = await run(`return s.liveTurrets.length;`);
check('and its turrets go when the 룬 comes out', gone === 0, `${gone}`);

// --- 7. 룬 끌 ---
await run(`s.combat.dropChiselAt(s.player.x + 30, s.player.y); const d = s.combat.chiselDrops.getChildren().find((x) => x.active);
  s.combat.onChiselTouch(s.player, d); return 1;`);
await sleep(700);
const chisel = await scene('RuneChiselScene', `return { rows: s.rows.map((r) => ({ skill: r.skill, open: r.open })), held: window.game.scene.getScene('GameScene').choosing };`);
check('a 룬 끌 picked up asks which skill gets the slot, holding the run', (await active('RuneChiselScene')) && chisel.held && chisel.rows[0]?.skill === 'fireball',
  JSON.stringify(chisel));
await shot('runes-04-chisel');
const slotsBefore = await run(`return s.kit.socketsOf('fireball').length;`);
await sleep(300);
await scene('RuneChiselScene', `s.choose(0); return 1;`);
await sleep(300);
const added = await run(`return { slots: s.kit.socketsOf('fireball').length, choosing: s.choosing, toast: s.toasts.lines.slice(-1)[0] ?? '' };`);
check('and taking one adds a 강화 슬롯 to it', added.slots === slotsBefore + 1 && !added.choosing && /\+1/.test(added.toast), JSON.stringify(added));
const full = await run(`
  const c = window.config;
  // Every skill held filled to the top.
  for (const skill of s.skillsHeld) while (s.kit.addSlot(skill)) {}
  return { canAdd: s.kit.canAddSlot('fireball'), max: c.RUNE_SLOTS.max, slots: s.kit.socketsOf('fireball').length,
           wanted: s.combat.hooks.chiselWanted() };
`);
check('a skill stops at RUNE_SLOTS.max, and with every skill full no 룬 끌 falls', full.slots === full.max && !full.canAdd && full.wanted === false,
  JSON.stringify(full));

// --- 8. a saved run carries its 룬 and slots ---
const saved = await run(`
  s.kit.addRune('linger'); s.kit.socket('fireball', 1, 'linger'); s.kit.addRune('pierce');
  s.writeSave();
  const save = window.openRecord('exiled-survivors:save:v1', localStorage.getItem('exiled-survivors:save:v1')).value;
  window.__save = save;
  s.scene.restart({ save });
  return { sockets: save.kit.sockets, runes: save.kit.runes };
`);
await sleep(1500);
const resumed = await run(`return { sockets: s.kit.socketsOf('fireball'), pierce: s.kit.runeCount('pierce'), sheet: !!s.mods.runes.fireball };`);
check('a saved run comes back with its 강화 슬롯, what is set in them and the 룬 held',
  JSON.stringify(resumed.sockets) === JSON.stringify(saved.sockets.fireball) && resumed.pierce === saved.runes.pierce && resumed.sheet, JSON.stringify({ saved, resumed }));
await run(`localStorage.removeItem('exiled-survivors:save:v1'); return 1;`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
