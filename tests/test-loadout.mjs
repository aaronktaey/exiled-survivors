import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// The skills in hand as a row of icons; a mouse over one opens a card that
// spells its DPS out, and the run holds still while it is read — and while
// a rare's 속성 are read under the mouse too.

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
const run = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);
const move = (at) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
// Game space to where it is on the page: the canvas is scaled to the window.
const onPage = `const r = window.game.canvas.getBoundingClientRect(); const k = r.width / s.scale.width;`;

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(800);
await cdp.evaluate(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// Somewhere on the field with nothing on it, for the mouse to rest.
const away = await run(`${onPage} return { x: r.left + s.scale.width / 2, y: r.top + s.scale.height * 0.75 };`);
await move(away);

// --- 1. one icon per skill in hand ---
const bar = await run(`
  s.player.setInvulnerable(true);
  s.acquire('fireball');
  s.acquire('voidOrb');
  s.hud.update(0, s.spawner.alive, s.loadout());
  const shown = s.hud.slots.filter((slot) => slot.plate.visible);
  return {
    held: s.weapons.map((w) => w.definition.id),
    shown: shown.map((slot) => slot.icon.texture.key),
    want: s.weapons.map((w) => window.config.SKILL_ICONS[w.definition.id].key),
    levels: shown.map((slot) => slot.level.text),
    wantLevels: s.weapons.map((w) => String(s.progression.levelFor(w.definition.id))),
    textOnBar: s.children.list.some((o) => o.type === 'Text' && o.visible && /DPS/.test(o.text)),
  };
`);
console.log('bar:', JSON.stringify(bar));
check('the bar shows one icon for every skill in hand, each its own',
  bar.shown.length === bar.held.length && JSON.stringify(bar.shown) === JSON.stringify(bar.want),
  bar.held.join(' / '));
check('each icon wears its level', JSON.stringify(bar.levels) === JSON.stringify(bar.wantLevels),
  bar.levels.join(' / '));
check('and there is no list of DPS lines on screen any more', bar.textOnBar === false);

// --- 2. a real mouse over an icon opens its card, and the run stops ---
const slots = await run(`${onPage}
  return s.hud.slots.filter((slot) => slot.plate.visible)
    .map((slot) => ({ x: r.left + slot.plate.x * k, y: r.top + slot.plate.y * k }));
`);
const moving = await run(`return { clock: s.spawner.clockMs, elapsed: s.elapsedMs };`);
await sleep(300);
const moved = await run(`return { clock: s.spawner.clockMs, elapsed: s.elapsedMs };`);
check('before that, the run is going', moved.elapsed > moving.elapsed);

await move(slots[1]);
await sleep(150);
const card = await run(`
  const entry = s.loadout()[1];
  return {
    pointed: s.hud.pointed, shown: s.hud.card.visible && s.hud.cardText.visible,
    text: s.hud.cardText.text, entry, damage: s.damageOf(entry.id),
    perSecond: 1000 / s.cooldownOf(entry.id),
    held: s.inspectHeld, physicsPaused: s.physics.world.isPaused,
    clock: s.spawner.clockMs, elapsed: s.elapsedMs,
  };
`);
console.log('card:', JSON.stringify({ ...card, text: card.text.split('\n') }));
check('pointing at the second icon opens the card on that skill',
  card.pointed === 1 && card.shown && card.text.startsWith(card.entry.name), card.text.split('\n')[0]);
check('the card says the damage per hit the run is dealing',
  card.text.includes(String(card.damage)), `${card.damage}`);
const dpsLine = card.text.split('\n').find((line) => line.startsWith('DPS'));
check('and ends on the DPS the bar stands for, made of those numbers',
  !!dpsLine && dpsLine.includes(String(Number(card.entry.dps.toFixed(1)))) &&
    dpsLine.includes(String(card.damage)) && dpsLine.includes(String(Number(card.perSecond.toFixed(2)))),
  dpsLine);
check('crits are said to be left out', card.text.includes('치명타'));
await shot('loadout-01-card');

await sleep(400);
const still = await run(`return { clock: s.spawner.clockMs, elapsed: s.elapsedMs, paused: s.physics.world.isPaused };`);
check('while the card is open the run holds still',
  card.held && still.paused && still.clock === card.clock && still.elapsed === card.elapsed,
  `${card.elapsed} -> ${still.elapsed}`);

await move(away);
await sleep(300);
const after = await run(`return { pointed: s.hud.pointed, card: s.hud.card.visible, held: s.inspectHeld,
  paused: s.physics.world.isPaused, elapsed: s.elapsedMs };`);
check('moving off closes the card and lets the run go on',
  after.pointed === -1 && !after.card && !after.held && !after.paused && after.elapsed > still.elapsed);

// --- 3. a level taken while it is open is on the card at once ---
const relevel = await run(`
  s.hud.point(0);
  const before = s.hud.cardText.text;
  s.progression.apply(s.loadout()[0].id, 'damage');
  s.hud.update(0, s.spawner.alive, s.loadout());
  const now = s.hud.cardText.text;
  s.hud.point(-1);
  return { changed: before !== now, held: s.inspectHeld };
`);
check('the card follows its skill when it is upgraded', relevel.changed);
check('and closing it from code lets go of the run too', relevel.held === false);

// --- 4. a rare under the mouse holds the run too ---
const rare = await run(`${onPage}
  const e = s.spawner.spawnRare('grunt');
  e.setPosition(s.player.x + 160, s.player.y);
  e.body.reset(e.x, e.y);
  const cam = s.cameras.main;
  return { x: r.left + (e.x - cam.worldView.x) * k, y: r.top + (e.y - cam.worldView.y) * k };
`);
await sleep(50);
// The rare walks, so it is pointed at where it is now.
const at = await run(`${onPage}
  const e = s.spawner.group.getChildren().find((x) => x.active && x.rare);
  const cam = s.cameras.main;
  return { x: r.left + (e.x - cam.worldView.x) * k, y: r.top + (e.y - cam.worldView.y) * k };
`);
await move(at ?? rare);
await sleep(150);
const reading = await run(`return { shown: s.rareTooltip.visible, held: s.inspectHeld, elapsed: s.elapsedMs };`);
await sleep(400);
const reading2 = await run(`return { shown: s.rareTooltip.visible, elapsed: s.elapsedMs, paused: s.physics.world.isPaused };`);
check('hovering a rare shows its 속성 and holds the run',
  reading.shown && reading.held && reading2.paused && reading2.elapsed === reading.elapsed,
  `${reading.elapsed} -> ${reading2.elapsed}`);
await shot('loadout-02-rare');
await move(away);
await sleep(300);
const free = await run(`return { shown: s.rareTooltip.visible, held: s.inspectHeld, paused: s.physics.world.isPaused, elapsed: s.elapsedMs };`);
check('and moving off it lets the run go on',
  !free.shown && !free.held && !free.paused && free.elapsed > reading2.elapsed);

// --- 5. a popup while reading does not let the run go early ---
const popup = await run(`
  s.hud.point(0);
  s.choosing = true;
  s.afterChoice();
  const paused = s.physics.world.isPaused;
  s.hud.point(-1);
  return { paused, after: s.physics.world.isPaused };
`);
check('a popup that closes while a card is open keeps the arena still until the card closes',
  popup.paused === true && popup.after === false);

// --- 6. the pause menu clears it ---
const menu = await run(`
  s.hud.point(0);
  s.pauseRun();
  return { held: s.inspectHeld, card: s.hud.card.visible };
`);
check('opening the pause menu closes the card and the hold', menu.held === false && menu.card === false);
await cdp.evaluate(`(() => { const p = window.game.scene.getScene('PauseScene'); p.scene.stop(); window.game.scene.getScene('GameScene').scene.resume(); return 1; })()`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
