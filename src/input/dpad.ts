import { DIRS, type Dir } from '../core/geometry';
import { dpadGeometry, type DpadSize, type Rect } from '../render/layout';
import { type Theme } from '../render/themes';
import { FONT_FAMILY } from '../render/font';
import { type DirectionSink } from './swipe';

const LABELS: Record<Dir, string> = { N: '^', E: '>', S: 'v', W: '<' };
const ARIA: Record<Dir, string> = { N: 'Up', E: 'Right', S: 'Down', W: 'Left' };

/**
 * On-screen D-pad: four real buttons laid over the canvas, so touch (including several fingers
 * at once) works natively. Holding a button repeats the move through the input manager. The
 * centre button waits one turn (a tap, no repeat).
 */
export class Dpad {
  private readonly root: HTMLDivElement;
  private readonly buttons = new Map<Dir, HTMLButtonElement>();
  private readonly waitButton: HTMLButtonElement;

  constructor(parent: HTMLElement, sink: DirectionSink, onWait: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'dpad';
    this.root.hidden = true;
    for (const dir of DIRS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dpad-btn';
      button.textContent = LABELS[dir];
      button.setAttribute('aria-label', ARIA[dir]);
      button.tabIndex = -1; // keys drive the game; don't steal focus
      const release = (): void => {
        button.classList.remove('active');
        sink.release(dir);
      };
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        button.classList.add('active');
        sink.press(dir);
      });
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('contextmenu', (e) => e.preventDefault());
      this.buttons.set(dir, button);
      this.root.appendChild(button);
    }
    this.waitButton = document.createElement('button');
    this.waitButton.type = 'button';
    this.waitButton.className = 'dpad-btn';
    this.waitButton.textContent = '.';
    this.waitButton.setAttribute('aria-label', 'Wait');
    this.waitButton.tabIndex = -1;
    const waitButton = this.waitButton;
    waitButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      waitButton.setPointerCapture(e.pointerId);
      waitButton.classList.add('active');
      onWait();
    });
    const waitRelease = (): void => waitButton.classList.remove('active');
    waitButton.addEventListener('pointerup', waitRelease);
    waitButton.addEventListener('pointercancel', waitRelease);
    waitButton.addEventListener('lostpointercapture', waitRelease);
    waitButton.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.appendChild(waitButton);
    parent.appendChild(this.root);
  }

  /** Shows the D-pad centered in `area` (CSS pixels) at the given size. */
  show(area: Rect, size: DpadSize, theme: Theme): void {
    const geometry = dpadGeometry(area, size);
    this.root.hidden = false;
    const place = (button: HTMLButtonElement, rect: Rect): void => {
      const gap = Math.max(2, Math.round(rect.w * 0.04));
      const s = button.style;
      s.left = `${rect.x + gap}px`;
      s.top = `${rect.y + gap}px`;
      s.width = `${rect.w - 2 * gap}px`;
      s.height = `${rect.h - 2 * gap}px`;
      s.fontSize = `${Math.round(rect.w * 0.45)}px`;
      s.fontFamily = FONT_FAMILY;
      s.color = theme.hudText;
      s.borderColor = theme.wallRemembered;
      s.setProperty('--dpad-active', theme.floorRemembered);
    };
    for (const dir of DIRS) place(this.buttons.get(dir) as HTMLButtonElement, geometry[dir]);
    place(this.waitButton, geometry.wait);
  }

  hide(): void {
    this.root.hidden = true;
  }
}
