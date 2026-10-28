import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

// Every screen, in every language but Korean, with nothing Korean left on
// it. The data tables are written in Korean and a locale renames what it
// knows; anything it does not know falls back — this is the suite that
// notices when a new name, line or button forgot to come along.
//
// Rewritten for 0.153 (the language choice back on): it walks the title as
// it is now — 게임 시작 and its icons, the prophecy line — every screen an
// icon opens, every tab they have, and a run from its first pick to its end.
// Each step that fails to open its screen is reported as such, so a renamed
// method can no longer make the walk see nothing and pass.

const cdp = await connect();
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
 * in it, and which scene it is in. Containers are walked too: the toasts,
 * the slot reel and the tooltip keep their text inside one.
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
    { uid: 'starter', id: 'rustySword', prefixes: [], suffixes: [], rungs: 7 },
    { uid: 'full', id: 'runedSword', rungs: 7,
      prefixes: [{ id: 'mighty', tier: 1 }, { id: 'critical', tier: 2 }, { id: 'culling', tier: 3 }],
      suffixes: [{ id: 'giant', tier: 1 }, { id: 'thorny', tier: 4 }, { id: 'apothecary', tier: 5 }] },
    { uid: 'mag', id: 'ironSword', rungs: 7, prefixes: [{ id: 'frenzied', tier: 2 }, { id: 'wide', tier: 3 }], suffixes: [{ id: 'magnetic', tier: 3 }, { id: 'gathering', tier: 2 }] },
  ], equipped: 'starter' }));
  localStorage.setItem('exiled-survivors:orbs:v1', JSON.stringify({ transmute: 2, chaos: 1, awaken: 1, explode: 1, mango: 1, engrave: 1 }));
  localStorage.setItem('exiled-survivors:bones:v1', JSON.stringify({ rib: 2, skull: 1, tailbone: 1 }));
  return 1;
})()`;

const menuUp = () => cdp.until(`(() => { const m = window.game?.scene?.getScene('MenuScene'); return !!(m && m.scene.isActive() && m.icons && m.menu); })()`, 30000, 200);
const active = (key) => ev(`window.game.scene.isActive('${key}')`);
/** Stops an overlay and gives the title back. */
const close = async (key) => {
  await ev(`(() => { const s = window.game.scene.getScene('${key}'); s.scene.stop(); const m = window.game.scene.getScene('MenuScene'); if (m.scene.isPaused()) m.scene.resume(); return 1; })()`);
  await sleep(250);
};

// The detector itself: on the Korean title it must find plenty, or a clean
// result below would mean nothing.
await cdp.send('Page.navigate', { url: 'about:blank' });
await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
await menuUp();
await ev(`(() => { localStorage.clear(); localStorage.setItem('exiled-survivors:settings:v1', JSON.stringify({ language: 'ko' })); return 1; })()`);
await cdp.send('Page.reload', {});
await menuUp();
await sleep(500);
const control = await ev(KOREAN);
check('the detector sees Korean when it is there', Array.isArray(control) && control.length > 3,
  `${control.length} lines on the Korean title`);

for (const lang of ['en', 'ja', 'zh']) {
  const leaks = [];
  const unopened = [];
  const take = async (where) => {
    const found = await ev(KOREAN);
    for (const line of Array.isArray(found) ? found : [`${where}: ${JSON.stringify(found)}`]) {
      leaks.push(`[${where}] ${line}`);
    }
  };
  /** Runs `body` in the page and takes the screen once `key` is up; says so when it never comes. */
  const open = async (key, body, where = key) => {
    const r = await ev(`(() => { ${body}; return 1; })()`);
    if (r?.__err) { unopened.push(`${where}: ${r.__err}`); return false; }
    const up = await cdp.until(`window.game.scene.isActive('${key}')`, 8000, 100);
    if (!up) { unopened.push(where); return false; }
    await sleep(450);
    await take(where);
    return true;
  };
  const step = async (where, body, wait = 400) => {
    const r = await ev(`(() => { ${body}; return 1; })()`);
    if (r?.__err) { unopened.push(`${where}: ${r.__err}`); return; }
    await sleep(wait);
    await take(where);
  };

  await cdp.send('Page.navigate', { url: 'about:blank' });
  await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
  await menuUp();
  await ev(`(() => { localStorage.clear(); localStorage.setItem('exiled-survivors:settings:v1', JSON.stringify({ language: '${lang}' })); return 1; })()`);
  await ev(STOCK);
  await cdp.send('Page.reload', {});
  await menuUp();
  // The prophecy line, as the title shows it on a day with rules.
  await ev(`(() => { window.__dailyOn = true; window.game.scene.getScene('MenuScene').scene.restart(); return 1; })()`);
  await sleep(300);
  await menuUp();
  await sleep(600);
  await take('title');
  if (lang === 'en') await shot('locale-00-title-en');
  const press = (id) => `window.game.scene.getScene('MenuScene').icons.press('${id}')`;

  // 인벤토리: a weapon's read-out, every 구슬's rules, a use and a destruction, the 소모품 tab, 분해 · 제작.
  if (await open('InventoryScene', press('gear'), 'inventory')) {
    await step('inventory: a full weapon', `window.game.scene.getScene('InventoryScene').menu.focus('full')`);
    if (await open('OrbScene', `window.game.scene.getScene('InventoryScene').pressOrb('transmute')`, 'orb popup')) {
      for (const id of ['transmute', 'chaos', 'awaken', 'explode', 'mango', 'engrave']) {
        await step(`orb popup ${id}`, `window.game.scene.getScene('OrbScene').pick('${id}')`, 150);
      }
      await step('orb popup used', `const p = window.game.scene.getScene('OrbScene'); p.pick('transmute'); p.use()`, 300);
      await step('orb popup destroyed', `const p = window.game.scene.getScene('OrbScene'); p.pick('explode');
        const real = Math.random; Math.random = () => 0; try { p.use(); } finally { Math.random = real; }`, 400);
      if (lang === 'en') await shot('locale-01-orb-en');
      await ev(`(() => { window.game.scene.getScene('OrbScene').close(); return 1; })()`);
      await cdp.until(`window.game.scene.isActive('InventoryScene') && !window.game.scene.isActive('OrbScene')`, 8000, 100);
      await sleep(500);
    }
    await step('inventory 소모품', `window.game.scene.getScene('InventoryScene').openTab('consumables')`, 600);
    for (const id of ['orb:engrave', 'bone:tailbone', 'bone:skull']) {
      await step(`inventory ${id}`, `window.game.scene.getScene('InventoryScene').menu.focus('${id}')`, 150);
    }
    if (await open('ForgeScene', `window.game.scene.getScene('InventoryScene').openForge()`, 'forge')) {
      for (const tab of ['single', 'bulk', 'craft']) {
        await step(`forge ${tab}`, `window.game.scene.getScene('ForgeScene').openTab('${tab}')`, 600);
      }
      await close('ForgeScene');
    }
    await close('InventoryScene');
  }

  if (await open('PassiveScene', press('passives'), 'talents')) await close('PassiveScene');
  if (await open('RankingScene', press('ranking'), 'ranking')) {
    await step('ranking 내 기록', `window.game.scene.getScene('RankingScene').setTab('personal')`, 500);
    await close('RankingScene');
  }
  if (await open('FilterScene', press('filter'), 'filter')) await close('FilterScene');
  if (await open('AutoPickScene', press('autoPick'), 'battle plan')) {
    for (const tab of ['upgrades', 'shards']) {
      await step(`battle plan ${tab}`, `window.game.scene.getScene('AutoPickScene').openTab('${tab}')`, 500);
    }
    await close('AutoPickScene');
  }
  if (await open('SettingsScene', press('settings'), 'settings')) {
    for (const tab of ['sound', 'display']) {
      await step(`settings ${tab}`, `window.game.scene.getScene('SettingsScene').openTab('${tab}')`, 600);
    }
    await open('CreditsScene', `const s = window.game.scene.getScene('SettingsScene'); s.menu.rows.find((r) => r.item.id === 'credits').item.onSelect()`, 'credits');
    await close('CreditsScene');
    await close('SettingsScene');
  }
  for (const topic of ['guide', 'patch']) {
    if (await open('InfoScene', press(topic), topic)) {
      // The guide and the notes hold more than one page shows, so their data is read too.
      const data = await ev(`(() => {
        const s = window.game.scene.getScene('InfoScene');
        const hangul = /[\\uac00-\\ud7a3]/;
        const out = [];
        for (const c of s.chapters) for (const tb of c.tabs) for (const k of tb.cards) {
          for (const l of [c.title, tb.title, k.title, ...k.facts, ...k.lines]) {
            if (hangul.test(l) || /[{}]|undefined|NaN/.test(l)) out.push(l.slice(0, 90));
          }
        }
        return [...new Set(out)].slice(0, 12);
      })()`);
      (Array.isArray(data) ? data : [JSON.stringify(data)]).forEach((line) => leaks.push(`[${topic} text] ${line}`));
      await close('InfoScene');
    }
  }
  if (await open('TuningScene', press('tuning'), 'balance')) {
    for (const tab of ['enemies', 'drops', 'daily']) {
      await ev(`(() => { const s = window.game.scene.getScene('TuningScene'); s.scene.restart({ ...s.payload, tab: '${tab}' }); return 1; })()`);
      await sleep(600);
      await take(`balance ${tab}`);
    }
    await close('TuningScene');
  }
  // 계정 (the corner icon is there only with accounts on, never on the harness): signed out, then in.
  await open('AccountScene', `window.game.scene.getScene('MenuScene').scene.launch('AccountScene', { reason: 'ranking' })`, 'account');
  await close('AccountScene');

  await open('BoneScene', `window.game.scene.getScene('MenuScene').scene.launch('BoneScene', { onStart: () => {}, onCancel: () => {} })`, 'battle prep');
  await close('BoneScene');

  // 계정, signed in, and the choice between two sets of records.
  await ev(`(() => {
    window.account.user = { id: 'u', provider: 'google', name: 'A', rank: { name: '', emoji: '', flag: '' } };
    window.account.providers = ['google', 'facebook'];
    window.cloudSave.conflict = { local: {}, server: {}, serverAt: 1 };
    window.cloudSave.status = 'conflict';
    return 1;
  })()`);
  await open('AccountScene', `window.game.scene.getScene('MenuScene').scene.launch('AccountScene', {})`, 'account signed in');
  await close('AccountScene');
  await open('PodiumScene', `window.game.scene.getScene('MenuScene').scene.launch('PodiumScene', { day: Date.now() - 86400000, onClose: () => {}, entries: [
    { name: 'ONE', emoji: '', flag: 'KR', damage: 3000000, level: 20, survivedMs: 820000, at: '', skill: 'fireball', wins: 2, seconds: 0, thirds: 0 },
    { name: 'TWO', emoji: '', flag: 'US', damage: 2000000, level: 19, survivedMs: 760000, at: '', skill: 'chainLightning', wins: 0, seconds: 1, thirds: 0 },
    { name: 'THR', emoji: '', flag: '', damage: 1000000, level: 18, survivedMs: 700000, at: '', skill: '', wins: 0, seconds: 0, thirds: 1 } ] })`, 'podium');
  await close('PodiumScene');
  if (await open('ConflictScene', `window.game.scene.getScene('MenuScene').scene.launch('ConflictScene', {})`, 'conflict')) {
    await step('conflict ask', `window.game.scene.getScene('ConflictScene').ask('server')`, 200);
    await close('ConflictScene');
  }
  await ev(`(() => { window.account.user = null; window.account.providers = []; window.cloudSave.conflict = null; window.cloudSave.status = 'off'; return 1; })()`);

  // --- a run: the first pick, the field, a level-up, the 파편 pick, the pause, a save, the end ---
  await ev(`(() => { window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
  await cdp.until(`(() => { const s = window.game.scene.getScene('GameScene'); return !!(s && s.scene.isActive() && s.hud && s.player); })()`, 20000, 200);
  await sleep(800);
  await take('run');
  if (await open('SkillPickScene', `const s = window.game.scene.getScene('GameScene'); s.player.setInvulnerable(true); s.openStartPick()`, 'first skill pick')) {
    await cdp.until(`window.game.scene.getScene('SkillPickScene').unlocked === true`, 8000, 100);
    if (lang === 'en') await shot('locale-02-skillpick-en');
    await ev(`(() => { const p = window.game.scene.getScene('SkillPickScene'); p.pick(p.cards.findIndex((c) => !c.banned)); return 1; })()`);
    await cdp.until(`!window.game.scene.isActive('SkillPickScene')`, 8000, 100);
    await sleep(300);
  }
  await step('run: rare, altar, drops', `
    const s = window.game.scene.getScene('GameScene');
    s.player.setInvulnerable(true);
    const r = s.spawner.spawnRare('shooter');
    const cam = s.cameras.main;
    s.inspectAt(r.x - cam.worldView.x, r.y - cam.worldView.y);
    s.combat.dropAltarAt(s.player.x + 120, s.player.y + 90, 'rareShooters');
    s.combat.dropOrbAt(s.player.x - 120, s.player.y, 'engrave');
    s.combat.dropBoneAt(s.player.x - 120, s.player.y + 60, 'tailbone');`, 400);
  if (lang === 'en') await shot('locale-03-run-en');
  // Every effect on the HUD (the weapon, the prophecy, …), its card as a touch opens it: no hold.
  const effects = await ev(`window.game.scene.getScene('GameScene').hud.effects.length`);
  if (!(effects > 0)) unopened.push('run: no effect icons');
  for (let i = 0; i < effects; i++) {
    await step(`run: effect card ${i}`, `window.game.scene.getScene('GameScene').hud.pointEffect(${i}, true)`, 200);
  }
  await ev(`(() => { window.game.scene.getScene('GameScene').hud.pointEffect(-1, true); return 1; })()`);
  if (await open('UpgradeScene', `const s = window.game.scene.getScene('GameScene'); s.progression.addXp(s.progression.xpToNext)`, 'level-up')) {
    await ev(`(() => { const u = window.game.scene.getScene('UpgradeScene'); u.pick(u.cards[0].option.id); return 1; })()`);
    await cdp.until(`!window.game.scene.isActive('UpgradeScene')`, 8000, 100);
    await sleep(300);
  }
  if (await open('UpgradeScene', `window.game.scene.getScene('GameScene').openShardPick('')`, 'shard pick')) {
    await ev(`(() => { const u = window.game.scene.getScene('UpgradeScene'); u.pick(u.cards[0].option.id); return 1; })()`);
    await cdp.until(`!window.game.scene.isActive('UpgradeScene')`, 8000, 100);
    await sleep(300);
  }
  if (await open('PauseScene', `window.game.scene.getScene('GameScene').pauseRun()`, 'pause')) {
    if (await open('AutoPickScene', `const p = window.game.scene.getScene('PauseScene'); p.menu.rows.find((r) => r.item.id === 'autoPick').item.onSelect()`, 'battle plan mid-run')) {
      await ev(`(() => { const a = window.game.scene.getScene('AutoPickScene'); a.close ? a.close() : a.scene.stop(); return 1; })()`);
      await cdp.until(`!window.game.scene.isActive('AutoPickScene')`, 8000, 100);
      await sleep(300);
    }
    // Save and quit, then 게임 시작 asks about the saved run.
    await ev(`(() => { const p = window.game.scene.getScene('PauseScene'); p.menu.rows.find((r) => r.item.id === 'quit').item.onSelect(); return 1; })()`);
    await menuUp();
    await sleep(500);
    await open('ConfirmScene', `const m = window.game.scene.getScene('MenuScene'); m.menu.rows[0].item.onSelect()`, 'continue or new');
    await ev(`(() => { window.game.scene.getScene('ConfirmScene').scene.stop(); const m = window.game.scene.getScene('MenuScene'); if (m.scene.isPaused()) m.scene.resume(); return 1; })()`);
    await sleep(300);
  }

  await ev(`(() => { localStorage.removeItem('exiled-survivors:save:v1'); window.game.scene.getScene('MenuScene').scene.start('GameScene', { save: null }); return 1; })()`);
  await cdp.until(`(() => { const s = window.game.scene.getScene('GameScene'); return !!(s && s.scene.isActive() && s.player); })()`, 20000, 200);
  await sleep(600);
  await open('GameOverScene', `const s = window.game.scene.getScene('GameScene'); s.player.setInvulnerable(false);
    s.player.invulnerableUntil = 0; s.player.takeDamage(1e9)`, 'game over');
  if (lang === 'en') await shot('locale-04-gameover-en');

  console.log(`${lang}: ${leaks.length} Korean lines, ${unopened.length} screens not reached`);
  leaks.slice(0, 25).forEach((l) => console.log('   ', l));
  unopened.forEach((l) => console.log('    not reached:', l));
  check(`${lang}: every screen on the walk was reached`, unopened.length === 0, unopened.join(' | '));
  check(`${lang}: no Korean left on any screen`, leaks.length === 0, `${leaks.length} found: ${leaks.slice(0, 30).join(' || ')}`);
}

await ev(`(() => { localStorage.clear(); return 1; })()`);

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
process.exit(0);
