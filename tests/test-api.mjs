// The game's Worker (server/index.ts), run locally by wrangler against an
// empty database of its own: the board, what a run has to pass, the rate
// limit, and that the built game is served beside the API.
//
// It needs no browser. It builds the game first if there is no build to
// serve, and stops its Worker when it is done.
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PORT = 8788;
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
const check = (n, p, d = '') => {
  results.push({ n, p });
  console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  execSync('npx vite build', { cwd: ROOT, stdio: 'ignore' });
}

// A database of its own, so the rate limit starts from nothing every run.
const state = mkdtempSync(join(tmpdir(), 'es-api-'));
const env = { ...process.env, CI: '1' };
execSync(`npx wrangler d1 migrations apply DB --local --persist-to "${state}"`, {
  cwd: ROOT,
  env,
  stdio: 'ignore',
});
const worker = spawn(
  'npx',
  ['wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', state],
  { cwd: ROOT, env, shell: true, stdio: 'ignore' },
);

const stop = () => {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${worker.pid} /T /F`, { stdio: 'ignore' });
    } else {
      worker.kill('SIGTERM');
    }
  } catch {
    // Already gone.
  }
};

try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await sleep(1000);
    up = await fetch(`${BASE}/api/ranking`).then((r) => r.ok, () => false);
  }
  check('the Worker comes up locally', up);

  const get = () => fetch(`${BASE}/api/ranking`).then((r) => r.json());
  const post = (run) =>
    fetch(`${BASE}/api/ranking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof run === 'string' ? run : JSON.stringify(run),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const run = (over = {}) => ({
    name: 'ABC', emoji: '', flag: 'KR', damage: 120000, level: 12, survivedMs: 600000, ...over,
  });

  const empty = await get();
  check('a new board is empty', Array.isArray(empty.entries) && empty.entries.length === 0, JSON.stringify(empty));

  // What a run has to pass, before anything is stored or counted.
  const refused = {
    name: (await post(run({ name: 'abcd' }))).body?.error,
    emoji: (await post(run({ emoji: 'X' }))).body?.error,
    flag: (await post(run({ flag: 'ZZ' }))).body?.error,
    damage: (await post(run({ damage: 1e12 }))).body?.error,
    short: (await post(run({ survivedMs: 1000 }))).body?.error,
    pace: (await post(run({ damage: 9e9, survivedMs: 10000 }))).body?.error,
    junk: (await post('{not json')).status,
  };
  check('a run that is not a run is turned down, and says why',
    refused.name === 'name' && refused.emoji === 'emoji' && refused.flag === 'flag' &&
      refused.damage === 'damage' && refused.short === 'time' && refused.pace === 'pace' &&
      refused.junk === 400,
    JSON.stringify(refused));

  const first = await post(run());
  check('a run is taken, placed, and the board comes back with it',
    first.status === 200 && first.body?.ok === true && first.body?.place === 1 &&
      first.body?.entries?.[0]?.name === 'ABC' && first.body?.entries?.[0]?.flag === 'KR',
    JSON.stringify(first.body));

  const again = await post(run({ name: 'DEF', damage: 999999 }));
  check('the same address handing in again at once is told to slow down',
    again.status === 429 && again.body?.error === 'slow down', `${again.status}`);

  const board = await get();
  check('the board shows what was taken, and nothing turned down',
    board.entries.length === 1 && board.entries[0].name === 'ABC' &&
      !board.entries.some((e) => e.name === 'DEF') && !('ip_hash' in board.entries[0]),
    JSON.stringify(board.entries));

  // The game itself, beside the API.
  const page = await fetch(`${BASE}/`);
  const html = await page.text();
  check('the game is served at the root', page.ok && /<canvas|<div id|<script/.test(html) && /text\/html/.test(page.headers.get('content-type') ?? ''),
    `${page.status} ${page.headers.get('content-type')}`);
  const music = await fetch(`${BASE}/assets/Constance.mp3`, { method: 'HEAD' });
  check('and its files, from the build', music.ok, `${music.status} ${music.headers.get('content-length')} bytes`);
  const missing = await fetch(`${BASE}/api/nothing`);
  check('an /api path that is not one is a 404 from the API, not the game', missing.status === 404 &&
    /json/.test(missing.headers.get('content-type') ?? ''));
} catch (error) {
  check('the API suite ran to the end', false, String(error));
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
