/**
 * Copies the version from package.json into the native projects, so there is one place to bump:
 *
 *   npm version minor && npm run version:sync
 *
 * Android: versionName = package version, versionCode = major*10000 + minor*100 + patch.
 * Tauri (desktop): tauri.conf.json "version", if that project exists.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string };

const match = /^(\d+)\.(\d+)\.(\d+)/.exec(pkg.version);
if (!match) throw new Error(`package.json version "${pkg.version}" is not major.minor.patch`);
const [major, minor, patch] = [Number(match[1]), Number(match[2]), Number(match[3])];
const versionCode = major * 10000 + minor * 100 + patch;

function update(path: string, change: (text: string) => string): void {
  const file = resolve(root, path);
  if (!existsSync(file)) return;
  const before = readFileSync(file, 'utf8');
  const after = change(before);
  if (after !== before) writeFileSync(file, after);
  console.log(`${path}: ${pkg.version}${path.endsWith('.gradle') ? ` (code ${versionCode})` : ''}`);
}

update('android/app/build.gradle', (text) =>
  text
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`),
);

update('src-tauri/tauri.conf.json', (text) =>
  text.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${pkg.version}"`),
);
