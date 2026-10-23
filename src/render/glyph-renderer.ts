import { FONT_FAMILY } from './font';
import { NO_INSETS, type Insets } from './layout';
import { readSafeAreaInsets } from './safe-area';

/**
 * Thin wrapper over a 2D canvas context. All coordinates are device pixels (the backing store is
 * sized to CSS size x devicePixelRatio), so glyphs and cells land on whole pixels.
 */
export class GlyphRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private fontPx = 0;
  width = 0;
  height = 0;
  dpr = 1;
  /** Notch / system-bar insets in device pixels. */
  insets: Insets = NO_INSETS;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  /** Syncs the backing store to the canvas' CSS size. Returns true if the size changed. */
  resize(): boolean {
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    const changed = width !== this.width || height !== this.height || dpr !== this.dpr;
    if (changed) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.fontPx = 0; // context state was reset
      const css = readSafeAreaInsets();
      const k = width / Math.max(1, this.canvas.clientWidth);
      this.insets = {
        top: Math.round(css.top * k),
        right: Math.round(css.right * k),
        bottom: Math.round(css.bottom * k),
        left: Math.round(css.left * k),
      };
    }
    return changed;
  }

  clear(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /** Fills a rectangle; `alpha` (0..1) makes it translucent. */
  fillRect(x: number, y: number, w: number, h: number, color: string, alpha = 1): void {
    this.ctx.fillStyle = color;
    this.ctx.globalAlpha = alpha;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.globalAlpha = 1;
  }

  private setFont(px: number): void {
    if (px === this.fontPx) return;
    this.fontPx = px;
    this.ctx.font = `${px}px ${FONT_FAMILY}`;
  }

  /** Draws one glyph centered in the square cell whose top-left corner is (x, y). */
  drawGlyph(ch: string, x: number, y: number, cell: number, fontPx: number, color: string): void {
    this.setFont(fontPx);
    this.ctx.fillStyle = color;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(ch, x + cell / 2, y + cell / 2);
  }

  /** Draws a line of text with its vertical center at `centerY`. */
  drawText(
    text: string,
    x: number,
    centerY: number,
    fontPx: number,
    color: string,
    align: 'left' | 'right' | 'center' = 'left',
  ): void {
    this.setFont(fontPx);
    this.ctx.fillStyle = color;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(text, x, centerY);
  }
}
