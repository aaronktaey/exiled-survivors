import { connect, sleep } from './cdp-lib.mjs';

const cdp = await connect(9333);
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

const S = `(() => {
  const g = window.game, s = g.scene.getScene('GameScene'), p = s.progression;
  const curve = (lv) => Math.max(1, Math.round(41.5 * Math.pow(lv + 1.75, 2.41) * Math.pow(1.0483, lv) * 0.01));
  let consumed = 0;
  for (let i = 1; i < p.level; i++) consumed += curve(i);
  return {
    hp: s.player.hp, level: p.level, xp: p.xp, totalXp: consumed + p.xp,
    damage: p.statsFor('meleeStrike').damage,
    attackSpeed: p.statsFor('meleeStrike').attackSpeed,
    cooldownMs: Math.round(p.cooldownMsFor('meleeStrike')),
    fireDamage: p.statsFor('fireball').damage,
    fireAttackSpeed: p.statsFor('fireball').attackSpeed,
    weaponCount: s.weapons.length,
    firstWeapon: s.weapons[0].definition.name,
    enemies: s.spawner.alive, choosing: s.choosing, over: s.over,
    pending: s.pendingChoices.length,
    levelUp: g.scene.isActive('UpgradeScene'), gameOver: g.scene.isActive('GameOverScene'),
    selected: g.scene.isActive('UpgradeScene') ? g.scene.getScene('UpgradeScene').selected : -1,
    physicsPaused: s.physics.world.isPaused,
  };
})()`;
const read = () => cdp.evaluate(S);
const run = (expr) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${expr}; return 'ok'; })()`);

// Fresh run.
await cdp.send('Page.reload', { ignoreCache: false });
await sleep(3000);

// A plain enemy at full health, and the player at full health, both read
// from the live config so hand-tuning balance.ts cannot fail the suite.
const CONFIG = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const Progression = Object.getPrototypeOf(s.progression).constructor;
  return { enemyHp: Progression.enemyHealth, playerHp: s.player.maxHp };
})()`);
const FULL = CONFIG.enemyHp;
const MAX = CONFIG.playerHp;
console.log('config:', JSON.stringify(CONFIG));

for (let i = 0; i < 40; i++) { const s = await read(); if (!s.__err) break; await sleep(400); }

// Every body touching the survivor hurts now, so standing still in the
// crowd for the XP window below would end the run before the level-up
// checks get to it. Shielded until the death check lifts it.
await run(`s.player.setInvulnerable(true); return 1;`);

// --- 1. weapon fires and kills ---
const a = await read();
await sleep(14000);
const b = await read();
// Read the opening loadout from the first sample: during the XP window a
// 3% drop can land on the stationary player and be picked up, which would
// legitimately make this two weapons.
check('starts with the melee skill', a.weaponCount === 1 && a.firstWeapon === '타격',
  `${a.firstWeapon} x${a.weaponCount}`);
check('kills grant XP over time', b.totalXp > a.totalXp, `${a.totalXp} -> ${b.totalXp} xp`);
check('enemies keep spawning', b.enemies > 0, `${b.enemies} alive`);

// --- 2. level-up popup (deterministic) ---
// Melee can earn a level during the XP window above; clear any popup it
// opened so the lock test below measures a freshly created one.
for (let i = 0; i < 6; i++) {
  const st = await read();
  if (!st.levelUp) break;
  await sleep(400);
  await cdp.tap('KeyW', 87, 'w');
  await sleep(500);
}
const pre = await read();
await run(`s.progression.addXp(s.progression.xpToNext)`);
await sleep(70);
const open = await read();
check('level-up popup opens', open.levelUp === true, `level ${pre.level} -> ${open.level}`);
const curveCheck = await cdp.evaluate(`(() => {
  const p = window.game.scene.getScene('GameScene').progression;
  const { A, K, B, R, SCALE } = window.config.XP_CURVE;
  const seen = [];
  const want = [];
  const real = p.level;
  for (let lv = 1; lv <= 6; lv++) {
    p.level = lv;
    seen.push(p.xpToNext);
    want.push(Math.max(1, Math.round(A * Math.pow(lv + K, B) * Math.pow(R, lv) * SCALE)));
  }
  p.level = real;
  return { seen, want };
})()`);
check('xpToNext follows XP_CURVE',
  JSON.stringify(curveCheck.seen) === JSON.stringify(curveCheck.want) && curveCheck.seen[0] < curveCheck.seen[5],
  `thresholds=${JSON.stringify(curveCheck.seen)} want=${JSON.stringify(curveCheck.want)}`);
check('physics paused while choosing', open.physicsPaused === true && open.choosing === true);

// --- 3. input lock right after opening ---
check('caret starts on the first card', open.selected === 0, `selected=${open.selected}`);
await cdp.key('keyDown', 'Space', 32, ' ');
await cdp.key('keyUp', 'Space', 32, ' ');
await sleep(80);
const locked = await read();
check('input locked immediately after open',
  locked.levelUp === true && locked.selected === 0 && locked.attackSpeed === open.attackSpeed,
  `selected=${locked.selected} as=${locked.attackSpeed}`);

// --- 4. a held (auto-repeating) direction must not pick ---
await sleep(400);
for (let i = 0; i < 5; i++) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', code: 'KeyD', key: 'd', windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68, autoRepeat: true,
  });
  await sleep(60);
}
const repeated = await read();
check('a held movement key cannot pick',
  repeated.levelUp === true && repeated.attackSpeed === open.attackSpeed,
  `popup open=${repeated.levelUp} as=${repeated.attackSpeed}`);
await cdp.key('keyUp', 'KeyD', 68, 'd');

// --- 5. arrows move the caret but never confirm; 2 takes a card outright ---
const beforeRight = await read();
await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(200);
const moved = await read();
check('an arrow moves the caret', moved.levelUp === true && moved.selected === 1,
  `selected=${moved.selected}`);
check('moving the caret changes no stats',
  moved.attackSpeed === beforeRight.attackSpeed && moved.damage === beforeRight.damage,
  `as=${moved.attackSpeed} dmg=${moved.damage}`);
await cdp.tap('ArrowLeft', 37, 'ArrowLeft');
await sleep(200);
const back = await read();
check('and back again, still without picking',
  back.levelUp === true && back.selected === 0, `selected=${back.selected}`);
await cdp.tap('Digit2', 50, '2');
await sleep(300);
const afterRight = await read();
check('2 picks the second card → 공격속도',
  afterRight.attackSpeed > beforeRight.attackSpeed && afterRight.damage === beforeRight.damage,
  `as ${beforeRight.attackSpeed} -> ${afterRight.attackSpeed}, dmg ${afterRight.damage}`);
check('cooldown shortens', afterRight.cooldownMs < beforeRight.cooldownMs,
  `${beforeRight.cooldownMs}ms -> ${afterRight.cooldownMs}ms`);
check('popup closes and physics resumes',
  afterRight.levelUp === false && afterRight.choosing === false && afterRight.physicsPaused === false);

// --- 6. left picks damage ---
await run(`s.progression.addXp(s.progression.xpToNext)`);
await sleep(600);
const beforeLeft = await read();
// The caret defaults to card 1 each time it opens, so Space takes 공격력.
await cdp.tap('Space', 32, ' ');
await sleep(300);
const afterLeft = await read();
check('Space confirms → 공격력',
  afterLeft.damage > beforeLeft.damage && afterLeft.attackSpeed === beforeLeft.attackSpeed,
  `dmg ${beforeLeft.damage} -> ${afterLeft.damage}, as ${afterLeft.attackSpeed}`);

// --- 7. two level-ups at once queue two popups ---
// Enough for two levels at any point on the curve, so a second popup queues.
await run(`s.progression.addXp(s.progression.xpToNext * 4)`);
await sleep(400);
const queued = await read();
check('multi level-up queues', queued.levelUp === true && queued.pending >= 1,
  `level=${queued.level} pending=${queued.pending}`);
await cdp.tap('Space', 32, ' ');
await sleep(700);
const second = await read();
check('second popup opens after first pick', second.levelUp === true, `pending=${second.pending}`);
// Clear the field first: a live run keeps earning levels faster than the
// loop can clear popups, which is not what this check is about.
await run(`s.spawner.clear(); s.combat.gems.getChildren().forEach(g => g.active && g.collect())`);
let drain = await read();
// Generous: a skill can drop mid-drain and queue a popup of its own.
for (let i = 0; i < 16 && drain.levelUp; i++) {
  await sleep(400);
  await cdp.tap('Space', 32, ' ');
  await sleep(500);
  drain = await read();
}
const cleared = drain;
check('queue drains and play resumes',
  cleared.levelUp === false && cleared.choosing === false && cleared.physicsPaused === false,
  `level=${cleared.level}`);

// --- 8. death, then the three ways on ---
await run(`s.player.invulnerableUntil = 0; s.player.takeDamage(9999)`);
await sleep(500);
const dead = await read();
check('game over opens on death', dead.gameOver === true && dead.over === true, `hp=${dead.hp}`);
await sleep(600);

// The end screen offers 다시하기 · 메인화면 · 옵션.
const endRows = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameOverScene');
  return { ids: s.menu.rows.map(r => r.item.id), labels: s.menu.rows.map(r => r.item.label()) };
})()`);
// A run that made the 랭킹 board gets a row for entering it, below the rest.
check('game over offers 다시하기 · 메인화면 · 옵션',
  JSON.stringify(endRows.ids.filter((id) => id !== 'rank')) === JSON.stringify(['retry', 'menu', 'settings']),
  endRows.labels.join(' / '));

await cdp.tap('Space', 32, ' ');
// Waited for rather than slept on: under a loaded machine the new run can
// take longer than a fixed second to come up.
let restarted = await read();
for (let i = 0; i < 20 && !(restarted.over === false && restarted.level === 1); i++) {
  await sleep(300);
  restarted = await read();
}
check('다시하기 starts another run',
  restarted.gameOver === false && restarted.over === false && restarted.level === 1 && restarted.hp === MAX,
  `lv=${restarted.level} hp=${restarted.hp} dmg=${restarted.damage}`);

// --- 12. the rim of the screen says what is off it ---
// A 우두머리 walks in from outside the view and a weapon it left can sit on
// floor the camera never turns towards. Both are things the player would
// have walked to, had they known.
const rim = await run(`
  s.spawner.clear();
  s.player.setInvulnerable(true);
  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.mangoDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.orbDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.potions.getChildren().forEach(d => d.active && d.collect());

  const p = s.player;
  const at = (a, r) => ({ x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r });
  let put = at(0.4, 700);
  s.combat.dropGearAt(put.x, put.y, { uid: 'far', id: 'runedSword', prefixes: [], suffixes: [] });
  put = at(1.9, 620); s.combat.dropMangoAt(put.x, put.y);
  put = at(3.1, 560); s.combat.dropOrbAt(put.x, put.y, 'chaos');
  put = at(5.6, 760);
  s.combat.dropSkillAt(put.x, put.y, { id: 'fireball', name: '화염구', tags: [] });
  const boss = s.spawner.spawnBoss();
  put = at(5.0, 640);
  boss.setPosition(put.x, put.y);
  // One inside the view, which is already there to see.
  s.combat.dropOrbAt(p.x + 40, p.y + 30, 'transmute');

  s.edgeMarkers.update();
  const cam = s.cameras.main;
  const shown = s.edgeMarkers.markers
    .filter(m => m.icon.visible)
    .map(m => ({ texture: m.icon.texture.key, x: Math.round(m.icon.x), y: Math.round(m.icon.y) }));
  return { count: s.edgeMarkers.shown, shown, w: cam.width, h: cam.height,
           margin: window.config.EDGE_MARKERS.margin };
`);
console.log('the rim:', JSON.stringify(rim));
check('one marker per thing off the screen, and none for what is on it',
  rim.count === 5 && !rim.shown.some((m) => m.texture === 'tex-orb-transmute'),
  `${rim.count} markers: ${rim.shown.map((m) => m.texture.replace('tex-', '')).join(' ')}`);
check('each wears the sprite of the thing it points at',
  ['tex-enemy-boss', 'tex-mango', 'tex-orb-chaos', 'tex-gear-runedSword', 'tex-skill-fireball']
    .every((key) => rim.shown.some((m) => m.texture === key)),
  rim.shown.map((m) => m.texture.replace('tex-', '')).join(' / '));
check('and sits inside the edge it points through',
  rim.shown.every((m) =>
    m.x >= 0 && m.x <= rim.w && m.y >= 0 && m.y <= rim.h &&
    (m.x <= rim.margin + 20 || m.x >= rim.w - rim.margin - 20 ||
     m.y <= rim.margin + 20 || m.y >= rim.h - rim.margin - 20)),
  rim.shown.map((m) => `${m.x},${m.y}`).join(' '));

// They point the right way: the marker's angle from the middle of the
// screen matches the thing's angle from the middle of the world view.
const aimed = await run(`
  const cam = s.cameras.main;
  const boss = s.spawner.group.getChildren().find(e => e.active && e.isBoss);
  const marker = s.edgeMarkers.markers.find(m => m.icon.visible && m.icon.texture.key === 'tex-enemy-boss');
  const want = Math.atan2(boss.y - cam.worldView.centerY, boss.x - cam.worldView.centerX);
  const got = Math.atan2(marker.icon.y - cam.height / 2, marker.icon.x - cam.width / 2);
  let off = Math.abs(want - got) * 180 / Math.PI;
  if (off > 180) off = 360 - off;
  return { off: +off.toFixed(1) };
`);
check('a marker lies on the line out to the thing it marks',
  aimed.off < 2, `${aimed.off}° off`);

const rimCleared = await run(`
  s.combat.gearDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.mangoDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.orbDrops.getChildren().forEach(d => d.active && d.collect());
  s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  s.spawner.clear();
  s.edgeMarkers.update();
  s.player.setInvulnerable(false);
  return { shown: s.edgeMarkers.shown };
`);
check('and goes when the thing it pointed at does',
  rimCleared.shown === 0, `${rimCleared.shown} left`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.pass);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.name).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
