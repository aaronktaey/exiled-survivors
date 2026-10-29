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

/** Loads the game in a window of this size and reports how it fitted. */
const openAt = async (width, height, { touch = false } = {}) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 2, mobile: touch,
  });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 0 });
  // The override lands after the current document is already laid out, so
  // navigate first and then reload into the new viewport.
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
  await sleep(1200);
  await cdp.send('Page.reload', {});
  await sleep(4200);
  return ev(`(() => {
    const s = window.game.scale;
    const box = window.game.canvas.getBoundingClientRect();
    const host = document.getElementById('game-root').getBoundingClientRect();
    return {
      game: [s.width, s.height],
      css: [Math.round(box.width), Math.round(box.height)],
      host: [Math.round(host.width), Math.round(host.height)],
      fit: Number((box.width / s.width).toFixed(3)),
      window: [window.innerWidth, window.innerHeight],
    };
  })()`);
};

// --- 1. a desktop is exactly what it always was ---
const desktop = await openAt(1920, 1080);
console.log('desktop:', JSON.stringify(desktop));
// The ad columns take 160px a side, so the room for the game is not 16:9.
check('a desktop keeps the 540-unit design height',
  desktop.game[1] === 540, `${desktop.game.join('x')}`);
check('and a canvas the shape of the room it has',
  Math.abs(desktop.game[0] / desktop.game[1] - desktop.host[0] / desktop.host[1]) < 0.02,
  `canvas ${(desktop.game[0] / desktop.game[1]).toFixed(2)} vs room ${(desktop.host[0] / desktop.host[1]).toFixed(2)}`);
check('drawn larger than life, as it always was',
  desktop.fit > 1.5, `${desktop.fit}x`);

// --- 2. a phone held upright gets a canvas its own shape ---
const portrait = await openAt(390, 844, { touch: true });
console.log('portrait phone:', JSON.stringify(portrait));
const aspectOf = (s) => s[1] / s[0];
check('the canvas is portrait, like the screen',
  portrait.game[1] > portrait.game[0],
  portrait.game.join('x'));
check('and the same shape as it, near enough',
  Math.abs(aspectOf(portrait.game) - aspectOf(portrait.window)) < 0.2,
  `canvas ${aspectOf(portrait.game).toFixed(2)} vs screen ${aspectOf(portrait.window).toFixed(2)}`);
// A phone keeps the game inset from the glass (style.css .touch), so the
// canvas fills the room inside that, not the whole window.
check('nothing is letterboxed away inside the room it has',
  Math.abs(portrait.css[0] - portrait.host[0]) <= 2 ||
    Math.abs(portrait.css[1] - portrait.host[1]) <= 2,
  `canvas ${portrait.css.join('x')} in a ${portrait.host.join('x')} room (${portrait.window.join('x')} window)`);
check('and it is drawn near 1:1 rather than at two fifths',
  portrait.fit > 0.75, `${portrait.fit}x, where 960x540 gave 0.41x`);
await shot('resp-01-portrait');

// --- 3. the readout and the menus follow it ---
const hud = await run(`
  const h = s.hud;
  return {
    width: s.scale.width,
    skills: { x: Math.round(h.barBounds.x), y: Math.round(h.barBounds.y),
              right: Math.round(h.barBounds.right) },
    count: { bottom: Math.round(h.enemiesLabel.y + h.enemiesLabel.height) },
    clock: { x: Math.round(h.clockLabel.x), left: Math.round(h.clockLabel.x - h.clockLabel.width / 2),
             bottom: Math.round(h.clockLabel.y + h.clockLabel.height) },
  };
`);
console.log('hud:', JSON.stringify(hud));
check('the loadout drops under the clock instead of through it',
  hud.skills.y >= hud.clock.bottom && hud.skills.y >= hud.count.bottom,
  `loadout at y=${hud.skills.y}, clock ends at ${hud.clock.bottom}, count at ${hud.count.bottom}`);
check('and still fits the width', hud.skills.right <= hud.width,
  `${hud.skills.right} of ${hud.width}`);

await ev(`(() => { window.game.scene.getScene('GameScene').scene.start('MenuScene'); return 1; })()`);
await sleep(1600);
const menu = await ev(`(() => {
  const s = window.game.scene.getScene('MenuScene');
  const w = s.scale.width, h = s.scale.height;
  const row = s.menu.rows[0];
  const b = s.icons.bounds;
  return {
    w, h,
    rowWidth: Math.round(row.panel.width),
    firstY: Math.round(row.panel.y),
    rowBottom: Math.round(row.panel.y + row.panel.height / 2),
    icons: { top: Math.round(b.y), bottom: Math.round(b.bottom), left: Math.round(b.x), right: Math.round(b.right) },
    logo: Math.round(s.children.list.find(o => o.type === 'Image' && o.texture?.key === window.config.TEXTURES.logo).displayWidth),
  };
})()`);
console.log('title:', JSON.stringify(menu));
check('a row fits inside the screen', menu.rowWidth <= menu.w - 20,
  `${menu.rowWidth} of ${menu.w}`);
check('the logo fits too', menu.logo <= menu.w, `${menu.logo} of ${menu.w}`);
check('the title is centred rather than bunched at the top',
  menu.firstY > menu.h * 0.25 && menu.icons.bottom < menu.h * 0.92,
  `게임 시작 at ${menu.firstY}, icons down to ${menu.icons.bottom} of ${menu.h}`);
// 0.150 (the user's ask): on a phone the icons sit in the room under 게임 시작.
check('on a phone the icons sit under 게임 시작, inside the screen',
  menu.icons.top > menu.rowBottom && menu.icons.left >= 0 && menu.icons.right <= menu.w, JSON.stringify(menu.icons));
await shot('resp-02-title');

// --- 4. a phone on its side, and a small one ---
const landscape = await openAt(844, 390, { touch: true });
console.log('landscape phone:', JSON.stringify(landscape));
check('a phone on its side gets a landscape canvas, drawn near 1:1',
  landscape.game[0] > landscape.game[1] && landscape.fit > 0.75,
  `${landscape.game.join('x')} at ${landscape.fit}x`);

const small = await openAt(360, 640, { touch: true });
check('a small phone never goes below the layout floor',
  Math.min(...small.game) >= 420, small.game.join('x'));
check('and is still drawn well above a half',
  small.fit > 0.75, `${small.fit}x`);

// --- 5. four upgrade picks wrap rather than turning into slivers ---
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(1200);
await cdp.send('Page.reload', {});
await sleep(4200);
await run(`s.onSkillCollected('fireball'); return 1;`);
await sleep(700);
await cdp.tap('Space', 32, ' ');
await sleep(700);
await run(`s.onSkillCollected('fireball'); return 1;`);
await sleep(900);
const cards = await ev(`(() => {
  const u = window.game.scene.getScene('UpgradeScene');
  if (!u || !u.cards) return null;
  return {
    count: u.cards.length,
    width: Math.round(u.cards[0].panel.width),
    rows: [...new Set(u.cards.map(c => Math.round(c.y)))].length,
    xs: u.cards.map(c => Math.round(c.x)),
    screen: u.scale.width,
  };
})()`);
console.log('cards:', JSON.stringify(cards));
check('a skill’s picks on a phone wrap onto more than one row',
  cards !== null && cards.count >= 3 && cards.rows >= 2,
  cards ? `${cards.count} cards over ${cards.rows} rows at ${cards.width}px` : 'no popup');
check('and each card is wide enough to read',
  cards !== null && cards.width >= 150, `${cards?.width}px on a ${cards?.screen}px screen`);
await shot('resp-03-upgrade');

// --- 6. changing the steering mid-run takes effect at once ---
// A clean slate, so the mode this starts on is the default one.
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4300);

const before = await run(`
  const a = s.player.analog;
  return {
    kind: a ? a.constructor.name : null,
    visible: a && a.base ? a.base.visible : null,
    circles: s.children.list.filter(o => o.type === 'Arc').length,
  };
`);
console.log('steering before:', JSON.stringify(before));
check('a touch session starts on the pad that comes to your finger',
  before.kind === 'VirtualJoystick' && before.visible === false,
  `${before.kind}, waiting out of sight`);

// Pause, walk into 설정, and change the mode the way a player would.
await cdp.tap('Escape', 27, 'Escape');
await sleep(900);
await ev(`(() => {
  const p = window.game.scene.getScene('PauseScene');
  const i = p.menu.rows.findIndex(r => r.item.id === 'settings');
  p.menu.selected = i; p.menu.refresh(); return i;
})()`);
await cdp.tap('Space', 32, ' ');
await sleep(900);
await ev(`(() => {
  const s = window.game.scene.getScene('SettingsScene');
  const i = s.menu.rows.findIndex(r => r.item.id === 'movement');
  s.menu.selected = i; s.menu.refresh(); return i;
})()`);
await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(700);

const after = await ev(`(() => {
  const raw = JSON.parse(localStorage.getItem('exiled-survivors:settings:v1'));
  const s = window.game.scene.getScene('GameScene');
  const a = s.player.analog;
  return {
    mode: raw.movementMode,
    kind: a ? a.constructor.name : null,
    circles: s.children.list.filter(o => o.type === 'Arc').length,
  };
})()`);
console.log('steering after:', JSON.stringify(after));
check('기울이기 applies without waiting for the next run',
  after.mode === 'tilt' && after.kind === 'TiltInput',
  `${after.mode} -> ${after.kind}`);
check('and the pad is gone rather than left on screen',
  after.circles < before.circles,
  `${after.circles} circles, was ${before.circles}`);
await shot('resp-04-tilt');

// One more step is 탭으로 이동 (0.117), at once as well.
await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(700);
const tapping = await ev(`(() => {
  const raw = JSON.parse(localStorage.getItem('exiled-survivors:settings:v1'));
  const a = window.game.scene.getScene('GameScene').player.analog;
  return { mode: raw.movementMode, kind: a ? a.constructor.name : null };
})()`);
check('탭으로 이동 applies at once too', tapping.mode === 'tap' && tapping.kind === 'TapMove', `${tapping.mode} -> ${tapping.kind}`);

// And one more wraps back round to the pad.
await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(700);
const wrapped = await ev(`(() => {
  const raw = JSON.parse(localStorage.getItem('exiled-survivors:settings:v1'));
  const s = window.game.scene.getScene('GameScene');
  const a = s.player.analog;
  return { mode: raw.movementMode, kind: a ? a.constructor.name : null,
           circles: s.children.list.filter(o => o.type === 'Arc').length };
})()`);
console.log('wrapped:', JSON.stringify(wrapped));
check('and one more wraps back to the pad, after the three',
  wrapped.mode === 'floating' && wrapped.kind === 'VirtualJoystick' &&
    wrapped.circles === before.circles,
  `${wrapped.mode} -> ${wrapped.kind}`);

await cdp.tap('Escape', 27, 'Escape');
await sleep(800);
await cdp.tap('Escape', 27, 'Escape');
await sleep(800);
const live = await run(`
  const a = s.player.analog;
  return { kind: a ? a.constructor.name : null, over: s.over };
`);
check('and the run carries on with it', live.kind === 'VirtualJoystick' && live.over === false,
  `${live.kind}`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 0 });

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
