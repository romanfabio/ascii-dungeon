# Ascii Dungeon

A turn-based ASCII maze crawler. You are `@`, the walls are `#` and the exit is `!`. Descend **100 procedurally
generated floors** through fog of war, with **3 lives** and **17 kinds of enemy**, each with a tell you can learn.
Clear floor 100 to win.

```
#####################
#@....#.....#...#...#
#.###.#.###.#.#.#.#.#
#...#...#...#.#...#.#
###.#####.###.#####.#
#...#&....#.....#...#
#.#.#.#####.###.#.#.#
#.#...#.......#...#!#
#####################
```

- **Turn-based:** nothing moves until you do. Waiting is a move too, and sometimes the right one.
- **Fog of war:** you only see a few tiles around you (10 on the first floor, 4 on the last). Explored tiles stay on the map.
- **Procedural and deterministic:** every floor comes from the run seed and the floor number, so a seed always plays out the
  same way. Floors grow from 21x21 to 61x61 tiles.
- **Fair by construction:** a generator check proves every floor can be finished, and a simulation of a careful player
  keeps hunters from catching a clean walk to the exit. Enemies punish detours, exploring and waiting, not bad luck.
- **Enemies:** Bloodstones, Patrollers, Wanderers, Mimics, Spears, Sentinels, Sleepers, Blinkers, Bouncers, Chasers,
  Shades, Sweepers, Pendulums, Lurkers, Shadows, Ghosts and Breeders. Each one unlocks on its own floor, and the
  in-game **Bestiary** (title screen) records the ones you have met and how to recognise them.
- **Life pickups** (a green `+`) lie on floors 10, 20, ... 90. Not every `+` is one.
- **Works on a phone:** on-screen D-pad, swipe, safe-area aware, portrait layout. Three themes (default, high contrast,
  colour-blind safe), English and Italian.

## Play

Requirements: [Node.js](https://nodejs.org) 22.12 or newer.

```bash
npm install
npm run dev          # open http://localhost:5173
```

Production build of the web version: `npm run build:web` (output in `dist/`, plain static files you can host anywhere).

### Controls

| Action     | Keyboard           | Touch                                         |
| ---------- | ------------------ | --------------------------------------------- |
| Move       | WASD or arrow keys | D-pad, or swipe the map                       |
| Wait       | Space or `.`       | Centre of the D-pad                           |
| Zoom       | `Z`                | `[Z]` in the HUD                              |
| Pause menu | `Esc` or `P`       | `[II]` in the HUD, or the Android back button |

Keys can be rebound in Settings, then Controls. Holding a key repeats the move, and the repeat stops by itself when
something new comes into view.

### Shortcuts for development

- `http://localhost:5173/?seed=ABC123&floor=40` starts straight on that floor and never touches the saved run.
- In a dev build, `F3` opens a debug overlay: change floor, reveal the map, lose or restore a life, spawn any enemy next
  to you. See [CLAUDE.md](CLAUDE.md).

## Android

The Android app is the same web build wrapped with [Capacitor](https://capacitorjs.com).

**Minimum Android version: Android 7.0 (API level 24).** It targets Android 16 (API 36). The game works fully offline and
asks for no permissions.

```bash
npm run build:android    # debug APK: android/app/build/outputs/apk/debug/app-debug.apk
```

Needs Android Studio (for the SDK and a JDK 17 or newer). Release signing and Play Store notes are in
[docs/ANDROID.md](docs/ANDROID.md).

## Development

```bash
npm test                 # unit and property tests (about 3 minutes: they generate thousands of floors)
npm run typecheck
npm run lint
npx prettier --check .
npm run gen -- --seed ABC123 --floor 40    # print a floor as ASCII
npm run solve -- --seed ABC123 --floor 1   # a shortest solution as WASD keys
npm run fairness -- --floors 30,60,100 --seeds 100 --explorer   # scripted players on generated floors
```

The code is TypeScript with Canvas 2D and no game framework. The rules (`src/core`) and the floor generator (`src/gen`)
are pure and deterministic: no DOM, no `Math.random`, no clocks. The architecture, the conventions and how to add an
enemy type are in [CLAUDE.md](CLAUDE.md); the design decisions are in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md)
and [docs/ENEMY_ROSTER_PLAN.md](docs/ENEMY_ROSTER_PLAN.md).

Contributions are welcome. Please open an issue to discuss a new mechanic before building it, keep changes small, add tests
next to the code, and make sure `npx prettier --check . && npm run typecheck && npm run lint && npm test` passes.

## Status

Version 1.0.0. The game is complete (all 100 floors and all enemy types). Hand playtesting has been limited: the later
floors and enemies are covered by automated tests and simulations, so balance feedback is very welcome.

## Licence

[MIT](LICENSE). Third-party components (the JetBrains Mono font under the SIL Open Font License, Capacitor, AndroidX and
the build tools) are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
