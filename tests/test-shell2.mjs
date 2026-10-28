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
const scene = (key, body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('${key}'); ${body} })()`);
const active = () => ev(`(() => {
  const g = window.game;
  return {
    menu: g.scene.isActive('MenuScene'), confirm: g.scene.isActive('ConfirmScene'),
    settings: g.scene.isActive('SettingsScene'), credits: g.scene.isActive('CreditsScene'),
    run: g.scene.isActive('GameScene'),
  };
})()`);
const choose = async (key, id) => {
  await ev(`(() => {
    const s = window.game.scene.getScene('${key}');
    const i = s.menu.rows.findIndex((r) => r.item.id === '${id}');
    // 설정, 가이드 and 패치노트 are title icons since 0.150.
    if (i < 0 && s.icons?.press('${id}')) return -2;
    s.menu.selected = i;
    s.menu.refresh();
    // The row's own action, the one Space runs: a key sent while the page
    // is busy now and then never arrives, and the screen it opens is not.
    s.menu.rows[i].item.onSelect();
    return i;
  })()`);
  await sleep(600);
};
const save = () => ev(`(() => { const raw = localStorage.getItem('exiled-survivors:save:v1'); return raw ? JSON.parse(raw) : null; })()`);

await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(4200);

// --- 1. the tab icon ---
const icon = await ev(`(() => {
  const link = document.querySelector('link[rel="icon"]');
  return { href: link ? link.getAttribute('href') : null, type: link ? link.type : null };
})()`);
const iconFetch = await ev(`(async () => {
  const res = await fetch(new URL('assets/logo.png', document.baseURI).href, { method: 'HEAD' });
  return { status: res.status, type: res.headers.get('content-type') };
})()`);
console.log('icon:', JSON.stringify(icon));
check('the tab icon points at the logo file',
  icon.href === './assets/logo.png' && icon.type === 'image/png', `${icon.href}`);

// --- 2. 제작자 정보 moved under Settings ---
const menuRows = await scene('MenuScene', `return { ids: s.menu.rows.map(r => r.item.id) };`);
check('the title no longer lists 제작자 정보',
  !menuRows.ids.includes('credits'), menuRows.ids.join(' / '));

await choose('MenuScene', 'settings');
const settingsRows = await scene('SettingsScene', `
  return { ids: s.menu.rows.map(r => r.item.id), labels: s.menu.rows.map(r => r.label.text) };
`);
console.log('settings rows:', JSON.stringify(settingsRows.labels));
check('설정 lists it instead', settingsRows.ids.includes('credits'),
  settingsRows.labels.join(' / '));

await choose('SettingsScene', 'credits');
const credits = await active();
const creditLines = await scene('CreditsScene', `
  return { text: s.children.list.filter(o => o.type === 'Text').map(o => o.text).join(' | ') };
`);
console.log('credits:', creditLines.text);
check('it opens over 설정', credits.credits === true && credits.settings === false);
check('it still names who made it and what with',
  /whitemango/.test(creditLines.text) && /Phaser/.test(creditLines.text),
  creditLines.text.slice(0, 80));
// The music is CC BY 4.0 (0.109): its title, author, source and licence are
// owed on screen. The icons are the game's own now, so no pack is named.
check('it credits the music as its licence asks, and names no icon pack',
  /Constance/.test(creditLines.text) && /Kevin MacLeod/.test(creditLines.text) &&
  /incompetech\.com/.test(creditLines.text) && /Attribution 4\.0/.test(creditLines.text) &&
  !/Raven Fantasy/.test(creditLines.text),
  creditLines.text);
await shot('shell2-01-credits');

await cdp.tap('Escape', 27, 'Escape');
await sleep(600);
check('closing it hands 설정 back', (await active()).settings === true);
await cdp.tap('Escape', 27, 'Escape');
await sleep(600);

// --- 3. a new run with nothing saved just starts ---
await choose('MenuScene', 'start');
await sleep(1400);
const straightIn = await active();
check('with no save, 게임 시작 goes straight in',
  straightIn.run === true && straightIn.confirm === false);

// Make a save worth warning about.
await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  s.progression.level = 7;
  s.elapsedMs = 123000;
  s.writeSave();
  return 1;
})()`);
const saved = await save();
check('the run wrote itself out', saved !== null && saved.level === 7, `lv ${saved?.level}`);

await cdp.tap('Escape', 27, 'Escape');
await sleep(600);
await choose('PauseScene', 'quit');
await sleep(900);

// --- 4. now 게임 시작 asks first ---
await choose('MenuScene', 'start');
const warned = await active();
check('게임 시작 warns when a run is saved',
  warned.confirm === true && warned.run === false, `confirm=${warned.confirm}`);

const dialog = await scene('ConfirmScene', `
  return {
    texts: s.children.list.filter(o => o.type === 'Text').map(o => o.text),
    ids: s.children.list.length ? undefined : undefined,
  };
`);
console.log('dialog:', JSON.stringify(dialog.texts));
check('it says what is at stake',
  dialog.texts.some(line => /지난 게임/.test(line)) &&
  dialog.texts.some(line => /Lv 7/.test(line)),
  dialog.texts.filter(Boolean).join(' | '));
await shot('shell2-02-confirm');

// Cancel leaves everything alone.
await cdp.tap('Escape', 27, 'Escape');
await sleep(700);
const cancelled = await active();
const stillSaved = await save();
check('cancelling returns to the title with the save intact',
  cancelled.menu === true && cancelled.confirm === false && stillSaved?.level === 7);

// Carrying on with it loads the run.
await choose('MenuScene', 'start');
await sleep(500);
await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('ConfirmScene');
  const i = s.children.list.length;
  return i;
})()`);
await choose('ConfirmScene', 'load');
await sleep(1500);
const loaded = await scene('GameScene', `return { level: s.progression.level, elapsed: Math.round(s.elapsedMs / 1000) };`);
check('"이어서 하기" picks the saved run up', loaded.level === 7 && loaded.elapsed >= 120,
  `lv ${loaded.level} at ${loaded.elapsed}s`);

// And starting anyway throws it away.
await cdp.tap('Escape', 27, 'Escape');
await sleep(600);
await choose('PauseScene', 'quit');
await sleep(900);
await choose('MenuScene', 'start');
await sleep(400);
await choose('ConfirmScene', 'overwrite');
await sleep(1500);
const fresh = await scene('GameScene', `return { level: s.progression.level, elapsed: Math.round(s.elapsedMs / 1000) };`);
check('"새로 시작" starts from nothing', fresh.level === 1 && fresh.elapsed < 10,
  `lv ${fresh.level} at ${fresh.elapsed}s`);

// --- 6. dying after 이어서 하기, then 다시하기 ---
// A restart with no data of its own keeps whatever the scene was last
// started with. After 이어서 하기 that is the loaded run, so 다시하기 used
// to put the death back exactly where it had been resumed from.
await ev(`(() => {
  localStorage.setItem('exiled-survivors:save:v1', window.sealRecord('exiled-survivors:save:v1', {
    version: 1, savedAt: Date.now(), elapsedMs: 480000, level: 9, xp: 5, hp: 22,
    skills: { meleeStrike: { damage: 15, cooldownMs: 1000, range: 90 } },
    spawnerMs: 480000,
  }));
  return 1;
})()`);
await cdp.send('Page.reload', {});
await sleep(4600);
// 불러오기 went in 0.150: 게임 시작 asks, and 이어서 하기 carries on.
await choose('MenuScene', 'start');
await cdp.until(`window.game.scene.isActive('ConfirmScene')`, 10000, 100);
await choose('ConfirmScene', 'load');
await sleep(2600);
const resumed = await scene('GameScene', `
  return { elapsed: Math.round(s.elapsedMs / 1000), level: s.progression.level,
           spawner: Math.round(s.spawner.clockMs / 1000),
           xp: s.progression.xp, unit: window.config.XP.unit };
`);
console.log('resumed:', JSON.stringify(resumed));
check('불러오기 picks the run up where it was left',
  resumed.level === 9 && resumed.elapsed >= 475,
  `lv ${resumed.level} at ${resumed.elapsed}s`);
// 0.120 counts XP in finer units: a save without `xpUnit` is from before.
check('a save from before the finer XP units has its XP scaled up',
  resumed.unit > 1 && resumed.xp === 5 * resumed.unit,
  `xp ${resumed.xp} (saved 5, unit ${resumed.unit})`);

await scene('GameScene', `s.player.invulnerableUntil = 0; s.player.takeDamage(99999); return 1;`);
await sleep(1600);
check('dying throws the save away',
  (await ev(`localStorage.getItem('exiled-survivors:save:v1')`)) === null,
  'nothing left in storage');

await choose('GameOverScene', 'retry');
await sleep(3000);
const again = await scene('GameScene', `
  return { elapsed: Math.round(s.elapsedMs / 1000), level: s.progression.level,
           hp: s.player.hp, maxHp: s.player.maxHp,
           spawner: Math.round(s.spawner.clockMs / 1000),
           skills: [...s.owned].length };
`);
console.log('다시하기:', JSON.stringify(again));
check('다시하기 after a death starts from nothing, not from where it resumed',
  again.level === 1 && again.elapsed < 15 && again.spawner < 15,
  `lv ${again.level} at ${again.elapsed}s, difficulty clock ${again.spawner}s`);
check('and on a full bar with only the starting skill',
  again.hp === again.maxHp && again.skills === 1,
  `${again.hp}/${again.maxHp}hp, ${again.skills} skill`);
await shot('shell2-04-restart');

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
