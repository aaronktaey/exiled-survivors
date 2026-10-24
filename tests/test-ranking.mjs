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
  return { champion: s.champion?.text ?? null, icon: !!s.icons.views.find((v) => v.button.id === 'ranking'),
    podium: s.podium.map((p) => p.text), right: Math.max(...s.podium.map((p) => p.x + p.displayWidth)),
    width: s.scale.width, champY: s.champion.y, podY: s.podium[0]?.y,
    cups: s.podiumCups.map((c, i) => ({ on: c.visible, key: c.texture.key, left: c.x < s.podium[i].x })) };
`);
check('first place is under the logo', /1위/.test(title.champion ?? '') && /25,000/.test(title.champion ?? ''),
  title.champion);
check('and second and third on the line under it, inside the screen',
  /2위/.test(title.podium?.[0] ?? '') && /24,000/.test(title.podium?.[0] ?? '') &&
    /3위/.test(title.podium?.[1] ?? '') && /23,000/.test(title.podium?.[1] ?? '') &&
    title.podY > title.champY && title.right <= title.width,
  JSON.stringify(title.podium));
check('2위 wears a silver cup and 3위 a bronze one, in front of each',
  title.cups?.[0]?.on && title.cups[0].key === 'tex-trophy-silver' && title.cups[0].left &&
    title.cups?.[1]?.on && title.cups[1].key === 'tex-trophy-bronze' && title.cups[1].left,
  JSON.stringify(title.cups));
check('and the corner has a 랭킹 icon', title.icon);
await shot('ranking-01-title');

const daily = await ev(`(() => {
  const r = window.ranking;
  const kept = JSON.parse(localStorage.getItem('exiled-survivors:ranking:v1'));
  const start = window.config.rankingDayStart(Date.now());
  const old = { name: 'OLD', emoji: '', flag: '', damage: 1e7, level: 1, survivedMs: 9000,
                at: new Date(start - 1000).toISOString() };
  localStorage.setItem('exiled-survivors:ranking:v1', JSON.stringify([old, ...kept]));
  r.loaded = false;
  const out = { names: r.top.map((e) => e.name), first: r.first?.name, start,
    next: window.config.nextRankingReset(Date.now()) };
  localStorage.setItem('exiled-survivors:ranking:v1', JSON.stringify(kept));
  r.loaded = false;
  return out;
})()`);
const kst = new Date(daily.start + 9 * 3600000);
check('a run from before the day’s reset is off the board',
  !daily.names.includes('OLD') && daily.first !== 'OLD' && daily.names.length === 20, JSON.stringify(daily.names.slice(0, 3)));
check('and the day starts at 05:00 Korean time, a day before the next reset',
  kst.getUTCHours() === 5 && kst.getUTCMinutes() === 0 && daily.next - daily.start === 86400000,
  new Date(daily.start).toISOString());

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

// --- 8b. 내 기록: every run this player ends, on its own tab ---
await ev(`(() => { window.personal.reset(); window.config.RANKING.promptOnDeath = false;
  window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
await sleep(1500);
await scene('GameScene', `s.stats.recordDamage(777.6); s.player.invulnerableUntil = 0; s.player.takeDamage(1e9); return 1;`);
await sleep(2200);
const kept = await ev(`(() => window.personal.runs.map((r) => ({ damage: r.damage, ms: r.survivedMs, at: r.at })))()`);
check('a run that ends goes on 내 기록 in whole numbers, with when it ended',
  kept.length === 1 && Number.isInteger(kept[0].damage) && kept[0].damage >= 777 && Number.isInteger(kept[0].ms) && !!Date.parse(kept[0].at),
  JSON.stringify(kept));
await ev(`(() => { window.game.scene.getScene('GameOverScene').toTitle(); return 1; })()`);
await sleep(1200);
await ev(`(() => { for (let i = 1; i <= 3; i++) window.personal.record({ damage: i * 1000, level: i + 4, survivedMs: 65000 * i }); return 1; })()`);
await scene('MenuScene', `s.icons.press('ranking'); return 1;`);
await sleep(800);
const opened = await scene('RankingScene', `return { tab: s.tab, tabs: s.tabs.size,
  reset: s.resetLine?.visible ? s.resetLine.text : '', hour: window.config.RANKING.dailyReset.hour };`);
check('the board opens on 전체 랭킹, with a 내 기록 tab beside it', opened.tab === 'shared' && opened.tabs === 2,
  JSON.stringify(opened));
check('and says when it starts over, counting down to it',
  opened.reset.includes(`오전 ${opened.hour}시`) && /\d+:\d\d:\d\d 남음/.test(opened.reset), opened.reset);
await scene('RankingScene', `s.tabs.get('personal').emit('pointerdown', s.input.activePointer); return 1;`);
await sleep(300);
const mineTab = await scene('RankingScene', `
  return { tab: s.tab, rows: s.rows.map((r) => r.map((c) => c.text)), canvas: s.scale.height,
           bottom: s.rows.length ? Math.max(...s.rows.map((r) => r[0].y)) : 0 };
`);
check('내 기록 does not start over, so the countdown is not on it',
  (await scene('RankingScene', `return s.resetLine.visible;`)) === false);
check('pressing it lists this player’s own runs, best first, with level and time',
  mineTab.tab === 'personal' && mineTab.rows.length === 4 && mineTab.rows[0][0] === '1' &&
    mineTab.rows[0][2] === '7' && mineTab.rows[0][3] === '3:15' && mineTab.rows[0][4] === '3,000' &&
    /^\d+\/\d+$/.test(mineTab.rows[0][1]) && mineTab.rows.length === 4,
  mineTab.rows.map((r) => r.join(' ')).join(' | '));
await shot('ranking-03-personal');
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 });
await sleep(300);
const back = await scene('RankingScene', `return { tab: s.tab, first: s.rows[0]?.map((c) => c.text).join(' ') };`);
check('and an arrow key goes back to 전체 랭킹', back.tab === 'shared', JSON.stringify(back));
await scene('RankingScene', `s.backButton.press(); return 1;`);
await sleep(400);
await scene('MenuScene', `s.icons.press('ranking'); return 1;`);
await sleep(600);
check('it opens on 전체 랭킹 again next time', (await scene('RankingScene', `return s.tab;`)) === 'shared');
await scene('RankingScene', `s.backButton.press(); return 1;`);
await sleep(400);

// --- 9. the shared board, against a stand-in for the game's Worker ---
// The harness never touches the real board; here fetch is replaced by an
// in-page server that answers the way server/index.ts does.
const shared = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  const R = window.config.RANKING;
  const realFetch = window.fetch;
  const board = [
    { name: 'FAR', emoji: '', flag: 'TW', damage: 99999, level: 9, survivedMs: 60000, at: new Date().toISOString(), skill: 'voidOrb', wins: 3, seconds: 2, thirds: 1 },
    { name: 'BAD', emoji: '', flag: '', damage: 1e15, level: 1, survivedMs: 1, at: 'x' },
  ];
  const posts = [];
  let down = false;
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (url, init) => {
    if (down) throw new TypeError('offline');
    if (String(url) !== R.shared.url) return reply({ error: 'not found' }, 404);
    if (init?.method === 'POST') {
      const run = JSON.parse(init.body);
      posts.push(run);
      // The server turns this one down, the way it does a typed-in number.
      if (run.name === 'REJ') return reply({ error: 'pace' }, 400);
      // And it stores whole numbers only — a run's time never is one.
      if (![run.damage, run.level, run.survivedMs].every(Number.isInteger)) return reply({ error: 'numbers' }, 400);
      board.push({ ...run, at: new Date().toISOString() });
      board.sort((a, b) => b.damage - a.damage);
      return reply({ ok: true, place: 1, entries: board });
    }
    return reply({ entries: board });
  };
  R.shared.enabled = true;
  const out = {};
  try {
    // Something only this device ever had: the server's board replaces it.
    window.ranking.submit({ name: 'OLD', emoji: '', flag: '', damage: 5, level: 1, survivedMs: 9000 });
    out.source = await window.ranking.refresh();
    out.top = window.ranking.top.map((e) => e.name + ':' + e.flag);
    out.far = window.ranking.top.find((e) => e.name === 'FAR');
    window.ranking.submit({ name: 'NEW', emoji: '', flag: 'US', damage: 150000.7, level: 2, survivedMs: 60016.666 });
    await new Promise((r) => setTimeout(r, 300));
    out.posted = posts.map((p) => ({ name: p.name, token: 'token' in p }));
    out.afterPush = window.ranking.source;
    out.withNew = window.ranking.top.map((e) => e.name);
    window.ranking.submit({ name: 'REJ', emoji: '', flag: '', damage: 999999, level: 2, survivedMs: 60000 });
    await new Promise((r) => setTimeout(r, 300));
    out.afterReject = window.ranking.top.map((e) => e.name);
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
check('the server’s board replaces this device’s when it is read',
  sh.source === 'shared' && sh.top?.[0] === 'FAR:TW' && !sh.top?.some((n) => n.startsWith('OLD')),
  JSON.stringify(sh.top));
check('a row keeps the skill it was played on and the account’s days at first, second and third',
  sh.far?.skill === 'voidOrb' && sh.far?.wins === 3 && sh.far?.seconds === 2 && sh.far?.thirds === 1,
  JSON.stringify(sh.far));
check('a damage past belief is not taken from it', !sh.top?.some((n) => n.startsWith('BAD')), JSON.stringify(sh.top));
check('a run entered here is handed in, with its check token, and the board sent back is shown',
  sh.posted?.some((p) => p.name === 'NEW' && p.token) && sh.afterPush === 'shared' &&
    sh.withNew?.[0] === 'NEW' && sh.withNew?.includes('FAR'),
  JSON.stringify({ posted: sh.posted, board: sh.withNew }));
check('a run the server turns down does not stay on the board',
  !sh.afterReject?.includes('REJ') && sh.afterReject?.includes('NEW'), JSON.stringify(sh.afterReject));
check('and when it cannot be reached, this device’s board stays and says so',
  sh.offline === 'offline' && sh.kept >= 2);

// --- 9b. a run that went in is never lost to a stale board or a reload (0.113) ---
// The edge's copy of the board is per data centre: one read before a run went
// in can come back for a few seconds. And a page reloaded onto a new version
// while the run was on its way never heard back.
const keptRun = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  const R = window.config.RANKING, S = window.config.STORAGE;
  const realFetch = window.fetch;
  localStorage.removeItem(S.rankMine);
  localStorage.removeItem(S.rankOutbox);
  const others = [{ name: 'OTH', emoji: '', flag: '', damage: 10, level: 1, survivedMs: 9000, at: new Date().toISOString(), skill: '' }];
  const board = [...others];
  let staleAsOf = 0, hang = null, posts = 0;
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.fetch = async (url, init) => {
    if (String(url) !== R.shared.url) return reply({ error: 'not found' }, 404);
    if (init?.method === 'POST') {
      posts += 1;
      if (hang) await hang;
      const run = JSON.parse(init.body);
      if (!board.some((e) => e.name === run.name && e.damage === run.damage)) board.push({ ...run, at: new Date().toISOString() });
      board.sort((a, b) => b.damage - a.damage);
      return reply({ ok: true, place: 1, entries: board, asOf: Date.now() });
    }
    // The stale copy: the board from before, read at staleAsOf.
    return reply({ entries: others, asOf: staleAsOf });
  };
  R.shared.enabled = true;
  // Signed in as one account the whole way: a run waiting goes again only for its own account.
  const userWas = window.account.user;
  window.account.user = { id: 'acct-1', provider: 'test', name: 'tester', rank: { name: '', emoji: '', flag: '' } };
  const out = {};
  const names = () => window.ranking.top.map((e) => e.name);
  try {
    window.ranking.submit({ name: 'MEE', emoji: '', flag: '', damage: 5000, level: 3, survivedMs: 60000 });
    await new Promise((r) => setTimeout(r, 300));
    out.taken = names();
    out.outboxAfter = localStorage.getItem(S.rankOutbox);
    staleAsOf = Date.now() - 5000;
    await window.ranking.refresh();
    out.onStale = names();
    staleAsOf = Date.now() + 5000;
    await window.ranking.refresh();
    out.onNewer = names();

    // A run on its way: written down first, the page held; never answered (the page went): sent again.
    let fail;
    hang = new Promise((_, reject) => { fail = reject; });
    window.ranking.submit({ name: 'OUT', emoji: '', flag: '', damage: 7000, level: 3, survivedMs: 61000 });
    await new Promise((r) => setTimeout(r, 200));
    out.busy = window.ranking.busy;
    out.waiting = JSON.parse(localStorage.getItem(S.rankOutbox) ?? 'null')?.run?.name ?? null;
    // On the title with nothing else open — only the run on its way stands in the way.
    const onTitle = { scene: { getScenes: () => [{ scene: { key: window.config.SCENES.menu } }] } };
    window.liveUpdate.latest = 'newer-build';
    out.safe = window.liveUpdate.safeNow(onTitle);
    fail(new TypeError('the page went'));
    hang = null;
    await new Promise((r) => setTimeout(r, 200));
    out.stillWaiting = !!localStorage.getItem(S.rankOutbox);
    const before = posts;
    staleAsOf = Date.now();
    await window.ranking.refresh();
    await new Promise((r) => setTimeout(r, 300));
    out.resent = posts - before;
    out.cleared = localStorage.getItem(S.rankOutbox) === null;
    out.after = names();
    out.busyAfter = window.ranking.busy;
    out.safeAfter = window.liveUpdate.safeNow(onTitle);
  } finally {
    window.fetch = realFetch;
    R.shared.enabled = false;
    window.liveUpdate.latest = null;
    window.account.user = userWas;
    localStorage.removeItem(S.rankMine);
    localStorage.removeItem(S.rankOutbox);
  }
  return out;
})()` });
const kp = keptRun.result?.result?.value ?? { err: keptRun.result?.exceptionDetails?.exception?.description };
console.log('kept:', JSON.stringify(kp));
check('a run the server took stays on a board read before it (an edge copy from before), and its outbox is cleared',
  kp.taken?.includes('MEE') && kp.outboxAfter === null && kp.onStale?.includes('MEE') && kp.onStale?.includes('OTH'),
  JSON.stringify({ taken: kp.taken, onStale: kp.onStale, outbox: kp.outboxAfter }));
check('a board read after it is believed: a run not on it was taken off',
  kp.onNewer?.includes('OTH') && !kp.onNewer?.includes('MEE'), JSON.stringify(kp.onNewer));
check('a run on its way is written down first, and the title holds a new version back meanwhile',
  kp.busy === true && kp.waiting === 'OUT' && kp.safe === false, JSON.stringify({ busy: kp.busy, waiting: kp.waiting, safe: kp.safe }));
check('a run never answered is handed in again on the next look at the board, and then let go',
  kp.stillWaiting === true && kp.resent === 1 && kp.cleared && kp.after?.includes('OUT') && kp.busyAfter === false,
  JSON.stringify({ stillWaiting: kp.stillWaiting, resent: kp.resent, cleared: kp.cleared, after: kp.after }));
check('once it is answered, the new version is free to load', kp.safeAfter === true, JSON.stringify(kp.safeAfter));

// --- 10. 랭킹 검토: the admin sees which runs look out of line, reads each
// one's 판 내역, and takes one off the board only after being askedTwice twice ---
// A stand-in for /api/ranking, /review and /remove, kept on the page across
// the probes below. On the dev server every account counts as the admin.
const STAND_IN = `(() => {
  const R = window.config.RANKING;
  const now = Date.now();
  const at = (ago) => new Date(now - ago).toISOString();
  const detail = { build: 'abc123', version: '0.62', kills: { grunt: 1200, boss: 3 }, bones: ['skull'],
    gear: { id: 'onigoroshi', prefixes: [{ id: 'mighty', tier: 1 }], suffixes: [{ id: 'giant', tier: 2 }] },
    skills: [{ id: 'fireball', level: 30 }], passives: { damage: 10 }, resumed: true };
  const board = [
    { name: 'CHT', emoji: '', flag: 'KR', damage: 5000000, level: 20, survivedMs: 600000, at: at(3000), skill: 'fireball', wins: 0, seconds: 0, thirds: 0 },
    { name: 'FIN', emoji: '', flag: 'KR', damage: 90000, level: 12, survivedMs: 600000, at: at(2000), skill: 'iceSpear', wins: 0, seconds: 0, thirds: 0 },
    { name: 'OLD', emoji: '', flag: '', damage: 70000, level: 11, survivedMs: 590000, at: at(1000), skill: '', wins: 0, seconds: 0, thirds: 0 },
  ];
  const rows = [
    { entryId: 11, name: 'CHT', damage: 5000000, level: 20, survivedMs: 600000, at: board[0].at, skill: 'fireball', peers: 6, reference: 85000, ratio: 5000000 / 85000, outlier: true, detail },
    { entryId: 12, name: 'FIN', damage: 90000, level: 12, survivedMs: 600000, at: board[1].at, skill: 'iceSpear', peers: 6, reference: 85000, ratio: 90000 / 85000, outlier: false, detail: { ...detail, resumed: false } },
    { entryId: 13, name: 'OLD', damage: 70000, level: 11, survivedMs: 590000, at: board[2].at, skill: '', peers: 1, reference: null, ratio: null, outlier: false, detail: null },
  ];
  const state = { removed: [] };
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.__realFetch ??= window.fetch;
  window.fetch = async (url, init) => {
    const path = String(url);
    if (path === R.shared.url) return reply({ entries: board });
    if (path === '/api/ranking/me') return reply({ best: null, place: 0 });
    if (path === '/api/ranking/review') return reply({ rule: R.review, rows });
    if (path === '/api/ranking/remove' && init?.method === 'POST') {
      const { entryId } = JSON.parse(init.body);
      state.removed.push(entryId);
      const i = rows.findIndex((r) => r.entryId === entryId);
      if (i >= 0) {
        board.splice(board.findIndex((b) => b.at === rows[i].at), 1);
        rows.splice(i, 1);
      }
      return reply({ ok: true, entries: board });
    }
    return reply({ error: 'not found' }, 404);
  };
  window.__review = state;
  R.shared.enabled = true;
  return 1;
})()`;
const UNDO = `(() => { window.fetch = window.__realFetch; window.config.RANKING.shared.enabled = false; return 1; })()`;

await ev(STAND_IN);
await scene('MenuScene', `s.icons.press('ranking'); return 1;`);
await sleep(1200);
const marked = await scene('RankingScene', `
  const C = window.config.COLORS;
  const rowOf = (name) => s.rows.find((r) => r[1].text.startsWith(name));
  return {
    size: s.review.size,
    cht: rowOf('CHT')?.[1].style.color, fin: rowOf('FIN')?.[1].style.color, red: C.suspectText,
    hits: s.board.list.filter((o) => o.name === 'reviewRow').length,
    note: s.note.text,
  };
`);
console.log('review marks:', JSON.stringify(marked));
check('the admin sees the review: an outlier in red, the rest as they were, every row open to reading',
  marked.size === 3 && marked.cht === marked.red && marked.fin !== marked.red && marked.hits === 3 && /이상치 1건/.test(marked.note),
  JSON.stringify(marked));
await shot('ranking-04-review');

// Pressing the row opens its 판 내역.
const reviewOpen = await scene('RankingScene', `
  const hit = s.board.list.filter((o) => o.name === 'reviewRow')[0];
  hit.emit('pointerdown');
  return { open: !!s.popup, who: s.reading?.name, text: s.popupText?.text ?? '' };
`);
console.log('popup:', JSON.stringify(reviewOpen));
check('a row pressed opens what the run said about itself: how it stands, version, kills, 우두머리, 뼈다귀, weapon, skills, 재능 (패시브 before 0.110)',
  reviewOpen.open && reviewOpen.who === 'CHT' && /이상치/.test(reviewOpen.text) && /58\.8배|59배/.test(reviewOpen.text) &&
    /0\.62/.test(reviewOpen.text) && /abc123/.test(reviewOpen.text) && /우두머리 처치 3/.test(reviewOpen.text) &&
    /이어서/.test(reviewOpen.text) && /뼈다귀:/.test(reviewOpen.text) && /장비:/.test(reviewOpen.text) && /1티어/.test(reviewOpen.text) &&
    /Lv 30/.test(reviewOpen.text) && /재능:/.test(reviewOpen.text),
  reviewOpen.text.split('\n').join(' | '));
await shot('ranking-05-detail');

// Esc takes the popup down, not the screen.
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(300);
const escaped = await scene('RankingScene', `return { open: !!s.popup, active: s.scene.isActive() };`);
check('Esc closes the popup and leaves the board up', !escaped.open && escaped.active, JSON.stringify(escaped));

// A run handed in before there was a 판 내역 says so.
const bare = await scene('RankingScene', `
  s.openReview(s.review.get([...s.review.keys()].find((k) => s.review.get(k).name === 'OLD')));
  const text = s.popupText.text;
  s.closeReview();
  return text;
`);
check('a run from before this says it has no 판 내역, and that there was too little to compare it with',
  /판 내역 없음/.test(bare) && /비교할 기록 부족/.test(bare), bare.split('\n').join(' | '));

// 기록 삭제 asks first; backing out leaves the run where it is.
const askedTwice = await scene('RankingScene', `
  const row = [...s.review.values()].find((r) => r.name === 'CHT');
  s.openReview(row);
  s.askRemove();
  const first = { confirm: !!s.confirmBox, removed: window.__review.removed.length };
  s.cancelRemove();
  return { ...first, afterCancel: { confirm: !!s.confirmBox, popup: !!s.popup, removed: window.__review.removed.length } };
`);
check('기록 삭제 asks again before anything happens, and 취소 backs out with the run still there',
  askedTwice.confirm && askedTwice.removed === 0 && !askedTwice.afterCancel.confirm && askedTwice.afterCancel.popup && askedTwice.afterCancel.removed === 0,
  JSON.stringify(askedTwice));
await scene('RankingScene', `s.askRemove(); return 1;`);
await shot('ranking-06-confirm');
await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(300);
const escAsk = await scene('RankingScene', `return { confirm: !!s.confirmBox, popup: !!s.popup, removed: window.__review.removed.length };`);
check('Esc on the second ask backs out of it alone', !escAsk.confirm && escAsk.popup && escAsk.removed === 0, JSON.stringify(escAsk));

const removed = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  const s = window.game.scene.getScene('RankingScene');
  s.askRemove();
  await s.confirmRemove();
  return { removed: window.__review.removed, popup: !!s.popup, confirm: !!s.confirmBox,
           names: s.rows.map((r) => r[1].text), note: s.note.text, review: s.review.size };
})()` });
const rm = removed.result?.result?.value ?? {};
console.log('removed:', JSON.stringify(rm));
check('삭제 takes that run off: the server is asked for it by its entry, and the board comes back without it',
  JSON.stringify(rm.removed) === '[11]' && !rm.popup && !rm.confirm && !rm.names?.some((n) => n.startsWith('CHT')) &&
    rm.names?.some((n) => n.startsWith('FIN')) && rm.review === 2 && /삭제했습니다/.test(rm.note ?? ''),
  JSON.stringify(rm));
await scene('RankingScene', `s.backButton.press(); return 1;`);
await sleep(400);
await ev(UNDO);

// The same popup and its ask, in another language, with nothing Korean left on them.
// Only while a language can be chosen (LOCALE.choosable): until the official
// release the game is Korean only and the per-language checks wait (the user's word).
if (await ev(`(() => window.config.LOCALE.choosable)()`)) {
  await ev(`(() => { localStorage.setItem('exiled-survivors:settings:v1', JSON.stringify({ language: 'en' })); return 1; })()`);
  await cdp.send('Page.reload', {});
  await sleep(4500);
  await ev(STAND_IN);
  await scene('MenuScene', `s.icons.press('ranking'); return 1;`);
  await sleep(1200);
  const english = await scene('RankingScene', `
    const row = [...s.review.values()].find((r) => r.name === 'CHT');
    s.openReview(row);
    const detail = s.popupText.text;
    s.askRemove();
    const texts = [...s.popup.list, ...s.confirmBox.list].filter((o) => typeof o.text === 'string').map((o) => o.text);
    s.closeReview();
    return { detail, texts, note: s.note.text };
  `);
  const hangul = [...(english.texts ?? []), english.note ?? ''].filter((line) => /[가-힣]/.test(line));
  check('in English the review, its popup and its ask carry no Korean',
    english.texts?.length > 4 && hangul.length === 0 && /Outlier/.test(english.detail ?? ''),
    hangul.join(' | ') || english.detail?.split('\n')[0]);
  await scene('RankingScene', `s.backButton.press(); return 1;`);
  await sleep(300);
  await ev(UNDO);
  await ev(`(() => { localStorage.setItem('exiled-survivors:settings:v1', JSON.stringify({ language: 'ko' })); return 1; })()`);
}

// --- 11. 어제의 랭킹: the day before's first three, over the title, once a day ---
await cdp.send('Page.reload', {});
await sleep(4500);
const PODIUM_STAND_IN = `(() => {
  const R = window.config.RANKING;
  const DAY = 86400000, shift = (R.dailyReset.utcOffsetHours - R.dailyReset.hour) * 3600000;
  const today = Math.floor((Date.now() + shift) / DAY) * DAY - shift;
  const asked = { podium: 0, seen: 0 };
  const entry = (name, damage, flag, skill) =>
    ({ name, emoji: '', flag, damage, level: 20, survivedMs: 800000, at: new Date(today - 1000).toISOString(), skill, wins: 1, seconds: 0, thirds: 0 });
  const reply = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  window.__realFetch ??= window.fetch;
  window.fetch = async (url, init) => {
    const path = String(url);
    if (path === R.shared.podiumUrl) {
      asked.podium += 1;
      return reply({ day: today - DAY, entries: [entry('ONE', 3000000, 'KR', 'fireball'), entry('TWO', 2000000, 'US', 'iceSpear'), entry('THR', 1000000, '', '')] });
    }
    if (path === R.shared.podiumUrl + '/seen') { asked.seen += 1; return reply({ ok: true }); }
    if (path === R.shared.podiumUrl + '/me') {
      return reply({ day: today - DAY, total: 35, mine: { place: 12, damage: 1234567, level: 15, survivedMs: 500000 } });
    }
    if (path === R.shared.url) return reply({ entries: [] });
    return reply({ error: 'not found' }, 404);
  };
  window.__podium = { asked, today, since: R.shared.podiumSince };
  localStorage.removeItem('exiled-survivors:podium-seen:v1');
  window.podium.asked = false;
  R.shared.enabled = true;
  // Before the first day it covers, nothing is shown — nor asked for.
  R.shared.podiumSince = today;
  return 1;
})()`;
const BEFORE_SINCE = `(async () => {
  await window.game.scene.getScene('MenuScene').showPodium();
  await new Promise((r) => setTimeout(r, 300));
  const out = { open: window.game.scene.isActive('PodiumScene'), asked: window.__podium.asked.podium };
  window.config.RANKING.shared.podiumSince = 0;
  window.podium.asked = false;
  return out;
})()`;
await ev(PODIUM_STAND_IN);
const early = (await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: BEFORE_SINCE })).result?.result?.value ?? {};
check('a day from before the popup’s first one is never shown, nor asked for',
  early.open === false && early.asked === 0, JSON.stringify(early));
const first = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  await window.game.scene.getScene('MenuScene').showPodium();
  await new Promise((r) => setTimeout(r, 600));
  const s = window.game.scene.getScene('PodiumScene');
  return { open: window.game.scene.isActive('PodiumScene'), names: s.names.map((n) => n.text),
           mine: s.mineLine?.text ?? '',
           menuPaused: window.game.scene.isPaused('MenuScene'), asked: { ...window.__podium.asked } };
})()` });
const fp = first.result?.result?.value ?? {};
console.log('podium:', JSON.stringify(fp));
check('the first visit to the title after the reset shows the day before’s first, second and third, in order',
  fp.open && JSON.stringify(fp.names) === '["ONE","TWO","THR"]' && fp.menuPaused && fp.asked?.podium === 1,
  JSON.stringify(fp));
check('signed out, the line under them says signing in shows your own place',
  /로그인하면 내 순위/.test(fp.mine ?? ''), fp.mine);
await shot('ranking-07-podium');
const closed = await scene('PodiumScene', `s.okPlate.emit('pointerdown'); return 1;`);
void closed;
await sleep(400);
const after = await ev(`(() => ({ open: window.game.scene.isActive('PodiumScene'), menu: window.game.scene.isActive('MenuScene'),
  stored: localStorage.getItem('exiled-survivors:podium-seen:v1'), today: window.__podium.today }))()`);
check('확인 closes it, back on the title, and it is marked seen for today',
  !after.open && after.menu && after.stored === String(after.today), JSON.stringify(after));
const again = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  window.podium.asked = false;
  await window.game.scene.getScene('MenuScene').showPodium();
  await new Promise((r) => setTimeout(r, 400));
  return { open: window.game.scene.isActive('PodiumScene'), asked: { ...window.__podium.asked } };
})()` });
const ag = again.result?.result?.value ?? {};
check('seen once, it is not shown again that day — nor even asked for',
  ag.open === false && ag.asked?.podium === 1, JSON.stringify(ag));
const elsewhere = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  localStorage.removeItem('exiled-survivors:podium-seen:v1');
  window.podium.asked = false;
  window.account.user = { id: 'u', provider: 'test', name: 'u', rank: { name: '', emoji: '', flag: '' }, podiumSeen: window.__podium.today };
  await window.game.scene.getScene('MenuScene').showPodium();
  await new Promise((r) => setTimeout(r, 400));
  const out = { open: window.game.scene.isActive('PodiumScene'), asked: { ...window.__podium.asked } };
  window.account.user = null;
  return out;
})()` });
const el = elsewhere.result?.result?.value ?? {};
check('nor to an account that has seen it on another device today',
  el.open === false && el.asked?.podium === 1, JSON.stringify(el));
// Signed in and not seen yet: the account's own place is under the three.
const ownPlace = await cdp.send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  localStorage.removeItem('exiled-survivors:podium-seen:v1');
  window.podium.asked = false;
  window.account.user = { id: 'u', provider: 'test', name: 'u', rank: { name: '', emoji: '', flag: '' }, podiumSeen: 0 };
  await window.game.scene.getScene('MenuScene').showPodium();
  await new Promise((r) => setTimeout(r, 500));
  const s = window.game.scene.getScene('PodiumScene');
  const out = { open: window.game.scene.isActive('PodiumScene'), mine: s.mineLine?.text ?? '' };
  s.close();
  await new Promise((r) => setTimeout(r, 300));
  out.seenPosted = window.__podium.asked.seen;
  window.account.user = null;
  return out;
})()` });
const op = ownPlace.result?.result?.value ?? {};
console.log('own place:', JSON.stringify(op));
check('signed in, it shows the account’s own place that day out of everyone, with its damage — and tells the account it was seen',
  op.open && /12위/.test(op.mine) && /35명/.test(op.mine) && /1,234,567/.test(op.mine) && op.seenPosted === 1,
  JSON.stringify(op));
await ev(`(() => { window.fetch = window.__realFetch; window.config.RANKING.shared.enabled = false;
  window.config.RANKING.shared.podiumSince = window.__podium.since; return 1; })()`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
