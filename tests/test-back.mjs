import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// Every screen but the title and the run has a way back in its top-left
// corner, it sits clear of everything else on the screen, and pressing it
// goes where Esc would.

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

/** Where the button is, and whether anything else on the screen runs into it. */
const probe = (key) => ev(`(() => {
  const s = window.game.scene.getScene('${key}');
  const b = s.backButton;
  if (!b) return { has: false };
  const box = b.plate.getBounds();
  const hit = [];
  // Something the main camera does not draw is drawn by another one, at a
  // place of its own — the guide's page is — so its world spot means nothing.
  const main = s.cameras.main;
  const walk = (list) => {
    for (const o of list) {
      if ((o.cameraFilter & main.id) !== 0) continue;
      if (o.list) walk(o.list);
      if (o === b.plate || o === b.label || !o.visible || o.alpha === 0 || !o.getBounds) continue;
      if (o.type !== 'Text' && !(o.input && o.input.enabled)) continue;
      const r = o.getBounds();
      // A full-screen scrim is behind everything; it is not in the way.
      if (r.width >= s.scale.width - 1 && r.height >= s.scale.height - 1) continue;
      const overlaps = box.x < r.right && r.x < box.right && box.y < r.bottom && r.y < box.bottom;
      if (overlaps) hit.push((o.text ?? o.type) + '@' + Math.round(r.x) + ',' + Math.round(r.y));
    }
  };
  walk(s.children.list);
  return { has: true, label: b.label.text, x: Math.round(box.x), y: Math.round(box.y),
           right: Math.round(box.right), bottom: Math.round(box.bottom),
           w: s.scale.width, h: s.scale.height, hit };
})()`);

const press = (key) => ev(`(() => { window.game.scene.getScene('${key}').backButton.press(); return 1; })()`);
const active = (key) => ev(`(() => window.game.scene.isActive('${key}'))()`);

const fits = (name, p) => {
  // The word goes on a narrow screen; the arrow is always there.
  check(`${name}: has ← 돌아가기 in the top-left corner`,
    p.has && /←/.test(p.label) && (p.w < 600 || /돌아가기/.test(p.label)) && p.x >= 0 && p.y >= 0 && p.right < p.w / 2 && p.bottom < 60,
    p.has ? `${p.label} at ${p.x},${p.y}` : 'none');
  check(`${name}: nothing else on the screen runs into it`, p.has && p.hit.length === 0,
    p.hit?.join(' | ') || '');
};

const OVERLAYS = [
  ['SettingsScene', '{ allowLanguage: true }'],
  ['InfoScene', "{ topic: 'guide' }"],
  ['InfoScene', "{ topic: 'patch' }"],
  ['CreditsScene', '{}'],
  ['InventoryScene', '{}'],
  ['PassiveScene', '{}'],
];

for (const [w, h, shape] of [[0, 0, 'landscape'], [420, 860, 'upright']]) {
  if (w) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  } else {
    await cdp.send('Emulation.clearDeviceMetricsOverride', {});
  }
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(1000);
  await ev(`(() => { localStorage.clear();
    localStorage.setItem('exiled-survivors:bones:v1', JSON.stringify({ rib: 1 })); return 1; })()`);
  await cdp.send('Page.reload', {});
  await sleep(4200);

  const title = await ev(`(() => !!window.game.scene.getScene('MenuScene').backButton)()`);
  check(`${shape}: the title screen has none`, title === false);

  for (const [key, extra] of OVERLAYS) {
    await ev(`(() => { window.game.scene.getScene('MenuScene').openOverlay('${key}', ${extra}); return 1; })()`);
    await sleep(700);
    const name = `${shape} ${key}${extra.includes('patch') ? ' (patch)' : extra.includes('guide') ? ' (guide)' : ''}`;
    fits(name, await probe(key));
    if (key === 'InventoryScene') await shot(`back-${shape}-inventory`);
    await press(key);
    await sleep(500);
    check(`${name}: pressing it goes back to the title`,
      (await active(key)) === false && (await active('MenuScene')) === true);
  }

  // The 뼈다귀 screen, on the way into a run.
  await ev(`(() => { window.game.scene.getScene('MenuScene').startRun(false); return 1; })()`);
  await sleep(800);
  fits(`${shape} BoneScene`, await probe('BoneScene'));
  await press('BoneScene');
  await sleep(500);
  check(`${shape} BoneScene: pressing it backs out to the title, no run started`,
    (await active('BoneScene')) === false && (await active('GameScene')) === false &&
      (await active('MenuScene')) === true);

  // In a run: the pause screen goes back into it, the end screen to the title.
  await ev(`(() => { window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
  await sleep(1500);
  const inRun = await ev(`(() => !!window.game.scene.getScene('GameScene').backButton)()`);
  check(`${shape}: the run itself has none`, inRun === false);
  await ev(`(() => { window.game.scene.getScene('GameScene').pauseRun(); return 1; })()`);
  await sleep(600);
  fits(`${shape} PauseScene`, await probe('PauseScene'));
  await shot(`back-${shape}-pause`);
  await press('PauseScene');
  await sleep(500);
  check(`${shape} PauseScene: pressing it goes back into the run`,
    (await active('PauseScene')) === false &&
      (await ev(`(() => !window.game.scene.isPaused('GameScene'))()`)) === true);

  // A run in the save slot makes 게임 시작 ask first; backing out keeps it.
  await ev(`(() => { const g = window.game.scene.getScene('GameScene'); g.writeSave();
    g.scene.start('MenuScene'); return 1; })()`);
  await sleep(1500);
  await ev(`(() => { const m = window.game.scene.getScene('MenuScene');
    const i = m.menu.items.findIndex((x) => x.id === 'start'); m.menu.items[i].onSelect(); return 1; })()`);
  await sleep(700);
  const confirmOpen = await active('ConfirmScene');
  if (confirmOpen) {
    fits(`${shape} ConfirmScene`, await probe('ConfirmScene'));
    await press('ConfirmScene');
    await sleep(500);
  }
  check(`${shape} ConfirmScene: pressing it cancels, and the save is still there`,
    confirmOpen && (await active('ConfirmScene')) === false &&
      (await ev(`(() => localStorage.getItem('exiled-survivors:save:v1') !== null)()`)) === true);

  // And the end of a run.
  await ev(`(() => { window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
  await sleep(1500);
  await ev(`(() => { const s = window.game.scene.getScene('GameScene');
    s.player.invulnerableUntil = 0; s.player.takeDamage(1e9); return 1; })()`);
  await sleep(1500);
  fits(`${shape} GameOverScene`, await probe('GameOverScene'));
  await press('GameOverScene');
  await sleep(1200);
  check(`${shape} GameOverScene: pressing it goes to the title`,
    (await active('GameOverScene')) === false && (await active('MenuScene')) === true);

}
await cdp.send('Emulation.clearDeviceMetricsOverride', {});

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
