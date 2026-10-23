import { type BestiaryTypeId } from '../core/bestiary';
import { GENERATOR_VERSION } from '../gen/generate-floor';
import { type KeyValueStorage } from '../platform/storage';
import { parseSave, SAVE_VERSION, type RunSave, type SaveData } from './save';
import { parseSettings, type Settings } from './settings';

export const SETTINGS_KEY = 'ascii-dungeon.settings';
export const SAVE_KEY = 'ascii-dungeon.save';

/** Serializes writes so they land in order; failures are swallowed (storage is best-effort). */
class WriteQueue {
  private pending: Promise<void> = Promise.resolve();
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly key: string,
  ) {}
  write(value: unknown): void {
    const json = JSON.stringify(value);
    this.pending = this.pending
      .then(() => this.storage.set(this.key, json))
      .catch((err: unknown) => console.warn(`Could not save ${this.key}`, err));
  }
  flush(): Promise<void> {
    return this.pending;
  }
}

/** Settings held in memory, written through to storage, with change notifications. */
export class SettingsStore {
  private readonly listeners = new Set<() => void>();
  private readonly queue: WriteQueue;

  private constructor(
    private current: Settings,
    storage: KeyValueStorage,
  ) {
    this.queue = new WriteQueue(storage, SETTINGS_KEY);
  }

  static async load(storage: KeyValueStorage): Promise<SettingsStore> {
    let json: string | null = null;
    try {
      json = await storage.get(SETTINGS_KEY);
    } catch {
      // unreadable storage: start from defaults
    }
    return new SettingsStore(parseSettings(json), storage);
  }

  get(): Settings {
    return this.current;
  }

  update(patch: Partial<Omit<Settings, 'version'>>): void {
    this.current = { ...this.current, ...patch };
    this.queue.write(this.current);
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  flush(): Promise<void> {
    return this.queue.flush();
  }
}

/** The run in progress and records, held in memory and written through to storage. */
export class SaveStore {
  private readonly queue: WriteQueue;

  private constructor(
    private data: SaveData,
    storage: KeyValueStorage,
  ) {
    this.queue = new WriteQueue(storage, SAVE_KEY);
  }

  static async load(storage: KeyValueStorage): Promise<SaveStore> {
    let json: string | null = null;
    try {
      json = await storage.get(SAVE_KEY);
    } catch {
      // unreadable storage: start from an empty save
    }
    return new SaveStore(parseSave(json), storage);
  }

  get run(): RunSave | null {
    return this.data.run;
  }

  get deepestFloor(): number {
    return this.data.records.deepestFloor;
  }

  /** The enemy types met so far (the Bestiary's entries). */
  get seenTypes(): readonly BestiaryTypeId[] {
    return this.data.records.seenTypes;
  }

  /** Remembers enemy types the player has met; a type already known changes nothing. */
  recordSeenTypes(types: readonly BestiaryTypeId[]): void {
    const fresh = types.filter((t) => !this.data.records.seenTypes.includes(t));
    if (fresh.length === 0) return;
    this.data = {
      ...this.data,
      records: { ...this.data.records, seenTypes: [...this.data.records.seenTypes, ...fresh] },
    };
    this.queue.write(this.data);
  }

  /**
   * Autosave: at the start of a floor and right after every life lost. Remembers the run and
   * updates the deepest-floor record.
   */
  recordFloor(run: RunSave): void {
    this.data = {
      version: SAVE_VERSION,
      generatorVersion: GENERATOR_VERSION,
      run,
      records: {
        ...this.data.records,
        deepestFloor: Math.max(this.data.records.deepestFloor, run.floor),
      },
    };
    this.queue.write(this.data);
  }

  /** Game Over: the run is gone (no Continue), the deepest-floor record stays. */
  clearRun(): void {
    this.data = { ...this.data, run: null };
    this.queue.write(this.data);
  }

  flush(): Promise<void> {
    return this.queue.flush();
  }
}
