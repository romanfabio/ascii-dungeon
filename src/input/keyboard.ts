import { type Dir } from '../core/geometry';
import { buildKeyMap, type MoveBindings } from './bindings';
import { type InputManager } from './input-manager';

export interface KeyboardOptions {
  /** Current movement bindings; read on every event so rebinding takes effect immediately. */
  getBindings: () => MoveBindings;
  /** Any non-movement key press (not auto-repeat). Return true if handled. */
  onKey?: (code: string) => boolean;
  /** Keys that wait one turn; read on every event. */
  getWaitKeys?: () => readonly string[];
  /** Wait was pressed: the current screen acts. Returns false if it has no use for waiting. */
  onWait?: () => boolean;
  /** Would the current screen use a wait? (decides whether auto-repeat of the key is swallowed) */
  canWait?: () => boolean;
  /** While true (rebinding), every key press goes to `onKey` and none is treated as movement. */
  isCapturing?: () => boolean;
}

/** Feeds keyboard movement keys into the InputManager. Returns a function that detaches it. */
export function attachKeyboard(
  target: Window,
  input: InputManager,
  opts: KeyboardOptions,
): () => void {
  let cachedFor: MoveBindings | null = null;
  let keyMap = new Map<string, Dir>();
  const currentMap = (): Map<string, Dir> => {
    const bindings = opts.getBindings();
    if (bindings !== cachedFor) {
      cachedFor = bindings;
      keyMap = buildKeyMap(bindings);
    }
    return keyMap;
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (opts.isCapturing?.()) {
      if (!e.repeat && opts.onKey?.(e.code)) e.preventDefault();
      return;
    }
    const dir = currentMap().get(e.code);
    if (dir) {
      e.preventDefault();
      if (!e.repeat) input.press(dir); // OS key repeat is ignored: the manager repeats itself
    } else if (opts.getWaitKeys?.().includes(e.code) && (opts.canWait?.() ?? false)) {
      e.preventDefault();
      if (!e.repeat) opts.onWait?.(); // one turn per press: holding the key does not keep waiting
    } else if (opts.onKey && !e.repeat && opts.onKey(e.code)) {
      e.preventDefault();
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    const dir = currentMap().get(e.code);
    if (!dir) return;
    e.preventDefault();
    input.release(dir);
  };
  const onBlur = (): void => input.releaseAll();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
    target.removeEventListener('keyup', onKeyUp);
    target.removeEventListener('blur', onBlur);
  };
}
