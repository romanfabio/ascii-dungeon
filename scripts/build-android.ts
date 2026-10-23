/**
 * Builds the Android APK.
 *
 *   npm run build:android     debug APK   (signed with the Android debug key)
 *   npm run release:android   release APK (signed if android/keystore.properties exists)
 *
 * Steps: build the web app, copy it into the Android project, run Gradle. The script finds a
 * suitable JDK (17+) and the Android SDK itself, so no environment variables are required when
 * Android Studio is installed in its default location.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const androidDir = join(root, 'android');
const variant = process.argv[2] === 'release' ? 'release' : 'debug';

function javaMajor(javaHome: string): number | null {
  const exe = join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
  if (!existsSync(exe)) return null;
  const out = spawnSync(exe, ['-version'], { encoding: 'utf8' });
  const text = `${out.stdout}${out.stderr}`;
  const m = /version "(\d+)(?:\.(\d+))?/.exec(text);
  if (!m) return null;
  return m[1] === '1' ? Number(m[2]) : Number(m[1]); // "1.8.0" -> 8, "21.0.1" -> 21
}

function findJavaHome(): string {
  const candidates = [
    process.env.JAVA_HOME,
    // Android Studio's bundled JDK
    'C:\\Program Files\\Android\\Android Studio\\jbr',
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/opt/android-studio/jbr',
    join(homedir(), 'android-studio', 'jbr'),
  ].filter((p): p is string => Boolean(p));
  for (const home of candidates) {
    const major = javaMajor(home);
    if (major !== null && major >= 17) return home;
  }
  throw new Error(
    'No JDK 17+ found. Install Android Studio (it bundles one) or set JAVA_HOME to a JDK 17 or newer.',
  );
}

function findSdk(): string {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
    join(homedir(), 'Android', 'Sdk'),
  ].filter((p): p is string => Boolean(p));
  const sdk = candidates.find((p) => existsSync(join(p, 'platforms')));
  if (!sdk) {
    throw new Error('Android SDK not found. Install it with Android Studio or set ANDROID_HOME.');
  }
  return sdk;
}

function run(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): void {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32', // needed for .cmd/.bat launchers
  });
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status ?? 'signal'})`);
}

const javaHome = findJavaHome();
const sdk = findSdk();
const env: NodeJS.ProcessEnv = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: sdk,
  PATH: `${join(javaHome, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
};
console.log(`JDK: ${javaHome}\nSDK: ${sdk}`);

// Gradle reads the SDK location from android/local.properties (gitignored, machine specific).
writeFileSync(join(androidDir, 'local.properties'), `sdk.dir=${sdk.replaceAll('\\', '/')}\n`);

run('npm', ['run', 'version:sync', '--silent'], root, env);
run('npm', ['run', 'build:web', '--silent'], root, env);
run('npx', ['cap', 'sync', 'android'], root, env);

const gradle = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
run(gradle, [variant === 'release' ? 'assembleRelease' : 'assembleDebug'], androidDir, env);

const outDir = join(androidDir, 'app', 'build', 'outputs', 'apk', variant);
const apks = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.endsWith('.apk')) : [];
const version = (
  JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
).version;
console.log(`\nBuilt Ascii Dungeon ${version} (${variant}):`);
for (const apk of apks) console.log(`  ${join(outDir, apk)}`);
if (variant === 'release' && apks.some((a) => a.includes('unsigned'))) {
  console.log(
    '\nThe release APK is UNSIGNED (android/keystore.properties not found), so it cannot be installed.\n' +
      'See docs/ANDROID.md to create a keystore.',
  );
}
