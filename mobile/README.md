# Relay mobile

Relay's native app for iOS and Android, built with Expo Router. It signs in to a Relay server and works with the same account data as the web app.

## Running it

Set `EXPO_PUBLIC_RELAY_API_ORIGIN` in `mobile/.env.local` (Git ignores it) to the HTTPS origin of an isolated Relay preview, for example `https://gym.example.com`. Then run `npm ci` and `npx expo start --go --clear`, and open the project in an SDK 58 Expo Go client. Restart Expo with `--clear` after changing `.env.local`, `metro.config.js` or dependencies. Credentials are only sent to an HTTPS origin, or to loopback HTTP in development.

Run `npm run typecheck`, `npm run lint` and `npm test` here. GitHub's **Checks** workflow runs the same three as **Mobile checks** when a PR changes `mobile/` or a web file the app imports.

What the app covers compared with the web, and what's still web-only, is tracked in [PARITY.md](PARITY.md).

## How it fits together

| Location                    | Contents                                                                  |
| --------------------------- | ------------------------------------------------------------------------- |
| `src/app/`                  | Routes. `(tabs)/` is the native tab bar; `workout` and `start` are sheets |
| `src/data/`                 | API client, token storage, React Query client and the shared queries      |
| `src/session/`              | Sign-in state and the sign-in screen                                      |
| `src/ui/`                   | Theme tokens, `Icon` and the shared building blocks (`Screen`, `Card`, …) |
| `src/features/home/`        | Home                                                                      |
| `src/features/training/`    | Training: sessions, exercises and cardio                                  |
| `src/features/workout/`     | The workout in progress: Start menu, logger sheet, tab bar accessory      |
| `src/features/placeholder/` | Tabs that are still web-only                                              |

- **Navigation:** `expo-router/native-tabs` draws a native tab bar (Liquid Glass on iOS 26+): Home, Training, Start, Social and Body, as on the web. Start never opens a screen; pressing it opens the Start menu sheet, or the logger while a workout is live. On iOS 27+ it sits on its own surface. A minimised workout shows in the tab bar's bottom accessory on iOS 26+.
- **Workouts:** every screen starts and reopens workouts through `useWorkout()` (`src/features/workout/WorkoutProvider.tsx`): `start(choice)` with `up-next`, `empty`, `cardio` or a `template`, and `open()`. The logger is a page sheet; dragging it down only minimises the workout.
- **Data:** React Query, with the shared account queries in `src/data/queries.ts` (dashboard, workout history window, workout types, saved exercises, exercises, training preferences, personal records and `useUpNext`). A feature adds its own queries beside its screens, under a distinct key. After a workout is saved, `refreshTraining` refreshes everything derived from history. Queries refetch when the app returns to the foreground and pause while offline. A 401 from any query signs the app out.
- **Session:** sign-in returns a session token, kept in secure storage (`expo-secure-store`) with the server it belongs to and sent as a bearer header. Cookies are never sent or kept. Sign out works offline: the phone signs out at once, and the server session ends then or on the next launch.
- **Shared rules:** the app imports the web's pure TypeScript modules from `frontend/src` (API types, `upNextSession`, `trainingSummary`, `historyWindow` and more) instead of copying them. Only modules with no packages and no browser APIs, all the way down, may be imported; the detector's tests fail otherwise. `metro.config.js` lets Metro bundle them, and Jest maps `@babel/runtime`, which Babel adds to them, to the app's own copy, so neither needs the web app's `node_modules`.
- **Look:** `useTheme()` gives Pulse's light or dark palette, following the phone's appearance setting. Prefer native controls (native tabs, sheets, segmented controls, SF Symbols through `Icon`, haptics) over web-style imitations.

## Testing on a device

- **Routes:** groups such as `(tabs)` are not part of a URL, so a sheet route can't share a tab's name. The Start tab is `/start` and its sheet is `/start-workout`.
- **Sheets:** push sheet routes from the root layout (as `WorkoutProvider` does). On Android a pushed `formSheet` draws under the native tab bar, so the Start menu is a transparent modal there that draws its own bottom sheet.
- **Clocks:** live clocks use `useNow` (`src/ui/useNow.ts`). Android's uiautomator never sees an idle screen while a clock redraws every second, so start a test Expo server with `EXPO_PUBLIC_RELAY_TEST_SLOW_CLOCK=1` to make clocks tick every 30 seconds during automated checks. Never set it for real use.

## Native builds

Expo Go needs none of this. A development or store build gets its identity from environment variables, set as EAS environment variables (or in the shell for a local build) so no installation's values are committed. `app.json` is the base config, and `app.config.js` adds each variable only when it is set (`nativeConfig.js`):

| Variable                     | Sets                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RELAY_IOS_BUNDLE_ID`        | `ios.bundleIdentifier`. The Live Activity extension is named after it                                                                                                     |
| `RELAY_ANDROID_PACKAGE`      | `android.package`                                                                                                                                                         |
| `RELAY_EAS_PROJECT_ID`       | `extra.eas.projectId`, which push tokens need                                                                                                                             |
| `RELAY_GOOGLE_SERVICES_FILE` | `android.googleServicesFile`: the path to Firebase's `google-services.json` (a local path or an EAS file variable), which Android push tokens need. Never commit the file |
| `RELAY_EXPO_OWNER`           | `owner`, the Expo account or organisation that owns the EAS project                                                                                                       |
| `RELAY_APP_LINK_HOSTS`       | Comma-separated Relay hostnames for universal links and Android App Links                                                                                                 |

`eas.json` has a `development` profile (a development client, distributed internally) and a `production` profile.

**Friend links** open the app when `RELAY_APP_LINK_HOSTS` names the server's hostname and the server serves the matching files. Set `GYM_IOS_TEAM_ID` and `GYM_IOS_BUNDLE_ID` for `/.well-known/apple-app-site-association`, and `GYM_ANDROID_PACKAGE` and `GYM_ANDROID_SHA256_FINGERPRINTS` (the signing certificates' SHA-256 fingerprints, comma-separated) for `/.well-known/assetlinks.json`. Each file returns 404 until its values are set. Android can't match the `#friend=` fragment, so the app opens for the server's root address and routes the fragment itself (`src/session/webLinks.ts`).

**YouTube** connects in a sign-in browser over the app. The app keeps a secret for each attempt and sends only its hash; the server returns the browser to `relay-mobile://youtube-return` with a one-time code, and only this app, signed in as the same session and holding the secret, can then save the channel (`POST /api/youtube/finish`). To try it in Expo Go, list the Metro host in the server's `GYM_YOUTUBE_APP_DEV_RETURN_HOSTS` (for example `127.0.0.1:8081`).
