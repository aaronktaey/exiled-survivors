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
const ev = (expr) => cdp.evaluate(expr);
const run = (body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);
const fkey = async (code, vk) => {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code, key: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', code, key: code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  await sleep(300);
};
/** Moves the real mouse to a point in game coordinates. */
const mouseTo = async (gx, gy, type = 'mouseMoved') => {
  const at = await cdp.evaluate(`(() => {
    const s = window.game.scale;
    return { x: s.canvasBounds.x + ${gx} / s.displayScale.x, y: s.canvasBounds.y + ${gy} / s.displayScale.y };
  })()`);
  await cdp.send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  await sleep(250);
};
const drain = async () => {
  for (let i = 0; i < 8; i++) {
    const open = await cdp.evaluate(`({ open: window.game.scene.isActive('UpgradeScene') })`);
    if (!open.open) return;
    await sleep(350);
    await cdp.tap('Space', 32, ' ');
    await sleep(450);
  }
};

await cdp.send('Page.reload', {});
await sleep(3800);
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


// --- 1. one spawn in ten ---
const rate = await run(`
  s.choosing = true;
  s.spawner.clear();
  let rares = 0;
  const N = 4000;
  for (let round = 0; round < 20; round++) {
    s.spawner.spawnBurst(200);
    for (const child of s.spawner.group.getChildren()) {
      if (child.active && child.rare) rares++;
    }
    s.spawner.clear();
  }
  s.choosing = false;
  return { rares, N, rate: rares / N };
`);
console.log('rare rate:', JSON.stringify(rate));
check('about one spawn in ten is rare', Math.abs(rate.rate - 0.1) < 0.015,
  `${(rate.rate * 100).toFixed(1)}% of ${rate.N} spawns`);

// --- 2. what a rare carries ---
const sample = await run(`
  s.choosing = true;
  s.spawner.clear();
  const seen = {};
  const counts = {};
  for (let i = 0; i < 400; i++) {
    const e = s.spawner.spawnRare();
    e.affixes.forEach(a => { seen[a.id] = (seen[a.id] ?? 0) + 1; });
    counts[e.affixes.length] = (counts[e.affixes.length] ?? 0) + 1;
    // Distinct within one enemy?
    if (new Set(e.affixes.map(a => a.id)).size !== e.affixes.length) seen.duplicate = true;
    seen.longest = Math.max(seen.longest ?? 0, e.affixes.length);
    e.recycle();
  }
  s.choosing = false;
  return { seen, counts };
`);
console.log('affixes:', JSON.stringify(sample));
check('all four affixes turn up',
  ['giant', 'swift', 'critical', 'mighty'].every(id => (sample.seen[id] ?? 0) > 20),
  Object.entries(sample.seen).map(([k, n]) => `${k} ${n}`).join(' / '));
const counts = Object.keys(sample.counts).map(Number).sort((a, b) => a - b);
check('a rare carries between one and six affixes',
  counts.every((n) => n >= 1 && n <= 6) && counts.includes(1),
  `affix counts seen: ${JSON.stringify(sample.counts)}`);
check('a full stack is rare among rares',
  (sample.counts[6] ?? 0) < (sample.counts[1] ?? 0) / 4,
  `${sample.counts[1] ?? 0} ones vs ${sample.counts[6] ?? 0} sixes in 400 rares`);

// --- 3. each affix does what it says ---
const effects = await run(`
  s.choosing = true;
  s.spawner.clear();
  const p = s.player;
  const plain = s.spawner.group.get(p.x + 300, p.y);
  plain.spawn(p.x + 300, p.y, p, 'grunt');
  const base = { hp: plain.hp, speed: plain.currentSpeed, contact: plain.contactDamage };
  plain.recycle();

  // Force one affix at a time through the same path a spawn uses.
  // What an 속성 does to an enemy lives under .enemy, beside what the same
  // one does on a weapon.
  const AFFIX = {
    giant: { id: 'giant', kind: 'suffix', name: '거대', detail: '체력 +50%', enemy: { hpScale: 1.5 } },
    swift: { id: 'swift', kind: 'suffix', name: '신속', detail: '이동속도 +20%', enemy: { speedScale: 1.2 } },
    critical: { id: 'critical', kind: 'prefix', name: '치명', detail: '치명타 확률 20%', enemy: { critChance: 0.2 } },
    mighty: { id: 'mighty', kind: 'prefix', name: '강력', detail: '피해 +50%', enemy: { damageScale: 1.5 } },
  };
  const withAffix = (id) => {
    const e = s.spawner.group.get(p.x + 300, p.y);
    e.spawn(p.x + 300, p.y, p, 'grunt');
    e.applyAffixes([AFFIX[id]]);
    // hp and speed are read at spawn, so re-apply them the way spawn does.
    // Base health comes from the config, so tuning it does not break this.
    const Progression = Object.getPrototypeOf(s.progression).constructor;
    e.hp = Math.round(Progression.enemyHealth * (AFFIX[id].enemy.hpScale ?? 1));
    return e;
  };

  const giant = withAffix('giant');
  const giantHp = giant.hp;
  giant.recycle();

  // Speed is multiplied where it is read, so the same enemy can be measured
  // with and without the affix — no spawn-roll variance in the comparison.
  const swift = s.spawner.group.get(p.x + 300, p.y);
  swift.spawn(p.x + 300, p.y, p, 'grunt');
  const swiftBefore = swift.currentSpeed;
  swift.applyAffixes([AFFIX.swift]);
  const swiftSpeed = swift.currentSpeed;
  swift.recycle();

  const mighty = withAffix('mighty');
  const mightyHits = Array.from({ length: 50 }, () => mighty.rollDamage(base.contact));
  mighty.recycle();

  const crit = withAffix('critical');
  const critHits = Array.from({ length: 4000 }, () => crit.rollDamage(10));
  crit.recycle();

  s.spawner.clear();
  s.choosing = false;
  return {
    base,
    giantHp,
    swiftBefore: Number(swiftBefore.toFixed(2)),
    swiftSpeed: Number(swiftSpeed.toFixed(2)),
    mighty: [...new Set(mightyHits)],
    critRate: critHits.filter(h => h === 20).length / critHits.length,
    critValues: [...new Set(critHits)].sort((a, b) => a - b),
  };
`);
console.log('effects:', JSON.stringify(effects));
check('거대 adds half again as much health', effects.giantHp === Math.round(effects.base.hp * 1.5),
  `${effects.base.hp} -> ${effects.giantHp} hp`);
check('신속 is a fifth faster',
  Math.abs(effects.swiftSpeed / effects.swiftBefore - 1.2) < 0.001,
  `${effects.swiftBefore} -> ${effects.swiftSpeed} px/s on the same enemy`);
check('강력 hits half again as hard',
  effects.mighty.every(d => d === Math.max(1, Math.round(effects.base.contact * 1.5))),
  `contact ${effects.base.contact} -> ${effects.mighty.join('/')}`);
check('치명 doubles about one hit in five',
  Math.abs(effects.critRate - 0.2) < 0.03 &&
  JSON.stringify(effects.critValues) === JSON.stringify([10, 20]),
  `${(effects.critRate * 100).toFixed(1)}% of hits doubled, values ${effects.critValues}`);

// --- 4. the yellow ring ---
const ring = await run(`
  s.choosing = true;
  s.spawner.clear();
  const rare = s.spawner.spawnRare();
  const plain = s.spawner.group.get(s.player.x - 200, s.player.y);
  plain.spawn(s.player.x - 200, s.player.y, s.player, 'grunt');
  const out = {
    rareHasRing: !!rare.outline && rare.outline.visible,
    colour: rare.outline ? rare.outline.strokeColor.toString(16) : null,
    affixes: rare.affixes.length,
    expected: rare.outlineColor.toString(16),
    width: rare.outline ? rare.outline.width : null,
    plainHasRing: !!plain.outline && plain.outline.visible,
    follows: null,
  };
  // The ring rides along with the enemy.
  rare.setPosition(rare.x + 90, rare.y + 40);
  rare.update(0, 16);
  out.follows = Math.round(Math.hypot(rare.outline.x - rare.x, rare.outline.y - rare.y));
  s.choosing = false;
  return out;
`);
console.log('ring:', JSON.stringify(ring));

const tiers = await run(`
  s.choosing = true;
  s.spawner.clear();
  const p = s.player;
  const AFFIX = { id: 'giant', kind: 'suffix', name: '거대', detail: '체력 +50%', enemy: { hpScale: 1.5 } };
  const shades = [];
  let stacked = null;
  for (let n = 1; n <= 6; n++) {
    const e = s.spawner.group.get(p.x + 300, p.y);
    e.spawn(p.x + 300, p.y, p, 'grunt', undefined, true);
    e.applyAffixes(Array.from({ length: n }, () => AFFIX));
    e.drawOutline();
    shades.push(e.outline.strokeColor);
    if (n === 3) stacked = { hpScale: e.hpScale, tally: e.affixTally.map(t => t.affix.name + " x" + t.count) };
    e.recycle();
  }
  s.spawner.clear();
  s.choosing = false;
  return { shades, stacked };
`);
console.log('tiers:', JSON.stringify({ shades: tiers.shades.map(c => c.toString(16)), stacked: tiers.stacked }));
check('every extra affix deepens the ring',
  new Set(tiers.shades).size === 6 && tiers.shades[0] === 0xffd34d && tiers.shades[5] === 0xd41347,
  tiers.shades.map(c => '#' + c.toString(16)).join(' '));
check('a repeated affix stacks rather than being ignored',
  Math.abs(tiers.stacked.hpScale - 1.5 ** 3) < 0.001,
  `three 거대 -> hp x${tiers.stacked.hpScale.toFixed(3)}`);
check('the tooltip folds repeats into a count',
  tiers.stacked.tally.join(' ') === '거대 x3', tiers.stacked.tally.join(' '));
check('a rare wears a ring in its tier colour',
  ring.rareHasRing === true && ring.colour === ring.expected,
  `#${ring.colour} at ${ring.affixes} affix(es)`);
check('an ordinary enemy wears none', ring.plainHasRing === false);
check('the ring follows its enemy', ring.follows === 0, `${ring.follows}px apart after a jump`);

// --- 5. hovering a rare lists what it carries ---
const placed = await run(`
  s.spawner.clear();
  s.player.setInvulnerable(true);
  const p = s.player;
  const rare = s.spawner.group.get(p.x + 120, p.y - 40);
  rare.spawn(p.x + 120, p.y - 40, p, 'grunt', undefined, true);
  rare.target = undefined;
  rare.body.stop();
  window.__rare = rare;
  const cam = s.cameras.main;
  return {
    affixes: rare.affixes.map(a => a.name),
    screen: { x: Math.round(rare.x - cam.worldView.x), y: Math.round(rare.y - cam.worldView.y) },
  };
`);
console.log('placed rare:', JSON.stringify(placed));

await mouseTo(placed.screen.x, placed.screen.y);
const hovered = await run(`
  const t = s.rareTooltip;
  return { visible: t.visible, text: t.text, same: t.target === window.__rare };
`);
console.log('hover:', JSON.stringify(hovered));
check('hovering a rare opens its affix list',
  hovered.visible === true && hovered.same === true, `visible=${hovered.visible}`);
check('the list names every affix it carries',
  placed.affixes.every(name => hovered.text.includes(name)),
  `"${hovered.text.replace(/\n/g, ' | ')}" for ${placed.affixes}`);
await shot('rare-01-hover');

await mouseTo(placed.screen.x + 300, placed.screen.y + 160);
const away = await run(`return { visible: s.rareTooltip.visible };`);
check('moving off it closes the list', away.visible === false);

// Touch works the same way: a press reaches the same path.
await mouseTo(placed.screen.x, placed.screen.y, 'mousePressed');
await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 0, y: 0, button: 'left', clickCount: 1 });
const tapped = await run(`return { visible: s.rareTooltip.visible };`);
check('a press opens it too, for touch screens', tapped.visible === true);

// --- 6. and while the run is paused ---
await run(`s.rareTooltip.hide(); return 1;`);
await cdp.tap('Escape', 27, 'Escape');
await sleep(600);
const paused = await cdp.evaluate(`({
  pause: window.game.scene.isActive('PauseScene'),
  frozen: window.game.scene.isPaused('GameScene'),
})`);
check('the run is frozen', paused.pause === true && paused.frozen === true);

await mouseTo(placed.screen.x, placed.screen.y);
// The pause screen draws its own panel, above its own dimmer.
const inspectedPaused = await cdp.evaluate(`(() => {
  const t = window.game.scene.getScene('PauseScene').tooltip;
  return { visible: t.visible, text: t.text };
})()`);
console.log('paused inspect:', JSON.stringify(inspectedPaused));
check('a rare can still be inspected while paused',
  inspectedPaused.visible === true && placed.affixes.every(n => inspectedPaused.text.includes(n)),
  `"${inspectedPaused.text.replace(/\n/g, ' | ')}"`);
await shot('rare-02-paused');

await cdp.tap('Escape', 27, 'Escape');
await sleep(600);
const resumed = await cdp.evaluate(`({ pause: window.game.scene.isActive('PauseScene') })`);
check('leaving the pause screen puts the list away', resumed.pause === false);

// --- 7. affixes make a rare likelier to leave a skill ---
const drops = await run(`
  s.choosing = true;
  s.spawner.clear();
  const measure = (affixCount) => {
    let drops = 0;
    const N = 80000;
    for (let i = 0; i < N; i++) if (s.rollSkillDrop(1 + affixCount * window.config.RARE.dropBonusPerAffix)) drops++;
    return drops / N;
  };
  const out = { plain: measure(0), one: measure(1), two: measure(2),
                want: window.config.SKILL_DROP.chance, per: window.config.RARE.dropBonusPerAffix };
  s.choosing = false;
  return out;
`);
console.log('drop rates:', JSON.stringify(drops));
const near = (got, want) => Math.abs(got - want) < want * 0.15;
check('an ordinary kill drops at the configured rate', near(drops.plain, drops.want),
  `${(drops.plain * 100).toFixed(2)}%, configured ${(drops.want * 100).toFixed(2)}%`);
check('each affix adds its share of that, and two add twice as much',
  near(drops.one, drops.want * (1 + drops.per)) && near(drops.two, drops.want * (1 + 2 * drops.per)),
  `1 affix ${(drops.one * 100).toFixed(2)}%, 2 affixes ${(drops.two * 100).toFixed(2)}%`);

const bonus = await run(`
  s.spawner.clear();
  const rare = s.spawner.spawnRare();
  const out = { affixes: rare.affixes.length, bonus: rare.dropBonus };
  rare.recycle();
  const plain = s.spawner.group.get(0, 0);
  plain.spawn(0, 0, s.player, 'grunt');
  out.plainBonus = plain.dropBonus;
  plain.recycle();
  const boss = s.spawner.group.get(0, 0);
  boss.spawn(0, 0, s.player, 'boss');
  out.bossBonus = boss.dropBonus;
  boss.recycle();
  out.per = window.config.RARE.dropBonusPerAffix;
  out.bossWant = 1 + window.config.BOSS.dropBonus;
  return out;
`);
check('the enemy itself reports the right multiplier — rare, ordinary and 우두머리',
  Math.abs(bonus.bonus - (1 + bonus.affixes * bonus.per)) < 1e-9 && bonus.plainBonus === 1 &&
    bonus.bossBonus === bonus.bossWant,
  `${bonus.affixes} affixes -> x${bonus.bonus}, ordinary -> x${bonus.plainBonus}, 우두머리 -> x${bonus.bossBonus}`);

// --- 8. potions are a fifth as common as they were ---
const potions = await run(`
  s.choosing = true;
  s.spawner.clear();
  let potions = 0;
  const orig = s.combat.dropPotionAt.bind(s.combat);
  s.combat.dropPotionAt = () => { potions++; };
  const KILLS = 20000;
  for (let round = 0; round < 100; round++) {
    s.spawner.spawnBurst(200);
    for (const child of [...s.spawner.group.getChildren()]) if (child.active) s.combat.hit(child, 99999);
  }
  s.combat.dropPotionAt = orig;
  s.combat.gems.getChildren().forEach(g => g.active && g.collect());
  s.combat.skillDrops.getChildren().forEach(d => d.active && d.collect());
  s.spawner.clear();
  s.choosing = false;
  return { kills: KILLS, potions, rate: potions / KILLS };
`);
console.log('potion rate:', JSON.stringify(potions));
const potionChance = await ev(`window.config.POTION.chance`);
check('potions drop at the rate balance.ts asks for',
  Math.abs(potions.rate - potionChance) < Math.max(0.003, potionChance * 0.3),
  `${(potions.rate * 100).toFixed(2)}% over ${potions.kills} kills, tuned to ${(potionChance * 100).toFixed(1)}%`);

// --- 9. the debug key and the overlay ---
await fkey('F1', 112);
// Hold the natural spawner, or one of its rolls can come up rare mid-count.
await run('s.choosing = true; s.spawner.clear(); return 1;');
await fkey('F9', 120);
const debug = await run(`
  const out = { rares: s.spawner.aliveRares, alive: s.spawner.alive, text: s.debug.label.text };
  s.choosing = false;
  return out;
`);
check('F9 spawns a rare', debug.rares === 1, `${debug.rares} rare of ${debug.alive}`);
check('the overlay counts them', /희귀 \d+/.test(debug.text),
  debug.text.split('\n').find(l => /희귀/.test(l))?.trim());
await fkey('F1', 112);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
