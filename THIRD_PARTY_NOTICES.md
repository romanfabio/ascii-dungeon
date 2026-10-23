# Third-party notices

Ascii Dungeon itself is released under the [MIT License](LICENSE). It bundles or builds on the
following third-party software. Everything below is permissively licensed and compatible with MIT.

## Shipped inside the game (web build and Android APK)

| Component                                                                                          | Licence                   | Where it appears                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) (via `@fontsource/jetbrains-mono`)    | SIL Open Font License 1.1 | The bundled font (latin, regular weight). Licence text: [`public/licenses/JetBrainsMono-OFL.txt`](public/licenses/JetBrainsMono-OFL.txt), which is copied into every build. |
| [Capacitor](https://capacitorjs.com) (`@capacitor/core`, `/android`, `/app`, `/preferences`)       | MIT                       | The native Android shell and its JavaScript bridge.                                                                                                                         |
| [tslib](https://github.com/microsoft/tslib) (a dependency of Capacitor)                            | 0BSD                      | Runtime helpers.                                                                                                                                                            |
| AndroidX libraries (AppCompat, Core, Activity, Fragment, WebKit, SplashScreen, Coordinator Layout) | Apache License 2.0        | Linked into the Android app by Gradle.                                                                                                                                      |
| Apache Cordova Android (`cordova-android-framework`, used by Capacitor)                            | Apache License 2.0        | Linked into the Android app by Gradle.                                                                                                                                      |

JetBrains Mono: Copyright 2020 The JetBrains Mono Project Authors
(https://github.com/JetBrains/JetBrainsMono). The font is used unmodified and is not sold on its own.

## Used to build and test only (not distributed)

TypeScript (Apache-2.0), Vite and Vitest (MIT), ESLint and typescript-eslint (MIT / Apache-2.0),
Prettier (MIT), tsx (MIT), the Capacitor CLI (MIT) and their transitive dependencies. They are all
MIT, ISC, BSD, Apache-2.0, BlueOak-1.0.0, 0BSD or Unlicense, except `lightningcss` (MPL-2.0, a
dependency of Vite): it is a build tool, is not part of the game and is not modified here. Run
`npm ls` for the full tree; the exact versions are in `package-lock.json`.

The Gradle wrapper (`android/gradlew`, `android/gradle/wrapper/`) is Apache-2.0, from the Gradle
project.

## Original assets

The app icon, the splash screen and everything drawn in the game (glyphs, colours, texts, the
Italian and English translations) were made for this project and are covered by the MIT licence
above. The icon sources are in `assets/*.svg`. There are no images, sounds or other media from third
parties.
