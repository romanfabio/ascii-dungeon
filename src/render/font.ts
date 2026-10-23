import fontUrl from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';

export const FONT_FAMILY =
  '"Ascii Dungeon Mono", "JetBrains Mono", ui-monospace, Consolas, monospace';

/**
 * Loads the bundled monospace font so every platform renders identical glyphs. Resolves even if
 * loading fails (the CSS fallback monospace fonts are used then).
 */
export async function loadFont(): Promise<void> {
  try {
    const face = new FontFace('Ascii Dungeon Mono', `url(${fontUrl})`);
    document.fonts.add(await face.load());
  } catch (err) {
    console.warn('Could not load the bundled font, using fallback.', err);
  }
}
