import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 실시간 업데이트: a newer version is taken on the title screen with nothing
// open over it — never in a run, never over an open screen — and a reload
// that comes back on the old version is not tried again.

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
const scene = (key, body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('${key}'); ${body} })()`);

await cdp.send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(4000);
const notice = await ev(`(() => window.config.LIVE_UPDATE.noticeMs)()`);
const wait = () => sleep(notice + 600);

// Reloading is replaced by a count, so the suite sees each one without losing the page.
const setup = await ev(`(() => {
  sessionStorage.removeItem('exiled-survivors:live-update-tried');
  window.__reloads = 0;
  window.liveUpdate.reload = () => { window.__reloads += 1; };
  return { current: window.liveUpdate.current, pending: window.liveUpdate.pending,
           running: window.game.scene.getScenes(true).map((s) => s.scene.key) };
})()`);
check('the dev server runs as "dev" and asks nothing on its own',
  setup.current === 'dev' && setup.pending === false, JSON.stringify(setup));

// --- 1. on the title, with nothing open: it says so, then reloads ---
await ev(`(() => { window.liveUpdate.found('build-2'); return 1; })()`);
await sleep(200);
const saying = await scene('MenuScene', `return { updating: s.updating, text: s.updatingText?.text ?? '' };`);
await shot('live-01-updating');
await wait();
const reloaded = await ev(`(() => ({ reloads: window.__reloads, pending: window.liveUpdate.pending,
  tried: sessionStorage.getItem('exiled-survivors:live-update-tried') }))()`);
check('a newer version found on the title says it is updating',
  saying.updating === true && saying.text.includes('업데이트'), JSON.stringify(saying));
check('and reloads onto it', reloaded.reloads === 1 && reloaded.tried === 'build-2', JSON.stringify(reloaded));
check('a reload that comes back on the old version is not tried again', reloaded.pending === false);

// --- 2. in a run: nothing, until the run is over and the title is back ---
await ev(`(() => { window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
await sleep(1500);
await ev(`(() => { window.liveUpdate.found('build-3'); return 1; })()`);
await wait();
const inRun = await ev(`(() => ({ reloads: window.__reloads, pending: window.liveUpdate.pending,
  playing: window.game.scene.isActive('GameScene') }))()`);
check('found in the middle of a run, it waits — the run goes on',
  inRun.reloads === 1 && inRun.pending === true && inRun.playing === true, JSON.stringify(inRun));
await ev(`(() => { window.game.scene.getScene('GameScene').scene.start('MenuScene'); return 1; })()`);
await sleep(300);
await wait();
const atTitle = await ev(`(() => ({ reloads: window.__reloads }))()`);
check('and is taken as soon as the title is back', atTitle.reloads === 2, JSON.stringify(atTitle));

// --- 3. a screen open over the title: nothing, until it is closed ---
await scene('MenuScene', `s.scene.restart(); return 1;`);
await sleep(1200);
await scene('MenuScene', `s.icons.press('ranking'); return 1;`);
await sleep(800);
await ev(`(() => { window.liveUpdate.found('build-4'); return 1; })()`);
await wait();
const overlaid = await ev(`(() => ({ reloads: window.__reloads, ranking: window.game.scene.isActive('RankingScene') }))()`);
check('with a screen open over the title, it waits', overlaid.reloads === 2 && overlaid.ranking, JSON.stringify(overlaid));
await scene('RankingScene', `s.backButton.press(); return 1;`);
await sleep(300);
await wait();
const closed = await ev(`(() => ({ reloads: window.__reloads }))()`);
check('and is taken once it is closed', closed.reloads === 3, JSON.stringify(closed));

await ev(`(() => { sessionStorage.removeItem('exiled-survivors:live-update-tried'); return 1; })()`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
