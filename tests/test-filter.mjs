import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 아이템 필터: a switch per kind of drop, from the title's corner. A drop
// switched off still lands but is hidden, and is still taken by walking
// over it; a weapon shows only when both its base and its rarity are on;
// the switches are kept across a reload.

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
const scene = (key, body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('${key}'); ${body} })()`);
const toTitle = async () => {
  await cdp.send('Page.navigate', { url: 'about:blank' });
  await sleep(300);
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(4000);
};

await toTitle();

// --- 1. the screen ---
await scene('MenuScene', `s.icons.press('filter'); return 1;`);
await sleep(800);
const opened = await scene('FilterScene', `return { active: s.scene.isActive(), keys: [...s.cells.keys()],
  want: window.config.ALL_FILTER_KEYS, summary: s.summary.text, back: !!s.backButton };`);
check('the title’s 필터 icon opens a switch for every kind of drop',
  opened.active && opened.back && JSON.stringify(opened.keys) === JSON.stringify(opened.want) &&
    opened.keys.includes('orb:explode') && opened.keys.includes('bone:rib') && opened.keys.includes('gear:onigoroshi'),
  `${opened.keys?.length} switches`);
check('with everything on to begin with', /모두/.test(opened.summary ?? ''), opened.summary);

const pressed = await scene('FilterScene', `
  s.press('orb:chaos');
  const c = s.cells.get('orb:chaos');
  return { shows: window.itemFilter.shows('orb:chaos'), alpha: c.icon.alpha, crossed: c.cross.visible,
           summary: s.summary.text, detail: s.detail.text,
           stored: JSON.parse(localStorage.getItem('exiled-survivors:item-filter:v1')) };
`);
check('pressing one switches it off — dimmed and struck through — and writes it down',
  !pressed.shows && pressed.alpha < 0.5 && pressed.crossed && JSON.stringify(pressed.stored) === '["orb:chaos"]' &&
    /1개/.test(pressed.summary) && /숨김/.test(pressed.detail),
  JSON.stringify(pressed));
await shot('filter-01-screen');

// The keyboard: one to the right of 혼돈 is 각성, and Space switches it.
await scene('FilterScene', `s.focused = [...s.cells.keys()].indexOf('orb:chaos'); return 1;`);
for (const [code, key, vk] of [['ArrowRight', 'ArrowRight', 39], ['Space', ' ', 32]]) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key, windowsVirtualKeyCode: vk });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key, windowsVirtualKeyCode: vk });
  await sleep(150);
}
const keyed = await ev(`(() => ({ awaken: window.itemFilter.shows('orb:awaken') }))()`);
check('→ and Space switch the next one', keyed.awaken === false, JSON.stringify(keyed));
await scene('FilterScene', `s.press('orb:awaken'); return 1;`);

// --- 2. in a run, what is off lands hidden, and is still picked up ---
await scene('FilterScene', `s.press('potion'); s.press('rarity:normal'); s.backButton.press(); return 1;`);
await sleep(400);
await ev(`(() => { window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
await sleep(1500);
const landed = await scene('GameScene', `
  const p = s.player, c = s.combat;
  // Counted by what can be seen: a hidden drop is active but not visible.
  const count = (g) => g.getChildren().filter((d) => d.active && d.visible).length;
  const before = { orbs: count(c.orbDrops), potions: count(c.potions), gear: count(c.gearDrops) };
  c.dropOrbAt(p.x + 200, p.y, 'chaos');
  const afterChaos = count(c.orbDrops);
  c.dropOrbAt(p.x + 200, p.y, 'transmute');
  const afterTransmute = count(c.orbDrops);
  c.dropPotionAt(p.x + 200, p.y);
  const afterPotion = count(c.potions);
  const plain = { uid: 'f1', id: 'rustySword', prefixes: [], suffixes: [] };
  const rare = { uid: 'f2', id: 'rustySword',
    prefixes: [{ id: 'mighty', tier: 3 }, { id: 'critical', tier: 3 }, { id: 'cruel', tier: 3 }],
    suffixes: [{ id: 'giant', tier: 3 }, { id: 'swift', tier: 3 }] };
  c.dropGearAt(p.x + 200, p.y, plain);
  const afterPlain = count(c.gearDrops);
  c.dropGearAt(p.x + 200, p.y, rare);
  const afterRare = count(c.gearDrops);
  window.itemFilter.toggle('gear:rustySword');
  c.dropGearAt(p.x + 200, p.y, { ...rare, uid: 'f3' });
  const afterBase = count(c.gearDrops);
  window.itemFilter.toggle('gear:rustySword');
  return { before, afterChaos, afterTransmute, afterPotion, afterPlain, afterRare, afterBase };
`);
console.log('landed:', JSON.stringify(landed));
check('a 구슬 switched off does not show; one left on does',
  landed.afterChaos === landed.before?.orbs && landed.afterTransmute === landed.before?.orbs + 1, JSON.stringify(landed));
check('nor does a potion switched off', landed.afterPotion === landed.before?.potions);

// What is hidden is still there: nothing of it drawn or pointed at, and
// walking over it takes it.
const hidden = await scene('GameScene', `
  const p = s.player, c = s.combat;
  c.gearDrops.getChildren().forEach((d) => d.active && d.collect());
  c.orbDrops.getChildren().forEach((d) => d.active && d.collect());
  const orbsBefore = s.kit.count('chaos');
  c.dropOrbAt(p.x + 600, p.y, 'chaos');
  const orb = c.orbDrops.getChildren().find((d) => d.active && d.orb === 'chaos');
  const plain = { uid: 'h1', id: 'rustySword', prefixes: [], suffixes: [] };
  c.dropGearAt(p.x + 600, p.y, plain);
  const sword = c.gearDrops.getChildren().find((d) => d.active && d.item.uid === 'h1');
  s.edgeMarkers.update();
  const seen = {
    orb: !!orb && orb.active && !orb.visible && orb.concealed && !orb.nameplate.label.visible &&
      !(orb.nameplate.pillar?.visible ?? false),
    sword: !!sword && sword.active && !sword.visible && sword.concealed && !sword.nameplate.label.visible,
    markers: s.edgeMarkers.shown,
  };
  // Walking over them: the same touch the overlap hands the survivor.
  c.onOrbTouch(p, orb);
  c.onGearTouch(p, sword);
  // A hidden piece is not asked about: it goes into the run's 보관함.
  return { ...seen, orbsGained: s.kit.count('chaos') - orbsBefore,
           swordKept: s.kit.bag.some((i) => i.uid === 'h1'), orbLeft: orb.active, swordLeft: sword.active };
`);
console.log('hidden:', JSON.stringify(hidden));
check('a hidden drop still lies there, with no sprite, name, pillar or edge marker',
  hidden.orb && hidden.sword && hidden.markers === 0, JSON.stringify(hidden));
check('and walking over it picks it up all the same',
  hidden.orbsGained === 1 && hidden.swordKept && !hidden.orbLeft && !hidden.swordLeft, JSON.stringify(hidden));
check('a weapon shows only when both its rarity and its kind are on',
  landed.afterPlain === landed.before?.gear && landed.afterRare === landed.before?.gear + 1 &&
    landed.afterBase === landed.afterRare,
  JSON.stringify(landed));

// --- 3. kept across a reload, and 모두 보이기 puts it all back ---
await toTitle();
const kept = await ev(`(() => ({ chaos: window.itemFilter.shows('orb:chaos'), potion: window.itemFilter.shows('potion'),
  count: window.itemFilter.hiddenCount }))()`);
check('the switches outlive the page', kept.chaos === false && kept.potion === false && kept.count === 3,
  JSON.stringify(kept));
await scene('MenuScene', `s.icons.press('filter'); return 1;`);
await sleep(800);
const reset = await scene('FilterScene', `s.showAll(); return { count: window.itemFilter.hiddenCount, summary: s.summary.text };`);
check('모두 보이기 switches everything back on', reset.count === 0 && /모두/.test(reset.summary), JSON.stringify(reset));
await scene('FilterScene', `s.backButton.press(); return 1;`);
await sleep(300);
check('and its back button returns to the title',
  (await ev(`(() => window.game.scene.isActive('MenuScene') && !window.game.scene.isActive('FilterScene'))()`)) === true);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
