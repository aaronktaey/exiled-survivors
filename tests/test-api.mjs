// The game's Worker (server/), run locally by wrangler against an empty
// database of its own: signing in (through the local-only test provider),
// the ranking (and the admin's review of it), the cloud save, signing out
// and deleting an account, and that
// the built game is served beside the API.
//
// It needs no browser. It builds the game first if there is no build to
// serve, and stops its Worker when it is done.
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;
const FB_SECRET = 'fb-test-secret';
const results = [];
const check = (n, p, d = '') => {
  results.push({ n, p });
  console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' });
}

// A database of its own, so nothing carries over between runs.
const state = mkdtempSync(join(tmpdir(), 'es-api-'));
const env = { ...process.env, CI: '1' };
execSync(`npx wrangler d1 migrations apply DB --local --persist-to "${state}"`, { cwd: ROOT, env, stdio: 'ignore' });
// Runs from yesterday by another account, all about ten minutes long, for
// the review to compare today's runs with.
const yesterday = Date.now() - 86_400_000;
const peers = [[90000, 560000], [100000, 580000], [110000, 620000], [120000, 640000]]
  .map(([damage, ms], i) => `('PEE', '', 'KR', ${damage}, 12, ${ms}, '${new Date(yesterday + i).toISOString()}', ${yesterday + i}, 'h', 'peer-user')`)
  .join(', ');
// Yesterday on the board's clock, for 어제의 랭킹: four runs, three shown. The
// board's days start at 05:00 KST until 10/28 05:00 and at 03:00 after
// (RANKING.dailyReset — the same rule, written out here as this file runs
// without the game's TypeScript).
const DAY = 86_400_000;
const SWITCH = Date.UTC(2026, 9, 27, 20);
const startAt = (t, hour) => { const shift = (9 - hour) * 3_600_000; return Math.floor((t + shift) / DAY) * DAY - shift; };
const dayStart = (t) => (t < SWITCH ? startAt(t, 5) : Math.max(SWITCH, startAt(t, 3)));
const today = dayStart(Date.now());
const yday = dayStart(today - 1);
const podiumSeed =
  `INSERT INTO users (id, created_at, display_name, rank_name, rank_flag) VALUES ` +
  `('y1', 0, 'y1', 'YON', 'KR'), ('y2', 0, 'y2', 'YTW', ''), ('y3', 0, 'y3', 'YTH', ''), ('y4', 0, 'y4', 'YFO', ''); ` +
  `INSERT INTO identities (provider, subject, user_id) VALUES ('test', 'ytwo', 'y2'), ('test', 'yfour', 'y4'); ` +
  `INSERT INTO daily_best (day, user_id, entry_id, damage, level, survived_ms, at, skill) VALUES ` +
  `(${yday}, 'y2', 0, 200, 9, 500000, '${new Date(yday + 2).toISOString()}', ''), ` +
  `(${yday}, 'y1', 0, 300, 10, 600000, '${new Date(yday + 1).toISOString()}', 'fireball'), ` +
  `(${yday}, 'y4', 0, 50, 5, 100000, '${new Date(yday + 4).toISOString()}', ''), ` +
  `(${yday}, 'y3', 0, 100, 8, 400000, '${new Date(yday + 3).toISOString()}', ''); ` +
  // A save written into the database by hand with a value that is not text.
  `INSERT INTO users (id, created_at, display_name) VALUES ('obj-user', 0, 'objy'); ` +
  `INSERT INTO identities (provider, subject, user_id) VALUES ('test', 'objy', 'obj-user'); ` +
  `INSERT INTO saves (user_id, data, updated_at) VALUES ('obj-user', ` +
  `json_object('exiled-survivors:orbs:v1', json_object('mango', 3), 'exiled-survivors:gold:v1', '5'), 5); `;
// One account named in ADMIN_USERS, signed in to through the test provider as "boss".
execSync(
  `npx wrangler d1 execute DB --local --persist-to "${state}" --command "` +
    `INSERT INTO users (id, created_at, display_name, rank_name) VALUES ('admin-user', 0, 'boss', 'OLD'); ` +
    `INSERT INTO identities (provider, subject, user_id) VALUES ('test', 'boss', 'admin-user'); ` +
    // A best from a day long gone: the board starts over every day, so it must not show.
    `INSERT INTO daily_best (day, user_id, entry_id, damage, level, survived_ms, at) ` +
    `VALUES (0, 'admin-user', 0, 999999999, 50, 3600000, '1970-01-01T00:00:00.000Z'); ` +
    // Second and third that day, for the silver and bronze counts.
    `INSERT INTO users (id, created_at, display_name, rank_name) VALUES ('silver-user', 0, 'silver', 'SIL'), ('bronze-user', 0, 'bronze', 'BRO'); ` +
    `INSERT INTO identities (provider, subject, user_id) VALUES ('test', 'silver', 'silver-user'), ('test', 'bronze', 'bronze-user'); ` +
    `INSERT INTO daily_best (day, user_id, entry_id, damage, level, survived_ms, at) VALUES ` +
    `(0, 'silver-user', 0, 999999, 50, 3600000, '1970-01-01T00:00:00.000Z'), (0, 'bronze-user', 0, 9999, 50, 3600000, '1970-01-01T00:00:00.000Z'); ` +
    `INSERT INTO entries (name, emoji, flag, damage, level, survived_ms, at, at_ms, ip_hash, user_id) VALUES ${peers}; ` +
    podiumSeed + '"',
  { cwd: ROOT, env, stdio: 'ignore' },
);
const worker = spawn(
  'npx',
  [
    // --local-upstream keeps request URLs on this address: without it wrangler
    // dresses every request as the production domain the routes name.
    'wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--local-upstream', `127.0.0.1:${PORT}`,
    '--persist-to', `"${state}"`,
    '--var', 'AUTH_TEST:1', '--var', 'DAILY_DAY:0', '--var', 'AUTH_SECRET:local-test-secret', '--var', 'ADMIN_USERS:admin-user', '--var', `FACEBOOK_CLIENT_SECRET:${FB_SECRET}`,
  ],
  { cwd: ROOT, env, shell: true, stdio: 'ignore' },
);
const stop = () => {
  try {
    if (process.platform === 'win32') execSync(`taskkill /pid ${worker.pid} /T /F`, { stdio: 'ignore' });
    else worker.kill('SIGTERM');
  } catch {
    // Already gone.
  }
};

/** A browser of sorts: it keeps its cookies and sends them back. */
const browser = () => {
  const jar = new Map();
  const call = async (path, init = {}) => {
    const headers = { ...(init.headers ?? {}) };
    if (jar.size) headers.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const response = await fetch(`${BASE}${path.startsWith('http') ? '' : path}`.replace(`${BASE}${BASE}`, BASE), {
      redirect: 'manual', ...init, headers,
    });
    for (const line of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attrs] = line.split(';');
      const [name, ...rest] = pair.split('=');
      const gone = attrs.some((a) => /max-age=0/i.test(a.trim()));
      if (gone) jar.delete(name.trim()); else jar.set(name.trim(), rest.join('='));
    }
    return response;
  };
  const signIn = async (who) => {
    const out = await call(`/api/auth/test/start?return=/&as=${who}`);
    const back = new URL(out.headers.get('location'));
    const landed = await call(back.pathname + back.search);
    return landed.headers.get('location');
  };
  const send = (path, method, body, headers = {}) =>
    call(path, { method, headers: { 'Content-Type': 'application/json', Origin: BASE, ...headers }, body: JSON.stringify(body) });
  return { call, signIn, send, jar };
};
const read = async (response) => ({ status: response.status, body: await response.json().catch(() => null) });
// An honest run's 판 내역: a level-12 run's upgrades, out of what its kills allow.
const honest = { build: 'dev', version: '0.69', kills: { grunt: 300, boss: 2 }, bones: [], gear: null,
  skills: [{ id: 'meleeStrike', level: 12 }, { id: 'fireball', level: 3 }], passives: {}, resumed: false,
  // The second clock (RunLedger): a little over the shown one, as honest play leaves it.
  wall: 640000 };
const run = (over = {}) => ({ name: 'ABC', emoji: '', flag: 'KR', damage: 120000, level: 12, survivedMs: 600000, detail: honest, ...over });

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await sleep(1000);
    up = await fetch(`${BASE}/api/ranking`).then((r) => r.ok, () => false);
  }
  check('the Worker comes up locally', up);

  // --- signing in ---
  const alice = browser();
  const before = await read(await alice.call('/api/me'));
  check('signed out, /api/me says so and lists the ways in',
    before.body?.user === null && Array.isArray(before.body?.providers) && before.body.providers.includes('test') &&
      !before.body.providers.includes('google'),
    JSON.stringify(before.body));

  const landing = await alice.signIn('alice');
  const who = await read(await alice.call('/api/me'));
  check('the sign-in round trip lands back on the game, signed in',
    landing === '/#login=ok' && who.body?.user?.name === 'Tester alice' && who.body?.user?.provider === 'test' &&
      alice.jar.has('es_session') && !alice.jar.has('es_oauth'),
    `${landing} ${JSON.stringify(who.body?.user)}`);

  check('an ordinary account is not offered the developer tools', who.body?.user?.admin === false,
    JSON.stringify(who.body?.user));
  const boss = browser();
  await boss.signIn('boss');
  const bossIs = await read(await boss.call('/api/me'));
  check('the account named in ADMIN_USERS is', bossIs.body?.user?.id === 'admin-user' && bossIs.body?.user?.admin === true,
    JSON.stringify(bossIs.body?.user));

  // --- 밸런스: everyone's values, set by the admin only, on the listed paths only ---
  const tuned0 = await read(await fetch(`${BASE}/api/balance`));
  check('everyone’s balance values start empty', tuned0.status === 200 && JSON.stringify(tuned0.body?.overrides) === '{}',
    JSON.stringify(tuned0.body));
  const tunedNotAdmin = await read(await alice.send('/api/balance', 'PUT', { overrides: { 'POTION.chance': 0.05 } }));
  check('an ordinary account cannot set them', tunedNotAdmin.status === 403, JSON.stringify(tunedNotAdmin.body));
  const tunedStray = await read(await boss.send('/api/balance', 'PUT', { overrides: { 'PLAYER.maxHp': 1e9 } }));
  const tunedHuge = await read(await boss.send('/api/balance', 'PUT', { overrides: { 'POTION.chance': 1e9 } }));
  check('nor can the admin set a path no dial has, or a value past belief', tunedStray.status === 400 && tunedHuge.status === 400,
    `${tunedStray.status} ${JSON.stringify(tunedStray.body)} / ${tunedHuge.status}`);
  // A dial ships only when the user asks for it (2026-10-19): a path that
  // was one and is not now is refused; one that is (0.77: drops) is taken.
  const tunedOld = await read(await boss.send('/api/balance', 'PUT', { overrides: { 'BOSS.intervalMs': 60000 } }));
  check('a path that is no dial now is refused, even from the admin', tunedOld.status === 400, JSON.stringify(tunedOld.body));
  const tunedDial = await read(await boss.send('/api/balance', 'PUT', { overrides: { 'POTION.chance': 0.05, 'DIFFICULTY.hpStepTiers.1.multiplier': 4 } }));
  check('a dial that ships is taken from the admin', tunedDial.status === 200 && tunedDial.body?.overrides?.['POTION.chance'] === 0.05,
    JSON.stringify(tunedDial.body));
  const tunedSet = await read(await boss.send('/api/balance', 'PUT', { overrides: {} }));
  const tuned1 = await read(await fetch(`${BASE}/api/balance`));
  check('the admin can still clear them, and the next look sees it at once',
    tunedSet.status === 200 && JSON.stringify(tuned1.body?.overrides) === '{}' && tuned1.body?.updatedAt > 0,
    JSON.stringify(tuned1.body));

  const forged = browser();
  const out = await forged.call('/api/auth/test/start?return=/');
  const back = new URL(out.headers.get('location'));
  back.searchParams.set('state', 'not-the-state');
  const refused = await forged.call(back.pathname + back.search);
  check('a callback with the wrong state is refused', refused.headers.get('location') === '/#login=error' && !forged.jar.has('es_session'),
    refused.headers.get('location'));
  const elsewhere = await browser().call('/api/auth/test/start?return=//evil.example/x');
  const elsewhereBack = new URL(elsewhere.headers.get('location'));
  const sent = await read(await fetch(`${BASE}${elsewhereBack.pathname}${elsewhereBack.search}`, { redirect: 'manual' }));
  check('and it never sends anyone off the site', !/evil/.test(elsewhere.headers.get('location')), elsewhere.headers.get('location'));
  void sent;
  const real = await read(await browser().call('/api/auth/google/start'));
  check('a provider without keys is not offered', real.status === 404);

  // --- the ranking: signed in only, one best per account ---
  const guest = await read(await browser().send('/api/ranking', 'POST', run()));
  check('a run handed in signed out is turned away', guest.status === 401, `${guest.status}`);

  const refusedRuns = {
    name: (await read(await alice.send('/api/ranking', 'POST', run({ name: 'abcd' })))).body?.error,
    flag: (await read(await alice.send('/api/ranking', 'POST', run({ flag: 'ZZ' })))).body?.error,
    pace: (await read(await alice.send('/api/ranking', 'POST', run({ damage: 9e9, survivedMs: 10000 })))).body?.error,
    short: (await read(await alice.send('/api/ranking', 'POST', run({ survivedMs: 1000 })))).body?.error,
  };
  check('a run that is not a run is turned down, and says why',
    refusedRuns.name === 'name' && refusedRuns.flag === 'flag' && refusedRuns.pace === 'pace' && refusedRuns.short === 'time',
    JSON.stringify(refusedRuns));

  // Skills out of reach of the run's level, kills and time — a save edited
  // by hand — and a run with no 판 내역: turned down without saying why.
  const edited = await read(await alice.send('/api/ranking', 'POST', run({
    detail: { ...honest, kills: { grunt: 111 }, skills: [{ id: 'fireball', level: 269 }, { id: 'voidOrb', level: 479 }], resumed: true },
  })));
  const bare = await read(await alice.send('/api/ranking', 'POST', run({ detail: undefined })));
  check('a run whose skills are out of reach of its level, kills and time is turned down',
    edited.status === 400 && bare.status === 400, `${edited.status} ${bare.status}`);
  check('and is told nothing of why', edited.body?.error === 'refused' && bare.body?.error === 'refused' &&
    !/skill|upgrade|level|kill/i.test(JSON.stringify(edited.body)), JSON.stringify(edited.body));

  // 오늘의 규칙 (0.126): a run that held the day's banned skill is refused the
  // same way. Every skill at level 1 (nothing out of reach) on the first day
  // the rules ran — one of them is that day's banned one. (DAILY_DAY:0 keeps
  // every other run here free of rules, whatever the calendar says.)
  const everySkill = ['meleeStrike', 'fireball', 'chainLightning', 'iceSpear', 'voidOrb', 'thunderStrike', 'drone', 'poisonNova']
    .map((id) => ({ id, level: 1 }));
  const banned = await read(await alice.send('/api/ranking', 'POST', run({
    detail: { ...honest, skills: everySkill, rules: Date.UTC(2026, 9, 25, 20) },
  })));
  check('a run that held the day’s banned skill is turned down, saying nothing (오늘의 규칙)',
    banned.status === 400 && banned.body?.error === 'refused', JSON.stringify(banned.body));

  // The shown clock against the second one (0.71): pushed on, held back, or
  // with no second clock at all — refused the same way, saying nothing.
  const { wall: _w, ...noWall } = honest;
  const clocks = {
    pushed: await read(await alice.send('/api/ranking', 'POST', run({ detail: { ...honest, wall: 300000 } }))),
    held: await read(await alice.send('/api/ranking', 'POST', run({ detail: { ...honest, wall: 3000000 } }))),
    none: await read(await alice.send('/api/ranking', 'POST', run({ detail: noWall }))),
  };
  check('a shown clock far from the second one, or no second clock, is turned down',
    Object.values(clocks).every((r) => r.status === 400 && r.body?.error === 'refused'),
    JSON.stringify(Object.fromEntries(Object.entries(clocks).map(([k, r]) => [k, r.status]))));
  check('and says nothing of clocks either', !/clock|wall|time|pace/i.test(JSON.stringify(clocks.pushed.body)),
    JSON.stringify(clocks.pushed.body));

  // A time made of frame times, with a fraction: rounded down, not refused.
  const first = await read(await alice.send('/api/ranking', 'POST', run({ name: 'ALI', damage: 50000.4, survivedMs: 600016.67 })));
  check('a signed-in run is taken, placed, and the board comes back with it',
    first.status === 200 && first.body?.place === 1 && first.body?.entries?.[0]?.name === 'ALI' &&
      first.body?.entries?.[0]?.survivedMs === 600016 && first.body?.entries?.[0]?.damage === 50000 &&
      !('userId' in (first.body?.entries?.[0] ?? {})),
    JSON.stringify(first.body));
  const again = await read(await alice.send('/api/ranking', 'POST', run({ name: 'ALI', damage: 90000 })));
  check('the same account handing in again at once is told to slow down', again.status === 429, `${again.status}`);
  // 0.113: a run handed in again (the page reloaded before hearing back) is
  // answered as taken — inside the cooldown and all — and not entered twice.
  const resent = await read(await alice.send('/api/ranking', 'POST', run({ name: 'ALI', damage: 50000.4, survivedMs: 600016.67 })));
  const onceBoard = await read(await fetch(`${BASE}/api/ranking`));
  check('the same run handed in again is answered as taken, not entered twice and not told to slow down',
    resent.status === 200 && resent.body?.again === true && resent.body?.place === 1 &&
      onceBoard.body?.entries?.filter((e) => e.name === 'ALI').length === 1,
    JSON.stringify({ status: resent.status, again: resent.body?.again, board: onceBoard.body?.entries?.map((e) => e.name) }));
  check('every board says when the server read it (asOf), the one a run comes back with too',
    Number.isFinite(first.body?.asOf) && first.body.asOf > 0 && Number.isFinite(onceBoard.body?.asOf) &&
      onceBoard.body.asOf >= first.body.asOf - 1000,
    JSON.stringify({ posted: first.body?.asOf, got: onceBoard.body?.asOf }));

  const bob = browser();
  await bob.signIn('bob');
  await read(await bob.send('/api/ranking', 'POST', run({ name: 'BOB', damage: 40000 })));
  await sleep(16000);
  const better = await read(await alice.send('/api/ranking', 'POST', run({ name: 'ACE', damage: 80000, skill: 'fireball' })));
  const board = await read(await fetch(`${BASE}/api/ranking`));
  check('the board holds each account’s best once, under the name it last used',
    better.status === 200 && board.body?.entries?.length === 2 &&
      board.body.entries[0].name === 'ACE' && board.body.entries[0].damage === 80000 &&
      board.body.entries[1].name === 'BOB',
    JSON.stringify(board.body?.entries?.map((e) => `${e.name}:${e.damage}`)));
  const lower = await read(await bob.send('/api/ranking', 'POST', run({ name: 'BOB', damage: 30000 })));
  const kept = await read(await fetch(`${BASE}/api/ranking`));
  check('a run below the account’s best is kept in its history but leaves the board alone',
    lower.status === 200 && kept.body?.entries?.find((e) => e.name === 'BOB')?.damage === 40000,
    JSON.stringify(kept.body?.entries?.map((e) => `${e.name}:${e.damage}`)));
  const bobs = await read(await bob.call('/api/ranking/me'));
  check('and an account can ask where its best stands', bobs.body?.place === 2 && bobs.body?.best?.damage === 40000,
    JSON.stringify(bobs.body));
  const bossBest = await read(await boss.call('/api/ranking/me'));
  check('a best from an earlier day is on neither the board nor the account’s own standing',
    !kept.body?.entries?.some((e) => e.name === 'OLD' || e.damage === 999999999) &&
      bossBest.body?.best === null && bossBest.body?.place === 0,
    JSON.stringify({ board: kept.body?.entries?.map((e) => e.name), boss: bossBest.body }));
  check('a run on the board carries the skill it was played on',
    kept.body?.entries?.find((e) => e.name === 'ACE')?.skill === 'fireball' &&
      kept.body?.entries?.find((e) => e.name === 'BOB')?.skill === '',
    JSON.stringify(kept.body?.entries?.map((e) => `${e.name}:${e.skill}`)));
  check('the first place of a finished day is counted as a win for that account, once',
    bossBest.body?.wins === 1 && kept.body?.entries?.find((e) => e.name === 'ACE')?.wins === 0,
    JSON.stringify({ boss: bossBest.body?.wins, ace: kept.body?.entries?.find((e) => e.name === 'ACE')?.wins }));
  const silver = browser();
  await silver.signIn('silver');
  const bronze = browser();
  await bronze.signIn('bronze');
  const silverBest = await read(await silver.call('/api/ranking/me'));
  const bronzeBest = await read(await bronze.call('/api/ranking/me'));
  check('and its second and third place as theirs, each once',
    silverBest.body?.seconds === 1 && silverBest.body?.wins === 0 && silverBest.body?.thirds === 0 &&
      bronzeBest.body?.thirds === 1 && bronzeBest.body?.seconds === 0 && bossBest.body?.seconds === 0,
    JSON.stringify({ silver: silverBest.body, bronze: bronzeBest.body }));
  // --- 랭킹 검토: 판 내역 kept, outliers marked for the admin, runs taken off with a fall-back ---
  const cheat = browser();
  await cheat.signIn('cheat');
  const detail = {
    build: 'abc123', version: '0.62', kills: { grunt: 1200, boss: 3, 'not a kind': 5 }, bones: ['skull', '<b>'],
    gear: { id: 'onigoroshi', prefixes: [{ id: 'mighty', tier: 1 }, { id: 'cruel', tier: 99 }], suffixes: [] },
    skills: [{ id: 'fireball', level: 30 }], passives: { damage: 10 }, resumed: true, wall: 612345, extra: 'x'.repeat(50),
  };
  const odd = await read(await cheat.send('/api/ranking', 'POST', run({ name: 'CHT', damage: 5_000_000, detail })));
  check('a run far out of line is still put on the board at once, 판 내역 and all',
    odd.status === 200 && odd.body?.entries?.[0]?.name === 'CHT' && !('detail' in (odd.body?.entries?.[0] ?? {})),
    `${odd.status} ${JSON.stringify(odd.body?.entries?.map((e) => e.name))}`);
  const peek = await read(await bob.call('/api/ranking/review'));
  const peekOut = await read(await fetch(`${BASE}/api/ranking/review`));
  check('only the admin may read the review', peek.status === 403 && peekOut.status === 403, `${peek.status} ${peekOut.status}`);
  const review = await read(await boss.call('/api/ranking/review'));
  const rowOf = (name) => review.body?.rows?.find((r) => r.name === name);
  const cht = rowOf('CHT');
  check('the admin sees it marked against other accounts’ runs of a like length, and the rest not',
    cht?.outlier === true && cht.ratio >= review.body?.rule?.factor && cht.peers >= review.body?.rule?.minPeers &&
      cht.entryId > 0 && rowOf('ACE')?.outlier === false && rowOf('BOB')?.outlier === false,
    JSON.stringify(review.body?.rows?.map((r) => `${r.name}:${r.ratio?.toFixed?.(1)}x/${r.peers}:${r.outlier}`)));
  check('with the 판 내역 it handed in — the known fields in their shapes, nothing else',
    cht?.detail?.kills?.boss === 3 && cht.detail.kills.grunt === 1200 && !('not a kind' in cht.detail.kills) &&
      JSON.stringify(cht.detail.bones) === '["skull"]' && cht.detail.gear?.prefixes?.length === 1 &&
      cht.detail.skills?.[0]?.level === 30 && cht.detail.resumed === true && !('extra' in cht.detail) &&
      cht.detail.version === '0.62' && cht.detail.wall === 612345 && rowOf('BOB')?.detail?.version === honest.version,
    JSON.stringify(cht?.detail));
  const notYours = await read(await bob.send('/api/ranking/remove', 'POST', { entryId: cht?.entryId }));
  check('nor may anyone else take a run off', notYours.status === 403, `${notYours.status}`);
  const takenOff = await read(await boss.send('/api/ranking/remove', 'POST', { entryId: cht?.entryId }));
  const boardNow = await read(await fetch(`${BASE}/api/ranking`));
  const twice = await read(await boss.send('/api/ranking/remove', 'POST', { entryId: cht?.entryId }));
  check('the admin takes it off: gone from the board at once, and not twice',
    takenOff.status === 200 && !takenOff.body?.entries?.some((e) => e.name === 'CHT') &&
      !boardNow.body?.entries?.some((e) => e.name === 'CHT') && twice.status === 404,
    JSON.stringify(boardNow.body?.entries?.map((e) => e.name)));
  const bobBest = rowOf('BOB');
  await read(await boss.send('/api/ranking/remove', 'POST', { entryId: bobBest?.entryId }));
  const fallen = await read(await fetch(`${BASE}/api/ranking`));
  check('an account whose best is taken off falls back to its next best that day',
    fallen.body?.entries?.find((e) => e.name === 'BOB')?.damage === 30000,
    JSON.stringify(fallen.body?.entries?.map((e) => `${e.name}:${e.damage}`)));

  // --- 어제의 랭킹 ---
  const podium = await read(await fetch(`${BASE}/api/ranking/podium`));
  check('어제의 랭킹 is the day before’s first, second and third, best first, with no account ids',
    podium.status === 200 && podium.body?.day === yday &&
      JSON.stringify(podium.body?.entries?.map((e) => e.name)) === '["YON","YTW","YTH"]' &&
      podium.body.entries[0].skill === 'fireball' && podium.body.entries[0].flag === 'KR' &&
      !('userId' in podium.body.entries[0]),
    JSON.stringify(podium.body));
  const notSeen = await read(await alice.call('/api/me'));
  const seenOut = await read(await browser().send('/api/ranking/podium/seen', 'POST', {}));
  const seen = await read(await alice.send('/api/ranking/podium/seen', 'POST', {}));
  const nowSeen = await read(await alice.call('/api/me'));
  check('an account says it has seen it today, and /api/me says so on any device; signed out there is no one to mark',
    notSeen.body?.user?.podiumSeen === 0 && seenOut.status === 401 && seen.status === 200 &&
      nowSeen.body?.user?.podiumSeen === today && seen.body?.day === today,
    JSON.stringify({ before: notSeen.body?.user?.podiumSeen, after: nowSeen.body?.user?.podiumSeen, today }));

  const ytwo = browser();
  await ytwo.signIn('ytwo');
  const yfour = browser();
  await yfour.signIn('yfour');
  const placeTwo = await read(await ytwo.call('/api/ranking/podium/me'));
  const placeFour = await read(await yfour.call('/api/ranking/podium/me'));
  const placeNone = await read(await alice.call('/api/ranking/podium/me'));
  const placeOut = await read(await fetch(`${BASE}/api/ranking/podium/me`));
  check('a signed-in account is told its own place that day, out of everyone who ran — inside the three or not',
    placeTwo.body?.mine?.place === 2 && placeTwo.body?.total === 4 && placeTwo.body?.mine?.damage === 200 &&
      placeFour.body?.mine?.place === 4 && placeFour.body?.mine?.level === 5 &&
      placeNone.body?.mine === null && placeNone.body?.total === 4 && placeOut.body?.mine === null,
    JSON.stringify({ two: placeTwo.body, four: placeFour.body?.mine, none: placeNone.body, out: placeOut.body }));

  // --- a save with a value that is not text comes back as text ---
  const objy = browser();
  await objy.signIn('objy');
  const handWritten = await read(await objy.call('/api/save'));
  check('a stored value that is not text (written by hand) comes back as its text, never as an object',
    handWritten.body?.data?.['exiled-survivors:orbs:v1'] === '{"mango":3}' && handWritten.body?.data?.['exiled-survivors:gold:v1'] === '5',
    JSON.stringify(handWritten.body?.data));

  const boardHeaders = await fetch(`${BASE}/api/ranking`);
  await boardHeaders.arrayBuffer();
  check('the board is never kept by the browser, even when the edge has a copy',
    boardHeaders.headers.get('cache-control') === 'no-store', boardHeaders.headers.get('cache-control'));

  // --- the cloud save ---
  const empty = await read(await alice.call('/api/save'));
  check('a new account has no save yet', empty.body?.data === null && empty.body?.updatedAt === 0, JSON.stringify(empty.body));
  const data = { 'exiled-survivors:gear:v2': '{"items":[]}', 'exiled-survivors:ranking:v1': '[]', 'someone-else': 'x' };
  const firstSave = await read(await alice.send('/api/save', 'PUT', { data, base: 0 }));
  const stored = await read(await alice.call('/api/save'));
  check('a save is stored — the game’s keys only, not the board',
    firstSave.status === 200 && stored.body?.updatedAt === firstSave.body?.updatedAt &&
      JSON.stringify(Object.keys(stored.body?.data ?? {})) === JSON.stringify(['exiled-survivors:gear:v2']),
    JSON.stringify(stored.body));
  const stale = await read(await alice.send('/api/save', 'PUT', { data, base: 0 }));
  check('writing over a copy this browser has not seen is a conflict, with what is there',
    stale.status === 409 && stale.body?.updatedAt === firstSave.body?.updatedAt && stale.body?.data?.['exiled-survivors:gear:v2'],
    `${stale.status}`);
  const next = await read(await alice.send('/api/save', 'PUT', { data: { 'exiled-survivors:gear:v2': '{"items":[1]}' }, base: firstSave.body?.updatedAt }));
  check('and writing over the copy it has seen moves it on', next.status === 200 && next.body?.updatedAt > firstSave.body?.updatedAt);
  const bobSave = await read(await bob.call('/api/save'));
  check('one account never sees another’s save', bobSave.body?.data === null);

  // --- requests from elsewhere ---
  const cross = await read(await alice.send('/api/save', 'PUT', { data, base: next.body?.updatedAt }, { Origin: 'https://evil.example' }));
  check('a write from another site is refused, signed in or not', cross.status === 403, `${cross.status}`);

  // --- signing out, and deleting an account ---
  await alice.send('/api/auth/logout', 'POST', {});
  const after = await read(await alice.call('/api/me'));
  check('signing out ends the session here', after.body?.user === null);

  const gone = await read(await bob.send('/api/me/delete', 'POST', {}));
  const boardAfter = await read(await fetch(`${BASE}/api/ranking`));
  await bob.signIn('bob');
  const reborn = await read(await bob.call('/api/save'));
  check('deleting an account takes its runs and its save with it',
    gone.status === 200 && !boardAfter.body?.entries?.some((e) => e.name === 'BOB') && reborn.body?.data === null,
    JSON.stringify(boardAfter.body?.entries?.map((e) => e.name)));

  // --- Facebook's data-deletion callback ---
  const sign = (payload) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${createHmac('sha256', FB_SECRET).update(body).digest('base64url')}.${body}`;
  };
  const fb = (signed) => fetch(`${BASE}/api/auth/facebook/deletion`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ signed_request: signed }).toString(),
  }).then(read);
  const good = await fb(sign({ user_id: '12345', algorithm: 'HMAC-SHA256', issued_at: 1 }));
  const bad = await fb(`${'x'.repeat(43)}.${Buffer.from('{"user_id":"1"}').toString('base64url')}`);
  check('Facebook’s deletion callback answers a signed request and refuses a forged one',
    good.status === 200 && /data-deletion/.test(good.body?.url ?? '') && good.body?.confirmation_code && bad.status === 400,
    `${good.status} ${bad.status}`);

  // --- the game itself, beside the API ---
  const page = await fetch(`${BASE}/`);
  check('the game is served at the root', page.ok && /text\/html/.test(page.headers.get('content-type') ?? ''));
  const privacy = await fetch(`${BASE}/privacy.html`);
  const deletion = await fetch(`${BASE}/data-deletion.html`);
  check('and the privacy and data-deletion pages', privacy.ok && deletion.ok, `${privacy.status} ${deletion.status}`);
  const missing = await fetch(`${BASE}/api/nothing`);
  check('an /api path that is not one is a 404 from the API', missing.status === 404 && /json/.test(missing.headers.get('content-type') ?? ''));
} catch (error) {
  check('the API suite ran to the end', false, String(error?.stack ?? error));
} finally {
  stop();
  await sleep(500);
  try {
    rmSync(state, { recursive: true, force: true });
  } catch {
    // Windows may still hold a file for a moment; it is a temp dir.
  }
}

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
process.exit(0);
