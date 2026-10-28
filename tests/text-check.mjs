import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// Not a suite (0.110): every screen, lying down and upright, with each label's
// box measured — two labels whose boxes cross, a label running onto the edge
// of a plate, or one off the screen are listed, and every screen is shot.
//   SHOW_OUT=1 SHOTS=<dir> node run-all.mjs text-check     (FONT=system to compare,
//   LANG_PICK=en|ja|zh for another language — 0.153)
// "Lv 1 240/240" off the screen is the survivor's own label, in the world.
const cdp = await connect();
const SP = process.env.SHOTS ?? '.';
const ev = (expr) => cdp.evaluate(expr);
const shot = async (n) => {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${SP}/${n}.png`, Buffer.from(r.result.data, 'base64'));
};

const measure = (key) => ev(`(() => {
  const s = window.game.scene.getScene('${key}');
  if (!s || !s.sys.isActive()) return { gone: true };
  const main = s.cameras.main;
  const W = s.scale.width, H = s.scale.height;
  const boxes = [];
  const plates = [];
  const walk = (list, group) => {
    for (const o of list) {
      if (!o.visible || o.alpha === 0) continue;
      const g = group ?? ((o.cameraFilter & main.id) !== 0 ? 'other' : 'main');
      if (o.list) { walk(o.list, g); continue; }
      if ((o.type === 'Rectangle' || (o.input && o.input.enabled && o.type !== 'Text')) && o.getBounds) {
        const p = o.getBounds();
        if (p.width > 6 && p.height > 6 && !(p.width >= W * 0.9 && p.height >= H * 0.9)) {
          plates.push({ x: p.x, y: p.y, r: p.right, b: p.bottom, g, what: o.type + ' ' + Math.round(p.width) + 'x' + Math.round(p.height) });
        }
        continue;
      }
      if (o.type !== 'Text' || !o.text || !o.text.trim()) continue;
      const b = o.getBounds();
      if (b.width < 1 || b.height < 1) continue;
      if (o.type !== 'Text') continue;
      boxes.push({ t: o.text.replace(/\\n/g, ' / ').slice(0, 34), x: b.x, y: b.y, r: b.right, b: b.bottom, h: b.height, g });
    }
  };
  walk(s.children.list);
  const crossing = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      if (a.g !== c.g || a.t === c.t) continue;
      const ix = Math.min(a.r, c.r) - Math.max(a.x, c.x);
      const iy = Math.min(a.b, c.b) - Math.max(a.y, c.y);
      if (ix > 4 && iy > 0.3 * Math.min(a.h, c.h)) crossing.push(a.t + '  ×  ' + c.t + '  (' + Math.round(ix) + 'x' + Math.round(iy) + ')');
    }
  }
  // A label partly on a plate: not one sitting inside its own button, but one
  // running onto or off the edge of something drawn.
  const shrink = 3;
  for (const a of boxes) {
    const ax = a.x + shrink, ar = a.r - shrink, ay = a.y + shrink, ab = a.b - shrink;
    for (const p of plates) {
      if (p.g !== a.g) continue;
      const ix = Math.min(ar, p.r) - Math.max(ax, p.x);
      const iy = Math.min(ab, p.b) - Math.max(ay, p.y);
      if (ix <= 3 || iy <= 3) continue;
      const inside = (ix * iy) / ((ar - ax) * (ab - ay));
      const plateInside = (ix * iy) / ((p.r - p.x) * (p.b - p.y));
      if (inside < 0.97 && plateInside < 0.97) crossing.push(a.t + '  on edge of  ' + p.what + '  (' + Math.round(ix) + 'x' + Math.round(iy) + ')');
    }
  }
  const off = boxes.filter((a) => a.g === 'main' && (a.x < -2 || a.r > W + 2 || a.y < -2 || a.b > H + 2))
    .map((a) => a.t + ' [' + Math.round(a.x) + '..' + Math.round(a.r) + ', ' + Math.round(a.y) + '..' + Math.round(a.b) + ' of ' + W + 'x' + H + ']');
  return { n: boxes.length, crossing, off };
})()`);

const report = async (shape, name, key) => {
  await sleep(250);
  const m = await measure(key);
  const bad = (m.crossing?.length ?? 0) + (m.off?.length ?? 0);
  console.log(`${bad ? 'ISSUE' : 'ok   '} ${shape} ${name} (${m.n ?? 0} labels)`);
  for (const c of m.crossing ?? []) console.log('      cross: ' + c);
  for (const c of m.off ?? []) console.log('      off:   ' + c);
  await shot(`text${process.env.FONT ? '-' + process.env.FONT : ''}-${shape}-${name}`);
};
const menu = (body) => ev(`(() => { const m = window.game.scene.getScene('MenuScene'); ${body}; return 1; })()`);
const on = (key, body) => ev(`(() => { const s = window.game.scene.getScene('${key}'); ${body}; return 1; })()`);
const stop = (key) => ev(`(() => { const g = window.game.scene; g.stop('${key}'); if (g.isPaused('MenuScene')) g.resume('MenuScene'); return 1; })()`);

for (const [w, h, shape] of [[0, 0, 'wide'], [420, 860, 'tall']]) {
  if (w) await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  else await cdp.send('Emulation.clearDeviceMetricsOverride', {});
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(800);
  await ev(`(() => { localStorage.clear(); ${process.env.FONT ? `localStorage.setItem('dev-font', '${process.env.FONT}');` : ''}
    ${/^(en|ja|zh)$/.test(process.env.LANG_PICK ?? '') ? `localStorage.setItem('exiled-survivors:settings:v1', JSON.stringify({ language: '${process.env.LANG_PICK}' }));` : ''}
    localStorage.setItem('exiled-survivors:bones:v1', JSON.stringify({ rib: 2, skull: 1 }));
    localStorage.setItem('exiled-survivors:orbs:v1', JSON.stringify({ transmute: 3, chaos: 2 }));
    return 1; })()`);
  await cdp.send('Page.reload', {});
  await cdp.until(`window.game?.scene.isActive('MenuScene')`, 30000, 200);
  await sleep(1500);
  // A few swords to fill the grid and the read-out.
  await ev(`(() => { for (const id of ['onigoroshi', 'steelSword', 'ironSword']) window.gear.add?.(id); return 1; })()`).catch(() => 0);
  await report(shape, 'title', 'MenuScene');

  await menu(`m.openOverlay('SettingsScene', { allowLanguage: true })`);
  for (const tab of ['controls', 'sound', 'display']) {
    await on('SettingsScene', `s.openTab('${tab}')`);
    await sleep(500);
    await report(shape, `settings-${tab}`, 'SettingsScene');
  }
  await ev(`(() => { window.game.scene.getScene('SettingsScene').scene.launch('CreditsScene', { onClose() {} }); return 1; })()`);
  await sleep(600);
  await report(shape, 'credits', 'CreditsScene');
  await stop('CreditsScene');
  await stop('SettingsScene');

  await menu(`m.openOverlay('InfoScene', { topic: 'guide' })`);
  await sleep(600);
  const chapters = await ev(`(() => window.game.scene.getScene('InfoScene').chapters.map((c) => c.tabs.length))()`);
  for (let c = 0; c < chapters.length; c++) {
    for (let t = 0; t < chapters[c]; t++) {
      await on('InfoScene', `s.showChapter(${c}); s.showTab(${t})`);
      await report(shape, `guide-${c}-${t}`, 'InfoScene');
    }
  }
  await stop('InfoScene');
  await menu(`m.openOverlay('InfoScene', { topic: 'patch' })`);
  await sleep(600);
  await report(shape, 'patch', 'InfoScene');
  await stop('InfoScene');

  for (const key of ['PassiveScene', 'RankingScene', 'FilterScene', 'TuningScene', 'AccountScene']) {
    await menu(`m.openOverlay('${key}', {})`);
    await sleep(700);
    await report(shape, key.replace('Scene', '').toLowerCase(), key);
    if (key === 'RankingScene') {
      await on('RankingScene', `s.setTab('personal')`);
      await report(shape, 'ranking-personal', key);
    }
    await stop(key);
  }

  for (const tab of ['gear', 'consumables']) {
    await menu(`m.openOverlay('InventoryScene', { tab: '${tab}' })`);
    await sleep(700);
    await report(shape, `inventory-${tab}`, 'InventoryScene');
    await stop('InventoryScene');
  }
  await menu(`m.openOverlay('InventoryScene', {})`);
  await sleep(700);
  await on('InventoryScene', `s.openForge()`);
  await sleep(700);
  for (const tab of ['single', 'bulk', 'craft']) {
    await ev(`(() => { const s = window.game.scene.getScene('ForgeScene'); s.scene.restart({ ...s.payload, tab: '${tab}' }); return 1; })()`);
    await sleep(600);
    await report(shape, `forge-${tab}`, 'ForgeScene');
  }
  await stop('ForgeScene');
  await stop('InventoryScene');

  await menu(`m.startRun(false)`);
  await sleep(800);
  await report(shape, 'bones', 'BoneScene');
  await stop('BoneScene');

  // In a run: the HUD with four skills and some shards, then each popup.
  await menu(`m.scene.start('GameScene', { save: null })`);
  await cdp.until(`window.game.scene.isActive('GameScene')`, 20000, 200);
  await sleep(1200);
  await on('GameScene', `for (const id of ['fireball', 'chainLightning', 'iceSpear']) s.acquire(id);
    for (const st of ['damage', 'attackSpeed', 'regen']) s.gainShard(st)`);
  await sleep(800);
  await report(shape, 'hud', 'GameScene');
  await on('GameScene', `s.pauseRun()`);
  await sleep(600);
  await report(shape, 'pause', 'PauseScene');
  await ev(`(() => { const g = window.game.scene; g.stop('PauseScene'); g.resume('GameScene'); return 1; })()`);
  await sleep(400);
  await on('GameScene', `s.onLevelUp(2)`);
  await sleep(900);
  await report(shape, 'upgrade', 'UpgradeScene');
  await ev(`(() => { window.game.scene.getScene('UpgradeScene').scene.stop(); const s = window.game.scene.getScene('GameScene'); s.choosing = false; s.physics.resume(); return 1; })()`);
  await on('GameScene', `s.openStartPick()`);
  await sleep(900);
  await report(shape, 'skillpick', 'SkillPickScene');
  await ev(`(() => { window.game.scene.stop('SkillPickScene'); return 1; })()`);
  await on('GameScene', `s.openShardPick('부제')`);
  await sleep(900);
  await report(shape, 'shardpick', 'UpgradeScene');
  await ev(`(() => { window.game.scene.stop('UpgradeScene'); const s = window.game.scene.getScene('GameScene'); s.choosing = false; s.physics.resume(); return 1; })()`);
  await on('GameScene', `s.player.invulnerableUntil = 0; s.player.setInvulnerable?.(false); s.player.takeDamage(1e9)`);
  await sleep(1800);
  await report(shape, 'gameover', 'GameOverScene');
}
await cdp.send('Emulation.clearDeviceMetricsOverride', {});
cdp.close();
