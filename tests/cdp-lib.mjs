export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function connect(port = 9333) {
  const base = `http://127.0.0.1:${port}`;
  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await (await fetch(`${base}/json/list`)).json();
      if (targets.some((t) => t.type === 'page')) break;
    } catch {}
    await sleep(250);
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let nextId = 1;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((r) => {
    const id = nextId++; pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  // A minimised or covered Chrome window makes the page hidden, and Phaser
  // stops its loop when that happens: the boot scene never hands over and
  // every check in every suite fails at once, for a reason that has nothing
  // to do with the game. The override lives on the session, so it is set
  // here rather than once by the runner.
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  // And raise the window, so key events land and the renderer is not
  // throttled for being behind something else.
  await send('Page.bringToFront');
  // Say who is driving, before any page script runs: the game turns off the
  // things that wait on a person (the 슬롯머신 at the start of a run), so a
  // suite that starts a run from the title still lands in play.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__harness = true;' });

  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(() => { try { return JSON.stringify(${expr}); } catch (e) { return JSON.stringify({ __err: String(e) }); } })()`, returnByValue: true });
    const v = r.result?.result?.value;
    return v ? JSON.parse(v) : { __err: 'no value', raw: JSON.stringify(r).slice(0, 200) };
  };

  const key = (type, code, vk, k) => send('Input.dispatchKeyEvent', {
    type, code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
  });
  const tap = async (code, vk, k, holdMs = 60) => {
    await key('keyDown', code, vk, k);
    await sleep(holdMs);
    await key('keyUp', code, vk, k);
  };

  return { send, evaluate, key, tap, close: () => ws.close() };
}

export const STATE = `(() => {
  const g = window.game;
  const s = g.scene.getScene('GameScene');
  const sm = g.scene;
  return {
    hp: s.player.hp,
    level: s.progression.level,
    xp: s.progression.xp,
    xpToNext: s.progression.xpToNext,
    damage: s.progression.damage,
    attackSpeed: s.progression.attackSpeed,
    cooldownMs: Math.round(s.progression.cooldownMs),
    enemies: s.spawner.alive,
    projectiles: s.weapon.projectiles.countActive(true),
    choosing: s.choosing,
    over: s.over,
    levelUpOpen: sm.isActive('LevelUpScene'),
    gameOverOpen: sm.isActive('GameOverScene'),
  };
})()`;
