import { type Screen } from '../app/Screen';
import { type Dir } from '../core/geometry';
import { type GlyphRenderer } from '../render/glyph-renderer';
import { t } from '../i18n/i18n';
import { type ScreenContext } from './context';
import { TextMenu, type MenuItem } from './text-ui';

/**
 * Base for list menus: movement keys select (up/down) and change values (left/right), Enter or
 * Space activates, Esc goes back, and a tap activates the row under the finger.
 */
export abstract class MenuScreen implements Screen {
  protected readonly menu = new TextMenu();

  constructor(protected readonly ctx: ScreenContext) {}

  protected abstract title(): string;
  protected abstract items(): MenuItem[];
  protected abstract activate(index: number): void;

  protected subtitle(): string | undefined {
    return undefined;
  }
  /** Footer line; the default explains the keys, so it is left out on touch screens. */
  protected hint(): string | undefined {
    return this.ctx.isTouch() ? undefined : t('menuHint');
  }
  /** Left/right on a row (value rows cycle their value). */
  protected adjust(_index: number, _delta: 1 | -1): void {}
  /** Esc / back. */
  protected back(): void {}

  render(r: GlyphRenderer): void {
    this.menu.draw(r, this.ctx.getTheme(), {
      title: this.title(),
      subtitle: this.subtitle(),
      items: this.items(),
      hint: this.hint(),
    });
  }

  onMove(dir: Dir): void {
    switch (dir) {
      case 'N':
        this.menu.move(-1, this.items());
        break;
      case 'S':
        this.menu.move(1, this.items());
        break;
      case 'W':
        this.adjust(this.menu.selected, -1);
        break;
      case 'E':
        this.adjust(this.menu.selected, 1);
        break;
    }
    this.ctx.requestRender();
  }

  onKey(code: string): boolean {
    switch (code) {
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        this.activate(this.menu.selected);
        return true;
      case 'Escape':
        this.back();
        return true;
      default:
        return false;
    }
  }

  onPointerDown(x: number, y: number): void {
    const i = this.menu.hit(x, y);
    if (i < 0 || this.items()[i]?.disabled) return;
    this.menu.selected = i;
    this.activate(i);
  }
}

/** Next/previous entry of a list, wrapping around. */
export function cycle<T>(list: readonly T[], current: T, delta: 1 | -1): T {
  const i = list.indexOf(current);
  return list[(i + delta + list.length) % list.length] as T;
}
