/**
 * Every stylesheet, in the one order the app has always loaded them. Rules of equal weight are
 * decided by this order, so it is fixed here rather than left to whichever screen imports a file
 * first: screen and component styles first, then the base sheets that are meant to win over them.
 *
 * The signed-in app loads as a separate file after this one. A stylesheet imported only from
 * there would load later than every sheet below and silently change which rules win, so every
 * stylesheet belongs in this list. Add a new component's stylesheet to the first group.
 * `appStyles.test.ts` fails when one is missing.
 */
// Screens and components.
import './toast.css';
import './tips.css';
import './setupGuide.css';
import './workoutAutoSaveSetting.css';
import './helpPopup.css';
import './freshStartSetting.css';
import './activeWorkoutSync.css';
import './machinePhotoMerge.css';
import './machineSettings.css';
import './swipeFold.css';
import './guideCard.css';
import './machineWeights.css';
import './muscleGoals.css';
import './defaultRestSetting.css';
import './collapsibleSection.css';
import './exerciseMuscleHelp.css';
import './routineExerciseSearch.css';
import './routines.css';
import './WorkoutTypesSettings.css';
import './splitVolume.css';
import './trainingSplit.css';
import './calendarDay.css';
import './historySetTable.css';
import './restAlertReminder.css';
import './appDialogs.css';
import './createExercise.css';
import './exerciseMachinePicker.css';
import './exercisePicker.css';
import './supersetPicker.css';
import './warmupOnlyFinishDialog.css';
import './plateCalculator.css';
import './offlineNotice.css';
import './trainingBlockYear.css';
import './trainingBlocks.css';
import './weeklyReview.css';
import './muscleSets.css';
import './pagination.css';
import './exerciseMerge.css';
import './exerciseSwap.css';
import './restTimeSelect.css';
import './setRestControl.css';
import './setInsertButton.css';
import './profileSex.css';
import './liveSession.css';
import './profilePhotoViewer.css';
import './homeLayout.css';
import './cardioZones.css';
import './bodyCheckInSettings.css';
import './FollowNotifications.css';
import './homeInsights.css';
import './workoutImportSource.css';
import './workoutCsvGuide.css';
import './importReview.css';
import './workoutShareCard.css';
import './workoutPhotos.css';
import './workoutShareMenu.css';
import './YouTubeConnectionPanel.css';
import './profilePhotoCrop.css';
import './bodySizes.css';
import './liftComparison.css';
import './emojiReactionSheet.css';
import './accountSession.css';
import './sharedWorkout.css';
import './workoutReactionPeople.css';
import './socialFeed.css';
import './settingsSearch.css';
import './settingsHub.css';
import './colourThemes.css';
import './adminScreen.css';
import './liveWorkout.css';
import './finishedWorkout.css';
import './workoutEditGuard.css';
import './weeklySetsShelf.css';
import './relativeStrength.css';
import './bodyMeasurementHistory.css';
import './bodyScreen.css';

// Base sheets, after the components so they keep the last word.
import './styles.css';
import './pulse.css';
import './buttons.css';
import './popupDialog.css';
import './lightMode.css';
import './workoutSetColours.css';
import './auth.css';
import './releaseAnnouncement.css';
import './homeScreenGuide.css';
import './appGuide.css';
import './feedback.css';
import './sharing.css';
import './WorkoutBrowser.css';
import './cardioPage.css';
import './exerciseList.css';
