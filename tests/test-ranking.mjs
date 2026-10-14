import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 랭킹: the board keeps the best twenty runs by damage, a run that makes it
// asks for three letters and an emoji, the board can be read from the title,
// and first place sits under the logo.

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
const active = (key) => ev(`(() => window.game.scene.isActive('${key}'))()`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(1000);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4200);

// --- 1. the store ---
const store = await ev(`(() => {
  const r = window.ranking;
  const size = window.config && 20;
  const out = { emptyFirst: r.first === undefined, emptyQualifies: r.qualifies(1), zero: r.qualifies(0) };
  for (let i = 0; i < 25; i++) {
    r.submit({ name: 'p' + String.fromCharCode(97 + (i % 26)) + 'x1!', emoji: i % 2 ? '🔥' : '🚀',
               damage: 1000 * (i + 1), level: 1, survivedMs: 1000 });
  }
  const top = r.top;
  out.length = top.length;
  out.sorted = top.every((e, i) => i === 0 || top[i - 1].damage >= e.damage);
  out.best = top[0].damage; out.worst = top[top.length - 1].damage;
  out.names = top.slice(0, 3).map((e) => e.name);
  out.emoji = [...new Set(top.map((e) => e.emoji))];
  out.tooLow = r.qualifies(out.worst - 1);
  out.place = r.placeFor(out.best + 1);
  out.stored = JSON.parse(localStorage.getItem('exiled-survivors:ranking:v1')).length;
  return out;
})()`);
console.log('store:', JSON.stringify(store));
check('an empty board has no first place, and any damage makes it — none does not',
  store.emptyFirst && store.emptyQualifies && !store.zero);
check('it keeps the best twenty, best first, and writes them down',
  store.length === 20 && store.sorted && store.best === 25000 && store.worst === 6000 && store.stored === 20,
  `${store.length} kept, ${store.best} to ${store.worst}`);
check('a name is up to three letters, A to Z, upper case',
  store.names.every((n) => /^[A-Z]{1,3}$/.test(n)), store.names.join(' '));
check('and the emoji is one of the offered ones or nothing',
  JSON.stringify(store.emoji.sort()) === JSON.stringify(['', '🔥'].sort()), store.emoji.join(' '));
check('a run below twentieth does not make it; one above first takes first',
  store.tooLow === false && store.place === 1);

// --- 2. the title: first place under the logo, and the corner icon ---
await ev(`(() => { window.game.scene.getScene('MenuScene').scene.restart(); return 1; })()`);
await sleep(1000);
const title = await scene('MenuScene', `
  return { champion: s.champion?.text ?? null, icon: !!s.icons.views.find((v) => v.button.id === 'ranking') };
`);
check('first place is under the logo', /1위/.test(title.champion ?? '') && /25,000/.test(title.champion ?? ''),
  title.champion);
check('and the corner has a 랭킹 icon', title.icon);
await shot('ranking-01-title');

await scene('MenuScene', `s.icons.press('ranking'); return 1;`);
await sleep(800);
const board = await scene('RankingScene', `
  return { rows: s.rows.map((r) => r.map((c) => c.text)), canvas: s.scale.height,
           bottom: Math.max(...s.rows.map((r) => r[0].y)) };
`);
check('the board lists places 1 to 20 with name and damage',
  board.rows.length === 20 && board.rows[0][0] === '1' && board.rows[19][0] === '20' &&
    board.rows[0][2] === '25,000',
  board.rows.slice(0, 2).map((r) => r.join(' ')).join(' | '));
check('and all twenty fit on the screen', board.bottom < board.canvas - 30, `${board.bottom} of ${board.canvas}`);
await shot('ranking-02-board');
await scene('RankingScene', `s.backButton.press(); return 1;`);
await sleep(500);
check('its back button returns to the title', (await active('MenuScene')) && !(await active('RankingScene')));

// --- 3. a run that makes the board asks for a name ---
await ev(`(() => { window.ranking.reset(); window.config.RANKING.promptOnDeath = true;
  window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
await sleep(1500);
await scene('GameScene', `s.stats.recordDamage(4321); s.player.invulnerableUntil = 0; s.player.takeDamage(1e9); return 1;`);
await sleep(2200);
const asked = await ev(`(() => ({
  entry: window.game.scene.isActive('RankEntryScene'),
  overPaused: window.game.scene.isPaused('GameOverScene'),
}))()`);
check('the end of a run that made the board asks for a name, over the end screen',
  asked.entry && asked.overPaused, JSON.stringify(asked));

// Typed: the letters go in the slots in turn; ↑ on the emoji slot picks one.
await cdp.tap('KeyZ', 90, 'z');
await cdp.tap('KeyE', 69, 'e');
await cdp.tap('KeyD', 68, 'd');
await sleep(150);
await cdp.tap('ArrowUp', 38, 'ArrowUp');
await sleep(150);
const typed = await scene('RankEntryScene', `return { name: s.name, emoji: s.emoji, cursor: s.cursor };`);
check('typing fills the letters in order, and ↑ steps the emoji',
  typed.name === 'ZED' && typed.emoji !== '' && typed.cursor === 3, JSON.stringify(typed));
await shot('ranking-03-entry');
await cdp.tap('Enter', 13, 'Enter');
await sleep(700);
const entered = await ev(`(() => {
  const g = window.game.scene.getScene('GameOverScene');
  const row = g.menu.rows.find((r) => r.item.id === 'rank');
  return { entry: window.game.scene.isActive('RankEntryScene'), resumed: !window.game.scene.isPaused('GameOverScene'),
           top: window.ranking.top[0], row: row?.label.text, enabled: row?.item.enabled() };
})()`);
console.log('entered:', JSON.stringify(entered));
check('Enter puts it on the board, with the name and emoji chosen',
  !entered.entry && entered.top?.name === 'ZED' && entered.top?.emoji === typed.emoji && entered.top?.damage === 4321);
check('and the end screen says where it landed, and cannot enter it twice',
  entered.resumed && /1위/.test(entered.row ?? '') && entered.enabled === false, entered.row);

// --- 4. skipping leaves a way back to it ---
await ev(`(() => { const g = window.game.scene.getScene('GameOverScene');
  g.scene.stop(); window.game.scene.getScene('GameScene').scene.restart({ save: null }); return 1; })()`);
await sleep(1500);
await scene('GameScene', `s.stats.recordDamage(99); s.player.invulnerableUntil = 0; s.player.takeDamage(1e9); return 1;`);
await sleep(2200);
await scene('RankEntryScene', `s.backButton.press(); return 1;`);
await sleep(600);
const skipped = await ev(`(() => {
  const g = window.game.scene.getScene('GameOverScene');
  const row = g.menu.rows.find((r) => r.item.id === 'rank');
  return { board: window.ranking.top.length, row: row?.label.text, enabled: row?.item.enabled() };
})()`);
check('backing out enters nothing, and leaves 랭킹 등록 on the end screen to come back to',
  skipped.board === 1 && skipped.enabled === true && /랭킹 등록/.test(skipped.row ?? ''), JSON.stringify(skipped));
await ev(`(() => { const g = window.game.scene.getScene('GameOverScene');
  g.menu.items.find((i) => i.id === 'rank').onSelect(); return 1; })()`);
await sleep(600);
check('and pressing it asks again', await active('RankEntryScene'));
await scene('RankEntryScene', `s.finish(false); return 1;`);

// --- 5. the title shows the new first place ---
await ev(`(() => { window.game.scene.getScene('GameOverScene').toTitle(); return 1; })()`);
await sleep(1200);
const champ = await scene('MenuScene', `return s.champion?.text ?? null;`);
check('first place under the logo is the run just entered', /ZED/.test(champ ?? '') && /4,321/.test(champ ?? ''), champ);

// --- 6. a run that does not make a full board does not ask ---
await ev(`(() => { for (let i = 0; i < 20; i++) window.ranking.submit({ name: 'AAA', emoji: '', flag: '', damage: 1e7 + i, level: 1, survivedMs: 1 });
  window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
await sleep(1500);
await scene('GameScene', `s.stats.recordDamage(10); s.player.invulnerableUntil = 0; s.player.takeDamage(1e9); return 1;`);
await sleep(2200);
const quiet = await ev(`(() => ({ entry: window.game.scene.isActive('RankEntryScene'),
  row: !!window.game.scene.getScene('GameOverScene').menu.items.find((i) => i.id === 'rank') }))()`);
check('a run that would not make the board is not asked, and gets no row', !quiet.entry && !quiet.row);

// --- 7. Tab to the trophy and Enter opens the board, and only the board ---
// One key used to reach both the icon and the list under it: the board
// opened and 게임 시작 fired with it, putting a run under the board.
await ev(`(() => { window.game.scene.getScene('GameOverScene').toTitle(); return 1; })()`);
await sleep(1200);
for (let i = 0; i < 3; i++) { await cdp.tap('Tab', 9, 'Tab'); await sleep(150); }
await cdp.tap('Enter', 13, 'Enter');
await sleep(900);
const tabbed = await ev(`(() => ({ board: window.game.scene.isActive('RankingScene'),
  run: window.game.scene.isActive('GameScene') }))()`);
check('Tab to the 랭킹 icon and Enter opens the board without starting a run',
  tabbed.board && !tabbed.run, JSON.stringify(tabbed));
await scene('RankingScene', `s.backButton.press(); return 1;`);
await sleep(500);
await cdp.tap('ArrowDown', 40, 'ArrowDown');
await sleep(150);
await cdp.tap('ArrowUp', 38, 'ArrowUp');
await sleep(150);
await cdp.tap('Enter', 13, 'Enter');
await sleep(1200);
check('and an arrow hands the keyboard back to the list, where Enter starts a run',
  await active('GameScene'));

// --- 8. a flag goes with the name ---
await ev(`(() => { window.ranking.reset(); window.ranking.lastFlag = ''; window.config.RANKING.promptOnDeath = true;
  window.game.scene.getScene('GameScene').scene.start('GameScene', { save: null }); return 1; })()`);
await sleep(1500);
await scene('GameScene', `s.stats.recordDamage(777); s.player.invulnerableUntil = 0; s.player.takeDamage(1e9); return 1;`);
await sleep(2200);
const flagged = await scene('RankEntryScene', `return { flag: s.flag, slots: s.picks.length };`);
check('the name entry has a flag slot, starting on the game’s own language',
  flagged.flag === 'KR' && flagged.slots === 5, JSON.stringify(flagged));
for (let i = 0; i < 4; i++) { await cdp.tap('ArrowRight', 39, 'ArrowRight'); await sleep(80); }
await cdp.tap('ArrowUp', 38, 'ArrowUp');
await sleep(150);
const stepped = await scene('RankEntryScene', `return { flag: s.flag, cursor: s.cursor };`);
check('↑ on it steps to the next flag', stepped.flag === 'JP' && stepped.cursor === 4, JSON.stringify(stepped));
await cdp.tap('Enter', 13, 'Enter');
await sleep(700);
const withFlag = await ev(`(() => window.ranking.top[0])()`);
check('and the flag is entered with the name', withFlag?.flag === 'JP', JSON.stringify(withFlag));
await ev(`(() => { window.game.scene.getScene('GameOverScene').toTitle(); return 1; })()`);
await sleep(1200);
await scene('MenuScene', `s.icons.press('ranking'); return 1;`);
await sleep(800);
const drawn = await scene('RankingScene', `
  const flags = []; s.board.list.forEach((o) => { if (o.type === 'Image') flags.push(o.texture.key); });
  return flags;
`);
check('the board draws it beside the name', drawn.includes('tex-flag-JP'), drawn.join(' '));
await scene('RankingScene', `s.backButton.press(); return 1;`);
await sleep(400);

// --- 9. the shared board, against a stand-in for the real one ---
// The harness never touches the real board; here fetch is replaced by an
// in-page store that answers the way the real one does.
const shared = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  const R = window.config.RANKING;
  const realFetch = window.fetch;
  const remote = { name: R.shared.name, data: { v: 1, entries: [
    { name: 'FAR', emoji: '', flag: 'BR', damage: 99999, level: 9, survivedMs: 1, at: '2026-01-01T00:00:00Z' },
    { name: 'BAD', emoji: '', flag: '', damage: 1e15, level: 1, survivedMs: 1, at: 'x' },
  ] } };
  const puts = [];
  let down = false;
  window.fetch = async (url, init) => {
    if (down) throw new TypeError('offline');
    if (init?.method === 'PUT') { const b = JSON.parse(init.body); puts.push(b); remote.data = b.data; }
    return new Response(JSON.stringify(remote), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  R.shared.enabled = true;
  const out = {};
  try {
    out.source = await window.ranking.refresh();
    out.top = window.ranking.top.map((e) => e.name + ':' + e.flag);
    window.ranking.submit({ name: 'NEW', emoji: '', flag: 'US', damage: 150000, level: 2, survivedMs: 1 });
    await new Promise((r) => setTimeout(r, 200));
    out.put = puts.length ? puts[puts.length - 1].data.entries.map((e) => e.name) : [];
    out.afterPush = window.ranking.source;
    down = true;
    out.offline = await window.ranking.refresh();
    out.kept = window.ranking.top.length;
  } finally {
    window.fetch = realFetch;
    R.shared.enabled = false;
  }
  return out;
})()` });
const sh = shared.result?.result?.value ?? {};
console.log('shared:', JSON.stringify(sh));
check('the shared board is folded into this one when it is read',
  sh.source === 'shared' && sh.top?.[0] === 'FAR:', JSON.stringify(sh.top));
check('a flag it does not offer, and a damage past belief, are not taken from it',
  !sh.top?.some((n) => n.startsWith('BAD')), JSON.stringify(sh.top));
check('a run entered here is written back to it, with what was already there',
  sh.put?.[0] === 'NEW' && sh.put?.includes('FAR') && sh.afterPush === 'shared', JSON.stringify(sh.put));
check('and when it cannot be reached, this device’s board stays and says so',
  sh.offline === 'offline' && sh.kept >= 2);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
