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
| `src/config/runes.ts` | 룬 (what a skill's 강화 슬롯 take), the slots, the 룬 끌 |
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
  the 뼈다귀 drawer, the save slot and the
  settings. Gear and 구슬 are not among them: they live in the run
  (`RunKit`, carried by the save slot only). Stores cache: writing the key behind a
  store's back does not change what the store already has in memory.

## The test harness

`tests/` drives a real Chrome over CDP against the dev server and checks the
running game, not units. 48 suites, ~1200 checks. It is the only thing that has
caught most of what has gone wrong here, so run all of it before every commit.

```sh
npx vite --port 5173 --strictPort          # leave running
cd tests
node run-all.mjs test-full test-skills test-balance test-chain test-ice \
  test-void test-enemies test-rare test-boss test-potion test-sfx test-perf \
  test-hud test-expiry test-audio test-touch test-shell test-shell2 test-info \
  test-i18n test-gear test-runes test-responsive test-stats test-bones \
  test-altar test-slot test-locale test-back test-fugitive \
  test-ranking test-skillpick test-mango test-web test-loadout \
  test-carry test-api test-account test-live test-filter test-mastery \
  test-tuning test-terrain test-chimera test-notice test-seal test-runloot \
  test-subskill
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
- **`cdp.evaluate` hands results back as one JSON string.** Returning
  everything on screen (the patch notes, every chapter of the guide) overflows
  it and the suite dies with `undefined`. Return the answer, not the corpus.
- Dev-only handles the suites drive: `window.game`, `window.config`,
  `window.bones`, `window.rollGearItem`,
  `window.gearBonusFor`, `window.orbApplied`, `window.sealRecord`,
  `window.openRecord`,
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
  The one exception is the 제단 (since 2026-10-18): its packs come exactly as
  offered, rare and all — it used to turn them into 우두머리 up to the
  ceiling and leave the rest plain. Do not add another spawn path that skips
  `place`.
- **No basic attack.** Every skill, 타격 included, is in `DROPPABLE_SKILLS`;
  a fresh run holds only what it picks off three cards (`SkillPickScene`,
  `SKILL_PICK`; every skill since 0.74, with a back button to the title
  that gives the 뼈다귀 put in back), and that first skill is the run's **main skill**
  (`GameScene.mainSkill`, kept in the save as `main`), and the survivor
  dresses for it (`Player.wearLook`, `PLAYER_LOOK.bySkill` in visuals.ts,
  drawn by `BootScene.createLookTextures`; the picture is
  `PLAYER_LOOK.drawn`, the body stays `PLAYER.size`). Since 0.76 a level-up
  asks which skill first when more than one can still take an upgrade
  (`levelPick`, SkillPickScene), then offers only `LEVEL_UP.upgrades`
  (피해, 공격속도) for it (`GameScene.levelOptions`); with none open it heals
  a 체력 포션's worth instead (`drinkForMaxedSkill`, said plainly: 포션
  효과! and the health over the survivor, a green burst, a `heal` toast).
  Every upgrade has a ceiling (`UPGRADE_MAX_PICKS` or `UPGRADE_CAP`). The
  only skill that drops is the 무작위 스킬 (0.76, `RANDOM_SKILL.chance`,
  while `slotSkills()` is not empty): it spins the 슬롯머신 over the skills
  not held, `SKILL_SLOT.rerolls` more spins allowed, and what it lands on
  is a 보조 스킬 (at most `SUB_SKILLS.max`), which starts with no 강화 슬롯.
  A 우두머리 / 도망자 (`guaranteedRune`) leaves a 룬. `GameScene.onSkillCollected`
  is kept as a seam — the F-keys and the harness give skills through it (a
  new one acquired, a held one's upgrade queued). (Level-ups once went to a
  random skill; the user read that as the main skill changing, and asked
  for this.) With the choice off (`#run`, the harness) a run starts on
  `UNSPUN_SKILL` (타격) so suites have something deterministic.
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
- **제단 chain on purpose.** A 우두머리 leaves a 제단 at `ALTAR.fromBoss` (a
  tenth since 2026-10-18 — at every one, a 고대 두개골 run drowned in them),
  ordinary kills leave one at `ALTAR.fromKill`, and a 제단 can call up 우두머리, which leave 제단. It is opt-in — nothing
  happens until the survivor walks up — so it is not capped. An altar arms only
  after the survivor has been outside its radius once.
- **The 슬롯머신 is generic.** `SlotScene` takes labels, icons, an
  optional `choose()`, `rerolls` and an `onResult(index)`; `SlotReel` is
  the reel on its own (`respin`). With a reroll left, a landing waits on
  획득 / 다시 돌리기 (Space / R); the last landing closes by itself. The
  무작위 스킬 is its only user (0.76). Phaser 4 has no
  `setMask` under WebGL — the reel fades its edges instead of clipping them.
- **What the harness switches off.** `cdp-lib` marks every page with
  `window.__harness`, and on the dev server that (or `#run`) turns off
  `SKILL_PICK.atRunStart`, `RANKING.promptOnDeath` and `RANKING.shared` —
  so suites land in play, the end screen is what they expect, and no test
  ever writes to the real shared ranking. A suite that wants one of them
  turns it back on (`test-skillpick`, `test-ranking`, which also replaces
  `fetch` with an in-page stand-in for the shared board).
- **Gear is the run's (0.71).** Three slots
  (`GEAR_SLOTS`: 무기 · 방어구 · 장신구), five bases each, every base its
  icon and 고정 속성; each 속성 names the `slots` it rolls on (`affixPool`).
  A run's `RunKit` (systems/RunKit.ts) holds what is worn, the 보관함
  (`RUN_BAG.capacity`) and the 구슬 picked up; it starts on `STARTING_KIT`
  worn bare (a 녹슨 검 and, since 0.72, a 천옷),
  is carried by the save (`SavedRun.kit`; an older save's `gear` comes back
  worn) and goes with the run. The title has no 인벤토리, there is no 판매,
  and the old stash and 구슬 drawer keys (`RETIRED_STORAGE`) are
  cleared on load — the user chose to delete them, not pay them out. A piece
  picked up queues a `gear` choice: `GearPickScene` shows it beside what is
  worn (`drawGearCard`) and always offers all three (0.72): 착용 (the old
  piece goes to the 보관함), 보관 (dimmed and dead while the 보관함 is full)
  and 버리기; one the 아이템 필터 hides goes
  into the 보관함 without asking. The pause menu's 장비 (`RunGearScene`)
  wears, combines and drops (both asked twice) and opens `OrbScene` on any
  piece, worn or kept. 합성 (`RunKit.combineSet`/`combine`,
  `combineTargetFor`): the picked kept piece and `GEAR_COMBINE.count` − 1
  more of its base (the fewest-line ones) make an 일반 piece of the same
  slot a tier up — always; nothing reaches past `GEAR_COMBINE.bestTier`
  (tier 1 is a 우두머리's only, so a tier-2 piece cannot go in). A drop's
  line count is its 등급's (`GEAR_DROP.grades`: 일반 2 · 마법 4 · 희귀 6, by
  weight, `rollGrade`); 구슬 can still leave any count, and the 등급 shown is
  read off the count (`AUDIO.dropTiers`). (0.71 had an empty-slot rule —
  a piece certain for a slot still bare within some kills; the user had it
  taken out in 0.72 with every kill rate halved.) Every change refits the run at once (`GameScene.refitGear`, health
  kept, only held under the new bar). `gearBonusFor` takes the worn list;
  `describeGear`/`orbNote` (systems/GearText) are the read-outs.
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
- **랭킹 검토 (the admin's, 0.62).** Every run handed in carries a 판 내역
  (`RunDetail`, built by `GameScene.runDetail`: build, version, kills by
  kind, 뼈다귀, weapon, skills, 룬 set (`runes`, 패시브 before 0.74), resumed), kept by the Worker in
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
- **A dial ships only when asked for (0.71).** The user had every dial taken
  off; a dial comes back only when they ask for that one (a line in
  `config/tuning.ts`, its root in `Tuning.ts` ROOTS, and its label — 구슬,
  뼈다귀 and gear are named from their tables). Back in 0.77: enemy health
  (`BALANCE.enemyHpScale`, `hpScalePerMinute`, each `hpStepTiers` index's
  minute and multiplier) and every drop off a kill. test-tuning reads the
  tables and fails on a kill drop or a health tier with no dial. The live overrides were copied into the
  tables first (balance.ts, equipment.ts, and the passive tree's file) and the server's
  `tuning` row cleared when 0.71 shipped. `Tuning.apply` lays a value over
  only for a path that is a dial, so a stale row can never put an old
  number back. `tuning.addDial` registers a dial at run time — the seam
  test-tuning drives the panel through.
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
  draft is `tunedRun`, off both boards — and says so (0.65): a toast as it
  starts (`game.draftRun`) and a red line on the end screen
  (`GameOverData.devReason`, `devRunNote`), the same for an F-key run. The
  admin once set a record with a draft left on and was never asked for a
  name; the draft stays in `TUNING.draftKey` until 실험 취소 or 전체 적용. test-tuning drives it with an
  in-page stand-in for /api/balance; test-api covers the endpoint.
- **아이템 필터.** `config/itemFilter.ts` builds a switch per kind of drop
  from the tables (구슬, 뼈다귀, swords by base and by rarity, plus potion,
  룬, 룬 끌, 망고); `systems/ItemFilter.ts` keeps the ones
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
- **A saved run carries its kit.** `SavedRun.kit` is the run's `RunKit`
  state (worn, kept, 구슬); 불러오기 restores it, and `saveGame.describe`
  names the weapon worn.
- **What acts on the survivor is on the HUD.** `GameScene.effectsNow()`
  hands `Hud.update` an `EffectEntry` list — 장비 (`runGear`), each
  뼈다귀 (built once a run), then 하얀 망고 and 거미줄 while they last — drawn
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
  320 kbps original is `assets-src/music/Constance.mp3`.
- **One drop rule.** Every ordinary drop is multiplied by the kill's
  `Enemy.dropBonus`: 1 + `RARE.dropBonusPerAffix` per 속성 on a rare,
  1 + `BOSS.dropBonus` for a 우두머리. The 하얀 망고 and the 자석 are the
  exceptions the user asked for: a flat `MANGO.chance` / `MAGNET.chance` off
  every kill. What only a 우두머리 leaves (its
  certain piece of gear, a `fromBossOnly` 구슬, a 뼈다귀 with `fromKill: 0`)
  and what is certain are not multiplied. A new drop should go through the
  same `bonus` in `CombatSystem.killEnemy`.
- **Gear by tier — 1 is the best**, the same way round as an 속성's
  tier (the user corrected this once). `attackForTier` counts up from the
  weakest weapon tier; only weapons carry attack. A 우두머리 always leaves
  one piece, weighted over the whole `GEAR` roster (every slot). A base with
  `fromKill` set (tiers 3–5 of each slot) can also come off any kill at that
  chance × `bonus`; without it, 우두머리 only.
- **Gear lines add, they do not compound.** `gearBonusFor` sums each
  line's share (scale − 1) across every piece worn, with each base's 고정
  속성, and returns 1 + the sum, so two +50% are +100%. 치명 is
  `critChanceIncrease`: the summed share raises `PLAYER.critChance` by that
  much of itself (`Player.critChance`), never points on top. (A rare
  enemy's 속성 still multiply — that is the enemy.)
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
- **망고의 구슬 wards a piece.** An `OrbSpec` with `ward` sets
  `GearItem.mango`; it lasts one 폭발의 구슬 whatever it rolls: a destroy
  roll comes back `saved` (weapon unchanged, `mango` gone) instead of
  `destroyed`, and a climb comes back `upgrade` with `wardSpent` (the note
  says the 망고 went). Only 구슬 are warded against.
- **전투 알림 are toasts.** `GameScene.announce` hands every in-run line to
  `systems/Toasts.ts`: top-right (under the HUD on a narrow screen),
  `TOAST.lifeMs` each, at most `TOAST.max`, oldest out first. A toast's text
  is inside its container, not in `scene.children`; read `toasts.lines`.
- **Each base has its own picture.** `GEAR[id].icon` (a file under
  `public/assets/icons/`, picked from the Raven Fantasy pack — the full pack
  sits, git-ignored, in `public/assets/Free - Raven Fantasy Icons`; picks
  are listed in icons/CREDITS.txt) is loaded as `gearTexture(id)`; the cards,
  the cells, the drop on the ground and the 필터 all draw it.
- **Rare drops stand in a light pillar.** `DropLabel` draws it for the 희귀
  tier (`LIGHT_PILLAR`, `TEXTURES.lightPillar`); the 제단 opts out with
  `{ pillar: false }` since it is walked up to, not picked up.
- **The guide is chapters → tabs → cards** (`src/content/guide.ts`,
  `InfoScene`). Prose lives in each locale's `guide.cards[tab]` with
  `{placeholders}` that `values()` in guide.ts fills from config — a new
  number needs a key there, never a literal in the copy. Lists (skills,
  enemies, 속성, 구슬, 룬, 뼈다귀, swords) are built from their tables,
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
- **룬 (0.74, the user's ask) replaced the passive tree.** The tree, its
  screen and its record are gone (`exiled-survivors:passives:v1` is in
  `RETIRED_STORAGE`; the keystones went with it). Every lasting bonus is
  still a `Modifier` (`config/stats.ts`: a `StatId`, a value, an optional
  skill tag), summed by `systems/StatSheet`; the layer the tree had is now
  each skill's own 룬: `RunModifiers.runes[skill]` (Modifiers.ts,
  `runesOf`), rebuilt by `GameScene.runeSheets` whenever the kit changes.
  It folds damage, attack speed, projectile speed (and so a thrown skill's
  range), extra projectiles, pierce, chain, area (`WeaponContext.areaScale`,
  a radius: √ of the area increase), duration (`durationScale`) and a
  skill's own crits (`critChanceFor` / `critMultiplierFor`, through the
  `critChance`/`critMultiplier` hooks CombatSystem rolls with). `RUNES`
  (config/runes.ts) is the table: mods, the `skills` a 룬 does anything for
  (`runeWorksFor`; since 0.76 one that does nothing cannot be set), weight, colour and a `glyph` BootScene draws. The main
  skill gets `RUNE_SLOTS.main` slots when acquired (`RunKit.ensureSlots`),
  any skill can reach `RUNE_SLOTS.max`. 룬 and 강화 슬롯 live in the
  `RunKit` (held `runes`, per-skill `sockets`, carried by the save). A kill
  leaves a 룬 at `RUNE_DROP.chance` × its bonus (`rollRune` by weight) and a
  룬 끌 at `RUNE_CHISEL.chance` while `chiselWanted` (some skill not full);
  a 룬 끌 queues a `chisel` choice (`RuneChiselScene`). The pause menu's 룬
  row opens `RuneScene` (a slot picked, then a held 룬 pressed or its
  number key). A set 룬 never comes out (0.76, the user's ask): it is only
  overwritten, asked twice, and the old one is gone (`RunKit.socket`;
  `unsocket` is left for tools). test-runes covers all of it.
  0.75: 반복 (`repeatCount` → `WeaponContext.repeats`, a `RepeatQueue` in
  each weapon that casts again `RUNE_REPEAT.gapMs` apart), 관통's price
  (`pierceDecay` → `pierceKeep`, the shot's damage multiplied on each pass,
  CombatSystem.onProjectileHit), 연쇄 on a thrown skill (`Projectile.chainTo`
  the nearest unhit enemy within `SHOT_CHAIN.reach`, after its pierce), 지속
  and 가속 lengthening a thrown skill's range (`GameScene.contextFor`), and
  포격 (`turret` → `byTurretFor`: the survivor's weapon rests and
  `GameScene.tickTurrets` sets a turret down every `TURRET.everyMs`, each
  its own weapon instance, kept and reused, cast from the turret's body for
  `TURRET.lifeMs`). Stats a 룬's `detail` says better are `hidden` in
  STAT_SPECS. Extra projectiles fan out round the aim (`ProjectileWeapon.fire`).
- **폭발의 구슬 climbs, or swaps at the top.** It picks among lines below
  tier 1, and the replacement comes only from 속성 that have the rung above.
  On a weapon whose every line is tier 1 it trades one for a different
  tier-1 속성 the weapon does not carry (`swapTopLine`, outcome `swap`); the
  destroy roll and the 망고 work the same. Only a weapon with no lines
  refuses it.
- **구슬 are spent in a popup.** `OrbScene` takes the run's kit and a piece
  (`OrbSceneData.kit`, `uid`), opened from 장비: a tab per 구슬, the picked
  one's rules, the piece's read-out. `use()` decides and writes at once and
  draws on the next tick — a test that pins `Math.random` for the roll would
  otherwise trip Phaser's Text. A destroyed piece leaves its slot empty (a
  weapon slot too: no attack until another is worn).
- **구슬 come like gems (0.71).** A run finds dozens (`ORBS[id].chance` is
  `perRun(n)` over `ORB_DROP.runKills`, the user's 30/10/10/5/3 on trial),
  so an `OrbDrop` has no name over it, no landing sound and no edge marker:
  inside the survivor's `pickupRadius` it flies in the way an `XpGem` does,
  and the pickup's toast names it — and so does a line over the survivor
  in the 구슬's colour (`ORB_DROP.pickupText`, on `damageNumbers`, rows
  stacking for pickups close together; 0.73). What is held is counted at the bottom
  right through the run (`systems/OrbTray.ts`, `HUD.orbTray`: every kind's
  icon and number, faint at none — 0.72).
- **The opening is slower (0.71).** `SPAWN.opening`: every spawn gap is
  `intervalScale` times as long until `untilMs`, easing back over `blendMs`
  (`SpawnDirector.intervalMs`), so a survivor with no gear yet is not
  buried. 하얀 망고 no longer makes the survivor untouchable (user's call);
  its speed boosts stay.
- **A second clock on every run (0.71).** `systems/RunLedger.ts` adds up
  the real time between the frames that move `GameScene.elapsedMs`
  (capped per frame, held while a card/popup/pause holds the run), in
  module scope rather than on the scene; the save carries it sealed
  (`SavedRun.wallMs`) and the run hands it in as `RunDetail.wall`. The
  Worker refuses a run whose shown time is more than `RULES.paceAhead`
  (+`paceAheadMs`) over it, or whose second clock is past `paceBehind` ×
  the shown (+`paceBehindMs`), or that has none — as `refused`, saying
  nothing (the user's ask). Honest play has the second clock at or a hair
  under the shown one (the shown steps ≤ 50ms a frame).
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
- **키메라 and 키메라 러시 (0.67).** `ENEMY_KINDS.chimera` is a 기행종's
  `hop` (copied from the erratic's *live* values when it was made) plus the
  우두머리's `volley` with `texture: TEXTURES.thorn` (an `EnemyShotSpec`
  with a texture is drawn at its own size and turned along its flight;
  without one it is the plain square, as before), the 우두머리's `maxHp`,
  and `unstoppable` (`Enemy.freeze` ignores it). The volley now runs before
  the hop branch in `Enemy.update`, so a hopper can throw. It is not in
  `SPAWN_TABLE`: `CHIMERA_RUSH` (balance.ts) is the only way in —
  `SpawnDirector.rush` takes over `update` once the clock passes `atMs`:
  clears the field (no kill, no drop), calls `onChimeraRush` (GameScene
  shakes the camera, drops enemy shots, horn, toast), then a 키메라 at the
  world's centre every `intervalMs` under `SPAWN.maxAlive`; nothing else
  spawns but what a 제단 calls. `seed()` past `atMs` resumes in the rush.
  Enemy sounds are a table, `AUDIO.enemies[kind][appear|death|cast]`,
  played by `sfx.playEnemy` with a per-part rest; the 키메라's are cut from
  `assets-src/chimera/hydra.mp3` by `tools/make-chimera-sfx.py`.
- **The title's rainbow notice (0.68).** `TITLE_NOTICE` (visuals.ts;
  `enabled: false` takes it off) draws the locale's `menu.notice` with
  `systems/RainbowText` — one white glyph per Text, tinted round the hue
  wheel each frame (a tint, so nothing is redrawn), wrapped at spaces but
  not at ` `. `MenuScene.addNotice` puts it in the first room that
  holds it at `minScale`: beside the rows (tilted), under them, over the
  logo, or left of the icons; with none, the title goes without. The user
  asked for it while the game is being rebuilt — expect to be asked to
  change or remove it. test-notice checks five window shapes for overlap.
- **Tampering (0.70, 2026-10-20).** One account topped the board three
  days running with runs resumed from a save edited by hand (six skills in
  the hundreds at character level 20, 111 kills). Two halves now:
  - The server refuses a run whose 판 내역 is out of reach of itself
    (`implausible` in server/ranking.ts, numbers in `RULES.upgrades*`): the
    skills' upgrades summed against level-ups + a share of kills + 우두머리/
    도망자, and against the clock; and a run with no 판 내역. It answers a
    bare `refused`, never why — the user's ask. Checked against every live
    run with a 판 내역 when it shipped: only that account's three were over.
  - The saved run is sealed (systems/Seal.ts: a keyed hash in `_s`,
    `SEAL.pepper`; the passive tree was too, until it went in 0.74). A
    record that does not match is not taken (the save is thrown away).
    Unsealed ones are taken —
    and resealed — until `SEAL.graceUntil` (30 days), then refused. Tests
    write such records through `window.sealRecord`. CarryOver seals what
    it brings in. The key is in the bundle: this stops edits in the
    browser's tools, not someone reading the code — the server's check is
    the other half. The user chose not to detect devtools, and to leave the
    three runs on the board.
- **Known gaps, left on purpose:**
  - The 뼈다귀 pick screen is reached only on the way into a fresh run (게임
    시작, and 다시하기 after a death — both through `BoneScene.before`).
    There is no way to look at the drawer without starting a run.
  - `tests/` has no suite for the edge markers' behaviour over time, only for
    where they are placed.
