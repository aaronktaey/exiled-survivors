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
const active = () => cdp.evaluate(`(() => {
  const g = window.game;
  return {
    menu: g.scene.isActive('MenuScene'), info: g.scene.isActive('InfoScene'),
    pause: g.scene.isActive('PauseScene'), settings: g.scene.isActive('SettingsScene'),
    run: g.scene.isActive('GameScene'),
  };
})()`);
const choose = async (key, id) => {
  await cdp.evaluate(`(() => {
    const s = window.game.scene.getScene('${key}');
    const i = s.menu.rows.findIndex((r) => r.item.id === '${id}');
    s.menu.selected = i;
    s.menu.refresh();
    return i;
  })()`);
  await cdp.tap('Space', 32, ' ');
  await sleep(500);
};
/** What the info page is showing, and where it is scrolled to. */
const page = () => scene('InfoScene', `
  // The guide shows one tab at a time: shown is what is on screen, and
  // text is every chapter, tab and card, which is what the coverage checks read.
  const NL = String.fromCharCode(10);
  const all = (s.chapters ?? []).map(
    c => c.title + NL + c.tabs.map(tb => tb.title + NL + tb.cards.map(
      k => [k.title, ...k.facts, ...k.lines].join(NL)).join(NL)).join(NL)
  ).join(NL);
  return {
    topic: s.payload.topic,
    title: s.children.list.filter(o => o.type === 'Text').map(o => o.text)[0],
    chapters: (s.chapters ?? []).map(c => c.title),
    chapter: s.chapter,
    tab: s.tab,
    tabs: (s.tabEntries ?? []).map(e => e.text),
    toc: (s.tocEntries ?? []).map(e => ({ text: e.text, alpha: e.alpha })),
    // The patch notes have outgrown what one evaluate can hand back whole,
    // and these checks only ever look for phrases in it — so the phrases are
    // looked for in the page and the answers sent, not every character.
    shown: s.page.list.filter(o => o.type === 'Text').map(o => o.text).join(NL).slice(0, 16000),
    text: all.slice(0, 16000),
    has: (() => {
      const whole = all + NL + s.page.list.filter(o => o.type === 'Text').map(o => o.text).join(NL);
      return { versions: whole.includes('v0.9'), rares: whole.includes('희귀 적') };
    })(),
    blocks: s.page.list.length,
    scrollY: Math.round(s.scrollY),
    maxScroll: Math.round(s.maxScroll),
    // The page stays put and its own camera scrolls over it.
    camY: Math.round(s.pageCam.scrollY),
    barY: s.bar ? Math.round(s.bar.y) : null,
  };
`);
const clickAt = async (gx, gy) => {
  const at = await ev(`(() => {
    const s = window.game.scale;
    return { x: s.canvasBounds.x + ${gx} / s.displayScale.x, y: s.canvasBounds.y + ${gy} / s.displayScale.y };
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 });
  }
  await sleep(350);
};

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

// --- 1. both entries are on the title ---
const rows = await scene('MenuScene', `
  return { ids: s.menu.rows.map(r => r.item.id), labels: s.menu.rows.map(r => r.item.label()),
           details: s.menu.rows.map(r => r.item.detail ? r.item.detail() : '') };
`);
console.log('title rows:', JSON.stringify(rows.labels));
check('the title lists 게임 가이드 and 패치노트',
  rows.ids.includes('guide') && rows.ids.includes('patch'), rows.labels.join(' / '));
check('패치노트 shows the newest version', /^v\d/.test(rows.details[rows.ids.indexOf('patch')]),
  rows.details[rows.ids.indexOf('patch')]);
check('the rows still fit on screen',
  rows.ids.length === 5, `${rows.ids.length} rows`);
await shot('info-01-title');

// --- 2. the patch notes open and read ---
await choose('MenuScene', 'patch');
const notes = await page();
console.log('patch page:', JSON.stringify({ topic: notes.topic, title: notes.title, max: notes.maxScroll, head: notes.text.slice(0, 80) }));
check('패치노트 opens over the title', notes.topic === 'patch' && notes.title === '패치노트');
check('it lists versions and changes',
  notes.has.versions && notes.has.rares && notes.blocks > 3,
  `${notes.blocks} blocks on the page`);
await shot('info-02-patch');

// --- 3. it scrolls, every way ---
check('the page is longer than the window', notes.maxScroll > 0, `${notes.maxScroll}px of overflow`);
await cdp.tap('ArrowDown', 40, 'ArrowDown');
await cdp.tap('ArrowDown', 40, 'ArrowDown');
await sleep(250);
const scrolled = await page();
check('the arrow keys scroll it',
  scrolled.scrollY > 0 && scrolled.camY === scrolled.scrollY,
  `scrollY=${scrolled.scrollY}, page camera at ${scrolled.camY}`);
check('the scrollbar follows', scrolled.barY > notes.barY, `bar ${notes.barY} -> ${scrolled.barY}`);

await cdp.tap('ArrowUp', 38, 'ArrowUp');
await sleep(200);
const back = await page();
check('and scrolls back up', back.scrollY < scrolled.scrollY, `${scrolled.scrollY} -> ${back.scrollY}`);

await ev(`(() => {
  const s = window.game.scene.getScene('InfoScene');
  s.input.emit('wheel', { x: 400, y: 300 }, [], 0, 300, 0);
  return 1;
})()`);
await sleep(200);
const wheeled = await page();
check('the mouse wheel scrolls it', wheeled.scrollY > back.scrollY,
  `${back.scrollY} -> ${wheeled.scrollY}`);

await cdp.tap('End', 35, 'End');
await sleep(250);
const bottom = await page();
check('End reaches the bottom and stops there', bottom.scrollY === bottom.maxScroll,
  `${bottom.scrollY} of ${bottom.maxScroll}`);

// --- 4. closing ---
await cdp.tap('Escape', 27, 'Escape');
await sleep(500);
const closed = await active();
check('Esc closes it and hands the title back', closed.info === false && closed.menu === true);

// --- 5. the guide, from the title ---
await choose('MenuScene', 'guide');
const guide = await page();
console.log('guide chapters:', guide.chapters.join(' | '), '— tabs:', guide.tabs.join(' | '));
check('게임 가이드 opens', guide.topic === 'guide' && guide.title === '게임 가이드');
check('it has a contents list of 기본/전투/스킬/적/아이템/영구 성장',
  guide.chapters.join('/') === '기본/전투/스킬/적/아이템/영구 성장' && guide.toc.length === 6,
  guide.chapters.join(' / '));
check('and each chapter opens on a row of its own tabs',
  guide.tab === 0 && guide.tabs.join('/') === '목표/조작/모바일/저장', guide.tabs.join(' / '));

// 누락 검사: everything the tables hold is in the guide, read off the tables
// themselves — a new enemy, 속성, 구슬, 뼈다귀, sword, 패시브 or skill
// that the guide does not mention fails here.
const coverage = await scene('InfoScene', `
  const c = window.config;
  const NL = String.fromCharCode(10);
  const cards = s.chapters.flatMap(ch => ch.tabs.flatMap(tb => tb.cards));
  const words = s.chapters.flatMap(ch => [ch.title, ...ch.tabs.flatMap(tb => [tb.title,
    ...tb.cards.flatMap(k => [k.title, ...k.facts, ...k.lines])])]);
  const all = words.join(NL);
  const titles = new Set(cards.map(k => k.title));
  const names = {
    enemies: Object.values(c.ENEMY_KINDS).map(e => e.name),
    affixes: Object.values(c.AFFIXES).map(a => a.name),
    orbs: Object.values(c.ORBS).map(o => o.name),
    bones: Object.values(c.BONES).map(b => b.name),
    gear: Object.values(c.GEAR).map(g => g.name),
    passives: Object.values(c.PASSIVES).map(p => p.name),
  };
  const missing = Object.fromEntries(Object.entries(names).map(([k, list]) => [k, list.filter(n => !titles.has(n))]));
  const skillChapter = s.chapters.find(ch => ch.id === 'skills');
  return {
    missing,
    skillTabs: skillChapter.tabs.length,
    skillCards: skillChapter.tabs.every(tb => tb.cards.length > 0 && tb.cards[0].title === tb.title),
    skills: Object.keys(c.SKILL_BASE).length,
    unfilled: words.filter(w => /[{}]/.test(w)).slice(0, 5),
    broken: words.filter(w => /undefined|NaN/.test(w)).slice(0, 5),
    emptyTabs: s.chapters.flatMap(ch => ch.tabs.filter(tb => tb.cards.length === 0).map(tb => tb.id)),
    has: ['하얀 망고', '무작위 스킬', '제단', '신성한 조각', '치명타', '인벤토리', '랭킹', '고정']
      .filter(w => !all.includes(w)),
  };
`);
console.log('coverage:', JSON.stringify(coverage));
check('every enemy, 속성, 구슬, 뼈다귀, sword and 패시브 has a card of its own',
  Object.values(coverage.missing).every(list => list.length === 0), JSON.stringify(coverage.missing));
check('every skill has a tab, opening on its own card',
  coverage.skillTabs === coverage.skills && coverage.skillCards,
  `${coverage.skillTabs} tabs for ${coverage.skills} skills`);
check('and the rest of the game is covered too',
  coverage.has.length === 0, coverage.has.length ? `missing ${coverage.has.join(', ')}` : 'all there');
check('no tab is empty, and no placeholder is left unfilled',
  coverage.emptyTabs.length === 0 && coverage.unfilled.length === 0 && coverage.broken.length === 0,
  JSON.stringify({ empty: coverage.emptyTabs, unfilled: coverage.unfilled, broken: coverage.broken }));

const tuned = await ev(`(() => {
  const c = window.config;
  const pct = (n) => Number((n * 100).toFixed(2)) + '%';
  return { rare: pct(c.RARE.chance), skill: pct(c.SKILL_DROP.chance), potion: pct(c.POTION.chance),
           mango: pct(c.MANGO.chance), hp: String(c.ENEMY_KINDS.brute.maxHp) };
})()`);
check('the numbers come from the live config',
  guide.text.includes(tuned.rare) && guide.text.includes(tuned.skill) &&
    guide.text.includes(tuned.potion) && guide.text.includes(tuned.mango) && guide.text.includes(tuned.hp),
  `rare ${tuned.rare}, skill ${tuned.skill}, potion ${tuned.potion}, mango ${tuned.mango}, 거구 ${tuned.hp}`);

// One tab at a time; ↑↓ walk the chapters, ←→ the tabs.
check('only the chosen tab is on the page',
  guide.chapter === 0 && guide.shown.includes('목표') && !guide.shown.includes('공허구체') &&
    !guide.shown.includes('WASD'),
  `${guide.shown.split('\n').length} lines shown`);
check('the chosen chapter is the lit one',
  guide.toc[0].alpha === 1 && guide.toc[1].alpha < 1,
  guide.toc.map(e => `${e.text}:${e.alpha}`).join(' '));
await shot('info-03-guide');

await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(250);
const nextTab = await page();
check('→ opens the next tab of the same chapter',
  nextTab.chapter === 0 && nextTab.tab === 1 && nextTab.shown.includes('WASD'),
  nextTab.tabs[nextTab.tab]);

await cdp.tap('ArrowDown', 40, 'ArrowDown');
await sleep(250);
const second = await page();
check('↓ opens the next chapter, on its first tab', second.chapter === 1 && second.tab === 0 &&
  second.shown !== guide.shown, `${guide.chapters[second.chapter]} · ${second.tabs[second.tab]}`);
check('the page starts at the top of it', second.scrollY === 0);

await cdp.tap('ArrowDown', 40, 'ArrowDown');
await sleep(250);
const skills = await page();
check('the 스킬 chapter has a tab per skill',
  skills.chapter === 2 && skills.tabs.length === coverage.skills &&
    ['타격', '화염구', '연쇄번개', '얼음창', '공허구체', '낙뢰'].every(n => skills.tabs.includes(n)),
  skills.tabs.join(' / '));
check('and the open one shows its numbers and upgrades',
  /DPS/.test(skills.shown) && /강화:/.test(skills.shown), skills.shown.split('\n').slice(0, 3).join(' | '));
await shot('info-03b-guide-skills');

// A tab is pressed as well as stepped to.
const tabAt = await scene('InfoScene', `
  const p = s.tabPlates[2].box;
  return { x: Math.round(p.x), y: Math.round(p.y) };
`);
await clickAt(tabAt.x, tabAt.y);
const clicked = await page();
check('clicking a tab opens it', clicked.chapter === 2 && clicked.tab === 2, clicked.tabs[clicked.tab]);

await cdp.tap('ArrowUp', 38, 'ArrowUp');
await sleep(250);
const backUp = await page();
check('↑ walks back up the contents', backUp.chapter === 1, guide.chapters[backUp.chapter]);

// Every tab, drawn: nothing runs past the page's right edge, every card is
// a card (a panel under its words), and the titles are in colour.
const drawn = await scene('InfoScene', `
  const out = { tabs: 0, over: [], plain: [], panels: 0 };
  s.chapters.forEach((ch, ci) => {
    s.showChapter(ci);
    ch.tabs.forEach((tb, ti) => {
      s.showTab(ti);
      out.tabs += 1;
      const texts = s.page.list.filter(o => o.type === 'Text');
      const panels = s.page.list.filter(o => o.type === 'Graphics');
      out.panels += panels.length;
      const right = Math.max(...texts.map(o => o.x + o.displayWidth));
      if (right > s.contentWidth + 1) out.over.push(ch.id + '/' + tb.id + ' ' + Math.round(right));
      if (panels.length !== tb.cards.length) out.plain.push(ch.id + '/' + tb.id);
    });
  });
  s.showChapter(0);
  return out;
`);
console.log('drawn:', JSON.stringify(drawn));
check('every tab draws inside the page, a bordered panel per card',
  drawn.tabs > 15 && drawn.over.length === 0 && drawn.plain.length === 0,
  `${drawn.tabs} tabs, ${drawn.panels} cards${drawn.over.length ? ', over: ' + drawn.over.join(' ') : ''}${drawn.plain.length ? ', bare: ' + drawn.plain.join(' ') : ''}`);
await cdp.tap('Escape', 27, 'Escape');
await sleep(500);

// --- 5b. one after the other, which used to take the game down ---
await choose('MenuScene', 'patch');
const again = await page();
check('패치노트 still opens straight after the guide',
  again.topic === 'patch' && again.chapters.length === 1 && again.shown.length > 40,
  `${again.chapters.length} chapters, ${again.shown.split(String.fromCharCode(10)).length} blocks`);
check('and it is a plain scroll again, with no contents list',
  again.toc.length === 0 && again.maxScroll > 0, `${again.toc.length} entries`);
await cdp.tap('Escape', 27, 'Escape');
await sleep(500);
await choose('MenuScene', 'guide');
const third = await page();
check('and the guide opens again after that',
  third.topic === 'guide' && third.chapters.length === 6 && third.toc.length === 6,
  `${third.chapters.length} chapters`);
await cdp.tap('Escape', 27, 'Escape');
await sleep(500);

// --- 6. both are reachable from the pause screen too ---
await choose('MenuScene', 'start');
await sleep(1400);
await cdp.tap('Escape', 27, 'Escape');
await sleep(600);
const pauseRows = await scene('PauseScene', `return { ids: s.menu.rows.map(r => r.item.id) };`);
check('the pause menu lists them as well',
  pauseRows.ids.includes('guide') && pauseRows.ids.includes('patch'),
  pauseRows.ids.join(' / '));

await choose('PauseScene', 'guide');
const fromPause = await page();
check('the guide opens over a paused run', fromPause.topic === 'guide');
const stillPaused = await active();
check('the run stays frozen underneath',
  stillPaused.info === true && stillPaused.run === false, `info=${stillPaused.info}`);
await shot('info-04-from-pause');

await cdp.tap('Escape', 27, 'Escape');
await sleep(600);
const backToPause = await active();
check('closing returns to the pause menu', backToPause.pause === true && backToPause.info === false);

// --- 7. the settings arrows work in both directions ---
await choose('PauseScene', 'settings');
const before = await scene('SettingsScene', `
  const row = s.menu.rows.find(r => r.item.id === 'joystickScale');
  return { scale: s.previewBase.radius, arrows: row.arrows.length,
           left: Math.round(row.arrows[0].x), right: Math.round(row.arrows[1].x), y: Math.round(row.arrows[0].y) };
`);
console.log('size row:', JSON.stringify(before));
check('a value row has two real arrow buttons', before.arrows === 2,
  `◀ at ${before.left}, ▶ at ${before.right}`);

await clickAt(before.right, before.y);
await clickAt(before.right, before.y);
const grown = await scene('SettingsScene', `return { radius: s.previewBase.radius, value: s.menu.rows.find(r => r.item.id === 'joystickScale').item.detail() };`);
check('clicking ▶ raises the value', grown.radius > before.scale,
  `${before.scale}px -> ${grown.radius}px (${grown.value.trim()})`);

await clickAt(before.left, before.y);
await clickAt(before.left, before.y);
await clickAt(before.left, before.y);
const shrunk = await scene('SettingsScene', `return { radius: s.previewBase.radius, value: s.menu.rows.find(r => r.item.id === 'joystickScale').item.detail() };`);
console.log('after clicking ◀ three times:', JSON.stringify(shrunk));
check('clicking ◀ lowers it again — the bug this fixes',
  shrunk.radius < grown.radius && shrunk.radius < before.scale,
  `${grown.radius}px -> ${shrunk.radius}px (${shrunk.value.trim()})`);

const volumeRow = await scene('SettingsScene', `
  const row = s.menu.rows.find(r => r.item.id === 'bgm');
  return { left: Math.round(row.arrows[0].x), y: Math.round(row.arrows[0].y),
           before: JSON.parse(localStorage.getItem('exiled-survivors:settings:v1')).bgmVolume };
`);
await clickAt(volumeRow.left, volumeRow.y);
const volumeAfter = await ev(`JSON.parse(localStorage.getItem('exiled-survivors:settings:v1')).bgmVolume`);
check('the volume arrow lowers the volume too', volumeAfter < volumeRow.before,
  `${volumeRow.before} -> ${volumeAfter}`);
await shot('info-05-settings-arrows');

const thrown = await ev('window.__errors || []');
check('nothing threw along the way', thrown.length === 0, thrown.join(' | '));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
