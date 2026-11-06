import { createGameState } from '../core/game-state';
import { MAX_LIVES } from '../core/lives';
import { DebugOverlay, type FloorCommand } from '../debug/debug-overlay';
import { FINAL_FLOOR, paramsForFloor } from '../gen/difficulty';
import { generateFloor } from '../gen/generate-floor';
import { setLanguage } from '../i18n/i18n';
import { Dpad } from '../input/dpad';
import { InputManager } from '../input/input-manager';
import { attachKeyboard } from '../input/keyboard';
import { GlyphRenderer } from '../render/glyph-renderer';
import { type Rect } from '../render/layout';
import { THEMES, type Theme } from '../render/themes';
import { type SaveStore, type SettingsStore } from '../save/stores';
import { type ScreenContext } from '../ui/context';
import { ControlsScreen } from '../ui/ControlsScreen';
import { FloorTransitionScreen } from '../ui/FloorTransitionScreen';
import { GameOverScreen } from '../ui/GameOverScreen';
import { VictoryScreen } from '../ui/VictoryScreen';
import {
  GameScreen,
  type FloorSummary,
  type GameOverSummary,
  type LifeGainedInfo,
  type LifeLostInfo,
} from '../ui/GameScreen';
import { PauseScreen } from '../ui/PauseScreen';
import { BestiaryScreen } from '../ui/BestiaryScreen';
import { LicensesScreen } from '../ui/LicensesScreen';
import { SettingsScreen } from '../ui/SettingsScreen';
import { TitleScreen } from '../ui/TitleScreen';
import { type Screen } from './Screen';
import { makeRunSeed } from './seed';

const TICK_INTERVAL_MS = 250;

export interface AppOptions {
  settings: SettingsStore;
  save: SaveStore;
  /** Developer shortcut (?seed=&floor=): start straight on a floor, without touching the save. */
  debugStart?: { seed?: string; floor?: number };
}

/** What a run carries from floor to floor. */
interface RunTotals {
  totalSteps: number;
  totalTimeMs: number;
  lives: number;
  deaths: number;
  /** Floors whose life pickup has been taken (it does not lie there again). */
  lifePickups: readonly number[];
}

const NEW_RUN: RunTotals = {
  totalSteps: 0,
  totalTimeMs: 0,
  lives: MAX_LIVES,
  deaths: 0,
  lifePickups: [],
};

/**
 * The totals at the start of the current floor, with the lives as they are now: what autosave
 * stores and Restart floor reuses (restarting never refills lives).
 */
interface FloorStart extends RunTotals {
  floor: number;
}

/** Owns the screen stack and wires input, timing, settings, autosave and rendering together. */
export class App {
  private readonly renderer: GlyphRenderer;
  private readonly input: InputManager;
  private readonly debug: DebugOverlay | null;
  private readonly settings: SettingsStore;
  private readonly save: SaveStore;
  private readonly ctx: ScreenContext;
  private readonly dpad: Dpad;
  private readonly coarsePointer: MediaQueryList;
  private stack: Screen[] = [];
  private zoomedOut = false;
  private activePointer: number | null = null;
  private frame = 0;
  private runSeed = '';
  private floorStart: FloorStart = { floor: 1, ...NEW_RUN };
  private readonly persist: boolean;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly opts: AppOptions,
  ) {
    this.settings = opts.settings;
    this.save = opts.save;
    this.persist = opts.debugStart === undefined;
    this.renderer = new GlyphRenderer(canvas);
    this.input = new InputManager((dir) => this.top?.onMove?.(dir));
    this.dpad = new Dpad(document.body, this.input, () => this.top?.onWait?.());
    this.coarsePointer = window.matchMedia('(pointer: coarse)');
    this.debug = import.meta.env.DEV ? new DebugOverlay() : null;
    this.ctx = {
      settings: this.settings,
      getTheme: (): Theme => THEMES[this.settings.get().theme],
      requestRender: this.requestRender,
      isTouch: (): boolean => this.coarsePointer.matches,
    };
  }

  private get top(): Screen | undefined {
    return this.stack[this.stack.length - 1];
  }

  start(): void {
    attachKeyboard(window, this.input, {
      getBindings: () => this.settings.get().bindings,
      getWaitKeys: () => this.settings.get().waitKeys,
      canWait: () => this.top?.onWait !== undefined,
      onWait: () => {
        this.top?.onWait?.();
        return true;
      },
      onKey: (code) => this.top?.onKey?.(code) ?? false,
      isCapturing: () => this.top?.captureKeys === true,
    });
    this.attachPointer();
    window.addEventListener('resize', this.requestRender);
    new ResizeObserver(this.requestRender).observe(this.canvas);

    setInterval(() => this.top?.tick?.(performance.now()), TICK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      const now = performance.now();
      if (document.hidden) this.top?.onSuspend?.(now);
      else this.top?.onResume?.(now);
    });

    this.settings.subscribe(() => this.applySettings());
    this.applySettings();

    const debugStart = this.opts.debugStart;
    if (debugStart) {
      this.runSeed = debugStart.seed ?? makeRunSeed();
      this.beginFloor(debugStart.floor ?? 1, NEW_RUN);
    } else {
      this.showTitle();
    }
  }

  private applySettings(): void {
    const s = this.settings.get();
    setLanguage(s.language);
    this.input.setRepeat({ delayMs: s.repeatDelayMs, intervalMs: s.repeatIntervalMs });
    this.requestRender();
  }

  // --- screen stack -------------------------------------------------------------------------

  private changed(): void {
    // A key still held from the previous screen must not keep acting on the next one.
    this.input.releaseAll();
    this.dpad.hide(); // a game screen shows it again when it renders
    this.requestRender();
  }

  private reset(screen: Screen): void {
    this.stack = [screen];
    this.changed();
  }

  private push(screen: Screen): void {
    this.top?.onSuspend?.(performance.now());
    this.stack.push(screen);
    this.changed();
  }

  private pop(): void {
    this.stack.pop();
    this.top?.onResume?.(performance.now());
    this.changed();
  }

  // --- flow -----------------------------------------------------------------------------------

  private showTitle(): void {
    this.reset(
      new TitleScreen(this.ctx, {
        run: this.save.run,
        deepestFloor: this.save.deepestFloor,
        onNewRun: () => this.startNewRun(),
        onContinue: () => this.continueRun(),
        onSettings: () => this.openSettings(),
        onBestiary: () => this.openBestiary(),
      }),
    );
  }

  private startNewRun(): void {
    this.runSeed = makeRunSeed();
    this.beginFloor(1, NEW_RUN);
  }

  private continueRun(): void {
    const run = this.save.run;
    if (!run) return this.startNewRun();
    this.runSeed = run.seed;
    this.beginFloor(run.floor, run);
  }

  private openBestiary(): void {
    this.push(
      new BestiaryScreen(this.ctx, { seen: this.save.seenTypes, onBack: () => this.pop() }),
    );
  }

  private openSettings(): void {
    this.push(
      new SettingsScreen(this.ctx, {
        onControls: () => this.push(new ControlsScreen(this.ctx, { onBack: () => this.pop() })),
        onLicenses: () => this.push(new LicensesScreen(this.ctx, { onBack: () => this.pop() })),
        onBack: () => this.pop(),
      }),
    );
  }

  private openPause(): void {
    this.push(
      new PauseScreen(this.ctx, {
        seed: this.runSeed,
        onResume: () => this.pop(),
        onRestartFloor: () => this.beginFloor(this.floorStart.floor, this.floorStart),
        onSettings: () => this.openSettings(),
        onQuitToTitle: () => this.showTitle(),
      }),
    );
  }

  /** Starts a floor and autosaves the run at that point. */
  private beginFloor(floor: number, totals: RunTotals): void {
    this.floorStart = {
      floor,
      totalSteps: totals.totalSteps,
      totalTimeMs: totals.totalTimeMs,
      lives: totals.lives,
      deaths: totals.deaths,
      lifePickups: totals.lifePickups,
    };
    if (this.persist) {
      this.save.recordFloor({ seed: this.runSeed, ...this.floorStart });
    }

    const state = createGameState(this.runSeed, generateFloor(this.runSeed, floor), {
      sightRadius: paramsForFloor(floor).sightRadius,
      totalSteps: totals.totalSteps,
      totalTimeMs: totals.totalTimeMs,
      lives: totals.lives,
      deaths: totals.deaths,
      lifePickups: totals.lifePickups,
    });
    this.reset(
      new GameScreen({
        state,
        getTheme: this.ctx.getTheme,
        debug: this.debug,
        input: this.input,
        dpadWanted: () => this.dpadWanted(),
        setDpadArea: (area) => this.setDpadArea(area),
        isZoomedOut: () => this.zoomedOut,
        onToggleZoom: () => {
          this.zoomedOut = !this.zoomedOut;
          this.requestRender();
        },
        requestRender: this.requestRender,
        onPause: () => this.openPause(),
        onFloorCleared: (summary) => this.showTransition(summary),
        onLifeLost: (info) => this.lifeLost(info),
        onLifeGained: (info) => this.lifeGained(info),
        onSighted: () => this.input.releaseAll(),
        onTypesMet: (types) => this.save.recordSeenTypes(types),
        onGameOver: (summary) => this.gameOver(summary),
        onDebugCommand: (command) => this.runDebugCommand(command),
      }),
    );
  }

  private showTransition(summary: FloorSummary): void {
    if (summary.floor >= FINAL_FLOOR) return this.victory(summary);
    this.reset(
      new FloorTransitionScreen({
        summary,
        getTheme: this.ctx.getTheme,
        onContinue: () =>
          this.beginFloor(summary.floor + 1, {
            totalSteps: summary.totalSteps,
            totalTimeMs: summary.totalTimeMs,
            lives: summary.lives,
            deaths: summary.deaths,
            lifePickups: this.floorStart.lifePickups,
          }),
      }),
    );
  }

  /** A life was lost: stop any walking and save right away, so quitting cannot undo it. */
  private lifeLost(info: LifeLostInfo): void {
    this.input.releaseAll();
    this.floorStart = { ...this.floorStart, lives: info.livesLeft, deaths: info.deaths };
    if (this.persist) this.save.recordFloor({ seed: this.runSeed, ...this.floorStart });
  }

  /** A life pickup was taken: remember it for the run and save right away. */
  private lifeGained(info: LifeGainedInfo): void {
    this.floorStart = {
      ...this.floorStart,
      lives: info.livesLeft,
      lifePickups: [...this.floorStart.lifePickups, info.floor],
    };
    if (this.persist) this.save.recordFloor({ seed: this.runSeed, ...this.floorStart });
  }

  /** The final floor is cleared: the run ends like a Game Over (no Continue), but as a win. */
  private victory(summary: FloorSummary): void {
    if (this.persist) this.save.clearRun();
    this.reset(
      new VictoryScreen({
        summary: {
          floor: summary.floor,
          totalSteps: summary.totalSteps,
          totalTimeMs: summary.totalTimeMs,
          deaths: summary.deaths,
          lives: summary.lives,
        },
        getTheme: this.ctx.getTheme,
        onContinue: () => this.showTitle(),
      }),
    );
  }

  /** The last life is gone: the run is deleted (no Continue), the deepest-floor record stays. */
  private gameOver(summary: GameOverSummary): void {
    if (this.persist) this.save.clearRun();
    this.reset(
      new GameOverScreen({
        summary,
        getTheme: this.ctx.getTheme,
        onContinue: () => this.showTitle(),
      }),
    );
  }

  private runDebugCommand(command: FloorCommand): void {
    if (command.type === 'newSeed') this.runSeed = makeRunSeed();
    const floor = command.type === 'jumpFloor' ? command.floor : this.floorStart.floor;
    this.beginFloor(floor, this.floorStart);
  }

  // --- native app hooks ---------------------------------------------------------------------

  /** Android back button: acts like Esc on the current screen. False on the title (exit the app). */
  handleBackButton(): boolean {
    if (this.top instanceof TitleScreen) return false;
    this.top?.onKey?.('Escape');
    return true;
  }

  /** The app went to the background: pause a game in progress. */
  autoPause(): void {
    if (this.top instanceof GameScreen) this.openPause();
  }

  // --- touch ---------------------------------------------------------------------------------

  /** Auto = show the D-pad on touch devices (coarse primary pointer). */
  private dpadWanted(): boolean {
    const visibility = this.settings.get().dpadVisible;
    return visibility === 'on' || (visibility === 'auto' && this.coarsePointer.matches);
  }

  /** Places the DOM D-pad inside an area given in canvas device pixels. */
  private setDpadArea(area: Rect | null): void {
    if (!area) {
      this.dpad.hide();
      return;
    }
    const k = this.canvas.clientWidth / Math.max(1, this.renderer.width);
    const css: Rect = { x: area.x * k, y: area.y * k, w: area.w * k, h: area.h * k };
    const settings = this.settings.get();
    this.dpad.show(css, settings.dpadSize, THEMES[settings.theme]);
  }

  /** One pointer at a time drives the screen (taps, swipes); others are ignored. */
  private attachPointer(): void {
    const toCanvas = (e: PointerEvent): { x: number; y: number } => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (this.renderer.width / rect.width),
        y: (e.clientY - rect.top) * (this.renderer.height / rect.height),
      };
    };
    const end = (e: PointerEvent): void => {
      if (e.pointerId !== this.activePointer) return;
      this.activePointer = null;
      this.top?.onPointerUp?.();
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.activePointer !== null) return;
      this.activePointer = e.pointerId;
      this.canvas.setPointerCapture(e.pointerId);
      const p = toCanvas(e);
      this.top?.onPointerDown?.(p.x, p.y);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.activePointer) return;
      const p = toCanvas(e);
      this.top?.onPointerMove?.(p.x, p.y);
    });
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // --- rendering ------------------------------------------------------------------------------

  private readonly requestRender = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.renderer.resize();
      this.top?.render(this.renderer);
    });
  };
}
