import { type Insets } from './layout';

let probe: HTMLDivElement | null = null;

/**
 * Notch / system-bar insets in CSS pixels. CSS `env(safe-area-inset-*)` can't be read from script
 * directly, so a hidden element padded by those values is measured instead.
 */
export function readSafeAreaInsets(): Insets {
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
      'env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
  }
  const style = getComputedStyle(probe);
  const px = (value: string): number => Number.parseFloat(value) || 0;
  return {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
}
