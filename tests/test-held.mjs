import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 0.84: every skill held gives every skill (itself included) and the
// survivor its 보유 효과 (SKILL_HELD_BONUS); and past SUB_SKILLS.max skills
// besides the main one, no other skill comes in — one that would is a potion.

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
const run = (body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);

await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(3500);
await run(`s.player.setInvulnerable(true); s.choosing = true; s.spawner.clear(); return 1;`);

// --- 1. what each held skill gives, measured against the same run without it ---
const held = await run(`
  const c = window.config, p = s.player, H = c.SKILL_HELD_BONUS;
  const measure = () => ({ crit: p.critChance, hp: p.maxHp, speed: p.moveSpeed,
    damage: s.damageOf('meleeStrike'), cooldown: s.cooldownOf('meleeStrike'), area: s.heldBonus.areaScale });
  const steps = {};
  let before = measure();
  for (const id of ['thunderStrike', 'fireball', 'iceSpear']) {
    s.acquire(id);
    const after = measure();
    steps[id] = { before, after };
    before = after;
  }
  return { steps, H, base: c.PLAYER.critChance, held: [...s.owned], heldBonus: s.heldBonus,
           gearCrit: s.gearBonus.critChanceIncrease };
`);
console.log('held:', JSON.stringify(held));
const st = held.steps;
check('낙뢰 held: the base crit chance gains its points (then the weapon’s 치명 raises that)',
  Math.abs(st.thunderStrike.after.crit - (held.base + held.H.thunderStrike.critChance) * (1 + held.gearCrit)) < 1e-9 &&
    st.thunderStrike.after.crit > st.thunderStrike.before.crit, `${st.thunderStrike.before.crit} → ${st.thunderStrike.after.crit}`);
check('화염구 held: every effect’s area grows by its share',
  Math.abs(st.fireball.after.area - held.H.fireball.areaScale) < 1e-9 && st.fireball.before.area === 1, `${st.fireball.before.area} → ${st.fireball.after.area}`);
check('얼음창 held: every skill’s damage is multiplied — 타격’s too',
  Math.abs(st.iceSpear.after.damage / st.iceSpear.before.damage - held.H.iceSpear.damageScale) < 0.01,
  `${st.iceSpear.before.damage} → ${st.iceSpear.after.damage}`);
check('nothing held is a sub skill past the limit yet', held.held.length === 4);

// The next three by themselves: pace, legs, health.
const more = await run(`
  const c = window.config, p = s.player, H = c.SKILL_HELD_BONUS;
  const r0 = { cooldown: s.cooldownOf('meleeStrike'), speed: p.moveSpeed, hp: p.maxHp };
  // 타격 (the main skill, held from the start) gives the health: read it off the fold.
  return { r0, H, hpWant: Math.round(c.PLAYER.maxHp * s.gearBonus.maxHpScale * s.heldBonus.maxHpScale),
           hpFold: s.heldBonus.maxHpScale };
`);
check('타격 held (the main skill here): max health is multiplied by its share',
  more.hpFold === more.H.meleeStrike.maxHpScale && more.r0.hp === more.hpWant, JSON.stringify(more));

// A fresh scene holding 연쇄번개 and 공허구체 besides 타격: pace and legs.
const legs = await run(`
  const c = window.config, p = s.player, H = c.SKILL_HELD_BONUS;
  s.scene.restart({ save: null });
  return 1;
`);
await sleep(1500);
const pace = await run(`
  const c = window.config, p = s.player, H = c.SKILL_HELD_BONUS;
  s.player.setInvulnerable(true); s.choosing = true; s.spawner.clear();
  const before = { cooldown: s.cooldownOf('meleeStrike'), speed: p.moveSpeed, hp: p.hp, max: p.maxHp };
  s.acquire('chainLightning');
  const mid = { cooldown: s.cooldownOf('meleeStrike') };
  s.acquire('drone');
  const after = { speed: p.moveSpeed };
  // 공허구체 (0.95): a body does contactDamageScale as much.
  p.setInvulnerable(false);
  p.hp = p.maxHp;
  let h = p.hp; p.takeContact(10); const plain = h - p.hp;
  s.acquire('voidOrb');
  p.hp = p.maxHp;
  h = p.hp; p.takeContact(10); const less = h - p.hp;
  p.hp = p.maxHp;
  p.setInvulnerable(true);
  return { before, mid, after, H, min: c.STATS.minCooldownMs, plain, less };
`);
check('연쇄번개 held: every skill goes off faster by its share',
  Math.abs(pace.before.cooldown / pace.mid.cooldown - pace.H.chainLightning.attackSpeedScale) < 0.02 || pace.mid.cooldown === pace.min,
  `${pace.before.cooldown}ms → ${pace.mid.cooldown}ms`);
check('드론 held: the survivor moves faster by its share (공허구체’s until 0.95)',
  Math.abs(pace.after.speed / pace.before.speed - pace.H.drone.moveSpeedScale) < 1e-6, `${pace.before.speed} → ${pace.after.speed}`);
check('공허구체 held: an enemy’s body does less by its share',
  Math.abs(pace.less - pace.plain * pace.H.voidOrb.contactDamageScale) < 1e-6, `${pace.plain} → ${pace.less}`);

// The card says so.
const card = await run(`
  s.hud.update(0, s.spawner.alive, s.loadout(), s.effectsNow());
  const read = (id) => { s.hud.point(s.loadout().findIndex((l) => l.id === id)); const text = s.hud.cardText.text; s.hud.point(-1); return text; };
  return { drone: read('drone'), voidOrb: read('voidOrb') };
`);
check('the skill’s card on the HUD carries its 보유 효과',
  /보유 효과/.test(card.drone) && /이동속도/.test(card.drone) && /접촉 피해/.test(card.voidOrb),
  [card.drone, card.voidOrb].map((t) => t.split('\n').find((l) => /보유/.test(l))).join(' / '));

// --- 2. 보조 스킬: three besides the main one, then only what is held ---
const full = await run(`
  const c = window.config;
  // Filled to the slots (the 보유 효과 checks above took three already since 0.95).
  for (const id of ['fireball', 'iceSpear', 'thunderStrike']) {
    if ([...s.owned].filter((x) => x !== s.mainSkill).length < c.SUB_SKILLS.max) s.acquire(id);
  }
  const subs = [...s.owned].filter((id) => id !== s.mainSkill);
  const isFull = s.subSkillsFull;
  // What a skill drop and a 무작위 스킬 can be now.
  const dropped = new Set(), carded = new Set();
  for (let i = 0; i < 400; i++) { const d = s.rollSkillDrop(1, true); if (d) dropped.add(d.id); }
  for (let i = 0; i < 100; i++) s.randomSkills().forEach((id) => carded.add(id));
  const notHeld = c.DROPPABLE_SKILLS ? null : null;
  return { subs, max: c.SUB_SKILLS.max, isFull, dropped: [...dropped], carded: [...carded], owned: [...s.owned] };
`);
console.log('full:', JSON.stringify(full));
check('three sub skills besides the main one fill the slots', full.subs.length === full.max && full.isFull === true, JSON.stringify(full.subs));
check('then only skills already held drop', full.dropped.length > 0 && full.dropped.every((id) => full.owned.includes(id)), full.dropped.join(','));
check('and only skills already held come up on a 무작위 스킬', full.carded.length > 0 && full.carded.every((id) => full.owned.includes(id)), full.carded.join(','));

// A skill that dropped before the slots filled: a potion, not a fifth skill.
const late = await run(`
  const p = s.player;
  p.hp = Math.max(1, p.maxHp - 80);
  const hp = p.hp;
  const missing = ['meleeStrike', 'fireball', 'chainLightning', 'iceSpear', 'voidOrb', 'thunderStrike'].find((id) => !s.owned.has(id));
  s.onSkillCollected(missing);
  return { missing, owned: [...s.owned], healed: p.hp - hp, toast: s.toasts.lines.slice(-1)[0] ?? '' };
`);
check('a skill not held, picked up with the slots full, is a potion instead',
  !late.owned.includes(late.missing) && late.healed > 0 && /보조 스킬이 가득/.test(late.toast), JSON.stringify(late));
await shot('held-01');

const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
