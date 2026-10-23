# Ascii Dungeon — Implementation Plan

A tile-based ASCII maze crawler. The player (`@`) descends a series of 100 procedurally
generated floors, each harder than the last, by reaching the exit (`!`). The player has three
lives; enemies (first a stationary block, later patrollers, chasers, spears...) cost a life on contact.

Targets: **Windows, Linux, Android (APK), Web**. Stack: **TypeScript + HTML Canvas**, no game engine.

---

## 1. Locked decisions

| # | Topic | Decision |
|---|---|---|
| 1 | Time model | Turn-based. One tile per action; held keys/buttons auto-repeat. |
| 2 | Visibility | Fog of war: tiles seen once stay remembered (dimmed). Sight radius shrinks with depth. |
| 3 | Screen fit | Desktop: whole map fits the screen. Phone: camera follows the player; a zoom toggle shows the whole map. |
| 4 | Cells | Square cells, glyph centered inside. |
| 5 | Floor style | Mixed by depth: rooms + corridors early, then mazes that get more twisty. |
| 6 | Difficulty levers | Map size, dead ends, loops, path length to exit, sight radius. |
| 7 | Map size | Grows with depth (odd sizes), capped at **61×61**. |
| 8 | Start/exit | Exit placed by BFS distance from start (farthest or high percentile). |
| 9 | Length | **100 floors.** Difficulty ramps evenly across all of them; clearing floor 100 shows a Victory screen and ends the run (the save is removed, "deepest floor reached" is kept). |
| 10 | Fail state | **3 lives per run**, carried across floors. Losing one respawns the player on the floor's start tile; at 0 the run ends (Game Over). Steps, time and deaths are tracked. |
| 11 | Seeds | Every run has a seed; each floor derives deterministically from it. |
| 12 | Saves | Autosave at the start of each floor. No going back up. |
| 13 | Movement | 4 directions. WASD + arrow keys. Gamepad later. |
| 14 | Touch | Virtual D-pad + swipe. Tap-to-walk later. |
| 15 | Orientation | Android: portrait. |
| 16 | Glyphs | Strict ASCII, colored. |
| 17 | Font | Bundled monospace font (identical on every platform). |
| 18 | Screens | Title, Game, Floor transition, Pause, Settings, Game Over. |
| 19 | Audio / i18n | No audio. English + Italian. |
| 20 | Android distribution | APK only (signed release APK, sideload). |
| 21 | Web | Yes — first-class target, also the dev environment. |
| 22 | Tooling | Code only, no editor. |
| 23 | Future | No multiplayer, no modding. Possible map editor later → maps must be serializable. |
| 24 | VCS | Git only, no CI. Builds run locally via npm scripts. |
| 25 | Lives HUD | A separate top row with `<3 <3 <3` in red; a lost life is a dim `</3`. |
| 26 | Life loss | Respawn on the start tile. **Resets:** position, floor step counter. **Keeps:** explored map (fog memory), floor timer, run totals, enemies. The new life count is **saved immediately** (no quit-and-Continue trick). Pause → Restart floor stays free but never refills lives. |
| 27 | Hit feedback | Short red flash + one-line message ("Ouch! 2 lives left"), instant respawn, held keys are released. Moving enemies cannot hit the player on the first turn after a respawn (one-turn grace). |
| 28 | Game Over | At 0 lives: a Game Over screen (floor reached, steps, time, deaths) → Title. The saved run is deleted; the deepest-floor record is kept. |
| 29 | Enemies | **Entities, never map tiles**: the map stays walls + floor, enemies stand on floor tiles inside the maze. Every enemy takes a turn after each player action (turn-based, like everything else). Enemy types are data (`ENEMY_DEFS`). |
| 30 | First enemy: Bloodstone | A stationary `#` in dark red. Moving into it costs a life. It blocks movement like a wall, does **not** block line of sight, and stays drawn (dimmed) once seen. |
| 31 | Enemy placement | Never on the start or exit, never within 6 tiles of the start, **never on the shortest start→exit route**, so an enemy-free route always exists. Deterministic from the run seed. None on floor 1; from floor 2 on `1 + floor((floor − 2) / 2)` enemies, capped at 12. |
| 32 | Future enemies | Patroller, Chaser, Sleeper and the **Spear** (§15). |

### Tile glyphs

| Tile | Glyph | Color (default theme) |
|---|---|---|
| Wall | `#` | grey `#8a8f98` (remembered: `#3c4048`) |
| Floor | `.` | dark grey `#3a3f47` (remembered: `#22252b`) |
| Player | `@` | yellow `#ffd34d` |
| Exit | `!` | green `#5dff8a` (remembered: `#2b7a44`) |
| Bloodstone (enemy) | `#` | dark red `#a32020` (remembered: `#4d1414`) |
| Heart (life) | `<3` / `</3` | red `#e03c3c` / dim grey |
| Unknown | ` ` | — (background `#0d0f12`) |

> The Bloodstone is intentionally the same glyph as a wall, differing only in colour. The
> colorblind-safe theme draws it as `%` so colour is never the only cue.

> Floors are drawn as a dim `.` rather than a space so that explored areas are visibly
> different from unexplored ones under fog of war.

---

## 2. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (`strict`) | Type safety; JS ecosystem. |
| Bundler / dev server | Vite | Fast HMR, trivial static output reused by every shell. |
| Rendering | Canvas 2D, custom glyph renderer | An ASCII grid needs nothing more. |
| UI framework | None (vanilla TS) | Menus are drawn as ASCII on the canvas; only the D-pad is DOM. |
| Tests | Vitest | Same config as Vite; fast. |
| Lint / format | ESLint (flat config, typescript-eslint) + Prettier | |
| Web packaging | `vite-plugin-pwa` | Installable, works offline. |
| Desktop shell | **Tauri 2** | Small binaries (~5–10 MB), uses system WebView (WebView2 / WebKitGTK). |
| Android shell | **Capacitor** | Mature Android WebView wrapper; plugins for back button, storage, status bar. |
| Font | JetBrains Mono (OFL) — swappable | Clear `#`/`@`/`!` glyphs; open license. |

Library versions: pinned to the latest stable release at scaffold time (lockfile committed). **TypeScript is held at 6.0.x** because typescript-eslint does not yet support TypeScript 7; revisit when it does.

---

## 3. Architecture

### 3.1 Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│ platform/  web | tauri | capacitor (storage, lifecycle, back btn)   │
├─────────────────────────────────────────────────────────────────────┤
│ app/       main loop, screen stack, resize, dirty-flag rendering    │
│ ui/        screens (Title, Game, Transition, Pause, Settings)       │
│ input/     keyboard, D-pad, swipe → Action                          │
│ render/    glyph renderer, camera, layout, themes                   │
├─────────────────────────────────────────────────────────────────────┤
│ core/      pure game logic: map, entities, turns, FOV, pathfinding  │
│ gen/       pure floor generation + difficulty curve                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Rules**
- `core/` and `gen/` are **pure**: no DOM, no `Math.random`, no `Date.now`. They are type-checked
  with a separate `tsconfig.core.json` whose `lib` excludes `DOM`, and an ESLint rule bans
  `Math.random` there. This keeps them deterministic, unit-testable, and reusable by a future map editor.
- All randomness flows through an injected `Rng`.
- Rendering is **on demand**: a frame is drawn only when state changes (turn, resize, screen change).
  Saves battery on Android.

### 3.2 Directory layout

```
ascii-dungeon/
├─ index.html
├─ package.json
├─ tsconfig.json              # app (DOM)
├─ tsconfig.core.json         # core + gen (no DOM)
├─ vite.config.ts
├─ eslint.config.js
├─ .prettierrc
├─ .gitignore
├─ capacitor.config.ts
├─ public/
│  ├─ fonts/JetBrainsMono-Regular.woff2
│  ├─ icons/                  # app icons (PWA, Tauri, Android generated from one source)
│  └─ manifest.webmanifest    # generated by vite-plugin-pwa
├─ scripts/
│  ├─ gen-map.ts              # CLI: print a generated floor as ASCII in the terminal
│  └─ sync-version.ts         # copy package.json version into Tauri + Android
├─ src/
│  ├─ main.ts                 # bootstrap: detect platform, load font, start App
│  ├─ app/
│  │  ├─ App.ts               # rAF loop, screen stack, resize observer, dirty flag
│  │  └─ Screen.ts            # Screen interface
│  ├─ core/
│  │  ├─ rng.ts               # seeded PRNG (sfc32) + string→seed hash (cyrb128)
│  │  ├─ geometry.ts          # Point, Dir, DIRS4, add, inBounds
│  │  ├─ grid.ts              # Grid<T> backed by typed arrays
│  │  ├─ tiles.ts             # TileType enum + TileDef table
│  │  ├─ floor-map.ts         # FloorMap + ASCII parse/serialize
│  │  ├─ entity.ts            # Entity, Player, Enemy (future: Item)
│  │  ├─ enemy-defs.ts        # ENEMY_DEFS: glyph, colour, behaviour, spawn rules (data)
│  │  ├─ behaviors.ts         # per-turn enemy behaviours (Bloodstone: none; later patrol, chase, spear...)
│  │  ├─ lives.ts             # loseLife / respawn / game-over rules
│  │  ├─ actions.ts           # Action union
│  │  ├─ events.ts            # GameEvent union
│  │  ├─ game-state.ts        # GameState (run, floor, player, stats)
│  │  ├─ turn.ts              # applyAction(state, action) → GameEvent[]
│  │  ├─ fov.ts               # symmetric shadowcasting
│  │  └─ pathfinding.ts       # BFS distance map, A*
│  ├─ gen/
│  │  ├─ types.ts             # GeneratorParams, FloorGenerator
│  │  ├─ growing-tree.ts      # perfect maze, newest/random bias
│  │  ├─ rooms-and-mazes.ts   # rooms + maze fill + connectors + dead-end pruning
│  │  ├─ braid.ts             # remove dead ends → add loops
│  │  ├─ placement.ts         # start/exit selection via BFS
│  │  ├─ enemies.ts           # enemy placement (never on the safe route), seeded
│  │  ├─ validate.ts          # invariants check
│  │  ├─ difficulty.ts        # floor number → params
│  │  └─ generate-floor.ts    # orchestration, retries, fallback
│  ├─ render/
│  │  ├─ font.ts              # FontFace loading + metrics
│  │  ├─ glyph-renderer.ts    # DPR-aware canvas, cell grid, drawGlyph/drawText
│  │  ├─ camera.ts            # viewport selection, follow + clamp, zoom toggle
│  │  ├─ layout.ts            # HUD / map / controls regions, safe-area insets
│  │  ├─ themes.ts            # default, high-contrast, colorblind-safe
│  │  └─ draw-floor.ts        # tiles + fog + entities + hurt flash + HUD (lives row, stats row)
│  ├─ input/
│  │  ├─ input-manager.ts     # merges sources, repeat timing, 1-action buffer
│  │  ├─ bindings.ts          # default bindings, rebinding
│  │  ├─ keyboard.ts          # KeyboardEvent.code based
│  │  ├─ dpad.ts              # DOM overlay buttons with hold-repeat
│  │  └─ swipe.ts             # pointer gestures on the canvas
│  ├─ ui/
│  │  ├─ text-ui.ts           # ASCII menu helper with hit rects for touch
│  │  ├─ TitleScreen.ts
│  │  ├─ GameScreen.ts
│  │  ├─ FloorTransitionScreen.ts
│  │  ├─ GameOverScreen.ts
│  │  ├─ PauseScreen.ts
│  │  └─ SettingsScreen.ts
│  ├─ i18n/
│  │  ├─ en.ts                # source of truth for keys
│  │  ├─ it.ts                # typed against en
│  │  └─ i18n.ts              # t(key, params), language detection
│  ├─ save/
│  │  ├─ save.ts              # SaveData schema, load/save, migrations
│  │  └─ settings.ts          # Settings schema + defaults
│  ├─ platform/
│  │  ├─ platform.ts          # detect web / tauri / capacitor
│  │  ├─ storage.ts           # KeyValueStorage interface + impls
│  │  └─ lifecycle.ts         # pause/resume, Android back button, fullscreen
│  └─ debug/
│     └─ debug-overlay.ts     # dev-only: reveal map, show path, jump to floor
├─ src-tauri/                 # generated by `tauri init`
├─ android/                   # generated by `cap add android`
└─ docs/
   └─ IMPLEMENTATION_PLAN.md
```

Tests are colocated as `*.test.ts`.

### 3.3 Core data model

```ts
// core/geometry.ts
export interface Point { x: number; y: number }
export type Dir = 'N' | 'S' | 'E' | 'W';
export const DIR_VEC: Record<Dir, Point> = { N:{x:0,y:-1}, S:{x:0,y:1}, E:{x:1,y:0}, W:{x:-1,y:0} };

// core/tiles.ts
export const enum TileType { Wall = 0, Floor = 1, Exit = 2 }
export interface TileDef { glyph: string; walkable: boolean; opaque: boolean }

// core/floor-map.ts
export interface FloorMap {
  width: number;            // odd
  height: number;           // odd
  tiles: Uint8Array;        // TileType per cell, row-major
  explored: Uint8Array;     // 1 = seen at least once
  start: Point;
  exit: Point;
  optimalPathLength: number;
  spawns: EnemySpawn[];     // initial enemy placement: level data, not tiles
  seed: number;
  floorNumber: number;
}
export interface EnemySpawn { type: EnemyTypeId; pos: Point }
// '#', '.', '@'(start), '!'(exit), 'x'(enemy spawn; one character per enemy type, from ENEMY_DEFS)
export function parseMap(lines: string[]): FloorMap;
export function serializeMap(map: FloorMap): string[];    // same format → tests, CLI, future editor

// core/entity.ts
export interface Entity {
  id: number;
  kind: 'player' | 'enemy'; // future: 'item'
  pos: Point;
  glyph: string;
  blocksMovement: boolean;
}
export interface Enemy extends Entity {
  kind: 'enemy';
  type: EnemyTypeId;        // key into ENEMY_DEFS
  cells: Point[];           // every tile that hurts right now: 1 cell for a Bloodstone, several for a spear
  memory: Record<string, number>; // behaviour state (patrol index, phase...); starts empty
  seen: boolean;            // has the player seen it yet? drives the one-time `enemySighted`
}

// core/enemy-defs.ts: enemy types are data, so adding one is mostly a new entry
export type EnemyTypeId = 'bloodstone'; // later: 'patroller' | 'chaser' | 'sleeper' | 'spear'
export interface EnemyDef {
  glyph: string;
  mapChar: string;          // character used in ASCII maps ('x' for the Bloodstone)
  behavior: BehaviorId;     // 'none' for the Bloodstone
  minFloor: number;         // first floor it can appear on
  weight: number;           // relative spawn frequency among the types allowed on a floor
  damage: number;           // lives lost on contact (1)
  remembered: boolean;      // stays drawn (dimmed) once seen; moving enemies hide when out of sight
}

// core/behaviors.ts: run once per enemy after every player action
export interface Behavior { act(enemy: Enemy, state: GameState, rng: Rng): GameEvent[] }

// core/actions.ts
export type Action =
  | { type: 'move'; dir: Dir }
  | { type: 'wait' };       // future: 'pickup', 'use', 'attack'...

// core/events.ts
export type GameEvent =
  | { type: 'moved'; from: Point; to: Point }
  | { type: 'bumped'; at: Point }
  | { type: 'reachedExit' }
  | { type: 'hitEnemy'; enemyId: number; at: Point }   // the player touched an enemy (or it touched the player)
  | { type: 'lifeLost'; livesLeft: number }            // UI: flash, message, autosave, release held keys
  | { type: 'gameOver' }                               // livesLeft reached 0
  | { type: 'enemySighted'; enemyId: number };         // newly in view: UI cancels auto-repeat

// core/game-state.ts
export interface GameState {
  runSeed: string;
  floor: FloorMap;
  player: Entity;
  entities: Entity[];       // everything except the player: enemies (kind 'enemy'), items later
  visible: Uint8Array;      // current FOV
  sightRadius: number;
  lives: number;            // 3 at the start of a run, carried across floors
  maxLives: number;         // 3 (a field, so extra-life pickups can raise it later)
  graceTurns: number;       // > 0 right after a respawn: moving enemies cannot hit yet
  enemyRng: Rng;            // random stream for enemy behaviours, seeded from run seed + floor
  stats: {
    floorSteps: number; floorTimeMs: number;
    totalSteps: number; totalTimeMs: number;
    deaths: number;         // lives lost in this run
  };
  turn: number;
}
```

The map is stored as ASCII text (`string[]`) when serialized. Tests, the debug CLI, and a future
map editor all use the same format.

---

## 4. Floor generation

### 4.1 Seeds

- **Run seed**: a random 8-character human-readable string (Crockford base32) created when a new
  run starts (`crypto.getRandomValues`, outside `core/`). Shown on the Pause screen.
- **Floor seed**: `hash(runSeed + ":" + floorNumber)` → 128-bit state for an `sfc32` PRNG.
- The same run seed + floor number always produce the same floor on every platform.
- A `GENERATOR_VERSION` constant is bumped whenever generator output changes. It is stored in
  saves (see §8).

### 4.2 Grid convention

All generators use odd dimensions. "Cells" sit at odd coordinates `(2i+1, 2j+1)`. The cells
between them are wall slots that can be carved. The outer border is always wall.

### 4.3 Algorithms

**Growing Tree (floors 11+)**: perfect maze, every cell reachable, exactly one path between any two cells.
```
active = [randomCell]; carve(randomCell)
while active not empty:
  idx = rng() < newestBias ? active.length - 1 : rng.int(active.length)
  c = active[idx]
  n = random unvisited neighbor of c at distance 2
  if n: carve(wall between c and n); carve(n); active.push(n)
  else: active.splice(idx, 1)
```
- `newestBias = 1.0` → recursive backtracker: long winding corridors, long dead ends (hard).
- `newestBias = 0.0` → Prim-like: many short dead ends, short paths (easy).
- Values in between give a smooth difficulty knob from one algorithm.

**Rooms and Mazes (floors 1–10)**: based on Bob Nystrom's "Rooms and Mazes".
1. Try to place `roomAttempts` random rooms (odd position and size) that don't overlap.
2. Fill the remaining space with Growing Tree mazes. Each one is its own region.
3. Find connectors (walls touching two different regions). Use union-find to merge all regions
   into one spanning set. Then open extra doors between regions that are already joined, with probability `extraConnectorChance` (adds loops; only between different regions, never inside a maze).
4. Prune dead ends by `deadEndPruning` (0..1 of all dead-end corridors removed).

**Braid (post-process)**: for each dead end, with probability `braidFactor`, remove one adjacent
wall that opens into another corridor. This creates loops (several routes to the exit) and can
never disconnect the map.

**Optional later**: cellular-automata caves as a variety generator on some floors.

### 4.4 Start and exit placement

1. BFS from a random floor cell → farthest cell `A` (one end of the map's longest path).
2. `start = A`. BFS from `A` gives a distance for every floor cell.
3. Sort reachable cells by distance and pick the exit at percentile `exitPercentile`.
   (1.0 = farthest possible cell.)
4. `optimalPathLength = dist[exit]` (shown after the floor as a score reference).

### 4.5 Validation (always run)

- Dimensions are odd and the border is all wall.
- `start` and `exit` are walkable and different.
- `exit` is reachable from `start` (BFS distance is finite).
- Every floor cell is reachable from `start` (no isolated pockets).
- `optimalPathLength ≥ minPathLength(size)`.

If validation fails, regenerate using the **same RNG stream** (so it stays deterministic), up to 10
attempts. After that, fall back to a pure Growing Tree with `newestBias = 1` (a perfect maze, which
always passes).

### 4.6 Difficulty curve

`FINAL_FLOOR = 100`. `t = clamp((floor − 1) / 99, 0, 1)`, so every lever moves a little on every
floor and reaches its extreme on floor 100. Floors past 100 do not exist, but `paramsForFloor` clamps
to the final floor's values.

| Param | Formula |
|---|---|
| `size` | odd: `21 + 2·round(20·clamp((floor − 1) / 59))` (21 on floor 1, 61 from floor 59 on) |
| `generator` | floors 1–10: Rooms and Mazes; 11+: Growing Tree |
| `newestBias` | `lerp(0.25, 1.0, t)` |
| `braidFactor` | `lerp(0.5, 0.0, t)` |
| `sightRadius` | `round(lerp(10, 4, t))` |
| `exitPercentile` | `lerp(0.75, 1.0, t)` |
| `enemyCount` | floor 1: 0; otherwise `round(lerp(1, 24, (floor − 2) / 98))` (1 on floor 2, 3 on floor 10, 12 on floor 50, 24 on floor 100) |
| `enemyTypes` | the enemy types whose `minFloor ≤ floor`: Bloodstone 2, Patroller 8, Spear 20, Chaser 35 (Sleeper later) |
| Rooms (floors 1–10) | `roomAttempts = size·2`, `extraConnectorChance 0.08→0.04`, `deadEndPruning 1.0→0.6` across floors 1–10 |
| Quality gate | `minPathLength = floor(0.9·size)`; failed floors are regenerated (10 tries) then fall back to a perfect maze |

Resulting values (starting points, to be tuned with `npm run gen -- --table` and the debug overlay):

| Floor | Size | Generator | Bias | Braid | Sight | Exit pct | Enemies |
|---|---|---|---|---|---|---|---|
| 1 | 21 | Rooms | – | 0.50 | 10 | 0.75 | 0 |
| 5 | 23 | Rooms | – | 0.48 | 10 | 0.76 | 2 |
| 10 | 27 | Rooms | – | 0.45 | 9 | 0.77 | 3 |
| 11 | 27 | Growing Tree | 0.33 | 0.45 | 9 | 0.78 | 3 |
| 20 | 33 | Growing Tree | 0.39 | 0.40 | 9 | 0.80 | 5 |
| 30 | 41 | Growing Tree | 0.47 | 0.35 | 8 | 0.82 | 8 |
| 40 | 47 | Growing Tree | 0.55 | 0.30 | 8 | 0.85 | 10 |
| 50 | 55 | Growing Tree | 0.62 | 0.25 | 7 | 0.87 | 12 |
| 60 | 61 | Growing Tree | 0.70 | 0.20 | 6 | 0.90 | 15 |
| 70 | 61 | Growing Tree | 0.77 | 0.15 | 6 | 0.92 | 17 |
| 80 | 61 | Growing Tree | 0.85 | 0.10 | 5 | 0.95 | 19 |
| 90 | 61 | Growing Tree | 0.92 | 0.05 | 5 | 0.97 | 22 |
| 100 | 61 | Growing Tree | 1.00 | 0.00 | 4 | 1.00 | 24 |

**The ending.** Reaching the exit of floor 100 skips the transition screen and shows the Victory
screen (floors cleared, steps, time, lives lost, lives left). Like Game Over it deletes the saved run
(no Continue) and keeps the deepest-floor record; any key or tap returns to the title. The HUD shows
`FLOOR n/100`.

### 4.7 Enemy placement

Enemies are placed **after** the terrain is final and validated, using their **own RNG stream**
(`createRng(runSeed + ":" + floor + ":enemies")`). Terrain generation is therefore untouched:
the existing terrain snapshots keep passing and only the new enemy snapshots are added.

```
placeEnemies(map, enemyCount, allowedTypes, rng):
  route   = cells of one shortest path start → exit          # the guaranteed safe route
  dist    = BFS distances from start
  candidates = walkable cells where
      cell ∉ {start, exit}  and  cell ∉ route  and  dist[cell] ≥ 6
  repeat enemyCount times (while candidates remain):
      cell = random candidate; type = weighted pick among allowedTypes
      add EnemySpawn { type, pos: cell }; remove the cell from candidates
```

- **Why this is always solvable:** the shortest path itself contains no enemy, so a route from
  start to exit never needs to touch one. On perfect-maze floors (4+) there is only one route, so
  enemies end up in side branches and dead ends, which punishes careless exploring. On the room
  floors they also appear in rooms beside the route.
- If fewer candidates exist than `enemyCount`, fewer enemies are placed (never an error).
- Moving enemy types (later) get extra rules, see §15.

**Validation additions** (`validate.ts`, checked on every generated floor):
- every spawn is on a walkable tile, not on start/exit, at least 6 tiles from the start, on distinct tiles;
- the exit is still reachable from the start with all enemy cells treated as walls.

`GENERATOR_VERSION` is bumped whenever enemy placement output changes too (it is already stored in saves).

---

## 5. Field of view

- **Symmetric shadowcasting** (Albert Ford's algorithm): if A can see B then B can see A, and
  there are no gaps in corridors.
- A cell is in the radius when `dx² + dy² ≤ (r + 0.5)²` (a round circle).
- Walls are lit when hit. Floor/exit cells are lit when visible.
- After each turn: recompute `visible`, then OR it into `explored`.
- Draw states: **visible** = full color, **explored but not visible** = remembered (dim) color,
  **unknown** = blank.
- Debug overlay can reveal the whole map.
- **Enemies do not block line of sight** (they are entities, not walls). An enemy is drawn when its
  tile is visible; a `remembered` type (the Bloodstone) also stays drawn, dimmed, once its tile has
  been explored. Moving types disappear when out of sight.
- When an enemy's tile becomes visible for the first time, the turn emits `enemySighted` (see §7.3).

---

## 6. Rendering

### 6.1 Glyph renderer
- One `<canvas>` filling the viewport (`100dvw × 100dvh`, `touch-action: none`).
- DPR-aware: backing store = CSS size × `devicePixelRatio`, context scaled once.
- `cellSize = floor(min(mapAreaW / cols, mapAreaH / rows))` in device pixels. Whole pixels keep glyphs sharp.
- Font size ≈ `cellSize × 0.9`. `textAlign = 'center'`, `textBaseline = 'middle'`. The glyph is drawn
  at the cell's center, so cells are square whatever the font's proportions.
- Draw order per frame: background → tiles (with fog) → entities (enemies, then the player on top) → hurt flash → HUD.
- Performance: ≤ 3,721 cells, drawn only when dirty. If profiling on low-end Android shows a need,
  add a glyph atlas (pre-rendered offscreen canvas per glyph+color → `drawImage`).
- The font is loaded with the `FontFace` API and `document.fonts.load()` is awaited before the first
  frame, so there's no flash of a fallback font.

### 6.2 Layout
- **Desktop/landscape**: HUD row on top, map centered in the rest, letterboxed.
- **Portrait phone**: HUD row on top, square map area, D-pad area below (≈ 35% of the height).
- **Landscape with D-pad shown**: the D-pad takes a column on the right (up to 30% of the width).
- Respects `env(safe-area-inset-*)` for notches and gesture bars.
- Recomputed on `resize` / `orientationchange` (ResizeObserver).

### 6.3 Camera
- If the whole map fits with `cellSize ≥ MIN_CELL_CSS_PX` (18 CSS px on touch devices, 10 on
  desktop), show the whole map.
- Otherwise the viewport is `floor(area / MIN_CELL)` tiles, forced odd so the player is centered.
  It follows the player and is clamped to the map edges.
- **Zoom toggle** (`Z` key / HUD button): switch between follow camera and fit-whole-map.

### 6.4 HUD
Two text rows in the same font. The **lives row** is on top:

`<3 <3 </3`   (red hearts; each lost life is a dim `</3`)

and below it the **stats row**:

`FLOOR 7   STEPS 123   01:24                                [Z] [II]`

The `[Z]` (zoom) and `[II]` (pause) labels are tappable on touch devices. The hearts get their own
row because on a 375 px wide phone the stats, hearts and buttons do not fit on one line.
`computeLayout` returns a `lives` rect above the `hud` rect; both sit inside the safe area.

**Hit feedback:** when `lifeLost` arrives the screen flashes red for about 250 ms (a translucent
overlay fading out, redrawn on a short timer) and a one-line message ("Ouch! 2 lives left" /
"Last life!") shows under the HUD for about 1.5 s. The respawn itself is instant.

### 6.5 Themes
`default`, `high-contrast`, and `colorblind-safe` (avoids relying on red/green: exit uses a bright
cyan plus a distinct glyph). Colors are defined in one theme table.

Each theme gets `enemy` / `enemyRemembered` / `heart` colours and an optional `enemyGlyph`
override. Default: dark red `#a32020` / `#4d1414`. High contrast: bright red `#ff2a2a`. Colorblind
theme: orange-red plus `enemyGlyph: '%'`, so enemies stay distinguishable from walls without colour.

---

## 7. Input

### 7.1 Actions
Gameplay: `move N/S/E/W`, `wait` (later). UI: `up/down/left/right`, `confirm`, `back`, `pause`, `zoom`.

### 7.2 Default bindings

| Action | Keys |
|---|---|
| Move N/W/S/E | `W A S D` · arrow keys |
| Confirm | `Enter` · `Space` |
| Back / Pause | `Esc` · `P` · Android back button |
| Wait a turn | `Space` / `.` (rebindable in Controls; D-pad centre on touch) |
| Zoom toggle | `Z` |
| Debug overlay (dev builds) | `F3` |

- Keys are matched with `KeyboardEvent.code` (physical position), so WASD works on any keyboard layout.
- Bindings can be changed in Settings and are stored in settings.

### 7.3 Repeat and buffering
- Browser key repeat (`e.repeat`) is ignored. The input manager does its own repeat: first move on
  press, then after **180 ms**, then every **90 ms** while held (both values configurable).
- **At most one buffered action** while a move is being processed or animated, so the player never
  slides past a junction after letting go.
- Releasing the key cancels repeat right away.
- **Safety stop:** auto-repeat (keys, D-pad and swipe) is cancelled on `lifeLost` and on
  `enemySighted`, so holding a direction cannot run you into an enemy you have not had time to see.
  The player simply presses again to continue.

### 7.4 Touch
- **D-pad**: four DOM buttons in the bottom area (`pointerdown` / `pointerup` / `pointercancel`, same
  hold-repeat timing). Sizes S/M/L in Settings. Hidden on non-touch devices
  (`matchMedia('(pointer: coarse)')`), and can be forced on or off in Settings.
- **Swipe** on the map: a pointer move over 24 CSS px picks the dominant axis → one move. Keeping
  the finger down after a swipe keeps repeating in that direction.
- Menus: tap a menu line (hit rects from `text-ui.ts`).
- Physical keyboards on Android work too (the WebView gets key events).

---

## 8. Game flow, screens, saving

### 8.1 Screen state machine

```
Title ──New Run──▶ Game ◀──▶ Pause ──▶ Settings
  │  ──Continue──▶   │  │        │
  │                  │  │        └─Quit to title (run is kept)
  └──Settings        │  └─0 lives──▶ GameOver ──any key/tap──▶ Title (run deleted)
                     ▼
                FloorTransition ──any key/tap──▶ Game (next floor)
```

- **Title**: `New Run`, `Continue` (only if a saved run exists), `Settings`. Shows the deepest floor reached.
- **Game**: map + HUD (lives row, stats row). Reaching `!` → `reachedExit` event → transition
  screen. Losing the last life → `gameOver` event → Game Over screen.
- **GameOver**: "GAME OVER", the floor reached, steps, time and deaths; any key or tap goes to the
  Title. The saved run is deleted (Continue disappears); the deepest-floor record stays.
- **FloorTransition**: "Floor 3 cleared — 140 steps (best possible 96), 1:12" then "Descending to Floor 4…".
- **Pause**: Resume, Settings, Restart floor, Quit to title. Shows the run seed. Restart floor is
  free but keeps the **current** lives (it never refills them) and still counts as one floor start.
- **Settings**: Language (Auto/EN/IT), Theme, D-pad size, D-pad visibility, Key bindings, Repeat speed.

### 8.2 Turn processing
`GameScreen` calls `applyAction(state, action)` (pure) and handles the returned events. In order:

1. **Player action.** A move into a wall is a `bumped`. A move into a tile covered by an enemy's
   `cells` is a `hitEnemy`: the player does not move and `loseLife` runs (step 4).
2. **Move.** The player steps, steps are counted. Reaching the exit emits `reachedExit` and stops
   the turn here (no enemy turn).
3. **Enemy turn.** Every enemy, in id order, runs its behaviour (`Behavior.act`, nothing for the
   Bloodstone). Afterwards, if an enemy's `cells` cover the player's tile and `graceTurns` is 0,
   that is a `hitEnemy` and `loseLife` runs. `graceTurns` counts down by one each turn.
4. **`loseLife`** (`core/lives.ts`): `lives--`, `stats.deaths++`, player back to `floor.start`,
   `floorSteps = 0`, `graceTurns = 1`. Explored memory, the timer and run totals are kept. Emits
   `lifeLost`, and also `gameOver` when `lives` reached 0.
5. **Visibility.** Recompute the FOV, add it to `explored`, emit `enemySighted` for each enemy
   newly in view.
6. **UI reacts to events:** `lifeLost` → red flash + message, cancel auto-repeat, autosave the run
   with the new life count; `gameOver` → delete the saved run, show the Game Over screen;
   `enemySighted` → cancel auto-repeat; `reachedExit` → transition screen.

### 8.3 Timer
`floorTimeMs` only counts while the Game screen is active and the page is visible. It stops when
paused, on `visibilitychange`, and on Capacitor's `pause` event.

### 8.4 Save format

```ts
interface SaveDataV2 {
  version: 2;
  generatorVersion: number;
  run: {
    seed: string; floor: number; totalSteps: number; totalTimeMs: number; // totals at the floor start
    lives: number;                                                        // lives right now (1..3)
    deaths: number;                                                       // lives lost so far in this run
    lifePickups?: number[];                                               // floors whose life pickup was taken (§16)
  } | null;
  records: { deepestFloor: number };
}
interface SettingsV1 {
  version: 1;
  language: 'auto' | 'en' | 'it';
  theme: 'default' | 'high-contrast' | 'colorblind';
  dpadSize: 'S' | 'M' | 'L';
  dpadVisible: 'auto' | 'on' | 'off';
  bindings: Record<string, string[]>;
  repeatDelayMs: number;
  repeatIntervalMs: number;
}
```

- Saved at the **start of each floor** and **immediately whenever a life is lost** (so quitting and
  pressing Continue cannot bring lives back). A floor is fully rebuilt from
  `seed + floor`, so a save is a few hundred bytes.
- On load: run migrations by `version`. If `generatorVersion` differs, the run continues at the same
  floor number, but the floor is regenerated by the new generator. This is acceptable because no
  progress within a floor is saved.
- **Migration v1 → v2** (the first real use of the migration framework): an old saved run gets
  `lives: 3, deaths: 0`. Continue restarts the saved floor from its beginning with the saved lives.
  Game Over clears `run` and keeps `records`.
- Storage backend (`KeyValueStorage` interface):
  - Web / Tauri: `localStorage`.
  - Android: `@capacitor/preferences`. Android can clear WebView `localStorage` when storage is low.
- Every read/write is wrapped in try/catch. If saved data is missing or corrupt, the game falls back
  to defaults.

### 8.5 Android lifecycle
- `@capacitor/app` `pause` → auto-pause the game and stop the timer. `backButton` → Pause screen or
  back one screen. On the Title screen it exits the app.
- Capacitor's built-in `SystemBars` (configured in `capacitor.config.ts`) → hide the system bars (immersive).
- Orientation locked to portrait in `AndroidManifest.xml`.

---

## 9. Internationalization

- `en.ts` is the source of truth (`as const`). `it.ts` is typed as `Record<keyof typeof en, string>`,
  so a missing translation fails the build.
- `t('floorCleared', { floor: 3 })` with `{name}` placeholders.
- Language: from Settings. `auto` uses `navigator.language` (`it*` → Italian, otherwise English).
- New texts for lives and Game Over (hit message with the lives left, "last life", the Game Over
  title and summary lines) are added in both English and Italian; the existing placeholder test
  checks that both languages use the same `{placeholders}`.

---

## 10. Testing strategy

| Area | Tests |
|---|---|
| `rng` | Same seed → same sequence. Distribution sanity check. |
| `floor-map` | `parseMap` / `serializeMap` round-trip. |
| Generators | For **500 seeds × floors 1–20**: odd dimensions, border all wall, start/exit walkable, exit reachable, no isolated floor cells, the same seed gives the same output. |
| Snapshot | ASCII snapshot of seed `"TESTSEED"` floors 1, 4, 15. A failing snapshot means `GENERATOR_VERSION` must be bumped. |
| `difficulty` | Each parameter moves in one direction as floors increase; values stay within bounds. |
| `fov` | Hand-made ASCII maps: corridor visibility, pillars, symmetry, radius limit. |
| `pathfinding` | BFS distances on hand-made maps; A* finds a shortest path. |
| `turn` | Wall collision, step counting, exit event. |
| `input-manager` | Repeat timing and the one-action buffer (fake timers). |
| `save` | Migrations, corrupt data falls back to defaults. **v1 → v2** adds `lives: 3, deaths: 0`. |
| Enemy placement | For **500 seeds × floors 1–20**: spawns on walkable tiles, never on start/exit or the shortest route, ≥ 6 tiles from the start, distinct, count matches `enemyCount`, **exit still reachable with enemy cells blocked**, same seed → same spawns. |
| Snapshot (enemies) | ASCII snapshot with `x` markers for `"TESTSEED"` floors 2, 6, 15. The terrain snapshots must **not** change (separate RNG stream). |
| `lives` / `turn` | Walking into an enemy costs a life and does not move the player; respawn at start; `floorSteps` reset, `totalSteps`, timer and explored map kept; 1 grace turn; `gameOver` at 0; events in the right order. |
| `enemySighted` | Emitted once when an enemy first becomes visible, not every turn. |
| `layout` | Lives row and stats row stay inside the safe area and do not overlap the map. |
| `GameScreen` | `lifeLost` releases held keys, autosaves, shows the message; `gameOver` deletes the run and opens Game Over. |
| `ascii format` | `parseMap` / `serializeMap` round-trip with `x` spawns. |

Manual QA checklist per platform: launch, resize/rotate, play 3 floors, pause/resume, background
the app and come back, quit and continue, change language/theme/bindings, D-pad and swipe.

### Dev tools
- `npm run gen -- --seed ABC123 --floor 8` prints the floor as ASCII in the terminal (plus path
  length and dead-end count; enemies are printed as `x` and counted). Used to tune difficulty
  without running the game.
- **Debug overlay** (`F3` or `?debug=1`, dev builds only): reveal the map, highlight the BFS shortest
  path (which is also the guaranteed enemy-free route), show seed/params, jump to floor N,
  regenerate. Added with enemies: all enemies are shown while revealed, `L` loses a life, `H`
  gains a life, `E` re-rolls the enemies of the current floor.

---

## 11. Packaging and builds (local, no CI)

### 11.1 npm scripts

| Script | Does |
|---|---|
| `dev` | Vite dev server (web, with HMR) |
| `test` / `test:watch` | Vitest |
| `lint` / `typecheck` | ESLint; `tsc` for both tsconfigs |
| `gen` | Map CLI (`tsx scripts/gen-map.ts`) |
| `build:web` | `vite build` → `dist/` (PWA) |
| `build:desktop` | `tauri build` (on the current OS) |
| `build:android` | `vite build && cap sync android && gradlew assembleDebug` |
| `release:android` | Same, but `assembleRelease` with signing |
| `version:sync` | Copy the `package.json` version into `tauri.conf.json` and Android `versionName`/`versionCode` |

### 11.2 Web
- `dist/` is a static site. Works offline via service worker. Can be hosted anywhere or opened as
  a PWA. Also the base for both native shells.

### 11.3 Windows (Tauri 2)
- Prerequisites: Rust (rustup, MSVC toolchain), Visual Studio Build Tools (C++), WebView2 (included
  in Windows 11).
- Output: NSIS installer `.exe` (+ optional `.msi`) in `src-tauri/target/release/bundle/`.
- Window: title "Ascii Dungeon", min size 640×480, `F11` toggles fullscreen.

### 11.4 Linux (Tauri 2)
- Tauri can't build Linux binaries from Windows. Build inside **WSL2 (Ubuntu)** or on a Linux machine.
- Prerequisites (Ubuntu): `libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev` + Rust + Node.
- Output: `.AppImage` and `.deb`.

### 11.5 Android (Capacitor)
- Prerequisites: Android Studio (SDK + platform tools), JDK 21. Use the Capacitor default minSdk/targetSdk.
- Plugins: `@capacitor/app`, `@capacitor/preferences`; system bars use Capacitor's built-in `SystemBars`.
- Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
- Release APK: make a keystore once with `keytool`. Put its path and passwords in
  `android/keystore.properties` (**gitignored**) and read them in `build.gradle`. Back up the keystore:
  losing it means future updates can't be installed over an existing install.
- Portrait lock and immersive mode as in §8.5.

### 11.6 Git
- `git init` in phase 0. `.gitignore`: `node_modules/`, `dist/`, `src-tauri/target/`,
  `android/app/build/`, `android/.gradle/`, `*.keystore`, `*.jks`, `keystore.properties`, `.env*`.
- One commit (or a few) per milestone. Tag releases `vX.Y.Z`.

---

## 12. Milestones

Each milestone ends with a working, committed state.

**Status:** M0–M5, M7–M9, the Patroller and Spear (M11) and the 100-floor run with a Victory ending are done and committed (M7: debug APK built and checked, not yet run on
a phone). M6 is still pending. **M8–M11 are new** (lives, enemies); the old "M8 — Polish" is now
M10, and its entity layer / turn scheduler moved into M9 because enemies need them. M9 adds `Enemy.seen`,
`serializeMap(map, { enemies: false })` for terrain-only snapshots, and `GENERATOR_VERSION = 2`. M8 shipped as
specified; the only addition is a translucent `alpha` parameter on `GlyphRenderer.fillRect` for the
hit flash and notice strip.

### M0 — Scaffold
- `git init`, Vite + TS strict, two tsconfigs, ESLint (with `Math.random` ban in core/gen),
  Prettier, Vitest, `.gitignore`, folder structure, empty canvas page.
- **Done when**: `npm run dev` shows a black canvas. `lint`, `typecheck`, and `test` pass.

### M1 — Core and generation (headless)
- `rng`, `geometry`, `grid`, `tiles`, `floor-map` (parse/serialize), `pathfinding` (BFS).
- `growing-tree`, `rooms-and-mazes`, `braid`, `placement`, `validate`, `difficulty`, `generate-floor`.
- `scripts/gen-map.ts` CLI.
- **Done when**: the 500 seeds × 20 floors property test passes, snapshots are committed, and
  `npm run gen` prints good-looking floors at several depths.

### M2 — Playable single floor (web, keyboard)
- Font loading, glyph renderer (DPR, square cells, dirty rendering), layout, fit-whole-map view.
- `actions`, `turn`, `game-state`. Keyboard input with repeat and buffering.
- **Done when**: you can walk `@` through floor 1 with WASD/arrows, walls block movement, and the
  picture stays sharp on resize and high-DPI screens.

### M3 — Progression and fog
- `fov` (shadowcasting), explored memory, sight radius from the difficulty curve.
- Exit → FloorTransition → next floor. Steps and timer. HUD.
- Debug overlay.
- **Done when**: you can play floors 1→15+ with difficulty clearly going up and fog behaving
  correctly; the debug overlay works.

### M4 — Screens, settings, saving, i18n
- Screen stack, `text-ui`, Title, Pause, Settings screens.
- `KeyValueStorage` (localStorage impl), save/settings schemas and migrations, autosave, Continue,
  deepest-floor record.
- i18n EN/IT, themes, key rebinding.
- **Done when**: closing and reopening the tab offers Continue on the right floor, and all settings
  persist and apply.

### M5 — Touch and mobile layout
- Portrait layout with D-pad area, safe-area insets, D-pad with hold-repeat, swipe, tappable menus.
- Follow camera + zoom toggle.
- **Done when**: the web build is fully playable in Chrome DevTools device mode and on a real phone
  browser, with readable tiles at 61×61 thanks to the camera.

### M6 — Web release and desktop (Tauri)
- `vite-plugin-pwa`, icons, manifest.
- `tauri init`, window config, fullscreen toggle. Windows installer build. Linux AppImage/.deb via WSL2.
- `version:sync` script.
- **Done when**: the PWA installs and works offline, and the Windows installer and Linux AppImage
  both run the game with saves persisting across restarts.

### M7 — Android (Capacitor)
- `cap add android`, plugins, `@capacitor/preferences` storage implementation, back button, pause on
  background, status bar hidden, portrait lock, app icon.
- Debug APK, then a signed release APK.
- **Done when**: the release APK installs on a real device, plays well, survives
  backgrounding/killing (Continue works), and the back button behaves as specified.

### M8 — Lives and Game Over
No enemies yet: the debug keys (`L` / `H`) lose and gain lives, so the whole life cycle can be
played and tested first.
- `core/lives.ts`: `lives` / `maxLives` / `graceTurns` / `stats.deaths` in `GameState`, `loseLife`
  (respawn on start, reset `floorSteps`, keep explored map + timer + totals), events `lifeLost` and
  `gameOver`. `createGameState` takes the current lives so they carry across floors.
- HUD: separate lives row (`<3 <3 </3`) above the stats row; `computeLayout` gets a `lives` rect.
- Feedback: red flash (about 250 ms) + one-line message; held keys are released on `lifeLost`.
- Save **v2** (`lives`, `deaths`) with the v1 → v2 migration; autosave right after every life lost;
  Pause → Restart floor keeps the current lives.
- `GameOverScreen` (floor reached, steps, time, deaths) → Title; `SaveStore.clearRun()`; the
  deepest-floor record is kept.
- i18n (EN/IT) for the new texts; debug overlay keys `L` / `H`.
- **Done when**: losing a life respawns on the start tile with the right counters, the third loss
  shows Game Over and removes Continue, quitting after a loss and pressing Continue keeps the
  reduced lives, and an old v1 save loads with 3 lives.

### M9 — Enemies: foundation and the Bloodstone
- `core/entity.ts` (`Enemy`), `core/enemy-defs.ts` (`ENEMY_DEFS`, Bloodstone entry),
  `core/behaviors.ts` (`Behavior`, a no-op for the Bloodstone) and the **enemy turn** inside
  `applyAction` (the old "turn scheduler stub"). Move into an enemy → `hitEnemy` → `loseLife`.
- `gen/enemies.ts`: seeded placement on its own RNG stream, the safe-route rule, `enemyCount` in
  `difficulty.ts`; validation additions; `FloorMap.spawns`; `x` in the ASCII format.
- Rendering: theme colours (`enemy`, `enemyRemembered`, `heart`) and the colorblind `%` glyph;
  remembered enemies stay drawn dimmed; `enemySighted` event cancels auto-repeat.
- Tools: `npm run gen` prints and counts enemies, difficulty table gets an enemy column; debug
  overlay shows enemies and `E` re-rolls them.
- **Done when**: from floor 2 you meet dark-red `#` blocks in dead ends and rooms, walking into one
  costs a life and respawns you, the exit is reachable on all 500 × 20 test seeds with enemy cells
  blocked, holding a direction stops when an enemy comes into view, and the terrain snapshots are
  unchanged.

### M10 — Polish and tap-to-walk
- A* in `pathfinding` and tap-to-walk (tap a remembered tile → walk the path step by step). The
  path never goes through a visible enemy, and walking stops when an enemy is sighted or input arrives.
- Glyph atlas if profiling calls for it. Gamepad support (Gamepad API) as a stretch goal.
- Optional: short vibration on Android when a life is lost (`@capacitor/haptics`).
- **Done when**: tap-to-walk works, and adding a dummy wandering entity requires no changes to the
  renderer or turn loop.

### M11 — Enemy roster (one small milestone per type)
Built one at a time on the M9 foundation, each with its own tests and a difficulty entry. The
design of each type, and the questions to settle before building it, are in §15:
**Patroller → Chaser → Sleeper → Spear.**

The next thirteen types (Sleeper, Sentinel, Sweeper, Pendulum pair, Shadow, Ghost, Wanderer, Breeder, Mimic,
Lurker, Blinker, Shade, Bouncer) have a full plan in [ENEMY_ROSTER_PLAN.md](ENEMY_ROSTER_PLAN.md): shared
foundations (M12), one milestone per type (M13-M25), the unlock schedule, the threat budget and the fairness
script. Its numbers are proposals until confirmed type by type.

---

## 13. Ready for later features

| Future feature | Prepared by |
|---|---|
| Enemy types beyond the Bloodstone | Planned in M9/M11: `ENEMY_DEFS` data table, `Behavior` interface, `Enemy.cells` (multi-tile hazards), per-turn enemy phase, enemy RNG stream, A*, symmetric FOV. See §15. |
| Items / inventory | Tile layer and entity layer are separate. `Action` union extends with `pickup`/`use`. The HUD can take more rows. |
| Extra lives, more HP | `maxLives` is a state field, the save has `lives`, the hearts row draws `maxLives` hearts. The life pickup is built (§16); more HP would raise `maxLives`. |
| Map editor | `FloorMap` ⇄ ASCII text format. Pure `core/` with no DOM. `validate.ts` reused to check edited maps. |
| More floor types | `FloorGenerator` interface. `difficulty.ts` picks the generator per floor. |

---

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Linux builds can't be made from Windows | WSL2 Ubuntu (documented in §11.4). |
| Fonts render differently across WebView2 / WebKitGTK / Android WebView | Bundled font, glyphs centered in square cells, whole-pixel cell sizes. |
| Generator changes break seed reproducibility | `GENERATOR_VERSION` + snapshot tests + save handling (§8.4). |
| Tiles too small on phones | Follow camera with a minimum cell size + zoom toggle. |
| Player slides past junctions while holding a key | Custom repeat timing + one-action buffer. |
| Fog too frustrating or too easy | Every value lives in `difficulty.ts`; tune with `npm run gen` and the debug overlay. |
| Android clears WebView storage | `@capacitor/preferences` on Android. |
| Losing the Android signing key | Keystore kept out of git and backed up separately (§11.5). |
| An enemy makes a floor unsolvable | Never placed on the shortest route; validation blocks all enemy cells in a BFS and requires the exit to stay reachable; 500 × 20 seed test. |
| Holding a key runs you into an enemy | Auto-repeat is cancelled on `enemySighted` and `lifeLost` (§7.3). |
| A dark red `#` is easy to mistake for a wall | Distinct colour per theme, `%` glyph in the colorblind theme, remembered enemies stay drawn; revisit the colour after playtesting. |
| Quit-and-Continue to get lives back | The run is saved immediately on every life lost; Restart floor never refills lives. |
| Enemies change generator output for existing seeds | Separate RNG stream (terrain snapshots stay identical); enemy snapshots; `GENERATOR_VERSION` bump rule covers enemy placement. |
| Moving enemies feel unfair | One-turn grace after respawn, enemies move only after the player acts (never in real time), safety stop on sighting. |

---

## 15. Enemy design notes (future types, M11)

Shared rules for every enemy type: it is an `Enemy` entity with a `type` from `ENEMY_DEFS`, acts
once per player action through its `Behavior`, hurts through its `cells`, draws only while in
sight unless it is `remembered`, and uses `enemyRng` for any randomness (so a seed always plays
out the same way). Before building each type we agree its exact numbers; the questions are listed.

### Patroller
Walks back and forth between two points along a corridor or room edge, one tile per turn, turning
around at the ends. Deterministic, so it is a timing puzzle rather than a surprise.
- **Built (M11, first type).** Decided values: glyph `&` (brighter red than the Bloodstone; `$` in
  the colorblind theme), first appears on floor 8, same spawn weight as the Bloodstone. It walks a
  **straight segment of 3–7 tiles**, **one tile per turn** (every turn that takes time), bouncing
  at both ends, starting at one end heading to the other. It hides when out of sight.
- **Placement:** the whole segment (every tile it can ever occupy) is ≥ 6 tiles from the start, off
  the shortest route, off the start/exit and shared with no other enemy, so the safe route is free
  however it moves. Crossing the route is **not** allowed until a `wait` input exists (Spear).
  `FloorMap.spawns` carries `end`; validation checks straightness, length and the whole footprint.
- **ASCII maps:** `p` marks the start and `P` the other end; each `p` takes the nearest free `P` in
  its row or column.
- **Contact:** walking into it, or it walking onto the player, costs a life (grace turn applies).
- **Sighting:** `enemySighted` fires every time it comes back into view (a Bloodstone only once),
  so holding a direction stops when a patroller appears.
- Still open: two enemies meeting is avoided by placement (segments never share tiles).

### Chaser
Once it has seen the player it moves one tile toward them each turn along the shortest maze path.
- **Built (M11).** Decided values:
  - **Speed:** one tile per turn, the same as the player, so it can never catch someone who keeps
    walking away; it punishes dead ends, wrong turns and the wait key.
  - **Noticing:** line of sight within **5 tiles** (`computeFov` from the chaser, so walls block it).
    While it hunts it follows the player's real position, even out of sight.
  - **Giving up:** **8 turns** without seeing the player, then it walks home and idles. Seeing the
    player again on the way restarts the hunt.
  - **After a hit** (the player loses a life and respawns): it goes home at once and stays idle for
    **4 turns**; together with the one-turn grace the player never respawns next to a hunter.
  - **Other enemies:** Bloodstones are walls to it; patrollers and spears are ignored; two chasers
    never share a tile (the later one queues up behind).
  - **Look:** `c` while idle, `C` in a brighter colour (`theme.enemyHunting`) while hunting; `o` / `O`
    in the colorblind theme. Hidden out of sight (not `remembered`). The new `enemyAlerted` event
    (only if the player can see it start hunting) and `enemySighted` both stop auto-repeat.
  - **Appears:** from floor **35**, at most **1 per floor up to floor 59**, up to **3** from floor 60
    (`maxChasersForFloor`). Counts inside the normal enemy count.
  - **Placement:** home tile off the shortest route, at least **12 steps** from the start
    (`MIN_CHASER_START_DISTANCE`); the chaser's tile is not a permanent obstacle, so the
    exit-reachable check and the pickup check ignore it.
  - **Guarantee:** only that the exit is reachable. A chaser coming at the player head-on in a
    corridor can force a life loss on the first attempt of some floors; after the respawn it is
    back at home on a cool-down, so a retry is fair. (A "safe dash" simulation was offered and
    declined; it is the option to revisit if playtesting shows too many forced losses.)
  - **How:** `Behavior` `chase` in `core/behaviors.ts` (state in `enemy.memory`: home `hx,hy`, `mode`
    0 idle / 1 hunt / 2 return, `lost`, `cool`), a breadth-first distance map from the target each
    turn with ties broken N, E, S, W (no randomness, no A* needed), `reset` sends it home.
    ASCII: `c` marks its home. `GENERATOR_VERSION` 7.

### Sleeper
Stands still like a Bloodstone until the player comes within N tiles, then wakes and behaves like
a Chaser for K turns before going back to sleep. Gives the player a choice: sneak past or run.
- Open: wake radius, how long it stays awake, whether wake-up is signalled (glyph change, e.g. `z` → `S`).

### Spear
A hazard that grows and shrinks along a straight line, repeating forever. One full cycle, one step
per player action (the tip glyph points the way it extends, `-` is the shaft):

```
>    ->   -->   --->   ---->   --->   -->   ->   >
```

- **Shape:** anchored at a base tile; length goes 1 → max → 1 (ping-pong), `max` between 3 and 6 and
  never longer than the free straight run of floor in its direction. Tip glyph `>` `<` `^` `v`,
  shaft `-` (horizontal) or `|` (vertical). `Enemy.cells` lists every occupied tile (base included)
  and **every one of them hurts**; its length changes each turn, which is exactly what the
  multi-tile `cells` field is for. The behaviour keeps its phase in `memory`.
- **It is a timing puzzle, so the player must be able to wait.** Needs a real `wait` action:
  `Space` / `.` on the keyboard (rebindable) and the **centre of the D-pad** on touch. Waiting
  costs a turn, so the spear keeps moving; nothing else changes.
- **Solvability rule (as built):** the base is never on the shortest route, but the reach may cross
  it. A crossing spear is only kept if `routeSurvivable` (`gen/spear-timing.ts`) proves the route
  can still be walked: it searches (position on the route, turn mod the joint cycle) with the
  player moving or waiting, using the same turn order as the game (player moves, spears step).
  Consequence: a route tile one step from a spear's base is never enterable (it is covered the turn
  after any step onto it), so such crossings are rejected; two or more tiles from the base there is
  a quiet moment each cycle. The check walks the route only, so it is conservative (sound).
  Validation reruns it, and a base on the route or a spear with no fair timing fails the floor.
- **Fairness:** the cycle restarts (length 1) on every respawn (`Behavior.reset`). The tile layout
  is fixed by the seed. After a respawn the one-turn grace applies.
- **Drawing:** it changes shape every turn, so it is redrawn from `cells` each frame; while out of
  sight it is hidden (it is not `remembered`).
- **Built (M11, last type for now).** Decided values: first appears on floor 20, same weight as the
  others; reach 3–6 tiles, straight, every tile hurts, one length step per turn that takes time,
  no warning beyond the visible shape. The tip is the patrol walk (`memory`: segment start,
  direction, length, offset `i`, `dir`), so patrollers and spears share `stepAlongSegment`.
  ASCII: `s` = base, `S` = tip at full reach. It is hidden out of sight and `enemySighted` fires
  whenever it comes back into view.
- **Wait (as built):** `Settings.waitKeys` (default `Space`, `Period`; no settings version bump,
  older settings get the defaults), a "Wait a turn" row in Controls that cannot clash with a
  direction key, `Screen.onWait`, and the D-pad centre button (a tap, no auto-repeat; holding
  the key does not keep waiting). Screens without turns ignore it, so Space still activates menus.

---

## 16. Pickups: extra lives

The first collectable. It is not an enemy and never hurts; it is a **life pickup** that restores
one lost life. Decided with the user:

- **Glyph:** green `+` (`pickup` / `pickupRemembered` theme colours; blue in the colorblind theme,
  where green against the red hearts would not separate). Once seen it stays drawn (dimmed out of
  sight), like the Bloodstone, so you can plan a return.
- **Rule:** it restores one life **up to `maxLives`, which stays 3**. At 3/3 it cannot be
  collected: stepping on it only shows "Lives are full" and it stays where it is.
- **Where in the run:** floors **10, 20 … 90** (`LIFE_PICKUP_FLOORS`, 9 per run). Floor 100 has none
  because the Victory ends the run. A fixed cadence, no random chance.
- **Where on the floor:** off the shortest start-exit route, hidden by fog, in a dead end where
  possible, at least 8 steps (walking) from any route tile. If nothing qualifies the minimum relaxes
  8 → 6 → 4 → 2, so a pickup is always placed. Also at least 6 steps from the start, never on the
  exit, never on an enemy tile (a patroller's segment or a spear's reach), and reachable from the
  start with every Bloodstone and patroller tile blocked. It is optional, so a spear on the way
  only needs timing, not a proof.
- **Generation:** placed after the enemies with its own rng stream `runSeed:floor:pickups`, so
  terrain and enemies are unchanged. `FloorMap.pickups` holds it; ASCII `+`. `GENERATOR_VERSION`
  went 5 → 6. Validation checks the rules above.
- **Anti-farming:** a floor's pickup is rebuilt from the seed, so the run save remembers which
  floors' pickups were taken: `run.lifePickups: number[]` (additive field, no version bump; missing
  means none). Once taken it never reappears, even after Restart floor, Continue or dying. The run
  is autosaved the moment a life is gained (as it is when one is lost).
- **Turn rule:** stepping onto it is a normal move; the pickup resolves before the enemy turn
  (`lifeGained` or `lifeFull` event). `pickupSighted` fires the first time it comes into view and
  cancels auto-repeat like `enemySighted`.
- **Feedback:** a 1.5 s message strip ("+1 life", or "Lives are full"); no flash, no animation, no
  "lives found" stat on the end screens.
