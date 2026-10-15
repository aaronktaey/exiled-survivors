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
const stored = () => ev(`(() => { const raw = localStorage.getItem('exiled-survivors:settings:v1'); return raw ? JSON.parse(raw) : null; })()`);
const choose = async (key, id) => {
  await cdp.evaluate(`(() => {
    const s = window.game.scene.getScene('${key}');
    const i = s.menu.rows.findIndex((r) => r.item.id === '${id}');
    s.menu.selected = i;
    s.menu.refresh();
    return i;
  })()`);
  await cdp.tap('Space', 32, ' ');
  await sleep(600);
};
const selectRow = (key, id) => cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('${key}');
  const i = s.menu.rows.findIndex((r) => r.item.id === '${id}');
  s.menu.selected = i;
  s.menu.refresh();
  return i;
})()`);
const settingsRows = () => scene('SettingsScene', `
  return { labels: s.menu.rows.map(r => r.label.text),
           details: s.menu.rows.map(r => r.detail.text) };
`);
// The drawn Text, not the label function: a screen can hold words it was
// built with while the function already returns the new language.
const menuLabels = () => scene('MenuScene', `return { labels: s.menu.rows.map(r => r.label.text) };`);

// Start clean so the first-run language detection is what the browser says.
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(4200);
// Anything the page throws is a failure, however quietly it happens.
await ev(`(() => {
  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errors.push('rejection: ' + String(e.reason)));
  return 1;
})()`);

// --- 1. it starts somewhere sensible and remembers nothing yet ---
const first = await stored();
const startLang = await ev(`(() => {
  const raw = localStorage.getItem('exiled-survivors:settings:v1');
  return { stored: raw ? JSON.parse(raw).language : null, browser: navigator.language };
})()`);
console.log('first run:', JSON.stringify({ first, startLang }));

// --- 2. the Language row is in 설정, labelled in English ---
await choose('MenuScene', 'settings');
const rows = await settingsRows();
console.log('settings rows:', JSON.stringify(rows.labels));
check('설정 has a Language row', rows.labels.includes('Language'), rows.labels.join(' / '));
check('it is the first row', rows.labels[0] === 'Language', rows.labels[0]);
check('its value is the language’s own name', rows.details[0] === '한국어', rows.details[0]);
await shot('i18n-01-settings-ko');

// --- 3. stepping through every language ---
await selectRow('SettingsScene', 'language');
const seen = [];
for (let i = 0; i < 4; i++) {
  await cdp.tap('ArrowRight', 39, 'ArrowRight');
  await sleep(500);
  const now = await settingsRows();
  const code = (await stored()).language;
  seen.push({ code, native: now.details[0], label: now.labels[0], second: now.labels[1] });
}
console.log('cycle:', JSON.stringify(seen));
check('→ walks through all four languages',
  JSON.stringify(seen.map(s => s.code)) === JSON.stringify(['en', 'ja', 'zh', 'ko']),
  seen.map(s => `${s.code} ${s.native}`).join(' / '));
check('the Language label stays "Language" in every one',
  seen.every(s => s.label === 'Language'), seen.map(s => s.label).join(' / '));
check('every other row does change',
  new Set(seen.map(s => s.second)).size === 4, seen.map(s => s.second).join(' / '));

// --- 4. in English, the whole shell follows ---
await selectRow('SettingsScene', 'language');
await cdp.tap('ArrowRight', 39, 'ArrowRight');   // ko -> en
await sleep(600);
const english = await settingsRows();
console.log('english settings:', JSON.stringify(english.labels));
check('설정 itself is in English now',
  english.labels.includes('Pad size') && english.labels.includes('Music volume'),
  english.labels.join(' / '));
await shot('i18n-02-settings-en');

await cdp.tap('Escape', 27, 'Escape');
await sleep(800);
const title = await menuLabels();
console.log('title in English:', JSON.stringify(title.labels));
check('the title rebuilt itself in English',
  JSON.stringify(title.labels) ===
    JSON.stringify(['New Run', 'Continue', 'Settings', 'How to Play', 'Patch Notes']),
  title.labels.join(' / '));
await shot('i18n-03-title-en');

// --- 5. the guide and the notes come through too ---
await choose('MenuScene', 'guide');
const guide = await scene('InfoScene', `
  // The chapters hold every line; the page only holds the open tab.
  const NL = String.fromCharCode(10);
  return {
    title: s.children.list.filter(o => o.type === 'Text')[0].text,
    chapters: s.chapters.map(c => c.title),
    tabs: s.tabEntries.map(e => e.text),
    text: s.chapters
      .map(c => c.title + NL + c.tabs.map(tb => tb.title + NL + tb.cards.map(
        k => [k.title, ...k.facts, ...k.lines].join(NL)).join(NL)).join(NL))
      .join(NL),
  };
`);
check('the guide is in English', guide.title === 'How to Play' && /The goal/.test(guide.text),
  guide.chapters.join(' / '));
check('its contents list and tabs are in English too',
  guide.chapters.join('/') === 'Basics/Combat/Skills/Enemies/Items/Progression' &&
    guide.tabs.join('/') === 'The goal/Controls/Mobile/Saving',
  `${guide.chapters.join(' / ')} — ${guide.tabs.join(' / ')}`);
check('skills, enemies and items are named in English',
  /Void Orb/.test(guide.text) && /Shooter/.test(guide.text) && /Chain Lightning/.test(guide.text) &&
    /Onigoroshi/.test(guide.text) && /White Mango/.test(guide.text));
const pctOf = await ev(`(() => {
  const p = (f) => Number((f * 100).toFixed(2)) + '%';
  return { rare: p(window.config.RARE.chance), skill: p(window.config.SKILL_DROP.chance) };
})()`);
check('the numbers still come from the config',
  guide.text.includes(pctOf.rare) && guide.text.includes(pctOf.skill),
  `${pctOf.rare}, ${pctOf.skill}`);
await shot('i18n-04-guide-en');
await cdp.tap('Escape', 27, 'Escape');
await sleep(600);

await choose('MenuScene', 'patch');
const patch = await scene('InfoScene', `return { text: s.page.list.map(o => o.text).join('\\n') };`);
check('the patch notes are in English',
  /Rare enemies/.test(patch.text) && !/희귀 적 추가/.test(patch.text),
  patch.text.split('\n')[1]?.slice(0, 60));
await cdp.tap('Escape', 27, 'Escape');
await sleep(600);

// --- 6. and it reaches into the run ---
await choose('MenuScene', 'start');
for (let i = 0; i < 20; i++) {
  await sleep(400);
  const ready = await cdp.evaluate(`(() => {
    const s = window.game.scene.getScene('GameScene');
    return { ok: !!(s && s.hud && s.hud.slots), active: window.game.scene.scenes.filter(x => x.scene.isActive()).map(x => x.scene.key) };
  })()`);
  if (ready.ok) break;
  const warn = await cdp.evaluate(`({ open: window.game.scene.isActive('ConfirmScene') })`);
  if (warn.open) await cdp.tap('Space', 32, ' ');
}
const run = await scene('GameScene', `
  return {
    intro: s.children.list.filter(o => o.type === 'Text').map(o => o.text),
    enemies: s.hud.enemiesLabel.text,
    skills: s.hud.loadoutText,
  };
`);
console.log('run text:', JSON.stringify(run));
check('the intro and HUD are in English',
  run.intro.some(line => /Exile, do something/.test(line)) &&
    /Enemies/.test(run.enemies),
  `${run.enemies} | ${run.skills}`);

const upgrade = await scene('GameScene', `
  s.progression.addXp(s.progression.xpToNext);
  return 1;
`);
await sleep(700);
const cards = await cdp.evaluate(`(() => {
  const u = window.game.scene.getScene('UpgradeScene');
  return { title: u.payload.title, labels: u.cards.map(c => c.option.label), details: u.cards.map(c => c.option.detail) };
})()`);
console.log('upgrade in English:', JSON.stringify(cards));
check('the upgrade screen is in English',
  cards.labels.some(l => /Damage \+/.test(l)) && cards.details.some(d => /Strike/.test(d)),
  `${cards.labels.join(' / ')} — ${cards.details[0]}`);
await shot('i18n-05-upgrade-en');
await cdp.tap('Space', 32, ' ');
await sleep(600);

// --- 7. a rare's tooltip, and a dropped skill's plate ---
const rare = await scene('GameScene', `
  s.spawner.clear();
  s.player.setInvulnerable(true);
  const rare = s.spawner.spawnRare();
  rare.target = undefined;
  rare.body.stop();
  s.rareTooltip.inspectAt(
    (rare.x - s.cameras.main.worldView.x), (rare.y - s.cameras.main.worldView.y));
  const drop = s.combat.skillDrops.get();
  drop.drop(s.player.x + 200, s.player.y, { id: 'voidOrb', name: '공허구체',
    tags: ['공허'], upgrades: ['damage'], summary: '' });
  return { tooltip: s.rareTooltip.text, title: s.rareTooltip.title.text, plate: drop.nameplate.text };
`);
console.log('rare + drop:', JSON.stringify(rare));
check('a rare lists its affixes in English',
  // Any affix can come up (거미 included), so: English words and no Hangul.
  rare.title === 'RARE' && /[A-Za-z]{3,}/.test(rare.tooltip) && !/[가-힣]/.test(rare.tooltip),
  `${rare.title}: ${rare.tooltip.replace(/\n/g, ' | ')}`);
check('a dropped skill is labelled in English', rare.plate === 'Void Orb', rare.plate);
await shot('i18n-06-run-en');

// --- 8. the choice survives a reload ---
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(4200);
const afterReload = await menuLabels();
const storedLang = (await stored()).language;
check('the language is remembered across a reload',
  storedLang === 'en' && afterReload.labels[0] === 'New Run',
  `${storedLang}: ${afterReload.labels.join(' / ')}`);

// --- 9. Japanese and Chinese render too ---
for (const [code, expected] of [['ja', 'ゲーム開始'], ['zh', '开始游戏']]) {
  await ev(`(() => {
    const raw = JSON.parse(localStorage.getItem('exiled-survivors:settings:v1'));
    localStorage.setItem('exiled-survivors:settings:v1', JSON.stringify({ ...raw, language: '${code}' }));
    return 1;
  })()`);
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(4000);
  const labels = await menuLabels();
  check(`the title renders in ${code}`, labels.labels[0] === expected,
    labels.labels.join(' / '));
  await shot(`i18n-07-title-${code}`);
}

// --- 10. the language is a title-screen decision ---
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(4200);

const titleRow = await menuLabels();
check('the title names 설정 in English whatever the language',
  titleRow.labels.includes('Settings'), titleRow.labels.join(' / '));

await choose('MenuScene', 'settings');
const fromTitle = await scene('SettingsScene', `
  const row = s.menu.rows.find(r => r.item.id === 'language');
  return { enabled: row.item.enabled ? row.item.enabled() : true, allow: s.payload.allowLanguage };
`);
check('from the title the language can be changed',
  fromTitle.enabled === true && fromTitle.allow === true, `enabled=${fromTitle.enabled}`);
await cdp.tap('Escape', 27, 'Escape');
await sleep(700);

await choose('MenuScene', 'start');
await sleep(1500);
await cdp.tap('Escape', 27, 'Escape');
await sleep(700);
await choose('PauseScene', 'settings');
const midRun = await scene('SettingsScene', `
  const row = s.menu.rows.find(r => r.item.id === 'language');
  return {
    enabled: row.item.enabled ? row.item.enabled() : true,
    hint: s.hint.text,
    before: (JSON.parse(localStorage.getItem('exiled-survivors:settings:v1') || 'null') || {}).language || 'ko',
  };
`);
console.log('mid-run language row:', JSON.stringify(midRun));
check('mid-run the language row is locked', midRun.enabled === false, `enabled=${midRun.enabled}`);
check('and the screen says why', /타이틀|title|タイトル|标题/.test(midRun.hint), midRun.hint);

// Forcing it must do nothing at all — this is the path that used to hang.
await ev(`(() => { window.game.scene.getScene('SettingsScene').changeLanguage(1); return 1; })()`);
await sleep(800);
const afterAttempt = await ev(`(() => ({
  lang: (JSON.parse(localStorage.getItem('exiled-survivors:settings:v1') || 'null') || {}).language || 'ko',
  fps: Math.round(window.game.loop.actualFps),
  settings: window.game.scene.isActive('SettingsScene'),
}))()`);
console.log('after forcing it:', JSON.stringify(afterAttempt));
check('forcing it mid-run changes nothing, and the game keeps running',
  afterAttempt.lang === midRun.before && afterAttempt.fps > 20 && afterAttempt.settings === true,
  `language still ${afterAttempt.lang}, ${afterAttempt.fps} fps`);

// --- 11. the rows lost their borders and found their centre ---
const style = await scene('SettingsScene', `
  const row = s.menu.rows[0];
  return {
    stroked: row.panel.isStroked === true,
    originX: row.label.originX,
    centred: Math.round(row.label.x) === Math.round(row.panel.x),
  };
`);
console.log('row style:', JSON.stringify(style));
// lineWidth stays at its default whether or not anything is drawn with it,
// so ask whether the shape is stroked at all.
check('menu rows have no border', style.stroked === false, `stroked=${style.stroked}`);
check('and their labels sit centred', style.originX === 0.5 && style.centred === true);
await shot('i18n-08-borderless');

// Leave the next suite the defaults.
await ev(`(() => { localStorage.clear(); return 1; })()`);

const thrown = await ev('window.__errors || []');
check('nothing threw along the way', thrown.length === 0, thrown.join(' | '));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
