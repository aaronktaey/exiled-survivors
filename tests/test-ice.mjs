import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

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
const run = (body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);
const popup = () => cdp.evaluate(`(() => {
  const g = window.game;
  if (!g.scene.isActive('UpgradeScene')) return { open: false };
  const u = g.scene.getScene('UpgradeScene');
  return {
    open: true, title: u.payload.title, subtitle: u.payload.subtitle, skill: u.payload.skill,
    selected: u.selected,
    cards: u.cards.map(c => ({ id: c.option.id, label: c.option.label, detail: c.option.detail })),
  };
})()`);
const drain = async () => {
  for (let i = 0; i < 8; i++) {
    const p = await popup();
    if (!p.open) return;
    await sleep(350);
    await cdp.tap('Space', 32, ' ');
    await sleep(450);
  }
};

/**
 * Stands a row of still enemies to the player's right and fires one real
 * ice spear down the line, then reads what it did on its way through.
 */
// These suites measure what a skill does, not what a critical does. Every
// survivor now crits some of the time, which would make an exact figure read
// wrong at random, so the base chance is off for the whole suite.
const noCrits = () => cdp.evaluate(`(() => { window.config.PLAYER.critChance = 0; return 1; })()`);
await noCrits();

const fireDownTheLine = async (offsets) => {
  await run(`
    // Hold the scene's own weapons: otherwise the loop keeps firing into the
    // row while the probe's shot is still travelling. Physics keeps running.
    s.choosing = true;
    s.spawner.clear();
    const p = s.player;
    window.__row = ${JSON.stringify(offsets)}.map((dx) => {
      const e = s.spawner.group.get(p.x + dx, p.y);
      e.spawn(p.x + dx, p.y, p);
      e.body.stop();
      e.target = undefined;   // hold still so the row stays a row
      return e;
    });
    const w = s.weapons.find(w => w.definition.id === 'iceSpear');
    const st = s.progression.statsFor('iceSpear');
    w.sinceShotMs = 99999;
    w.update(16, { origin: p, enemies: s.spawner.group, damage: s.damageOf('iceSpear'), cooldownMs: 1,
      range: st.range, projectileSpeed: st.projectileSpeed, chainCount: st.chainCount,
      pierceCount: st.pierceCount, hit: s.combat.hit });
    window.__shot = w.projectiles.getChildren().find(b => b.active);
    return { launched: !!window.__shot };
  `);
  await sleep(900);
  return run(`
    s.choosing = false;
    const row = window.__row;
    const out = {
      hp: row.map(e => (e.active ? e.hp : 0)),
      chilled: row.map(e => (e.active ? e.isChilled : null)),
      shotAlive: window.__shot.active,
    };
    s.spawner.clear();
    return out;
  `);
};

await cdp.send('Page.reload', {});
await sleep(3800);
await noCrits();
await drain();

// A plain enemy at full health, and the player at full health, both read
// from the live config so hand-tuning balance.ts cannot fail the suite.
const CONFIG = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const Progression = Object.getPrototypeOf(s.progression).constructor;
  return { enemyHp: Progression.enemyHealth, playerHp: s.player.hp };
})()`);
const FULL = CONFIG.enemyHp;
console.log('config:', JSON.stringify(CONFIG));


// --- 1. the skill exists, with its own definition ---
const grant = await run(`
  s.onSkillCollected('iceSpear');
  const w = s.weapons.find(w => w.definition.id === 'iceSpear');
  return {
    popup: window.game.scene.isActive('UpgradeScene'),
    name: w.definition.name, tags: w.definition.tags, upgrades: w.definition.upgrades,
    stats: s.progression.statsFor('iceSpear'),
    base: window.config.SKILL_BASE.iceSpear,
    hasProjectiles: !!w.projectiles,
  };
`);
console.log('granted:', JSON.stringify(grant));
check('얼음창 is 주문·냉기·투사체',
  grant.name === '얼음창' && JSON.stringify(grant.tags) === JSON.stringify(['주문', '냉기', '투사체']),
  `${grant.tags}`);
check('it starts on its configured stat line',
  ['damage', 'attackSpeed', 'range', 'projectileSpeed', 'pierceCount']
    .every((k) => grant.stats[k] === grant.base[k]) && grant.base.pierceCount > 0,
  `dmg=${grant.stats.damage} as=${grant.stats.attackSpeed} range=${grant.stats.range} speed=${grant.stats.projectileSpeed} pierce=${grant.stats.pierceCount}`);
check('it throws a projectile', grant.hasProjectiles === true);
check('first pickup grants it without a popup', grant.popup === false);

// --- 2. the shard texture is generated at the configured size ---
const tex = await run(`
  const img = s.textures.get('tex-ice-shard').getSourceImage();
  return { w: img.width, h: img.height };
`);
check('the ice shard texture is baked 22x8', tex.w === 22 && tex.h === 8, `${tex.w}x${tex.h}`);

// --- 3. one spear runs through three enemies and stops ---
// What one spear takes off, read from the live stats rather than assumed.
const ICE = await run(`return { damage: s.damageOf('iceSpear') };`);
/** A spear hits one body plus one per pierce, and stops. */
// How far down the row the spear reached, not what each one was hit for:
// every survivor crits some of the time now, so an exact figure here would
// fail one run in four for a reason that has nothing to do with piercing.
const struck = (hp, pierce) => {
  const hit = Math.min(hp.length, 1 + pierce);
  return hp.every((one, i) => (i < hit ? one < FULL : one === FULL));
};
const line = await fireDownTheLine([60, 100, 140, 180]);
console.log('row of 4:', JSON.stringify(line));
check('a spear runs through its pierces and stops', struck(line.hp, 2),
  `hp down the row: ${line.hp.join(' / ')} (${FULL} = never touched)`);
check('that enemy is damaged once, not once per frame of overlap',
  line.hp[0] < FULL && line.hp[0] >= FULL - ICE.damage * 2,
  `hp: ${line.hp.join(' / ')} (a second tick would read ${FULL - 2 * ICE.damage})`);
check('the spear is spent on it', line.shotAlive === false);

// --- 4. everything it passes through is chilled ---
console.log('chilled:', JSON.stringify(line.chilled));
check('냉각 lands on everything it passed through, and nothing past it',
  JSON.stringify(line.chilled) === JSON.stringify([true, true, true, false]),
  `${line.chilled.join(' / ')}`);

// --- 5. 냉각 is 15% off the move speed, and wears off ---
const slow = await run(`
  s.spawner.clear();
  const p = s.player;
  const e = s.spawner.group.get(p.x + 80, p.y);
  e.spawn(p.x + 80, p.y, p);
  const base = e.currentSpeed;
  e.chill();
  const chilled = e.currentSpeed;
  const tintWhileChilled = e.tintTopLeft;
  // Tick past the 2s duration.
  for (let i = 0; i < 60; i++) e.update(0, 50);
  const after = e.currentSpeed;
  const out = {
    ratio: Number((chilled / base).toFixed(3)),
    recovered: Math.abs(after - base) < 0.001,
    tint: tintWhileChilled.toString(16),
    stillChilled: e.isChilled,
  };
  s.spawner.clear();
  return out;
`);
console.log('chill:', JSON.stringify(slow));
const CHILL = await cdp.evaluate(`window.config.CHILL.slowFactor`);
const CHILLED = Number((1 - CHILL).toFixed(3));
check('냉각 takes its configured share off the move speed', slow.ratio === CHILLED, `speed x${slow.ratio}`);
check('a chilled enemy is tinted', slow.tint === '45cfc6', `#${slow.tint}`);
check('냉각 wears off after 2s', slow.stillChilled === false && slow.recovered === true,
  `back to full speed: ${slow.recovered}`);

// --- 6. re-applying refreshes, it does not stack ---
const stack = await run(`
  s.spawner.clear();
  const p = s.player;
  const e = s.spawner.group.get(p.x + 80, p.y);
  e.spawn(p.x + 80, p.y, p);
  const base = e.currentSpeed;
  e.chill(); e.chill(); e.chill();
  const out = { ratio: Number((e.currentSpeed / base).toFixed(3)) };
  s.spawner.clear();
  return out;
`);
check('three chills do not stack into a deeper slow', stack.ratio === CHILLED, `speed x${stack.ratio}`);

// --- 7. 화염구 still bursts on the first body ---
const fire = await run(`
  s.onSkillCollected('fireball');
  s.choosing = true;
  s.spawner.clear();
  const p = s.player;
  // The second body stands outside the burst, so a hit on it could only
  // mean the shot went through.
  const row = [50, 50 + window.config.SKILL_BASE.fireball.blastRadius * 2].map((dx) => {
    const e = s.spawner.group.get(p.x + dx, p.y);
    // Tough enough to stand the hit, so what it left (냉각 or not) can be read.
    e.spawn(p.x + dx, p.y, p, 'grunt', undefined, false, 20);
    e.body.stop();
    e.target = undefined;
    return e;
  });
  const w = s.weapons.find(w => w.definition.id === 'fireball');
  const st = s.progression.statsFor('fireball');
  w.sinceShotMs = 99999;
  w.update(16, { origin: p, enemies: s.spawner.group, damage: s.damageOf('fireball'), cooldownMs: 1,
    range: 400, projectileSpeed: st.projectileSpeed, chainCount: 0, pierceCount: st.pierceCount,
    blastRadius: st.blastRadius, hit: s.combat.hit });
  window.__row = row;
  return { launched: true };
`);
await sleep(700);
const fireHit = await run(`
  s.choosing = false;
  const out = { hp: window.__row.map(e => (e.active ? e.hp : 0)),
                max: window.__row.map(e => e.maxHp),
                damage: s.damageOf('fireball'),
                chilled: window.__row.map(e => (e.active ? e.isChilled : null)) };
  s.spawner.clear();
  return out;
`);
console.log('fireball row:', JSON.stringify(fireHit));
check('화염구 still stops at the first enemy rather than passing through',
  fireHit.hp[0] < fireHit.max[0] && fireHit.hp[1] === fireHit.max[1],
  `hp: ${fireHit.hp.join(' / ')} after a ${fireHit.damage}-damage hit`);
check('화염구 leaves no 냉각', fireHit.chilled[0] === false, `chilled=${fireHit.chilled[0]}`);

// --- 8. the upgrade screen offers exactly the asked-for picks ---
await run(`s.onSkillCollected('iceSpear'); return 1;`);
await sleep(600);
const choice = await popup();
console.log('popup:', JSON.stringify(choice));
check('repeat pickup opens the 얼음창 choice',
  choice.open === true && choice.skill === 'iceSpear' && choice.title === '얼음창',
  `title=${choice.title} subtitle=${choice.subtitle}`);
// 투사체 속도 went in 0.83: where eight picks took it is the base.
check('it offers 피해량, 공격속도, 관통 횟수',
  JSON.stringify(choice.cards?.map(c => c.id)) ===
    JSON.stringify(['damage', 'attackSpeed', 'pierceCount']),
  `${choice.cards?.map(c => c.label).join(' | ')}`);
await shot('ice-01-choice');

// --- 9. 관통 횟수 +1 sends the next spear one enemy further ---
const before = await run(`return { ice: s.progression.statsFor('iceSpear'), fire: s.progression.statsFor('fireball') };`);
await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(180);
const onPierce = await popup();
check('an arrow moves the caret without confirming',
  onPierce.selected === 1 && onPierce.open === true,
  `selected=${onPierce.selected}, popup still open=${onPierce.open}`);
check('관통 횟수 is the third card', onPierce.cards[2]?.id === 'pierceCount', onPierce.cards[2]?.label);
await cdp.tap('Digit3', 51, '3');
await sleep(600);
const after = await run(`return { ice: s.progression.statsFor('iceSpear'), fire: s.progression.statsFor('fireball') };`);
check('관통 횟수 +1 touches nothing else',
  after.ice.pierceCount === before.ice.pierceCount + 1 &&
  after.ice.damage === before.ice.damage && after.ice.attackSpeed === before.ice.attackSpeed &&
  after.fire.pierceCount === before.fire.pierceCount,
  `pierce ${before.ice.pierceCount} -> ${after.ice.pierceCount}, 화염구 still ${after.fire.pierceCount}`);

const deeper = await fireDownTheLine([60, 100, 140, 180]);
console.log('row of 4 after the upgrade:', JSON.stringify(deeper));
check('and the next spear reaches one enemy further', struck(deeper.hp, 3),
  `hp down the row: ${deeper.hp.join(' / ')}`);

// --- 10. it joins the same drop roll as the rest ---
const rate = await run(`
  const seen = {};
  const N = 150000;
  let drops = 0;
  for (let i = 0; i < N; i++) {
    const d = s.rollSkillDrop();
    if (d) { drops++; seen[d.id] = (seen[d.id] ?? 0) + 1; }
  }
  return { rate: drops / N, seen, want: window.config.SKILL_DROP.chance };
`);
console.log('drop roll:', JSON.stringify(rate));
check('total drop chance is the configured one', Math.abs(rate.rate - rate.want) < rate.want * 0.15,
  `measured ${(rate.rate * 100).toFixed(2)}%, configured ${(rate.want * 100).toFixed(2)}%`);
const share = (rate.rate * 150000) / Object.keys(rate.seen).length;
check('every droppable gets an even share of the roll, 얼음창 among them',
  'iceSpear' in rate.seen && Object.values(rate.seen).every(n => Math.abs(n - share) < share * 0.25),
  Object.entries(rate.seen).map(([k, n]) => `${k} ${n}`).join(' / '));

// --- 11. its ground label ---
const drop = await run(`
  s.combat.dropSkillAt(s.player.x + 300, s.player.y, s.constructor === null ? null : (() => {
    const all = Object.values(window.__skills || {});
    return { id: 'iceSpear', name: '얼음창', tags: ['주문','냉기','관통','투사체'],
             upgrades: ['damage','attackSpeed','pierceCount'] };
  })());
  const d = s.combat.skillDrops.getChildren().find(x => x.active);
  return { label: d.nameplate.text, style: d.nameplate.style };
`);
check('its ground label reads 얼음창, in the ordinary dress',
  drop.label === '얼음창' && drop.style.plateAlpha === 0,
  `"${drop.label}" on ${drop.plate}`);

// --- 12. all four skills run together ---
await run(`
  window.__kills = 0;
  window.__chills = 0;
  const c = s.combat, orig = c.hit;
  c.hit = (e, d) => { const was = e.active; orig(e, d); if (was && !e.active) window.__kills++; };
  const probe = s.spawner.group.get(0, 0);
  const enemyProto = Object.getPrototypeOf(probe);
  const origChill = enemyProto.chill;
  enemyProto.chill = function (ms) { window.__chills++; return origChill.call(this, ms); };
  probe.recycle();
  s.onSkillCollected('chainLightning');
  s.player.setInvulnerable(true);
  return 1;
`);
await sleep(18000);
await drain();
const live = await run(`
  const chilled = s.spawner.group.getChildren().filter(e => e.active && e.isChilled).length;
  return { kills: window.__kills, chills: window.__chills, alive: s.spawner.alive, over: s.over,
           chilled, weapons: s.weapons.map(w => w.definition.name) };
`);
console.log('after 12s:', JSON.stringify(live));
check('all four skills run together and kill',
  live.kills > 0 && live.over === false && live.weapons.length === 4,
  `kills=${live.kills} weapons=${live.weapons}`);
check('spears chill enemies in real play', live.chills > 0,
  `냉각 applied ${live.chills} times, ${live.chilled} of ${live.alive} still chilled`);
await shot('ice-02-live');

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
