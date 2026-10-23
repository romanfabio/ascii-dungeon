/** Upgrades a stored object from version N to N + 1. */
export type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/**
 * Parses stored JSON and upgrades it step by step to `currentVersion` using `migrations[v]`
 * (the step from version v to v + 1). Returns null for missing, corrupt or too-new data, so the
 * caller falls back to defaults.
 */
export function parseAndMigrate(
  json: string | null,
  currentVersion: number,
  migrations: Readonly<Record<number, Migration>> = {},
): Record<string, unknown> | null {
  if (json === null) return null;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;

  let obj = data as Record<string, unknown>;
  let version = obj.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return null;
  if (version > currentVersion) return null; // written by a newer build: don't guess

  while (version < currentVersion) {
    const step = migrations[version];
    if (!step) return null;
    obj = { ...step(obj), version: version + 1 };
    version++;
  }
  return obj;
}
