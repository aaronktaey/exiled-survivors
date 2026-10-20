import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// Not a suite: draws every survivor look in every pose on one sheet, for a person to look at.
const cdp = await connect(9333);
const out = process.argv[2] ?? '.';
await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(4000);
await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  s.choosing = true;
  s.physics.pause();
  const c = window.config, cam = s.cameras.main;
  const ids = ['base', ...Object.keys(c.PLAYER_LOOK.bySkill)];
  const poses = c.LOOK_POSES.map((p) => p.key);
  const cell = 66;
  const x0 = cam.worldView.x + 40, y0 = cam.worldView.y + 36;
  s.add.rectangle(cam.worldView.x, cam.worldView.y, cam.width, cam.height, 0x20242c, 1).setOrigin(0, 0).setDepth(9000);
  ids.forEach((id, row) => poses.forEach((pose, col) => {
    s.add.image(x0 + col * cell, y0 + row * cell, c.lookFrame(id, pose)).setDisplaySize(cell - 6, cell - 6).setDepth(9001);
  }));
  return 1;
})()`);
await sleep(400);
const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${out}/look-sheet.png`, Buffer.from(r.result.data, 'base64'));
cdp.close();
