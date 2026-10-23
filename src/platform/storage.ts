/**
 * Async key-value storage. The interface is async because the Android build uses Capacitor
 * Preferences (the WebView's localStorage can be cleared by the OS when space is low).
 */
export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** In-memory storage: used in tests, and as the fallback when localStorage is unavailable. */
export class MemoryStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  get(key: string): Promise<string | null> {
    return Promise.resolve(this.data.get(key) ?? null);
  }
  set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
    return Promise.resolve();
  }
  remove(key: string): Promise<void> {
    this.data.delete(key);
    return Promise.resolve();
  }
}

/**
 * Browser/desktop storage. Every access is wrapped in try/catch: localStorage can throw or come
 * back empty (private windows, blocked site data). Failures fall back to memory for the session.
 */
export class LocalStorageBackend implements KeyValueStorage {
  private readonly fallback = new MemoryStorage();

  async get(key: string): Promise<string | null> {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return this.fallback.get(key);
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      await this.fallback.set(key, value);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key);
    } catch {
      await this.fallback.remove(key);
    }
  }
}
