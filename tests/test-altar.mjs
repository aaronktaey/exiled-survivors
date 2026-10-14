import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 제단: a 우두머리 always leaves one, it says what it will call up, and it
// only wakes when the survivor walks up to it. Plus the two 속성 that were
// taken off weapons in the same batch, and the 고대 두개골 never letting a
// rare through.

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
const ev = (expr) => cdp.evaluate(expr);
const run = (body) =>
  cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(1200);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// Every probe below freezes the run and clears the field, so nothing else
// walks into the survivor while an altar is being measured.
const FREEZE = `
  s.choosing = true;
  s.player.setInvulnerable(true);
  s.spawner.clear();
  s.combat.altars.getChildren().forEach(a => a.active && a.collect());
`;

// --- 1. the two 속성 that are gone ---
const affixes = await ev(`(() => {
  const ids = Object.keys(window.config.AFFIXES);
  return {
    ids,
    rolledEffects: Object.values(window.config.AFFIXES)
      .flatMap(a => (a.gearTiers ?? []).flatMap(t => Object.keys(t.gear))),
    bonusKeys: Object.keys(window.gearBonusFor(window.gear.equipped)),
  };
})()`);
check('예리 and 재생 are no longer 속성 at all',
  !affixes.ids.includes('honed') && !affixes.ids.includes('regrowth'),
  affixes.ids.join(' / '));
check('nothing a weapon can roll gives flat attack or life over time',
  !affixes.rolledEffects.includes('attackBonus') && !affixes.rolledEffects.includes('regen') &&
    !affixes.bonusKeys.includes('regen'),
  [...new Set(affixes.rolledEffects)].join(' / '));

// --- 2. the table ---
const table = await ev(`(() => {
  const c = window.config;
  return {
    offers: Object.entries(c.ALTAR_OFFERS).map(([id, o]) => ({ id, ...o,
      kindOk: c.ENEMY_KINDS[o.kind] !== undefined })),
    altar: { ...c.ALTAR },
  };
})()`);
check('every offer names a real enemy and calls up at least one',
  table.offers.length > 0 && table.offers.every(o => o.kindOk && o.count > 0 && o.weight > 0),
  table.offers.map(o => `${o.id}: ${o.count} ${o.rare ? 'rare ' : ''}${o.kind}`).join(', '));
check('it lands out of reach of the kill, so collecting the loot cannot wake it',
  table.altar.dropOffset > table.altar.activateRadius,
  `${table.altar.dropOffset}px away, wakes inside ${table.altar.activateRadius}px`);

// --- 3. a 우두머리 always leaves one; nothing else does ---
const fromKills = await run(`
  ${FREEZE}
  const was = window.config.ALTAR.fromBoss;
  const kill = (kind) => {
    const before = s.combat.altars.countActive(true);
    s.spawner.spawnOneOfEach();
    const e = s.spawner.group.getChildren().find(x => x.active && x.kind === kind);
    const at = { x: e.x, y: e.y };
    s.combat.hit(e, 1e9);
    const fresh = s.combat.altars.getChildren().filter(a => a.active);
    const made = s.combat.altars.countActive(true) - before;
    const last = fresh[fresh.length - 1];
    s.spawner.clear();
    return { made, dist: last ? Math.hypot(last.x - at.x, last.y - at.y) : null };
  };
  const bosses = [kill('boss'), kill('boss'), kill('boss'), kill('boss'), kill('boss')];
  const others = ['grunt', 'brute', 'runner', 'shooter'].map(kill);
  const out = { was, bosses, others };
  s.combat.altars.getChildren().forEach(a => a.active && a.collect());
  s.choosing = false;
  return out;
`);
console.log('altars from kills:', JSON.stringify(fromKills));
check('every 우두머리 kill leaves a 제단',
  fromKills.was < 1 || fromKills.bosses.every(b => b.made === 1),
  fromKills.bosses.map(b => b.made).join(' '));
check('set back by its offset from where the 우두머리 fell',
  fromKills.bosses.every(b => Math.abs(b.dist - table.altar.dropOffset) < 1),
  `${fromKills.bosses[0].dist?.toFixed(1)}px`);
check('and no other kill leaves one',
  fromKills.others.every(o => o.made === 0),
  fromKills.others.map(o => o.made).join(' '));

// --- 4. it says what it will call up, in every offer ---
const plates = await run(`
  ${FREEZE}
  const out = [];
  for (const id of Object.keys(window.config.ALTAR_OFFERS)) {
    const a = s.combat.dropAltarAt(s.player.x + 300, s.player.y, id);
    const o = window.config.ALTAR_OFFERS[id];
    out.push({ id, text: a.nameplate.text, visible: a.nameplate.label.visible,
      width: a.nameplate.label.width, count: o.count, rare: o.rare, kind: o.kind,
      timeLeft: a.timeLeftMs });
    a.collect();
  }
  s.choosing = false;
  return out;
`);
console.log('plates:', JSON.stringify(plates.map(p => p.text)));
check('every offer is written over it, with its count',
  plates.every(p => p.visible && p.width > 0 && p.text.includes(String(p.count))),
  plates.map(p => p.text).join(' | '));
check('a rare pack says so, and a plain one does not',
  plates.every(p => p.text.includes('희귀') === p.rare), '');
check('and it lasts like any other drop, rather than forever',
  plates.every(p => p.timeLeft > 0 && Number.isFinite(p.timeLeft)), `${plates[0].timeLeft}ms`);

// --- 5. it waits, then wakes when walked up to, and calls up its crowd ---
const step = (n) => `for (let i = 0; i < ${n}; i++) a.update(0, 16);`;
const woke = await run(`
  ${FREEZE}
  const out = {};
  for (const id of Object.keys(window.config.ALTAR_OFFERS)) {
    s.spawner.clear();
    const o = window.config.ALTAR_OFFERS[id];
    const px = s.player.x, py = s.player.y;
    const a = s.combat.dropAltarAt(px + 200, py, id);
    ${step(10)}
    const waiting = a.active && s.spawner.alive === 0;
    s.player.setPosition(a.x - window.config.ALTAR.activateRadius / 2, a.y);
    ${step(1)}
    const live = s.spawner.group.getChildren().filter(e => e.active);
    out[id] = {
      waiting,
      spent: !a.active,
      count: live.length,
      want: o.count,
      kinds: [...new Set(live.map(e => e.kind))],
      rares: live.filter(e => e.rare).length,
      nearest: Math.min(...live.map(e => Math.hypot(e.x - a.x, e.y - a.y))),
    };
    s.player.setPosition(px, py);
  }
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('woken:', JSON.stringify(woke));
const offers = Object.fromEntries(table.offers.map(o => [o.id, o]));
check('it waits for as long as the survivor keeps their distance',
  Object.values(woke).every(w => w.waiting), '');
check('walking up to it spends it',
  Object.values(woke).every(w => w.spent), '');
check('and calls up exactly the crowd it offered',
  Object.entries(woke).every(([id, w]) =>
    w.count === w.want && w.kinds.length === 1 && w.kinds[0] === offers[id].kind),
  Object.entries(woke).map(([id, w]) => `${id} ${w.count}/${w.want} ${w.kinds}`).join(', '));
check('rare where it said rare, plain where it did not',
  Object.entries(woke).every(([id, w]) =>
    offers[id].kind === 'boss' || (offers[id].rare ? w.rares === w.count : w.rares === 0)),
  Object.entries(woke).map(([id, w]) => `${id} ${w.rares} rare`).join(', '));
check('standing in a ring around it, not on top of the survivor',
  Object.values(woke).every(w => Math.abs(w.nearest - table.altar.summonRadius) < 2 ||
    w.nearest > table.altar.activateRadius * 2),
  Object.values(woke).map(w => w.nearest.toFixed(0)).join(' '));

// --- 6. one that lands underfoot has to be walked away from first ---
const underfoot = await run(`
  ${FREEZE}
  const a = s.combat.dropAltarAt(s.player.x, s.player.y, 'rareGrunts');
  const armedAtFirst = a.armed;
  ${step(10)}
  const stillThere = a.active && s.spawner.alive === 0;
  const px = s.player.x;
  s.player.setPosition(px + window.config.ALTAR.activateRadius * 3, s.player.y);
  ${step(1)}
  const armedAfter = a.armed && a.active;
  s.player.setPosition(px, s.player.y);
  ${step(1)}
  const out = { armedAtFirst, stillThere, armedAfter, spent: !a.active, alive: s.spawner.alive };
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('underfoot:', JSON.stringify(underfoot));
check('an altar that lands under the survivor does not go off by itself',
  underfoot.armedAtFirst === false && underfoot.stillThere, '');
check('it arms once they step out, and wakes when they come back',
  underfoot.armedAfter && underfoot.spent && underfoot.alive > 0,
  `${underfoot.alive} called up`);

// --- 7. under a 고대 두개골, a rare pack is 우두머리 up to the ceiling ---
const skulled = await run(`
  ${FREEZE}
  const was = s.boneBonus;
  s.boneBonus = { ...was, raresBecomeBosses: true };
  const a = s.combat.dropAltarAt(s.player.x + 200, s.player.y, 'rareShooters');
  s.player.setPosition(a.x, a.y);
  ${step(1)}
  const live = s.spawner.group.getChildren().filter(e => e.active);
  const out = {
    bosses: live.filter(e => e.isBoss).length,
    rares: live.filter(e => e.rare).length,
    plain: live.filter(e => !e.isBoss && !e.rare).length,
    want: window.config.ALTAR_OFFERS.rareShooters.count,
    cap: window.config.BONE_RUN.maxBosses,
  };
  s.boneBonus = was;
  s.spawner.clear();
  s.choosing = false;
  return out;
`);
console.log('rare pack under a skull:', JSON.stringify(skulled));
check('a rare pack under a 고대 두개골 is 우두머리 up to the ceiling, plain after',
  skulled.rares === 0 && skulled.bosses === Math.min(skulled.cap, skulled.want) &&
    skulled.bosses + skulled.plain === skulled.want,
  `${skulled.bosses} 우두머리 + ${skulled.plain} plain, ${skulled.rares} rare`);

// --- 8. the rim points at one off screen ---
const rim = await run(`
  ${FREEZE}
  s.combat.potions.getChildren().forEach(p => p.active && p.collect());
  const a = s.combat.dropAltarAt(s.player.x + 900, s.player.y, 'bosses');
  s.edgeMarkers.update();
  const out = { shown: s.edgeMarkers.shown };
  return out;
`);
check('an altar off the screen gets a marker on its rim', rim.shown >= 1, `${rim.shown} shown`);

// --- 9. what it looks like ---
await run(`
  ${FREEZE}
  s.combat.altars.getChildren().forEach(a => a.active && a.collect());
  s.combat.dropAltarAt(s.player.x - 120, s.player.y - 60, 'bosses');
  s.combat.dropAltarAt(s.player.x + 120, s.player.y - 60, 'rareShooters');
  s.combat.dropAltarAt(s.player.x, s.player.y + 110, 'runnerSwarm');
  return 1;
`);
await sleep(500);
await shot('altar-01-offers');
await run(`
  const a = s.combat.altars.getChildren().find(x => x.active && x.offer === 'rareShooters');
  s.player.setPosition(a.x, a.y);
  a.update(0, 16);
  return 1;
`);
await sleep(300);
await shot('altar-02-woken');
await run(`s.spawner.clear(); s.combat.altars.getChildren().forEach(a => a.active && a.collect()); s.choosing = false; return 1;`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
