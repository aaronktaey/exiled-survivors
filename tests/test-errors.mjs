// test-errors: 오류 수집 (0.160) in the page — an uncaught error or an
// unhandled rejection is posted to /api/errors with what the page knew, each
// kind once, at most a page's share, and never on the dev server unless a
// page asks (window.__errorsOn). The Worker's side is in test-api.
import { connect, sleep } from './cdp-lib.mjs';

const cdp = await connect();
const BASE = 'http://localhost:5173/';
const results = [];
const check = (n, p, d = '') => {
  results.push({ n, p });
  console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
};
const ev = (expr) => cdp.evaluate(expr);
const arrive = async () => {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await cdp.send('Page.navigate', { url: BASE });
  await cdp.until(`window.game && window.game.scene.isActive('MenuScene') ? 1 : 0`, 30000, 200);
};
// Every post to /api/errors is kept in the page instead of going anywhere.
const CATCH = `
  window.__posts = [];
  const real = window.fetch.bind(window);
  window.fetch = (url, init) => String(url).includes('/api/errors')
    ? (window.__posts.push(JSON.parse(init.body)), Promise.resolve(new Response('{"ok":true}', { status: 201 })))
    : real(url, init);
`;
const throwSoon = (message) => ev(`(() => { setTimeout(() => { throw new TypeError(${JSON.stringify(message)}); }, 0); return 1; })()`);

// --- 1. the dev server sends nothing unless asked ---
const quiet = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: CATCH });
await arrive();
await throwSoon('probe while off');
await sleep(400);
const off = await ev(`window.__posts.length`);
check('on the dev server nothing is sent', off === 0, `${off} posts`);
await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: quiet.result?.identifier });

// --- 2. asked to, an uncaught error goes, once a kind, with what the page knew ---
const on = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errorsOn = true; ${CATCH}` });
await arrive();
await throwSoon('probe failure');
await throwSoon('probe failure');
await ev(`(() => { Promise.reject(new Error('probe rejection')); return 1; })()`);
const sent = await cdp.until(`window.__posts.length >= 2 ? window.__posts : null`, 5000, 100);
await sleep(300);
const all = await ev(`window.__posts`);
// The patch icon's corner carries the newest version (0.155).
const version = await ev(`(() => window.game.scene.getScene('MenuScene').icons.views.find((v) => v.button.id === 'patch').corner.text.replace(/^v/i, ''))()`);
const failure = all.filter((p) => p.message.includes('probe failure'));
const rejection = all.find((p) => p.message.includes('probe rejection'));
check('an uncaught error is reported once, however often it happens', Array.isArray(sent) && failure.length === 1, JSON.stringify(all.map((p) => p.message)));
check('and an unhandled rejection too', Boolean(rejection), JSON.stringify(rejection));
const one = failure[0] ?? {};
check('a report says the version, the platform, the screens running, the window and the language',
  one.version === version && one.platform === 'web' && /MenuScene/.test(one.scene) && /^\d+x\d+$/.test(one.screen) && one.lang === 'ko' &&
    typeof one.stack === 'string' && one.agent?.length > 0,
  JSON.stringify(one));

// --- 3. a page sends at most its share ---
for (let i = 0; i < 14; i++) await throwSoon(`probe flood ${i}`);
await sleep(600);
const total = await ev(`window.__posts.length`);
check('a page sends at most ten, whatever goes wrong', total === 10, `${total} posts`);
await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: on.result?.identifier });

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
