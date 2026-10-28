import { connect, sleep } from './cdp-lib.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

// 언어 선택 (on again in 0.153): the Language row, every language in step
// with Korean, the names the tables leave to the locales, the Chinese pixel
// font, and the switch reaching the title, the guide, the notes and a run.

const cdp = await connect();
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
const KEY = 'exiled-survivors:settings:v1';
const stored = () => ev(`(() => { const raw = localStorage.getItem('${KEY}'); return raw ? JSON.parse(raw) : null; })()`);
const titleUp = () => cdp.until(`(() => { const m = window.game?.scene?.getScene('MenuScene'); return !!(m && m.scene.isActive() && m.icons && m.menu); })()`, 30000, 200);
const load = async () => {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
  await titleUp();
  await sleep(400);
};
const settingsRows = () => ev(`(() => { const s = window.game.scene.getScene('SettingsScene');
  return { tab: s.tab, labels: s.menu.rows.map(r => r.label.text), details: s.menu.rows.map(r => r.detail.text), hint: s.hint.text }; })()`);
const openSettingsDisplay = async () => {
  await ev(`(() => { window.game.scene.getScene('MenuScene').icons.press('settings'); return 1; })()`);
  await cdp.until(`window.game.scene.isActive('SettingsScene')`, 10000, 100);
  await ev(`(() => { window.game.scene.getScene('SettingsScene').openTab('display'); return 1; })()`);
  await cdp.until(`(() => { const s = window.game.scene.getScene('SettingsScene'); return s.scene.isActive() && s.tab === 'display' && !!s.menu; })()`, 10000, 100);
  await sleep(200);
};
const titleWords = () => ev(`(() => { const m = window.game.scene.getScene('MenuScene');
  return { start: m.menu.rows[0].label.text, settings: m.icons.views.find(v => v.button.id === 'settings')?.label.text }; })()`);

// --- 0. without a browser: the Chinese font holds the Chinese ---
{
  const hangul = (c) => /[ᄀ-ᇿ㄰-㆏가-힣]/.test(c);
  const wanted = new Set();
  for (const file of ['../src/i18n/zh.ts', '../src/content/patchNotes.ts']) {
    for (const c of readFileSync(new URL(file, import.meta.url), 'utf8')) {
      if (c.codePointAt(0) > 0x7f && !hangul(c)) wanted.add(c);
    }
  }
  const kept = new Set(readFileSync(new URL('../assets-src/fonts/fusion/chars.txt', import.meta.url), 'utf8'));
  const lacks = new Set(readFileSync(new URL('../assets-src/fonts/fusion/lacks.txt', import.meta.url), 'utf8'));
  const missing = [...wanted].filter((c) => !kept.has(c) && !lacks.has(c));
  check('the Chinese font was cut after the last Chinese text (python tools/make-zh-font.py)',
    missing.length === 0, missing.join(''));
  const noGlyph = [...lacks].filter((c) => /[㐀-鿿]/.test(c));
  check('and has a glyph for every hanzi the game writes', noGlyph.length === 0, noGlyph.join(''));
}

await ev(`(() => { localStorage.clear(); return 1; })()`);
await load();
await ev(`(() => {
  window.__errors = [];
  window.addEventListener('error', (e) => window.__errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errors.push('rejection: ' + String(e.reason)));
  return 1;
})()`);

// --- 1. every locale in step with Korean ---
await ev(`(() => {
  window.__loc = null;
  Promise.all(['ko', 'en', 'ja', 'zh'].map((c) => import('/src/i18n/' + c + '.ts').then((m) => m[c])))
    .then((all) => { window.__loc = all; }, (e) => { window.__loc = String(e); });
  return 1;
})()`);
await cdp.until('!!window.__loc', 30000, 200);
const step = await ev(`(() => {
  const [ko, ...others] = window.__loc;
  const codes = ['en', 'ja', 'zh'];
  const hangul = /[\\uac00-\\ud7a3]/;
  // Placeholders a line must keep; Korean's particles are its own.
  const holes = (s) => [...new Set([...s.matchAll(/\\{(\\w+)\\}/g)].map((m) => m[1]))].sort().join(',');
  const out = { shape: [], holes: [], hangul: [] };
  const walk = (a, b, path, code) => {
    if (typeof a === 'string') {
      if (typeof b !== 'string') { out.shape.push(code + ' ' + path); return; }
      if (holes(a) !== holes(b)) out.holes.push(code + ' ' + path + ' [' + holes(a) + '] vs [' + holes(b) + ']');
      return;
    }
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || b.length !== a.length) { out.shape.push(code + ' ' + path + ' length ' + a.length + ' vs ' + (b && b.length)); return; }
      a.forEach((x, i) => walk(x, b[i], path + '.' + i, code));
      return;
    }
    if (a && typeof a === 'object') {
      if (path === '.names') return;   // a locale renames what it knows; checked below
      for (const k of Object.keys(a)) {
        if (!b || !(k in b)) { out.shape.push(code + ' ' + path + '.' + k + ' missing'); continue; }
        walk(a[k], b[k], path + '.' + k, code);
      }
    }
  };
  const anyHangul = (v, path, code) => {
    if (typeof v === 'string') { if (hangul.test(v)) out.hangul.push(code + ' ' + path + ': ' + v.slice(0, 40)); return; }
    if (v && typeof v === 'object') for (const k of Object.keys(v)) anyHangul(v[k], path + '.' + k, code);
  };
  others.forEach((o, i) => { walk(ko, o, '', codes[i]); anyHangul(o, '', codes[i]); });
  return { shape: out.shape.slice(0, 12), holes: out.holes.slice(0, 12), hangul: out.hangul.slice(0, 12),
    counts: [out.shape.length, out.holes.length, out.hangul.length] };
})()`);
check('en · ja · zh have every line Korean has, and as many tips, cards and lines',
  step.counts?.[0] === 0, step.shape?.join(' | '));
check('every line keeps the {numbers} the Korean fills in', step.counts?.[1] === 0, step.holes?.join(' | '));
check('and none of them says anything in Korean', step.counts?.[2] === 0, step.hangul?.join(' | '));

// --- 2. every name the tables leave to the locales ---
const names = await ev(`(() => {
  const c = window.config;
  const tables = {
    skills: Object.keys(c.SKILL_BASE), enemies: Object.keys(c.ENEMY_KINDS), affixes: Object.keys(c.AFFIXES),
    orbs: Object.keys(c.ORBS), bones: Object.keys(c.BONES), gear: Object.keys(c.GEAR), passives: Object.keys(c.PASSIVES),
  };
  const out = [];
  window.__loc.slice(1).forEach((o, i) => {
    const code = ['en', 'ja', 'zh'][i];
    for (const [table, ids] of Object.entries(tables)) {
      for (const id of ids) if (!o.names?.[table]?.[id]) out.push(code + ' names.' + table + '.' + id);
    }
  });
  return out;
})()`);
check('every skill, enemy, 속성, 구슬, 뼈다귀, sword and talent has a name in en · ja · zh',
  Array.isArray(names) && names.length === 0, JSON.stringify(names).slice(0, 300));

// --- 3. the Language row: first on 설정's 화면 tab, in English whatever the language ---
const first = await stored();
console.log('first run:', JSON.stringify({ first, browser: await ev('navigator.language') }));
await openSettingsDisplay();
let rows = await settingsRows();
check('설정 → 화면 opens on a Language row', rows.labels[0] === 'Language', rows.labels.join(' / '));
check('its value is the language’s own name', rows.details[0] === '한국어', rows.details[0]);
await shot('i18n-01-settings-ko');

// --- 4. → walks every language and back, rebuilding the screen as it goes ---
const seen = [];
for (let i = 0; i < 4; i++) {
  const before = (await stored())?.language ?? 'ko';
  await ev(`(() => { const s = window.game.scene.getScene('SettingsScene'); s.menu.focus('language'); s.menu.rows[0].item.onAdjust(1); return 1; })()`);
  await cdp.until(`(() => { const raw = JSON.parse(localStorage.getItem('${KEY}') || '{}'); const s = window.game.scene.getScene('SettingsScene');
    return raw.language !== '${before}' && s.scene.isActive() && s.menu && s.menu.rows[0].detail.text !== ''; })()`, 10000, 100);
  await sleep(300);
  const now = await settingsRows();
  seen.push({ code: (await stored()).language, native: now.details[0], label: now.labels[0], second: now.labels[1] });
}
console.log('cycle:', JSON.stringify(seen));
check('→ walks through all four languages',
  seen.map((s) => s.code).join(',') === 'en,ja,zh,ko', seen.map((s) => `${s.code} ${s.native}`).join(' / '));
check('the Language label stays "Language" in every one', seen.every((s) => s.label === 'Language'));
check('every other row does change', new Set(seen.map((s) => s.second)).size === 4, seen.map((s) => s.second).join(' / '));

// --- 5. in English the whole shell follows ---
await ev(`(() => { const s = window.game.scene.getScene('SettingsScene'); s.menu.focus('language'); s.menu.rows[0].item.onAdjust(1); return 1; })()`);
await cdp.until(`(() => JSON.parse(localStorage.getItem('${KEY}') || '{}').language === 'en')()`, 10000, 100);
await sleep(500);
rows = await settingsRows();
check('설정 itself is in English now', rows.labels.includes('Damage numbers'), rows.labels.join(' / '));
await shot('i18n-02-settings-en');
await cdp.tap('Escape', 27, 'Escape');
await cdp.until(`!window.game.scene.isActive('SettingsScene')`, 10000, 100);
await titleUp();
await sleep(500);
const title = await titleWords();
check('the title rebuilt itself in English', title.start === 'New Run' && title.settings === 'Settings', JSON.stringify(title));
await shot('i18n-03-title-en');

// The guide and the notes, in English and with their numbers off the config.
await ev(`(() => { window.game.scene.getScene('MenuScene').icons.press('guide'); return 1; })()`);
await cdp.until(`(() => { const s = window.game.scene.getScene('InfoScene'); return s.scene.isActive() && !!s.chapters; })()`, 10000, 100);
const guide = await ev(`(() => {
  const s = window.game.scene.getScene('InfoScene');
  const NL = String.fromCharCode(10);
  const text = s.chapters.map((c) => c.title + NL + c.tabs.map((tb) => tb.title + NL + tb.cards.map(
    (k) => [k.title, ...k.facts, ...k.lines].join(NL)).join(NL)).join(NL)).join(NL);
  const p = (f) => Number((f * 100).toFixed(2)) + '%';
  return {
    chapters: s.chapters.map((c) => c.title).join('/'),
    basics: s.chapters[0].tabs.map((tb) => tb.title).join('/'),
    tabs: s.chapters.flatMap((c) => c.tabs.map((tb) => tb.id)),
    named: ['Void Orb', 'Shooter', 'Chain Lightning', 'Onigoroshi', 'White Mango', 'Battle Plan', 'Prophecy'].filter((w) => !text.includes(w)),
    numbers: [p(window.config.RARE.chance), p(window.config.SKILL_DROP.chance)].filter((n) => !text.includes(n)),
    hangul: /[\\uac00-\\ud7a3]/.test(text),
  };
})()`);
check('the guide is in English, chapters and tabs too',
  guide.chapters === 'Basics/Combat/Skills/Enemies/Items/Progression' && guide.basics === 'The goal/Controls/Mobile/Saving',
  `${guide.chapters} — ${guide.basics}`);
check('it has the Battle Plan and Prophecy tabs', guide.tabs.includes('autoPick') && guide.tabs.includes('prophecy'), guide.tabs.join(','));
check('skills, enemies and items are named in English', guide.named.length === 0 && !guide.hangul, guide.named.join(', '));
check('the numbers still come from the config', guide.numbers.length === 0, guide.numbers.join(', '));
await cdp.tap('Escape', 27, 'Escape');
await cdp.until(`!window.game.scene.isActive('InfoScene')`, 10000, 100);
await sleep(300);

await ev(`(() => { window.game.scene.getScene('MenuScene').icons.press('patch'); return 1; })()`);
await cdp.until(`(() => { const s = window.game.scene.getScene('InfoScene'); return s.scene.isActive() && !!s.page; })()`, 10000, 100);
const patch = await ev(`(() => { const s = window.game.scene.getScene('InfoScene');
  const t = s.page.list.filter((o) => o.text).map((o) => o.text).join(' '); return { start: t.slice(0, 80), hangul: /[\\uac00-\\ud7a3]/.test(t) }; })()`);
check('the patch notes are in English', !patch.hangul, patch.start);
await cdp.tap('Escape', 27, 'Escape');
await cdp.until(`!window.game.scene.isActive('InfoScene')`, 10000, 100);
await sleep(300);

// --- 6. and it reaches into the run ---
await ev(`(() => { window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
await cdp.until(`(() => { const s = window.game.scene.getScene('GameScene'); return !!(s && s.scene.isActive() && s.hud && s.player); })()`, 20000, 200);
await sleep(800);
const run = await ev(`(() => { const s = window.game.scene.getScene('GameScene');
  return { enemies: s.hud.enemiesLabel.text }; })()`);
check('the HUD is in English', /Enemies/.test(run.enemies), run.enemies);
await ev(`(() => { const s = window.game.scene.getScene('GameScene'); s.player.setInvulnerable(true); s.progression.addXp(s.progression.xpToNext); return 1; })()`);
await cdp.until(`(() => { const u = window.game.scene.getScene('UpgradeScene'); return u.scene.isActive() && u.cards && u.cards.length > 0; })()`, 10000, 100);
const cards = await ev(`(() => { const u = window.game.scene.getScene('UpgradeScene');
  return { labels: u.cards.map((c) => c.option.label), details: u.cards.map((c) => c.option.detail) }; })()`);
check('the upgrade cards are in English',
  cards.labels.every((l) => !/[가-힣]/.test(l)) && cards.details.some((d) => /Strike/.test(d)),
  `${cards.labels.join(' / ')} — ${cards.details[0]}`);
await shot('i18n-05-upgrade-en');
await ev(`(() => { const u = window.game.scene.getScene('UpgradeScene'); u.pick(u.cards[0].option.id); return 1; })()`);
await cdp.until(`!window.game.scene.isActive('UpgradeScene')`, 10000, 100);
await sleep(300);
const drop = await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const d = s.combat.skillDrops.get();
  d.drop(s.player.x + 200, s.player.y, { id: 'voidOrb', name: '공허구체', tags: ['공허'], upgrades: ['damage'], summary: '' });
  return d.nameplate.text;
})()`);
check('a dropped skill is labelled in English', drop === 'Void Orb', drop);

// --- 7. mid-run the row is there but locked, and says so only on itself ---
await ev(`(() => { window.game.scene.getScene('GameScene').pauseRun(); return 1; })()`);
await cdp.until(`window.game.scene.isActive('PauseScene')`, 10000, 100);
await ev(`(() => { const p = window.game.scene.getScene('PauseScene'); const i = p.menu.rows.findIndex((r) => r.item.id === 'settings'); p.menu.rows[i].item.onSelect(); return 1; })()`);
await cdp.until(`window.game.scene.isActive('SettingsScene')`, 10000, 100);
await sleep(300);
const controlsHint = (await settingsRows()).hint;
await ev(`(() => { window.game.scene.getScene('SettingsScene').openTab('display'); return 1; })()`);
await cdp.until(`(() => { const s = window.game.scene.getScene('SettingsScene'); return s.scene.isActive() && s.tab === 'display'; })()`, 10000, 100);
await sleep(300);
const locked = await ev(`(() => { const s = window.game.scene.getScene('SettingsScene'); s.menu.focus('language');
  const row = s.menu.rows.find((r) => r.item.id === 'language'); return { enabled: row.item.enabled(), hint: s.hint.text }; })()`);
check('mid-run the Language row is locked', locked.enabled === false);
check('the row says why, and the other tabs keep their own hint',
  /title/i.test(locked.hint) && !/title screen/i.test(controlsHint), `${locked.hint} | ${controlsHint}`);
await ev(`(() => { window.game.scene.getScene('SettingsScene').changeLanguage(1); return 1; })()`);
await sleep(600);
check('forcing it mid-run changes nothing', (await stored()).language === 'en');

// --- 8. remembered across a reload; Japanese and Chinese draw, Chinese in its pixel font ---
await load();
check('the language is remembered across a reload', (await titleWords()).start === 'New Run');
for (const [code, expected] of [['ja', 'ゲーム開始'], ['zh', '开始游戏']]) {
  await ev(`(() => { const raw = JSON.parse(localStorage.getItem('${KEY}')); localStorage.setItem('${KEY}', JSON.stringify({ ...raw, language: '${code}' })); return 1; })()`);
  await load();
  const words = await titleWords();
  const font = await ev(`(() => { const m = window.game.scene.getScene('MenuScene');
    return { family: m.menu.rows[0].label.style.fontFamily, loaded: document.fonts.check('16px FusionPixelZh', '开始') }; })()`);
  check(`the title renders in ${code}`, words.start === expected, words.start);
  if (code === 'zh') {
    check('Chinese is drawn in the Chinese pixel font, loaded before the title',
      font.family.includes('FusionPixelZh') && font.loaded === true, JSON.stringify(font));
  } else {
    check(`${code} keeps the game font without it`, !font.family.includes('FusionPixelZh'), font.family);
  }
  await shot(`i18n-07-title-${code}`);
}

await ev(`(() => { localStorage.clear(); return 1; })()`);
const thrown = await ev('window.__errors || []');
check('nothing threw along the way', thrown.length === 0, thrown.join(' | '));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
process.exit(0);
