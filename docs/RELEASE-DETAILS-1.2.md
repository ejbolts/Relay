# Relay 1.2 full change details

[Back to release highlights](RELEASE-NOTES.md#120)

## 1.2.0

7 November 2026

### Weekly volume, live set gains and exercise merging

#### Splits and weekly sets

- **Split editor:** Editing a split now opens a compact full screen with Save at the top. A **Weekly volume** chart leads, showing the working sets each muscle gets per week and your planned cardio minutes against your weekly set and cardio goals, and it updates as you build. Days fold into one-line rows with their exercise and set counts, and one opens at a time. Each exercise has a sets stepper (cardio steps in 5-minute amounts), and stepping below one set removes it. The **?** beside each exercise shows its direct and partial set credits, and turning partial sets on or off there updates the chart. Tap a muscle in the chart to see which days train it and how many sets each adds. Cycles that aren't seven days long use weekly averages.
- **Split days:** Split cards, including friends' shared splits and **Exercises & sets** on your active split, list each exercise with a coloured block for every planned set and a total for each day, instead of each set's reps and weight. Cardio shows its minutes, and the **Muscles** button shows what each exercise trains.
- **Weekly sets after every set:** Ticking a working set in a live workout opens a compact card joined to the top of the rest timer. Each column is one muscle the exercise credits (largest credit first, up to three): its weekly total rolls up, a +1 or +0.5 badge appears and a slim bar grows to show the new sets, with the end of the bar marking your weekly goal. A muscle that reaches its goal turns green with a tick. The card folds away after 3 seconds; touch it to keep it open and touch again to close it. Logging another set while it is open updates the same card. With the rest timer off or ended, the card shows on its own at the bottom. Warm-ups, edits to saved workouts and workouts dated outside the current week don't open it, and unticking the set closes it. Animations follow the app's reduce-motion setting and the system preference.
- **Live muscle totals:** Completing a working set updates **Sets per muscle** on Home and Training immediately while the workout is still active. Unticking a set, removing a set or exercise, or discarding the workout reverses its contribution. Warm-ups, cardio and zero-rep attempts are still excluded, and each workout date's partial-credit setting applies.
- **Compare weeks:** Arrows on Sets per muscle step back through the last eight weeks on Home and Training, with the week before shown as an outline and the change beside each muscle.

#### Exercises and machines

- **Machine weights:** Progress has a chip for each saved machine, so one machine's sessions can be viewed as logged. Turn on **Normalise weights** from the settings button beside the chips. The machine you used most in the last three months is recommended as the reference, and gold arrows show what your weight on each other machine equals on it. Relay suggests each conversion from your logged weights and reps so sessions line up with the reference trend; adjust it with the weights or a slider while a preview chart redraws, and **Use** restores the suggestion. **All machines ≈** then shows one trend, stats and running PRs in the reference machine's weights. Logged sets, History, the exercise library sparkline and records keep the weights you entered.
- **Machine with the exercise:** Selecting an exercise with saved machines in the exercise picker opens a swipeable machine strip beneath it, with the last-used machine already chosen and labelled **Last used**. Swipe or use the arrows for others, or add a new machine with a photo. Tap the chosen machine again to log the baseline exercise instead. **Add selected exercises**, **Add super set** and **Switch exercise** carry your choice into the workout.
- **Merge exercises:** Open a custom exercise in **Training > Exercises** and choose **⋮ > Merge with another exercise**. Matching official or custom exercises are offered; equipment and configured muscle groups must match. Workout history, notes, supersets, machine photos and settings, saved splits and records move to the destination, and old drafts and split editors follow the merge.
- **Exercise headers:** In workouts, muscle help, expand/collapse and the completion tick stay aligned in one row, including when exercise names wrap.
- **Machine names:** Saving a changed machine name shows **Machine name saved** in a popup that clears after eight seconds.
- **Exercise filters:** Selected pills use your theme colour. Tap the selected muscle again to return to All; Custom toggles independently.
- **Exercise list:** Muscle-credit help icons line up beside the trend sparklines, including when exercise names wrap.
- **Exercise picker:** Filters stay above the results without large gaps when searching, selecting exercises or opening and closing the keyboard.

#### Logging workouts

- **Attempted sets:** Failure is now labelled Attempted, with A replacing F in workouts and training splits. Saved workout history uses the same wording.
- **Rest times:** Each set's rest suggests the matching previous rest, shown dimmed until you confirm it, instead of resetting to three minutes. Warm-ups and working sets are matched separately. Rest rows appear only once a set is added or completed, so untouched suggested sets stay compact, and recovery keeps them. On the rest timer, -30 and +30 move the fill straight away, and the minimised notch shows just the time.
- **Set reordering:** Hold a set's drag handle for half a second until its blue outline appears, then drag to reorder. Quick taps and scrolling keep sets in place.
- **Set notes:** Notes wrap onto new lines while typing and after saving, including long words. Manual line breaks are preserved.
- **Exercise completion:** Unticking a set also unticks its exercise. Adding a set or restoring an unfinished set with Undo clears the exercise tick too. Tick the exercise again to complete its remaining entered sets; blank sets keep it unfinished. Recovery repairs inconsistent ticks from earlier versions.
- **High-rep warnings:** The confirmation popup offers a checkbox to skip further high-rep warnings for this workout, including after recovery. New workouts warn again; unusually high-weight warnings stay active.
- **Workout errors:** If no sets are complete, the error explains how to add or fill in a set and tap the tick beside that set or its exercise. Empty workouts prompt you to add an exercise first. Close errors with the X.
- **iPhone input zoom:** Tapping a field to enter reps, weight or other values no longer zooms the screen in on iPhone. Pinch zoom still works.

#### Body and offline

- **Offline check-ins:** Log body weight and body fat immediately on Home or Body, even offline. Entries survive reopening the app and sync when the connection returns. Edits, deletions and Undo also work locally.
- **Offline notice:** When Relay has been offline for a moment, a strip at the top of every screen, including the workout logger, says you're offline and that workouts still save and sync later. It pushes content down rather than covering it. Close it with ×; it returns only after the connection has been back for a while and drops again.
- **Body goals:** Swipe a goal's dotted line left in the check-in history to remove it, with Undo for a few seconds.
- **Goal trend line:** With a future target date, the Body trend chart extends to that date and draws a dotted line from your goal's starting weight to the target.
- **Profile photos:** Choose a photo or open **Edit profile > Adjust crop** for your current picture. Pinch with two fingers to zoom and drag to reposition. The image outside the circle is dimmed while adjusting, fades away after one idle second and returns when movement resumes. Sliders have been removed; keyboard users can focus the photo, move with arrow keys and zoom with +/-. **Use crop** previews your choice; **Save profile** saves it. Reset centres the source photo, and Cancel keeps the previous crop. Photo changes save without a success popup.

#### Cardio

- **Screenshot paste:** Copy a screenshot and tap **Paste screenshot** beside **Upload screenshot** in a cardio set to scan it without saving it to Photos. Your browser may ask you to allow Paste.
- **Distance by activity:** Distance on the Cardio trend is split by activity type: walking, running, hiking and treadmill sessions together, with cycling, rowing and swimming separate and other activities under their own names. Chips switch between groups when more than one has distance in the last eight weeks, and the most-used group is selected first. The All stats panel still totals distance across activities.
- **Cardio saves:** Removed the zone confirmation popup after saving workouts, adding or editing cardio sessions, and editing cardio metrics. Zone classification and goal totals continue to update.
- **CSV exports:** Workout CSVs include cardio duration, distance, calories, heart rate, speed and incline, plus session totals and averages, power and METs where recorded. Values survive reimport, older standalone cardio is included as a cardio-only workout, and existing import limits and Undo apply.

#### Social

- **Compact friend rows:** Social matches Home's Recent Friends Activity with flat rows and thin dividers, giving names and workouts more room. Reaction and comment controls sit beside the workout details. Workout names open the matching session; friend names open their profile. Comment buttons show just the speech-bubble icon and count, while keeping descriptive screen-reader labels. Social friend subtext truncates after two lines. Extra reaction counts wrap within the control area, and expanded comments and reaction pickers use the full row width.
- **Social workout links:** Tap a saved workout name to open the friend's shared profile with that exact workout expanded and focused. The friend's name still opens their profile normally. Older sessions load by date, and unavailable workouts show a clear message.
- **Workout reactions:** Each emoji appears once with its count. Only your reaction has a blue border; before reacting, use the smiley-plus button. Tap your emoji to change or remove it, or a count to see who reacted.
- **Social loading:** Social shows friend-row placeholders while friends load, keeps the existing list during background refreshes, and no longer shows Home's training placeholder above the page on slow connections.

#### Sync

- **Other devices:** Workouts logged on another device appear on an open screen within seconds, even after a slow connection briefly showed this device's saved copy.
