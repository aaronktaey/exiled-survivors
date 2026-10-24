import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

const cdp = await connect(9333);
const SP = process.argv[2];
const results = [];
const check = (n, p, d = '') => {
  results.push({ n, p });
  console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
};
const shot = async (n) => {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SP}/${n}.png`, Buffer.from(r.result.data, 'base64'));
};

// --- emulate a phone ---
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 844, height: 390, deviceScaleFactor: 2, mobile: true,
});
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp.send('Page.reload', {});
await sleep(4000);

// A plain enemy at full health, and the player at full health, both read
// from the live config so hand-tuning balance.ts cannot fail the suite.
const CONFIG = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const Progression = Object.getPrototypeOf(s.progression).constructor;
  return { enemyHp: Progression.enemyHealth, playerHp: s.player.maxHp };
})()`);
const FULL = CONFIG.enemyHp;
const MAX = CONFIG.playerHp;
console.log('config:', JSON.stringify(CONFIG));


const env = await cdp.evaluate(`({
  coarse: window.matchMedia('(pointer: coarse)').matches,
  hasStick: !!window.game.scene.getScene('GameScene').player.analog,
})`);
check('touch device detected', env.coarse === true, `coarse=${env.coarse}`);

// Nothing of the game right at the glass: the stage is the height shown and
// the canvas sits inset from every edge, so no button is under a gesture strip.
const inset = await cdp.evaluate(`(() => {
  const r = window.game.canvas.getBoundingClientRect();
  const stage = document.getElementById('stage').getBoundingClientRect();
  return { touch: document.documentElement.classList.contains('touch'),
           left: Math.round(r.left), top: Math.round(r.top),
           right: Math.round(window.innerWidth - r.right), bottom: Math.round(window.innerHeight - r.bottom),
           stageH: Math.round(stage.height), shown: Math.round(window.visualViewport ? window.visualViewport.height : window.innerHeight) };
})()`);
console.log('inset:', JSON.stringify(inset));
check('on a phone the stage is the height actually shown, and the game keeps off every edge',
  inset.touch && inset.stageH === inset.shown &&
    Math.min(inset.left, inset.top, inset.right, inset.bottom) >= 12,
  JSON.stringify(inset));
check('joystick attached on touch', env.hasStick === true, `attached=${env.hasStick}`);

const geom = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const j = s.player.analog;
  const r = window.game.canvas.getBoundingClientRect();
  const scale = window.game.scale;
  return {
    // Where the pad waits is nowhere now, so pick a spot a thumb would use.
    baseX: Math.round(scale.width * 0.25), baseY: Math.round(scale.height * 0.75),
    hidden: j.base.visible,
    gameW: scale.width, gameH: scale.height,
    cssW: Math.round(r.width), cssH: Math.round(r.height),
    cssLeft: Math.round(r.left), cssTop: Math.round(r.top),
  };
})()`);
console.log('geometry:', JSON.stringify(geom));

// Game-space -> CSS page coords for touch dispatch.
const toPage = (gx, gy) => ({
  x: geom.cssLeft + (gx / geom.gameW) * geom.cssW,
  y: geom.cssTop + (gy / geom.gameH) * geom.cssH,
});
const touch = (type, gx, gy) => {
  const p = toPage(gx, gy);
  return cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y, id: 1 }],
  });
};

await shot('touch-01-idle');

const pos = `(() => { const s = window.game.scene.getScene('GameScene'); return { x: Math.round(s.player.x), y: Math.round(s.player.y) }; })()`;
const before = await cdp.evaluate(pos);

// --- drag the stick right ---
await touch('touchStart', geom.baseX, geom.baseY);
await touch('touchMove', geom.baseX + 50, geom.baseY);
await sleep(300);
const dragging = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene'); const j = s.player.analog;
  return {
    tilt: Number(j.tilt.toFixed(2)),
    dirX: Number(j.direction.x.toFixed(2)),
    thumbX: Math.round(j.thumb.x), baseX: Math.round(j.base.x),
    vx: Math.round(s.player.body.velocity.x), vy: Math.round(s.player.body.velocity.y),
  };
})()`);
console.log('dragging right:', JSON.stringify(dragging));
check('the pad waits out of sight until a finger lands', geom.hidden === false,
  `visible before the touch=${geom.hidden}`);
check('stick reports full tilt right', dragging.tilt > 0.8 && dragging.dirX > 0.9, `tilt=${dragging.tilt} dirX=${dragging.dirX}`);
check('thumb follows the finger', dragging.thumbX > dragging.baseX + 30, `thumb=${dragging.thumbX} base=${dragging.baseX}`);
check('player moves right from touch', dragging.vx > 150 && Math.abs(dragging.vy) < 30, `v=(${dragging.vx},${dragging.vy})`);
await shot('touch-02-drag');

await sleep(900);
const moved = await cdp.evaluate(pos);
check('position advances while held', moved.x > before.x + 100, `${before.x} -> ${moved.x}`);

// --- partial tilt moves slower ---
await touch('touchMove', geom.baseX + 18, geom.baseY);
await sleep(300);
const partial = await cdp.evaluate(`(() => {
  const b = window.game.scene.getScene('GameScene').player.body;
  return { speed: Math.round(Math.hypot(b.velocity.x, b.velocity.y)) };
})()`);
check('partial tilt moves slower', partial.speed > 0 && partial.speed < 200, `speed=${partial.speed} (full=220)`);

// --- release stops ---
await touch('touchEnd', 0, 0);
await sleep(300);
const released = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene'); const j = s.player.analog;
  return { tilt: j.tilt, vx: Math.round(s.player.body.velocity.x), thumbX: Math.round(j.thumb.x), baseX: Math.round(j.base.x) };
})()`);
check('release recentres and stops', released.tilt === 0 && released.vx === 0 && released.thumbX === released.baseX,
  `tilt=${released.tilt} vx=${released.vx}`);

// --- a touch far from the stick must not grab it ---
await touch('touchStart', geom.gameW - 60, 60);
await sleep(200);
const farAway = await cdp.evaluate(`(() => ({ tilt: window.game.scene.getScene('GameScene').player.analog.tilt }))()`);
check('far touch does not grab the stick', farAway.tilt === 0, `tilt=${farAway.tilt}`);
await touch('touchEnd', 0, 0);

// --- level-up popup is tappable ---
await cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); s.progression.addXp(s.progression.xpToNext); return 1; })()`);
await sleep(900);
const popup = await cdp.evaluate(`(() => {
  const g = window.game, s = g.scene.getScene('GameScene'), lu = g.scene.getScene('UpgradeScene');
  return {
    open: g.scene.isActive('UpgradeScene'), as: s.progression.statsFor('meleeStrike').attackSpeed, dmg: s.progression.statsFor('meleeStrike').damage,
    card1x: lu.cards[1].x, cardY: lu.cards[1].panel.y,
  };
})()`);
check('popup opens on touch device', popup.open === true, `as=${popup.as}`);
await shot('touch-03-popup');

await touch('touchStart', popup.card1x, popup.cardY);
await touch('touchEnd', 0, 0);
await sleep(700);
const picked = await cdp.evaluate(`(() => {
  const g = window.game, s = g.scene.getScene('GameScene');
  return {
    open: g.scene.isActive('UpgradeScene'), as: s.progression.statsFor('meleeStrike').attackSpeed,
    dmg: s.progression.statsFor('meleeStrike').damage, paused: s.physics.world.isPaused,
  };
})()`);
check('tapping a card applies it',
  picked.open === false && picked.as > popup.as && picked.dmg === popup.dmg,
  `as ${popup.as} -> ${picked.as}, dmg=${picked.dmg}`);
check('play resumes after tap', picked.paused === false);

// --- a level-up picked over a rare does not leave the run frozen ---
// A phone follows every tap with a pretend mouse event at the same spot. The
// cards sit over the middle of the field, where the survivor and its crowd
// are, so that mouse lands on a rare — and "reading" under a mouse holds the
// run. No real mouse ever comes to let it go: the pad showed, the survivor
// never moved again.
await cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); s.progression.addXp(s.progression.xpToNext); return 1; })()`);
await sleep(900);
const spot = await cdp.evaluate(`(() => {
  const g = window.game, s = g.scene.getScene('GameScene'), lu = g.scene.getScene('UpgradeScene');
  const x = lu.cards[0].x, y = lu.cards[0].panel.y;
  const view = s.cameras.main.worldView;
  const rare = s.spawner.spawnRare();
  rare.setPosition(view.x + x, view.y + y); rare.body.reset(view.x + x, view.y + y); rare.target = undefined;
  return { x, y };
})()`);
await touch('touchStart', spot.x, spot.y);
await touch('touchEnd', 0, 0);
await sleep(100);
const page = toPage(spot.x, spot.y);
await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: page.x, y: page.y });
await sleep(700);
const frozen = await cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene');
  return { held: s.inspectHeld, paused: s.physics.world.isPaused, open: window.game.scene.isActive('UpgradeScene') }; })()`);
await touch('touchStart', geom.baseX, geom.baseY);
await touch('touchMove', geom.baseX + 50, geom.baseY);
await sleep(400);
const steered = await cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene');
  return { vx: Math.round(s.player.body.velocity.x), held: s.inspectHeld, paused: s.physics.world.isPaused }; })()`);
await touch('touchEnd', 0, 0);
console.log('after the pick:', JSON.stringify({ frozen, steered }));
check('a tap’s pretend mouse over a rare does not freeze the run after a pick',
  frozen.open === false && frozen.held === false && frozen.paused === false, JSON.stringify(frozen));
check('and the pad steers the survivor again', steered.vx > 150 && steered.paused === false, JSON.stringify(steered));
await cdp.evaluate(`(() => { window.game.scene.getScene('GameScene').spawner.clear(); return 1; })()`);
await sleep(200);

// --- game over restarts on tap ---
await cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); s.player.invulnerableUntil = 0; s.player.takeDamage(9999); return 1; })()`);
await sleep(900);
const over = await cdp.evaluate(`({ open: window.game.scene.isActive('GameOverScene') })`);
check('game over opens', over.open === true);
await shot('touch-04-gameover');

await sleep(700);
// Tap 다시하기 on the end screen rather than the screen at large.
const retryAt = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameOverScene');
  const row = s.menu.rows.find(r => r.item.id === 'retry');
  return { x: Math.round(row.panel.x), y: Math.round(row.panel.y) };
})()`);
await touch('touchStart', retryAt.x, retryAt.y);
await touch('touchEnd', 0, 0);
await sleep(1200);
const restarted = await cdp.evaluate(`(() => {
  const g = window.game, s = g.scene.getScene('GameScene');
  return { over: g.scene.isActive('GameOverScene'), lv: s.progression.level, hp: s.player.hp, stick: !!s.player.analog };
})()`);
check('tapping 다시하기 starts another run', restarted.over === false && restarted.lv === 1 && restarted.hp === MAX,
  `lv=${restarted.lv} hp=${restarted.hp}`);
check('stick survives a restart', restarted.stick === true);

// --- the pad that appears under your finger, after a fresh load ---
await cdp.send('Page.reload', {});
await sleep(4000);

const hidden = await cdp.evaluate(`(() => {
  const j = window.game.scene.getScene('GameScene').player.analog;
  return { visible: j.base.visible, kind: j.constructor.name };
})()`);
check('the pad is out of sight again after a reload',
  hidden.kind === 'VirtualJoystick' && hidden.visible === false,
  `${hidden.kind} visible=${hidden.visible}`);

await touch('touchStart', 620, 300);
await sleep(200);
const summoned = await cdp.evaluate(`(() => {
  const j = window.game.scene.getScene('GameScene').player.analog;
  return { visible: j.base.visible, x: Math.round(j.base.x), y: Math.round(j.base.y) };
})()`);
console.log('summoned:', JSON.stringify(summoned));
check('it appears under the finger, wherever that is',
  summoned.visible === true && Math.abs(summoned.x - 620) < 8 && Math.abs(summoned.y - 300) < 8,
  `pad at ${summoned.x}, ${summoned.y} for a touch at 620, 300`);

// Drag out from there and the survivor moves, same as the pinned pad.
await touch('touchMove', 620 + 60, 300);
await sleep(250);
const draggedFloat = await cdp.evaluate(`(() => {
  const j = window.game.scene.getScene('GameScene').player.analog;
  const v = window.game.scene.getScene('GameScene').player.body.velocity;
  return { tilt: Number(j.tilt.toFixed(2)), vx: Math.round(v.x), vy: Math.round(v.y) };
})()`);
check('dragging from there still steers',
  draggedFloat.tilt > 0.5 && draggedFloat.vx > 100,
  `tilt=${draggedFloat.tilt} velocity=${draggedFloat.vx}, ${draggedFloat.vy}`);
await shot('touch-05-floating');

await touch('touchEnd', 0, 0);
await sleep(250);
const letGo = await cdp.evaluate(`(() => {
  const j = window.game.scene.getScene('GameScene').player.analog;
  return { visible: j.base.visible, tilt: j.tilt };
})()`);
check('letting go puts it away again',
  letGo.visible === false && letGo.tilt === 0, `visible=${letGo.visible}`);

// --- tilt mode drops the pad entirely ---
await cdp.evaluate(`(() => {
  const raw = localStorage.getItem('exiled-survivors:settings:v1');
  const next = { ...(raw ? JSON.parse(raw) : {}), movementMode: 'tilt' };
  localStorage.setItem('exiled-survivors:settings:v1', JSON.stringify(next));
  return 1;
})()`);
await cdp.send('Page.reload', {});
await sleep(4000);
const tilting = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const j = s.player.analog;
  return { kind: j.constructor.name, hasBase: 'base' in j, live: j.live };
})()`);
console.log('tilt:', JSON.stringify(tilting));
check('tilt mode swaps the pad for the sensor',
  tilting.kind === 'TiltInput' && tilting.hasBase === false,
  `steering with ${tilting.kind}`);

// Feed it a real orientation event and watch the survivor lean into it.
const tilted = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const j = s.player.analog;
  const send = (beta, gamma) => window.dispatchEvent(
    new DeviceOrientationEvent('deviceorientation', { beta, gamma, alpha: 0 }));
  send(0, 0);          // the pose it is held in becomes level
  for (let i = 0; i < 30; i++) send(0, 30);   // then lean right
  // Phaser is not a global in the bundle, so read the stick directly.
  return { tilt: Number(j.tilt.toFixed(2)), x: Number(j.direction.x.toFixed(2)), y: Number(j.direction.y.toFixed(2)) };
})()`);
console.log('tilted:', JSON.stringify(tilted));
check('leaning the device steers', tilted.tilt > 0.5 && tilted.x > 0.9,
  `tilt=${tilted.tilt} direction=${tilted.x}, ${tilted.y}`);

// Put it back, so the next suite starts from the defaults.
await cdp.evaluate(`(() => { localStorage.clear(); return 1; })()`);

// This suite talks to the page directly; the tilt block wants the same two
// shorthands the others use.
const ev = (expr) => cdp.evaluate(expr);
const run = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);

// --- steering by tilting the phone ---
// It was still here all along; what was missing was any way to tell. The
// row says what the other way is now, and this proves the other way works.
const modes = await ev(`(() => ({
  modes: window.config ? null : null,
  all: JSON.parse(JSON.stringify(['floating', 'tilt'])),
  current: JSON.parse(localStorage.getItem('exiled-survivors:settings:v1') || '{}').movementMode,
}))()`);
console.log('modes:', JSON.stringify(modes));

await ev(`(() => {
  const raw = JSON.parse(localStorage.getItem('exiled-survivors:settings:v1') || '{}');
  raw.movementMode = 'tilt';
  localStorage.setItem('exiled-survivors:settings:v1', JSON.stringify(raw));
  return 1;
})()`);
await cdp.send('Page.reload', {});
await sleep(4800);

const attached = await run(`
  return { analog: s.analog ? s.analog.constructor.name : null,
           live: s.analog && 'live' in s.analog ? s.analog.live : null,
           pad: s.analog && s.analog.constructor.name === 'VirtualJoystick' };
`);
console.log('tilt attached:', JSON.stringify(attached));
check('choosing 기울이기 steers the run by the sensor, not by a pad',
  attached.analog === 'TiltInput' && attached.live === false,
  `${attached.analog}, waiting for the first reading`);

/** One orientation reading, as the device would send it. */
const tilt = async (beta, gamma) => {
  await ev(`(() => {
    const e = new Event('deviceorientation');
    Object.defineProperty(e, 'alpha', { value: 0 });
    Object.defineProperty(e, 'beta', { value: ${beta} });
    Object.defineProperty(e, 'gamma', { value: ${gamma} });
    window.dispatchEvent(e);
    return 1;
  })()`);
};

// The pose it is already being held at becomes level.
await tilt(45, 0);
await sleep(250);
const resting = await run(`
  return { x: Math.round(s.player.x), y: Math.round(s.player.y), live: s.analog.live };
`);
check('the pose it is already held at becomes level',
  resting.live === true, 'the first reading is the neutral one');

for (let i = 0; i < 25; i++) {
  await tilt(45, 30);
  await sleep(40);
}
await sleep(300);
const tiltedRight = await run(`
  return { x: Math.round(s.player.x), y: Math.round(s.player.y),
           vx: Math.round(s.player.body.velocity.x) };
`);
console.log('tilted right:', JSON.stringify({ resting, tiltedRight }));
check('tilting it moves the survivor that way',
  tiltedRight.x - resting.x > 60 && tiltedRight.vx > 0,
  `${resting.x} -> ${tiltedRight.x}, ${tiltedRight.vx}px/s`);

for (let i = 0; i < 25; i++) {
  await tilt(75, 0);
  await sleep(40);
}
await sleep(300);
const tiltedDown = await run(`
  const out = { y: Math.round(s.player.y), vy: Math.round(s.player.body.velocity.y) };
  return out;
`);
check('and the other axis works too',
  tiltedDown.y - tiltedRight.y > 60 && tiltedDown.vy > 0,
  `${tiltedRight.y} -> ${tiltedDown.y}, ${tiltedDown.vy}px/s`);

// Held level again, it stops.
for (let i = 0; i < 10; i++) {
  await tilt(45, 0);
  await sleep(40);
}
await sleep(300);
const levelled = await run(`
  return { vx: Math.round(s.player.body.velocity.x), vy: Math.round(s.player.body.velocity.y) };
`);
check('held level again, it stands still',
  Math.abs(levelled.vx) < 20 && Math.abs(levelled.vy) < 20,
  `${levelled.vx},${levelled.vy}px/s`);
await shot('touch-05-tilt');

// And the setting says the other way exists, which is what was missing.
await ev(`(() => {
  const raw = JSON.parse(localStorage.getItem('exiled-survivors:settings:v1') || '{}');
  raw.movementMode = 'floating';
  localStorage.setItem('exiled-survivors:settings:v1', JSON.stringify(raw));
  window.game.scene.getScene('GameScene').scene.start('MenuScene');
  return 1;
})()`);
await sleep(1700);
await ev(`(() => {
  const s = window.game.scene.getScene('MenuScene');
  const i = s.menu.rows.findIndex(r => r.item.id === 'settings');
  s.menu.selected = i; s.menu.refresh(); s.menu.rows[i].item.onSelect(); return i;
})()`);
await sleep(1200);
const row = await ev(`(() => {
  const s = window.game.scene.getScene('SettingsScene');
  s.menu.focus('movement');
  return { hint: s.hint.text, detail: s.menu.rows.find(r => r.item.id === 'movement').detail.text,
           left: Math.round(s.hint.x - s.hint.width / 2),
           right: Math.round(s.hint.x + s.hint.width / 2), canvas: s.scale.width };
})()`);
console.log('settings row:', JSON.stringify(row));
// Whichever way it is set to, the hint names the other one — that is the
// whole point: a setting nobody can tell is there may as well not be.
// Three ways since 0.117: the hint names the next one ▶ reaches, never the one it is on.
const ways = ['터치 위치에 생성', '기울이기', '탭으로 이동'];
const setTo = ways.findIndex((w) => row.detail.includes(w));
check('the 모바일 이동 방식 row names the way it is not set to',
  setTo >= 0 && row.hint.includes(ways[(setTo + 1) % ways.length]),
  `set to "${row.detail}", hint says: ${row.hint.split(String.fromCharCode(10))[1]}`);
// A refusal used to put the setting back, which made the row look broken:
// it would flick to 기울이기 and straight back to the pad with nothing said.
const refusal = await ev(`(() => {
  const s = window.game.scene.getScene('SettingsScene');
  s.menu.focus('movement');
  // Start from the pad, whatever the screen was left on.
  const mode = () => s.menu.rows.find(r => r.item.id === 'movement').detail.text;
  for (let i = 0; i < 3 && !mode().includes('터치'); i++) s.cycleMode(1);
  return { from: mode() };
})()`);
await sleep(700);
await ev(`(() => {
  window.DeviceOrientationEvent.requestPermission = () => Promise.resolve('denied');
  window.game.scene.getScene('SettingsScene').cycleMode(1);
  return 1;
})()`);
await sleep(900);
const afterRefusal = await ev(`(() => {
  const s = window.game.scene.getScene('SettingsScene');
  return { detail: s.menu.rows.find(r => r.item.id === 'movement').detail.text,
           hint: s.hint.text,
           refused: s.hint.text.includes(window.game.scene.getScene('SettingsScene')
             .sys.settings.key ? '' : '') };
})()`);
console.log('a refused sensor:', JSON.stringify({ refusal, afterRefusal }));
check('a refused sensor leaves the choice standing rather than undoing it',
  afterRefusal.detail.includes('기울이기'),
  `was "${refusal.from}", now "${afterRefusal.detail}"`);
check('and says why instead',
  afterRefusal.hint.includes('기기') || afterRefusal.hint.length > 0,
  afterRefusal.hint.split(String.fromCharCode(10))[0]);

check('and the hint fits across a phone instead of running off both sides',
  row.left >= 0 && row.right <= row.canvas,
  `${row.left}..${row.right} of ${row.canvas}`);

// --- 탭으로 이동 (0.117): the survivor walks to where the screen was pressed ---
await cdp.evaluate(`(() => {
  const raw = localStorage.getItem('exiled-survivors:settings:v1');
  localStorage.setItem('exiled-survivors:settings:v1', JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), movementMode: 'tap' }));
  return 1;
})()`);
await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await cdp.until(`window.game?.scene.getScene('GameScene')?.player?.active`, 30000, 200);
await sleep(1200);
const where = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  s.player.setInvulnerable(true); s.spawner.update = () => {}; s.spawner.clear();
  const cam = s.cameras.main;
  return { kind: s.player.analog?.constructor.name, x: s.player.x - cam.worldView.x, y: s.player.y - cam.worldView.y, startX: s.player.x };
})()`);
await touch('touchStart', where.x + 160, where.y);
await sleep(80);
await touch('touchEnd', 0, 0);
await sleep(250);
const walking = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  return { vx: Math.round(s.player.body.velocity.x), marker: s.player.analog.marker.visible };
})()`);
await sleep(1500);
const arrived = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  return { vx: Math.round(s.player.body.velocity.x), moved: Math.round(s.player.x), marker: s.player.analog.marker.visible };
})()`);
console.log('tap to move:', JSON.stringify({ where, walking, arrived }));
check('탭으로 이동: a tap sends the survivor walking there, the spot marked, even after the finger lifts',
  where.kind === 'TapMove' && walking.vx > 100 && walking.marker === true, JSON.stringify({ where, walking }));
check('and it stops there, about where the tap was, the mark gone',
  arrived.vx === 0 && arrived.marker === false && Math.abs(arrived.moved - (where.startX + 160)) < 30, JSON.stringify(arrived));
await shot('touch-06-tap');

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
