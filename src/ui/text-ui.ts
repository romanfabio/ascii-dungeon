import { type GlyphRenderer } from '../render/glyph-renderer';
import { type Rect } from '../render/layout';
import { type Theme } from '../render/themes';

export interface MenuItem {
  label: string;
  /** Shown to the right for setting rows ("Language    English"); omitted for plain buttons. */
  value?: string;
  disabled?: boolean;
}

export interface MenuDrawOptions {
  title: string;
  subtitle?: string;
  items: readonly MenuItem[];
  hint?: string;
}

export interface MenuLayout {
  /** Base font size in device pixels. */
  base: number;
  centerX: number;
  titleCenterY: number;
  titleSize: number;
  /** Bottom edge of the title block (title + subtitle). */
  headerBottom: number;
}

/** Font size used for menu text, in device pixels. */
export function menuFontSize(width: number, height: number, dpr: number): number {
  return Math.round(Math.min(40 * dpr, Math.max(14 * dpr, Math.min(width, height) * 0.045)));
}

/** Approximate width of monospace text: glyphs are about 0.6 em wide. */
const GLYPH_WIDTH_EM = 0.6;

/**
 * Largest font size (up to `base`) at which every row fits the width: label and value columns
 * are centered around the middle, so each side may use at most half the width.
 */
export function fitMenuFont(base: number, width: number, items: readonly MenuItem[]): number {
  const margin = Math.round(base * 0.8);
  const gap = Math.round(base * 0.7);
  let emsNeeded = 0;
  for (const item of items) {
    if (item.value === undefined) {
      emsNeeded = Math.max(
        emsNeeded,
        (item.label.length * GLYPH_WIDTH_EM * base) / (width - 2 * margin),
      );
    } else {
      const half = width / 2 - margin - gap;
      emsNeeded = Math.max(
        emsNeeded,
        (item.label.length * GLYPH_WIDTH_EM * base) / half,
        (item.value.length * GLYPH_WIDTH_EM * base) / half,
      );
    }
  }
  return emsNeeded > 1 ? Math.max(Math.round(base / emsNeeded), 8) : base;
}

/** The largest font size (up to `size`, at least 8) at which `text` fits within `width`. */
export function fitTextSize(text: string, size: number, width: number): number {
  if (text.length === 0) return size;
  return Math.min(size, Math.max(8, Math.floor(width / (text.length * GLYPH_WIDTH_EM))));
}

/** Breaks `text` at spaces into lines of at most `maxChars` characters (longer words stay whole). */
export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line === '') line = word;
    else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** A vertical list of selectable text rows, drawn on the canvas, with hit rectangles for taps. */
export class TextMenu {
  selected = 0;
  layout: MenuLayout | null = null;
  private rowRects: Rect[] = [];

  /** Moves the selection, skipping disabled rows (wraps around). */
  move(delta: 1 | -1, items: readonly MenuItem[]): void {
    const n = items.length;
    if (n === 0) return;
    for (let step = 1; step <= n; step++) {
      const i = (((this.selected + delta * step) % n) + n) % n;
      if (!items[i]?.disabled) {
        this.selected = i;
        return;
      }
    }
  }

  /** Index of the row under a canvas point, or -1. */
  hit(x: number, y: number): number {
    return this.rowRects.findIndex((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
  }

  draw(r: GlyphRenderer, theme: Theme, opts: MenuDrawOptions): void {
    const { items } = opts;
    if (this.selected >= items.length) this.selected = Math.max(0, items.length - 1);

    const baseUnfitted = menuFontSize(r.width, r.height, r.dpr);
    const base = fitMenuFont(baseUnfitted, r.width, items);
    const titleSize = Math.round(base * 1.8);
    const titleH = Math.round(titleSize * 1.8);
    const subtitleH = opts.subtitle ? Math.round(base * 1.6) : 0;
    const headerH = titleH + subtitleH;
    const footerH = Math.round(base * 2.2);

    let rowH = Math.round(Math.max(base * 1.9, 48 * r.dpr));
    const available = r.height - headerH - footerH;
    if (items.length * rowH > available) {
      rowH = Math.max(Math.round(base * 1.2), Math.floor(available / Math.max(1, items.length)));
    }

    const total = headerH + items.length * rowH;
    const top = Math.max(0, Math.round((r.height - footerH - total) / 2));
    const cx = Math.round(r.width / 2);

    r.clear(theme.background);
    r.drawText(opts.title, cx, top + titleH / 2, titleSize, theme.exit, 'center');
    if (opts.subtitle) {
      r.drawText(opts.subtitle, cx, top + titleH + subtitleH / 2, base, theme.hudDim, 'center');
    }
    this.layout = {
      base,
      centerX: cx,
      titleCenterY: top + titleH / 2,
      titleSize,
      headerBottom: top + headerH,
    };

    this.rowRects = [];
    const gap = Math.round(base * 0.7);
    items.forEach((item, i) => {
      const y = top + headerH + i * rowH;
      const selected = i === this.selected;
      this.rowRects.push({ x: 0, y, w: r.width, h: rowH });
      if (selected) r.fillRect(0, y, r.width, rowH, 'rgba(255, 255, 255, 0.07)');
      const color = item.disabled ? theme.hudDim : selected ? theme.player : theme.hudText;
      const midY = y + rowH / 2;
      if (item.value === undefined) {
        r.drawText(item.label, cx, midY, base, color, 'center');
      } else {
        r.drawText(item.label, cx - gap, midY, base, color, 'right');
        r.drawText(item.value, cx + gap, midY, base, color, 'left');
      }
    });

    if (opts.hint) {
      r.drawText(
        opts.hint,
        cx,
        r.height - footerH / 2,
        fitTextSize(opts.hint, Math.round(base * 0.75), r.width - 2 * Math.round(base * 0.8)),
        theme.hudDim,
        'center',
      );
    }
  }
}
