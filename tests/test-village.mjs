import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 생존자 마을 (dev server only, VILLAGE.devOnly): the title as a yard to walk,
// with what the menu and the corner icons opened standing in it. The harness
// sees the plain menu unless a page sets `window.__villageOn`.

const cdp = await connect();
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
const menu = (body) => ev(`(() => { const s = window.game.scene.getScene('MenuScene'); ${body} })()`);

try {
  // --- 1. the harness keeps the menu ---
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
  await cdp.until(`window.game?.scene.isActive('MenuScene')`, 30000, 200);
  await sleep(600);
  const plain = await menu(`return { village: !!s.village, devOnly: window.config.VILLAGE.devOnly };`);
  check('the harness sees the menu, not the village, unless asked; and the village is the dev server’s only',
    plain.village === false && plain.devOnly === true, JSON.stringify(plain));

  // --- 2. the village: every station, the corner keeps only what is not a place ---
  await menu(`window.__villageOn = true; s.scene.restart(); return 1;`);
  await cdp.until(`!!window.game.scene.getScene('MenuScene').village`, 10000, 100);
  await sleep(600);
  const built = await menu(`
    const v = s.village;
    return { stations: v.placed.map((p) => p.station.id), names: v.placed.map((p) => p.name.text),
      icons: s.icons.views.map((view) => view.button.id), w: s.scale.width, h: s.scale.height,
      inside: v.placed.every((p) => p.x > 0 && p.x < s.scale.width && p.y > 0 && p.y < s.scale.height) };
  `);
  check('the village has its eight places, each named, inside the screen',
    built.stations.length === 8 && ['portal', 'stash', 'anvil', 'obelisk', 'board', 'sieve', 'shelf', 'notice'].every((id) => built.stations.includes(id)) &&
      built.names.every((n) => n.length > 0) && built.inside, JSON.stringify(built.names));
  check('the corner keeps 설정 (and the account, 밸런스 where shown) — the rest are places now',
    built.icons.includes('settings') && !built.icons.includes('gear') && !built.icons.includes('ranking') && !built.icons.includes('filter'),
    JSON.stringify(built.icons));
  await shot('village-01');

  // --- 3. the keys walk the survivor ---
  const before = await menu(`return { x: s.village.survivor.x };`);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await sleep(500);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  const after = await menu(`return { x: s.village.survivor.x };`);
  check('the arrow keys walk the survivor', after.x > before.x + 20, `${Math.round(before.x)} → ${Math.round(after.x)}`);

  // --- 4. each place opens its screen: pressed, walked to, opened ---
  const opens = { stash: 'InventoryScene', anvil: 'ForgeScene', obelisk: 'PassiveScene', board: 'RankingScene',
    sieve: 'FilterScene', shelf: 'InfoScene', notice: 'InfoScene' };
  const got = {};
  for (const [id, key] of Object.entries(opens)) {
    await menu(`
      const spot = s.village.placed.find((p) => p.station.id === '${id}');
      spot.image.emit('pointerdown', window.game.input.activePointer, 0, 0, { stopPropagation() {} });
      return 1;
    `);
    const opened = await cdp.until(`window.game.scene.isActive('${key}')`, 8000, 100);
    got[id] = opened === true;
    // Back to the yard the way each screen goes back — the forge goes back
    // through the 인벤토리, so as many presses as it takes.
    for (let i = 0; i < 3; i++) {
      await ev(`(() => { const g = window.game.scene; for (const k of ['ForgeScene', 'InventoryScene', 'PassiveScene', 'RankingScene', 'FilterScene', 'InfoScene']) if (g.isActive(k)) { g.getScene(k).backButton?.press?.(); break; } return 1; })()`);
      const home = await cdp.until(`window.game.scene.isActive('MenuScene') && !window.game.scene.isPaused('MenuScene')`, 2500, 100);
      if (home === true) break;
    }
    await sleep(200);
  }
  check('each place opens its screen when walked to: stash 인벤토리, anvil 분해·제작, stone 재능, board 랭킹, table 필터, shelf 가이드, notice 패치노트',
    Object.values(got).every(Boolean), JSON.stringify(got));

  // --- 5. Space at a place opens it; the gate starts a run ---
  const atGate = await menu(`
    const v = s.village;
    const gate = v.placed.find((p) => p.station.id === 'portal');
    v.survivor.setPosition(gate.x, gate.y + 40);
    v.update(16);
    return { near: v.near?.id ?? null };
  `);
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  const started = await cdp.until(`window.game.scene.isActive('GameScene') || window.game.scene.isActive('BoneScene') || window.game.scene.isActive('ConfirmScene')`, 8000, 100);
  check('standing at the gate, Space sends the survivor out on a run', atGate.near === 'portal' && started === true, JSON.stringify(atGate));
} catch (error) {
  check('the suite ran to the end', false, String(error?.stack ?? error));
}

const failed = results.filter((r) => !r.p);
console.log('\n=== SUMMARY ===');
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
