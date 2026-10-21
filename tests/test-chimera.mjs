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
  // Counted in the same breath it is thrown: a frame later a shot that met
  // the survivor is already gone.
  const shots = s.combat.enemyShots.getChildren().filter((x) => x.active);
  window.__ring = { count: shots.length, textures: [...new Set(shots.map((x) => x.texture.key))],
           wanted: window.config.ENEMY_KINDS.chimera.volley.count, thorn: window.config.TEXTURES.thorn };
  return { hops: window.__hops, alive: e.active };
`);
const ring = await run(`return window.__ring;`);
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

// --- 3. 키메라 on their own clock (0.85; a 14-minute rush before) ---
// The scene's own loop is held (choosing), and the spawner stepped by hand.
const clock = await run(`
  s.choosing = true;
  s.player.setInvulnerable(true);
  s.spawner.clear();
  const C = window.config.CHIMERA;
  const step = (ms) => { for (let t = 0; t < ms; t += 50) s.spawner.update(50); };
  const chimeras = () => s.spawner.group.getChildren().filter((e) => e.active && e.kind === 'chimera');
  s.spawner.seed(C.firstMs - 400);
  step(300);
  const before = { chimeras: chimeras().length, alive: s.spawner.alive };
  step(200);
  const first = chimeras();
  const cam = s.cameras.main, p = s.player;
  const offscreen = first.every((e) => Math.hypot(e.x - p.x, e.y - p.y) > Math.hypot(cam.width, cam.height) / 2 - 40);
  const toast = s.toasts.lines.some((l) => /키메라 등장/.test(l));
  step(C.intervalMs);
  const second = chimeras().length;
  const others = Object.entries(s.spawner.aliveByKind).filter(([k, n]) => k !== 'chimera' && n > 0).length;
  s.spawner.seed(C.firstMs + 30_000);
  const resumedNext = s.spawner.nextChimeraMs;
  s.spawner.seed(C.firstMs - 60_000);
  const earlyNext = s.spawner.nextChimeraMs;
  return { C, before, first: first.length, offscreen, toast, second, others, resumedNext, earlyNext };
`);
console.log('clock:', JSON.stringify(clock));
check('no 키메라 before CHIMERA.firstMs', clock.before.chimeras === 0, JSON.stringify(clock.before));
check('at it one comes, off screen like a 우두머리, and it is said', clock.first === 1 && clock.offscreen && clock.toast, JSON.stringify(clock));
check('one more every CHIMERA.intervalMs, while everything else goes on spawning', clock.second === 2 && clock.others > 0,
  `${clock.second} 키메라, ${clock.others} other kinds alive`);
check('a run resumed past it waits a full interval; one resumed before waits out the rest',
  clock.resumedNext === clock.C.intervalMs && clock.earlyNext === 60_000, JSON.stringify({ r: clock.resumedNext, e: clock.earlyNext }));
check('the 키메라 러시 is gone', await run(`return !('CHIMERA_RUSH' in window.config) && !('inRush' in s.spawner);`));
await shot('chimera-clock');

// --- 4. it always leaves a skill, and a 제단 can call one up ---
const prize = await run(`
  s.spawner.clear();
  s.combat.skillDrops.getChildren().forEach((d) => d.active && d.collect());
  const p = s.player;
  const e = s.spawner.group.get(p.x + 300, p.y);
  e.spawn(p.x + 300, p.y, p, 'chimera');
  s.combat.hit(e, 1e12);
  const dropped = s.combat.skillDrops.countActive(true);
  s.combat.skillDrops.getChildren().forEach((d) => d.active && d.collect());
  s.combat.gems.getChildren().forEach((g) => g.active && g.collect());
  const offer = window.config.ALTAR_OFFERS.chimera;
  return { dropped, guaranteed: window.config.ENEMY_KINDS.chimera.guaranteedSkill, offer };
`);
check('a 키메라 killed always leaves a skill', prize.dropped >= 1 && prize.guaranteed === true, JSON.stringify(prize));
check('a 제단 can offer one 키메라', prize.offer?.kind === 'chimera' && prize.offer.count === 1 && prize.offer.weight > 0, JSON.stringify(prize.offer));

// --- 5. a 제단's 키메라 arrives throwing its ring (0.86) ---
const arrival = await run(`
  s.spawner.clear();
  s.combat.enemyShots.getChildren().forEach((x) => x.active && x.despawn());
  const p = s.player;
  const came = s.spawner.summon(p.x + 400, p.y, 'chimera');
  const shots = s.combat.enemyShots.countActive(true);
  const out = { came, shots, want: window.config.ENEMY_KINDS.chimera.volley.count, flag: window.config.ALTAR_OFFERS.chimera.castOnArrival };
  s.combat.enemyShots.getChildren().forEach((x) => x.active && x.despawn());
  s.spawner.clear();
  return out;
`);
check('a 제단’s 키메라 arrives throwing its whole ring', arrival.came === 1 && arrival.flag === true && arrival.shots >= arrival.want, JSON.stringify(arrival));

// --- 6. at the cap the weakest makes room, but never one that always leaves a skill (0.86) ---
const cap = await run(`
  s.spawner.clear();
  const S = window.config.SPAWN, was = S.maxAlive;
  const p = s.player;
  const put = (kind, hp, dx) => { const e = s.spawner.group.get(p.x + dx, p.y + 500); e.spawn(p.x + dx, p.y + 500, p, kind); e.hp = hp; return e; };
  // The 우두머리 has the least health of all, and still stays.
  const boss = put('boss', 1, 0);
  const weak = put('grunt', 5, 40), mid = put('grunt', 50, 80), strong = put('grunt', 500, 120);
  S.maxAlive = s.spawner.alive;
  const before = s.spawner.alive;
  // The pool may hand the sprite just taken straight back as the newcomer:
  // each one's life count says whether it is still the same enemy.
  const lives = [boss, weak, mid, strong].map((e) => e.lives);
  const same = (e, i) => e.active && e.lives === lives[i];
  try {
    s.spawner.sinceSpawnMs = 0;
    s.spawner.update(s.spawner.intervalMs + 1);
  } finally {
    S.maxAlive = was;
  }
  const out = { before, after: s.spawner.alive, boss: same(boss, 0), weak: same(weak, 1), mid: same(mid, 2), strong: same(strong, 3) };
  s.spawner.clear();
  return out;
`);
check('a spawn at the cap takes the weakest ordinary enemy off and comes in — the count holds',
  cap.after === cap.before && cap.weak === false && cap.mid === true && cap.strong === true, JSON.stringify(cap));
check('a 우두머리 is never the one taken, however low its health', cap.boss === true, JSON.stringify(cap));

// --- 7. as big as a 우두머리, and posed: leaping mid-hop, casting as it throws (0.87) ---
const posed = await run(`
  s.spawner.clear();
  s.combat.enemyShots.getChildren().forEach((x) => x.active && x.despawn());
  const C = window.config, k = C.ENEMY_KINDS.chimera, b = C.ENEMY_KINDS.boss;
  const p = s.player;
  const e = s.spawner.group.get(p.x + 300, p.y);
  e.spawn(p.x + 300, p.y, p, 'chimera', s.spawner.hooks, false, 1);
  const out = { body: e.body.width, bossBody: b.size, shown: e.shownRadius * 2, bossShown: b.giant.drawn,
                picture: e.displayWidth };
  const tex = (pose) => C.enemyPose(k.texture, pose);
  e.volleyCooldownMs = 1e9;
  e.hopping = true; e.hopLeftMs = 1e6; e.castPoseMs = 0;
  e.update(0, 16);
  out.leap = e.texture.key === tex('leap');
  e.hopping = false; e.hopLeftMs = 1e6;
  e.update(0, 16);
  out.stand = e.texture.key === tex('stand');
  e.volleyCooldownMs = 0;
  e.update(0, 16);
  out.cast = e.texture.key === tex('cast');
  for (let i = 0; i < Math.ceil(k.poses.castMs / 40) + 2; i++) { e.volleyCooldownMs = 1e9; e.update(0, 40); }
  out.back = e.texture.key === tex('stand');
  s.combat.enemyShots.getChildren().forEach((x) => x.active && x.despawn());
  s.spawner.clear();
  return out;
`);
check('a 키메라 is hit and drawn at a 우두머리’s size', posed.body === posed.bossBody && posed.shown === posed.bossShown && posed.picture === posed.bossShown, JSON.stringify(posed));
check('it is drawn leaping mid-hop, standing at rest', posed.leap === true && posed.stand === true, JSON.stringify(posed));
check('it rears to cast as it throws its ring, and stands again after', posed.cast === true && posed.back === true, JSON.stringify(posed));

// --- 8. 알수없는 룬 (0.89): off a 키메라 only, at its chance; picked up, a line and nothing else ---
const rune = await run(`
  s.spawner.clear();
  const C = window.config, R = C.UNKNOWN_RUNE, was = R.chance;
  const p = s.player;
  const groundRunes = () => s.combat.unknownRuneDrops.getChildren().filter((d) => d.active);
  const killOne = (kind, dx) => {
    const e = s.spawner.group.get(p.x + dx, p.y + 300);
    e.spawn(p.x + dx, p.y + 300, p, kind, s.spawner.hooks, false, 1);
    s.combat.hit(e, 1e12);
  };
  groundRunes().forEach((d) => d.collect());
  const out = { from: R.from, chance: was };
  try {
    R.chance = 1;
    killOne('chimera', 0);
    out.fromChimera = groundRunes().length;
    groundRunes().forEach((d) => d.collect());
    killOne('grunt', 80);
    killOne('boss', 160);
    out.fromOthers = groundRunes().length;
    R.chance = 0;
    killOne('chimera', 240);
    out.atZero = groundRunes().length;
  } finally {
    R.chance = was;
  }
  // Each drop wears one of the old 룬 looks.
  s.combat.dropUnknownRuneAt(p.x + 300, p.y, 5);
  const one = groundRunes()[0];
  out.look = { look: one.look, texture: one.texture.key, want: C.unknownRuneTexture(5), name: one.nameplate.text?.text ?? one.nameplate.label?.text ?? null };
  out.looks = C.UNKNOWN_RUNE_LOOKS.length;
  // Picked up: the line over the survivor, and nothing about the survivor changes.
  const before = { hp: p.hp, max: p.maxHp, speed: p.moveSpeed ?? null, dmg: s.damageOf('meleeStrike'), cd: s.cooldownOf('meleeStrike'), owned: [...s.owned] };
  const said = [];
  const spawn = s.damageNumbers.spawn.bind(s.damageNumbers);
  s.damageNumbers.spawn = (x, y, a, st) => { if (st?.text) said.push(st.text); return spawn(x, y, a, st); };
  s.combat.onUnknownRuneTouch(p, one);
  s.damageNumbers.spawn = spawn;
  const after = { hp: p.hp, max: p.maxHp, speed: p.moveSpeed ?? null, dmg: s.damageOf('meleeStrike'), cd: s.cooldownOf('meleeStrike'), owned: [...s.owned] };
  out.said = said;
  out.unchanged = JSON.stringify(before) === JSON.stringify(after);
  out.taken = !one.active;
  // A 자석 takes it like any other loot.
  s.combat.dropUnknownRuneAt(p.x + 400, p.y);
  s.combat.collectEverything();
  out.magnet = groundRunes().length;
  return out;
`);
console.log('rune:', JSON.stringify(rune));
check('a 키메라 kill leaves an 알수없는 룬 at UNKNOWN_RUNE.chance, and nothing else does',
  rune.from === 'chimera' && rune.fromChimera === 1 && rune.fromOthers === 0 && rune.atZero === 0, JSON.stringify(rune));
check('it wears one of the old 룬 looks', rune.looks === 8 && rune.look.texture === rune.look.want, JSON.stringify(rune.look));
check('picked up, it says a great power is felt — and changes nothing', rune.taken && rune.said.length === 1 && rune.unchanged, JSON.stringify(rune.said));
check('a 자석 takes it with the rest', rune.magnet === 0);
const runeFilter = await cdp.evaluate(`window.config.ITEM_FILTER.find((s) => s.id === 'supplies').entries.some((e) => e.key === 'unknownRune')`);
check('the 아이템 필터 has a switch for it', runeFilter === true);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
