# Enemy roster plan (M12 - M26)

Thirteen new enemy types on top of the four that exist (Bloodstone, Patroller, Spear, Chaser): **Sleeper,
Sentinel, Sweeper, Pendulum pair, Shadow, Ghost, Wanderer, Breeder, Mimic, Lurker, Blinker, Shade, Bouncer.**

This is a **plan, not a decision record**. Every number below is a proposal. The working agreement still
applies: before building each type we confirm its numbers with the user (the "Open questions" of each
section are the questions to ask), then write the decided values into [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
section 15 and tick the type off here. Read section 15 of that file first for the rules every enemy shares.

How to read this file: sections 1-3 are the big picture and the shared foundations (built once, in M12).
Section 4 has one plan per enemy with the same layout. Section 5 is the difficulty integration (unlock floors,
caps, threat budget). Sections 6-8 cover fairness measurement, milestones and risks.

---

## 1. Principles

1. **Solvability is the hard rule.** Every floor must stay winnable. Each type has a **guarantee class**
   (below) and a generator check that enforces it. A type that cannot offer a guarantee must say so in its plan,
   and the user signs off (as for the Chaser).
2. **Fairness is telegraphing.** A hazard that can hurt must be visible, or warn first, or be avoidable by
   standing still. Hidden or random things always get a warning turn.
3. **Determinism.** A seed plays out the same way: terrain and enemy placement have their own streams, behaviour
   randomness uses `state.enemyRng`. This plan adds one rule: **the enemy stream is re-seeded on every respawn**
   (section 3.9), so each attempt at a floor is reproducible and spears, chasers and the new random types all
   begin from a clean slate.
4. **Pure core.** Everything below lives in `core/` and `gen/` (no DOM, no `Math.random`, no clocks).
5. **Small committed milestones.** One type per milestone, each with tests, a generator version bump, a plan
   update, and a device smoke test at the end of the series.
6. **Keep the 24-enemy cap and the touch-first UI.** New types must read on a 375 px wide phone: one glyph per
   cell, colour never the only signal (colorblind theme gets alternative glyphs).

### Guarantee classes

| Class                   | Meaning                                                                                              | Enforced by                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **G1 footprint**        | Never touches the shortest route, so the route is free however it behaves.                           | Placement + `validateSpawns` (existing rule)                  |
| **G2 timing proof**     | May cross the route, but a search proves the route can be walked by moving/waiting.                  | Generalised `routeSurvivable` (section 3.6)                   |
| **G3 by construction**  | The geometry or the rules make a straight dash safe (it cannot reach or wake in time).               | Placement rule + a unit test of the argument                  |
| **G4 reachable only**   | Only "the exit is reachable". A first attempt may cost a life; a retry is fair (cool-downs, resets). | The existing exit-reachable check; user sign-off              |
| **G5 non-lethal**       | Does not take lives, so it cannot make a floor unwinnable.                                           | Bounded effects (the shove and blind rules below)             |

---

## 2. Roster at a glance

| Type            | One-liner                                                                             | Map char | Glyph (alt)                       | From floor | Per floor           | Cost | Class | New tech needed                         | Size | Milestone |
| --------------- | ------------------------------------------------------------------------------------- | -------- | --------------------------------- | ---------- | ------------------- | ---- | ----- | --------------------------------------- | ---- | --------- |
| Wanderer        | Slow random walker on a leash, 25% of turns it just stands.                           | `r`      | `r` (`e`)                         | 12         | 3                   | 1    | G4    | Enemy stream re-seed                    | S    | M13       |
| Mimic           | A fake `+` in a dead end; reveals when you come close, strikes if you hover.          | `m`      | `+` then `M` (`W`)                | 16         | 1, never on real-pickup floors | 1 | G1 | Ambush behaviour, decoy placement | S    | M14       |
| Sentinel        | Stationary turret: 2 turns of warning, then a beam along its row or column.           | `t`/`T`  | `T`, beam `=` `I` (`H`)           | 24         | 2, 4 from 60        | 2    | G2    | Periodic hazards, warn cells            | M    | M15       |
| Sleeper         | Sleeps like a Bloodstone; footsteps near it wake it for 12 turns of chasing.          | `z`      | `z` / `Z` (`n` / `N`)             | 28         | 1, 2 from 65        | 3    | G4    | Shared "step toward" helper             | M    | M16       |
| Blinker         | Roaming Bloodstone that teleports within a leash, announcing its landing tile.        | `k`      | `k` (`j`), landing mark `?`       | 30         | 2                   | 2    | G3    | Warn cells (M15)                        | S-M  | M17       |
| Bouncer         | A door-like bumper that opens and closes; touching it shoves you back, no life lost.  | `y`      | `Y` closed, `y` closing (`V`)     | 32         | 2                   | 1    | G2/G5 | Player trail, shove effect              | M    | M18       |
| Shade           | A slow drifter whose touch blinds you (sight radius 3 for 25 turns); no life lost.    | `u`      | `u` (`v`)                         | 40         | 2                   | 1    | G5    | Effect system (blind), HUD cue          | M    | M19       |
| Sweeper         | A pivot with one arm that turns 90 degrees every turn; next arm position is shown.    | `w`/`W`  | pivot `X`, arm `=` `I` (`%`)      | 44         | 1, 2 from 70        | 2    | G2    | Pivot placer, hazard oracle             | M    | M20       |
| Pendulum pair   | Patrollers whose lanes cross the route, in pairs, with timing proven solvable.        | `q`/`Q`  | `&` (`$`)                         | 48         | 1, 2 from 70        | 2    | G2    | Crossing placer                         | S-M  | M21       |
| Lurker          | Hidden trap beside the route: telegraphs when you step next to it, then strikes.      | `l`      | hidden, `?` warning, `L` (`K`)    | 52         | 2                   | 2    | G3    | Ambush behaviour (M14)                  | M    | M22       |
| Shadow          | Walks your own footsteps 20 turns behind you; starts at the start tile.               | none     | `~` (`^`)                         | 58         | 1                   | 3    | G3    | Trail, `;shadow` map directive          | M    | M23       |
| Ghost           | Drifts through walls toward you at half speed once it feels you within 7 tiles.       | `g`      | `g` (`G`)                         | 65         | 1, 2 from 90        | 3    | G3    | Wall-ignoring movement, unseen alert    | M    | M24       |
| Breeder         | A mother that spawns static offspring every 12 turns, never on the shortest route.    | `b`      | mother `B`, young `b` (`8`/`o`)   | 72         | 1, 2 from 90        | 3    | G1    | Runtime entity creation                 | M-L  | M25       |

Existing types for reference: Bloodstone (floor 2, cost 1), Patroller (8, 1), Spear (20, 2), Chaser (35, 3). The
`Cost` column feeds the threat budget in section 5. Sizes: S about half a day of work, M one to two days, L more.

---

## 3. Shared foundations (milestone M12, built before any new type)

Today `createEnemy`, `glyphForCell`, `placeEnemies`, `validateSpawns`, `routeSurvivable` and `turn.ts` each contain
type-specific branches. Adding thirteen types that way would be unmaintainable, so M12 refactors them into
registries. **M12 changes no behaviour and no generator output** (all snapshots stay identical), so it is cheap
to review.

### 3.1 Behaviour API v2 (`core/behaviors.ts`)

```ts
interface Behavior {
  /** Builds `enemy.memory` (and `cells`) from the spawn. Replaces the special cases in createEnemy. */
  init?(enemy: Enemy, spawn: EnemySpawn): void;
  act(enemy: Enemy, state: GameState, rng: Rng): GameEvent[];
  /** Back to the starting state when the player respawns (and the enemy stream is re-seeded). */
  reset?(enemy: Enemy, state: GameState): void;
  /** Which glyph one of the enemy's cells shows. Replaces the special cases in glyphForCell. */
  glyph?(enemy: Enemy, cellIndex: number, alt: boolean): string;
}
```

Shared movement helpers move out of the chaser into `core/pathing.ts`: `stepToward(enemy, state, target, blockers)`
(breadth-first distance map from the target, ties N-E-S-W, one tile) and `blockersFor(enemy, state)`. The Sleeper,
Shade and Chaser all use them.

### 3.2 `EnemyDef` additions (`core/enemy-defs.ts`)

```ts
interface EnemyDef {
  /* existing: glyph, mapChar, altGlyph, endChar?, behavior, minFloor, weight, damage, remembered */
  contact: 'life' | 'blind' | 'shove';   // what touching it does (default 'life')
  cost: number;                          // threat budget units (section 5)
  placement: PlacementKind;              // which placer in gen/placement/ (section 3.7)
  guarantee: 'footprint' | 'timing' | 'construction' | 'reachable' | 'none';
  maxPerFloor(floor: number): number;    // generalises maxChasersForFloor
  hazard?(spawn: EnemySpawn): PeriodicHazard; // only G2 types (section 3.6)
}
```

`remembered` stays; hidden types (Lurker, Ghost) are drawn by the per-behaviour rules in section 3.3.

### 3.3 Draw rules and warn cells

- `Enemy.warn: Point[]`: tiles that will hurt soon. They are drawn dimmer than hurting cells, under them, with a
  `theme.enemyWarn` colour and the behaviour's warn glyph (default `:`), only on lit tiles.
- `draw-floor.ts` stops special-casing types: it asks the behaviour for `glyph`, and the def for `draw`:
  `'seen'` (remembered once seen, like the Bloodstone), `'sight'` (only while lit, like the Patroller),
  or a behaviour override (Mimic disguise, Lurker hidden).
- `Enemy.solid: Point[]`: tiles that block movement and hurt on contact but are **not** part of the timed hazard
  in `cells` (a Sentinel's or Sweeper's body, a Breeder's mother, a hidden Lurker). `enemyAt` checks `cells` and
  `solid`; the hazard proof reads `cells` only. `Enemy.field?: Int16Array` is an optional cached distance field
  (the Wanderer's and Blinker's leash), kept out of `memory`, which holds numbers only.
- New theme keys, every theme: `enemyWarn`, `shade` (the Shade's colour), plus reuse of `enemyHunting` for awake
  or firing states. New event use: `enemyAlerted` also fires for **telegraphs** that start in view (a charging
  Sentinel, a Blinker landing mark), so held keys stop exactly as they do for sightings.

### 3.4 Contact effects (`core/contact.ts`)

turn.ts calls `loseLife` in two places (walking into an enemy, an enemy moving onto the player). Both become
`resolveContact(state, enemy): GameEvent[]`:

| `contact`  | What happens                                                                                                       | Events              |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | ------------------- |
| `'life'`   | Exactly today's rule: `hitEnemy` then `loseLife`.                                                                  | `hitEnemy`, `lifeLost`, `gameOver` |
| `'blind'`  | `state.blindTurns = BLIND_TURNS`; the enemy is consumed for this attempt (`enemy.cells = []`, `memory.gone = 1`). | `hitEnemy`, `blinded` |
| `'shove'`  | `shovePlayer(state, SHOVE_TILES)` along the player trail (section 3.5). No life lost.                              | `hitEnemy`, `shoved`  |

New events: `blinded { turns }`, `shoved { tiles }`, `enemySpawned { enemyId }`. `GameScreen` maps them to
messages ("Darkness falls", "Bounced back", ...) with their own i18n keys (EN + IT) and a message tone (the
pickup tone exists; add `'warning'`).

### 3.5 Player trail and per-attempt state (`core/game-state.ts`)

```ts
interface GameState {
  /* existing ... */
  trail: Point[];        // the player's tile after every turn that took time (waits repeat the tile), max 64
  attempt: number;       // 0 on a fresh floor, +1 per life lost on it
  blindTurns: number;    // > 0: sight radius is clamped (section 4.12)
  nextEnemyId: number;   // for runtime spawns (Breeder)
}
```

- `applyAction` pushes the player's position at the end of every turn that took time. `loseLife` clears the trail,
  increments `attempt` and re-seeds `enemyRng` (section 3.9).
- `shovePlayer(state, n)`: moves the player to `trail[len - 1 - n]` (or the start tile when the trail is shorter),
  truncates the trail to match, recomputes the field of view, does **not** add steps, and does not lose a life.
- Used by the Bouncer (shove) and the Shadow (reads the trail).

### 3.6 Periodic hazards: generalising `routeSurvivable` (`gen/hazard-timing.ts`)

The spear proof (`gen/spear-timing.ts`) already searches (route index, turn mod cycle) with the game's turn order:
the player moves (a tile covered now is a hit), then enemies step (a tile covered afterwards is a hit); reaching
the exit ends the floor before enemies move. Make it type-agnostic:

```ts
interface PeriodicHazard {
  period: number;                              // turns of one full cycle, from {4, 6, 8, 10, 12}
  hurtAt(phase: number): readonly Point[];     // tiles that hurt after `phase` enemy turns (phase 0 = floor start)
}
function routeSurvivable(map: FloorMap, hazards: readonly PeriodicHazard[]): boolean;
```

- Periods are restricted to `{4, 6, 8, 10, 12}`, so the joint cycle divides 120 and the search stays small
  (route length x 120 states at most).
- Spear, Sentinel, Sweeper, Pendulum and Bouncer each provide `hazard(spawn)`. `spear-timing.ts` becomes a thin
  wrapper, and the existing spear tests must pass unchanged.
- **Oracle test, one table-driven test for all periodic types:** step the real behaviour for `2 x period` turns and
  assert that `enemy.cells` after phase `k` equals `hazard.hurtAt(k)`. This is what keeps the proof honest when a
  behaviour changes.
- Validation reruns the proof; a floor whose timed hazards fail it drops the offending spawn (placement tries
  another), exactly as spears do today.

### 3.7 Placer registry (`gen/placement/`)

`placeEnemies` keeps the drawing loop (types by weight, caps, budget) and delegates the geometry to placers keyed
by `def.placement`:

| `PlacementKind` | Used by                                          | Geometry                                                                                |
| --------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `point`         | Bloodstone, Wanderer, Sleeper, Chaser, Blinker, Shade, Ghost, Breeder | One tile off the route, minimum start distance per type                  |
| `segment`       | Patroller                                        | Straight 3-7 run off the route                                                          |
| `reach`         | Spear                                            | Base off the route, reach may cross it, proof                                           |
| `line`          | Sentinel                                         | Body at the end of a straight run, beam along it, proof                                 |
| `pivot`         | Sweeper                                          | Pivot off the route where at least two directions have room, proof                      |
| `crossing`      | Pendulum pair                                    | Segment that crosses the route at one tile, perpendicular, proof                        |
| `gate`          | Bouncer                                          | A corridor tile **on** the route (the only type allowed there), always passable by waiting |
| `niche`         | Lurker                                           | Branch tile with exactly one route neighbour                                            |
| `decoy`         | Mimic                                            | Same rule as the life pickup (dead end, 8+ steps off the route)                         |
| `start`         | Shadow                                           | No tile: a floor flag (section 4.11)                                                    |

Helpers shared by all placers: route set, distance-from-start field, distance-from-route field (extracted from
`gen/pickups.ts`), the `taken` mask and the candidate lists.

### 3.8 Budget, caps and spotlight (`gen/difficulty.ts`)

See section 5. M12 adds the machinery (`cost`, `maxPerFloor`, `budgetForFloor`, `spotlightWeight`) with the
current four types configured to reproduce today's output exactly (budget is not binding until new types exist).

### 3.9 Randomness and attempts

Wanderer, Blinker and Breeder (and the Shade's tie-breaks) consume `enemyRng`. Order is deterministic because
enemies act in id order, but after a respawn the stream would otherwise continue from wherever it was, so a second
attempt would differ from the first for no reason the player can see. Rule: `loseLife` calls
`state.enemyRng = createRng(`${runSeed}:${floor}:behavior:${attempt}`)` and then every behaviour's `reset`.
Consequence: **attempt N of a floor is always the same game**, which also makes the fairness script (section 6)
exact.

### 3.10 Dynamic enemies (needed by the Breeder)

`spawnEnemy(state, spawn): Enemy` (allocates `state.nextEnemyId++`, fires `enemySpawned`) and `removeChildren` (reset
removes every enemy whose `memory.child === 1`). `detectSightings` already handles entities added at runtime.

### 3.11 Map format additions (`core/floor-map.ts`)

- Characters in section 2 are reserved now: **`r m t T z k y u w W q Q l g b`**; used already: `# . @ ! x p P s S c +`.
  `T`, `W`, `Q` are end markers (Sentinel beam tip, Sweeper arm tip, Pendulum far end), paired exactly like `P` and
  `S` today.
- **Directives:** `parseMap` accepts trailing lines that start with `;`, e.g. `;shadow 20`, for floor-wide flags
  that have no tile. `serializeMap` writes them back. Needed only by the Shadow.
- The ASCII legend in `scripts/gen-map.ts` and in `CLAUDE.md` is generated from `ENEMY_DEFS` instead of hand-written.

### 3.12 Tools, debug and Bestiary

- **Debug overlay:** shows each enemy's mode next to it (in view only); `G` spawns the selected type next to the
  player, `T` cycles the selected type, `R` reseeds the enemy stream. All dev-only.
- **`npm run fairness -- --floor 58 --seeds 200`** (`scripts/fairness.ts`): section 6.
- **Bestiary** (M26, optional but recommended once there are 17 types): a screen reachable from Settings that lists
  every type the player has met (glyph, name, two lines of text, the tell). Persistence: additive
  `records.seenTypes: EnemyTypeId[]` in the save (no version bump, sanitised like `lifePickups`). A type is added on
  its first `enemySighted`, `enemyAlerted` or contact. It is also where "a `+` on a floor without a real pickup is
  a Mimic" gets taught.

### 3.13 M12 definition of done

All existing tests pass with **no snapshot changes**; `GENERATOR_VERSION` unchanged; `Enemy.warn`, `Enemy.solid`
and `Enemy.field` exist (unused by the current four types); the spear oracle test and the
spear proof tests pass through the new hazard framework; `contact.ts` has tests for the three effects (using test
doubles for the new types); `CLAUDE.md` "How to extend" is rewritten around the registries.

**M12 built** (all existing tests and snapshots unchanged; `GENERATOR_VERSION` still 7). What differs from the text
above, and what was left for later:

- The placer directory is `gen/placers/`, not `gen/placement/` (that name is taken by the start and exit placement
  file). Registered so far: `point`, `segment`, `reach`; each placer also owns the validation of its kind
  (`Placer.validate`), and `validateSpawns` is now generic (caps from `maxPerFloor`, blocked tiles from
  `guarantee === 'footprint'`).
- Per-type caps and `cost` live in `ENEMY_DEFS` next to `minFloor` (core cannot import gen);
  `gen/difficulty.ts` re-exports the chaser constants and holds the budget, spotlight and `limitsForFloor`.
  **The budget and the spotlight are built and tested but switched off** (`ROSTER_RULES_ACTIVE = false`): with four
  types they would reshuffle today's floors for no reason. M13 turns them on together with its snapshot refresh.
- `createEnemy` moved from `entity.ts` to `enemies.ts` (it calls the behaviour's `init`). `placeFloorEnemies` resets
  the entities of a floor (used by `createGameState` and the debug overlay's re-roll).
- `spawnEnemy` returns `{ enemy, event }`; runtime enemies carry `memory.child = 1` and `removeChildren` runs on
  every respawn.
- Hazards: `core/hazards.ts` (`PeriodicHazard`, `HAZARD_PERIODS`, `spearHazard`), `core/segment.ts` (the segment
  maths), `gen/hazard-timing.ts` (the proof). `HAZARD_PERIODS` is `{2, 4, 6, 8, 10, 12}`: 2 is the two-tile spear that
  only tests build. `gen/spear-timing.ts` is the thin wrapper; its tests pass unchanged. The oracle test is in
  `core/foundations.test.ts`.
- `Behavior` also got `warnGlyph` and `alert` (the hunting colour), so `draw-floor.ts` has no per-type code left.
  Theme keys `enemyWarn` and `shade` exist in all three themes; the notice tone `'warning'` and the i18n keys
  `darknessFalls` and `bouncedBack` exist, and `blinded` / `shoved` stop auto-repeat like a sighting.
- Contact numbers (`BLIND_TURNS` 25, `BLIND_SIGHT` 3, `SHOVE_TILES` 4) are the proposals from sections 4.6 and 4.7,
  still to be confirmed when those types are built.
- `parseMap` / `serializeMap` handle `;name value` directives (`FloorMap.directives`).
- **Not done in M12, moved to where they are needed:** the debug keys `G` / `T` / `R` and the mode labels (with the
  first type that needs them, M13), `scripts/fairness.ts` (before M17, when there are G4 types to measure), the
  Bestiary (M26), the `Enemy.field` leash (M13 fills it; the field exists), and the `pivot`, `line`, `crossing`,
  `gate`, `niche`, `decoy` and `start` placers (each with its type).

---

## 4. Per-enemy plans

Template for each type: **Concept**, **Rules (proposed numbers)**, **Data model**, **Placement**, **Fairness**,
**Rendering and UI**, **Generator and files**, **Tests**, **Risks**, **Open questions**. Every type also follows
the six-step recipe in `CLAUDE.md` ("New enemy type") and ends with the common checklist in section 7.3.

### 4.1 Wanderer (M13, floor 12, class G4)

**Concept.** The cheapest variety: a slow creature that ambles around with no purpose. It exists to make "I have
seen this corridor empty" unreliable and to prove the random-behaviour plumbing.

**Rules.**

- Acts every second enemy phase (so half the player's speed). On its turn it stands still with probability 25%,
  otherwise it picks a walkable neighbour: 70% keep the previous heading if possible, else uniform among the free
  neighbours. Never moves onto a Bloodstone, another enemy, the exit tile, or any tile within 2 steps of the start.
- **Leash:** never ends a move more than 12 walking steps from its home tile (computed once with a distance field).
- Hurts only the tile it stands on. Contact costs a life (ordinary `'life'`).
- Hidden out of sight (`remembered: false`); `enemySighted` fires whenever it returns to view.
- `reset`: back to its home tile, heading cleared, tick 0. The enemy stream is re-seeded by `loseLife` (3.9).

**Data model.** `memory`: `hx, hy` (home), `hd` (heading 0-3, -1 none), `t` (phase counter), `leash` distance field
is recomputed on `init` and stored on the enemy object as `enemy.field?: Int16Array` (not in `memory`, which is
numbers only).

**Placement.** `point`: off the shortest route, at least 8 steps from the start, at most 3 per floor.

**Fairness.** G4 (reachable only). It is slow and leashed away from the start; because it may stand in a
corridor on the route, a head-on meeting costs a wait, not a life: it moves off or you step back, and with the
25% pause there is no deadlock (it eventually moves; the 2-step start buffer keeps respawns safe).

**Rendering.** Glyph `r`, colour `enemyMobile`, colorblind alt `e`.

**Generator and files.** New def + behaviour `wander` + `point` placer entry; `GENERATOR_VERSION` 8; snapshot for
floor 14.

**Tests.** Core: determinism across two runs of the same seed and attempt; same walk after a respawn
(re-seeded); never leaves the leash; never within 2 steps of the start; stands still about a quarter of the turns
(statistical, fixed seed); half speed. Gen: property floors 12 and 30 x 150 seeds; cap 3.

**Risks.** Feels pointless if too slow: tune speed to 2 turns per tile first, then try "every turn, 40% pause".

**Open questions.** Speed (half vs 2 of 3 turns); leash radius 12; may it end next to the exit?

**M13 built, numbers confirmed with the user:** moves on every 2nd turn, pauses 25% of its turns, keeps its heading 70%,
leash 12, max 3 per floor, may cross the route (home off it), contact costs a life. Differences from the text above:
the leash field is built lazily on its first move (`init` has no floor), the start buffer is a Manhattan distance of 2
(a superset of walking distance 2, so no field is needed), and it does not step onto another enemy's current tiles.
`GENERATOR_VERSION` 8; the threat budget and the spotlight were switched on with this milestone
(`ROSTER_RULES_ACTIVE = true`), which is why the enemy snapshots from floor 8 up changed; terrain snapshots did not.
The debug keys `T` (cycle type), `G` (spawn next to you) and `R` (re-seed) were added. Not yet seen on a device.

### 4.2 Mimic (M14, floor 16, class G1)

**Concept.** A trap dressed as the life pickup. It teaches the player that `+` is not always a gift, and it
trades on the detour they just invested in.

**Rules.**

- Looks like a pickup: glyph `+` in the pickup colour, **remembered** once seen, in a dead end 8+ steps off the
  route (placed with the same rule as the real pickup).
- **Reveal:** after a player move that leaves them within walking distance 2 of it (and in its line of sight), it
  becomes `M` in the enemy colour, `enemyAlerted` fires (held keys stop) and a one-line message shows ("It was a
  Mimic!").
- **Strike:** one enemy phase after the reveal, if the player is still within distance 1 of it, it strikes: its
  hurting cells become the walkable neighbours of its tile for that phase (the `ambush` behaviour, shared with the
  Lurker, section 4.10). Stepping into its tile is an ordinary contact (a life). After striking it stays revealed
  and re-arms after 3 phases.
- It never moves. On pickup-cadence floors (10, 20 ... 90) Mimics do not appear, so a `+` there is always real; a
  `+` on any other floor is always a Mimic once the player has learned the rule (the Bestiary teaches it).
- `reset`: back to disguised and armed.

**Data model.** `memory`: `st` (0 disguised, 1 revealed/warning, 2 striking, 3 cooling), `cool`. Reuses the
`ambush` behaviour with `memory.reveal` = 2 and `memory.hidden` = 0 (the Lurker uses `hidden` = 1).

**Placement.** `decoy`: calls `pickDeadEndOffRoute(map, rng, avoid)` extracted from `gen/pickups.ts` (distance 8
off the route, relaxed 6/4/2, start distance 6). Max 1 per floor, none on floors where `hasLifePickup(floor)`.

**Fairness.** G1: it is in a dead end off the route. Stepping next to it and retreating one tile is always safe
(the only strike tile besides its own is the one you stood on, and you left it).

**Rendering.** Disguised: `+` with `theme.pickup` (a slightly different shade is rejected as unfair; the tell is
the floor rule and the reveal). Revealed: `M`, colour `enemyHunting`; strike cells use the warn rendering first,
then hurt. Colorblind: revealed glyph `W`.

**Generator and files.** Def `mimic` (behaviour `ambush`), `decoy` placer, `GENERATOR_VERSION` 9.

**Tests.** Core: reveal at distance 2 only with line of sight; the strike hits a player who stays, misses one who
steps away; contact; reset. Gen: never on pickup floors; never within 8 off the route (relaxation rules shared
with the pickup tests); coexists with a real pickup rule check (separate floors). GameScreen: reveal stops
auto-repeat.

**Risks.** Players who never learn the floor rule: mitigated by the Bestiary and by making the first Mimic
(floor 16) forgiving (the reveal is hard to miss). A mimic and a pickup must never be adjacent to each other.

**Open questions.** Reveal radius 2; strike tiles (neighbours only); message wording; whether the very first Mimic
should be revealed from further away.

**M14 built, numbers confirmed with the user:** reveal at walking distance 2 in view, strike on the neighbours after one
turn of warning, about 1 eligible floor in 3 (`MIMIC_CHANCE`), no extra leniency on the first floors. Differences from the
text above: the Mimic is placed in its own pass (`gen/mimics.ts`, stream `runSeed:floor:mimic`) after the enemies and is
**not** counted in `enemyCount`, `enemyTypesForFloor` leaves out `decoy` types, and the dead-end picker is
`pickDeadEndOffRoute` in `gen/placers/decoy.ts` (shared with the life pickup, whose output is unchanged) with a
`minRouteDistance` of 2 for the Mimic so that every strike tile is off the route. The warning is "the player ended a turn
next to it": the tiles are marked (`warn`, `enemyAlerted`) and a second turn there strikes; stepping away in between is
safe. **The 3-turn re-arm was dropped:** a strike that lands costs a life and the respawn resets the Mimic, so a cool-down
could never be seen (the Lurker can add one if it needs it). New event `enemyRevealed` (message "It was a Mimic!" in
EN/IT; stops auto-repeat). `Behavior.alert` became `Behavior.tone` (`alert` or `pickup`), which is how the disguise uses
the pickup colours. Chasers treat a Mimic's tile as a wall. `GENERATOR_VERSION` 9; enemy snapshots for floors 16 and 21
added (they have a Mimic). Not yet seen on a device.

### 4.3 Sentinel (M15, floor 24, class G2)

**Concept.** A turret in a straight corridor or the edge of a room. It teaches reading telegraphs and gives the
timing-puzzle family a ranged member.

**Rules.**

- A body at its home tile facing one of N/E/S/W. Beam range 7: from the tile in front of it to the first wall or
  the 7th tile. The body itself is solid and hurts if walked into; remembered once seen (like a Bloodstone).
- **Cycle** of `P` turns (P is 6, 8 or 10, derived from the position: `P = [6, 8, 10][(x + y) % 3]`, so the ASCII
  format stays lossless): idle until phase `P - 3`; **charge** for 2 turns (phases `P - 3` and `P - 2`): the beam
  tiles are `warn` cells and the body glyph brightens; **fire** on phase `P - 1`: the beam tiles hurt (after that
  enemy phase) and show `=` (horizontal) or `I` (vertical); then it idles again.
- A player on a beam tile during the fire phase loses a life; being on one during the charge is only a warning.
- `reset`: phase 0, so every attempt starts the same way.

**Data model.** Segment-style spawn: `pos` = body, `end` = tip of the full beam, so ASCII is `t` (body) and `T`
(tip) paired like `p`/`P`. `memory`: `ax, ay, dx, dy, len, per` (period), `k` (phase counter). `cells` = beam tiles
only while firing, otherwise `[]`; `solid = [body]`; `warn` = beam tiles during the charge.

**Placement.** `line`: a body tile at the end of a straight corridor (dead end or wall) or on a room edge, facing
along at least 4 free tiles; off the shortest route; the beam may cross the route (proof). Max 2 per floor, 4 from
floor 60. At most one Sentinel beam per route crossing.

**Fairness.** G2. `hazard(spawn)` returns `period = P`, `hurtAt(k) = beam tiles if k mod P === P - 1`. The oracle
test (3.6) compares it with the behaviour. A beam along a long corridor that the route follows is rejected by the
proof (you cannot out-walk the gap) and a crossing beam is accepted (one step through during the idle phases).

**Rendering.** Body `T` (alt `H`) in `enemy` colour; charging body in `enemyHunting`; warn cells `:` in
`enemyWarn`; beam `=`/`I` in `enemyHunting`. `enemyAlerted` fires when a charge begins in view.

**Generator and files.** Def `sentinel`, behaviour `sentinel`, `line` placer, hazard provider, ASCII pairing for
`t`/`T`, `GENERATOR_VERSION` 10, enemy snapshot for floors 26 and 70.

**Tests.** Core: the three phases; beam stops at walls and at range 7; hurts only on the fire phase; reset;
contact with the body; period derivation. Gen: oracle test; a beam along the route is rejected; a crossing beam
passes; property floors 24, 40, 70 x 150 seeds. GameScreen: charge stops auto-repeat.

**Risks.** A body that is "solid but not in `cells`" is new; it is the reason `Enemy.solid` exists (section 3.3),
and it also serves the Sweeper's pivot, the Breeder's mother and the Lurker. The alternative (a separate
Bloodstone-like entity linked by id) is rejected because reset and sighting would have to keep two entities in step.

**Open questions.** Range 7, warning length 2 turns, periods, whether it may face into a room, whether beams may
pass over Bloodstones (proposed: yes, Bloodstones are not walls).

**M15 built, numbers confirmed with the user:** range 7, 2 charge turns, cycle 6/8/10 from the position, beams pass over
Bloodstones. Differences and details: the beam of a generated Sentinel is the whole free run ahead (up to 7, at least 4)
so `end` is exactly its last tile; the validator checks shape (straight, 4-7 beam tiles), body off the route and the
cap, not that the tile beyond the tip is a wall. Since two enemies never share a tile, a generated beam stops before
another enemy's tile; "beams pass over Bloodstones" therefore only matters in hand-written maps. New def field `body`
and `fixedTiles(spawn)` (core/enemy-defs.ts): a Sentinel's home tile is a permanent wall for the reachability checks
of the pickup and the Mimic, and the `line` placer refuses a body that would seal off part of the floor (or sits in
an already sealed pocket). Drawing: `Behavior.solidGlyph`, and `draw-floor` draws `enemy.solid` (stays drawn once
seen) while beam cells only show lit. "At most one beam per route crossing" was not built: the hazard proof already
decides fairness. Sentinels are fairly rare (about 0.8 per floor around 24-30, about 0.3 later) because few corridor
ends have a 4-tile run. `GENERATOR_VERSION` 10; enemy snapshots for floors 26 and 70 added. Not yet seen on a device.

### 4.4 Sleeper (M16, floor 28, class G4)

**Concept.** A Bloodstone that wakes up. It rewards patience (waiting is silent) and punishes rushing past.

**Rules.**

- **Asleep** at home: hurts only when walked into, `remembered` (stays drawn dimmed once seen), glyph `z`.
- **Wake rule (noise):** after a player **move** (not a wait) that ends within walking distance 4 of the Sleeper
  (walls count, so a Sleeper behind a wall does not hear), it **stirs**: glyph `Z` in the warn colour for one
  enemy phase (`enemyAlerted` if in view), then it is **awake**.
- **Awake** for 12 enemy phases: hunts exactly like the Chaser (`stepToward` the player, same speed, Bloodstones
  and other hunters are blockers), whatever it can see.
- After the 12 phases it **returns home** at the same speed, ignoring the player (drowsy), and falls asleep on
  arrival. (It never sleeps in place: a Sleeper asleep in a corridor on the route would block it for good.)
- Respawn: `reset` puts it asleep at home; no cool-down needed (home is 12+ steps from the start).

**Data model.** `memory`: `hx, hy`, `mode` (0 asleep, 1 stirring, 2 awake, 3 returning), `left` (awake turns).
Shares `stepToward` and `blockersFor` with the Chaser (extracted in M12).

**Placement.** `point`, like the Chaser: off the shortest route, at least 12 steps from the start. Max 1 per floor
until floor 64, 2 from 65.

**Fairness.** G4: only "exit reachable". Mitigations: it wakes only on noise within 4 steps (a route that passes
the home at 5+ steps never wakes it), it stirs for a full turn first, and it gives up after 12 turns.
`dash-sim` (3.6, section 6) reports how often a straight dash wakes one; if that exceeds the target the rule
becomes "home at least 5 steps from the route" (making the dash safe by construction).

**Rendering.** Asleep: `z` in `enemyRemembered` once seen (dim), `enemy` when lit. Stirring: `Z` in `enemyWarn`.
Awake: `Z` in `enemyHunting`. Colorblind: `n` / `N`.

**Generator and files.** Def `sleeper`, behaviour `sleep`, caps, `GENERATOR_VERSION` 11, enemy snapshot floor 30.

**Tests.** Core: a move within 4 wakes it, a wait does not, a wall in between does not; the one-turn stir; 12 awake
turns then a walk home then asleep; never asleep away from home; respawn; the shared path code (Chaser tests keep
passing). Gen: home distance rules; caps; property floors 28, 50, 70.

**Risks.** It overlaps the Chaser. Keep the identity: it is the one you can **sneak past** (waiting is silent) and
the one that **forgets**.

**Open questions.** Wake radius 4 (steps vs line of sight), noise only on moves, awake length 12, return-home
behaviour, whether a sleeping Sleeper blocks tiles like a Bloodstone (proposed: yes).

**M16 built, numbers confirmed with the user:** wake radius 4 walking steps (walls count), noise is moving only (waiting is
silent), awake 12 turns then home, home just off the route (not 5 steps away, so a straight dash can wake one; the fairness
script will measure that). Details: "the player moved" is read from the trail (`playerMoved` in `core/pathing.ts`: a wait
repeats the last tile, the first turn after a respawn compares with the start tile). It stirs for one enemy turn, then the
first hunting step comes on the next. `Behavior.dormant` says when a `remembered` type may stay drawn out of sight (only
while asleep), `tone` gained `warn`, and an awake Sleeper out of sight clears `enemy.seen` so it is announced again
when it comes back into view. Sleeping Sleepers are walls to the Chaser and to each other (`blockersFor`). Caps: 1 per
floor, 2 from 65. `GENERATOR_VERSION` 11; enemy snapshot for floor 29 added. Not yet seen on a device.

### 4.5 Blinker (M17, floor 30, class G3)

**Concept.** A roaming Bloodstone: it sits on one tile for a while, then jumps, announcing where it will land.

**Rules.**

- Every 8 enemy phases it jumps to a new tile. The destination is chosen 2 phases earlier (phase 5 of 8) and shown
  as a **warn** cell (`?`), so the player has two moves to react.
- Destination: uniformly (enemy stream) among walkable tiles within walking distance 6 of its home, excluding the
  exit, tiles within 3 steps of the start, tiles holding an enemy, and the tile it is on.
- Hurts only the tile it stands on, like a Bloodstone, and blocks it. If the player stands on the destination when it
  lands, that is a contact (a life); the warning exists so that does not happen.
- Hidden out of sight (`remembered: false`). `reset`: home tile, phase 0.

**Data model.** `memory`: `hx, hy`, `k` (phase), `dx, dy` (chosen destination, `-1` none). Home-leash tiles are
cached in `enemy.field`.

**Placement.** `point`: off the shortest route, 8+ steps from the start; home area must offer at least 6 walkable tiles
within the leash (else try another tile). Max 2 per floor.

**Fairness.** G3 by telegraph: it can land on the route and block a corridor for up to 8 phases, but that costs a
wait, never a life (the player can always step back or wait; the landing tile is shown two moves in advance).
The only life-losing case is ignoring the warning, and held keys are stopped by `enemyAlerted`.

**Rendering.** `k` (alt `j`) in `enemyMobile`; destination `?` in `enemyWarn`.

**Generator and files.** Def `blinker`, behaviour `blink`, `GENERATOR_VERSION` 12.

**Tests.** Core: the destination is announced exactly two phases before the jump and the jump matches it; never lands
on excluded tiles; reproducible after a respawn; contact on a occupied landing tile. Gen: placement and caps.

**Risks.** Jump-in-front-of-you blocks a corridor: acceptable (a wait), but watch the fairness script for floors where
the exit corridor is the only way and a Blinker camps there.

**Open questions.** Interval 8, warning 2 phases, leash 6, whether it may land on the route (proposed yes).

**M17 built, numbers confirmed with the user:** jump every 8 turns, landing announced 2 turns ahead, leash 6 walking steps,
may land on the route. Details: the landing is chosen on turn 6 of 8 (shown after turns 6 and 7, so you have two moves) and the
jump happens on turn 8 of the cycle; the start buffer is Manhattan 3. Candidates are every tile whose home-field distance is within
the leash, scanned in index order, picked with the attempt-seeded stream. New def field `leash { radius, minTiles }` used by the
`point` placer (the home area needs 6+ walkable tiles to jump to), `homeField` in `core/pathing.ts` (shared with the Wanderer),
guarantee `construction` (the `point` validator now checks "home off the route" for every type that is not a `footprint` one).
`GENERATOR_VERSION` 12; enemy snapshot for floor 31 added. Not yet seen on a device.

### 4.6 Bouncer (M18, floor 32, classes G2 + G5)

**Concept.** A springy gate. It is the only enemy that may stand **on** the route, because it opens. Touching it
costs time (you are bounced back along your own footsteps), never a life.

**Rules.**

- A fixed tile with an 8-phase cycle: closed on phases 0-4 (glyph `Y`, solid), **closing next phase** on phase 7 (`y`),
  open on phases 5-7 (the tile is walkable, drawn as floor with a faint `y` mark on phase 7).
- **Contact** (walking into it while closed, or being on its tile when it closes): the player is **shoved back**
  `SHOVE_TILES = 4` tiles along the trail (3.5); `shoved` fires; no life lost; floor steps are not refunded.
- `reset`: phase 0.

**Data model.** `memory`: `k` (phase). `cells` = `[tile]` while closed, `[]` while open. Uses `contact: 'shove'`.

**Placement.** `gate`: a corridor tile (exactly two walkable neighbours, opposite each other) on the shortest route,
at least 8 steps from the start and 5 from the exit, not adjacent to another gate. Max 2 per floor.

**Fairness.** G2 + G5. Because the player may wait, the proof is trivial but still run (`hazard(spawn)`:
period 8, closed phases 0-4). A closed gate costs waiting; touching it costs a shove, so there is no way to lose
the floor. A shove into another hazard is the one hole: `shovePlayer` refuses to land on a tile that currently
hurts (it walks the destination forward along the trail until it finds a safe one).

**Rendering.** `Y` closed in `enemy` colour, `y` closing in `enemyWarn`; colorblind `V`. Message "Bounced back!".

**Generator and files.** Def `bouncer` (`contact: 'shove'`), behaviour `gate`, `gate` placer, trail (3.5, introduced
here), `GENERATOR_VERSION` 13.

**Tests.** Core: the open and closed phases; shove distance; shove at the start of a floor (trail shorter than 4);
shove never lands on a hurting tile; steps not refunded; no life lost; reset. Gen: exactly on a corridor route tile;
proof; property floors 32, 50, 80.

**Risks.** Shove loops (bounce, walk back, bounce): the 3-phase open window and the visible countdown prevent it;
fairness script reports the average number of bounces for a careless dash.

**Open questions.** Shove of 4 tiles, closed 5 / open 3, whether the trail should refund steps.

**M18 built, numbers confirmed with the user:** closed 5 / open 3 of 8, shove 4 tiles, no step refund, up to 2 per floor, on the
route. Details: it was added through the normal weighted draw, but its `gate` placer ignores the (off-route) tile the loop
offers and picks a corridor tile of the route itself, so cap, budget and spotlight all apply; corridor means exactly two
walkable neighbours opposite each other; spacing is Manhattan 3. The enemy entity does not block movement (its `cells` say
whether it hurts, so an open gate can be walked through); a bump into a shut gate takes no enemy turn, like a bump into any
enemy. A shut gate is a wall to the Chaser and the Sleeper (`blockersFor`). The route proof treats a shut gate as a hazard,
so a generated floor never needs a shove to be solved. `damage` is 0. `GENERATOR_VERSION` 13; enemy snapshot for floor 33
added. Not yet seen on a device.

### 4.7 Shade (M19, floor 40, class G5)

**Concept.** A slow drifter whose touch does not hurt your lives but your eyes: your sight radius collapses. The
fog of war is this game's core mechanic, so this is the most thematic non-lethal threat.

**Rules.**

- Home tile; notices the player within walking distance 6 (line of sight not required: it feels you); then drifts
  toward them at half speed (every second phase) via `stepToward`; gives up after 10 phases without the player
  within 6 and drifts home.
- **Contact** (`contact: 'blind'`): `state.blindTurns = 25`; the Shade is consumed for this attempt (it vanishes);
  `blinded` fires; message "Darkness falls". While `blindTurns > 0` the effective sight radius is
  `min(sightRadius, 3)`; the explored map is untouched. `blindTurns` decrements each turn that takes time and clears
  on respawn.
- `reset`: the Shade returns at its home tile (a respawn gives it back).

**Data model.** `memory`: `hx, hy`, `mode` (idle, drift, return), `lost`, `t` (half-speed counter), `gone`. State:
`blindTurns`. `updateVisibility` and `computeFov` callers use `effectiveSight(state)`.

**Placement.** `point`, 10+ steps from the start, max 2 per floor.

**Fairness.** G5: nothing is lost but visibility and tempo. A guard prevents stacking: a second Shade touch while
blind refreshes the timer but never lowers the radius further.

**Rendering and UI.** Glyph `u` (alt `v`) in a new `theme.shade` colour (dark violet, readable on all three
themes). While blind: a dim vignette (fillRect with the background colour at 35% around the view) and `DARK n` in
the stats row. i18n: `darknessFalls`, `darkness` (HUD).

**Generator and files.** Def `shade` (`contact: 'blind'`), behaviour `drift`, effect plumbing in `contact.ts`,
`GENERATOR_VERSION` 14.

**Tests.** Core: radius clamps and restores; timer counts only turns that take time; clears on respawn; the Shade is
consumed once and returns after a respawn; half speed. UI: the HUD text and message. Gen: placement and caps.

**Risks.** Blindness plus another threat is brutal: the budget (section 5) caps Shades at 2 and the spotlight keeps
them rare on floors that also have hunters.

**Open questions.** Radius 3, duration 25, vignette vs plain text, whether the blind effect also hides remembered
enemies (proposed: no).

**M19 built, numbers confirmed with the user:** notice 6 walking steps (no line of sight), half speed, radius 3 for 25 turns,
the Shade vanishes until you respawn. Details: the blind effect itself (`BLIND_TURNS`, `BLIND_SIGHT`, `effectiveSight`,
`contact.ts`) was built in M12; M19 added the `drift` behaviour, the def (`damage` 0, guarantee `construction`, cap 2, home
10+ steps), tone `shade` (the `theme.shade` colour), the HUD cue `DARK n` (right end of the hearts row, i18n `hudDark`) and a
35% vignette over the map while blind. A consumed Shade also stops blocking movement (`blocksMovement` false until
`reset`). It announces itself (`enemyAlerted`) when it starts drifting while in view. `GENERATOR_VERSION` 14; enemy
snapshot for floor 41 added. Not yet seen on a device.

### 4.8 Sweeper (M20, floor 44, class G2)

**Concept.** A rotating arm: the clock-hand cousin of the Spear. The next position is always shown, so it is a
rhythm puzzle at a junction or in a room.

**Rules.**

- A pivot (solid, always hurts when touched, remembered) with one arm of length 2-4 that turns clockwise one
  quarter every enemy phase: N, E, S, W, N, ... Period 4. An arm is cut at the first wall; if a wall is adjacent in
  the arm's direction that phase is a "free" phase.
- Arm tiles hurt (after the enemy phase) and show `=` (horizontal) or `I` (vertical); the **next** phase's arm tiles
  are `warn` cells.
- Initial direction = toward the `W` marker in ASCII; `reset` restores it.

**Data model.** Segment-style spawn: `pos` = pivot, `end` = arm tip at the initial direction (`w`/`W`).
`memory`: `ax, ay, d0, len, k`; `solid = [pivot]` (3.3 / 4.3 risk note); `cells` = arm tiles; `warn` = next arm.

**Placement.** `pivot`: off the shortest route; at least two of the four directions have 2+ free tiles (a junction
or room tile); arm length = min(chosen 2-4, free run in the initial direction); the arm may cross the route (proof).
Max 1 per floor, 2 from 70.

**Fairness.** G2 via the generalised proof (`period 4`, `hurtAt(k)` = pivot arm at direction `(d0 + k) mod 4`).
The oracle test covers wall truncation.

**Rendering.** Pivot `X` (alt `%`) in `enemy`; arm `=`/`I` in `enemyHunting`; warn `:` in `enemyWarn`.

**Generator and files.** Def `sweeper`, behaviour `sweep`, `pivot` placer, hazard provider, `w`/`W` pairing,
`GENERATOR_VERSION` 15.

**Tests.** Core: rotation order; wall truncation; contact with the pivot; reset; warn shows the next arm. Gen: oracle
test; a crossing arm is accepted only if the proof passes; property floors 44, 60, 80.

**Risks.** Finding spots: corridors are 1-wide, so pivots will mostly be junctions. If too few qualify, allow pivots
in dead-end stubs of length 2 (arm covers the stub). Measure the share of floors that get one.

**Open questions.** Arm length 2-4, clockwise only, a two-armed variant from floor 80, whether the pivot may be a room
tile on floors 1-10 (irrelevant before floor 44).

**M20 built, numbers confirmed with the user:** a quarter turn every turn, arm 2-4, always clockwise, 1 per floor and 2 from 70,
single arm only (no two-armed variant). Details: `EnemyDef.hazard` now takes the map (`hazard(spawn, map)`, since walls cut the
arms) and `createEnemy` / `Behavior.init` take the floor. New def field `reach(spawn, map)` and `spawnReach`: every tile a
sweeper can ever hurt (the pivot and the four arms); placement (`taken`), validation (walkable, 6+ from the start, no sharing)
and the pickup/decoy `avoid` sets use it instead of `spawnCells`. The `pivot` placer needs every tile of every arm to be free and
far from the start, at least two directions with room for the arm, the hazard proof, and a pivot that seals nothing off; with
those rules about 80% of floors 44-46 and a third of later floors get one. The arm is `cells` and the next arm is `warn`; the pivot
is `solid` and `body`. `GENERATOR_VERSION` 15; enemy snapshot for floor 45 added. Not yet seen on a device.

### 4.9 Pendulum pair (M21, floor 48, class G2)

**Concept.** Patrollers that finally **cross the route**. Today patrollers never touch the shortest route; Pendulums
are the upgrade: lanes cross it at a junction, in pairs, with the timing proven solvable.

**Rules.**

- Same movement as a Patroller (`patrol` behaviour, one tile per turn, bounces, 3-7 tiles), but a separate type so
  its unlock floor, caps and colour are independent. Glyph `&`, map chars `q`/`Q` (start and far end).
- **Pair:** the generator places two Pendulums whose segments cross the route at tiles 2-8 route-steps apart. Their
  start ends (which of `q`/`Q` is the start) are chosen so that the two gaps do not coincide.
- Hurts the tile it stands on. `reset`: start end.

**Data model.** Exactly the Patroller's (`ax, ay, dx, dy, len, i, dir`), no new fields.

**Placement.** `crossing`: a segment that is perpendicular to the route and shares exactly one tile with it; the route
tile is not the segment's end tile; max 1 pair (2 enemies) per floor, 2 pairs from floor 70; off the start and exit
buffers.

**Fairness.** G2: `hazard(spawn)` = the patrol tip as a function of phase (period `2 (len - 1)`; only lengths with
periods in `{4, 6, 8, 10, 12}` are drawn: 3, 4, 5, 6, 7). The pair is validated **together** (both hazards in one
proof). Single lanes along the route are rejected outright.

**Rendering.** As a Patroller; colour `enemyMobile`; same alt `$`.

**Generator and files.** Def `pendulum` (behaviour `patrol`), `crossing` placer, hazard provider, `q`/`Q` pairing,
`GENERATOR_VERSION` 16.

**Tests.** Gen: the crossing geometry; pair proof; rejection of a lane along the route; oracle test. Core: the
Patroller tests are reused with the new def.

**Risks.** Few valid crossings in small mazes: allow single Pendulums when no pair fits. Late floors may look like
traffic: the cap keeps it at 2 pairs.

**Open questions.** Pair spacing, whether pairs are the default or singles, unlock floor 48.

**M21 built, numbers confirmed with the user:** pair, else a single (never two singles on one floor); the two route tiles are
2-8 route steps apart; the start ends are random and the hazard proof decides (no deliberate offset); lanes of 4-7 tiles (a 3-tile
lane crossed in its middle is on the crossing every other turn and could never be passed); the Patroller's look and colour, cost 2
each; max 1 pair per floor, 2 pairs from floor 70 (`maxPerFloor` 2, 4). Deviations from the text above, found by measuring:
a lane that crosses straight through the route needs a four-way junction, and only about 1 floor in 2 has one on the route (almost
none from floor 100), so the route tile **may also be a lane's end** (a lane running out of a T junction); crossing lanes are preferred
whenever one fits. Pairs then appear on almost every floor from 48 on (about 98% at floor 48, about 85% at floor 60). The `crossing`
placer returns both lanes at once (`Placer.place` may now return an array, which the drawing loop unpacks) and proves them together.
New behaviour `swing` = `patrol` plus a `reset` to the first end: the proof assumes every timed hazard restarts at phase 0 when
you respawn, which the plain Patroller (a `footprint` type) never needed. Validation: 4-7 tiles, straight, exactly one route tile.
`GENERATOR_VERSION` 16; enemy snapshots for floors 49 and 60 added. Not yet seen on a device.

### 4.10 Lurker (M22, floor 52, class G3)

**Concept.** A hidden trap in a side branch right beside the route. You learn it exists the moment you step next to
it, and it only punishes players who stop.

**Rules (the `ambush` behaviour shared with the Mimic).**

- Hidden while dormant: not drawn and not remembered, but solid. Located on a branch tile `N` with exactly one
  route neighbour `R`.
- **Telegraph:** after a player move that ends on a neighbour of `N`, the Lurker shows itself (`?` on its tile, then
  `L`) and its neighbours become `warn` cells; `enemyAlerted` fires.
- **Strike:** next enemy phase its neighbours hurt (`cells` = the walkable neighbours of `N`). A player who moved off
  `R` (any move that ends outside the neighbour set) is safe; one who waited or stepped sideways within the set loses
  a life.
- Afterwards it stays revealed (dim `L`, remembered) and re-arms after 3 phases. `reset`: hidden and armed.

**Data model.** `memory`: `st` (0 dormant, 1 telegraph, 2 strike, 3 cooling), `cool`, `hidden` = 1, `reveal` = 1.
`solid = [N]`.

**Placement.** `niche`: `N` off the route, 6+ steps from the start, with **exactly one** route tile `R` among its
walkable neighbours, and neither route tile before nor after `R` adjacent to `N`. Max 2 per floor.

**Fairness.** G3 by construction, and it is checkable: the dash visits `R` once and leaves it on the next move, so the
strike set (which contains `R` but no other route tile) is empty when it fires. A unit test states exactly this
argument for a generated floor.

**Rendering.** Dormant: nothing. Telegraph: `?` in `enemyWarn` over `N`, neighbours `:`. Revealed: `L` (alt `K`),
dim when out of sight.

**Generator and files.** Def `lurker` (behaviour `ambush` with `hidden: 1`), `niche` placer, `GENERATOR_VERSION` 17.

**Tests.** Core: invisible until the trigger; telegraph then strike; a mover is safe, a waiter is hit; re-arm;
walking into the hidden tile is a contact. Gen: the single-route-neighbour rule; the dash argument; property floors
52, 70, 90.

**Risks.** An invisible solid tile that can be bumped is nasty, but you can only reach `N` through `R`, and arriving
on `R` reveals it. Verify with a test that no path reaches `N` without passing a neighbour of `N` first.

**Open questions.** Strike radius (neighbours only), re-arm 3, whether it should lunge into `R` (proposed: no).

**M22 built, numbers confirmed with the user:** floor 52, max 2 per floor, cost 2, weighted draw; it stays drawn (dim) once
revealed; the route proof forbids waiting beside it. Deviations, found by measuring: a one-tile dead end beside the route (the
choice the user made) almost never exists, because maze dead ends are cells joined by a passage tile (about 1 floor in 6 at floor 52,
none by floor 100), so the Lurker stands on the **first tile of a small dead end** instead: exactly one side of the tile opens out
(and it is a route tile), every other side is a closed pocket of at most 8 tiles (`nicheSides` in `core/segment.ts`). The Lurker is a
`body` (`fixedTiles`) and its `reach` is the tile plus the pocket, so nothing else is placed behind it and pickups never end up
unreachable. Behaviour `lurk` shares the Mimic's strike (`watchNeighbours`); it reveals and telegraphs on the same turn you arrive
beside it, and after a respawn it stays revealed (hiding it again would only punish a player who has already learned it). New
`Behavior.hidden` (not drawn, no `enemySighted`), new `EnemyDef.noStop` (tiles you must not stand still on; the proof in
`gen/hazard-timing.ts` skips "wait" there), new `niche` placer. With these rules about 98% of floors 52 get two (the spotlight), 50-60%
of later floors get two and most of the rest one. `GENERATOR_VERSION` 17; enemy snapshot for floor 53 added. Not yet seen on a device.

### 4.11 Shadow (M23, floor 58, class G3)

**Concept.** Your own trail, 20 turns late. It cannot be outrun because it never catches you; it punishes waiting,
dead ends and backtracking.

**Rules.**

- Appears on a floor as a flag, not a tile: `FloorMap.shadowLag = 20` (ASCII directive `;shadow 20`).
- It exists only once the trail is longer than the lag. From then on, each enemy phase its position is
  `trail[len - 1 - 20]`: exactly where the player was 20 turns ago (waits repeat a tile, so waiting lets it catch up).
- Contact is the usual rule: it moves onto the player (they waited about 20 turns or backtracked into it), or the
  player walks into its tile.
- Hidden out of sight; `enemySighted` whenever it returns to view; after a respawn the trail is cleared and it
  starts again (absent until the trail passes 20).

**Data model.** No memory beyond `lag`. State: `trail` (3.5). Raw time-lag trail (not loop-erased).

**Placement.** `start`: at most one per floor, from floor 58. It adds no tile, so the placers do not run.

**Fairness.** G3, provably: a player who moves every turn along any path has `trail.length` growing by 1 per turn and
the shadow index growing by 1 per turn, so the gap is a constant 20 turns; a straight dash is always safe, and the
unit test states it. Dead ends cost life only if the excursion is longer than 10 tiles deep (you return after 20
turns and meet it coming in); the fairness script reports how often a careful explorer is hit.

**Rendering.** `~` (alt `^`) in a violet-grey `shade`-family colour or `enemyMobile`. Visible only when lit.

**Generator and files.** Def `shadow` (no `mapChar`; the directive replaces it), `start` placer sets
`map.shadowLag`, `parseMap`/`serializeMap` directives, `GENERATOR_VERSION` 18.

**Tests.** Core: absent before the lag, then exactly 20 turns behind; waiting 20 turns causes contact; backtracking
into it causes contact; trail cleared and shadow absent after a respawn; the dash invariant (property over random
walks that never wait). Map: directive round trip.

**Risks.** Long dead ends in big mazes: lag 20 is a proposal; a size-scaled lag (14 to 28) is the alternative and the
fairness script decides. Optional variant: **loop-erased trail** (backtracking removes your own excursions), softer.

**Open questions.** Lag, raw vs loop-erased, whether it starts only after the first turn near the exit, colour.

**M23 built, numbers confirmed with the user, with a changed contact rule:** lag 20, about half the floors from 58 (`SHADOW_CHANCE`
0.5, its own rng stream, decided last), never more than one. The plan's raw lethal trail was **dropped after measuring it**: a
depth-first explorer on floors 58-100 was hit 25-45 times per floor at lag 20 and still 4-10 times at lag 60, because every wrong turn
into a dead end ends in a head-on meeting in a 1-wide corridor. The user chose the *waiter's* Shadow instead: it is intangible to a
player who moves (`Behavior.passable`, `enemyAt(state, p, moving)`; it does not block movement) and only costs a life when it arrives
on a tile where the player stood still that turn (21 turns waiting in one place), so backtracking and dead ends are never fatal.
Fairness is checked per floor: `routeWalk` (`gen/hazard-timing.ts`) returns a fewest-turns way through the timed enemies and
`shadowCatches` replays it; a floor whose way would stand still where the Shadow arrives gets no Shadow (`validateFloor` re-checks the
`;shadow` directive: floor 58+, lag 1-60). `placeFloorEnemies` adds the enemy at the start tile from the directive (no `mapChar`,
placement `flag`, `Placer` that refuses). Behaviour `trail` reads `state.trail`. `GENERATOR_VERSION` 18; the enemy snapshots now list
directives. Not yet seen on a device.

### 4.12 Ghost (M24, floor 65, class G3)

**Concept.** It ignores the maze. It feels you from a distance and drifts straight at you through the rock at half
speed.

**Rules.**

- Home tile on a floor tile. **Notices** the player at Euclidean distance 7 or less (no line of sight needed) and
  then hunts for up to 12 phases after the player leaves that range; after that it drifts home in a straight line.
- Moves every second phase, one tile, along the axis with the larger distance (ties: x first), **through walls and
  Bloodstones**, staying inside the map.
- Hurts the tile it occupies (which may be rock; the player cannot enter rock, so contact happens when it reaches
  the player's tile). It is drawn only where the tile is lit; rock inside the mass is never lit, so it surfaces
  naturally when it nears a corridor.
- **Alert:** the moment it starts hunting, `enemyAlerted` fires even though it may be unseen, with a message
  ("A chill runs down your spine") so the player is never ambushed silently.
- `reset`: home, idle.

**Data model.** `memory`: `hx, hy`, `mode` (idle, hunt, return), `lost`, `t`. No distance fields.

**Placement.** `point` with extra rules: Euclidean distance from every route tile of at least 8, and 12+ steps from the
start. Max 1 per floor, 2 from floor 90.

**Fairness.** G3: its notice radius (7) is smaller than its distance to the route (8+), so a route dash never wakes
it; once awake it is half your speed, so a moving player cannot be reached. It threatens only detours and waiting.
A unit test checks the radius/placement argument for generated floors.

**Rendering.** `g` (alt `G`) in `enemyMobile`, `enemyHunting` while hunting; message tone `'warning'`.

**Generator and files.** Def `ghost`, behaviour `haunt`, `GENERATOR_VERSION` 19.

**Tests.** Core: straight-line movement through walls, half speed, notice radius without line of sight, give-up and
return, the alert fires while unseen, reset. Gen: the route-distance rule; property floors 65, 80, 100.

**Risks.** Euclidean distance through walls looks odd next to walking distance used elsewhere; the message and the
Bestiary explain it. If notice radius 7 never triggers on real routes it will be too easy: tune from the fairness
script.

**Open questions.** Speed, notice radius, route buffer 8, whether it avoids the start area, wall-drawing look.

**M24 built, numbers confirmed with the user (all as proposed):** notices at straight-line 7, home 8+ from every route tile
(`EnemyDef.routeBuffer`, checked by the `point` placer and its validator) and 12+ steps from the start, half speed, gives up 12 turns
after you leave range, floor 65, max 1 (2 from 90), cost 3. Behaviour `haunt`; `enemyAlerted` always fires on noticing, and
`GameScreen` shows "A chill runs down your spine" when the alerted enemy is a ghost. It hunts toward where you are even outside the
range until the 12 turns pass, so a player who stands still while it closes in is met again; a moving player (twice its speed) is not.
About 50% of floors 80 get one (most of 65-66). `GENERATOR_VERSION` 19; enemy snapshot for floor 66 added. Not yet seen on a device.

### 4.13 Breeder (M25, floor 72, class G1)

**Concept.** A mother that fills the level with offspring, creating a clock: the longer you dawdle the more the
side branches are closed.

**Rules.**

- Mother: static, solid, remembered, glyph `B`. Every 12 enemy phases she spawns one **offspring** on the nearest free
  walkable tile (walking distance 1-6 from the mother) that is **not on the shortest route**, not the start or exit,
  not within 3 steps of the start, and not occupied. Maximum 5 offspring per mother.
- Offspring: static Bloodstone-like blobs (`b`, hurt when walked into, remembered once seen). They never move.
- Offspring appear while you play: `enemySpawned` plus `enemySighted` when one appears in view (held keys stop).
- `reset`: offspring are removed and the 12-phase timer restarts.

**Data model.** `memory`: `hx, hy`, `k` (timer), `kids` (count), children carry `memory.child = 1`, `memory.mother = id`.
Uses `spawnEnemy` / `removeChildren` (3.10). Mothers keep `solid = [pos]`.

**Placement.** `point`: off the route, 12+ steps from the start, with at least 6 free tiles within walking distance 6
(else try another tile). Max 1 per floor, 2 from floor 90.

**Fairness.** G1 **by construction**: offspring are never spawned on route tiles, so the shortest route stays free
however long you stay. An assertion in `spawnChild` re-checks exit reachability with every static cell blocked.
Pickups and side branches can be sealed: acceptable, both are optional.

**Rendering.** Mother `B` in `enemy`, offspring `b` in `enemyMobile`; colorblind `8` / `o`.

**Generator and files.** Def `breeder`, behaviour `breed`, `spawnEnemy` plumbing (M12 already added it), caps,
`GENERATOR_VERSION` 20.

**Tests.** Core: timer and cap; never on the route, start or exit; spawn tile selection is deterministic; reset
removes offspring; sighting when a child appears in view. Gen: placement and free-space rule; a stress test that
runs 500 phases and asserts the exit stays reachable.

**Risks.** Entity count: up to 2 mothers x 5 offspring = 12 extra entities, within the 24 cap logic only if the
cap counts mothers (offspring are runtime). Tests also guard the render loop cost. Pickups sealed by a child feels
bad: consider keeping offspring 2+ steps away from the life pickup tile (cheap rule).

**Open questions.** Interval 12, maximum 5, whether offspring may move after 30 phases (no), pickup protection.

**M25 built, numbers confirmed with the user (all as proposed):** a young one every 12 turns, at most 5, within 1-6 walking steps
(the nearest ring with a legal tile first, ties drawn from the behaviour stream), floor 72, max 1 (2 from 90), cost 3. One rule added
to the plan after discussing it: a young one must leave the exit reachable from the tile **the player stands on now** (not just from
the start), so it can close a side branch but never seal the player in; they also keep 2 steps from a life pickup, 3 from the start
and off every tile an enemy can occupy. Young ones are the `brood` type (`placement: 'flag'`, no map character, never in `spawns`,
spawned with `spawnEnemy`, removed by `removeChildren` on a respawn). The mother is a `footprint` point enemy that needs 6 tiles
within 6 steps (`leash`). Behaviour `breed`. Most floors from 72 on get a mother. `GENERATOR_VERSION` 20; enemy snapshot for floor
73 added. Not yet seen on a device.

**M26 built (balance pass, fairness script, Bestiary), numbers confirmed with the user.**
*Fairness script* (`gen/fairness.ts`, `gen/fairness-report.ts`, `npm run fairness`): the dasher, a *planner* (the proved walk
`routeWalk`, which replaced the plan's "careful" player) and a cautious fog-of-war *explorer*; they run on the real core, so they
also check the proofs. First measurement found no broken promise (the planner is never hit by a footprint or timing type, so the
route proofs hold), but three real findings: (1) hunters (Wanderer, Sleeper, Chaser, Blinker) caught the planner on 16-47% of
floors; (2) the Pendulum pair, on about 90% of floors from 48, was the top killer of the explorer; (3) floors were crowded: 4-5
hunter types on late floors. Fixes: the **safe-walk rule** (`gen/safe-walk.ts`: the planner must reach the exit without losing a
life on its first walk, else the hunter that catches it is dropped; the chosen "safe dash" placement check, generalised to every
`reachable` type; the Blinker was reclassified `reachable`, since its fairness is the announcement, not the route); the
**hunter cap** (at most 3 different hunter types per floor, `EnemyDef.hunter`, Shadow not counted since it can no longer take a
life); and the **Pendulum weight 0.5** (about 60-80% of floors from 60 instead of 90%). Result: planner 0% everywhere, explorer
0.0-0.5 lives per floor (target 0.6). The explorer needed patience rules of its own (it keeps a goal, waits for visible movers
and gates), which is why its numbers are an upper bound for a careful human, not a forecast. Known caveats: the newest hunters
(Ghost, Shadow) are rare on late floors because the cap lets older types fill the slots; the scripted players cannot read a
Pendulum rhythm, a human can; nothing from M12-M26 has been played on a phone. Test cost: generating a floor now includes the
safe-walk simulation (about 2-70 ms), so the big property test uses 150 seeds instead of 500.
*Bestiary:* title screen, only the types met, entries in English and Italian, `records.seenTypes`; `GENERATOR_VERSION` 21.

---

## 5. Difficulty integration

### 5.1 Unlock schedule

One new idea at a time, spaced so each gets a few floors of spotlight.

| Floor | New type    | Floor | New type    |
| ----- | ----------- | ----- | ----------- |
| 2     | Bloodstone  | 40    | Shade       |
| 8     | Patroller   | 44    | Sweeper     |
| 12    | Wanderer    | 48    | Pendulum    |
| 16    | Mimic       | 52    | Lurker      |
| 20    | Spear       | 58    | Shadow      |
| 24    | Sentinel    | 65    | Ghost       |
| 28    | Sleeper     | 72    | Breeder     |
| 30    | Blinker     |       |             |
| 32    | Bouncer     |       |             |
| 35    | Chaser      |       |             |

### 5.2 Caps per floor

Wanderer 3; Mimic 1 (0 on pickup floors); Sentinel 2 (4 from 60); Sleeper 1 (2 from 65); Blinker 2; Bouncer 2;
Chaser 1 (3 from 60, existing); Shade 2; Sweeper 1 (2 from 70); Pendulum 1 pair (2 from 70); Lurker 2; Shadow 1;
Ghost 1 (2 from 90); Breeder 1 (2 from 90).

### 5.3 Threat budget

Today a floor gets `enemyCountForFloor(floor)` enemies (0, then 1 growing to 24) and types are drawn by weight. With
seventeen types that would put a Ghost and a Chaser and a Breeder on the same floor too easily.

- Each type has a `cost`: Bloodstone 1, Wanderer 1, Patroller 1, Bouncer 1, Shade 1, Mimic 0 (a decoy, capped
  separately), Spear 2, Sentinel 2, Sweeper 2, Pendulum 2, Blinker 2, Lurker 2, Sleeper 3, Chaser 3, Ghost 3, Shadow
  3, Breeder 3.
- `budgetForFloor(f) = round(1.6 x enemyCountForFloor(f))`; placement keeps drawing until the entity count **or** the
  budget is spent, so heavy types crowd out count.
- **Spotlight:** a type unlocked within the last 3 floors has its weight multiplied by 4, so a new threat is actually
  met when it is introduced.
- **Recent-mix rule:** at most 3 distinct "hunter-class" types (Chaser, Sleeper, Ghost, Shadow, Shade, Wanderer) on
  one floor.
- All of this lives in `gen/difficulty.ts` (one file for all tuning, as before) and has table-driven tests: the cost
  of any generated floor never exceeds its budget by more than one entity.

### 5.4 Sample floor mixes (illustrative)

Floor 30: 8 enemies, mostly Bloodstones and Patrollers, 1 Wanderer, 1 Sentinel, the Sleeper from 28 spotlighted.
Floor 60: 15 enemies, 2 Sentinels, 1 Sleeper, 1 Chaser, 1 Shade, 1 Sweeper, 1 Pendulum pair, a Lurker, the Shadow flag.
Floor 90: 22 enemies, budget about 35, up to two each of the heavy types.

---

## 6. Fairness measurement

`scripts/fairness.ts` (`npm run fairness -- --floors 28,40,58,72 --seeds 200`) runs three scripted players through the
**real game core** on generated floors and prints, per floor and per type present:

1. **Dasher:** walks the shortest route, never waits. Reports the share of floors where it loses a life and which
   enemy type hit it. G1/G2/G3 types must show **0%**; G4 types are tuned by this number.
2. **Careful:** the dasher that waits whenever the next tile is a hazard now or after the next enemy phase
   (a greedy one-step lookahead). Reports forced losses (floors where even careful loses).
3. **Explorer:** a depth-first explorer with the fog rule (only sees `sightRadius`), which is the closest thing to a real
   player. Reports deaths per floor and average time, to catch types that are lethal to exploration (Shadow, Ghost,
   Sleeper).

**Targets (initial, revisit after the phone playtests):** dasher loss rate 0% for G1-G3 types, at most 5% per floor
with G4 types before floor 50 and 15% after; explorer deaths per floor at most 0.6 on average; careful forced-loss
rate at most 3%.

The script is also the regression guard for the "safe dash" simulation that was offered for the Chaser: if the
dasher number for the Chaser grows over time, adding that placement check is a one-file change.

---

## 7. Milestones, order and checklists

### 7.1 Order and dependencies

```
M12 foundations ──┬─ M13 Wanderer
                  ├─ M14 Mimic ───────────────┐
                  ├─ M15 Sentinel (hazards,   │
                  │        warn cells, solid) │
                  ├─ M16 Sleeper              ├─ M22 Lurker (reuses ambush)
                  ├─ M17 Blinker (warn cells) │
                  ├─ M18 Bouncer (trail,      │
                  │        shove) ────────────┼─ M23 Shadow (reuses trail)
                  ├─ M19 Shade (effects)      │
                  ├─ M20 Sweeper (hazards)    │
                  ├─ M21 Pendulum (hazards)   │
                  ├─ M24 Ghost                │
                  └─ M25 Breeder (dynamic)    │
M26 balance pass, Bestiary, device playtest ──┘
```

M12 first; M13 and M14 are the cheapest and prove the plumbing. M15 introduces warn cells and the hazard framework,
which M17, M20, M21 reuse. M18 introduces the trail for M23. Types can be built in any order after M12 as long as
their dependency is done; the numbers in section 2 follow the unlock order, which is also a good build order.

### 7.2 Version, saves and compatibility

Each type bumps `GENERATOR_VERSION` (8 to 20 across M13-M25) and refreshes only the enemy snapshots from its unlock
floor upward; terrain snapshots must not change. A saved run simply regenerates its floor with the new generator
(as documented in section 8.4 of the main plan). The only save change is the optional Bestiary list (`records`),
additive. No `SAVE_VERSION` bump anywhere in this plan.

### 7.3 Common checklist for every type (copy into the milestone)

- [ ] Numbers confirmed with the user; decided values written into plan section 15 and the unlock table.
- [ ] `ENEMY_DEFS` entry (all fields, including `cost`, `placement`, `guarantee`, `maxPerFloor`).
- [ ] Behaviour with `init`, `act`, `reset`, `glyph`; no `Math.random`, no clocks.
- [ ] Placement + `validateSpawns` rule; the `hazard` provider and oracle test if G2.
- [ ] ASCII round trip (new character and pairing if any) and the `gen-map` legend.
- [ ] Drawing, theme keys for all three themes, colorblind alternative glyph.
- [ ] Events and i18n keys in `en.ts` and `it.ts`; `GameScreen` handling and a test if input stops or a message shows.
- [ ] Core unit tests, generator property tests (150 seeds, unlock floor and two later floors), enemy snapshots.
- [ ] `GENERATOR_VERSION` bump, `CLAUDE.md` table row, plan section 15 "Built" notes.
- [ ] `npx prettier --check . && npm run typecheck && npm run lint && npm test` green; commit.
- [ ] Fairness script run at the unlock floor; numbers recorded in the milestone notes.

### 7.4 Test time budget

`npm test` is about 55 s today. The generator suites dominate. Keep the total under 90 s: the new property tests use
150 seeds (not 500) on three floors per type, and the shared oracle and unit tests are fast. If it grows, split the
property suites into a `npm run test:gen` target and keep `npm test` for the fast set (documented in `CLAUDE.md`).

### 7.5 Device testing

After M12-M25 land (or in groups of four), rebuild the APK and run the adb routine used for floors 1-10: solve the
floors with `npm run solve`, tap through, and screenshot each new type at its unlock floor. Add a small script
(`scripts/device-play.ts`) that does the seed read, the solve and the taps so this stops being manual. Record the
result in `CLAUDE.md` ("Android" paragraph) as before.

---

## 8. Risks and open points

| Risk                                                                 | Mitigation                                                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Too many hunter types make the late game exhausting                  | Budget, hunter-class limit, spotlight; fairness script targets; playtest before each unlock        |
| Silent threats (Ghost, Lurker, Blinker) feel unfair                  | Always an alert or warning turn; `enemyAlerted`; the Bestiary teaches the tells                    |
| Timed hazards multiply proof cost and false rejections               | Periods restricted to 4-12 (joint cycle divides 120); measure the share of floors that get each type |
| Random behaviours break reproducibility                              | Re-seed per attempt; determinism tests for every random type; replay test of a full attempt        |
| Late floors cannot fit all placers (corridors are 1 wide)            | Placers return null and the loop tries another tile or type; per-type "share of floors that get one" reported |
| UI clutter on small phones (warn cells, vignette, extra HUD text)    | One glyph per cell; the HUD adds at most `DARK n`; check on the phone at 375 px                    |
| Test suite grows past the comfortable limit                          | Seed counts, floor lists and the optional `test:gen` split (7.4)                                    |
| Scope: 13 types is a lot                                             | Strict order, one milestone each, the first two (Wanderer, Mimic) are small; stop or reorder at any point |

### Questions to settle before building (summary)

Per-type questions are at the end of each section. The cross-cutting ones are: the unlock schedule (5.1), whether
the threat budget replaces or only caps the enemy count (5.3), whether to add the Bestiary (3.12), the `solid`
mechanism for bodies that are not part of a timed hazard (4.3), the shove and blind magnitudes (4.6, 4.7), and
whether any G4 type (Wanderer, Sleeper) should get the "safe dash" simulation (section 6) from the start.
