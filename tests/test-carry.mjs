// 이사: a player's records arriving from the old address in the URL's
// fragment (bridge/index.html → src/systems/CarryOver.ts), written in before
// any store reads them.
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
};
const ev = (expr) => cdp.evaluate(expr);
const BASE = 'http://localhost:5173/';

// What the old address would hand over: the bridge's own encoding.
const encode = (items) =>
  Buffer.from(JSON.stringify({ v: 1, items }), 'utf8').toString('base64url');
// What a player keeps between runs, told apart by how many 고대 두개골 it holds.
const MOVED_XP = 3;
const items = {
  // The equipment stash an old browser still holds: gear no longer outlives a
  // run, so it comes over and is cleared at once.
  'exiled-survivors:gear:v2': JSON.stringify({ items: [{ uid: 'moved', id: 'runedSword', prefixes: [], suffixes: [] }], equipped: 'moved' }),
  'exiled-survivors:bones:v1': JSON.stringify({ rib: 2, skull: MOVED_XP }),
  // Not the game's: it is left behind.
  'someone-else:key': 'x',
};

// A dialog a person would answer: here, by what the suite says.
const { result: hook } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.confirm = (q) => { window.__asked = q; return localStorage.getItem('__answer') !== 'no'; };`,
});

const land = async () => {
  await cdp.send('Page.navigate', { url: BASE });
  await sleep(1500);
};
// From a blank page, so arriving with a fragment is a real page load and not
// a hash change on the page already open.
const arrive = async (url) => {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await cdp.send('Page.navigate', { url });
  await sleep(3500);
};

try {
  // --- 1. a browser that never played here takes them without asking ---
  await land();
  await ev(`(() => { localStorage.clear(); return 1; })()`);
  await arrive(`${BASE}#carry=${encode(items)}`);
  const fresh = await ev(`(() => ({
    hash: location.hash,
    xp: window.bones.count('skull'),
    stash: localStorage.getItem('exiled-survivors:gear:v2'),
    bones: window.bones.count('rib'),
    foreign: localStorage.getItem('someone-else:key'),
    asked: window.__asked ?? null,
    menu: window.game.scene.isActive('MenuScene'),
  }))()`);
  console.log('fresh:', JSON.stringify(fresh));
  check('a fresh browser takes the records it was brought, without asking',
    fresh.xp === MOVED_XP && fresh.bones === 2 && fresh.asked === null,
    JSON.stringify(fresh));
  check('only the game’s own keys are written', fresh.foreign === null);
  check('and the old equipment stash it brings is cleared, gear being the run’s now', fresh.stash === null);
  check('the fragment comes off the address, and the game opens as usual',
    fresh.hash === '' && fresh.menu === true, `hash "${fresh.hash}"`);
  await shot('carry-01-taken');

  // --- 2. a reload does not do it again ---
  await ev(`(() => { window.bones.reset(); return 1; })()`);
  await cdp.send('Page.reload', {});
  await sleep(3000);
  const reloaded = await ev(`(() => ({ bones: window.bones.count('rib') }))()`);
  check('reloading afterwards does not bring them in twice', reloaded.bones === 0, `${reloaded.bones} 갈비뼈`);

  // --- 3. a browser that already has records here is asked first ---
  await ev(`(() => { localStorage.setItem('__answer', 'no'); return 1; })()`);
  await arrive(`${BASE}#carry=${encode(items)}`);
  const declined = await ev(`(() => ({ asked: window.__asked ?? null, xp: window.bones.count('skull'), hash: location.hash }))()`);
  check('a browser with records here is asked, and keeps its own when it says no',
    typeof declined.asked === 'string' && declined.asked.length > 0 && declined.xp !== undefined && declined.hash === '',
    JSON.stringify(declined));

  await ev(`(() => { localStorage.setItem('__answer', 'yes'); window.bones.reset(); return 1; })()`);
  await arrive(`${BASE}#carry=${encode(items)}`);
  const accepted = await ev(`(() => ({ asked: window.__asked ?? null, xp: window.bones.count('skull') }))()`);
  check('and takes them when it says yes', typeof accepted.asked === 'string' && accepted.xp === MOVED_XP,
    JSON.stringify(accepted));

  // --- 4. a broken fragment changes nothing ---
  await ev(`(() => { localStorage.clear(); return 1; })()`);
  await arrive(`${BASE}#carry=%%%not-base64`);
  const broken = await ev(`(() => ({ hash: location.hash, menu: window.game.scene.isActive('MenuScene'),
    keys: Object.keys(localStorage).filter(k => k.startsWith('exiled-survivors:gear')).length }))()`);
  check('a broken fragment is dropped and the game opens anyway',
    broken.hash === '' && broken.menu === true, JSON.stringify(broken));
} catch (error) {
  check('the suite ran to the end', false, String(error));
} finally {
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook?.identifier });
  await ev(`(() => { localStorage.clear(); return 1; })()`);
}

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
