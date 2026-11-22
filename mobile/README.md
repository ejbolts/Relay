# Relay mobile

An Expo Router app for iOS and Android. By default it opens an offline sample routine. Tap an exercise to see its previous set.

To try account mode, set `EXPO_PUBLIC_RELAY_API_ORIGIN` in `mobile/.env.local` to the HTTPS origin of your isolated Relay preview (for example, `https://gym.example.com`), then restart Expo. Sign in with the preview account to read its next routine and previous sets. Remove the setting to return to the offline sample.

- **Session:** native networking keeps the server’s session cookie, so the app stays signed in after it is closed. Sign out ends this device’s session and needs a connection. This is temporary: saving workouts from the app will move to a token kept in the device’s secure storage.
- **Loading:** account mode is read-only and needs a connection to open. Returning to the app refreshes the routine without clearing it, and a failed refresh keeps the routine already shown.
- **History:** it reads this month and the two before it, plus one condensed row per exercise for anything older, as the web app does.
- **Shared types:** API types come from `frontend/src/types.ts` as type-only imports. Changing it also runs **Mobile checks** on GitHub.

From this directory, run `npm ci` followed by `npm start`. Open the project in an SDK 58-compatible Expo Go client. Use `npm run android` to launch on a connected Android emulator or `npm run ios` with an iOS simulator on macOS.

| Location                 | Contents                                                           |
| ------------------------ | ------------------------------------------------------------------ |
| `src/app/`               | Expo Router entry points and the root navigation layout            |
| `src/features/account/`  | Sign-in screen, session lifecycle and read-only API client         |
| `src/features/training/` | Training screen, the account’s next routine and the bundled sample |
| `src/theme.ts`           | Native colors from Relay’s default Pulse theme                     |
| `assets/`                | Bundled Relay icon and exercise illustrations                      |

Run `npm run typecheck`, `npm run lint` and `npm test` here to verify the shell. GitHub's **Checks** workflow runs the same three as **Mobile checks** when a PR changes `mobile/`.
