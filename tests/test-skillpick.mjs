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
    all: Object.keys(window.config.SKILL_BASE),
  };
})()`);
console.log('opened:', JSON.stringify(opened));
check('a fresh run opens on the cards, with the arena frozen and nothing in hand',
  opened.active && opened.choosing && opened.paused && opened.owned.length === 0);
check('every skill there is, once each (0.74: three at random before)',
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

// --- 3. kills leave a 룬 where a 무작위 스킬 used to fall, at its own chance ---
const rolls = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.runeDrops.getChildren().forEach((d) => d.active && d.collect());
  const was = window.config.RUNE_DROP.chance;
  const kill = () => { const e = s.spawner.group.get(s.player.x + 300, s.player.y);
    e.spawn(s.player.x + 300, s.player.y, s.player, 'grunt'); s.combat.hit(e, 1e9); };
  window.config.RUNE_DROP.chance = 0;
  for (let i = 0; i < 20; i++) kill();
  const none = s.combat.runeDrops.countActive(true);
  window.config.RUNE_DROP.chance = 1;
  for (let i = 0; i < 5; i++) kill();
  const all = s.combat.runeDrops.countActive(true);
  window.config.RUNE_DROP.chance = was;
  s.combat.runeDrops.getChildren().forEach((d) => d.active && d.collect());
  s.choosing = false;
  return { none, all, was, groups: ['skillDrops', 'randomSkillDrops'].filter((k) => k in s.combat) };
`);
check('a kill leaves a 룬 at its own chance — none at 0%, every time at 100% — and no skill',
  rolls.none === 0 && rolls.all === 5 && rolls.was > 0 && rolls.groups.length === 0, JSON.stringify(rolls));

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
