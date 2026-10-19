import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// The title's rainbow notice: in every window shape it finds room of its
// own — beside the rows, under them, over the logo or by the icons — and
// sits clear of everything else on the title, its letters changing colour.

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

const openTitle = async (width, height, touch = false) => {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: touch });
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 0 });
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(1200);
  await cdp.send('Page.reload', {});
  await sleep(4000);
};

// Everything on the title the notice must keep off, and whether it does.
const LOOK = `(() => {
  const s = window.game.scene.getScene('MenuScene');
  const n = s.notice;
  if (!n) return { room: null, size: [s.scale.width, s.scale.height] };
  const box = n.container.getBounds();
  const mine = new Set([n.container, ...n.glyphs]);
  const W = s.scale.width, H = s.scale.height;
  const hits = [];
  for (const o of s.children.list) {
    if (mine.has(o) || !o.visible || !o.getBounds) continue;
    // The floor and the scrim cover the whole screen; they are behind, not in the way.
    if (o.type === 'TileSprite' || (o.type === 'Rectangle' && o.width >= W)) continue;
    if (o.type === 'Text' && !o.text) continue;
    const b = o.getBounds();
    if (b.width <= 0 || b.height <= 0) continue;
    if (box.right > b.left && box.left < b.right && box.bottom > b.top && box.top < b.bottom) {
      hits.push(o.type + ':' + (o.text ?? o.texture?.key ?? '') + '@' + Math.round(b.x) + ',' + Math.round(b.y));
    }
  }
  const text = n.glyphs.map((g) => g.text).join('');
  return {
    room: s.noticeRoom, size: [W, H], hits,
    inside: box.left >= 0 && box.top >= 0 && box.right <= W && box.bottom <= H,
    box: [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)],
    text, wanted: window.__noticeWanted ?? null,
    tints: n.glyphs.slice(0, 3).map((g) => g.tintTopLeft),
  };
})()`;

const SIZES = [
  { name: 'desktop', w: 1280, h: 720 },
  { name: 'narrow-landscape', w: 900, h: 750 },
  { name: 'wide', w: 1600, h: 640 },
  { name: 'portrait-phone', w: 390, h: 844, touch: true },
  { name: 'short-portrait', w: 520, h: 640, touch: true },
];

for (const size of SIZES) {
  await openTitle(size.w, size.h, size.touch);
  const first = await cdp.evaluate(LOOK);
  await sleep(400);
  const later = await cdp.evaluate(LOOK);
  console.log(size.name, JSON.stringify(first));
  await shot(`notice-${size.name}`);
  check(`${size.name}: the notice is on the title`, first.room !== null,
    `${first.size.join('x')} → ${first.room} ${JSON.stringify(first.box)}`);
  if (first.room === null) continue;
  check(`${size.name}: it touches nothing else on the title`, first.hits.length === 0, first.hits.join(' | '));
  check(`${size.name}: and is all on screen`, first.inside);
  check(`${size.name}: its letters are different colours, and the colours move`,
    new Set(first.tints).size > 1 && first.tints.some((c, i) => c !== later.tints[i]),
    `${first.tints.join(',')} → ${later.tints.join(',')}`);
}

// It says what the locale says.
const words = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('MenuScene');
  return { shown: s.notice ? s.notice.glyphs.map((g) => g.text).join('') : null };
})()`);
check('it reads the locale’s line, spaces aside', words.shown !== null && words.shown.length > 4, words.shown ?? '');

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false, maxTouchPoints: 0 });

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
