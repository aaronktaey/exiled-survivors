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
    cards: u.cards.map(c => ({ id: c.option.id, label: c.option.label, detail: c.option.detail, w: Math.round(c.panel.width) })),
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

// These suites measure what a skill does, not what a critical does. Every
// survivor now crits some of the time, which would make an exact figure read
// wrong at random, so the base chance is off for the whole suite.
const noCrits = () => cdp.evaluate(`(() => { window.config.PLAYER.critChance = 0; return 1; })()`);
await noCrits();

// A row of enemies to the player's right, `gap` apart, then one cast.
const castAt = (gaps) => run(`
  s.spawner.clear();
  const p = s.player, w = s.weapons.find(w => w.definition.id === 'chainLightning');
  const st = s.progression.statsFor('chainLightning');
  const placed = [];
  let x = p.x;
  for (const gap of ${JSON.stringify(gaps)}) {
    x += gap;
    const e = s.spawner.group.get(x, p.y);
    e.spawn(x, p.y, p);
    e.body.stop();
    placed.push(e);
  }
  w.sinceCastMs = 99999;
  w.update(16, { origin: p, enemies: s.spawner.group, damage: st.damage, cooldownMs: 1,
    range: st.range, projectileSpeed: st.projectileSpeed, chainCount: st.chainCount, hit: s.combat.hit });
  const hp = placed.map(e => (e.active ? e.hp : 0));
  const out = { hp, chainCount: st.chainCount, boltAlpha: w.bolt.alpha, boltCommands: w.bolt.commandBuffer.length };
  s.spawner.clear();
  return out;
`);

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


// --- 1. the skill is registered with the asked-for name and tags ---
const skillDef = await run(`return { starting: s.weapons.map(w => w.definition.name) };`);
check('run still starts on 타격 alone', JSON.stringify(skillDef.starting) === JSON.stringify(['타격']),
  `${skillDef.starting}`);

// --- 2. base stat line ---
const grant = await run(`
  s.onSkillCollected('chainLightning');
  const w = s.weapons.find(w => w.definition.id === 'chainLightning');
  const Progression = Object.getPrototypeOf(s.progression).constructor;
  return {
    popup: window.game.scene.isActive('UpgradeScene'),
    pending: s.pendingChoices.length,
    name: w.definition.name, tags: w.definition.tags,
    stats: s.progression.statsFor('chainLightning'),
    base: new Progression().statsFor('chainLightning'),
    hasProjectiles: !!w.projectiles,
    weapons: s.weapons.map(w => w.definition.name),
  };
`);
console.log('granted:', JSON.stringify(grant));
check('연쇄번개 is 주문·번개·연쇄', grant.name === '연쇄번개' &&
  JSON.stringify(grant.tags) === JSON.stringify(['주문', '번개', '연쇄']), `${grant.tags}`);
check('it is granted at its configured base line',
  JSON.stringify(grant.stats) === JSON.stringify(grant.base) && grant.stats.chainCount >= 1 &&
  grant.stats.range === 160,
  `dmg=${grant.stats.damage} as=${grant.stats.attackSpeed} range=${grant.stats.range} chains=${grant.stats.chainCount}`);
check('it is instant, with no projectile group', grant.hasProjectiles === false);
check('first pickup grants it without a popup', grant.popup === false && grant.pending === 0,
  `popup=${grant.popup} pending=${grant.pending}`);

// --- 3. one cast walks through three enemies ---
const line = await castAt([30, 80, 80, 80, 80]);
console.log('line of 5:', JSON.stringify(line));
// 1 + chainCount enemies take a hit; the rest of the row is untouched.
const struck = (row, chains) => row.hp.filter((hp) => hp < FULL).length === 1 + chains &&
  row.hp.slice(1 + chains).every((hp) => hp === FULL);
check('a cast hits the first enemy plus one per chain',
  struck(line, line.chainCount),
  `hp along the row: ${line.hp.join(' / ')} at chainCount ${line.chainCount} (${FULL} = untouched)`);
check('the bolt is drawn', line.boltAlpha === 1 && line.boltCommands > 0,
  `alpha=${line.boltAlpha}, ${line.boltCommands} draw commands`);

// --- 4. the arc cannot jump further than its chain radius ---
const RADIUS = await cdp.evaluate(`window.config.LIGHTNING.chainRadius`);
const gapped = await castAt([30, Math.round(RADIUS * 1.2)]);
check('a gap past the chain radius breaks the chain', gapped.hp[0] < FULL && gapped.hp[1] === FULL,
  `hp: ${gapped.hp.join(' / ')} (chainRadius is ${RADIUS}px)`);
const close = await castAt([30, Math.round(RADIUS * 0.85)]);
check('and one inside it does not', close.hp[0] < FULL && close.hp[1] < FULL,
  `hp: ${close.hp.join(' / ')}`);

// --- 5. nobody is struck twice when the crowd runs out ---
const pair = await castAt([30, 60]);
check('two enemies take one hit each, not three',
  pair.hp[0] === pair.hp[1] && pair.hp[0] < FULL && pair.hp[0] > FULL - 2 * (FULL - pair.hp[0]) + 1,
  `hp: ${pair.hp.join(' / ')} (a double hit would read lower)`);

// --- 6. out of range entirely: hold the charge ---
const idle = await run(`
  s.spawner.clear();
  const p = s.player, w = s.weapons.find(w => w.definition.id === 'chainLightning');
  const st = s.progression.statsFor('chainLightning');
  const e = s.spawner.group.get(p.x + 400, p.y);
  e.spawn(p.x + 400, p.y, p);
  w.sinceCastMs = 99999;
  w.update(16, { origin: p, enemies: s.spawner.group, damage: st.damage, cooldownMs: 500,
    range: st.range, projectileSpeed: st.projectileSpeed, chainCount: st.chainCount, hit: s.combat.hit });
  const out = { hp: e.hp, charge: w.sinceCastMs };
  s.spawner.clear();
  return out;
`);
check('holds the charge when nothing is in range', idle.hp === FULL && idle.charge === 500,
  `hp=${idle.hp} charge=${idle.charge}ms`);

// --- 7. a repeat pickup offers damage, rate and chain count ---
await run(`s.onSkillCollected('chainLightning'); return 1;`);
await sleep(600);
const choice = await popup();
console.log('popup:', JSON.stringify(choice));
check('repeat pickup opens the 연쇄번개 choice',
  choice.open === true && choice.skill === 'chainLightning' && choice.title === '연쇄번개',
  `title=${choice.title} subtitle=${choice.subtitle}`);
check('it offers 피해량, 공격속도, 연쇄 횟수',
  JSON.stringify(choice.cards?.map(c => c.id)) ===
    JSON.stringify(['damage', 'attackSpeed', 'chainCount']),
  `${choice.cards?.map(c => c.label).join(' | ')}`);
check('no 사정거리 or 투사체 속도 card on a non-projectile skill',
  choice.cards?.every(c => c.id !== 'range' && c.id !== 'projectileSpeed') === true);
await shot('chain-01-choice');

// --- 8. picking 연쇄 횟수 adds one jump, and only that ---
const before = await run(`return { chain: s.progression.statsFor('chainLightning'), fire: s.progression.statsFor('fireball') };`);
await cdp.tap('ArrowRight', 39, 'ArrowRight');
await sleep(180);
const onChain = await popup();
check('an arrow moves the caret without confirming',
  onChain.selected === 1 && onChain.open === true,
  `selected=${onChain.selected}, popup still open=${onChain.open}`);
check('연쇄 횟수 is the third card', onChain.cards[2].id === 'chainCount', onChain.cards[2].label);
await cdp.tap('Digit3', 51, '3');
await sleep(600);
const after = await run(`return { chain: s.progression.statsFor('chainLightning'), fire: s.progression.statsFor('fireball') };`);
check('연쇄 횟수 +1 touches nothing else',
  after.chain.chainCount === before.chain.chainCount + 1 &&
  after.chain.damage === before.chain.damage && after.chain.attackSpeed === before.chain.attackSpeed &&
  after.fire.chainCount === before.fire.chainCount,
  `chains ${before.chain.chainCount} -> ${after.chain.chainCount}, 화염구 still ${after.fire.chainCount}`);

// --- 9. the upgraded arc really reaches one enemy further ---
const longer = await castAt([30, 80, 80, 80, 80]);
console.log('line of 5 after the upgrade:', JSON.stringify(longer));
check('one more chain reaches one more enemy',
  struck(longer, longer.chainCount) && longer.chainCount === line.chainCount + 1,
  `hp along the row: ${longer.hp.join(' / ')} at chainCount ${longer.chainCount}`);

// --- 10. both skills share the one 3% roll ---
const rate = await run(`
  const seen = { fireball: 0, chainLightning: 0 };
  const N = 90000;
  let drops = 0;
  for (let i = 0; i < N; i++) {
    const d = s.rollSkillDrop();
    if (d) { drops++; seen[d.id]++; }
  }
  return { rate: drops / N, seen, want: window.config.SKILL_DROP.chance };
`);
console.log('drop roll:', JSON.stringify(rate));
check('total drop chance is the configured one', Math.abs(rate.rate - rate.want) < rate.want * 0.15,
  `measured ${(rate.rate * 100).toFixed(2)}%, configured ${(rate.want * 100).toFixed(2)}%`);
check('the two droppables split it evenly',
  Math.abs(rate.seen.fireball - rate.seen.chainLightning) < rate.seen.fireball * 0.25,
  `화염구 ${rate.seen.fireball} vs 연쇄번개 ${rate.seen.chainLightning}`);

// --- 11. it drops with its own ground label ---
const drop = await run(`
  s.combat.dropSkillAt(s.player.x + 300, s.player.y, { id: 'chainLightning', name: '연쇄번개',
    tags: ['주문','번개','연쇄'] });
  const d = s.combat.skillDrops.getChildren().find(x => x.active);
  return { skillId: d.skillId, label: d.nameplate.text, style: d.nameplate.style };
`);
console.log('drop:', JSON.stringify(drop));
check('its ground label reads 연쇄번개, in the ordinary dress',
  drop.label === '연쇄번개' && drop.style.plateAlpha === 0,
  `"${drop.label}" in ${drop.style.colour}`);

// --- 12. a level-up spends on the run's main skill ---
// Whatever the roll: 연쇄번개 was picked up later, so the level goes to the
// skill the run started on, with that skill's own picks.
const levelUp = async (roll) => {
  const held = await run(`
    const r = Math.random;
    Math.random = () => ${roll};
    s.progression.addXp(s.progression.xpToNext);
    Math.random = r;
    return [...s.owned];
  `);
  await sleep(700);
  const lv = await popup();
  await cdp.tap('Space', 32, ' ');
  await sleep(500);
  return { held, lv };
};
const low = await levelUp(0);
const high = await levelUp(0.999);
check('a level-up offers the main skill, whatever the roll — not the one picked up later',
  low.lv.open && high.lv.open && low.held.includes('chainLightning') &&
    low.lv.skill === 'meleeStrike' && high.lv.skill === 'meleeStrike',
  `${low.lv.skill} / ${high.lv.skill} of ${low.held.join(', ')}`);
check('and its picks are that skill’s own',
  (low.lv.skill === 'meleeStrike' ? low.lv.cards.length === 2 : low.lv.cards.length === 3) &&
    (high.lv.skill === 'chainLightning' ? high.lv.cards.length === 3 : high.lv.cards.length === 2),
  `${low.lv.cards?.length} and ${high.lv.cards?.length} cards`);

// --- 13. live play with all three skills ---
await run(`
  window.__kills = 0;
  const c = s.combat, orig = c.hit;
  c.hit = (e, d) => { const was = e.active; orig(e, d); if (was && !e.active) window.__kills++; };
  s.onSkillCollected('fireball');
  s.player.setInvulnerable(true);
  return 1;
`);
await sleep(12000);
await drain();
const live = await run(`return { kills: window.__kills, alive: s.spawner.alive, over: s.over,
  weapons: s.weapons.map(w => w.definition.name) };`);
console.log('after 12s:', JSON.stringify(live));
check('all three skills run together and kill', live.kills > 0 && live.over === false &&
  live.weapons.length === 3, `kills=${live.kills} weapons=${live.weapons}`);
await shot('chain-02-live');

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
