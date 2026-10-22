import { connect, sleep } from './cdp-lib.mjs';

const cdp = await connect(9333);
const results = [];
const check = (n, p, d = '') => {
  results.push({ n, p });
  console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
};
const run = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. one clip per rarity, all three served and decoded ---
const loaded = await run(`
  const keys = ['sfx-drop-normal', 'sfx-drop-magic', 'sfx-drop-rare'];
  return keys.map((key) => {
    const entry = s.cache.audio.get(key);
    return {
      key,
      inCache: s.cache.audio.exists(key),
      duration: entry && entry.duration ? Number(entry.duration.toFixed(2)) : null,
    };
  });
`);
console.log('clips:', JSON.stringify(loaded));
check('a clip for each rarity is in the audio cache',
  loaded.every((c) => c.inCache), loaded.filter((c) => !c.inCache).map((c) => c.key).join(' / '));
check('and every one of them decoded',
  loaded.every((c) => c.duration && c.duration > 0),
  loaded.map((c) => `${c.key.replace('sfx-drop-', '')} ${c.duration}s`).join(' / '));
// The rare one is the hit and the swell behind it, mixed into one file.
check('the rare clip is the longer, mixed one',
  loaded[2].duration > loaded[0].duration && loaded[2].duration > 3,
  `${loaded[2].duration}s against ${loaded[0].duration}s for an ordinary drop`);

// --- 2. the files resolve under the configured base ---
// `cdp.evaluate` cannot await a promise, so the files are fetched from here.
const urls = [];
for (const file of ['normalDrop.mp3', 'magicDrop.mp3', 'rareDrop.mp3']) {
  const res = await fetch(`http://localhost:5173/assets/${file}`);
  const body = await res.arrayBuffer();
  urls.push({ file, status: res.status, type: res.headers.get('content-type'), bytes: body.byteLength });
}
console.log('fetch:', JSON.stringify(urls));
check('each one is served as audio, not as the index page',
  urls.every((u) => u.status === 200 && /audio|mpeg/.test(u.type ?? '') && u.bytes > 4000),
  urls.map((u) => `${u.file} ${u.status} ${u.type} ${u.bytes}B`).join(' / '));

// --- 3. a skill and a 신성한 조각 land on the ordinary clip ---
const plain = await run(`
  window.__plays = [];
  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  mgr.play = (key, cfg) => { window.__plays.push({ key, cfg }); return orig(key, cfg); };

  s.combat.dropSkillAt(s.player.x + 300, s.player.y,
    { id: 'fireball', name: '화염구', tags: [] });
  s.combat.dropOrbAt(s.player.x + 320, s.player.y, 'chaos');

  const calls = window.__plays.slice();
  mgr.play = orig;
  s.combat.orbDrops.getChildren().forEach(d => d.active && d.collect());
  return { calls };
`);
console.log('plain drops:', JSON.stringify(plain.calls));
check('a skill lands on the ordinary clip',
  plain.calls[0]?.key === 'sfx-drop-normal', `key=${plain.calls[0]?.key}`);
// Its nameplate is the 희귀 one, so its sound is the 희귀 one: the ear and
// the eye are told the same thing about the same object on the floor.
check('a 혼돈의 구슬 sounds as rare as it is labelled',
  plain.calls[1]?.key === 'sfx-drop-rare', `key=${plain.calls[1]?.key}`);
check('at the configured volume', plain.calls[0]?.cfg?.volume === 0.55,
  `volume=${plain.calls[0]?.cfg?.volume}`);

// --- 4. a weapon sounds like how rare it came out ---
const byRarity = await run(`
  const weapon = (prefixes, suffixes) => ({ uid: 'probe', id: 'ironSword', prefixes, suffixes });
  const cases = [
    { lines: 0, item: weapon([], []) },
    { lines: 1, item: weapon(['mighty'], []) },
    { lines: 2, item: weapon(['mighty'], ['swift']) },
    { lines: 3, item: weapon(['mighty', 'frenzied'], ['swift']) },
    { lines: 5, item: weapon(['mighty', 'frenzied', 'cruel'], ['swift', 'giant']) },
  ];

  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  const out = [];
  for (const one of cases) {
    window.__plays = [];
    mgr.play = (key, cfg) => { window.__plays.push(key); return orig(key, cfg); };
    s.combat.dropGearAt(-900, -900, one.item);
    out.push({ lines: one.lines, calls: window.__plays.slice() });
  }
  mgr.play = orig;
  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
  return { out };
`);
console.log('by rarity:', JSON.stringify(byRarity.out));
const forLines = (lines) => byRarity.out.find((o) => o.lines === lines);
check('a sword with nothing on it sounds ordinary',
  forLines(0).calls[0] === 'sfx-drop-normal', forLines(0).calls.join(' '));
// 0.91: 2 속성 마법, 3–4 희귀 (마법's clip), 5–6 신화 (the loud one 희귀 had).
check('one 속성 still sounds ordinary, two like a magic drop',
  forLines(1).calls[0] === 'sfx-drop-normal' && forLines(2).calls[0] === 'sfx-drop-magic',
  `${forLines(1).calls[0]} / ${forLines(2).calls[0]}`);
check('three or four (희귀) lands with the magic clip',
  forLines(3).calls[0] === 'sfx-drop-magic', forLines(3).calls[0]);
check('five or six (신화) sounds like the loudest, swell and all',
  forLines(5).calls[0] === 'sfx-drop-rare', forLines(5).calls[0]);
check('and a rare drop is one clip rather than two played together',
  byRarity.out.every((o) => o.calls.length === 1),
  byRarity.out.map((o) => `${o.lines}:${o.calls.length}`).join(' '));

// --- 5. picking a skill up must NOT play it again ---
const onPickup = await run(`
  window.__plays = [];
  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  mgr.play = (key, cfg) => { window.__plays.push({ key, cfg }); return orig(key, cfg); };
  const drop = s.combat.skillDrops.getChildren().find(d => d.active);
  if (drop) { drop.collect(); s.onSkillCollected('fireball'); }
  const calls = window.__plays.slice();
  mgr.play = orig;
  return { calls: calls.length };
`);
check('pickup does not retrigger the drop sound', onPickup.calls === 0, `calls=${onPickup.calls}`);
await sleep(500);
await cdp.tap('Space', 32, ' ');
await sleep(400);

// --- 6. a real roll goes through the same path ---
// On a live run: a kill now makes a 구슬 and a 뼈다귀 drop as well, and a
// drop built on a scene that has already stopped cannot make its nameplate.
await cdp.evaluate(`(() => {
  for (const key of ['GameOverScene', 'UpgradeScene', 'PauseScene', 'BoneScene']) {
    window.game.scene.getScene(key)?.scene.stop();
  }
  window.game.scene.getScene('GameScene').scene.start('GameScene', { save: null });
  return 1;
})()`);
// Wait for it to actually be running: a drop built on a stopped scene cannot
// make its nameplate, and a kill now makes three of them.
for (let i = 0; i < 20; i++) {
  const live = await cdp.evaluate(`(() => ({
    on: window.game.scene.isActive('GameScene'),
    ready: !!window.game.scene.getScene('GameScene').combat,
  }))()`);
  if (live.on && live.ready) break;
  await sleep(400);
}
await sleep(600);
const viaKill = await run(`
  window.__plays = [];
  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  mgr.play = (key, cfg) => { window.__plays.push(key); return orig(key, cfg); };
  const realRandom = Math.random;
  Math.random = () => 0;
  let err = null;
  try {
    s.spawner.clear();
    s.spawner.spawnBurst(1);
    const enemy = s.spawner.group.getChildren().find(e => e.active);
    s.combat.hit(enemy, 9999);
  } catch (e) { err = String(e); }
  Math.random = realRandom;
  const calls = window.__plays.slice();
  mgr.play = orig;
  return { calls, err };
`);
check('a killed enemy dropping a skill plays it too',
  (viaKill.calls ?? []).includes('sfx-drop-normal'),
  viaKill.err ?? `calls=${JSON.stringify(viaKill.calls)}`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
