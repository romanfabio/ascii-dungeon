import { type Dir } from '../core/geometry';

export interface RepeatOptions {
  /** Wait before the first repeat after the initial move. */
  delayMs: number;
  /** Time between repeats while held. */
  intervalMs: number;
}

export const DEFAULT_REPEAT: RepeatOptions = { delayMs: 180, intervalMs: 90 };

/**
 * Turns "direction pressed/released" from any source (keyboard, D-pad, swipe) into move events:
 * one move on press, then auto-repeat while held. Uses its own timing instead of the OS key
 * repeat so behavior is identical everywhere. With several directions held, the most recently
 * pressed one wins; releasing it falls back to the previous one.
 */
export class InputManager {
  private held: Dir[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onMove: (dir: Dir) => void,
    private repeat: RepeatOptions = DEFAULT_REPEAT,
  ) {}

  setRepeat(repeat: RepeatOptions): void {
    this.repeat = repeat;
  }

  press(dir: Dir): void {
    if (this.held.includes(dir)) return;
    this.held.push(dir);
    this.onMove(dir);
    this.scheduleRepeat(this.repeat.delayMs);
  }

  release(dir: Dir): void {
    const wasActive = this.held[this.held.length - 1] === dir;
    this.held = this.held.filter((d) => d !== dir);
    if (!wasActive) return;
    this.cancelTimer();
    if (this.held.length > 0) this.scheduleRepeat(this.repeat.delayMs);
  }

  releaseAll(): void {
    this.held = [];
    this.cancelTimer();
  }

  dispose(): void {
    this.releaseAll();
  }

  private scheduleRepeat(afterMs: number): void {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      const dir = this.held[this.held.length - 1];
      if (dir === undefined) return;
      this.onMove(dir);
      this.scheduleRepeat(this.repeat.intervalMs);
    }, afterMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
