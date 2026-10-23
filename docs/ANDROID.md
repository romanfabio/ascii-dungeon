# Building the Android APK

The Android app is the web build wrapped by [Capacitor](https://capacitorjs.com). The native project
lives in `android/` and is committed; everything the game does is in `src/`.

## Compatibility

- **Minimum Android version: 7.0 (API level 24).** Target and compile SDK: 36 (Android 16). These are set in
  `android/variables.gradle` (`minSdkVersion`); Capacitor 8 does not support anything older.
- No permissions, no network access: the game is fully offline.
- Portrait only.

## Prerequisites

- **Android Studio** (provides the Android SDK and a bundled JDK 21). SDK platform 36 and
  build-tools must be installed (Studio does this on first start).
- Node.js (same as for the web build).

`npm run build:android` finds the JDK (17+) and the SDK on its own: it looks at `JAVA_HOME` /
`ANDROID_HOME`, then at Android Studio's default locations. Override with those variables if yours
are elsewhere. A plain `java` on the PATH is not used, so an old system Java 8 does not matter.

## Debug APK (for testing)

```bash
npm run build:android
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk` (signed with the automatic Android
debug key, installable right away). The first build downloads Gradle and dependencies and takes a
few minutes; later builds are quick.

Install on a phone with USB debugging enabled:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

(`adb` is in `<SDK>/platform-tools`, e.g. `%LOCALAPPDATA%\Android\Sdk\platform-tools` on Windows.)
Or copy the APK to the phone and open it (allow "install unknown apps" for your file manager).

## Release APK (signed, for sharing)

A release APK must be signed with **your own key**. Create it once, and **back it up**: if you lose
the keystore or its passwords you can never publish an update that installs over existing installs.

1. Create the keystore (choose your own passwords; keep the file outside git):

   ```bash
   keytool -genkeypair -v -keystore ascii-dungeon.keystore -alias ascii-dungeon \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

   `keytool` is in the JDK, e.g. `C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe`.

2. Create `android/keystore.properties` (gitignored; never commit it):

   ```properties
   storeFile=../../ascii-dungeon.keystore
   storePassword=YOUR_STORE_PASSWORD
   keyAlias=ascii-dungeon
   keyPassword=YOUR_KEY_PASSWORD
   ```

   `storeFile` is relative to `android/app/`.

3. Build:

   ```bash
   npm run release:android
   ```

   Output: `android/app/build/outputs/apk/release/app-release.apk`. Without
   `keystore.properties` the build still runs but produces an **unsigned** APK that cannot be
   installed; the script says so.

## Versions

Bump the version in one place, then sync it into the native project:

```bash
npm version minor        # or patch / major
npm run version:sync     # android versionName + versionCode (major*10000 + minor*100 + patch)
```

`build:android` / `release:android` run the sync automatically.

## App identity

- Application ID: `com.asciidungeon.game` (`capacitor.config.ts`). Change it **before** the first
  release you share: it identifies the app on a device, and changing it later makes Android treat
  it as a different app.
- Icon and splash screen are generated from `assets/*.svg`. After editing them run:

  ```bash
  npx @capacitor/assets generate --android --assetPath assets \
    --iconBackgroundColor '#0d0f12' --splashBackgroundColor '#0d0f12'
  ```

## How the app behaves on Android

- Portrait only, immersive (system bars hidden; swipe from an edge to reveal them briefly).
- The on-screen D-pad appears automatically (touch device); swipe on the map also works.
- Saves and settings use Capacitor Preferences (survive the OS clearing WebView storage).
- Sending the app to the background pauses the game (timer stops); the Android back button acts as
  Esc (pause, back out of menus) and exits the app from the title screen.
- No permissions are requested; the game never uses the network.

## Troubleshooting

- *"No JDK 17+ found"*: install Android Studio or set `JAVA_HOME` to a JDK 17+.
- *"Android SDK not found"*: set `ANDROID_HOME`, or open Android Studio once so it installs the SDK.
- *Gradle can't find the SDK platform*: open Android Studio → SDK Manager and install the platform
  version in `android/variables.gradle` (`compileSdkVersion`).
- After changing web code, re-run `npm run build:android` (it rebuilds the web app and syncs it).
