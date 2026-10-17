import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// Every screen, in every language but Korean, with nothing Korean left on
// it. The data tables are written in Korean and a locale renames what it
// knows; anything it does not know falls back — this is the suite that
// notices when a new name, line or button forgot to come along.

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

/**
 * Every visible line of text in every running scene that still has Hangul
 * in it, and which scene it is in. Containers are walked too: the slot reel
 * and the tooltip keep their text inside one.
 */
const KOREAN = `(() => {
  const hangul = /[\\uac00-\\ud7a3]/;
  const found = [];
  const walk = (key, list) => {
    for (const o of list) {
      if (o.list) walk(key, o.list);
      if (o.type === 'Text' && o.visible && o.alpha > 0 && hangul.test(o.text)) {
        found.push(key + ': ' + o.text.split(String.fromCharCode(10))
          .filter((l) => hangul.test(l)).slice(0, 2).join(' / ').slice(0, 90));
      }
    }
  };
  for (const s of window.game.scene.getScenes(true)) walk(s.scene.key, s.children.list);
  return found;
})()`;

const STOCK = `(() => {
  localStorage.setItem('exiled-survivors:gear:v2', JSON.stringify({ items: [
    { uid: 'starter', id: 'rustySword', prefixes: [], suffixes: [] },
    { uid: 'full', id: 'runedSword',
      prefixes: [{ id: 'mighty', tier: 1 }, { id: 'critical', tier: 2 }, { id: 'cruel', tier: 3 }],
      suffixes: [{ id: 'giant', tier: 1 }, { id: 'swift', tier: 4 }, { id: 'evasive', tier: 5 }] },
    { uid: 'mag', id: 'ironSword', prefixes: [{ id: 'frenzied', tier: 2 }], suffixes: [{ id: 'magnetic', tier: 3 }] },
  ], equipped: 'full' }));
  localStorage.setItem('exiled-survivors:orbs:v1', JSON.stringify({ transmute: 2, chaos: 1, awaken: 1, explode: 1 }));
  localStorage.setItem('exiled-survivors:bones:v1', JSON.stringify({ rib: 2, skull: 1 }));
  return 1;
})()`;

const overlay = async (key, extra = '{}') => {
  await ev(`(() => { const m = window.game.scene.getScene('MenuScene'); m.openOverlay('${key}', ${extra}); return 1; })()`);
  await sleep(700);
};
const close = async (key) => {
  await ev(`(() => { const s = window.game.scene.getScene('${key}'); s.scene.stop(); window.game.scene.getScene('MenuScene').scene.resume(); return 1; })()`);
  await sleep(300);
};

// The detector itself: on the Korean title it must find plenty, or a clean
// result below would mean nothing.
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await sleep(1000);
await ev(`(() => { localStorage.clear(); localStorage.setItem('exiled-survivors:settings:v1',
  JSON.stringify({ language: 'ko' })); return 1; })()`);
await cdp.send('Page.reload', {});
await sleep(4200);
const control = await ev(KOREAN);
check('the detector sees Korean when it is there', Array.isArray(control) && control.length > 3,
  `${control.length} lines on the Korean title`);

for (const lang of ['en', 'ja', 'zh']) {
  const leaks = [];
  const take = async (where) => {
    const found = await ev(KOREAN);
    for (const line of Array.isArray(found) ? found : [`${where}: ${JSON.stringify(found)}`]) {
      leaks.push(`[${where}] ${line}`);
    }
  };

  await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
  await sleep(1000);
  await ev(`(() => { localStorage.clear(); localStorage.setItem('exiled-survivors:settings:v1',
    JSON.stringify({ language: '${lang}' })); return 1; })()`);
  await ev(STOCK);
  await cdp.send('Page.reload', {});
  await sleep(4200);

  await take('title');

  await overlay('SettingsScene', '{ allowLanguage: true }');
  await take('settings');
  await close('SettingsScene');

  // The guide and the notes hold more than one page shows, so their data is
  // read as well as their screen.
  for (const topic of ['guide', 'patch']) {
    await overlay('InfoScene', `{ topic: '${topic}' }`);
    await take(topic);
    const data = await ev(`(() => {
      const s = window.game.scene.getScene('InfoScene');
      const hangul = /[\\uac00-\\ud7a3]/;
      const out = [];
      // Every chapter, tab and card — and no {placeholder} left unfilled.
      for (const c of s.chapters) for (const tb of c.tabs) for (const k of tb.cards) {
        for (const l of [c.title, tb.title, k.title, ...k.facts, ...k.lines]) {
          if (hangul.test(l) || /[{}]|undefined|NaN/.test(l)) out.push(l.slice(0, 90));
        }
      }
      return [...new Set(out)].slice(0, 12);
    })()`);
    data.forEach((line) => leaks.push(`[${topic} text] ${line}`));
    await close('InfoScene');
  }

  await overlay('CreditsScene');
  await take('credits');
  await close('CreditsScene');

  await overlay('InventoryScene');
  await ev(`(() => { const s = window.game.scene.getScene('InventoryScene'); s.menu.focus('full'); return 1; })()`);
  await take('inventory 장비');
  // 구슬 사용: every 구슬's rules, a result, and the news of a weapon destroyed.
  await ev(`(() => { const s = window.game.scene.getScene('InventoryScene'); s.pressOrb('transmute'); return 1; })()`);
  await sleep(700);
  for (const id of ['transmute', 'chaos', 'awaken', 'explode', 'mango']) {
    await ev(`(() => { window.game.scene.getScene('OrbScene').pick('${id}'); return 1; })()`);
    await sleep(150);
    await take(`orb popup ${id}`);
  }
  await ev(`(() => { const p = window.game.scene.getScene('OrbScene'); p.pick('transmute'); p.use(); return 1; })()`);
  await sleep(300);
  await take('orb popup used');
  await ev(`(() => { const p = window.game.scene.getScene('OrbScene'); p.pick('explode');
    const real = Math.random; Math.random = () => 0; try { p.use(); } finally { Math.random = real; } return 1; })()`);
  await sleep(400);
  await take('orb popup destroyed');
  if (lang === 'en') await shot('locale-02-orb-destroyed-en');
  await ev(`(() => { window.game.scene.getScene('OrbScene').close(); return 1; })()`);
  await sleep(900);
  await ev(`(() => { window.game.scene.getScene('InventoryScene').openTab('consumables'); return 1; })()`);
  await sleep(600);
  for (const id of ['orb:transmute', 'orb:explode', 'bone:rib', 'bone:skull']) {
    await ev(`(() => { window.game.scene.getScene('InventoryScene').menu.focus('${id}'); return 1; })()`);
    await take(`inventory ${id}`);
  }
  if (lang === 'en') await shot('locale-01-inventory-en');
  await close('InventoryScene');

  await overlay('PassiveScene');
  await take('passives');
  await close('PassiveScene');

  await overlay('BoneScene', '{ onStart: () => {}, onCancel: () => {} }');
  await take('bones');

  await close('BoneScene');

  // 계정, signed out and signed in, and the choice between two sets of records.
  await overlay('AccountScene', "{ reason: 'ranking' }");
  await take('account');
  await close('AccountScene');
  await ev(`(() => {
    window.account.user = { id: 'u', provider: 'google', name: 'A', rank: { name: '', emoji: '', flag: '' } };
    window.account.providers = ['google', 'facebook'];
    window.cloudSave.conflict = { local: {}, server: {}, serverAt: 1 };
    window.cloudSave.status = 'conflict';
    return 1;
  })()`);
  await overlay('AccountScene');
  await take('account signed in');
  await close('AccountScene');
  await overlay('ConflictScene');
  await take('conflict');
  await close('ConflictScene');
  await ev(`(() => { window.account.user = null; window.account.providers = []; window.cloudSave.conflict = null; window.cloudSave.status = 'off'; return 1; })()`);

  // --- a run ---
  await ev(`(() => { window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
  await sleep(1500);
  await take('run');
  await ev(`(() => {
    const s = window.game.scene.getScene('GameScene');
    s.player.setInvulnerable(true);
    const r = s.spawner.spawnRare('shooter');
    const cam = s.cameras.main;
    s.inspectAt(r.x - cam.worldView.x, r.y - cam.worldView.y);
    s.combat.dropAltarAt(s.player.x + 120, s.player.y + 90, 'rareShooters');
    s.combat.dropOrbAt(s.player.x - 120, s.player.y, 'chaos');
    s.combat.dropBoneAt(s.player.x - 120, s.player.y + 60, 'skull');
    return 1;
  })()`);
  await sleep(300);
  await take('run: rare, altar, drops');
  if (lang === 'en') await shot('locale-02-run-en');

  await ev(`(() => { const s = window.game.scene.getScene('GameScene'); s.progression.addXp(s.progression.xpToNext); return 1; })()`);
  await sleep(600);
  await take('level-up');
  await ev(`(() => { const u = window.game.scene.getScene('UpgradeScene'); u.pick(u.cards[0].option.id); return 1; })()`);
  await sleep(400);

  await ev(`(() => { const s = window.game.scene.getScene('GameScene'); s.owned.clear(); s.openStartSlot(); return 1; })()`);
  await sleep(700);
  await take('slot');
  await ev(`(() => { const s = window.game.scene.getScene('SlotScene'); s.unlocked = true; s.press(); return 1; })()`);
  await sleep(2400);

  await ev(`(() => { window.game.scene.getScene('GameScene').pauseRun(); return 1; })()`);
  await sleep(600);
  await take('pause');
  await ev(`(() => { const p = window.game.scene.getScene('PauseScene'); p.scene.stop(); window.game.scene.getScene('GameScene').scene.resume(); return 1; })()`);
  await sleep(300);

  await ev(`(() => { const s = window.game.scene.getScene('GameScene'); s.player.setInvulnerable(false);
    s.player.invulnerableUntil = 0; s.player.takeDamage(1e9); return 1; })()`);
  await sleep(1500);
  await take('game over');

  console.log(`${lang}: ${leaks.length} Korean lines`);
  leaks.slice(0, 25).forEach((l) => console.log('   ', l));
  check(`${lang}: no Korean left on any screen`, leaks.length === 0, `${leaks.length} found`);
}

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
