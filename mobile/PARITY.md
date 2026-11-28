# Web and mobile parity

What the native app covers compared with the web app, which it will replace. Update this in the same PR whenever a port lands, or a web change opens or closes a gap (see "Web and mobile parity" in [AGENTS.md](../AGENTS.md)).

**Status:** ✅ ported · 🟡 partly ported · ⬜ web only

## Areas

| Area                                          | Status | Not in the app yet                                                                                                  |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| Sign-in, account creation and session         | ✅     |                                                                                                                     |
| Navigation (tab bar, Start menu)              | ✅     |                                                                                                                     |
| Home: cards, saved layouts and layout editing | ✅     |                                                                                                                     |
| Training: Sessions                            | ✅     |                                                                                                                     |
| Training: Exercises                           | ✅     |                                                                                                                     |
| Training: Cardio                              | ✅     |                                                                                                                     |
| Training blocks                               | ✅     |                                                                                                                     |
| Workout logging                               | ✅     |                                                                                                                     |
| Social: Feed                                  | ✅     |                                                                                                                     |
| Social: Friends and notifications             | ✅     |                                                                                                                     |
| Social: Profiles                              | ✅     |                                                                                                                     |
| Social: QR invites and sharing choices        | ✅     | Opening friend links from the phone's camera or browser is built; confirm it in a development build (below)         |
| Body                                          | ✅     |                                                                                                                     |
| Settings                                      | ✅     | Phone alerts (remote push) and connecting YouTube in the app are built; confirm them in a development build (below) |
| Guides and tips                               | ✅     |                                                                                                                     |
| Weekly review and What's new                  | ✅     |                                                                                                                     |
| Split editor and split library                | ✅     |                                                                                                                     |
| Imports, exports and backups                  | ✅     |                                                                                                                     |
| Admin and video logger                        | ✅     | Connecting YouTube in the app is built; confirm its return in a development build (below)                           |
| Train together                                | ✅     | Opening its links from the camera or browser is built; confirm it in a development build (below)                    |

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
- **Social: Profiles:** a calendar day, a head-to-head lift or a friend's machine photo (All workouts on this machine) filters the history and brings it into view with the filter sheet closed, showing the count on the filter button; the web opens its inline filters too. Your own profile also shows your Account UUID with Copy; the web shows it on other people's profiles and in Settings.
- **Split library:** after Save split on a friend's profile, the toast offers Edit; the web opens the editor at once.
- **Training: Sessions:** a machine's "All workouts on this machine" opens as its own screen; Back closes it, and each workout opens its session.
- **Edit Home:** a card is dragged after a 300 ms hold (the web drags from its grip at once), and on the check-in card the whole weight stepper ignores the hold that opens Edit Home (the web exempts only the field).
- **Videos:** a picked clip's preview is full width and opens on tap, one at a time; the web shows a small inline player for each clip.
- **Training: Exercises:** the list shows more as you scroll instead of the web's per-page setting.
- **Cardio screenshots:** Paste screenshot appears beside Choose screenshot and Take photo only when the clipboard holds an image; the web's paste always works.
- **Body:** the check-in sync card shows at the top of Home, Training, Social and Body, not on pushed screens such as Settings, Videos or a profile, and says "saved on this phone" where the web says "saved locally". After a send the server did not answer, both apps space their timed sends out to 15, 30 and then 60 seconds and stop waiting once a read of the history shows the server holds the check-in (`frontend/src/syncBackoff.ts`, `frontend/src/checkInSync.ts`). The web also asks for the history before sending again; the app sends again without asking, because the server treats a repeated save as no change and the save is the smaller request on a phone connection.
- **Videos uploads:** an upload keeps going when you leave Videos; Stop and discard is its own button (the web has Cancel session).
- **Guides:** a setup guide coaches each step in a docked card with a fold grabber, rings the control it's about and scrolls it into view.
- **Phone alerts:** Settings › Notifications registers this phone for remote push. Rest alerts and "Still working out?" for a workout on this phone stay local notifications, and alerts shown by the phone use neutral text without names. Send test alert is app-only.
- **Popups:** a toast stays on screen for the same time in both apps (`toastDuration` in `frontend/src/popupTiming.ts`): an Undo for a deleted set 2.5 seconds, a confirmation 3, a warning, a record or an Undo that is hard to redo 5, and an error 7. The app's toast has one look; the web styles warnings, errors and records differently.
- **Today on the calendar:** today's ring takes the day's workout colours, as on the web, but stays still. The web's ripple repeats without end. Tried in the app, it kept Home from ever going idle: the emulator test driver could no longer read the screen, and the phone would keep redrawing for as long as Home is open.
- **All-time PR halo ring:** all-time PR badges keep their gold colour with the same bright turquoise outer halo ring as the web, but stay still rather than repeating the outward pulse, for the same idle and redraw reasons as today's calendar ring.
- **Rest timer on iPhone:** in an installed build on iOS 16.4 or later, it also shows as a Live Activity on the Lock Screen, and in the Dynamic Island on iPhones that have one, beside the rest pill and the rest alert.
- **Offline notice:** the app shows the web's offline notice, except over the workout logger, where logging carries on offline and syncs later.

## Known platform gaps

- **Built, but needs a development build to confirm.** Expo Go can't run most of these, and this PC can't build iOS:
  - opening friend links from the camera or browser (universal links and App Links, from `RELAY_APP_LINK_HOSTS` and the server's well-known settings). Android's App Links can't match the `#friend=` fragment, so they match the server's whole root address: on a configured Android phone, any link to Relay's web address opens the app, which then reads the fragment itself. Train-together links (`#train=`) are matched and opened the same way, and joined once signed in;
  - remote push delivery (an EAS project, FCM and APNs credentials, `RELAY_GOOGLE_SERVICES_FILE`);
  - the rest timer's Live Activity (its Swift has not been compiled here);
  - YouTube sign-in returning to the app. Google returns to the server over HTTPS, and the server then sends the browser to `relay-mobile://youtube-return`. Expo Go can try it only for a Metro host listed in the server's `GYM_YOUTUBE_APP_DEV_RETURN_HOSTS`, and on the Android emulator Chrome didn't follow that redirect from a plain-HTTP test server;
  - the upload wake lock (Expo Go keeps the screen on anyway).

  See `mobile/README.md` ("Native builds") for the variables and steps.

- **Uploads after the OS stops Relay:** an upload stops if the OS suspends or kills the app, and its session stays on the server where neither app lists it. A follow-up could offer to resume or discard it on launch.
- **Remote push duplicates** are avoided in normal use, not ruled out: a phone clock far off, a report that never reached the server, several server processes, or Expo's acceptance window can still double an alert, and a server restart can drop a phone's reminder after a browser received its copy.
- **Expo Go:** Android can't receive remote push, and tapping a background rest alert on Android opens Expo Go's own home screen.
