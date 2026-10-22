import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 무작위 스킬: three cards, one to take — a run's first skill, and what a
// 무작위 스킬 on the ground opens.

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
const run = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);
const pick = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('SkillPickScene'); ${body} })()`);
const active = (key) => ev(`(() => window.game.scene.isActive('${key}'))()`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(800);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. #run lands in play, holding the fixed skill ---
const plain = await run(`return { pick: window.game.scene.isActive('SkillPickScene'), owned: [...s.owned] };`);
check('#run goes straight into play, holding 타격', plain.pick === false &&
  JSON.stringify(plain.owned) === JSON.stringify(['meleeStrike']), JSON.stringify(plain));

// --- 2. a fresh run opens on three cards ---
// The harness turns the choice off so every other suite lands in play; on here.
await ev(`(() => {
  window.config.SKILL_PICK.atRunStart = true;
  window.game.scene.getScene('GameScene').scene.start('GameScene', { save: null, startPick: true });
  return 1;
})()`);
await sleep(1500);
const opened = await ev(`(() => {
  const g = window.game.scene.getScene('GameScene');
  const p = window.game.scene.getScene('SkillPickScene');
  return {
    active: window.game.scene.isActive('SkillPickScene'),
    choosing: g.choosing, paused: g.physics.world.isPaused,
    options: p.payload.options, owned: [...g.owned],
    // What may be offered: every skill but a trial one (SKILL_TRIAL) — the harness has no account.
    all: Object.keys(window.config.SKILL_BASE).filter((id) => !window.config.SKILL_TRIAL?.[id]),
    trial: Object.keys(window.config.SKILL_TRIAL ?? {}),
  };
})()`);
console.log('opened:', JSON.stringify(opened));
check('a fresh run opens on the cards, with the arena frozen and nothing in hand',
  opened.active && opened.choosing && opened.paused && opened.owned.length === 0);
// Every skill there is, once each (0.82; three at random before).
check('the first skill is chosen from every skill, each once',
  opened.options.length === opened.all.length && new Set(opened.options).size === opened.all.length &&
    opened.options.every((id) => opened.all.includes(id)),
  opened.options.join(' / '));
await shot('skillpick-01-start');

// With a real mouse: the page is a scaled canvas, so a card's place in the
// game is turned into where it is on the page before the pointer goes there.
const cardsOnPage = await pick(`
  const r = window.game.canvas.getBoundingClientRect();
  const k = r.width / s.scale.width;
  return s.cards.map((c) => ({ x: r.left + c.x * k, y: r.top + c.y * k }));
`);
const mouse = (type, at) => cdp.send('Input.dispatchMouseEvent',
  { type, x: at.x, y: at.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
await sleep(400);
const hovered = [];
for (const at of cardsOnPage) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
  await sleep(120);
  hovered.push(await pick(`return s.selected;`));
}
check('the cursor follows the mouse onto each card in turn',
  JSON.stringify(hovered) === JSON.stringify(cardsOnPage.map((_, i) => i)), hovered.join(' '));
await mouse('mousePressed', cardsOnPage[2]);
await mouse('mouseReleased', cardsOnPage[2]);
await sleep(900);
const took = await run(`return { owned: [...s.owned], choosing: s.choosing, paused: s.physics.world.isPaused,
  pick: window.game.scene.isActive('SkillPickScene') };`);
check('clicking the third card takes the third card, and only that skill is in hand',
  JSON.stringify(took.owned) === JSON.stringify([opened.options[2]]) && !took.pick,
  `clicked ${opened.options[2]}, took ${took.owned.join(', ')}`);
check('and the run goes on', took.choosing === false && took.paused === false);

// --- 3. over many runs, every skill can be offered ---
const spread = await run(`
  const seen = {};
  for (let i = 0; i < 600; i++) for (const id of s.randomSkills()) seen[id] = (seen[id] ?? 0) + 1;
  return { seen, all: Object.keys(window.config.SKILL_BASE).filter((id) => !window.config.SKILL_TRIAL?.[id]),
           trial: Object.keys(window.config.SKILL_TRIAL ?? {}) };
`);
check('a trial skill (SKILL_TRIAL) is never offered to a player without its account — not at the start, not on the cards',
  // Holds with none listed too (0.97: the 드론 is open to all again).
  opened.trial.every((id) => !opened.options.includes(id)) && spread.trial.every((id) => !(spread.seen[id] > 0)),
  JSON.stringify({ trial: opened.trial, start: opened.options, seen: spread.seen }));
check('every skill turns up on the cards, at about even odds',
  spread.all.every((id) => (spread.seen[id] ?? 0) > 600 * 3 / spread.all.length * 0.7),
  Object.entries(spread.seen).map(([k, n]) => `${k} ${n}`).join(' / '));

// --- 4. a 무작위 스킬 on the ground opens the same choice ---
const dropped = await run(`
  s.combat.dropRandomSkillAt(s.player.x + 60, s.player.y);
  const d = s.combat.randomSkillDrops.getChildren().find((x) => x.active);
  return { label: d.nameplate.text, style: d.nameplate.style, life: d.timeLeftMs };
`);
check('it lies on the ground, labelled as what it is', /무작위 스킬/.test(dropped.label) && dropped.life > 0,
  dropped.label);
await run(`
  const d = s.combat.randomSkillDrops.getChildren().find((x) => x.active);
  s.combat.onRandomSkillTouch(s.player, d);
  return 1;
`);
await sleep(800);
const offered = await ev(`(() => {
  const p = window.game.scene.getScene('SkillPickScene');
  const g = window.game.scene.getScene('GameScene');
  return { active: window.game.scene.isActive('SkillPickScene'), options: p.payload.options,
           owned: [...g.owned], gone: g.combat.randomSkillDrops.countActive(true) === 0,
           title: p.payload.title };
})()`);
check('walking over it takes it, and opens three cards', offered.active && offered.gone &&
  offered.options.length === 3, offered.options.join(' / '));
await shot('skillpick-02-drop');

// Take one already held, if it is on offer: that goes on to its upgrade.
const heldIndex = offered.options.findIndex((id) => offered.owned.includes(id));
const newIndex = offered.options.findIndex((id) => !offered.owned.includes(id));
if (heldIndex >= 0) {
  await pick(`s.pick(${heldIndex}); return 1;`);
  await sleep(800);
  const upgrade = await ev(`(() => {
    const u = window.game.scene.getScene('UpgradeScene');
    return { open: window.game.scene.isActive('UpgradeScene'), skill: u.payload?.skill };
  })()`);
  check('a card for a skill in hand opens that skill’s upgrade',
    upgrade.open && upgrade.skill === offered.options[heldIndex], JSON.stringify(upgrade));
  await ev(`(() => { const u = window.game.scene.getScene('UpgradeScene'); u.pick(u.cards[0].option.id); return 1; })()`);
  await sleep(600);
} else {
  check('a card for a skill in hand opens that skill’s upgrade (none was on offer this time)', true);
  await pick(`s.pick(${newIndex}); return 1;`);
  await sleep(600);
}

// And one not yet held is acquired outright.
await run(`
  // Force cards that include a skill not in hand.
  const notHeld = Object.keys(window.config.SKILL_BASE).filter((id) => !s.owned.has(id));
  s.randomSkills = () => notHeld.slice(0, 3);
  s.queueChoice({ kind: 'pick' });
  return 1;
`);
await sleep(800);
const fresh = await pick(`return s.payload.options;`);
await pick(`s.pick(0); return 1;`);
await sleep(800);
const afterFresh = await run(`return { owned: [...s.owned], upgrade: window.game.scene.isActive('UpgradeScene'),
  choosing: s.choosing };`);
check('a card for a skill not yet held adds it, with no upgrade screen',
  afterFresh.owned.includes(fresh[0]) && !afterFresh.upgrade && afterFresh.choosing === false,
  `took ${fresh[0]}`);

// The survivor wears the main skill's look (0.76, kept in 0.80); one found later changes nothing.
const look = await run(`
  const p = s.player, c = window.config;
  return { main: s.mainSkill, look: p.look, texture: p.texture.key, want: 'tex-look-' + s.mainSkill + '-',
           drawn: Math.round(p.displayWidth), size: Math.round(p.body.width), wantDrawn: c.PLAYER_LOOK.drawn, wantSize: c.PLAYER.size };
`);
check('the survivor is dressed for the main skill, drawn at PLAYER_LOOK.drawn with a PLAYER.size body',
  look.look === look.main && look.texture.startsWith(look.want) && Math.abs(look.drawn - look.wantDrawn) <= 1 && look.size === look.wantSize,
  JSON.stringify(look));

// It walks while it moves and stands when it stops (0.82).
const walk = await run(`
  const p = s.player, c = window.config;
  p.casting = false;
  p.heading.set(1, 0);
  p.animateLook(true);
  const walking = { anim: p.anims.currentAnim?.key, playing: p.anims.isPlaying, want: c.lookAnim(p.look, 'walk') };
  p.animateLook(false);
  return { walking, stood: { playing: p.anims.isPlaying, texture: p.texture.key, want: c.lookTexture(p.look) } };
`);
check('it plays its walk while it moves, and stands still in its idle look when it stops',
  walk.walking.anim === walk.walking.want && walk.walking.playing && !walk.stood.playing && walk.stood.texture === walk.stood.want,
  JSON.stringify(walk));

// The main skill going off plays the cast, turned toward the target; another skill does not.
const cast = await run(`
  const p = s.player, c = window.config;
  p.stop(); p.casting = false; p.setFlipX(false);
  s.castLook(p.x - 200);
  const during = { anim: p.anims.currentAnim?.key, casting: p.casting, flip: p.flipX, want: c.lookAnim(p.look, 'cast') };
  return during;
`);
await sleep(600);
const castDone = await run(`return { casting: s.player.casting };`);
check('the main skill going off plays the cast, facing the enemy it went for, and then lets go',
  cast.anim === cast.want && cast.casting && cast.flip === true && castDone.casting === false,
  JSON.stringify({ cast, castDone }));
const handedTo = await run(`
  const seen = {};
  const wrap = s.weapons.map((w) => { const real = w.update; w.update = function (dt, ctx) { seen[w.definition.id] = typeof ctx.onCast === 'function'; return real.call(this, dt, ctx); }; return [w, real]; });
  s.choosing = false; s.update(0, 16);
  wrap.forEach(([w, real]) => { w.update = real; });
  return { seen, main: s.mainSkill };
`);
check('only the main skill is handed the cast',
  handedTo.seen[handedTo.main] === true && Object.entries(handedTo.seen).every(([id, on]) => on === (id === handedTo.main)),
  JSON.stringify(handedTo));

// --- 5. kills leave one at the configured chance ---
const rolls = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.randomSkillDrops.getChildren().forEach((d) => d.active && d.collect());
  const was = window.config.SKILL_PICK.dropChance;
  const kill = () => { const e = s.spawner.group.get(s.player.x + 300, s.player.y);
    e.spawn(s.player.x + 300, s.player.y, s.player, 'grunt'); s.combat.hit(e, 1e9); };
  window.config.SKILL_PICK.dropChance = 0;
  for (let i = 0; i < 20; i++) kill();
  const none = s.combat.randomSkillDrops.countActive(true);
  window.config.SKILL_PICK.dropChance = 1;
  for (let i = 0; i < 5; i++) kill();
  const all = s.combat.randomSkillDrops.countActive(true);
  window.config.SKILL_PICK.dropChance = was;
  s.combat.randomSkillDrops.getChildren().forEach((d) => d.active && d.collect());
  s.choosing = false;
  return { none, all, was };
`);
check('a kill leaves a 무작위 스킬 at its own chance — none at 0%, every time at 100%',
  rolls.none === 0 && rolls.all === 5 && rolls.was > 0, `configured ${rolls.was}`);

// --- 6. 다시하기 opens on the cards too ---
await run(`s.player.invulnerableUntil = 0; s.player.setInvulnerable(false); s.player.takeDamage(1e9); return 1;`);
await sleep(1500);
await ev(`(() => { window.game.scene.getScene('GameOverScene').payload.onRestart(); return 1; })()`);
await sleep(1500);
check('다시하기 opens on the cards too', await active('SkillPickScene'));
const again = await pick(`return s.payload.options;`);
await sleep(400);
await cdp.tap('Digit2', 50, '2');
await sleep(900);
const keyed = await run(`return [...s.owned];`);
check('and 2 on the keyboard takes the second card',
  JSON.stringify(keyed) === JSON.stringify([again[1]]), `took ${keyed.join(', ')}`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
