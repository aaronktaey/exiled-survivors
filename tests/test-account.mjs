// 계정: signing in (as far as the browser sees it), syncing records with the
// account, choosing between two sets of records, the ranking's sign-in step,
// signing out and deleting the account — against an in-page stand-in for the
// Worker's /api, kept in sessionStorage so it survives the page's reloads.
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
const scene = (key, body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('${key}'); ${body} })()`);
const BASE = 'http://localhost:5173/';

// The stand-in server, installed before any page script on every load.
const FAKE = `
  window.__accountOn = true;
  window.__sharedOn = true;
  (() => {
    const KEY = '__fake_server';
    const load = () => JSON.parse(sessionStorage.getItem(KEY) || 'null') || {
      user: null, providers: ['google', 'facebook'], save: { data: null, updatedAt: 0 }, board: [], calls: [],
    };
    const store = (s) => sessionStorage.setItem(KEY, JSON.stringify(s));
    window.__fake = { load, store };
    const realFetch = window.fetch.bind(window);
    const reply = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    window.fetch = async (input, init = {}) => {
      const url = new URL(String(input), location.href);
      if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
      const method = (init.method || 'GET').toUpperCase();
      const s = load();
      s.calls.push(method + ' ' + url.pathname);
      let out;
      if (url.pathname === '/api/me') out = reply({ user: s.user, providers: s.providers });
      else if (url.pathname === '/api/save' && method === 'GET') out = s.user ? reply(s.save) : reply({ error: 'signed out' }, 401);
      else if (url.pathname === '/api/save' && method === 'PUT') {
        const body = JSON.parse(init.body);
        if (body.base !== s.save.updatedAt) out = reply({ error: 'conflict', ...s.save }, 409);
        else { s.save = { data: body.data, updatedAt: Math.max(Date.now(), s.save.updatedAt + 1) }; out = reply({ ok: true, updatedAt: s.save.updatedAt }); }
      } else if (url.pathname === '/api/auth/logout') { s.user = null; out = reply({ ok: true }); }
      else if (url.pathname === '/api/me/delete') { s.user = null; s.save = { data: null, updatedAt: 0 }; s.board = []; s.deleted = true; out = reply({ ok: true }); }
      else if (url.pathname === '/api/ranking' && method === 'POST') {
        if (!s.user) out = reply({ error: 'signed out' }, 401);
        else { const run = JSON.parse(init.body); s.board.push({ ...run, at: new Date().toISOString() }); out = reply({ ok: true, place: 1, entries: s.board }); }
      } else if (url.pathname === '/api/ranking') out = reply({ entries: s.board });
      else if (url.pathname === '/api/ranking/me') out = reply({ best: s.board[0] ?? null, place: s.board.length ? 1 : 0 });
      else out = reply({ error: 'not found' }, 404);
      store(s);
      return out;
    };
  })();
`;
const { result: hook } = await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE });

const fake = (body) => ev(`(() => { const s = window.__fake.load(); ${body}; window.__fake.store(s); return s; })()`);
const arrive = async (url = BASE) => {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await cdp.send('Page.navigate', { url });
  await sleep(3800);
};
const user = { id: 'u1', provider: 'google', name: 'Alice', rank: { name: '', emoji: '', flag: '' } };
// A record this browser keeps, marked so each change can be told apart: the
// tree's account experience (the equipment stash was the marker until gear
// stopped outliving a run).
// Each tree is told apart by how far up the 전사 spine it has gone.
const XP = { mine: 1, later: 2, fromOther: 3, localOnly: 4, remoteOnly: 5 };
const spine = (n) => Array.from({ length: n }, (_, i) => `warrior.s${i + 1}`);
const mark = (name) => `window.passives.reset(); ${JSON.stringify(spine(XP[name]))}.forEach((id) => window.passives.allocate(id));`;
const tree = (name) => JSON.stringify({ version: 3, allocated: spine(XP[name]) });
const holds = (data, name) => { try { return JSON.parse(data?.['exiled-survivors:passives:v1'] ?? '{}').allocated?.length === XP[name]; } catch { return false; } };

try {
  // --- 1. signed out: the corner icon, and the ways in ---
  await arrive();
  await ev(`(() => { localStorage.clear(); sessionStorage.clear(); return 1; })()`);
  await arrive();
  const icon = await scene('MenuScene', `const v = s.icons.views.find(v => v.button.id === 'account'); return v ? v.label.text : null;`);
  check('the title has a sign-in icon in the corner', icon === '로그인', String(icon));
  await scene('MenuScene', `s.icons.views.find(v => v.button.id === 'account').button.onSelect(); return 1;`);
  await sleep(700);
  const out = await scene('AccountScene', `return { rows: s.menu.items.map(i => i.id), accents: s.menu.items.map(i => i.accent ?? null), lead: s.lead.text };`);
  check('signed out, it offers each way in the server has, in its own colours',
    JSON.stringify(out.rows) === JSON.stringify(['login:google', 'login:facebook', 'privacy']) &&
      out.accents[0] !== null && out.accents[1] !== null && /로그인하면/.test(out.lead),
    JSON.stringify(out));
  await shot('account-01-signed-out');

  // --- 2. back from the provider, with records here and none on the account ---
  await ev(`(() => { ${mark('mine')} return 1; })()`);
  await fake(`s.user = ${JSON.stringify(user)}`);
  await arrive(`${BASE}#login=ok`);
  await sleep(800);
  const first = await ev(`(() => { const s = window.__fake.load(); return {
    hash: location.hash, uploaded: Object.keys(s.save.data || {}), at: s.save.updatedAt,
    note: JSON.parse(localStorage.getItem('exiled-survivors:sync:v1') || 'null'),
    status: window.cloudSave.status, icon: window.game.scene.getScene('MenuScene').icons.views.find(v => v.button.id === 'account').label.text,
  }; })()`);
  check('coming back signed in takes the fragment off and shows as signed in',
    first.hash === '' && first.icon === '계정', JSON.stringify({ hash: first.hash, icon: first.icon }));
  check('a first sign-in with an empty account uploads this browser’s records',
    first.uploaded.includes('exiled-survivors:passives:v1') && !first.uploaded.includes('exiled-survivors:sync:v1') &&
      first.at > 0 && first.note?.at === first.at && first.status === 'synced',
    JSON.stringify(first));

  // --- 3. a change here goes up on the next sync ---
  await ev(`(() => { ${mark('later')} return 1; })()`);
  await ev(`window.cloudSave.flush().then(() => 1)`);
  await sleep(500);
  const flushed = await fake(`0`);
  check('a change made here is uploaded on the next sync',
    holds(flushed.save.data, 'later') && flushed.save.updatedAt > first.at);

  // --- 4. another device moved the account on; this browser did not change ---
  const other = { 'exiled-survivors:passives:v1': tree('fromOther') };
  await fake(`s.save = { data: ${JSON.stringify(other)}, updatedAt: s.save.updatedAt + 1000 }`);
  await arrive();
  await sleep(2500);
  const took = await ev(`({ xp: window.passives.value.allocated.length, conflict: window.cloudSave.conflict !== null })`);
  check('when only the account changed, its records are taken and the game starts on them',
    took.xp === XP.fromOther && !took.conflict, JSON.stringify(took));

  // --- 5. both changed: the player is asked ---
  await ev(`(() => { ${mark('localOnly')} return 1; })()`);
  await fake(`s.save = { data: { 'exiled-survivors:passives:v1': ${JSON.stringify(tree('remoteOnly'))} }, updatedAt: s.save.updatedAt + 1000 }`);
  await arrive();
  await sleep(1500);
  const texts = `s.children.list.filter((o) => o.type === 'Text').map((o) => o.text)`;
  const asked = await scene('ConflictScene', `return { active: s.scene.isActive(), cards: s.headings.map((h, i) => h.text + ':' + s.cards[i].text.split(String.fromCharCode(10))[0]), texts: ${texts} };`);
  check('when both changed, the title opens the choice, both sides read out, no keep buttons under them',
    asked.active === true && asked.cards.length === 2 && /이 기기/.test(asked.cards[0]) && /계정/.test(asked.cards[1]) &&
      !asked.texts.some((t) => /기록 쓰기/.test(t)) && asked.texts.some((t) => /나중에/.test(t)),
    JSON.stringify(asked.cards));
  await shot('account-02-conflict');
  // Pressing a card asks once more, saying what is lost; 취소 keeps nothing.
  const popup = await scene('ConflictScene', `s.ask('local');
    return { asking: s.asking, texts: s.popup.list.filter((o) => o.type === 'Text').map((o) => o.text) };`);
  check('pressing a side opens a popup that asks once more and says what is lost',
    popup.asking === 'local' && popup.texts.some((t) => /이 기기의 기록을 쓸까요/.test(t)) &&
      popup.texts.some((t) => /사라지/.test(t)) && popup.texts.some((t) => t === '취소'),
    popup.texts.join(' | '));
  await shot('account-03-conflict-ask');
  const backedOff = await scene('ConflictScene', `s.cancel(); return { asking: s.asking, popup: !!s.popup, active: s.scene.isActive() };`);
  const untouched = await fake(`0`);
  check('and 취소 closes it, keeping nothing',
    backedOff.asking === null && !backedOff.popup && backedOff.active &&
      !holds(untouched.save.data, 'localOnly'));
  await scene('ConflictScene', `s.ask('local'); void s.confirm(); return 1;`);
  await sleep(800);
  const kept = await fake(`0`);
  check('keeping this device’s writes it over the account’s copy',
    holds(kept.save.data, 'localOnly') && !holds(kept.save.data, 'remoteOnly'),
    (kept.save.data?.['exiled-survivors:passives:v1'] ?? '').slice(0, 120));

  // --- 6. the ranking: entering goes by way of signing in ---
  await scene('MenuScene', `
    window.account.user = null; window.account.notify();
    s.scene.launch('RankEntryScene', { run: { damage: 77777, level: 9, survivedMs: 300000 }, onDone: () => {} });
    return 1;`);
  await sleep(700);
  const entry = await scene('RankEntryScene', `return { needs: s.needsSignIn, labels: s.children.list.filter(o => o.type === 'Text').map(o => o.text) };`);
  check('signed out, the entry popup offers to sign in and enter',
    entry.needs === true && entry.labels.includes('로그인하고 등록'), JSON.stringify(entry.labels.slice(0, 8)));
  await scene('RankEntryScene', `s.finish(true); return 1;`);
  await sleep(700);
  const ranked = await scene('AccountScene', `
    const lead = s.lead.text;
    s.payload.onBeforeLogin();
    return { lead, pending: sessionStorage.getItem('exiled-survivors:pending-rank') };`);
  check('it opens sign-in saying why, and the run waits for the trip',
    /랭킹에 올리려면/.test(ranked.lead) && /77777/.test(ranked.pending ?? ''), JSON.stringify(ranked));
  await fake(`s.user = ${JSON.stringify(user)}`);
  await arrive(`${BASE}#login=ok`);
  await sleep(1500);
  const landed = await ev(`(() => ({ board: window.__fake.load().board.map(e => e.damage),
    pending: sessionStorage.getItem('exiled-survivors:pending-rank'), ranking: window.game.scene.isActive('RankingScene') }))()`);
  check('coming back signed in hands the waiting run in and opens the board',
    landed.board.includes(77777) && landed.pending === null && landed.ranking === true, JSON.stringify(landed));
  await shot('account-03-entered');
  await scene('RankingScene', `s.backButton.press(); return 1;`);
  await sleep(500);

  // --- 7. signed in: sign out, and delete ---
  await scene('MenuScene', `s.icons.views.find(v => v.button.id === 'account').button.onSelect(); return 1;`);
  await sleep(700);
  const signedIn = await scene('AccountScene', `return { rows: s.menu.items.map(i => i.id), lead: s.lead.text };`);
  check('signed in, it says who and how the records are doing, with sign out and delete',
    /Google 계정으로 로그인 중 — Alice/.test(signedIn.lead) && /동기화/.test(signedIn.lead) &&
      JSON.stringify(signedIn.rows) === JSON.stringify(['logout', 'delete', 'privacy']),
    JSON.stringify(signedIn));
  await shot('account-04-signed-in');
  await scene('AccountScene', `s.menu.items.find(i => i.id === 'delete').onSelect(); return 1;`);
  await sleep(300);
  const armed = await scene('AccountScene', `return { armed: s.armed, deleted: !!window.__fake.load().deleted };`);
  check('delete asks once before it does anything', armed.armed === true && armed.deleted === false);
  await scene('AccountScene', `s.menu.items.find(i => i.id === 'delete').onSelect(); return 1;`);
  await sleep(1200);
  const gone = await ev(`(() => ({ deleted: !!window.__fake.load().deleted, user: window.account.user,
    note: localStorage.getItem('exiled-survivors:sync:v1'), xp: window.passives.value.allocated.length,
    rows: window.game.scene.getScene('AccountScene').menu?.items.map(i => i.id) }))()`);
  check('the second press deletes the account; this browser keeps its records but no longer syncs',
    gone.deleted && gone.user === null && gone.note === null && gone.xp > 0 && gone.rows?.[0] === 'login:google',
    JSON.stringify(gone));
} catch (error) {
  check('the suite ran to the end', false, String(error?.stack ?? error));
} finally {
  await cdp.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hook?.identifier });
  await ev(`(() => { localStorage.clear(); sessionStorage.clear(); return 1; })()`);
}

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
