# Web and mobile parity

What the native app covers compared with the web app, which it will replace. Update this in the same PR whenever a port lands, or a web change opens or closes a gap (see "Web and mobile parity" in [AGENTS.md](../AGENTS.md)).

**Status:** ✅ ported · 🟡 partly ported · ⬜ web only

## Areas

| Area                                          | Status | Not in the app yet                                                                                                                                                                                                                                 |
| --------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in, account creation and session         | ✅     |                                                                                                                                                                                                                                                    |
| Navigation (tab bar, Start menu)              | ✅     |                                                                                                                                                                                                                                                    |
| Home: cards, saved layouts and layout editing | ✅     |                                                                                                                                                                                                                                                    |
| Training: Sessions                            | ✅     |                                                                                                                                                                                                                                                    |
| Training: Exercises                           | 🟡     | The per-page setting (the app shows more as you scroll)                                                                                                                                                                                            |
| Training: Cardio                              | 🟡     | Share in the save toast while the share reminder is on (the app shares from Cardio history)                                                                                                                                                        |
| Training blocks                               | ✅     |                                                                                                                                                                                                                                                    |
| Workout logging                               | 🟡     | Pasting a cardio screenshot from the clipboard (the app offers Choose screenshot or Take photo)                                                                                                                                                    |
| Social: Feed                                  | ✅     |                                                                                                                                                                                                                                                    |
| Social: Friends and notifications             | ✅     |                                                                                                                                                                                                                                                    |
| Social: Profiles                              | 🟡     | All workouts on this machine from a machine photo in a friend's shared workout (the app filters a friend's history by machine from its filter sheet). Editing your own profile opens Settings' editor, and your account id is copied from Settings |
| Social: QR invites and sharing choices        | 🟡     | Opening friend links from the phone's camera or browser (needs universal and app links in an EAS build; the in-app scanner and the `relay-mobile://social/profile/<id>?invite=1` link work, and an invite is kept through sign-in and sign-up)     |
| Body                                          | 🟡     | The maintenance tip's daily tip cooldown (the app shows it on Body until it is dismissed or Show tips is off); the check-in sync card shows on Body only (the web shows it on every tab)                                                           |
| Settings                                      | 🟡     | Web push alerts (the app has local rest and "Still working out?" alerts; remote push needs an EAS build). Connecting YouTube hands off to the web                                                                                                  |
| Guides and tips                               | 🟡     | Setup guides coach inside each editor on the web; the app explains each step in a sheet, then opens the editor                                                                                                                                     |
| Weekly review and What's new                  | 🟡     | The review's live muscle sets from an unsaved or just-finished workout (the app uses the dashboard's)                                                                                                                                              |
| Split editor and split library                | ✅     |                                                                                                                                                                                                                                                    |
| Imports, exports and backups                  | ✅     |                                                                                                                                                                                                                                                    |
| Admin and video logger                        | 🟡     | Connecting YouTube hands off to the web (its sign-in callback belongs to the browser session); leaving the Videos screen mid-upload stops and discards the upload                                                                                  |

## App-only

- Native tab bar with Liquid Glass and the live workout in the tab bar's accessory (iOS 26+).
- Offline sign-in with this phone's last account; durable workout draft and finished-workout queue on the device.
- Renaming custom workout types (the web can only add, recolour and remove them).
- Editing a custom exercise's target muscles (the web changes them only to match a merge destination).
- Adding photos from Training's session screen (the web's History card can only view and remove them).
- Shared workout cards and CSVs go through the phone's share sheet, which can also save or copy them.
- Imports pick their file with the phone's document picker, exports and backups go to the share sheet, and the CSV guide is part of the Import screen rather than a separate dialog.
- The weekly review and What's new open as pushed screens rather than popups, and What's new announces the server's release (the web announces the release its own build contains).

## Differences by design

- **Workout logging:** a set is picked up by holding its row (the web drags a dotted handle), and the logger doesn't show the reorder or cardio tips, whose text describes web-only controls. Moving a set still counts as learning to reorder.
- **Social:** a friend's feed card opens their workout's own screen, whose owner row opens their profile at that workout. On the web, the feed card opens the profile directly.
- **Social: Profiles:** a calendar day or a head-to-head lift filters the history and brings it into view with the filter sheet closed, showing the count on the filter button; the web opens its inline filters too.
- **Split library:** after Save split on a friend's profile, the toast offers Edit; the web opens the editor at once.
- **Training: Sessions:** a machine's "All workouts on this machine" opens as its own screen; Back closes it, and each workout opens its session.
- **Edit Home:** a card is dragged after a 300 ms hold (the web drags from its grip at once), and on the check-in card the whole weight stepper ignores the hold that opens Edit Home (the web exempts only the field).
- **Videos:** a picked clip's preview is full width and opens on tap, one at a time; the web shows a small inline player for each clip.

## Known platform gaps

- **Tip settings stay on the device:** dismissed tips and Show tips don't carry to another device, or between the app and the web, on either client. Sharing them needs an account-backed store.
- **Remote push:** Expo Go can't receive it. It needs an EAS build and backend endpoints for Expo push tokens (designed in the guides PR, not built).
- **Dynamic Island rest countdown:** the Live Activity needs an EAS development build. Background rest alerts are a local notification and work in Expo Go, where tapping one on Android opens Expo Go's own home screen.
