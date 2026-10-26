// 재능의 파편 (0.102): one shared roll off a kill (0.104), the stat it lands as
// weighed by the passive tree, never pulled in (only the 자석 takes it), every stat where it acts, the cards a maxed skill turns into, the 도망자 and 키메라's
// certain shard, the save — and the enemies dampened alongside.
import { connect, sleep } from './cdp-lib.mjs';
import { writeFileSync } from 'node:fs';

const cdp = await connect(Number(process.env.CDP_PORT ?? 9333));
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
const scene = (key, body) => cdp.evaluate(`(() => { const s = window.game.scene.getScene('${key}'); ${body} })()`);

await sleep(1500);
await run(`s.player.setInvulnerable(true); s.spawner.update = () => {}; s.spawner.clear(); return 1;`);

try {
  // --- 1. the drop: an 일반 one (0.111) — a white name, no pillar — taken by touch or 자석 ---
  const dropped = await run(`
    const C = window.config, c = s.combat, p = s.player;
    c.dropTalentShardAt(p.x + 200, p.y, 'area');
    const d = c.talentShardDrops.getChildren().find((x) => x.active);
    const out = { active: !!d, stat: d?.stat, name: d?.nameplate.label.text, tier: d?.nameplate.tier, pillar: d?.nameplate.pillar?.visible,
      own: d?.tintTopLeft === C.TALENT_SHARD_FX.tint.area, filter: C.ALL_FILTER_KEYS.includes('talentShard') };
    // Stood beside it a while: nothing pulls it in.
    const x0 = d.x, y0 = d.y;
    p.setPosition(d.x - 60, d.y);
    out.stays = true;
    out.at = [Math.round(d.x - x0), Math.round(d.y - y0)];
    out.life = d.remainingMs;
    out.lifespan = C.GROUND_ITEM.lifespanMs;
    const before = s.shards.area;
    c.collectEverything();
    out.taken = !d?.active;
    out.gained = s.shards.area - before;
    return out;
  `);
  console.log('dropped:', JSON.stringify(dropped));
  check('a 재능의 파편 lands named for its stat, in its colour, as an 일반 drop (no pillar), with its 필터 switch, and the 자석 takes it',
    dropped.active && dropped.stat === 'area' && dropped.name === '효과범위 파편' && dropped.own && dropped.tier === 'normal' &&
      dropped.pillar === false && dropped.filter && dropped.taken && dropped.gained === 1, JSON.stringify(dropped));

  // --- 1b. the 재능의 덩어리 (0.111): one stat, TALENT_LUMP.shards of it, a 신화 drop ---
  const lump = await run(`
    const C = window.config, c = s.combat, p = s.player;
    c.dropTalentShardAt(p.x + 200, p.y, 'maxHp', true);
    const d = c.talentShardDrops.getChildren().find((x) => x.active);
    const out = { name: d?.nameplate.label.text, tier: d?.nameplate.tier, lump: d?.lump, texture: d?.texture.key,
      pillar: d?.nameplate.pillar?.visible, red: d?.nameplate.pillar?.tintTopLeft === C.DROP_LABEL.tiers.mythic.pillar,
      filter: C.ALL_FILTER_KEYS.includes('talentLump'), want: C.TALENT_LUMP.shards };
    const before = s.shards.maxHp;
    c.collectEverything();
    out.gained = s.shards.maxHp - before;
    out.toast = s.toasts.lines.some((line) => /재능의 덩어리/.test(line));
    // The pool hands the same sprite back: a 파편 after a 덩어리 is a 파편 again.
    c.dropTalentShardAt(p.x + 200, p.y, 'maxHp');
    const again = c.talentShardDrops.getChildren().find((x) => x.active);
    out.after = { lump: again?.lump, texture: again?.texture.key, tier: again?.nameplate.tier };
    again?.collect();
    return out;
  `);
  check('a 재능의 덩어리 lands named for its stat, 신화 in a red pillar, with a 필터 switch, and gives that stat TALENT_LUMP.shards shards',
    lump.name === '최대체력 덩어리' && lump.tier === 'mythic' && lump.lump === true && lump.pillar === true && lump.red &&
      lump.filter && lump.gained === lump.want && lump.toast && lump.texture !== lump.after.texture &&
      lump.after.lump === false && lump.after.tier === 'normal',
    JSON.stringify(lump));
  check('like any item it lasts GROUND_ITEM.lifespanMs on the ground', dropped.life > 0 && dropped.life <= dropped.lifespan,
    JSON.stringify({ life: dropped.life, lifespan: dropped.lifespan }));

  // The chance turned to 1 and to 0 rather than Math.random pinned: a pinned roll
  // drops everything else too, and Phaser's new Text trips on it (CLAUDE.md).
  const flat = await run(`
    const C = window.config, c = s.combat, p = s.player, g = s.spawner.group;
    const was = C.TALENT_SHARD.chance;
    const live = () => c.talentShardDrops.getChildren().filter((x) => x.active);
    const count = () => live().length;
    c.talentShardDrops.getChildren().forEach((x) => x.active && x.collect());
    const kill = () => { const e = g.get(p.x + 300, p.y); e.spawn(p.x + 300, p.y, p, 'grunt', s.spawner.hooks); c.hit(e, 1e9); };
    C.TALENT_SHARD.chance = 1;
    kill();
    const sure = count();
    const stats = live().map((x) => x.stat);
    c.talentShardDrops.getChildren().forEach((x) => x.active && x.collect());
    C.TALENT_SHARD.chance = 0;
    for (let i = 0; i < 20; i++) kill();
    const never = count();
    C.TALENT_SHARD.chance = was;
    s.spawner.clear();
    return { sure, never, stats, all: C.TALENT_SHARD.stats };
  `);
  check('one roll off a kill, shared by every stat: at a chance of 1, one shard of some stat; at 0, none',
    flat.sure === 1 && flat.all.includes(flat.stats[0]) && flat.never === 0, JSON.stringify(flat));

  // --- 2. the 도망자 and the 키메라 leave a 재능의 덩어리 every time, and no skill ---
  const certain = await run(`
    const c = s.combat, p = s.player, g = s.spawner.group;
    const out = {};
    for (const kind of ['fugitive', 'chimera']) {
      c.talentShardDrops.getChildren().forEach((x) => x.active && x.collect());
      c.skillDrops.getChildren().forEach((x) => x.active && x.collect());
      const e = g.get(p.x + 300, p.y); e.spawn(p.x + 300, p.y, p, kind, s.spawner.hooks);
      const precious = e.precious;
      c.hit(e, 1e9);
      out[kind] = { lumps: c.talentShardDrops.getChildren().filter((x) => x.active && x.lump).length,
        skills: c.skillDrops.getChildren().filter((x) => x.active).length, precious };
    }
    c.talentShardDrops.getChildren().forEach((x) => x.active && x.collect());
    c.skillDrops.getChildren().forEach((x) => x.active && x.collect());
    s.spawner.clear();
    return out;
  `);
  check('a 도망자 and a 키메라 always leave one 재능의 덩어리, no skill, and are still kept at the cap',
    ['fugitive', 'chimera'].every((k) => certain[k].lumps === 1 && certain[k].skills === 0 && certain[k].precious),
    JSON.stringify(certain));

  // --- 3. which stat a shard lands as: even, or as the tree weighs it (the others less) ---
  const rolls = await run(`
    const C = window.config, c = s.combat;
    const tally = () => { const n = Object.fromEntries(C.TALENT_SHARD.stats.map((st) => [st, 0])); for (let i = 0; i < 12000; i++) n[c.rollShardStat()]++; return n; };
    const even = tally();
    const was = s.mods.passive;
    const weights = { ...was.shardWeights, damage: 1 + 10 * C.PASSIVES.shardDamage.shardWeight };
    s.mods = { ...s.mods, passive: { shardWeights: weights } };
    const weighted = tally();
    s.mods = { ...s.mods, passive: was };
    return { even, weighted, weights, stats: C.TALENT_SHARD.stats };
  `);
  const share = (n, stat) => n[stat] / Object.values(n).reduce((a, b) => a + b, 0);
  const total = Object.values(rolls.weights).reduce((a, b) => a + b, 0);
  check('with no ranks, every stat comes up about as often as the others',
    rolls.stats.every((st) => Math.abs(share(rolls.even, st) - 1 / rolls.stats.length) < 0.03), JSON.stringify(rolls.even));
  check('ten ranks in a line make its stat come up by its weight, and the others less',
    Math.abs(share(rolls.weighted, 'damage') - rolls.weights.damage / total) < 0.03 &&
      share(rolls.weighted, 'area') < 1 / rolls.stats.length,
    `damage ${share(rolls.weighted, 'damage').toFixed(3)} vs ${(rolls.weights.damage / total).toFixed(3)}, area ${share(rolls.weighted, 'area').toFixed(3)}`);

  // --- 4. each stat where it acts, and the line on the HUD ---
  const acts = await run(`
    const C = window.config, p = s.player;
    // From none: the shard picked up above rolled a stat of its own.
    for (const st of C.TALENT_SHARD.stats) s.shards[st] = 0;
    s.applyShards();
    const before = { speed: p.moveSpeed, maxHp: p.maxHp, area: s.areaScale, cd: s.cooldownOf('meleeStrike'), dmg: s.damageOf('meleeStrike') };
    for (const st of C.TALENT_SHARD.stats) s.gainShard(st);
    s.gainShard('area');
    const after = { speed: p.moveSpeed, maxHp: p.maxHp, area: s.areaScale, cd: s.cooldownOf('meleeStrike'), dmg: s.damageOf('meleeStrike') };
    p.hp = p.maxHp - 50;
    const hp0 = p.hp;
    // No shard heals since 0.131 (체력회복 went): five seconds on, nothing back.
    for (let t = 0; t < 5100; t += 50) s.regenerate(50);
    return { before, after, healed: p.hp - hp0, amp: C.TALENT_SHARD.amplify, stats: C.TALENT_SHARD.stats,
      shards: s.shards,
      // 0.106: an icon on the left of the HUD, the count in its corner, the card listing each stat — and no 패시브 icon.
      icon: (() => { s.hud.update(0, 0, s.loadout(), s.effectsNow()); const effects = s.effectsNow(); const e = effects.find((x) => x.id === 'shard');
        const i = effects.indexOf(e); const slot = s.hud.effectSlots[i];
        return e ? { count: e.count, lines: e.lines, shown: slot?.icon.visible, corner: slot?.count.text, passive: effects.some((x) => x.id === 'passive') } : null; })() };
  `);
  console.log('acts:', JSON.stringify(acts));
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  check('move speed, max health, area and attack speed each go up by one shard’s 증폭',
    near(acts.after.speed / acts.before.speed, 1 + acts.amp) && Math.abs(acts.after.maxHp - acts.before.maxHp * (1 + acts.amp)) <= 1 &&
      near(acts.after.area / acts.before.area, 1 + 2 * acts.amp) && acts.after.cd < acts.before.cd && acts.after.dmg >= acts.before.dmg,
    JSON.stringify({ before: acts.before, after: acts.after }));
  check('there is no 체력회복 재능 any more (0.131): no such shard, and no health back from shards',
    !acts.stats.includes('regen') && acts.healed === 0, `${acts.stats.join(',')} · healed ${acts.healed}`);
  const held = Object.values(acts.shards).reduce((sum, n) => sum + n, 0);
  check('the HUD shows them as one icon on the left, the count in its corner, its card each stat’s total — no 패시브 icon',
    !!acts.icon && acts.icon.count === held && acts.icon.shown && acts.icon.corner === String(held) && !acts.icon.passive &&
      acts.icon.lines.some((l) => /효과범위 증폭 \+2%/.test(l)) && acts.icon.lines.length === acts.stats.length,
    JSON.stringify(acts.icon));
  await shot('shard-01-hud');

  // --- 5. a maxed main skill: its level-up is 재능의 파편 cards, three, even, and taking one is a shard ---
  const cards = await run(`
    const skill = s.mainSkill;
    const def = s.weapons.find((w) => w.definition.id === skill).definition;
    for (let i = 0; i < 300 && !s.maxed(skill); i++) for (const u of def.upgrades) s.progression.apply(skill, u);
    s.progression.addXp(s.progression.xpToNext);
    return { maxed: s.maxed(skill), level: s.progression.level };
  `);
  await sleep(700);
  const shown = await scene('UpgradeScene', `return { active: s.scene.isActive(), title: s.payload.title, subtitle: s.payload.subtitle, ids: s.payload.options.map((o) => o.id),
    count: window.config.TALENT_SHARD.choices, stats: window.config.TALENT_SHARD.stats };`);
  check('with the main skill at its top, a level-up offers TALENT_SHARD.choices 재능의 파편 cards, no potion',
    cards.maxed && shown.active && shown.title === '재능의 파편' && /메인 스킬 최고 레벨/.test(shown.subtitle) && shown.ids.length === shown.count &&
      new Set(shown.ids).size === shown.count && shown.ids.every((id) => shown.stats.includes(id)),
    JSON.stringify({ cards, shown }));
  await shot('shard-02-cards');
  const taken = await run(`
    const before = { ...s.shards };
    window.game.scene.getScene('UpgradeScene').pick(window.game.scene.getScene('UpgradeScene').payload.options[0].id);
    const id = Object.keys(s.shards).find((k) => s.shards[k] > before[k]);
    return { id, choosing: s.choosing };
  `);
  await sleep(400);
  check('taking a card is one shard of that stat, and the run goes on', !!taken.id && shown.ids[0] === taken.id, JSON.stringify(taken));

  // --- 6. a held skill at its top is never a 무작위 스킬 card (0.112) ---
  const carded = await run(`
    const seen = new Set();
    for (let i = 0; i < 300; i++) s.randomSkills().forEach((id) => seen.add(id));
    return { main: s.mainSkill, maxed: s.maxed(s.mainSkill), carded: seen.has(s.mainSkill), others: seen.size };
  `);
  check('a held skill at its top never comes up on a 무작위 스킬 card; the others still do',
    carded.maxed && !carded.carded && carded.others > 0, JSON.stringify(carded));

  // --- 6b. with nothing left to offer, the 무작위 스킬 is the cards, saying every skill is at its top ---
  const random = await run(`
    s.randomSkills = () => [];
    s.queueChoice({ kind: 'pick' });
    return 1;
  `);
  void random;
  await sleep(700);
  const viaPick = await scene('UpgradeScene', `const out = { active: s.scene.isActive(), title: s.payload.title, subtitle: s.payload.subtitle }; s.pick(s.payload.options[0].id); return out;`);
  check('a 무작위 스킬 with every skill at its top opens the same cards, saying so',
    viaPick.active && viaPick.title === '재능의 파편' && /모든 스킬 최고 레벨/.test(viaPick.subtitle), JSON.stringify(viaPick));
  await sleep(400);

  // --- 7. the save carries them ---
  const saved = await run(`s.saveRun?.(); s.writeSave?.(); return { shards: { ...s.shards } };`);
  const kept = await cdp.evaluate(`(() => { const raw = localStorage.getItem(window.config.STORAGE.save); const v = raw ? window.openRecord(window.config.STORAGE.save, raw) : null; return v?.value?.shards ?? null; })()`);
  check('the saved run carries its shards', !!kept && Object.keys(saved.shards).every((k) => (kept[k] ?? 0) === saved.shards[k]),
    JSON.stringify({ saved: saved.shards, kept }));

  // --- 8. every enemy's base health and speed are dampened (ENEMY_DAMPEN) ---
  const damp = await run(`
    const C = window.config, p = s.player, g = s.spawner.group;
    const e = g.get(p.x + 300, p.y); e.spawn(p.x + 300, p.y, p, 'brute', s.spawner.hooks);
    const out = { hp: e.hp, want: Math.round(C.ENEMY_KINDS.brute.maxHp * C.BALANCE.enemyHpScale * C.ENEMY_DAMPEN.hp),
      speed: e.currentSpeed, band: [C.ENEMY_KINDS.brute.speed * C.ENEMY_DAMPEN.speed * (1 - C.ENEMY.speedVariance), C.ENEMY_KINDS.brute.speed * C.ENEMY_DAMPEN.speed * (1 + C.ENEMY.speedVariance)] };
    s.spawner.clear();
    return out;
  `);
  check('an enemy’s base health and speed are dampened by ENEMY_DAMPEN',
    damp.hp === damp.want && damp.speed >= damp.band[0] - 1e-6 && damp.speed <= damp.band[1] + 1e-6, JSON.stringify(damp));
} catch (error) {
  check('the suite ran to the end', false, String(error?.stack ?? error));
}

// --- 0.140: 포션 회복량 — each shard adds to every potion's heal ---
const potionTalent = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene'), C = window.config, p = s.player;
  const before = s.shardBonus.potionHeal;
  s.gainShard('potionHeal', 3);
  const bonus = s.shardBonus.potionHeal;
  p.hp = 1;
  s.combat.potions.getChildren().forEach((d) => d.active && d.collect());
  s.combat.dropPotionAt(p.x, p.y);
  const potion = s.combat.potions.getChildren().find((d) => d.active);
  s.combat.onPotionTouch(p, potion);
  const healed = p.hp - 1;
  p.hp = p.maxHp;
  return { before, bonus, healed, base: C.POTION.heal, per: C.TALENT_SHARD.potionHeal,
           listed: C.TALENT_SHARD.stats.includes('potionHeal'), line: C.PASSIVES.shardPotionHeal?.shardStat,
           daily: C.DAILY_RULES.talents.includes('potionHeal') };
})()`);
console.log('potion talent:', JSON.stringify(potionTalent));
check('포션 회복량 파편: each adds its amount to every potion — three heal base + 3 × per shard',
  potionTalent.listed && potionTalent.line === 'potionHeal' && potionTalent.daily &&
    potionTalent.bonus - potionTalent.before === 3 * potionTalent.per &&
    potionTalent.healed === potionTalent.base + potionTalent.bonus,
  JSON.stringify(potionTalent));

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
