import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Everything is relative to this file, so the harness moves with the repo.
const SP = dirname(fileURLToPath(import.meta.url));
// Screenshots land in one place rather than beside the suites.
const SHOTS = join(SP, 'shots');
const CHROME =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const up = async () => {
  try {
    const r = await fetch('http://127.0.0.1:9333/json/list');
    const list = await r.json();
    return list.some((t) => t.type === 'page');
  } catch {
    return false;
  }
};

// Chrome keeps exiting between suites, so make sure it is there each time.
const ensureChrome = async () => {
  if (await up()) return;
  spawn(CHROME, [
    '--remote-debugging-port=9333',
    `--user-data-dir=${join(SP, 'chrome-profile')}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--window-size=1000,700',
    'http://localhost:5173/#run',
  ], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    if (await up()) {
      await sleep(2000);
      return;
    }
  }
  throw new Error('chrome did not come up');
};

// Settings and saves live in localStorage, which the shared Chrome profile
// keeps between suites. Each suite starts from the defaults.
const clearStorage = async () => {
  try {
    const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
    const page = list.find((t) => t.type === 'page');
    if (!page) return;
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    // A suite that emulated a phone leaves the override behind, and the next
    // suite would then load into a canvas it was not written for.
    ws.send(JSON.stringify({ id: 0, method: 'Emulation.clearDeviceMetricsOverride', params: {} }));
    await new Promise((res) => { ws.onmessage = res; });
    // A minimised or covered window makes the page hidden, and Phaser stops
    // its loop when that happens — the boot scene then never hands over and
    // every suite fails at once. Pin the page visible whatever the window is
    // doing.
    ws.send(JSON.stringify({ id: 4, method: 'Emulation.setFocusEmulationEnabled',
      params: { enabled: true } }));
    await new Promise((res) => { ws.onmessage = res; });
    ws.send(JSON.stringify({ id: 3, method: 'Emulation.setTouchEmulationEnabled',
      params: { enabled: false, maxTouchPoints: 0 } }));
    await new Promise((res) => { ws.onmessage = res; });
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate',
      params: { expression: 'localStorage.clear()', returnByValue: true } }));
    await new Promise((res) => { ws.onmessage = res; });
    // Chrome restores its last tab after a kill, which can land the suite on
    // the title screen; say where we want to be rather than assume.
    ws.send(JSON.stringify({ id: 2, method: 'Page.navigate',
      params: { url: 'http://localhost:5173/#run' } }));
    await new Promise((res) => { ws.onmessage = res; });
    // Wait for the game to be up rather than a fixed time: the first load
    // after a source edit has Vite transform it afresh, and takes far longer
    // than the suites' own fixed sleeps allow. Loaded once here, it is warm
    // for the reloads the suite does itself.
    await sleep(1500);
    for (let i = 0; i < 80; i++) {
      ws.send(JSON.stringify({ id: 100 + i, method: 'Runtime.evaluate',
        params: { expression: "!!window.game?.scene?.isActive('GameScene')", returnByValue: true } }));
      const reply = await new Promise((res) => { ws.onmessage = (m) => res(JSON.parse(m.data)); });
      if (reply.result?.result?.value === true) break;
      await sleep(250);
    }
    await sleep(500);
    ws.close();
  } catch {
    // Nothing stored yet, or the page is still coming up.
  }
};

const runSuite = (name) => new Promise((resolve) => {
  mkdirSync(SHOTS, { recursive: true });
  const child = spawn(process.execPath, [`${name}.mjs`, SHOTS], { cwd: SP });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', () => {
    const summary = out.split('\n').filter((l) => /^(FAIL|RESULT|\d+\/\d+ passed|failed:)/.test(l));
    resolve({ name, summary, out });
  });
});

const suites = process.argv.slice(2);
let total = 0;
let passed = 0;
const broken = [];

for (const name of suites) {
  await ensureChrome();
  await clearStorage();
  const r = await runSuite(name);
  const counts = r.summary.find((l) => /^\d+\/\d+ passed/.test(l));
  const verdict = r.summary.find((l) => l.startsWith('RESULT'));
  if (counts) {
    const [p, t] = counts.split(' ')[0].split('/').map(Number);
    passed += p;
    total += t;
  } else {
    broken.push(name);
  }
  console.log(`${name.padEnd(14)} ${counts ?? 'DID NOT REPORT'}  ${verdict ?? ''}`);
  for (const line of r.summary.filter((l) => l.startsWith('FAIL') || l.startsWith('failed:'))) {
    console.log(`   ${line}`);
  }
  if (!counts) console.log(r.out.split('\n').slice(-12).join('\n'));
}

console.log(`\nTOTAL ${passed}/${total} across ${suites.length} suites`);
if (broken.length) console.log('suites that did not report:', broken.join(', '));
