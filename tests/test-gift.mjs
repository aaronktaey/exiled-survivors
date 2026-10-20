import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 0.80: the game went back to 0.67's play. Everyone is given ROLLBACK_GIFT
// once on the title — bare pieces into the stash, every 구슬 into the drawer
// — and a run saved on 0.71–0.79 (it carries a `kit`) is thrown away.

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
const toTitle = async () => {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(4000);
};

// The harness turns the gift off; this suite wants it.
await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__giftOn = true;' });
await toTitle();
await ev(`(() => { localStorage.clear(); return 1; })()`);
// The toast rises and fades within a few seconds of the title: watched for from the load.
await cdp.send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
let toast = [];
for (let i = 0; i < 40 && toast.length === 0; i++) {
  await sleep(200);
  toast = (await ev(`(() => { const s = window.game?.scene?.getScene('MenuScene');
    return s?.children ? s.children.list.filter((o) => o.type === 'Text' && /복구 보상/.test(o.text)).map((o) => o.text) : []; })()`)) ?? [];
}
await shot('gift-01-title');
await sleep(1000);

const first = await ev(`(() => {
  const c = window.config, g = c.ROLLBACK_GIFT;
  const want = Object.entries(g.gear);
  const items = window.gear.items;
  const pieces = want.map(([id, n]) => ({ id, n, got: items.filter((it) => it.id === id).length,
    bare: items.filter((it) => it.id === id).every((it) => it.prefixes.length === 0 && it.suffixes.length === 0) }));
  const orbs = Object.keys(c.ORBS).map((id) => [id, window.orbs.count(id)]);
  return { pieces, orbs, each: g.orbsEach, flag: localStorage.getItem(c.STORAGE.rollbackGift) };
})()`);
check('the title gives every piece the gift names, bare (no 속성)',
  first.pieces.length > 0 && first.pieces.every((p) => p.got === p.n && p.bare), JSON.stringify(first.pieces));
check('and ROLLBACK_GIFT.orbsEach of every 구슬', first.orbs.every(([, n]) => n === first.each), JSON.stringify(first.orbs));
check('and says so on the title, and marks it given', toast.length === 1 && /오니고로시/.test(toast[0]) && !!first.flag, JSON.stringify({ toast, flag: first.flag }));

// --- once only ---
await toTitle();
await sleep(1500);
const again = await ev(`(() => ({ pieces: window.gear.items.filter((it) => it.id === 'onigoroshi').length,
  orb: window.orbs.count('chaos') }))()`);
check('a second visit gives nothing more', again.pieces === first.pieces.find((p) => p.id === 'onigoroshi').n && again.orb === first.each,
  JSON.stringify(again));

// --- a run saved on 0.71–0.79 is not offered ---
await ev(`(() => {
  const key = window.config.STORAGE.save;
  localStorage.setItem(key, window.sealRecord(key, { version: 1, savedAt: Date.now(), elapsedMs: 60000, level: 3, xp: 0,
    skills: { meleeStrike: { level: 1 } }, main: 'meleeStrike', kit: { equipped: {}, orbs: {} } }));
  return 1;
})()`);
await toTitle();
await sleep(1000);
const old = await scene('MenuScene', `return { load: s.menu.rows[1].item.enabled ? s.menu.rows[1].item.enabled() : true, kept: localStorage.getItem(window.config.STORAGE.save) };`);
check('a run saved with a 0.71–0.79 kit is thrown away, not offered', old.load === false && old.kept === null, JSON.stringify(old));

const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
