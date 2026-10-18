import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 키메라 — hops like a 기행종, throws the 우두머리's ring as white thorns,
// has the 우두머리's health, cannot be frozen, and has sounds of its own —
// and 키메라 러시: at CHIMERA_RUSH.atMs the screen shakes, the field empties,
// and from then on only 키메라 come, out of the middle of the world.

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
const run = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(800);
await cdp.evaluate(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. the kind ---
const kind = await run(`
  s.player.setInvulnerable(true);
  s.spawner.clear();
  s.weapons.length = 0;
  const c = window.config.ENEMY_KINDS.chimera, b = window.config.ENEMY_KINDS.boss, e = window.config.ENEMY_KINDS.erratic;
  const p = s.player;
  const chimera = s.spawner.group.get(p.x, p.y);
  chimera.spawn(p.x + 200, p.y, p, 'chimera', s.spawner.hooks, false, 1);
  const boss = s.spawner.group.get(p.x, p.y);
  boss.spawn(p.x - 300, p.y, p, 'boss', s.spawner.hooks, false, 1);
  const out = {
    hp: chimera.maxHp, bossHp: boss.maxHp,
    texture: chimera.texture.key, wanted: c.texture,
    hopShape: JSON.stringify(Object.keys(c.hop).sort()) === JSON.stringify(Object.keys(e.hop).sort()),
    volley: JSON.stringify({ ...c.volley, texture: undefined }) === JSON.stringify({ ...b.volley, texture: undefined }),
    thorn: c.volley.texture,
    tableHas: window.config.SPAWN_TABLE.some((r) => r.kind === 'chimera'),
  };
  chimera.freeze(3000);
  out.frozen = chimera.isFrozen;
  boss.recycle();
  window.__chimera = chimera;
  window.__hops = 0;
  window.__hopTimer = setInterval(() => { if (window.__chimera.isHopping) window.__hops++; }, 16);
  return out;
`);
console.log('kind:', JSON.stringify(kind));
check('a 키메라 has the 우두머리’s health', kind.hp === kind.bossHp, `${kind.hp} vs ${kind.bossHp}`);
check('it is drawn as itself', kind.texture === kind.wanted);
check('its hop is a 기행종’s, and its ring is the 우두머리’s', kind.hopShape && kind.volley);
check('it is not in the spawn table', kind.tableHas === false);
check('얼음창’s freeze does not take on it', kind.frozen === false);

await sleep(1500);
const moving = await run(`
  clearInterval(window.__hopTimer);
  const e = window.__chimera;
  // Its ring, now.
  s.combat.enemyShots.getChildren().forEach((x) => x.active && x.despawn());
  // One frame of its own, here and now: a pointer resting on it would hold
  // the arena (reading a rare), and the loop would never get to it.
  e.volleyCooldownMs = 0;
  e.update(0, 16);
  return { hops: window.__hops, alive: e.active };
`);
const ring = await run(`
  const shots = s.combat.enemyShots.getChildren().filter((x) => x.active);
  return { count: shots.length, textures: [...new Set(shots.map((x) => x.texture.key))],
           wanted: window.config.ENEMY_KINDS.chimera.volley.count, thorn: window.config.TEXTURES.thorn };
`);
await shot('chimera-ring');
check('it hops about', moving.alive && moving.hops > 5, `${moving.hops} frames in the air`);
check('it throws the full ring, as white thorns', ring.count >= ring.wanted && ring.textures.length === 1 &&
  ring.textures[0] === ring.thorn, `${ring.count} of ${ring.wanted}: ${ring.textures.join(',')}`);

// A plain bolt after a thorn is the plain square again (the pool is shared).
const plain = await run(`
  s.combat.enemyShots.getChildren().forEach((x) => x.active && x.despawn());
  const spec = window.config.ENEMY_KINDS.shooter.shot;
  s.combat.fireEnemyShot(s.player.x + 300, s.player.y, 0, spec);
  const shots = s.combat.enemyShots.getChildren().filter((x) => x.active);
  return shots.map((x) => x.texture.key);
`);
check('a 사수’s bolt from the same pool is still the plain bolt', plain.length > 0 &&
  plain.every((k) => k === 'tex-enemy-shot'), plain.join(','));

// --- 2. its sounds ---
const sounds = await run(`
  const parts = window.config.AUDIO.enemies.chimera;
  const loaded = Object.entries(parts).flatMap(([part, sound]) =>
    sound.files.map((_, i) => s.cache.audio.exists('sfx-enemy-chimera-' + part + '-' + i)));
  const played = [];
  const real = s.sound.play.bind(s.sound);
  s.sound.play = (key, cfg) => { played.push(key); return real(key, cfg); };
  window.__played = played;
  window.__realPlay = real;
  const p = s.player;
  const e = s.spawner.group.get(p.x, p.y);
  e.spawn(p.x + 150, p.y + 150, p, 'chimera', s.spawner.hooks, false, 1);
  window.__second = e;
  return { loaded, all: loaded.length > 0 && loaded.every(Boolean), castGap: parts.cast.gapMs ?? 0 };
`);
// Past the rest the first one's ring left, then its own ring.
await sleep(sounds.castGap + 100);
await run(`window.__second.volleyCooldownMs = 0; return 1;`);
await sleep(300);
const heard = await run(`
  const e = window.__second;
  s.combat.hit(e, e.hp + 1);
  // Its gem is worth levels: left lying, it would stop the run on a card.
  s.combat.gems.getChildren().forEach((g) => g.active && g.disableBody(true, true));
  const played = [...window.__played];
  s.sound.play = window.__realPlay;
  return played;
`);
console.log('heard:', JSON.stringify(heard));
check('every sound it has is loaded', sounds.all, `${sounds.loaded.length} files`);
check('it is heard walking in, throwing its ring and dying',
  ['appear', 'cast', 'death'].every((part) => heard.some((k) => k.startsWith('sfx-enemy-chimera-' + part))),
  heard.join(', '));

// --- 3. 키메라 러시 ---
const before = await run(`
  s.spawner.clear();
  delete s.spawner.update;
  const R = window.config.CHIMERA_RUSH;
  s.spawner.elapsedMs = R.atMs - 400;
  s.elapsedMs = R.atMs - 400;
  s.spawner.spawnBurst(12);
  return { alive: s.spawner.alive, inRush: s.spawner.inRush, choosing: s.choosing };
`);
await sleep(900);
const rushed = await run(`
  const kinds = Object.entries(s.spawner.aliveByKind).filter(([, n]) => n > 0);
  const W = window.config.WORLD;
  const chimeras = s.spawner.group.getChildren().filter((e) => e.active && e.kind === 'chimera');
  return { inRush: s.spawner.inRush, kinds, shaking: s.cameras.main.shakeEffect.isRunning,
           toast: s.toasts.lines.some((l) => l.includes(window.__i18nRush ?? '')),
           nearMiddle: chimeras.every((e) => Math.hypot(e.x - W.width / 2, e.y - W.height / 2) < 400),
           chimeras: chimeras.length };
`);
console.log('rush:', JSON.stringify({ before, rushed }));
check('just before the minute, the field is as it was', before.alive >= 12 && before.inRush === false && !before.choosing);
check('at the minute everything else is gone, and a 키메라 is out', rushed.inRush &&
  rushed.kinds.length === 1 && rushed.kinds[0][0] === 'chimera' && rushed.chimeras === 1,
  JSON.stringify(rushed.kinds));
check('the screen shakes', rushed.shaking === true);
check('it comes out of the middle of the world', rushed.nearMiddle);
await shot('chimera-rush');

const later = await run(`
  window.__killedBefore = s.stats.killsByKind?.chimera ?? 0;
  return window.config.CHIMERA_RUSH.intervalMs;
`);
await sleep(later + 800);
const after = await run(`
  const kinds = Object.entries(s.spawner.aliveByKind).filter(([, n]) => n > 0).map(([k]) => k);
  return { kinds, chimeras: s.spawner.aliveByKind.chimera };
`);
check('one more every interval, and nothing else', after.chimeras >= 2 && after.kinds.length === 1,
  `${after.chimeras} 키메라 after ${later}ms; kinds ${after.kinds.join(',')}`);

// A run saved during the rush resumes in it, with no shake.
const resumed = await run(`
  s.spawner.clear();
  const R = window.config.CHIMERA_RUSH;
  s.spawner.seed(R.atMs + 60_000);
  return { inRush: s.spawner.inRush };
`);
check('a run resumed past the minute is back in the rush', resumed.inRush === true);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
