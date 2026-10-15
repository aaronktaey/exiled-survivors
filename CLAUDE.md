# Exiled Survivors — working notes

Vampire-Survivors-like, in the browser. Vite + TypeScript + Phaser 4, deployed
to GitHub Pages on every push to `main`:
<https://aaronktaey.github.io/exiled-survivors/>

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
| `src/config/passives.ts` | the passive tree, bought with 신성한 조각 |
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
  the stash, the passive tree, the purse, the 구슬 drawer, the 뼈다귀 drawer,
  the save slot and the settings. Stores cache: writing the key behind a
  store's back does not change what the store already has in memory.

## The test harness

`tests/` drives a real Chrome over CDP against the dev server and checks the
running game, not units. 36 suites, ~935 checks. It is the only thing that has
caught most of what has gone wrong here, so run all of it before every commit.

```sh
npx vite --port 5173 --strictPort          # leave running
cd tests
node run-all.mjs test-full test-skills test-balance test-chain test-ice \
  test-void test-enemies test-rare test-boss test-potion test-sfx test-perf \
  test-hud test-expiry test-audio test-touch test-shell test-shell2 test-info \
  test-i18n test-gear test-passive test-responsive test-stats test-bones \
  test-altar test-slot test-inventory test-locale test-back test-fugitive \
  test-ranking test-skillpick test-mango test-web test-loadout
```

`run-all.mjs` starts Chrome itself (`CHROME_PATH` overrides where it looks),
clears storage between suites and writes screenshots to `tests/shots/`. One
suite on its own: `node run-all.mjs test-gear`.

### Writing checks that hold up

- **Never hard-code a tuned number.** Read it off `window.config` in the page.
  Half the regressions in this harness have been the user changing a value in
  `balance.ts` and a test asserting the old one.
- **Crits are now 5% on every hit**, so anything that counts swings or asserts
  an exact figure must either turn the base chance off for the measurement
  (`window.config.PLAYER.critChance = 0`, put back after) or assert "was hit"
  rather than "was hit for exactly N".
- **A hidden Chrome window stops Phaser's loop**, which fails every check at
  once for a reason that has nothing to do with the game. `cdp-lib.mjs` pins
  the page visible and raises the window on connect; leave that in.
- **Phaser calls `Math.random` when it makes a new Text.** A probe that
  pins `Math.random` to force a drop roll must first fill every pool the
  kill can draw from (drop one of each and collect it) with the real roll,
  or the first new label throws "reading 'context'" — see test-mango.
- **`cdp.evaluate` hands results back as one JSON string.** Returning
  everything on screen (the patch notes, every chapter of the guide) overflows
  it and the suite dies with `undefined`. Return the answer, not the corpus.
- Dev-only handles the suites drive: `window.game`, `window.config`,
  `window.gear`, `window.orbs`, `window.bones`, `window.passives`,
  `window.gold`, `window.gearBonusFor`, `window.orbApplied`,
  `window.critMultiplierFor`. They are behind `import.meta.env.DEV`, so the
  deployed build does not have them — a live check can only click and look.
- `#run` on the dev server skips the menu and drops straight into a run.

## Before committing

1. `npx tsc --noEmit`
2. `npx vite build`
3. the full regression above, green
4. a patch note in `src/content/patchNotes.ts`, **all four languages**, as a
   **new version entry for every deploy** (0.20 → 0.21 → …). Write it by
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

- **The user's numbers are theirs.** Tier values, drop rates, enemy health,
  potion strength — propose, do not quietly re-tune. When a request implies a
  number that would make something unplayable, implement it with a documented
  ceiling in config and say so in the report (that is why
  `BONE_RUN.maxBosses` exists).
- **One rule for the 고대 두개골.** Every spawn that rolls rare goes through
  `SpawnDirector.place`: under the skull it is a 우두머리 while fewer than
  `BONE_RUN.maxBosses` are up, and an ordinary enemy after — never a rare.
  The 제단's rare packs go through the same function. Do not add a second
  spawn path that skips it.
- **No basic attack.** Every skill, 타격 included, is in `DROPPABLE_SKILLS`;
  a fresh run holds only what it picks off three cards (`SkillPickScene`,
  `SKILL_PICK`), and a level-up upgrades a random skill in hand. With the
  choice off (`#run`, the harness) a run starts on `UNSPUN_SKILL` (타격) so
  suites have something deterministic. A 무작위 스킬 on the ground opens the
  same three cards; taking one already held queues its upgrade next.
- **The slot sound is one file in two parts** (`AUDIO.slot`: run / stop),
  levelled quiet on purpose — the user found the first mix far too loud.
  `tools/mix-slot.py` rebuilds `public/assets/slot.mp3` from
  `assets-src/slot` and prints the offsets to copy into config. The jackpot
  clips (in `assets-src/slot` and `public/assets`) are kept for later: do not
  use or delete them.
- **Every other language is checked for Korean.** Data tables are written in
  Korean and a locale renames what it knows (`names.*`); `test-locale` walks
  every screen in en/ja/zh and fails on any Hangul left on it. A new name,
  line or button needs its entry in all three, and a weapon tier line goes
  through `names.affixGearDetails` with `{value}`.
- **Back buttons.** Every screen but the title and the run calls
  `addBackButton` (top-left, arrow only below 600 wide) with the same exit
  Esc takes; `test-back` checks each one sits clear and goes where it
  should. A new screen should do the same.
- **제단 chain on purpose.** Every 우두머리 leaves a 제단 (`ALTAR.fromBoss`),
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
- **Contact is per enemy.** A body hurts through `Player.takeContact` on its
  own `ENEMY.contactCooldownMs`, so a crowd all hurt at once; only thrown
  things (`takeDamage`) open the survivor's invulnerable window. The debug /
  test switch `setInvulnerable(true)` still holds off both.
- **도망자 is table-driven.** `flee`, `lifespanMs`, `guaranteedSkill` and
  `flashy` on an `ENEMY_KINDS` entry give any kind that behaviour; the
  fugitive is the only one using them. It spawns on `FUGITIVE`'s clock.
- **랭킹 is shared through a stopgap.** Every board is kept locally
  (`STORAGE.ranking`) and folded together with one object on restful-api.dev
  (`RANKING.shared.url`) — free, no account, readable and writable by anyone
  with the address, and liable to vanish. Two entries at the same moment can
  overwrite each other. Replace the store's `pull`/`request` with a real
  server when there is one; the screens only touch `top`, `placeFor`,
  `submit`, `refresh` and `source`. Flags are drawn textures
  (`tex-flag-XX`), not emoji: Windows has no flag emoji.
- **One drop rule.** Every ordinary drop is multiplied by the kill's
  `Enemy.dropBonus`: 1 + `RARE.dropBonusPerAffix` per 속성 on a rare,
  1 + `BOSS.dropBonus` for a 우두머리. What only a 우두머리 leaves (its
  certain weapon, shards, a `fromBossOnly` 구슬, a 뼈다귀 with `fromKill: 0`)
  and what is certain are not multiplied. A new drop should go through the
  same `bonus` in `CombatSystem.killEnemy`.
- **Weapons by tier — 1 is the best**, the same way round as an 속성's
  tier (the user corrected this once). `attackForTier` counts up from the
  weakest tier. A 우두머리 always leaves one, weighted over the whole `GEAR`
  roster. A sword with `fromKill` set (tiers 3–5 now) can also come off any
  kill at that chance × `bonus`; without it, 우두머리 only.
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
- **Known gaps, left on purpose:**
  - A 구슬 can still be spent on the weapon a saved run is holding. Swapping
    is blocked while a run is saved; rerolling it is not.
  - The 뼈다귀 pick screen is reached only from 게임 시작. There is no way to
    look at the drawer without starting a run.
  - `tests/` has no suite for the edge markers' behaviour over time, only for
    where they are placed.
