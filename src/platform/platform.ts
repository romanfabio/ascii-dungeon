import { Capacitor } from '@capacitor/core';
import { LocalStorageBackend, type KeyValueStorage } from './storage';

/** True inside the Capacitor (Android) shell, false in a browser or desktop webview. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * The right persistent storage for this platform: Capacitor Preferences on Android (the
 * WebView's localStorage can be cleared by the OS when space is low), localStorage elsewhere.
 * Native plugins are imported lazily so the web build doesn't carry them.
 */
export async function createStorage(): Promise<KeyValueStorage> {
  if (!isNativeApp()) return new LocalStorageBackend();
  const { Preferences } = await import('@capacitor/preferences');
  return {
    get: async (key) => (await Preferences.get({ key })).value,
    set: (key, value) => Preferences.set({ key, value }),
    remove: (key) => Preferences.remove({ key }),
  };
}

export interface NativeLifecycleHandlers {
  /** Android back button. Return false if nothing is left to go back to (the app then exits). */
  onBackButton(): boolean;
  /** The app went to the background. */
  onBackground(): void;
}

/** Hooks the Android back button and background events. Does nothing outside the native app. */
export async function attachNativeLifecycle(handlers: NativeLifecycleHandlers): Promise<void> {
  if (!isNativeApp()) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    if (!handlers.onBackButton()) void App.exitApp();
  });
  await App.addListener('pause', () => handlers.onBackground());
}
