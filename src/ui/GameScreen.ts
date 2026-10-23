import { type Screen } from '../app/Screen';
import { type BestiaryTypeId, typesMet } from '../core/bestiary';
import { isEnemy } from '../core/entity';
import { type GameState } from '../core/game-state';
import { type Dir } from '../core/geometry';
import { applyAction } from '../core/turn';
import { gainLife, loseLife } from '../core/lives';
import { type GameEvent } from '../core/events';
import { type DebugOverlay, type FloorCommand } from '../debug/debug-overlay';
import { t } from '../i18n/i18n';
import { type DirectionSink, SwipeDetector } from '../input/swipe';
import { computeView } from '../render/camera';
import { drawFloor } from '../render/draw-floor';
import { type GlyphRenderer } from '../render/glyph-renderer';
import { computeLayout, hudButtons, rectContains, type Layout, type Rect } from '../render/layout';
import { type Theme } from '../render/themes';

export interface FloorSummary {
  floor: number;
  steps: number;
  /** Shortest possible number of steps from start to exit. */
  bestSteps: number;
  timeMs: number;
  totalSteps: number;
  totalTimeMs: number;
  /** Lives left and lives lost so far: carried into the next floor. */
  lives: number;
  deaths: number;
}

/** The run's final numbers, shown on the Game Over screen. */
export interface GameOverSummary {
  floor: number;
  totalSteps: number;
  totalTimeMs: number;
  deaths: number;
}

export interface LifeLostInfo {
  livesLeft: number;
  deaths: number;
}

export interface LifeGainedInfo {
  livesLeft: number;
  /** The floor whose life pickup was just taken. */
  floor: number;
}

export interface GameScreenOptions {
  state: GameState;
  getTheme(): Theme;
  debug: DebugOverlay | null;
  /** Direction sink fed by swipes (the same input manager the keys and D-pad use). */
  input: DirectionSink;
  /** Whether the on-screen D-pad is shown (reserves space for it). */
  dpadWanted(): boolean;
  /** Tells the app where the D-pad area is this frame (device px), or null to hide it. */
  setDpadArea(area: Rect | null): void;
  isZoomedOut(): boolean;
  onToggleZoom(): void;
  requestRender(): void;
  onPause(): void;
  onFloorCleared(summary: FloorSummary): void;
  /** A life was lost (and lives remain): the app releases held keys and autosaves. */
  onLifeLost(info: LifeLostInfo): void;
  /** A life pickup was taken: the app remembers it and autosaves, so quitting cannot undo it. */
  onLifeGained(info: LifeGainedInfo): void;
  /** An enemy or pickup just came into view: the app cancels auto-repeat so the player can look. */
  onSighted(): void;
  /** Enemy types the player has just met (seen, warned by or touched): for the Bestiary. */
  onTypesMet(types: BestiaryTypeId[]): void;
  /** The last life was lost: the app ends the run. */
  onGameOver(summary: GameOverSummary): void;
  onDebugCommand(command: FloorCommand): void;
}

/** Smallest readable cell before the camera starts following the player (CSS pixels). */
const MIN_CELL_TOUCH_CSS_PX = 18;
const MIN_CELL_DESKTOP_CSS_PX = 10;
/** How far a finger must drag to count as a swipe (CSS pixels). */
const SWIPE_THRESHOLD_CSS_PX = 24;
/** How long the red flash and the "Ouch!" notice stay after a life is lost. */
const FLASH_MS = 250;
const MESSAGE_MS = 1500;

/** Playing a floor: turn processing, camera, fog-of-war rendering, touch input and the timer. */
export class GameScreen implements Screen {
  /** Timestamp of the last time accumulation, or null while suspended. */
  private lastTick: number | null = performance.now();
  private shownSeconds = 0;
  private layout: Layout | null = null;
  private readonly swipe: SwipeDetector;
  private hurtAt: number | null = null;
  private message: { text: string; until: number; tone: 'hurt' | 'pickup' | 'warning' } | null =
    null;

  constructor(private readonly opts: GameScreenOptions) {
    this.swipe = new SwipeDetector(opts.input, SWIPE_THRESHOLD_CSS_PX);
  }

  render(r: GlyphRenderer): void {
    const { state, getTheme, debug } = this.opts;
    const { floor } = state;
    const dpad = this.opts.dpadWanted();

    const layout = computeLayout(r.width, r.height, r.dpr, { insets: r.insets, dpad });
    const minCellCss = dpad ? MIN_CELL_TOUCH_CSS_PX : MIN_CELL_DESKTOP_CSS_PX;
    const view = computeView(layout.mapArea, floor.width, floor.height, state.player.pos, {
      minCell: minCellCss * r.dpr,
      zoomOut: this.opts.isZoomedOut(),
    });
    this.layout = layout;
    this.swipe.setThreshold(SWIPE_THRESHOLD_CSS_PX * r.dpr);

    const now = performance.now();
    const hurt = this.hurtAt === null ? 0 : Math.max(0, 1 - (now - this.hurtAt) / FLASH_MS);
    drawFloor(r, state, getTheme(), layout, view, {
      revealAll: debug?.revealAll ?? false,
      hurt,
      message: this.message && now < this.message.until ? this.message.text : undefined,
      messageTone: this.message?.tone,
    });
    if (hurt > 0) this.opts.requestRender(); // keep animating the fade-out
    debug?.draw(r, state, layout, view);
    this.opts.setDpadArea(layout.dpad);
  }

  onMove(dir: Dir): void {
    const events = applyAction(this.opts.state, { type: 'move', dir });
    this.handleEvents(events);
  }

  /** Reacts to what a turn (or a debug command) caused. The first ending event wins. */
  private handleEvents(events: GameEvent[]): void {
    const { state } = this.opts;
    const met = typesMet(state, events);
    if (met.length > 0) this.opts.onTypesMet(met);
    const gained = events.find((e) => e.type === 'lifeGained');
    if (gained) {
      this.message = {
        text: t('lifeGained'),
        until: performance.now() + MESSAGE_MS,
        tone: 'pickup',
      };
      this.opts.onLifeGained({ livesLeft: state.lives, floor: gained.floor });
    } else if (events.some((e) => e.type === 'lifeFull')) {
      this.message = {
        text: t('livesFull'),
        until: performance.now() + MESSAGE_MS,
        tone: 'pickup',
      };
    }
    const alerted = events.find((e) => e.type === 'enemyAlerted');
    if (
      alerted &&
      state.entities.some((e) => e.id === alerted.enemyId && isEnemy(e) && e.type === 'ghost')
    ) {
      this.message = {
        text: t('ghostChill'),
        until: performance.now() + MESSAGE_MS,
        tone: 'warning',
      };
    }
    const revealed = events.find((e) => e.type === 'enemyRevealed');
    if (revealed) {
      this.message = {
        text: t(
          state.entities.some((e) => e.id === revealed.enemyId && isEnemy(e) && e.type === 'lurker')
            ? 'lurkerRevealed'
            : 'mimicRevealed',
        ),
        until: performance.now() + MESSAGE_MS,
        tone: 'warning',
      };
    }
    if (events.some((e) => e.type === 'blinded')) {
      this.message = {
        text: t('darknessFalls'),
        until: performance.now() + MESSAGE_MS,
        tone: 'warning',
      };
    } else if (events.some((e) => e.type === 'shoved')) {
      this.message = {
        text: t('bouncedBack'),
        until: performance.now() + MESSAGE_MS,
        tone: 'warning',
      };
    }
    const lost = events.find((e) => e.type === 'lifeLost');
    if (lost) {
      this.tick(performance.now());
      this.swipe.up(); // a finger still dragging must not keep walking from the start tile
      this.hurtAt = performance.now();
      if (lost.livesLeft > 0) {
        const text =
          lost.livesLeft === 1 ? t('hitLastLife') : t('hitLivesLeft', { lives: lost.livesLeft });
        this.message = { text, until: this.hurtAt + MESSAGE_MS, tone: 'hurt' };
        this.opts.onLifeLost({ livesLeft: lost.livesLeft, deaths: state.stats.deaths });
      }
    }
    if (
      events.some(
        (e) =>
          e.type === 'enemySighted' ||
          e.type === 'enemyAlerted' ||
          e.type === 'enemyRevealed' ||
          e.type === 'pickupSighted' ||
          e.type === 'blinded' ||
          e.type === 'shoved',
      )
    ) {
      this.swipe.up();
      this.opts.onSighted();
    }
    if (events.some((e) => e.type === 'gameOver')) {
      this.opts.onGameOver({
        floor: state.floor.floorNumber,
        totalSteps: state.stats.totalSteps,
        totalTimeMs: state.stats.totalTimeMs,
        deaths: state.stats.deaths,
      });
      return;
    }
    if (events.some((e) => e.type === 'reachedExit')) {
      this.tick(performance.now());
      this.opts.onFloorCleared({
        floor: state.floor.floorNumber,
        steps: state.stats.floorSteps,
        bestSteps: state.floor.optimalPathLength,
        timeMs: state.stats.floorTimeMs,
        totalSteps: state.stats.totalSteps,
        totalTimeMs: state.stats.totalTimeMs,
        lives: state.lives,
        deaths: state.stats.deaths,
      });
      return;
    }
    if (events.length > 0) this.opts.requestRender();
  }

  /** Waiting takes a turn: enemies and spears move, nothing else changes. */
  onWait(): void {
    this.handleEvents(applyAction(this.opts.state, { type: 'wait' }));
    this.opts.requestRender(); // enemies may have moved without any event
  }

  onKey(code: string): boolean {
    if (code === 'Escape' || code === 'KeyP') {
      this.opts.onPause();
      return true;
    }
    if (code === 'KeyZ') {
      this.opts.onToggleZoom();
      return true;
    }
    const { debug, state } = this.opts;
    const result = debug?.handleKey(code, state) ?? null;
    if (result === null) return false;
    if (result === 'handled') {
      // nothing else to do
    } else if (result.type === 'loseLife') {
      this.handleEvents(loseLife(state));
    } else if (result.type === 'gainLife') {
      gainLife(state);
    } else {
      this.opts.onDebugCommand(result);
    }
    this.opts.requestRender();
    return true;
  }

  onPointerDown(x: number, y: number): void {
    const layout = this.layout;
    if (!layout) return;
    const buttons = hudButtons(layout);
    if (rectContains(buttons.pause, x, y)) {
      this.opts.onPause();
    } else if (rectContains(buttons.zoom, x, y)) {
      this.opts.onToggleZoom();
    } else if (y >= layout.hud.y + layout.hud.h) {
      this.swipe.down(x, y);
    }
  }

  onPointerMove(x: number, y: number): void {
    this.swipe.move(x, y);
  }

  onPointerUp(): void {
    this.swipe.up();
  }

  tick(nowMs: number): void {
    const { stats } = this.opts.state;
    if (this.lastTick !== null) {
      const dt = nowMs - this.lastTick;
      stats.floorTimeMs += dt;
      stats.totalTimeMs += dt;
    }
    this.lastTick = nowMs;
    if (this.message && nowMs >= this.message.until) {
      this.message = null;
      this.opts.requestRender();
    }
    const seconds = Math.floor(stats.floorTimeMs / 1000);
    if (seconds !== this.shownSeconds) {
      this.shownSeconds = seconds;
      this.opts.requestRender();
    }
  }

  onSuspend(nowMs: number): void {
    this.tick(nowMs);
    this.lastTick = null;
  }

  onResume(nowMs: number): void {
    this.lastTick = nowMs;
  }
}
