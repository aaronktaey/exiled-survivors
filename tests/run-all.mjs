import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Runs the suites named on the command line, several at once: one Chrome per
// worker, each with its own profile (so its own localStorage) and its own
// debugging port, handed to the suite as CDP_PORT. The longest suites go
// first, so the workers finish together. Chrome is muted.
//
//   node run-all.mjs test-gear test-bones …       WORKERS=1 for one at a time

// Everything is relative to this file, so the harness moves with the repo.
const SP = dirname(fileURLToPath(import.meta.url));
// Screenshots land in one place rather than beside the suites.
const SHOTS = join(SP, 'shots');
// How long each suite took last time, to start the long ones first.
const TIMINGS = join(SP, '.timings.json');
const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE_PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const suites = process.argv.slice(2);
const WORKERS = Math.max(1, Math.min(Number(process.env.WORKERS) || 3, suites.length));

const up = async (port) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/list`);
    const list = await r.json();
    return list.some((t) => t.type === 'page');
  } catch {
    return false;
  }
};

// Chrome keeps exiting between suites, so make sure it is there each time.
const ensureChrome = async (worker) => {
  const port = BASE_PORT + worker;
  if (await up(port)) return;
  spawn(CHROME, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${join(SP, worker === 0 ? 'chrome-profile' : `chrome-profile-${worker}`)}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--window-size=1000,700',
    `--window-position=${40 + worker * 60},${40 + worker * 60}`,
    'http://localhost:5173/#run',
  ], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    if (await up(port)) {
      await sleep(2000);
      return;
    }
  }
  throw new Error(`chrome on ${port} did not come up`);
};

// Settings and saves live in localStorage, which a Chrome profile keeps
// between suites. Each suite starts from the defaults, on a game that is up.
const clearStorage = async (worker) => {
  try {
    const list = await (await fetch(`http://127.0.0.1:${BASE_PORT + worker}/json/list`)).json();
    const page = list.find((t) => t.type === 'page');
    if (!page) return;
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const call = (method, params = {}) => new Promise((res) => {
      const mine = ++id;
      ws.onmessage = (m) => {
        const reply = JSON.parse(m.data);
        if (reply.id === mine) res(reply);
      };
      ws.send(JSON.stringify({ id: mine, method, params }));
    });
    // A suite that emulated a phone leaves the override behind, and the next
    // suite would then load into a canvas it was not written for.
    await call('Emulation.clearDeviceMetricsOverride');
    // A minimised or covered window makes the page hidden, and Phaser stops
    // its loop when that happens. Pin the page visible whatever the window is
    // doing.
    await call('Emulation.setFocusEmulationEnabled', { enabled: true });
    await call('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 0 });
    await call('Runtime.evaluate', { expression: 'localStorage.clear()', returnByValue: true });
    // Chrome restores its last tab after a kill, which can land the suite on
    // the title screen; say where we want to be rather than assume. By way of
    // a blank page: from the title, `/#run` is only a hash change and loads
    // nothing — the wait below then ran out its whole half-minute every time.
    await call('Page.navigate', { url: 'about:blank' });
    await call('Page.navigate', { url: 'http://localhost:5173/#run' });
    // Wait for the game to be up rather than a fixed time: the first load
    // after a source edit has Vite transform it afresh, and takes far longer
    // than a fixed sleep allows. Loaded once here, it is warm for the reloads
    // the suite does itself.
    await sleep(500);
    for (let i = 0; i < 120; i++) {
      const reply = await call('Runtime.evaluate', {
        expression: "!!window.game?.scene?.isActive('GameScene')", returnByValue: true,
      });
      if (reply.result?.result?.value === true) break;
      await sleep(250);
    }
    ws.close();
  } catch {
    // Nothing stored yet, or the page is still coming up.
  }
};

const runSuite = (name, worker) => new Promise((resolve) => {
  mkdirSync(SHOTS, { recursive: true });
  const started = Date.now();
  const child = spawn(process.execPath, [`${name}.mjs`, SHOTS], {
    cwd: SP,
    env: { ...process.env, CDP_PORT: String(BASE_PORT + worker) },
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', () => {
    const summary = out.split('\n').filter((l) => /^(FAIL|RESULT|\d+\/\d+ passed|failed:)/.test(l));
    resolve({ name, summary, out, ms: Date.now() - started });
  });
});

const timings = (() => {
  try {
    return existsSync(TIMINGS) ? JSON.parse(readFileSync(TIMINGS, 'utf8')) : {};
  } catch {
    return {};
  }
})();
// Longest first; a suite never timed counts as long, so it is not left to the end.
const queue = [...suites].sort((a, b) => (timings[b] ?? 60_000) - (timings[a] ?? 60_000));

let total = 0;
let passed = 0;
const broken = [];
const began = Date.now();

const report = (r) => {
  const counts = r.summary.find((l) => /^\d+\/\d+ passed/.test(l));
  const verdict = r.summary.find((l) => l.startsWith('RESULT'));
  if (counts) {
    const [p, t] = counts.split(' ')[0].split('/').map(Number);
    passed += p;
    total += t;
  } else {
    broken.push(r.name);
  }
  timings[r.name] = r.ms;
  const lines = [`${r.name.padEnd(14)} ${counts ?? 'DID NOT REPORT'}  ${verdict ?? ''}  (${Math.round(r.ms / 1000)}s)`];
  for (const line of r.summary.filter((l) => l.startsWith('FAIL') || l.startsWith('failed:'))) {
    lines.push(`   ${line}`);
  }
  if (!counts) lines.push(r.out.split('\n').slice(-12).join('\n'));
  if (process.env.SHOW_OUT) lines.push(r.out);
  console.log(lines.join('\n'));
};

const work = async (worker) => {
  // Right after a source edit the dev server reloads any open page a moment
  // later, and a suite that has just started is cut off by it. One page load
  // up front, given time for that reload to come and go, takes it instead.
  await ensureChrome(worker);
  await clearStorage(worker);
  await sleep(2000);
  for (let name = queue.shift(); name; name = queue.shift()) {
    await ensureChrome(worker);
    await clearStorage(worker);
    report(await runSuite(name, worker));
  }
};

await Promise.all(Array.from({ length: WORKERS }, (_, worker) => work(worker)));

// Done: the Chromes go too, unless asked to stay (KEEP_CHROME=1) for a look.
const closeChrome = async (worker) => {
  try {
    const version = await (await fetch(`http://127.0.0.1:${BASE_PORT + worker}/json/version`)).json();
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
    await sleep(500);
  } catch {
    // Already gone.
  }
};
if (!process.env.KEEP_CHROME) {
  await Promise.all(Array.from({ length: WORKERS }, (_, worker) => closeChrome(worker)));
}

try {
  writeFileSync(TIMINGS, JSON.stringify(timings, null, 2));
} catch {
  // Next run just starts in the given order.
}
console.log(`\nTOTAL ${passed}/${total} across ${suites.length} suites in ${Math.round((Date.now() - began) / 1000)}s (${WORKERS} at once)`);
if (broken.length) console.log('suites that did not report:', broken.join(', '));
