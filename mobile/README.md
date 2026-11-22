# Relay mobile

An Expo Router app for iOS and Android. The first screen displays a bundled sample routine. Tap an exercise to see its previous set. The shell works offline and uses no account or server.

From this directory, run `npm ci` followed by `npm start`. Open the project in an SDK 58-compatible Expo Go client. Use `npm run android` to launch on a connected Android emulator or `npm run ios` with an iOS simulator on macOS.

| Location | Contents |
| --- | --- |
| `src/app/` | Expo Router entry points and the root navigation layout |
| `src/features/training/` | Training screen, bundled routine and screen test |
| `src/theme.ts` | Native colors from Relay’s default Pulse theme |
| `assets/` | Bundled Relay icon and exercise illustrations |

Run `npm run typecheck`, `npm run lint` and `npm test` here to verify the shell.
