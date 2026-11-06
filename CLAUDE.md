# Ascii Dungeon

A turn-based ASCII maze crawler. You are `@`, walls are `#`, the exit is `!`. You descend **100 procedurally
generated floors** with rising difficulty, fog of war, 3 lives and enemies. Clearing floor 100 wins.
TypeScript + Canvas 2D, no game framework. Targets: **web (first class), Android APK (Capacitor, minimum Android 7.0 /
API 24)**; Windows/Linux desktop builds (Tauri) are planned but not started (M6). Version **1.0.0**, MIT licensed (see
`LICENSE`, `THIRD_PARTY_NOTICES.md`, `README.md`).

The full design, decisions and milestone history are in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
(read §1 decisions and §15 enemy notes before designing anything; the design of the 17 enemy types is in
[docs/ENEMY_ROSTER_PLAN.md](docs/ENEMY_ROSTER_PLAN.md)). Android build details are in
[docs/ANDROID.md](docs/ANDROID.md). This file is the quick-start; the plan is the reference.

## Commands

```bash
npm run dev              # Vite dev server on http://localhost:5173 (Node 22.12+)
npm test                 # vitest run (about 2 minutes: the generator property tests build thousands of floors)
npx vitest run src/core  # one folder or file; add -u to refresh snapshots (check the diff first!)
npm run typecheck        # app + core/gen (no DOM) + scripts
npm run lint             # eslint
npm run format           # prettier --write .
npm run build:web        # typecheck + vite build
npm run gen -- --seed ABC123 --floor 40    # print a floor as ASCII (x stone, p..P patrol, s..S spear, c chaser, + life)
npm run gen -- --table --seeds 30          # per-floor difficulty stats for floors 1-100
npm run solve -- --seed ABC123 --floor 1   # a shortest solution as WASD keys
npm run fairness -- --floors 30,60,100 --seeds 100 --explorer   # scripted players on generated floors (see below)
npm run build:android    # debug APK (needs Android Studio's JDK 17+ and SDK; see docs/ANDROID.md)
npm run release:android  # release APK (unsigned until android/keystore.properties exists)
```

Before calling work done run: `npx prettier --check . && npm run typecheck && npm run lint && npm test`.

Releasing: bump the version with `npm version <x.y.z> --no-git-tag-version && npm run version:sync` (the second step
copies it to the Android `versionName` and `versionCode = major*10000 + minor*100 + patch`).

Dev URL shortcuts: `http://localhost:5173/?seed=ABC123&floor=40` starts straight on that floor and never
touches the saved run.

## Architecture

```
src/
  core/    pure game rules: NO DOM, NO Math.random / Date.now / performance.now (eslint enforces it)
  gen/     pure, deterministic floor generation and enemy placement (same rules as core/)
  render/  canvas glyph renderer, camera, layout, themes, HUD drawing (draw-floor.ts)
  ui/      screens (Title, Game, Pause, Settings, Controls, FloorTransition, GameOver, Victory)
  app/     App.ts (screen stack, flow, autosave wiring), Screen interface, seed helper
  input/   InputManager (key repeat), keyboard, bindings, DOM D-pad, swipe
  save/    versioned save + settings, migrations, write-queued stores
  platform/ storage backends (localStorage / Capacitor Preferences), native lifecycle hooks
  i18n/    en.ts is the source of truth for text keys; it.ts is typed against it
  debug/   dev-only overlay (stripped from production via import.meta.env.DEV)
scripts/   gen-map, solve, sync-version, build-android
android/   committed Capacitor project; capacitor.config.ts; assets/*.svg generate icons
```

Rules that keep the project healthy:

- **`core/` and `gen/` stay pure.** `tsconfig.core.json` compiles them without DOM types. All randomness goes
  through `Rng` (`core/rng.ts`, sfc32 + cyrb128), seeded from strings. Never call `Math.random`.
- **A seed always plays out the same way.** Floors derive from `runSeed:floor`; enemy placement uses its own
  stream `runSeed:floor:enemies`; enemy behaviour randomness uses `state.enemyRng`. Terrain generation must
  never consume the enemy stream.
- **Whenever generator output changes for the same seed, bump `GENERATOR_VERSION`** in
  `gen/generate-floor.ts` (it is stored in saves) and refresh snapshots deliberately. Current value: 21.
- Turn logic is **one pure function**: `applyAction(state, action)` in `core/turn.ts` returns `GameEvent[]`.
  The UI reacts to events; it never mutates rules state itself.
- Screens implement `app/Screen.ts` (`render`, `onMove`, `onKey`, `onWait`, pointer hooks, `tick`,
  suspend/resume). `App` owns a screen stack. Rendering is on demand (`requestRender`, a dirty flag).
- Match the surrounding style: strict TypeScript, no `any`, comments explain _why_, Prettier formatting,
  tests next to the code (`*.test.ts`).

## What is built (feature list)

### Core game

- **Tile maps:** `FloorMap` (tiles, explored memory, start, exit, `spawns`, `directives`), ASCII round trip with
  `parseMap` / `serializeMap(map, { enemies })` (`#` wall, `.` floor, `@` start, `!` exit, enemy markers below;
  trailing `;name value` lines are floor-wide directives).
- **Turn-based movement** on a 4-connected grid; bumping a wall costs nothing and takes no turn.
- **Fog of war:** symmetric shadowcasting FOV (integer slopes, `core/fov.ts`), per-floor explored memory,
  sight radius from the difficulty curve (10 on floor 1 down to 4 on floor 100). Enemies do not block sight.
- **Lives:** 3 per run, carried across floors (`core/lives.ts`). Losing one respawns you on the floor's start
  tile, resets the floor step counter, keeps the explored map, timer, run totals and enemies, restarts timed
  hazards (spears) and gives a one-turn grace period against moving enemies. At 0 lives: Game Over.
- **Floors:** 100, ending in a Victory screen. Stats tracked: floor steps, total steps, floor/total time, deaths.
- **Life pickups:** a green `+` on floors 10, 20 ... 90 (not 100) that restores one life up to the cap of 3.
  At 3/3 it stays and shows "Lives are full". See the section below.
- **Wait action** (`{ type: 'wait' }`): takes a turn without moving; enemies and spears keep moving.

### Floor generation (`gen/`)

- Floors 1-10 **Rooms and Mazes** (rooms, mazes, union-find connectors, dead-end pruning, braiding); floors
  11+ **Growing Tree** (newestBias from 0.25 to 1, braid 0.5 to 0). Start and exit via BFS percentile.
- Validation on every floor (odd size, solid border, reachable exit, no isolated pockets, minimum path length,
  enemy rules); retries on the same RNG stream, then a perfect-maze fallback that always passes.
- Difficulty curve in `gen/difficulty.ts` (`paramsForFloor`): size 21 to 61 (reached on floor 60), sight,
  exit distance, enemy count 0/1 to 24, enemy type unlocks. **All tuning lives in this one file.**
- Property tests generate 150 seeds on 21 floors across the run (every floor also plays out the safe-walk check, below); snapshot tests pin terrain and enemy output (and `;directives`).

### Enemies (`core/enemy-defs.ts`, `core/behaviors.ts`, `gen/enemies.ts`)

Enemies are entities (not tiles) placed on walkable tiles, data-driven by `ENEMY_DEFS`.
Common rules: every tile an enemy can occupy is at least 6 steps from the start, off the start and exit, and
shared with no other enemy; contact (walking into one, or it moving onto you) costs a life.

| Type           | Glyph                                      | From floor | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bloodstone** | `#` dark red                               | 2          | Never moves. Stays drawn (dimmed) once seen. Never on the shortest start-exit route. ASCII `x`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Patroller**  | `&`                                        | 8          | Walks a straight 3-7 tile segment, one tile per turn, bouncing at the ends. Whole segment off the shortest route. Hidden out of sight. ASCII `p` start / `P` far end.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Wanderer**   | `r`                                        | 12         | Ambles around its home at half your speed (moves on every 2nd turn, pauses 25% of those, keeps its heading 70%). Leash 12 steps from home, never within 2 tiles of the start, never on the exit or other enemies. Home off the route, 8+ steps from the start. Max 3 per floor. Only "exit reachable" is guaranteed. ASCII `r`.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Mimic**      | `+` (revealed `M`)                         | 16         | Dressed as the life pickup (same `+`, same colour, same dimming) until you are within 2 steps in view; then it turns into `M` (message "It was a Mimic!", auto-repeat stops). If you end a turn next to it, the tiles around it are marked `:`; stay another turn and it strikes them (and its own tile always hurts). Stepping back is always safe. About 1 floor in 3 from floor 16, never on pickup floors (so a `+` there is real), max 1, dead end 8+ steps off the route, every tile it can strike off the route. Placed in its own pass (`gen/mimics.ts`), not by the weighted draw. ASCII `m`.                                                                                                                                                                   |
| **Spear**      | tip `> < ^ v`, shaft `- \|`                | 20         | Base tile; its length grows 1 to max (3-6) and back, one tile per turn; **every** tile hurts. Base off the route but the reach may cross it; kept only if `routeSurvivable` (`gen/spear-timing.ts`) proves the route can still be walked by moving/waiting. Cycle restarts on respawn. ASCII `s` base / `S` full-reach tip.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Sentinel**   | `T` body (`H` colourblind), beam `=` / `I` |            | `                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 24  | A turret with its back to a wall, facing a straight beam of 4-7 tiles. Cycle of 6, 8 or 10 turns (from its position): idle, then the beam tiles are marked `:` for 2 turns (auto-repeat stops if you can see it), then the beam hurts for one turn. The body is solid, hurts when touched and stays drawn once seen; Bloodstones do not stop the beam. Body off the route; the beam may cross it and is kept only if `routeSurvivable` proves the route can be walked. The body never seals part of the floor off. Max 2 per floor, 4 from floor 60. ASCII `t` body / `T` tip.  |
| **Sleeper**    | `z` asleep, `Z` awake (`n` / `N`)          |            | `                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 28  | Sleeps at home like a Bloodstone (stays drawn once seen). A move of yours that ends within 4 walking steps (walls count; waiting is silent) wakes it: it stirs for one turn (`Z` in the warn colour, auto-repeat stops), then hunts like the Chaser for 12 turns, then walks home ignoring you and falls asleep there. Awake it is hidden out of sight and announced again when it returns into view. Home off the route, 12+ steps from the start. Max 1 per floor, 2 from floor 65. Only "exit reachable" is guaranteed. ASCII `z`.                                           |
| **Blinker**    | `k` (`j`), landing mark `?`                |            | `                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 30  | A roaming Bloodstone: sits on its tile, then every 8 turns jumps to a tile within 6 walking steps of home. The landing tile is picked 2 turns earlier and shown as `?` (auto-repeat stops if you can see it); standing there when it lands costs a life. Never lands on the exit, within 3 tiles of the start or on another enemy; it may land on the route (a wait, never a life). Hidden out of sight. Home off the route, 8+ steps from the start, with 6+ tiles to jump to. Max 2 per floor. ASCII `k`.                                                                     |
| **Bouncer**    | `Y` shut (`V`), `y` closing                |            | `                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 32  | A springy gate on the shortest route (the only enemy allowed there, because it always opens): shut for 5 turns of an 8-turn cycle, then open; the last open turn shows `y` because it closes next. Touching it while shut (or being on its tile when it shuts) throws you back 4 tiles along your own footsteps: no life lost, steps not refunded. Placed on a plain corridor tile of the route, 8+ steps from the start and 5 from the exit, 3+ tiles from another gate; kept only if `routeSurvivable` proves it can be passed by waiting. Max 2 per floor. ASCII `y`.        |
| **Chaser**     | `c` idle, `C` hunting                      | 35         | Waits at home; sees you within 5 tiles (line of sight), then hunts one tile per turn along the shortest path (same speed as you). Gives up after 8 turns without sight and walks home; after you respawn it goes home and idles 4 turns. Bloodstones are walls to it. Max 1 per floor until 59, 3 from 60. Home off the route, 12+ steps from the start. Only "exit reachable" is guaranteed. ASCII `c`.                                                                                                                                                                                                                                                                                                                                                                 |
| **Shade**      | `u` (`v`), violet                          |            | `                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 40  | A slow drifter whose touch blinds instead of hurting. Idle at home, it feels you within 6 walking steps (no line of sight needed) and drifts toward you on every second turn; after 10 turns without you that close it drifts home. Touching it (either way): your sight radius drops to 3 for 25 turns ("Darkness falls", `DARK n` in the HUD, dim vignette; the explored map stays), no life lost, and that Shade vanishes until you respawn. A second touch refreshes the timer, never deepens it. Home off the route, 10+ steps from the start. Max 2 per floor. ASCII `u`. |
| **Sweeper**    | `X` (`%`) pivot, arm `=` / `I`             | 44         | A pivot (solid, hurts if touched, stays drawn once seen) with one arm of 2-4 tiles that turns a quarter clockwise every turn (period 4); walls cut the arm short, so a wall beside the pivot makes that turn free. The arm tiles hurt; the arm of the next turn is marked `:`. Pivot off the route; the arms may cross it and the floor is kept only if `routeSurvivable` proves the route can be walked; every tile any arm can reach is 6+ steps from the start; the pivot never seals part of the floor off. Max 1 per floor, 2 from floor 70. ASCII `w` pivot / `W` arm tip at the start.                                                                                                                                                                            |
| **Pendulum**   | `&` (`$`)                                  | 48         | A patroller whose lane meets the shortest route in exactly one tile (it crosses the route, or runs out of it from a junction), so you time your way across. Walks its 4-7 tile lane one tile per turn like a Patroller, but starts over at its first end when you respawn. Placed as a pair (two lanes whose route tiles are 2-8 route steps apart); a floor that fits only one lane gets a single. Kept only if `routeSurvivable` proves the route can be walked with every timed enemy in play. Max 1 pair per floor, 2 pairs from floor 70. Same look as the Patroller. ASCII `q` start / `Q` far end.                                                                                                                                                                |
| **Lurker**     | `L` (`K`), hidden until revealed           | 52         | A trap on the first tile of a small dead end (at most 8 tiles) that branches off the route. Invisible and never reported until you end a turn on the route tile next to it: then it shows itself ("Something lurks here!", auto-repeat stops) and marks the tiles around it `:`; a second turn beside it strikes (so keep moving: a dash is always safe, stepping back is too). Walking into its tile costs a life. Stays drawn (dim) and armed afterwards, also after a respawn. It is a solid body whose pocket is reserved (no enemy or pickup there). The route proof never makes you wait next to one (`EnemyDef.noStop`). Max 2 per floor. ASCII `l`.                                                                                                              |
| **Shadow**     | `~` (`^`), violet                          | 58         | Your own footsteps 20 turns late. A floor flag (`;shadow 20`), not a placed enemy: about half the floors from 58 have one. It stands where you stood 20 turns ago (absent until you have taken 21 turns; a respawn clears it), waits when you wait, and is hidden out of sight. You walk through it harmlessly, even head-on in a dead end; it costs a life only if it arrives on a tile where you stood still that turn (about 20 turns of waiting in one place). A floor only gets one if the fewest-turns way past its timed enemies never waits where it arrives (`shadowCatches`).                                                                                                                                                                                  |
| **Ghost**      | `g` (`G`)                                  | 65         | Ignores the maze. Idle at home it feels you within a straight-line distance of 7 (through rock, no sight needed): "A chill runs down your spine", auto-repeat stops, even if it is unseen. Then it drifts one tile every second turn straight at you (the longer axis first, ties on x) through walls and Bloodstones, and gives up 12 turns after you leave its range: it drifts home the same way and idles. Its tile hurts, which may be rock, so you meet it only where you can stand; it shows only where its tile is lit. Home 12+ steps from the start and 8+ straight-line from every route tile, so a dash never wakes it. Max 1 per floor, 2 from floor 90. ASCII `g`.                                                                                         |
| **Breeder**    | mother `B` (`8`), young `b` (`o`)          | 72         | A motionless mother (hurts if touched, stays drawn once seen) who adds a static young one, a Bloodstone, every 12 turns, up to 5, on the nearest tile within 6 walking steps of her. A young one never goes on the shortest route, the start or the exit, within 3 steps of the start, near a life pickup (2 steps) or on an enemy or you, and never where it would cut you off from the exit from the tile you stand on (it can close a side branch behind you, never seal you in). They appear while you play (`enemySpawned`, and `enemySighted` if in view) and a respawn removes them all and restarts her clock. Her home is off the route, 12+ steps from the start, with room for her young. Max 1 per floor, 2 from floor 90. ASCII `b` (young ones have none). |

- `enemyAlerted` (a chaser starts hunting while you can see it) and `enemySighted` events stop key/D-pad/swipe auto-repeat so you cannot run into something you just saw
  (once for a Bloodstone, every time a moving enemy returns into view).
- All 17 planned types are built (docs/ENEMY_ROSTER_PLAN.md). Floor rules on top of the types: a **threat budget**, a
  **spotlight** (a new type is drawn 4x as often for 3 floors), **at most 3 different hunter types** per floor
  (`EnemyDef.hunter`: Wanderer, Sleeper, Chaser, Ghost, Shade; `MAX_HUNTER_TYPES` in `gen/difficulty.ts`) and the
  **safe-walk rule** (`gen/safe-walk.ts`): the generator plays a player who walks the proved way and ignores everything
  else on the real game core, and drops any hunter that catches it, so hunters only punish detours, exploring and waiting.
- **Fairness script** (`gen/fairness.ts`, `npm run fairness`): three scripted players on the real core. _Dasher_: the
  shortest way, never waits (timed enemies may hit it by design). _Planner_: the generator's proved walk past the timed
  enemies; must lose 0 lives. _Explorer_: a cautious fog-of-war explorer (steps round visible enemies, waits for gates and
  lanes, carries on after a respawn); target at most 0.6 lives lost per floor. A hit by a type that promised a free way is
  marked `(!)`. Last measured (100 seeds per floor): planner 0% everywhere, explorer 0.0-0.5 lives per floor.
- **Bestiary** (title screen): the enemy types the player has met, each with what it does and how to recognise it, English
  and Italian. A type is added when first seen, warned by or touched by (a disguised Mimic and a hidden Lurker only when
  they show themselves). Saved in `records.seenTypes` (additive, no save version bump). `core/bestiary.ts`, `ui/BestiaryScreen.ts`.

### Life pickups (`core/pickups.ts`, `gen/pickups.ts`, plan section 16)

- Placed after the enemies on its own rng stream (`runSeed:floor:pickups`): off the shortest route, at least
  8 steps from it (relaxed to 6/4/2 on small floors), in a dead end when possible, never on an enemy tile,
  reachable with Bloodstones and patrollers blocked. `hasLifePickup(floor)` in `gen/difficulty.ts` is the cadence.
- `FloorMap.pickups` (ASCII `+`) is the spec; `GameState.pickups` is what is still lying there. Stepping on it
  (before the enemy turn) fires `lifeGained`, or `lifeFull` at max lives; `pickupSighted` stops auto-repeat.
- **Anti-farming:** `run.lifePickups` (floors already taken) is saved, passed to `createGameState` as
  `lifePickups`, and autosaved the moment a life is gained. Restart floor, Continue and dying never bring it back.
- Theme keys `pickup` / `pickupRemembered` (blue in the colorblind theme).

### UI and input

- **Screens:** Title (Continue, New Run, Bestiary, Settings, deepest floor), Licenses (Settings; pages through
  `public/licenses/THIRD_PARTY_LICENSES.txt`), Game, FloorTransition, Pause (Resume,
  Restart floor, Settings, Quit; Restart never refills lives), Settings, Controls (key rebinding),
  Game Over, Victory. Menus work with keys and taps.
- **HUD:** hearts row (`<3` full, `</3` lost) above the stats row `FLOOR n/100  STEPS  TIME` with tappable
  `[Z]` zoom and `[II]` pause; red flash and a one-line message when a life is lost.
- **Controls:** WASD / arrows; `Space` or `.` waits (rebindable); `Z` zoom, `Esc`/`P` pause; on touch an
  on-screen D-pad (centre button = wait; sizes S/M/L) and swipe on the map. Key repeat is the app's own
  (180 ms then 90 ms, three speed presets); OS key repeat is ignored.
- **Camera:** follow-camera with zoom toggle on small screens, fit-whole-map otherwise; portrait mobile layout
  with the D-pad below the map, safe-area insets.
- **Rendering:** DPR-aware canvas, square whole-pixel cells, bundled JetBrains Mono, per-cell glyphs.
- **Themes:** default, high-contrast, colorblind-safe (alternative enemy glyphs `%` `$`). Add colours in
  `render/themes.ts` (every theme needs every key).
- **i18n:** English and Italian (`i18n/en.ts` defines keys, `it.ts` must match; `{param}` placeholders).
  The language setting is Auto/EN/IT.

### Persistence

- `SaveStore` / `SettingsStore` (`save/stores.ts`): async `KeyValueStorage` (localStorage, in-memory fallback,
  Capacitor Preferences on Android), serialized write queue, failures swallowed.
- **Save v2:** `run { seed, floor, totalSteps, totalTimeMs, lives, deaths, lifePickups }` + `records.deepestFloor`.
  Autosave at the start of each floor **and immediately after every life lost** (no quit-to-undo trick).
  Game Over and Victory delete the run and keep the record. v1 saves migrate to full lives.
- **Settings v1:** language, theme, D-pad size/visibility, move bindings, `waitKeys`, key-repeat timing.
  Missing or corrupt fields are repaired field by field (`save/settings.ts`).
- Migrations use `save/migrate.ts` (`{ [fromVersion]: (old) => new }`); too-new data falls back to defaults.

### Android (Capacitor 8)

Debug APK builds via `npm run build:android` (auto-detects JDK and SDK). Portrait, immersive (SystemBars),
back button = Esc, auto-pause on background, adaptive icon/splash from `assets/*.svg`, app id
`com.asciidungeon.game`. **Smoke-tested on a real phone** (Android 15, via adb taps on the D-pad, floors 1-10 of a real run): launch, D-pad, centre wait, swipe, floor clear, Bloodstone and patroller hits with respawn, Game Over, life
pickup ("Lives are full" at 3/3, "+1 life" after a loss, `lifePickups` autosaved), back button = pause, background =
auto-pause, Continue after force-stop. Not yet seen on a device: spear (floor 20+), Victory, release build. The
keyboard menu hint is hidden on touch screens (`ScreenContext.isTouch`). Release signing needs a
keystore (docs/ANDROID.md).

### Dev tools

- Debug overlay (dev builds only): `F3` toggle, then `[` `]` change floor, `N` new seed, `V` reveal map,
  `L` lose a life, `H` heal, `E` re-roll enemies (terrain unchanged), `T` cycle an enemy type, `G` spawn it next to you, `R` re-seed the behaviour stream. Shows the shortest path, generator
  params and enemy counts. Caveat: `P` (path toggle) is shadowed by the pause key.
- `npm run gen`, `npm run solve`, `?seed=&floor=` URL.

## How to extend

**New enemy type** (read plan §15 and docs/ENEMY_ROSTER_PLAN.md first and agree numbers with the user). Types are
data plus three registries, so a new one touches few places and never needs a `switch` on the type:

1. `core/enemy-defs.ts`: the id and an `ENEMY_DEFS` entry. Look, `mapChar` / `endChar` / `altGlyph`, `behavior`,
   `minFloor`, `weight`, `remembered`, and the rules fields: `contact` (`life` / `blind` / `shove`, resolved in
   `core/contact.ts`), `cost` (threat budget), `placement` (which placer), `guarantee` (what the generator
   promises about the route: `footprint` never touches it, `timing` is proven, `reachable`, ...), `maxPerFloor`,
   `homeDistance` if it needs more than the common 6 steps from the start, `hazard(spawn, map)` if it is timed, `reach(spawn, map)` if it can hurt tiles beyond its segment (`spawnReach`), and
   `body` if its home tile is a permanent solid (`fixedTiles` tells reachability checks about it). `noStop(spawn, map)` lists tiles where standing still is dangerous (a Lurker's neighbours): the route proof never waits there. `Behavior.hidden` makes an enemy invisible and unreported.
2. `core/behaviors.ts`: a `Behavior` in `BEHAVIORS` with `init` (build `memory` from the spawn), `act`, `reset(enemy,
state)` (the player respawned: back to the starting state), `glyph`, `solidGlyph`, `tone`, `warnGlyph` as needed. Moving
   enemies update `enemy.pos` and `enemy.cells`; `enemy.solid` is a body that blocks and hurts but is not part of the
   timed hazard; `enemy.warn` is a telegraph (drawn, never hurts). Use `stepToward` / `blockersFor`
   (`core/pathing.ts`) to hunt, and `state.enemyRng` for randomness (re-seeded per attempt). `spawnEnemy` adds enemies
   at runtime.
3. `gen/placers/`: reuse a placer (`point`, `segment`, `reach`) or add one (`place` builds the spawn on a tile or says
   no, `validate` checks a finished floor) and register it in `PLACERS`. **Solvability is the hard rule**: keep
   footprints off the shortest route, or prove them: timed types give a `PeriodicHazard` (period in
   `HAZARD_PERIODS`) and `gen/hazard-timing.ts` proves the route can still be walked. Add the hazard to the oracle
   table in `core/foundations.test.ts` (the real cells must equal `hurtAt(phase)` for two cycles).
4. Drawing needs no per-type code: `glyphForCell` asks the behaviour; add theme colours (every theme) only if the
   look is new. New events and messages: `core/events.ts`, `GameScreen`, i18n keys in `en.ts` and `it.ts`.
5. Tests: core behaviour, ASCII round trip, generator placement, property test (floors list in
   `generate-floor.test.ts`), refresh enemy snapshots, bump `GENERATOR_VERSION`.
6. Update plan §15 with the decided values and the unlock floor. The threat budget and spotlight
   (`ROSTER_RULES_ACTIVE` in `gen/difficulty.ts`) have been on since the Wanderer.

**New player action** (`pickup`, `use`...): extend `core/actions.ts`, handle it in `applyAction` (it must go
through `finishTurn` if it takes time), bind a key (see how `waitKeys` flows through settings, keyboard,
Controls and `Screen.onWait`), and give touch an equivalent.

**New setting or save field:** add it with a sanitizer default in `save/settings.ts` / `save/save.ts`. Additive
optional fields need no version bump; shape changes need a version bump plus a migration and a migration test.

**New screen:** implement `Screen`, push/reset it from `App.ts`, add i18n keys to both `en.ts` and `it.ts`.
Text-only summary screens can extend `ui/SummaryScreen.ts`; list menus extend `ui/MenuScreen.ts`.

**New text:** add the key to `en.ts` first (the type of `it.ts` forces the translation).

## Testing notes

- The generator suite is the slow part; use `npx vitest run <path>` while iterating.
- Snapshot updates change committed files: read the diff. Terrain snapshots must not change when only enemy
  code changes (use `serializeMap(map, { enemies: false })`).
- UI tests use a stub renderer (see `ui/GameScreen.test.ts`) rather than a real canvas.
- When verifying in the browser pane, screenshots can lag a frame behind the canvas; prefer page text or a
  second screenshot before concluding something is broken. Emulate a phone with a 375x812 viewport and reset
  it afterwards.

## Status and next steps

**Version 1.0.0: feature complete.** Done: the core game, generation, rendering, fog of war, menus, saves, i18n, themes,
mobile layout, the Android app, lives, life pickups, and all 17 enemy types (milestones M0-M26 in the plans, including the
fairness script, the safe-walk rule, the hunter cap and the Bestiary).

Open work, roughly in priority order:

1. **Playtest on a phone, floors 12-100,** and tune from it (everything is in `gen/difficulty.ts` and the `EnemyDef`
   numbers; use `npm run fairness` to check a change). Device testing so far covers floors 1-10 only; everything later is
   covered by tests and simulation.
2. **M10 polish:** tap-to-walk with A*, glyph atlas for speed, gamepad, optional vibration.
3. **M6:** PWA plus Tauri desktop builds for Windows/Linux.
4. Release signing for Android: create a keystore (docs/ANDROID.md) and review the app id (`com.asciidungeon.game`) before
   publishing to a store.
5. Ideas: more collectables / inventory (the life pickup is the first one), a map editor (the ASCII format and
   `validate.ts` are meant to be reused for it).

Working agreement: discuss design before building new mechanics (the owner answers questions and accepts sensible
defaults), keep changes in small committed milestones, update the plan doc when a design is decided, and report honestly
what was and was not verified.

## Before publishing or releasing

- `git status` must be clean of secrets: keystores, `keystore.properties`, `local.properties`, `.env*` are gitignored
  (check with `git check-ignore -v <file>`). Nothing in the repo needs a key or a network service.
- Licence: the game is MIT (`LICENSE`); when a dependency or asset is added, update `THIRD_PARTY_NOTICES.md` and keep
  anything that needs its licence text shipped: add its text to `public/licenses/THIRD_PARTY_LICENSES.txt` (shown in the app
  under Settings, then Licenses; the font's own file is also in `public/licenses/`). Only permissive licences.
- Bump the version as described under Commands, then run the full check and rebuild the APK.
- **Web:** `.github/workflows/pages.yml` builds `dist/` and deploys it to GitHub Pages on every push to `main`
  (Settings > Pages > Source: GitHub Actions). The build uses relative paths, so it works under a sub-path.
- **Android release:** `npm run release:android` signs with `android/keystore.properties` (gitignored), which points to a
  keystore kept outside the repo. Back the keystore up: without it updates cannot install over existing installs. Then tag
  (`git tag -a vX.Y.Z -m ...`), push the tag, and attach the APK to a GitHub release (the Actions workflow does not build the APK).
