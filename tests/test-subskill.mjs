import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 0.76: a 무작위 스킬 spins the 슬롯머신 (one reroll) for a 보조 스킬; a
// 보조 스킬 can take 강화 슬롯; a level-up picks the skill, then 피해 or
// 공격속도; a 룬 that does nothing for a skill cannot go in; and the survivor
// dresses for the main skill.

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
const ev = (expr) => cdp.evaluate(expr);
const run = (body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('GameScene'); ${body} })()`);
const scene = (key, body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('${key}'); ${body} })()`);
const active = (key) => ev(`(() => window.game.scene.isActive('${key}'))()`);

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
await sleep(800);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4500);

// --- 1. the survivor's look follows the main skill ---
const look = await run(`
  s.player.setInvulnerable(true); s.spawner.clear(); s.spawner.update = () => {};
  const p = s.player;
  return { look: p.look, tex: p.texture.key, main: s.mainSkill, w: Math.round(p.displayWidth), body: Math.round(p.body.width),
           drawn: window.config.PLAYER_LOOK.drawn, size: window.config.PLAYER.size, has: Object.keys(window.config.PLAYER_LOOK.bySkill) };
`);
check('the survivor wears its main skill’s look', look.look === look.main && look.tex === `tex-look-${look.main}`, JSON.stringify(look));
check('drawn bigger than its body, which stays the size it was', look.w === look.drawn && look.body === look.size, JSON.stringify(look));
check('every skill has a look of its own', ['meleeStrike', 'fireball', 'chainLightning', 'iceSpear', 'voidOrb', 'thunderStrike'].every((id) => look.has.includes(id)));
const faces = await run(`
  const p = s.player;
  p.heading.set(-1, 0); p.setFlipX(false);
  // What update does with a heading to the left:
  if (p.heading.x < -0.01) p.setFlipX(true);
  return p.flipX;
`);
check('and faces the way it walks', faces === true);
await run(`s.player.setFlipX(false); return 1;`);
await shot('subskill-01-look');

// --- 2. a 무작위 스킬: the 슬롯머신, one reroll, a 보조 스킬 ---
const dropped = await run(`
  const c = s.combat, p = s.player;
  c.dropRandomSkillAt(p.x + 40, p.y);
  const d = c.randomSkillDrops.getChildren().find((x) => x.active);
  const label = d.nameplate.text;
  c.onRandomSkillTouch(p, d);
  return { label };
`);
await sleep(600);
const slot = await scene('SlotScene', `return { title: s.payload.title, items: s.payload.items.map((i) => i.label), rerolls: s.rerollsLeft };`);
check('a 무작위 스킬 lies under its name, and walking over it spins the 슬롯머신', dropped.label === '무작위 스킬' && (await active('SlotScene')) && slot.title === '무작위 스킬',
  JSON.stringify({ dropped, slot }));
check('over the skills not held, with one reroll', slot.items.length === 5 && !slot.items.includes('타격') && slot.rerolls === 1, JSON.stringify(slot));
await sleep(300);
await scene('SlotScene', `s.press(); return 1;`);
await sleep(1500);
const landed = await scene('SlotScene', `return { landed: s.landed, open: window.game.scene.isActive('SlotScene') };`);
check('landed with a reroll left, it waits on 획득 or 다시 돌리기', landed.open && landed.landed !== null, JSON.stringify(landed));
await shot('subskill-02-landed');
await scene('SlotScene', `s.reroll(); return 1;`);
await sleep(200);
const again = await scene('SlotScene', `return { spinning: s.reel.isSpinning, rerolls: s.rerollsLeft, landed: s.landed };`);
check('다시 돌리기 spins it again, once', again.spinning && again.rerolls === 0 && again.landed === null, JSON.stringify(again));
const want = await scene('SlotScene', `window.__choice = 2; s.payload.choose = () => 2; s.press(); return s.payload.items[2].label;`);
await sleep(2200);
const gained = await run(`return { open: window.game.scene.isActive('SlotScene'), held: s.skillsHeld, main: s.mainSkill, choosing: s.choosing,
  toast: s.toasts.lines.slice(-1)[0] ?? '', slots: s.kit.socketsOf(s.skillsHeld[1]).length };`);
check('the second landing is taken by itself: a 보조 스킬, the main skill unchanged', !gained.open && gained.held.length === 2 &&
  gained.main === 'meleeStrike' && gained.held[0] === 'meleeStrike' && /보조 스킬/.test(gained.toast) && !gained.choosing, JSON.stringify({ want, gained }));
check('a 보조 스킬 starts with no 강화 슬롯', gained.slots === 0, JSON.stringify(gained));

// A 룬 끌 can give it one; a 룬 that does nothing for it cannot go in.
const sub = gained.held[1];
const socket = await run(`
  const k = s.kit, sub = '${sub}';
  k.addSlot(sub);
  const works = Object.values(window.config.RUNES).find((r) => !r.skills || r.skills.includes(sub)).id;
  const useless = Object.values(window.config.RUNES).find((r) => r.skills && !r.skills.includes(sub))?.id ?? null;
  return { slots: k.socketsOf(sub).length, works, useless };
`);
check('a 룬 끌 gives a 보조 스킬 a 강화 슬롯', socket.slots === 1, JSON.stringify(socket));
await run(`s.scene.pause(); s.scene.launch('RuneScene', { kit: s.kit, skills: s.skillsHeld, onClose: () => s.scene.resume() }); return 1;`);
await sleep(700);
const refuse = await scene('RuneScene', `
  const k = s.payload.kit, sub = '${sub}';
  s.select(sub, 0);
  ${socket.useless ? `k.addRune('${socket.useless}'); const no = s.setRune('${socket.useless}'); const said = s.status.text;` : 'const no = false; const said = "-";'}
  k.addRune('${socket.works}');
  const yes = s.setRune('${socket.works}');
  return { no, said, yes, slot: k.socketsOf(sub)[0] };
`);
check('a 룬 that does nothing for the skill cannot go in; one that does can', refuse.no === false && (refuse.said === '-' || /장착할 수 없는/.test(refuse.said)) &&
  refuse.yes === true && refuse.slot === socket.works, JSON.stringify(refuse));
await shot('subskill-03-runes');
await scene('RuneScene', `s.close(); return 1;`);
await sleep(300);

// --- 3. a level-up: the skill first, then 피해 or 공격속도 ---
await run(`s.progression.addXp(s.progression.xpToNext); return 1;`);
await sleep(700);
const pick = await scene('SkillPickScene', `return { options: s.payload.options, title: s.payload.title, subtitle: s.payload.subtitle };`);
check('with two skills held, a level-up asks which one first', (await active('SkillPickScene')) && pick.options.length === 2 &&
  pick.options.includes('meleeStrike') && pick.options.includes(sub), JSON.stringify(pick));
await shot('subskill-04-levelpick');
await sleep(300);
await scene('SkillPickScene', `s.pick(s.payload.options.indexOf('${sub}')); return 1;`);
await sleep(700);
const up = await scene('UpgradeScene', `return { skill: s.payload.skill, options: s.payload.options.map((o) => o.id), subtitle: s.payload.subtitle };`);
check('then 피해 or 공격속도 for the skill picked, and nothing else', (await active('UpgradeScene')) && up.skill === sub &&
  JSON.stringify([...up.options].sort()) === JSON.stringify(['attackSpeed', 'damage']) && /보조 스킬/.test(up.subtitle), JSON.stringify(up));
await shot('subskill-05-upgrade');
const before = await run(`return s.progression.levelFor('${sub}');`);
await sleep(300);
await ev(`(() => { const u = window.game.scene.getScene('UpgradeScene'); u.pick(u.cards[0].option.id); return 1; })()`);
await sleep(500);
const after = await run(`return { level: s.progression.levelFor('${sub}'), choosing: s.choosing };`);
check('and it goes to that skill', after.level === before + 1 && !after.choosing, `${before} -> ${after.level}`);

// One skill held: straight to its 피해 / 공격속도.
await run(`s.scene.restart({ save: null }); return 1;`);
await sleep(1500);
await run(`s.player.setInvulnerable(true); s.spawner.clear(); s.spawner.update = () => {}; s.progression.addXp(s.progression.xpToNext); return 1;`);
await sleep(700);
const solo = await ev(`(() => ({ pick: window.game.scene.isActive('SkillPickScene'), up: window.game.scene.isActive('UpgradeScene'),
  options: window.game.scene.getScene('UpgradeScene').payload?.options?.map((o) => o.id) }))()`);
check('with only the main skill, a level-up goes straight to 피해 or 공격속도', !solo.pick && solo.up &&
  JSON.stringify([...(solo.options ?? [])].sort()) === JSON.stringify(['attackSpeed', 'damage']), JSON.stringify(solo));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
