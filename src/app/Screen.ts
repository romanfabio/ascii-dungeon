import { type Dir } from '../core/geometry';
import { type GlyphRenderer } from '../render/glyph-renderer';

/** One full-canvas view of the game (play, menus, transitions). All hooks except render are optional. */
export interface Screen {
  render(r: GlyphRenderer): void;
  /** A movement direction was pressed (or auto-repeated while held). */
  onMove?(dir: Dir): void;
  /** A non-movement key was pressed. Return true if handled (suppresses the browser default). */
  onKey?(code: string): boolean;
  /** The player chose to wait a turn (key or D-pad centre). Screens without turns omit it. */
  onWait?(): void;
  /** While true, every key press is delivered to onKey and none acts as movement (rebinding). */
  readonly captureKeys?: boolean;
  /** A click or tap, in canvas device pixels. */
  onPointerDown?(x: number, y: number): void;
  /** The pressed pointer moved (only while it is held down). */
  onPointerMove?(x: number, y: number): void;
  onPointerUp?(): void;
  /** Called about 4 times a second while visible, with a monotonic timestamp in ms. */
  tick?(nowMs: number): void;
  /** The page was hidden / shown again; time-keeping screens pause and resume. */
  onSuspend?(nowMs: number): void;
  onResume?(nowMs: number): void;
}
