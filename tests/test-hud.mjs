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

await cdp.send('Page.reload', {});
await sleep(4000);

// Pull the actual fillRect calls out of each Graphics' command buffer, so
// the assertions measure what is drawn rather than what we meant to draw.
const probe = `(() => {
  const s = window.game.scene.getScene('GameScene');
  // Phaser's Graphics command buffer is flat numeric opcodes:
  // 7 = FILL_STYLE (colour, alpha), 3 = FILL_RECT (x, y, w, h).
  const rects = (g) => {
    const buf = g.commandBuffer || [];
    const out = [];
    for (let i = 0; i < buf.length;) {
      if (buf[i] === 3) { out.push(buf.slice(i + 1, i + 5)); i += 5; }
      else if (buf[i] === 7) { i += 3; }
      else { i += 1; }
    }
    return out;
  };
  return {
    view: { w: window.game.scale.width, h: window.game.scale.height },
    clock: { x: s.hud.clockLabel.x, y: s.hud.clockLabel.y, ox: s.hud.clockLabel.originX, text: s.hud.clockLabel.text },
    xpBarRects: rects(s.hud.xpBar),
    hpBarRects: rects(s.player.healthBar),
    hpBarDepth: s.player.healthBar.depth,
    player: { x: Math.round(s.player.x), y: Math.round(s.player.y), hp: s.player.hp },
  };
})()`;

const d = await cdp.evaluate(probe);
console.log('probe:', JSON.stringify(d));

if (d.__err || !d.xpBarRects) {
  console.log('could not read command buffers; falling back to object checks only');
}

// --- clock: top centre ---
check('clock is horizontally centred', d.clock.x === d.view.w / 2 && d.clock.ox === 0.5,
  `x=${d.clock.x} (half=${d.view.w / 2}) originX=${d.clock.ox}`);
check('clock sits at the top', d.clock.y <= 20, `y=${d.clock.y}`);

// --- xp bar: full width, bottom edge ---
const xpTrack = d.xpBarRects?.[0];
if (xpTrack) {
  const [x, y, w, h] = xpTrack;
  check('xp bar spans the full width', x === 0 && w === d.view.w, `x=${x} w=${w} (view=${d.view.w})`);
  check('xp bar is flush with the bottom', Math.round(y + h) === d.view.h, `y=${y} h=${h} bottom=${y + h} (view=${d.view.h})`);
} else {
  check('xp bar spans the full width', false, 'no fillRect found');
  check('xp bar is flush with the bottom', false, 'no fillRect found');
}

// --- hp bar: 20x2 above the player ---
const hpTrack = d.hpBarRects?.[0];
if (hpTrack) {
  const [x, y, w, h] = hpTrack;
  check('hp bar is 60x6 (3x)', w === 60 && h === 6, `${w}x${h}`);
  check('hp bar is centred on the player', Math.round(x + w / 2) === d.player.x, `centre=${x + w / 2} player=${d.player.x}`);
  check('hp bar sits above the sprite', y + h <= d.player.y - 10, `barBottom=${y + h} spriteTop=${d.player.y - 10}`);
} else {
  check('hp bar is 60x6 (3x)', false, 'no fillRect found');
}
check('hp bar draws above the crowd', d.hpBarDepth === 55, `depth=${d.hpBarDepth}`);

// --- the bar tracks the player and its health ---
await cdp.key('keyDown', 'KeyD', 68, 'd');
await sleep(900);
await cdp.key('keyUp', 'KeyD', 68, 'd');
await sleep(300);
const moved = await cdp.evaluate(probe);
const movedTrack = moved.hpBarRects?.[0];
check('hp bar follows the player', movedTrack && Math.round(movedTrack[0] + movedTrack[2] / 2) === moved.player.x,
  `barCentre=${movedTrack ? movedTrack[0] + movedTrack[2] / 2 : 'n/a'} player=${moved.player.x}`);

const maxHp = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  s.player.invulnerableUntil = 0;
  const before = s.player.hp;
  s.player.takeDamage(10);
  // Max health is tuned in balance.ts, so the expected width is read, not assumed.
  return { max: before, now: s.player.hp };
})()`);
await sleep(300);
const hurt = await cdp.evaluate(probe);
const fill = hurt.hpBarRects?.[1];
const wantWidth = Math.round(60 * (maxHp.now / maxHp.max));
check('hp bar fill shrinks with damage', fill && Math.round(fill[2]) === wantWidth,
  `fillWidth=${fill ? Math.round(fill[2]) : 'n/a'} of 60 at hp=${maxHp.now}/${maxHp.max}`);

await shot('hud-layout');

// --- the enemy count moved under the clock ---
const counts = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const h = s.hud;
  return {
    skills: { text: h.skillsLabel.text, x: Math.round(h.skillsLabel.x), y: Math.round(h.skillsLabel.y),
              size: h.skillsLabel.style.fontSize, stroke: h.skillsLabel.style.strokeThickness },
    enemies: { text: h.enemiesLabel.text, x: Math.round(h.enemiesLabel.x),
               y: Math.round(h.enemiesLabel.y), ox: h.enemiesLabel.originX },
    clock: { x: Math.round(h.clockLabel.x), y: Math.round(h.clockLabel.y),
             bottom: Math.round(h.clockLabel.y + h.clockLabel.height) },
    hasStats: h.statsLabel !== undefined,
  };
})()`);
console.log('counts:', JSON.stringify(counts));
check('the enemy count is centred under the clock',
  counts.enemies.x === counts.clock.x && counts.enemies.ox === 0.5 &&
    counts.enemies.y >= counts.clock.bottom - 4,
  `count at ${counts.enemies.x},${counts.enemies.y}; clock ends at ${counts.clock.bottom}`);
check('it reads as a count of enemies', /적\s*\d+/.test(counts.enemies.text), counts.enemies.text);
check('the corner holds the loadout and nothing else',
  counts.hasStats === false && counts.skills.text.startsWith('타격'),
  counts.skills.text.split('\n')[0]);


// --- the level and health ride above the health bar ---
const plate = await cdp.evaluate(`(() => {
  const s = window.game.scene.getScene('GameScene');
  const p = s.player;
  return {
    text: p.nameplate.text,
    x: Math.round(p.nameplate.x), y: Math.round(p.nameplate.y),
    ox: p.nameplate.originX, oy: p.nameplate.originY,
    res: p.nameplate.style.resolution,
    depth: p.nameplate.depth, barDepth: p.healthBar.depth,
    player: { x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, max: p.maxHp ?? null },
    level: s.progression.level,
  };
})()`);
console.log('nameplate:', JSON.stringify(plate));
check('the player wears a level and a health reading',
  new RegExp('Lv\\s*' + plate.level + '\\s+' + plate.player.hp + '/\\d+').test(plate.text),
  plate.text);
check('centred on the player, above the bar',
  plate.x === plate.player.x && plate.ox === 0.5 && plate.oy === 1 && plate.y < plate.player.y,
  `plate at ${plate.x},${plate.y}; player at ${plate.player.x},${plate.player.y}`);
check('it draws with the bar, over the crowd', plate.depth === plate.barDepth,
  `depth ${plate.depth}`);

// --- every label is drawn to be read ---
const sharp = await cdp.evaluate(`(() => {
  const g = window.game;
  const all = [];
  for (const s of g.scene.scenes) {
    if (!s.scene.isActive() && !s.scene.isPaused()) continue;
    s.children.list.forEach(o => {
      if (o.type !== 'Text') return;
      all.push({
        scene: s.scene.key,
        t: o.text.slice(0, 14),
        px: parseFloat(o.style.fontSize),
        res: o.style.resolution,
        stroke: o.style.strokeThickness,
        colour: o.style.color,
      });
    });
  }
  return {
    dpr: window.devicePixelRatio,
    count: all.length,
    soft: all.filter(x => !(x.res > 1)),
    tiny: all.filter(x => x.px < 15),
    bare: all.filter(x => !(x.stroke > 0)),
  };
})()`);
console.log('text:', JSON.stringify({ dpr: sharp.dpr, count: sharp.count,
  soft: sharp.soft.length, tiny: sharp.tiny.length, bare: sharp.bare.map(x => x.t) }));
check('every label renders above 1x',
  sharp.count > 0 && sharp.soft.length === 0,
  `${sharp.count} labels, ${sharp.soft.length} still at 1x`);
check('nothing is printed smaller than the smallest step on the ladder',
  sharp.tiny.length === 0,
  sharp.tiny.map(x => `${x.t} ${x.px}px`).join(' / ') || 'nothing under 15px');
// Only the dropped skill's own name opts out: dark ink on a pale plate.
check('and every one of them has a dark outline behind it',
  sharp.bare.length === 0,
  sharp.bare.map(x => x.t).join(' / ') || 'all outlined');

// The readout sits straight on the playfield, so it is the one that needs it.
const outlined = await cdp.evaluate(`(() => {
  const h = window.game.scene.getScene('GameScene').hud;
  return { stroke: h.skillsLabel.style.strokeThickness, colour: h.skillsLabel.style.stroke,
           clock: h.clockLabel.style.strokeThickness };
})()`);
check('the outline is dark, and thicker on bigger type',
  outlined.stroke >= 2 && outlined.clock >= outlined.stroke &&
    outlined.colour.toLowerCase() === '#05070b',
  `readout ${outlined.stroke}px, clock ${outlined.clock}px, in ${outlined.colour}`);


console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.p);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) console.log('failed:', failed.map((f) => f.n).join(' | '));
console.log(failed.length ? 'RESULT: FAIL' : 'RESULT: PASS');
cdp.close();
