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
  // The guide shows one chapter at a time: shown is what is on screen, and
  // text is every chapter, which is what the coverage checks read.
  const NL = String.fromCharCode(10);
  const all = (s.chapters ?? []).map(
    c => c.title + NL + c.sections.map(x => x.heading + NL + x.lines.join(NL)).join(NL)
  ).join(NL);
  return {
    topic: s.payload.topic,
    title: s.children.list.filter(o => o.type === 'Text').map(o => o.text)[0],
    chapters: (s.chapters ?? []).map(c => c.title),
    chapter: s.chapter,
    toc: (s.tocEntries ?? []).map(e => ({ text: e.text, alpha: e.alpha })),
    // The patch notes have outgrown what one evaluate can hand back whole,
    // and these checks only ever look for phrases in it — so the phrases are
    // looked for in the page and the answers sent, not every character.
    shown: s.page.list.map(o => o.text).join(NL).slice(0, 16000),
    text: all.slice(0, 16000),
    has: (() => {
      const whole = all + NL + s.page.list.map(o => o.text).join(NL);
      return { versions: whole.includes('v0.9'), rares: whole.includes('희귀 적') };
    })(),
    blocks: s.page.list.length,
    scrollY: Math.round(s.scrollY),
    maxScroll: Math.round(s.maxScroll),
    pageY: Math.round(s.page.y),
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
  scrolled.scrollY > 0 && scrolled.pageY === -scrolled.scrollY,
  `scrollY=${scrolled.scrollY}, page at ${scrolled.pageY}`);
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
console.log('guide chapters:', guide.chapters.join(' | '));
check('게임 가이드 opens', guide.topic === 'guide' && guide.title === '게임 가이드');
check('it has a contents list of 목표/조작/성장/스킬/적',
  guide.chapters.join('/') === '목표/조작/성장/스킬/적' && guide.toc.length === 5,
  guide.chapters.join(' / '));
check('it covers the whole game',
  ['목표', '조작', '모바일', '성장', '스킬', '적', '희귀', '드랍', '저장'].every(h => guide.text.includes(h)),
  guide.chapters.join(' / '));
check('the skills are listed with their tags and upgrades',
  ['타격', '화염구', '연쇄번개', '얼음창', '공허구체'].every(n => guide.text.includes(n)) &&
  guide.text.includes('강화:'),
  '5 skills');
const tuned = await ev(`(() => {
  const c = window.config;
  const pct = (n) => (n * 100).toFixed(n * 100 < 1 ? 1 : 0).replace(/\.0$/, '') + '%';
  return { rare: pct(c.RARE.chance), skill: pct(c.SKILL_DROP.chance), potion: pct(c.POTION.chance) };
})()`);
check('the numbers come from the live config',
  guide.text.includes(tuned.rare) && guide.text.includes(tuned.skill) &&
    guide.text.includes(tuned.potion),
  `rare ${tuned.rare}, skill ${tuned.skill}, potion ${tuned.potion}`);

// One chapter at a time, and the arrows walk the contents.
check('only the chosen chapter is on the page',
  guide.chapter === 0 && guide.shown.includes('목표') && !guide.shown.includes('공허구체'),
  `${guide.shown.split('\n').length} blocks of ${guide.text.split('\n').length}`);
check('the chosen entry is the lit one',
  guide.toc[0].alpha === 1 && guide.toc[1].alpha < 1,
  guide.toc.map(e => `${e.text}:${e.alpha}`).join(' '));
await shot('info-03-guide');

await cdp.tap('ArrowDown', 40, 'ArrowDown');
await sleep(250);
const second = await page();
check('↓ opens the next chapter', second.chapter === 1 && second.shown !== guide.shown,
  guide.chapters[second.chapter]);
check('the page starts at the top of it', second.scrollY === 0);

await cdp.tap('ArrowDown', 40, 'ArrowDown');
await cdp.tap('ArrowDown', 40, 'ArrowDown');
await sleep(250);
const skills = await page();
check('the 스킬 chapter lists all five',
  skills.chapter === 3 &&
  ['타격', '화염구', '연쇄번개', '얼음창', '공허구체'].every(n => skills.shown.includes(n)),
  guide.chapters[skills.chapter]);
await shot('info-03b-guide-skills');

await cdp.tap('ArrowUp', 38, 'ArrowUp');
await sleep(250);
const backUp = await page();
check('↑ walks back up the contents', backUp.chapter === 2, guide.chapters[backUp.chapter]);
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
  third.topic === 'guide' && third.chapters.length === 5 && third.toc.length === 5,
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
