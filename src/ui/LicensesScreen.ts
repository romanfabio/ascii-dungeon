import { type Screen } from '../app/Screen';
import { type Dir } from '../core/geometry';
import { t } from '../i18n/i18n';
import { type GlyphRenderer } from '../render/glyph-renderer';
import licenseText from '../../public/licenses/THIRD_PARTY_LICENSES.txt?raw';
import { type ScreenContext } from './context';
import { menuFontSize, wrapText } from './text-ui';

export interface LicensesScreenOptions {
  onBack(): void;
}

/** Monospace glyphs are about 0.6 em wide. */
const GLYPH_WIDTH_EM = 0.6;

/** Breaks the licence file into lines that fit `maxChars`; a rule of `=` or `-` shrinks to the width. */
export function licenseLines(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^(=+|-+)$/.test(paragraph)) lines.push(paragraph.slice(0, 1).repeat(maxChars));
    else if (paragraph.trim() === '') lines.push('');
    else {
      // A word longer than a line (a web address) is broken rather than run off the screen.
      for (const line of wrapText(paragraph, maxChars)) {
        for (let i = 0; i < line.length; i += maxChars) lines.push(line.slice(i, i + maxChars));
      }
    }
  }
  return lines;
}

/**
 * The licences of the game and of what it includes, as pages of text (the file also ships as
 * `licenses/THIRD_PARTY_LICENSES.txt`). Keys: up/down or space page through, Esc goes back. Touch: tap
 * the top bar to go back, the upper half of the page for the previous page and the lower half for the next.
 */
export class LicensesScreen implements Screen {
  private page = 0;
  private lastPages = 1;
  private topBar = { x: 0, y: 0, w: 0, h: 0 };
  private bodyMid = 0;

  constructor(
    private readonly ctx: ScreenContext,
    private readonly opts: LicensesScreenOptions,
  ) {}

  render(r: GlyphRenderer): void {
    const theme = this.ctx.getTheme();
    const base = Math.round(menuFontSize(r.width, r.height, r.dpr) * 0.7);
    const margin = Math.round(base * 0.8);
    const maxChars = Math.max(12, Math.floor((r.width - 2 * margin) / (base * GLYPH_WIDTH_EM)));
    const lineH = Math.round(base * 1.45);
    const barH = Math.round(base * 2.6);
    const lines = licenseLines(licenseText, maxChars);
    const perPage = Math.max(4, Math.floor((r.height - barH - margin) / lineH));
    this.lastPages = Math.max(1, Math.ceil(lines.length / perPage));
    this.page = Math.min(this.page, this.lastPages - 1);

    r.clear(theme.background);
    r.drawText(`< ${t('back')}`, margin, barH / 2, base, theme.exit, 'left');
    r.drawText(
      `${this.page + 1}/${this.lastPages}`,
      r.width - margin,
      barH / 2,
      base,
      theme.hudDim,
      'right',
    );
    this.topBar = { x: 0, y: 0, w: r.width, h: barH };
    this.bodyMid = barH + (r.height - barH) / 2;
    lines.slice(this.page * perPage, (this.page + 1) * perPage).forEach((line, i) => {
      if (line) r.drawText(line, margin, barH + i * lineH + lineH / 2, base, theme.hudText, 'left');
    });
  }

  private turn(delta: 1 | -1): void {
    this.page = Math.max(0, Math.min(this.lastPages - 1, this.page + delta));
    this.ctx.requestRender();
  }

  onMove(dir: Dir): void {
    this.turn(dir === 'N' || dir === 'W' ? -1 : 1);
  }

  onWait(): void {
    this.turn(1); // Space is the wait key
  }

  onKey(code: string): boolean {
    switch (code) {
      case 'Escape':
        this.opts.onBack();
        return true;
      case 'Space':
      case 'Enter':
      case 'NumpadEnter':
      case 'PageDown':
        this.turn(1);
        return true;
      case 'PageUp':
        this.turn(-1);
        return true;
      case 'Home':
        this.page = 0;
        this.ctx.requestRender();
        return true;
      default:
        return false;
    }
  }

  onPointerDown(x: number, y: number): void {
    const bar = this.topBar;
    if (y >= bar.y && y < bar.y + bar.h && x >= bar.x && x < bar.x + bar.w) this.opts.onBack();
    else this.turn(y < this.bodyMid ? -1 : 1);
  }
}
