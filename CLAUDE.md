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
running game, not units. 43 suites, ~1150 checks. It is the only thing that has
caught most of what has gone wrong here, so run all of it before every commit.

```sh
npx vite --port 5173 --strictPort          # leave running
cd tests
node run-all.mjs test-full test-skills test-balance test-chain test-ice \
  test-void test-enemies test-rare test-boss test-potion test-sfx test-perf \
  test-hud test-expiry test-audio test-touch test-shell test-shell2 test-info \
  test-i18n test-gear test-passive test-responsive test-stats test-bones \
  test-altar test-slot test-inventory test-locale test-back test-fugitive \
  test-ranking test-skillpick test-mango test-web test-loadout \
  test-carry test-api test-account test-live test-filter test-mastery \
  test-tuning
```

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
- **Crits are now 5% on every hit**, so anything that counts swings or asserts
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

- **balance.ts is the default, not always the live number.** The admin's
  밸런스 panel (below) can lay values over it for everyone, stored on the
  server. Before quoting a tuned number in a patch note or a report, look at
  `npm run db -- "SELECT overrides FROM tuning"` as well as the config; a
  dial path listed there wins. When the user asks to fold the live values
  back into balance.ts, copy them over and clear the row.
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
  `SKILL_PICK`), and that first skill is the run's **main skill**
  (`GameScene.mainSkill`, kept in the save as `main`): every level-up
  upgrades it; once it has taken every upgrade, a level-up (or a repeat
  pickup of any maxed skill) heals a 체력 포션's worth instead
  (`drinkForMaxedSkill`) — it never moves on to another skill. A skill found
  later is upgraded by finding it again. (Level-ups once went to a random skill; the user read that as the
  main skill changing, and asked for this.) With the
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
- **도망자 is table-driven.** `flee`, `lifespanMs`, `guaranteedSkill` and
  `flashy` on an `ENEMY_KINDS` entry give any kind that behaviour; the
  fugitive is the only one using them. It spawns on `FUGITIVE`'s clock.
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
  **No cached answer is kept by the browser** (`unstored` in server/http.ts,
  and the client fetches with `cache: 'no-store'`): a copy out of the
  Workers cache comes back from Cloudflare re-marked `max-age=14400` (the
  zone's browser TTL), and a PC that kept it showed a board hours old while
  the phone was current. The edge copy still lasts `RULES.cacheSeconds`.
  To look at the live database: `npm run db -- "SELECT * FROM daily_best"`
  (read-only queries only, unless the user asks; the dashboard's D1 console
  works too).
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
- **밸런스 다이얼.** `config/tuning.ts` lists every dial by path into the
  config tables (pure data — the Worker imports it to accept only those
  paths). `systems/Tuning.ts` lays three layers over the tables in place:
  balance.ts as built (captured at import), everyone's values from
  `GET /api/balance` (taken only on the title, `settle`, never mid-run), and
  the admin's draft (`TUNING.draftKey`, in `ACCOUNT.localOnly`, applied at
  once). `PUT /api/balance` is admin-only (`ADMIN_USERS`) and checks paths and
  ranges (server/tuning.ts, D1 table `tuning`, migration 0005).
  `TuningScene` is the panel: the title's 밸런스 icon and a pause row, both
  only when `devToolsAllowed()`. Most numbers are read where used, so a turn
  needs nothing more; a skill's stats were copied on pickup, so
  `GameScene.retune` scales them (keeping picks and level). A run that saw a
  draft is `tunedRun`, off both boards. test-tuning drives it with an
  in-page stand-in for /api/balance; test-api covers the endpoint.
- **아이템 필터.** `config/itemFilter.ts` builds a switch per kind of drop
  from the tables (구슬, 뼈다귀, swords by base and by rarity, plus potion,
  skill, 무작위 스킬, 망고, 조각); `systems/ItemFilter.ts` keeps the ones
  switched off (`STORAGE.itemFilter`, synced with the rest). Every
  `CombatSystem.drop*At` asks it first, so a switched-off drop never lands —
  a new drop function must too. `FilterScene` is the title's 필터 icon.
- **Live update.** Every build ships `version.json` (`{ build }`, the commit
  on CI) and is compiled knowing its own id (`__BUILD_ID__`, vite.config.ts).
  `systems/LiveUpdate.ts` asks every `LIVE_UPDATE.checkEveryMs` and when the
  tab returns; a newer build is applied only on the title with nothing else
  running (`safeNow`), by a reload — never mid-run. A reload that comes back
  on the old build is not retried (sessionStorage). Off on the dev server
  (`current === 'dev'`); test-live drives it through `liveUpdate.found`.
- **스킬 각성.** `SKILL_MASTERY` (balance.ts): at `level` a skill gets one
  more effect — `WeaponContext.mastered` is true and each weapon does its own
  (타격 strikes `enemyShots` in the swing, 화염구 shots carry `fireZoneDps`
  into `CombatSystem.burnGround`/`tickFireZones`, 연쇄번개 amplifies each
  strike by `chainBonusPerJump` for every jump still to come (it never
  doubles back — that was the old awakening),
  얼음창 shots carry `freezeMs` for an enemy already chilled (`Enemy.freeze`),
  공허구체 (whose hit timers are per orb: each orb hits an enemy once a
  cooldown, every orb on its own) pulls enemies near its orbit toward the survivor by moving x/y
  the way Separation does, 낙뢰 casts
  `thunderRecastChance` — a kill always strikes again, up to `THUNDER.maxRecasts`). Reaching it calls `GameScene.celebrateMastery`
  once (`awakened`, rebuilt from a save without a show); the HUD slot goes
  gold and its card adds the line (`masteryText`). test-mastery covers it.
- **A saved run carries its own weapon.** `SavedRun.gear` is a copy of the
  item the run went out with (`GameScene.runGear`, written by every save);
  a resumed run fights with that, so the 인벤토리 never locks — swapping,
  구슬, 합성 and selling change only runs started afterwards. A save from
  before this has no `gear` and takes the one in hand.
- **What acts on the survivor is on the HUD.** `GameScene.effectsNow()`
  hands `Hud.update` an `EffectEntry` list — 장비 (`runGear`), 패시브, each
  뼈다귀 (built once a run), then 하얀 망고 and 거미줄 while they last — drawn
  as icons left of the skills (`HUD.effectSlot`, buff/debuff edges in
  `HUD.effectEdge`), or on a row under them when that would run into the
  clock. Pointing at one opens the skills' card and the same hold
  (`Hud.pointEffect`). A new buff or debuff is one more push there.
- **효과음 음량.** `settings.sfxVolume` scales every effect through
  `effectVolume()` in Sfx.ts — skills, drops, the horn, the slot, the
  인벤토리's. A new sound that bypasses it ignores the player's setting.
- **자석 pulls by the scene clock.** Picking one up calls
  `CombatSystem.pullEverything`: every gem (`XpGem.pullTo`) and every
  ground item (`GroundItem.pullTo` — not the 제단) flies at the survivor via
  `flyTo`, fast enough to arrive within `MAGNET.pullMs`, and is collected by
  the ordinary overlap — so a potion at full health is still left. The pull
  is done in each item's own update: XpGem zeroes its velocity out of
  pickup range every frame, so setting a velocity from outside never sticks.
  A new kind of drop group goes in the `lying` list there.
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
  320 kbps original is `assets-src/music/Constance.mp3`.
- **One drop rule.** Every ordinary drop is multiplied by the kill's
  `Enemy.dropBonus`: 1 + `RARE.dropBonusPerAffix` per 속성 on a rare,
  1 + `BOSS.dropBonus` for a 우두머리. The 하얀 망고 and the 자석 are the
  exceptions the user asked for: a flat `MANGO.chance` / `MAGNET.chance` off
  every kill. What only a 우두머리 leaves (its
  certain weapon, shards, a `fromBossOnly` 구슬, a 뼈다귀 with `fromKill: 0`)
  and what is certain are not multiplied. A new drop should go through the
  same `bonus` in `CombatSystem.killEnemy`.
- **Weapons by tier — 1 is the best**, the same way round as an 속성's
  tier (the user corrected this once). `attackForTier` counts up from the
  weakest tier. A 우두머리 always leaves one, weighted over the whole `GEAR`
  roster. A sword with `fromKill` set (tiers 3–5 now) can also come off any
  kill at that chance × `bonus`; without it, 우두머리 only.
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
- **Swords are sold, not thrown away.** The 인벤토리's second button (still
  `discard`/`pressDiscard` in code) pays `sellPriceFor(item)` into
  `gold` (`GEAR_SELL`: rank from the weakest tier × `perRank`, + `perAffix`
  of that a 속성, added). The rank counts from the weakest, so the best sword
  is the dearest — the user chose that over the literal tier number.
- **전투 알림 are toasts.** `GameScene.announce` hands every in-run line to
  `systems/Toasts.ts`: top-right (under the HUD on a narrow screen),
  `TOAST.lifeMs` each, at most `TOAST.max`, oldest out first. A toast's text
  is inside its container, not in `scene.children`; read `toasts.lines`.
- **Each sword has its own picture.** `GEAR[id].icon` (a file under
  `public/assets/icons/`, picked from the Raven Fantasy pack, listed in its
  CREDITS.txt) is loaded as `gearTexture(id)`; the 인벤토리 grid, the drop on
  the ground, the 합성 result and the 필터 all draw it. `TEXTURES.gear` is
  left for the title's 인벤토리 icon and the 필터's rarity switches.
- **Rare drops stand in a light pillar.** `DropLabel` draws it for the 희귀
  tier (`LIGHT_PILLAR`, `TEXTURES.lightPillar`); the 제단 opts out with
  `{ pillar: false }` since it is walked up to, not picked up.
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
- **패시브 is a tree drawn from its table.** A `PASSIVES` entry with
  `requires: { id, rank }` hangs from that line and opens once it holds the
  ranks (`passives.isOpen`, checked inside `passives.spend`, so the rule is
  the store's, not the screen's); without it, it hangs from the root. Ranks
  bought before a line was gated are kept. `PassiveScene.layOut` places
  whatever shape the table gives — root on top, or on its side
  (`sideways`) on a wide window — so a new line is a table entry. The
  spacing shrinks to fit only down to `PASSIVE_TREE.minLevelGap` /
  `minLeafGap`; a bigger tree runs off its window and is dragged. The tree
  lives in its own container, drawn only by `treeCam` (a camera whose
  viewport is the framed window — no `setMask` under WebGL), so its
  coordinates are the window's own; a node is picked on the release of a
  press that did not travel `DRAG_FROM_PX`, and `pan`/`scrollTo` keep some
  of the tree in view (`dragMargin`).
- **폭발의 구슬 only climbs.** It picks among lines below tier 1, and the
  replacement comes only from 속성 that have the rung above; a weapon with
  nothing but tier-1 lines refuses it.
- **Known gaps, left on purpose:**
  - The 뼈다귀 pick screen is reached only on the way into a fresh run (게임
    시작, and 다시하기 after a death — both through `BoneScene.before`).
    There is no way to look at the drawer without starting a run.
  - `tests/` has no suite for the edge markers' behaviour over time, only for
    where they are placed.
