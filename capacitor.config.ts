import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.asciidungeon.game',
  appName: 'Ascii Dungeon',
  webDir: 'dist',
  backgroundColor: '#0d0f12',
  plugins: {
    SystemBars: {
      // Immersive: the game covers the whole screen; swiping from an edge shows the bars briefly.
      hidden: true,
      style: 'DARK',
      // Older WebViews report wrong safe-area values; Capacitor pads the view or injects CSS vars.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
