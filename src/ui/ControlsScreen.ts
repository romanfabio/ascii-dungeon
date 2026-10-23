import { DIRS, type Dir } from '../core/geometry';
import { type TextKey } from '../i18n/en';
import { t } from '../i18n/i18n';
import {
  assignKey,
  assignWaitKey,
  cloneBindings,
  DEFAULT_MOVE_BINDINGS,
  DEFAULT_WAIT_KEYS,
  keyName,
} from '../input/bindings';
import { type ScreenContext } from './context';
import { MenuScreen } from './MenuScreen';
import { type MenuItem } from './text-ui';

const DIR_LABELS: Record<Dir, TextKey> = {
  N: 'moveUp',
  E: 'moveRight',
  S: 'moveDown',
  W: 'moveLeft',
};

export interface ControlsScreenOptions {
  onBack(): void;
}

/** What a row rebinds: a direction, or the wait key. */
type Target = Dir | 'wait';

const ROWS: readonly Target[] = [...DIRS, 'wait'];

function labelOf(target: Target): TextKey {
  return target === 'wait' ? 'waitAction' : DIR_LABELS[target];
}

/** Key rebinding: pick an action, press the new key. Esc cancels. */
export class ControlsScreen extends MenuScreen {
  private capturing: Target | null = null;
  private message: string | null = null;

  constructor(
    ctx: ScreenContext,
    private readonly opts: ControlsScreenOptions,
  ) {
    super(ctx);
  }

  get captureKeys(): boolean {
    return this.capturing !== null;
  }

  protected title(): string {
    return t('controlsTitle');
  }

  protected items(): MenuItem[] {
    const { bindings, waitKeys } = this.ctx.settings.get();
    const rows: MenuItem[] = ROWS.map((target) => ({
      label: t(labelOf(target)),
      value:
        this.capturing === target
          ? '...'
          : (target === 'wait' ? waitKeys : bindings[target]).map(keyName).join(' / '),
    }));
    rows.push({ label: t('resetControls') }, { label: t('back') });
    return rows;
  }

  protected override hint(): string | undefined {
    if (this.message) return this.message;
    return this.capturing ? t('pressKey') : super.hint();
  }

  protected activate(index: number): void {
    this.message = null;
    const target = ROWS[index];
    if (target) {
      this.capturing = target;
    } else if (index === ROWS.length) {
      this.ctx.settings.update({
        bindings: cloneBindings(DEFAULT_MOVE_BINDINGS),
        waitKeys: [...DEFAULT_WAIT_KEYS],
      });
    } else {
      this.opts.onBack();
    }
  }

  protected override back(): void {
    this.opts.onBack();
  }

  override onKey(code: string): boolean {
    const target = this.capturing;
    if (target === null) return super.onKey(code);

    if (code === 'Escape') {
      this.capturing = null;
      this.message = null;
    } else {
      const { bindings, waitKeys } = this.ctx.settings.get();
      if (target === 'wait') {
        const result = assignWaitKey(waitKeys, bindings, code);
        if (result.ok) this.ctx.settings.update({ waitKeys: result.waitKeys });
        this.finishCapture(result.ok ? null : result);
      } else {
        const result = assignKey(bindings, target, code, waitKeys);
        if (result.ok) this.ctx.settings.update({ bindings: result.bindings });
        this.finishCapture(result.ok ? null : result);
      }
    }
    this.ctx.requestRender();
    return true;
  }

  /** Ends the capture after a successful change, or explains why the key was refused. */
  private finishCapture(
    refusal: { reason: 'reserved' } | { reason: 'inUse'; dir: Target } | null,
  ): void {
    if (refusal === null) {
      this.capturing = null;
      this.message = null;
    } else if (refusal.reason === 'reserved') {
      this.message = t('keyReserved');
    } else {
      this.message = t('keyInUse', { action: t(labelOf(refusal.dir)) });
    }
  }

  override onPointerDown(x: number, y: number): void {
    if (this.capturing !== null) {
      this.capturing = null; // a tap cancels capture
      this.ctx.requestRender();
      return;
    }
    super.onPointerDown(x, y);
  }
}
