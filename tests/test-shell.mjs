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
const game = (body) => cdp.evaluate(`(() => { const g = window.game; ${body} })()`);
const scene = (key, body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('${key}'); ${body} })()`);
const active = () => game(`return {
  menu: g.scene.isActive('MenuScene'), run: g.scene.isActive('GameScene'),
  paused: g.scene.isPaused('GameScene'), pause: g.scene.isActive('PauseScene'),
  settings: g.scene.isActive('SettingsScene'), credits: g.scene.isActive('CreditsScene'),
  over: g.scene.isActive('GameOverScene'),
};`);
const space = async () => { await cdp.tap('Space', 32, ' '); await sleep(400); };
const down = async () => { await cdp.tap('ArrowDown', 40, 'ArrowDown'); await sleep(200); };
const esc = async () => { await cdp.tap('Escape', 27, 'Escape'); await sleep(450); };
const choose = async (key, id) => {
  const index = await cdp.evaluate(`(() => {
    const s = window.game.scene.getScene('${key}');
    const i = s.menu.rows.findIndex((r) => r.item.id === '${id}');
    s.menu.selected = i;
    s.menu.refresh();
    return i;
  })()`.replace("${key}", key).replace("${id}", id));
  await space();
  return index;
};
const selectRow = (key, id) => cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('${key}');
  const i = s.menu.rows.findIndex((r) => r.item.id === '${id}');
  s.menu.selected = i;
  s.menu.refresh();
  return i;
})()`.replace('${key}', key).replace('${id}', id));
const stored = (key) => ev(`(() => { const raw = localStorage.getItem('${key}'); return raw ? JSON.parse(raw) : null; })()`);

/** Clicks a point in game coordinates, through the scaled canvas. */
const clickAt = async (gx, gy) => {
  const at = await ev(`(() => {
    const s = window.game.scale;
    return { x: s.canvasBounds.x + ${gx} / s.displayScale.x, y: s.canvasBounds.y + ${gy} / s.displayScale.y };
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  }
  await sleep(400);
};

// Start from a clean slate: no settings, no save.
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(4200);

// --- 1. the game opens on the title, not in a run ---
const atBoot = await active();
console.log('boot:', JSON.stringify(atBoot));
check('boot lands on the title screen', atBoot.menu === true && atBoot.run === false,
  `menu=${atBoot.menu} run=${atBoot.run}`);

const menu = await scene('MenuScene', `
  const rows = s.menu.rows.map(r => ({ id: r.item.id, label: r.item.label(),
    detail: r.item.detail ? r.item.detail() : '', enabled: r.item.enabled ? r.item.enabled() : true }));
  const logo = s.children.list.find(o => o.texture && o.texture.key === 'tex-logo');
  return { rows, logo: logo ? { y: logo.y, w: Math.round(logo.displayWidth), h: Math.round(logo.displayHeight) } : null };
`);
console.log('menu:', JSON.stringify(menu));
// "Settings" stays English while there is a Language row to find there (LOCALE.choosable).
const choosable = await ev(`(() => window.config.LOCALE.choosable)()`);
check('every entry is there, in order',
  JSON.stringify(menu.rows.map(r => r.label)) ===
    JSON.stringify(['게임 시작', '불러오기', choosable ? 'Settings' : '설정', '게임 가이드', '패치노트']),
  menu.rows.map(r => r.label).join(' / '));
check('불러오기 is dim and says so with no save',
  menu.rows[1].enabled === false && menu.rows[1].detail === '저장 없음', menu.rows[1].detail);

// --- 2. the logo is a pixel-art texture, and it drifts ---
const logoTex = await scene('MenuScene', `
  const img = s.textures.get('tex-logo').getSourceImage();
  return { w: img.width, h: img.height };
`);
check('the logo is baked from the pixel font', logoTex.w > 200 && logoTex.h > 60,
  `${logoTex.w}x${logoTex.h}px texture`);

// Sampled a few times over a couple of seconds: two samples alone can land
// on the same height of the swing when the machine is busy.
const bobs = [];
for (let i = 0; i < 6; i++) {
  bobs.push((await scene('MenuScene', `return s.children.list.find(o => o.texture && o.texture.key === 'tex-logo').y;`)));
  await sleep(330);
}
const bobA = { y: Math.min(...bobs) };
const bobB = { y: Math.max(...bobs) };
check('the logo bobs up and down', Math.abs(bobA.y - bobB.y) > 1.5,
  `y ${bobA.y.toFixed(1)} -> ${bobB.y.toFixed(1)}`);

const byline = await scene('MenuScene', `
  return { lines: s.children.list.filter(o => o.type === 'Text').map(o => o.text) };
`);
check('the line under the logo is the byline',
  byline.lines.includes('created by whitemango') && !byline.lines.includes('추방자 생존기'),
  byline.lines.filter(l => !l.includes('이동')).join(' | '));
await shot('shell-01-title');

// --- the reserved ad columns wear the logo while they are empty ---
const columns = await ev(`(() => {
  const left = document.getElementById('ad-left');
  const right = document.getElementById('ad-right');
  const style = getComputedStyle(left);
  const was = left.innerHTML;
  left.innerHTML = '<div style="width:10px;height:10px"></div>';
  const filled = getComputedStyle(left).backgroundImage;
  left.innerHTML = was;
  return {
    text: (left.textContent + right.textContent).trim(),
    isLogo: style.backgroundImage.indexOf('data:image/png') > 0,
    filled,
  };
})()`);
console.log('ad columns:', JSON.stringify(columns));
check('the ad columns wear the logo instead of a label',
  columns.text === '' && columns.isLogo === true,
  `text="${columns.text}", logo watermark=${columns.isLogo}`);
check('a banner dropped in takes the watermark away', columns.filled === 'none',
  `background with a child: ${columns.filled}`);

// --- 3. the keyboard walks the list, skipping what it cannot use ---
await down();
const afterOneDown = await scene('MenuScene', `return { id: s.menu.selectedId };`);
check('down skips the disabled 불러오기 row', afterOneDown.id === 'settings',
  `landed on ${afterOneDown.id}`);

// --- 4. 제작자 정보, now one level down under Settings ---
await choose('MenuScene', 'settings');
await choose('SettingsScene', 'credits');
const credits = await active();
check('제작자 정보 opens from 설정', credits.credits === true,
  `credits=${credits.credits}`);
const creditLines = await scene('CreditsScene', `
  return { text: s.children.list.filter(o => o.type === 'Text').map(o => o.text).join(' | ') };
`);
check('the credits name who made it and what with',
  /whitemango/.test(creditLines.text) && /Phaser/.test(creditLines.text),
  creditLines.text.slice(0, 90));
await shot('shell-02-credits');
await esc();
await sleep(400);
await esc();
await sleep(400);
const backFromCredits = await active();
check('closing both hands the title back',
  backFromCredits.menu === true && backFromCredits.credits === false && backFromCredits.settings === false);

// --- 5. 설정: the stick's size and place, tilt, music ---
await choose('MenuScene', 'settings');
const inSettings = await active();
check('설정 opens over the title', inSettings.settings === true && inSettings.menu === false);

const rows = await scene('SettingsScene', `
  return { labels: s.menu.rows.map(r => r.item.label()), details: s.menu.rows.map(r => r.item.detail ? r.item.detail() : ''),
           tabs: [...s.tabs.keys()], tab: s.tab };
`);
console.log('settings rows:', JSON.stringify(rows));
// Since 0.105 in tabs (조작 · 소리 · 화면), 조작 open first: pad size and movement, then the three every tab has.
void choosable;
check('설정 has three tabs, 조작 open first: pad size and movement, and no place setting',
  JSON.stringify(rows.tabs) === JSON.stringify(['controls', 'sound', 'display']) && rows.tab === 'controls' &&
    rows.labels[0].includes('크기') && rows.labels[1].includes('이동 방식') && !rows.labels.includes('Language') &&
    !rows.labels.some((l) => l.includes('위치')),
  rows.labels.join(' / '));

// Size: right arrow on the first row.
await selectRow('SettingsScene', 'joystickScale');
const sizeBefore = await scene('SettingsScene', `return { radius: s.previewBase.radius, detail: s.menu.rows.find(r => r.item.id === 'joystickScale').item.detail() };`);
for (let i = 0; i < 3; i++) { await cdp.tap('ArrowRight', 39, 'ArrowRight'); await sleep(150); }
const sizeAfter = await scene('SettingsScene', `return { radius: s.previewBase.radius, detail: s.menu.rows.find(r => r.item.id === 'joystickScale').item.detail() };`);
const savedSettings = await stored('exiled-survivors:settings:v1');
console.log('size:', JSON.stringify({ sizeBefore, sizeAfter, savedSettings }));
check('터치패드 크기 grows the live preview', sizeAfter.radius > sizeBefore.radius,
  `${sizeBefore.radius}px -> ${sizeAfter.radius}px (${sizeAfter.detail.trim()})`);
check('the new size is written to storage', savedSettings.joystickScale > 1,
  `scale=${savedSettings.joystickScale}`);

// Movement: two ways to steer, cycled with the arrows. The pinned pad is
// gone — the pad comes to whichever finger lands.
await selectRow('SettingsScene', 'movement');
const startMode = await stored('exiled-survivors:settings:v1');
check('it starts on 터치 위치에 생성', startMode.movementMode === 'floating',
  `mode=${startMode.movementMode}`);

await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(300);
const tiltMode = await stored('exiled-survivors:settings:v1');
const tiltRow = await scene('SettingsScene', `
  return { mode: s.menu.rows.find(r => r.item.id === 'movement').item.detail(),
           preview: s.previewBase.visible };`);
check('→ reaches 기울이기, and the pad preview goes with it',
  tiltMode.movementMode === 'tilt' && tiltRow.preview === false,
  `mode=${tiltMode.movementMode} "${tiltRow.mode.trim()}"`);

await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(300);
const tapMode = await stored('exiled-survivors:settings:v1');
const tapRow = await scene('SettingsScene', `
  return { mode: s.menu.rows.find(r => r.item.id === 'movement').item.detail(), preview: s.previewBase.visible };`);
check('→ again reaches 탭으로 이동 (0.117), with no pad to preview either',
  tapMode.movementMode === 'tap' && /탭으로 이동/.test(tapRow.mode) && tapRow.preview === false,
  `mode=${tapMode.movementMode} "${tapRow.mode.trim()}"`);

await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(300);
const wrapped = await stored('exiled-survivors:settings:v1');
check('and it wraps back round to the pad after the three',
  wrapped.movementMode === 'floating', `mode=${wrapped.movementMode}`);
await shot('shell-03-settings-movement');

// Music volume: on the 소리 tab since 0.105.
await scene('SettingsScene', `s.openTab('sound'); return 1;`);
await sleep(600);
await selectRow('SettingsScene', 'bgm');
for (let i = 0; i < 2; i++) { await cdp.tap('ArrowLeft', 37, 'ArrowLeft'); await sleep(150); }
const volume = await stored('exiled-survivors:settings:v1');
check('배경음 음량 steps down', volume.bgmVolume < 0.35, `volume=${volume.bgmVolume.toFixed(2)}`);

// Effects volume: its own row, and every effect plays under it.
await selectRow('SettingsScene', 'sfx');
for (let i = 0; i < 5; i++) { await cdp.tap('ArrowLeft', 37, 'ArrowLeft'); await sleep(150); }
const effects = await stored('exiled-survivors:settings:v1');
const heard = await scene('SettingsScene', `
  const played = [];
  const real = s.sound.play.bind(s.sound);
  s.sound.play = (key, config) => { played.push({ key, volume: config?.volume }); return real(key, config); };
  s.menu.rows.find(r => r.item.id === 'sfx').item.onAdjust(1);
  s.sound.play = real;
  const clip = window.config.AUDIO.skills.meleeStrike;
  return { played, clip: clip ? clip.volume : null,
           level: JSON.parse(localStorage.getItem('exiled-survivors:settings:v1')).sfxVolume,
           bgmAfter: JSON.parse(localStorage.getItem('exiled-survivors:settings:v1')).bgmVolume };
`);
console.log('effects:', JSON.stringify({ effects, heard }));
check('효과음 음량 is a row of its own that steps down, and leaves the music alone',
  Math.abs(effects.sfxVolume - 0.5) < 1e-9 && heard.bgmAfter === volume.bgmVolume,
  `effects=${effects.sfxVolume} music=${heard.bgmAfter}`);
check('and a step plays a sample at the new level, the clip’s own volume scaled by it',
  heard.played.length > 0 && heard.clip !== null &&
    Math.abs(heard.played[0].volume - heard.clip * heard.level) < 1e-9,
  JSON.stringify(heard.played));
await shot('shell-04-settings');

// --- 5. the background music is the requested track ---
const audio = await scene('MenuScene', `
  const key = 'bgm-main';
  const track = s.game.registry.get('bgm-track');
  return {
    inCache: s.cache.audio.exists(key),
    playing: track ? track.isPlaying : false,
    loop: track ? track.loop : null,
    volume: track ? Number(track.volume.toFixed(2)) : null,
  };
`);
console.log('bgm:', JSON.stringify(audio));
check('Constance is loaded as the background music', audio.inCache === true);
check('it loops, at the volume from the settings',
  audio.loop === true && audio.volume === Number(volume.bgmVolume.toFixed(2)),
  `loop=${audio.loop} volume=${audio.volume}`);

await esc();
const backFromSettings = await active();
check('Esc leaves 설정', backFromSettings.menu === true && backFromSettings.settings === false);

// --- 6. 게임 시작 ---
await choose('MenuScene', 'start');
await sleep(1200);
const started = await active();
check('게임 시작 starts a run', started.run === true && started.menu === false);

// --- 7. pausing: Esc, the corner button, and the back gesture ---
await esc();
const pausedByEsc = await active();
check('Esc pauses the run', pausedByEsc.pause === true && pausedByEsc.paused === true,
  `pause scene=${pausedByEsc.pause}, run paused=${pausedByEsc.paused}`);
await shot('shell-05-pause');
await esc();
const resumed = await active();
check('Esc again resumes', resumed.pause === false && resumed.paused === false);

await clickAt(27, 27);
const pausedByButton = await active();
check('the corner button pauses', pausedByButton.pause === true, `pause=${pausedByButton.pause}`);
await esc();
await sleep(300);

await ev(`(() => { window.history.back(); return 1; })()`);
await sleep(700);
const pausedByBack = await active();
check('the browser back gesture pauses instead of leaving',
  pausedByBack.pause === true && pausedByBack.paused === true,
  `pause scene=${pausedByBack.pause}, run frozen=${pausedByBack.paused}`);

// --- 8. the pause menu writes a save ---
const saveWhilePaused = await stored('exiled-survivors:save:v1');
console.log('save:', JSON.stringify(saveWhilePaused));
check('pausing writes the run out',
  saveWhilePaused !== null && saveWhilePaused.version === 1 && saveWhilePaused.elapsedMs > 0,
  `lv ${saveWhilePaused?.level}, ${Math.round((saveWhilePaused?.elapsedMs ?? 0) / 1000)}s, skills ${Object.keys(saveWhilePaused?.skills ?? {})}`);

// Give the run something to remember, then quit to the title. The marker
// sits above the skill's base: a restore never takes a stat under it (0.83).
const MARK = await ev(`(() => window.config.SKILL_BASE.meleeStrike.damage + 42)()`);
await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  s.progression.level = 6;
  s.progression.statsFor('meleeStrike').damage = ${MARK};
  s.onSkillCollected('fireball');
  s.player.hp = 11;
  s.elapsedMs = 95000;
  return 1;
})()`);
await choose('PauseScene', 'quit');
await sleep(900);
const quit = await active();
check('저장하고 타이틀로 returns to the title', quit.menu === true && quit.run === false);

const savedRun = await stored('exiled-survivors:save:v1');
check('the quit save holds the run that was played',
  savedRun.level === 6 && savedRun.hp === 11 && savedRun.skills.meleeStrike.damage === MARK &&
  Boolean(savedRun.skills.fireball),
  `lv ${savedRun.level} hp ${savedRun.hp} dmg ${savedRun.skills.meleeStrike.damage} skills ${Object.keys(savedRun.skills)}`);

// --- 9. 불러오기 ---
const loadRow = await scene('MenuScene', `
  return { detail: s.menu.rows[1].item.detail(), enabled: s.menu.rows[1].item.enabled() };
`);
check('불러오기 lights up and summarises the save',
  loadRow.enabled === true && /Lv 6/.test(loadRow.detail), loadRow.detail);

await choose('MenuScene', 'load');
await sleep(1400);
const loaded = await scene('GameScene', `
  return {
    level: s.progression.level, hp: s.player.hp, damage: s.progression.statsFor('meleeStrike').damage,
    elapsed: Math.round(s.elapsedMs / 1000), owned: [...s.owned],
    clock: s.hud.clockLabel.text, spawnerMs: Math.round(s.spawner.clockMs / 1000),
  };
`);
console.log('loaded:', JSON.stringify(loaded));
check('불러오기 puts the run back together',
  loaded.level === 6 && loaded.hp === 11 && loaded.damage === MARK && loaded.owned.includes('fireball'),
  `lv ${loaded.level} hp ${loaded.hp} dmg ${loaded.damage} skills ${loaded.owned}`);
check('the clock resumes where it stopped', loaded.elapsed >= 95,
  `${loaded.clock} (${loaded.elapsed}s)`);
await shot('shell-06-loaded');

// --- 10. dying throws the save away ---
await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  s.player.invulnerableUntil = 0;
  s.player.takeDamage(9999);
  return 1;
})()`);
await sleep(900);
const dead = await active();
const afterDeath = await stored('exiled-survivors:save:v1');
check('death ends the run and clears the save',
  dead.over === true && afterDeath === null, `save=${afterDeath === null ? 'cleared' : 'still there'}`);

// --- 9. an overlay always draws over whatever opened it ---
// Phaser renders scenes in the order the game added them, not the order
// they were opened, so 설정 from the end-of-run screen used to draw under
// it and the two read on top of each other.
const ordering = async (opened, opener) =>
  ev(`(() => {
    const list = window.game.scene.scenes.map(s => s.scene.key);
    return { order: list, above: list.indexOf('${opened}') > list.indexOf('${opener}') };
  })()`);

await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(4200);
await scene('GameScene', `
  s.player.invulnerableUntil = 0;
  s.player.takeDamage(99999);
  return 1;
`);
await sleep(1300);
const died = await ev(`({ over: window.game.scene.isActive('GameOverScene') })`);
check('the end-of-run screen opens on a death', died.over === true);

await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameOverScene');
  const i = s.menu.rows.findIndex(r => r.item.id === 'settings');
  s.menu.selected = i; s.menu.refresh(); return i;
})()`);
await cdp.tap('Space', 32, ' ');
await sleep(1100);
const stacked = await ordering('SettingsScene', 'GameOverScene');
const shown = await ev(`(() => {
  const g = window.game;
  const settings = g.scene.getScene('SettingsScene');
  const gameOver = g.scene.getScene('GameOverScene');
  return {
    settingsUp: g.scene.isActive('SettingsScene'),
    gameOverPaused: g.scene.isPaused('GameOverScene'),
    scrim: settings.children.list.find(o => o.type === 'Rectangle')?.fillAlpha ?? null,
    words: gameOver.children.list.filter(o => o.type === 'Text').map(o => o.text)[0] ?? null,
  };
})()`);
console.log('settings over game over:', JSON.stringify({ ...stacked, ...shown }));
check('설정 opened from it draws over it, not under',
  stacked.above === true && shown.settingsUp === true,
  stacked.order.slice(-3).join(' < '));
check('and its backdrop is opaque, so nothing shows through',
  shown.scrim === 1, `alpha ${shown.scrim}`);
await shot('shell-09-settings-over-gameover');

await cdp.tap('Escape', 27, 'Escape');
await sleep(900);
const back = await ev(`({
  over: window.game.scene.isActive('GameOverScene'),
  settings: window.game.scene.isActive('SettingsScene'),
})`);
check('closing it hands the end-of-run screen back',
  back.over === true && back.settings === false,
  `gameOver=${back.over} settings=${back.settings}`);


console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
