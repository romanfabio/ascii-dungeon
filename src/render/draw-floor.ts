import { FINAL_FLOOR } from '../gen/difficulty';
import { BEHAVIORS } from '../core/behaviors';
import { ENEMY_DEFS } from '../core/enemy-defs';
import { glyphForCell } from '../core/enemies';
import { isEnemy } from '../core/entity';
import { type GameState } from '../core/game-state';
import { PICKUP_CHARS } from '../core/pickups';
import { Tile, TILE_DEFS, type TileType } from '../core/tiles';
import { t } from '../i18n/i18n';
import { isInView, tilePixel, type View } from './camera';
import { formatTime } from './format';
import { type GlyphRenderer } from './glyph-renderer';
import { GLYPH_WIDTH_EM, hudButtons, type Layout } from './layout';
import { type Theme } from './themes';

function tileColor(tile: number, theme: Theme, lit: boolean): string {
  switch (tile) {
    case Tile.Wall:
      return lit ? theme.wall : theme.wallRemembered;
    case Tile.Exit:
      return lit ? theme.exit : theme.exitRemembered;
    default:
      return lit ? theme.floor : theme.floorRemembered;
  }
}

export interface DrawFloorOptions {
  /** Draw the whole map as if visible (debug). */
  revealAll?: boolean;
  /** Strength (0..1) of the red flash after losing a life; 0 or absent = none. */
  hurt?: number;
  /** One-line notice shown under the HUD (e.g. "Ouch! 2 lives left"). */
  message?: string;
  /** Colour of the notice: a loss is the heart red, a pickup the pickup colour, a warning the warn colour. */
  messageTone?: 'hurt' | 'pickup' | 'warning';
}

/**
 * Draws one full frame: HUD, the tiles of the view with fog of war (lit = in sight, dim =
 * remembered, blank = never seen), then entities and the player on top.
 */
export function drawFloor(
  r: GlyphRenderer,
  state: GameState,
  theme: Theme,
  layout: Layout,
  view: View,
  opts: DrawFloorOptions = {},
): void {
  r.clear(theme.background);

  const { floor, player, visible } = state;
  const { cell, glyphPx } = view;
  const revealAll = opts.revealAll ?? false;

  for (let y = view.tileY; y < view.tileY + view.rows; y++) {
    for (let x = view.tileX; x < view.tileX + view.cols; x++) {
      const i = y * floor.width + x;
      const lit = revealAll || visible[i] === 1;
      if (!lit && floor.explored[i] !== 1) continue; // never seen
      const tile = floor.tiles[i] as TileType;
      const p = tilePixel(view, x, y);
      r.drawGlyph(TILE_DEFS[tile].glyph, p.x, p.y, cell, glyphPx, tileColor(tile, theme, lit));
    }
  }

  // A pickup that has been seen stays drawn (dimmed out of sight), under the enemies and player.
  for (const pick of state.pickups) {
    if (!isInView(view, pick.pos.x, pick.pos.y)) continue;
    const i = pick.pos.y * floor.width + pick.pos.x;
    const lit = revealAll || visible[i] === 1;
    if (!lit && floor.explored[i] !== 1) continue;
    const p = tilePixel(view, pick.pos.x, pick.pos.y);
    const color = lit ? theme.pickup : theme.pickupRemembered;
    r.drawGlyph(PICKUP_CHARS[pick.type], p.x, p.y, cell, glyphPx, color);
  }

  // Enemies show while in sight (a type that is `remembered` also once its tile was explored); the
  // player is always drawn, on top.
  for (const e of state.entities) {
    if (!isEnemy(e)) continue;
    const def = ENEMY_DEFS[e.type];
    if (BEHAVIORS[def.behavior].hidden?.(e)) continue; // a Lurker nobody has stood beside
    const tone = BEHAVIORS[def.behavior].tone?.(e);
    const litColor =
      tone === 'alert'
        ? theme.enemyHunting
        : tone === 'pickup'
          ? theme.pickup
          : tone === 'shade'
            ? theme.shade
            : tone === 'warn'
              ? theme.enemyWarn
              : def.remembered
                ? theme.enemy
                : theme.enemyMobile;
    // A remembered type stays drawn out of sight only while it is standing still in its place.
    const keepsPlace = def.remembered && (BEHAVIORS[def.behavior].dormant?.(e) ?? true);
    const dimColor = tone === 'pickup' ? theme.pickupRemembered : theme.enemyRemembered;
    // Telegraphed tiles go under the hurting cells, and only where the player can see them.
    const warnGlyph = BEHAVIORS[def.behavior].warnGlyph ?? ':';
    for (const c of e.warn) {
      if (!isInView(view, c.x, c.y)) continue;
      if (!(revealAll || visible[c.y * floor.width + c.x] === 1)) continue;
      const p = tilePixel(view, c.x, c.y);
      r.drawGlyph(warnGlyph, p.x, p.y, cell, glyphPx, theme.enemyWarn);
    }
    // A solid body is what stays drawn once seen; the cells of such an enemy (a beam) only show
    // while lit, since out of sight they may have changed.
    e.solid.forEach((c, k) => {
      if (!isInView(view, c.x, c.y)) return;
      const i = c.y * floor.width + c.x;
      const lit = revealAll || visible[i] === 1;
      if (!lit && !(keepsPlace && floor.explored[i] === 1)) return;
      const p = tilePixel(view, c.x, c.y);
      const glyph =
        BEHAVIORS[def.behavior].solidGlyph?.(e, k, !!theme.enemyAltGlyph) ??
        (theme.enemyAltGlyph ? def.altGlyph : def.glyph);
      r.drawGlyph(glyph, p.x, p.y, cell, glyphPx, lit ? litColor : dimColor);
    });
    e.cells.forEach((c, k) => {
      if (!isInView(view, c.x, c.y)) return;
      const i = c.y * floor.width + c.x;
      const lit = revealAll || visible[i] === 1;
      const keeps = keepsPlace && e.solid.length === 0;
      if (!lit && !(keeps && floor.explored[i] === 1)) return;
      const p = tilePixel(view, c.x, c.y);
      const glyph = glyphForCell(e, k, theme.enemyAltGlyph);
      r.drawGlyph(glyph, p.x, p.y, cell, glyphPx, lit ? litColor : dimColor);
    });
  }
  if (isInView(view, player.pos.x, player.pos.y)) {
    const p = tilePixel(view, player.pos.x, player.pos.y);
    r.drawGlyph(player.glyph, p.x, p.y, cell, glyphPx, theme.player);
  }

  if (opts.hurt) r.fillRect(0, 0, r.width, r.height, theme.hurt, Math.min(1, opts.hurt) * 0.45);

  // Blind: a dim vignette over the map; the HUD counts the turns left (see drawLives).
  if (state.blindTurns > 0) {
    const { mapArea } = layout;
    r.fillRect(mapArea.x, mapArea.y, mapArea.w, mapArea.h, theme.background, 0.35);
  }

  drawHud(r, state, theme, layout);
  if (opts.message) {
    const color =
      opts.messageTone === 'pickup'
        ? theme.pickup
        : opts.messageTone === 'warning'
          ? theme.enemyWarn
          : theme.heart;
    drawMessage(r, opts.message, theme, color, layout);
  }
}

/** Hearts: `<3` for each life left, a dim `</3` for each one lost. */
function drawLives(r: GlyphRenderer, state: GameState, theme: Theme, layout: Layout): void {
  const { lives: row, hudFontPx } = layout;
  const pad = Math.round(hudFontPx * 0.6);
  const step = hudFontPx * GLYPH_WIDTH_EM * 4; // three characters and a space
  const midY = row.y + row.h / 2;
  for (let i = 0; i < state.maxLives; i++) {
    const alive = i < state.lives;
    r.drawText(
      alive ? '<3' : '</3',
      row.x + pad + i * step,
      midY,
      hudFontPx,
      alive ? theme.heart : theme.heartLost,
    );
  }
  if (state.blindTurns > 0) {
    const text = t('hudDark', { turns: state.blindTurns });
    r.drawText(text, row.x + row.w - pad, midY, hudFontPx, theme.shade, 'right');
  }
}

/** A short notice centered at the top of the map area, on a translucent strip. */
function drawMessage(
  r: GlyphRenderer,
  text: string,
  theme: Theme,
  color: string,
  layout: Layout,
): void {
  const { mapArea, hudFontPx } = layout;
  const h = Math.round(hudFontPx * 2);
  r.fillRect(mapArea.x, mapArea.y, mapArea.w, h, theme.background, 0.75);
  r.drawText(text, mapArea.x + mapArea.w / 2, mapArea.y + h / 2, hudFontPx, color, 'center');
}

function drawHud(r: GlyphRenderer, state: GameState, theme: Theme, layout: Layout): void {
  const { hud, hudFontPx } = layout;
  const pad = Math.round(hudFontPx * 0.6);
  const midY = hud.y + hud.h / 2;
  const { floor, stats } = state;
  drawLives(r, state, theme, layout);
  r.drawText(
    t('hudStats', {
      floor: floor.floorNumber,
      max: FINAL_FLOOR,
      steps: stats.floorSteps,
      time: formatTime(stats.floorTimeMs),
    }),
    hud.x + pad,
    midY,
    hudFontPx,
    theme.hudText,
  );

  // Tappable buttons: labels are centered in their (wider) touch targets.
  const buttons = hudButtons(layout);
  r.drawText('[Z]', buttons.zoom.x + buttons.zoom.w / 2, midY, hudFontPx, theme.hudDim, 'center');
  r.drawText(
    '[II]',
    buttons.pause.x + buttons.pause.w / 2,
    midY,
    hudFontPx,
    theme.hudDim,
    'center',
  );
}
