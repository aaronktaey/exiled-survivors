import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

const cdp = await connect(9333);
const SP = process.argv[2];
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
const stats = () => run(`
  const p = s.progression, m = p.statsFor('meleeStrike'), f = p.statsFor('fireball');
  return {
    melee: { dmg: m.damage, as: m.attackSpeed, cd: Math.round(p.cooldownMsFor('meleeStrike')) },
    fire:  { dmg: f.damage, as: f.attackSpeed, cd: Math.round(p.cooldownMsFor('fireball')) },
    owned: [...s.owned], weapons: s.weapons.map(w => w.definition.name),
    popup: window.game.scene.isActive('UpgradeScene'),
    pending: s.pendingChoices.length,
  };
`);
const popupInfo = () => cdp.evaluate(`(() => {
  const u = window.game.scene.getScene('UpgradeScene');
  return { title: u.payload.title, subtitle: u.payload.subtitle, skill: u.payload.skill,
           labels: u.cards.map(c => c.option.label), details: u.cards.map(c => c.option.detail) };
})()`);
// Space takes the highlighted card; the number keys reach one directly.
const confirm = async (which) => {
  if (which === 'right') {
    await cdp.tap('Digit2', 50, '2');
  } else {
    await cdp.tap('Space', 32, ' ');
  }
  await sleep(450);
};
const drainPopups = async () => {
  for (let i = 0; i < 8; i++) {
    const st = await stats();
    if (!st.popup) return;
    await sleep(350);
    await confirm();
  }
};

await cdp.send('Page.reload', {});
await sleep(3800);
await drainPopups();

// --- 1. loadout and tags ---
const start = await run(`return {
  weapons: s.weapons.map(w => w.definition.name),
  tags: s.weapons.map(w => w.definition.tags.join(',')),
  owned: [...s.owned],
};`);
check('starts with melee only', start.weapons.length === 1 && start.weapons[0] === '타격', `${start.weapons}`);
check('melee tags are 물리·공격·근접', start.tags[0] === '물리,공격,근접', start.tags[0]);

// --- 2. melee auto-aims at the nearest enemy ---
// Enemies are pooled now: take one from the group and spawn it, rather
// than constructing one (a bare constructor has no body and no hp).
const meleeHelpers = `
  const p = s.player;
  const clear = () => s.spawner.clear();
  const mk = (dx, dy) => {
    const x = p.x + dx, y = p.y + dy;
    const e = s.spawner.group.get(x, y);
    e.spawn(x, y, p);
    return e;
  };
  const st = () => s.progression.statsFor('meleeStrike');
  const swing = () => { const w = s.weapons[0]; w.sinceSwingMs = 99999;
    w.update(16, { origin: p, enemies: s.spawner.group, damage: 1e9, cooldownMs: 1,
      range: st().range, projectileSpeed: st().projectileSpeed, hit: s.combat.hit }); };
`;

// Nearest is behind the player: it must still be the one that dies.
const behindCase = await run(meleeHelpers + `
  clear();
  const behind = mk(-30, 0);
  const far = mk(400, 0);
  swing();
  return { behind: behind.active, far: far.active };
`);
check('swings at the nearest enemy even when it is behind', behindCase.behind === false,
  `behind alive=${behindCase.behind}`);
check('leaves the enemy out of reach alone', behindCase.far === true, `far alive=${behindCase.far}`);

// Two enemies on opposite sides: only the nearer side is caught by the arc.
const sidesCase = await run(meleeHelpers + `
  clear();
  const near = mk(-30, 0);
  const opposite = mk(60, 0);
  swing();
  return { near: near.active, opposite: opposite.active };
`);
check('arc follows the nearest target', sidesCase.near === false, `near alive=${sidesCase.near}`);
check('enemy on the opposite side is outside the arc', sidesCase.opposite === true,
  `opposite alive=${sidesCase.opposite}`);

// Nothing in reach: hold the charge instead of swinging at nothing.
const idleCase = await run(meleeHelpers + `
  clear();
  const far = mk(300, 0);
  const w = s.weapons[0];
  w.sinceSwingMs = 99999;
  w.update(16, { origin: p, enemies: s.spawner.group, damage: 99, cooldownMs: 400,
    range: st().range, projectileSpeed: st().projectileSpeed, hit: s.combat.hit });
  return { far: far.active, charge: w.sinceSwingMs };
`);
check('holds the swing when nothing is in reach', idleCase.far === true && idleCase.charge === 400,
  `far alive=${idleCase.far} charge=${idleCase.charge}`);

// --- 3. level-up points go to the basic attack only ---
const beforeLevel = await stats();
await run(`s.progression.addXp(s.progression.xpToNext); return 1;`);
await sleep(700);
const lvPopup = await popupInfo();
check('level-up popup targets the melee skill', lvPopup.skill === 'meleeStrike' && lvPopup.title === 'LEVEL UP',
  `title=${lvPopup.title} skill=${lvPopup.skill}`);
check('level-up card text names 타격', lvPopup.details[0].startsWith('타격'), lvPopup.details[0]);
await sleep(350);
await confirm();
const afterLevel = await stats();
check('level-up raised melee damage', afterLevel.melee.dmg > beforeLevel.melee.dmg,
  `melee dmg ${beforeLevel.melee.dmg} -> ${afterLevel.melee.dmg}`);
check('level-up left fireball untouched',
  afterLevel.fire.dmg === beforeLevel.fire.dmg && afterLevel.fire.as === beforeLevel.fire.as,
  `fire dmg=${afterLevel.fire.dmg} as=${afterLevel.fire.as}`);

// --- 4. first pickup grants the skill and offers its own choice ---
const dropShape = await run(`
  const d = s.combat.skillDrops.get();
  d.drop(s.player.x + 60, s.player.y, { id: 'fireball', name: '화염구', tags: [] });
  const tm = s.textures;
  const orb = tm.get('tex-skill-orb').getSourceImage();
  const n = d.nameplate;
  return {
    orbTexture: d.texture.key, orbW: orb.width, orbH: orb.height, orbY: Math.round(d.y),
    orbDrawnW: 0, orbDrawnH: 0,
    gemDrawnW: (() => { const g = s.combat.gems.get(); g.drop(0, 0, 1, s.player); const w = Math.round(g.displayWidth); g.collect(); return w; })(),
    plateY: Math.round(n.plate.y), labelY: Math.round(n.label.y),
    labelText: n.text, labelSize: n.label.style.fontSize, labelColor: n.label.style.color,
    labelW: Math.ceil(n.label.width), labelH: Math.ceil(n.label.height),
    plateVisible: n.plate.visible, labelVisible: n.label.visible,
    plateAlpha: n.plate.fillAlpha, stroke: n.label.style.strokeThickness,
  };
`);
// The pop tween runs for 180ms; read the settled size once it is done.
await sleep(350);
const settled = await run(`
  const d = s.combat.skillDrops.getChildren().find(x => x.active);
  return { w: Math.round(d.displayWidth), h: Math.round(d.displayHeight) };
`);
dropShape.orbDrawnW = settled.w;
dropShape.orbDrawnH = settled.h;
console.log('drop shape:', JSON.stringify(dropShape));
// The art is a 32x32 icon scaled down, so check what is drawn, not the source.
check('a drop wears its own skill icon',
  dropShape.orbTexture === 'tex-skill-fireball' && dropShape.orbDrawnW === 24 && dropShape.orbDrawnH === 24,
  `${dropShape.orbTexture} source ${dropShape.orbW}x${dropShape.orbH}, drawn ${dropShape.orbDrawnW}x${dropShape.orbDrawnH}`);
check('gem is drawn at its icon size', dropShape.gemDrawnW === 14, `${dropShape.gemDrawnW}px`);
check('label sits above the orb', dropShape.plateY < dropShape.orbY && dropShape.labelY === dropShape.plateY,
  `orbY=${dropShape.orbY} plateY=${dropShape.plateY} labelY=${dropShape.labelY}`);
// A skill is an ordinary drop however good it is, so it wears the plainest
// of the three labels: bare outlined text, no plate behind it.
check('the words are shown without a plate behind them',
  dropShape.labelVisible === true && dropShape.plateVisible === false &&
    dropShape.plateAlpha === 0,
  `label=${dropShape.labelVisible} plate=${dropShape.plateVisible}`);
check('and they lean on a dark outline instead',
  dropShape.stroke >= 2, `${dropShape.stroke}px outline`);
check('the plate is still measured to the words plus their padding',
  dropShape.plateY < dropShape.orbY,
  `label ${dropShape.labelW}x${dropShape.labelH} at ${dropShape.labelSize}`);
check('label name is 화염구, in the ordinary ink',
  dropShape.labelText === '화염구' && dropShape.labelColor === '#e8edf7',
  `"${dropShape.labelText}" ${dropShape.labelColor}`);
await shot('skill-01-drop');
// Walk into the drop and nothing else: an enemy dying along the way can roll
// a skill of its own and be walked over too.
await run(`s.spawner.clear(); return 1;`);
await cdp.key('keyDown', 'KeyD', 68, 'd');
await sleep(800);
await cdp.key('keyUp', 'KeyD', 68, 'd');
await sleep(600);

const firstGrab = await run(`
  // A throwaway Progression gives the untouched base line to compare against,
  // so this survives rebalancing.
  const Progression = Object.getPrototypeOf(s.progression).constructor;
  return {
    open: window.game.scene.isActive('UpgradeScene'),
    pending: s.pendingChoices.length,
    fire: s.progression.statsFor('fireball'),
    base: new Progression().statsFor('fireball'),
  };
`);
check('first pickup opens no choice', firstGrab.open === false && firstGrab.pending === 0,
  `popup=${firstGrab.open} pending=${firstGrab.pending}`);
check('first pickup leaves 화염구 at base spec',
  JSON.stringify(firstGrab.fire) === JSON.stringify(firstGrab.base),
  `granted ${JSON.stringify(firstGrab.fire)} vs base ${JSON.stringify(firstGrab.base)}`);
await shot('skill-02-fireball-granted');

const afterFire = await stats();
check('pickup granted the skill', afterFire.owned.includes('fireball') && afterFire.weapons.length === 2,
  `weapons=${afterFire.weapons}`);

// --- 5. it keeps dropping once owned ---
const rate = await run(`
  let drops = 0;
  const N = 40000;
  for (let i = 0; i < N; i++) if (s.rollSkillDrop()) drops++;
  return { rate: drops / N, want: window.config.SKILL_DROP.chance };
`);
check('still drops at the configured rate after being owned',
  Math.abs(rate.rate - rate.want) < rate.want * 0.2,
  `measured=${(rate.rate * 100).toFixed(2)}%, configured ${(rate.want * 100).toFixed(2)}%`);

// --- 6. a repeat pickup upgrades instead of granting ---
await run(`
  const d = s.combat.skillDrops.get();
  d.drop(s.player.x + 60, s.player.y, { id: 'fireball', name: '화염구', tags: [] });
  return 1;
`);
await cdp.key('keyDown', 'KeyD', 68, 'd');
await sleep(800);
await cdp.key('keyUp', 'KeyD', 68, 'd');
await sleep(600);
const repeatPopup = await popupInfo();
check('repeat pickup is labelled 강화', repeatPopup.subtitle === '강화' && repeatPopup.skill === 'fireball',
  `subtitle=${repeatPopup.subtitle}`);
check('repeat pickup names 화염구', repeatPopup.title === '화염구' && repeatPopup.details[1].startsWith('화염구'),
  `title=${repeatPopup.title} / ${repeatPopup.details[1]}`);
check('화염구 offers three picks, 사거리 not among them', repeatPopup.labels.length === 3 && !repeatPopup.labels.some(l => /사정거리/.test(l)), repeatPopup.labels.join(' | '));
await shot('skill-02-fireball-choice');
const beforeRepeat = await stats();
await sleep(350);
await confirm(); // 공격력 +1
const afterRepeat = await stats();
check('repeat pickup raised fireball damage', afterRepeat.fire.dmg > beforeRepeat.fire.dmg,
  `fire dmg ${beforeRepeat.fire.dmg} -> ${afterRepeat.fire.dmg}`);
check('no duplicate weapon added', afterRepeat.weapons.length === 2, `weapons=${afterRepeat.weapons}`);
check('melee still untouched by fireball upgrades',
  afterRepeat.melee.dmg === beforeRepeat.melee.dmg && afterRepeat.melee.as === beforeRepeat.melee.as,
  `melee dmg=${afterRepeat.melee.dmg} as=${afterRepeat.melee.as}`);

// Another repeat, spent on rate this time: the two skills keep their own clocks.
await run(`
  const d = s.combat.skillDrops.get();
  d.drop(s.player.x + 60, s.player.y, { id: 'fireball', name: '화염구', tags: [] });
  return 1;
`);
await cdp.key('keyDown', 'KeyD', 68, 'd');
await sleep(800);
await cdp.key('keyUp', 'KeyD', 68, 'd');
await sleep(600);
const beforeRate = await stats();
await sleep(350);
await confirm('right'); // 공격속도 +1
const afterRate = await stats();
check('fireball upgrade raised fireball attack speed', afterRate.fire.as > beforeRate.fire.as,
  `fire as ${beforeRate.fire.as} -> ${afterRate.fire.as}`);
check('fireball cooldown is its own', afterRate.fire.cd !== afterRate.melee.cd,
  `fire=${afterRate.fire.cd}ms melee=${afterRate.melee.cd}ms`);
await shot('skill-03-final');

console.log('\nfinal stats:', JSON.stringify(afterRepeat));
// --- 8. the readout counts a skill's picks as its level ---
const levels = await run(`
  s.choosing = true;
  s.spawner.clear();
  const p = s.progression;
  const Progression = Object.getPrototypeOf(p).constructor;
  const fresh = new Progression();

  const before = ['meleeStrike', 'fireball', 'chainLightning', 'iceSpear', 'voidOrb']
    .map(id => ({ id, level: fresh.levelFor(id) }));

  // Three picks on one skill, one on another, none on the rest.
  if (!s.owned.has('fireball')) s.onSkillCollected('fireball');
  if (!s.owned.has('voidOrb')) s.onSkillCollected('voidOrb');
  const start = { fireball: p.levelFor('fireball'), voidOrb: p.levelFor('voidOrb'),
                  melee: p.levelFor('meleeStrike') };
  p.apply('fireball', 'damage');
  p.apply('fireball', 'attackSpeed');
  p.apply('fireball', 'projectileSpeed');
  p.apply('voidOrb', 'orbCount');

  const after = { fireball: p.levelFor('fireball'), voidOrb: p.levelFor('voidOrb'),
                  melee: p.levelFor('meleeStrike') };

  s.hud.update(0, 0, s.loadout());
  const line = s.hud.loadoutText;
  s.choosing = false;
  return { before, start, after, line };
`);
console.log('levels:', JSON.stringify(levels));
check('a skill starts at Lv 1 the moment it is picked up',
  levels.before.every(b => b.level === 1),
  levels.before.map(b => `${b.id} ${b.level}`).join(' / '));
check('every upgrade is one more level on that skill',
  levels.after.fireball === levels.start.fireball + 3 &&
  levels.after.voidOrb === levels.start.voidOrb + 1,
  `화염구 ${levels.start.fireball}->${levels.after.fireball}, 공허구체 ${levels.start.voidOrb}->${levels.after.voidOrb}`);
check('and only on that skill', levels.after.melee === levels.start.melee,
  `타격 stayed at ${levels.after.melee}`);
check('the readout shows the level and the DPS, and no single-hit number',
  /타격\s+Lv \d+\s+DPS \d/.test(levels.line) &&
    levels.line.includes(`화염구  Lv ${levels.after.fireball}  DPS`) &&
    !/단일피해/.test(levels.line),
  levels.line.split('\n').join(' | '));
await shot('skills-07-levels');


console.log('\n=== SUMMARY ===');
// --- 7. balance dials ---
const dials = await run(`
  const probe = s.spawner.group.get(0, 0);
  probe.spawn(0, 0, s.player);
  const hp = probe.hp;
  probe.recycle();
  const Progression = Object.getPrototypeOf(s.progression).constructor;
  return { hp, configured: Progression.enemyHealth, fire: s.damageOf('fireball'), melee: s.damageOf('meleeStrike'),
           fireStat: s.progression.statsFor('fireball').damage,
           meleeStat: s.progression.statsFor('meleeStrike').damage,
           sword: s.gearBonus.attack,
           passive: s.mods.shard.damage,
           fireBase: window.config.SKILL_BASE.fireball.damage,
           meleeBase: window.config.SKILL_BASE.meleeStrike.damage };
`);
console.log('dials:', JSON.stringify(dials));
check('enemy hp follows enemyHpScale', dials.hp === dials.configured,
  `hp=${dials.hp} at enemyHpScale=1 (configured maxHp=${dials.configured})`);
// At a dial of 1: the base plus the sword in hand's flat attack, then the
// run's picks (a 증가) and the tree (an 증폭) over the lot — Modifiers.damageFor (0.93).
const folded = (base, stat) => Math.round((base + dials.sword) * (stat / base) * dials.passive);
check('damage is the stat plus the sword, at a dial of 1',
  dials.fire === folded(dials.fireBase, dials.fireStat) &&
    dials.melee === folded(dials.meleeBase, dials.meleeStat),
  `fireball ${dials.fireStat}+${dials.sword} -> ${dials.fire}, melee ${dials.meleeStat}+${dials.sword} -> ${dials.melee}`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
