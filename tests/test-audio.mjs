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

// --- 1. one clip per tier (0.111's ladder), every one decoded ---
const loaded = await run(`
  const drops = window.config.AUDIO.drops;
  return ['normal', 'magic', 'rare', 'mythic'].map((tier) => {
    const clip = drops[tier];
    const entry = clip ? s.cache.audio.get(clip.key) : null;
    return {
      tier,
      key: clip ? clip.key : null,
      file: clip ? clip.file : null,
      inCache: clip ? s.cache.audio.exists(clip.key) : null,
      duration: entry && entry.duration ? Number(entry.duration.toFixed(2)) : null,
    };
  });
`);
console.log('clips:', JSON.stringify(loaded));
const clipOf = (tier) => loaded.find((c) => c.tier === tier);
const voiced = loaded.filter((c) => c.key);
check('일반, 마법, 희귀 and 신화 each have a clip of their own',
  voiced.length === 4 && new Set(voiced.map((c) => c.key)).size === 4,
  loaded.map((c) => `${c.tier}:${c.key}`).join(' / '));
check('every one is in the audio cache, decoded',
  voiced.every((c) => c.inCache && c.duration > 0),
  voiced.map((c) => `${c.tier} ${c.duration}s`).join(' / '));
// The 희귀 one is the hit and the swell behind it, mixed into one file.
check('the 희귀 clip is the longer, mixed one',
  clipOf('rare').duration > clipOf('magic').duration && clipOf('rare').duration > 3,
  `${clipOf('rare').duration}s against ${clipOf('magic').duration}s for 마법`);

// --- 2. the files resolve under the configured base ---
// `cdp.evaluate` cannot await a promise, so the files are fetched from here.
const urls = [];
for (const { file } of voiced) {
  const res = await fetch(`http://localhost:5173/${file}`);
  const body = await res.arrayBuffer();
  urls.push({ file, status: res.status, type: res.headers.get('content-type'), bytes: body.byteLength });
}
console.log('fetch:', JSON.stringify(urls));
check('each one is served as audio, not as the index page',
  urls.every((u) => u.status === 200 && /audio|mpeg/.test(u.type ?? '') && u.bytes > 4000),
  urls.map((u) => `${u.file} ${u.status} ${u.type} ${u.bytes}B`).join(' / '));

// --- 3. a skill lands on 일반's clip; a 혼돈의 구슬 (신화) on the loudest ---
const plain = await run(`
  window.__plays = [];
  const mgr = s.sound;
  const orig = mgr.play.bind(mgr);
  mgr.play = (key, cfg) => { window.__plays.push({ key, cfg }); return orig(key, cfg); };

  s.combat.dropSkillAt(s.player.x + 300, s.player.y,
    { id: 'fireball', name: '화염구', tags: [] });
  const afterSkill = window.__plays.length;
  s.combat.dropOrbAt(s.player.x + 320, s.player.y, 'chaos');

  const calls = window.__plays.slice();
  mgr.play = orig;
  s.combat.orbDrops.getChildren().forEach(d => d.active && d.collect());
  return { afterSkill, calls, tier: window.config.ORBS.chaos.tier };
`);
console.log('plain drops:', JSON.stringify(plain));
check('a skill (일반) lands on the 일반 clip',
  plain.afterSkill === 1 && plain.calls[0]?.key === clipOf('normal').key, JSON.stringify(plain.calls.map((c) => c.key)));
// Its nameplate is the 신화 one, so its sound is the 신화 one: the ear and
// the eye are told the same thing about the same object on the floor.
check('a 혼돈의 구슬 sounds as rare as it is labelled',
  plain.calls.length === 2 && plain.calls[1].key === clipOf(plain.tier).key, JSON.stringify(plain.calls.map((c) => c.key)));

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
check('a sword with nothing on it, or one 속성, lands on the 일반 clip',
  forLines(0).calls[0] === clipOf('normal').key && forLines(1).calls[0] === clipOf('normal').key,
  `${forLines(0).calls.join(' ')} / ${forLines(1).calls.join(' ')}`);
// 0.91's ladder: 2 속성 마법, 3–4 희귀, 5–6 신화 — each with its own clip since 0.111.
check('two sound like 마법, three or four like 희귀, five or six like 신화',
  forLines(2).calls[0] === clipOf('magic').key && forLines(3).calls[0] === clipOf('rare').key &&
    forLines(5).calls[0] === clipOf('mythic').key,
  `${forLines(2).calls[0]} / ${forLines(3).calls[0]} / ${forLines(5).calls[0]}`);
check('and a drop is one clip rather than two played together',
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
// A pinned roll drops one of everything until Phaser's new Text trips on the
// pinned Math.random (CLAUDE.md) — so this reads what landed before that:
// heard, and only ever on a clip some tier owns.
const dropCalls = (viaKill.calls ?? []).filter((key) => key.startsWith('sfx-drop-'));
check('a killed enemy’s drops go through the same ladder',
  dropCalls.length > 0 && dropCalls.every((key) => voiced.some((c) => c.key === key)),
  `calls=${JSON.stringify(viaKill.calls)}${viaKill.err ? ' (then ' + viaKill.err + ')' : ''}`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
