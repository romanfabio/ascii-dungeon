import { ENEMY_DEFS, ENEMY_TYPE_IDS, type EnemyTypeId } from '../core/enemy-defs';
import { enemyAt, markVisibleEnemiesSeen, placeFloorEnemies, spawnEnemy } from '../core/enemies';
import { DIR_VEC, DIRS } from '../core/geometry';
import { isWalkable } from '../core/tiles';
import { type FloorMap } from '../core/floor-map';
import { type GameState } from '../core/game-state';
import { DX, DY, type Point } from '../core/geometry';
import { bfsDistances } from '../core/pathfinding';
import { createRng } from '../core/rng';
import { FINAL_FLOOR, limitsForFloor, paramsForFloor } from '../gen/difficulty';
import { placeEnemies } from '../gen/enemies';
import { analyzeFloor } from '../gen/stats';
import { isInView, tilePixel, type View } from '../render/camera';
import { type GlyphRenderer } from '../render/glyph-renderer';
import { type Layout } from '../render/layout';

/** Debug commands that rebuild the floor: handled by the app. */
export type FloorCommand = { type: 'jumpFloor'; floor: number } | { type: 'newSeed' };

export type DebugCommand = FloorCommand | { type: 'loseLife' } | { type: 'gainLife' };

const PATH_COLOR = '#4dd0e1';

/** Developer aid (dev builds only): reveal the map, show the shortest path, jump between floors. */
export class DebugOverlay {
  enabled = false;
  reveal = true;
  showPath = true;
  private rerolls = 0;
  private reseeds = 0;
  /** The type `G` spawns next to the player; `T` cycles it. */
  private selected = 0;
  private cache: { floor: FloorMap; distFromExit: Int32Array } | null = null;

  /** Returns a command for the app, 'handled' if consumed, or null if the key is not ours. */
  handleKey(code: string, state: GameState): DebugCommand | 'handled' | null {
    if (code === 'F3') {
      this.enabled = !this.enabled;
      return 'handled';
    }
    if (!this.enabled) return null;
    const current = state.floor.floorNumber;
    switch (code) {
      case 'BracketRight':
        return { type: 'jumpFloor', floor: Math.min(FINAL_FLOOR, current + 1) };
      case 'BracketLeft':
        return { type: 'jumpFloor', floor: Math.max(1, current - 1) };
      case 'KeyN':
        return { type: 'newSeed' };
      case 'KeyP':
        this.showPath = !this.showPath;
        return 'handled';
      case 'KeyV':
        this.reveal = !this.reveal;
        return 'handled';
      case 'KeyE':
        this.rerollEnemies(state);
        return 'handled';
      case 'KeyT':
        this.selected = (this.selected + 1) % ENEMY_TYPE_IDS.length;
        return 'handled';
      case 'KeyG':
        this.spawnSelected(state);
        return 'handled';
      case 'KeyR':
        state.enemyRng = createRng(`${state.runSeed}:${current}:behavior:debug${++this.reseeds}`);
        return 'handled';
      case 'KeyL':
        return { type: 'loseLife' };
      case 'KeyH':
        return { type: 'gainLife' };
      default:
        return null;
    }
  }

  /** Places this floor's enemies again with a different random stream (the terrain is untouched). */
  private rerollEnemies(state: GameState): void {
    const { floor } = state;
    const params = paramsForFloor(floor.floorNumber);
    const rng = createRng(`${state.runSeed}:${floor.floorNumber}:enemies:${++this.rerolls}`);
    floor.spawns = placeEnemies(
      floor,
      params.enemyCount,
      params.enemyTypes,
      rng,
      limitsForFloor(params.floor),
    );
    placeFloorEnemies(state);
    markVisibleEnemiesSeen(state);
  }

  private get selectedType(): EnemyTypeId {
    return ENEMY_TYPE_IDS[this.selected] as EnemyTypeId;
  }

  /** Spawns the selected type on a free tile next to the player (a segment type gets 3 tiles). */
  private spawnSelected(state: GameState): void {
    const { floor, player } = state;
    const type = this.selectedType;
    const needsEnd = ENEMY_DEFS[type].endChar !== undefined;
    const free = (x: number, y: number): boolean =>
      x >= 0 &&
      y >= 0 &&
      x < floor.width &&
      y < floor.height &&
      isWalkable(floor.tiles[y * floor.width + x] as number) &&
      !enemyAt(state, { x, y }) &&
      !(x === floor.exit.x && y === floor.exit.y);
    for (const dir of DIRS) {
      const v = DIR_VEC[dir];
      const pos = { x: player.pos.x + v.x, y: player.pos.y + v.y };
      if (!free(pos.x, pos.y)) continue;
      const end = { x: pos.x + 2 * v.x, y: pos.y + 2 * v.y };
      if (needsEnd && !(free(pos.x + v.x, pos.y + v.y) && free(end.x, end.y))) continue;
      spawnEnemy(state, needsEnd ? { type, pos, end } : { type, pos });
      markVisibleEnemiesSeen(state);
      return;
    }
  }

  get revealAll(): boolean {
    return this.enabled && this.reveal;
  }

  /** Shortest route from the player to the exit, excluding both endpoints. */
  private pathToExit(state: GameState): Point[] {
    const { floor, player } = state;
    if (this.cache?.floor !== floor) {
      this.cache = { floor, distFromExit: bfsDistances(floor, floor.exit) };
    }
    const dist = this.cache.distFromExit;
    const path: Point[] = [];
    let { x, y } = player.pos;
    let d = dist[y * floor.width + x] as number;
    while (d > 1) {
      for (let i = 0; i < 4; i++) {
        const nx = x + (DX[i] as number);
        const ny = y + (DY[i] as number);
        if (dist[ny * floor.width + nx] === d - 1) {
          x = nx;
          y = ny;
          break;
        }
      }
      d--;
      path.push({ x, y });
    }
    return path;
  }

  draw(r: GlyphRenderer, state: GameState, layout: Layout, view: View): void {
    if (!this.enabled) return;
    const { cell, glyphPx } = view;

    if (this.showPath) {
      for (const p of this.pathToExit(state)) {
        if (!isInView(view, p.x, p.y)) continue;
        const px = tilePixel(view, p.x, p.y);
        r.drawGlyph('*', px.x, px.y, cell, glyphPx, PATH_COLOR);
      }
    }

    const { floor } = state;
    const params = paramsForFloor(floor.floorNumber);
    const stats = analyzeFloor(floor);
    const lines = [
      'DEBUG  F3 off  [ ] floor  N new seed  P path  V reveal  L lose life  H heal  E enemies  T type  G spawn  R reseed',
      `G spawns: ${this.selectedType}   size ${floor.width}x${floor.height}  ${params.generator}  bias ${params.newestBias.toFixed(2)}  braid ${params.braidFactor.toFixed(2)}`,
      `sight ${params.sightRadius}  exit% ${params.exitPercentile.toFixed(2)}  path ${stats.pathLength}  deadEnds ${stats.deadEnds}  loops ${stats.loops}  enemies ${floor.spawns.length}/${params.enemyCount}`,
    ];
    const fontPx = Math.max(10, Math.round(layout.hudFontPx * 0.7));
    const lineH = Math.round(fontPx * 1.4);
    const pad = Math.round(fontPx * 0.6);
    const widest = Math.max(...lines.map((l) => l.length));
    const w = Math.round(widest * fontPx * 0.6) + pad * 2;
    const h = lines.length * lineH + pad * 2;
    const y0 = r.height - h;
    r.fillRect(0, y0, Math.min(w, r.width), h, 'rgba(0, 0, 0, 0.8)');
    lines.forEach((line, i) => {
      r.drawText(line, pad, y0 + pad + lineH * i + lineH / 2, fontPx, PATH_COLOR);
    });
  }
}
