# Exiled Survivors — working notes

Vampire-Survivors-like, in the browser. Vite + TypeScript + Phaser 4.

Live at <https://exiledsurvivors.com>: one Cloudflare Worker
(`wrangler.jsonc`, `server/`) serves the game and its API, deployed on every
push to `main`. The old GitHub Pages address serves only `bridge/index.html`,
which sends players over with their records (see "Cloudflare" below).

This file is the handover between sessions. Read it first; it is written for
whoever picks the work up next, which is usually a fresh Claude Code context
with none of the previous conversation.

## How the work is split

Work is done in **separate contexts, one batch of requests at a time**, to keep
each context small and fast. That means:

- **Nothing carries over in your head between batches.** This file, the code
  and `git log` are the whole handover. If you learn something a later session
  would need and cannot read off the code, add it here in the same commit.
- **Finish a batch end to end before stopping**: implement → verify with the
  harness → patch note → `npx tsc --noEmit` → `npx vite build` → full
  regression → commit → push → wait for the Pages deploy → check it live →
  report in Korean.
- **The user tunes `src/config/balance.ts` in parallel**, between batches and
  sometimes during one. Never assume a number there is what you last saw:
  re-read it, and never hard-code one in a test (see below).

## The shape of the code

Everything that can be a table is a table, and the tables live in `src/config/`.
Adding an enemy, a skill, an 속성, a 구슬 or a 뼈다귀 should be a line in a
table plus a name in the locales — if it is more than that, the table is in the
wrong shape.

| Where | What |
| --- | --- |
| `src/config/balance.ts` | ★ the tuning file. Enemies, skills, 속성 and their tier ladders, the difficulty ramp. The user edits this directly. |
| `src/config/equipment.ts` | weapons (장비) and the 구슬 that change them |
| `src/config/bones.ts` | 뼈다귀 — what is spent before a run to change that run |
| `src/config/passives.ts` | the passive lines — 재능의 파편 drop rates, PASSIVE_POINTS each player holds (0.102) |
| `src/config/visuals.ts` | colours, depths, text sizes, texture keys, label tiers |
| `src/config/system.ts` | scene keys, storage keys, separation, tilt, timing |
| `src/entities/` | Player, Enemy, and everything that lies on the ground |
| `src/systems/` | the stores that outlive a run, and the systems a run uses |
| `src/scenes/` | one file per screen |
| `src/i18n/` | `ko` `en` `ja` `zh`, all four kept in step with `types.ts` |
| `src/content/patchNotes.ts` | the patch notes, newest first, in all four |
| `tests/` | the integration harness (below) |

### Things that bite

- **Phaser 4**, not 3. `GameObjectFactory.register` is a no-op for a type that
  already exists (we wrap `prototype.text` instead — see `SharpText.ts`);
  `Text.resolution` is undefined, use `text.style.resolution`; `setStyle` reads
  every key handed to it, so an explicit `undefined` makes the measured width
  `NaN` and the label invisible — always spell the number out.
- **A scene instance outlives a launch.** Anything a scene remembers has to be
  reset in `init()`, not just assigned in `create()`.
- **`scene.restart()` with no data reuses the last data it was started with.**
  That is how a death after 불러오기 once restarted the loaded run; pass the
  data explicitly.
- **`Enemy.update` clamps delta to `TIMING.maxDeltaMs` (50ms).** A probe that
  steps a cooldown must step in frame-sized chunks, not one big jump.
- **The canvas is the shape of the window**: short side clamped to
  [420, 540], long side 1.2–2.2× that. Screens measure their own block and
  centre it (`src/systems/Layout.ts`); landscape is only ever ~540 tall, so a
  screen that fits upright can still overflow lying down. Check both.
- **Everything the player keeps is in `localStorage`** behind `STORAGE.*`:
  the stash, the passive tree, the 철광석, the 구슬 drawer, the 뼈다귀 drawer,
  the save slot and the settings. Stores cache: writing the key behind a
  store's back does not change what the store already has in memory.

## The test harness

`tests/` drives a real Chrome over CDP against the dev server and checks the
running game, not units. 48 suites (46 in the run below), ~1200 checks. It is the only thing that has
caught most of what has gone wrong here, so run all of it before every commit.

```sh
npx vite --port 5173 --strictPort          # leave running
cd tests
node run-all.mjs test-full test-skills test-balance test-chain test-ice \
  test-void test-enemies test-rare test-boss test-potion test-sfx test-perf \
  test-hud test-expiry test-audio test-touch test-shell test-shell2 test-info \
  test-gear test-passive test-responsive test-stats test-bones \
  test-altar test-slot test-inventory test-back test-fugitive \
  test-ranking test-skillpick test-mango test-web test-loadout \
  test-carry test-api test-account test-live test-filter test-mastery \
  test-tuning test-terrain test-chimera test-seal test-gift test-held \
  test-shard test-village test-daily
```

test-i18n and test-locale are left out until the official release (the
user's word, 2026-10-20): the language choice is off (`LOCALE`, below), and
the language checks inside other suites are skipped while
`window.config.LOCALE.choosable` is false. Put both back when it is on.

`run-all.mjs` runs the suites three at a time (`WORKERS=n` to change it):
one muted Chrome per worker (`CHROME_PATH` overrides where it looks), each
with its own profile and debugging port (9333, 9334, …), handed to the suite
as `CDP_PORT` — `connect()` in cdp-lib reads it, so a suite never names a
port of its own. The longest suites start first, by the times it keeps in
`tests/.timings.json`. Before each suite it clears storage and loads `#run`
by way of `about:blank` (from the title, `#run` alone is a hash change that
loads nothing), waiting for the game rather than a fixed time. It closes the
Chromes when it is done (`KEEP_CHROME=1` to keep them for a look). The full
set takes about six minutes. One suite on its own: `node run-all.mjs test-gear`.

### Writing checks that hold up

- **Never hard-code a tuned number.** Read it off `window.config` in the page.
  Half the regressions in this harness have been the user changing a value in
  `balance.ts` and a test asserting the old one.
- **Crits are common** (`PLAYER.critChance` 0.2 for ×2 since 2026-10-18), so anything that counts swings or asserts
  an exact figure must either turn the base chance off for the measurement
  (`window.config.PLAYER.critChance = 0`, put back after) or assert "was hit"
  rather than "was hit for exactly N".
- **`cdp.evaluate` waits for the dev handles it names.** Just after a source
  edit the first page loads take ~8s while Vite transforms afresh, longer
  than any suite's fixed sleep; a probe that reads `window.ranking` (or any
  handle) first waits up to 30s for that handle and a running scene. A new
  dev handle goes in `HANDLES` in cdp-lib as well as in main.ts.
- **A hidden Chrome window stops Phaser's loop**, which fails every check at
  once for a reason that has nothing to do with the game. `cdp-lib.mjs` pins
  the page visible and raises the window on connect; leave that in.
- **Phaser calls `Math.random` when it makes a new Text.** A probe that
  pins `Math.random` to force a drop roll must first fill every pool the
  kill can draw from (drop one of each and collect it) with the real roll,
  or the first new label throws "reading 'context'" — see test-mango.
- **Wait for a state, not a clock (`cdp.until`, 2026-10-23).** `until(expr,
  timeoutMs, everyMs)` polls the page until `expr` is truthy and returns it.
  A step whose end is a state — a sync done, a screen open, a pickup taken —
  waits on that: fixed sleeps were too short with four Chromes sharing the
  machine (test-account, test-inventory, test-gear and test-skills failed
  that way, and passed alone). New checks should do the same.
- **`cdp.evaluate` hands results back as one JSON string.** Returning
  everything on screen (the patch notes, every chapter of the guide) overflows
  it and the suite dies with `undefined`. Return the answer, not the corpus.
- Dev-only handles the suites drive: `window.game`, `window.config`,
  `window.gear`, `window.orbs`, `window.bones`, `window.passives`,
  `window.ore`, `window.gearBonusFor`, `window.orbApplied`, `window.sealRecord`,
  `window.openRecord`,
  `window.critMultiplierFor`, `window.settings`. They are behind `import.meta.env.DEV`, so the
  deployed build does not have them — a live check can only click and look.
- `#run` on the dev server skips the menu and drops straight into a run.

## Before committing

1. `npx tsc --noEmit`
2. `npx vite build`
3. the full regression above, green
4. a patch note in `src/content/patchNotes.ts`, **all four languages**, as a
   **new version entry for every deploy** (0.20 → 0.21 → …; after 0.99
   came 0.100, the user's pick — the version is only ever shown, never compared). Write it by
   comparing the previous version's notes — and `git diff` since the commit
   that shipped them — with the game as it now is: only the net change, in
   its final state. No line for something added and taken out again, no
   number that has been retuned since, nothing that repeats or contradicts
   the entry below. Read every number off config, not memory. Never append
   to a version that has already deployed. (The user asked for this on
   2026-10-14, after 0.20 had grown into a log of intermediate states.)
5. commit, push, wait for the Pages run, then load the live site and look

Commit messages are Korean, and say *why* rather than restating the diff.

## Where it stands

Read `git log` for what changed and when. What is not in the log:

- **balance.ts is the default, not always the live number.** The admin's
  밸런스 panel (below) can lay values over it for everyone, stored on the
  server. Before quoting a tuned number in a patch note or a report, look at
  `npm run db -- "SELECT overrides FROM tuning"` as well as the config; a
  dial path listed there wins. When the user asks to fold the live values
  back into balance.ts, copy them over and clear the row.
  Folded on 2026-10-26 (0.133, the user's ask): all 38 live values went into
  balance.ts, equipment.ts and bones.ts. The row was not cleared — `npm run
  db` failed that day on Cloudflare auth (7403), so the live values were read
  off `GET /api/balance` instead; the row now equals the defaults and does
  nothing, and the panel's 전체 적용 drops any value equal to its default.
  Each device keeps everyone's values as last heard (`TUNING.sharedKey`,
  `ACCOUNT.localOnly`) and lays them over at boot (0.133): before, a run
  started before /api/balance answered — or one where it never did, like
  the dev server without `dev:api` — played on balance.ts, with drop rates
  up to twice the live ones, and the user felt drops come and go.
- **The user's numbers are theirs.** Tier values, drop rates, enemy health,
  potion strength — propose, do not quietly re-tune. When a request implies a
  number that would make something unplayable, implement it with a documented
  ceiling in config and say so in the report (that is why
  `BONE_RUN.maxBosses` exists).
- **One rule for the 두개골.** Every spawn that rolls rare goes through
  `SpawnDirector.place`: under the skull it is a 우두머리 while fewer than
  `BONE_RUN.maxBosses` are up, and an ordinary enemy after — never a rare.
  A 꼬리뼈 (0.136, the user's: one a run, as rare as the 두개골) makes every
  우두머리 a 키메라 — `SpawnDirector.bossKind`, read by the clock, `place`
  and a 제단's `bosses` offer; `aliveBosses` counts that kind, so the
  ceiling holds for 키메라 too. A 키메라 is not `isBoss`: it leaves its own
  drops (skill, 재능의 덩어리, 룬), not a 우두머리's weapon and 제단.
  The one exception is the 제단 (since 2026-10-18): its packs come exactly as
  offered, rare and all — it used to turn them into 우두머리 up to the
  ceiling and leave the rest plain. Do not add another spawn path that skips
  `place`.
- **No basic attack.** Every skill, 타격 included, is in `DROPPABLE_SKILLS`;
  a fresh run holds only what it picks off three cards (`SkillPickScene`,
  `SKILL_PICK`), and that first skill is the run's **main skill**
  (`GameScene.mainSkill`, kept in the save as `main`): every level-up
  upgrades it; once it has taken every upgrade, a level-up (or a repeat
  pickup of any maxed skill) heals a 체력 포션's worth instead
  (`drinkForMaxedSkill`, said plainly: 포션 효과! and the health over the
  survivor, a green burst, a `heal` toast naming the skill) — it never moves
  on to another skill. Every upgrade stops at its pick count
  (`UPGRADE_MAX_PICKS`; `UPGRADE_CAP` is empty since 0.83, so what gear adds
  — an extra orb — comes on top and never counts against it), so every
  skill does get there. 0.83's picks (the user's): 타격 공격 범위 (`range`,
  +10% ×5), 화염구 폭발 범위 (`blastRadius`, a SKILL_BASE stat now, +15% ×5),
  낙뢰 처치 시 재시전 (`recastChance`, base 0.3, +0.1 ×5, shown in points —
  `UPGRADE_SHOWN_AS_CHANCE`), and 연쇄/관통/구체 수 at five picks each; the
  투사체 속도 pick is gone, its eight-pick state (speed and reach ×2.2) the
  base. A save from before is restored no lower than today's base
  (`GameScene` restore loop). A skill found
  later is upgraded by finding it again. (Level-ups once went to a random skill; the user read that as the
  main skill changing, and asked for this.) With the
  choice off (`#run`, the harness) a run starts on `UNSPUN_SKILL` (타격) so
  suites have something deterministic. A 무작위 스킬 on the ground opens the
  same three cards; taking one already held queues its upgrade next.
- **The slot sound is one file in two parts** (`AUDIO.slot`: run / stop),
  levelled quiet on purpose — the user found the first mix far too loud.
  `tools/mix-slot.py` rebuilds `public/assets/slot.mp3` from
  `assets-src/slot` and prints the offsets to copy into config. The jackpot
  clips in `assets-src/slot` are kept for later: do not use or delete them
  (their copies in `public/assets` went in 0.109, with everything else the
  game did not load).
- **Every other language is checked for Korean.** Data tables are written in
  Korean and a locale renames what it knows (`names.*`); `test-locale` walks
  every screen in en/ja/zh and fails on any Hangul left on it. A new name,
  line or button needs its entry in all three, and a weapon tier line goes
  through `names.affixGearDetails` with `{value}`.
- **Back buttons.** Every screen but the title and the run calls
  `addBackButton` (top-left, arrow only below 600 wide) with the same exit
  Esc takes; `test-back` checks each one sits clear and goes where it
  should. A new screen should do the same.
- **At the cap the weakest gives way (0.86).** A spawn due with
  `SPAWN.maxAlive` reached picks its kind first and calls
  `SpawnDirector.makeRoom(kind)`: of that kind (0.134, the user's ask — the
  weakest of any kind left only 거구), else of any, the active enemy with the
  least health left that does not `alwaysDropsSkill` (so never a
  우두머리, 키메라 or 도망자) is recycled — no kill, no gem, no drop — and the
  newcomer takes its place. The pool often hands that very sprite back:
  compare `Enemy.lives`, not `active`, to tell. An `ALTAR_OFFERS` entry with
  `castOnArrival` (the 키메라's) throws its ring as it lands
  (`Enemy.castVolleyNow`).
- **A 제단 is summoned (0.85).** A kill's 제단 goes through
  `CombatSystem.summonAltarAt`: a red pillar (`ALTAR_SUMMON_FX`, the light
  pillar tinted) comes down, and `ALTAR.summonDelayMs` later `dropAltarAt`
  puts it there — stepped by `combat.update(dt)` from GameScene, so a pause
  holds it. `dropAltarAt` itself is still immediate (debug keys, tests).
- **제단 chain on purpose.** A 우두머리 leaves a 제단 at `ALTAR.fromBoss` (a
  tenth since 2026-10-18 — at every one, a 두개골 run drowned in them),
  ordinary kills leave one at `ALTAR.fromKill`, and a 제단 can call up 우두머리, which leave 제단. It is opt-in — nothing
  happens until the survivor walks up — so it is not capped. An altar arms only
  after the survivor has been outside its radius once.
- **The 슬롯머신 is generic, and unused for now.** `SlotScene` takes labels,
  icons, an optional `choose()` and an `onResult(index)`; `SlotReel` is the
  reel on its own. Runs no longer start on it (that is three cards now); it
  is kept for the equipment work the user has in mind. Phaser 4 has no
  `setMask` under WebGL — the reel fades its edges instead of clipping them.
- **What the harness switches off.** `cdp-lib` marks every page with
  `window.__harness`, and on the dev server that (or `#run`) turns off
  `SKILL_PICK.atRunStart`, `RANKING.promptOnDeath` and `RANKING.shared` —
  so suites land in play, the end screen is what they expect, and no test
  ever writes to the real shared ranking. A suite that wants one of them
  turns it back on (`test-skillpick`, `test-ranking`, which also replaces
  `fetch` with an in-page stand-in for the shared board).
- **The 인벤토리 replaced the 장비창.** `InventoryScene` (tabs 장비 · 소모품)
  draws every tab on `ItemGrid`, a 6×12 grid that keeps MenuList's handles
  (`items`, `selected`, `selectedId`, `focus`, `step`, `refresh`) — which is
  why most of test-gear survived the swap. A tap only picks a cell; acting is
  the buttons beside it or Space. The title icon's id is still `gear`.
- **A popup holds the shots too (0.114).** A level-up or a pick holds the
  run with `physics.pause()` only; groups with `runChildUpdate` still update.
  `Projectile` and `EnemyShot` hold their clocks while
  `scene.physics.world.isPaused` — they used to run out standing still and
  be gone when the cards closed — and so does every `GroundItem` (0.115:
  a drop's minute, an altar's), and every `Enemy` (0.136: a 사수 and a
  우두머리 kept firing behind the cards, and the shots, held still, all came
  at once when they closed — the user saw a flood after every pick; a
  도망자's lifespan holds too). A probe that steps enemies by hand must do
  it on a run that is not paused — a dead run is (test-enemies reloads after
  its crowd check for that). Anything new with a life of its own in an
  update should do the same (test-skills §8).
- **Three ways to steer on a phone (0.117).** 설정's 모바일 이동 방식
  cycles 터치 위치에 생성 (VirtualJoystick) · 기울이기 (TiltInput) · 탭으로
  이동 (`systems/TapMove.ts`, the user's ask): it walks to where the screen
  was pressed, follows a held finger (re-reading the world point each frame
  as the camera moves), walks on to the last point when let go and stops
  within `TAP_MOVE.arriveRadius`, a faint ring marking it. All three are
  `AnalogInput`s built in `GameScene.buildAnalog`; the settings hint names
  the next one ▶ reaches.
- **A rare's mark follows its figure (0.117, the user's ask).** `Enemy.outline`
  is an Image under the sprite, not a square: `systems/Silhouette.silhouetteOf`
  makes each frame's outline texture once (the picture stamped round itself
  `pad` pixels out, whitened, its inside cut away — `key~outline`), and
  `Enemy.placeOutline` keeps it on the frame shown, flipped and scaled with
  the figure, tinted by `RARE_OUTLINE_TIERS`. A 우두머리 still stands in its
  `footRing`. No filter per enemy — the Glow filter was the other way, and
  too heavy for a field of rares on a phone.
- **Contact is per enemy.** A body hurts through `Player.takeContact` on its
  own `ENEMY.contactCooldownMs`, so a crowd all hurt at once; only thrown
  things (`takeDamage`) open the survivor's invulnerable window
  (`PLAYER.invulnerableMs`, 200 since 0.131, 600 before; 회피 lengthens it).
  Besides that and the debug switch, only a 하얀 망고 makes the survivor
  untouchable. The debug /
  test switch `setInvulnerable(true)` still holds off both.
- **기행종 is table-driven too.** `hop` on an `ENEMY_KINDS` entry
  (`EnemyHopSpec`: distance a hop carries, rest, and — out of one hop's
  reach — the share aimed at the survivor; within reach every hop is) makes
  a kind hop instead of walk (`Enemy.hopAbout`). Its numbers are on the
  밸런스 적 dials.
- **우두머리 is a giant, by table.** `giant` on an `ENEMY_KINDS` entry
  (`EnemyGiantSpec`: drawn size, step time, spin) draws the kind as a fat
  giant in three pictures (`BootScene.createGiantTextures`, keys from
  `giantFrame`: 0–2 front, 3 side on, 4 from behind) stepped through by
  `GIANT_STRIDE` while it moves, turned round on the spot each time it
  throws its ring (`spinAround` plays `GIANT_TURN`: side, back, the side
  mirrored, front — the user wanted it turning sideways, not rolling in the
  screen's plane), and stood in a gold `footRing` ellipse instead of the
  square `outline` a rare wears. Its body for hits is still `size`; never
  squash the sprite for an effect, Arcade scales the body with it.
- **Walking figures (0.99, the user's ask).** 일반 · 사수 · 질주 · 거구 were
  squares; `walk` on an `ENEMY_KINDS` entry (`EnemyWalkSpec.stepMs`) makes
  BootScene paint the kind as a figure (`createWalkerTextures` →
  `paintWalker`, one case per kind id, facing right in 32 units on a
  `drawn` square): standing (the plain texture), `ENEMY_WALK_STEPS`
  stride pictures (`enemyWalk(texture, step)`) and, with `poses`, the
  사수's draw (`enemyPose(texture, 'cast')`, shown `castMs` after
  `fightAtRange` looses). `Enemy.walkCycle` steps them at the pace it is
  really going and flips to face its way (the survivor when standing).
  `drawn` widens `shownRadius`, so the rare outline, `pickRadius` and
  타격's reach follow the picture; the body is still `size`. A new walker
  is a `walk` + `drawn` in the table and a case in `paintWalker` (an
  unknown id falls back to a square). The 기행종 (0.101) is painted by the
  same `paintWalker` but as a hopper (`createHopperTextures`: standing and
  `leap`, shown by `strikePose` through its `poses`).
- **Enemy bolts (0.99).** The plain shot is `ENEMY_SHOT_FX`'s glowing bolt,
  shown `drawnScale` × the shot's size and spinning; `EnemyShot.fire`
  sets the body back to the shot's size (Arcade scales a body with its
  sprite). A shot with its own `texture` (the 키메라's thorn) is untouched.
  공허구체's orbs (`VOID_ORB_FX`) are hollow rims drawn under the enemies —
  the 2차 inner ring since 0.99 (fainter, `innerAlpha`), the outer since
  0.101; as solid orbs over everything they hid the survivor.
- **설정 is in tabs (0.105, the user's ask).** `SettingsScene` opens on 조작
  (pad size, movement), with 소리 (배경음, 효과음) and 화면 (Language while
  `LOCALE.choosable`, 데미지 숫자, 맵 디자인); 기본값으로 · 제작자 정보 ·
  돌아가기 are under every tab. `openTab` restarts the scene on
  `SettingsSceneData.tab`; Tab / Shift+Tab / Q / E walk them. A suite that
  wants a row off 조작 opens its tab first (test-shell, test-info).
- **설정's 데미지 숫자 표시 (0.101).** `settings.damageNumbers` (default on)
  gates only the floater in `CombatSystem.hit` — heals, 포션 효과!, 막음
  and the rune line still show. `window.settings` is the dev handle.
- **전투 배경 (0.101; live in five grounds since 0.105, the user's ask).**
  `ARENA_LOOK` (visuals.ts) and `systems/Arena.ts`. A run's ground is
  `themeFor(terrainSeed)` — one of `ARENA_THEMES` (earth · ice · fire ·
  machine · void), so 불러오기 keeps it; `GameScene.arenaTheme`. Each
  `ArenaTheme` is a palette plus what is strewn: `accent` (grass, ice
  shards, embers, rivets, motes), `bits` (bones, icicles, charred bones,
  gears, runes), `crackStyle` (hairline, or a machine's straight seams),
  `crackGlow` (lava, the void) and its rock colours. `ensureArenaFloor`
  paints the ground's seamless floor tile the first time it is stood on
  (`arenaFloorTexture(id)`); `drawArenaDecals` lays the world's decals from
  the seed; `Terrain.drawDetailed` the rocks in its palette. The decals and
  the rocks are drawn once and baked into one world-sized picture each
  (`Arena.bake`): a Graphics replays every command every frame, and these
  came to ~150,000 — 20 ms a frame against 7 (the user felt it stutter).
  Anything static and drawn in bulk should be baked the same way.
  `arenaLookOn()`: 설정's 맵 디자인 (`settings.mapDesign`, default on; off
  is the old grid, `TEXTURES.grid`), never on the harness or `#run` unless
  a page sets `window.__arenaOn` (test-terrain does), and only on the dev
  server while `ARENA_LOOK.devOnly` (false since 0.105).
- **도망자 is table-driven.** `flee`, `lifespanMs`, `guaranteedSkill` and
  `flashy` on an `ENEMY_KINDS` entry give any kind that behaviour; the
  fugitive is the only one using them. `healthBar` (0.136, the user's ask:
  키메라 and 도망자) gives a kind the 우두머리's bar and nameplate
  (`Enemy.wearsBar`); a kind with `lifespanMs` adds the seconds it has left,
  as a bare number. The line is the name alone since 0.139 (the user's ask:
  no health count — the bar says it). A 우두머리 never leaves on its own, so it shows none —
  the user asked for one on the 우두머리, read as the 도망자 (2026-10-26). It spawns on `FUGITIVE`'s clock.
- **생존자 마을 (dev server only, the user's ask, 2026-10-24).** The title
  as a yard to walk, like Path of Exile's hideout: `systems/Village.ts`,
  built by `MenuScene.buildVillage` when `villageOn()` (VILLAGE.devOnly keeps
  it to the dev server; the harness and `#run` see the menu unless a page
  sets `window.__villageOn`). Eight places (`VILLAGE.layout`, shares of the
  yard, lying down and upright): 출정의 문 → `onStart` (asks about a save),
  보관함 → 인벤토리, 대장간 → 분해·제작, 재능의 비석 → 재능, 명예의 게시판 →
  랭킹 (first place under it), 분류대 → 필터, 서재 → 가이드, 소식 게시판 →
  패치노트. Walked by WASD/arrows or by pressing the ground; pressing a place
  walks to it and opens it; Space/Enter at one opens it. The corner keeps
  only 설정 (a cog), 밸런스 and the account. Everything else the title does
  (account, podium, live update, gift) is unchanged — `buildMenu` is the
  old title. Pictures are painted in code (`Village.paint`). Taking it live
  is `VILLAGE.devOnly: false`. test-village covers it.
- **랭킹 점수 (0.116, the user's).** The board ranks by score, not damage
  dealt: every kill's full health as it spawned (`Enemy.maxHp`: the clock,
  a rare's 속성) × `SCORE.byKind` (balance.ts), counted in
  `RunStats.recordKill(kind, maxHp)` — overkill and what got away count for
  nothing. The board's number travels and is stored as `damage` still (no
  migration; the user chose to let today's damage runs and score runs stand
  side by side). `RunSummary.score`, `SavedRun.scoreByKind` (a save from
  before starts the score at zero), `PersonalRun.score` (내 기록 sorts by it;
  one from before has none and shows a dash), and every label that said
  가한 피해 says 점수. `GameScene.stats.damage` is still kept and saved.
- **The end-of-run screen (0.116).** `GameOverScene` draws the score large,
  one bar of each kind's share of it (kind colour) with the kind's picture
  and ×count under it, the skills as icons with a bar of what each dealt
  that run against the best (0.121, was DPS: `RunStats.recordDamage(amount,
  source)` — every `CombatSystem.hit` names its skill through
  `GameScene.hitFor(id)`, a shot carries `Projectile.skill`, a burst its
  `blast(..., source)`; a new way to deal damage must pass its skill, or it
  counts in the total only; `SavedRun.damageBySkill`),
  and one of `gameOver.tips` at random (filled from `guideValues()` in
  guide.ts — a tip's numbers come off the config like the guide's; test-stats
  fails on one left unfilled via `allTips()`). Lying down (`GAME_OVER.wideFrom`)
  the figures are on the left, the tip and buttons on the right. A new tip is
  a line in all four locales.
- **랭킹 is the Worker's.** `GET/POST /api/ranking` (server/index.ts, D1
  table `entries`). The server's board replaces the device's on `refresh`; a
  submission is shown at once, handed in with a Turnstile token, and
  replaced by the board the server answers with. The server checks the run
  against `RANKING` (shared with the client) and its own `RULES` (time,
  pace, a per-address cooldown and daily cap on a salted address hash), and
  caches the board at the edge for `RULES.cacheSeconds`. Turnstile is only
  enforced once the `TURNSTILE_SECRET` secret is set; the site key goes in
  `RANKING.shared.turnstileSiteKey`. The screens only touch `top`,
  `placeFor`, `submit`, `refresh` and `source`. Flags are drawn textures
  (`tex-flag-XX`), not emoji: Windows has no flag emoji.
  The board reads table `daily_best` (one row per account per day, upserted
  only when a run beats that day's; migration 0004), never the whole
  `entries` history — that scan would spend D1's free daily reads. The day
  starts at `RANKING.dailyReset` (05:00 KST); `rankingDayStart` /
  `nextRankingReset` in system.ts are shared by the Worker and the client,
  the edge cache key carries the day, and the client store drops entries
  from before it. The server stores whole numbers
  only: a run's time is a float, and 0.30 shipped rejecting every run while
  the client said it was entered. 내 기록 is the client's own
  (`systems/PersonalBest.ts`, `STORAGE.personal`), every run that ends,
  signed in or not, synced with the rest of localStorage. The name last
  entered is remembered in `STORAGE.rankName`.
  `RankingScene.layColumns` draws both boards as a table: each column as
  wide as its widest cell or head, one equal gap between all of them, every
  cell centred, and the whole scaled down when a phone is too narrow even
  at `MIN_COLUMN_GAP`. A new column is a head and a cell, nothing more.
  The gap is `COLUMN_GAP_SHARE` of the one that would fill the table's
  width; the cups column is passed as `keep` and holds the room the full
  gap gave it (the user asked for tighter columns but not tighter cups).
  Each run on the board carries its main skill (`skill`, from
  `GameOverData.mainSkill`), and each account its `users.daily_wins`,
  `daily_seconds` and `daily_thirds` (gold, silver, bronze cups ×N): the
  first look at the board on a new day credits every finished day's top
  three once (`tallyWins`, claiming `tally.through_day` before crediting, so
  two looks cannot count a day twice; migrations 0006, 0007 — 0007 filled in
  second and third for the days already counted).
  **A run that went in is never lost (0.113).** A player's run vanished
  from their own board after a reload onto a new version. Two causes: the
  edge's copy of the board is per data centre (and a look already under way
  could put back a board read before the run), so one from before the run
  could come back for `RULES.cacheSeconds` and the client let it replace its
  board outright; and the title reloaded onto a new version while the run
  was still on its way. Now every board carries `asOf` (server time it was
  read; a submission writes its colo's copy fresh rather than only dropping
  it); the client keeps the account's run the server took
  (`STORAGE.rankMine`) on any board read before it (`keepMine`) — a board
  read after it is believed; a run is written to `STORAGE.rankOutbox`
  before it is sent, cleared when the server answers, and sent again by the
  next `refresh` for the same account (same day only); `ranking.busy`
  holds `liveUpdate.safeNow` back and the title re-offers the update when
  the ranking changes; and the server answers the same run again (same
  account, damage, level, time within a day) as taken (`again: true`), never
  entering it twice. Both keys are `ACCOUNT.localOnly`. test-ranking 9b and
  test-api cover it.
  **No cached answer is kept by the browser** (`unstored` in server/http.ts,
  and the client fetches with `cache: 'no-store'`): a copy out of the
  Workers cache comes back from Cloudflare re-marked `max-age=14400` (the
  zone's browser TTL), and a PC that kept it showed a board hours old while
  the phone was current. The edge copy still lasts `RULES.cacheSeconds`.
  To look at the live database: `npm run db -- "SELECT * FROM daily_best"`
  (read-only queries only, unless the user asks; the dashboard's D1 console
  works too).
- **예언 — 오늘의 규칙 until 0.127 (0.126, the user's design, 2026-10-25).**
  Shown as 오늘의 예언 (Today's prophecy · 今日の予言 · 今日预言); the code
  still says daily rules. Every ranking day
  from `DAILY_RULES.since` (2026-10-26 05:00 KST) lays three rules on every
  run started that day: one banned skill (never offered — `offeredSkills`),
  one banned 재능 (its 파편 never drop — weight 0 in the `shardWeight` hook,
  and off the shard-pick cards) and one strengthened enemy. No good effects,
  and the same three every day of it (the user's word). `config/daily.ts` is
  pure (the Worker imports it): `dailyRulesFor(dayStart)` draws from the
  day's own hash, never the day before's pick; the pools are listed there
  (test-daily checks they match SKILL_BASE and TALENT_SHARD.stats — a new
  skill goes in `DAILY_RULES.skills`). The enemy buffs are only the eight the
  user picked; a new one needs their say. Each buff's `scale` and `on` are dials on the
  밸런스 panel's 적 강화 tab (0.127, the user's ask; tab `daily`, kind
  `toggle` — a press flips it, 켬/끔): the draw skips a buff that is off (the
  days it fell on draw again from the rest; none on → no enemy rule) and
  every text players read is built from the live `scale`. The title's line
  redraws when the shared values arrive. The Worker reads the table without
  the overrides — it only checks the banned skill, which is drawn apart. `systems/DailyRules.ts` holds the
  run's set (module scope): GameScene.init `begin`s it with the day the run
  started (`SavedRun.rulesDay`, so a run crossing 05:00 keeps its rules), and
  Enemy (hp, speed at spawn; contact; the 사수's shot speed; hop distance) and
  SpawnDirector (rare chance) ask `enemyScale(kind, stat)`. Shown (0.127,
  the user's ask: easy to see) on the title as a framed plate (`MENU.prophecy`:
  over the menu when the screen is `shortHeight` or taller, else in the
  top-left corner beside the logo, else one line over the first row; the
  village's at the bottom; `dailyLine` is its words, the frame grows to
  fit), on the first skill's screen as the banned skill's own card, greyed
  and not takeable, with the prophecy written over it
  (`SkillPickData.prophecy`, `SkillPickScene.bannedCard`), in the start
  pick's subtitle, and as a HUD debuff icon (`TEXTURES.dailyRules`).
  The run hands in `RunDetail.rules`; the Worker refuses one that held that
  day's banned skill (`brokeDailyRules`: the run's day if today or
  yesterday, else today's). test-api pins the day with the test-only
  `DAILY_DAY` var (honoured with AUTH_TEST). The harness sees no rules unless
  a page sets `window.__dailyOn` (`__dailyDay` picks the day); the dev
  server shows the first day's rules before it starts. `window.dailyRules`
  is the dev handle.
- **도파민 (0.127, the user's ask).** `systems/Celebrate.ts`: `sparkleBurst`,
  `glowPulse` and `jackpot` (a glow and the `big` burst), short-lived Images
  on tweens, numbers in `CELEBRATE` (visuals.ts), the `TEXTURES.sparkle`
  drawn at boot. No coins: 0.127 threw gold coins and the user found them
  odd (0.128) — do not bring them back. Big moments: a 신화 drop lands (`CombatSystem.land`
  — a 희귀 one only sparkles), a 우두머리 · 키메라 · 도망자 down
  (`killEnemy`), a 각성 (`celebrateMastery`), a 재능의 덩어리
  (`gainShard`, count > 1), a new best on 내 기록 (`GameOverData.newBest`:
  the badge takes the score caption's place, a burst over it). Moments that
  come round again and again get only the `quick` sparkle and short
  timings — the user's rule: an upgrade picked (`onUpgradePicked`), a 파편,
  a 합성 (COMBINE_FX under a second in all) and a 구슬 (ORB_FX). A new
  exciting moment should use these, and a new repeated one stay quick.
- **랭킹 검토 (the admin's, 0.62).** Every run handed in carries a 판 내역
  (`RunDetail`, built by `GameScene.runDetail`: build, version, kills by
  kind, 뼈다귀, weapon, skills, 패시브, resumed), kept by the Worker in
  `entries.detail` after `cleanDetail` keeps only the known fields (migration
  0008). Nothing is held back: an outlier goes on the board like any run.
  `GET /api/ranking/review` (admin only) gives today's board with each
  run's detail and its ratio to the median of other accounts' runs within
  `RANKING.review.timeWindow` of its length over `lookbackDays` (marked at
  `factor`, none with fewer than `minPeers`); `RankingScene` shows it to
  `devToolsAllowed()` — outliers in red, every row opens the popup, 기록
  삭제 asks a second time. `POST /api/ranking/remove` marks the entry
  `removed_at` (never deletes it), puts the account's next best that day in
  `daily_best`, and drops the edge copy. A newer kind/skill id the client
  does not know is shown as the id. The user asked for this on 2026-10-18
  after JSM's 993M run on 0.59 — the server still trusts the numbers it is
  sent; this only lets the admin see and undo.
- **어제의 랭킹 (0.64).** `MenuScene.showPodium` (after `settleAccount`)
  opens `PodiumScene` with the day before's first three from
  `GET /api/ranking/podium` (daily_best order, edge-cached until the reset,
  dropped by `/remove`), once per board day: seen is kept on the device
  (`STORAGE.podiumSeen`, in `ACCOUNT.localOnly` — synced, every device
  writing it each morning would set the records at odds) and on the account
  (`users.podium_seen`, migration 0009, set by `POST /api/ranking/podium/seen`,
  read back as `podiumSeen` from /api/me). Signed in, it also shows the
  account's own place that day out of everyone who ran
  (`GET /api/ranking/podium/me`, never cached). It waits if the title is covered
  (a conflict, a run being entered). `RANKING.shared.podiumSince` is the
  first day it covers: 10/17's cups were changed by hand, so that board's
  order no longer said who placed where.
- **A save value is always text.** `/api/save` hands every stored value back
  as a string (`asStored`), and `CloudSave.take` writes non-strings as JSON:
  a value written into D1 by hand as JSON (`json_set` with a `json_set`
  inside makes an object, not text) would otherwise land in localStorage as
  "[object Object]" and the store behind it would start empty. When editing
  a save by hand, store the inner value as text (`'' || json_set(...)`).
- **Cloudflare.** One Worker with static assets: `dist/` is served without
  running the Worker (free, unlimited); only `/api/*` runs `server/index.ts`.
  `npm run dev:api` runs it locally on 8787 and Vite proxies `/api` there.
  `.github/workflows/cloudflare.yml` builds, applies D1 migrations
  (`server/migrations/`) and deploys on push to main, given the secrets
  `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. `deploy.yml` now only
  publishes the bridge to GitHub Pages, pointed at the repository variable
  `NEW_ORIGIN`. test-api runs the Worker itself on 8788 with a throwaway
  database; it needs no browser.
- **The repo goes private after the move (user's choice, 2026-10-15).** It is
  public only because GitHub Pages on the Free plan needs a public repo, and
  Pages now only serves the bridge. Around 2026-12-15, once players have had
  time to come across, make it private: the old github.io address then stops,
  Cloudflare deploys keep working (Actions run on private repos). Confirm
  with the user before changing visibility.
- **계정 (optional sign-in).** `server/auth.ts`: OAuth 2.0 code flow for
  Google, Facebook and X (`server/providers.ts`; Kakao was taken out on the
  user's word, 2026-10-15), each offered only
  once its `*_CLIENT_ID`/`*_CLIENT_SECRET` Worker secrets exist; no email is
  asked for. Sessions are an HttpOnly cookie whose hash lives in D1;
  `AUTH_SECRET` signs the 10-minute cookie that carries state and the PKCE
  verifier to the provider and back. A local-only `test` provider exists for
  the harness (`--var AUTH_TEST:1`, refused unless the host is localhost).
  The ranking takes runs from signed-in accounts only, one name and one best
  per account. `/api/save` holds a copy of the game's localStorage and only
  writes over the version the browser last saw (409 otherwise).
  A sign-in (no `STORAGE.sync` note for that account on this browser) takes
  the account's records without asking — or, the account empty, uploads
  this browser's (0.101, the user's ask); `ConflictScene` is left for two
  devices that both changed while signed in. So `AccountScene.login` asks
  first, through `ConfirmScene` (title/body/detail/confirmLabel, `onLoad`
  optional since 0.101), saying what this device holds.
  Client: `systems/Account.ts` (who, `#login=` outcome), `systems/CloudSave.ts`
  (three-way sync against the `STORAGE.sync` note: upload, take and reload,
  or ask in `ConflictScene`), `AccountScene` behind the title's corner icon,
  and `PendingRank` carrying a run across the trip to the provider. The
  harness turns accounts off unless a page sets `window.__accountOn`
  (test-account does, with an in-page stand-in for /api).
  `wrangler dev` dresses requests as the routed domain; pass
  `--local-upstream 127.0.0.1:<port>` (dev:api and test-api do).
  The privacy policy and data-deletion pages are `public/privacy.html` and
  `public/data-deletion.html`; keep them true to what is collected.
- **이사 (moving the records).** localStorage belongs to one address, so the
  old one's `bridge/index.html` gathers every `exiled-survivors:` key but the
  ranking and lands on the new one with `#carry=<base64url>`;
  `src/systems/CarryOver.ts` is the first import in main.ts and writes them in
  before any store reads storage (asking first if this browser already has
  records here). test-carry covers it.
- **F1 is the admin's.** `systems/DevAccess.ts`: the dev server opens the
  debug keys to anyone (the harness needs them; `DEBUG.gatedInDev` tries the
  deployed rule), the deployed game only to an account whose id is in the
  Worker secret `ADMIN_USERS` (comma separated; `/api/me` answers
  `admin: true`). A run any F-key changed (`DebugOverlay.used`, kept in the
  save as `devUsed`) goes on neither the ranking nor 내 기록.
- **Back to 0.67 (0.80, the user's word, 2026-10-20).** 0.71–0.79 (the
  overhaul: passive graph then 룬, gear in the run, the slot machine, sub
  skills) were rolled back: the tree is 0.70's (0a34a1e) with 0.68's rainbow
  notice taken out, the live values the overhaul had folded into the tables
  (1e10289) put back in them, and what was not gameplay kept from after
  (the user's word: "게임 플레이 이외의 수정내용은 현재 상태를 유지"): the
  dials as they stood at 0.79, the language choice off (`LOCALE`), the
  second clock (below), the survivor's look by main skill, and the patch
  note history (0.68 and 0.71–0.79 stay listed; 0.80 says what went). Of
  the borderline pieces the user kept only the look — the rainbow notice,
  the orb pickup line over the survivor and the in-run orb tray went. The
  overhaul's code is in git (8b362c8 is 0.79) if any of it is wanted back.
  What 0.71 cleared on load (its `RETIRED_STORAGE`: stash, 구슬 drawer,
  gold, passive ranks) was gone for good — locally and in the cloud copies
  — so `ROLLBACK_GIFT` (equipment.ts, `systems/Gift.ts`) hands everyone bare
  오니고로시 and every 구슬 once on the title (`MenuScene.giveGift`, after
  the account settles, `STORAGE.rollbackGift`, synced; since 0.93 it gives no
  오니고로시 — `ROLLBACK_GIFT.gear` is empty — and since 0.94 no 구슬, `orbsEach` 0,
  the user's word: only the passive points are left); the harness turns it
  off unless `window.__giftOn` (test-gift). 0.81 added passive points to
  it (`passivesToMax`: `passives.topUpToMax` fills held + spent up to
  `maxPoints`), under a mark of its own (`STORAGE.passiveGift`) so those
  who had 0.80's gift got it too — off since 0.102 (`passivesToMax` false:
  every player holds PASSIVE_POINTS), so the gift gives nothing now. A saved run with a `kit` (0.71–
  0.79's) is thrown away by `saveGame.read`. The server's `tuning` row
  still holds `RUNE_*` paths: `Tuning.apply` lays over only dials and
  `publish` sends only dials, so they do nothing.
- **A run off the ranking keeps no loot (0.134, the user's ask).** What a
  run puts in the drawers that outlive it — swords, 구슬, 뼈다귀 — is counted
  in `GameScene.runLoot` (kept in the save as `SavedRun.loot`). While
  `devRun` (F-keys, a 밸런스 draft) a pickup is not stored (`game.lootWithheld`
  toast); the frame a run becomes one, and at death when `devRun` or the
  tally is `refused`, `forfeitLoot` takes back what it counted
  (`systems/RunLoot.forfeitLoot`: `gear.discardAnyway`, `orbs/bones.takeBack`;
  what was spent since stays spent). The server turning a run down takes it
  back too (0.135): the run's `loot` rides on its `RankSubmission` (via
  `GameOverData.loot`, the outbox and `PendingRank`), is stripped before the
  POST, and `Ranking.push` forfeits it on an answer in `FORFEITS` (`refused`,
  `pace`, `damage`, `level` — a run that could not have happened), never on
  401/403/429 or no connection. Silent, like the refusal itself; only runs
  that reach the server are judged (signed in, good enough for the board).
- **The run counts what it gains (0.91, the user's ask).** `systems/RunTally.ts`
  (module scope, like the second clock) counts each level-up
  (`onLevelUp`) and each skill level (`acquire`, and an upgrade that raised
  one in `onUpgradePicked`); the save carries it sealed (`SavedRun.tally`;
  an older save takes what it holds). At death the character's level must
  be 1 + level-ups and the held skills' levels must add up to what was
  counted, or `GameOverData.refused` takes the run off the ranking with no
  word said (no 랭킹 row, no note). Not in the patch notes, on purpose. A
  new way a skill gains a level must count it, or honest runs are refused.
- **A second clock on every run (0.71, kept in 0.80).** `systems/RunLedger.ts`
  adds up the real time between the frames that move `GameScene.elapsedMs`
  (capped per frame, held while a card/popup/pause holds the run), in
  module scope rather than on the scene; the save carries it sealed
  (`SavedRun.wallMs`) and the run hands it in as `RunDetail.wall`. The
  Worker refuses a run whose shown time is more than `RULES.paceAhead`
  (+`paceAheadMs`) over it, or whose second clock is past `paceBehind` ×
  the shown (+`paceBehindMs`), or that has none — as `refused`, saying
  nothing (the user's ask).
- **The survivor dresses for the main skill (0.76, kept in 0.80).**
  `Player.wearLook`, `PLAYER_LOOK.bySkill` in visuals.ts, drawn by
  `BootScene.createLookTextures`; `GameScene.acquire` dresses it when the
  main skill is taken. The picture is `PLAYER_LOOK.drawn`, the body stays
  `PLAYER.size`. Since 0.82 it moves: every look is drawn in each of
  `LOOK_POSES` (`lookFrame(id, pose)`, on a `LOOK_CANVAS` square with room
  round the 32-unit figure for a thrust — keep it symmetric, or a flip
  shifts the figure) and BootScene makes two animations a look
  (`lookAnim(id, 'walk' | 'cast')`, `LOOK_ANIM`). `Player.animateLook`
  walks while it moves; `Player.castLook(targetX)` plays the cast, turned
  to the target. A weapon calls `WeaponContext.onCast` when it goes off,
  and GameScene hands it only to the main skill's weapon (공허구체 calls it
  once a lap). `tests/look-sheet.mjs` (not a suite) draws every look in
  every pose to `shots/look-sheet.png` for a look by eye.
- **TCG skill cards were tried and rolled back (0.129 → 0.130, the user's
  word).** 0.129 (37235ef) made the skill pick TCG cards with a painted
  illustration a skill (`systems/SkillArt.ts`), dealt face down and turned
  over, and a 금지 stamp on the banned card; 0.130 reverted all of it. The
  code is in that commit if any of it is wanted back.
- **The first skill is chosen from every skill (0.82).** `openStartPick`
  offers `DROPPABLE_SKILLS` whole; `SkillPickScene` lays the cards in rows
  of up to three (0.79's layout). The 무작위 스킬 drop still offers
  `SKILL_PICK.choices`.
- **보유 효과 (0.84, the user's ask).** Holding a skill — main or found —
  gives every skill (itself included) and the survivor its line in
  `SKILL_HELD_BONUS` (balance.ts): 낙뢰 crit points on the base, 화염구
  `areaScale` (every radius: the burst, 타격's swing reach, orb size, 공허,
  splash, shatter — `WeaponContext.areaScale`), 얼음창 damage ×, 연쇄번개
  pace ×, 공허구체 move speed, 타격 max health. `heldBonusFor(owned)` folds
  them into `GameScene.heldBonus` on every `acquire`; damageOf/cooldownOf
  multiply, `Player.applyHeld` takes the survivor's three (a bar that
  grows mid-run gives the health it gained). `heldBonusText` writes the
  line for the HUD card, the guide's skill card and the pick cards.
- **드론 (0.95, the user's design).** `weapons/Drone.ts`: each drone takes
  an enemy within `range` (270) of the survivor — the nearest no drone has,
  else one with fewer than `DRONE.perEnemy` (3) on it — flies to it
  (`DRONE.flySpeed`), hovers just off it and shoots every cooldown until it
  dies or strays past the range; doubled-up drones move to a free enemy as
  soon as one is in range, so they gather only when enemies are fewer than
  drones. With nothing to shoot they circle the survivor. `droneCount` is
  a stat and a pick of its own (UPGRADE_STEP/UPGRADE_MAX_PICKS, a dial on
  the 드론 page); the Runed Sword's +1 adds before the 1차 각성 doubles it
  (`SKILL_MASTERY.droneTimes`). 2차 각성: every
  `SKILL_MASTERY.second.droneBomb.every`-th shot of a drone bombs (the two
  were the other way round until 0.98, the user's ask). `areaScale`
  (화염구 held) widens the bomb and the reach (the user's call). 보유 효과:
  move speed +15% (공허구체's before). Base 5 · 125 · 0.25 with 2 a enemy
  (0.97, the user's pick, after DPS tables against 연쇄번개 and 화염구 with
  70% of drones shooting in a crowd: about 0.4–0.7 of 연쇄번개 there, about
  1.1× 화염구 on a lone enemy). It was 80 · 0.47 with 3 while tried. The look
  holds a `remote` (LookProp), and is drawn `DRONE.size` (12 since 0.100,
  18 before). Its shot borrows 얼음창's clip. F11 (debug)
  takes the main skill straight to its next 각성.
- **독성폭발 (0.123, the user's design, 2026-10-24).** id
  `poisonNova` (shown as 포이즌 노바 at first; tried as 독안개, an aura that
  only poisoned, and taken back — its balance would not settle).
  `weapons/PoisonNova.ts`: every cooldown a ring bursts out from the
  survivor to the skill's `range` (× `areaScale`, like 타격's swing) over
  `POISON_NOVA.ringMs`; each enemy it reaches takes the hit and a stack of
  중독 — `poisonShare` of the hit a second a stack, ticking every `tickMs`
  through `context.hit` (so the end screen counts it), at most `maxStacks`
  (10). Every hit starts the whole poison's `durationMs` over (one clock an
  enemy). The weapon keeps the poison (`poisoned`, by enemy and its
  `lives`), not the Enemy, and draws it: green bubbles rising off the enemy
  and its stack count in green beside it (`POISON_NOVA_FX`, pooled Texts).
  The poison ticks hit with `startles` false (0.124: `context.hit`'s third
  argument, down to `Enemy.takeDamage`), so a 도망자 does not run from it.
  The cast and the burst are drawn as explosions (0.125, the user's ask:
  `PoisonNova.drawBlast` — a core flash, gas densest at the middle, a shock
  front thinning as it spreads, droplets and smoke rolled per blast); the
  ring that does the hitting is only logic now.
  반복 is a second ring (CastRepeat). 각성: `stacksPerHitAwakened` (2) a hit.
  2차: an enemy that reaches `maxStacks` bursts — its stacks × per-stack ×
  durationMs at once on everything within the skill's range of it (itself
  included), its stacks gone. A burst poisons nothing, so one never sets
  off another (a version that added stacks with each burst chained without
  end in a crowd; 0.123–0.124 also burst a poisoned enemy as it died, taken
  out in 0.125 on the user's word). 보유 효과: the 체력 포션's drop chance ×1.1
  since 0.131, ×1.2 before (`potionChanceScale`, through the `potionScale`
  combat hook). Picks 피해 ·
  공격속도 · 범위. Its sound borrows 공허구체's. Shipped at 150 · 0.5 (the
  user's pick; 144 · 0.7 while tried), poison 10% of the hit a second a
  stack. The user compares skills one enemy at a time, not by crowds. It
  was tried on the dev server behind `SKILL_DEV_ONLY` (balance.ts, empty
  now): `skillOffered` refuses a listed skill on the deployed game and the
  harness — the way to try the next new skill first.
- **Trial skills (0.96).** `SKILL_TRIAL` (balance.ts) names skills offered
  only to listed account ids — the 드론, to the user's own (Taeyeon Kim,
  `mli6lWxFN7F41CC6`), while it was tried — empty since 0.97. `systems/SkillGate.skillOffered`
  is asked by `GameScene.offeredSkills` (start pick, 무작위 스킬, skill drops;
  a skill already held is always offered) and by the guide's skill chapter.
  The dev server lets trial skills through, but not the harness (no
  account there), so suites see the shipped rule. Taking the 드론 out of
  `SKILL_TRIAL` is the whole of turning it back on.
- **공허구체 changed with it (0.95).** Its 보유 효과 is
  `contactDamageScale` (받는 접촉 피해 감폭, `Player.takeContact`; 0.8, then 0.9
  since 0.131),
  the move speed went to the 드론. 0.95–0.97 its 1차 각성 healed a point a
  hit; 0.98 put the 공허 back (below), now healing by the head
  (`WeaponContext.heal`), uncapped.
- **보조 스킬 stop at `SUB_SKILLS.max` (0.84).** Besides the main skill, at
  most three: once full (`GameScene.subSkillsFull`) `rollSkillDrop` and
  `randomSkills` offer only skills held, and a skill picked up that was
  not (it dropped before the slots filled, or a debug key) is a potion
  instead (`drinkForMaxedSkill(skill, 'full')`, `game.subSkillsFullHeal`).
- **The language choice is off until release (`LOCALE`, system.ts).** While
  `LOCALE.choosable` is false the game shows `LOCALE.fixed` (ko) whatever a
  browser stored (`Settings` keeps the stored choice, `shownLanguage` picks),
  설정 has no Language row and the title says 설정, not "Settings". The code
  stays built for every language: every word through `t()`, all four
  locales kept in step with types.ts, patch notes in all four. Turning the
  flag on is the whole of putting it back.
- **재능의 파편 (0.102, the user's design).** `TALENT_SHARD` (balance.ts):
  one shard a stat (`stats`: 피해량 · 공격속도 · 이동속도 · 최대체력 ·
  효과범위; 체력회복 was one too until the user took it out in 0.131 — a
  tree's points on its line come back as it loads, `Passives.sanitise`). One roll off every kill at `chance` (0.5%, shared
  by every stat — 0.102–0.103 rolled each stat on its own; the user asked
  for the shared roll back in 0.104), no rare's or 우두머리's bonus; which
  stat it is, `CombatSystem.rollShardStat` weighs by the passive tree's
  lines (`hooks.shardWeight`). An 일반 drop since 0.111. A 도망자 or 키메라
  always leaves a 재능의 덩어리 instead (`guaranteedLump`, TALENT_LUMP, 0.111:
  one stat by the same weights, `shards` (3 since 0.115) of it, 신화, `talentLump` 필터
  switch, its own cluster texture) — `Enemy.precious` still keeps them at
  the cap. Both are `TalentShardDrop` from one pool (`drop(x, y, stat,
  lump)`, `shards`, `lump`), so the 자석 and markers treat them alike;
  `onTalentShardCollected(stat, count)` → `gainShard(stat, count)`.
  `TalentShardDrop` carries its `stat`, tinted
  (`TALENT_SHARD_FX.tint`); like every ground item it is never pulled in and
  goes after GROUND_ITEM.lifespanMs; the 자석 takes it. `GameScene.gainShard`
  adds it to `shards` (saved in `SavedRun.shards`) and `applyShards` folds
  `shardBonusFor`: damage and attack speed as `RunModifiers.shard` (an 증폭,
  where the tree's layer sat in Modifiers), move speed and max health on
  `Player.applyShards`, area into `GameScene.areaScale`; the HUD shows them as one effect icon (`effectsNow`, id
  `shard`: the count in its corner — `EffectEntry.count` — and each stat's
  total on its card; 0.102's line of text went in 0.106). A level-up with the
  main skill maxed, or a 무작위 스킬 whose every option is maxed, is a
  `'shard'` choice: `openShardPick` shows `choices` of the stats, evenly,
  through UpgradeScene (its cards are any `ChoiceCard` since 0.102), its
  subtitle saying why (`shard.mainMaxed` for a level-up, `shard.allMaxed`
  for a 무작위 스킬, 0.112). A held skill at its top is never a 무작위 스킬
  card (`randomSkills` leaves it out, 0.112), so the cards come when there is
  nothing left to offer. The
  potion heal for a maxed main skill is gone; a maxed skill picked up again
  still heals.
- **패시브 is 재능의 파편 lines (0.102, the user's ask) — shown as 재능 since
  0.110** (Talents · 才能 · 天赋, the user's ask: a name tied to the shard, four
  letters at most; the code, ids and storage still say passive). passives.ts: six
  lines, each +`shardWeight` (5%) on its stat's weight when a shard lands
  (the others come up less; the screen shows the increase, "N% 증가"), no cap
  but the points (`maxRank` = PASSIVE_POINTS). Every player holds
  PASSIVE_POINTS (30): a stored tree without `scheme` 2 (`PASSIVE_SCHEME`) —
  every tree from before — starts over at 30, and nothing stored is a fresh
  tree in memory, not written (a write would read as a change to CloudSave).
  `passives.refund` and `reset` give points back. ROLLBACK_GIFT's
  `passivesToMax` is off. PassiveScene is a grid of dials (PASSIVE_DIALS),
  the 밸런스 panel's way, each with its drop rate; the tree, its camera and
  dragging went. The enemies were dampened for the lines that went:
  `ENEMY_DAMPEN` (hp 0.7, speed 0.9) at spawn — XP still reads the kind's
  own numbers — and `Progression.enemyHealth` includes it, which is what
  the suites read a full plain enemy off. The title's 패시브 icon wears a
  pulsing ring until `ICON_SPOTLIGHT.passives` (a day).
- **One ladder of drop effects (0.111, the user's).** A drop's tier alone
  decides how it looks, shines and sounds — `DROP_LABEL.tiers[tier]` (label
  colour, size, `pulse`, `pillar` tint or null) and `AUDIO.drops[tier]`
  (null would be silent): 일반 a white name and normalDrop; 마법 blue and
  magicDrop; 희귀 yellow, rareDrop, a yellow pillar; 신화 red and swelling,
  extremeRareDrop, a red pillar. `DropLabel.show(text, tier)` keeps the
  `tier` and stands the pillar; `CombatSystem.land(item, shown)` reads the
  item's `nameplate.tier` for the sound — a new drop needs only its label's
  tier. Which tier each item is (0.114, the user's): 신화 하얀 망고, 망고의
  구슬, 재능의 덩어리, 룬, 5–6 속성 swords, a 우두머리/키메라/도망자 제단;
  희귀 폭발의 구슬, 두개골 (고대 두개골 until 0.114), 갈비뼈, 척추, 3–4
  속성; 마법 자석, 혼돈 · 각성의 구슬, 2 속성, a rare pack's 제단; 일반
  변화의 구슬, 무작위 스킬, 스킬, 재능의 파편, 0–1 속성. Set in the item's
  table (`ORBS`/`BONES` `tier`) or its drop entity (자석, 무작위 스킬) and its
  필터 entry. No per-item exceptions (0.102's `extremeSound` went); a 제단 lands
  silent whatever it offers. The awakening flourish and a 합성 success play
  `AUDIO.drops.magic`, the clip they always had.
- **A dial ships only when asked for.** The user had every dial taken off
  in the overhaul and asked for them back one by one; 0.80 keeps that set:
  a page a skill (every `SKILL_BASE` stat above zero and its
  `BALANCE.damageScale`), enemy health (`enemyHpScale`, `hpScalePerMinute`,
  each `hpStepTiers` index's minute and multiplier) and every drop rate. The
  rest of 0.70's dials (the 공통 page, the 기행종, the 우두머리 clock,
  drop bonuses) stay off until asked for. 0.85 added (asked for) the spawn
  pace (`SPAWN.startIntervalMs`, `minIntervalMs`, `rampPerMinute`), the cap
  (`maxAlive`), the rare chance (`RARE.chance`,
  `DIFFICULTY.rareChancePerMinute`, `lateFromMinute`, `lateMultiplier`) and
  each kind's arrival (`SPAWN_TABLE.<i>.unlockMs`, labelled by the kind). test-tuning reads the tables and
  fails on a missing dial or an extra one.
- **밸런스 다이얼.** `config/tuning.ts` lists every dial by path into the
  config tables (pure data — the Worker imports it to accept only those
  paths). `systems/Tuning.ts` lays three layers over the tables in place:
  balance.ts as built (captured at import), everyone's values from
  `GET /api/balance` (taken only on the title, `settle`, never mid-run), and
  the admin's draft (`TUNING.draftKey`, in `ACCOUNT.localOnly`, applied at
  once). `PUT /api/balance` is admin-only (`ADMIN_USERS`) and checks paths and
  ranges (server/tuning.ts, D1 table `tuning`, migration 0005).
  Four tabs since 0.127: 스킬 · 적 · 드랍 · 적 강화 (오늘의 규칙's buffs).
  `TuningScene` is the panel: the title's 밸런스 icon and a pause row, both
  only when `devToolsAllowed()`. Most numbers are read where used, so a turn
  needs nothing more; a skill's stats were copied on pickup, so
  `GameScene.retune` scales them (keeping picks and level). A run that saw a
  draft is `tunedRun`, off both boards — and says so (0.65): a toast as it
  starts (`game.draftRun`) and a red line on the end screen
  (`GameOverData.devReason`, `devRunNote`), the same for an F-key run. The
  admin once set a record with a draft left on and was never asked for a
  name; the draft stays in `TUNING.draftKey` until 실험 취소 or 전체 적용.
  Pressing a knob (or Enter) opens it magnified (`TuningScene.openZoom`,
  2026-10-21): what it does — `tuning.fieldDetails` by stat, `details` by
  path, templates for 피해 배율 · 등장 시점 · 구슬 · 뼈다귀 · 검; a new dial
  needs its line, test-tuning fails on a blank — and a big dial reading
  0–100 across `tuning.range` (`zoomPosition`, kept so a coarse dial still
  steps by one), turned by pointing, wheel, ±1/±10, ↑↓ (Shift ×10), with
  전체 값으로 and 닫기. Shipped with no patch note, on the user's word: it
  is the admin's screen. test-tuning drives it with an
  in-page stand-in for /api/balance; test-api covers the endpoint.
- **아이템 필터.** `config/itemFilter.ts` builds a switch per kind of drop
  from the tables (구슬, 뼈다귀, swords by base and by rarity, plus potion,
  skill, 무작위 스킬, 망고, 조각); `systems/ItemFilter.ts` keeps the ones
  switched off (`STORAGE.itemFilter`, synced with the rest). A switched-off
  drop still lands and is still taken by touch or 자석 — it is only hidden
  (`GroundItem.conceal`: no sprite, name, pillar, halo, sound, edge marker
  or 자석 ghost). Every `CombatSystem.drop*At` ends in `land(item, shown,
  tier)`, and a new drop function must too. (Until 2026-10-18 a switched-off
  drop never landed; the user wanted it hidden, not lost.) `FilterScene` is
  the title's 필터 icon.
- **Live update.** Every build ships `version.json` (`{ build }`, the commit
  on CI) and is compiled knowing its own id (`__BUILD_ID__`, vite.config.ts).
  `systems/LiveUpdate.ts` asks every `LIVE_UPDATE.checkEveryMs` and when the
  tab returns; a newer build is applied only on the title with nothing else
  running (`safeNow`), by a reload — never mid-run. A reload that comes back
  on the old build is not retried (sessionStorage). Off on the dev server
  (`current === 'dev'`); test-live drives it through `liveUpdate.found`.
- **스킬 각성.** `SKILL_MASTERY` (balance.ts): only the main skill awakens
  (0.83, `GameScene.masteryOf`: 0, 1 or 2 — a skill found later never does).
  At `level` it gets one more effect — `WeaponContext.mastered` is true and each weapon does its own
  (타격 strikes `enemyShots` in the swing, 화염구's burst is `fireBlastScale`
  wider (0.84), 연쇄번개 amplifies each
  strike by `chainBonusPerJump` for every jump still to come (it never
  doubles back — that was the old awakening),
  얼음창 shots carry `freezeMs` (0.2s) for an enemy already chilled (`Enemy.freeze`),
  공허구체 (whose hit timers are per orb: each orb hits an enemy once a
  cooldown, every orb on its own) opens a 공허 every `voidVortex.everyMs`
  that draws enemies in by moving x/y the way Separation does
  (`VoidOrb.vortices`, the purple `TEXTURES.voidVortex`). Since 0.98 (the
  user's ask) it opens on the thickest crowd — the enemy within
  `searchShare` × the orbit radius with the most others within `reach`
  (`VoidOrb.thickest`), waiting if none is near — and heals `healPerEnemy`
  a head inside every `healEveryMs`,
  낙뢰 leaves what it hits 감전 (`Enemy.shock`, `thunderShock`: every hit on
  it × 1 + `amplify` in `CombatSystem.hit`, sparks drawn by
  `Enemy.drawShock` from `SHOCK_FX`). Reaching it calls `GameScene.celebrateMastery`
  once (`awakened`, rebuilt from a save without a show); the HUD slot goes
  gold and its card adds the line (`masteryText`). At `second.level` (20)
  the 2차 각성 (0.83, the user's designs) adds `masteredTwice`: 타격's swing
  opens to `meleeArcDegrees` (180), 화염구's burst widens `fireBlastScale`
  again (4× in all, 0.84), 연쇄번개 starts
  `chainForks` arcs, 얼음창 shatters: an enemy that dies under 냉각 chills
  what stands within `iceShatter.radius` (`CombatSystem.shatterAt`, through
  the `shatter` hook, chaining; 0.87 — it was frozen → frozen before),
  공허구체 gets an inner ring turning the other way (`VoidOrb.inner`,
  `voidInner`), 낙뢰 splashes `thunderSplash`. It has its own banner
  (`celebrateMastery(skill, 2)`, `awakenedTwice`), a thicker gold edge and a
  second card line (`mastery.card2`, `masteryText(id, 2)`); the guide's
  skill cards list both tiers. test-mastery covers it.
- **A saved run carries its own weapon.** `SavedRun.gear` is a copy of the
  item the run went out with (`GameScene.runGear`, written by every save);
  a resumed run fights with that, so the 인벤토리 never locks — swapping,
  구슬, 합성 and selling change only runs started afterwards. A save from
  before this has no `gear` and takes the one in hand. It is said on screen
  (0.63): `saveGame.describe` names the weapon, and the 인벤토리's 착용 중
  line adds `savedRunGear` while the saved run's weapon is not the one in
  hand — the user once reported the design itself as a swap that did not
  take.
- **What acts on the survivor is on the HUD.** `GameScene.effectsNow()`
  hands `Hud.update` an `EffectEntry` list — 장비 (`runGear`), each 뼈다귀
  (built once a run), then the 재능의 파편 held (0.106; the 패시브 icon went
  then, the user's ask), 하얀 망고 and 거미줄 while they last — drawn
  as icons left of the skills (`HUD.effectSlot`, buff/debuff edges in
  `HUD.effectEdge`), or on a row under them when that would run into the
  clock. Pointing at one opens the skills' card and the same hold
  (`Hud.pointEffect`). A new buff or debuff is one more push there.
- **효과음 음량.** `settings.sfxVolume` scales every effect through
  `effectVolume()` in Sfx.ts — skills, drops, the horn, the slot, the
  인벤토리's. A new sound that bypasses it ignores the player's setting.
- **자석 takes everything at once.** Picking one up calls
  `CombatSystem.collectEverything`, which runs each gem and item through its
  own touch handler there and then — a pull over time was stalled by a
  level-up's popup (0.53–0.55). Left on the ground on purpose, as things a
  survivor may save: 하얀 망고, 자석, 포션, 제단. The flight you see is a
  picture (`flyIn`, `MAGNET.flyMs`), not the items. A new drop group goes in
  the `take` list there, or in the left-alone list in the comment.
- **Enemy health steps by tiers, not a late wall (0.66).** `enemyHpScaleAt`
  multiplies each whole minute by 1 + (hpScalePerMinute − 1) × that minute's
  tier (`DIFFICULTY.hpStepTiers`, the last `afterMinute` passed; ×2 after 3,
  ×3 after 6), each tier on the 밸런스 적 dials by index
  (`DIFFICULTY.hpStepTiers.0.multiplier`). `lateFromMinute`/`lateMultiplier`
  now move only the rare chance. The user asked for this on 2026-10-18:
  minutes 5–10 were too easy and the ×5 step at ten a wall.
- **XP in finer units (0.120, the user's ask).** `XP.scale` and
  `XP_CURVE.A` are both ten times 0.119's — the same pace, but a kind no
  longer loses its fraction to rounding (the 기행종 gained ~30%). Only the
  kinds in `XP.roundTo` round coarser: the 일반 to 10, its old 1. A save
  carries `xpUnit`; one without it has its XP × `XP.unit` on resume. A
  kill's XP does **not** follow the clock: `xpFor` reads the kind's numbers
  and a rare's 속성 (`Enemy.hpScale` is the 속성's only), never
  `enemyHpScaleAt` — a 10-minute enemy pays what a first-minute one does.
  The user knows (2026-10-24); scaling it is an open question, not a bug
  to fix quietly. XP_CURVE is R 1.015 since 0.119 (PoE's 1.0483 before).
- **Upgrade cards carry their numbers.** `upgradeOptionsFor(skill, stats)`
  adds `now`/`next` (the skill's own stat, before its folds — capped at
  `UPGRADE_CAP`) and `taken`/`maxPicks` (`maxPicksFor`: the pick limit or
  the picks from base to cap, whichever is smaller; null when nothing stops
  it) to each option; `UpgradeScene` prints them under the detail. It stacks
  icon, title, cards and hint as one centred block, so two rows of cards on
  a phone push the rest up instead of over it.
- **Phones keep off the glass.** `fitStage` (Viewport.ts, first thing in
  main.ts) marks a touch screen `html.touch` and sets `#stage` to the height
  actually shown (`visualViewport`): `100vh` on a phone is the height with
  the browser's bars hidden, and the bottom of the game sat behind them.
  `.touch #stage` pads every side by at least the safe area, so no button is
  at the edge; the canvas is measured from `#game-root` inside that.
- **A saved run carries its tally.** `SavedRun.damage`/`kills` seed
  `RunStats` on resume (`seed`); before 2026-10-18 a resume started both at
  zero and the end screen, the board and the gold counted only the rest.
- **Touch never holds the run.** A phone fires a pretend mouse event after a
  tap; landing on a rare under a just-closed card used to set `inspecting`
  and freeze the arena and the pad. `setInspecting` ignores it on touch
  screens, and the pad is released whenever a popup opens or closes.
- **Bots.** `public/robots.txt` keeps crawlers off `/api/`. Static assets
  cost nothing; only `/api/*` counts against the Workers free plan (100k
  requests a day, 429 past it, reset at 00:00 UTC). Dashboard-side defences
  (Bot Fight Mode, WAF rules, a rate limit on `/api/*`) are the user's to
  switch on — the deploy token cannot.
- **Music.** `public/assets/Constance.mp3` is a 96 kbps encode (1.7 MB); the
  320 kbps original is `assets-src/music/Constance.mp3`. It is "Constance"
  by Kevin MacLeod (incompetech.com), CC BY 4.0: 제작자 정보 must name it,
  its source and the licence (`credits.roleMusic`, test-shell2 checks).
- **What ships is what is used (0.109).** `public/` holds only files the
  game loads; originals and sources live in `assets-src/` (not shipped).
  Sound effects are only freesound.org's "Approved for Free Cultural Works"
  (CC0 or CC BY 4.0 — a CC BY one owes its author a line in 제작자 정보), the
  user's rule; `public/assets/CREDITS.txt` lists every clip and its use. The
  pictures are all drawn by code: the swords, the 경험치 보석, the 화염구
  shot, the skill orb, the 체력 포션 (a green flask since 0.110 — the red
  square read as an enemy bolt) and four skills' icons are 16x16 grids in
  `config/pixelIcons.ts` (`PIXEL_ICONS`, painted ×`PIXEL_ICON_SCALE` by
  `BootScene.createPixelIcons`) — the Raven Fantasy pack they replaced was
  free only for games that earn nothing. A new icon is a grid there and a
  name (`SKILL_ICONS[id].pixel`, `ICONS.*.pixel` or `GEAR[id].icon`).
- **One drop rule.** Every ordinary drop is multiplied by the kill's
  `Enemy.dropBonus`: 1 + `RARE.dropBonusPerAffix` per 속성 on a rare,
  1 + `BOSS.dropBonus` for a 우두머리. The 하얀 망고 and the 자석 are the
  exceptions the user asked for: a flat `MANGO.chance` / `MAGNET.chance` off
  every kill. What only a 우두머리 leaves (its
  certain weapon, a `fromBossOnly` 구슬, a 뼈다귀 with `fromKill: 0`)
  and what is certain are not multiplied. A new drop should go through the
  same `bonus` in `CombatSystem.killEnemy`. (행운, the passive that raised
  it, went with the tree in 0.102.) The 재능의 파편 take no `bonus` either:
  only the tree's line for each.
- **알수없는 룬 (0.89, the user's ask).** `UNKNOWN_RUNE` (balance.ts): a
  kill of `from` (the 키메라) leaves one at a flat `chance`, nothing raising
  it. Picked up it does nothing yet — `GameScene.feelUnknownRune` shows
  `game.unknownRuneFelt` over the survivor and a violet glow; the user means
  it to strengthen the main skill later, so it is not stored anywhere.
  Its looks are 0.79's eight 룬 stones (`UNKNOWN_RUNE_LOOKS`, visuals.ts,
  drawn by `BootScene.createUnknownRuneTextures`), one at random a drop.
  The 자석 takes it, the 필터 has a switch (`unknownRune`), and it has an
  edge marker.
- **No 신성한 조각 since 0.83.** The drop, its entity, its 필터 switch and
  dial, the passive screen's gold shop and the shard copy all went (the
  user's ask). Gold went in 0.90 with selling (below); `RETIRED_STORAGE`
  (system.ts) clears its old key on load (main.ts).
- **Four rarities (0.91).** `DropTier` is 일반 · 마법 · 희귀 · 신화; a
  weapon's comes from its 속성 count (`AUDIO.dropTiers`: 2 마법 blue, 3–4
  희귀 yellow, 5–6 신화 red) and drives its border, ground label, drop sound
  and 분해 구슬. 신화 wears what 희귀 looked like before (red, white outline,
  the swell, the light pillar, the loud clip), so everything that was 희귀 —
  the 망고, 자석, 룬, the rare 구슬 and 뼈다귀, a 우두머리 제단 — is 신화 now;
  희귀 is yellow with 마법's clip.
- **나르실 and the 합성 rule (0.91).** `GEAR[id].combineInto: false` keeps a
  base out of every 합성 (`combineTargets`): the 오니고로시 only drops, the
  나르실 (`weight` 0, no `fromKill`: never dropped) is only made, for
  `craftOre` 1000 — so the 룬 각인 검 has no 합성 at all. Its 고정 속성 is
  flat attack (`GearImplicit.attack`, added in `gearBonusFor`).
- **Swords one kind leaves (0.137, the user's).** `GEAR[id].fromKind`
  ({kind, chance}, flat, nothing raises it; a dial each): the 오니고로시 off a
  우두머리 (2%, rolled first, in place of the weighted sword a 우두머리
  always leaves — its `weight` is 0 now), the 척추 검 off a 키메라 (2%), the
  별 부수는 검 off a 도망자 (2%) — `rollGearFromKind`, through
  `GameScene.rollGearDrop(fromBoss, bonus, kind)`. Both new ones are tier 1
  (attack 25, "공격력 +25" in the user's words) and `combineInto: false`.
  척추 검's `thornBurst` 고정 속성: a kill (`onEnemyKilled` hook) at `chance`
  throws the 키메라's thorn ring (its `volley` count/speed/lifespan,
  `TEXTURES.thorn`) from `GameScene.thorns`, a `Projectile` group with a
  `lifespanMs` override, each thorn `dpsShare` × the main skill's HUD DPS and
  counted to it; a thorn's kill (`Projectile.thorn`, `CombatSystem.thornKill`)
  throws none — the user's chain-reaction lesson from 독성폭발. 별 부수는 검's
  `shardChanceScale` multiplies `TALENT_SHARD.chance` (`shardScale` hook).
  The filter's sword row and the guide's card read `fromKind` too; the 별
  부수는 검 is drawn as a thick black 도 (the user's ask).
- **A 우두머리 picks one of three (0.137, the user's design).** Each time its
  ring comes round, `Enemy.pickCast` weighs `ENEMY_KINDS.boss.casts` (1/1/1):
  the ring; a `laser` (its line shown `aimMs` 1s, its direction fixed as it
  aims, then the ring's damage to the survivor anywhere along `width` 50 ×
  `length` from where it has walked to); a `leap` (only with the survivor
  within `maxDistance` 400 — the user's — the spot the survivor stood on
  shown 1s, then it is carried there over `leapMs` in a parabola `height`
  high, `airborne` — its body hurts no one, `onEnemyTouch` — its gold ring
  and shadow on the ground beneath (`leapLift`), and deals `contactTimes` 2
  × contact within `areaOfBody` 4 × its body's width). It keeps walking
  while it aims (0.138, the user's ask; it stood in 0.137). Hits go through `EnemyHooks.strikeSurvivor` →
  `Player.takeDamage`. Warnings are faint red (`BOSS_CAST_FX`, the user:
  "visibility must not drop much"). test-boss pins `casts` to the ring for
  its ring checks. The 키메라 has no `casts`: always its ring.
- **Weapons by tier — 1 is the best**, the same way round as an 속성's
  tier (the user corrected this once). `attackForTier` counts up from the
  weakest tier. A 우두머리 always leaves one, weighted over the whole `GEAR`
  roster. A sword with `fromKill` set (tiers 3–5 now) can also come off any
  kill at that chance × `bonus`; without it, 우두머리 only.
- **Seven rungs on every 속성 ladder (0.88).** `AFFIX_TIER_WEIGHTS` has
  seven; the old tiers 1–5 are 3–7 (same odds), 1–2 are the rare new top.
  Each ladder bends: a step up adds no more than the step below it
  (test-balance checks it). A weapon written before carries no `rungs`, and
  `onCurrentLadder` moves its lines down by `AFFIX_RUNGS` −
  `AFFIX_RUNGS_BEFORE` — as the stash is read (`GearStore.load`, never on a
  commit: what the game hands in is already on the new ladder) and as a
  saved run's weapon resumes (`GameScene.gearFor`). Every item the stash
  writes carries `rungs`; a test that writes the stash by hand must too.
  0.88 also halved 거대 · 신속 · 자력 and added 반복 (prefix,
  `repeatChance`: `CastRepeat` in Weapon.ts sets a weapon's cast clock so
  it goes off again `AFFIX_TIMING.repeatDelayMs` later, never twice
  running; 공허구체 re-arms the orb's hit on that enemy instead — its
  ladder (0.114, the user's ask) matches 광포's at a 0.6s cooldown, so it
  beats 광포 on slow skills and falls short on fast ones; test-balance
  holds that), 활력
  (suffix, `regen` every `AFFIX_TIMING.regenEveryMs`, `GameScene.regenerate`)
  and 기교 (suffix, `projectileBlock` added to the base's own).
- **Damage is 플랫 × 증가 × 증폭 (0.93, the user's rule).** `damageFor`
  (Modifiers.ts, `damageParts` for the HUD): (SKILL_BASE damage + the
  weapon's attack, 고정 속성 included) × (1 + every 증가, added: the run's
  공격력 picks as a share of the base) × every 증폭, multiplied: the passive
  피해, the weapon's `GearBonus.damageAmplify` (강력 and its 피해 고정
  속성, added within the weapon as its lines always are) and, in GameScene,
  the held 얼음창. `GearBonus.damageIncrease` is 0 until something rolls a
  weapon 증가. The skill's own `BALANCE.damageScale` stays a separate
  multiplier; 감전, 연쇄번개 각성 and 치명타 land on the hit after. A new
  damage source says 증가 or 증폭 in its text and goes in that layer.
  Since 0.122 (the user's ask) the flat part is SKILL_BASE damage + the
  weapon's attack × `BALANCE.attackCoeff[skill]` (the 무기 공격력 계수, a
  dial on each skill page, shown on the HUD card and the guide). All 1
  shipped — the damage as it was; the user chose this over making damage
  attack × coefficient alone, which would have moved every weapon's worth.
  The user first had 강력 as a 증가 and every base damage +15% to make up
  for it, then asked for neither: 강력 as an 증폭 keeps the old difficulty
  (only the weapon's attack now takes the passive, +0–5%).
- **A weapon's lines add, they do not compound.** `gearBonusFor` sums each
  line's share (scale − 1) with the 고정 속성's and returns 1 + the sum, so
  two +50% are +100%. 치명 is `critChanceIncrease`: the summed share raises
  `PLAYER.critChance` by that much of itself (`Player.critChance`), never
  points on top. (A rare enemy's 속성 still multiply — that is the enemy.)
- **강력 · 광포 · 치명 · 잔혹 are balanced as three lines together** (the
  user's ask, 2026-10-18, 0.60–0.61): 치명 and 잔혹 multiply each other, so
  matching them line by line made a 치명 + 잔혹 weapon twice as strong as
  any other. Now a lone 치명/잔혹 is a little under a lone 강력, and the best
  three either way come to the same (+72% at tier 1). 강력 is a
  `damageScale` share (every skill's damage, added to the base's 피해 고정
  속성), not the sword's attack. The formula is above `AFFIXES`;
  test-balance's parity checks hold the four together.
- **The records conflict is asked twice.** `ConflictScene` has no keep
  buttons: a side's card is pressed (`ask`), a popup says what is lost, and
  only its button (`confirm`) resolves; 취소 / Esc backs out.
- **고정 속성 are on the base, not the item.** `GEAR[id].implicit` (one
  effect each, Korean `detail` with `{value}`/`{skill}`, renamed through
  `names.gearImplicits`) is folded into `GearBonus` by `gearBonusFor`, outside
  the 접두어/접미어 slots. 오니고로시's `projectileBlock` is rolled in
  `CombatSystem.onEnemyShotHit`, only for a shot that would hurt; the extra
  projectile is `WeaponContext.extraProjectiles` (one more
  shot per cast, or one more orb).
- **장비 합성 is decided before it is shown.** `gear.combine(uids)` checks
  (`combineProblem`), rolls `GEAR_COMBINE.successChance`, spends the swords
  and adds the bare one tier up in one commit; `InventoryScene.playCombine`
  then plays the light (`COMBINE_FX`) with `busy` set and restarts the scene
  on the result. The 합성 button starts a pick, adds the cursor's sword, and
  runs once `GEAR_COMBINE.count` are picked; Space toggles a cell, Esc backs
  out. Its third button shares the row with 착용 · 버리기 so the pane is no
  taller on a short phone.
- **망고의 구슬 wards a weapon.** An `OrbSpec` with `ward` sets
  `GearItem.mango`; it lasts one 폭발의 구슬 whatever it rolls: a destroy
  roll comes back `saved` (weapon unchanged, `mango` gone) instead of
  `destroyed`, and a climb comes back `upgrade` with `wardSpent` (the note
  says the 망고 went). Only
  구슬 are warded against — a failed 합성 still spends its swords. The
  인벤토리 shows it on the cell (`GridItem.badge`) and in `stateLine` under
  the name, not as a read-out line (that block is budgeted to the screen).
- **각인의 구슬 (0.132, the user's design).** `ORBS.engrave` (as rare as the
  망고의 구슬, 신화): on a weapon of `engrave.minLines` (4) 속성 or more it
  marks one line, at random, as `GearItem.engraved` (side, id, tier — the
  first line on that side matching it is the one; `engravedAt` finds it, and
  a record whose line is gone loses the mark in `GearStore.sanitise`). Once a
  weapon, for good: 변화 · 혼돈 keep it and roll the rest
  (`rollAffixLines(count, keep)`, the kept line counted), 폭발 neither climbs
  nor swaps it and is refused with nothing else to work on (the destroy roll
  and the 망고 as ever), 각성 adds as usual, a 합성 comes out bare. The
  인벤토리 read-out ends the line with `gear.engravedMark`. test-gear §14c.
- **초월의 구슬 — planned, not built (the user's spec, 2026-10-26: "추후
  적용, 지금은 추가하지 마").** A 구슬 that gives a weapon one skill-enhancing
  effect: the skill and effect are random; it sits in a slot of its own (not
  a 속성 slot); once a weapon, never changed; no tiers. The effects, as the
  user set them: 타격 4번째 휘두름마다 피해 ×1.8 · 체력 30% 이하 적에게 피해
  +100%; 화염구 20% 확률로 1발 더 · 잔불 (2초, 초당 폭발 피해의 12%, 중첩 X);
  연쇄번개 연쇄 +1 · 첫 대상 피해 ×1.6; 얼음창 냉각된 적에게 +30% · 관통 +1;
  낙뢰 감전 효과 +15% · 사거리 +10%; 공허구체 사거리 +20% · 구체로 적 처치 시
  체력 1 회복; 드론 드론 +2 · 폭탄 범위 +20%; 독성폭발 중독 피해 +30% · 사거리
  +20%. Ask the user for its drop rate when it is built.
- **포션 (0.140, the user's).** A potion heals a flat `POTION.heal` (40; a
  fifth of the bar before), `HealthPotion.healing(extra)`; the "포션 효과"
  heal of a maxed skill is the same. The 재능 포션 회복량 (`potionHeal`, a
  shard stat and the `shardPotionHeal` line) adds `TALENT_SHARD.potionHeal`
  (1) a shard to it — flat, not a multiplier, through the `potionHeal`
  combat hook. It joined the 예언's talent pool through
  `DAILY_RULES.talentsSince` (from 10/27's day), so the day it shipped kept
  the rules it had shown; a 재능 added later should do the same.
- **The weapon in hand takes no 구슬 (0.140, the user's ask).**
  `canTakeOrb` beside `canSalvage`: the 인벤토리's buttons and `OrbScene`
  (`orbUse.equipped` says why). The one in hand still goes into nothing a
  구슬 or 분해 could take from it.
- **Swords are taken apart, not sold (0.90, the user's ask).** Selling and
  gold went. The 인벤토리's top-right 분해 · 제작 button (`forgeButton`,
  `openForge`, key F — 0.91 moved it there from the weapon's own row, the
  only way in) opens `ForgeScene` on the weapon under the cursor, three tabs:
  낱개 분해 (its own `ItemGrid`, asked twice, `잠금` per weapon —
  `GearItem.locked`, the padlock `TEXTURES.lock` as the cell's badge), 일괄
  분해 (bases ticked + at most N 속성, `gear.salvageMany`) and 제작
  (`gear.craft`: a bare sword for `GEAR[id].craftOre`; none on the
  오니고로시). What one gives is `salvageFor`: `GEAR[id].salvageOre` 철광석
  (`systems/Ore.ts`, `STORAGE.ore`, `window.ore`) and the first
  `SALVAGE_ORBS` entry of its rarity (0.91: 마법 변화, 희귀 혼돈, 신화 각성).
  The one in hand and a locked one are never taken (`canSalvage`); a locked
  one can still go into a 합성 — the lock is 분해's only. The 소모품 tab
  shows the 철광석. Back (or Esc) returns to the 인벤토리.
- **전투 알림 are toasts.** `GameScene.announce` hands every in-run line to
  `systems/Toasts.ts`: top-right (under the HUD on a narrow screen),
  `TOAST.lifeMs` each, at most `TOAST.max`, oldest out first. A toast's text
  is inside its container, not in `scene.children`; read `toasts.lines`.
- **Each sword has its own picture.** `GEAR[id].icon` (a grid in
  `PIXEL_ICONS`, 0.109) is painted as `gearTexture(id)`; the 인벤토리 grid, the drop on
  the ground, the 합성 result and the 필터 all draw it. `TEXTURES.gear` is
  left for the title's 인벤토리 icon and the 필터's rarity switches.
- **Rare drops stand in a light pillar.** `DropLabel` draws it for the 희귀
  (yellow) and 신화 (red) tiers (`LIGHT_PILLAR`, `TEXTURES.lightPillar`, tinted
  by `DROP_LABEL.tiers[tier].pillar`); the 제단 opts out with
  `{ pillar: false }` since it is walked up to, not picked up.
- **패치노트 a page at a time (0.118).** Drawn whole, 112 versions came to
  ~1,100 Text objects, each its own canvas and texture — about 2s blocked on
  a desktop, a freeze on a phone. `InfoScene` draws the newest
  `INFO.patchPage` (10) and a 더 보기 (`moreButton`, Enter/Space too) that
  lays the next lot under them (`showMore`, `pending`). The guide's tabs are
  short and still drawn whole. Anything that lists a growing history should
  page the same way.
- **The guide is chapters → tabs → cards** (`src/content/guide.ts`,
  `InfoScene`). Prose lives in each locale's `guide.cards[tab]` with
  `{placeholders}` that `values()` in guide.ts fills from config — a new
  number needs a key there, never a literal in the copy. Lists (skills,
  enemies, 속성, 구슬, 뼈다귀, swords, 패시브) are built from their tables,
  so a new entry gets a card by itself; test-info's 누락 검사 fails if any
  table entry has no card or a placeholder is left unfilled. The page is
  drawn by a camera of its own (`pageCam`) whose viewport is the reading
  window — `setMask` is a no-op under WebGL in Phaser 4, and that is what
  the old guide had been relying on.
- **타격 reaches what is drawn.** `MeleeStrike` measures reach to the edge
  of `Enemy.shownRadius` (half the giant's picture, or half its side) and
  widens the arc by how wide the enemy is, both for picking the target and
  for what the swing hits — a 우두머리 is drawn at `giant.drawn`, far wider
  than its body, and swings that visibly cut into it used to miss.
  Projectiles still meet the physics body.
- **A thrown skill has no range of its own.** For a skill with a
  `projectileSpeed`, `rangeFromStats` scales its base range by speed against
  base speed — targeting and flight both — so no thrown skill offers 사거리.
- **Reading holds the run.** The HUD's skills are icons (`Hud.slots`); a
  mouse over one opens a card spelling its DPS out (`GameScene.breakdownOf`,
  the same folds as `damageOf`/`cooldownOf`), and a mouse over a rare shows
  its 속성. Either sets `GameScene.inspecting`, which skips `update()` and
  pauses physics until the pointer moves off. A touch shows the same without
  the hold — on a phone that finger is steering. A popup that closes while
  something is being read leaves the arena paused (`held`).
- **폭발의 구슬 climbs, or swaps at the top.** It picks among lines below
  tier 1, and the replacement comes only from 속성 that have the rung above.
  On a weapon whose every line is tier 1 it trades one for a different
  tier-1 속성 the weapon does not carry (`swapTopLine`, outcome `swap`); the
  destroy roll and the 망고 work the same. Only a weapon with no lines
  refuses it.
- **구슬 are spent in a popup.** A 구슬 button (or its digit key) opens
  `OrbScene` over the paused 인벤토리, on the weapon under the cursor: a tab
  per 구슬, the picked one's `orbDetail` plus `OrbScene.rules` (every rule,
  numbers from the table), the weapon's read-out (`InventoryScene.describe`).
  `use()` decides and writes at once and draws on the next tick — a test
  that pins `Math.random` for the roll would otherwise trip Phaser's Text.
  The popup stays after a use, lighting the changed lines (`changed`); a
  destroyed weapon turns it into the notice and 확인. Closing hands the
  인벤토리 the weapon's uid (or null) and the note, and it restarts on them.
- **지형지물 (0.67).** `systems/Terrain.ts` lays `TERRAIN`
  (balance.ts) rocks per run from a seed (`SavedRun.terrainSeed`, so
  불러오기 finds the same field): each outline is one distance per angle
  round its centre (star-shaped), so inside is one comparison and out is
  straight away from the centre. It pushes the survivor and every enemy out
  on `postupdate`, after Arcade has moved them, and turns an enemy's
  stopped step along the rock toward the survivor's side (`slide`), so
  crowds walk round. Thrown things and gems fly over; every
  `CombatSystem.drop*At` lands clear of rocks (`clearOfTerrain` hook).
  `TERRAIN.devOnly` (false since 0.67) keeps a change to the dev server for
  the user to try first — they asked for that once. The harness turns rocks off
  (they would move hand-placed enemies) unless a page sets
  `window.__terrainOn` (test-terrain does).
- **키메라 (0.67) on its own clock (0.85).** `ENEMY_KINDS.chimera` is a 기행종's
  `hop` (copied from the erratic's *live* values when it was made) plus the
  우두머리's `volley` with `texture: TEXTURES.thorn` (an `EnemyShotSpec`
  with a texture is drawn at its own size and turned along its flight;
  without one it is the plain square, as before), the 우두머리's `maxHp`,
  `unstoppable` (`Enemy.freeze` ignores it) and, since 0.85,
  `guaranteedSkill`. The volley runs before the hop branch in
  `Enemy.update`, so a hopper can throw. It is not in `SPAWN_TABLE`: from
  `CHIMERA.firstMs` (10 min) one comes every `CHIMERA.intervalMs`
  (`SpawnDirector.spawnChimera`, off screen like a 우두머리, outside the cap,
  `onChimeraSpawned` → a toast), and a 제단 can offer one
  (`ALTAR_OFFERS.chimera`). The 14-minute 키메라 러시 (0.67–0.84) that
  cleared the field was taken out on the user's word.
  Since 0.87 it is a 우두머리's size: `size` 44 for the body, and `drawn`
  (an `EnemyKindSpec` field: the picture's size when not `size`, also what
  `Enemy.shownRadius` reads) 72. It has `poses` — BootScene draws it
  standing, leaping and casting (`enemyPose(texture, pose)` in visuals.ts),
  and `Enemy.strikePose` shows the leap while `hopping`, the cast for
  `poses.castMs` after `throwRing`, and flips it to face its way.
  Enemy sounds are a table, `AUDIO.enemies[kind][appear|death|cast]`,
  played by `sfx.playEnemy` with a per-part rest; the 키메라's are cut from
  `assets-src/chimera/hydra.mp3` by `tools/make-chimera-sfx.py`.
- **Tampering (0.70, 2026-10-20).** One account topped the board three
  days running with runs resumed from a save edited by hand (six skills in
  the hundreds at character level 20, 111 kills). Two halves now:
  - The server refuses a run whose 판 내역 is out of reach of itself
    (`implausible` in server/ranking.ts, numbers in `RULES.upgrades*`): the
    skills' upgrades summed against level-ups + a share of kills + 우두머리/
    도망자, and against the clock; and a run with no 판 내역. It answers a
    bare `refused`, never why — the user's ask. Checked against every live
    run with a 판 내역 when it shipped: only that account's three were over.
  - The saved run and the tree are sealed (systems/Seal.ts: a keyed hash in
    `_s`, `SEAL.pepper`). A record that does not match is not taken (the
    save is thrown away, the tree starts over). Unsealed ones are taken —
    and resealed — until `SEAL.graceUntil` (30 days), then refused. Tests
    write such records through `window.sealRecord`. CarryOver seals what
    it brings in. The key is in the bundle: this stops edits in the
    browser's tools, not someone reading the code — the server's check is
    the other half. The user chose not to detect devtools, and to leave the
    three runs on the board.
- **게임 폰트 (0.108, the user's pick).** Every label asks for
  `system-ui, sans-serif` in code; `systems/Fonts.useGameFont` (installed in
  main.ts) turns that into `TEXT.fontFamily` — `"ExiledPixel", "Galmuri11"`,
  then the system's. ExiledPixel is the title logo's own 5x7 letters as a
  font (`public/fonts/exiled-pixel.woff2`, built by
  `tools/make-logo-font.py` from PixelFont's grids plus digits, symbols,
  quotes, dashes, arrows and ★; lowercase drawn as capitals). It has no
  Hangul, kana or hanzi: the browser draws those per character in 갈무리 11
  (`public/fonts/galmuri/`, SIL OFL 1.1, © Lee Minseo — its LICENSE.txt
  must ship beside it, and the credits name it, `credits.roleFont`).
  `loadGameFonts` loads all three faces before the game is made (5 s at
  most). Simplified Chinese is only partly in 갈무리: when the language
  choice opens, add a Chinese pixel font as a third family. A glyph the
  logo font should have is a grid in the tool's `EXTRA`, then a rerun.
  On the dev server, `systems/DevFonts.ts` (a dynamic import, never in the
  bundle) puts a 폰트 비교 picker bottom-left: it sets `TEXT.fontFamily` to
  a candidate from its CDN (or 시스템, the look before 0.108), kept in
  `localStorage['dev-font']`.
  Phaser measures a font from a test string and found no descenders in
  these, so it drew every label low in its box and stacked lines met;
  `useGameFont` also lays `TEXT.gameFontMetrics` (shares of the size) over
  the measured metrics, in setStyle and on every re-measure (0.110). A
  layout that counts lines should read `style.getTextMetrics()`, not a
  fixed pixel height. `tests/text-check.mjs` (not a suite) walks every
  screen at both shapes and lists labels that cross, run onto a plate's
  edge or leave the screen — run it after anything that moves text.
- **Known gaps, left on purpose:**
  - The 뼈다귀 pick screen is reached only on the way into a fresh run (게임
    시작, and 다시하기 after a death — both through `BoneScene.before`).
    There is no way to look at the drawer without starting a run.
  - `tests/` has no suite for the edge markers' behaviour over time, only for
    where they are placed.
