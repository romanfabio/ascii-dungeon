import { type BestiaryTypeId, isBestiaryType } from '../core/bestiary';
import { MAX_LIVES } from '../core/lives';
import { GENERATOR_VERSION } from '../gen/generate-floor';
import { parseAndMigrate, type Migration } from './migrate';

export const SAVE_VERSION = 2;

/** Upgrades from older save versions: `n` is the step from version n to n + 1. */
const SAVE_MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v1 had no lives: a saved run continues with a full set.
  1: (old) => {
    const run = old.run;
    if (typeof run !== 'object' || run === null) return old;
    return { ...old, run: { ...run, lives: MAX_LIVES, deaths: 0 } };
  },
};

/**
 * A run in progress. A floor is fully rebuilt from `seed` + `floor`, so progress inside a floor
 * is not saved: Continue restarts the current floor (with the lives the player has left).
 */
export interface RunSave {
  seed: string;
  floor: number;
  /** Totals at the start of `floor`. */
  totalSteps: number;
  totalTimeMs: number;
  /** Lives left (1..MAX_LIVES); a run with none is over and is never saved. */
  lives: number;
  /** Lives lost so far in this run. */
  deaths: number;
  /** Floors whose life pickup was taken: rebuilt floors do not offer it again. */
  lifePickups: readonly number[];
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  /** Generator version the run was last played with; lets a future build detect changed floors. */
  generatorVersion: number;
  run: RunSave | null;
  records: { deepestFloor: number; seenTypes: readonly BestiaryTypeId[] };
}

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    generatorVersion: GENERATOR_VERSION,
    run: null,
    records: { deepestFloor: 0, seenTypes: [] },
  };
}

function nonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function sanitizeRun(value: unknown): RunSave | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const floor = nonNegative(v.floor);
  const totalSteps = nonNegative(v.totalSteps);
  const totalTimeMs = nonNegative(v.totalTimeMs);
  if (typeof v.seed !== 'string' || v.seed === '') return null;
  if (floor === null || !Number.isInteger(floor) || floor < 1) return null;
  if (totalSteps === null || totalTimeMs === null) return null;
  // A missing or unreadable count falls back to a full set; zero lives is not a run in progress.
  const rawLives = nonNegative(v.lives);
  const lives = rawLives === null ? MAX_LIVES : Math.min(MAX_LIVES, Math.floor(rawLives));
  if (lives < 1) return null;
  const deaths = nonNegative(v.deaths);
  const lifePickups = Array.isArray(v.lifePickups)
    ? [
        ...new Set(
          v.lifePickups.filter((f): f is number => Number.isInteger(f) && (f as number) >= 1),
        ),
      ]
    : [];
  return {
    seed: v.seed,
    floor,
    totalSteps: Math.floor(totalSteps),
    totalTimeMs,
    lives,
    deaths: deaths === null ? 0 : Math.floor(deaths),
    lifePickups,
  };
}

/** Reads a stored save, falling back to an empty one if it is missing or corrupt. */
export function parseSave(json: string | null): SaveData {
  const d = defaultSave();
  const raw = parseAndMigrate(json, SAVE_VERSION, SAVE_MIGRATIONS);
  if (!raw) return d;
  const records = (typeof raw.records === 'object' && raw.records !== null ? raw.records : {}) as {
    deepestFloor?: unknown;
    seenTypes?: unknown;
  };
  // Bestiary: the enemy types met so far; unknown names (from a newer build) are dropped.
  const seenTypes = Array.isArray(records.seenTypes)
    ? [...new Set(records.seenTypes.filter(isBestiaryType))]
    : [];
  const deepest = nonNegative(records.deepestFloor);
  return {
    version: SAVE_VERSION,
    generatorVersion: nonNegative(raw.generatorVersion) ?? d.generatorVersion,
    run: sanitizeRun(raw.run),
    records: { deepestFloor: deepest === null ? 0 : Math.floor(deepest), seenTypes },
  };
}
