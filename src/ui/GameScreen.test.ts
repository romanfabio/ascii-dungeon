import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '../i18n/i18n';
import { enemiesOf } from '../core/enemies';
import { ENEMY_DEFS, type ContactEffect } from '../core/enemy-defs';
import { parseMap } from '../core/floor-map';
import { createGameState } from '../core/game-state';
import { type Dir } from '../core/geometry';
import { type GlyphRenderer } from '../render/glyph-renderer';
import { computeLayout, hudButtons, NO_INSETS, type Rect } from '../render/layout';
import { DEFAULT_THEME } from '../render/themes';
import { DebugOverlay } from '../debug/debug-overlay';
import {
  GameScreen,
  type FloorSummary,
  type GameOverSummary,
  type LifeGainedInfo,
  type LifeLostInfo,
} from './GameScreen';

function setup(
  opts: { dpad?: boolean; lives?: number; debug?: DebugOverlay; map?: string[] } = {},
) {
  const state = createGameState('T', parseMap(opts.map ?? ['#####', '#@.!#', '#####']), {
    lives: opts.lives,
  });
  const requestRender = vi.fn();
  const cleared: FloorSummary[] = [];
  const lost: LifeLostInfo[] = [];
  const gained: LifeGainedInfo[] = [];
  const over: GameOverSummary[] = [];
  const sighted: number[] = [];
  const met: string[][] = [];
  const pressed: string[] = [];
  const dpadAreas: (Rect | null)[] = [];
  const calls = { pause: 0, zoom: 0 };
  const screen = new GameScreen({
    state,
    getTheme: () => DEFAULT_THEME,
    debug: opts.debug ?? null,
    input: {
      press: (d: Dir) => pressed.push(`+${d}`),
      release: (d: Dir) => pressed.push(`-${d}`),
    },
    dpadWanted: () => opts.dpad ?? false,
    setDpadArea: (a) => dpadAreas.push(a),
    isZoomedOut: () => false,
    onToggleZoom: () => calls.zoom++,
    requestRender,
    onPause: () => calls.pause++,
    onFloorCleared: (s) => cleared.push(s),
    onLifeLost: (i) => lost.push(i),
    onSighted: () => sighted.push(1),
    onTypesMet: (types) => met.push(types),
    onLifeGained: (i) => gained.push(i),
    onGameOver: (s) => over.push(s),
    onDebugCommand: () => {},
  });
  return {
    state,
    screen,
    requestRender,
    cleared,
    lost,
    gained,
    over,
    sighted,
    met,
    pressed,
    dpadAreas,
    calls,
  };
}

/** A renderer that draws nothing, for exercising layout and hit-testing. */
function stubRenderer(
  width = 1080,
  height = 2200,
  dpr = 2.6,
  texts: string[] = [],
  colors: Record<string, string> = {},
): GlyphRenderer {
  const noop = (): void => {};
  return {
    width,
    height,
    dpr,
    insets: NO_INSETS,
    clear: noop,
    fillRect: noop,
    drawGlyph: noop,
    drawText: (text: string, _x: number, _y: number, _size: number, color: string) => {
      texts.push(text);
      colors[text] = color;
    },
  } as unknown as GlyphRenderer;
}

describe('GameScreen timer', () => {
  it('accumulates time between ticks and requests a redraw when the second changes', () => {
    const { state, screen, requestRender } = setup();
    const t0 = performance.now();
    screen.tick(t0 + 400);
    expect(state.stats.floorTimeMs).toBeCloseTo(400, -1);
    expect(requestRender).not.toHaveBeenCalled();
    screen.tick(t0 + 1200);
    expect(state.stats.floorTimeMs).toBeCloseTo(1200, -1);
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('does not count time while suspended', () => {
    const { state, screen } = setup();
    const t0 = performance.now();
    screen.onSuspend(t0 + 1000);
    screen.tick(t0 + 5000); // ticks while hidden add nothing
    screen.onResume(t0 + 9000);
    screen.tick(t0 + 9500);
    expect(state.stats.floorTimeMs).toBeCloseTo(1500, -1);
    expect(state.stats.totalTimeMs).toBeCloseTo(1500, -1);
  });
});

describe('GameScreen moves', () => {
  it('reports a summary when the exit is reached', () => {
    const { screen, cleared, requestRender } = setup();
    screen.onMove('E');
    expect(cleared).toHaveLength(0);
    expect(requestRender).toHaveBeenCalled();
    screen.onMove('E');
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toMatchObject({ floor: 0, steps: 2, bestSteps: 2, totalSteps: 2 });
  });
});

describe('GameScreen lives', () => {
  function withDebug(lives?: number) {
    const debug = new DebugOverlay();
    const game = setup({ debug, lives });
    game.screen.onKey('F3'); // enable the overlay so L / H work
    return game;
  }

  it('the exit summary carries the lives and deaths into the next floor', () => {
    const { screen, cleared, state } = setup({ lives: 2 });
    state.stats.deaths = 1;
    screen.onMove('E');
    screen.onMove('E');
    expect(cleared[0]).toMatchObject({ lives: 2, deaths: 1 });
  });

  it('losing a life respawns, reports it and stops swipe walking', () => {
    const { screen, state, lost, pressed, over } = withDebug();
    const r = stubRenderer();
    screen.render(r);
    screen.onMove('E');
    screen.onPointerDown(500, 800);
    screen.onPointerMove(600, 805);
    expect(pressed).toEqual(['+E']);

    screen.onKey('KeyL');

    expect(state.lives).toBe(2);
    expect(state.player.pos).toEqual({ x: 1, y: 1 });
    expect(lost).toEqual([{ livesLeft: 2, deaths: 1 }]);
    expect(pressed).toEqual(['+E', '-E']);
    expect(over).toHaveLength(0);
  });

  it('the last life ends the run instead of reporting a life lost', () => {
    const { screen, lost, over, state } = withDebug(1);
    state.stats.totalSteps = 7;
    screen.onKey('KeyL');
    expect(lost).toHaveLength(0);
    expect(over).toHaveLength(1);
    expect(over[0]).toMatchObject({ floor: 0, totalSteps: 7, deaths: 1 });
  });

  it('H gives a life back, up to the maximum', () => {
    const { screen, state } = withDebug(1);
    screen.onKey('KeyH');
    expect(state.lives).toBe(2);
    screen.onKey('KeyH');
    screen.onKey('KeyH');
    expect(state.lives).toBe(state.maxLives);
  });

  it('shows the notice after a loss and clears it later', () => {
    const { screen, requestRender } = withDebug();
    screen.onKey('KeyL');
    requestRender.mockClear();
    screen.tick(performance.now() + 5000);
    expect(requestRender).toHaveBeenCalled(); // the expired notice triggers one redraw
  });
});

describe('GameScreen enemies', () => {
  const MAP = ['##########', '#@.x....!#', '##########'];

  it('walking into a Bloodstone loses a life and reports it', () => {
    const { screen, state, lost } = setup({ map: MAP });
    screen.onMove('E');
    screen.onMove('E'); // into the stone
    expect(state.lives).toBe(2);
    expect(state.player.pos).toEqual({ x: 1, y: 1 });
    expect(lost).toEqual([{ livesLeft: 2, deaths: 1 }]);
  });

  it('shows the loss notice in the heart red, unlike the pickup notices', () => {
    setLanguage('en');
    const { screen } = setup({ map: MAP });
    screen.onMove('E');
    screen.onMove('E'); // into the stone
    const colors: Record<string, string> = {};
    screen.render(stubRenderer(1080, 2200, 2.6, [], colors));
    expect(colors['Ouch! 2 lives left']).toBe(DEFAULT_THEME.heart);
    expect(DEFAULT_THEME.heart).not.toBe(DEFAULT_THEME.pickup);
  });

  it('stops auto-repeat and swiping when a chaser starts hunting', () => {
    const wall = '#'.repeat(18);
    const { screen, sighted } = setup({ map: [wall, '#@......c.......!#', wall] });
    screen.onPointerDown(0, 800);
    screen.onMove('E'); // 6 tiles away: it is already in view and has not noticed the player
    expect(sighted).toEqual([]);
    screen.onMove('E'); // 5 tiles away: it notices them
    expect(sighted).toEqual([1]);
  });

  it('stops auto-repeat and swiping when an enemy comes into view', () => {
    const state = setup({ map: ['############', '#@........x#', '###########!'] });
    // sight radius defaults to 8: the stone at distance 9 appears after the first step
    state.screen.onPointerDown(0, 800);
    state.screen.onMove('E');
    expect(state.sighted).toEqual([1]);
    state.screen.onMove('E');
    expect(state.sighted).toEqual([1]); // only once
  });
});

/** Makes the Bloodstone act like a type with another contact effect, while `run` runs. */
function withContact(effect: ContactEffect, run: () => void): void {
  const def = ENEMY_DEFS.bloodstone;
  const before = def.contact;
  def.contact = effect;
  try {
    run();
  } finally {
    def.contact = before;
  }
}

describe('GameScreen contact effects and telegraphs', () => {
  const MAP = ['##########', '#@.x....!#', '##########'];

  beforeEach(() => setLanguage('en'));

  it('blindness shows a warning notice and stops auto-repeat', () => {
    const { screen, state, lost, sighted } = setup({ map: MAP });
    screen.onMove('E');
    sighted.length = 0;
    withContact('blind', () => screen.onMove('E')); // into the stone
    expect(state.lives).toBe(3);
    expect(lost).toEqual([]);
    expect(sighted).toEqual([1]);
    const colors: Record<string, string> = {};
    screen.render(stubRenderer(1080, 2200, 2.6, [], colors));
    expect(colors['Darkness falls']).toBe(DEFAULT_THEME.enemyWarn);
  });

  it('a shove shows a warning notice and stops auto-repeat', () => {
    const { screen, state, sighted } = setup({ map: MAP });
    screen.onMove('E');
    sighted.length = 0;
    withContact('shove', () => screen.onMove('E'));
    expect(state.player.pos).toEqual({ x: 1, y: 1 });
    expect(sighted).toEqual([1]);
    const texts: string[] = [];
    screen.render(stubRenderer(1080, 2200, 2.6, texts));
    expect(texts).toContain('Bounced back!');
  });

  it('revealing a mimic shows a warning notice and stops auto-repeat', () => {
    const wall = '#'.repeat(14);
    const { screen, sighted } = setup({ map: [wall, '#@.....m....!#', wall] });
    screen.onPointerDown(0, 800);
    for (let i = 0; i < 3; i++) screen.onMove('E');
    sighted.length = 0;
    screen.onMove('E'); // two tiles from it: the disguise drops
    expect(sighted).toEqual([1]);
    const colors: Record<string, string> = {};
    screen.render(stubRenderer(1080, 2200, 2.6, [], colors));
    expect(colors['It was a Mimic!']).toBe(DEFAULT_THEME.enemyWarn);
  });

  it('standing beside a hidden lurker reveals it with a warning notice and stops auto-repeat', () => {
    // The lurker sits in the dead end below the corridor tile at x = 5.
    const wall = '#'.repeat(14);
    const { screen, sighted } = setup({
      map: [wall, '#@..........!#', '#####l########', '#####.########', wall],
    });
    screen.onPointerDown(0, 800);
    for (let i = 0; i < 3; i++) screen.onMove('E');
    expect(sighted).toEqual([]); // nothing to see: it is hidden
    screen.onMove('E'); // beside it
    expect(sighted).toEqual([1]);
    const colors: Record<string, string> = {};
    screen.render(stubRenderer(1080, 2200, 2.6, [], colors));
    expect(colors['Something lurks here!']).toBe(DEFAULT_THEME.enemyWarn);
  });

  it('a ghost noticing you through the rock shows a warning notice and stops auto-repeat', () => {
    const wall = '#'.repeat(14);
    const { screen, sighted } = setup({
      map: [wall, '#@..........!#', wall, wall, wall, '#.........g..#', wall],
    });
    screen.onPointerDown(0, 800);
    for (let i = 0; i < 3; i++) screen.onMove('E');
    expect(sighted).toEqual([]); // still out of its reach
    screen.onMove('E'); // 5 across and 4 down: it feels you
    expect(sighted).toEqual([1]);
    const colors: Record<string, string> = {};
    screen.render(stubRenderer(1080, 2200, 2.6, [], colors));
    expect(colors['A chill runs down your spine']).toBe(DEFAULT_THEME.enemyWarn);
  });

  it('reports the enemy types the player meets, once the Mimic has shown itself', () => {
    const wall = '#'.repeat(14);
    const { screen, met } = setup({ map: [wall, '#@.....m..x.!#', wall] });
    screen.onMove('E');
    screen.onMove('E');
    expect(met.flat()).not.toContain('mimic'); // only seen: it still looks like a life pickup
    screen.onMove('E');
    screen.onMove('E'); // two tiles from it: it shows itself
    expect(met.flat()).toContain('mimic');
  });

  it('a sentinel starting to charge in view stops auto-repeat and swiping', () => {
    const { screen, sighted } = setup({
      map: ['##########', '#t.....T.#', '#........#', '#@......!#', '##########'],
    });
    screen.onPointerDown(0, 800);
    for (let i = 0; i < 6; i++) screen.onWait();
    expect(sighted).toEqual([]);
    screen.onWait(); // turn 7: the beam is marked
    expect(sighted).toEqual([1]);
  });

  it('an awake sleeper is not drawn in explored but unlit tiles; a sleeping one is', () => {
    const wall = '#'.repeat(24);
    const { screen, state } = setup({ map: [wall, '#@.........z..........!#', wall] });
    const z = enemiesOf(state)[0];
    if (!z) throw new Error('no enemy');
    // The corridor is explored, but the sleeper (x = 11) is far from the player at x = 1.
    state.floor.explored.fill(1);
    state.visible.fill(0);
    const glyphs = (): string[] => {
      const drawn: string[] = [];
      const r = stubRenderer();
      r.drawGlyph = (glyph: string) => {
        drawn.push(glyph);
      };
      screen.render(r);
      return drawn;
    };
    expect(glyphs()).toContain('z'); // asleep: stays drawn once seen
    z.memory.mode = 2; // awake and hunting out of sight
    expect(glyphs()).not.toContain('Z');
    expect(glyphs()).not.toContain('z');
  });

  it('while blind the HUD counts the turns left and the map is dimmed', () => {
    const { screen, state } = setup({ map: ['##########', '#@.x....!#', '##########'] });
    const texts: string[] = [];
    const rects: { color: string; alpha?: number }[] = [];
    const r = stubRenderer(1080, 2200, 2.6, texts);
    r.fillRect = (
      _x: number,
      _y: number,
      _w: number,
      _h: number,
      color: string,
      alpha?: number,
    ) => {
      rects.push({ color, alpha });
    };
    screen.render(r);
    expect(texts.some((t) => t.startsWith('DARK'))).toBe(false);
    expect(rects.some((x) => x.alpha === 0.35)).toBe(false);
    state.blindTurns = 17;
    texts.length = 0;
    rects.length = 0;
    screen.render(r);
    expect(texts).toContain('DARK 17');
    expect(rects.some((x) => x.alpha === 0.35)).toBe(true);
  });

  it('draws warn tiles under the hurting cells, only where the player can see', () => {
    const { screen, state } = setup({ map: ['############', '#@.x...!...#', '############'] });
    const stone = enemiesOf(state)[0];
    if (!stone) throw new Error('no enemy');
    stone.warn = [
      { x: 4, y: 1 },
      { x: 10, y: 1 }, // out of sight: the default radius is 8 from x = 1 (reaches x = 9)
    ];
    const drawn: { glyph: string; color: string }[] = [];
    const r = stubRenderer();
    r.drawGlyph = (
      glyph: string,
      _x: number,
      _y: number,
      _cell: number,
      _px: number,
      color: string,
    ) => {
      drawn.push({ glyph, color });
    };
    screen.render(r);
    const warns = drawn.filter((d) => d.glyph === ':');
    expect(warns).toEqual([{ glyph: ':', color: DEFAULT_THEME.enemyWarn }]);
  });
});

describe('GameScreen life pickups', () => {
  const MAP = ['###########', '#@..+..x.!#', '###########'];

  beforeEach(() => setLanguage('en'));

  it('taking one reports it to the app and shows a message', () => {
    const { screen, state, gained } = setup({ map: MAP, lives: 2 });
    const texts: string[] = [];
    screen.onMove('E');
    screen.onMove('E');
    screen.onMove('E'); // onto the pickup
    expect(state.lives).toBe(3);
    expect(gained).toEqual([{ livesLeft: 3, floor: 0 }]);
    const colors: Record<string, string> = {};
    screen.render(stubRenderer(1080, 2200, 2.6, texts, colors));
    expect(texts).toContain('+1 life');
    expect(colors['+1 life']).toBe(DEFAULT_THEME.pickup);
  });

  it('at full lives it says so and the app is not told', () => {
    const { screen, gained } = setup({ map: MAP });
    const texts: string[] = [];
    for (let i = 0; i < 3; i++) screen.onMove('E');
    expect(gained).toEqual([]);
    const colors: Record<string, string> = {};
    screen.render(stubRenderer(1080, 2200, 2.6, texts, colors));
    expect(texts).toContain('Lives are full');
    expect(colors['Lives are full']).toBe(DEFAULT_THEME.pickup);
  });

  it('stops auto-repeat and swiping when one comes into view', () => {
    const { screen, sighted } = setup({ map: ['############', '#@........+!', '############'] });
    screen.onPointerDown(0, 800);
    screen.onMove('E'); // the pickup is 9 away: the default sight radius of 8 reaches it now
    expect(sighted).toEqual([1]);
    screen.onMove('E');
    expect(sighted).toEqual([1]);
  });
});

describe('GameScreen wait', () => {
  it('takes a turn without a step and redraws, so timed hazards keep moving', () => {
    const { screen, state, requestRender } = setup({
      map: ['##########', '#@..s..S!#', '##########'],
    });
    const cells = (): number => enemiesOf(state)[0]?.cells.length ?? 0;
    expect(cells()).toBe(1);
    requestRender.mockClear();
    screen.onWait();
    expect(state.turn).toBe(1);
    expect(state.stats.floorSteps).toBe(0);
    expect(cells()).toBe(2);
    expect(requestRender).toHaveBeenCalled();
  });

  it('a spear reaching the waiting player costs a life, reported like any other hit', () => {
    // The spear's base is at x = 7 pointing west; the player waits at x = 5.
    const { screen, state, lost } = setup({ map: ['##########', '#..S.@.s!#', '##########'] });
    screen.onWait(); // reaches x = 6
    expect(lost).toHaveLength(0);
    screen.onWait(); // reaches x = 5
    expect(lost).toEqual([{ livesLeft: 2, deaths: 1 }]);
    expect(state.player.pos).toEqual(state.floor.start);
  });
});

describe('GameScreen touch', () => {
  it('reserves and reports the D-pad area only when wanted', () => {
    const off = setup({ dpad: false });
    off.screen.render(stubRenderer());
    expect(off.dpadAreas).toEqual([null]);

    const on = setup({ dpad: true });
    on.screen.render(stubRenderer());
    expect(on.dpadAreas).toHaveLength(1);
    expect(on.dpadAreas[0]).not.toBeNull();
  });

  it('tapping the HUD buttons pauses and zooms', () => {
    const { screen, calls } = setup();
    const r = stubRenderer();
    screen.render(r);
    const buttons = hudButtons(computeLayout(r.width, r.height, r.dpr, { dpad: false }));
    screen.onPointerDown(buttons.pause.x + 2, buttons.pause.y + 2);
    expect(calls).toEqual({ pause: 1, zoom: 0 });
    screen.onPointerDown(buttons.zoom.x + 2, buttons.zoom.y + 2);
    expect(calls).toEqual({ pause: 1, zoom: 1 });
  });

  it('swiping on the map presses and releases a direction', () => {
    const { screen, pressed } = setup();
    const r = stubRenderer();
    screen.render(r);
    screen.onPointerDown(500, 800);
    screen.onPointerMove(500 + 100, 805); // far more than 24 CSS px at dpr 2.6
    screen.onPointerUp();
    expect(pressed).toEqual(['+E', '-E']);
  });

  it('a swipe that starts in the HUD does nothing', () => {
    const { screen, pressed } = setup();
    screen.render(stubRenderer());
    screen.onPointerDown(100, 10);
    screen.onPointerMove(400, 10);
    screen.onPointerUp();
    expect(pressed).toEqual([]);
  });

  it('keys: Z zooms, Escape pauses', () => {
    const { screen, calls } = setup();
    expect(screen.onKey('KeyZ')).toBe(true);
    expect(screen.onKey('Escape')).toBe(true);
    expect(calls).toEqual({ pause: 1, zoom: 1 });
  });
});
