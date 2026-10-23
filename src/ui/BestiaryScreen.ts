import { type BestiaryTypeId, BESTIARY_TYPES } from '../core/bestiary';
import { ENEMY_DEFS } from '../core/enemy-defs';
import { type Dir } from '../core/geometry';
import { type TextKey } from '../i18n/en';
import { t } from '../i18n/i18n';
import { type GlyphRenderer } from '../render/glyph-renderer';
import { type ScreenContext } from './context';
import { MenuScreen } from './MenuScreen';
import { menuFontSize, wrapText, type MenuItem } from './text-ui';

export interface BestiaryScreenOptions {
  /** The types the player has met. */
  seen: readonly BestiaryTypeId[];
  onBack(): void;
}

/** The three texts of every entry (`en.ts`: `beastGhost`, `beastGhostText`, `beastGhostTell`). */
function textKeys(type: BestiaryTypeId): { name: TextKey; text: TextKey; tell: TextKey } {
  const stem = `beast${type[0]?.toUpperCase()}${type.slice(1)}`;
  return { name: stem as TextKey, text: `${stem}Text` as TextKey, tell: `${stem}Tell` as TextKey };
}

/** What an entry shows: the Mimic as what it turns into, the others as they are drawn. */
function glyphOf(type: BestiaryTypeId): string {
  return type === 'mimic' ? 'M' : ENEMY_DEFS[type].glyph;
}

/**
 * The Bestiary: the enemy types the player has met, as a list; an entry opens to what the type
 * does and how to recognise it. Types not met yet stay hidden (only a count shows).
 */
export class BestiaryScreen extends MenuScreen {
  private detail: BestiaryTypeId | null = null;

  constructor(
    ctx: ScreenContext,
    private readonly opts: BestiaryScreenOptions,
  ) {
    super(ctx);
  }

  private entries(): BestiaryTypeId[] {
    return BESTIARY_TYPES.filter((type) => this.opts.seen.includes(type));
  }

  protected title(): string {
    return t('bestiaryTitle');
  }

  protected override subtitle(): string {
    return t('bestiaryCount', { met: this.entries().length, total: BESTIARY_TYPES.length });
  }

  protected items(): MenuItem[] {
    const entries = this.entries();
    if (entries.length === 0) return [{ label: t('bestiaryEmpty'), disabled: true }];
    return entries.map((type) => ({ label: `${glyphOf(type)}  ${t(textKeys(type).name)}` }));
  }

  protected activate(index: number): void {
    const type = this.entries()[index];
    if (!type) return;
    this.detail = type;
    this.ctx.requestRender();
  }

  protected override back(): void {
    if (this.detail === null) {
      this.opts.onBack();
      return;
    }
    this.detail = null;
    this.ctx.requestRender();
  }

  protected override hint(): string | undefined {
    return this.ctx.isTouch() ? undefined : t('bestiaryHint');
  }

  override render(r: GlyphRenderer): void {
    if (this.detail === null) {
      super.render(r);
      return;
    }
    const theme = this.ctx.getTheme();
    const keys = textKeys(this.detail);
    const width = r.width * 0.86;
    // Shrink the text until the whole entry fits under the glyph.
    let base = menuFontSize(r.width, r.height, r.dpr);
    let body: string[] = [];
    let tell: string[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      const maxChars = Math.max(10, Math.floor(width / (base * 0.6)));
      body = wrapText(t(keys.text), maxChars);
      tell = wrapText(`${t('bestiaryTellLabel')} ${t(keys.tell)}`, maxChars);
      const lines = body.length + tell.length + 1;
      if (base * 1.5 * lines + base * 7 <= r.height * 0.92 || base <= 9) break;
      base = Math.round(base * 0.88);
    }
    const line = Math.round(base * 1.5);
    const total = Math.round(base * 6) + (body.length + tell.length + 1) * line;
    let y = Math.max(base, Math.round((r.height - total) / 2));
    const cx = Math.round(r.width / 2);

    r.clear(theme.background);
    r.drawText(
      glyphOf(this.detail),
      cx,
      y + base * 1.6,
      Math.round(base * 3),
      theme.enemyMobile,
      'center',
    );
    y += Math.round(base * 3.6);
    r.drawText(t(keys.name), cx, y + base, Math.round(base * 1.6), theme.exit, 'center');
    y += Math.round(base * 2.4);
    for (const text of body) {
      r.drawText(text, cx, y + line / 2, base, theme.hudText, 'center');
      y += line;
    }
    y += Math.round(line * 0.5);
    for (const text of tell) {
      r.drawText(text, cx, y + line / 2, base, theme.enemyWarn, 'center');
      y += line;
    }
  }

  override onMove(dir: Dir): void {
    if (this.detail === null) {
      super.onMove(dir);
      return;
    }
    // Left and right page through the entries.
    const entries = this.entries();
    const at = entries.indexOf(this.detail);
    if (dir === 'E' || dir === 'S') this.detail = entries[(at + 1) % entries.length] ?? this.detail;
    if (dir === 'W' || dir === 'N') {
      this.detail = entries[(at - 1 + entries.length) % entries.length] ?? this.detail;
    }
    this.menu.selected = Math.max(0, entries.indexOf(this.detail));
    this.ctx.requestRender();
  }

  override onKey(code: string): boolean {
    if (this.detail !== null && ['Enter', 'NumpadEnter', 'Space'].includes(code)) {
      this.back();
      return true;
    }
    return super.onKey(code);
  }

  override onPointerDown(x: number, y: number): void {
    if (this.detail !== null) {
      this.back();
      return;
    }
    super.onPointerDown(x, y);
  }
}
