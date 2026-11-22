# Relay mobile

An Expo Router app for iOS and Android. By default it opens an offline sample routine. Tap an exercise to see its previous set.

To try account mode, set `EXPO_PUBLIC_RELAY_API_ORIGIN` in `mobile/.env.local` to the HTTPS origin of your isolated Relay preview (for example, `https://gym.example.com`), then restart Expo. Sign in with the preview account to read its next routine and previous sets. Remove the setting to return to the offline sample.

- **Session:** sign-in returns a session token, kept in the device’s secure storage (`expo-secure-store`) with the server it belongs to and sent as a bearer header. Cookies are never sent or kept. Sign out works offline: the phone signs out at once, and the server session ends then or on the next launch. A server without token sign-in asks to be updated.
- **Loading:** account mode is read-only and needs a connection to open. Returning to the app refreshes the routine without clearing it, and a failed refresh keeps the routine already shown.
- **History:** it reads this month and the two before it, the window the web app opens with.
- **Shared rules:** API types and the Up next rule come straight from the web app: `upNextSession` in `frontend/src/upNextSession.ts` and `latestTopSets` in `frontend/src/trainingSummary.ts`. `metro.config.js` lets Metro bundle them, and Jest maps `@babel/runtime`, which Babel adds to them, to the app’s own copy, so neither needs the web app’s `node_modules`. They must stay free of packages and browser APIs, and changing one also runs **Mobile checks** on GitHub.

From this directory, run `npm ci` followed by `npm start`. Open the project in an SDK 58-compatible Expo Go client. Use `npm run android` to launch on a connected Android emulator or `npm run ios` with an iOS simulator on macOS.

| Location                 | Contents                                                           |
| ------------------------ | ------------------------------------------------------------------ |
| `src/app/`               | Expo Router entry points and the root navigation layout            |
| `src/features/account/`  | Sign-in screen, token storage and read-only API client             |
| `src/features/training/` | Training screen, the account’s next routine and the bundled sample |
| `src/theme.ts`           | Native colors from Relay’s default Pulse theme                     |
| `assets/`                | Bundled Relay icon and exercise illustrations                      |

Run `npm run typecheck`, `npm run lint` and `npm test` here to verify the shell. GitHub's **Checks** workflow runs the same three as **Mobile checks** when a PR changes `mobile/`.
