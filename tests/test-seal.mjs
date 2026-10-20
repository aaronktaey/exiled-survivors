import { connect, sleep } from './cdp-lib.mjs';

// The seal on the records a player could gain by editing (systems/Seal.ts):
// the saved run and the passive tree. What the game writes is sealed; one
// changed outside the game is not taken; one from before the seal is taken
// and sealed while SEAL.graceUntil lasts, and not after; what comes over
// from the old address is sealed as it lands.

const cdp = await connect(9333);
const results = [];
const check = (n, p, d = '') => {
  results.push({ n, p });
  console.log(`${p ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`);
};
const ev = (expr) => cdp.evaluate(expr);
const SAVE = 'exiled-survivors:save:v1';
const TREE = 'exiled-survivors:passives:v1';
const reload = async () => {
  await cdp.send('Page.reload', {});
  await sleep(4200);
};
const loadOffered = () => ev(`(() => {
  const m = window.game.scene.getScene('MenuScene');
  return m.menu.items.find((i) => i.id === 'load').enabled();
})()`);
const legacyRun = { version: 1, savedAt: 1, elapsedMs: 120000, level: 4, xp: 2, hp: 50,
  skills: { meleeStrike: { damage: 201, attackSpeed: 1, range: 71.2, projectileSpeed: 0, chainCount: 0, pierceCount: 0, orbCount: 0, orbitSpeed: 0 } },
  spawnerMs: 120000 };

await cdp.send('Emulation.clearDeviceMetricsOverride', {});
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(1000);
await ev(`(() => { localStorage.clear(); return 1; })()`);
await reload();

// --- 1. what the game writes is sealed ---
await ev(`(() => { window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
await sleep(1500);
const written = await ev(`(() => {
  const s = window.game.scene.getScene('GameScene');
  s.writeSave();
  window.passives.reset();
  window.passives.allocate('warrior.s1');
  const save = localStorage.getItem('${SAVE}'), tree = localStorage.getItem('${TREE}');
  return { save: JSON.parse(save)._s !== undefined, tree: JSON.parse(tree)._s !== undefined,
           saveOpen: window.openRecord('${SAVE}', save).state, treeOpen: window.openRecord('${TREE}', tree).state };
})()`);
check('the saved run and the tree are written sealed', written.save && written.tree && written.saveOpen === 'sealed' && written.treeOpen === 'sealed',
  JSON.stringify(written));

// --- 2. a saved run changed outside the game is not offered, and goes ---
await ev(`(() => { window.game.scene.getScene('GameScene').scene.start('MenuScene'); return 1; })()`);
await sleep(1500);
check('a sealed save is offered to 불러오기', (await loadOffered()) === true);
await ev(`(() => {
  const raw = JSON.parse(localStorage.getItem('${SAVE}'));
  raw.skills.meleeStrike.damage = 99999;
  localStorage.setItem('${SAVE}', JSON.stringify(raw));
  return 1;
})()`);
await reload();
const edited = { offered: await loadOffered(), kept: await ev(`(() => localStorage.getItem('${SAVE}'))()`) };
check('one edited by hand is not offered, and is thrown away', edited.offered === false && edited.kept === null, JSON.stringify(edited));

// --- 3. the tree, edited by hand, starts over ---
await ev(`(() => {
  const raw = JSON.parse(localStorage.getItem('${TREE}'));
  raw.allocated = ['warrior.s1', 'warrior.s2', 'warrior.s3'];
  localStorage.setItem('${TREE}', JSON.stringify(raw));
  return 1;
})()`);
await reload();
const tree = await ev(`(() => window.passives.value)()`);
check('a tree edited by hand starts over', tree.allocated.length === 0, JSON.stringify(tree));

// --- 4. records from before the seal: taken and sealed in the grace, refused after ---
await ev(`(() => {
  localStorage.setItem('${SAVE}', ${JSON.stringify(JSON.stringify(legacyRun))});
  localStorage.setItem('${TREE}', JSON.stringify({ version: 3, allocated: ['warrior.s1', 'warrior.s2'] }));
  return 1;
})()`);
await reload();
const graced = await ev(`(() => ({ points: window.passives.value.allocated.length, resealed: JSON.parse(localStorage.getItem('${TREE}'))._s !== undefined,
  grace: window.config.SEAL.graceUntil > Date.now() }))()`);
const graceOffered = await loadOffered();
check('while the grace lasts, records from before the seal are taken', graced.grace && graced.points === 2 && graceOffered === true, JSON.stringify(graced));
check('and the tree is written back sealed at once', graced.resealed === true);
const after = await ev(`(() => {
  localStorage.setItem('${SAVE}', ${JSON.stringify(JSON.stringify(legacyRun))});
  const was = window.config.SEAL.graceUntil;
  window.config.SEAL.graceUntil = 0;
  const save = window.openRecord('${SAVE}', localStorage.getItem('${SAVE}')).state;
  window.config.SEAL.graceUntil = was;
  return save;
})()`);
check('after it, a record with no seal is refused like an edited one', after === 'tampered', after);

// --- 5. what comes over from the old address is sealed as it lands ---
const items = { [TREE]: JSON.stringify({ version: 3, allocated: ['warrior.s1', 'warrior.s2', 'warrior.s3', 'warrior.s4', 'warrior.s5'] }) };
const carry = Buffer.from(JSON.stringify({ v: 1, items }), 'utf8').toString('base64url');
await ev(`(() => { localStorage.clear(); return 1; })()`);
await cdp.send('Page.navigate', { url: 'about:blank' });
await sleep(300);
await cdp.send('Page.navigate', { url: `http://localhost:5173/#carry=${carry}` });
await sleep(4200);
const carried = await ev(`(() => ({ points: window.passives.value.allocated.length, sealed: JSON.parse(localStorage.getItem('${TREE}') || '{}')._s !== undefined }))()`);
check('a tree brought from the old address lands sealed, and counts', carried.points === 5 && carried.sealed, JSON.stringify(carried));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
