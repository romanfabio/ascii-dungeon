import { type Dir } from '../core/geometry';

export interface DirectionSink {
  press(dir: Dir): void;
  release(dir: Dir): void;
}

/**
 * Turns a finger drag into movement. Dragging further than `threshold` from where the gesture
 * started (or from where the direction last changed) presses that direction: a quick flick moves
 * one tile, while keeping the finger down keeps walking that way (via the input manager's
 * auto-repeat). Dragging the other way past the threshold switches direction; lifting stops.
 */
export class SwipeDetector {
  private anchor: { x: number; y: number } | null = null;
  private active: Dir | null = null;

  constructor(
    private readonly sink: DirectionSink,
    private threshold: number,
  ) {}

  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  down(x: number, y: number): void {
    this.up();
    this.anchor = { x, y };
  }

  move(x: number, y: number): void {
    if (!this.anchor) return;
    const dx = x - this.anchor.x;
    const dy = y - this.anchor.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < this.threshold) return;

    const dir: Dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : dy > 0 ? 'S' : 'N';
    if (dir === this.active) return;
    if (this.active) this.sink.release(this.active);
    this.active = dir;
    this.anchor = { x, y };
    this.sink.press(dir);
  }

  up(): void {
    if (this.active) this.sink.release(this.active);
    this.active = null;
    this.anchor = null;
  }
}
