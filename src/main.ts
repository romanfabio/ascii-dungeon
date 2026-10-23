import { App } from './app/App';
import { attachNativeLifecycle, createStorage } from './platform/platform';
import { loadFont } from './render/font';
import { SaveStore, SettingsStore } from './save/stores';

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const params = new URLSearchParams(window.location.search);

  // ?seed=ABC123&floor=5 jumps straight into a specific floor for debugging; it never touches
  // the saved run.
  const debugStart =
    params.has('seed') || params.has('floor')
      ? {
          seed: params.get('seed') || undefined,
          floor: Math.max(1, Number.parseInt(params.get('floor') ?? '1', 10) || 1),
        }
      : undefined;

  const storage = await createStorage();
  const [settings, save] = await Promise.all([
    SettingsStore.load(storage),
    SaveStore.load(storage),
    loadFont(),
  ]);
  const app = new App(canvas, { settings, save, debugStart });
  app.start();

  await attachNativeLifecycle({
    onBackButton: () => app.handleBackButton(),
    onBackground: () => app.autoPause(),
  });
}

void main();
