# Rest timer Live Activity (iOS)

The live workout's rest countdown on the Lock Screen and in the Dynamic Island: the exercise, the time left, the next set and a shrinking progress bar. It follows pause, resume and ±30 s, and ends when the rest ends, is skipped or the workout finishes or is discarded.

| Part                                                                      | Where                                  |
| ------------------------------------------------------------------------- | -------------------------------------- |
| ActivityKit start, update and end                                         | `ios/RelayLiveActivityModule.swift`    |
| The activity's data, shared by the app and the widget                     | `ios/RestActivityAttributes.swift`     |
| Lock Screen and Dynamic Island layouts                                    | `widget/`                              |
| Config plugin: Info.plist key, widget extension target, EAS signing entry | `plugin/withRelayLiveActivity.js`      |
| JS accessor (null in Expo Go and on Android)                              | `index.ts`                             |
| What the activity shows, and the rest timer's hook                        | `src/features/workout/restActivity.ts` |

The countdown is drawn from the rest's end date (`Text(timerInterval:)`), so the app updates the activity only when the rest changes. The activity's stale date is the end of the rest, so the widget shows "Rest complete" even while Relay is suspended; the app ends the activity when it next runs.

Expo Go can't load local native code, so there the module is missing and the rest timer works as before. Android never looks for it.

## Trying it in a development build

Expo Go can't show any of this. You need an EAS development build on an iPhone with iOS 16.4 or later; the Dynamic Island needs an iPhone 14 Pro or later.

1. Give the app a bundle identifier, for example in `app.config` from an environment variable, so it stays out of Git:
   `ios: { bundleIdentifier: process.env.RELAY_IOS_BUNDLE_ID }`. The plugin names the widget extension `<bundle identifier>.RestWidget`; without a bundle identifier it adds only the Info.plist key.
2. Add a development profile to `mobile/eas.json`:

   ```json
   {
     "build": {
       "development": {
         "developmentClient": true,
         "distribution": "internal",
         "ios": { "resourceClass": "m-medium" }
       }
     }
   }
   ```

   Then `npx expo install expo-dev-client` and `eas build --profile development --platform ios`. EAS reads the extension from `extra.eas.build.experimental.ios.appExtensions`, which the plugin sets, and asks to create its provisioning profile.

3. Optional local check on a Mac: `npx expo prebuild --platform ios --clean`, then open `ios/Relay.xcworkspace`. Expect a **RelayRestWidget** target (WidgetKit extension, iOS 16.4, bundle `<bundle identifier>.RestWidget`) embedded in the app, and `NSSupportsLiveActivities` set to YES in `ios/Relay/Info.plist`. Build both targets.
4. On the iPhone, in Settings › Relay, check that **Live Activities** is on.

### What to check on the phone

1. Start a workout and log a set. The rest starts, and the Dynamic Island shows a timer and the time left; the time counts down by itself.
2. Lock the phone. The Lock Screen shows the exercise, the countdown, "Next: Set 2 · …" and a shrinking bar.
3. Unlock and pause the workout. The activity shows "Paused" and the frozen time. Resume: it counts down again from the same time.
4. Tap +30 s and −30 s. The time on the Lock Screen and in the Island moves by 30 seconds.
5. Lock the phone and let the rest run out. The activity turns to "Rest complete" with a tick, and the "Rest complete" alert arrives as before. Opening Relay ends the activity.
6. Start another rest and skip it ("End rest timer"): the activity goes. Start another and finish the workout: it goes.
7. Mid-rest, swipe Relay away and reopen it. The same activity carries on, with no second one.
8. Long-press the Island: the expanded view shows the exercise, the time, the next set and the bar. Tap it: Relay opens on the live workout.
9. Turn Live Activities off for Relay in Settings, then log a set: the rest works in the app, with no activity.
