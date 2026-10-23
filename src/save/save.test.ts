import { describe, expect, it } from 'vitest';
import { DEFAULT_MOVE_BINDINGS } from '../input/bindings';
import { MemoryStorage } from '../platform/storage';
import { parseAndMigrate } from './migrate';
import { defaultSave, parseSave } from './save';
import {
  defaultSettings,
  parseSettings,
  repeatPresetOf,
  REPEAT_PRESETS,
  SETTINGS_VERSION,
} from './settings';
import { SAVE_KEY, SaveStore, SETTINGS_KEY, SettingsStore } from './stores';

describe('parseAndMigrate', () => {
  const migrations = {
    1: (old: Record<string, unknown>) => ({ ...old, b: 'added-in-v2' }),
    2: (old: Record<string, unknown>) => ({ ...old, c: Number(old.a) * 2 }),
  };

  it('returns null for missing, corrupt, wrong-shaped or versionless data', () => {
    expect(parseAndMigrate(null, 1)).toBeNull();
    expect(parseAndMigrate('{nope', 1)).toBeNull();
    expect(parseAndMigrate('[1,2]', 1)).toBeNull();
    expect(parseAndMigrate('"str"', 1)).toBeNull();
    expect(parseAndMigrate('{"a":1}', 1)).toBeNull();
    expect(parseAndMigrate('{"version":0}', 1)).toBeNull();
  });

  it('returns current-version data untouched', () => {
    expect(parseAndMigrate('{"version":1,"a":5}', 1)).toEqual({ version: 1, a: 5 });
  });

  it('applies migrations step by step', () => {
    expect(parseAndMigrate('{"version":1,"a":5}', 3, migrations)).toEqual({
      version: 3,
      a: 5,
      b: 'added-in-v2',
      c: 10,
    });
  });

  it('rejects data from a newer build and data with a missing migration step', () => {
    expect(parseAndMigrate('{"version":4}', 3, migrations)).toBeNull();
    expect(parseAndMigrate('{"version":1}', 3, { 2: migrations[2] })).toBeNull();
  });
});

describe('parseSettings', () => {
  it('defaults for missing or corrupt data', () => {
    expect(parseSettings(null)).toEqual(defaultSettings());
    expect(parseSettings('garbage')).toEqual(defaultSettings());
  });

  it('round-trips valid settings', () => {
    const s = {
      ...defaultSettings(),
      language: 'it' as const,
      theme: 'colorblind' as const,
      repeatDelayMs: 250,
      repeatIntervalMs: 130,
    };
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });

  it('repairs individual bad fields without losing the good ones', () => {
    const parsed = parseSettings(
      JSON.stringify({
        version: SETTINGS_VERSION,
        language: 'klingon',
        theme: 'high-contrast',
        dpadSize: 'XL',
        repeatDelayMs: 'fast',
        repeatIntervalMs: 99999,
      }),
    );
    expect(parsed.language).toBe('auto');
    expect(parsed.theme).toBe('high-contrast');
    expect(parsed.dpadSize).toBe('M');
    expect(parsed.repeatDelayMs).toBe(180);
    expect(parsed.repeatIntervalMs).toBe(500);
  });

  it('falls back to default bindings when stored ones conflict', () => {
    const bad = { ...defaultSettings(), bindings: { ...DEFAULT_MOVE_BINDINGS, E: ['KeyW'] } };
    expect(parseSettings(JSON.stringify(bad)).bindings).toEqual(DEFAULT_MOVE_BINDINGS);
  });

  it('keeps custom valid bindings', () => {
    const custom = { N: ['KeyI'], E: ['KeyL'], S: ['KeyK'], W: ['KeyJ'] };
    const parsed = parseSettings(JSON.stringify({ ...defaultSettings(), bindings: custom }));
    expect(parsed.bindings).toEqual(custom);
  });

  it('maps timings to the closest repeat preset', () => {
    expect(repeatPresetOf(defaultSettings())).toBe('normal');
    expect(
      repeatPresetOf({ ...defaultSettings(), repeatIntervalMs: REPEAT_PRESETS.fast.intervalMs }),
    ).toBe('fast');
    expect(repeatPresetOf({ ...defaultSettings(), repeatIntervalMs: 200 })).toBe('slow');
  });
});

describe('parseSave', () => {
  it('defaults for missing or corrupt data', () => {
    expect(parseSave(null)).toEqual(defaultSave());
    expect(parseSave('{{')).toEqual(defaultSave());
  });

  it('reads a valid v2 run and records', () => {
    const save = {
      version: 2,
      generatorVersion: 1,
      run: {
        seed: 'ABC123',
        floor: 7,
        totalSteps: 420,
        totalTimeMs: 99000,
        lives: 2,
        deaths: 4,
        lifePickups: [10, 20],
      },
      records: { deepestFloor: 9, seenTypes: ['bloodstone'] },
    };
    expect(parseSave(JSON.stringify(save))).toEqual(save);
  });

  it('migrates a v1 save: the run continues with full lives and no deaths', () => {
    const json = JSON.stringify({
      version: 1,
      generatorVersion: 1,
      run: { seed: 'ABC123', floor: 7, totalSteps: 420, totalTimeMs: 99000 },
      records: { deepestFloor: 9 },
    });
    expect(parseSave(json)).toEqual({
      version: 2,
      generatorVersion: 1,
      run: {
        seed: 'ABC123',
        floor: 7,
        totalSteps: 420,
        totalTimeMs: 99000,
        lives: 3,
        deaths: 0,
        lifePickups: [],
      },
      records: { deepestFloor: 9, seenTypes: [] },
    });
  });

  it('migrates a v1 save that has no run', () => {
    const json = JSON.stringify({ version: 1, run: null, records: { deepestFloor: 3 } });
    const parsed = parseSave(json);
    expect(parsed.run).toBeNull();
    expect(parsed.records.deepestFloor).toBe(3);
  });

  it('repairs lives: too many are capped, missing ones become full, none drops the run', () => {
    const run = { seed: 'X', floor: 2, totalSteps: 0, totalTimeMs: 0 };
    const load = (extra: object) =>
      parseSave(JSON.stringify({ version: 2, run: { ...run, ...extra }, records: {} })).run;
    expect(load({ lives: 9, deaths: 1 })?.lives).toBe(3);
    expect(load({ lives: 'two' })?.lives).toBe(3);
    expect(load({ lives: 2.9 })?.lives).toBe(2);
    expect(load({ lives: 2, deaths: -5 })?.deaths).toBe(0);
    expect(load({ lives: 0 })).toBeNull();
  });

  it('repairs the list of taken life pickups: missing, junk or duplicates', () => {
    const run = { seed: 'X', floor: 12, totalSteps: 0, totalTimeMs: 0 };
    const load = (extra: object) =>
      parseSave(JSON.stringify({ version: 2, run: { ...run, ...extra }, records: {} })).run;
    expect(load({})?.lifePickups).toEqual([]);
    expect(load({ lifePickups: 'ten' })?.lifePickups).toEqual([]);
    expect(load({ lifePickups: [10, 10, 'x', -3, 2.5, 0, 20] })?.lifePickups).toEqual([10, 20]);
  });

  it('drops invalid runs but keeps records', () => {
    for (const run of [
      { seed: '', floor: 3, totalSteps: 0, totalTimeMs: 0 },
      { seed: 'X', floor: 0, totalSteps: 0, totalTimeMs: 0 },
      { seed: 'X', floor: 1.5, totalSteps: 0, totalTimeMs: 0 },
      { seed: 'X', floor: 2, totalSteps: -1, totalTimeMs: 0 },
      { seed: 'X', floor: 2, totalSteps: 'many', totalTimeMs: 0 },
      'nope',
    ]) {
      const parsed = parseSave(JSON.stringify({ version: 2, run, records: { deepestFloor: 4 } }));
      expect(parsed.run).toBeNull();
      expect(parsed.records.deepestFloor).toBe(4);
    }
  });
});

describe('stores', () => {
  it('SettingsStore persists updates, notifies and reloads', async () => {
    const storage = new MemoryStorage();
    const store = await SettingsStore.load(storage);
    let notified = 0;
    const unsubscribe = store.subscribe(() => notified++);

    store.update({ language: 'it', theme: 'high-contrast' });
    await store.flush();
    expect(notified).toBe(1);
    expect(JSON.parse(storage.data.get(SETTINGS_KEY) as string)).toMatchObject({
      language: 'it',
      theme: 'high-contrast',
    });

    unsubscribe();
    store.update({ theme: 'default' });
    expect(notified).toBe(1);
    await store.flush();

    const reloaded = await SettingsStore.load(storage);
    expect(reloaded.get().language).toBe('it');
    expect(reloaded.get().theme).toBe('default');
  });

  it('reads the Bestiary list, dropping unknown and repeated names', () => {
    const parsed = parseSave(
      JSON.stringify({
        version: 2,
        run: null,
        records: { deepestFloor: 4, seenTypes: ['ghost', 'dragon', 'ghost', 'brood', 7, 'mimic'] },
      }),
    );
    expect(parsed.records.seenTypes).toEqual(['ghost', 'mimic']);
    expect(
      parseSave(JSON.stringify({ version: 2, run: null, records: {} })).records.seenTypes,
    ).toEqual([]);
  });

  it('SaveStore remembers the types met, keeps them across floors and reloads', async () => {
    const storage = new MemoryStorage();
    const store = await SaveStore.load(storage);
    expect(store.seenTypes).toEqual([]);
    store.recordSeenTypes(['bloodstone', 'patroller']);
    store.recordSeenTypes(['patroller', 'wanderer']); // only the new one is added
    store.recordFloor({
      seed: 'S',
      floor: 2,
      totalSteps: 1,
      totalTimeMs: 1,
      lives: 3,
      deaths: 0,
      lifePickups: [],
    });
    store.clearRun();
    await store.flush();
    expect(store.seenTypes).toEqual(['bloodstone', 'patroller', 'wanderer']);
    const reloaded = await SaveStore.load(storage);
    expect(reloaded.seenTypes).toEqual(['bloodstone', 'patroller', 'wanderer']);
  });

  it('SaveStore records floors, tracks the deepest and reloads', async () => {
    const storage = new MemoryStorage();
    const store = await SaveStore.load(storage);
    expect(store.run).toBeNull();
    expect(store.deepestFloor).toBe(0);

    store.recordFloor({
      seed: 'S',
      floor: 5,
      totalSteps: 100,
      totalTimeMs: 5000,
      lives: 3,
      deaths: 0,
      lifePickups: [],
    });
    store.recordFloor({
      seed: 'S',
      floor: 3,
      totalSteps: 40,
      totalTimeMs: 2000,
      lives: 2,
      deaths: 1,
      lifePickups: [10],
    }); // e.g. a restart
    await store.flush();
    expect(store.deepestFloor).toBe(5);

    const reloaded = await SaveStore.load(storage);
    expect(reloaded.run).toEqual({
      seed: 'S',
      floor: 3,
      totalSteps: 40,
      totalTimeMs: 2000,
      lives: 2,
      deaths: 1,
      lifePickups: [10],
    });
    expect(reloaded.deepestFloor).toBe(5);
    expect(storage.data.has(SAVE_KEY)).toBe(true);
  });

  it('SaveStore.clearRun removes the run (no Continue) but keeps the deepest floor', async () => {
    const storage = new MemoryStorage();
    const store = await SaveStore.load(storage);
    store.recordFloor({
      seed: 'S',
      floor: 6,
      totalSteps: 1,
      totalTimeMs: 1,
      lives: 1,
      deaths: 2,
      lifePickups: [],
    });
    store.clearRun();
    await store.flush();
    expect(store.run).toBeNull();

    const reloaded = await SaveStore.load(storage);
    expect(reloaded.run).toBeNull();
    expect(reloaded.deepestFloor).toBe(6);
  });

  it('survives storage that throws', async () => {
    const broken = {
      get: () => Promise.reject(new Error('boom')),
      set: () => Promise.reject(new Error('boom')),
      remove: () => Promise.reject(new Error('boom')),
    };
    const settings = await SettingsStore.load(broken);
    expect(settings.get()).toEqual(defaultSettings());
    settings.update({ language: 'en' });
    await expect(settings.flush()).resolves.toBeUndefined();
    const save = await SaveStore.load(broken);
    save.recordFloor({
      seed: 'S',
      floor: 1,
      totalSteps: 0,
      totalTimeMs: 0,
      lives: 3,
      deaths: 0,
      lifePickups: [],
    });
    await expect(save.flush()).resolves.toBeUndefined();
  });
});
