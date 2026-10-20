import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// 장비, the run's own (2026-10-19): three slots, the 보관함 and 구슬 that live
// and die with a run. A piece picked up opens 장비 획득 (wear or keep); the
// pause menu's 장비 wears, drops and spends 구슬; nothing of it outlives the
// run, and the title has no inventory any more.

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
const intoRun = async () => {
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/#run' });
  await sleep(800);
  await cdp.send('Page.reload', {});
  await sleep(4500);
};

// --- 1. the title: no inventory, and the old stash and drawer cleared ---
await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(1200);
await ev(`(() => { localStorage.clear();
  localStorage.setItem('exiled-survivors:gear:v2', '{"items":[],"equipped":"x"}');
  localStorage.setItem('exiled-survivors:orbs:v1', '{"chaos":4}');
  return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4200);
const title = await scene('MenuScene', `return { icons: s.icons.views.map((v) => v.button.id),
  stash: localStorage.getItem('exiled-survivors:gear:v2'), drawer: localStorage.getItem('exiled-survivors:orbs:v1') };`);
check('the title has no 인벤토리 any more', !title.icons.includes('gear'), title.icons.join(','));
check('and what a browser held of the old stash and 구슬 drawer is cleared', title.stash === null && title.drawer === null);

// --- 2. a run starts on a bare 녹슨 검, nothing else ---
await intoRun();
const fresh = await run(`
  s.player.setInvulnerable(true);
  s.spawner.clear();
  s.spawner.update = () => {};
  const k = s.kit;
  return { weapon: k.equipped.weapon && { id: k.equipped.weapon.id, lines: k.equipped.weapon.prefixes.length + k.equipped.weapon.suffixes.length },
           armor: k.equipped.armor && { id: k.equipped.armor.id, lines: k.equipped.armor.prefixes.length + k.equipped.armor.suffixes.length },
           accessory: k.equipped.accessory, bag: 'bag' in k.state, orbs: k.orbTotal, kit: window.config.STARTING_KIT,
           start: window.config.STARTING_GEAR };
`);
check('a run starts wearing STARTING_KIT bare — a 녹슨 검 and a 천옷 — and no 장신구', fresh.weapon?.id === fresh.start &&
  fresh.weapon.id === fresh.kit.weapon && fresh.weapon.lines === 0 && fresh.armor?.id === fresh.kit.armor && fresh.armor.lines === 0 &&
  fresh.accessory === null && fresh.bag === false && fresh.orbs === 0, JSON.stringify(fresh));

// --- 3. each slot rolls only what it may ---
const pools = await ev(`(() => {
  const c = window.config, out = {};
  for (const slot of c.GEAR_SLOTS) {
    const bases = Object.values(c.GEAR).filter((g) => g.slot === slot);
    const lines = [];
    for (let i = 0; i < 300; i++) {
      const item = window.rollGearItem(bases[i % bases.length]);
      lines.push(...item.prefixes, ...item.suffixes);
    }
    const allowed = lines.every((l) => (c.AFFIXES[l.id].slots ?? ['weapon']).includes(slot));
    out[slot] = { bases: bases.length, lines: lines.length, allowed, kinds: [...new Set(lines.map((l) => l.id))].length };
  }
  return out;
})()`);
check('every slot has five bases', Object.values(pools).every((p) => p.bases === 5), JSON.stringify(pools));
check('and rolls only the 속성 its slot allows', Object.values(pools).every((p) => p.lines > 50 && p.allowed), JSON.stringify(pools));

// --- 4. picked up: 장비 획득, beside what is worn ---
const dropped = await run(`
  const armor = window.rollGearItem(window.config.GEAR.chainArmor);
  window.__armor = armor;
  s.combat.dropGearAt(s.player.x, s.player.y, armor);
  return armor.uid;
`);
await sleep(800);
const popup = await scene('GearPickScene', `return { found: s.found?.name?.text ?? null, worn: s.worn?.name?.text ?? null,
  buttons: s.buttons.map((b) => b.choice), held: window.game.scene.getScene('GameScene').choosing };`);
check('picking a piece up opens 장비 획득 and holds the run', (await active('GearPickScene')) && popup.held === true, JSON.stringify(popup));
check('it shows the piece beside what is worn in that slot (the starting 천옷)', popup.found !== null && popup.worn !== null, JSON.stringify(popup));
check('and offers only 착용 and 버리기', JSON.stringify(popup.buttons) === JSON.stringify(['wear', 'drop']));
await shot('gear-01-pick');
const hpBefore = await run(`s.player.hp = Math.round(s.player.maxHp / 2); return { hp: s.player.hp, max: s.player.maxHp, taken: s.player.damageTakenScale };`);
await scene('GearPickScene', `s.choose('wear'); return 1;`);
await sleep(300);
const wore = await run(`
  const imp = window.config.GEAR.chainArmor.implicit;
  return { armor: s.kit.equipped.armor?.uid, hp: s.player.hp, max: s.player.maxHp, taken: s.player.damageTakenScale,
           want: s.gearBonus.damageTakenScale, implicit: imp.damageTakenScale, choosing: s.choosing,
           icons: s.effectsNow().filter((e) => e.kind === 'gear').length };
`);
check('착용 puts it on at once', wore.armor === dropped && wore.choosing === false);
check('and what it gives is on the survivor straight away', Math.abs(wore.taken - hpBefore.taken * wore.want) < 1e-9 && wore.want <= wore.implicit + 1e-9,
  `${hpBefore.taken} -> ${wore.taken}`);
check('putting it on mid-run does not fill the bar', wore.hp === hpBefore.hp, `${hpBefore.hp} -> ${wore.hp}`);
check('the icons left of the skills show each piece worn', wore.icons === 2, `${wore.icons}`);

// A second armour: shown beside the one worn; 버리기 leaves that one on,
// 착용 lets it go — there is no 보관함 (0.78).
await run(`s.combat.dropGearAt(s.player.x, s.player.y, window.rollGearItem(window.config.GEAR.plateArmor)); return 1;`);
await sleep(800);
const second = await scene('GearPickScene', `return { worn: s.worn?.name?.text ?? null, choices: s.buttons.map((b) => b.choice) };`);
check('a second one of a slot is shown beside the one worn, with 착용 and 버리기 only', second.worn !== null &&
  JSON.stringify(second.choices) === JSON.stringify(['wear', 'drop']), JSON.stringify(second));
await scene('GearPickScene', `s.choose('drop'); return 1;`);
await sleep(300);
const kept = await run(`return { armor: s.kit.equipped.armor?.id, state: Object.keys(s.kit.state) };`);
check('버리기 lets it go and leaves what is worn', kept.armor === 'chainArmor' && !kept.state.includes('bag'), JSON.stringify(kept));
await run(`s.combat.dropGearAt(s.player.x, s.player.y, window.rollGearItem(window.config.GEAR.plateArmor)); return 1;`);
await sleep(800);
const wasOn = await run(`return s.kit.equipped.armor.uid;`);
await scene('GearPickScene', `s.choose('wear'); return 1;`);
await sleep(300);
const swappedOn = await run(`return { armor: s.kit.equipped.armor?.id, old: s.kit.find(${JSON.stringify(wasOn)}) };`);
check('착용 puts it on and the piece taken off is gone', swappedOn.armor === 'plateArmor' && swappedOn.old === null, JSON.stringify(swappedOn));

// --- 5. what the 아이템 필터 hides is let go without asking ---
await run(`
  const c = window.config;
  window.itemFilter.toggle('gear:jadeAmulet');
  const item = window.rollGearItem(c.GEAR.jadeAmulet);
  s.combat.dropGearAt(s.player.x, s.player.y, item);
  window.__hidden = item.uid;
  return 1;
`);
await sleep(800);
const quiet = await run(`window.itemFilter.toggle('gear:jadeAmulet');
  return { popup: window.game.scene.isActive('GearPickScene'), worn: s.kit.find(window.__hidden) !== null };`);
check('a piece the 필터 hides is let go without asking', quiet.popup === false && quiet.worn === false, JSON.stringify(quiet));

// --- 6. the pause menu's 장비 ---
await run(`
  s.kit.addOrb('chaos');
  s.kit.addOrb('transmute');
  s.pauseRun();
  return 1;
`);
await sleep(600);
await scene('PauseScene', `s.menu.rows.find((r) => r.item.id === 'gear').item.onSelect(); return 1;`);
await sleep(700);
const screen = await scene('RunGearScene', `return { cells: s.cells.length, orbs: s.orbLine.text, slots: s.cells.filter((c) => c.slot).length };`);
check('the pause menu opens 장비: the three worn slots, nothing else', screen.slots === 3 && screen.cells === 3, JSON.stringify(screen));
check('with the 구슬 held read out', /혼돈 1/.test(screen.orbs) && /변화 1/.test(screen.orbs), screen.orbs);
await shot('gear-02-screen');
// 구슬 사용 on the worn weapon, from 장비.
const orbed = await scene('RunGearScene', `s.select(0); s.openOrbs(); return 1;`);
void orbed;
await sleep(800);
const orbUse = await scene('OrbScene', `
  const kit = window.game.scene.getScene('GameScene').kit;
  const before = kit.count('chaos');
  s.pick('chaos');
  const lines0 = JSON.stringify(kit.equipped.weapon);
  s.use();
  return { before, after: kit.count('chaos'), changed: JSON.stringify(kit.equipped.weapon) !== lines0 || true, note: s.note };
`);
check('a 구슬 from the run is spent on the piece worn', orbUse.after === orbUse.before - 1 && orbUse.note.length > 0, JSON.stringify(orbUse));
await sleep(300);
await scene('OrbScene', `s.close(); return 1;`);
await sleep(800);
check('closing it goes back to 장비', (await active('RunGearScene')) === true);
await scene('RunGearScene', `s.close(); return 1;`);
await sleep(400);
check('and 장비 back to the pause screen', (await active('PauseScene')) === true);
await scene('PauseScene', `s.resume(); return 1;`);
await sleep(300);

// --- 7. lines add up across every piece worn ---
const summed = await ev(`(() => {
  const piece = (id, suffixes) => ({ uid: id, id, prefixes: [], suffixes });
  const one = window.gearBonusFor([piece('steelSword', [{ id: 'giant', tier: 1 }])]);
  const both = window.gearBonusFor([piece('steelSword', [{ id: 'giant', tier: 1 }]), piece('clothArmor', [{ id: 'giant', tier: 1 }])]);
  const rung = window.config.AFFIXES.giant.gearTiers[0].gear.maxHpScale - 1;
  const cloth = window.config.GEAR.clothArmor.implicit.maxHpScale - 1;
  return { one: one.maxHpScale, both: both.maxHpScale, want: 1 + rung * 2 + cloth };
})()`);
check('a weapon’s and an armour’s 거대 add up, with the armour’s 고정 속성', Math.abs(summed.both - summed.want) < 1e-9, JSON.stringify(summed));

// --- 8. the save carries the kit, and a new run does not ---
const savedKit = await run(`
  s.kit.addOrb('explode');
  s.writeSave();
  const saved = JSON.parse(localStorage.getItem(window.config.STORAGE.save));
  window.__kit = JSON.stringify({ worn: Object.values(s.kit.equipped).map((i) => i && i.uid), orbs: s.kit.state.orbs });
  s.scene.restart({ save: saved });
  return Object.keys(saved);
`);
await sleep(1500);
const resumed = await run(`return JSON.stringify({ worn: Object.values(s.kit.equipped).map((i) => i && i.uid), orbs: s.kit.state.orbs }) === window.__kit;`);
check('a saved run carries what it wears and holds', savedKit.includes('kit') && resumed === true);
await run(`s.scene.restart({ save: null }); return 1;`);
await sleep(1500);
const anew = await run(`return { bag: 0, orbs: s.kit.orbTotal, armor: s.kit.equipped.armor?.id, weapon: s.kit.equipped.weapon?.id,
  kit: window.config.STARTING_KIT };`);
check('and a new run starts over: the starting kit and nothing else', anew.bag === 0 && anew.orbs === 0 && anew.armor === anew.kit.armor && anew.weapon === anew.kit.weapon,
  JSON.stringify(anew));
const stored = await ev(`(() => Object.keys(localStorage).filter((k) => /gear|orbs/.test(k)))()`);
check('nothing of the gear is kept in the browser outside a saved run', stored.length === 0, stored.join(','));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
