import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 도망자 — never fights, runs when hit, leaves after a minute, always leaves a
// skill — and the crowd rule that came with it: every body pressed against
// the survivor hurts, not just the first.

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

// --- 1. a crowd hurts as a crowd ---
const crowd = await run(`
  s.choosing = true;
  s.spawner.clear();
  const p = s.player;
  p.setInvulnerable(false);
  p.invulnerableUntil = 0;
  p.hp = p.maxHp;
  const contact = window.config.ENEMY_KINDS.grunt.contactDamage;
  const ring = [0, 1, 2].map((i) => {
    const e = s.spawner.group.get(p.x, p.y);
    e.spawn(p.x + 8 * i, p.y, p, 'grunt');
    return e;
  });
  const before = p.hp;
  ring.forEach((e) => s.combat.onEnemyTouch(p, e));
  const three = before - p.hp;
  // The same three again at once: each is still on its own cooldown.
  ring.forEach((e) => s.combat.onEnemyTouch(p, e));
  const again = before - p.hp - three;
  // A bolt landing now is not blocked by the bodies, and opens the window.
  const boltBefore = p.hp;
  p.takeDamage(5);
  const bolt = boltBefore - p.hp;
  // The debug switch still holds everything off.
  p.setInvulnerable(true);
  const shieldedBefore = p.hp;
  const fresh = s.spawner.group.get(p.x, p.y); fresh.spawn(p.x, p.y, p, 'grunt');
  s.combat.onEnemyTouch(p, fresh);
  const shielded = shieldedBefore - p.hp;
  p.setInvulnerable(false);
  p.hp = p.maxHp;
  s.spawner.clear();
  s.choosing = false;
  return { contact, three, again, bolt, shielded, cooldown: window.config.ENEMY.contactCooldownMs };
`);
console.log('crowd:', JSON.stringify(crowd));
check('three enemies touching at once all hurt', crowd.three === crowd.contact * 3,
  `${crowd.three} from three bodies of ${crowd.contact}`);
check('but each one only once per its own cooldown', crowd.again === 0,
  `${crowd.again} more inside ${crowd.cooldown}ms`);
check('bodies do not shield the survivor from a bolt', crowd.bolt === 5, `${crowd.bolt}`);
check('and the debug switch still holds every hit off', crowd.shielded === 0);

// --- 2. what a 도망자 is ---
const spec = await cfg();
async function cfg() {
  return cdp.evaluate(`(() => ({
    f: window.config.ENEMY_KINDS.fugitive, grunt: window.config.ENEMY_KINDS.grunt,
    player: window.config.PLAYER.speed, sched: { ...window.config.FUGITIVE },
  }))()`);
}
check('it never fights back: no body damage, no shot, no ring',
  spec.f.contactDamage === 0 && !spec.f.shot && !spec.f.volley);
check('it is tough and fast — tougher than a 일반, faster than the survivor',
  spec.f.maxHp > spec.grunt.maxHp * 4 && spec.f.speed > spec.player,
  `${spec.f.maxHp} hp, ${spec.f.speed} speed vs survivor ${spec.player}`);
check('it lasts a minute', spec.f.lifespanMs === 60000, `${spec.f.lifespanMs}ms`);

// --- 3. it turns up on its own clock, one at a time ---
const schedule = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.spawner.elapsedMs = 0;
  s.spawner.untilFugitiveMs = window.config.FUGITIVE.firstMs;
  const at = [];
  for (let t = 0; t < window.config.FUGITIVE.firstMs + window.config.FUGITIVE.intervalMs * 2 + 500; t += 50) {
    const was = s.spawner.aliveByKind.fugitive;
    s.spawner.update(50);
    if (s.spawner.aliveByKind.fugitive > was) at.push(Math.round(t / 1000));
    // Keep the field clear of everything else so the count is the 도망자's.
    s.spawner.group.getChildren().forEach((e) => e.active && e.kind !== 'fugitive' && e.recycle());
  }
  const alive = s.spawner.aliveByKind.fugitive;
  s.spawner.clear();
  s.choosing = false;
  return { at, alive };
`);
console.log('schedule:', JSON.stringify(schedule));
check('the first turns up on time, and never two at once',
  schedule.at[0] === Math.floor(spec.sched.firstMs / 1000) && schedule.alive <= spec.sched.maxAlive,
  `turned up at ${schedule.at.join('s, ')}s`);

// --- 4. it stands until hit, then runs from the survivor and stops ---
const flee = await run(`
  s.choosing = true;
  s.spawner.clear();
  const p = s.player;
  const f = s.spawner.spawnFugitive();
  f.setPosition(p.x + 150, p.y);
  f.body.reset(p.x + 150, p.y);
  for (let i = 0; i < 20; i++) f.update(0, 50);
  const still = Math.round(Math.hypot(f.x - (p.x + 150), f.y - p.y));
  const crit = window.config.PLAYER.critChance;
  window.config.PLAYER.critChance = 0;
  s.combat.hit(f, 10);
  window.config.PLAYER.critChance = crit;
  const start = { x: f.x, y: f.y };
  const fleeing = f.isFleeing;
  // Step its physics by hand: the arena is frozen, so move it frame by frame.
  let frames = 0;
  while (f.isFleeing && frames < 200) {
    f.update(0, 50);
    f.x += f.body.velocity.x * 0.05; f.y += f.body.velocity.y * 0.05;
    f.body.reset(f.x, f.y);
    frames++;
  }
  const ran = Math.round(Math.hypot(f.x - start.x, f.y - start.y));
  const awayBefore = Math.hypot(start.x - p.x, start.y - p.y);
  const awayAfter = Math.hypot(f.x - p.x, f.y - p.y);
  const out = { still, fleeing, stopped: !f.isFleeing, ran, further: awayAfter > awayBefore,
                hpLeft: f.hp, max: f.maxHp, active: f.active, frames };
  s.choosing = false;
  return out;
`);
console.log('flee:', JSON.stringify(flee));
check('until it is hit, it stands where it is', flee.still <= 1, `${flee.still}px`);
check('a hit sends it running', flee.fleeing === true && flee.active);
check('away from the survivor, about as far as one scare carries it, then it stops',
  flee.stopped && flee.further && Math.abs(flee.ran - spec.f.flee.distance) < spec.f.flee.distance * 0.25,
  `${flee.ran}px of ${spec.f.flee.distance}, ${flee.frames} frames`);

// --- 5. it never hurts the survivor ---
const harmless = await run(`
  const p = s.player;
  const f = s.spawner.group.getChildren().find((e) => e.active && e.kind === 'fugitive');
  p.setInvulnerable(false); p.invulnerableUntil = 0; p.hp = p.maxHp;
  f.contactReadyAt = 0;
  s.combat.onEnemyTouch(p, f);
  return { hp: p.hp, max: p.maxHp };
`);
check('touching it costs nothing', harmless.hp === harmless.max);
await run(`
  const f = s.spawner.group.getChildren().find((e) => e.active && e.kind === 'fugitive');
  f.setPosition(s.player.x + 110, s.player.y - 40);
  return 1;
`);
await sleep(400);
await shot('fugitive-01');

// --- 6. it is drawn to be seen ---
const look = await run(`
  const f = s.spawner.group.getChildren().find((e) => e.active && e.kind === 'fugitive');
  const tints = [];
  for (let i = 0; i < 4; i++) { s.time.now += 400; f.update(0, 16); tints.push(f.tintTopLeft); }
  s.edgeMarkers.update();
  return { tints, ring: f.outline?.visible === true, tex: f.texture.key };
`);
check('its colour keeps changing, and it wears no ring',
  new Set(look.tints).size >= 3 && !look.ring && look.tex === 'tex-enemy-fugitive',
  look.tints.map((c) => c.toString(16)).join(' '));

// --- 7. killed, it always leaves a skill ---
const killed = await run(`
  s.choosing = true;
  s.combat.skillDrops.getChildren().forEach((d) => d.active && d.collect());
  const was = window.config.SKILL_DROP.chance;
  window.config.SKILL_DROP.chance = 0;
  let drops = 0;
  for (let i = 0; i < 5; i++) {
    const f = s.spawner.spawnFugitive();
    s.combat.hit(f, 1e9);
  }
  drops = s.combat.skillDrops.countActive(true);
  window.config.SKILL_DROP.chance = was;
  s.combat.skillDrops.getChildren().forEach((d) => d.active && d.collect());
  s.choosing = false;
  return { drops };
`);
check('every 도망자 killed leaves a skill, whatever the drop chance is', killed.drops === 5,
  `${killed.drops} of 5`);

// --- 8. a minute later it is gone, and leaves nothing ---
const gone = await run(`
  s.choosing = true;
  s.spawner.clear();
  s.combat.skillDrops.getChildren().forEach((d) => d.active && d.collect());
  const gems = s.combat.gems.countActive(true);
  const f = s.spawner.spawnFugitive();
  const life = f.lifeLeftMs;
  for (let t = 0; t < life - 1000; t += 50) f.update(0, 50);
  const late = f.active;
  for (let t = 0; t < 2000; t += 50) f.update(0, 50);
  const out = { life, late, gone: !f.active, skills: s.combat.skillDrops.countActive(true),
                gems: s.combat.gems.countActive(true) - gems };
  s.choosing = false;
  return out;
`);
console.log('gone:', JSON.stringify(gone));
check('it is still there just before its minute is up', gone.late === true);
check('and gone after it, leaving no skill and no gem', gone.gone && gone.skills === 0 && gone.gems === 0);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
