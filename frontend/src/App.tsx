import { MachineWeightTip } from './FeatureDiscoveryTips';
import { TipsProvider, TipsSettings, TipSlot, useTips } from './Tips';
import { SetupGuideHost, SetupGuidesSettings } from './SetupGuide';
import { captureAccountCacheScope } from './accountCacheScope';
import { useActiveWorkoutReminder } from './activeWorkoutReminder';
import {
  prepareWorkoutAutoSave,
  sharedWorkoutFinishFields,
  useActiveWorkoutSync,
} from './activeWorkoutSync';
import {
  useWorkoutAutoSaveAccount,
  useWorkoutAutoSaveMinutes,
  workoutAutoSaveMinutes,
} from './workoutAutoSaveChoice';
import { WorkoutAutoSaveSetting } from './WorkoutAutoSaveSetting';
import { FreshStartSetting } from './FreshStartSetting';
import { ActiveWorkoutSyncDialog } from './ActiveWorkoutSyncDialog';
import { REMOTE_WORKOUT_APPLIED } from './activeWorkoutEvents';
import {
  extendInactiveWorkoutFinishAt,
  inactiveWorkoutEndAt,
  inactiveWorkoutFinishAt,
  MAX_INACTIVE_WORKOUT_MS,
} from './activeWorkoutTimeout';
import {
  Fragment,
  useCallback,
  useContext,
  startTransition,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ContextType, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react';
import { flushSync } from 'react-dom';
import { ApiError, api, revisionAfterSave, revisionAtSignIn, type SavedStartupData } from './api';
import { SetDragHandle } from './SetDragHandle';
import { hasUnassignedMachineSets, movementWithMachines } from './setMachines';
import { MachinePhotoMergePicker } from './MachinePhotoMergePicker';
import { MachineSettingsEditor, MachineSettingsSummary } from './MachineSettingsEditor';
import { MachineWeightsDialog } from './MachineWeightsDialog';
import { type MachineView } from './machineWeights';
import { WorkoutBrowser, WorkoutNavigationArrows, type WorkoutNavigation } from './WorkoutBrowser';
import { saveBodyFatCheckIn, saveBodyweightCheckIn } from './bodyweightCheckIn';
import { useBodyMeasurementSync } from './useBodyMeasurementSync';
import { TrainingPreferencesPanel } from './TrainingPreferencesPanel';
import { TrainingPreferencesProvider } from './TrainingPreferencesProvider';
import { DefaultRestSetting } from './DefaultRestSetting';
import { WorkoutTypesProvider } from './WorkoutTypesProvider';
import { useWorkoutTypes } from './workoutTypesContext';
import { WorkoutTypesSettings } from './WorkoutTypesSettings';
import { TrainingSplitEditor } from './TrainingSplitEditor';
import { builtinTypeColors, calendarLegendTypes, effectiveWorkoutType } from './workoutTypes';
import { entriesInMonths } from './calendarRange';
import { splitCalendarDays } from './trainingSplit';
import { splitSkipMessage, splitSkipMove } from './splitSkip';
import { PlannedDaySheet, type PlannedStart } from './PlannedDaySheet';
// W3 (mobile Home): the calendar's day rule, shared with the app.
import { calendarDayTarget } from './plannedDay';
import {
  useDefaultRest,
  useTrainingPreferences,
  useWeightUnit,
} from './trainingPreferencesContext';
import { HistorySetTable } from './HistorySetTable';
import { WeightInput } from './WeightInput';
import { formatWeight, formatWeightNumber, weightFromKg, weightUnitName } from './weightUnits';
import type { WeightUnit } from './weightUnits';
import { RestAlertReminder } from './RestAlertReminder';
import { shouldShowRestAlertReminder } from './restAlertReminderState';
import type {
  BodyMeasurement,
  DashboardData,
  Exercise,
  ExerciseCreateInput,
  ExerciseHistoryBaseline,
  ExerciseProgress,
  MachinePhoto,
  MachinePhotoUsage,
  MachineSetting,
  PersonalRecord,
  SharedProfileSummary,
  TrackedSet,
  TrackedWorkout,
  TrainingSplit,
  User,
  WeeklyMuscleContribution,
  WeightMapping,
  WorkoutCategory,
  WorkoutHistorySummary,
  WorkoutImportOptions,
  WorkoutInput,
  WorkoutReactions,
  WorkoutRecommendation,
  WorkoutType,
  WorkoutTypeColors,
} from './types';
import { BODY_TREND_DURATION_OPTIONS } from './bodyTrend';
import type { BodyTrendDuration, BodyTrendRange, BodyTrendStatistic } from './bodyTrend';
import {
  loadBodyTrendPreference,
  saveBodyTrendPreference,
  type BodyTrendPreference,
} from './bodyTrendPreference';
import {
  WeekStrip,
  WorkoutCalendar,
  WorkoutCalendarLegend,
  type OlderHistoryProps,
} from './WorkoutCalendar';
import { workoutTypeColor } from './dayColors';
import { liveWorkoutColor } from './calendarDayLook';
import {
  appendOlderWorkouts,
  hasOlderHistory,
  initialHistoryStart,
  keepLoadedBefore,
  olderHistoryWindow,
  prependOlderDays,
} from './historyWindow';
import { InlineConfirmButton } from './InlineConfirmButton';
import { useTrainingDataSync } from './useTrainingDataSync';
import { PopupDialog } from './PopupDialog';
import { CalendarCreateWorkoutDialog } from './CalendarCreateWorkoutDialog';
import { SetEntryConfirmationDialog } from './SetEntryConfirmationDialog';
import { WorkoutNameDialog } from './WorkoutNameDialog';
import { CalendarDayDetail } from './CalendarDayDetail';
import { ExerciseIcon } from './ExerciseIcon';
import { WorkoutReactionControl } from './WorkoutReactionControl';
import { ExercisePicker } from './ExercisePicker';
import { SupersetPicker } from './SupersetPicker';
import { WarmupOnlyFinishDialog, type WarmupOnlyMovement } from './WarmupOnlyFinishDialog';
import { loggedOnlyWarmups, warmupOnlyMovements as warmupOnly } from './workingSetCheck';
import { foldedMovementSummary, workingSetsDone } from './movementFold';
import {
  machineTipEligible,
  readdsRemovedSet,
  replacesRemovedExercise,
  savedWorkoutCount,
  tipWorkoutCount,
  type TipRemoval,
} from './tipTriggers';
import { PlateCalculatorDialog } from './PlateCalculator';
import { barTypeForExercise } from './plateLoading';
import { ExerciseMuscleHelp } from './ExerciseMuscleHelp';
import type { ExerciseMachineChoices } from './exerciseMachineChoices';
import { ExerciseCreditsContext } from './exerciseCreditsContext';
import { finishedMuscleSourcesFor, type MuscleSetsWeek } from './liveMuscleSets';
import { useLiveMuscleSets } from './useLiveMuscleSets';
import {
  MachineFilterBanner,
  MachineFilterPicker,
  type MachineFilter,
} from './MachineHistoryFilter';
import { machineDate, machineUsedShort, timeSince } from './machineHistory';
import { ReleaseAnnouncement } from './ReleaseAnnouncement';
import { useReleaseAnnouncement } from './useReleaseAnnouncement';
import { usePresenceConnection } from './presence';
import { ReleaseAnnouncementContext } from './releaseAnnouncementContext';
import { useAppUpdates } from './useAppUpdates';
import { AppUpdateBanner } from './AppUpdateBanner';
import { OfflineNotice } from './OfflineNotice';
import { AppUpdateCheck } from './AppUpdateCheck';
import { BEFORE_APP_REFRESH_EVENT } from './appUpdates';
import { CLIENT_VERSION } from './clientVersion';
import { canShowReleaseAnnouncement } from './releaseAnnouncements';
import { HomeScreenGuide, HomeScreenShortcut } from './HomeScreenGuide';
import { WeeklyReviewPrompt } from './WeeklyReviewPrompt';
import { useHomeScreenGuide } from './useHomeScreenGuide';
import { runningAsInstalledApp } from './homeScreenGuideState';
import { AppGuide } from './AppGuide';
import {
  appGuideWaiting,
  finishAppGuide,
  finishAppTour,
  importStepWaiting,
  nextOnboardingPrompt,
} from './appGuideState';
import { ImportHistoryPrompt } from './ImportHistoryPrompt';
import { CONTRIBUTING_URL, PROJECT_URL } from './appGuideSteps';
import { CreateExerciseDialog } from './CreateExerciseDialog';
import { BackgroundActivityBar } from './BackgroundActivityBar';
import { cardioSetUpdateFromScan } from './cardioScreenshot';
import { CardioSetScreenshotUpload } from './CardioSetScreenshotUpload';
import { CachedTabPanel } from './CachedTabPanel';
import { optimisePhoto } from './photoOptimise';
import { ConfettiBurst } from './ConfettiBurst';
import { EdgeSwipeBack } from './EdgeSwipeBack';
import { closeTopOverlay } from './overlayBack';
import { ExerciseLibraryList } from './ExerciseLibraryList';
import { ExerciseMergeDialog } from './ExerciseMergeDialog';
import { ExerciseMergeNudge } from './ExerciseMergeNudge';
import { ExerciseOptionsMenu } from './ExerciseOptionsMenu';
import { ExerciseEditDialog } from './ExerciseEditDialog';
import { ExerciseSwapSheet } from './ExerciseSwapSheet';
import { swapMovementExercise } from './exerciseSwap';
import { useExerciseLibrary, type ExerciseLibraryState } from './useExerciseLibrary';
import { ExerciseSessionSheet } from './ExerciseSessionSheet';
import { ProgressExerciseSearch } from './ProgressExerciseSearch';
import { PROGRESS_METRICS, progressPointsForChart, type ProgressMetric } from './progressChart';
import {
  restTimerPreferenceEnabled,
  saveRestTimerPreference,
  restTimesPreferenceEnabled,
  saveRestTimesPreference,
} from './restTimerPreference';
import { RestTimeSelect } from './RestTimeSelect';
import { SetRestControl } from './SetRestControl';
import { SetInsertButton, SetInsertRow } from './SetInsertButton';
import { cancelRestTimerPushSchedule, restSecondsLeft } from './restTimer';
import {
  disablePhonePushNotifications,
  dismissRestTimerNotifications,
  enablePhonePushNotifications,
  existingPhonePushSubscription,
  PHONE_PUSH_PREFERENCE_EVENT,
  pushNotificationsSupported,
  showRestTimerNotification,
} from './push';
import {
  useCollapseAnimation,
  useExpandAnimation,
  useFlipAnimation,
  useSlidingIndicator,
} from './motionHooks';
import {
  applyReduceMotion,
  motionReduced,
  reduceMotionPreference,
  saveReduceMotionPreference,
  systemPrefersReducedMotion,
} from './motion';
import {
  RPE_OPTIONS,
  SET_KINDS,
  setKindOf,
  setKindUpdate,
  setNumberLabels,
} from './setFieldValues';
import { MovementNoteDialog } from './MovementNoteDialog';
import { SwipeToDeleteSetRow } from './SwipeToDeleteSetRow';
import { markSetAdded } from './setRowEntrance';
import { selectInputValue } from './selectInputValue';
import { matchingLastSessionSet } from './lastSessionSet';
import { readStoredRestTimer, restoreRestTimer, writeStoredRestTimer } from './liveRestTimer';
import { unusualSetEntryWarning, type SetEntryWarning } from './setEntryConfirmation';
import {
  appTabFromHash,
  createAppHistoryState,
  historySectionForTab,
  isAppHistoryState,
  isMainTabScreen,
  mainTabFor,
  tabScrollKey,
  type AppTab,
  type HistorySection,
  type MainTab,
} from './appNavigation';
import { AppTabBar } from './AppTabBar';
import { PaginationControls } from './PaginationControls';
import { LIST_PAGE_SIZE } from './pagination';
import { useHomeLayout } from './useHomeLayout';
import { Icon } from './Icon';
import { TrendChart, type TrendPoint } from './PulseCharts';
import { PageHeader, SettingsButton, TodayScreen, TodaySkeleton } from './TodayScreen';
import { FeedbackForm } from './FeedbackForm';
import { WorkoutCsvImport } from './WorkoutCsvImport';
// B5 (data): the import's confirmations, shared with the app.
import { importSavedMessage, importUndoneMessage } from './workoutImport';
import { exportWorkoutDates } from './dataExport';
import { DataExportDialog } from './DataExportDialog';
import { WorkoutShareCard } from './WorkoutShareCard';
import { WorkoutPhotoEditor, WorkoutPhotos } from './WorkoutPhotos';
import { useWorkoutPhotos } from './workoutPhotoState';
import { WorkoutShareMenu } from './WorkoutShareMenu';
import { WorkoutShareReminderSetting } from './WorkoutShareReminderSetting';
import {
  dayMonth,
  formatListVolume,
  groupByYear,
  groupWorkoutsByWeek,
  mostTrainedExerciseId,
  recordCountsByWorkout,
  setLabel,
  sessionTemplateFor,
  shortDate,
  strengthSets,
  topWorkingSet,
  weekGroupLabel,
  weekGroupSummary,
  weekStartDayFrom,
  weeklyBestPoints,
  workoutDisplayName,
  workoutVolumeKg,
  type SessionTemplate,
} from './trainingSummary';
import {
  historyOnMachine,
  lastWorkingSessionSets,
  machineAliases,
  movementHistory,
  machineSuggestionSource,
  recentExerciseHistory,
  withSuggestedSets,
  type ExerciseHistoryEntry,
} from './exerciseHistory';
import { exerciseLastDoneDates } from './exerciseLastDone';
import { useUpNextSession } from './upNext';
import { typeSessionTemplate } from './routines';
import { progressionHint, progressionTarget } from './repProgression';
import { exerciseIconFor } from './exerciseIcons';
import {
  formatMinutesDuration,
  formatSeconds,
  formatWorkoutTimeRange,
  localDate,
  mergeUniqueById,
  reorder,
  workoutDurationMinutes,
  workoutTimeInputValue,
} from './utils';
import { blockColor } from './blockColors';
import { VideoUpload } from './VideoUpload';
import { YouTubeConnectionPanel } from './YouTubeConnectionPanel';
import { ProfileScreen } from './ProfileScreen';
import { AccountArchivePanel } from './AccountArchivePanel';
import { AccountSettings, AccountSessionSettings } from './AccountSettings';
import { ProfileAccountId } from './ProfileAccountId';
import { SharedProfileScreen, type SharedWorkoutListProps } from './SharedProfiles';
import { LiftLeaderboardCard } from './LiftComparison';
import { SharedSetList } from './SharedWorkoutDetail';
import { sharedSetCount } from './sharedProfileDisplay';
import { onSharedProfileRequested } from './sharedProfileRequest';
import { FriendsActivityCard } from './FriendsActivity';
import { SocialScreen } from './SocialScreen';
import { SettingsHub } from './SettingsHub';
import { ColourThemePanel } from './ColourThemePanel';
import {
  SettingsNavigationContext,
  SETTINGS_DESTINATIONS,
  useSettingsPageJump,
  type SettingsDestination,
  type SettingsJump,
  type SettingsGroupId,
} from './settingsNavigation';
import { useOpenFeedbackCount } from './friendsActivityData';
import { AccountHeaderActions } from './AccountHeaderActions';
import { AdminScreen } from './AdminScreen';
import {
  onAdminAccountFocusRequested,
  requestAdminAccountFocus,
  takeAdminAccountFromUrl,
} from './adminAccountFocus';
import { canUploadVideos, useUserSession } from './userContext';
import {
  OUTDATED_CLIENT_MESSAGE,
  useFinishedWorkoutQueue,
  type SavedFromQueue,
} from './useFinishedWorkoutQueue';
import {
  finishedWorkoutKey,
  readFinishedWorkouts,
  type FinishedWorkout,
} from './finishedWorkoutQueue';
import { useDeferredDelete } from './useDeferredDelete';
import {
  queuedWorkoutIds,
  WORKOUT_SYNCING_MESSAGE,
  workoutBlockedWhileSyncing,
} from './workoutDeletion';
import {
  dashboardWithPreview,
  isPendingWorkoutId,
  pendingWorkoutPreview,
  workoutsWithPreview,
} from './pendingWorkoutPreview';
import { PendingWorkoutSaveCard } from './PendingWorkoutSaveCard';
import { AppNoticesContext, useAppNotices, useAppNoticesContext } from './appNotices';
import { launchPromptAllowed, type LaunchPrompt } from './launchPrompts';
import { useWorkoutConflictPrompt, WorkoutEditDiscarded } from './useWorkoutConflictPrompt';
import { InactiveWorkoutDialog } from './InactiveWorkoutDialog';
import { loggerSessionKey, nextLoggerSession, type LoggerSession } from './loggerSession';
import { RestDoneBell, WorkoutHeaderMeta, WorkoutTimerDock } from './WorkoutRestTimer';
import { nextSetAfterRest } from './restComplete';
import { LiveWorkoutHeader } from './LiveWorkoutHeader';
import { LiveWorkoutSheet } from './LiveWorkoutSheet';
import { FinishedWorkoutCard } from './FinishedWorkoutCard';
import { hasLikelyDuplicateMachines, multiMachineExerciseId } from './machineUsage';
import { onTipTarget, type TipAction } from './tipActions';
import { Toast, useToast, useToastPlacement } from './Toast';
import { TrainingBlockDialog } from './TrainingBlockDialog';
import {
  buildFinishSummary,
  finishSummaryIsFor,
  finishSummaryTimeLeft,
  finishSummaryWorkoutGone,
  readFinishSummary,
  writeFinishSummary,
  type FinishSummary,
} from './finishSummary';
import type { LiveWorkoutSummary } from './liveWorkoutSummary';
import { WorkoutTimeEditor } from './WorkoutTimeEditor';
import { correctedSessionSeconds, workoutTimeSoFarSeconds } from './workoutTimeCorrection';
import { useDiscardChangesGuard, type LeaveGuard } from './WorkoutEditGuard';
import { useUnsavedWorkoutChanges } from './workoutEditChanges';

import { WeeklySetsShelf, type WeeklySetsUpdate } from './WeeklySetsShelf';
import { shelfAfterExerciseComplete, shelfAfterSetUpdate } from './weeklySetsUpdate';
import {
  activeElapsedSeconds,
  draftPause,
  pauseWorkout,
  resumeWorkout,
  withElapsedSeconds,
  type WorkoutPause,
} from './workoutPause';
import {
  ACTIVE_WORKOUT_DRAFT_KEY,
  clearActiveWorkoutDraft,
  isExpiredEmptyWorkoutDraft,
  readActiveWorkoutDraft,
  savedWorkoutMatchesOldDraft,
  writeActiveWorkoutDraft,
  type ActiveWorkoutDraft,
} from './workoutDraft';
import { completeRemainingSets, hasRecordedPerformance } from './workoutSets';
import { restRowShown, restToAdd } from './workoutRestHistory';
import { movementWithAddedSet } from './workoutSetInsert';
import { pinnedAfterMerge } from './machinePhotoMerge';
import { completionRecordDetail, recordTypeLabel } from './recordLabels';
import {
  checkWorkoutFinish,
  finishedWorkoutInput as finishedWorkoutInputRule,
  liveWorkoutIdentity,
  type WorkoutFinishCheck,
  type WorkoutFinishState,
} from './workoutFinish';
import { movementAfterSetUpdate, setUpdateEffects } from './workoutSetUpdate';
import { suggestedSetsForPickedExercise, templateDraftMovements } from './workoutStartMovements';
import { workoutNameForCategory } from './workoutCategory';
import {
  machineSelection,
  restoreWorkoutDraftMovements,
  savedWorkoutMovements,
  type WorkoutDraftMovement as DraftMovement,
  type WorkoutDraftSet as DraftSet,
} from './workoutMovements';
import {
  applySupersetSelection,
  clearSuperset,
  keepSupersetTogether,
  isSupersetUpNext,
  nextInSupersetRound,
  supersetGroupName,
} from './workoutSupersets';
import {
  HISTORY_WEEKS_PER_PAGE,
  historyPageAnchor,
  historyPageCount,
  historyPageForDate,
  historyPageWindow,
  upsertWorkoutByRecency,
  weekGroupPage,
} from './workoutHistory';
import {
  calculateScopedDraftPrs,
  initialPrCelebrations,
  isAllTimePr,
  newPrCelebrations,
  prBadgeLabel,
  prToastLines,
  type PrToastEntry,
} from './workoutPr';
import {
  bodyweightOn,
  bodyweightContext,
  heaviestLoggedSetKey,
  relativeStrength,
  savedWorkoutBodyweight,
} from './relativeStrength';
import './relativeStrength.css';
import { TrainingBlocksProvider } from './TrainingBlocksProvider';
import { useTrainingBlocks } from './trainingBlocksContext';
import { isAllTimeRecord, recordBadgeLabel, recordScopeLabel } from './recordScope';
import { setResult } from './historySetFormat';
import { canResumeWorkout } from './workoutResume';
import { loggedSetCount as loggedSetCountRule } from './workoutAutoSave';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import { isSavedCopy, isUsingSavedData } from './connectionStatus';
import { trainingDataActivityLabel } from './trainingDataRefresh';
import {
  TRAINING_READS,
  readsToRequest,
  unansweredRefresh,
  type RefreshTarget,
  type TrainingRead,
  type UnansweredRefresh,
} from './trainingRefreshRetry';
import { TIME_RANGE_OPTIONS } from './dateRanges';
import { exerciseHiddenNotice } from './exerciseEdit';
import {
  exerciseProgressView,
  exerciseRecordWorkoutIds,
  rangeOutgrowsBlock,
} from './exerciseProgressScope';
import { useRangePinchZoom } from './rangePinchZoom';
import {
  captureFriendInvite,
  clearFriendInvite,
  FRIEND_INVITE_EVENT,
  pendingFriendInvite,
} from './friendInvite';
import { HISTORY_PAGE_SIZE, RANGE_LABELS, numberOrNull, prettyDate } from './appShared';
import { LoadingState } from './LoadingState';
import { BodyCompositionScreen } from './BodyCompositionScreen';
import { CardioScreen } from './CardioScreen';
import { LandscapeChartFrame } from './LandscapeChartFrame';
import { crossesNewYear } from './chartYears';
import { onWorkoutFocusRequested } from './workoutFocus';
import {
  friendRequestSentNotice,
  leaveFailedNotice,
  partners as sessionPartners,
  TRAIN_ERRORS,
  type TrainMember,
  type TrainTogetherRead,
} from './trainTogether';
import { partnerStartTemplate, unmatchedExercisesNotice } from './trainTogetherView';
import {
  captureTrainInvite,
  claimTrainInviteToken,
  pendingTrainInvite,
  releaseTrainInviteToken,
  takePendingTrainInvite,
  TRAIN_INVITE_EVENT,
} from './trainTogetherInvite';
import type { PartnerPalette } from './trainTogetherTheme';
import {
  usePartnerPalettes,
  useTrainTogether,
  type TrainTogetherController,
} from './useTrainTogether';
import { TrainTogetherDeck, TrainTogetherEntryButton } from './TrainTogetherDeck';
import { TrainTogetherPaceStrip } from './TrainTogetherPaceStrip';
import { TrainTogetherPartnerView } from './TrainTogetherPartnerView';
import { TrainTogetherSheet } from './TrainTogetherSheet';
import { TrainTogetherStartSheet } from './TrainTogetherStartSheet';
import { TrainedWithPill } from './TrainedWithPill';

// Screens that live in their own files; re-exported for existing imports of './App'.
export { BodyCompositionScreen, CardioScreen };

type SetField = 'weight' | 'reps' | 'duration' | 'distance' | 'rpe' | 'notes';
type RestAlertStatus =
  'checking' | 'available' | 'enabling' | 'enabled' | 'blocked' | 'unsupported';
type BackgroundActivity = { id: number; label: string };

const categoryNames: Record<WorkoutCategory, string> = {
  upper: 'Upper body',
  lower: 'Lower body',
  push: 'Push',
  pull: 'Pull',
  full_body: 'Full body',
  cardio: 'Cardio',
  other: 'Other',
};

/** Each exercise's history before `before`, the start of the window loaded at the time. */
type HistoryBaselines = {
  before: string;
  byExercise: Map<string, ExerciseHistoryBaseline>;
};

function setTypeTitle(item: Pick<DraftSet, 'set_type' | 'warmup' | 'failed'>): string {
  return SET_KINDS.find((option) => option.kind === setKindOf(item))?.label ?? 'Working set';
}

/** Sets pre-filled from the exercise's most recent session, marked as suggestions. */
function completedSetPerformance(
  item: DraftSet,
  cardio: boolean,
  weightUnit: WeightUnit = 'kg',
): string {
  if (cardio) {
    const values = [
      item.duration_seconds !== null ? formatDuration(item.duration_seconds) : null,
      item.distance_km !== null ? `${item.distance_km} km` : null,
      item.incline_percent != null ? `${item.incline_percent}% incline` : null,
      item.speed_kph != null ? `${item.speed_kph} km/h` : null,
    ].filter((value): value is string => value !== null);
    return values.join(' · ') || 'No result entered';
  }

  const values = [
    item.weight_kg !== null ? formatWeight(item.weight_kg, weightUnit) : null,
    item.reps !== null ? `${item.reps} reps` : null,
  ].filter((value): value is string => value !== null);
  return values.join(' × ') || 'No result entered';
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  return reorder(items, from, to);
}

function formatDuration(totalSeconds: number): string {
  return formatSeconds(totalSeconds);
}

/** Set just before the reload that follows a backup restore, so it can be confirmed. */
const BACKUP_RESTORED_KEY = 'relay-backup-restored';
const BACKUP_RESTORED_MESSAGE = 'Backup restored.';

/** Read once per page load: whether this load follows a backup restore. */
function takeBackupRestoredFlag(): boolean {
  try {
    if (window.sessionStorage.getItem(BACKUP_RESTORED_KEY) !== '1') return false;
    window.sessionStorage.removeItem(BACKUP_RESTORED_KEY);
    return true;
  } catch {
    return false;
  }
}

let backupRestoredNotice = typeof window !== 'undefined' && takeBackupRestoredFlag();

export function App() {
  const { user } = useUserSession();
  useWorkoutAutoSaveAccount(user?.id ?? null);
  const notices = useAppNotices(user?.id ?? null);
  const announcement = useReleaseAnnouncement(user?.id ?? null, user?.created_at ?? null, notices);
  return (
    <TrainingPreferencesProvider>
      <WorkoutTypesProvider>
        <AppNoticesContext.Provider value={notices}>
          <ReleaseAnnouncementContext.Provider value={announcement}>
            <TrainingBlocksProvider key={user?.id}>
              <TipsProvider key={user?.id} account={user?.id ?? null}>
                <AppContent />
              </TipsProvider>
            </TrainingBlocksProvider>
          </ReleaseAnnouncementContext.Provider>
        </AppNoticesContext.Provider>
      </WorkoutTypesProvider>
    </TrainingPreferencesProvider>
  );
}

function AppContentProviders({
  exercises,
  updatePartialSets,
  settingsNavigation,
  children,
}: {
  exercises: Exercise[];
  updatePartialSets: (id: string, enabled: boolean, weekStart: string) => Promise<Exercise>;
  settingsNavigation: ContextType<typeof SettingsNavigationContext>;
  children: ReactNode;
}) {
  return (
    <ExerciseCreditsContext.Provider value={{ exercises, updatePartialSets }}>
      <SettingsNavigationContext.Provider value={settingsNavigation}>
        {children}
      </SettingsNavigationContext.Provider>
    </ExerciseCreditsContext.Provider>
  );
}

function AppContent() {
  const tips = useTips();
  const { configure: configureTips } = tips;
  const [settingsJump, setSettingsJump] = useState<SettingsJump | null>(null);
  const settingsJumpSerial = useRef(0);
  const [settingsGroup, setSettingsGroup] = useState<SettingsGroupId | null>(() =>
    new URLSearchParams(window.location.search).has('youtube') ? 'data' : null,
  );
  const { user, signingIn = false, confirmed: sessionConfirmed = true } = useUserSession();
  usePresenceConnection(user?.id ?? null);
  // The workout just finished, shown on Home until it is dismissed or the next one starts.
  const [finishSummary, setFinishSummary] = useState<FinishSummary | null>(null);
  // Without accounts there is one person on the device, kept under a fixed name.
  const finishSummaryOwner = user?.id ?? 'device';
  useEffect(() => {
    setFinishSummary(readFinishSummary(finishSummaryOwner, Date.now()));
  }, [finishSummaryOwner]);
  const finishSummaryRef = useRef(finishSummary);
  finishSummaryRef.current = finishSummary;
  /** Records set by the workout on the card; they arrive once it has synced. */
  const [finishRecords, setFinishRecords] = useState<PersonalRecord[]>([]);
  const [finishShareOpen, setFinishShareOpen] = useState(false);
  function rememberFinish(summary: FinishSummary | null) {
    setFinishSummary(summary);
    setFinishRecords([]);
    writeFinishSummary(finishSummaryOwner, summary);
  }
  /** Takes the card off Home once fresh history no longer has its workout: it was deleted. */
  function forgetFinishIfGone(loaded: TrackedWorkout[], loadedFrom: string) {
    const summary = finishSummaryRef.current;
    const waiting = readFinishedWorkouts().map(({ pendingSave }) => ({
      id: pendingSave.workoutId,
      client_session_id: pendingSave.payload.client_session_id,
    }));
    if (summary && finishSummaryWorkoutGone(summary, loaded, waiting, loadedFrom))
      rememberFinish(null);
  }
  // The card also goes when the app has stayed open, or been asleep, past its time.
  useEffect(() => {
    if (!finishSummary) return;
    const expire = () => {
      if (finishSummaryTimeLeft(finishSummary, Date.now()) >= 0) return;
      setFinishSummary(null);
      setFinishRecords([]);
      writeFinishSummary(finishSummaryOwner, null);
    };
    const timer = window.setTimeout(
      expire,
      finishSummaryTimeLeft(finishSummary, Date.now()) + 1000,
    );
    // A sleeping phone does not run timers, so look again whenever the app comes back.
    document.addEventListener('visibilitychange', expire);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', expire);
    };
  }, [finishSummary, finishSummaryOwner]);
  /** The exercise whose Machine weights should open when its progress page next shows. */
  const [machineWeightsFor, setMachineWeightsFor] = useState<string | null>(null);
  /** Counts requests to open the weight goal form, from a tip. */
  const [bodyGoalRequest, setBodyGoalRequest] = useState(0);
  const [tipBlocksOpen, setTipBlocksOpen] = useState(false);
  const announcement = useContext(ReleaseAnnouncementContext)!;
  const appUpdates = useAppUpdates();
  const appNotices = useAppNoticesContext();
  /** The prompt that opened by itself this visit. Others then wait for the next app open. */
  const [launchPrompt, setLaunchPrompt] = useState<LaunchPrompt | null>(null);
  const homeScreenGuide = useHomeScreenGuide(user?.id ?? null, announcement.checked);
  const [guideWaiting, setGuideWaiting] = useState(() => user !== null && appGuideWaiting(user.id));
  const [guideRequested, setGuideRequested] = useState(false);
  const [importStepPending, setImportStepPending] = useState(
    () => user !== null && importStepWaiting(user.id),
  );
  const [csvGuideOpen, setCsvGuideOpen] = useState(false);
  // Choosing to import keeps What's new until the person leaves Settings.
  const [releaseAfterImport, setReleaseAfterImport] = useState(false);
  const guideReturnTab = useRef<AppTab | null>(null);
  const videosAllowed = canUploadVideos(user);
  const isAdmin = user?.is_admin === true;
  const initialHistoryState = isAppHistoryState(window.history.state) ? window.history.state : null;
  const [tab, setTabState] = useState<AppTab>(() => {
    const initialTab = initialHistoryState
      ? initialHistoryState.tab
      : appTabFromHash(window.location.hash);
    // Which member was open is not kept across a reload, so show your own profile.
    return initialTab === 'shared-profile' ? 'profile' : initialTab;
  });
  const historyIndexRef = useRef(initialHistoryState?.index ?? 0);
  const home = useHomeLayout(tab === 'dashboard');
  const openFeedback = useOpenFeedbackCount(
    tab === 'dashboard' ||
      tab === 'settings' ||
      tab === 'profile' ||
      tab === 'body' ||
      tab === 'social' ||
      historySectionForTab(tab) !== null,
    isAdmin,
  );
  const scrollPositionsRef = useRef(new Map<number, number>());
  /** Each main screen's scroll, restored when the tab bar selects it again. */
  const tabScrollRef = useRef(new Map<AppTab, number>());
  const restoreScrollRef = useRef<number | null>(null);
  /** Counts tab-bar taps on the current tab, which return Training to its exercise list. */
  const [tabRootRequest, setTabRootRequest] = useState(0);
  const navigationActionRef = useRef<'push' | 'replace' | 'pop'>('replace');
  const currentTabRef = useRef(tab);
  const initialRefreshStartedRef = useRef(false);
  const backgroundActivityIdRef = useRef(0);
  const refreshGenerationRef = useRef(0);
  const refreshingDataRef = useRef(0);
  const trainingRevisionRef = useRef<string | null>(null);
  /** The last refresh the server did not fully answer, until one is; see `readsToRequest`. */
  const unansweredRefreshRef = useRef<UnansweredRefresh | null>(null);
  const dashboardDateRef = useRef(localDate());
  const [dataRevision, setDataRevision] = useState<string | null>(null);
  currentTabRef.current = tab;
  const [visitedTabs, setVisitedTabs] = useState(() => new Set<AppTab>([tab]));
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [exerciseCatalogue, setExerciseCatalogue] = useState<{
    exercises: Exercise[];
    loaded: boolean;
    error: string | null;
  }>({ exercises: [], loaded: false, error: null });
  const { exercises } = exerciseCatalogue;
  const setExercises = (update: Exercise[] | ((current: Exercise[]) => Exercise[])) => {
    exerciseEditsRef.current += 1;
    setExerciseCatalogue((current) => ({
      ...current,
      exercises: typeof update === 'function' ? update(current.exercises) : update,
    }));
  };
  const [workouts, setWorkouts] = useState<TrackedWorkout[]>([]);
  // The workout on Home's finished card once it has saved, for View workout, Share and Undo.
  const finishedSaved = finishSummary?.sessionId
    ? workouts.find((workout) => workout.client_session_id === finishSummary.sessionId)
    : undefined;
  // Workouts and calendar days are loaded from this date onwards; older ones load on demand.
  const [historyStart, setHistoryStart] = useState(() => initialHistoryStart());
  const historyStartRef = useRef(historyStart);
  const [olderHistory, setOlderHistory] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });
  const loadingOlderHistoryRef = useRef(false);
  const [historyBaselines, setHistoryBaselines] = useState<HistoryBaselines | null>(null);
  const [measurements, setMeasurements] = useState<BodyMeasurement[]>([]);
  const bodyMeasurementSync = useBodyMeasurementSync(user?.id ?? null, setMeasurements);
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [completionRecords, setCompletionRecords] = useState<PersonalRecord[]>([]);
  const [restTimerEnabled, setRestTimerEnabled] = useState(restTimerPreferenceEnabled);
  const [restAlertReminderOpen, setRestAlertReminderOpen] = useState(false);
  const closeRestAlertReminder = useCallback(() => setRestAlertReminderOpen(false), []);
  const [showRestTimes, setShowRestTimes] = useState(restTimesPreferenceEnabled);
  // The live workout's rest end, so the tab bar can count it down away from the workout.
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  // When a finished rest is waiting for the next set, so the tab bar's bell can ring.
  const [restDoneAt, setRestDoneAt] = useState<number | null>(null);
  // Bumped by the ringing bell to open the workout at the next set.
  const [restGoRequest, setRestGoRequest] = useState(0);
  const [liveWorkoutSummary, setLiveWorkoutSummary] = useState<LiveWorkoutSummary | null>(null);
  const [workoutResumeRequest, setWorkoutResumeRequest] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(reduceMotionPreference);
  const [navDirection, setNavDirection] = useState<'forward' | 'back'>('forward');
  const [bodyTrendPreference, setBodyTrendPreference] = useState(loadBodyTrendPreference);
  const workoutTypes = useWorkoutTypes();
  const weightUnit = useWeightUnit();
  const upNext = useUpNextSession(dashboard?.recommendation, workouts);
  // On a rest day, the Start menu's Up next starts the split's next training day instead.
  const nextTrainingDay = useUpNextSession(
    upNext.isRestDay ? dashboard?.recommendation?.next_training_day : null,
    workouts,
  );
  const startMenuUpNext = upNext.isRestDay ? nextTrainingDay : upNext;
  const [splitMoving, setSplitMoving] = useState(false);
  // Up next's split day and the workout day after it, while that day can be skipped.
  const splitSkip = useMemo(
    () =>
      splitSkipMove(
        dashboard?.training_split,
        upNext.recommendation,
        upNext.needsSplitUpdate,
        localDate(),
      ),
    [dashboard?.training_split, upNext.recommendation, upNext.needsSplitUpdate],
  );
  const workoutTypeColors = useMemo(
    () => builtinTypeColors(workoutTypes.types),
    [workoutTypes.types],
  );
  const [workoutStartDate, setWorkoutStartDate] = useState(localDate());
  const [editingWorkout, setEditingWorkout] = useState<TrackedWorkout | null>(null);
  /** Set by the open editor: asks before Back throws away its unsaved changes. */
  const workoutEditGuardRef = useRef<LeaveGuard | null>(null);
  const [resumingWorkoutId, setResumingWorkoutId] = useState<string | null>(() => {
    const draft = readActiveWorkoutDraft();
    return draft?.pendingSave ? null : (draft?.resumingWorkoutId ?? null);
  });
  const [activeWorkoutStartedAt, setActiveWorkoutStartedAt] = useState<number | null>(() => {
    const draft = readActiveWorkoutDraft();
    return draft?.pendingSave ? null : (draft?.startedAt ?? null);
  });
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  // The opened shared profile; each opening refetches it, while Back reveals the cached screen.
  const [sharedProfile, setSharedProfile] = useState<{
    id: string;
    name: string;
    opened: number;
    workout?: Pick<TrackedWorkout, 'id' | 'workout_date'>;
    /** Opened from a friend QR code, before its name has loaded. */
    invite?: boolean;
  } | null>(null);
  const [friendInvite, setFriendInvite] = useState(() => pendingFriendInvite());
  const [historyExerciseId, setHistoryExerciseId] = useState<string | null>(null);
  const [historyMovementId, setHistoryMovementId] = useState<string | null>(null);
  const [historyOpenCount, setHistoryOpenCount] = useState(0);
  const sectionFromTab = historySectionForTab(tab);
  const [lastHistorySection, setLastHistorySection] = useState<HistorySection>(
    sectionFromTab ?? 'history',
  );
  if (sectionFromTab && sectionFromTab !== lastHistorySection) {
    setLastHistorySection(sectionFromTab);
  }
  const historySection = sectionFromTab ?? lastHistorySection;
  const historyGroupVisited =
    sectionFromTab !== null ||
    visitedTabs.has('training') ||
    visitedTabs.has('history') ||
    visitedTabs.has('progress') ||
    visitedTabs.has('cardio');
  const [workoutTemplate, setWorkoutTemplate] = useState<SessionTemplate | null>(null);
  const [splitDestination, setSplitDestination] = useState<{
    routineId?: string;
  }>({});
  // The type chosen from the Start menu's Cardio option, before any exercise is added.
  const [workoutStartCategory, setWorkoutStartCategory] = useState<WorkoutCategory | null>(null);
  const [workoutStartType, setWorkoutStartType] = useState<WorkoutType | null>(null);
  const [loading, setLoading] = useState(true);
  // The revision the server reported when it confirmed who is signed in. With it, the first
  // reads and the other tabs' background loads all start together instead of in turn.
  const [startRevision] = useState(() => (user ? revisionAtSignIn(user) : null));
  // The revision the opening reads start from: that one, or the one the app asked for itself
  // (an account opened before its session check answered, or an older server).
  const [openingRevision, setOpeningRevision] = useState(startRevision);
  /** What the server has answered this visit; this device's saved copies never replace it. */
  const answeredRef = useRef({
    exercises: false,
    workouts: false,
    records: false,
    checkIns: false,
  });
  /** Set once the first refresh has finished, so background loads for hidden screens can follow. */
  const [startupRefreshed, setStartupRefreshed] = useState(false);
  /**
   * True once Home's figures are known to be current: the server has answered this visit, or it
   * confirmed that nothing changed since this device saved them today. Until then Home can show
   * an older copy, so nothing is started or recorded from it.
   */
  const [homeConfirmed, setHomeConfirmed] = useState(false);
  const homeConfirmedRef = useRef(homeConfirmed);
  homeConfirmedRef.current = homeConfirmed;
  /** A start chosen before Home's figures were confirmed. It runs once they are. */
  const waitingStartRef = useRef<{ run: () => void; finish: () => void } | null>(null);
  /** Counts exercise changes made here, so a read that began before one cannot undo it. */
  const exerciseEditsRef = useRef(0);
  const exerciseLibrary = useExerciseLibrary(
    exercises,
    dataRevision ?? openingRevision,
    // From the moment the revision is known, beside the opening reads; without one, after them.
    openingRevision !== null || startupRefreshed,
    exerciseCatalogue.loaded,
  );
  const { show: showToast, dismiss: dismissToast, active: toastActive } = useToast();
  const [backgroundActivities, setBackgroundActivities] = useState<BackgroundActivity[]>([]);
  const [editingWorkoutSaving, setWorkoutSaving] = useState(false);
  const finishedQueue = useFinishedWorkoutQueue(user?.id ?? null, (saved, resumedId, queued) =>
    completeWorkoutSave(saved, false, resumedId, queued),
  );
  const conflictPrompt = useWorkoutConflictPrompt();
  const workoutSaving = editingWorkoutSaving || finishedQueue.saving;
  // Finished workouts wait in their own queue, so only saving an edit stops a new workout.
  const workoutSaveBlocked = editingWorkoutSaving;
  // Finished workouts show straight away from this device's copy while they sync. One the server
  // refused waits for review instead, so it is not presented as saved.
  const waitingWorkouts = useMemo(
    () =>
      finishedQueue.items.filter(
        (finished) => !(finishedWorkoutKey(finished) in finishedQueue.refusals),
      ),
    [finishedQueue.items, finishedQueue.refusals],
  );
  const finishedPreviews = useMemo(
    () =>
      waitingWorkouts.flatMap((finished) => {
        const workout = pendingWorkoutPreview(finished.pendingSave, exercises, workoutTypes.types);
        return workout ? [{ workout, isNew: finished.pendingSave.workoutId === null }] : [];
      }),
    [exercises, waitingWorkouts, workoutTypes.types],
  );
  const syncingWorkoutIds = useMemo(
    () => finishedPreviews.map((preview) => preview.workout.id),
    [finishedPreviews],
  );
  // A workout still syncing, or with changes waiting to sync, cannot be edited or deleted yet.
  const queuedIds = useMemo(() => queuedWorkoutIds(finishedQueue.items), [finishedQueue.items]);
  /** Reports and refuses changes to a workout whose save has not reached the server yet. */
  const blockedWhileSyncing = (id: string) => {
    if (!workoutBlockedWhileSyncing(id, queuedIds)) return false;
    showToast({ message: WORKOUT_SYNCING_MESSAGE, variant: 'warning' });
    return true;
  };
  // After each save, its on-device figures stay until the refreshed dashboard replaces them.
  const [savedPreviews, setSavedPreviews] = useState<
    Array<{
      finished: FinishedWorkout;
      workout: TrackedWorkout;
      dashboard: DashboardData | null;
      isNew: boolean;
    }>
  >([]);
  const awaitingDashboard = useMemo(
    () => savedPreviews.filter((preview) => preview.dashboard === dashboard),
    [dashboard, savedPreviews],
  );
  // A deleted workout disappears at once and is removed once its Undo has passed.
  const workoutDeletion = useDeferredDelete(commitWorkoutDelete);
  const deletingWorkoutId = workoutDeletion.pending?.id ?? null;
  const shownWorkouts = useMemo(
    () =>
      finishedPreviews
        .reduce((current, preview) => workoutsWithPreview(current, preview.workout), workouts)
        .filter((workout) => workout.id !== deletingWorkoutId),
    [deletingWorkoutId, finishedPreviews, workouts],
  );
  const shownDashboard = useMemo(() => {
    if (!dashboard) return dashboard;
    const today = localDate();
    return [...awaitingDashboard, ...finishedPreviews].reduce(
      (current, preview) =>
        dashboardWithPreview(current, preview.workout, workoutTypes.types, today, preview.isNew),
      dashboard,
    );
  }, [awaitingDashboard, dashboard, finishedPreviews, workoutTypes.types]);
  const finishedMuscleSources = useMemo(
    () =>
      finishedMuscleSourcesFor(
        awaitingDashboard.map((preview) => ({
          id: preview.workout.id,
          finished: preview.finished,
        })),
        finishedQueue.items,
        finishedQueue.refusals,
      ),
    [awaitingDashboard, finishedQueue.items, finishedQueue.refusals],
  );
  const muscleSets = useLiveMuscleSets(dashboard, exercises, workouts, finishedMuscleSources);
  const reviewMuscleWeeks = useMemo(() => {
    const current = muscleSets.weeklySets ?? dashboard?.weekly_sets;
    return current
      ? [current, ...(muscleSets.history ?? dashboard?.weekly_sets_history ?? [])]
      : [];
  }, [dashboard?.weekly_sets, dashboard?.weekly_sets_history, muscleSets]);
  // Cancel this browser's legacy elapsed-time reminder; the server tracks shared activity.
  useActiveWorkoutReminder(null);
  const workoutSync = useActiveWorkoutSync(user?.id ?? null);
  const showTrainErrorToast = useCallback(
    (message: string) => showToast({ message, variant: 'error' }),
    [showToast],
  );
  const trainTogether = useTrainTogether(user?.id ?? null, showToast, {
    confirmed: sessionConfirmed,
    onErrorNotice: showTrainErrorToast,
    onPartnerRetired: (partnerId) =>
      setActivePartnerId((current) => (current === partnerId ? null : current)),
  });
  const trainPalettes = usePartnerPalettes(Math.max(trainTogether.partners.length, 1));
  const [trainSheetOpen, setTrainSheetOpen] = useState(false);
  const [trainStartPartnerId, setTrainStartPartnerId] = useState<string | null>(null);
  const [activePartnerId, setActivePartnerId] = useState<string | null>(null);
  const [trainInviteTick, setTrainInviteTick] = useState(0);
  const trainMountedRef = useRef(true);
  const trainUserIdRef = useRef<string | null>(user?.id ?? null);
  trainUserIdRef.current = user?.id ?? null;
  const activeWorkoutStartedAtRef = useRef<number | null>(activeWorkoutStartedAt);
  activeWorkoutStartedAtRef.current = activeWorkoutStartedAt;
  const leavingTrainSessionRef = useRef(false);
  const lastPartnerFocusIdRef = useRef<string | null>(null);
  const prevActivePartnerIdRef = useRef<string | null>(null);
  const trainActionToastOpenRef = useRef(false);
  const completeTrainJoin = (joined: TrainTogetherRead) => {
    const joinedPartners = sessionPartners(joined.session);
    const currentDraft = readActiveWorkoutDraft();
    const hasLiveWorkout =
      activeWorkoutStartedAtRef.current !== null ||
      Boolean(currentDraft && !currentDraft.pendingSave);
    if (hasLiveWorkout) {
      setEditingWorkout(null);
      resumeLiveWorkout();
    } else if (joinedPartners.length > 0) {
      const withWorkout = joinedPartners.find((p) => p.workout !== null) ?? joinedPartners[0];
      setTrainStartPartnerId(withWorkout.user_id);
    }
  };
  const openTrainSheet = useCallback(() => setTrainSheetOpen(true), []);
  const leaveTrainSession = useCallback(async (): Promise<boolean> => {
    if (leavingTrainSessionRef.current) return false;
    leavingTrainSessionRef.current = true;
    try {
      await trainTogether.leave();
      setActivePartnerId(null);
      return true;
    } catch {
      if (trainMountedRef.current) {
        showToast({
          message: leaveFailedNotice,
          variant: 'error',
        });
      }
      return false;
    } finally {
      leavingTrainSessionRef.current = false;
    }
  }, [showToast, trainTogether]);
  const handleLeaveTrainSession = useCallback(() => {
    void leaveTrainSession();
  }, [leaveTrainSession]);
  useEffect(() => {
    trainMountedRef.current = true;
    return () => {
      trainMountedRef.current = false;
      if (trainActionToastOpenRef.current) {
        trainActionToastOpenRef.current = false;
        dismissToast();
      }
    };
  }, [dismissToast]);
  useEffect(() => {
    if (trainActionToastOpenRef.current) {
      trainActionToastOpenRef.current = false;
      dismissToast();
    }
  }, [user?.id, dismissToast]);
  const [syncConflictDismissed, setSyncConflictDismissed] = useState(false);
  useEffect(() => {
    const remoteWorkout = () => {
      const draft = readActiveWorkoutDraft();
      setActiveWorkoutStartedAt(draft?.startedAt ?? null);
      setResumingWorkoutId(draft?.resumingWorkoutId ?? null);
    };
    window.addEventListener(REMOTE_WORKOUT_APPLIED, remoteWorkout);
    return () => window.removeEventListener(REMOTE_WORKOUT_APPLIED, remoteWorkout);
  }, []);
  useEffect(() => {
    if (!workoutSync.conflict) setSyncConflictDismissed(false);
  }, [workoutSync.conflict]);
  useEffect(() => {
    // A URL (including an old phone notification) is navigation, never a Start action.
    if (tab !== 'log' || editingWorkout || activeWorkoutStartedAt !== null) return;
    navigationActionRef.current = 'replace';
    setTabState('dashboard');
  }, [activeWorkoutStartedAt, editingWorkout, tab]);
  useEffect(() => {
    if (activeWorkoutStartedAt === null) return;
    const reconcileDraft = () => {
      const draft = readActiveWorkoutDraft();
      if (draft?.startedAt === activeWorkoutStartedAt) return;
      // Another tab finished, discarded or replaced this session. Do not erase its new draft.
      setActiveWorkoutStartedAt(null);
      setResumingWorkoutId(null);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === ACTIVE_WORKOUT_DRAFT_KEY || event.key === null) reconcileDraft();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [activeWorkoutStartedAt]);
  useEffect(() => {
    if (loading || activeWorkoutStartedAt === null) return;
    const expireEmptyDraft = () => {
      const draft = readActiveWorkoutDraft();
      if (draft?.startedAt !== activeWorkoutStartedAt || !isExpiredEmptyWorkoutDraft(draft)) return;
      clearActiveWorkoutDraft();
      setActiveWorkoutStartedAt(null);
      setResumingWorkoutId(null);
      showToast('Your inactive empty workout was cleared.');
    };
    expireEmptyDraft();
    const interval = window.setInterval(expireEmptyDraft, 30_000);
    window.addEventListener('focus', expireEmptyDraft);
    document.addEventListener('visibilitychange', expireEmptyDraft);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', expireEmptyDraft);
      document.removeEventListener('visibilitychange', expireEmptyDraft);
    };
  }, [activeWorkoutStartedAt, loading, showToast]);
  useEffect(() => {
    // Accounts without upload access never reach the video screen, even from an old #videos link.
    if (tab !== 'videos' || videosAllowed) return;
    navigationActionRef.current = 'replace';
    setTabState('dashboard');
  }, [tab, videosAllowed]);
  useEffect(() => {
    // A reloaded #shared-profile link has no profile to show, so it opens Friends instead.
    if (tab !== 'shared-profile' || sharedProfile) return;
    navigationActionRef.current = 'replace';
    setTabState('profile');
  }, [tab, sharedProfile]);
  useEffect(() => {
    // Only administrators can open the admin console, even from an old #admin link.
    if (tab !== 'admin' || isAdmin) return;
    navigationActionRef.current = 'replace';
    setTabState('settings');
  }, [tab, isAdmin]);
  useEffect(() => {
    if (loading || activeWorkoutStartedAt === null) return;
    const draft = readActiveWorkoutDraft();
    if (!draft || !workouts.some((workout) => savedWorkoutMatchesOldDraft(draft, workout))) return;
    clearActiveWorkoutDraft();
    setActiveWorkoutStartedAt(null);
    setResumingWorkoutId(null);
    if (tab === 'log') {
      navigationActionRef.current = 'replace';
      setTabState('dashboard');
    }
  }, [activeWorkoutStartedAt, loading, tab, workouts]);
  const activeWorkoutDate =
    activeWorkoutStartedAt === null
      ? null
      : (readActiveWorkoutDraft()?.workoutDate ?? workoutStartDate);
  const resumingWorkout = resumingWorkoutId
    ? (workouts.find((workout) => workout.id === resumingWorkoutId) ?? null)
    : null;
  const activeDraft = editingWorkout ? null : readActiveWorkoutDraft();
  const liveLoggerSession = useRef<LoggerSession | null>(null);
  if (activeWorkoutStartedAt === null) liveLoggerSession.current = null;
  else if (!editingWorkout)
    liveLoggerSession.current = nextLoggerSession(
      liveLoggerSession.current,
      String(activeWorkoutStartedAt),
      activeDraft?.clientSessionId,
    );
  const restoredDraftMovements = activeDraft
    ? restoreWorkoutDraftMovements(activeDraft.movements, exercises)
    : [];
  const workoutCatalogueReady = exerciseCatalogue.loaded && restoredDraftMovements !== null;
  const todayMeasurement = measurements.find(
    (measurement) => measurement.measurement_date === localDate(),
  );
  const backgroundActivityLabel =
    backgroundActivities.length > 0
      ? backgroundActivities[backgroundActivities.length - 1].label
      : null;
  const canNavigateBack =
    tab !== 'dashboard' ||
    (isAppHistoryState(window.history.state) && window.history.state.index > 0);

  const setTab = useCallback((nextTab: AppTab, options: { replace?: boolean } = {}) => {
    if (nextTab === currentTabRef.current) return;
    scrollPositionsRef.current.set(historyIndexRef.current, window.scrollY);
    if (isMainTabScreen(currentTabRef.current))
      tabScrollRef.current.set(tabScrollKey(currentTabRef.current), window.scrollY);
    navigationActionRef.current = options.replace ? 'replace' : 'push';
    setNavDirection('forward');
    setTabState(nextTab);
  }, []);
  useEffect(() => {
    // An invite link opened in an already-open app only changes the address's hash.
    const onHashChange = () => {
      const id = captureFriendInvite();
      if (id) setFriendInvite(id);
    };
    // A code scanned inside the app has already stored its invite.
    const onScanned = () => setFriendInvite(pendingFriendInvite());
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener(FRIEND_INVITE_EVENT, onScanned);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener(FRIEND_INVITE_EVENT, onScanned);
    };
  }, []);
  useEffect(() => {
    const onTrainHash = () => {
      const token = captureTrainInvite();
      if (token) setTrainInviteTick((n) => n + 1);
    };
    const onTrainScanned = () => {
      if (pendingTrainInvite()) setTrainInviteTick((n) => n + 1);
    };
    window.addEventListener('hashchange', onTrainHash);
    window.addEventListener(TRAIN_INVITE_EVENT, onTrainScanned);
    return () => {
      window.removeEventListener('hashchange', onTrainHash);
      window.removeEventListener(TRAIN_INVITE_EVENT, onTrainScanned);
    };
  }, []);
  useEffect(() => {
    const prev = prevActivePartnerIdRef.current;
    prevActivePartnerIdRef.current = activePartnerId;
    if (activePartnerId) {
      lastPartnerFocusIdRef.current = activePartnerId;
      return;
    }
    if (!prev) return;
    const targetId = lastPartnerFocusIdRef.current;
    window.requestAnimationFrame(() => {
      const partnerBtn = targetId
        ? ([...document.querySelectorAll<HTMLButtonElement>('[data-tt-log-for]')].find(
            (button) => button.dataset.ttLogFor === targetId,
          ) ?? null)
        : null;
      const fallback = document.querySelector<HTMLButtonElement>(
        '.live-workout-header .live-workout-options, .live-workout-header .workout-sheet-grab',
      );
      (partnerBtn ?? fallback)?.focus({ preventScroll: true });
    });
  }, [activePartnerId]);
  useEffect(() => {
    if (!activePartnerId) return;
    const stillActive = trainTogether.partners.some(
      (partner) => partner.user_id === activePartnerId && partner.workout !== null,
    );
    if (!stillActive) setActivePartnerId(null);
  }, [activePartnerId, trainTogether.partners]);
  useEffect(() => {
    if (!user || !sessionConfirmed || !pendingTrainInvite()) return;
    const ownerUserId = user.id;
    const accountScope = captureAccountCacheScope();
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled || !trainMountedRef.current || trainUserIdRef.current !== ownerUserId) return;
      const token = takePendingTrainInvite();
      if (!token || !claimTrainInviteToken(token)) return;
      void trainTogether
        .join(token)
        .then((joined) => {
          if (!joined || !trainMountedRef.current || trainUserIdRef.current !== ownerUserId) return;
          completeTrainJoin(joined);
        })
        .catch((reason: unknown) => {
          if (!trainMountedRef.current || trainUserIdRef.current !== ownerUserId) return;
          if (
            reason instanceof ApiError &&
            reason.code === TRAIN_ERRORS.notFriends &&
            reason.member
          ) {
            const target = reason.member;
            trainActionToastOpenRef.current = true;
            showToast({
              message: reason.message,
              variant: 'error',
              duration: 'important',
              onDismiss: () => {
                trainActionToastOpenRef.current = false;
              },
              onTimeout: () => {
                trainActionToastOpenRef.current = false;
              },
              action: {
                label: 'Add friend',
                run: async () => {
                  if (
                    !trainMountedRef.current ||
                    trainUserIdRef.current !== ownerUserId ||
                    !accountScope.isCurrent()
                  ) {
                    trainActionToastOpenRef.current = false;
                    dismissToast();
                    return;
                  }
                  try {
                    const res = await api.sharing.addFriend(target.user_id);
                    if (!trainMountedRef.current || trainUserIdRef.current !== ownerUserId) return;
                    trainActionToastOpenRef.current = false;
                    showToast(
                      res.status === 'friends'
                        ? `Added ${target.name} as a friend`
                        : friendRequestSentNotice(target.name),
                    );
                  } catch (err) {
                    if (!trainMountedRef.current || trainUserIdRef.current !== ownerUserId) return;
                    trainActionToastOpenRef.current = false;
                    showToast({
                      message:
                        err instanceof Error ? err.message : 'Could not send friend request.',
                      variant: 'error',
                    });
                  }
                },
              },
            });
            return;
          }
          showToast({
            message: reason instanceof Error ? reason.message : 'Could not join this session.',
            variant: 'error',
          });
        })
        .finally(() => {
          releaseTrainInviteToken(token);
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionConfirmed, trainInviteTick]);
  // A notification opens the reacted or commented workout in Social's feed.
  useEffect(() => onWorkoutFocusRequested(() => setTab('social')), [setTab]);
  // A person named in a notification opens their shared profile.
  useEffect(() => onSharedProfileRequested(openSharedProfile));
  // An admin's password reset notification opens that account in the admin console.
  useEffect(
    () => onAdminAccountFocusRequested(() => (isAdmin ? setTab('admin') : undefined)),
    [isAdmin, setTab],
  );
  useEffect(() => {
    // A tapped password reset phone alert opens the console at the account it is about.
    const userId = takeAdminAccountFromUrl();
    if (userId && isAdmin) requestAdminAccountFocus(userId);
  }, [isAdmin]);
  useEffect(() => {
    // A friend QR code opens the inviter's profile, which sends them a friend request.
    if (!friendInvite || !user) return;
    clearFriendInvite();
    setFriendInvite(null);
    if (friendInvite === user.id) {
      setTab('profile');
      return;
    }
    setSharedProfile((current) => ({
      id: friendInvite,
      name: 'Friend invite',
      opened: (current?.opened ?? 0) + 1,
      invite: true,
    }));
    setTab('shared-profile');
  }, [friendInvite, user, setTab]);

  /**
   * The tab bar. Switching between main screens replaces the history entry, so Back does not
   * replay every tab, and each screen comes back where it was left. Tapping the current tab
   * returns to its top, out of a member's profile or an exercise's detail first.
   */
  function selectMainTab(nextMain: MainTab) {
    const current = currentTabRef.current;
    if (mainTabFor(current) === nextMain) {
      if (current === 'shared-profile') {
        setTab('social', { replace: true });
        return;
      }
      setTabRootRequest((request) => request + 1);
      window.scrollTo({ top: 0, behavior: motionReduced() ? 'auto' : 'smooth' });
      return;
    }
    const next =
      nextMain === 'training'
        ? lastHistorySection === 'history'
          ? 'training'
          : lastHistorySection
        : nextMain;
    restoreScrollRef.current = tabScrollRef.current.get(tabScrollKey(next)) ?? 0;
    setTab(next, { replace: isMainTabScreen(current) });
  }

  function navigateBack() {
    if (tab === 'settings' && settingsGroup !== null) {
      setSettingsGroup(null);
      return;
    }
    const currentState = window.history.state;
    if (tab === 'log') {
      // Unsaved changes to a saved workout are only thrown away once confirmed.
      if (editingWorkout && workoutEditGuardRef.current?.()) return;
      if (!editingWorkoutSaving) setEditingWorkout(null);
      if (isAppHistoryState(currentState) && currentState.index > 0) {
        window.history.back();
        return;
      }
      setTab(editingWorkout ? 'history' : 'dashboard', { replace: true });
      return;
    }
    if (isAppHistoryState(currentState) && currentState.index > 0) {
      window.history.back();
      return;
    }
    if (tab !== 'dashboard') setTab('dashboard', { replace: true });
  }

  function resumeLiveWorkout() {
    setWorkoutResumeRequest((request) => request + 1);
    setTab('log');
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          '.workout-browser [data-workout-session]:not([hidden]) .workout-sheet-grab, .workout-browser [data-workout-session]:not([hidden]) .overlay-header-back',
        )
        ?.focus({ preventScroll: true });
    });
  }

  function beginBackgroundActivity(label: string): () => void {
    const id = ++backgroundActivityIdRef.current;
    setBackgroundActivities((current) => [...current, { id, label }]);
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      setBackgroundActivities((current) => current.filter((activity) => activity.id !== id));
    };
  }

  async function withBackgroundActivity<T>(label: string, operation: () => Promise<T>): Promise<T> {
    const finish = beginBackgroundActivity(label);
    try {
      return await operation();
    } finally {
      finish();
    }
  }

  async function refreshData({
    silent = false,
    activityLabel = trainingDataActivityLabel('startup'),
    knownRevision = null,
    onRevision,
  }: {
    silent?: boolean;
    activityLabel?: string | null;
    /** A revision the server already reported, such as a save's, so the reads start at once. */
    knownRevision?: string | null;
    /** Told the revision the reads start from, as soon as it is known. */
    onRevision?: (revision: string) => void;
  } = {}) {
    const generation = ++refreshGenerationRef.current;
    const cacheScope = captureAccountCacheScope();
    const current = () => generation === refreshGenerationRef.current && cacheScope.isCurrent();
    const refresh = async () => {
      // Read before the data: a change during this refresh must trigger another pass. A save's
      // revision already precedes these reads, so they start without asking again. Offline,
      // there is no revision to confirm and saved copies answer the reads straight away.
      const revision = isUsingSavedData()
        ? null
        : knownRevision
          ? { revision: knownRevision }
          : await api.workoutRevision().catch(() => null);
      if (!current()) return;
      if (revision) onRevision?.(revision.revision);
      const windowStart = historyStartRef.current;
      const dashboardRequestDate = localDate();
      const target: RefreshTarget = {
        revision: revision?.revision ?? null,
        date: dashboardRequestDate,
        windowStart,
      };
      // A quiet retry of a refresh the server only partly answered asks for what is still owed.
      // The workout list is always read: at a revision this device already holds it answers
      // from the device, and what follows a full answer needs the list.
      const wanted = new Set<TrainingRead>(
        silent
          ? [...readsToRequest(unansweredRefreshRef.current, target), 'workouts']
          : TRAINING_READS,
      );
      // The reads the server itself answered. A failed read, one answered from this device's
      // saved copy, and an answer older than a change made here meanwhile are all left out.
      const answered = new Set<TrainingRead>();
      const fromServer = (read: TrainingRead, answer: unknown) => {
        if (!isSavedCopy(answer)) answered.add(read);
      };
      const when = <T,>(read: TrainingRead, start: () => Promise<T>): Promise<T | void> =>
        wanted.has(read) ? start() : Promise.resolve();
      const exerciseEditsBefore = exerciseEditsRef.current;
      let loadedWorkouts: TrackedWorkout[] = [];
      const results = await Promise.allSettled([
        when('dashboard', () =>
          api.dashboard(windowStart).then((nextDashboard) => {
            if (!current()) return;
            fromServer('dashboard', nextDashboard);
            dashboardDateRef.current = dashboardRequestDate;
            startTransition(() =>
              setDashboard((current) => {
                const olderDays = keepLoadedBefore(
                  current?.heatmap ?? [],
                  windowStart,
                  historyStartRef.current,
                );
                return olderDays.length
                  ? { ...nextDashboard, heatmap: [...olderDays, ...nextDashboard.heatmap] }
                  : nextDashboard;
              }),
            );
            void writeDashboardCache(nextDashboard, cacheScope);
            if (hasOlderHistory(windowStart, nextDashboard.history)) {
              // Logging compares sets with older history; its summary loads off the startup path.
              void api
                .exerciseHistoryBaselines(windowStart)
                .then((baselines) => {
                  if (!current()) return;
                  setHistoryBaselines({
                    before: windowStart,
                    byExercise: new Map(
                      baselines.map((baseline) => [baseline.exercise_id, baseline]),
                    ),
                  });
                })
                .catch(() => undefined);
            } else setHistoryBaselines(null);
          }),
        ),
        when('exercises', () =>
          api
            .listExercises()
            .then((nextExercises) => {
              if (!current()) return;
              // An exercise was added or changed here after this read began. Its answer may not
              // include that, so keep the list on screen and let the next check read it again.
              if (exerciseEditsRef.current !== exerciseEditsBefore) return;
              fromServer('exercises', nextExercises);
              answeredRef.current.exercises = true;
              // Publish readiness with the actual catalogue, so an urgent loading update cannot
              // mount the logger against an empty or partial list and overwrite its stored draft.
              setExerciseCatalogue({ exercises: nextExercises, loaded: true, error: null });
            })
            .catch((reason: unknown) => {
              if (!current()) return;
              setExerciseCatalogue((current) => ({
                ...current,
                error: reason instanceof Error ? reason.message : 'Could not load your exercises.',
              }));
              throw reason;
            }),
        ),
        // The revision read above already precedes this read, so it is not asked for again.
        when('workouts', () =>
          (revision
            ? api.listWorkouts(windowStart, revision.revision)
            : api.listWorkouts(windowStart)
          ).then((nextWorkouts) => {
            if (!current()) return;
            fromServer('workouts', nextWorkouts);
            answeredRef.current.workouts = true;
            loadedWorkouts = nextWorkouts;
            startTransition(() =>
              setWorkouts((current) => [
                ...nextWorkouts,
                ...keepLoadedBefore(current, windowStart, historyStartRef.current),
              ]),
            );
          }),
        ),
        when('checkIns', () =>
          api.listBodyMeasurements().then((nextMeasurements) => {
            if (!current()) return;
            fromServer('checkIns', nextMeasurements);
            answeredRef.current.checkIns = true;
            startTransition(() => setMeasurements(nextMeasurements));
          }),
        ),
        when('records', () =>
          api.listPersonalRecords().then((nextRecords) => {
            if (!current()) return;
            fromServer('records', nextRecords);
            answeredRef.current.records = true;
            startTransition(() => setPersonalRecords(nextRecords));
          }),
        ),
      ]);
      if (!current()) return;
      // Failed reads, and slow reads answered from this device's saved copy, do not acknowledge
      // the revision, so quiet sync retries them instead of keeping older data until a reload.
      const owed = TRAINING_READS.filter((read) => wanted.has(read) && !answered.has(read));
      if (owed.length)
        unansweredRefreshRef.current = unansweredRefresh(
          unansweredRefreshRef.current,
          target,
          owed,
          Date.now(),
        );
      else {
        unansweredRefreshRef.current = null;
        trainingRevisionRef.current = revision?.revision ?? null;
        setDataRevision(revision?.revision ?? null);
        // Every read was just saved on this device at this revision, so the next opening can
        // start from those copies while it reads again.
        if (revision)
          void api
            .rememberStartupData(revision.revision, dashboardRequestDate)
            .catch(() => undefined);
        window.dispatchEvent(new Event('training-data-refreshed'));
        forgetFinishIfGone(loadedWorkouts, windowStart);
      }
      const firstFailure = results.find(
        (result, index): result is PromiseRejectedResult =>
          result.status === 'rejected' &&
          // Recovery already explains catalogue failures and provides the retry action.
          (index !== 1 || (activeWorkoutStartedAt === null && tab !== 'log')),
      );

      if (!silent && firstFailure)
        showToast({
          message:
            firstFailure.reason instanceof Error
              ? firstFailure.reason.message
              : 'Could not load all of your training data.',
          variant: 'error',
        });
      setLoading(false);
    };

    refreshingDataRef.current += 1;
    try {
      if (activityLabel) await withBackgroundActivity(activityLabel, refresh);
      else await refresh();
    } finally {
      refreshingDataRef.current -= 1;
    }
  }

  useTrainingDataSync(
    async (resumed) => {
      if (
        refreshingDataRef.current ||
        workoutSaving ||
        backgroundActivities.length ||
        loadingOlderHistoryRef.current
      )
        return;
      // After refreshes the server could not fully answer, timed checks pause for longer each
      // time: asking a slow server for everything again every few seconds keeps it slow.
      // Coming back to the app or online still checks at once.
      const owed = unansweredRefreshRef.current;
      if (!resumed && owed && Date.now() < owed.retryAt) return;
      const generation = refreshGenerationRef.current;
      const { revision } = await api.workoutRevision();
      // A local save/refresh may have started while the revision request was in flight.
      if (
        generation !== refreshGenerationRef.current ||
        refreshingDataRef.current ||
        (revision === trainingRevisionRef.current && dashboardDateRef.current === localDate())
      )
        return;
      // The revision just read precedes the reads, so the refresh does not ask for it again.
      await refreshData({ silent: true, activityLabel: null, knownRevision: revision });
    },
    !loading && !workoutSaving && backgroundActivities.length === 0,
  );

  const historySummary = dashboard?.history ?? null;
  const olderHistoryAvailable = hasOlderHistory(historyStart, historySummary);

  async function loadOlderHistory() {
    if (loadingOlderHistoryRef.current) return;
    if (!hasOlderHistory(historyStartRef.current, historySummary)) return;
    loadingOlderHistoryRef.current = true;
    setOlderHistory({ loading: true, error: null });
    const { start, end } = olderHistoryWindow(historyStartRef.current);
    try {
      const older = await api.listOlderHistory(start, end);
      historyStartRef.current = start;
      setHistoryStart(start);
      setWorkouts((current) => appendOlderWorkouts(current, older.workouts));
      setDashboard((current) =>
        current
          ? { ...current, heatmap: prependOlderDays(current.heatmap, older.heatmap) }
          : current,
      );
      setOlderHistory({ loading: false, error: null });
    } catch (reason) {
      setOlderHistory({
        loading: false,
        error: reason instanceof Error ? reason.message : 'Could not load older workouts.',
      });
    } finally {
      loadingOlderHistoryRef.current = false;
    }
  }

  const loadOlderHistoryRef = useRef(loadOlderHistory);
  loadOlderHistoryRef.current = loadOlderHistory;
  // Stable, so calendar scroll handlers can keep the same callback across renders.
  const onLoadOlderHistory = useCallback(() => void loadOlderHistoryRef.current(), []);
  const olderHistoryProps: OlderHistoryProps = {
    historyStart,
    hasOlder: olderHistoryAvailable,
    loadingOlder: olderHistory.loading,
    olderError: olderHistory.error,
    onLoadOlder: onLoadOlderHistory,
  };

  useEffect(() => {
    const updated = () => {
      void refreshData({ silent: true, activityLabel: null });
    };
    window.addEventListener('training-blocks-updated', updated);
    return () => window.removeEventListener('training-blocks-updated', updated);
    // refreshData reads the current loaded history window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshAfterMutation(): Promise<void> {
    return refreshData({ silent: true, activityLabel: trainingDataActivityLabel('mutation') });
  }

  useEffect(() => {
    if (initialRefreshStartedRef.current) return;
    initialRefreshStartedRef.current = true;
    let cancelled = false;

    // This device's copies as shown, the revision the server is at, and the notice that the
    // copies turned out to be behind it.
    let shown: SavedStartupData | null = null;
    let serverRevision: string | null = null;
    let updated: (() => void) | null = null;
    /**
     * Runs when the copies are on screen and when the server's revision is known. Copies read at
     * that revision are current: nothing has changed since. Otherwise they are behind, so the
     * app says it is updating until the opening reads have replaced them.
     */
    const compare = () => {
      if (cancelled || !shown || !serverRevision || refreshedRef.current) return;
      if (shown.revision === serverRevision) {
        setDataRevision((current) => current ?? serverRevision);
        // The saved dashboard was read for a particular day, so it is only current on that day.
        if (shown.dashboardDate === localDate()) setHomeConfirmed(true);
      } else updated ??= beginBackgroundActivity('Updating your training…');
    };
    const refreshedRef = { current: false };
    const refreshed = () => {
      refreshedRef.current = true;
      updated?.();
      if (cancelled) return;
      setStartupRefreshed(true);
      // With the answers themselves, so nothing waiting on them runs a moment too early.
      startTransition(() => setHomeConfirmed(true));
    };
    void readDashboardCache().then((cachedDashboard) => {
      // The server's dashboard can arrive first; this device's older copy never replaces it.
      if (!cancelled && cachedDashboard) setDashboard((current) => current ?? cachedDashboard);
    });
    // The app opens with what this device saved the last time it was fully up to date, without
    // waiting for the server, so every screen has its figures at once. Until the server's
    // revision shows the copies are current, nothing is started or recorded from them, and the
    // opening reads replace them with the server's answers either way.
    void api
      .savedStartupData(historyStartRef.current)
      .then((saved) => {
        if (cancelled || !saved || refreshedRef.current) return;
        const answered = answeredRef.current;
        if (!answered.exercises)
          setExerciseCatalogue({ exercises: saved.exercises, loaded: true, error: null });
        if (!answered.workouts) setWorkouts(saved.workouts);
        if (!answered.records) setPersonalRecords(saved.personalRecords);
        if (!answered.checkIns) setMeasurements(saved.measurements);
        setLoading(false);
        shown = saved;
        compare();
      })
      // Unreadable copies only mean waiting for the server, as before.
      .catch(() => undefined);
    const opening = (revision: string) => {
      if (cancelled) return;
      setOpeningRevision(revision);
      serverRevision = revision;
      compare();
    };
    // The reads do not wait for the saved dashboard. With the revision from the session check
    // they start at once; otherwise they ask for it first.
    void Promise.resolve().then(() => {
      if (!cancelled)
        void refreshData({ knownRevision: startRevision, onRevision: opening }).then(
          refreshed,
          refreshed,
        );
    });

    return () => {
      cancelled = true;
      updated?.();
      initialRefreshStartedRef.current = false;
      // This ref is a request generation counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++refreshGenerationRef.current;
    };
    // Later reads follow mutations and quiet cross-device revision checks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The CSV guide belongs to Settings; going back or switching screens closes it.
    if (tab !== 'settings') setCsvGuideOpen(false);
  }, [tab]);

  useEffect(() => {
    // Navigation reveals an already-cached screen; synchronization runs independently.
    setVisitedTabs((current) => {
      if (current.has(tab)) return current;
      const next = new Set(current);
      next.add(tab);
      return next;
    });
  }, [tab]);

  useEffect(() => {
    const action = navigationActionRef.current;
    // Screens share the page scroll: new screens open at the top, and going back returns to
    // where that screen was left.
    // Runs before any screen's own animation-frame scroll (e.g. revealing an opened workout).
    window.scrollTo(
      0,
      action === 'pop'
        ? (scrollPositionsRef.current.get(historyIndexRef.current) ?? 0)
        : (restoreScrollRef.current ?? 0),
    );
    restoreScrollRef.current = null;
    if (action === 'pop') {
      navigationActionRef.current = 'replace';
      return;
    }

    if (action === 'push') {
      historyIndexRef.current += 1;
      window.history.pushState(createAppHistoryState(tab, historyIndexRef.current), '', `#${tab}`);
    } else {
      window.history.replaceState(
        createAppHistoryState(tab, historyIndexRef.current),
        '',
        `#${tab}`,
      );
    }
    navigationActionRef.current = 'replace';
  }, [tab]);

  useEffect(() => {
    // The app restores each screen's scroll itself; the browser's restore would fight it.
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    const restoreNavigation = (event: PopStateEvent) => {
      // The browser's Back closes an open sheet or dialog first and keeps the screen behind it.
      const goingBack =
        !isAppHistoryState(event.state) || event.state.index < historyIndexRef.current;
      if (goingBack && closeTopOverlay()) {
        const shown = currentTabRef.current;
        window.history.pushState(
          createAppHistoryState(shown, historyIndexRef.current),
          '',
          `#${shown}`,
        );
        return;
      }
      const nextTab = isAppHistoryState(event.state)
        ? event.state.tab
        : appTabFromHash(window.location.hash);
      // The browser's Back asks too, and stays on the editor until the changes are discarded.
      if (currentTabRef.current === 'log' && nextTab !== 'log' && workoutEditGuardRef.current?.()) {
        window.history.pushState(createAppHistoryState('log', historyIndexRef.current), '', '#log');
        return;
      }
      scrollPositionsRef.current.set(historyIndexRef.current, window.scrollY);
      if (isAppHistoryState(event.state)) historyIndexRef.current = event.state.index;
      navigationActionRef.current = 'pop';
      if (currentTabRef.current === nextTab) {
        navigationActionRef.current = 'replace';
        return;
      }
      setNavDirection('back');
      setTabState(nextTab);
    };

    window.addEventListener('popstate', restoreNavigation);
    return () => window.removeEventListener('popstate', restoreNavigation);
  }, []);

  async function saveWorkout(payload: WorkoutInput) {
    const wasEditing = editingWorkout !== null;
    const resumedId = resumingWorkoutId;
    if (!wasEditing) {
      finishedQueue.queue(payload);
      rememberFinish(buildFinishSummary(payload, exercises, workouts, Date.now(), resumedId));
      setActiveWorkoutStartedAt(null);
      setActivePartnerId(null);
      setResumingWorkoutId(null);
      setTab('dashboard', { replace: true });
      void trainTogether.refresh({ silent: true });
      return;
    }
    setWorkoutSaving(true);
    ++refreshGenerationRef.current;
    // An edit stays open, showing Saving…, until the save is confirmed; then it returns to the
    // screen it was opened from. A failed save leaves the changes and the error in front of you.
    let saved: TrackedWorkout;
    try {
      saved = await withBackgroundActivity(
        wasEditing || resumedId ? 'Saving workout changes…' : 'Saving workout…',
        () =>
          editingWorkout
            ? conflictPrompt.saveEdit(editingWorkout, payload)
            : resumedId
              ? api.updateWorkout(resumedId, payload)
              : api.createWorkout(payload),
      );
    } catch (error) {
      if (error instanceof WorkoutEditDiscarded) {
        // The other device's version was chosen: close the editor and show what is saved.
        setEditingWorkout(null);
        leaveWorkoutEditor();
        void refreshData({ silent: true });
        return;
      }
      if (currentTabRef.current !== 'log')
        showToast({
          message:
            'Your workout could not be saved. Return to the workout to retry; your entries are still here.',
          variant: 'error',
        });
      throw error;
    } finally {
      setWorkoutSaving(false);
    }

    completeWorkoutSave(saved, wasEditing, resumedId);
  }

  function completeWorkoutSave(
    saved: TrackedWorkout,
    wasEditing: boolean,
    resumedId: string | null,
    queued?: SavedFromQueue,
  ) {
    setWorkouts((current) => upsertWorkoutByRecency(current, saved));
    // A queued save may finish after the user has opened another workout for editing.
    if (wasEditing) {
      leaveWorkoutEditor();
      setEditingWorkout(null);
      // A deletion still waiting for its Undo goes through, so the two toasts never overlap.
      workoutDeletion.flush();
      showToast({ message: 'Workout saved', dismissLabel: 'Dismiss workout saved notification' });
    }

    if (!wasEditing) {
      if (queued)
        setSavedPreviews((current) => [
          ...current.filter((preview) => preview.dashboard === dashboard),
          { finished: queued.finished, workout: saved, dashboard, isNew: resumedId === null },
        ]);
      const signature = (record: PersonalRecord) =>
        `${record.scope ?? 'all_time'}:${record.block_id ?? ''}:${record.exercise_id}:${record.record_type}:${record.weight_kg ?? record.normalized_weight}:${record.record_type === 'weight' ? (record.weight_kg ?? record.value) : record.value}`;
      const existing = new Set(
        personalRecords.filter((record) => record.workout_id === resumedId).map(signature),
      );
      void api
        .listPersonalRecords({ workoutId: saved.id })
        .then((records) => {
          const fresh = records.filter((record) => !existing.has(signature(record)));
          if (!fresh.length) return;
          const withFresh = (current: PersonalRecord[]) => [
            ...current,
            ...fresh.filter((record) => !current.some((item) => item.id === record.id)),
          ];
          // The workout on Home's card lists its own records there; a toast would cover it.
          const onCard =
            saved.client_session_id != null &&
            saved.client_session_id === finishSummaryRef.current?.sessionId;
          // Several workouts can sync together after a reconnection; celebrate all their records.
          if (onCard) setFinishRecords(withFresh);
          else setCompletionRecords(withFresh);
        })
        .catch(() => undefined);
    }
    // Refresh once the last waiting workout lands rather than after each one.
    if (!queued || queued.remaining === 0)
      void refreshData({
        silent: true,
        activityLabel: queued ? undefined : 'Updating workout data…',
        knownRevision: revisionAfterSave(saved),
      });
  }

  /** Returns from a saved workout's editor to the screen it was opened from, at its place. */
  function leaveWorkoutEditor() {
    if (currentTabRef.current !== 'log') return;
    const state = window.history.state;
    if (isAppHistoryState(state) && state.index > 0) window.history.back();
    else setTab('history', { replace: true });
  }

  function deleteWorkout(workout: TrackedWorkout) {
    if (workoutSaveBlocked || blockedWhileSyncing(workout.id)) return;
    workoutDeletion.request(workout);
  }

  async function commitWorkoutDelete(workout: TrackedWorkout) {
    try {
      await withBackgroundActivity('Deleting workout…', async () => {
        await api.deleteWorkout(workout.id);
        if (workout.id === resumingWorkoutId) {
          clearActiveWorkoutDraft();
          setActiveWorkoutStartedAt(null);
          setResumingWorkoutId(null);
        }
        if (finishSummaryRef.current && finishSummaryIsFor(finishSummaryRef.current, workout))
          rememberFinish(null);
        await refreshData({ activityLabel: null });
      });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : 'Could not delete that workout.',
        variant: 'error',
      });
    }
  }

  async function undoWorkoutImport(id: string) {
    const result = await withBackgroundActivity('Undoing import…', async () => {
      const undone = await api.undoImportBatch(id);
      await api.refreshBodyMeasurements().catch(() => undefined);
      await refreshData({ activityLabel: null });
      return undone;
    });
    showToast(importUndoneMessage(result));
  }

  async function importWorkoutCsv(file: File, options?: WorkoutImportOptions) {
    const result = await withBackgroundActivity('Importing workouts…', async () => {
      const imported = await api.importWorkouts(file, options);
      await api.refreshBodyMeasurements().catch(() => undefined);
      await workoutTypes.reload();
      await refreshData({ activityLabel: null });
      return imported;
    });
    showToast(importSavedMessage(result));
  }

  async function restoreAccountArchive(file: File) {
    await api.restoreAccountArchive(file);
    // A restore replaces splits, blocks, layout and preferences as well as training, so the
    // app reloads once to read them all again, then confirms.
    try {
      window.sessionStorage.setItem(BACKUP_RESTORED_KEY, '1');
    } catch {
      // The restore succeeded either way; only the confirmation is lost.
    }
    window.location.reload();
  }

  async function deleteSampleData() {
    try {
      await withBackgroundActivity('Removing sample workouts…', async () => {
        await api.deleteSampleData();
        await api.refreshBodyMeasurements().catch(() => undefined);
        await refreshData({ activityLabel: null });
      });
      showToast('Sample workouts removed. They will not be seeded again.');
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : 'Could not remove sample data.',
        variant: 'error',
      });
    }
  }

  function startWorkout(
    workoutDate = localDate(),
    replaceActiveWorkout = false,
    template: SessionTemplate | null = null,
    category: WorkoutCategory | null = null,
    startType: WorkoutType | null = null,
  ) {
    if (workoutSaveBlocked) return;
    if (replaceActiveWorkout) clearActiveWorkoutDraft();
    const storedDraft = replaceActiveWorkout ? null : readActiveWorkoutDraft();
    const freshStart = !storedDraft && activeWorkoutStartedAt === null;
    setWorkoutTemplate(freshStart ? template : null);
    setWorkoutStartCategory(freshStart ? category : null);
    setWorkoutStartType(freshStart ? startType : null);
    const startedAt = storedDraft?.startedAt ?? Date.now();
    if (freshStart) rememberFinish(null);
    setEditingWorkout(null);
    setResumingWorkoutId(storedDraft?.resumingWorkoutId ?? null);
    setActiveWorkoutStartedAt(startedAt);
    setWorkoutStartDate(storedDraft?.workoutDate ?? workoutDate);
    setTab('log');
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    if (freshStart) remindAboutRestAlerts();
  }

  const startWorkoutRef = useRef(startWorkout);
  startWorkoutRef.current = startWorkout;
  /** Starts cardio from the saved cardio exercises, or else from the most recent cardio workout. */
  const startCardioRef = useRef(() => {});
  startCardioRef.current = () => {
    const cardio = workoutTypes.types.find((type) => type.id === 'cardio');
    const saved = workoutTypes.savedExercises.cardio;
    startWorkout(
      localDate(),
      false,
      cardio && saved?.length
        ? typeSessionTemplate(cardio, saved, 'Cardio workout', localDate(), weightUnit)
        : sessionTemplateFor(workouts, 'cardio', localDate(), weightUnit),
      'cardio',
    );
  };
  const upNextRef = useRef(upNext);
  upNextRef.current = upNext;
  const startMenuUpNextRef = useRef(startMenuUpNext);
  startMenuUpNextRef.current = startMenuUpNext;

  /**
   * Runs a start that follows Home's figures (the recommended day, a split day, recent cardio).
   * Before those are confirmed current, Home may show an older copy, so the start waits and
   * then uses the confirmed figures rather than what was on screen when it was chosen.
   */
  function startWhenHomeConfirmed(run: () => void) {
    if (homeConfirmedRef.current) {
      run();
      return;
    }
    waitingStartRef.current?.finish();
    waitingStartRef.current = {
      run,
      finish: beginBackgroundActivity('Getting your latest training…'),
    };
  }
  useEffect(() => {
    if (!homeConfirmed) return;
    const waiting = waitingStartRef.current;
    waitingStartRef.current = null;
    waiting?.finish();
    waiting?.run();
  }, [homeConfirmed]);

  /** Starts a workout on a calendar day. A day started with the split's plan follows Home. */
  function startOnDay(workoutDate = localDate(), start?: PlannedStart) {
    const run = () =>
      startWorkoutRef.current(
        workoutDate,
        false,
        start?.template ?? null,
        start?.category ?? null,
        start?.type ?? null,
      );
    if (start) startWhenHomeConfirmed(run);
    else run();
  }

  /** Starts the recommended day as it stands once Home's figures are confirmed. */
  function startUpNext(source: 'home' | 'menu') {
    startWhenHomeConfirmed(() => {
      const next = source === 'home' ? upNextRef.current : startMenuUpNextRef.current;
      startWorkoutRef.current(
        localDate(),
        false,
        next.template,
        next.recommendation?.category ?? null,
        next.type ?? null,
      );
    });
  }

  function remindAboutRestAlerts() {
    void shouldShowRestAlertReminder().then((show) => {
      if (show) setRestAlertReminderOpen(true);
    });
  }

  function editWorkout(workout: TrackedWorkout) {
    if (workoutSaveBlocked || blockedWhileSyncing(workout.id)) return;
    setEditingWorkout(workout);
    setWorkoutStartDate(workout.workout_date);
    setTab('log');
  }

  function resumeWorkout(workout: TrackedWorkout) {
    if (workoutSaveBlocked || blockedWhileSyncing(workout.id) || activeWorkoutStartedAt !== null)
      return;
    clearActiveWorkoutDraft();
    rememberFinish(null);
    setEditingWorkout(null);
    setResumingWorkoutId(workout.id);
    setActiveWorkoutStartedAt(Date.now());
    setWorkoutStartDate(workout.workout_date);
    setTab('log');
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
    remindAboutRestAlerts();
  }

  async function saveMeasurement(payload: {
    measurement_date: string;
    weight_kg: number;
    body_fat_pct: number | null;
    notes: string | null;
  }) {
    await api.saveBodyMeasurement(payload);
    setMeasurements(await api.localBodyMeasurements());
  }

  async function deleteMeasurement(id: string) {
    try {
      await api.deleteBodyMeasurement(id);
      setMeasurements(await api.localBodyMeasurements());
      showToast('Body measurement deleted.');
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : 'Could not delete that measurement.',
        variant: 'error',
      });
    }
  }

  async function updateExerciseFavorite(exerciseId: string, isFavorite: boolean) {
    const updated = await withBackgroundActivity('Updating exercise…', () =>
      api.updateExerciseFavorite(exerciseId, isFavorite),
    );
    setExercises((current) =>
      current.map((exercise) => (exercise.id === updated.id ? updated : exercise)),
    );
  }

  async function updateExercisePartialSets(
    exerciseId: string,
    enabled: boolean,
    weekStart: string,
  ) {
    const updated = await api.updateExercisePartialSets(exerciseId, enabled, weekStart);
    setExercises((current) =>
      current.map((exercise) => (exercise.id === updated.id ? updated : exercise)),
    );
    await refreshData({ silent: true, activityLabel: null });
    return updated;
  }

  async function createExercise(input: ExerciseCreateInput): Promise<Exercise> {
    const exercise = await withBackgroundActivity('Creating exercise…', () =>
      api.createExercise(input),
    );
    setExercises((current) => mergeUniqueById(current, [exercise]));
    return exercise;
  }

  function updateRestTimerPreference(enabled: boolean) {
    saveRestTimerPreference(enabled);
    setRestTimerEnabled(enabled);
  }

  function updateRestTimesPreference(enabled: boolean) {
    saveRestTimesPreference(enabled);
    setShowRestTimes(enabled);
  }

  function openSetting(destination: SettingsDestination) {
    setSettingsJump({ destination, serial: ++settingsJumpSerial.current });
    setTab(destination.page);
  }

  function openSplits(routineId?: string) {
    setSplitDestination({ routineId });
    setTab('split');
  }

  function openSplitSchedule() {
    setSplitDestination({});
    setTab('split');
  }

  /** Saves the split's new day and reloads Home; a refused move throws. */
  async function moveSplit(
    step: number,
    label: string,
    options?: Parameters<typeof api.moveTrainingSplit>[1],
  ) {
    setSplitMoving(true);
    try {
      await withBackgroundActivity(label, async () => {
        await api.moveTrainingSplit(step, options);
        await refreshData({ silent: true, activityLabel: null });
      });
    } finally {
      setSplitMoving(false);
    }
  }

  async function undoSplitMove(step: number, restSaved: boolean) {
    try {
      await moveSplit(step, 'Undoing…', { rest_saved: restSaved });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : 'Could not undo that change.',
        variant: 'error',
      });
    }
  }

  async function skipSplitDay() {
    if (!splitSkip || splitMoving) return;
    const { split, from, to } = splitSkip;
    const restSaved = split.rest_saved === true;
    try {
      await moveSplit(to, 'Skipping…', { rest_saved: restSaved });
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : 'Could not skip this day.',
        variant: 'error',
      });
      return;
    }
    showToast({
      message: splitSkipMessage(splitSkip, workoutTypes.types),
      action: { label: 'Undo', run: () => undoSplitMove(from, restSaved) },
    });
  }

  function openAllSettings() {
    setSettingsJump(null);
    setSettingsGroup(null);
    setTab('settings');
  }

  /** Opens the place a tip's button names. */
  const openTipTargetRef = useRef<(action: TipAction) => void>(() => undefined);
  openTipTargetRef.current = (action) => {
    switch (action.target) {
      case 'machine-weights': {
        const exerciseId = action.exerciseId ?? multiMachineExerciseId(workouts);
        if (exerciseId) setMachineWeightsFor(exerciseId);
        openHistorySection('progress', exerciseId);
        break;
      }
      case 'weight-goal':
        setBodyGoalRequest((count) => count + 1);
        setTab('body');
        break;
      case 'training-blocks':
        setTipBlocksOpen(true);
        break;
      case 'home-edit':
        setTab('dashboard');
        home.edit();
        break;
      case 'profile':
        setTab('profile');
        break;
      case 'split':
        openSplitSchedule();
        break;
      case 'appearance':
        setSettingsJump(null);
        setSettingsGroup('appearance');
        setTab('settings');
        break;
    }
  };
  useEffect(() => onTipTarget((action) => openTipTargetRef.current(action)), []);

  function updateReduceMotion(reduced: boolean) {
    saveReduceMotionPreference(reduced);
    applyReduceMotion(reduced);
    setReduceMotion(reduced);
  }

  function updateBodyTrendPreference(preference: BodyTrendPreference) {
    saveBodyTrendPreference(preference);
    setBodyTrendPreference(preference);
  }

  const nestedHeader =
    tab === 'split'
      ? { title: 'Your splits', subtitle: null }
      : tab === 'settings'
        ? settingsGroup
          ? { title: 'All settings', subtitle: null }
          : { title: 'Settings', subtitle: null }
        : tab === 'videos' && videosAllowed
          ? { title: 'Videos', subtitle: 'Workout clips • uploads' }
          : tab === 'profile'
            ? { title: 'Profile', subtitle: user ? user.display_name : 'Account • security' }
            : tab === 'shared-profile' && sharedProfile
              ? { title: sharedProfile.name, subtitle: 'Shared profile' }
              : tab === 'admin' && isAdmin
                ? { title: 'Admin console', subtitle: 'Accounts • switches • server' }
                : null;
  useEffect(() => {
    // After the first load, so a load error shown when it finishes cannot replace it.
    if (loading || !backupRestoredNotice) return;
    backupRestoredNotice = false;
    showToast(BACKUP_RESTORED_MESSAGE);
  }, [loading, showToast]);

  const activeMainTab = mainTabFor(tab);
  const liveSheetOpen = tab === 'log' && !editingWorkout && activeWorkoutStartedAt !== null;
  const showTabBar = (tab !== 'log' && tab !== 'split') || liveSheetOpen;
  // The home screen guide follows the release announcement, behind the same interruptions.
  const canShowPrompts = canShowReleaseAnnouncement({
    loading,
    tab,
    // Onboarding waits until a new member has seen the profile their invite opened.
    hasOtherDialog:
      toastActive ||
      completionRecords.length > 0 ||
      (tab === 'shared-profile' && sharedProfile?.invite === true),
    signingIn,
  });
  const prompt = canShowPrompts
    ? nextOnboardingPrompt({
        tour: guideRequested || (guideWaiting && announcement.checked),
        importStep: importStepPending,
        release: announcement.open && launchPromptAllowed(launchPrompt, 'release'),
        releaseHeld: csvGuideOpen || (releaseAfterImport && tab === 'settings'),
      })
    : null;
  const homeGuideShown =
    homeScreenGuide.open &&
    (homeScreenGuide.requested || launchPromptAllowed(launchPrompt, 'home-guide')) &&
    !guideRequested &&
    !guideWaiting &&
    !importStepPending &&
    !announcement.open &&
    canShowPrompts;
  // The first prompt to open by itself is the only one this visit; the rest wait for the next.
  const openedPrompt: LaunchPrompt | null =
    prompt === 'release'
      ? 'release'
      : prompt
        ? 'onboarding'
        : homeGuideShown && !homeScreenGuide.requested
          ? 'home-guide'
          : null;
  useEffect(() => {
    if (openedPrompt) setLaunchPrompt((current) => current ?? openedPrompt);
  }, [openedPrompt]);

  useEffect(() => {
    configureTips({
      page: tab,
      ready:
        !loading &&
        homeConfirmed &&
        !signingIn &&
        announcement.checked &&
        !announcement.open &&
        !prompt &&
        !guideWaiting &&
        !importStepPending &&
        !csvGuideOpen &&
        !releaseAfterImport &&
        !homeScreenGuide.open &&
        !home.editing &&
        !toastActive &&
        completionRecords.length === 0 &&
        !workoutSaveBlocked &&
        finishedQueue.items.length === 0,
      resting: restEndsAt !== null && restEndsAt > Date.now(),
      workoutCount: tipWorkoutCount(workouts, dashboard?.history?.total_workouts),
    });
  }, [
    configureTips,
    tab,
    loading,
    homeConfirmed,
    signingIn,
    announcement.checked,
    announcement.open,
    prompt,
    guideWaiting,
    importStepPending,
    csvGuideOpen,
    releaseAfterImport,
    homeScreenGuide.open,
    home.editing,
    toastActive,
    completionRecords.length,
    workoutSaveBlocked,
    finishedQueue.items.length,
    restEndsAt,
    dashboard?.history?.total_workouts,
    workouts,
  ]);

  function openSharedProfile(
    profile: Pick<SharedProfileSummary, 'id' | 'display_name'> & { is_you?: boolean },
    workout?: Pick<TrackedWorkout, 'id' | 'workout_date'>,
  ) {
    if (profile.id === user?.id) {
      setTab('profile');
      return;
    }
    setSharedProfile((current) => ({
      id: profile.id,
      name: profile.is_you ? 'Your shared profile' : profile.display_name,
      opened: (current?.opened ?? 0) + 1,
      workout,
    }));
    setTab('shared-profile');
  }

  function openSharingSettings() {
    const destination = SETTINGS_DESTINATIONS.find((entry) => entry.id === 'sharing');
    if (destination) openSetting(destination);
  }

  function openHistorySection(section: HistorySection, exerciseId: string | null = null) {
    setHistoryOpenId(null);
    setHistoryExerciseId(exerciseId);
    setHistoryMovementId(null);
    setTab(section);
  }

  function openSavedWorkout(
    workoutId: string,
    exerciseId: string | null,
    movementId: string | null = null,
  ) {
    setHistoryOpenId(workoutId);
    setHistoryExerciseId(exerciseId);
    setHistoryMovementId(movementId);
    setHistoryOpenCount((count) => count + 1);
    setTab('history');
  }

  async function openMuscleWorkout(contribution: WeeklyMuscleContribution) {
    if (contribution.workout_id === muscleSets.workoutId) {
      if (activeWorkoutStartedAt !== null) setTab('log');
      else showToast({ message: 'This workout is waiting to sync.', variant: 'warning' });
      return;
    }
    if (isPendingWorkoutId(contribution.workout_id)) {
      if (shownWorkouts.some((workout) => workout.id === contribution.workout_id))
        openSavedWorkout(contribution.workout_id, contribution.exercise_id);
      else showToast({ message: 'This workout is waiting to sync.', variant: 'warning' });
      return;
    }
    if (
      !workouts.some(
        (workout) =>
          workout.id === contribution.workout_id &&
          workout.movements.some(
            (movement) =>
              movement.id === contribution.movement_id &&
              movement.exercise.id === contribution.exercise_id,
          ),
      )
    ) {
      // The dashboard can refresh before the local workout snapshot catches up.
      const snapshot = await api.listOlderHistory(
        contribution.workout_date,
        contribution.workout_date,
      );
      const workout = snapshot.workouts.find((item) => item.id === contribution.workout_id);
      if (!workout)
        throw new Error('That workout is no longer available. Refresh Home and try again.');
      if (
        !workout.movements.some(
          (movement) =>
            movement.id === contribution.movement_id &&
            movement.exercise.id === contribution.exercise_id,
        )
      ) {
        throw new Error('That exercise has changed. Refresh Home and try again.');
      }
      setWorkouts((current) =>
        [workout, ...current.filter((item) => item.id !== workout.id)].sort(
          (left, right) =>
            right.workout_date.localeCompare(left.workout_date) ||
            right.created_at.localeCompare(left.created_at),
        ),
      );
    }
    openSavedWorkout(contribution.workout_id, contribution.exercise_id, contribution.movement_id);
  }

  function accountHeaderActions(active: boolean) {
    return user ? (
      <AccountHeaderActions
        active={active}
        profile={user}
        openFeedback={openFeedback}
        onOpenProfile={() => setTab('profile')}
      />
    ) : undefined;
  }

  return (
    <AppContentProviders
      exercises={exercises}
      updatePartialSets={updateExercisePartialSets}
      settingsNavigation={{ request: settingsJump, navigate: openSetting }}
    >
      <div
        className={`tracker-app${showTabBar ? ' has-tab-bar' : ''}${tab === 'log' && !editingWorkout ? ' has-compact-logger' : ''}${appUpdates.available ? ' has-app-update' : ''}`}
      >
        {appUpdates.available && (
          <AppUpdateBanner
            version={appUpdates.availableRelease?.version}
            required={appUpdates.required}
            refreshing={appUpdates.refreshing}
            error={appUpdates.refreshError}
            onRefresh={() => void appUpdates.refresh()}
          />
        )}
        <OfflineNotice
          waiting={{
            workouts: finishedQueue.items.length,
            checkIns: bodyMeasurementSync.pending,
          }}
        />
        {prompt === 'release' && (
          <ReleaseAnnouncement
            release={announcement.release}
            history={announcement.history}
            onClose={announcement.dismiss}
          />
        )}
        {prompt === 'tour' && (
          <AppGuide
            videosAllowed={videosAllowed}
            onNavigate={setTab}
            onClose={() => {
              if (user) finishAppTour(user.id);
              if (guideWaiting) setImportStepPending(true);
              setGuideWaiting(false);
              setGuideRequested(false);
              homeScreenGuide.dismiss();
              setTab(guideReturnTab.current ?? 'dashboard');
              guideReturnTab.current = null;
            }}
          />
        )}
        {prompt === 'import' && (
          <ImportHistoryPrompt
            onSkip={() => {
              if (user) finishAppGuide(user.id);
              setImportStepPending(false);
            }}
            onContinue={() => {
              if (user) finishAppGuide(user.id);
              setImportStepPending(false);
              setReleaseAfterImport(true);
              setCsvGuideOpen(true);
              setTab('settings');
            }}
          />
        )}
        {homeGuideShown && <HomeScreenGuide onClose={homeScreenGuide.dismiss} />}
        {user && (
          <WeeklyReviewPrompt
            userId={user.id}
            enabled={
              // The review is drawn from Home's figures and records that it was shown.
              homeConfirmed &&
              canShowPrompts &&
              prompt === null &&
              !announcement.open &&
              !homeScreenGuide.open &&
              !guideWaiting &&
              !importStepPending &&
              launchPromptAllowed(launchPrompt, 'weekly-review')
            }
            shownElsewhere={appNotices.notices?.weekly_review_seen ?? null}
            onShown={(weekStart) => {
              setLaunchPrompt((current) => current ?? 'weekly-review');
              appNotices.record({ weekly_review_seen: weekStart });
            }}
            dashboard={dashboard}
            muscleWeeks={reviewMuscleWeeks}
            workouts={workouts}
            records={personalRecords}
            measurements={measurements}
            today={localDate()}
            onOpenProgress={(exerciseId) => openHistorySection('progress', exerciseId ?? null)}
            onOpenCardio={() => openHistorySection('cardio')}
            onOpenBody={() => setTab('body')}
          />
        )}
        {/* An open sheet or dialog closes first; the next swipe changes screen. */}
        <EdgeSwipeBack
          onBack={() => closeTopOverlay() || navigateBack()}
          enabled={canNavigateBack}
        />
        <BackgroundActivityBar label={backgroundActivityLabel} />
        {completionRecords.length > 0 && (
          <Toast
            id={completionRecords.map((record) => record.id).join()}
            variant="celebrate"
            message={`${completionRecords.length} new PR${completionRecords.length === 1 ? '' : 's'}`}
            lines={completionRecords.map((record) => ({
              title: record.exercise_name ?? 'Personal record',
              detail: completionRecordDetail(record, weightUnit),
            }))}
            dismissLabel="Close personal record summary"
            onDismiss={() => setCompletionRecords([])}
          />
        )}
        {restAlertReminderOpen && <RestAlertReminder onClose={closeRestAlertReminder} />}
        {tipBlocksOpen && (
          <TrainingBlockDialog
            start="new"
            onClose={() => setTipBlocksOpen(false)}
            onNotice={showToast}
          />
        )}
        <SetupGuideHost workouts={workouts} />
        {conflictPrompt.dialog}
        {workoutDeletion.pending && (
          <Toast
            id={workoutDeletion.pending.id}
            message="Workout deleted"
            duration="important"
            action={{ label: 'Undo', run: workoutDeletion.undo }}
            dismissLabel="Dismiss workout deleted notification"
            onDismiss={workoutDeletion.flush}
            onTimeout={workoutDeletion.flush}
          />
        )}

        {nestedHeader && (
          <OverlayScreenHeader
            title={nestedHeader.title}
            subtitle={nestedHeader.subtitle}
            onBack={navigateBack}
            backLabel={tab === 'settings' && settingsGroup ? 'All settings' : undefined}
            actions={tab !== 'settings' ? <SettingsButton onClick={openAllSettings} /> : undefined}
          />
        )}

        <main
          className={`tracker-content ${tab === 'videos' ? 'video-content' : ''} ${nestedHeader || (tab === 'log' && !liveSheetOpen) ? 'with-overlay-header' : ''}`}
          data-nav-direction={navDirection}
        >
          {tab !== 'log' &&
            finishedQueue.items.map((finished) => {
              const key = finishedWorkoutKey(finished);
              const refusal = finishedQueue.refusals[key];
              // Routine sends and offline retries stay quiet; only actionable failures need a card.
              if (refusal === undefined && !finishedQueue.outdated) return null;
              return (
                <PendingWorkoutSaveCard
                  key={key}
                  completion={finished.pendingSave}
                  saving={finishedQueue.sendingKey === key}
                  error={refusal ?? (finishedQueue.outdated ? OUTDATED_CLIENT_MESSAGE : null)}
                  onRetry={finishedQueue.retry}
                  onDiscard={() => {
                    if (!finishedQueue.discard(key)) return;
                    showToast('Workout discarded.');
                    const { workoutId, payload } = finished.pendingSave;
                    const summary = finishSummaryRef.current;
                    if (
                      summary &&
                      finishSummaryIsFor(summary, {
                        id: workoutId,
                        client_session_id: payload.client_session_id,
                      })
                    )
                      rememberFinish(null);
                  }}
                  reviewBlocked={activeWorkoutStartedAt !== null}
                  onKeepMine={
                    finishedQueue.conflicts.has(key)
                      ? () => void finishedQueue.keepMine(key)
                      : undefined
                  }
                  onReview={
                    refusal === undefined
                      ? undefined
                      : () => {
                          if (activeWorkoutStartedAt !== null) return;
                          const draft = finishedQueue.review(key);
                          if (!draft) return;
                          setActiveWorkoutStartedAt(draft.startedAt);
                          setResumingWorkoutId(draft.resumingWorkoutId ?? null);
                          setWorkoutStartDate(draft.workoutDate);
                          setTab('log');
                        }
                  }
                />
              );
            })}
          {bodyMeasurementSync.pending > 0 && (
            <section
              className="pulse-card pending-workout-save body-check-in-sync"
              aria-label="Check-in sync"
              role="status"
            >
              <strong>
                {bodyMeasurementSync.pending}{' '}
                {bodyMeasurementSync.pending === 1 ? 'check-in' : 'check-ins'} saved locally
              </strong>
              {bodyMeasurementSync.error ? (
                <>
                  <p className="error">{bodyMeasurementSync.error}</p>
                  <button
                    type="button"
                    className="pulse-button secondary small"
                    onClick={bodyMeasurementSync.retry}
                  >
                    Retry sync
                  </button>
                </>
              ) : (
                <span className="badge">Waiting to sync</span>
              )}
            </section>
          )}
          {loading &&
            tab !== 'dashboard' &&
            tab !== 'videos' &&
            tab !== 'social' &&
            tab !== 'profile' &&
            tab !== 'shared-profile' &&
            tab !== 'admin' && <TodaySkeleton />}
          {(tab === 'dashboard' || liveSheetOpen || visitedTabs.has('dashboard')) && (
            <CachedTabPanel active={tab === 'dashboard' || liveSheetOpen} inert={liveSheetOpen}>
              {loading && dashboard === null ? (
                <TodaySkeleton />
              ) : (
                <TodayScreen
                  home={home}
                  finished={
                    finishSummary &&
                    !(
                      workoutDeletion.pending &&
                      finishSummaryIsFor(finishSummary, workoutDeletion.pending)
                    ) && (
                      <>
                        <FinishedWorkoutCard
                          key={finishSummary.finishedAt}
                          summary={finishSummary}
                          records={finishRecords.map((record) => ({
                            id: record.id,
                            exercise: record.exercise_name ?? 'Exercise',
                            detail: completionRecordDetail(record, weightUnit),
                          }))}
                          onDismiss={() => rememberFinish(null)}
                          onOpenWorkout={() => {
                            if (finishedSaved) openSavedWorkout(finishedSaved.id, null);
                            else openHistorySection('history');
                          }}
                          onShare={finishedSaved ? () => setFinishShareOpen(true) : undefined}
                          onUndo={
                            finishedSaved && !workoutSaveBlocked && activeWorkoutStartedAt === null
                              ? () => resumeWorkout(finishedSaved)
                              : undefined
                          }
                          onCompareMachines={(exerciseId) => {
                            setMachineWeightsFor(exerciseId);
                            openHistorySection('progress', exerciseId);
                          }}
                          onNotice={showToast}
                        />
                        {finishShareOpen && finishedSaved && (
                          <WorkoutShareCard
                            workout={finishedSaved}
                            records={finishRecords.length}
                            onClose={() => setFinishShareOpen(false)}
                          />
                        )}
                      </>
                    )
                  }
                  data={shownDashboard}
                  muscleSets={muscleSets}
                  workouts={shownWorkouts}
                  measurements={measurements}
                  personalRecords={personalRecords}
                  categoryColors={workoutTypeColors}
                  workoutStartedAt={activeWorkoutStartedAt}
                  liveWorkoutName={liveWorkoutSummary?.name || activeDraft?.name || null}
                  onResumeWorkout={resumeLiveWorkout}
                  workoutSaving={workoutSaveBlocked}
                  todayBodyweight={todayMeasurement?.weight_kg ?? null}
                  todayBodyFat={todayMeasurement?.body_fat_pct ?? null}
                  onSaveBodyFat={(bodyFat) =>
                    withBackgroundActivity('Saving body fat…', async () => {
                      const undo = await saveBodyFatCheckIn(
                        todayMeasurement ?? null,
                        localDate(),
                        bodyFat,
                      );
                      setMeasurements(await api.localBodyMeasurements());
                      return async () => {
                        await withBackgroundActivity('Undoing check-in…', async () => {
                          await undo();
                          setMeasurements(await api.localBodyMeasurements());
                        });
                      };
                    })
                  }
                  onSaveBodyweight={(weight, bodyFat) =>
                    withBackgroundActivity('Saving measurement…', async () => {
                      const undo = await saveBodyweightCheckIn(
                        todayMeasurement ?? null,
                        localDate(),
                        weight,
                        bodyFat,
                      );
                      setMeasurements(await api.localBodyMeasurements());
                      return async () => {
                        await withBackgroundActivity('Undoing check-in…', async () => {
                          await undo();
                          setMeasurements(await api.localBodyMeasurements());
                        });
                      };
                    })
                  }
                  onStartTemplate={(template) =>
                    startWhenHomeConfirmed(() =>
                      startWorkoutRef.current(localDate(), false, template),
                    )
                  }
                  onStartEmpty={() => startWorkout()}
                  onStartRecommended={() => startUpNext('home')}
                  onEditSplit={openSplitSchedule}
                  onSkipSplitDay={splitSkip ? () => void skipSplitDay() : undefined}
                  skippingSplitDay={splitMoving}
                  onOpenHistory={() => openHistorySection('history')}
                  onOpenWorkout={openMuscleWorkout}
                  onOpenProgress={(exerciseId) =>
                    openHistorySection('progress', exerciseId ?? null)
                  }
                  onOpenCardio={() => openHistorySection('cardio')}
                  onOpenBody={() => setTab('body')}
                  onOpenSettings={openAllSettings}
                  onOpenVideos={videosAllowed ? () => setTab('videos') : undefined}
                  onOpenProfile={user ? () => setTab('profile') : undefined}
                  profileLabel={user?.display_name}
                  profilePhotoUrl={user?.profile_photo_url}
                  profile={user ?? undefined}
                  accountActions={accountHeaderActions(tab === 'dashboard')}
                  openFeedback={openFeedback}
                  friendsActivity={
                    user ? (
                      <FriendsActivityCard
                        active={tab === 'dashboard'}
                        onOpenFriend={openSharedProfile}
                        onOpenFriends={() => setTab('social')}
                        onChooseSharing={openSharingSettings}
                      />
                    ) : undefined
                  }
                  exerciseSummaries={exerciseLibrary.summaries}
                  exercises={exercises}
                  dataRevision={dataRevision}
                  active={tab === 'dashboard'}
                  onOpenFriend={openSharedProfile}
                  onOpenSocial={() => setTab('social')}
                  onChooseSharing={openSharingSettings}
                  calendar={
                    <InteractiveWorkoutCalendar
                      entries={shownDashboard?.heatmap ?? []}
                      workouts={shownWorkouts}
                      olderHistory={olderHistoryProps}
                      split={shownDashboard?.training_split}
                      categoryColors={workoutTypeColors}
                      activeWorkout={activeWorkoutStartedAt !== null}
                      activeWorkoutDate={activeWorkoutDate}
                      onResumeWorkout={() => setTab('log')}
                      onEditWorkout={editWorkout}
                      onOpenWorkout={(workout) => openSavedWorkout(workout.id, null)}
                      onStartWorkout={startOnDay}
                      onReplaceActiveWorkout={(workoutDate) => startWorkout(workoutDate, true)}
                      onEditSplit={openSplitSchedule}
                    />
                  }
                  thisWeek={
                    <InteractiveWorkoutCalendar
                      entries={shownDashboard?.heatmap ?? []}
                      weekStartDay={weekStartDayFrom(
                        shownDashboard?.weekly_sets?.week_start ??
                          shownDashboard?.zone2?.week_start,
                      )}
                      workouts={shownWorkouts}
                      split={shownDashboard?.training_split}
                      categoryColors={workoutTypeColors}
                      activeWorkout={activeWorkoutStartedAt !== null}
                      activeWorkoutDate={activeWorkoutDate}
                      onResumeWorkout={() => setTab('log')}
                      onEditWorkout={editWorkout}
                      onOpenWorkout={(workout) => openSavedWorkout(workout.id, null)}
                      onStartWorkout={startOnDay}
                      onReplaceActiveWorkout={(workoutDate) => startWorkout(workoutDate, true)}
                      onEditSplit={openSplitSchedule}
                    />
                  }
                />
              )}
            </CachedTabPanel>
          )}
          {!loading && (activeWorkoutStartedAt !== null || editingWorkout !== null) && (
            <CachedTabPanel active={tab === 'log'}>
              <LiveWorkoutSheet
                active={tab === 'log'}
                enabled={!editingWorkout}
                onMinimise={() => {
                  setActivePartnerId(null);
                  setTab('dashboard');
                }}
              >
                {(() => {
                  const activePartnerIndex =
                    !editingWorkout && activePartnerId
                      ? trainTogether.partners.findIndex(
                          (partner) =>
                            partner.user_id === activePartnerId && partner.workout !== null,
                        )
                      : -1;
                  const activePartner =
                    activePartnerIndex >= 0 ? trainTogether.partners[activePartnerIndex] : null;
                  return (
                    <>
                      {activePartner && (
                        <TrainTogetherPartnerView
                          partner={activePartner}
                          palette={trainPalettes[activePartnerIndex] ?? trainPalettes[0]}
                          syncState={trainTogether.partnerSyncStates[activePartner.user_id]}
                          acknowledgedDraft={
                            trainTogether.partnerAcknowledgedDrafts[activePartner.user_id]
                          }
                          conflictCount={
                            trainTogether.partnerConflictCounts[activePartner.user_id] ?? 0
                          }
                          extraExercises={
                            trainTogether.partnerExercisesByUser[activePartner.user_id]
                          }
                          viewerAddedMovementKeys={
                            trainTogether.viewerAddedMovements[activePartner.user_id]
                          }
                          weightUnit={weightUnit}
                          onEdit={(change, added) =>
                            trainTogether.editPartnerWorkout(activePartner.user_id, change, added)
                          }
                          onRetry={() => trainTogether.retryPartnerSync(activePartner.user_id)}
                          onRegisterExercises={(list) =>
                            trainTogether.registerPartnerExercises(activePartner.user_id, list)
                          }
                          onBackToMine={() => setActivePartnerId(null)}
                        />
                      )}
                      <div hidden={activePartner !== null}>
                        {workoutCatalogueReady ? (
                          <WorkoutBrowser
                            key={
                              editingWorkout
                                ? `edit-${editingWorkout.id}`
                                : liveLoggerSession.current
                                  ? loggerSessionKey(liveLoggerSession.current)
                                  : `active-${workoutStartDate}`
                            }
                            workouts={workouts}
                            initialWorkout={editingWorkout}
                            resumedWorkoutId={resumingWorkoutId}
                            hasOlder={olderHistoryAvailable}
                            resumeRequest={editingWorkout ? undefined : workoutResumeRequest}
                          >
                            {(navigation, viewedWorkout) => (
                              <WorkoutLogger
                                key={viewedWorkout?.id ?? 'original'}
                                exercises={exercises}
                                restoredDraftMovements={restoredDraftMovements}
                                recommendation={dashboard?.recommendation ?? null}
                                template={workoutTemplate}
                                startCategory={workoutStartCategory}
                                startType={workoutStartType}
                                initialDate={workoutStartDate}
                                initialWorkout={viewedWorkout ?? editingWorkout}
                                readOnly={Boolean(viewedWorkout)}
                                navigation={navigation}
                                resumingWorkout={viewedWorkout ? null : resumingWorkout}
                                currentBodyweight={
                                  viewedWorkout
                                    ? savedWorkoutBodyweight(viewedWorkout)
                                    : savedWorkoutBodyweight(editingWorkout ?? resumingWorkout)
                                }
                                measurements={measurements}
                                historicalWorkouts={workouts}
                                historyBaselines={historyBaselines}
                                restTimerEnabled={restTimerEnabled}
                                showRestTimes={showRestTimes}
                                weeklySets={
                                  viewedWorkout || editingWorkout
                                    ? undefined
                                    : muscleSets.weeklySets
                                }
                                categoryColors={workoutTypeColors}
                                onExerciseHistory={(exerciseId) =>
                                  openHistorySection('progress', exerciseId)
                                }
                                onExerciseFavorite={updateExerciseFavorite}
                                onCreateExercise={createExercise}
                                onSave={saveWorkout}
                                onShow={resumeLiveWorkout}
                                activeStartedAt={activeWorkoutStartedAt}
                                onRestTimerChange={
                                  editingWorkout || viewedWorkout ? undefined : setRestEndsAt
                                }
                                onRestDoneChange={
                                  editingWorkout || viewedWorkout ? undefined : setRestDoneAt
                                }
                                restGoRequest={restGoRequest}
                                screenVisible={tab === 'log'}
                                inForeground={activePartner === null}
                                onLiveSummaryChange={setLiveWorkoutSummary}
                                onClose={navigateBack}
                                workoutEditGuard={
                                  editingWorkout && !viewedWorkout ? workoutEditGuardRef : undefined
                                }
                                trainTogether={
                                  !editingWorkout && !viewedWorkout ? trainTogether : undefined
                                }
                                trainPalettes={
                                  !editingWorkout && !viewedWorkout ? trainPalettes : undefined
                                }
                                onOpenTrainSheet={
                                  !editingWorkout && !viewedWorkout ? openTrainSheet : undefined
                                }
                                onLogForPartner={
                                  !editingWorkout && !viewedWorkout ? setActivePartnerId : undefined
                                }
                                onLeaveTrainSession={
                                  !editingWorkout && !viewedWorkout
                                    ? handleLeaveTrainSession
                                    : undefined
                                }
                                onDelete={() => {
                                  if (workoutSaveBlocked) return;
                                  if (editingWorkout) {
                                    deleteWorkout(editingWorkout);
                                    leaveWorkoutEditor();
                                  } else {
                                    clearActiveWorkoutDraft();
                                    setActiveWorkoutStartedAt(null);
                                    setActivePartnerId(null);
                                    setResumingWorkoutId(null);
                                    setTab('dashboard');
                                    void trainTogether.refresh({ silent: true });
                                  }
                                  setEditingWorkout(null);
                                }}
                              />
                            )}
                          </WorkoutBrowser>
                        ) : (
                          <section className="logger-screen content-page" aria-live="polite">
                            <OverlayScreenHeader
                              title={activeDraft ? 'Workout recovery' : 'Workout unavailable'}
                              subtitle={
                                activeDraft
                                  ? 'Your workout is saved on this device'
                                  : 'Load your exercise library to start'
                              }
                              onBack={navigateBack}
                            />
                            <p>
                              {exerciseCatalogue.error
                                ? 'Your exercises could not be loaded.'
                                : 'Some exercises in your saved workout are not available yet.'}{' '}
                              {activeDraft
                                ? 'Your saved workout is safe on this device. Reload the exercises to resume it.'
                                : 'Reload the exercises to start your workout.'}
                            </p>
                            {exerciseCatalogue.error && <p>{exerciseCatalogue.error}</p>}
                            <button
                              type="button"
                              className="pulse-button secondary block"
                              onClick={() =>
                                void refreshData({ activityLabel: 'Reloading exercises…' })
                              }
                            >
                              Retry loading exercises
                            </button>
                          </section>
                        )}
                      </div>
                    </>
                  );
                })()}
              </LiveWorkoutSheet>
            </CachedTabPanel>
          )}
          {!loading && (tab === 'body' || visitedTabs.has('body')) && (
            <CachedTabPanel active={tab === 'body'}>
              <BodyCompositionScreen
                dataRevision={dataRevision}
                measurements={measurements}
                onSave={saveMeasurement}
                onDelete={deleteMeasurement}
                onDataChange={refreshAfterMutation}
                trendPreference={bodyTrendPreference}
                goalRequest={bodyGoalRequest}
                onOpenSettings={openAllSettings}
                accountActions={accountHeaderActions(tab === 'body')}
              />
            </CachedTabPanel>
          )}
          {!loading && historyGroupVisited && (
            <CachedTabPanel active={sectionFromTab !== null}>
              <HistoryScreen
                exerciseLibrary={exerciseLibrary}
                dataRevision={dataRevision}
                key={`${historyOpenId ?? 'history'}-${historyExerciseId ?? 'all'}-${historyMovementId ?? 'any'}-${historyOpenCount}`}
                workouts={shownWorkouts}
                syncingWorkoutIds={syncingWorkoutIds}
                categoryColors={workoutTypeColors}
                measurements={measurements}
                exercises={exercises}
                onEdit={editWorkout}
                onResume={resumeWorkout}
                onDelete={deleteWorkout}
                personalRecords={personalRecords}
                onDataChange={refreshAfterMutation}
                initialOpenId={historyOpenId}
                onCreateExercise={createExercise}
                section={historySection}
                onSectionChange={(section) => setTab(section)}
                onOpenSettings={openAllSettings}
                accountActions={accountHeaderActions(sectionFromTab !== null)}
                onOpenExercise={(exerciseId) => openHistorySection('progress', exerciseId)}
                onOpenMember={openSharedProfile}
                onOpenWorkout={openSavedWorkout}
                initialExerciseId={historyExerciseId}
                openMachineWeights={
                  machineWeightsFor !== null && machineWeightsFor === historyExerciseId
                }
                onMachineWeightsOpened={() => setMachineWeightsFor(null)}
                rootRequest={tabRootRequest}
                initialMovementId={historyMovementId}
                weekStartDay={weekStartDayFrom(dashboard?.weekly_sets?.week_start)}
                heatmap={shownDashboard?.heatmap ?? []}
                trainingSplit={shownDashboard?.training_split ?? null}
                historySummary={shownDashboard?.history ?? null}
                olderHistory={olderHistoryProps}
                activeWorkout={activeWorkoutStartedAt !== null}
                activeWorkoutDate={activeWorkoutDate}
                onResumeWorkout={() => setTab('log')}
                onStartWorkout={startOnDay}
                onReplaceActiveWorkout={(workoutDate) => startWorkout(workoutDate, true)}
                onEditSplit={openSplitSchedule}
              />
            </CachedTabPanel>
          )}
          {!loading && tab === 'split' && (
            <TrainingSplitEditor
              initialRoutineId={splitDestination.routineId}
              onSaved={async () => {
                await refreshData({ silent: true, activityLabel: null });
              }}
            />
          )}
          {!loading && (tab === 'settings' || visitedTabs.has('settings')) && (
            <CachedTabPanel active={tab === 'settings'}>
              <SettingsScreen
                exercises={exercises}
                active={tab === 'settings'}
                selectedGroup={settingsGroup}
                onSelectGroup={setSettingsGroup}
                onOpenSplit={openSplitSchedule}
                splitName={dashboard?.recommendation?.split_name ?? null}
                guideActive={prompt === 'tour'}
                workouts={workouts}
                historySummary={historySummary}
                measurements={measurements}
                restTimerEnabled={restTimerEnabled}
                onRestTimerEnabledChange={updateRestTimerPreference}
                showRestTimes={showRestTimes}
                onShowRestTimesChange={updateRestTimesPreference}
                reduceMotion={reduceMotion}
                onReduceMotionChange={updateReduceMotion}
                bodyTrendPreference={bodyTrendPreference}
                onBodyTrendPreferenceChange={updateBodyTrendPreference}
                onImportWorkouts={importWorkoutCsv}
                onUndoImport={undoWorkoutImport}
                csvGuideOpen={csvGuideOpen}
                onCsvGuideOpenChange={setCsvGuideOpen}
                onDeleteSamples={deleteSampleData}
                onRestoreArchive={restoreAccountArchive}
                onDataChange={refreshAfterMutation}
                account={user}
                onOpenProfile={() => setTab('profile')}
                openFeedback={openFeedback}
                onOpenAdmin={isAdmin ? () => setTab('admin') : undefined}
                releaseVersion={CLIENT_VERSION}
                onOpenReleaseNotes={announcement.show}
                updateCheck={
                  <AppUpdateCheck
                    available={appUpdates.available}
                    status={appUpdates.status}
                    onCheck={() => void appUpdates.check()}
                  />
                }
                onOpenHomeScreenGuide={homeScreenGuide.show}
                onOpenAppGuide={() => {
                  guideReturnTab.current = tab;
                  setGuideRequested(true);
                }}
              />
            </CachedTabPanel>
          )}
          {/* Like the exercise library, Social loads in the background alongside Home's data. */}
          {user && (
            <CachedTabPanel active={tab === 'social'}>
              <SocialScreen
                active={tab === 'social'}
                preload
                account={user}
                openFeedback={openFeedback}
                onOpenProfile={openSharedProfile}
                onOpenOwnProfile={() => setTab('profile')}
                onChooseSharing={openSharingSettings}
                onOpenSettings={openAllSettings}
              />
            </CachedTabPanel>
          )}
          {user && (
            <CachedTabPanel active={tab === 'profile'}>
              <ProfileScreen
                key={user.id}
                onOpenSplits={openSplits}
                dataRevision={dataRevision}
                active={tab === 'profile'}
                preloadReady={startupRefreshed}
                onChooseSharing={openSharingSettings}
                renderWorkouts={(props) => (
                  <SharedWorkoutHistory
                    {...props}
                    categoryColors={workoutTypeColors}
                    weekStartDay={weekStartDayFrom(dashboard?.weekly_sets?.week_start)}
                  />
                )}
              />
            </CachedTabPanel>
          )}
          {user &&
            sharedProfile &&
            (tab === 'shared-profile' || visitedTabs.has('shared-profile')) && (
              <CachedTabPanel active={tab === 'shared-profile'}>
                <SharedProfileScreen
                  key={`${sharedProfile.id}-${sharedProfile.opened}`}
                  onOpenSplits={openSplits}
                  profileId={sharedProfile.id}
                  targetWorkout={sharedProfile.workout}
                  invite={sharedProfile.invite}
                  onLoaded={(profile) =>
                    setSharedProfile((current) =>
                      current?.invite && current.id === profile.id
                        ? { ...current, name: profile.display_name }
                        : current,
                    )
                  }
                  onChooseSharing={openSharingSettings}
                  renderWorkouts={(props) => (
                    <SharedWorkoutHistory
                      {...props}
                      categoryColors={workoutTypeColors}
                      weekStartDay={weekStartDayFrom(dashboard?.weekly_sets?.week_start)}
                    />
                  )}
                />
              </CachedTabPanel>
            )}
          {isAdmin && (tab === 'admin' || visitedTabs.has('admin')) && (
            <CachedTabPanel active={tab === 'admin'}>
              <AdminScreen active={tab === 'admin'} />
            </CachedTabPanel>
          )}
          {videosAllowed && (tab === 'videos' || visitedTabs.has('videos')) && (
            <CachedTabPanel active={tab === 'videos'}>
              <VideoUpload />
            </CachedTabPanel>
          )}
        </main>

        {showTabBar && (
          <AppTabBar
            liveSummary={liveWorkoutSummary}
            inert={liveSheetOpen}
            homeLayout={home}
            active={liveSheetOpen ? 'dashboard' : activeMainTab}
            workoutStartedAt={activeWorkoutStartedAt}
            restEndsAt={restEndsAt}
            restDoneAt={restDoneAt}
            workoutSaving={workoutSaveBlocked}
            onSelect={selectMainTab}
            onStart={() => {
              if (activeWorkoutStartedAt === null) startWorkout();
              // The ringing bell opens the workout at the next set; the logger opens it.
              else if (restDoneAt !== null) setRestGoRequest((request) => request + 1);
              else resumeLiveWorkout();
            }}
            startMenu={{
              upNextLabel:
                startMenuUpNext.label &&
                !startMenuUpNext.isRestDay &&
                !startMenuUpNext.needsSplitUpdate
                  ? `${startMenuUpNext.label} day`
                  : null,
              onCardio: () => startWhenHomeConfirmed(() => startCardioRef.current()),
              // A rest day's own type is never started; without a next training day, no Up next.
              onUpNext:
                upNext.isRestDay && !startMenuUpNext.recommendation
                  ? null
                  : () => startUpNext('menu'),
              onEmpty: () => startWorkout(),
            }}
          />
        )}
        {trainSheetOpen && user && (
          <TrainTogetherSheet
            user={user}
            session={trainTogether.session}
            partners={trainTogether.partners}
            palettes={trainPalettes}
            invite={trainTogether.invite}
            inviteSeconds={trainTogether.inviteSeconds}
            creatingInvite={trainTogether.creatingInvite}
            joining={trainTogether.joining}
            leaving={trainTogether.leaving}
            onCreateInvite={trainTogether.createInvite}
            onJoin={async (token) => {
              const joined = await trainTogether.join(token);
              if (!joined || !trainMountedRef.current) return;
              completeTrainJoin(joined);
            }}
            onLeave={leaveTrainSession}
            onClose={() => setTrainSheetOpen(false)}
          />
        )}
        {trainStartPartnerId &&
          (() => {
            const index = trainTogether.partners.findIndex(
              (partner) => partner.user_id === trainStartPartnerId,
            );
            const partner: TrainMember | null = index >= 0 ? trainTogether.partners[index] : null;
            if (!partner) return null;
            return (
              <TrainTogetherStartSheet
                partner={partner}
                palette={trainPalettes[index]}
                catalogueLoaded={exerciseCatalogue.loaded}
                catalogueError={exerciseCatalogue.error}
                onRetryCatalogue={() => void refreshData({ activityLabel: 'Reloading exercises…' })}
                onStartWithPartner={() => {
                  if (!exerciseCatalogue.loaded) return;
                  setTrainStartPartnerId(null);
                  const date = localDate();
                  if (!partner.workout) {
                    startWorkout(date);
                    return;
                  }
                  const { template, unmatched } = partnerStartTemplate(
                    partner.workout,
                    exercises,
                    date,
                  );
                  startWorkout(
                    date,
                    false,
                    template.exercises.length > 0 ? template : null,
                    template.category,
                  );
                  const notice = unmatchedExercisesNotice(unmatched.length);
                  if (notice) showToast(notice);
                }}
                onStartOwn={() => {
                  setTrainStartPartnerId(null);
                  startWorkout();
                }}
                onClose={() => setTrainStartPartnerId(null)}
              />
            );
          })()}
        {activePartnerId === null && workoutSync.conflict && !syncConflictDismissed && (
          <ActiveWorkoutSyncDialog
            conflict={workoutSync.conflict}
            exercises={exercises}
            onResolve={workoutSync.resolve}
            onClose={() => setSyncConflictDismissed(true)}
          />
        )}
        {/* Failed syncs retry in the background; only a conflict needs the user. This floats
            over the screen, so it never pushes the workout down. */}
        {activePartnerId === null && workoutSync.conflict && syncConflictDismissed && (
          <button
            type="button"
            className="workout-sync-reopen primary-action"
            onClick={() => setSyncConflictDismissed(false)}
          >
            Resolve workout sync
          </button>
        )}
      </div>
    </AppContentProviders>
  );
}

function OverlayScreenHeader({
  title,
  subtitle,
  onBack,
  actions,
  onTitleClick,
  titleActionLabel,
  backLabel = 'Go back',
}: {
  title: string;
  subtitle: ReactNode;
  onBack: () => void;
  actions?: ReactNode;
  onTitleClick?: () => void;
  titleActionLabel?: string;
  backLabel?: string;
}) {
  const tips = useTips();
  return (
    <header className="overlay-screen-header">
      <button
        className="overlay-header-back"
        type="button"
        onClick={() => {
          if (runningAsInstalledApp()) tips.event('back-button', 'back', 10);
          onBack();
        }}
        aria-label={backLabel}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 5.5 8 12l6.5 6.5" />
        </svg>
      </button>
      <div className="overlay-header-copy">
        {onTitleClick ? (
          <button
            className="overlay-header-title-button"
            type="button"
            onClick={onTitleClick}
            aria-label={titleActionLabel ?? `Edit ${title}`}
          >
            <strong>{title}</strong>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m4 20 4.2-1 10.6-10.6a2.1 2.1 0 0 0-3-3L5.2 16 4 20Zm10.5-13.5 3 3" />
            </svg>
          </button>
        ) : (
          <strong>{title}</strong>
        )}
        {subtitle && <span>{subtitle}</span>}
      </div>
      {actions && <div className="overlay-header-actions">{actions}</div>}
    </header>
  );
}

function InteractiveWorkoutCalendar({
  entries,
  workouts,
  olderHistory,
  split,
  categoryColors,
  activeWorkout,
  activeWorkoutDate,
  onResumeWorkout,
  onEditWorkout,
  onOpenWorkout,
  onStartWorkout,
  onReplaceActiveWorkout,
  onEditSplit,
  hiddenCategories: shownHiddenCategories,
  onHiddenCategoriesChange,
  weekStartDay,
}: {
  entries: DashboardData['heatmap'];
  /** Given, shows only this week's days (Home's own section) instead of the calendar. */
  weekStartDay?: number;
  workouts: TrackedWorkout[];
  olderHistory?: OlderHistoryProps;
  /** The saved split, whose planned and missed days get a faint outline in the calendar. */
  split?: TrainingSplit | null;
  categoryColors: WorkoutTypeColors;
  activeWorkout: boolean;
  activeWorkoutDate: string | null;
  onResumeWorkout: () => void;
  onEditWorkout: (workout: TrackedWorkout) => void;
  /** Opens a logged workout's session card; without it, a day's workout opens the editor. */
  onOpenWorkout?: (workout: TrackedWorkout) => void;
  /** Starts a workout on the date, pre-filled from a planned split day when given one. */
  onStartWorkout: (workoutDate: string, start?: PlannedStart) => void;
  onReplaceActiveWorkout: (workoutDate: string) => void;
  onEditSplit?: () => void;
  /** The legend's switched-off types, when the screen also filters its own list by them. */
  hiddenCategories?: ReadonlySet<string>;
  onHiddenCategoriesChange?: (hidden: ReadonlySet<string>) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<DashboardData['heatmap'][number] | null>(null);
  const [pendingWorkoutDate, setPendingWorkoutDate] = useState<string | null>(null);
  const [plannedDate, setPlannedDate] = useState<string | null>(null);
  // Every type shows by default; tapping one in the legend greys it out in the calendar.
  const { types } = useWorkoutTypes();
  const [ownHiddenCategories, setOwnHiddenCategories] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const hiddenCategories = shownHiddenCategories ?? ownHiddenCategories;
  // The legend lists only the types logged in the months on screen.
  const [visibleMonths, setVisibleMonths] = useState<readonly string[] | null>(null);
  const presentTypes = calendarLegendTypes(entriesInMonths(entries, visibleMonths), types);
  const today = localDate();
  // Six weeks ahead reaches the end of the current month, the newest one the calendar shows.
  const splitDays = useMemo(() => splitCalendarDays(split, today, 42), [split, today]);
  // The live day takes the colour of the workout type being logged.
  const activeDraft = activeWorkoutDate ? readActiveWorkoutDraft() : null;
  const activeWorkoutColor = liveWorkoutColor(activeDraft, types, categoryColors);
  const toggleCategory = (category: string) => {
    const next = new Set(hiddenCategories);
    if (!next.delete(category)) next.add(category);
    if (onHiddenCategoriesChange) onHiddenCategoriesChange(next);
    else setOwnHiddenCategories(next);
  };

  // Today with a split, and every later day, show the plan and start it today; a past day
  // logs a missed session on that date.
  const openDay = (workoutDate: string, entry: DashboardData['heatmap'][number] | undefined) => {
    const target = calendarDayTarget(workoutDate, today, !!entry, !!split?.enabled);
    if (entry) setSelectedDay(entry);
    else if (target === 'planned') setPlannedDate(workoutDate);
    else setPendingWorkoutDate(workoutDate);
  };

  return (
    <>
      {weekStartDay !== undefined ? (
        <WeekStrip
          entries={entries}
          categoryColors={categoryColors}
          weekStartDay={weekStartDay}
          activeWorkoutDate={activeWorkoutDate}
          activeWorkoutColor={activeWorkoutColor}
          selectedDate={selectedDay?.workout_date ?? pendingWorkoutDate ?? plannedDate}
          onActiveWorkoutClick={onResumeWorkout}
          onDayClick={openDay}
        />
      ) : (
        <>
          <WorkoutCalendar
            entries={entries}
            olderHistory={olderHistory}
            categoryColors={categoryColors}
            hiddenCategories={hiddenCategories}
            activeWorkoutDate={activeWorkoutDate}
            activeWorkoutColor={activeWorkoutColor}
            selectedDate={selectedDay?.workout_date ?? pendingWorkoutDate ?? plannedDate}
            onActiveWorkoutClick={onResumeWorkout}
            onDayClick={openDay}
            onVisibleMonthsChange={setVisibleMonths}
            splitDays={splitDays}
          />
          <WorkoutCalendarLegend
            presentTypes={presentTypes}
            hiddenCategories={hiddenCategories}
            categoryColors={categoryColors}
            onToggle={toggleCategory}
          />
        </>
      )}
      {selectedDay && (
        <CalendarDayDetail
          day={selectedDay}
          categoryColors={categoryColors}
          onClose={() => setSelectedDay(null)}
          onStartWorkout={(workoutDate) => {
            setSelectedDay(null);
            setPendingWorkoutDate(workoutDate);
          }}
          onEditWorkout={(workoutId) => {
            const workout = workouts.find((item) => item.id === workoutId);
            if (!workout) return;
            setSelectedDay(null);
            onEditWorkout(workout);
          }}
          onOpenWorkout={
            onOpenWorkout &&
            ((workoutId) => {
              const workout = workouts.find((item) => item.id === workoutId);
              if (!workout) return;
              setSelectedDay(null);
              onOpenWorkout(workout);
            })
          }
        />
      )}
      {plannedDate && (
        <PlannedDaySheet
          key={plannedDate}
          date={plannedDate}
          today={today}
          split={split}
          workouts={workouts}
          categoryColors={categoryColors}
          activeWorkout={activeWorkout}
          onClose={() => setPlannedDate(null)}
          onStart={(start) => {
            setPlannedDate(null);
            onStartWorkout(today, start ?? undefined);
          }}
          onResume={() => {
            setPlannedDate(null);
            onResumeWorkout();
          }}
          onEditSplit={
            onEditSplit &&
            (() => {
              setPlannedDate(null);
              onEditSplit();
            })
          }
        />
      )}
      {pendingWorkoutDate && (
        <CalendarCreateWorkoutDialog
          workoutDate={pendingWorkoutDate}
          activeWorkout={activeWorkout}
          onCancel={() => setPendingWorkoutDate(null)}
          onConfirm={() => {
            const workoutDate = pendingWorkoutDate;
            setPendingWorkoutDate(null);
            if (activeWorkout) onReplaceActiveWorkout(workoutDate);
            else onStartWorkout(workoutDate);
          }}
        />
      )}
    </>
  );
}

function BrowsedWorkoutDetails({
  workout,
  bodyweight,
  categoryColor,
}: {
  workout: TrackedWorkout;
  bodyweight?: number | null;
  categoryColor: string;
}) {
  const [photo, setPhoto] = useState<MachinePhoto | null>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  return (
    <div className="browse-history-content">
      <HistoryWorkoutCard
        detailsOnly
        bodyweight={bodyweight}
        workout={workout}
        open
        summaryRef={null}
        targetExerciseId={null}
        targetExerciseRef={targetRef}
        categoryColor={categoryColor}
        records={0}
        personalRecords={[]}
        activeWorkout
        expandedPhoto={photo}
        onExpandPhoto={setPhoto}
        onToggle={() => {}}
      />
    </div>
  );
}

function WorkoutLogger({
  exercises,
  restoredDraftMovements,
  categoryColors,
  recommendation,
  template,
  startCategory = null,
  startType = null,
  initialDate,
  initialWorkout,
  readOnly = false,
  navigation,
  resumingWorkout,
  currentBodyweight,
  measurements = [],
  historicalWorkouts,
  historyBaselines = null,
  restTimerEnabled,
  showRestTimes,
  weeklySets,
  onExerciseHistory,
  onExerciseFavorite,
  onCreateExercise,
  onSave,
  onShow,
  activeStartedAt,
  onClose,
  workoutEditGuard,
  onDelete,
  onRestTimerChange,
  onRestDoneChange,
  restGoRequest = 0,
  screenVisible = true,
  inForeground = true,
  onLiveSummaryChange,
  trainTogether,
  trainPalettes = [],
  onOpenTrainSheet,
  onLogForPartner,
  onLeaveTrainSession,
}: {
  exercises: Exercise[];
  restoredDraftMovements: DraftMovement[];
  categoryColors: WorkoutTypeColors;
  recommendation: WorkoutRecommendation | null;
  template: SessionTemplate | null;
  /** A type chosen before starting, such as Cardio from the Start menu. */
  startCategory?: WorkoutCategory | null;
  startType?: WorkoutType | null;
  initialDate: string;
  initialWorkout: TrackedWorkout | null;
  readOnly?: boolean;
  navigation: WorkoutNavigation;
  resumingWorkout: TrackedWorkout | null;
  currentBodyweight: number | null;
  measurements?: BodyMeasurement[];
  /** Loaded recent workouts; `historyBaselines` condenses everything older. */
  historicalWorkouts: TrackedWorkout[];
  historyBaselines?: HistoryBaselines | null;
  restTimerEnabled: boolean;
  showRestTimes: boolean;
  /** This week's live working-set credits, for the shelf a logged working set opens. */
  weeklySets?: MuscleSetsWeek;
  onExerciseHistory: (exerciseId: string) => void;
  onExerciseFavorite: (exerciseId: string, isFavorite: boolean) => Promise<void>;
  onCreateExercise: (input: ExerciseCreateInput) => Promise<Exercise>;
  onSave: (payload: WorkoutInput) => Promise<void>;
  /** Opens the workout screen from wherever the app is. */
  onShow: () => void;
  activeStartedAt: number | null;
  onClose: () => void;
  /** Given to the editor of a saved workout, so Back can ask before discarding its changes. */
  workoutEditGuard?: RefObject<LeaveGuard | null>;
  onDelete: () => void;
  /** When the rest ends, or null without one, for the countdown on the tab bar. */
  onRestTimerChange?: (endsAt: number | null) => void;
  /** When a finished rest started waiting for the next set, or null, for the tab bar's bell. */
  onRestDoneChange?: (endedAt: number | null) => void;
  /** Each increase opens the workout at the set after the finished rest. */
  restGoRequest?: number;
  /** False while the workout is minimised behind another tab. */
  screenVisible?: boolean;
  /** False while another person's workout is in the foreground (partner logging mode). */
  inForeground?: boolean;
  onLiveSummaryChange: (summary: LiveWorkoutSummary) => void;
  trainTogether?: TrainTogetherController;
  trainPalettes?: PartnerPalette[];
  onOpenTrainSheet?: () => void;
  onLogForPartner?: (partnerId: string) => void;
  onLeaveTrainSession?: () => void;
}) {
  const { config: trainingBlocks } = useTrainingBlocks();
  const weightUnit = useWeightUnit();
  const defaultRest = useDefaultRest();
  const restoredDraft = useState(() => (initialWorkout ? null : readActiveWorkoutDraft()))[0];
  const [name, setName] = useState(
    initialWorkout?.name ?? restoredDraft?.name ?? resumingWorkout?.name ?? '',
  );
  // Keep the selected start day even when the workout finishes after midnight.
  const [workoutDate, setWorkoutDate] = useState(
    initialWorkout?.workout_date ??
      restoredDraft?.workoutDate ??
      resumingWorkout?.workout_date ??
      initialDate,
  );
  const workoutBodyweight = bodyweightOn(
    measurements,
    workoutDate,
    initialWorkout ? currentBodyweight : null,
  );
  const [category, setCategory] = useState<WorkoutCategory>(
    initialWorkout?.category ??
      restoredDraft?.category ??
      resumingWorkout?.category ??
      startCategory ??
      template?.category ??
      recommendation?.category ??
      'push',
  );
  const workoutTypes = useWorkoutTypes();
  const [customTypeId, setCustomTypeId] = useState<string | null>(
    initialWorkout?.workout_type_id ??
      restoredDraft?.workoutTypeId ??
      resumingWorkout?.workout_type_id ??
      (startType?.is_custom ? startType.id : null) ??
      template?.sourceWorkout.workout_type_id ??
      null,
  );
  const [workoutTypeExplicit, setWorkoutTypeExplicit] = useState(
    restoredDraft?.workoutTypeExplicit ??
      Boolean(initialWorkout || resumingWorkout || customTypeId || startCategory),
  );
  const selectedType = effectiveWorkoutType(
    {
      category,
      workout_type_id: customTypeId,
      workout_type:
        initialWorkout?.workout_type ??
        resumingWorkout?.workout_type ??
        template?.sourceWorkout.workout_type,
    },
    workoutTypes.types,
  );
  const typeOptions = workoutTypes.types.filter(
    (type) =>
      !type.archived || (type.id === selectedType.id && Boolean(initialWorkout || resumingWorkout)),
  );
  function chooseWorkoutType(id: string) {
    const type = workoutTypes.types.find((item) => item.id === id);
    if (!type) return;
    const automaticNames = ['', `${selectedType.name} workout`, workoutNameForCategory(category)];
    if (automaticNames.includes(name.trim())) setName('');
    setCustomTypeId(type.is_custom ? type.id : null);
    setCategory(type.is_custom ? 'other' : (type.id as WorkoutCategory));
    setWorkoutTypeExplicit(true);
    // An empty workout takes on the exercises saved to its new type; logged work is never replaced.
    const saved = workoutTypes.savedExercises[type.id];
    if (!readOnly && saved?.length && movements.length === 0)
      setMovements(
        templateMovements(
          typeSessionTemplate(type, saved, type.name, workoutDate, weightUnit).exercises,
        ),
      );
  }
  useEffect(() => {
    if (
      workoutTypes.loading ||
      workoutTypes.error ||
      initialWorkout ||
      resumingWorkout ||
      workoutTypeExplicit
    )
      return;
    if (!selectedType.archived) return;
    const first = workoutTypes.types.find((type) => !type.archived);
    if (!first) return;
    setCategory(first.is_custom ? 'other' : (first.id as WorkoutCategory));
    setCustomTypeId(first.is_custom ? first.id : null);
  }, [
    initialWorkout,
    resumingWorkout,
    selectedType.archived,
    workoutTypeExplicit,
    workoutTypes.loading,
    workoutTypes.error,
    workoutTypes.types,
  ]);
  const [skipHighRepWarning, setSkipHighRepWarning] = useState(
    restoredDraft?.skipHighRepWarning ?? false,
  );
  const [notes, setNotes] = useState(
    initialWorkout?.notes ?? restoredDraft?.notes ?? resumingWorkout?.notes ?? '',
  );
  const [durationOverrideMinutes, setDurationOverrideMinutes] = useState<number | null>(
    restoredDraft?.durationOverrideMinutes ?? null,
  );
  const [editedDurationMinutes, setEditedDurationMinutes] = useState(
    initialWorkout?.duration_minutes ?? 0,
  );
  const [startTime, setStartTime] = useState(
    workoutTimeInputValue(initialWorkout?.start_time ?? null),
  );
  const [endTime, setEndTime] = useState(workoutTimeInputValue(initialWorkout?.end_time ?? null));
  const sourceWorkout = initialWorkout ?? (restoredDraft ? null : resumingWorkout);
  const tips = useTips();
  const recentRemoval = useRef<TipRemoval | null>(null);
  const [movements, setMovements] = useState<DraftMovement[]>(() =>
    sourceWorkout
      ? savedWorkoutMovements(sourceWorkout, () => crypto.randomUUID())
      : restoredDraft
        ? restoredDraftMovements
        : templateMovements(template?.exercises ?? []),
  );
  /** Draft rows for planned or last-session exercises, with sets suggested from history. */
  function templateMovements(items: SessionTemplate['exercises']): DraftMovement[] {
    return templateDraftMovements(items, {
      workouts: historicalWorkouts,
      historyBaselines,
      date: initialDate,
      weightUnit,
      defaultRest,
      newKey: () => crypto.randomUUID(),
    });
  }
  const [pickerOpen, setPickerOpen] = useState(false);
  const movementStackRef = useRef<HTMLDivElement>(null);
  const animateAddedMovements = useFlipAnimation(
    movementStackRef,
    movements.map((movement) => movement.key).join('|'),
  );
  const [switchingMovementKey, setSwitchingMovementKey] = useState<string | null>(null);
  const [swapSheetMovementKey, setSwapSheetMovementKey] = useState<string | null>(null);
  const [swapUndo, setSwapUndo] = useState<{
    id: number;
    movements: DraftMovement[];
    exerciseName: string;
  } | null>(null);
  const swapSheetMovement = swapSheetMovementKey
    ? (movements.find((movement) => movement.key === swapSheetMovementKey) ?? null)
    : null;
  const [supersetPickerKey, setSupersetPickerKey] = useState<string | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [finishConfirmationOpen, setFinishConfirmationOpen] = useState(false);
  const [warmupReviewOpen, setWarmupReviewOpen] = useState(false);
  /** Why the open finish confirmation cannot save yet. */
  const [finishBlocker, setFinishBlocker] = useState<string | null>(null);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const unsavedChanges = useUnsavedWorkoutChanges(Boolean(initialWorkout) && !readOnly, {
    name,
    workoutDate,
    category,
    customTypeId,
    notes,
    durationMinutes: editedDurationMinutes,
    startTime,
    endTime,
    movements,
  });
  const discardChangesDialog = useDiscardChangesGuard({
    guard: workoutEditGuard,
    unsaved: unsavedChanges && !saving,
    onDiscard: onClose,
  });
  const [error, setError] = useState<string | null>(null);
  const [machineAssignmentError, setMachineAssignmentError] = useState<string | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const [detailsOpen, setDetailsOpen] = useState(Boolean(initialWorkout));
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const startedAt = useState(() => restoredDraft?.startedAt ?? activeStartedAt ?? Date.now())[0];
  // Paused time is left out of the live time and the saved duration; the real start is kept.
  const [pause, setPause] = useState<WorkoutPause>(() => draftPause(restoredDraft));
  const workoutPaused = !initialWorkout && pause.pausedAt !== null;
  const [timeEditorOpen, setTimeEditorOpen] = useState(false);
  const clientSessionId = useState(() => restoredDraft?.clientSessionId ?? crypto.randomUUID())[0];
  const draftPersistedRef = useRef(Boolean(restoredDraft));
  const isCurrentDraft = useCallback(() => {
    if (!draftPersistedRef.current) return true;
    const current = readActiveWorkoutDraft();
    return (
      current?.startedAt === startedAt &&
      (!current.clientSessionId || current.clientSessionId === clientSessionId)
    );
  }, [clientSessionId, startedAt]);
  const resumedWorkoutId = restoredDraft?.resumingWorkoutId ?? resumingWorkout?.id ?? null;
  const previousDurationMinutes = useState(
    () => restoredDraft?.previousDurationMinutes ?? resumingWorkout?.duration_minutes ?? 0,
  )[0];
  // The saved version these entries were loaded from. A save names it, so the server can refuse
  // to replace a version another device has saved since.
  const baseRevision = useState(
    () =>
      initialWorkout?.revision ??
      restoredDraft?.resumingWorkoutRevision ??
      resumingWorkout?.revision,
  )[0];
  const initialActivity = useState(() => {
    const lastActiveAt = Math.max(
      startedAt,
      restoredDraft?.lastActiveAt ?? restoredDraft?.updatedAt ?? startedAt,
    );
    const normalFinishAt = inactiveWorkoutFinishAt(startedAt, lastActiveAt);
    const legacyDraftAlreadyOverdue =
      restoredDraft !== null &&
      restoredDraft.inactiveFinishAt === undefined &&
      Date.now() >= startedAt + MAX_INACTIVE_WORKOUT_MS;
    return {
      lastActiveAt,
      finishAt:
        restoredDraft?.inactiveFinishAt ??
        (legacyDraftAlreadyOverdue ? startedAt + MAX_INACTIVE_WORKOUT_MS : normalFinishAt),
    };
  })[0];
  const lastActiveAtRef = useRef(initialActivity.lastActiveAt);
  const inactiveFinishAtRef = useRef(initialActivity.finishAt);
  const savingRef = useRef(false);
  const autoSaveWorkoutRef = useRef<() => WorkoutInput | null>(() => null);
  const autoSaveMinutes = useWorkoutAutoSaveMinutes();
  const autoSaveMinutesRef = useRef(autoSaveMinutes);
  const preparingFinishRef = useRef(false);
  const skipRemotePersistRef = useRef(false);
  useEffect(() => {
    if (initialWorkout) return;
    const apply = (event: Event) => {
      const draft = (event as CustomEvent<ActiveWorkoutDraft | null>).detail;
      if (!draft || draft.clientSessionId !== clientSessionId || savingRef.current) return;
      const restored = restoreWorkoutDraftMovements(draft.movements, exercises);
      if (!restored) return;
      skipRemotePersistRef.current = true;
      lastActiveAtRef.current = draft.lastActiveAt ?? draft.startedAt;
      inactiveFinishAtRef.current =
        draft.inactiveFinishAt ?? inactiveWorkoutFinishAt(draft.startedAt, lastActiveAtRef.current);
      setName(draft.name);
      setWorkoutDate(draft.workoutDate);
      setCategory(draft.category);
      setCustomTypeId(draft.workoutTypeId ?? null);
      setWorkoutTypeExplicit(draft.workoutTypeExplicit ?? false);
      setSkipHighRepWarning(draft.skipHighRepWarning ?? false);
      setNotes(draft.notes);
      setDurationOverrideMinutes(draft.durationOverrideMinutes ?? null);
      setMovements(restored);
      setPause(draftPause(draft));
    };
    window.addEventListener(REMOTE_WORKOUT_APPLIED, apply);
    return () => window.removeEventListener(REMOTE_WORKOUT_APPLIED, apply);
  }, [clientSessionId, exercises, initialWorkout]);
  // An inactive workout is never saved unasked: it waits for Save, Resume or Discard.
  const [inactivePromptOpen, setInactivePromptOpen] = useState(false);
  const hasLoggedSetRef = useRef(false);
  const persistDraftRef = useRef<() => boolean>(() => false);
  const [elapsed, setElapsed] = useState(
    initialWorkout
      ? (initialWorkout.duration_minutes ?? 0) * 60
      : activeElapsedSeconds(startedAt, draftPause(restoredDraft)),
  );
  // A rest running when the app reloaded carries on from where it was.
  const restoredRest = useState(() =>
    restoreRestTimer(initialWorkout ? null : readStoredRestTimer(), clientSessionId),
  )[0];
  const [restLeft, setRestLeft] = useState(restoredRest.secondsLeft);
  // Each new rest opens the pill; hiding it tucks the countdown into the bottom-edge notch.
  const [restTotal, setRestTotal] = useState(restoredRest.totalSeconds);
  const [restHidden, setRestHidden] = useState(false);
  // A finished rest becomes the "GO" pill until the next set is logged, it is used or dismissed.
  const [restDone, setRestDone] = useState<{ endedAt: number; movementKey: string | null } | null>(
    restoredRest.done,
  );
  // The exercise (or the first of its superset) whose logged set started the rest.
  const restMovementKeyRef = useRef<string | null>(restoredRest.movementKey);
  const restNotificationEndpointRef = useRef<string | null>(null);
  const activeRestTimerRef = useRef<{
    id: string;
    endsAt: number;
    /** Seconds left when the workout was paused; null while the rest is counting down. */
    pausedLeft: number | null;
    serverScheduled: boolean;
    pendingSchedules: Set<Promise<void>>;
  } | null>(
    restoredRest.timer && {
      ...restoredRest.timer,
      serverScheduled: false,
      pendingSchedules: new Set<Promise<void>>(),
    },
  );

  useEffect(() => {
    if (initialWorkout) return;
    const update = () => setElapsed(activeElapsedSeconds(startedAt, pause));
    update();
    if (pause.pausedAt !== null) return;
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [initialWorkout, startedAt, pause]);

  useEffect(() => {
    if (initialWorkout) {
      if (readOnly) return;
      // Saved-workout edits have no active draft; keep them open until explicitly saved.
      const keepEdits = (event: Event) => event.preventDefault();
      window.addEventListener(BEFORE_APP_REFRESH_EVENT, keepEdits);
      return () => window.removeEventListener(BEFORE_APP_REFRESH_EVENT, keepEdits);
    }
    let lastActivityWriteAt = 0;
    const persistDraft = () => {
      // Read synchronously: a frozen tab can wake before its storage event is delivered.
      if (savingRef.current || !isCurrentDraft()) return false;
      const draft: ActiveWorkoutDraft = {
        version: 1,
        clientSessionId,
        startedAt,
        ...(resumedWorkoutId && {
          resumingWorkoutId: resumedWorkoutId,
          resumingWorkoutRevision: baseRevision,
          previousDurationMinutes,
        }),
        updatedAt: Date.now(),
        lastActiveAt: lastActiveAtRef.current,
        inactiveFinishAt: inactiveFinishAtRef.current,
        durationOverrideMinutes,
        pausedMs: pause.pausedMs,
        ...(pause.adjustedMs !== undefined && { adjustedMs: pause.adjustedMs }),
        pausedAt: pause.pausedAt,
        name,
        workoutDate,
        category,
        workoutTypeId: customTypeId,
        workoutTypeExplicit,
        skipHighRepWarning,
        notes,
        movements: movements.map((movement) => ({
          key: movement.key,
          exerciseId: movement.exercise.id,
          notes: movement.notes,
          machinePhotoIds: movement.machinePhotoIds,
          machineSettings: movement.machineSettings,
          supersetKey: movement.supersetKey,
          isComplete: movement.isComplete,
          ...(movement.swappedFrom && { swappedFrom: movement.swappedFrom }),
          ...(movement.repRange && { repRange: movement.repRange }),
          sets: movement.sets,
        })),
      };
      prepareWorkoutAutoSave(
        draft,
        workoutAutoSaveMinutes() === null ? null : autoSaveWorkoutRef.current(),
      );
      const persisted = writeActiveWorkoutDraft(draft);
      if (persisted) draftPersistedRef.current = true;
      return persisted;
    };
    const recordActivity = (event: Event) => {
      if (document.visibilityState !== 'visible' || window.location.hash !== '#log') return;
      if (
        event.target instanceof Element &&
        !event.target.closest('.logger-screen, .tt-partner-view, dialog')
      )
        return;
      if (savingRef.current || !isCurrentDraft()) return;
      const now = Date.now();
      if (now >= inactiveFinishAtRef.current) {
        if (hasLoggedSetRef.current) {
          setInactivePromptOpen(true);
          return;
        }
        // Nothing is logged yet, so returning to the workout simply continues it.
        inactiveFinishAtRef.current = inactiveWorkoutFinishAt(startedAt, now);
      } else {
        inactiveFinishAtRef.current = extendInactiveWorkoutFinishAt(
          inactiveFinishAtRef.current,
          now,
        );
      }
      lastActiveAtRef.current = now;
      if (now - lastActivityWriteAt >= 15_000) {
        lastActivityWriteAt = now;
        persistDraft();
      }
    };
    const persistWhenHidden = () => {
      if (document.visibilityState === 'hidden') {
        persistDraft();
      }
    };
    if (skipRemotePersistRef.current) skipRemotePersistRef.current = false;
    else persistDraft();
    persistDraftRef.current = persistDraft;
    const persistBeforeRefresh = (event: Event) => {
      if (savingRef.current || !persistDraft()) event.preventDefault();
    };
    window.addEventListener(BEFORE_APP_REFRESH_EVENT, persistBeforeRefresh);
    window.addEventListener('pagehide', persistDraft);
    window.addEventListener('pointerdown', recordActivity, { capture: true, passive: true });
    window.addEventListener('keydown', recordActivity, true);
    window.addEventListener('scroll', recordActivity, { capture: true, passive: true });
    document.addEventListener('visibilitychange', persistWhenHidden);
    return () => {
      window.removeEventListener(BEFORE_APP_REFRESH_EVENT, persistBeforeRefresh);
      window.removeEventListener('pagehide', persistDraft);
      window.removeEventListener('pointerdown', recordActivity, true);
      window.removeEventListener('keydown', recordActivity, true);
      window.removeEventListener('scroll', recordActivity, true);
      document.removeEventListener('visibilitychange', persistWhenHidden);
    };
  }, [
    category,
    customTypeId,
    workoutTypeExplicit,
    skipHighRepWarning,
    initialWorkout,
    readOnly,
    movements,
    name,
    notes,
    previousDurationMinutes,
    baseRevision,
    resumedWorkoutId,
    startedAt,
    workoutDate,
    durationOverrideMinutes,
    pause,
    clientSessionId,
    isCurrentDraft,
  ]);

  useEffect(() => {
    if (!pushNotificationsSupported()) return;
    let active = true;
    const syncPushState = () => {
      void existingPhonePushSubscription()
        .then((subscription) => {
          if (!active) return;
          if (!subscription) {
            restNotificationEndpointRef.current = null;
            return;
          }
          restNotificationEndpointRef.current = subscription.endpoint;
          const timer = activeRestTimerRef.current;
          if (timer && timer.pausedLeft === null)
            scheduleRestTimerPush(timer, subscription.endpoint);
        })
        .catch(() => undefined);
    };
    syncPushState();
    window.addEventListener(PHONE_PUSH_PREFERENCE_EVENT, syncPushState);
    return () => {
      active = false;
      window.removeEventListener(PHONE_PUSH_PREFERENCE_EVENT, syncPushState);
    };
  }, []);

  useEffect(() => {
    if (restLeft <= 0) return;
    const tick = () => {
      const active = activeRestTimerRef.current;
      if (!active || active.pausedLeft !== null) return;
      const next = restSecondsLeft(active.endsAt);
      setRestLeft(next);
      if (next > 0) return;
      activeRestTimerRef.current = null;
      setRestHidden(false);
      onRestTimerChange?.(null);
      // The pill also waits for a return to the app after a background alert.
      setRestDone({ endedAt: active.endsAt, movementKey: restMovementKeyRef.current });
      if (document.visibilityState !== 'visible' && !active.serverScheduled)
        void showRestTimerNotification().catch(() => undefined);
    };
    const interval = window.setInterval(tick, 500);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [restLeft, onRestTimerChange]);

  // A restored rest shows on the tab bar too.
  useEffect(() => {
    const timer = activeRestTimerRef.current;
    if (timer && timer.pausedLeft === null) onRestTimerChange?.(timer.endsAt);
    // Only the rest restored when the workout opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the rest beside the draft, so a reload restores it; unchanged rests are not rewritten.
  const storedRestRef = useRef('');
  useEffect(() => {
    if (initialWorkout) return;
    const timer = activeRestTimerRef.current;
    const value =
      timer || restDone
        ? {
            sessionId: clientSessionId,
            movementKey: restMovementKeyRef.current,
            totalSeconds: restTotal,
            timer: timer && { id: timer.id, endsAt: timer.endsAt, pausedLeft: timer.pausedLeft },
            doneAt: timer ? null : (restDone?.endedAt ?? null),
          }
        : null;
    const serialized = JSON.stringify(value);
    if (serialized === storedRestRef.current) return;
    storedRestRef.current = serialized;
    writeStoredRestTimer(value);
  }, [clientSessionId, initialWorkout, restLeft, restTotal, restDone, pause]);

  const [undoDeletion, setUndoDeletion] = useState<{
    kind: 'set' | 'rest';
    movementKey: string;
    set: DraftSet;
    index: number;
  } | null>(null);

  /** A brief popup explaining why an action didn't happen; each one restarts the countdown. */
  const [loggerNotice, setLoggerNotice] = useState<{ id: number; message: string } | null>(null);
  const showLoggerNotice = (message: string) =>
    setLoggerNotice((current) => ({ id: (current?.id ?? 0) + 1, message }));

  // Older history only precedes workouts inside the window it was condensed for. An earlier
  // date (editing an older loaded workout) compares with the loaded workouts alone.
  const olderHistory =
    historyBaselines && workoutDate >= historyBaselines.before ? historyBaselines.byExercise : null;
  const prBadges = useMemo(
    () =>
      calculateScopedDraftPrs(
        movements,
        historicalWorkouts,
        initialWorkout?.id ?? resumedWorkoutId,
        workoutDate,
        olderHistory,
        trainingBlocks.blocks,
        measurements,
        trainingBlocks.fresh_starts,
      ),
    [
      movements,
      historicalWorkouts,
      initialWorkout?.id,
      resumedWorkoutId,
      workoutDate,
      olderHistory,
      trainingBlocks.blocks,
      trainingBlocks.fresh_starts,
      measurements,
    ],
  );
  const [prConfettiBurst, setPrConfettiBurst] = useState(0);
  const [prToastEntries, setPrToastEntries] = useState<PrToastEntry[]>([]);
  const [prToastId, setPrToastId] = useState(0);
  const prCelebrationsRef = useRef(initialPrCelebrations(movements, prBadges));
  const closePrToast = useCallback(() => setPrToastEntries([]), []);

  useEffect(() => {
    const { entries, next } = newPrCelebrations(
      movements,
      prBadges,
      prCelebrationsRef.current,
      (recorded) => bodyweightOn(measurements, workoutDate, recorded),
    );
    prCelebrationsRef.current = next;
    if (entries.length) {
      setPrConfettiBurst((current) => current + 1);
      setPrToastId((current) => current + 1);
      setPrToastEntries(entries);
    }
  }, [movements, prBadges, measurements, workoutDate]);
  const recentExerciseIds = useMemo(() => {
    const seen = new Set<string>();
    const recent: string[] = [];
    historicalWorkouts.forEach((workout) => {
      workout.movements.forEach((movement) => {
        if (!seen.has(movement.exercise.id)) {
          seen.add(movement.exercise.id);
          recent.push(movement.exercise.id);
        }
      });
    });
    return recent;
  }, [historicalWorkouts]);
  const lastDoneDates = useMemo(
    () =>
      exerciseLastDoneDates(
        historicalWorkouts,
        historyBaselines?.byExercise ?? null,
        initialWorkout?.id ?? resumedWorkoutId,
      ),
    [historicalWorkouts, historyBaselines, initialWorkout?.id, resumedWorkoutId],
  );

  /** Suggestions from the chosen machine's last session, else the exercise's last session. */
  function suggestedSetsForExercise(exercise: Exercise, machineId?: string): DraftSet[] {
    return suggestedSetsForPickedExercise(
      historicalWorkouts,
      exercise,
      workoutDate,
      initialWorkout?.id,
      olderHistory,
      defaultRest,
      machineId,
      () => crypto.randomUUID(),
    );
  }

  function addExercises(
    selected: Exercise[],
    createSuperset = false,
    machineChoices: ExerciseMachineChoices = {},
  ) {
    animateAddedMovements();
    setMovements((current) => {
      const merged = mergeUniqueById(
        current.map((item) => item.exercise),
        selected,
      );
      const additions = merged.slice(current.length).map((exercise) => {
        const machine = machineSelection(exercise.id, machineChoices);
        return {
          key: crypto.randomUUID(),
          exercise,
          notes: '',
          ...machine,
          supersetKey: null,
          isComplete: false,
          sets: suggestedSetsForExercise(exercise, machine.machinePhotoIds[0]),
        };
      });
      const nextMovements = [...current, ...additions];
      return createSuperset && additions.length >= 2
        ? applySupersetSelection(
            nextMovements,
            additions[0].key,
            additions.slice(1).map((item) => item.key),
            crypto.randomUUID(),
          )
        : nextMovements;
    });
    if (
      replacesRemovedExercise(
        recentRemoval.current,
        selected.length,
        savedWorkoutCount(historicalWorkouts),
        Date.now(),
      )
    )
      tips.event('replace-exercise', 'swap');
    recentRemoval.current = null;
    setPickerOpen(false);
  }

  function closeExercisePicker() {
    setPickerOpen(false);
    setSwitchingMovementKey(null);
  }

  /** Logged sets stay with the original exercise; planned sets move to the replacement. */
  function swapExercise(
    movementKey: string,
    replacement: Exercise,
    machineChoices: ExerciseMachineChoices = {},
  ) {
    const machine = machineSelection(replacement.id, machineChoices);
    const next = swapMovementExercise(
      movements,
      movementKey,
      replacement,
      suggestedSetsForExercise(replacement, machine.machinePhotoIds[0]),
      machine,
    );
    if (next === movements) return;
    tips.learn('swap');
    setSwapUndo((current) => ({
      id: (current?.id ?? 0) + 1,
      movements,
      exerciseName: replacement.name,
    }));
    setMovements(next);
  }

  function switchExercise(selected: Exercise[], machineChoices: ExerciseMachineChoices = {}) {
    const replacement = selected[0];
    if (!switchingMovementKey || !replacement) return;
    swapExercise(switchingMovementKey, replacement, machineChoices);
    closeExercisePicker();
  }

  function undoSwap() {
    if (!swapUndo) return;
    setMovements(swapUndo.movements);
    setSwapUndo(null);
  }

  function moveMovement(index: number, direction: -1 | 1) {
    setMovements((current) => moveItem(current, index, index + direction));
  }

  function moveSet(movementKey: string, fromIndex: number, toIndex: number) {
    tips.learn('reorder');
    setMovements((current) =>
      current.map((movement) =>
        movement.key === movementKey
          ? { ...movement, sets: moveItem(movement.sets, fromIndex, toIndex) }
          : movement,
      ),
    );
  }

  function deleteSet(movement: DraftMovement, index: number) {
    if (movement.sets.length === 1) {
      showLoggerNotice('An exercise needs at least one set. Remove the exercise instead.');
      return;
    }
    recentRemoval.current = { kind: 'set', key: movement.key, at: Date.now() };
    const deleted = movement.sets[index];
    setMovements((current) =>
      current.map((item) =>
        item.key === movement.key
          ? { ...item, sets: item.sets.filter((_, setIndex) => setIndex !== index) }
          : item,
      ),
    );
    setUndoDeletion({ kind: 'set', movementKey: movement.key, set: deleted, index });
  }

  function removeRestTime(movement: DraftMovement, item: DraftSet) {
    if (!item.rest_seconds) return;
    updateSet(movement.key, item.key, { rest_seconds: null });
  }

  function undoLastDeletion() {
    if (!undoDeletion) return;
    recentRemoval.current = null;
    setMovements((current) =>
      current.map((movement) => {
        if (movement.key !== undoDeletion.movementKey) return movement;
        if (undoDeletion.kind === 'rest') {
          return {
            ...movement,
            sets: movement.sets.map((item) =>
              item.key === undoDeletion.set.key
                ? { ...item, rest_seconds: undoDeletion.set.rest_seconds }
                : item,
            ),
          };
        }
        const sets = [...movement.sets];
        sets.splice(undoDeletion.index, 0, undoDeletion.set);
        return {
          ...movement,
          isComplete: movement.isComplete && sets.every((set) => set.completed),
          sets,
        };
      }),
    );
    setUndoDeletion(null);
  }

  function openSupersetPicker(movementKey: string) {
    setError(null);
    setSupersetPickerKey(movementKey);
  }

  function closeSupersetPicker() {
    setSupersetPickerKey(null);
  }

  function saveSuperset(movementKey: string, partnerKeys: string[]) {
    setMovements((items) => {
      const grouped = applySupersetSelection(items, movementKey, partnerKeys, crypto.randomUUID());
      const groupKey = grouped.find((item) => item.key === movementKey)?.supersetKey;
      return groupKey ? keepSupersetTogether(grouped, groupKey) : grouped;
    });
    closeSupersetPicker();
  }

  function removeSuperset(movementKey: string) {
    setMovements((items) => clearSuperset(items, movementKey));
    closeSupersetPicker();
  }

  function scheduleRestTimerPush(
    timer: NonNullable<typeof activeRestTimerRef.current>,
    endpoint: string,
  ) {
    const delaySeconds = Math.max(1, Math.ceil((timer.endsAt - Date.now()) / 1000));
    timer.serverScheduled = false;
    const request = api
      .scheduleRestTimerNotification({
        endpoint,
        timer_id: timer.id,
        delay_seconds: delaySeconds,
      })
      .then(() => {
        if (activeRestTimerRef.current?.id === timer.id) timer.serverScheduled = true;
      })
      .catch(() => {
        if (activeRestTimerRef.current?.id === timer.id) timer.serverScheduled = false;
      });
    timer.pendingSchedules.add(request);
  }

  function startRestTimer(seconds: number) {
    if (!restTimerEnabled) return;
    const timer = {
      id: crypto.randomUUID(),
      endsAt: Date.now() + seconds * 1000,
      pausedLeft: null,
      serverScheduled: false,
      pendingSchedules: new Set<Promise<void>>(),
    };
    activeRestTimerRef.current = timer;
    setRestDone(null);
    setRestLeft(seconds);
    setRestTotal(seconds);
    setRestHidden(false);
    onRestTimerChange?.(timer.endsAt);
    const endpoint = restNotificationEndpointRef.current;
    if (endpoint) scheduleRestTimerPush(timer, endpoint);
  }

  /** Adds or takes off rest; taking off all of it ends the rest. */
  function adjustRestTimer(deltaSeconds: number) {
    const timer = activeRestTimerRef.current;
    if (!timer) return;
    const left = (timer.pausedLeft ?? restSecondsLeft(timer.endsAt)) + deltaSeconds;
    if (left <= 0) {
      cancelRestTimer();
      return;
    }
    if (timer.pausedLeft !== null) {
      // A paused rest keeps waiting; the change applies when the workout resumes.
      timer.pausedLeft = left;
      setRestLeft(left);
      setRestTotal((total) => Math.max(left, total));
      return;
    }
    timer.endsAt = Date.now() + left * 1000;
    setRestLeft(left);
    // The rest's full length stays put, so the pill's fill moves by the whole 30 seconds.
    setRestTotal((total) => Math.max(left, total));
    onRestTimerChange?.(timer.endsAt);
    // Scheduling again replaces this device's pending "Rest complete" notification.
    const endpoint = restNotificationEndpointRef.current;
    if (endpoint) scheduleRestTimerPush(timer, endpoint);
  }

  /** Stops this device's scheduled "Rest complete" alert for `timer`. */
  const cancelRestTimerPush = useCallback(
    (timer: NonNullable<typeof activeRestTimerRef.current>) => {
      timer.serverScheduled = false;
      const endpoint = restNotificationEndpointRef.current;
      if (!endpoint) return;
      const cancelServerTimer = () =>
        api.cancelRestTimerNotification({ endpoint, timer_id: timer.id });
      void cancelRestTimerPushSchedule(cancelServerTimer, timer.pendingSchedules);
    },
    [],
  );

  const cancelRestTimer = useCallback(() => {
    const timer = activeRestTimerRef.current;
    activeRestTimerRef.current = null;
    setRestLeft(0);
    setRestHidden(false);
    setRestDone(null);
    onRestTimerChange?.(null);
    void dismissRestTimerNotifications().catch(() => undefined);
    if (timer) cancelRestTimerPush(timer);
  }, [onRestTimerChange, cancelRestTimerPush]);

  /** Pausing freezes the workout time and any rest together; the rest alert waits too. */
  function pauseWorkoutTimers() {
    setPause((current) => pauseWorkout(current));
    const timer = activeRestTimerRef.current;
    if (!timer || timer.pausedLeft !== null) return;
    const left = restSecondsLeft(timer.endsAt);
    if (left <= 0) return;
    timer.pausedLeft = left;
    setRestLeft(left);
    onRestTimerChange?.(null);
    cancelRestTimerPush(timer);
  }

  function resumeWorkoutTimers() {
    setPause((current) => resumeWorkout(current));
    const timer = activeRestTimerRef.current;
    if (!timer || timer.pausedLeft === null) return;
    timer.endsAt = Date.now() + timer.pausedLeft * 1000;
    timer.pausedLeft = null;
    setRestLeft(restSecondsLeft(timer.endsAt));
    onRestTimerChange?.(timer.endsAt);
    const endpoint = restNotificationEndpointRef.current;
    if (endpoint) scheduleRestTimerPush(timer, endpoint);
  }

  function toggleWorkoutPause() {
    if (pause.pausedAt === null) pauseWorkoutTimers();
    else resumeWorkoutTimers();
  }

  useEffect(() => {
    if (restTimerEnabled) return;
    cancelRestTimer();
  }, [restTimerEnabled, cancelRestTimer]);

  // A closed workout leaves no rest countdown on the tab bar.
  useEffect(() => () => onRestTimerChange?.(null), [onRestTimerChange]);

  const musclePreferences = useTrainingPreferences().preferences;
  const muscleSetGoal = musclePreferences?.weekly_muscle_set_goal ?? 10;
  const muscleGoals = musclePreferences?.weekly_muscle_set_goals;
  const [weeklySetsUpdate, setWeeklySetsUpdate] = useState<WeeklySetsUpdate | null>(null);
  const weeklySetsUpdateId = useRef(0);
  // Sets added with Add set in this session: ticking one never folds its exercise away.
  const addedSetKeys = useRef(new Set<string>());

  function completeExercise(movement: DraftMovement, isComplete: boolean) {
    const sets = isComplete
      ? completeRemainingSets(movement.exercise.kind, movement.sets)
      : movement.sets;
    if (isComplete && hasUnassignedMachineSets(movement.machinePhotoIds, sets)) {
      setMachineAssignmentError(movement.exercise.name);
      return;
    }
    const gains = initialWorkout
      ? null
      : shelfAfterExerciseComplete(movement, sets, weeklySets, workoutDate, localDate());
    if (gains) setWeeklySetsUpdate({ id: ++weeklySetsUpdateId.current, gains });
    setMovements((current) =>
      current.map((item) =>
        item.key === movement.key
          ? { ...item, isComplete: isComplete && sets.every((set) => set.completed), sets }
          : item,
      ),
    );
  }

  function updateSet(movementKey: string, setKey: string, update: Partial<DraftSet>) {
    const movement = movements.find((item) => item.key === movementKey);
    const currentSet = movement?.sets.find((item) => item.key === setKey);
    if (movement && currentSet?.rest_seconds && update.rest_seconds === null) {
      setUndoDeletion({
        kind: 'rest',
        movementKey,
        set: currentSet,
        index: movement.sets.findIndex((item) => item.key === setKey),
      });
    }
    const { restSeconds, loggingSet, finishesExercise, correctingLoggedSet } = setUpdateEffects(
      movement,
      setKey,
      update,
      Boolean(initialWorkout),
    );
    // In a superset or tri-set, go straight to the next exercise and rest after the round.
    const nextInRound =
      loggingSet && movement?.supersetKey
        ? nextInSupersetRound(
            movements.map((item) =>
              item.key === movementKey
                ? {
                    ...item,
                    sets: item.sets.map((set) =>
                      set.key === setKey ? { ...set, completed: true } : set,
                    ),
                  }
                : item,
            ),
            movementKey,
          )
        : null;
    if (loggingSet && !initialWorkout) tips.event('set-completed');
    if (
      loggingSet &&
      !initialWorkout &&
      movement?.exercise.kind !== 'cardio' &&
      setKindOf({ ...currentSet, ...update }) === 'warmup'
    )
      tips.event('warmup-logged', 'setType');
    if (
      currentSet &&
      setKindOf(currentSet) === 'warmup' &&
      ('set_type' in update || 'warmup' in update) &&
      setKindOf({ ...currentSet, ...update }) !== 'warmup'
    )
      tips.learn('setType');
    if (loggingSet && movement?.exercise.kind === 'cardio')
      tips.event('manual-cardio', 'cardio', 2);
    if (loggingSet && workoutPaused) resumeWorkoutTimers();
    // Ticking the last open set finishes the exercise: a planned exercise folds away and its
    // weekly totals show for all of its sets. A set added by hand keeps the card open.
    const shelf = shelfAfterSetUpdate(
      movement,
      setKey,
      update,
      { loggingSet: loggingSet && !initialWorkout, finishesExercise },
      weeklySets,
      workoutDate,
      localDate(),
    );
    if (shelf === 'hide') setWeeklySetsUpdate(null);
    else if (shelf) setWeeklySetsUpdate({ id: ++weeklySetsUpdateId.current, gains: shelf });
    // Correcting the weight or reps of a logged set also moves the untouched suggestion after it.
    setMovements((current) =>
      current.map((movement) =>
        movement.key === movementKey
          ? movementAfterSetUpdate(movement, setKey, update, {
              finishesExercise,
              suggestNext: loggingSet || correctingLoggedSet,
              addedByHand: addedSetKeys.current.has(setKey),
              workoutBodyweight,
            })
          : movement,
      ),
    );
    if (loggingSet) setRestDone(null);
    if (restSeconds !== null && !nextInRound) {
      restMovementKeyRef.current = movement?.supersetKey
        ? (movements.find((item) => item.supersetKey === movement.supersetKey)?.key ?? movementKey)
        : movementKey;
      startRestTimer(restSeconds);
    }
    if (nextInRound && !initialWorkout) {
      window.requestAnimationFrame(() =>
        [...(movementStackRef.current?.querySelectorAll<HTMLElement>('[data-flip-key]') ?? [])]
          .find((card) => card.dataset.flipKey === nextInRound.key)
          ?.scrollIntoView?.({ block: 'nearest', behavior: motionReduced() ? 'auto' : 'smooth' }),
      );
    }
  }

  const warmupOnlyMovements: WarmupOnlyMovement[] = warmupOnly(movements).map((movement) => ({
    key: movement.key,
    name: movement.exercise.name,
    iconUrl: exerciseIconFor(movement.exercise),
    sets: movement.sets,
  }));

  const tickedSetCount = movements.reduce(
    (total, movement) => total + movement.sets.filter((item) => item.completed).length,
    0,
  );
  // Rows left empty are not sets; only entered ones left unticked need a decision at Finish.
  const untickedSetCount = movements.reduce(
    (total, movement) =>
      total +
      movement.sets.filter(
        (item) => !item.completed && hasRecordedPerformance(movement.exercise.kind, item),
      ).length,
    0,
  );

  function toggleSet(movement: DraftMovement, item: DraftSet) {
    updateSet(movement.key, item.key, { completed: !item.completed });
  }

  /** Adds a set at `position` (the end by default), copying the set above it, or set 1 at the start. */
  function addSet(movement: DraftMovement, position?: number) {
    if (readdsRemovedSet(recentRemoval.current, movement.key, Date.now()))
      tips.event('re-add-set', 'reorder');
    recentRemoval.current = null;
    setMovements((current) =>
      current.map((item) => {
        if (item.key !== movement.key) return item;
        const key = crypto.randomUUID();
        markSetAdded(key);
        addedSetKeys.current.add(key);
        return movementWithAddedSet(item, defaultRest, key, position);
      }),
    );
  }

  function removeMovement(key: string) {
    recentRemoval.current = { kind: 'exercise', key, at: Date.now() };
    setMovements((current) => current.filter((item) => item.key !== key));
  }

  function openExercisePicker() {
    setSwitchingMovementKey(null);
    setPickerOpen(true);
  }

  /** What the finish check and the saved workout are built from. */
  function finishState(): WorkoutFinishState {
    return {
      movements,
      name,
      category,
      customTypeId,
      workoutTypeExplicit,
      selectedType,
      typeOptions,
      types: workoutTypes.types,
      typesLoading: workoutTypes.loading,
      editing: Boolean(initialWorkout),
      resumedWorkoutId,
      startedAt,
      previousDurationMinutes,
      durationOverrideMinutes,
      pause,
      editedDurationMinutes,
      startTime,
      endTime,
      clientSessionId,
      baseRevision,
      workoutDate,
      notes,
    };
  }

  /** Checks whether the workout can be saved now, without saving it. */
  function checkFinish(inactiveEndAt?: number) {
    return checkWorkoutFinish(finishState(), inactiveEndAt);
  }

  /** Opens the finish confirmation, explaining there what must change before it can save. */
  function openFinishConfirmation() {
    const check = checkFinish();
    if (check.kind === 'machines') {
      setMachineAssignmentError(check.exercise);
      return;
    }
    if (check.kind === 'ready' && warmupOnlyMovements.length) {
      // The warm-up reminder doubles as the finish confirmation.
      setWarmupReviewOpen(true);
      return;
    }
    // With every entered set ticked there is nothing to decide: finish, with Undo on Home.
    if (check.kind === 'ready' && untickedSetCount === 0) {
      void finishWorkout();
      return;
    }
    setFinishBlocker(check.kind === 'blocked' ? check.message : null);
    setFinishConfirmationOpen(true);
  }

  function confirmFinish() {
    const check = checkFinish();
    if (check.kind === 'blocked') {
      setFinishBlocker(check.message);
      return;
    }
    setFinishConfirmationOpen(false);
    void finishWorkout();
  }

  /** Resolves true once the workout is handed over for saving. */
  async function finishWorkout(inactiveEndAt?: number): Promise<boolean> {
    if (savingRef.current || preparingFinishRef.current) return false;
    if (!initialWorkout && !isCurrentDraft()) return false;
    let sharedFields: Partial<WorkoutInput> = {};
    if (!initialWorkout) {
      preparingFinishRef.current = true;
      try {
        persistDraftRef.current();
        sharedFields = await sharedWorkoutFinishFields();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Could not sync this workout.');
        return false;
      } finally {
        preparingFinishRef.current = false;
      }
    }
    const check = checkFinish(inactiveEndAt);
    if (check.kind === 'machines') {
      setMachineAssignmentError(check.exercise);
      return false;
    }
    if (check.kind === 'blocked') {
      setError(check.message);
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      cancelRestTimer();
      await onSave({ ...sharedFields, ...finishedWorkoutInput(check) });
      return true;
    } catch (saveError) {
      savingRef.current = false;
      setError(saveError instanceof Error ? saveError.message : 'Could not save the workout.');
      setSaving(false);
      return false;
    }
  }

  /** The workout a ready check saves, without the shared-draft fields added when finishing. */
  function finishedWorkoutInput(check: Extract<WorkoutFinishCheck, { kind: 'ready' }>) {
    return finishedWorkoutInputRule(finishState(), check);
  }
  /** A workout left running ends at its last activity, not at the cutoff that noticed it. */
  const inactiveEndAt = () =>
    inactiveWorkoutEndAt(startedAt, lastActiveAtRef.current, inactiveFinishAtRef.current);
  // What Save in the inactive-workout prompt would save, prepared with each draft revision so
  // auto-save can save it on the server after the app is closed.
  autoSaveWorkoutRef.current = () => {
    if (initialWorkout) return null;
    const check = checkFinish(inactiveEndAt());
    return check.kind === 'ready' ? finishedWorkoutInput(check) : null;
  };

  const loggedSetCount = initialWorkout ? 0 : loggedSetCountRule(movements);
  hasLoggedSetRef.current = loggedSetCount > 0;

  useEffect(() => {
    // A changed auto-save time moves the cutoff of the workout in progress too.
    if (autoSaveMinutesRef.current === autoSaveMinutes) return;
    autoSaveMinutesRef.current = autoSaveMinutes;
    if (initialWorkout) return;
    inactiveFinishAtRef.current = inactiveWorkoutFinishAt(startedAt, lastActiveAtRef.current);
    persistDraftRef.current();
  }, [autoSaveMinutes, initialWorkout, startedAt]);

  function continueInactiveWorkout() {
    const now = Date.now();
    lastActiveAtRef.current = now;
    inactiveFinishAtRef.current = inactiveWorkoutFinishAt(startedAt, now);
    persistDraftRef.current();
    setInactivePromptOpen(false);
  }

  useEffect(() => {
    if (initialWorkout) return;
    const checkForInactiveWorkout = () => {
      if (!hasLoggedSetRef.current || savingRef.current) return;
      if (Date.now() >= inactiveFinishAtRef.current) setInactivePromptOpen(true);
    };
    checkForInactiveWorkout();
    const interval = window.setInterval(checkForInactiveWorkout, 30_000);
    window.addEventListener('focus', checkForInactiveWorkout);
    window.addEventListener('online', checkForInactiveWorkout);
    document.addEventListener('visibilitychange', checkForInactiveWorkout);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', checkForInactiveWorkout);
      window.removeEventListener('online', checkForInactiveWorkout);
      document.removeEventListener('visibilitychange', checkForInactiveWorkout);
    };
  }, [initialWorkout, movements, startedAt]);

  const editedDurationHours = Math.floor(editedDurationMinutes / 60);
  const editedDurationRemainder = editedDurationMinutes % 60;
  const overrideDurationHours =
    durationOverrideMinutes === null ? '' : Math.floor(durationOverrideMinutes / 60);
  const overrideDurationRemainder =
    durationOverrideMinutes === null ? '' : durationOverrideMinutes % 60 || '';
  const updateDurationOverride = (hoursValue: string, minutesValue: string) => {
    if (hoursValue === '' && minutesValue === '') {
      setDurationOverrideMinutes(null);
      return;
    }
    const hours = Math.min(24, Math.max(0, Math.floor(Number(hoursValue) || 0)));
    const minutes = Math.min(59, Math.max(0, Math.floor(Number(minutesValue) || 0)));
    setDurationOverrideMinutes(Math.min(1440, Math.max(1, hours * 60 + minutes)));
  };
  const hasCompleteTimeRange = Boolean(startTime && endTime);
  const updateWorkoutTimes = (nextStart: string, nextEnd: string) => {
    setStartTime(nextStart);
    setEndTime(nextEnd);
    const duration = workoutDurationMinutes(nextStart, nextEnd);
    if (duration !== null) setEditedDurationMinutes(duration);
  };
  const completedSets = movements.flatMap((movement) =>
    movement.sets.filter((item) => item.completed),
  );
  const completedReps = completedSets.reduce((total, item) => total + (item.reps ?? 0), 0);
  const displayedDurationSeconds = initialWorkout
    ? editedDurationMinutes * 60
    : durationOverrideMinutes !== null
      ? durationOverrideMinutes * 60
      : previousDurationMinutes * 60 + elapsed;
  const openNameEditor = () => {
    setNameDraft(name);
    setNameEditorOpen(true);
  };

  const liveIdentity = liveWorkoutIdentity(finishState());

  const supersetLabel = (groupKey: string | null) => {
    if (!groupKey) return null;
    const names = movements
      .filter((item) => item.supersetKey === groupKey)
      .map((item) => item.exercise.name);
    return `${supersetGroupName(names.length)} · ${names.join(' + ')}`;
  };

  useEffect(() => {
    if (initialWorkout) return;
    onLiveSummaryChange({
      name: liveIdentity.name,
      loggedSets: completedSets.length,
      previousDurationMinutes,
      durationOverrideMinutes,
      paused: workoutPaused,
    });
  }, [
    initialWorkout,
    onLiveSummaryChange,
    liveIdentity.name,
    completedSets.length,
    previousDurationMinutes,
    durationOverrideMinutes,
    workoutPaused,
  ]);

  const revealDetails = (selector: string) => {
    setDetailsOpen(true);
    window.requestAnimationFrame(() => {
      const field = detailsRef.current?.querySelector<HTMLElement>(selector);
      field?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      field?.focus({ preventScroll: true });
    });
  };

  const restActive = restTimerEnabled && restLeft > 0;
  // A live rest shows the rest pill, or the bottom-edge notch while hidden.
  const showTimerDock = !initialWorkout && restActive;
  const showRestDone = !initialWorkout && restTimerEnabled && !restActive && restDone !== null;
  const dockSpacing = showRestDone
    ? 'has-rest-notch'
    : !showTimerDock
      ? ''
      : restHidden
        ? 'has-rest-notch'
        : 'has-rest-pill';
  const restNextSet = restDone
    ? nextSetAfterRest(movements, restDone.movementKey, weightUnit)
    : null;
  // While training, toasts sit at the bottom above the rest pill or notch and the weekly sets
  // shelf, so they never cover the workout's header, timer or Finish.
  const toastBottom = weeklySetsUpdate
    ? dockSpacing
      ? '9.25rem'
      : '5.75rem'
    : dockSpacing === 'has-rest-pill'
      ? '5rem'
      : dockSpacing === 'has-rest-notch'
        ? '4rem'
        : '1rem';
  const visibleInForeground = screenVisible && inForeground;
  useToastPlacement(
    visibleInForeground ? 'bottom' : 'top',
    `calc(${toastBottom} + env(safe-area-inset-bottom))`,
  );
  // The workout's toasts belong to its screen; leaving it ends them, as their countdown would.
  useEffect(() => {
    if (screenVisible) return;
    setUndoDeletion(null);
    setSwapUndo(null);
    setLoggerNotice(null);
    setPrToastEntries([]);
  }, [screenVisible]);

  // The tab bar's bell rings while a finished rest waits, for as long as the workout is live.
  const finishedRestAt = showRestDone ? restDone.endedAt : null;
  useEffect(() => {
    onRestDoneChange?.(finishedRestAt);
  }, [finishedRestAt, onRestDoneChange]);
  useEffect(() => () => onRestDoneChange?.(null), [onRestDoneChange]);

  // Tapping the ringing bell on the tab bar opens the workout at the next set.
  const handledRestGoRequest = useRef(restGoRequest);
  useEffect(() => {
    if (restGoRequest === handledRestGoRequest.current) return;
    handledRestGoRequest.current = restGoRequest;
    goToRestNextSet();
    // Only a new request from the bell; the function changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restGoRequest]);

  /** Opens the workout if it is minimised and brings the set after the finished rest into view. */
  function goToRestNextSet() {
    setRestDone(null);
    if (!screenVisible) onShow();
    if (!restNextSet) return;
    const { setKey, movementKey } = restNextSet;
    // Wait for a minimised workout to show before scrolling within it.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const stack = movementStackRef.current;
        const find = (selector: string, matches: (element: HTMLElement) => boolean) =>
          [...(stack?.querySelectorAll<HTMLElement>(selector) ?? [])].find(matches);
        const target =
          find('[data-set-key]', (row) => row.dataset.setKey === setKey) ??
          find('[data-flip-key]', (card) => card.dataset.flipKey === movementKey);
        target?.scrollIntoView?.({
          block: 'center',
          behavior: motionReduced() ? 'auto' : 'smooth',
        });
      }),
    );
  }

  return (
    <section
      className={`logger-screen content-page${!initialWorkout ? ' is-live-workout' : ''} ${dockSpacing}`}
      inert={saving}
    >
      {prConfettiBurst > 0 &&
        (motionReduced() ? null : (
          <ConfettiBurst key={prConfettiBurst} onComplete={() => setPrConfettiBurst(0)} />
        ))}
      {!initialWorkout ? (
        <LiveWorkoutHeader
          name={liveIdentity.name}
          dateLabel={workoutDate < localDate() ? shortDate(workoutDate) : null}
          durationLabel={
            workoutPaused
              ? formatDuration(displayedDurationSeconds)
              : `Live ${formatDuration(displayedDurationSeconds)}`
          }
          loggedSets={completedSets.length}
          paused={workoutPaused}
          menuButtonRef={deleteButtonRef}
          onMinimise={onClose}
          onRename={openNameEditor}
          onAdjustTime={() => setTimeEditorOpen(true)}
          onAddNote={() => revealDetails('.workout-notes textarea')}
          workoutTypes={typeOptions.map((type) => ({
            id: type.id,
            name: type.archived ? `${type.name} (removed)` : type.name,
            color: workoutTypeColor(type, categoryColors),
          }))}
          selectedTypeId={customTypeId ?? category}
          typesLoading={workoutTypes.loading}
          onChooseType={readOnly ? undefined : chooseWorkoutType}
          onTogglePause={toggleWorkoutPause}
          onStartRest={restTimerEnabled ? startRestTimer : undefined}
          restRunning={restActive}
          onDiscard={() => setDeleteConfirmationOpen(true)}
          discardLabel={resumedWorkoutId ? 'Discard session' : 'Discard workout'}
          saving={saving}
          onFinish={openFinishConfirmation}
          trainTogetherActive={Boolean(trainTogether && trainTogether.partners.length > 0)}
          onTrainTogether={
            trainTogether && trainTogether.partners.length === 0 ? onOpenTrainSheet : undefined
          }
          onLeaveTrainTogether={
            trainTogether && trainTogether.partners.length > 0
              ? (onLeaveTrainSession ?? (() => void trainTogether.leave()))
              : undefined
          }
          deck={
            trainTogether &&
            trainTogether.session &&
            trainTogether.partners.length > 0 &&
            onOpenTrainSheet &&
            onLogForPartner ? (
              <TrainTogetherDeck
                session={trainTogether.session}
                partners={trainTogether.partners}
                palettes={trainPalettes}
                weightUnit={weightUnit}
                recentlyJoinedIds={trainTogether.recentlyJoinedIds}
                onLogForPartner={onLogForPartner}
                onOpenSession={onOpenTrainSheet}
              />
            ) : undefined
          }
        />
      ) : (
        <OverlayScreenHeader
          title={liveIdentity.name}
          subtitle={
            <WorkoutHeaderMeta
              durationLabel={
                initialWorkout
                  ? `${readOnly ? 'View only \u00b7 ' : ''}${formatDuration(displayedDurationSeconds)}`
                  : workoutPaused
                    ? formatDuration(elapsed)
                    : `Live ${formatDuration(elapsed)}`
              }
              paused={workoutPaused}
              onTogglePause={initialWorkout || readOnly ? undefined : toggleWorkoutPause}
            />
          }
          onBack={onClose}
          onTitleClick={readOnly ? undefined : openNameEditor}
          titleActionLabel="Edit workout name"
          actions={
            readOnly ? undefined : (
              <>
                <button
                  ref={deleteButtonRef}
                  className="overlay-header-action delete"
                  type="button"
                  onClick={() => setDeleteConfirmationOpen(true)}
                  aria-label={resumedWorkoutId ? 'Discard resumed session' : 'Delete workout'}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" />
                  </svg>
                </button>
                <button
                  className="overlay-header-save"
                  type="button"
                  disabled={saving}
                  aria-busy={saving}
                  onClick={() => void finishWorkout()}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )
          }
        />
      )}

      {recommendation &&
        !recommendation.is_rest_day &&
        !recommendation.needs_split_update &&
        !workoutTypes.types.find(
          (type) => type.id === (recommendation.workout_type?.id ?? recommendation.category),
        )?.archived &&
        !initialWorkout &&
        !template &&
        !startCategory &&
        movements.length === 0 && (
          <section className="workout-recommendation panel">
            <div className="recommendation-heading">
              <div>
                <p className="section-kicker">RECOMMENDED NEXT</p>
                <h2>{recommendation.session_name.replace(' workout', '')}</h2>
              </div>
              <span
                style={{
                  background:
                    recommendation.workout_type?.color ?? categoryColors[recommendation.category],
                }}
              />
            </div>
            <p>{recommendation.reason}</p>
            <div className="frequency-chips" aria-label="Seven-day muscle frequency">
              {recommendation.muscle_frequency.map((item) => (
                <span
                  className={
                    item.sessions_last_7_days < item.target_sessions
                      ? 'needs-attention'
                      : 'on-target'
                  }
                  key={item.muscle_group}
                >
                  {item.muscle_group}{' '}
                  <b>
                    {item.sessions_last_7_days}/{item.target_sessions}
                  </b>
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setCategory(recommendation.category);
                setCustomTypeId(
                  recommendation.workout_type?.is_custom ? recommendation.workout_type.id : null,
                );
                setWorkoutTypeExplicit(true);
                setName(recommendation.session_name);
              }}
            >
              Use {recommendation.session_name}
            </button>
          </section>
        )}

      <div
        className={
          !initialWorkout &&
          trainTogether &&
          trainTogether.partners.length === 0 &&
          onOpenTrainSheet
            ? 'tt-utility-row'
            : undefined
        }
      >
        <details
          ref={detailsRef}
          className="workout-details-disclosure"
          open={detailsOpen}
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        >
          <summary>
            Workout details <Icon name="chevron-down" />
          </summary>
          <section
            className="workout-details workout-combined-summary panel"
            aria-label="Workout summary and notes"
          >
            <div className="workout-summary-fields">
              <div className="details-row">
                <label>
                  Date
                  <input
                    type="date"
                    value={workoutDate}
                    disabled={readOnly}
                    onChange={(event) => setWorkoutDate(event.target.value)}
                  />
                </label>
                <label>
                  Workout type
                  <select
                    value={customTypeId ?? category}
                    onChange={(event) => chooseWorkoutType(event.target.value)}
                    disabled={readOnly || workoutTypes.loading}
                  >
                    {!typeOptions.some((type) => type.id === (customTypeId ?? category)) && (
                      <option value={customTypeId ?? category} disabled>
                        Choose a workout type
                      </option>
                    )}
                    {typeOptions.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                        {type.archived ? ' (removed)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {initialWorkout && !readOnly && (
                  <fieldset
                    className={`workout-duration-editor${initialWorkout ? '' : ' live-workout-duration-editor'}`}
                    aria-label={initialWorkout ? undefined : 'Workout duration'}
                  >
                    {initialWorkout && <legend>Workout timing</legend>}
                    {initialWorkout && !readOnly && (
                      <>
                        <label>
                          Start time
                          <input
                            type="time"
                            value={startTime}
                            onChange={(event) => updateWorkoutTimes(event.target.value, endTime)}
                            aria-label="Workout start time"
                          />
                        </label>
                        <label>
                          End time
                          <input
                            type="time"
                            value={endTime}
                            onChange={(event) => updateWorkoutTimes(startTime, event.target.value)}
                            aria-label="Workout end time"
                          />
                        </label>
                      </>
                    )}
                    <label>
                      Duration hours
                      <input
                        type="number"
                        min="0"
                        max="24"
                        inputMode="numeric"
                        disabled={Boolean(initialWorkout && hasCompleteTimeRange)}
                        value={initialWorkout ? editedDurationHours || '' : overrideDurationHours}
                        placeholder="0"
                        onChange={(event) => {
                          if (!initialWorkout) {
                            updateDurationOverride(
                              event.target.value,
                              String(overrideDurationRemainder),
                            );
                            return;
                          }
                          const hours = Number.isNaN(event.target.valueAsNumber)
                            ? 0
                            : event.target.valueAsNumber;
                          setEditedDurationMinutes(
                            Math.min(
                              1440,
                              Math.max(0, Math.floor(hours)) * 60 + editedDurationRemainder,
                            ),
                          );
                        }}
                        aria-label="Workout duration hours"
                      />
                    </label>
                    <label>
                      Duration minutes
                      <input
                        type="number"
                        min="0"
                        max="59"
                        inputMode="numeric"
                        disabled={Boolean(initialWorkout && hasCompleteTimeRange)}
                        value={
                          initialWorkout ? editedDurationRemainder || '' : overrideDurationRemainder
                        }
                        placeholder="0"
                        onChange={(event) => {
                          if (!initialWorkout) {
                            updateDurationOverride(
                              String(overrideDurationHours),
                              event.target.value,
                            );
                            return;
                          }
                          const minutes = Number.isNaN(event.target.valueAsNumber)
                            ? 0
                            : event.target.valueAsNumber;
                          setEditedDurationMinutes(
                            Math.min(
                              1440,
                              editedDurationHours * 60 +
                                Math.min(59, Math.max(0, Math.floor(minutes))),
                            ),
                          );
                        }}
                        aria-label="Workout duration minutes"
                      />
                    </label>
                    {(!initialWorkout || hasCompleteTimeRange) && (
                      <small className="workout-timing-help">
                        {initialWorkout
                          ? `${formatWorkoutTimeRange(startTime, endTime)} · duration calculated automatically`
                          : resumedWorkoutId
                            ? `${previousDurationMinutes} min already logged. The live timer started when you resumed; the gap is excluded. Change these fields only to correct the total duration.`
                            : 'Leave both blank to use the live timer. Change them only if the timer is wrong.'}
                      </small>
                    )}
                  </fieldset>
                )}
              </div>
              <div className="workout-summary-metrics" aria-label="Workout totals">
                <span>
                  <small>Time</small>
                  <strong>{formatDuration(displayedDurationSeconds)}</strong>
                </span>
                {workoutBodyweight !== null && (
                  <span>
                    <small>BW {weightUnit}</small>
                    <strong>{formatWeightNumber(workoutBodyweight, weightUnit)}</strong>
                  </span>
                )}
                <span>
                  <small>Sets</small>
                  <strong>{completedSets.length}</strong>
                </span>
                <span>
                  <small>Reps</small>
                  <strong>{completedReps}</strong>
                </span>
              </div>
              <label className="workout-notes">
                Workout notes
                <textarea
                  readOnly={readOnly}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Workout notes…"
                  rows={3}
                />
              </label>
            </div>
            <WorkoutNavigationArrows navigation={navigation} />
          </section>
        </details>
        {!initialWorkout &&
          trainTogether &&
          trainTogether.partners.length === 0 &&
          onOpenTrainSheet && (
            <TrainTogetherEntryButton
              waitingSeconds={trainTogether.inviteSeconds}
              onClick={onOpenTrainSheet}
            />
          )}
      </div>

      {error && <DismissibleInlineError message={error} onDismiss={() => setError(null)} />}

      {readOnly && initialWorkout ? (
        <BrowsedWorkoutDetails
          workout={initialWorkout}
          bodyweight={workoutBodyweight}
          categoryColor={categoryColors[initialWorkout.category]}
        />
      ) : (
        <div className="movement-stack" ref={movementStackRef}>
          {movements.map((movement, movementIndex) => (
            <MovementCard
              skipHighRepWarning={skipHighRepWarning}
              onSkipHighRepWarning={() => setSkipHighRepWarning(true)}
              key={movement.key}
              movement={movement}
              showRestTimes={showRestTimes}
              bodyweight={workoutBodyweight}
              number={movementIndex + 1}
              prBadges={prBadges.get(movement.key) ?? new Map()}
              supersetLabel={supersetLabel(movement.supersetKey)}
              supersetUpNext={!initialWorkout && isSupersetUpNext(movements, movement.key)}
              paceStrip={
                !initialWorkout && trainTogether && trainTogether.partners.length > 0 ? (
                  <TrainTogetherPaceStrip
                    partners={trainTogether.partners}
                    palettes={trainPalettes}
                    myExerciseId={movement.exercise.id}
                    weightUnit={weightUnit}
                  />
                ) : undefined
              }
              history={recentExerciseHistory(
                historicalWorkouts.filter((workout) => workout.workout_date <= workoutDate),
                movement.exercise.id,
                initialWorkout?.id ?? resumedWorkoutId ?? undefined,
                Number.POSITIVE_INFINITY,
                olderHistory?.get(movement.exercise.id)?.latest ?? null,
              )}
              onExerciseHistory={() => onExerciseHistory(movement.exercise.id)}
              onNotesChange={
                readOnly
                  ? undefined
                  : (notes) =>
                      setMovements((items) =>
                        items.map((item) =>
                          item.key === movement.key ? { ...item, notes } : item,
                        ),
                      )
              }
              onExerciseComplete={(isComplete) => completeExercise(movement, isComplete)}
              onUpdateSet={(setKey, update) => updateSet(movement.key, setKey, update)}
              onToggleSet={(item) => toggleSet(movement, item)}
              onAddSet={() => addSet(movement)}
              onInsertSet={(position) => addSet(movement, position)}
              onSwitch={() => setSwapSheetMovementKey(movement.key)}
              machineTipEligible={machineTipEligible(movement.exercise, historicalWorkouts)}
              onRemove={() => removeMovement(movement.key)}
              onMoveUp={() => moveMovement(movementIndex, -1)}
              onMoveDown={() => moveMovement(movementIndex, 1)}
              canMoveUp={movementIndex > 0}
              canMoveDown={movementIndex < movements.length - 1}
              onMoveSet={(fromIndex, toIndex) => moveSet(movement.key, fromIndex, toIndex)}
              onDeleteSet={(index) => deleteSet(movement, index)}
              onRemoveRestTime={(item) => removeRestTime(movement, item)}
              onSuperset={() => openSupersetPicker(movement.key)}
              onMachinePhotos={(machinePhotoIds, machineSettings, chosen) =>
                setMovements((current) =>
                  current.map((item) =>
                    item.key === movement.key
                      ? movementWithMachines(
                          item,
                          machinePhotoIds,
                          machineSettings,
                          Boolean(chosen),
                        )
                      : item,
                  ),
                )
              }
              onMachineSettings={(machineSettings) =>
                setMovements((current) =>
                  current.map((item) =>
                    item.key === movement.key ? { ...item, machineSettings } : item,
                  ),
                )
              }
              onSuggestedSets={(previous) =>
                setMovements((current) =>
                  current.map((item) =>
                    item.key === movement.key
                      ? {
                          ...item,
                          sets: withSuggestedSets(item.sets, previous, item.exercise.kind),
                        }
                      : item,
                  ),
                )
              }
            />
          ))}
        </div>
      )}

      {visibleInForeground && prToastEntries.length > 0 && (
        <Toast
          id={prToastId}
          variant="celebrate"
          message={prToastEntries.map((entry) => entry.labels.join(' + ')).join(', ')}
          lines={prToastLines(prToastEntries, weightUnit)}
          dismissLabel="Dismiss personal record popup"
          onDismiss={closePrToast}
        />
      )}
      {visibleInForeground && loggerNotice && (
        <Toast
          id={loggerNotice.id}
          variant="warning"
          message={loggerNotice.message}
          dismissLabel="Dismiss notice"
          onDismiss={() => setLoggerNotice(null)}
        />
      )}
      {visibleInForeground && swapUndo && (
        <Toast
          id={swapUndo.id}
          message={`Swapped to ${swapUndo.exerciseName}`}
          duration="quick"
          action={{ label: 'Undo', run: undoSwap }}
          dismissLabel="Dismiss swap notification"
          onDismiss={() => setSwapUndo(null)}
        />
      )}
      {visibleInForeground && undoDeletion && (
        <Toast
          id={`${undoDeletion.kind}:${undoDeletion.set.key}`}
          message={undoDeletion.kind === 'rest' ? 'Rest time removed' : 'Set deleted'}
          duration="quick"
          action={{ label: 'Undo', run: undoLastDeletion }}
          dismissLabel="Dismiss deletion notification"
          onDismiss={() => setUndoDeletion(null)}
        />
      )}
      {showTimerDock && (
        <WorkoutTimerDock
          restSeconds={restLeft}
          restTotal={restTotal}
          restHidden={restHidden}
          paused={workoutPaused}
          onTogglePause={toggleWorkoutPause}
          onAdjust={adjustRestTimer}
          onHide={() => setRestHidden(true)}
          onShow={() => setRestHidden(false)}
          onEnd={cancelRestTimer}
          joined={Boolean(weeklySetsUpdate)}
        />
      )}
      {/* Minimised, the tab bar's Start button rings instead. */}
      {showRestDone && visibleInForeground && (
        <RestDoneBell endedAt={restDone.endedAt} next={restNextSet} onGo={goToRestNextSet} />
      )}
      {weeklySetsUpdate && (
        <WeeklySetsShelf
          update={weeklySetsUpdate}
          goal={muscleSetGoal}
          goals={muscleGoals}
          placement={
            showRestDone ? 'notch' : !showTimerDock ? 'alone' : restHidden ? 'notch' : 'pill'
          }
          onDismiss={() => setWeeklySetsUpdate(null)}
        />
      )}
      {!readOnly && (
        <div className="live-workout-actions">
          <button
            className="add-exercise-button pulse-button tonal block"
            type="button"
            onClick={openExercisePicker}
          >
            ＋ Add exercise
          </button>
          {initialWorkout && (
            <button
              className="primary-action finish-workout-bottom"
              disabled={saving}
              onClick={() => void finishWorkout()}
            >
              {saving ? 'Saving…' : 'Save workout'}
            </button>
          )}
        </div>
      )}

      {inForeground && inactivePromptOpen && !initialWorkout && !deleteConfirmationOpen && (
        <InactiveWorkoutDialog
          name={liveIdentity.name}
          startedAt={startedAt}
          endedAt={inactiveEndAt()}
          loggedSets={loggedSetCount}
          resuming={Boolean(resumedWorkoutId)}
          saving={saving}
          onSave={() => {
            void finishWorkout(inactiveEndAt()).then((saved) => {
              if (saved) return;
              // Whatever blocked the save is explained on the workout screen.
              continueInactiveWorkout();
              onShow();
            });
          }}
          onResume={() => {
            continueInactiveWorkout();
            onShow();
          }}
          onDiscard={() => setDeleteConfirmationOpen(true)}
          onClose={continueInactiveWorkout}
        />
      )}

      {inForeground && discardChangesDialog}

      {inForeground && deleteConfirmationOpen && (
        <WorkoutCloseDialog
          editing={Boolean(initialWorkout)}
          resuming={Boolean(resumedWorkoutId)}
          onCancel={() => {
            setDeleteConfirmationOpen(false);
            window.requestAnimationFrame(() => deleteButtonRef.current?.focus());
          }}
          onConfirm={() => {
            cancelRestTimer();
            onDelete();
          }}
        />
      )}

      {inForeground && machineAssignmentError && (
        <PopupDialog
          title="Assign sets to machines"
          className="machine-assignment-dialog"
          onClose={() => setMachineAssignmentError(null)}
          actions={
            <button
              type="button"
              className="popup-primary-action"
              autoFocus
              onClick={() => {
                setMachineAssignmentError(null);
                window.requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLSelectElement>('.set-machine-select[data-unassigned="true"]')
                    ?.focus(),
                );
              }}
            >
              Choose machines
            </button>
          }
        >
          <p>
            {machineAssignmentError} has multiple machines pinned. Choose a machine beneath each
            completed set before finishing the exercise or saving the workout, so its weights and
            progress are recorded against the right machine.
          </p>
        </PopupDialog>
      )}

      {inForeground && warmupReviewOpen && warmupOnlyMovements.length > 0 && (
        <WarmupOnlyFinishDialog
          movements={warmupOnlyMovements}
          weightUnit={weightUnit}
          saving={saving}
          onKeepWorkingOut={() => setWarmupReviewOpen(false)}
          onFinishAnyway={() => {
            setWarmupReviewOpen(false);
            void finishWorkout();
          }}
        />
      )}

      {inForeground && timeEditorOpen && (
        <WorkoutTimeEditor
          elapsedSeconds={workoutTimeSoFarSeconds(elapsed, previousDurationMinutes)}
          savedMinutes={previousDurationMinutes}
          onClose={() => setTimeEditorOpen(false)}
          onSave={(seconds) => {
            // A corrected clock replaces a fixed total kept from an earlier finish attempt. It is
            // the whole workout's time: a resumed workout's saved minutes are already in it.
            setDurationOverrideMinutes(null);
            setPause((current) =>
              withElapsedSeconds(
                current,
                startedAt,
                correctedSessionSeconds(seconds, previousDurationMinutes),
              ),
            );
            setTimeEditorOpen(false);
          }}
        />
      )}
      {inForeground && finishConfirmationOpen && (
        <PopupDialog
          title={finishBlocker ? "Can't finish yet" : 'Finish workout?'}
          size="compact"
          className="workout-finish-dialog"
          onClose={() => setFinishConfirmationOpen(false)}
          actionsClassName="workout-finish-actions"
          actions={
            <>
              <button
                type="button"
                className={finishBlocker ? 'popup-primary-action' : undefined}
                autoFocus
                onClick={() => setFinishConfirmationOpen(false)}
              >
                Keep working out
              </button>
              {!finishBlocker && (
                <button
                  type="button"
                  className="popup-primary-action"
                  disabled={saving}
                  onClick={confirmFinish}
                >
                  Finish workout
                </button>
              )}
            </>
          }
        >
          {finishBlocker ? (
            <p className="inline-error workout-finish-blocker" role="alert">
              {finishBlocker}
            </p>
          ) : (
            <p className="workout-finish-summary">
              <strong>
                {tickedSetCount} of {tickedSetCount + untickedSetCount} sets ticked
              </strong>
            </p>
          )}
        </PopupDialog>
      )}

      {inForeground && nameEditorOpen && (
        <WorkoutNameDialog
          value={nameDraft}
          fallbackName={`${selectedType.name} workout`}
          onChange={setNameDraft}
          onCancel={() => setNameEditorOpen(false)}
          onSave={() => {
            setName(nameDraft.trim());
            setNameEditorOpen(false);
          }}
        />
      )}

      {inForeground && swapSheetMovement && (
        <ExerciseSwapSheet
          key={swapSheetMovement.key}
          exercise={swapSheetMovement.exercise}
          plannedSetCount={swapSheetMovement.sets.filter((item) => !item.completed).length}
          loggedSetCount={swapSheetMovement.sets.filter((item) => item.completed).length}
          exercises={exercises}
          excludedIds={movements.map((item) => item.exercise.id)}
          recentExerciseIds={recentExerciseIds}
          lastDoneDates={lastDoneDates}
          onChoose={(replacement) => {
            setSwapSheetMovementKey(null);
            swapExercise(swapSheetMovement.key, replacement);
          }}
          onBrowseAll={() => {
            setSwapSheetMovementKey(null);
            setSwitchingMovementKey(swapSheetMovement.key);
            setPickerOpen(true);
          }}
          onClose={() => setSwapSheetMovementKey(null)}
        />
      )}

      {inForeground && pickerOpen && (
        <ExercisePicker
          key={switchingMovementKey ? `switch-${switchingMovementKey}` : 'add-exercises'}
          exercises={exercises}
          excludedIds={movements.map((item) => item.exercise.id)}
          recentExerciseIds={recentExerciseIds}
          lastDoneDates={lastDoneDates}
          onFavoriteChange={onExerciseFavorite}
          onCreateExercise={onCreateExercise}
          singleSelect={switchingMovementKey !== null}
          workoutCategory={liveIdentity.category}
          onChoose={(selected, machineChoices) =>
            switchingMovementKey
              ? switchExercise(selected, machineChoices)
              : addExercises(selected, false, machineChoices)
          }
          onCreateSuperset={(selected, machineChoices) =>
            addExercises(selected, true, machineChoices)
          }
          onClose={closeExercisePicker}
        />
      )}

      {inForeground && supersetPickerKey && (
        <SupersetPicker
          key={supersetPickerKey}
          movementKey={supersetPickerKey}
          movements={movements}
          onClose={closeSupersetPicker}
          onSave={(partnerKeys) => saveSuperset(supersetPickerKey, partnerKeys)}
          onRemove={() => removeSuperset(supersetPickerKey)}
        />
      )}
    </section>
  );
}

function DismissibleInlineError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div className="inline-error inline-error-dismissible" role="alert">
      <span>{message}</span>
      <button
        className="inline-error-dismiss"
        type="button"
        aria-label="Dismiss error"
        onClick={onDismiss}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

function WorkoutCloseDialog({
  editing,
  resuming,
  onCancel,
  onConfirm,
}: {
  editing: boolean;
  resuming: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <PopupDialog
      title={
        editing
          ? 'Delete this saved workout?'
          : resuming
            ? 'Discard this resumed session?'
            : 'Discard this workout?'
      }
      size="compact"
      className="workout-finish-dialog workout-discard-dialog"
      onClose={onCancel}
      actionsClassName="workout-finish-actions"
      actions={
        <>
          <button type="button" autoFocus onClick={onCancel}>
            Keep workout
          </button>
          <button
            type="button"
            className="popup-primary-action is-danger discard-workout-button"
            onClick={onConfirm}
          >
            {editing ? 'Delete workout' : resuming ? 'Discard session' : 'Discard workout'}
          </button>
        </>
      }
    >
      <p>
        {editing
          ? 'This workout will be removed from your history.'
          : resuming
            ? 'Changes made since resuming will be lost. The saved workout will stay in History.'
            : 'Your active workout, sets, and notes will be permanently removed. This cannot be undone.'}
      </p>
    </PopupDialog>
  );
}

function MovementCard({
  skipHighRepWarning,
  onSkipHighRepWarning,
  movement,
  bodyweight = null,
  showRestTimes,
  number,
  history: exerciseHistory,
  onExerciseHistory,
  onNotesChange,
  onExerciseComplete,
  onUpdateSet,
  onToggleSet,
  onAddSet,
  onInsertSet,
  onSwitch,
  machineTipEligible,
  onRemove,
  onMachinePhotos,
  onMachineSettings,
  onSuggestedSets,
  prBadges,
  supersetLabel,
  supersetUpNext = false,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onMoveSet,
  onDeleteSet,
  onRemoveRestTime,
  onSuperset,
  paceStrip,
}: {
  skipHighRepWarning: boolean;
  onSkipHighRepWarning: () => void;
  movement: DraftMovement;
  bodyweight?: number | null;
  showRestTimes: boolean;
  number: number;
  history: ExerciseHistoryEntry[];
  onExerciseHistory: () => void;
  /** Saves the exercise's note for this workout; absent while read-only. */
  onNotesChange?: (notes: string) => void;
  onExerciseComplete: (isComplete: boolean) => void;
  onUpdateSet: (setKey: string, update: Partial<DraftSet>) => void;
  onToggleSet: (item: DraftSet) => void;
  onAddSet: () => void;
  /** Adds a set before the set at this index (0 for the start of the list). */
  onInsertSet: (position: number) => void;
  onSwitch: () => void;
  machineTipEligible: boolean;
  onRemove: () => void;
  onMachinePhotos: (photoIds: string[], settings?: MachineSetting[], chosen?: boolean) => void;
  onMachineSettings: (settings: MachineSetting[]) => void;
  /** Replace untouched suggested sets with these sets from an earlier session. */
  onSuggestedSets: (previous: TrackedSet[]) => void;
  prBadges: Map<string, string[]>;
  supersetLabel: string | null;
  /** The next exercise to do in its superset or tri-set round. */
  supersetUpNext?: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveSet: (fromIndex: number, toIndex: number) => void;
  onDeleteSet: (index: number) => void;
  onRemoveRestTime: (item: DraftSet) => void;
  onSuperset: (button: HTMLButtonElement) => void;
  paceStrip?: ReactNode;
}) {
  const tips = useTips();
  const { learn: learnTip } = tips;
  const hasRepRange = Boolean(movement.repRange);
  useEffect(() => {
    if (hasRepRange) learnTip('repRange');
  }, [hasRepRange, learnTip]);
  const cardio = movement.exercise.kind === 'cardio';
  const treadmill =
    cardio && (movement.exercise.equipment?.toLowerCase().includes('treadmill') ?? false);
  const weightUnit = useWeightUnit();
  const defaultRest = useDefaultRest();
  const onlyWarmupsLogged = !cardio && loggedOnlyWarmups(movement.sets);
  const allWorkingSetsDone = workingSetsDone(movement.sets);
  // Finished exercises open folded, but ticking sets never folds a card: only the collapse
  // controls do, so the next set stays in reach.
  const [expanded, setExpanded] = useState(!movement.isComplete);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  // Free weights and bodyweight exercises show the equipment row only once it is in use.
  const [machineRowRequested, setMachineRowRequested] = useState(false);
  const photoPanelId = useId();
  const pinnedMachinePhotoId = movement.machinePhotoIds.at(-1);
  const [savedMachinePhotos, setSavedMachinePhotos] = useState<MachinePhoto[]>([]);
  const [savedMachineAliases, setSavedMachineAliases] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const machineRowShown =
    machineRowRequested ||
    savedMachinePhotos.length > 0 ||
    movement.machinePhotoIds.length > 0 ||
    /machine|cable|smith/i.test(movement.exercise.equipment ?? '');
  // With a machine pinned, its own sessions supply the last date, history and rests.
  const history = useMemo(
    () => movementHistory(exerciseHistory, pinnedMachinePhotoId, savedMachineAliases),
    [exerciseHistory, pinnedMachinePhotoId, savedMachineAliases],
  );
  const lastSessionSets = useMemo(() => lastWorkingSessionSets(history), [history]);
  const machineSettingsUnloaded = movement.machineSettings === undefined;
  const onMachineSettingsRef = useRef(onMachineSettings);

  useEffect(() => {
    onMachineSettingsRef.current = onMachineSettings;
  }, [onMachineSettings]);

  useEffect(() => {
    // Choosing a saved machine records its settings; restored workouts keep their snapshot.
    if (cardio || !pinnedMachinePhotoId || !machineSettingsUnloaded) return;
    let cancelled = false;
    void api.getMachineSettings(movement.exercise.id, pinnedMachinePhotoId).then(
      ({ settings }) => {
        if (!cancelled) onMachineSettingsRef.current(settings);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [cardio, movement.exercise.id, pinnedMachinePhotoId, machineSettingsUnloaded]);
  const [openOverrides, setOpenOverrides] = useState<Readonly<Record<string, boolean>>>({});
  const [restEdits, setRestEdits] = useState<Readonly<Record<string, number>>>({});
  const [typeMenuSetKey, setTypeMenuSetKey] = useState<string | null>(null);
  const [draggingSetKey, setDraggingSetKey] = useState<string | null>(null);
  const [dragTargetSetKey, setDragTargetSetKey] = useState<string | null>(null);
  const [pendingSetCompletion, setPendingSetCompletion] = useState<{
    item: DraftSet;
    warning: SetEntryWarning;
  } | null>(null);
  // A set whose tick was pressed before anything was entered; cleared once it has a value.
  const [emptySetKey, setEmptySetKey] = useState<string | null>(null);
  const barType = cardio ? null : barTypeForExercise(movement.exercise);
  const [plateSetKey, setPlateSetKey] = useState<string | null>(null);
  const plateSetIndex = movement.sets.findIndex((item) => item.key === plateSetKey);
  const plateSet = plateSetIndex < 0 ? null : movement.sets[plateSetIndex];
  const draggingSetKeyRef = useRef<string | null>(null);
  const dragTargetSetKeyRef = useRef<string | null>(null);
  const movementMenuRef = useRef<HTMLDetailsElement>(null);
  const setGridRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const setNumbers = setNumberLabels(movement.sets);
  // The bodyweight ratio is said once per exercise, on its heaviest logged set.
  const ratioSetKey = cardio ? null : heaviestLoggedSetKey(movement.sets);

  useEffect(() => {
    if (!movement.isComplete) setExpanded(true);
  }, [movement.isComplete]);

  /** Folds the card from its bottom edge, bringing its header back into view if it scrolled away. */
  function collapseFromFooter() {
    setExpanded(false);
    window.requestAnimationFrame(() =>
      cardRef.current
        ?.querySelector('header')
        ?.scrollIntoView?.({ block: 'nearest', behavior: motionReduced() ? 'auto' : 'smooth' }),
    );
  }

  useEffect(() => {
    if (supersetUpNext) setExpanded(true);
  }, [supersetUpNext]);

  useEffect(() => {
    if (!typeMenuSetKey) return;

    const closeMenus = () => setTypeMenuSetKey(null);
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('.set-type-picker')) {
        return;
      }
      closeMenus();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenus();
    };

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [typeMenuSetKey]);

  function closeMovementMenu() {
    if (movementMenuRef.current) movementMenuRef.current.open = false;
  }

  function clearSetDrag() {
    draggingSetKeyRef.current = null;
    dragTargetSetKeyRef.current = null;
    setDraggingSetKey(null);
    setDragTargetSetKey(null);
  }

  /** Incomplete cardio sets stay editable, including suggestions from the last session. */
  function isSetOpen(item: DraftSet) {
    return openOverrides[item.key] ?? (!item.completed && (cardio || !item.fromPrevious));
  }

  /** Pins a set open or closed; `null` returns it to the default for its state. */
  function setOpenOverride(setKey: string, open: boolean | null) {
    setOpenOverrides((current) => {
      if (open === null ? !(setKey in current) : current[setKey] === open) return current;
      const next = { ...current };
      if (open === null) delete next[setKey];
      else next[setKey] = open;
      return next;
    });
  }

  function openSet(setKey: string, focusField?: SetField) {
    // Render synchronously so the field can take focus inside the tap (iOS keyboard rule).
    flushSync(() => setOpenOverride(setKey, true));
    if (!focusField) return;
    setGridRef.current
      ?.querySelector<HTMLElement>(`[data-set-key="${setKey}"] [data-set-field="${focusField}"]`)
      ?.focus();
  }

  function completeSet(item: DraftSet) {
    onUpdateSet(item.key, { completed: !item.completed, rest_seconds: item.rest_seconds });
    clearRestEdit(item.key);
    setOpenOverride(item.key, null);
  }

  function clearRestEdit(setKey: string) {
    setRestEdits((current) => {
      const next = { ...current };
      delete next[setKey];
      return next;
    });
  }

  function editedRestSeconds(item: DraftSet) {
    const seconds = restEdits[item.key] ?? item.rest_seconds ?? 0;
    return seconds > 0 ? seconds : null;
  }

  function removeRest(item: DraftSet) {
    clearRestEdit(item.key);
    onRemoveRestTime(item);
  }

  /** The tick logs an open set and folds it away; on a folded logged set it unticks and opens it. */
  function checkSet(item: DraftSet, index: number) {
    const finishingEdit = item.completed && isSetOpen(item);
    if (item.completed) setOpenOverride(item.key, null);
    if (finishingEdit) {
      if (!cardio) onUpdateSet(item.key, { rest_seconds: editedRestSeconds(item) });
      clearRestEdit(item.key);
    } else {
      requestSetCompletion(
        !cardio && !item.completed && isSetOpen(item)
          ? { ...item, rest_seconds: editedRestSeconds(item) }
          : item,
        index,
      );
    }
  }

  function requestSetCompletion(item: DraftSet, index: number) {
    if (item.completed) {
      onToggleSet(item);
      return;
    }
    if (!hasRecordedPerformance(movement.exercise.kind, item)) {
      // Nothing to log yet: open the set at the field it needs instead of ticking it.
      setEmptySetKey(item.key);
      openSet(item.key, cardio ? 'duration' : 'reps');
      return;
    }

    const otherSets = [
      ...movement.sets.slice(0, index).reverse(),
      ...movement.sets.slice(index + 1),
    ];
    const sameTypeReference = otherSets.find(
      (candidate) =>
        candidate.weight_kg !== null &&
        candidate.set_type === item.set_type &&
        candidate.warmup === item.warmup,
    );
    const referenceWeightKg =
      sameTypeReference?.weight_kg ??
      otherSets.find((candidate) => candidate.weight_kg !== null)?.weight_kg ??
      null;
    const warning = unusualSetEntryWarning(
      { reps: item.reps, weightKg: item.weight_kg, referenceWeightKg, skipHighRepWarning },
      weightUnit,
    );
    if (warning) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      setPendingSetCompletion({ item, warning });
      return;
    }
    completeSet(item);
  }

  function beginSetDrag(handle: HTMLButtonElement, pointerId: number, setKey: string) {
    handle.setPointerCapture(pointerId);
    draggingSetKeyRef.current = setKey;
    dragTargetSetKeyRef.current = setKey;
    setDraggingSetKey(setKey);
    setDragTargetSetKey(setKey);
  }

  function moveSetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingSetKeyRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('.set-details[data-set-key]');
    const targetKey = target?.dataset.setKey;
    if (targetKey && movement.sets.some((item) => item.key === targetKey)) {
      dragTargetSetKeyRef.current = targetKey;
      setDragTargetSetKey(targetKey);
    }

    const scrollEdge = 64;
    if (event.clientY < scrollEdge) window.scrollBy({ top: -12, behavior: 'auto' });
    if (event.clientY > window.innerHeight - scrollEdge) {
      window.scrollBy({ top: 12, behavior: 'auto' });
    }
  }

  function finishSetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!draggingSetKeyRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const fromIndex = movement.sets.findIndex((item) => item.key === draggingSetKeyRef.current);
    const toIndex = movement.sets.findIndex((item) => item.key === dragTargetSetKeyRef.current);
    if (fromIndex >= 0 && toIndex >= 0 && fromIndex !== toIndex) onMoveSet(fromIndex, toIndex);
    clearSetDrag();
  }

  function renderSetDragHandle(item: DraftSet, index: number) {
    return (
      <SetDragHandle
        setNumber={index + 1}
        disabled={movement.sets.length < 2}
        onStart={(handle, pointerId) => beginSetDrag(handle, pointerId, item.key)}
        onPointerMove={moveSetDrag}
        onPointerUp={finishSetDrag}
        onCancel={clearSetDrag}
        onMoveEarlier={() => {
          if (index > 0) onMoveSet(index, index - 1);
        }}
        onMoveLater={() => {
          if (index < movement.sets.length - 1) onMoveSet(index, index + 1);
        }}
      />
    );
  }

  function renderRowCompleteButton(item: DraftSet, index: number) {
    const open = isSetOpen(item);
    const label = !item.completed
      ? `Complete set ${index + 1}`
      : open
        ? `Done editing set ${index + 1}`
        : `Mark set ${index + 1} incomplete`;
    return (
      <button
        type="button"
        // A logged set opened for editing shows the blue editing tick until it is confirmed.
        className={`row-complete-button ${item.completed && !open ? 'done' : ''}`}
        aria-label={label}
        aria-pressed={item.completed}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          checkSet(item, index);
        }}
      >
        <Icon name="check" />
      </button>
    );
  }

  function renderCompletedSetActions(item: DraftSet, index: number) {
    return (
      <span
        className="set-actions-menu completed-summary-actions"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {renderSetDragHandle(item, index)}
      </span>
    );
  }

  function renderSetTypeButton(item: DraftSet, index: number) {
    if (cardio) {
      return <span className="set-number-cell set-number-normal">{index + 1}</span>;
    }
    const kind = setKindOf(item);
    const menuOpen = typeMenuSetKey === item.key;
    const workingNumber =
      movement.sets.slice(0, index).filter((candidate) => setKindOf(candidate) === 'normal')
        .length + 1;
    return (
      <span className="set-type-picker" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={`set-number-cell set-number-${kind}`}
          aria-label={`Set ${index + 1} type: ${setTypeTitle(item)}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setTypeMenuSetKey(menuOpen ? null : item.key)}
        >
          {setNumbers[index]}
        </button>
        {menuOpen && (
          <span className="set-type-menu" role="menu" aria-label={`Type for set ${index + 1}`}>
            {SET_KINDS.map((option) => (
              <button
                key={option.kind}
                type="button"
                role="menuitemradio"
                aria-checked={option.kind === kind}
                onClick={() => {
                  if (option.kind !== kind) {
                    // Editing clears the suggestion flag; keep a folded row folded.
                    if (!isSetOpen(item)) setOpenOverride(item.key, false);
                    onUpdateSet(item.key, setKindUpdate(option.kind));
                  }
                  setTypeMenuSetKey(null);
                }}
              >
                <b className={`set-number-cell set-number-${option.kind}`} aria-hidden="true">
                  {option.letter ?? workingNumber}
                </b>
                {option.label}
              </button>
            ))}
          </span>
        )}
      </span>
    );
  }

  function renderSetSummary(item: DraftSet, index: number) {
    // An unticked row without an RPE shows last time's, faintly, as a guide.
    const lastRpe =
      item.rpe === null && !item.completed && !cardio
        ? (matchingLastSessionSet(movement.sets, index, lastSessionSets)?.rpe ?? null)
        : null;
    const valueButton = (field: SetField, label: string, className: string, value: ReactNode) => (
      <button
        type="button"
        className={`completed-set-value ${className}`}
        data-rpe={field === 'rpe' ? (item.rpe ?? undefined) : undefined}
        aria-label={`${label} for set ${index + 1}`}
        onClick={(event) => {
          event.stopPropagation();
          openSet(item.key, field);
        }}
      >
        {value}
      </button>
    );
    return (
      <>
        <div className="completed-set-summary" onClick={() => openSet(item.key)}>
          {renderSetTypeButton(item, index)}
          {cardio ? (
            valueButton(
              'duration',
              'Edit time and distance',
              'completed-set-cardio',
              completedSetPerformance(item, true),
            )
          ) : (
            <>
              {valueButton(
                'weight',
                'Edit weight',
                'completed-set-weight',
                <>
                  <span className="set-weight-value">
                    {item.weight_kg === null ? '–' : formatWeight(item.weight_kg, weightUnit)}
                  </span>
                  {prBadges.has(item.key) && (
                    <b
                      className={`pr-badge${isAllTimePr(prBadges.get(item.key)!) ? ' is-all-time' : ''}`}
                      title={prBadges.get(item.key)?.join(', ')}
                    >
                      {prBadgeLabel(prBadges.get(item.key)!)}
                    </b>
                  )}
                </>,
              )}
              {valueButton('reps', 'Edit repetitions', 'completed-set-reps', item.reps ?? '–')}
            </>
          )}
          {valueButton(
            'rpe',
            'Edit RPE',
            lastRpe === null ? 'completed-set-rpe' : 'completed-set-rpe is-last-time',
            item.rpe ?? lastRpe ?? '–',
          )}
          {renderRowCompleteButton(item, index)}
          {renderCompletedSetActions(item, index)}
        </div>
        {item.key === ratioSetKey && (item.bodyweight_kg ?? bodyweight) != null && (
          <small className="completed-set-bodyweight num">
            {bodyweightContext(item.weight_kg, item.bodyweight_kg ?? bodyweight, weightUnit)}
          </small>
        )}
        {item.notes && (
          <button
            type="button"
            className="completed-set-note"
            aria-label={`Edit note for set ${index + 1}`}
            onClick={() => openSet(item.key, 'notes')}
          >
            {item.notes}
          </button>
        )}
      </>
    );
  }

  function renderSetEditor(item: DraftSet, index: number) {
    const suggested = item.fromPrevious ? ', suggested value' : '';
    const missingEntry =
      emptySetKey === item.key && !hasRecordedPerformance(movement.exercise.kind, item);
    const entryErrorId = `set-entry-error-${item.key}`;
    const entryInvalid = missingEntry
      ? { 'aria-invalid': true, 'aria-describedby': entryErrorId }
      : {};
    return (
      <div className={`set-editor ${item.completed ? 'completed' : ''}`}>
        {renderSetTypeButton(item, index)}
        {cardio ? (
          <>
            <input
              data-set-field="duration"
              inputMode="numeric"
              type="number"
              min="0"
              value={item.duration_seconds === null ? '' : Math.round(item.duration_seconds / 60)}
              onChange={(event) =>
                onUpdateSet(item.key, {
                  duration_seconds:
                    numberOrNull(event.target.value) === null
                      ? null
                      : Number(event.target.value) * 60,
                })
              }
              aria-label="Duration minutes"
              {...entryInvalid}
            />
            <input
              data-set-field="distance"
              inputMode="decimal"
              type="number"
              min="0"
              step="0.1"
              value={item.distance_km ?? ''}
              onChange={(event) =>
                onUpdateSet(item.key, { distance_km: numberOrNull(event.target.value) })
              }
              aria-label="Distance kilometres"
            />
          </>
        ) : (
          <>
            <WeightInput
              data-set-field="weight"
              weightKg={item.weight_kg}
              onWeightChange={(weight_kg) => onUpdateSet(item.key, { weight_kg })}
              selectOnFocus
              aria-label={`Weight ${weightUnitName(weightUnit)}${suggested}`}
            />
            <input
              data-set-field="reps"
              inputMode="numeric"
              type="text"
              value={item.reps ?? ''}
              onFocus={(event) => {
                if (item.reps !== null) selectInputValue(event.currentTarget);
              }}
              onClick={(event) => {
                if (item.reps !== null) selectInputValue(event.currentTarget);
              }}
              onChange={(event) =>
                onUpdateSet(item.key, { reps: numberOrNull(event.target.value) })
              }
              aria-label={`Repetitions${suggested}`}
              {...entryInvalid}
            />
          </>
        )}
        <select
          data-set-field="rpe"
          data-rpe={item.rpe ?? undefined}
          className={item.rpe === null ? 'is-empty' : ''}
          value={item.rpe ?? ''}
          onChange={(event) => onUpdateSet(item.key, { rpe: numberOrNull(event.target.value) })}
          aria-label="RPE"
        >
          <option value="">–</option>
          {RPE_OPTIONS.map((rpe) => (
            <option key={rpe} value={rpe}>
              {rpe}
            </option>
          ))}
        </select>
        {renderRowCompleteButton(item, index)}
        {renderCompletedSetActions(item, index)}
        <div className="set-editor-extras">
          {missingEntry && (
            <p id={entryErrorId} className="set-entry-error" role="alert">
              {cardio
                ? 'Enter a time, distance or another measurement to log this set.'
                : 'Enter reps to log this set.'}
            </p>
          )}
          <div className="set-editor-tools">
            {!cardio && (
              <label className="set-editor-rest">
                Rest after set
                <RestTimeSelect
                  seconds={restEdits[item.key] ?? item.rest_seconds ?? 0}
                  label={`Rest time for set ${index + 1}`}
                  onChange={(seconds) =>
                    setRestEdits((current) => ({ ...current, [item.key]: seconds }))
                  }
                />
              </label>
            )}
            <button
              type="button"
              className="set-editor-delete"
              aria-label={`Delete set ${index + 1}`}
              onClick={() => {
                if (movement.sets.length > 1) tips.event('menu-delete', 'swipe', 3);
                onDeleteSet(index);
              }}
            >
              <Icon name="trash" />
              Delete set
            </button>
          </div>
          {cardio && (
            <div className="set-editor-metrics">
              <label>
                kcal
                <input
                  inputMode="numeric"
                  type="number"
                  min="0"
                  value={item.calories_kcal ?? ''}
                  onChange={(event) =>
                    onUpdateSet(item.key, { calories_kcal: numberOrNull(event.target.value) })
                  }
                  aria-label="Active calories"
                />
              </label>
              <label>
                Avg bpm
                <input
                  inputMode="numeric"
                  type="number"
                  min="20"
                  max="250"
                  value={item.average_heart_rate_bpm ?? ''}
                  onChange={(event) =>
                    onUpdateSet(item.key, {
                      average_heart_rate_bpm: numberOrNull(event.target.value),
                    })
                  }
                  aria-label="Average heart rate"
                />
              </label>
              <label>
                km/h
                <input
                  inputMode="decimal"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={item.speed_kph ?? ''}
                  onChange={(event) =>
                    onUpdateSet(item.key, { speed_kph: numberOrNull(event.target.value) })
                  }
                  aria-label="Average speed kilometres per hour"
                />
              </label>
              {treadmill && (
                <label>
                  Incline %
                  <input
                    inputMode="decimal"
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={item.incline_percent ?? ''}
                    onChange={(event) =>
                      onUpdateSet(item.key, { incline_percent: numberOrNull(event.target.value) })
                    }
                    aria-label="Treadmill incline percentage"
                  />
                </label>
              )}
            </div>
          )}
          <textarea
            data-set-field="notes"
            className="set-editor-note"
            rows={2}
            value={item.notes ?? ''}
            onChange={(event) => onUpdateSet(item.key, { notes: event.target.value || null })}
            placeholder="Add a note"
            aria-label={`Note for set ${index + 1}`}
          />
          {cardio && (
            <CardioSetScreenshotUpload
              onScan={(scan) => {
                // A scanned screenshot is the finished set, so log it and fold it away.
                onUpdateSet(item.key, { ...cardioSetUpdateFromScan(scan), completed: true });
                setOpenOverride(item.key, null);
              }}
            />
          )}
        </div>
        {prBadges.has(item.key) && (
          <div className="pr-callout" role="status">
            🏆 {prBadges.get(item.key)?.join(' · ')}
          </div>
        )}
      </div>
    );
  }

  useFlipAnimation(setGridRef, movement.sets.map((item) => item.key).join('|'));
  useExpandAnimation(setGridRef);
  useCollapseAnimation(cardRef, expanded);

  return (
    <article
      ref={cardRef}
      className={`movement-card panel ${expanded ? '' : 'is-collapsed'} ${supersetLabel ? 'superset-card' : ''}`}
      data-flip-key={movement.key}
    >
      {supersetLabel && (
        <div className="superset-ribbon">
          <span>{supersetLabel}</span>
          {supersetUpNext && <b className="superset-up-next">Up next</b>}
        </div>
      )}
      <header onClick={() => setExpanded((current) => !current)}>
        <ExerciseIcon
          exercise={movement.exercise}
          number={number}
          warning={onlyWarmupsLogged && movement.isComplete}
        />
        <div>
          <div className="movement-title-row">
            <h2>
              <button
                type="button"
                className="movement-history-link"
                onClick={(event) => {
                  event.stopPropagation();
                  onExerciseHistory();
                }}
                aria-label={`View full history for ${movement.exercise.name}`}
              >
                {movement.exercise.name}
              </button>
            </h2>
          </div>
          {movement.exercise.is_custom && <small className="custom-exercise-label">Custom</small>}
          <p>
            {[movement.exercise.muscle_group, movement.exercise.equipment]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {!cardio && history[0] && (
            <p className="movement-last-session">
              Last done{' '}
              <time dateTime={history[0].workoutDate}>
                {timeSince(history[0].workoutDate, localDate())}
              </time>
            </p>
          )}
          {movement.swappedFrom && (
            <p className="movement-last-session movement-swapped-from">
              Swapped from {movement.swappedFrom}
            </p>
          )}
          {!expanded && (
            <span className="movement-completed-summary">
              {foldedMovementSummary(movement.sets, cardio)}
            </span>
          )}
        </div>
        <div className="movement-header-actions" onClick={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="movement-expand-toggle"
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${movement.exercise.name}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m4 7 6 6 6-6" />
            </svg>
          </button>
          {barType && (
            <TipSlot id="plates" eligible={movement.sets.some((set) => (set.weight_kg ?? 0) >= 60)}>
              <button
                type="button"
                className="plate-calculator-button"
                aria-label={`Plate calculator for ${movement.exercise.name}`}
                disabled={movement.sets.length === 0}
                onClick={() => {
                  closeMovementMenu();
                  // The next set to lift, or the last one once every set is ticked.
                  const next =
                    movement.sets.find((item) => !item.completed) ?? movement.sets.at(-1);
                  if (next) {
                    tips.learn('plates');
                    setPlateSetKey(next.key);
                  }
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M1.5 12h2M20.5 12h2M8.5 12h7" />
                  <rect x="3.5" y="8" width="2.5" height="8" rx="1" />
                  <rect x="6" y="5" width="2.5" height="14" rx="1" />
                  <rect x="15.5" y="5" width="2.5" height="14" rx="1" />
                  <rect x="18" y="8" width="2.5" height="8" rx="1" />
                </svg>
              </button>
            </TipSlot>
          )}
          <button
            type="button"
            className={`exercise-complete-button ${movement.isComplete ? 'active' : ''}`}
            aria-label={
              movement.isComplete
                ? `Mark ${movement.exercise.name} as not finished`
                : `Finish ${movement.exercise.name}`
            }
            aria-pressed={movement.isComplete}
            onClick={() => {
              const next = !movement.isComplete;
              onExerciseComplete(next);
              closeMovementMenu();
            }}
          >
            <Icon name="check" />
          </button>
          <details className="movement-overflow" ref={movementMenuRef}>
            <summary aria-label={`Actions for ${movement.exercise.name}`}>⋮</summary>
            <div className="movement-overflow-menu">
              <button
                type="button"
                onClick={() => {
                  setHistoryOpen((current) => !current);
                  closeMovementMenu();
                }}
              >
                <span aria-hidden="true">
                  <Icon name="history" />
                </span>
                {historyOpen ? 'Hide recent history' : 'Recent history'}
              </button>
              {onNotesChange && (
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => {
                    setNoteOpen(true);
                    closeMovementMenu();
                  }}
                >
                  <span aria-hidden="true">
                    <Icon name="edit" />
                  </span>
                  {movement.notes.trim() ? 'Edit note' : 'Add note'}
                </button>
              )}
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => {
                  setCreditsOpen(true);
                  closeMovementMenu();
                }}
              >
                <span aria-hidden="true">
                  <Icon name="help" />
                </span>
                Muscle credits
              </button>
              {!cardio && !machineRowShown && (
                <button
                  type="button"
                  onClick={() => {
                    setMachineRowRequested(true);
                    closeMovementMenu();
                  }}
                >
                  <span aria-hidden="true">
                    <Icon name="camera" />
                  </span>
                  Equipment photo
                </button>
              )}
              <button
                type="button"
                className={supersetLabel ? 'active' : ''}
                onClick={(event) => {
                  closeMovementMenu();
                  onSuperset(event.currentTarget);
                }}
                aria-haspopup="dialog"
              >
                <span aria-hidden="true">
                  <Icon name="link" />
                </span>
                {supersetLabel ? 'Edit superset' : 'Group as superset'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSwitch();
                  closeMovementMenu();
                }}
              >
                <span aria-hidden="true">⇄</span>
                Swap exercise
              </button>
              <button
                type="button"
                disabled={!canMoveUp}
                onClick={() => {
                  onMoveUp();
                  closeMovementMenu();
                }}
              >
                <span aria-hidden="true">
                  <Icon name="up" />
                </span>
                Move earlier
              </button>
              <button
                type="button"
                disabled={!canMoveDown}
                onClick={() => {
                  onMoveDown();
                  closeMovementMenu();
                }}
              >
                <span aria-hidden="true">
                  <Icon name="down" />
                </span>
                Move later
              </button>
              <button
                type="button"
                className="movement-menu-danger"
                onClick={() => {
                  onRemove();
                  closeMovementMenu();
                }}
              >
                <span aria-hidden="true">
                  <i className="trash-can-icon" />
                </span>
                Remove exercise
              </button>
            </div>
          </details>
        </div>
      </header>
      {expanded && paceStrip}
      {onNotesChange && (movement.notes.trim() || history[0]?.movementNotes) && (
        // This workout's note, or last time's (faint) until one is written.
        <button
          type="button"
          className={`movement-note-line${movement.notes.trim() ? '' : ' is-last-time'}`}
          aria-label={`${movement.notes.trim() ? 'Edit' : 'Add'} note for ${movement.exercise.name}`}
          onClick={() => setNoteOpen(true)}
        >
          {movement.notes.trim() || `Last time: ${history[0]?.movementNotes}`}
        </button>
      )}

      <ExerciseMuscleHelp
        exercise={movement.exercise}
        open={creditsOpen}
        onClose={() => setCreditsOpen(false)}
      />
      {noteOpen && onNotesChange && (
        <MovementNoteDialog
          exerciseName={movement.exercise.name}
          value={movement.notes}
          onSave={(notes) => {
            onNotesChange(notes);
            setNoteOpen(false);
          }}
          onClose={() => setNoteOpen(false)}
        />
      )}
      {expanded && !cardio && movement.repRange && (
        <p className="movement-rep-target">
          {progressionHint(
            movement.repRange,
            progressionTarget(movement.repRange, lastSessionSets, weightUnit),
            weightUnit,
          )}
        </p>
      )}
      {historyOpen && (
        <section
          className="movement-history"
          aria-label={`${movement.exercise.name} recent history`}
        >
          <header>
            <div>
              <p className="section-kicker">RECENT HISTORY</p>
              <h3>Last performed</h3>
            </div>
          </header>
          {history.length ? (
            history.slice(0, 1).map((entry) => (
              <article className="movement-history-entry" key={entry.workoutId}>
                <header>
                  <strong>{prettyDate(entry.workoutDate)}</strong>
                  <small>{entry.workoutName}</small>
                </header>
                {entry.sets.length > 0 && <HistorySetFlow sets={entry.sets} personalRecords={[]} />}
                {entry.sets
                  .filter((item) => item.notes)
                  .map((item) => (
                    <small className="movement-history-set-note" key={item.id}>
                      Set {item.order_index + 1}: {item.notes}
                    </small>
                  ))}
                {entry.movementNotes && <MovementNotes notes={entry.movementNotes} />}
              </article>
            ))
          ) : (
            <p className="movement-history-empty">No previous entries for this exercise yet.</p>
          )}
        </section>
      )}

      {!cardio && (
        <TipSlot
          id="machine"
          eligible={machineTipEligible && movement.machinePhotoIds.length === 0}
        >
          <MachinePhotoChooser
            key={movement.exercise.id}
            id={photoPanelId}
            exercise={movement.exercise}
            selectedIds={movement.machinePhotoIds}
            settings={movement.machineSettings}
            autoPinLastUsed={!movement.machinePhotosInitialized}
            hidden={!machineRowShown}
            openRequested={machineRowRequested}
            onChange={(photoIds, settings, chosen) => {
              onMachinePhotos(photoIds, settings, chosen);
              const pinned = photoIds.at(-1);
              const canonical = (id: string | undefined) =>
                (id && savedMachineAliases.get(id)) ?? id;
              if (chosen && canonical(pinned) !== canonical(pinnedMachinePhotoId)) {
                onSuggestedSets(
                  machineSuggestionSource(exerciseHistory, pinned, savedMachineAliases),
                );
              }
            }}
            onPhotosLoaded={(photos) => {
              setSavedMachinePhotos(photos);
              const aliases = machineAliases(photos);
              setSavedMachineAliases(aliases);
              for (const set of movement.sets) {
                const canonical = set.machine_photo_id && aliases.get(set.machine_photo_id);
                if (canonical && canonical !== set.machine_photo_id) {
                  onUpdateSet(set.key, { machine_photo_id: canonical });
                }
              }
            }}
          />
        </TipSlot>
      )}

      <div className={`set-grid set-grid-${cardio ? 'cardio' : 'strength'}`} ref={setGridRef}>
        <div className="set-grid-head">
          {cardio ? (
            <>
              <span>Set</span>
              <span>Min</span>
              <span>Km</span>
              <span>RPE</span>
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </>
          ) : (
            <>
              <span>Set</span>
              <span>Weight ({weightUnit})</span>
              <span>Reps</span>
              <span>RPE</span>
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </>
          )}
        </div>
        {movement.sets.length > 0 && <SetInsertRow beforeSet={1} onInsert={() => onInsertSet(0)} />}
        {movement.sets.map((item, index) => {
          const open = isSetOpen(item);
          const restShown = restRowShown(item, cardio, showRestTimes);
          // Between two sets; after the last set, Add set below does the same job.
          const insertAfter = index < movement.sets.length - 1 && (
            <SetInsertButton beforeSet={index + 2} onInsert={() => onInsertSet(index + 1)} />
          );
          const restHistory = item.machine_photo_id
            ? historyOnMachine(exerciseHistory, item.machine_photo_id, savedMachineAliases)
            : history;
          return (
            <Fragment key={item.key}>
              <SwipeToDeleteSetRow
                flipKey={item.key}
                label={`set ${index + 1}`}
                disabled={movement.sets.length < 2}
                overlayOpen={typeMenuSetKey === item.key}
                onDelete={() => {
                  tips.learn('swipe');
                  onDeleteSet(index);
                }}
              >
                <div
                  className={`set-details ${item.completed ? 'completed' : ''} ${item.fromPrevious ? 'previous-set-details' : ''} ${open ? 'is-open' : ''} ${draggingSetKey === item.key ? 'set-dragging' : ''} ${dragTargetSetKey === item.key && draggingSetKey !== item.key ? 'set-drop-target' : ''}`}
                  data-set-key={item.key}
                  data-set-type={cardio ? 'normal' : setKindOf(item)}
                  data-expand-key={item.key}
                  data-expanded={open}
                >
                  {open ? renderSetEditor(item, index) : renderSetSummary(item, index)}
                  {movement.machinePhotoIds.length > 1 && (
                    <label className="set-machine-assignment">
                      <span>Machine</span>
                      <select
                        className="set-machine-select"
                        aria-label={`Machine for set ${index + 1}`}
                        data-unassigned={
                          !movement.machinePhotoIds.includes(item.machine_photo_id ?? '')
                        }
                        value={
                          movement.machinePhotoIds.includes(item.machine_photo_id ?? '')
                            ? (item.machine_photo_id ?? '')
                            : ''
                        }
                        onChange={(event) =>
                          onUpdateSet(item.key, {
                            machine_photo_id: event.target.value || null,
                          })
                        }
                      >
                        <option value="">Choose machine</option>
                        {movement.machinePhotoIds.map((id, photoIndex) => (
                          <option key={id} value={id}>
                            {savedMachinePhotos.find((photo) => photo.id === id)?.caption ||
                              `Machine ${photoIndex + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              </SwipeToDeleteSetRow>
              {restShown ? (
                <SwipeToDeleteSetRow
                  flipKey={`${item.key}:rest`}
                  label={`rest after set ${index + 1}`}
                  onDelete={() => removeRest(item)}
                >
                  <SetRestControl
                    seconds={item.rest_seconds!}
                    setIndex={index}
                    sets={movement.sets}
                    history={restHistory}
                    suggested={!item.completed && !item.restConfirmed}
                    onChange={(seconds) => {
                      clearRestEdit(item.key);
                      if (seconds === 0) removeRest(item);
                      else onUpdateSet(item.key, { rest_seconds: seconds });
                    }}
                    leading={insertAfter}
                  />
                </SwipeToDeleteSetRow>
              ) : (
                insertAfter && (
                  <SetInsertRow
                    beforeSet={index + 2}
                    onInsert={() => onInsertSet(index + 1)}
                    onAddRest={
                      !cardio && showRestTimes
                        ? (seconds) =>
                            onUpdateSet(item.key, { rest_seconds: seconds, restRevealed: true })
                        : undefined
                    }
                    suggestedRest={restToAdd(movement.sets, index, restHistory, defaultRest)}
                  />
                )
              )}
            </Fragment>
          );
        })}
      </div>
      {pendingSetCompletion && (
        <SetEntryConfirmationDialog
          warning={pendingSetCompletion.warning}
          confirmLabel="Add set"
          onCancel={() => setPendingSetCompletion(null)}
          onConfirm={(skipWarning) => {
            if (skipWarning) onSkipHighRepWarning();
            completeSet(pendingSetCompletion.item);
            setPendingSetCompletion(null);
          }}
        />
      )}
      <div className="movement-card-footer">
        <button type="button" className="add-set-button pulse-button tonal" onClick={onAddSet}>
          ＋ Add set
        </button>
        <button
          type="button"
          className={`movement-collapse-button pulse-button${allWorkingSetsDone ? ' is-done' : ''}`}
          aria-label={`Collapse ${movement.exercise.name}`}
          onClick={collapseFromFooter}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m4 13 6-6 6 6" />
          </svg>
        </button>
      </div>
      {plateSet && barType && (
        <PlateCalculatorDialog
          exercise={movement.exercise}
          barType={barType}
          setLabel={
            /^\d+$/.test(setNumbers[plateSetIndex])
              ? `Set ${setNumbers[plateSetIndex]}`
              : (SET_KINDS.find((kind) => kind.letter === setNumbers[plateSetIndex])?.label ??
                'Set')
          }
          weightKg={plateSet.weight_kg}
          onUse={(weightKg) => onUpdateSet(plateSet.key, { weight_kg: weightKg })}
          onClose={() => setPlateSetKey(null)}
        />
      )}
    </article>
  );
}

function MachinePhotoChooser({
  id,
  exercise,
  selectedIds,
  settings,
  autoPinLastUsed,
  hidden = false,
  openRequested = false,
  onChange,
  onPhotosLoaded,
}: {
  id: string;
  exercise: Exercise;
  selectedIds: string[];
  settings?: MachineSetting[];
  autoPinLastUsed: boolean;
  /** Still loads saved machines and restores the last one used, but draws nothing. */
  hidden?: boolean;
  /** Asked for from the exercise menu: the panel opens once it appears. */
  openRequested?: boolean;
  /** `chosen` marks a pin the user picked, rather than a restored or automatic one. */
  onChange: (photoIds: string[], settings?: MachineSetting[], chosen?: boolean) => void;
  onPhotosLoaded?: (photos: MachinePhoto[]) => void;
}) {
  const [selectingForMerge, setSelectingForMerge] = useState(false);
  const [photos, setPhotos] = useState<MachinePhotoUsage[]>([]);
  const [pending, setPending] = useState<{ file: File; previewUrl: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [expanded, setExpanded] = useState<MachinePhoto | null>(null);
  const tips = useTips();
  const [photoPanelOpen, setPhotoPanelOpen] = useState(false);
  useEffect(() => {
    if (openRequested) setPhotoPanelOpen(true);
  }, [openRequested]);
  const [choosingReplacement, setChoosingReplacement] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoRailRef = useRef<HTMLDivElement>(null);
  const autoPinLastUsedRef = useRef(autoPinLastUsed);
  const onChangeRef = useRef(onChange);
  const selectedIdsRef = useRef(selectedIds);
  const settingsRef = useRef(settings);

  useEffect(() => {
    onChangeRef.current = onChange;
    selectedIdsRef.current = selectedIds;
    settingsRef.current = settings;
  }, [onChange, selectedIds, settings]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      api.listMachinePhotos(exercise.id),
      autoPinLastUsedRef.current
        ? api.lastUsedMachinePhotos(exercise.id)
        : Promise.resolve([] as MachinePhoto[]),
    ])
      .then(([items, lastUsed]) => {
        if (!active) return;
        setPhotos(items);
        const canonicalIds = [
          ...new Set(
            selectedIdsRef.current.map(
              (id) =>
                items.find(
                  (photo) => photo.id === id || photo.images?.some((image) => image.id === id),
                )?.id ?? id,
            ),
          ),
        ];
        if (canonicalIds.join(',') !== selectedIdsRef.current.join(',')) {
          onChangeRef.current(canonicalIds, settingsRef.current);
        }
        if (autoPinLastUsedRef.current && selectedIdsRef.current.length === 0) {
          onChangeRef.current(lastUsed.map((photo) => photo.id));
        }
      })
      .catch((loadError) => {
        if (active)
          setError(
            loadError instanceof Error ? loadError.message : 'Could not load machine photos.',
          );
      });
    return () => {
      active = false;
    };
  }, [exercise.id]);

  const onPhotosLoadedRef = useRef(onPhotosLoaded);

  useEffect(() => {
    onPhotosLoadedRef.current = onPhotosLoaded;
  }, [onPhotosLoaded]);

  useEffect(() => {
    onPhotosLoadedRef.current?.(photos);
  }, [photos]);

  useEffect(
    () => () => {
      if (pending) URL.revokeObjectURL(pending.previewUrl);
    },
    [pending],
  );

  function stagePhoto(file: File | undefined) {
    if (!file) return;
    setSelectingForMerge(false);
    setError(null);
    setCaption('');
    setExpanded(null);
    setPending({ file, previewUrl: URL.createObjectURL(file) });
  }

  async function uploadPhoto(machineSettings: MachineSetting[]) {
    if (!pending || !caption.trim()) {
      throw new Error('Enter the machine name before saving the photo.');
    }
    setUploading(true);
    setError(null);
    try {
      const upload = await optimisePhoto(pending.file);
      const photo = await api.uploadMachinePhoto(
        exercise.id,
        upload,
        caption.trim(),
        machineSettings,
      );
      setPhotos((current) => [
        { ...photo, exercise_name: exercise.name, workout_count: 0, last_used_date: null },
        ...current,
      ]);
      onChange(
        choosingReplacement ? [photo.id] : [...new Set([...selectedIds, photo.id])],
        machineSettings,
        true,
      );
      setChoosingReplacement(false);
      setPending(null);
      setCaption('');
      setPhotoPanelOpen(false);
      return { settings: machineSettings };
    } finally {
      setUploading(false);
    }
  }

  function togglePhoto(photoId: string) {
    setPending(null);
    setExpanded(null);
    if (choosingReplacement) {
      onChange([photoId], undefined, true);
      setChoosingReplacement(false);
      return;
    }
    onChange(
      selectedIds.includes(photoId)
        ? selectedIds.filter((current) => current !== photoId)
        : [...selectedIds, photoId],
      undefined,
      true,
    );
  }

  async function updatePhoto(photo: MachinePhoto, nextCaption: string) {
    const updated = await api.updateMachinePhoto(photo.id, nextCaption);
    setPhotos((current) =>
      current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
    );
    setExpanded(updated);
  }

  async function deletePhoto(photo: MachinePhoto) {
    await api.deleteMachinePhoto(photo.id, true);
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
    onChange(
      selectedIds.filter((id) => id !== photo.id),
      undefined,
      true,
    );
    setExpanded(null);
  }

  function chooseAnotherPhoto() {
    setExpanded(null);
    setChoosingReplacement(true);
    setPhotoPanelOpen(true);
    window.requestAnimationFrame(() => {
      photoRailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  const today = localDate();
  // Latest pin first: it supplies the suggested sets, so it sits in front of the stack.
  const pinnedPhotos = [...selectedIds]
    .reverse()
    .flatMap((photoId) => photos.find((photo) => photo.id === photoId) ?? []);
  const primaryPinnedPhoto = pinnedPhotos[0] ?? null;
  // A chosen machine is named in the row's title; the line under it says only what the name can't.
  const photoTitle = primaryPinnedPhoto?.caption || 'Equipment photo';
  const photoSummary = primaryPinnedPhoto
    ? pinnedPhotos.length > 1
      ? `+${pinnedPhotos.length - 1} more`
      : primaryPinnedPhoto.caption
        ? ''
        : 'Pinned'
    : photos.length > 0
      ? `${photos.length} saved · none pinned`
      : '';

  if (hidden) return null;

  return (
    <details
      id={id}
      className="machine-photo-picker"
      aria-label={`Machine photos for ${exercise.name}`}
      open={photoPanelOpen}
      onToggle={(event) => {
        setPhotoPanelOpen(event.currentTarget.open);
      }}
    >
      <summary
        className="machine-photo-summary"
        onClick={(event) => {
          event.preventDefault();
          if (!photoPanelOpen) tips.learn('machine');
          setPhotoPanelOpen(!photoPanelOpen);
        }}
      >
        {pinnedPhotos.length > 1 ? (
          <span className="machine-photo-stack" aria-hidden="true">
            {pinnedPhotos.slice(0, 3).map((photo) => (
              <img key={photo.id} src={photo.thumbnail_url} alt="" loading="lazy" />
            ))}
          </span>
        ) : primaryPinnedPhoto ? (
          <img src={primaryPinnedPhoto.thumbnail_url} alt="" loading="lazy" />
        ) : (
          <span className="machine-photo-placeholder" aria-hidden="true">
            <Icon name="camera" />
          </span>
        )}
        <span className="machine-photo-summary-copy">
          <strong>{photoTitle}</strong>
          {photoSummary && <small>{photoSummary}</small>}
        </span>
        {selectedIds.length > 1 && <b>{selectedIds.length} pinned</b>}
        <span className="machine-photo-chevron" aria-hidden="true">
          <Icon name="chevron-down" />
        </span>
      </summary>
      <div className="machine-photo-content">
        {selectingForMerge ? (
          <MachinePhotoMergePicker
            exerciseId={exercise.id}
            photos={photos}
            onCancel={() => setSelectingForMerge(false)}
            onMerged={(merged, sourceIds) => {
              tips.learn('mergeMachines');
              const sourceSet = new Set(sourceIds);
              const nextIds = pinnedAfterMerge(selectedIdsRef.current, merged.id, sourceIds);
              setPhotos((current) => [
                merged,
                ...current.filter((photo) => !sourceSet.has(photo.id)),
              ]);
              if (nextIds.join(',') !== selectedIdsRef.current.join(',')) {
                onChange(nextIds, settingsRef.current);
              }
              setSelectingForMerge(false);
              setExpanded(merged);
            }}
          />
        ) : (
          <>
            <div className="machine-photo-actions">
              <label>
                <span aria-hidden="true">
                  <Icon name="camera" />
                </span>
                Take photo
                <input
                  className="sr-only"
                  type="file"
                  disabled={uploading}
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  capture="environment"
                  onChange={(event) => {
                    stagePhoto(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </label>
              <label>
                <span aria-hidden="true">＋</span>
                Choose photo
                <input
                  className="sr-only"
                  type="file"
                  disabled={uploading}
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  onChange={(event) => {
                    stagePhoto(event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
              </label>
            </div>
            {photos.length > 0 && (
              <>
                {choosingReplacement && (
                  <p className="machine-photo-choice-prompt" role="status">
                    {photos.length > 1
                      ? 'Choose the machine you are using for this workout.'
                      : 'No other saved photos yet. Use Take photo or Choose photo above to add another machine.'}
                  </p>
                )}
                {photos.length >= 2 && (
                  <div className="machine-photo-library-actions">
                    <span>Saved · {photos.length}</span>
                    <TipSlot
                      id="mergeMachines"
                      eligible={
                        photoPanelOpen &&
                        !selectingForMerge &&
                        !pending &&
                        !uploading &&
                        hasLikelyDuplicateMachines(photos.map((photo) => photo.caption ?? ''))
                      }
                    >
                      <button
                        type="button"
                        disabled={uploading || !!pending}
                        onClick={() => {
                          setExpanded(null);
                          setChoosingReplacement(false);
                          setSelectingForMerge(true);
                          setError(null);
                        }}
                      >
                        Select
                      </button>
                    </TipSlot>
                  </div>
                )}
                <div
                  className="machine-photo-rail"
                  ref={photoRailRef}
                  role="region"
                  aria-label={`Saved equipment photos for ${exercise.name}`}
                  tabIndex={0}
                >
                  {photos.map((photo) => {
                    const selected = selectedIds.includes(photo.id);
                    return (
                      <article className={selected ? 'selected' : ''} key={photo.id}>
                        <button
                          type="button"
                          className="machine-thumbnail"
                          onClick={() => setExpanded(photo)}
                          aria-label={`Expand ${photo.caption}`}
                        >
                          <img src={photo.thumbnail_url} alt={photo.caption} loading="lazy" />
                        </button>
                        <strong title={photo.caption}>{photo.caption}</strong>
                        {(photo.images?.length ?? 0) > 1 && (
                          <span className="machine-photo-count">{photo.images!.length} photos</span>
                        )}
                        <small
                          className="machine-last-used"
                          title={
                            photo.last_used_date
                              ? `Last used ${machineDate(photo.last_used_date)}`
                              : undefined
                          }
                        >
                          {machineUsedShort(photo.last_used_date, today)}
                        </small>
                        <button
                          type="button"
                          className="machine-pin"
                          onClick={() => togglePhoto(photo.id)}
                          disabled={uploading}
                        >
                          {choosingReplacement
                            ? selected
                              ? 'Currently pinned'
                              : 'Use this machine'
                            : selected
                              ? '✓ Pinned'
                              : 'Pin to sets'}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
        {error && <p className="machine-photo-error">{error}</p>}

        {pending && (
          <section className="photo-inline-editor panel">
            <img src={pending.previewUrl} alt="New machine preview" />
            <div>
              <p className="section-kicker">NEW MACHINE PHOTO</p>
              <h2>Name this machine</h2>
              <input
                autoFocus
                aria-label="Machine name"
                disabled={uploading}
                value={caption}
                maxLength={160}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Machine name"
              />
              <MachineSettingsEditor
                key={pending.previewUrl}
                exerciseId={exercise.id}
                initialSettings={[]}
                onChange={() => undefined}
                onSave={uploadPhoto}
                saveLabel="Save and pin"
                onCancel={() => setPending(null)}
              />
            </div>
          </section>
        )}
        {expanded && (
          <MachinePhotoDetail
            photo={expanded}
            onSettingsSaved={(settings) => {
              if (selectedIds.includes(expanded.id)) onChange(selectedIds, settings);
            }}
            onClose={() => setExpanded(null)}
            onUpdate={updatePhoto}
            onDelete={deletePhoto}
            onChooseAnother={chooseAnotherPhoto}
          />
        )}
      </div>
    </details>
  );
}

function MachinePhotoDetail({
  photo,
  onClose,
  onUpdate,
  onDelete,
  onChooseAnother,
  onShowHistory,
  onSettingsSaved,
}: {
  photo: MachinePhoto;
  onSettingsSaved?: (settings: MachineSetting[]) => void;
  onClose: () => void;
  onUpdate?: (photo: MachinePhoto, caption: string) => Promise<void>;
  onDelete?: (photo: MachinePhoto) => Promise<void>;
  onChooseAnother?: () => void;
  /** Filters History to the workouts that pinned this machine. */
  onShowHistory?: () => void;
}) {
  const [editingSettings, setEditingSettings] = useState(false);
  const { show: showToast } = useToast();
  const [caption, setCaption] = useState(photo.caption);
  const [imageIndex, setImageIndex] = useState(0);
  const images = photo.images?.length ? photo.images : [photo];
  const image = images[Math.min(imageIndex, images.length - 1)];
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveCaption() {
    if (!onUpdate || !caption.trim() || caption.trim() === photo.caption) return;
    setSaving(true);
    setError(null);
    try {
      await onUpdate(photo, caption.trim());
      showToast('Machine name saved');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not update the caption.');
    } finally {
      setSaving(false);
    }
  }

  async function removePhoto() {
    if (!onDelete) return;
    setSaving(true);
    setError(null);
    try {
      await onDelete(photo);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Could not delete the photo. Try again.',
      );
      setSaving(false);
    }
  }

  return (
    <section className="photo-detail panel" aria-label={photo.caption}>
      <div>
        <button
          className="photo-detail-close pulse-button secondary small"
          type="button"
          onClick={onClose}
        >
          Close
        </button>
        <img src={image.full_url} alt={photo.caption} />
        {images.length > 1 && (
          <div className="machine-photo-gallery" aria-label="Merged machine photos">
            {images.map((item, index) => (
              <button
                type="button"
                key={item.id}
                aria-label={`View photo ${index + 1} of ${images.length}`}
                aria-pressed={imageIndex === index}
                onClick={() => setImageIndex(index)}
              >
                <img src={item.thumbnail_url} alt="" />
              </button>
            ))}
          </div>
        )}
        <div className="photo-detail-caption">
          {onUpdate ? (
            <input
              value={caption}
              maxLength={160}
              onChange={(event) => setCaption(event.target.value)}
            />
          ) : (
            <strong>{photo.caption}</strong>
          )}
          {onUpdate && (
            <button
              type="button"
              className="pulse-button primary small"
              onClick={() => void saveCaption()}
              disabled={saving}
            >
              Save name
            </button>
          )}
          {onUpdate && (
            <button
              type="button"
              className="pulse-button secondary small"
              aria-label="Edit machine settings"
              onClick={() => setEditingSettings(true)}
            >
              Edit settings
            </button>
          )}
          {onChooseAnother && (
            <button
              type="button"
              className="photo-choose-other pulse-button secondary small"
              onClick={onChooseAnother}
            >
              Switch photo
            </button>
          )}
          {onShowHistory && (
            <button
              type="button"
              className="photo-machine-history pulse-button secondary small"
              onClick={onShowHistory}
            >
              <Icon name="filter" />
              All workouts on this machine
            </button>
          )}
          {onDelete && (
            <InlineConfirmButton
              className="photo-delete pulse-button danger-soft small"
              label={images.length > 1 ? 'Delete machine' : 'Delete'}
              confirmLabel={images.length > 1 ? 'Delete machine and all photos' : 'Delete photo'}
              confirmationMessage={
                images.length > 1
                  ? 'Also removes these photos from saved workouts.'
                  : 'Also removes this photo from saved workouts.'
              }
              onConfirm={removePhoto}
              disabled={saving}
            />
          )}
          {editingSettings && (
            <MachineSettingsEditor
              exerciseId={photo.exercise_id}
              machinePhotoId={photo.id}
              onChange={(settings) => onSettingsSaved?.(settings)}
              onSaved={() => {
                setEditingSettings(false);
                showToast('Machine settings saved');
              }}
              onCancel={() => setEditingSettings(false)}
            />
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
    </section>
  );
}

/** "zercher squat" as "Zercher Squat", for an exercise named from a search. */

interface ExerciseDetailHeader {
  exercise: Exercise;
  sessionCount: number | null;
  /** The training block the progress is scoped to, if any. */
  blockName?: string | null;
  onBack: () => void;
  onMerge?: (trigger: HTMLButtonElement) => void;
  onEdit?: (trigger: HTMLButtonElement) => void;
  onToggleHidden?: () => void;
}

export function ProgressScreen({
  exerciseLibrary,
  dataRevision = null,
  exercises,
  personalRecords,
  onOpenWorkout,
  embedded = false,
  initialExerciseId = null,
  openMachineWeights = false,
  onMachineWeightsOpened,
  defaultExerciseId = null,
  browseFirst = false,
  onOpenSettings,
  onDetailChange,
  onCreateExercise,
  onExercisesMerged,
  onRecordsChange,
  onOpenMember,
}: {
  exerciseLibrary: ExerciseLibraryState;
  dataRevision?: string | null;
  exercises: Exercise[];
  measurements: BodyMeasurement[];
  personalRecords: PersonalRecord[];
  onOpenWorkout: (workoutId: string, exerciseId: string) => void;
  /** Opens a friend's profile from the exercise's friends ranking. */
  onOpenMember?: (member: Pick<SharedProfileSummary, 'id' | 'display_name'>) => void;
  embedded?: boolean;
  initialExerciseId?: string | null;
  /** Asked for from elsewhere: Machine weights opens once this exercise's machines have loaded. */
  openMachineWeights?: boolean;
  onMachineWeightsOpened?: () => void;
  defaultExerciseId?: string | null;
  browseFirst?: boolean;
  onOpenSettings?: () => void;
  onDetailChange?: (header: ExerciseDetailHeader | null) => void;
  onCreateExercise?: () => void;
  onExercisesMerged?: () => Promise<void>;
  /** Saving machine weights rebuilds personal records, so they are loaded again. */
  onRecordsChange?: () => Promise<void>;
}) {
  const { block, config: blockConfig, select: selectBlock } = useTrainingBlocks();
  const blockId = block?.id;
  const weightUnit = useWeightUnit();
  const [mergeRequest, setMergeRequest] = useState<{ sourceId?: string; targetId?: string } | null>(
    null,
  );
  const { show: showToast, dismiss: dismissToast } = useToast();
  const strengthExercises = useMemo(
    () => exercises.filter((exercise) => exercise.kind === 'strength'),
    [exercises],
  );
  const [exerciseId, setExerciseId] = useState(() => {
    const preferred = [initialExerciseId, defaultExerciseId].find(
      (id) => id && strengthExercises.some((exercise) => exercise.id === id),
    );
    return preferred ?? strengthExercises[0]?.id ?? '';
  });
  const [metric, setMetric] = useState<ProgressMetric>('estimated_1rm');
  const [fullProgress, setFullProgress] = useState(!browseFirst || Boolean(initialExerciseId));
  const libraryMode = browseFirst && !fullProgress;
  const [displayRange, setDisplayRange] = useState<BodyTrendRange>('3m');
  const [loadedProgress, setProgress] = useState<ExerciseProgress | null>(null);
  const progress = loadedProgress?.exercise.id === exerciseId ? loadedProgress : null;
  const [progressError, setProgressError] = useState<string | null>(null);
  const [progressAttempt, setProgressAttempt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sessionPage, setSessionPage] = useState(1);
  const sessionsRef = useRef<HTMLElement>(null);
  const [pickerRequest, setPickerRequest] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loadedMapping, setMapping] = useState<{
    exerciseId: string;
    mapping: WeightMapping;
  } | null>(null);
  const mapping = loadedMapping?.exerciseId === exerciseId ? loadedMapping.mapping : null;
  const [machineView, setMachineView] = useState<{ exerciseId: string; view: MachineView }>({
    exerciseId,
    view: 'all',
  });
  const [mappingOpen, setMappingOpen] = useState(false);
  const mappingLoaded = mapping !== null && exerciseId === initialExerciseId;
  useEffect(() => {
    if (!openMachineWeights || !mappingLoaded) return;
    setMappingOpen(true);
    onMachineWeightsOpened?.();
  }, [openMachineWeights, mappingLoaded, onMachineWeightsOpened]);
  const libraryRoot = useRef<HTMLDivElement>(null);
  const libraryScroll = useRef(0);
  const metricIndicatorRef = useSlidingIndicator<HTMLDivElement>(metric);
  const rangeIndicatorRef = useSlidingIndicator<HTMLDivElement>(displayRange);
  const selectedExercise = strengthExercises.find((exercise) => exercise.id === exerciseId) ?? null;
  const canMergeSelected = Boolean(selectedExercise?.is_custom && onExercisesMerged);
  const canEditSelected = Boolean(selectedExercise && onExercisesMerged);
  const openSelectedMerge = useCallback(
    () => setMergeRequest({ sourceId: exerciseId }),
    [exerciseId],
  );
  const openSuggestedMerge = useCallback(
    (targetId: string) => setMergeRequest({ sourceId: exerciseId, targetId }),
    [exerciseId],
  );
  const [editOpen, setEditOpen] = useState(false);
  const openSelectedEdit = useCallback(() => setEditOpen(true), []);
  const setSelectedHidden = useCallback(
    async (exercise: Exercise, hidden: boolean, undoable: boolean) => {
      try {
        await api.updateExercise(exercise.id, { hidden });
        await onExercisesMerged?.();
        showToast({
          message: exerciseHiddenNotice(hidden),
          action: undoable
            ? {
                label: 'Undo',
                run: () => {
                  dismissToast();
                  void setSelectedHidden(exercise, !hidden, false);
                },
              }
            : undefined,
        });
      } catch (caught) {
        showToast({
          message: caught instanceof Error ? caught.message : 'The exercise could not be changed.',
          variant: 'error',
        });
      }
    },
    [onExercisesMerged, showToast, dismissToast],
  );
  const toggleSelectedHidden = useCallback(() => {
    if (selectedExercise) void setSelectedHidden(selectedExercise, !selectedExercise.hidden, true);
  }, [selectedExercise, setSelectedHidden]);

  const backToExercises = useCallback(() => {
    setFullProgress(false);
    requestAnimationFrame(() => {
      window.scrollTo({ top: libraryScroll.current, behavior: 'instant' });
      const button = [
        ...(libraryRoot.current?.querySelectorAll<HTMLButtonElement>('[data-exercise-id]') ?? []),
      ].find((item) => item.dataset.exerciseId === exerciseId);
      button?.focus({ preventScroll: true });
    });
  }, [exerciseId]);
  const progressSessionCount = progress?.points.length ?? null;
  useEffect(() => {
    onDetailChange?.(
      browseFirst && fullProgress && selectedExercise
        ? {
            exercise: selectedExercise,
            sessionCount: progressSessionCount,
            blockName: block?.name ?? null,
            onBack: backToExercises,
            onMerge: canMergeSelected ? openSelectedMerge : undefined,
            onEdit: canEditSelected && selectedExercise.is_custom ? openSelectedEdit : undefined,
            onToggleHidden: canEditSelected ? toggleSelectedHidden : undefined,
          }
        : null,
    );
  }, [
    onDetailChange,
    browseFirst,
    fullProgress,
    selectedExercise,
    progressSessionCount,
    block?.name,
    backToExercises,
    canMergeSelected,
    canEditSelected,
    openSelectedMerge,
    openSelectedEdit,
    toggleSelectedHidden,
  ]);
  useEffect(() => () => onDetailChange?.(null), [onDetailChange]);

  useEffect(() => {
    if (!exerciseId || libraryMode) return;
    let cancelled = false;
    setSessionPage(1);
    setLoading(true);
    setProgress(null);
    setProgressError(null);
    void api
      .exerciseProgress(exerciseId, blockId)
      .then((nextProgress) => {
        if (!cancelled) setProgress(nextProgress);
      })
      .catch(() => {
        if (!cancelled) {
          setProgress(null);
          setProgressError('Could not load exercise progress.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    exerciseId,
    progressAttempt,
    dataRevision,
    libraryMode,
    browseFirst,
    blockId,
    block?.start_date,
    block?.end_date,
  ]);

  useEffect(() => {
    if (!exerciseId || libraryMode) return;
    let cancelled = false;
    void api
      .getWeightMapping(exerciseId)
      .then((next) => {
        if (!cancelled) setMapping({ exerciseId, mapping: next });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [exerciseId, dataRevision, libraryMode]);

  const machineChoice = machineView.exerciseId === exerciseId ? machineView.view : 'all';
  const tableRecordIds = useMemo(
    () => exerciseRecordWorkoutIds(personalRecords, block, exerciseId),
    [personalRecords, exerciseId, block],
  );
  const {
    machineOptions,
    view,
    referenceMachine,
    points: viewPoints,
    defaultView,
    approx,
    heaviest: heaviestSetPoint,
    bestEstimate: estimatedOneRepMaxPoint,
    bestVolume: volumePoint,
    bestEstimatedOneRepMax,
    relativeBest,
    recordIds,
  } = useMemo(
    () => exerciseProgressView(progress, mapping, machineChoice, tableRecordIds),
    [progress, mapping, machineChoice, tableRecordIds],
  );
  const viewDates = useMemo(() => viewPoints.map((point) => point.workout_date), [viewPoints]);
  const { pinchZoom, pinchStart, selectRange } = useRangePinchZoom(
    viewDates,
    displayRange,
    setDisplayRange,
  );
  const metricInfo = PROGRESS_METRICS.find((item) => item.value === metric)!;
  const inRange = progress
    ? progressPointsForChart(viewPoints, metric, displayRange, pinchStart)
    : [];
  const weekly = !browseFirst && metric !== 'volume_kg' && displayRange !== '1m';
  const charted = weekly ? weeklyBestPoints(inRange, (point) => point[metric]) : inRange;
  const latestPoint = inRange.at(-1) ?? null;
  const firstPoint = inRange[0] ?? null;
  const change =
    latestPoint && firstPoint && latestPoint !== firstPoint
      ? latestPoint[metric] - firstPoint[metric]
      : null;
  const changePercent =
    change !== null && firstPoint && firstPoint[metric] > 0
      ? (change / firstPoint[metric]) * 100
      : null;
  const sessionsNewestFirst = viewPoints.slice().reverse();
  const sessionPages = Math.max(1, Math.ceil(sessionsNewestFirst.length / HISTORY_PAGE_SIZE));
  const currentSessionPage = Math.min(sessionPage, sessionPages);
  const sessionCountByYear = new Map(
    groupByYear(sessionsNewestFirst, (point) => point.workout_date).map((group) => [
      group.year,
      group.items.length,
    ]),
  );
  const formatMetric = (value: number) =>
    metric === 'volume_kg'
      ? Math.round(value).toLocaleString('en-GB')
      : Number(value.toFixed(1)).toLocaleString('en-GB');
  const formatMetricKg = (value: number) => formatMetric(weightFromKg(value, weightUnit));
  const chartPoints: TrendPoint[] = charted.map((point) => ({
    date: point.workout_date,
    value: weightFromKg(point[metric], weightUnit),
    id: point.workout_id,
    detail: `${formatWeight(point.raw_best_weight_kg, weightUnit)} × ${point.best_reps}${point.best_rpe === null ? '' : ` @ RPE ${point.best_rpe}`}`,
  }));

  const friendsRanking = (
    <LiftLeaderboardCard
      exerciseId={exerciseId}
      revision={dataRevision}
      onOpenMember={onOpenMember}
    />
  );
  const rangeControls = (
    <div
      ref={rangeIndicatorRef}
      className="range-chips slide-indicator"
      role="tablist"
      aria-label="Exercise progress graph range"
    >
      {TIME_RANGE_OPTIONS.map((option) => (
        <button
          type="button"
          role="tab"
          key={option.value}
          aria-selected={displayRange === option.value}
          aria-label={option.label}
          className={displayRange === option.value ? 'active' : ''}
          onClick={() => {
            if (block && rangeOutgrowsBlock(option.value, block, localDate())) selectBlock('all');
            selectRange(option.value);
          }}
        >
          {RANGE_LABELS[option.value]}
        </button>
      ))}
    </div>
  );

  return (
    <section
      className={`progress-screen ${embedded ? '' : 'content-page'}${browseFirst ? ' exercise-list-detail' : ''}`}
    >
      {browseFirst && fullProgress && !onDetailChange && (
        <button type="button" className="training-back text-link" onClick={backToExercises}>
          <Icon name="chevron-left" /> Exercises
        </button>
      )}
      {browseFirst && (
        <div ref={libraryRoot} hidden={!libraryMode}>
          <ExerciseLibraryList
            exercises={strengthExercises}
            library={exerciseLibrary}
            onCreate={onCreateExercise}
            onMerge={
              onExercisesMerged && exercises.some((item) => item.is_custom)
                ? () => setMergeRequest({})
                : undefined
            }
            onOpen={(id) => {
              libraryScroll.current = window.scrollY;
              setExerciseId(id);
              setFullProgress(true);
              requestAnimationFrame(() => {
                if (onDetailChange) window.scrollTo({ top: 0, behavior: 'instant' });
                else libraryRoot.current?.parentElement?.scrollIntoView?.({ block: 'start' });
              });
            }}
          />
        </div>
      )}
      {mergeRequest && (
        <ExerciseMergeDialog
          exercises={exercises}
          initialSourceId={mergeRequest.sourceId}
          initialTargetId={mergeRequest.targetId}
          onClose={() => setMergeRequest(null)}
          onChanged={() => void onExercisesMerged?.()}
          onMerged={(_sourceId, target) => {
            setMergeRequest(null);
            showToast('Exercises merged');
            setExerciseId(target.id);
            void onExercisesMerged?.();
          }}
        />
      )}
      {editOpen && selectedExercise && (
        <ExerciseEditDialog
          exercise={selectedExercise}
          exercises={exercises}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            showToast('Exercise updated');
            void onExercisesMerged?.();
          }}
        />
      )}
      {sessionId && selectedExercise && (
        <ExerciseSessionSheet
          key={sessionId}
          workoutId={sessionId}
          dataRevision={dataRevision}
          exercise={selectedExercise}
          onClose={() => setSessionId(null)}
          onOpenWorkout={() => {
            setSessionId(null);
            onOpenWorkout(sessionId, selectedExercise.id);
          }}
        />
      )}
      <section
        className="exercise-progress-detail"
        aria-label="Full exercise progress"
        hidden={libraryMode}
      >
        {!onDetailChange && (
          <PageHeader
            headingLevel={embedded ? 2 : 1}
            eyebrow={
              selectedExercise
                ? [
                    selectedExercise.muscle_group,
                    selectedExercise.equipment,
                    progress
                      ? `${progress.points.length} ${progress.points.length === 1 ? 'session' : 'sessions'}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : 'Exercise progress'
            }
            title={selectedExercise?.name ?? 'Progress'}
            onOpenSettings={embedded ? undefined : onOpenSettings}
            actions={
              <>
                {selectedExercise && <ExerciseMuscleHelp exercise={selectedExercise} />}
                {canEditSelected && selectedExercise && (
                  <ExerciseOptionsMenu
                    key={selectedExercise.id}
                    exerciseName={selectedExercise.name}
                    hidden={selectedExercise.hidden}
                    onEdit={selectedExercise.is_custom ? openSelectedEdit : undefined}
                    onMerge={canMergeSelected ? openSelectedMerge : undefined}
                    onToggleHidden={toggleSelectedHidden}
                  />
                )}
                {!browseFirst && (
                  <button
                    className="icon-button-pulse"
                    type="button"
                    aria-label="Select exercise"
                    onClick={() => setPickerRequest((request) => request + 1)}
                  >
                    <Icon name="search" />
                  </button>
                )}
              </>
            }
          />
        )}
        {canMergeSelected && selectedExercise && (
          <ExerciseMergeNudge
            key={selectedExercise.id}
            exercise={selectedExercise}
            exercises={exercises}
            onMerge={openSuggestedMerge}
          />
        )}
        {!browseFirst && (
          <section className="progress-controls">
            <ProgressExerciseSearch
              exercises={strengthExercises}
              exerciseId={exerciseId}
              onChange={setExerciseId}
              openRequest={pickerRequest}
            />
          </section>
        )}
        {!strengthExercises.length && (
          <EmptyState
            title="No exercises yet"
            body="Add a strength exercise to a workout to start tracking its progress."
          />
        )}
        {exerciseId && !progress && !progressError && <LoadingState />}
        {progressError && (
          <div className="exercise-progress-error" role="alert">
            <p>{progressError}</p>
            <button
              type="button"
              className="pulse-button link small"
              onClick={() => setProgressAttempt((attempt) => attempt + 1)}
            >
              Retry
            </button>
          </div>
        )}
        {progress && (
          <div className={loading ? 'progress-refreshing' : ''}>
            <div
              ref={metricIndicatorRef}
              className="segmented-control slide-indicator"
              role="tablist"
              aria-label="Progress metric"
            >
              {PROGRESS_METRICS.map((item) => (
                <button
                  type="button"
                  role="tab"
                  key={item.value}
                  aria-selected={metric === item.value}
                  className={metric === item.value ? 'active' : ''}
                  onClick={() => setMetric(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {(machineOptions.length > 0 || (mapping?.machines.length ?? 0) > 1) && (
              <div className="progress-machine-filter">
                {machineOptions.length > 0 && (
                  <div className="progress-machine-chips" role="group" aria-label="Machine">
                    <button
                      type="button"
                      aria-pressed={view === 'all'}
                      onClick={() => setMachineView({ exerciseId, view: 'all' })}
                    >
                      {mapping?.enabled ? 'All machines ≈' : 'All machines'}
                    </button>
                    {machineOptions.map((machine) => (
                      <button
                        type="button"
                        key={machine.id}
                        aria-pressed={view === machine.id}
                        title={machine.caption}
                        onClick={() => setMachineView({ exerciseId, view: machine.id })}
                      >
                        {machine.caption}
                      </button>
                    ))}
                  </div>
                )}
                {(mapping?.machines.length ?? 0) > 1 && (
                  <MachineWeightTip mapping={mapping} onOpen={() => setMappingOpen(true)}>
                    <button
                      type="button"
                      className={`progress-machine-settings${mapping?.enabled ? ' is-on' : ''}`}
                      aria-label={
                        mapping?.enabled
                          ? 'Machine weights, normalised'
                          : 'Normalise machine weights'
                      }
                      onClick={() => setMappingOpen(true)}
                    >
                      {mapping?.enabled ? 'Normalised' : 'Normalise'}
                    </button>
                  </MachineWeightTip>
                )}
              </div>
            )}
            {mappingOpen && mapping && (
              <MachineWeightsDialog
                exerciseId={progress.exercise.id}
                exerciseName={progress.exercise.name}
                mapping={mapping}
                progress={progress}
                partialHistory={Boolean(blockId)}
                weightUnit={weightUnit}
                onClose={() => setMappingOpen(false)}
                onSaved={(next) => {
                  setMapping({ exerciseId: progress.exercise.id, mapping: next });
                  setMappingOpen(false);
                  showToast('Machine weights saved');
                  // PRs are recalculated in the reference machine's weights.
                  void onRecordsChange?.();
                }}
              />
            )}
            {viewPoints.length ? (
              <>
                <section className={browseFirst ? 'pulse-card exercise-progress-chart' : undefined}>
                  <div className="progress-hero">
                    <div className="progress-hero-summary">
                      <strong className="progress-hero-value">
                        {latestPoint ? `${approx}${formatMetricKg(latestPoint[metric])}` : '–'}
                        <small>{weightUnit}</small>
                      </strong>
                      <p className="progress-hero-caption">
                        {latestPoint
                          ? `${metricInfo.series}${referenceMachine ? ` in ${referenceMachine.caption} weights` : ''} · latest session ${shortDate(latestPoint.workout_date)}`
                          : 'No sessions in this range'}
                      </p>
                      {change !== null && firstPoint && (
                        <p
                          className={`progress-delta ${change > 0 ? 'up' : change < 0 ? 'down' : ''}`}
                        >
                          <Icon name={change >= 0 ? 'up' : 'down'} />
                          {change >= 0 ? '+' : '−'}
                          {formatMetricKg(Math.abs(change))} {weightUnit}
                          {changePercent !== null &&
                            ` (${change >= 0 ? '+' : '−'}${Math.abs(changePercent).toFixed(1)}%)`}{' '}
                          since {dayMonth(firstPoint.workout_date)}
                        </p>
                      )}
                      {block && (
                        // The chart, bests and sessions only cover this block; say so, and let
                        // the whole history return in one tap.
                        <button
                          type="button"
                          className="progress-block-scope"
                          aria-label={`Showing the ${block.name} block only. Show all time`}
                          onClick={() => selectBlock('all')}
                        >
                          <i
                            aria-hidden="true"
                            style={{
                              background: blockColor(blockConfig.blocks, block, localDate()),
                            }}
                          />
                          {block.name}
                          <Icon name="close" />
                        </button>
                      )}
                    </div>
                    {!browseFirst && selectedExercise && (
                      <ExerciseIcon exercise={selectedExercise} />
                    )}
                  </div>
                  {rangeControls}
                  <LandscapeChartFrame
                    title={`${progress.exercise.name} · ${metricInfo.series}${weekly ? ' (best per week)' : ''}`}
                    controls={null}
                    yearLines={crossesNewYear(chartPoints.map((point) => point.date))}
                  >
                    {(expanded, close, showYearLines) => (
                      <TrendChart
                        points={chartPoints}
                        label={`${progress.exercise.name} ${metricInfo.series}${weekly ? ', best per week' : ''}`}
                        seriesLabel={
                          weekly
                            ? `Best ${metric === 'estimated_1rm' ? 'est. 1RM' : 'top weight'} that week`
                            : metricInfo.series
                        }
                        unit={weightUnit}
                        height={200}
                        fillHeight={expanded}
                        markRecords={metric !== 'volume_kg'}
                        formatValue={formatMetric}
                        pinchZoom={pinchZoom}
                        yearLines={showYearLines}
                        onSelect={
                          browseFirst
                            ? undefined
                            : (point) => {
                                if (!point.id) return;
                                close();
                                onOpenWorkout(point.id, progress.exercise.id);
                              }
                        }
                      />
                    )}
                  </LandscapeChartFrame>
                </section>
                <div>
                  <section className="stat-grid" aria-label="Personal bests">
                    <div>
                      <span>Heaviest set</span>
                      <b className="num">
                        {heaviestSetPoint
                          ? `${approx}${formatWeight(heaviestSetPoint.best_weight_kg, weightUnit)} × ${heaviestSetPoint.best_reps}`
                          : '–'}
                      </b>
                      <small>
                        {heaviestSetPoint
                          ? shortDate(heaviestSetPoint.workout_date)
                          : 'No sets yet'}
                      </small>
                    </div>
                    <div>
                      <span>Best est. 1RM</span>
                      <b className="num">
                        {approx}
                        {formatWeight(bestEstimatedOneRepMax, weightUnit, 1)}
                      </b>
                      <small>
                        {estimatedOneRepMaxPoint
                          ? shortDate(estimatedOneRepMaxPoint.workout_date)
                          : 'Epley'}
                      </small>
                    </div>
                    <div>
                      <span>Best session volume</span>
                      <b className="num">
                        {volumePoint
                          ? `${approx}${formatWeight(volumePoint.volume_kg, weightUnit, 0)}`
                          : '–'}
                      </b>
                      <small>
                        {volumePoint ? shortDate(volumePoint.workout_date) : 'Working sets'}
                      </small>
                    </div>
                    <div>
                      <span>Relative strength</span>
                      <b className="num">
                        {relativeBest?.relative_strength != null
                          ? `${approx}${relativeBest.relative_strength.toFixed(2)}× BW`
                          : '–'}
                      </b>
                      <small>
                        {relativeBest?.bodyweight_kg != null
                          ? `at ${formatWeight(relativeBest.bodyweight_kg, weightUnit)} BW · ${shortDate(relativeBest.workout_date)}`
                          : 'No bodyweight recorded'}
                      </small>
                    </div>
                  </section>
                  {friendsRanking}
                  <section
                    ref={sessionsRef}
                    className="pulse-card progress-sessions"
                    aria-label="Exercise session history"
                  >
                    <header className="pulse-card-header">
                      <h2>Sessions</h2>
                      <span>Best set · {metricInfo.label}</span>
                    </header>
                    {groupByYear(
                      sessionsNewestFirst.slice(
                        (currentSessionPage - 1) * HISTORY_PAGE_SIZE,
                        currentSessionPage * HISTORY_PAGE_SIZE,
                      ),
                      (point) => point.workout_date,
                    ).map((group) => (
                      <section
                        key={group.year}
                        className="session-year"
                        aria-labelledby={`session-year-${group.year}`}
                      >
                        <h3 className="session-year-header">
                          <span id={`session-year-${group.year}`} className="num">
                            {group.year}
                          </span>
                          <small>
                            {sessionCountByYear.get(group.year)}{' '}
                            {sessionCountByYear.get(group.year) === 1 ? 'session' : 'sessions'}
                          </small>
                        </h3>
                        <ul>
                          {group.items.map((point) => (
                            <li key={point.workout_id}>
                              <button
                                type="button"
                                aria-label={`View ${progress.exercise.name} in workout from ${prettyDate(point.workout_date)}`}
                                onClick={() =>
                                  browseFirst
                                    ? setSessionId(point.workout_id)
                                    : onOpenWorkout(point.workout_id, progress.exercise.id)
                                }
                              >
                                <span className="session-date">
                                  {shortDate(point.workout_date)}
                                  {recordIds.has(point.workout_id) &&
                                    (() => {
                                      const pointRecords = personalRecords.filter(
                                        (record) =>
                                          record.workout_id === point.workout_id &&
                                          record.exercise_id === exerciseId,
                                      );
                                      return (
                                        <em
                                          className={`pr-chip${pointRecords.some(isAllTimeRecord) ? ' is-all-time' : ''}`}
                                        >
                                          {defaultView ? recordBadgeLabel(pointRecords) : 'PR'}
                                        </em>
                                      );
                                    })()}
                                </span>
                                <span className="session-set num">
                                  {formatWeight(point.raw_best_weight_kg, weightUnit)} ×{' '}
                                  {point.best_reps}
                                  {point.best_rpe !== null && <small> @{point.best_rpe}</small>}
                                </span>
                                <b className="num">
                                  {approx}
                                  {formatMetricKg(point[metric])}
                                </b>
                                <Icon name="chevron-right" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                    <PaginationControls
                      currentPage={currentSessionPage}
                      totalPages={sessionPages}
                      onPageChange={setSessionPage}
                      label="session"
                      scrollTarget={sessionsRef}
                    />
                  </section>
                </div>
              </>
            ) : (
              <>
                <EmptyState
                  title="No data yet"
                  body="Complete this exercise in a workout to start its progress graph."
                />
                {friendsRanking}
              </>
            )}
          </div>
        )}
      </section>
    </section>
  );
}

function SettingsScreen({
  exercises,
  active,
  selectedGroup,
  onSelectGroup,
  onOpenSplit,
  splitName,
  guideActive,
  workouts,
  historySummary,
  measurements,
  restTimerEnabled,
  onRestTimerEnabledChange,
  showRestTimes,
  onShowRestTimesChange,
  reduceMotion,
  onReduceMotionChange,
  bodyTrendPreference,
  onBodyTrendPreferenceChange,
  onImportWorkouts,
  onUndoImport,
  csvGuideOpen,
  onCsvGuideOpenChange,
  onDeleteSamples,
  onRestoreArchive,
  onDataChange,
  account,
  onOpenProfile,
  openFeedback,
  onOpenAdmin,
  releaseVersion,
  onOpenReleaseNotes,
  updateCheck,
  onOpenHomeScreenGuide,
  onOpenAppGuide,
}: {
  exercises: Exercise[];
  active: boolean;
  selectedGroup: SettingsGroupId | null;
  onSelectGroup: (group: SettingsGroupId | null) => void;
  onOpenSplit: () => void;
  splitName: string | null;
  guideActive: boolean;
  releaseVersion: string;
  onOpenReleaseNotes: () => void;
  updateCheck: ReactNode;
  onOpenHomeScreenGuide: () => void;
  onOpenAppGuide: () => void;
  account: User | null;
  onOpenProfile: () => void;
  openFeedback: number;
  /** Present only for administrators. */
  onOpenAdmin?: () => void;
  workouts: TrackedWorkout[];
  historySummary: WorkoutHistorySummary | null;
  measurements: BodyMeasurement[];
  restTimerEnabled: boolean;
  onRestTimerEnabledChange: (enabled: boolean) => void;
  showRestTimes: boolean;
  onShowRestTimesChange: (enabled: boolean) => void;
  reduceMotion: boolean;
  onReduceMotionChange: (reduced: boolean) => void;
  bodyTrendPreference: BodyTrendPreference;
  onBodyTrendPreferenceChange: (preference: BodyTrendPreference) => void;
  onImportWorkouts: (file: File, options?: WorkoutImportOptions) => Promise<void>;
  onUndoImport: (id: string) => Promise<void>;
  csvGuideOpen: boolean;
  onCsvGuideOpenChange: (open: boolean) => void;
  onDeleteSamples: () => Promise<void>;
  onRestoreArchive: (file: File) => Promise<void>;
  onDataChange: () => Promise<void>;
}) {
  useSettingsPageJump('settings', active);
  const workoutDataSection = useRef<HTMLElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<RestAlertStatus>(() =>
    pushNotificationsSupported() ? 'checking' : 'unsupported',
  );
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const { show: showToast } = useToast();
  const workoutTypes = useWorkoutTypes();

  useEffect(() => {
    if (!csvGuideOpen) return;
    // After opening Settings resets the page scroll, show Workout data behind the guide.
    const frame = requestAnimationFrame(() => {
      const section = workoutDataSection.current;
      const top = section?.getBoundingClientRect().top ?? 0;
      if (top < 0 || top > window.innerHeight * 0.6) {
        section?.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [csvGuideOpen]);

  useEffect(() => {
    if (!pushNotificationsSupported()) return;
    let active = true;
    const syncPushState = () => {
      void existingPhonePushSubscription()
        .then((subscription) => {
          if (!active) return;
          setNotificationStatus(
            subscription
              ? 'enabled'
              : Notification.permission === 'denied'
                ? 'blocked'
                : 'available',
          );
        })
        .catch(() => {
          if (active) setNotificationStatus('available');
        });
    };
    syncPushState();
    window.addEventListener(PHONE_PUSH_PREFERENCE_EVENT, syncPushState);
    return () => {
      active = false;
      window.removeEventListener(PHONE_PUSH_PREFERENCE_EVENT, syncPushState);
    };
  }, []);

  async function togglePhoneNotifications() {
    if (notificationStatus === 'checking' || notificationStatus === 'enabling') return;
    setNotificationError(null);
    if (notificationStatus === 'enabled') {
      setNotificationStatus('enabling');
      await disablePhonePushNotifications();
      setNotificationStatus('available');
      return;
    }

    setNotificationStatus('enabling');
    try {
      await enablePhonePushNotifications();
      setNotificationStatus('enabled');
    } catch (reason) {
      setNotificationStatus(Notification.permission === 'denied' ? 'blocked' : 'available');
      setNotificationError(
        reason instanceof Error ? reason.message : 'Could not enable phone notifications.',
      );
    }
  }

  // Only recent workouts may be loaded; export ranges count back from the latest one logged.
  const workoutDates = exportWorkoutDates(workouts, historySummary?.last_workout_date);

  return (
    <section className="settings-screen content-page" data-settings-page="settings">
      <SettingsHub
        active={active}
        includeAccount={account !== null}
        accountName={account?.display_name}
        onOpenProfile={onOpenProfile}
        revealData={csvGuideOpen}
        revealHelp={active && guideActive}
        selected={selectedGroup}
        onSelect={onSelectGroup}
        groups={[
          {
            id: 'training',
            icon: 'timer',
            description: 'Units, weekly goals, rest timers and workout types.',
            content: (
              <>
                <button
                  id="training-split-settings"
                  className="training-split-setting"
                  type="button"
                  onClick={onOpenSplit}
                >
                  <strong>Your split</strong>
                  <span>{splitName ?? 'Automatic'}</span>
                  <Icon name="chevron-right" />
                </button>
                <TrainingPreferencesPanel exercises={exercises} onDataChange={onDataChange} />

                <section className="settings-panel panel" aria-labelledby="rest-settings-title">
                  <header>
                    <h2 id="rest-settings-title">Between sets</h2>
                  </header>
                  <div className="notification-setting-row">
                    <div>
                      <strong>Rest timer</strong>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Rest timer"
                      aria-checked={restTimerEnabled}
                      className={restTimerEnabled ? 'is-on' : ''}
                      onClick={() => onRestTimerEnabledChange(!restTimerEnabled)}
                    >
                      <span />
                      {restTimerEnabled ? 'On' : 'Off'}
                    </button>
                  </div>
                  <div className="notification-setting-row">
                    <div>
                      <strong>Show rest times</strong>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Show rest times"
                      aria-checked={showRestTimes}
                      className={showRestTimes ? 'is-on' : ''}
                      onClick={() => onShowRestTimesChange(!showRestTimes)}
                    >
                      <span />
                      {showRestTimes ? 'On' : 'Off'}
                    </button>
                  </div>
                  <DefaultRestSetting />
                </section>
                {account && <WorkoutAutoSaveSetting userId={account.id} />}
                {account && <FreshStartSetting />}
                <WorkoutTypesSettings
                  collapsible
                  types={workoutTypes.types}
                  onTypesChange={workoutTypes.applySaved}
                  loading={workoutTypes.loading}
                  error={workoutTypes.error}
                  onRetry={() => void workoutTypes.reload()}
                />

                <section className="settings-panel panel" aria-labelledby="bodyweight-trend-title">
                  <header>
                    <div>
                      <p className="section-kicker">BODYWEIGHT</p>
                      <h2 id="bodyweight-trend-title">Bodyweight chart</h2>
                    </div>
                  </header>
                  <div className="body-trend-default-fields">
                    <label>
                      Default statistic
                      <select
                        aria-label="Default bodyweight trend statistic"
                        value={bodyTrendPreference.statistic}
                        onChange={(event) =>
                          onBodyTrendPreferenceChange({
                            ...bodyTrendPreference,
                            statistic: event.target.value as BodyTrendStatistic,
                          })
                        }
                      >
                        <option value="average">Average</option>
                        <option value="median">Median</option>
                      </select>
                    </label>
                    <label>
                      Default duration
                      <select
                        aria-label="Default bodyweight trend duration"
                        value={bodyTrendPreference.duration}
                        onChange={(event) =>
                          onBodyTrendPreferenceChange({
                            ...bodyTrendPreference,
                            duration: event.target.value as BodyTrendDuration,
                          })
                        }
                      >
                        {BODY_TREND_DURATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>
              </>
            ),
          },
          {
            id: 'appearance',
            icon: 'sun',
            description: 'Light or dark, accent colours and reduced motion.',
            content: (
              <>
                <ColourThemePanel />
                <section className="settings-panel panel" aria-labelledby="motion-settings-title">
                  <header>
                    <div>
                      <p className="section-kicker">MOTION</p>
                      <h2 id="motion-settings-title">Animations</h2>
                    </div>
                  </header>
                  <div className="notification-setting-row">
                    <div>
                      <strong>Reduce animations</strong>
                      {!reduceMotion && systemPrefersReducedMotion() && (
                        <small>
                          Your phone already asks for reduced motion, so the app follows it
                        </small>
                      )}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Reduce animations"
                      aria-checked={reduceMotion}
                      className={reduceMotion ? 'is-on' : ''}
                      onClick={() => onReduceMotionChange(!reduceMotion)}
                    >
                      <span />
                      {reduceMotion ? 'On' : 'Off'}
                    </button>
                  </div>
                </section>
              </>
            ),
          },
          {
            id: 'notifications',
            icon: 'bell',
            description: 'Rest alerts, workout reminders and video updates.',
            content: (
              <>
                <section
                  className="settings-panel panel"
                  aria-labelledby="workout-sharing-settings-title"
                >
                  <header>
                    <h2 id="workout-sharing-settings-title">Workout sharing</h2>
                  </header>
                  <WorkoutShareReminderSetting />
                </section>
                <section
                  className="settings-panel panel"
                  aria-labelledby="notification-settings-title"
                >
                  <header>
                    <div>
                      <p className="section-kicker">ALERTS</p>
                      <h2 id="notification-settings-title">Phone alerts</h2>
                    </div>
                  </header>
                  <div className="notification-setting-row">
                    <div>
                      <strong>Phone alerts</strong>
                      {notificationStatus === 'unsupported' && (
                        <small>
                          Use an installed app and a supported browser to enable notifications
                        </small>
                      )}
                      {notificationStatus === 'blocked' && <small>Blocked in phone settings</small>}
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-label="Phone alerts"
                      aria-checked={notificationStatus === 'enabled'}
                      className={notificationStatus === 'enabled' ? 'is-on' : ''}
                      disabled={
                        notificationStatus === 'checking' ||
                        notificationStatus === 'enabling' ||
                        notificationStatus === 'unsupported'
                      }
                      onClick={() => void togglePhoneNotifications()}
                    >
                      <span />
                      {notificationStatus === 'enabled' ? 'On' : 'Off'}
                    </button>
                  </div>
                  {notificationError && (
                    <p className="inline-error" role="alert">
                      {notificationError}
                    </p>
                  )}
                </section>

                <button type="button" className="profile-secondary" onClick={onOpenHomeScreenGuide}>
                  How to install the app
                </button>
              </>
            ),
          },
          ...(account
            ? [
                {
                  id: 'account' as const,
                  icon: 'user' as const,
                  description: 'Profile details, sharing, password and sign-in.',
                  content: (
                    <>
                      {account && (
                        <section
                          className="settings-panel panel"
                          aria-labelledby="account-settings-title"
                        >
                          <header>
                            <div>
                              <p className="section-kicker">ACCOUNT</p>
                              <h2 id="account-settings-title">{account.display_name}</h2>
                            </div>
                          </header>
                          <p>{account.username}</p>
                          <ProfileAccountId accountId={account.id} />
                          <button
                            type="button"
                            className="profile-secondary"
                            onClick={onOpenProfile}
                          >
                            View profile
                          </button>
                        </section>
                      )}
                      <AccountSettings />
                      <AccountSessionSettings />
                    </>
                  ),
                },
              ]
            : []),
          {
            id: 'data',
            icon: 'link',
            description: 'Import history, export your data and connect YouTube.',
            content: (
              <>
                <section
                  ref={workoutDataSection}
                  className="settings-panel panel workout-data-panel"
                  aria-labelledby="workout-data-title"
                >
                  <header>
                    <div>
                      <p className="section-kicker">DATA</p>
                      <h2 id="workout-data-title">Import &amp; export</h2>
                    </div>
                  </header>
                  <button
                    type="button"
                    className="pulse-button secondary block workout-data-guide-button"
                    onClick={() => onCsvGuideOpenChange(true)}
                  >
                    Show guide
                  </button>
                  <div className="settings-actions data-transfer-actions">
                    <WorkoutCsvImport
                      onImport={onImportWorkouts}
                      onUndoImport={onUndoImport}
                      guideOpen={csvGuideOpen}
                      onGuideOpenChange={onCsvGuideOpenChange}
                    />
                    <button
                      type="button"
                      className="pulse-button secondary"
                      onClick={() => setExportOpen(true)}
                    >
                      ↓ Export data
                    </button>
                    {(historySummary?.has_sample_workouts ??
                      workouts.some((workout) => workout.is_sample)) && (
                      <InlineConfirmButton
                        className="sample-clear pulse-button danger-soft block"
                        label="Remove sample workouts"
                        confirmLabel="Confirm removal"
                        size="default"
                        onConfirm={onDeleteSamples}
                      />
                    )}
                  </div>
                </section>

                {account && <AccountArchivePanel onRestore={onRestoreArchive} />}

                <YouTubeConnectionPanel canConnect={canUploadVideos(account)} />
              </>
            ),
          },
          {
            id: 'help',
            icon: 'help',
            description: 'App guides, installation, updates and feedback.',
            content: (
              <>
                <TipsSettings />
                <SetupGuidesSettings />
                <section
                  className="settings-panel panel"
                  aria-labelledby="home-screen-settings-title"
                  data-guide-target="installation"
                >
                  <header>
                    <div>
                      <p className="section-kicker">PHONE APP</p>
                      <h2 id="home-screen-settings-title">Add to Home Screen</h2>
                    </div>
                    <button
                      type="button"
                      className="profile-secondary release-settings-action"
                      onClick={onOpenHomeScreenGuide}
                    >
                      Show steps
                    </button>
                  </header>
                  <p>
                    {runningAsInstalledApp()
                      ? 'You are already using the installed app. View the steps to set up another browser or device.'
                      : 'Open Relay full screen from an icon on your phone, like an app.'}
                  </p>
                  <HomeScreenShortcut onUnavailable={onOpenHomeScreenGuide} />
                </section>
                <section
                  className="settings-panel panel"
                  aria-labelledby="app-guide-settings-title"
                >
                  <header>
                    <div>
                      <p className="section-kicker">GET STARTED</p>
                      <h2 id="app-guide-settings-title">App guide</h2>
                    </div>
                    <button
                      type="button"
                      className="profile-secondary release-settings-action"
                      onClick={onOpenAppGuide}
                    >
                      Replay guide
                    </button>
                  </header>
                  <div className="guide-contribute">
                    <a href={PROJECT_URL} target="_blank" rel="noopener noreferrer">
                      GitHub repository <Icon name="external" />
                    </a>
                    <a href={CONTRIBUTING_URL} target="_blank" rel="noopener noreferrer">
                      How to contribute <Icon name="external" />
                    </a>
                  </div>
                </section>
                <section className="settings-panel panel" aria-labelledby="release-settings-title">
                  <header>
                    <div>
                      <p className="section-kicker">VERSION {releaseVersion}</p>
                      <h2 id="release-settings-title">What's new</h2>
                    </div>
                    <button
                      type="button"
                      className="profile-secondary release-settings-action"
                      onClick={onOpenReleaseNotes}
                    >
                      View changes
                    </button>
                  </header>
                  {updateCheck}
                </section>
                <section className="settings-panel panel" aria-labelledby="feedback-settings-title">
                  <header>
                    <div>
                      <p className="section-kicker">YOUR IDEAS</p>
                      <h2 id="feedback-settings-title">Feedback &amp; feature requests</h2>
                    </div>
                  </header>
                  <FeedbackForm allowAnother />
                </section>
                {onOpenAdmin && (
                  <section className="settings-panel panel" aria-labelledby="admin-settings-title">
                    <header>
                      <div>
                        <p className="section-kicker">ADMIN</p>
                        <h2 id="admin-settings-title">Admin console</h2>
                      </div>
                    </header>
                    <p>Manage accounts, video access, sign-ups and server health.</p>
                    {openFeedback > 0 && (
                      <p>
                        {openFeedback} feedback {openFeedback === 1 ? 'message' : 'messages'}{' '}
                        waiting for review.
                      </p>
                    )}
                    <button type="button" className="profile-secondary" onClick={onOpenAdmin}>
                      Open admin console
                    </button>
                  </section>
                )}
              </>
            ),
          },
        ]}
      />
      {exportOpen && (
        <DataExportDialog
          workoutDates={workoutDates}
          bodyweightDates={measurements.map((measurement) => measurement.measurement_date)}
          onClose={() => setExportOpen(false)}
          onExported={(message) => {
            setExportOpen(false);
            showToast(message);
          }}
        />
      )}
    </section>
  );
}

function HistoryScreen({
  exerciseLibrary,
  dataRevision,
  workouts,
  syncingWorkoutIds = [],
  categoryColors,
  measurements,
  exercises,
  onEdit,
  onResume,
  onDelete,
  personalRecords,
  onDataChange,
  onCreateExercise,
  initialOpenId,
  section,
  onSectionChange,
  onOpenExercise,
  onOpenMember,
  onOpenWorkout,
  initialExerciseId,
  openMachineWeights = false,
  onMachineWeightsOpened,
  initialMovementId,
  weekStartDay,
  heatmap,
  trainingSplit,
  historySummary,
  olderHistory,
  activeWorkout,
  activeWorkoutDate,
  onResumeWorkout,
  onStartWorkout,
  onReplaceActiveWorkout,
  onEditSplit,
  onOpenSettings,
  accountActions,
  rootRequest = 0,
}: {
  exerciseLibrary: ExerciseLibraryState;
  dataRevision: string | null;
  workouts: TrackedWorkout[];
  /** Finished workouts still syncing, shown from this device's copy without their actions. */
  syncingWorkoutIds?: string[];
  categoryColors: WorkoutTypeColors;
  measurements: BodyMeasurement[];
  exercises: Exercise[];
  onEdit: (workout: TrackedWorkout) => void;
  onResume: (workout: TrackedWorkout) => void;
  onDelete: (workout: TrackedWorkout) => void;
  personalRecords: PersonalRecord[];
  onDataChange: () => Promise<void>;
  onCreateExercise: (input: ExerciseCreateInput) => Promise<Exercise>;
  initialOpenId: string | null;
  section: HistorySection;
  onSectionChange: (section: HistorySection) => void;
  onOpenExercise: (exerciseId: string) => void;
  onOpenMember?: (member: Pick<SharedProfileSummary, 'id' | 'display_name'>) => void;
  onOpenWorkout: (workoutId: string, exerciseId: string | null) => void;
  initialExerciseId: string | null;
  openMachineWeights?: boolean;
  onMachineWeightsOpened?: () => void;
  initialMovementId: string | null;
  weekStartDay: number;
  heatmap: DashboardData['heatmap'];
  trainingSplit: TrainingSplit | null;
  historySummary: WorkoutHistorySummary | null;
  olderHistory: OlderHistoryProps;
  activeWorkout: boolean;
  activeWorkoutDate: string | null;
  onResumeWorkout: () => void;
  onStartWorkout: (workoutDate?: string, start?: PlannedStart) => void;
  onReplaceActiveWorkout: (workoutDate: string) => void;
  onEditSplit?: () => void;
  onOpenSettings: () => void;
  accountActions?: ReactNode;
  /** Each increase returns from an exercise's detail to the list (the tab bar's re-tap). */
  rootRequest?: number;
}) {
  const weightUnit = useWeightUnit();
  const [exerciseHeader, setExerciseHeader] = useState<ExerciseDetailHeader | null>(null);
  const exerciseHeaderRef = useRef(exerciseHeader);
  exerciseHeaderRef.current = exerciseHeader;
  useEffect(() => {
    if (rootRequest) exerciseHeaderRef.current?.onBack();
  }, [rootRequest]);
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false);
  const [createdExercise, setCreatedExercise] = useState<Exercise | null>(null);
  const openExerciseCreation = () => {
    setCreatedExercise(null);
    setCreateExerciseOpen(true);
  };
  const { types } = useWorkoutTypes();
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [chosenHistoryPage, setChosenHistoryPage] = useState<number | null>(null);
  const [targetExerciseId, setTargetExerciseId] = useState<string | null>(
    initialOpenId ? initialExerciseId : null,
  );
  const [targetMovementId, setTargetMovementId] = useState<string | null>(
    initialOpenId ? initialMovementId : null,
  );
  const [expandedPhoto, setExpandedPhoto] = useState<MachinePhoto | null>(null);
  const [machineFilter, setMachineFilter] = useState<MachineFilter | null>(null);
  const [machinePickerOpen, setMachinePickerOpen] = useState(false);
  const [machineHistory, setMachineHistory] = useState<{
    photoId: string;
    workouts: TrackedWorkout[];
  } | null>(null);
  const [machineHistoryError, setMachineHistoryError] = useState<string | null>(null);
  const openFirstMachineWorkoutRef = useRef(false);
  const machineFilterRef = useRef<HTMLElement>(null);
  const [machinePage, setMachinePage] = useState(1);
  const machineListRef = useRef<HTMLElement>(null);
  const openWorkoutSummaryRef = useRef<HTMLButtonElement>(null);
  const targetExerciseRef = useRef<HTMLDivElement>(null);
  const revealWorkoutRef = useRef(initialOpenId !== null);
  const sessionListRef = useRef<HTMLDivElement>(null);
  const today = localDate();
  const machineFilterId = machineFilter?.photo.id ?? null;
  const machineWorkouts =
    machineHistory && machineHistory.photoId === machineFilterId ? machineHistory.workouts : null;
  const machinePages = Math.max(1, Math.ceil((machineWorkouts?.length ?? 0) / LIST_PAGE_SIZE));
  const currentMachinePage = Math.min(machinePage, machinePages);
  const { hasOlder, loadingOlder, olderError, onLoadOlder, historyStart } = olderHistory;
  const oldestWorkoutDate = [historySummary?.first_workout_date, workouts.at(-1)?.workout_date]
    .filter((date): date is string => Boolean(date))
    .sort()[0];
  const pageAnchor = historyPageAnchor(
    today,
    [historySummary?.last_workout_date, workouts[0]?.workout_date]
      .filter((date): date is string => Boolean(date))
      .sort()
      .at(-1),
  );
  const historyPages = historyPageCount(oldestWorkoutDate, pageAnchor, weekStartDay);
  // A workout opened from elsewhere starts on its page until another page is chosen.
  const targetWorkoutDate = initialOpenId
    ? workouts.find((item) => item.id === initialOpenId)?.workout_date
    : undefined;
  const historyPage = Math.min(
    historyPages,
    chosenHistoryPage ??
      (targetWorkoutDate ? historyPageForDate(targetWorkoutDate, pageAnchor, weekStartDay) : 1),
  );
  const pageWindow = historyPageWindow(pageAnchor, weekStartDay, historyPage);
  const pageNeedsOlder = hasOlder && pageWindow.start < historyStart;
  // Types switched off in the calendar legend leave the session list and its week totals too.
  const [hiddenTypes, setHiddenTypes] = useState<ReadonlySet<string>>(() => new Set());
  const weekGroups = useMemo(
    () =>
      groupWorkoutsByWeek(
        workouts.filter(
          (workout) =>
            workout.workout_date >= pageWindow.start &&
            (pageWindow.end === null || workout.workout_date <= pageWindow.end) &&
            !hiddenTypes.has(effectiveWorkoutType(workout, types).id),
        ),
        weekStartDay,
      ),
    [hiddenTypes, pageWindow.end, pageWindow.start, types, weekStartDay, workouts],
  );
  const recordCounts = useMemo(() => recordCountsByWorkout(personalRecords), [personalRecords]);
  const sectionIndicatorRef = useSlidingIndicator<HTMLDivElement>(section);
  // Each section stays mounted once opened, so switching back only reveals it instead of
  // rebuilding the calendar and charts.
  const [visitedSections, setVisitedSections] = useState(() => new Set<HistorySection>([section]));
  if (!visitedSections.has(section)) setVisitedSections(new Set([...visitedSections, section]));
  const defaultExerciseId = useMemo(
    () => mostTrainedExerciseId(workouts, today),
    [today, workouts],
  );
  const totalWorkouts = Math.max(historySummary?.total_workouts ?? 0, workouts.length);

  // Jumping to an older page reads earlier months, one chunk per loaded start, until that page's
  // weeks are loaded.
  useEffect(() => {
    if (section === 'history' && pageNeedsOlder && !loadingOlder && !olderError) onLoadOlder();
  }, [historyStart, loadingOlder, olderError, onLoadOlder, pageNeedsOlder, section]);

  function changeHistoryPage(page: number) {
    setChosenHistoryPage(page);
    setOpenId(null);
  }

  // Loaded from the server, so a machine last used long ago is found even when older history is
  // not loaded here. Reloads after edits, which replace the workouts list.
  useEffect(() => {
    if (!machineFilterId) return;
    let active = true;
    api
      .machinePhotoWorkouts(machineFilterId)
      .then((items) => {
        if (!active) return;
        setMachineHistoryError(null);
        setMachineHistory({ photoId: machineFilterId, workouts: items });
        if (openFirstMachineWorkoutRef.current) {
          openFirstMachineWorkoutRef.current = false;
          setOpenId(items[0]?.id ?? null);
        }
      })
      .catch((loadError: unknown) => {
        if (active)
          setMachineHistoryError(
            loadError instanceof Error
              ? loadError.message
              : 'Could not load the workouts for this machine.',
          );
      });
    return () => {
      active = false;
    };
  }, [machineFilterId, workouts]);

  useEffect(() => {
    if (!machineFilterId) return;
    const frame = window.requestAnimationFrame(() =>
      machineFilterRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [machineFilterId]);

  function filterByMachine(filter: MachineFilter) {
    setTargetMovementId(null);
    setMachinePickerOpen(false);
    setExpandedPhoto(null);
    setMachineHistoryError(null);
    setMachineFilter(filter);
    setMachinePage(1);
    setTargetExerciseId(filter.photo.exercise_id);
    setOpenId(null);
    openFirstMachineWorkoutRef.current = true;
  }

  function clearMachineFilter() {
    setTargetMovementId(null);
    setMachineFilter(null);
    setMachineHistory(null);
    setMachineHistoryError(null);
    setExpandedPhoto(null);
    setTargetExerciseId(null);
    setOpenId(null);
  }

  /** Opens a calendar day's workout as its session card, on its page, and scrolls to it. */
  function revealWorkout(workout: TrackedWorkout) {
    if (machineFilter) clearMachineFilter();
    setChosenHistoryPage(historyPageForDate(workout.workout_date, pageAnchor, weekStartDay));
    setTargetExerciseId(null);
    setTargetMovementId(null);
    setOpenId(workout.id);
    revealWorkoutRef.current = true;
  }

  function renderWorkoutCard(workout: TrackedWorkout) {
    return (
      <HistoryWorkoutCard
        key={workout.id}
        workout={workout}
        bodyweight={bodyweightOn(measurements, workout.workout_date)}
        open={openId === workout.id}
        summaryRef={openId === workout.id ? openWorkoutSummaryRef : null}
        targetExerciseId={targetExerciseId}
        targetMovementId={targetMovementId}
        targetExerciseRef={targetExerciseRef}
        categoryColor={
          workout.workout_type_id
            ? effectiveWorkoutType(workout, types).color
            : categoryColors[workout.category]
        }
        records={recordCounts.get(workout.id) ?? 0}
        personalRecords={personalRecords}
        activeWorkout={activeWorkout}
        expandedPhoto={expandedPhoto}
        onExpandPhoto={setExpandedPhoto}
        onFilterMachine={(photo, exerciseName) => filterByMachine({ photo, exerciseName })}
        machineFilterId={machineFilterId}
        showYear={machineFilter !== null || workout.workout_date.slice(0, 4) !== today.slice(0, 4)}
        onToggle={() => {
          setTargetMovementId(null);
          setTargetExerciseId(machineFilter ? machineFilter.photo.exercise_id : null);
          setOpenId((current) => (current === workout.id ? null : workout.id));
        }}
        onOpenExercise={onOpenExercise}
        {...(!syncingWorkoutIds.includes(workout.id) && {
          onResume: () => onResume(workout),
          onEdit: () => onEdit(workout),
          onDelete: () => onDelete(workout),
          onPhotosChange: () => void onDataChange(),
        })}
      />
    );
  }

  useEffect(() => {
    if (section !== 'history' || !revealWorkoutRef.current) return;
    const summary = openWorkoutSummaryRef.current;
    const exercise = targetExerciseId ? targetExerciseRef.current : null;
    const target = exercise ?? summary;
    if (!target) return;
    revealWorkoutRef.current = false;
    // The source sheet closes as History is revealed. Let its scroll lock and
    // the cached screen's layout settle before moving to the requested exercise.
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        target.focus({ preventScroll: true });
        target.scrollIntoView({
          behavior: motionReduced() ? 'instant' : 'smooth',
          block: exercise ? 'center' : 'start',
        });
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [section, openId, historyPage, targetExerciseId]);

  return (
    <section
      className={`history-screen content-page${section === 'progress' && exerciseHeader ? ' exercise-header-view' : ''}`}
    >
      {section === 'progress' && exerciseHeader ? (
        <OverlayScreenHeader
          title={exerciseHeader.exercise.name}
          subtitle={[
            exerciseHeader.exercise.muscle_group,
            // A block-scoped count names its block; the equipment makes room for it.
            exerciseHeader.blockName ? null : exerciseHeader.exercise.equipment,
            exerciseHeader.sessionCount === null
              ? null
              : `${exerciseHeader.sessionCount} ${exerciseHeader.sessionCount === 1 ? 'session' : 'sessions'}${exerciseHeader.blockName ? ` in ${exerciseHeader.blockName}` : ''}`,
          ]
            .filter(Boolean)
            .join(' \u00b7 ')}
          onBack={exerciseHeader.onBack}
          backLabel="Back to exercises"
          actions={
            <>
              <ExerciseMuscleHelp exercise={exerciseHeader.exercise} />
              <ExerciseOptionsMenu
                key={exerciseHeader.exercise.id}
                exerciseName={exerciseHeader.exercise.name}
                hidden={exerciseHeader.exercise.hidden}
                onEdit={exerciseHeader.onEdit}
                onMerge={exerciseHeader.onMerge}
                onToggleHidden={exerciseHeader.onToggleHidden}
              />
            </>
          }
        />
      ) : (
        <>
          <PageHeader
            eyebrow={`${totalWorkouts} ${totalWorkouts === 1 ? 'workout' : 'workouts'} logged`}
            title="Training"
            onOpenSettings={onOpenSettings}
            accountActions={accountActions}
          />
          <div
            ref={sectionIndicatorRef}
            className="segmented-control slide-indicator"
            role="tablist"
            aria-label="Training sections"
          >
            <button
              type="button"
              role="tab"
              aria-selected={section === 'history'}
              className={section === 'history' ? 'active' : ''}
              onClick={() => onSectionChange('history')}
            >
              Sessions
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === 'progress'}
              className={section === 'progress' ? 'active' : ''}
              data-guide-target="progress"
              onClick={() => onSectionChange('progress')}
            >
              Exercises
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={section === 'cardio'}
              className={section === 'cardio' ? 'active' : ''}
              onClick={() => onSectionChange('cardio')}
            >
              Cardio
            </button>
          </div>
        </>
      )}
      {createExerciseOpen && (
        <CreateExerciseDialog
          exercises={exercises}
          categoryLabels={categoryNames}
          initialName=""
          initialCategory=""
          onCreate={onCreateExercise}
          onCreated={(exercise) => {
            setCreateExerciseOpen(false);
            setCreatedExercise(exercise);
          }}
          onUseExisting={(exercise) => {
            setCreateExerciseOpen(false);
            onOpenExercise(exercise.id);
          }}
          onClose={() => setCreateExerciseOpen(false)}
        />
      )}
      {createdExercise && (
        <Toast
          id={createdExercise.id}
          message={`${createdExercise.name} added`}
          action={{
            label: 'Open',
            run: () => {
              setCreatedExercise(null);
              onOpenExercise(createdExercise.id);
            },
          }}
          dismissLabel="Dismiss exercise notification"
          onDismiss={() => setCreatedExercise(null)}
        />
      )}
      {visitedSections.has('progress') && (
        <CachedTabPanel active={section === 'progress'}>
          <ProgressScreen
            exerciseLibrary={exerciseLibrary}
            dataRevision={dataRevision}
            exercises={exercises}
            personalRecords={personalRecords}
            measurements={measurements}
            onOpenWorkout={(workoutId, exerciseId) => onOpenWorkout(workoutId, exerciseId)}
            embedded
            browseFirst
            onDetailChange={setExerciseHeader}
            onCreateExercise={openExerciseCreation}
            onExercisesMerged={onDataChange}
            onRecordsChange={onDataChange}
            onOpenMember={onOpenMember}
            initialExerciseId={initialExerciseId}
            openMachineWeights={openMachineWeights}
            onMachineWeightsOpened={onMachineWeightsOpened}
            defaultExerciseId={defaultExerciseId}
            onOpenSettings={onOpenSettings}
          />
        </CachedTabPanel>
      )}
      {visitedSections.has('cardio') && (
        <CachedTabPanel active={section === 'cardio'}>
          <CardioScreen
            dataRevision={dataRevision}
            exercises={exercises}
            onDataChange={onDataChange}
            onOpenWorkout={(workoutId) => onOpenWorkout(workoutId, null)}
            onEditWorkout={(workoutId) => {
              const workout = workouts.find((item) => item.id === workoutId);
              if (workout) onEdit(workout);
              else onOpenWorkout(workoutId, null);
            }}
          />
        </CachedTabPanel>
      )}
      {visitedSections.has('history') && (
        <CachedTabPanel active={section === 'history'}>
          {machineFilter ? (
            <section ref={machineFilterRef} className="machine-filter-results">
              <MachineFilterBanner
                filter={machineFilter}
                workoutDates={machineWorkouts?.map((workout) => workout.workout_date) ?? null}
                loading={machineWorkouts === null}
                error={machineHistoryError}
                today={today}
                onChange={() => setMachinePickerOpen(true)}
                onClear={clearMachineFilter}
              />
              {machineWorkouts && machineWorkouts.length > 0 && (
                <section
                  ref={machineListRef}
                  className="history-week"
                  aria-label="Workouts on this machine"
                >
                  <header className="history-week-header">
                    <h2>On this machine</h2>
                    <span className="num">Newest first</span>
                  </header>
                  <div className="history-week-list">
                    {machineWorkouts
                      .slice(
                        (currentMachinePage - 1) * LIST_PAGE_SIZE,
                        currentMachinePage * LIST_PAGE_SIZE,
                      )
                      .map(renderWorkoutCard)}
                  </div>
                  <PaginationControls
                    currentPage={currentMachinePage}
                    totalPages={machinePages}
                    onPageChange={(page) => {
                      setMachinePage(page);
                      setOpenId(null);
                    }}
                    label="machine workout"
                    scrollTarget={machineListRef}
                  />
                </section>
              )}
            </section>
          ) : (
            <>
              <section
                className="history-calendar-panel calendar-panel pulse-card"
                aria-label="Workout calendar"
              >
                <header className="pulse-card-header history-calendar-header">
                  <h2>Calendar</h2>
                  {(workouts.length > 0 || hasOlder) && (
                    <button
                      type="button"
                      className="history-machine-filter"
                      aria-label="Filter by machine"
                      title="Filter by machine"
                      aria-haspopup="dialog"
                      onClick={() => setMachinePickerOpen(true)}
                    >
                      <Icon name="filter" />
                    </button>
                  )}
                </header>
                <InteractiveWorkoutCalendar
                  entries={heatmap}
                  workouts={workouts}
                  olderHistory={olderHistory}
                  split={trainingSplit}
                  categoryColors={categoryColors}
                  activeWorkout={activeWorkout}
                  activeWorkoutDate={activeWorkoutDate}
                  onResumeWorkout={onResumeWorkout}
                  onEditWorkout={onEdit}
                  onOpenWorkout={revealWorkout}
                  onStartWorkout={onStartWorkout}
                  onReplaceActiveWorkout={onReplaceActiveWorkout}
                  onEditSplit={onEditSplit}
                  hiddenCategories={hiddenTypes}
                  onHiddenCategoriesChange={setHiddenTypes}
                />
              </section>
              {!workouts.length && !hasOlder && (
                <EmptyState
                  title="Your log is empty"
                  body="Your completed workouts will show up here."
                  action="Start a workout"
                  onAction={() => onStartWorkout()}
                />
              )}
              {(workouts.length > 0 || hasOlder) && (
                <div className="history-session-pages" ref={sessionListRef}>
                  {pageNeedsOlder ? (
                    <div className="history-page-status" role={olderError ? 'alert' : 'status'}>
                      {olderError ? (
                        <>
                          <p>{olderError}</p>
                          <button
                            type="button"
                            className="pulse-button secondary"
                            onClick={onLoadOlder}
                          >
                            Retry loading older workouts
                          </button>
                        </>
                      ) : (
                        <p>Loading older workouts…</p>
                      )}
                    </div>
                  ) : weekGroups.length ? (
                    weekGroups.map((group) => {
                      const label = weekGroupLabel(group.weekStart, today, weekStartDay);
                      return (
                        <section className="history-week" key={group.weekStart} aria-label={label}>
                          <header className="history-week-header">
                            <h2>{label}</h2>
                            <span className="num">{weekGroupSummary(group, weightUnit)}</span>
                          </header>
                          <div className="history-week-list">
                            {group.workouts.map(renderWorkoutCard)}
                          </div>
                        </section>
                      );
                    })
                  ) : (
                    <div className="history-page-status">
                      <p>
                        No workouts{' '}
                        {historyPage === 1
                          ? 'this week or last week'
                          : `from ${dayMonth(pageWindow.start)} to ${dayMonth(pageWindow.end ?? today)} ${(pageWindow.end ?? today).slice(0, 4)}`}
                      </p>
                    </div>
                  )}
                  <PaginationControls
                    currentPage={historyPage}
                    totalPages={historyPages}
                    onPageChange={changeHistoryPage}
                    label="workout history"
                    scrollTarget={sessionListRef}
                  />
                </div>
              )}
            </>
          )}
          {machinePickerOpen && (
            <MachineFilterPicker
              today={today}
              onSelect={filterByMachine}
              onClose={() => setMachinePickerOpen(false)}
            />
          )}
        </CachedTabPanel>
      )}
    </section>
  );
}

/**
 * A profile's shared workouts, grouped by week like History but read-only, two weeks with
 * workouts to a page. Older workouts are read as later pages need them.
 */
/** A workout nobody has reacted to or commented on. */
const NO_REACTIONS: WorkoutReactions = { counts: [], yours: null, comment_count: 0 };

export function SharedWorkoutHistory({
  workouts,
  focusWorkoutId,
  personalRecords,
  onFilterMachine,
  hasMore = false,
  loadingMore = false,
  loadMoreFailed = false,
  onLoadMore,
  categoryColors: viewerColors,
  weekStartDay,
  workoutTypes,
  reactions,
  onReactionsChange,
  owner,
}: SharedWorkoutListProps & { categoryColors: WorkoutTypeColors; weekStartDay: number }) {
  // Draw the member's own colours, as their calendar does, rather than the viewer's.
  const categoryColors = useMemo(
    () => (workoutTypes ? builtinTypeColors(workoutTypes) : viewerColors),
    [viewerColors, workoutTypes],
  );
  const [chosenPage, setChosenPage] = useState<number | null>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [openId, setOpenId] = useState<string | null>(focusWorkoutId ?? null);
  // One workout's reaction picker or comment thread is open at a time.
  const [discussing, setDiscussing] = useState<string | null>(null);
  const summaryRef = useRef<HTMLButtonElement>(null);
  const revealed = useRef(false);
  const [expandedPhoto, setExpandedPhoto] = useState<MachinePhoto | null>(null);
  const targetExerciseRef = useRef<HTMLDivElement>(null);
  const today = localDate();
  const weekGroups = useMemo(
    () => groupWorkoutsByWeek(workouts, weekStartDay),
    [weekStartDay, workouts],
  );
  const recordCounts = useMemo(() => recordCountsByWorkout(personalRecords), [personalRecords]);
  // A linked workout opens on its page until another page is chosen.
  const focusWeek = focusWorkoutId
    ? weekGroups.findIndex((group) => group.workouts.some((item) => item.id === focusWorkoutId))
    : -1;
  const {
    page,
    start: pageStart,
    end: pageEnd,
    needsMore: pageNeedsMore,
    totalPages,
  } = weekGroupPage(
    weekGroups.length,
    chosenPage ?? Math.max(0, Math.floor(focusWeek / HISTORY_WEEKS_PER_PAGE)),
    hasMore,
  );
  const pageWeeks = weekGroups.slice(pageStart, pageEnd);
  // Until every workout has loaded, the pager counts the pages read so far and leaves a gap after.
  const loadedPages =
    totalPages ?? Math.max(page + 1, Math.ceil(weekGroups.length / HISTORY_WEEKS_PER_PAGE));
  const pageLoading = pageNeedsMore && !loadMoreFailed;

  useEffect(() => {
    if (pageNeedsMore && !loadingMore && !loadMoreFailed) onLoadMore?.();
  }, [loadMoreFailed, loadingMore, onLoadMore, pageNeedsMore, workouts.length]);

  /** Takes the pager's 1-based page. */
  function changePage(next: number) {
    setChosenPage(Math.max(0, next - 1));
    setOpenId(null);
  }

  useEffect(() => {
    if (!focusWorkoutId || revealed.current || !summaryRef.current) return;
    let frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        const target = summaryRef.current;
        if (!target) return;
        revealed.current = true;
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusWorkoutId, workouts]);

  return (
    <div className="shared-workout-pages" ref={pagesRef}>
      {pageWeeks.length === 0 && (
        <div className="history-page-status" role="status">
          <p>{loadMoreFailed ? 'Older workouts could not load.' : 'Loading older workouts…'}</p>
        </div>
      )}
      {pageWeeks.map((group) => {
        const label = weekGroupLabel(group.weekStart, today, weekStartDay);
        return (
          <section className="history-week" key={group.weekStart} aria-label={label}>
            <header className="history-week-header">
              <h2>{label}</h2>
            </header>
            <div className="history-week-list">
              {group.workouts.map((workout) => (
                <HistoryWorkoutCard
                  key={workout.id}
                  shared
                  workout={workout}
                  open={openId === workout.id}
                  summaryRef={workout.id === focusWorkoutId ? summaryRef : null}
                  targetExerciseId={null}
                  targetExerciseRef={targetExerciseRef}
                  categoryColor={workoutTypeColor(
                    effectiveWorkoutType(workout, workoutTypes),
                    categoryColors,
                  )}
                  records={recordCounts.get(workout.id) ?? 0}
                  personalRecords={personalRecords}
                  activeWorkout={false}
                  expandedPhoto={expandedPhoto}
                  onExpandPhoto={setExpandedPhoto}
                  onFilterMachine={onFilterMachine}
                  onToggle={() =>
                    setOpenId((current) => (current === workout.id ? null : workout.id))
                  }
                  discussion={
                    reactions && onReactionsChange && owner ? (
                      <WorkoutReactionControl
                        compact
                        ownWorkout={owner.is_you}
                        workoutId={workout.id}
                        subject={`${owner.is_you ? 'Your' : `${owner.display_name}’s`} ${workoutDisplayName(workout)}`}
                        reactions={reactions[workout.id] ?? NO_REACTIONS}
                        open={discussing === workout.id}
                        onOpenChange={(value) =>
                          setDiscussing((current) =>
                            value ? workout.id : current === workout.id ? null : current,
                          )
                        }
                        onChange={(next) => onReactionsChange(workout.id, next)}
                      />
                    ) : null
                  }
                />
              ))}
            </div>
          </section>
        );
      })}
      <PaginationControls
        label="workout"
        currentPage={page + 1}
        totalPages={loadedPages}
        hasMore={totalPages === null && !(pageNeedsMore && loadMoreFailed)}
        busy={pageLoading}
        scrollTarget={pagesRef}
        onPageChange={changePage}
      />
    </div>
  );
}

function HistoryWorkoutCard({
  bodyweight = null,
  detailsOnly = false,
  shared = false,
  workout,
  open,
  summaryRef,
  targetExerciseId,
  targetMovementId = null,
  targetExerciseRef,
  categoryColor,
  records,
  personalRecords,
  activeWorkout,
  expandedPhoto,
  onExpandPhoto,
  onFilterMachine,
  machineFilterId = null,
  showYear = false,
  onToggle,
  onOpenExercise,
  onResume,
  onEdit,
  onDelete,
  onPhotosChange,
  discussion = null,
}: {
  bodyweight?: number | null;
  detailsOnly?: boolean;
  /** A profile's read-only session: totals, records and each exercise's sets laid out to read. */
  shared?: boolean;
  workout: TrackedWorkout;
  open: boolean;
  summaryRef: RefObject<HTMLButtonElement | null> | null;
  targetExerciseId: string | null;
  targetMovementId?: string | null;
  targetExerciseRef: RefObject<HTMLDivElement | null>;
  categoryColor: string;
  records: number;
  personalRecords: PersonalRecord[];
  activeWorkout: boolean;
  expandedPhoto: MachinePhoto | null;
  onExpandPhoto: (photo: MachinePhoto | null) => void;
  /** Lists only workouts that pinned this machine. Omitted for shared, read-only history. */
  onFilterMachine?: (photo: MachinePhoto, exerciseName: string) => void;
  machineFilterId?: string | null;
  /** Machine history can span years, so its dates include the year. */
  showYear?: boolean;
  onToggle: () => void;
  /** Omitted for another member's shared workout, which is read-only. */
  onOpenExercise?: (exerciseId: string) => void;
  onResume?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Given for your own saved workout: its photos were added to or removed. */
  onPhotosChange?: () => void;
  /** A profile workout's reaction and comment buttons, under its summary. */
  discussion?: ReactNode;
}) {
  const weightUnit = useWeightUnit();
  const viewerId = useUserSession().user?.id ?? null;
  const [shareOpen, setShareOpen] = useState(false);
  const [photos, setPhotos] = useWorkoutPhotos(workout);
  // Resume continues today's session; an older workout is changed with Edit.
  const resumable = !activeWorkout && canResumeWorkout(workout);
  const photoSubject = shared ? workoutDisplayName(workout) : `Your ${workoutDisplayName(workout)}`;
  const completedWorkoutSets = workout.movements
    .flatMap((movement) => movement.sets)
    .filter((item) => item.completed);
  // A cardio entry is not a set: cardio-only rows show their time and distance instead.
  const workingSetCount = strengthSets(workout).length;
  const totalVolume = workoutVolumeKg(workout);
  const totalDistance = completedWorkoutSets.reduce(
    (total, item) => total + (item.distance_km ?? 0),
    0,
  );
  // One exercise with a bodyweight ratio or a record gives every exercise that column, so the
  // tables of a workout line up.
  const ratioColumn =
    open &&
    completedWorkoutSets.some(
      (item) => relativeStrength(item.weight_kg, item.bodyweight_kg ?? bodyweight) !== null,
    );
  const recordColumn =
    open &&
    completedWorkoutSets.some((item) =>
      personalRecords.some((record) => record.set_id === item.id),
    );
  const meta = [
    showYear
      ? `${shortDate(workout.workout_date)} ${workout.workout_date.slice(0, 4)}`
      : shortDate(workout.workout_date),
    workout.duration_minutes ? formatMinutesDuration(workout.duration_minutes) : null,
    workingSetCount ? `${workingSetCount} ${workingSetCount === 1 ? 'set' : 'sets'}` : null,
  ].filter(Boolean);
  // Exercises planned but never done are listed by name only, not as empty tables.
  const skipped = workout.movements.filter(
    (movement) => !movement.notes && !movement.sets.some((item) => item.completed),
  );
  const movements = open
    ? workout.movements.map((movement) => {
        if (skipped.includes(movement)) return null;
        const targeted = targetMovementId
          ? targetMovementId === movement.id
          : targetExerciseId === movement.exercise.id;
        const best = topWorkingSet(movement.sets);
        return (
          <div
            ref={targeted ? targetExerciseRef : null}
            className={`history-movement ${targeted ? 'targeted-exercise' : ''}`}
            key={movement.id}
            tabIndex={targeted ? -1 : undefined}
          >
            <div className="history-movement-header">
              {onOpenExercise ? (
                <button
                  type="button"
                  className="history-exercise-link"
                  onClick={() => onOpenExercise(movement.exercise.id)}
                >
                  {movement.exercise.name}
                  <Icon name="chevron-right" />
                </button>
              ) : (
                <strong className="history-exercise-name">{movement.exercise.name}</strong>
              )}
              {shared ? (
                <span className="num">{sharedSetCount(movement.sets)}</span>
              ) : (
                best && <span className="num">Top {setLabel(best, weightUnit)}</span>
              )}
            </div>
            {movement.machine_photos.length > 0 && (
              <>
                <div className="history-machine-photos">
                  {movement.machine_photos.map((photo) => (
                    <button
                      type="button"
                      key={photo.id}
                      onClick={() => onExpandPhoto(expandedPhoto?.id === photo.id ? null : photo)}
                      aria-label={`${expandedPhoto?.id === photo.id ? 'Collapse' : 'Expand'} ${photo.caption}`}
                      aria-expanded={expandedPhoto?.id === photo.id}
                    >
                      <span className="history-photo-image">
                        <img src={photo.thumbnail_url} alt={photo.caption} loading="lazy" />
                        <svg
                          className="history-photo-expand-icon"
                          viewBox="0 0 20 20"
                          aria-hidden="true"
                        >
                          <path d="M7 3H3v4M13 3h4v4M7 17H3v-4M13 17h4v-4" />
                        </svg>
                      </span>
                      <span className="history-photo-caption">{photo.caption}</span>
                    </button>
                  ))}
                </div>
                {expandedPhoto &&
                  movement.machine_photos.some((photo) => photo.id === expandedPhoto.id) && (
                    <MachinePhotoDetail
                      photo={expandedPhoto}
                      onClose={() => onExpandPhoto(null)}
                      onShowHistory={
                        onFilterMachine && expandedPhoto.id !== machineFilterId
                          ? () => onFilterMachine(expandedPhoto, movement.exercise.name)
                          : undefined
                      }
                    />
                  )}
              </>
            )}
            <MachineSettingsSummary settings={movement.machine_settings} />
            {shared ? (
              <SharedSetList
                sets={movement.sets}
                personalRecords={personalRecords}
                machinePhotos={movement.machine_photos}
                formatSet={(item) => setResult(item, weightUnit)}
                describeRecord={(record) =>
                  `${recordScopeLabel(record)} ${recordTypeLabel(record)}`
                }
              />
            ) : (
              <>
                <HistorySetTable
                  bodyweight={bodyweight}
                  sets={movement.sets.filter((item) => item.completed)}
                  personalRecords={personalRecords}
                  machinePhotos={movement.machine_photos}
                  ratioColumn={ratioColumn}
                  recordColumn={recordColumn}
                  formatSet={(item) => setResult(item, weightUnit)}
                  recordLabel={recordTypeLabel}
                />
                {/* A completed set's note sits under its row in the table. */}
                {movement.sets
                  .filter((item) => item.notes && !item.completed)
                  .map((item) => (
                    <small key={item.id}>
                      Set {item.order_index + 1}: {item.notes}
                    </small>
                  ))}
              </>
            )}
            {movement.notes && <MovementNotes notes={movement.notes} />}
          </div>
        );
      })
    : null;

  return (
    <article className={`history-card ${open ? 'open' : ''}`}>
      {!detailsOnly && (
        <button
          ref={summaryRef}
          className="history-card-summary"
          aria-expanded={open}
          onClick={onToggle}
        >
          <i style={{ background: categoryColor }} aria-hidden="true" />
          <span className="history-card-copy">
            <strong>
              {workoutDisplayName(workout)}
              {workout.is_sample && <em className="sample-tag">Sample</em>}
            </strong>
            <small>{meta.join(' · ')}</small>
            <TrainedWithPill
              trainedWith={workout.trained_with}
              trainedWithCount={workout.trained_with_count}
              viewerId={viewerId}
            />
          </span>
          <span className="history-card-metric num">
            {totalVolume > 0
              ? formatListVolume(totalVolume, weightUnit)
              : totalDistance > 0
                ? `${Number(totalDistance.toFixed(1))} km`
                : formatMinutesDuration(workout.duration_minutes)}
            {records > 0 && (
              <small>
                {records} {records === 1 ? 'PR' : 'PRs'}
              </small>
            )}
          </span>
          <span className="history-card-chevron" aria-hidden="true">
            <Icon name="chevron-down" />
          </span>
        </button>
      )}
      {discussion && !detailsOnly && <div className="history-card-social">{discussion}</div>}
      {open && (
        <div className={`history-detail${shared ? ' shared-session' : ''}`}>
          {detailsOnly && (
            <TrainedWithPill
              trainedWith={workout.trained_with}
              trainedWithCount={workout.trained_with_count}
              viewerId={viewerId}
            />
          )}
          {onPhotosChange && !detailsOnly ? (
            <WorkoutPhotoEditor
              workoutId={workout.id}
              photos={photos}
              subject={photoSubject}
              canAdd={false}
              onChange={(next) => {
                setPhotos(next);
                onPhotosChange();
              }}
            />
          ) : (
            photos.length > 0 && (
              <div className="history-workout-photos">
                <WorkoutPhotos photos={photos} subject={photoSubject} layout="strip" />
              </div>
            )
          )}
          {shared ? <div className="shared-session-exercises">{movements}</div> : movements}
          {skipped.length > 0 && (
            <p className="history-skipped">
              Skipped: {skipped.map((movement) => movement.exercise.name).join(', ')}
            </p>
          )}
          {!detailsOnly && workout.notes && (
            <p className="history-workout-notes">{workout.notes}</p>
          )}
          {onResume && onEdit && onDelete && (
            <div className="workout-actions">
              <WorkoutShareMenu workout={workout} onShareCard={() => setShareOpen(true)} />
              {resumable && (
                <button
                  className="resume-workout-button pulse-button primary small"
                  type="button"
                  onClick={onResume}
                >
                  Resume
                </button>
              )}
              <button
                type="button"
                className="edit-workout-button pulse-button secondary small"
                onClick={onEdit}
              >
                Edit
              </button>
              <InlineConfirmButton
                className="delete-workout pulse-button danger-soft small"
                label="Delete"
                confirmLabel="Confirm delete"
                onConfirm={onDelete}
              />
            </div>
          )}
          {shareOpen && (
            <WorkoutShareCard
              workout={workout}
              records={records}
              onClose={() => setShareOpen(false)}
            />
          )}
        </div>
      )}
    </article>
  );
}

function HistorySetFlow({
  bodyweight = null,
  sets,
  personalRecords,
  machinePhotos = [],
}: {
  bodyweight?: number | null;
  sets: TrackedSet[];
  personalRecords: PersonalRecord[];
  machinePhotos?: MachinePhoto[];
}) {
  const weightUnit = useWeightUnit();
  return (
    <div className="history-set-flow">
      {sets.map((item, index) => (
        <Fragment key={item.id}>
          <div className="history-set-pill" data-set-type={setKindOf(item)}>
            <b>Set {item.order_index + 1}</b>
            <span>{setResult(item, weightUnit)}</span>
            {(item.bodyweight_kg ?? bodyweight) != null && (
              <small>
                {bodyweightContext(item.weight_kg, item.bodyweight_kg ?? bodyweight, weightUnit)}
              </small>
            )}
            {machinePhotos.length > 1 && (
              <small className="history-set-machine">
                {machinePhotos.find((photo) => photo.id === item.machine_photo_id)?.caption ??
                  'Machine not assigned'}
              </small>
            )}
            {item.rpe !== null && <small>RPE {item.rpe}</small>}
            <em>
              {item.set_type === 'warmup' || item.warmup
                ? 'Warm-up'
                : item.set_type === 'drop'
                  ? 'Drop'
                  : item.failed
                    ? 'Attempted'
                    : ''}
            </em>
            {personalRecords.some((record) => record.set_id === item.id) &&
              (() => {
                const setRecords = personalRecords.filter((record) => record.set_id === item.id);
                return (
                  <strong
                    className={`pr-badge${setRecords.some(isAllTimeRecord) ? ' is-all-time' : ''}`}
                    title={setRecords
                      .map((record) => `${recordScopeLabel(record)} ${recordTypeLabel(record)}`)
                      .join(', ')}
                  >
                    {recordBadgeLabel(setRecords)}
                  </strong>
                );
              })()}
          </div>
          {index < sets.length - 1 && (
            <div className="history-rest-gap">
              <i />
              <span>
                {item.rest_seconds !== null
                  ? `${formatDuration(item.rest_seconds)} rest`
                  : 'Rest not set'}
              </span>
              <i />
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

function MovementNotes({ notes }: { notes: string }) {
  return (
    <div className="movement-notes-display">
      {notes.split('\n').map((line, index) => {
        const video = line.match(/^Video - (.+?) @ ([0-9:]+): (https:\/\/\S+)$/);
        return video ? (
          <a key={`${line}-${index}`} href={video[3]} target="_blank" rel="noreferrer">
            <span aria-hidden="true">▶</span>
            <span>
              <b>{video[1]}</b>
              <small>Watch from {video[2]}</small>
            </span>
          </a>
        ) : (
          <p key={`${line}-${index}`}>{line}</p>
        );
      })}
    </div>
  );
}

function EmptyState({
  title,
  body,
  action,
  onAction,
}: {
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty-state">
      <span>↗</span>
      <strong>{title}</strong>
      <p>{body}</p>
      {action && onAction && <button onClick={onAction}>{action}</button>}
    </div>
  );
}
