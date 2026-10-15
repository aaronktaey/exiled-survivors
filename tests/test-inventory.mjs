import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 인벤토리: two tabs over one grid of six by twelve, details beside it (or
// under it, upright), and the old 장비창's work done from the 장비 tab.

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
  console.log('shot:', n);
};
const ev = (expr) => cdp.evaluate(expr);
const inv = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('InventoryScene'); ${body} })()`);

const SETUP = (weapons) => `(() => {
  localStorage.clear();
  const items = [{ uid: 'starter', id: 'rustySword', prefixes: [], suffixes: [] }];
  for (let i = 0; i < ${weapons}; i++) items.push({ uid: 'w' + i, id: 'ironSword',
    prefixes: i % 3 === 0 ? [{ id: 'mighty', tier: 3 }, { id: 'critical', tier: 2 }, { id: 'cruel', tier: 1 }] : [],
    suffixes: i % 3 === 0 ? [{ id: 'giant', tier: 2 }, { id: 'swift', tier: 4 }] : [] });
  localStorage.setItem('exiled-survivors:gear:v2', JSON.stringify({ items, equipped: 'starter' }));
  localStorage.setItem('exiled-survivors:orbs:v1', JSON.stringify({ transmute: 4, chaos: 1 }));
  localStorage.setItem('exiled-survivors:bones:v1', JSON.stringify({ rib: 3 }));
  return 1;
})()`;

const open = async (weapons) => {
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(1200);
  await ev(SETUP(weapons));
  await cdp.send('Page.reload', {});
  await sleep(4200);
  await ev(`(() => {
    const m = window.game.scene.getScene('MenuScene');
    m.icons.views.find((v) => v.button.id === 'gear').button.onSelect();
    return 1;
  })()`);
  await sleep(900);
};

// --- 1. the title's corner icon opens it, on 장비 ---
await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await open(8);
const first = await inv(`
  return { active: window.game.scene.isActive('InventoryScene'), tab: s.tab,
           tabs: [...s.tabs.keys()], items: s.menu.items.length, cells: s.menu.cells.length,
           label: window.game.scene.getScene('MenuScene').icons.views
             .find((v) => v.button.id === 'gear').button.label() };
`);
console.log('opened:', JSON.stringify(first));
check('the corner icon is 인벤토리 and opens it on 장비',
  first.active && first.tab === 'gear' && first.label === '인벤토리', first.label);
check('it has a 장비 tab and a 소모품 tab',
  JSON.stringify(first.tabs) === JSON.stringify(['gear', 'consumables']));
check('every weapon has a cell, on a grid of six by twelve',
  first.items === 9 && first.cells === 72, `${first.items} weapons, ${first.cells} cells`);

// --- 2. pointing at a cell reads it out, and the buttons act on it ---
const hovered = await inv(`
  const i = s.menu.items.findIndex((x) => x.id === 'w0');
  s.menu.cells[i].plate.emit('pointerover');
  const after = { selected: s.menu.selectedId, heading: s.heading.text, lines: s.lines.text,
                  equip: s.equip.text };
  return after;
`);
console.log('hovered:', JSON.stringify(hovered));
check('the mouse over a cell puts the cursor there and reads it out',
  hovered.selected === 'w0' && /무쇠 검/.test(hovered.heading) && /접두어/.test(hovered.lines),
  hovered.heading);
const tapped = await inv(`
  const i = s.menu.items.findIndex((x) => x.id === 'w1');
  s.menu.cells[i].plate.emit('pointerdown');
  return { selected: s.menu.selectedId, equipped: window.gear.value.equipped };
`);
check('a tap only picks — it does not put the weapon on',
  tapped.selected === 'w1' && tapped.equipped === 'starter', JSON.stringify(tapped));
const worn = await inv(`
  s.equipPlate.emit('pointerdown');
  return { equipped: window.gear.value.equipped, text: s.equip.text,
           marked: s.menu.cells[s.menu.selected].mark.visible };
`);
check('착용 beside the grid puts it on, and the cell is marked',
  worn.equipped === 'w1' && worn.marked === true, `${worn.equipped}, button "${worn.text}"`);

// --- 3. the arrow keys move in two directions ---
await inv(`s.menu.focus(s.menu.items[0].id); return 1;`);
const before = await inv(`return s.menu.selected;`);
await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(120);
await cdp.tap('ArrowDown', 40, 'ArrowDown');
await sleep(120);
const moved = await inv(`return { at: s.menu.selected, cols: window.config.INVENTORY.cols };`);
check('→ steps across and ↓ steps down a row',
  moved.at === before + 1 + moved.cols, `${before} -> ${moved.at}`);

// --- 4. 소모품 ---
await cdp.tap('Tab', 9, 'Tab');
await sleep(900);
const cons = await inv(`
  const out = { tab: s.tab, ids: s.menu.items.map((i) => i.id),
                counts: s.menu.cells.slice(0, s.menu.items.length).map((c) => c.count.text) };
  s.menu.focus('bone:rib');
  out.heading = s.heading.text; out.lines = s.lines.text;
  out.orbButtons = s.orbButtons.size;
  return out;
`);
console.log('소모품:', JSON.stringify(cons));
check('Tab opens 소모품', cons.tab === 'consumables');
check('it holds a cell per kind held — 구슬 first, then 뼈다귀 — each with its count',
  JSON.stringify(cons.ids) === JSON.stringify(['orb:transmute', 'orb:chaos', 'bone:rib']) &&
    JSON.stringify(cons.counts) === JSON.stringify(['4', '1', '3']),
  `${cons.ids.join(' ')} / ${cons.counts.join(' ')}`);
check('and reads out what the one under the cursor does, and where it is spent',
  cons.heading === '갈비뼈' && /보유 3/.test(cons.lines) && /게임 시작/.test(cons.lines),
  cons.lines.split('\n').filter(Boolean).join(' | '));
check('with nothing to spend there — 구슬 are spent from 장비',
  cons.orbButtons === 0);
await shot('inventory-01-consumables');
await inv(`s.tabs.get('gear').emit('pointerdown'); return 1;`);
await sleep(900);
check('a tab can be pressed as well', (await inv(`return s.tab;`)) === 'gear');

// --- 5. it fits, lying down and upright ---
for (const [w, h, name] of [[0, 0, 'landscape'], [420, 860, 'upright'], [420, 700, 'short upright']]) {
  if (w) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  } else {
    await cdp.send('Emulation.clearDeviceMetricsOverride', {});
  }
  await open(8);
  const fit = await inv(`
    const cells = s.menu.cells.map((c) => c.plate.getBounds());
    const texts = s.children.list.filter((o) => o.type === 'Text' && o.visible && o.text)
      .map((o) => o.getBounds());
    const all = [...cells, ...texts];
    return { w: s.scale.width, h: s.scale.height, cell: Math.round(cells[0].width),
             right: Math.round(Math.max(...all.map((b) => b.right))),
             bottom: Math.round(Math.max(...all.map((b) => b.bottom))),
             left: Math.round(Math.min(...all.map((b) => b.left))),
             detail: Math.round(s.detailBottom), gridBottom: Math.round(Math.max(...cells.map((b) => b.bottom))),
             paneTop: Math.round(s.heading.y) };
  `);
  console.log(name, JSON.stringify(fit));
  check(`${name}: nothing runs off the screen`,
    fit.right <= fit.w && fit.bottom <= fit.h && fit.left >= 0 && fit.detail <= fit.h,
    `${fit.w}x${fit.h}, content to ${fit.right}x${fit.bottom}, details to ${fit.detail}, cells ${fit.cell}px`);
  if (w) {
    check(`${name}: the details sit under the grid`, fit.paneTop >= fit.gridBottom,
      `grid to ${fit.gridBottom}, details from ${fit.paneTop}`);
  }
  await shot(`inventory-02-${name.replace(' ', '-')}`);
}
await cdp.send('Emulation.clearDeviceMetricsOverride', {});

// --- 6. more weapons than one grid holds turn pages ---
await open(80);
const paged = await inv(`
  const out = { items: s.menu.items.length, pages: s.menu.pages };
  s.menu.focus(s.menu.items[s.menu.items.length - 1].id);
  out.page = s.menu.page; out.label = s.pageLabel.text;
  out.shown = s.menu.cells.filter((c) => c.icon.visible).length;
  return out;
`);
console.log('paged:', JSON.stringify(paged));
check('a stash past seventy-two turns onto a second page, and says so',
  paged.items === 81 && paged.pages === 2 && paged.page === 1 && paged.label === '2 / 2' &&
    paged.shown === 81 - 72,
  `${paged.items} weapons, page ${paged.label}, ${paged.shown} on it`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
