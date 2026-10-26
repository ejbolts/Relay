import { useActiveWorkoutReminder } from './activeWorkoutReminder';
import {
  extendInactiveWorkoutFinishAt,
  inactiveWorkoutFinishAt,
  MAX_INACTIVE_WORKOUT_MS,
} from './activeWorkoutTimeout';
import {
  Fragment,
  useCallback,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ContextType,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
import { api } from './api';
import { WorkoutBrowser, WorkoutNavigationArrows, type WorkoutNavigation } from './WorkoutBrowser';
import { saveBodyFatCheckIn, saveBodyweightCheckIn } from './bodyweightCheckIn';
import { TrainingPreferencesProvider } from './TrainingPreferencesProvider';
import { WorkoutTypesProvider } from './WorkoutTypesProvider';
import { useWorkoutTypes } from './workoutTypesContext';
import { WorkoutTypesSettings } from './WorkoutTypesSettings';
import { builtinTypeColors, calendarLegendTypes, effectiveWorkoutType } from './workoutTypes';
import { useTrainingPreferences, useWeightUnit } from './trainingPreferencesContext';
import { WeightInput } from './WeightInput';
import {
  formatWeight,
  formatWeightNumber,
  recordDisplayValue,
  weightFromKg,
  weightInputValue,
  weightUnitName,
} from './weightUnits';
import type { WeightUnit } from './weightUnits';
import { PrToast, type PrToastEntry } from './PrToast';
import type {
  BodyMeasurement,
  BodyWeightGoal,
  CardioOverview,
  CardioScreenshotScan,
  CardioSession,
  CardioSessionInput,
  DashboardData,
  WeeklyMuscleContribution,
  Exercise,
  ExerciseCreateInput,
  ExerciseHistoryBaseline,
  ExerciseProgress,
  MachinePhoto,
  MachinePhotoUsage,
  PersonalRecord,
  SharedProfileSummary,
  TrackedSet,
  TrackedWorkout,
  TrainingPreferences,
  WorkoutCategory,
  WorkoutHistorySummary,
  User,
  WorkoutTypeColors,
  WorkoutInput,
  WorkoutRecommendation,
  WorkoutSetInput,
  WorkoutImportOptions,
} from './types';
import {
  BODY_TREND_DURATION_OPTIONS,
  clipBodyWeightGoalPath,
  filterMeasurementsByRange,
  summarizeBodyWeightTrend,
} from './bodyTrend';
import type { BodyTrendDuration, BodyTrendRange, BodyTrendStatistic } from './bodyTrend';
import {
  bodyGoalKind,
  bodyHistoryWithWeightChanges,
  summarizeBodyHistory,
} from './bodyMeasurementHistory';
import type { BodyGoalKind, BodyHistoryPeriod } from './bodyMeasurementHistory';
import { BodyHistoryGoalDivider, BodyHistoryWeightChange } from './BodyHistoryWeightChange';
import {
  DEFAULT_BODY_TREND_PREFERENCE,
  loadBodyTrendPreference,
  saveBodyTrendPreference,
  type BodyTrendPreference,
} from './bodyTrendPreference';
import { WorkoutCalendar, WorkoutCalendarLegend, type OlderHistoryProps } from './WorkoutCalendar';
import {
  appendOlderWorkouts,
  hasOlderHistory,
  initialHistoryStart,
  keepLoadedBefore,
  olderHistoryWindow,
  prependOlderDays,
} from './historyWindow';
import { InlineConfirmButton } from './InlineConfirmButton';
import { NotificationDialog } from './NotificationDialog';
import { useTrainingDataSync } from './useTrainingDataSync';
import { PopupDialog } from './PopupDialog';
import { PlateCalculatorDialog } from './PlateCalculator';
import { barTypeForExercise } from './plateLoading';
import { ExerciseMuscleHelp } from './ExerciseMuscleHelp';
import { ExerciseCreditsContext } from './exerciseCreditsContext';
import { MuscleSetsCard } from './MuscleSetsCard';
import {
  MachineFilterBanner,
  MachineFilterPicker,
  type MachineFilter,
} from './MachineHistoryFilter';
import { machineDate, machineUsedShort } from './machineHistory';
import { ReleaseAnnouncement } from './ReleaseAnnouncement';
import { useReleaseAnnouncement } from './useReleaseAnnouncement';
import { useAppUpdates } from './useAppUpdates';
import { AppUpdateBanner } from './AppUpdateBanner';
import { AppUpdateCheck } from './AppUpdateCheck';
import { BEFORE_APP_REFRESH_EVENT } from './appUpdates';
import { canShowReleaseAnnouncement } from './releaseAnnouncements';
import { HomeScreenGuide } from './HomeScreenGuide';
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
import { plural } from './sharedProfileDisplay';
import { CONTRIBUTING_URL, PROJECT_URL } from './appGuideSteps';
import { CreateExerciseDialog } from './CreateExerciseDialog';
import { BackgroundActivityBar } from './BackgroundActivityBar';
import { CardioTrendCard } from './CardioTrendCard';
import { groupCardioHistory } from './cardioTrend';
import { CardioMetricsEditor } from './CardioMetricsEditor';
import { fatEnergyEquivalent } from './cardioEnergy';
import { cardioSetUpdateFromScan } from './cardioScreenshot';
import { useBackdropDismiss } from './backdropDismiss';
import { CachedTabPanel } from './CachedTabPanel';
import { optimisePhoto } from './photoOptimise';
import { ConfettiBurst } from './ConfettiBurst';
import { EdgeSwipeBack } from './EdgeSwipeBack';
import { ExerciseLibraryList } from './ExerciseLibraryList';
import { ExerciseSessionSheet } from './ExerciseSessionSheet';
import { ProgressExerciseSearch } from './ProgressExerciseSearch';
import {
  personalBestProgressPoint,
  progressPointsForChart,
  type ProgressMetric,
} from './progressChart';
import {
  restTimerPreferenceEnabled,
  saveRestTimerPreference,
  restTimesPreferenceEnabled,
  saveRestTimesPreference,
} from './restTimerPreference';
import { RestTimeSelect } from './RestTimeSelect';
import { cancelRestTimerPushSchedule, restSecondsLeft } from './restTimer';
import {
  disablePhonePushNotifications,
  dismissRestTimerNotifications,
  enablePhonePushNotifications,
  existingPhonePushSubscription,
  PHONE_PUSH_PREFERENCE_EVENT,
  pushNotificationsSupported,
  showRestTimerNotification,
  showWorkoutAutoSavedNotification,
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
import { SwipeToDeleteSetRow } from './SwipeToDeleteSetRow';
import { unusualSetEntryWarning, type SetEntryWarning } from './setEntryConfirmation';
import {
  appTabFromHash,
  createAppHistoryState,
  historySectionForTab,
  isAppHistoryState,
  mainTabFor,
  type AppTab,
  type HistorySection,
} from './appNavigation';
import { AppTabBar } from './AppTabBar';
import { PaginationControls } from './PaginationControls';
import { useHomeLayout } from './useHomeLayout';
import { Icon } from './Icon';
import { TrendChart, type GoalPath, type TrendPoint } from './PulseCharts';
import { PageHeader, SettingsButton, TodayScreen, TodaySkeleton } from './TodayScreen';
import { FeedbackForm } from './FeedbackForm';
import { WorkoutCsvImport } from './WorkoutCsvImport';
import { DataExportDialog } from './DataExportDialog';
import {
  compactSetSummary,
  dayMonth,
  formatVolume,
  groupWorkoutsByWeek,
  mostTrainedExerciseId,
  recordCountsByWorkout,
  setLabel,
  sessionTemplateFor,
  shortDate,
  topWorkingSet,
  weekGroupLabel,
  weekStartDayFrom,
  weeklyBestPoints,
  workingSets,
  workoutDisplayName,
  workoutVolumeKg,
  type SessionTemplate,
} from './trainingSummary';
import { recentExerciseHistory, type ExerciseHistoryEntry } from './exerciseHistory';
import { useUpNextSession } from './upNext';
import { exerciseIconFor } from './exerciseIcons';
import { fuzzyHighlightIndices, rankExerciseSearchMatches } from './exerciseSearch';
import {
  formatMinutesDuration,
  formatSeconds,
  formatWorkoutTimeRange,
  localDate,
  mergeUniqueById,
  itemsInSelectionOrder,
  reorder,
  workoutDurationMinutes,
  workoutTimeInputValue,
} from './utils';
import { VideoUpload } from './VideoUpload';
import { YouTubeConnectionPanel } from './YouTubeConnectionPanel';
import { ProfileScreen } from './ProfileScreen';
import { AccountSettings, AccountSessionSettings } from './AccountSettings';
import { ProfileAccountId } from './ProfileAccountId';
import { SharedProfileScreen, type SharedWorkoutListProps } from './SharedProfiles';
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
import { canUploadVideos, useUserSession } from './userContext';
import { RestTimerToast, WorkoutHeaderMeta } from './WorkoutRestTimer';
import {
  clearActiveWorkoutDraft,
  readActiveWorkoutDraft,
  savedWorkoutMatchesOldDraft,
  writeActiveWorkoutDraft,
} from './workoutDraft';
import {
  completeRemainingSets,
  createSuggestedWorkoutSet,
  createWorkoutSet,
  isCompletedWorkingSet,
  latestExerciseSets,
  restTimerSecondsAfterSetUpdate,
  suggestNextSetFromLoggedSet,
} from './workoutSets';
import { finalizeWorkoutIdentity, workoutNameForCategory } from './workoutCategory';
import {
  replaceMovementExercise,
  restoreWorkoutDraftMovements,
  type WorkoutDraftMovement as DraftMovement,
  type WorkoutDraftSet as DraftSet,
} from './workoutMovements';
import { applySupersetSelection, clearSuperset } from './workoutSupersets';
import { initialHistoryVisibleCount, upsertWorkoutByRecency } from './workoutHistory';
import { calculateDraftPrs } from './workoutPr';
import { completedWorkoutDurationMinutes } from './workoutResume';
import {
  isWorkoutSetAutoSavable,
  workoutSetAfterEdit,
  workoutSetForAutoSave,
} from './workoutAutoSave';
import { readDashboardCache, writeDashboardCache } from './workoutCache';
import { trainingDataActivityLabel } from './trainingDataRefresh';
import { dateRangeForDates, TIME_RANGE_OPTIONS } from './dateRanges';

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

const HISTORY_PAGE_SIZE = 8;

/** Each exercise's history before `before`, the start of the window loaded at the time. */
type HistoryBaselines = {
  before: string;
  byExercise: Map<string, ExerciseHistoryBaseline>;
};

const CARDIO_HISTORY_PAGE_SIZE = 5;
const UNDO_TOAST_MS = 4000;
const IMPORTED_BODYWEIGHT_NOTE = 'Imported from workout CSV.';

function emptySet(
  kind: Exercise['kind'],
  previous?: WorkoutSetInput,
  isFirstSet = previous === undefined,
): DraftSet {
  return {
    key: crypto.randomUUID(),
    ...createWorkoutSet(kind, previous, isFirstSet),
    ...(previous && { fromPrevious: true }),
  };
}

function setTypeTitle(item: Pick<DraftSet, 'set_type' | 'warmup' | 'failed'>): string {
  return SET_KINDS.find((option) => option.kind === setKindOf(item))?.label ?? 'Working set';
}

/** Sets pre-filled from the exercise's most recent session, marked as suggestions. */
function suggestedSetsFromHistory(
  workouts: TrackedWorkout[],
  exercise: Exercise,
  onOrBeforeDate: string,
  excludedWorkoutId?: string,
  olderHistory?: Map<string, ExerciseHistoryBaseline> | null,
): DraftSet[] {
  let previousSets = latestExerciseSets(workouts, exercise.id, onOrBeforeDate, excludedWorkoutId);
  // Not logged in the loaded window: fall back to its latest session from older history.
  const older = olderHistory?.get(exercise.id)?.latest;
  if (
    !previousSets.length &&
    older &&
    older.workout_id !== excludedWorkoutId &&
    older.workout_date <= onOrBeforeDate
  ) {
    previousSets = older.sets;
  }
  if (!previousSets.length) return [emptySet(exercise.kind)];
  return previousSets.map((previous) => ({
    key: crypto.randomUUID(),
    ...createSuggestedWorkoutSet(exercise.kind, previous),
    fromPrevious: true,
  }));
}

function numberOrNull(value: string): number | null {
  return value === '' ? null : Number(value);
}

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

function SetDragHandle({
  setNumber,
  disabled,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onMoveEarlier,
  onMoveLater,
}: {
  setNumber: number;
  disabled: boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
}) {
  return (
    <button
      type="button"
      className="set-drag-handle"
      aria-label={`Drag set ${setNumber} to reorder`}
      title="Drag to reorder"
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onMoveEarlier();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          onMoveLater();
        }
      }}
    >
      <span className="set-drag-grip" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((dot) => (
          <i key={dot} />
        ))}
      </span>
    </button>
  );
}

function formatDuration(totalSeconds: number): string {
  return formatSeconds(totalSeconds);
}

// Building a formatter is far slower than using one, and the calendar formats thousands of days.
const prettyDateFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function prettyDate(value: string): string {
  return prettyDateFormat.format(new Date(`${value}T12:00:00`));
}

function recordTypeLabel(type: PersonalRecord['record_type']): string {
  return {
    weight: 'Weight PR',
    reps_at_weight: 'Volume PR for this weight',
    estimated_1rm: 'estimated 1RM PR',
    duration: 'duration PR',
    distance: 'distance PR',
  }[type];
}

function WorkoutCompletionToast({
  records,
  onClose,
}: {
  records: PersonalRecord[];
  onClose: () => void;
}) {
  const weightUnit = useWeightUnit();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const timer = window.setTimeout(() => onCloseRef.current(), 8000);
    return () => window.clearTimeout(timer);
  }, [records]);

  return createPortal(
    <aside
      className="pr-summary panel workout-completion-toast"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-labelledby="workout-completion-title"
    >
      <button
        type="button"
        className="icon-button popup-close"
        onClick={onClose}
        aria-label="Close personal record summary"
      >
        ×
      </button>
      <span className="pr-trophy" aria-hidden="true">
        🏆
      </span>
      <p className="section-kicker">WORKOUT COMPLETE</p>
      <h2 id="workout-completion-title">
        {records.length} new PR{records.length === 1 ? '' : 's'}
      </h2>
      {records.map((record) => (
        <div key={record.id}>
          <strong>{record.exercise_name}</strong>
          <span>
            {recordTypeLabel(record.record_type)} · {recordDisplayValue(record, weightUnit)}
            {record.record_type === 'reps_at_weight' && record.weight_kg != null
              ? ` @ ${formatWeight(record.weight_kg, weightUnit)}`
              : ''}
          </span>
        </div>
      ))}
    </aside>,
    document.body,
  );
}

export function App() {
  return (
    <TrainingPreferencesProvider>
      <WorkoutTypesProvider>
        <AppContent />
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
  const [settingsJump, setSettingsJump] = useState<SettingsJump | null>(null);
  const [settingsGroup, setSettingsGroup] = useState<SettingsGroupId | null>(() =>
    new URLSearchParams(window.location.search).has('youtube') ? 'data' : null,
  );
  const { user, signingIn = false } = useUserSession();
  const announcement = useReleaseAnnouncement(user?.id ?? null);
  const appUpdates = useAppUpdates();
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
  const navigationActionRef = useRef<'push' | 'replace' | 'pop'>('replace');
  const currentTabRef = useRef(tab);
  const initialRefreshStartedRef = useRef(false);
  const backgroundActivityIdRef = useRef(0);
  const refreshGenerationRef = useRef(0);
  const refreshingDataRef = useRef(0);
  const trainingRevisionRef = useRef<string | null>(null);
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
  const setExercises = (update: Exercise[] | ((current: Exercise[]) => Exercise[])) =>
    setExerciseCatalogue((current) => ({
      ...current,
      exercises: typeof update === 'function' ? update(current.exercises) : update,
    }));
  const [workouts, setWorkouts] = useState<TrackedWorkout[]>([]);
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
  const [personalRecords, setPersonalRecords] = useState<PersonalRecord[]>([]);
  const [completionRecords, setCompletionRecords] = useState<PersonalRecord[]>([]);
  const [restTimerEnabled, setRestTimerEnabled] = useState(restTimerPreferenceEnabled);
  const [showRestTimes, setShowRestTimes] = useState(restTimesPreferenceEnabled);
  // The live workout's rest end, so the tab bar can count it down away from the workout.
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [reduceMotion, setReduceMotion] = useState(reduceMotionPreference);
  const [navDirection, setNavDirection] = useState<'forward' | 'back'>('forward');
  const [bodyTrendPreference, setBodyTrendPreference] = useState(loadBodyTrendPreference);
  const workoutTypes = useWorkoutTypes();
  const weightUnit = useWeightUnit();
  const upNext = useUpNextSession(dashboard?.recommendation, workouts);
  const workoutTypeColors = useMemo(
    () => builtinTypeColors(workoutTypes.types),
    [workoutTypes.types],
  );
  const [workoutStartDate, setWorkoutStartDate] = useState(localDate());
  const [editingWorkout, setEditingWorkout] = useState<TrackedWorkout | null>(null);
  const [resumingWorkoutId, setResumingWorkoutId] = useState<string | null>(
    () => readActiveWorkoutDraft()?.resumingWorkoutId ?? null,
  );
  const [activeWorkoutStartedAt, setActiveWorkoutStartedAt] = useState<number | null>(() => {
    const storedDraft = readActiveWorkoutDraft();
    if (storedDraft) return storedDraft.startedAt;
    return window.location.hash === '#log' ? Date.now() : null;
  });
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  // The opened shared profile; each opening refetches it, while Back reveals the cached screen.
  const [sharedProfile, setSharedProfile] = useState<{
    id: string;
    name: string;
    opened: number;
  } | null>(null);
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
  // The type chosen from the Start menu's Cardio option, before any exercise is added.
  const [workoutStartCategory, setWorkoutStartCategory] = useState<WorkoutCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [backgroundActivities, setBackgroundActivities] = useState<BackgroundActivity[]>([]);
  const [workoutSaving, setWorkoutSaving] = useState(false);
  useActiveWorkoutReminder(workoutSaving ? null : activeWorkoutStartedAt);
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
    navigationActionRef.current = options.replace ? 'replace' : 'push';
    setNavDirection('forward');
    setTabState(nextTab);
  }, []);

  function navigateBack() {
    if (tab === 'settings' && settingsGroup !== null) {
      setSettingsGroup(null);
      return;
    }
    const currentState = window.history.state;
    if (tab === 'log') {
      if (!workoutSaving) setEditingWorkout(null);
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
  }: { silent?: boolean; activityLabel?: string | null } = {}) {
    const generation = ++refreshGenerationRef.current;
    const current = () => generation === refreshGenerationRef.current;
    const refresh = async () => {
      // Read before the data: a change during this refresh must trigger another pass.
      const revision = await api.workoutRevision().catch(() => null);
      if (!current()) return;
      const windowStart = historyStartRef.current;
      const results = await Promise.allSettled([
        api.dashboard(windowStart).then((nextDashboard) => {
          if (!current()) return;
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
          void writeDashboardCache(nextDashboard);
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
        api
          .listExercises()
          .then((nextExercises) => {
            if (!current()) return;
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
        api.listWorkouts(windowStart).then((nextWorkouts) => {
          if (!current()) return;
          startTransition(() =>
            setWorkouts((current) => [
              ...nextWorkouts,
              ...keepLoadedBefore(current, windowStart, historyStartRef.current),
            ]),
          );
        }),
        api.listBodyMeasurements().then((nextMeasurements) => {
          if (!current()) return;
          startTransition(() => setMeasurements(nextMeasurements));
        }),
        api.listPersonalRecords().then((nextRecords) => {
          if (!current()) return;
          startTransition(() => setPersonalRecords(nextRecords));
        }),
      ]);
      if (!current()) return;
      // Failed reads do not acknowledge the revision, so quiet sync will retry them.
      if (results.every((result) => result.status === 'fulfilled')) {
        trainingRevisionRef.current = revision?.revision ?? null;
        setDataRevision(revision?.revision ?? null);
      }
      const firstFailure = results.find(
        (result, index): result is PromiseRejectedResult =>
          result.status === 'rejected' &&
          // Recovery already explains catalogue failures and provides the retry action.
          (index !== 1 || (activeWorkoutStartedAt === null && tab !== 'log')),
      );

      if (!silent)
        setMessage(
          firstFailure
            ? firstFailure.reason instanceof Error
              ? firstFailure.reason.message
              : 'Could not load all of your training data.'
            : null,
        );
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
    async () => {
      if (
        refreshingDataRef.current ||
        workoutSaving ||
        backgroundActivities.length ||
        loadingOlderHistoryRef.current
      )
        return;
      const generation = refreshGenerationRef.current;
      const { revision } = await api.workoutRevision();
      // A local save/refresh may have started while the revision request was in flight.
      if (
        generation !== refreshGenerationRef.current ||
        refreshingDataRef.current ||
        revision === trainingRevisionRef.current
      )
        return;
      await refreshData({ silent: true, activityLabel: null });
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

  function refreshAfterMutation(): Promise<void> {
    return refreshData({ silent: true, activityLabel: trainingDataActivityLabel('mutation') });
  }

  useEffect(() => {
    if (initialRefreshStartedRef.current) return;
    initialRefreshStartedRef.current = true;
    let cancelled = false;

    void readDashboardCache().then((cachedDashboard) => {
      if (!cancelled && cachedDashboard) setDashboard(cachedDashboard);
      if (!cancelled) void refreshData();
    });

    return () => {
      cancelled = true;
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
      action === 'pop' ? (scrollPositionsRef.current.get(historyIndexRef.current) ?? 0) : 0,
    );
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
      const nextTab = isAppHistoryState(event.state)
        ? event.state.tab
        : appTabFromHash(window.location.hash);
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
    setWorkoutSaving(true);
    ++refreshGenerationRef.current;
    // Keep the logger and its recovery draft mounted until the server confirms the save.
    setTab(wasEditing ? 'history' : 'dashboard', { replace: true });
    let saved: TrackedWorkout;
    try {
      saved = await withBackgroundActivity(
        wasEditing || resumedId ? 'Saving workout changes…' : 'Saving workout…',
        () =>
          editingWorkout
            ? api.updateWorkout(editingWorkout.id, payload)
            : resumedId
              ? api.updateWorkout(resumedId, payload)
              : api.createWorkout(payload),
      );
    } catch (error) {
      if (currentTabRef.current === (wasEditing ? 'history' : 'dashboard'))
        setTab('log', { replace: true });
      else if (currentTabRef.current !== 'log')
        setMessage(
          'Your workout could not be saved. Return to the workout to retry; your entries are still here.',
        );
      throw error;
    } finally {
      setWorkoutSaving(false);
    }

    setWorkouts((current) => upsertWorkoutByRecency(current, saved));
    if (!wasEditing) {
      clearActiveWorkoutDraft();
      setActiveWorkoutStartedAt(null);
      setResumingWorkoutId(null);
    }
    if (wasEditing && currentTabRef.current === 'log') setTab('history', { replace: true });
    setEditingWorkout(null);

    if (!wasEditing) {
      const signature = (record: PersonalRecord) =>
        `${record.exercise_id}:${record.record_type}:${record.weight_kg ?? record.normalized_weight}:${record.record_type === 'weight' ? (record.weight_kg ?? record.value) : record.value}`;
      const existing = new Set(
        personalRecords.filter((record) => record.workout_id === resumedId).map(signature),
      );
      void api
        .listPersonalRecords({ workoutId: saved.id })
        .then((records) =>
          setCompletionRecords(records.filter((record) => !existing.has(signature(record)))),
        )
        .catch(() => undefined);
    }
    void refreshData({ silent: true, activityLabel: 'Updating workout data…' });
  }

  async function deleteWorkout(workout: TrackedWorkout) {
    if (workoutSaving) return;
    try {
      await withBackgroundActivity('Deleting workout…', async () => {
        await api.deleteWorkout(workout.id);
        if (workout.id === resumingWorkoutId) {
          clearActiveWorkoutDraft();
          setActiveWorkoutStartedAt(null);
          setResumingWorkoutId(null);
        }
        await refreshData({ activityLabel: null });
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete that workout.');
    }
  }

  async function importWorkoutCsv(file: File, options?: WorkoutImportOptions) {
    const result = await withBackgroundActivity('Importing workouts…', async () => {
      const imported = await api.importWorkouts(file, options);
      await workoutTypes.reload();
      await refreshData({ activityLabel: null });
      return imported;
    });
    const bodyweightCount = result.body_measurements_created + result.body_measurements_updated;
    setMessage(
      !result.sets_imported &&
        !result.workouts_created &&
        !result.workouts_skipped &&
        bodyweightCount
        ? `Imported ${plural(bodyweightCount, 'body-weight check-in')}.`
        : `Imported ${plural(result.sets_imported, 'set')} across ${plural(result.workouts_created, 'workout')}${
            result.exercises_created
              ? ` and added ${plural(result.exercises_created, 'exercise')}`
              : ''
          }${bodyweightCount ? `; added ${plural(bodyweightCount, 'body-weight check-in')}` : ''}${
            result.workouts_skipped
              ? `; skipped ${plural(result.workouts_skipped, 'identical session')}`
              : ''
          }.`,
    );
  }

  async function deleteSampleData() {
    try {
      await withBackgroundActivity('Removing sample workouts…', async () => {
        await api.deleteSampleData();
        await refreshData({ activityLabel: null });
      });
      setMessage('Sample workouts removed. They will not be seeded again.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove sample data.');
    }
  }

  function startWorkout(
    workoutDate = localDate(),
    replaceActiveWorkout = false,
    template: SessionTemplate | null = null,
    category: WorkoutCategory | null = null,
  ) {
    if (workoutSaving) return;
    if (replaceActiveWorkout) clearActiveWorkoutDraft();
    const storedDraft = replaceActiveWorkout ? null : readActiveWorkoutDraft();
    const freshStart = !storedDraft && activeWorkoutStartedAt === null;
    setWorkoutTemplate(freshStart ? template : null);
    setWorkoutStartCategory(freshStart ? category : null);
    const startedAt = storedDraft?.startedAt ?? Date.now();
    setEditingWorkout(null);
    setResumingWorkoutId(storedDraft?.resumingWorkoutId ?? null);
    setActiveWorkoutStartedAt(startedAt);
    setWorkoutStartDate(storedDraft?.workoutDate ?? workoutDate);
    setTab('log');
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
  }

  function editWorkout(workout: TrackedWorkout) {
    if (workoutSaving) return;
    setEditingWorkout(workout);
    setWorkoutStartDate(workout.workout_date);
    setTab('log');
  }

  function resumeWorkout(workout: TrackedWorkout) {
    if (workoutSaving || activeWorkoutStartedAt !== null) return;
    clearActiveWorkoutDraft();
    setEditingWorkout(null);
    setResumingWorkoutId(workout.id);
    setActiveWorkoutStartedAt(Date.now());
    setWorkoutStartDate(workout.workout_date);
    setTab('log');
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
  }

  async function saveMeasurement(payload: {
    measurement_date: string;
    weight_kg: number;
    body_fat_pct: number | null;
    notes: string | null;
  }) {
    await withBackgroundActivity('Saving measurement…', async () => {
      await api.saveBodyMeasurement(payload);
      await refreshData({ activityLabel: null });
    });
  }

  async function deleteMeasurement(id: string) {
    try {
      await withBackgroundActivity('Deleting measurement…', async () => {
        await api.deleteBodyMeasurement(id);
        await refreshData({ activityLabel: null });
      });
      setMessage('Body measurement deleted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete that measurement.');
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
    setSettingsJump((current) => ({ destination, serial: (current?.serial ?? 0) + 1 }));
    setTab(destination.page);
  }

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
    tab === 'settings'
      ? settingsGroup
        ? { title: 'All settings', subtitle: null }
        : { title: 'Settings', subtitle: 'Preferences • privacy • data' }
      : tab === 'videos' && videosAllowed
        ? { title: 'Videos', subtitle: 'Workout clips • uploads' }
        : tab === 'profile'
          ? { title: 'Profile', subtitle: user ? user.display_name : 'Account • security' }
          : tab === 'shared-profile' && sharedProfile
            ? { title: sharedProfile.name, subtitle: 'Shared profile' }
            : tab === 'admin' && isAdmin
              ? { title: 'Admin console', subtitle: 'Accounts • switches • server' }
              : null;
  const activeMainTab = mainTabFor(tab);
  const showTabBar = tab !== 'log';
  // The home screen guide follows the release announcement, behind the same interruptions.
  const canShowPrompts = canShowReleaseAnnouncement({
    loading,
    tab,
    hasOtherDialog: message !== null || completionRecords.length > 0,
    signingIn,
  });
  const prompt = canShowPrompts
    ? nextOnboardingPrompt({
        tour: guideRequested || (guideWaiting && announcement.checked),
        importStep: importStepPending,
        release: announcement.open,
        releaseHeld: csvGuideOpen || (releaseAfterImport && tab === 'settings'),
      })
    : null;

  function openSharedProfile(
    profile: Pick<SharedProfileSummary, 'id' | 'display_name'> & { is_you?: boolean },
  ) {
    if (profile.id === user?.id) {
      setTab('profile');
      return;
    }
    setSharedProfile((current) => ({
      id: profile.id,
      name: profile.is_you ? 'Your shared profile' : profile.display_name,
      opened: (current?.opened ?? 0) + 1,
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
        className={`tracker-app${showTabBar ? ' has-tab-bar' : ''}${appUpdates.available ? ' has-app-update' : ''}`}
      >
        {appUpdates.available && (
          <AppUpdateBanner
            version={appUpdates.availableRelease?.version}
            refreshing={appUpdates.refreshing}
            error={appUpdates.refreshError}
            onRefresh={() => void appUpdates.refresh()}
          />
        )}
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
        {homeScreenGuide.open &&
          !guideRequested &&
          !guideWaiting &&
          !importStepPending &&
          !announcement.open &&
          canShowPrompts && <HomeScreenGuide onClose={homeScreenGuide.dismiss} />}
        <EdgeSwipeBack onBack={navigateBack} enabled={canNavigateBack} />
        <BackgroundActivityBar label={backgroundActivityLabel} />
        {message && (
          <NotificationDialog key={message} message={message} onClose={() => setMessage(null)} />
        )}
        {completionRecords.length > 0 && (
          <WorkoutCompletionToast
            records={completionRecords}
            onClose={() => setCompletionRecords([])}
          />
        )}

        {nestedHeader && (
          <OverlayScreenHeader
            title={nestedHeader.title}
            subtitle={nestedHeader.subtitle}
            onBack={navigateBack}
            backLabel={tab === 'settings' && settingsGroup ? 'All settings' : undefined}
            actions={
              tab !== 'settings' ? <SettingsButton onClick={() => setTab('settings')} /> : undefined
            }
          />
        )}

        <main
          className={`tracker-content ${tab === 'videos' ? 'video-content' : ''} ${nestedHeader || tab === 'log' ? 'with-overlay-header' : ''}`}
          data-nav-direction={navDirection}
        >
          {loading &&
            tab !== 'dashboard' &&
            tab !== 'videos' &&
            tab !== 'profile' &&
            tab !== 'shared-profile' &&
            tab !== 'admin' && <TodaySkeleton />}
          {(tab === 'dashboard' || visitedTabs.has('dashboard')) && (
            <CachedTabPanel active={tab === 'dashboard'}>
              {loading && dashboard === null ? (
                <TodaySkeleton />
              ) : (
                <TodayScreen
                  home={home}
                  data={dashboard}
                  workouts={workouts}
                  measurements={measurements}
                  personalRecords={personalRecords}
                  categoryColors={workoutTypeColors}
                  workoutStartedAt={activeWorkoutStartedAt}
                  workoutSaving={workoutSaving}
                  todayBodyweight={todayMeasurement?.weight_kg ?? null}
                  todayBodyFat={todayMeasurement?.body_fat_pct ?? null}
                  onSaveBodyFat={(bodyFat) =>
                    withBackgroundActivity('Saving body fat…', async () => {
                      const undo = await saveBodyFatCheckIn(
                        todayMeasurement ?? null,
                        localDate(),
                        bodyFat,
                      );
                      await refreshData({ activityLabel: null });
                      return async () => {
                        await withBackgroundActivity('Undoing check-in…', async () => {
                          await undo();
                          await refreshData({ activityLabel: null });
                        });
                      };
                    })
                  }
                  onSaveBodyweight={(weight) =>
                    withBackgroundActivity('Saving measurement…', async () => {
                      const undo = await saveBodyweightCheckIn(
                        todayMeasurement ?? null,
                        localDate(),
                        weight,
                      );
                      await refreshData({ activityLabel: null });
                      return async () => {
                        await withBackgroundActivity('Undoing check-in…', async () => {
                          await undo();
                          await refreshData({ activityLabel: null });
                        });
                      };
                    })
                  }
                  onStartTemplate={(template) => startWorkout(localDate(), false, template)}
                  onStartEmpty={() => startWorkout()}
                  onResumeWorkout={() => setTab('log')}
                  onOpenHistory={() => openHistorySection('history')}
                  onOpenWorkout={openMuscleWorkout}
                  onOpenProgress={(exerciseId) =>
                    openHistorySection('progress', exerciseId ?? null)
                  }
                  onOpenCardio={() => openHistorySection('cardio')}
                  onOpenBody={() => setTab('body')}
                  onOpenSettings={() => setTab('settings')}
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
                  calendar={
                    <InteractiveWorkoutCalendar
                      entries={dashboard?.heatmap ?? []}
                      workouts={workouts}
                      olderHistory={olderHistoryProps}
                      categoryColors={workoutTypeColors}
                      activeWorkout={activeWorkoutStartedAt !== null}
                      activeWorkoutDate={activeWorkoutDate}
                      onResumeWorkout={() => setTab('log')}
                      onEditWorkout={editWorkout}
                      onStartWorkout={(workoutDate) => startWorkout(workoutDate)}
                      onReplaceActiveWorkout={(workoutDate) => startWorkout(workoutDate, true)}
                    />
                  }
                />
              )}
            </CachedTabPanel>
          )}
          {!loading &&
            (tab === 'log' ||
              activeWorkoutStartedAt !== null ||
              (visitedTabs.has('log') && editingWorkout !== null)) && (
              <CachedTabPanel active={tab === 'log'}>
                {workoutCatalogueReady ? (
                  <WorkoutBrowser
                    key={
                      editingWorkout
                        ? `edit-${editingWorkout.id}`
                        : `active-${activeWorkoutStartedAt ?? workoutStartDate}`
                    }
                    workouts={workouts}
                    initialWorkout={editingWorkout}
                    resumedWorkoutId={resumingWorkoutId}
                    hasOlder={olderHistoryAvailable}
                  >
                    {(navigation, viewedWorkout) => (
                      <WorkoutLogger
                        key={viewedWorkout?.id ?? 'original'}
                        exercises={exercises}
                        restoredDraftMovements={restoredDraftMovements}
                        recommendation={dashboard?.recommendation ?? null}
                        template={workoutTemplate}
                        startCategory={workoutStartCategory}
                        initialDate={workoutStartDate}
                        initialWorkout={viewedWorkout ?? editingWorkout}
                        readOnly={Boolean(viewedWorkout)}
                        navigation={navigation}
                        resumingWorkout={viewedWorkout ? null : resumingWorkout}
                        currentBodyweight={
                          viewedWorkout
                            ? savedWorkoutBodyweight(viewedWorkout)
                            : (measurements[0]?.weight_kg ?? null)
                        }
                        historicalWorkouts={workouts}
                        historyBaselines={historyBaselines}
                        restTimerEnabled={restTimerEnabled}
                        showRestTimes={showRestTimes}
                        categoryColors={workoutTypeColors}
                        onExerciseHistory={(exerciseId) =>
                          openHistorySection('progress', exerciseId)
                        }
                        onExerciseFavorite={updateExerciseFavorite}
                        onCreateExercise={createExercise}
                        onSave={saveWorkout}
                        onAutoSaved={() =>
                          setMessage(
                            'Your inactive workout passed its time limit and was auto-saved.',
                          )
                        }
                        activeStartedAt={activeWorkoutStartedAt}
                        onRestTimerChange={
                          editingWorkout || viewedWorkout ? undefined : setRestEndsAt
                        }
                        onClose={navigateBack}
                        onDelete={() => {
                          if (workoutSaving) return;
                          if (editingWorkout) {
                            void deleteWorkout(editingWorkout);
                            setTab('history');
                          } else {
                            clearActiveWorkoutDraft();
                            setActiveWorkoutStartedAt(null);
                            setResumingWorkoutId(null);
                            setTab('dashboard');
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
                      className="primary"
                      onClick={() => void refreshData({ activityLabel: 'Reloading exercises…' })}
                    >
                      Retry loading exercises
                    </button>
                  </section>
                )}
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
                onOpenSettings={() => setTab('settings')}
                accountActions={accountHeaderActions(tab === 'body')}
              />
            </CachedTabPanel>
          )}
          {!loading && historyGroupVisited && (
            <CachedTabPanel active={sectionFromTab !== null}>
              <HistoryScreen
                dataRevision={dataRevision}
                key={`${historyOpenId ?? 'history'}-${historyExerciseId ?? 'all'}-${historyMovementId ?? 'any'}-${historyOpenCount}`}
                workouts={workouts}
                categoryColors={workoutTypeColors}
                measurements={measurements}
                exercises={exercises}
                onEdit={editWorkout}
                onResume={resumeWorkout}
                onDelete={deleteWorkout}
                personalRecords={personalRecords}
                onDataChange={refreshAfterMutation}
                initialOpenId={historyOpenId}
                section={historySection}
                onSectionChange={(section) => setTab(section)}
                onOpenSettings={() => setTab('settings')}
                accountActions={accountHeaderActions(sectionFromTab !== null)}
                onOpenExercise={(exerciseId) => openHistorySection('progress', exerciseId)}
                onOpenWorkout={openSavedWorkout}
                initialExerciseId={historyExerciseId}
                initialMovementId={historyMovementId}
                weekStartDay={weekStartDayFrom(dashboard?.weekly_sets?.week_start)}
                heatmap={dashboard?.heatmap ?? []}
                weeklySets={dashboard?.weekly_sets}
                onOpenMuscleWorkout={openMuscleWorkout}
                historySummary={historySummary}
                olderHistory={olderHistoryProps}
                activeWorkout={activeWorkoutStartedAt !== null}
                activeWorkoutDate={activeWorkoutDate}
                onResumeWorkout={() => setTab('log')}
                onStartWorkout={(workoutDate) => startWorkout(workoutDate)}
                onReplaceActiveWorkout={(workoutDate) => startWorkout(workoutDate, true)}
              />
            </CachedTabPanel>
          )}
          {!loading && (tab === 'settings' || visitedTabs.has('settings')) && (
            <CachedTabPanel active={tab === 'settings'}>
              <SettingsScreen
                active={tab === 'settings'}
                selectedGroup={settingsGroup}
                onSelectGroup={setSettingsGroup}
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
                csvGuideOpen={csvGuideOpen}
                onCsvGuideOpenChange={setCsvGuideOpen}
                onDeleteSamples={deleteSampleData}
                onDataChange={refreshAfterMutation}
                account={user}
                onOpenProfile={() => setTab('profile')}
                openFeedback={openFeedback}
                onOpenAdmin={isAdmin ? () => setTab('admin') : undefined}
                releaseVersion={announcement.release.version}
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
          {user && (tab === 'social' || visitedTabs.has('social')) && (
            <CachedTabPanel active={tab === 'social'}>
              <SocialScreen
                active={tab === 'social'}
                account={user}
                openFeedback={openFeedback}
                onOpenProfile={openSharedProfile}
                onOpenOwnProfile={() => setTab('profile')}
                onChooseSharing={openSharingSettings}
                onOpenSettings={() => setTab('settings')}
              />
            </CachedTabPanel>
          )}
          {user && (tab === 'profile' || visitedTabs.has('profile')) && (
            <CachedTabPanel active={tab === 'profile'}>
              <ProfileScreen
                onOpenMember={openSharedProfile}
                dataRevision={dataRevision}
                active={tab === 'profile'}
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
                  onOpenMember={openSharedProfile}
                  profileId={sharedProfile.id}
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
            homeLayout={home}
            active={activeMainTab}
            workoutStartedAt={activeWorkoutStartedAt}
            restEndsAt={restEndsAt}
            workoutSaving={workoutSaving}
            onSelect={(nextTab) => {
              if (nextTab === 'training')
                setTab(lastHistorySection === 'history' ? 'training' : lastHistorySection);
              else setTab(nextTab);
            }}
            onStart={() => startWorkout()}
            startMenu={{
              upNextLabel: upNext.label ? `${upNext.label} day` : null,
              onCardio: () =>
                startWorkout(
                  localDate(),
                  false,
                  sessionTemplateFor(workouts, 'cardio', localDate(), weightUnit),
                  'cardio',
                ),
              onUpNext: () => startWorkout(localDate(), false, upNext.template),
              onEmpty: () => startWorkout(),
            }}
          />
        )}
      </div>
    </AppContentProviders>
  );
}

function LoadingState() {
  return (
    <section className="loading-state">
      <span />
      <p>Loading your training log…</p>
    </section>
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
  return (
    <header className="overlay-screen-header">
      <button className="overlay-header-back" type="button" onClick={onBack} aria-label={backLabel}>
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

function CalendarCreateWorkoutDialog({
  workoutDate,
  activeWorkout,
  onCancel,
  onConfirm,
}: {
  workoutDate: string;
  activeWorkout: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const backdropDismiss = useBackdropDismiss(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const root = document.getElementById('root');
    const rootWasInert = root?.hasAttribute('inert') ?? false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root?.setAttribute('inert', '');
    cancelButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancelRef.current();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (!rootWasInert) root?.removeAttribute('inert');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop calendar-create-backdrop" {...backdropDismiss}>
      <section
        className="calendar-create-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-create-title"
        aria-describedby="calendar-create-description"
      >
        <div
          className={`calendar-create-icon ${activeWorkout ? 'active-conflict' : ''}`}
          aria-hidden="true"
        >
          {activeWorkout ? '!' : '+'}
        </div>
        <p className="section-kicker">{activeWorkout ? 'WORKOUT IN PROGRESS' : 'NEW WORKOUT'}</p>
        <h2 id="calendar-create-title">
          {activeWorkout ? 'Cancel your current workout?' : 'Create a new workout?'}
        </h2>
        <p id="calendar-create-description">
          {activeWorkout
            ? `Creating a workout for ${prettyDate(workoutDate)} will discard your current unsaved workout.`
            : `Start a workout for ${prettyDate(workoutDate)}?`}
        </p>
        <div className="calendar-create-actions">
          <button ref={cancelButtonRef} type="button" onClick={onCancel}>
            {activeWorkout ? 'Keep current workout' : 'Cancel'}
          </button>
          <button
            className={activeWorkout ? 'cancel-current-workout-button' : 'create-workout-button'}
            type="button"
            onClick={onConfirm}
          >
            {activeWorkout ? 'Cancel & create new' : 'Create workout'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function InteractiveWorkoutCalendar({
  entries,
  workouts,
  olderHistory,
  categoryColors,
  activeWorkout,
  activeWorkoutDate,
  onResumeWorkout,
  onEditWorkout,
  onStartWorkout,
  onReplaceActiveWorkout,
}: {
  entries: DashboardData['heatmap'];
  workouts: TrackedWorkout[];
  olderHistory?: OlderHistoryProps;
  categoryColors: WorkoutTypeColors;
  activeWorkout: boolean;
  activeWorkoutDate: string | null;
  onResumeWorkout: () => void;
  onEditWorkout: (workout: TrackedWorkout) => void;
  onStartWorkout: (workoutDate: string) => void;
  onReplaceActiveWorkout: (workoutDate: string) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<DashboardData['heatmap'][number] | null>(null);
  const [pendingWorkoutDate, setPendingWorkoutDate] = useState<string | null>(null);
  // Every type shows by default; tapping one in the legend greys it out in the calendar.
  const { types } = useWorkoutTypes();
  const [hiddenCategories, setHiddenCategories] = useState<ReadonlySet<string>>(() => new Set());
  const presentTypes = calendarLegendTypes(entries, types);
  const toggleCategory = (category: string) =>
    setHiddenCategories((current) => {
      const next = new Set(current);
      if (!next.delete(category)) next.add(category);
      return next;
    });

  return (
    <>
      <WorkoutCalendar
        entries={entries}
        olderHistory={olderHistory}
        categoryColors={categoryColors}
        hiddenCategories={hiddenCategories}
        activeWorkoutDate={activeWorkoutDate}
        onActiveWorkoutClick={onResumeWorkout}
        onDayClick={(workoutDate, entry) => {
          if (entry) setSelectedDay(entry);
          else setPendingWorkoutDate(workoutDate);
        }}
      />
      <WorkoutCalendarLegend
        presentTypes={presentTypes}
        hiddenCategories={hiddenCategories}
        categoryColors={categoryColors}
        onToggle={toggleCategory}
      />
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

function CalendarDayDetail({
  day,
  categoryColors,
  onClose,
  onStartWorkout,
  onEditWorkout,
}: {
  day: DashboardData['heatmap'][number];
  categoryColors: WorkoutTypeColors;
  onClose: () => void;
  onStartWorkout: (workoutDate: string) => void;
  onEditWorkout: (workoutId: string) => void;
}) {
  const weightUnit = useWeightUnit();
  const { types } = useWorkoutTypes();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const backdropDismiss = useBackdropDismiss(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const root = document.getElementById('root');
    const rootWasInert = root?.hasAttribute('inert') ?? false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root?.setAttribute('inert', '');
    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (!rootWasInert) root?.removeAttribute('inert');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop calendar-day-backdrop" {...backdropDismiss}>
      <section
        className="calendar-day-detail"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-day-detail-title"
      >
        <header>
          <div>
            <p className="section-kicker">TRAINING DAY</p>
            <h2 id="calendar-day-detail-title">{prettyDate(day.workout_date)}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close workout details"
          >
            ×
          </button>
        </header>
        <div className="calendar-day-workouts">
          {day.workouts.map((workout) => (
            <article key={workout.id}>
              <button
                type="button"
                className="calendar-workout-open"
                onClick={() => onEditWorkout(workout.id)}
                aria-label={`View and edit ${workout.name}`}
              >
                <i
                  style={{
                    background: workout.workout_type_id
                      ? effectiveWorkoutType(workout, types).color
                      : categoryColors[workout.category],
                  }}
                />
                <span>
                  <strong>{workout.name}</strong>
                  <small>
                    {effectiveWorkoutType(workout, types).name} ·{' '}
                    {formatMinutesDuration(workout.duration_minutes)}
                  </small>
                </span>
                <svg className="disclosure-chevron" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m7 4 6 6-6 6" />
                </svg>
              </button>
              {workout.exercises.map((exercise) => (
                <p key={exercise.exercise_name}>
                  <span>
                    {exercise.exercise_name}
                    {exercise.bodyweight_kg !== null &&
                      ` @ ${formatWeight(exercise.bodyweight_kg, weightUnit)}`}
                  </span>
                  <b>{exercise.set_count} sets</b>
                </p>
              ))}
              <button
                type="button"
                className="calendar-edit-workout"
                onClick={() => onEditWorkout(workout.id)}
              >
                View &amp; edit workout
              </button>
            </article>
          ))}
        </div>
        <button
          type="button"
          className="calendar-add-workout"
          onClick={() => onStartWorkout(day.workout_date)}
        >
          Add another workout
        </button>
      </section>
    </div>,
    document.body,
  );
}

function savedWorkoutBodyweight(workout: TrackedWorkout): number | null {
  return (
    workout.movements.flatMap((movement) => movement.sets).find((set) => set.bodyweight_kg !== null)
      ?.bodyweight_kg ?? null
  );
}

function BrowsedWorkoutDetails({
  workout,
  categoryColor,
}: {
  workout: TrackedWorkout;
  categoryColor: string;
}) {
  const [photo, setPhoto] = useState<MachinePhoto | null>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  return (
    <div className="browse-history-content">
      <HistoryWorkoutCard
        detailsOnly
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
  initialDate,
  initialWorkout,
  readOnly = false,
  navigation,
  resumingWorkout,
  currentBodyweight,
  historicalWorkouts,
  historyBaselines = null,
  restTimerEnabled,
  showRestTimes,
  onExerciseHistory,
  onExerciseFavorite,
  onCreateExercise,
  onSave,
  onAutoSaved,
  activeStartedAt,
  onClose,
  onDelete,
  onRestTimerChange,
}: {
  exercises: Exercise[];
  restoredDraftMovements: DraftMovement[];
  categoryColors: WorkoutTypeColors;
  recommendation: WorkoutRecommendation | null;
  template: SessionTemplate | null;
  /** A type chosen before starting, such as Cardio from the Start menu. */
  startCategory?: WorkoutCategory | null;
  initialDate: string;
  initialWorkout: TrackedWorkout | null;
  readOnly?: boolean;
  navigation: WorkoutNavigation;
  resumingWorkout: TrackedWorkout | null;
  currentBodyweight: number | null;
  /** Loaded recent workouts; `historyBaselines` condenses everything older. */
  historicalWorkouts: TrackedWorkout[];
  historyBaselines?: HistoryBaselines | null;
  restTimerEnabled: boolean;
  showRestTimes: boolean;
  onExerciseHistory: (exerciseId: string) => void;
  onExerciseFavorite: (exerciseId: string, isFavorite: boolean) => Promise<void>;
  onCreateExercise: (input: ExerciseCreateInput) => Promise<Exercise>;
  onSave: (payload: WorkoutInput) => Promise<void>;
  onAutoSaved: () => void;
  activeStartedAt: number | null;
  onClose: () => void;
  onDelete: () => void;
  /** When the rest ends, or null without one, for the countdown on the tab bar. */
  onRestTimerChange?: (endsAt: number | null) => void;
}) {
  const weightUnit = useWeightUnit();
  const restoredDraft = useState(() => (initialWorkout ? null : readActiveWorkoutDraft()))[0];
  const [name, setName] = useState(
    initialWorkout?.name ?? restoredDraft?.name ?? resumingWorkout?.name ?? '',
  );
  const [workoutDate, setWorkoutDate] = useState(
    initialWorkout?.workout_date ??
      restoredDraft?.workoutDate ??
      resumingWorkout?.workout_date ??
      initialDate,
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
  const [movements, setMovements] = useState<DraftMovement[]>(() =>
    sourceWorkout
      ? sourceWorkout.movements.map((movement) => ({
          key: crypto.randomUUID(),
          exercise: movement.exercise,
          notes: movement.notes ?? '',
          machinePhotoIds: movement.machine_photos.map((photo) => photo.id),
          machinePhotosInitialized: true,
          supersetKey: movement.superset_group_id,
          isComplete: false,
          sets: movement.sets.map((item) => ({
            key: crypto.randomUUID(),
            reps: item.reps,
            weight_kg: item.weight_kg,
            rpe: item.rpe,
            rest_seconds: item.rest_seconds,
            duration_seconds: item.duration_seconds,
            distance_km: item.distance_km,
            calories_kcal: item.calories_kcal,
            average_heart_rate_bpm: item.average_heart_rate_bpm,
            incline_percent: item.incline_percent,
            speed_kph: item.speed_kph,
            bodyweight_kg: item.bodyweight_kg,
            percentile: item.percentile,
            warmup: item.warmup,
            set_type: item.set_type,
            failed: item.failed,
            target_reps: item.target_reps,
            notes: item.notes,
            completed: item.completed,
            // Saved rows have no suggestion provenance. Keep unfinished performance planned
            // when resuming; logging or editing its values will mark it as entered.
            fromPrevious: !item.completed,
          })),
        }))
      : restoredDraft
        ? restoredDraftMovements
        : (template?.exercises ?? []).map(({ exercise }) => ({
            key: crypto.randomUUID(),
            exercise,
            notes: '',
            machinePhotoIds: [],
            machinePhotosInitialized: false,
            supersetKey: null,
            isComplete: false,
            sets: suggestedSetsFromHistory(
              historicalWorkouts,
              exercise,
              initialDate,
              undefined,
              historyBaselines && initialDate >= historyBaselines.before
                ? historyBaselines.byExercise
                : null,
            ),
          })),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const movementStackRef = useRef<HTMLDivElement>(null);
  useFlipAnimation(movementStackRef, movements.map((movement) => movement.key).join('|'));
  const [switchingMovementKey, setSwitchingMovementKey] = useState<string | null>(null);
  const [supersetPickerKey, setSupersetPickerKey] = useState<string | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [finishConfirmationOpen, setFinishConfirmationOpen] = useState(false);
  const [nameEditorOpen, setNameEditorOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const supersetButtonRef = useRef<HTMLButtonElement>(null);
  const startedAt = useState(() => restoredDraft?.startedAt ?? activeStartedAt ?? Date.now())[0];
  const resumedWorkoutId = restoredDraft?.resumingWorkoutId ?? resumingWorkout?.id ?? null;
  const previousDurationMinutes = useState(
    () => restoredDraft?.previousDurationMinutes ?? resumingWorkout?.duration_minutes ?? 0,
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
  const finishWorkoutRef = useRef<(automaticEndAt?: number) => Promise<void>>(async () => {});
  const [elapsed, setElapsed] = useState(
    initialWorkout
      ? (initialWorkout.duration_minutes ?? 0) * 60
      : Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
  );
  const [restLeft, setRestLeft] = useState(0);
  // The rest popup shows each new timer; dismissing it moves the countdown beside the live time.
  const [restTotal, setRestTotal] = useState(0);
  const [restPopupOpen, setRestPopupOpen] = useState(false);
  const restNotificationEndpointRef = useRef<string | null>(null);
  const activeRestTimerRef = useRef<{
    id: string;
    endsAt: number;
    serverScheduled: boolean;
    pendingSchedules: Set<Promise<void>>;
  } | null>(null);

  useEffect(() => {
    if (initialWorkout) return;
    const timer = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [initialWorkout, startedAt]);

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
      return writeActiveWorkoutDraft({
        version: 1,
        startedAt,
        ...(resumedWorkoutId && {
          resumingWorkoutId: resumedWorkoutId,
          previousDurationMinutes,
        }),
        updatedAt: Date.now(),
        lastActiveAt: lastActiveAtRef.current,
        inactiveFinishAt: inactiveFinishAtRef.current,
        durationOverrideMinutes,
        name,
        workoutDate,
        category,
        workoutTypeId: customTypeId,
        workoutTypeExplicit,
        notes,
        movements: movements.map((movement) => ({
          key: movement.key,
          exerciseId: movement.exercise.id,
          notes: movement.notes,
          machinePhotoIds: movement.machinePhotoIds,
          supersetKey: movement.supersetKey,
          isComplete: movement.isComplete,
          sets: movement.sets,
        })),
      });
    };
    const recordActivity = () => {
      const now = Date.now();
      if (now >= inactiveFinishAtRef.current) {
        void finishWorkoutRef.current(inactiveFinishAtRef.current);
        return;
      }
      lastActiveAtRef.current = now;
      inactiveFinishAtRef.current = extendInactiveWorkoutFinishAt(inactiveFinishAtRef.current, now);
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
    persistDraft();
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
    initialWorkout,
    readOnly,
    movements,
    name,
    notes,
    previousDurationMinutes,
    resumedWorkoutId,
    startedAt,
    workoutDate,
    durationOverrideMinutes,
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
          if (timer) scheduleRestTimerPush(timer, subscription.endpoint);
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
    const interval = window.setInterval(() => {
      const active = activeRestTimerRef.current;
      if (!active) return;
      const next = restSecondsLeft(active.endsAt);
      setRestLeft((current) => {
        if (next === 0 && current > 0) {
          activeRestTimerRef.current = null;
          if (!active.serverScheduled) void showRestTimerNotification();
        }
        return next;
      });
    }, 500);
    return () => window.clearInterval(interval);
  }, [restLeft]);

  const [undoDeletion, setUndoDeletion] = useState<{
    kind: 'set' | 'rest';
    movementKey: string;
    set: DraftSet;
    index: number;
  } | null>(null);

  // The undo toast is temporary; each new deletion restarts its timer.
  useEffect(() => {
    if (!undoDeletion) return;
    const timer = window.setTimeout(() => setUndoDeletion(null), UNDO_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [undoDeletion]);

  // Older history only precedes workouts inside the window it was condensed for. An earlier
  // date (editing an older loaded workout) compares with the loaded workouts alone.
  const olderHistory =
    historyBaselines && workoutDate >= historyBaselines.before ? historyBaselines.byExercise : null;
  const prBadges = useMemo(
    () =>
      calculateDraftPrs(
        movements,
        historicalWorkouts,
        initialWorkout?.id ?? resumedWorkoutId,
        workoutDate,
        olderHistory,
      ),
    [
      movements,
      historicalWorkouts,
      initialWorkout?.id,
      resumedWorkoutId,
      workoutDate,
      olderHistory,
    ],
  );
  const completedSetKeysRef = useRef(
    new Set(
      movements.flatMap((movement) =>
        movement.sets.filter((item) => item.completed).map((item) => item.key),
      ),
    ),
  );
  const [prConfettiBurst, setPrConfettiBurst] = useState(0);
  const [prToastEntries, setPrToastEntries] = useState<PrToastEntry[]>([]);
  const [prToastId, setPrToastId] = useState(0);
  const celebratedPrsRef = useRef(
    new Set(
      movements.flatMap((movement) =>
        movement.sets.flatMap((item) => {
          const labels = prBadges.get(movement.key)?.get(item.key);
          return item.completed && labels
            ? [
                `${movement.exercise.id}:${item.key}:${labels.join(',')}:${item.weight_kg}:${item.reps}`,
              ]
            : [];
        }),
      ),
    ),
  );
  const closePrToast = useCallback(() => setPrToastEntries([]), []);

  useEffect(() => {
    const completedSetKeys = new Set<string>();
    const entries: PrToastEntry[] = [];
    movements.forEach((movement) => {
      movement.sets.forEach((item) => {
        if (!item.completed) return;
        completedSetKeys.add(item.key);
        if (
          !completedSetKeysRef.current.has(item.key) &&
          prBadges.get(movement.key)?.has(item.key)
        ) {
          const labels = prBadges.get(movement.key)!.get(item.key)!;
          const signature = `${movement.exercise.id}:${item.key}:${labels.join(',')}:${item.weight_kg}:${item.reps}`;
          if (!celebratedPrsRef.current.has(signature)) {
            celebratedPrsRef.current.add(signature);
            entries.push({
              exercise: movement.exercise.name,
              labels,
              reps: item.reps!,
              weightKg: item.weight_kg!,
            });
          }
        }
      });
    });
    completedSetKeysRef.current = completedSetKeys;
    if (entries.length) {
      setPrConfettiBurst((current) => current + 1);
      setPrToastId((current) => current + 1);
      setPrToastEntries(entries);
    }
  }, [movements, prBadges]);
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

  function suggestedSetsForExercise(exercise: Exercise): DraftSet[] {
    return suggestedSetsFromHistory(
      historicalWorkouts,
      exercise,
      workoutDate,
      initialWorkout?.id,
      olderHistory,
    );
  }

  function addExercises(selected: Exercise[], createSuperset = false) {
    setMovements((current) => {
      const merged = mergeUniqueById(
        current.map((item) => item.exercise),
        selected,
      );
      const additions = merged.slice(current.length).map((exercise) => ({
        key: crypto.randomUUID(),
        exercise,
        notes: '',
        machinePhotoIds: [],
        machinePhotosInitialized: false,
        supersetKey: null,
        isComplete: false,
        sets: suggestedSetsForExercise(exercise),
      }));
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
    setPickerOpen(false);
  }

  function closeExercisePicker() {
    setPickerOpen(false);
    setSwitchingMovementKey(null);
  }

  function switchExercise(selected: Exercise[]) {
    const replacement = selected[0];
    if (!switchingMovementKey || !replacement) return;
    const suggestedSets = suggestedSetsForExercise(replacement);
    setMovements((current) =>
      replaceMovementExercise(current, switchingMovementKey, replacement).map((movement) =>
        movement.key === switchingMovementKey ? { ...movement, sets: suggestedSets } : movement,
      ),
    );
    closeExercisePicker();
  }

  function moveMovement(index: number, direction: -1 | 1) {
    setMovements((current) => moveItem(current, index, index + direction));
  }

  function moveSet(movementKey: string, fromIndex: number, toIndex: number) {
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
      setError('An exercise needs at least one set. Remove the exercise instead.');
      return;
    }
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
        return { ...movement, sets };
      }),
    );
    setUndoDeletion(null);
  }

  function openSupersetPicker(movementKey: string, button: HTMLButtonElement) {
    supersetButtonRef.current = button;
    setError(null);
    setSupersetPickerKey(movementKey);
  }

  function closeSupersetPicker() {
    setSupersetPickerKey(null);
    window.requestAnimationFrame(() => supersetButtonRef.current?.focus());
  }

  function saveSuperset(movementKey: string, partnerKeys: string[]) {
    setMovements((items) =>
      applySupersetSelection(items, movementKey, partnerKeys, crypto.randomUUID()),
    );
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
      serverScheduled: false,
      pendingSchedules: new Set<Promise<void>>(),
    };
    activeRestTimerRef.current = timer;
    setRestLeft(seconds);
    setRestTotal(seconds);
    setRestPopupOpen(true);
    onRestTimerChange?.(timer.endsAt);
    const endpoint = restNotificationEndpointRef.current;
    if (endpoint) scheduleRestTimerPush(timer, endpoint);
  }

  /** Adds or takes off rest; taking off all of it ends the rest like Cancel. */
  function adjustRestTimer(deltaSeconds: number) {
    const timer = activeRestTimerRef.current;
    if (!timer) return;
    const left = restSecondsLeft(timer.endsAt) + deltaSeconds;
    if (left <= 0) {
      cancelRestTimer();
      return;
    }
    timer.endsAt = Date.now() + left * 1000;
    setRestLeft(left);
    setRestTotal((total) => Math.max(left, total + deltaSeconds));
    onRestTimerChange?.(timer.endsAt);
    // Scheduling again replaces this device's pending "Rest complete" notification.
    const endpoint = restNotificationEndpointRef.current;
    if (endpoint) scheduleRestTimerPush(timer, endpoint);
  }

  function cancelRestTimer() {
    const timer = activeRestTimerRef.current;
    activeRestTimerRef.current = null;
    setRestLeft(0);
    setRestPopupOpen(false);
    onRestTimerChange?.(null);
    void dismissRestTimerNotifications().catch(() => undefined);
    const endpoint = restNotificationEndpointRef.current;
    if (timer && endpoint) {
      const cancelServerTimer = () =>
        api.cancelRestTimerNotification({ endpoint, timer_id: timer.id });
      void cancelRestTimerPushSchedule(cancelServerTimer, timer.pendingSchedules);
    }
  }

  function skipRestTimer() {
    cancelRestTimer();
  }

  useEffect(() => {
    if (restTimerEnabled) return;
    cancelRestTimer();
  }, [restTimerEnabled]);

  // A closed workout leaves no rest countdown on the tab bar.
  useEffect(() => () => onRestTimerChange?.(null), [onRestTimerChange]);

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
    const restSeconds =
      movement && currentSet
        ? restTimerSecondsAfterSetUpdate(movement.exercise.kind, currentSet, update)
        : null;
    const loggingSet = update.completed === true && currentSet?.completed === false;
    // Correcting the weight or reps of a logged set also moves the untouched suggestion after it.
    const correctingLoggedSet =
      currentSet?.completed === true &&
      (update.weight_kg !== undefined || update.reps !== undefined);

    setMovements((current) =>
      current.map((movement) => {
        if (movement.key !== movementKey) return movement;
        const sets = movement.sets.map((item) =>
          item.key === setKey ? workoutSetAfterEdit(item, update) : item,
        );
        return {
          ...movement,
          sets:
            loggingSet || correctingLoggedSet
              ? suggestNextSetFromLoggedSet(
                  movement.exercise.kind,
                  sets,
                  sets.findIndex((item) => item.key === setKey),
                )
              : sets,
        };
      }),
    );
    if (restSeconds !== null) startRestTimer(restSeconds);
  }

  function toggleSet(movement: DraftMovement, item: DraftSet) {
    updateSet(movement.key, item.key, { completed: !item.completed });
  }

  function addSet(movement: DraftMovement) {
    setMovements((current) =>
      current.map((item) =>
        item.key === movement.key
          ? { ...item, sets: [...item.sets, emptySet(item.exercise.kind, item.sets.at(-1))] }
          : item,
      ),
    );
  }

  function removeMovement(key: string) {
    setMovements((current) => current.filter((item) => item.key !== key));
  }

  function openExercisePicker() {
    setSwitchingMovementKey(null);
    setPickerOpen(true);
  }

  async function finishWorkout(automaticEndAt?: number) {
    if (savingRef.current) return;
    if (workoutTypes.loading) {
      setError('Workout types are still loading. Please try saving again in a moment.');
      return;
    }
    if (customTypeId && selectedType.id !== customTypeId) {
      setError('Your workout type could not load. Reload workout types or choose another type.');
      return;
    }
    if (!typeOptions.some((type) => type.id === selectedType.id)) {
      setError('Choose an available workout type. Add or restore types in Settings if needed.');
      return;
    }
    if (selectedType.archived && !initialWorkout && !resumedWorkoutId) {
      setError('This workout type was removed. Choose another type before saving.');
      return;
    }
    const finishedAt = automaticEndAt ?? Date.now();
    const durationMinutes = initialWorkout
      ? editedDurationMinutes
      : completedWorkoutDurationMinutes(
          previousDurationMinutes,
          startedAt,
          finishedAt,
          durationOverrideMinutes,
        );
    const movementsToSave =
      automaticEndAt === undefined
        ? movements
        : movements.map((movement) => ({
            ...movement,
            sets: movement.sets.map((item) => workoutSetForAutoSave(movement.exercise.kind, item)),
          }));
    const completed = movementsToSave
      .flatMap((movement) => movement.sets)
      .filter((item) => item.completed);
    if (!movements.length || !completed.length) {
      setError('Add an exercise and complete at least one set before saving.');
      return;
    }
    if (initialWorkout && Boolean(startTime) !== Boolean(endTime)) {
      setError('Enter both a workout start time and end time, or leave both blank.');
      return;
    }
    if (!initialWorkout && durationOverrideMinutes === null && durationMinutes > 1440) {
      setError(
        'The total workout duration is over 24 hours. Enter the actual total duration below before saving.',
      );
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    let completedIdentity = finalizeWorkoutIdentity(
      movements.map((movement) => movement.exercise),
      category,
      name,
      !initialWorkout && !resumedWorkoutId && !workoutTypeExplicit && !customTypeId,
      customTypeId ? selectedType : null,
    );
    if (
      !customTypeId &&
      workoutTypes.types.find((type) => type.id === completedIdentity.category)?.archived
    ) {
      completedIdentity = finalizeWorkoutIdentity(
        movements.map((movement) => movement.exercise),
        category,
        name,
        false,
      );
    }
    try {
      cancelRestTimer();
      await onSave({
        name: completedIdentity.name,
        workout_date: workoutDate,
        category: completedIdentity.category,
        workout_type_id: customTypeId,
        notes: notes.trim() || null,
        duration_minutes: durationMinutes,
        start_time: initialWorkout && startTime && endTime ? startTime : null,
        end_time: initialWorkout && startTime && endTime ? endTime : null,
        movements: movementsToSave.map((movement) => ({
          exercise_id: movement.exercise.id,
          notes: movement.notes.trim() || null,
          machine_photo_ids: movement.machinePhotoIds,
          sets: movement.sets.map((item) => ({
            reps: item.reps,
            weight_kg: item.weight_kg,
            rpe: item.rpe,
            rest_seconds: item.rest_seconds,
            duration_seconds: item.duration_seconds,
            distance_km: item.distance_km,
            calories_kcal: item.calories_kcal,
            average_heart_rate_bpm: item.average_heart_rate_bpm,
            incline_percent: item.incline_percent ?? null,
            speed_kph: item.speed_kph ?? null,
            bodyweight_kg: item.bodyweight_kg,
            percentile: item.percentile,
            warmup: item.warmup,
            set_type: item.set_type,
            failed: item.failed,
            target_reps: item.target_reps,
            notes: item.notes,
            completed: item.completed,
          })),
          superset_key: movement.supersetKey,
        })),
      });
      if (automaticEndAt !== undefined) {
        onAutoSaved();
        void showWorkoutAutoSavedNotification().catch(() => undefined);
      }
    } catch (saveError) {
      savingRef.current = false;
      setError(saveError instanceof Error ? saveError.message : 'Could not save the workout.');
      setSaving(false);
    }
  }

  finishWorkoutRef.current = finishWorkout;

  useEffect(() => {
    if (initialWorkout) return;
    const hasSavableSet = movements.some((movement) =>
      movement.sets.some((item) => isWorkoutSetAutoSavable(movement.exercise.kind, item)),
    );
    const checkForInactiveWorkout = () => {
      if (!hasSavableSet || savingRef.current) return;
      const now = Date.now();
      if (now < inactiveFinishAtRef.current) return;
      void finishWorkoutRef.current(inactiveFinishAtRef.current);
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

  // Explicit choices retain their identity in both the live heading and the saved workout.
  let liveIdentity = finalizeWorkoutIdentity(
    movements.map((movement) => movement.exercise),
    category,
    name,
    !initialWorkout && !resumedWorkoutId && !workoutTypeExplicit && !customTypeId,
    customTypeId ? selectedType : null,
  );
  if (
    !customTypeId &&
    workoutTypes.types.find((type) => type.id === liveIdentity.category)?.archived
  ) {
    liveIdentity = finalizeWorkoutIdentity(
      movements.map((movement) => movement.exercise),
      category,
      name,
      false,
    );
  }

  const restActive = restTimerEnabled && restLeft > 0;

  return (
    <section
      className={`logger-screen content-page ${restActive && restPopupOpen ? 'has-rest-popup' : ''}`}
      inert={saving}
    >
      {prToastEntries.length > 0 && (
        <PrToast key={`pr-toast-${prToastId}`} entries={prToastEntries} onClose={closePrToast} />
      )}
      {prConfettiBurst > 0 &&
        (motionReduced() ? null : (
          <ConfettiBurst key={prConfettiBurst} onComplete={() => setPrConfettiBurst(0)} />
        ))}
      <OverlayScreenHeader
        title={liveIdentity.name}
        subtitle={
          <WorkoutHeaderMeta
            durationLabel={
              initialWorkout
                ? `${readOnly ? 'View only \u00b7 ' : ''}${formatDuration(displayedDurationSeconds)}`
                : `Live ${formatDuration(elapsed)}`
            }
            restSeconds={restActive && !restPopupOpen ? restLeft : null}
            onSkipRest={skipRestTimer}
            onShowRest={() => setRestPopupOpen(true)}
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
                className="overlay-header-action add"
                type="button"
                onClick={openExercisePicker}
                aria-label="Add exercise"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </>
          )
        }
      />
      {recommendation &&
        !workoutTypes.types.find((type) => type.id === recommendation.category)?.archived &&
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
              <span style={{ background: categoryColors[recommendation.category] }} />
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
                setCustomTypeId(null);
                setWorkoutTypeExplicit(true);
                setName(recommendation.session_name);
              }}
            >
              Use {recommendation.session_name}
            </button>
          </section>
        )}

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
                        updateDurationOverride(String(overrideDurationHours), event.target.value);
                        return;
                      }
                      const minutes = Number.isNaN(event.target.valueAsNumber)
                        ? 0
                        : event.target.valueAsNumber;
                      setEditedDurationMinutes(
                        Math.min(
                          1440,
                          editedDurationHours * 60 + Math.min(59, Math.max(0, Math.floor(minutes))),
                        ),
                      );
                    }}
                    aria-label="Workout duration minutes"
                  />
                </label>
                <small className="workout-timing-help">
                  {initialWorkout
                    ? hasCompleteTimeRange
                      ? `${formatWorkoutTimeRange(startTime, endTime)} · duration calculated automatically`
                      : 'Add both times to calculate duration automatically, including workouts ending after midnight.'
                    : resumedWorkoutId
                      ? `${previousDurationMinutes} min already logged. The live timer started when you resumed; the gap is excluded. Change these fields only to correct the total duration.`
                      : 'Leave both blank to use the live timer. Change them only if the timer is wrong.'}
                </small>
              </fieldset>
            )}
          </div>
          <div className="workout-summary-metrics" aria-label="Workout totals">
            <span>
              <small>Time</small>
              <strong>{formatDuration(displayedDurationSeconds)}</strong>
            </span>
            {currentBodyweight !== null && (
              <span>
                <small>BW {weightUnit}</small>
                <strong>{formatWeightNumber(currentBodyweight, weightUnit)}</strong>
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

      {error && <p className="inline-error">{error}</p>}

      {readOnly && initialWorkout ? (
        <BrowsedWorkoutDetails
          workout={initialWorkout}
          categoryColor={categoryColors[initialWorkout.category]}
        />
      ) : (
        <div className="movement-stack" ref={movementStackRef}>
          {movements.map((movement, movementIndex) => (
            <MovementCard
              key={movement.key}
              movement={movement}
              showRestTimes={showRestTimes}
              number={movementIndex + 1}
              prBadges={prBadges.get(movement.key) ?? new Map()}
              supersetLabel={
                movement.supersetKey
                  ? `Superset ${movements
                      .filter((item) => item.supersetKey === movement.supersetKey)
                      .map((item) => item.exercise.name)
                      .join(' + ')}`
                  : null
              }
              history={recentExerciseHistory(
                historicalWorkouts,
                movement.exercise.id,
                initialWorkout?.id,
                undefined,
                olderHistory?.get(movement.exercise.id)?.latest ?? null,
              )}
              onExerciseHistory={() => onExerciseHistory(movement.exercise.id)}
              onExerciseComplete={(isComplete) =>
                setMovements((current) =>
                  current.map((item) =>
                    item.key === movement.key
                      ? {
                          ...item,
                          isComplete,
                          sets: isComplete
                            ? completeRemainingSets(item.exercise.kind, item.sets)
                            : item.sets,
                        }
                      : item,
                  ),
                )
              }
              onUpdateSet={(setKey, update) => updateSet(movement.key, setKey, update)}
              onToggleSet={(item) => toggleSet(movement, item)}
              onAddSet={() => addSet(movement)}
              onSwitch={() => {
                setSwitchingMovementKey(movement.key);
                setPickerOpen(true);
              }}
              onRemove={() => removeMovement(movement.key)}
              onMoveUp={() => moveMovement(movementIndex, -1)}
              onMoveDown={() => moveMovement(movementIndex, 1)}
              canMoveUp={movementIndex > 0}
              canMoveDown={movementIndex < movements.length - 1}
              onMoveSet={(fromIndex, toIndex) => moveSet(movement.key, fromIndex, toIndex)}
              onDeleteSet={(index) => deleteSet(movement, index)}
              onRemoveRestTime={(item) => removeRestTime(movement, item)}
              onSuperset={(button) => openSupersetPicker(movement.key, button)}
              onMachinePhotos={(machinePhotoIds) =>
                setMovements((current) =>
                  current.map((item) =>
                    item.key === movement.key
                      ? { ...item, machinePhotoIds, machinePhotosInitialized: true }
                      : item,
                  ),
                )
              }
              onMovementNotes={(value) =>
                setMovements((current) =>
                  current.map((item) =>
                    item.key === movement.key ? { ...item, notes: value } : item,
                  ),
                )
              }
            />
          ))}
        </div>
      )}

      {(undoDeletion || (restActive && restPopupOpen)) && (
        // Popups that stay up while you train sit at the bottom, clear of the workout header.
        <div className="logger-bottom-toasts">
          {undoDeletion && (
            <div
              className="undo-toast"
              role="status"
              style={{ '--undo-toast-duration': `${UNDO_TOAST_MS}ms` } as CSSProperties}
            >
              <span>{undoDeletion.kind === 'rest' ? 'Rest time removed' : 'Set deleted'}</span>
              <button className="undo-toast-action" type="button" onClick={undoLastDeletion}>
                Undo
              </button>
              <button
                className="undo-toast-close"
                type="button"
                onClick={() => setUndoDeletion(null)}
                aria-label="Dismiss deletion notification"
              >
                <Icon name="close" />
              </button>
            </div>
          )}
          {restActive && restPopupOpen && (
            <RestTimerToast
              seconds={restLeft}
              totalSeconds={restTotal}
              onDismiss={() => setRestPopupOpen(false)}
              onCancel={skipRestTimer}
              onAdjust={adjustRestTimer}
            />
          )}
        </div>
      )}
      {!readOnly && (
        <>
          <button className="add-exercise-button" type="button" onClick={openExercisePicker}>
            ＋ Add exercise
          </button>
          <button
            className="primary-action finish-workout-bottom"
            disabled={saving}
            onClick={() => {
              if (initialWorkout) void finishWorkout();
              else setFinishConfirmationOpen(true);
            }}
          >
            {saving ? 'Saving…' : initialWorkout ? 'Save workout' : 'Finish workout'}
          </button>
        </>
      )}

      {deleteConfirmationOpen && (
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

      {finishConfirmationOpen && (
        <PopupDialog
          title="Finish workout?"
          kicker="PLEASE CONFIRM"
          className="workout-finish-dialog"
          onClose={() => setFinishConfirmationOpen(false)}
        >
          <p>This saves your workout and stops the live timer. You can resume it from History.</p>
          <div className="popup-dialog-actions workout-finish-actions">
            <button type="button" autoFocus onClick={() => setFinishConfirmationOpen(false)}>
              Keep working out
            </button>
            <button
              type="button"
              className="popup-primary-action"
              disabled={saving}
              onClick={() => {
                setFinishConfirmationOpen(false);
                void finishWorkout();
              }}
            >
              Finish workout
            </button>
          </div>
        </PopupDialog>
      )}

      {nameEditorOpen && (
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

      {pickerOpen && (
        <ExercisePicker
          key={switchingMovementKey ? `switch-${switchingMovementKey}` : 'add-exercises'}
          exercises={exercises}
          excludedIds={movements.map((item) => item.exercise.id)}
          recentExerciseIds={recentExerciseIds}
          onFavoriteChange={onExerciseFavorite}
          onCreateExercise={onCreateExercise}
          singleSelect={switchingMovementKey !== null}
          onChoose={switchingMovementKey ? switchExercise : addExercises}
          onCreateSuperset={(selected) => addExercises(selected, true)}
          onClose={closeExercisePicker}
        />
      )}

      {supersetPickerKey && (
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

function WorkoutNameDialog({
  value,
  fallbackName,
  onChange,
  onCancel,
  onSave,
}: {
  value: string;
  fallbackName: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const backdropDismiss = useBackdropDismiss(onCancel);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="notification-dialog workout-name-dialog"
      aria-modal="true"
      aria-labelledby="workout-name-dialog-title"
      aria-describedby="workout-name-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      {...backdropDismiss}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <header>
          <div>
            <p className="section-kicker">WORKOUT</p>
            <h2 id="workout-name-dialog-title">Name this workout</h2>
          </div>
          <button
            type="button"
            className="notification-close"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <p id="workout-name-dialog-description">
          Give this session a name, or leave it blank to use “{fallbackName}”.
        </p>
        <label>
          Workout name
          <input
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={fallbackName}
            maxLength={120}
          />
        </label>
        <footer>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="notification-ok">
            Save name
          </button>
        </footer>
      </form>
    </dialog>,
    document.body,
  );
}

function SupersetPicker({
  movementKey,
  movements,
  onClose,
  onSave,
  onRemove,
}: {
  movementKey: string;
  movements: DraftMovement[];
  onClose: () => void;
  onSave: (partnerKeys: string[]) => void;
  onRemove: () => void;
}) {
  const movement = movements.find((item) => item.key === movementKey);
  const candidates = movements.filter((item) => item.key !== movementKey);
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() =>
    movement?.supersetKey
      ? candidates
          .filter((item) => item.supersetKey === movement.supersetKey)
          .map((item) => item.key)
      : [],
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const backdropDismiss = useBackdropDismiss(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const root = document.getElementById('root');
    const rootWasInert = root?.hasAttribute('inert') ?? false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root?.setAttribute('inert', '');
    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (!rootWasInert) root?.removeAttribute('inert');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  if (!movement) return null;

  const selected = new Set(selectedKeys);
  const toggleSelection = (key: string) => {
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  return createPortal(
    <div className="modal-backdrop superset-picker-backdrop" {...backdropDismiss}>
      <section
        className="superset-picker panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="superset-picker-title"
        aria-describedby="superset-picker-description"
      >
        <header>
          <h2 id="superset-picker-title">Add Group</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close superset picker"
          >
            ×
          </button>
        </header>
        <p id="superset-picker-description">Alternate exercises in a superset/circuit.</p>

        <div className="superset-options" aria-label="Exercises in this workout">
          {candidates.length === 0 ? (
            <div className="superset-empty">
              <strong>No other exercises yet</strong>
              <span>Add another exercise to this workout, then come back to group it.</span>
            </div>
          ) : (
            candidates.map((candidate) => {
              const belongsToAnotherGroup = Boolean(
                candidate.supersetKey && candidate.supersetKey !== movement.supersetKey,
              );
              const isSelected = selected.has(candidate.key);
              return (
                <label
                  className={`superset-option ${isSelected ? 'selected' : ''} ${
                    belongsToAnotherGroup ? 'unavailable' : ''
                  }`}
                  key={candidate.key}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    disabled={belongsToAnotherGroup}
                    onChange={() => toggleSelection(candidate.key)}
                  />
                  <span className="superset-option-copy">
                    <strong>{candidate.exercise.name}</strong>
                  </span>
                  {belongsToAnotherGroup && (
                    <small className="superset-option-status">Already grouped</small>
                  )}
                </label>
              );
            })
          )}
        </div>

        <footer>
          {movement.supersetKey && (
            <button className="remove-superset-button" type="button" onClick={onRemove}>
              Remove group
            </button>
          )}
          <div className="superset-picker-actions">
            <button
              className="save-superset-button"
              type="button"
              disabled={selectedKeys.length === 0}
              onClick={() => onSave(selectedKeys)}
            >
              {movement.supersetKey ? 'Update Group' : 'Add Group'}
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
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
  const safeButtonRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const backdropDismiss = useBackdropDismiss(onCancel);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const root = document.getElementById('root');
    const rootWasInert = root?.hasAttribute('inert') ?? false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root?.setAttribute('inert', '');
    safeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancelRef.current();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (!rootWasInert) root?.removeAttribute('inert');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop workout-close-backdrop" {...backdropDismiss}>
      <section
        className="workout-close-dialog panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workout-close-title"
        aria-describedby="workout-close-description"
      >
        <div className="workout-close-warning" aria-hidden="true">
          !
        </div>
        <p className="section-kicker">PLEASE CONFIRM</p>
        <h2 id="workout-close-title">
          {editing
            ? 'Delete this saved workout?'
            : resuming
              ? 'Discard this resumed session?'
              : 'Delete this workout?'}
        </h2>
        <p id="workout-close-description">
          {editing
            ? 'This workout will be permanently removed from your history. This cannot be undone.'
            : resuming
              ? 'Changes made since resuming will be lost. The saved workout will stay in History.'
              : 'Your active workout, sets, and notes will be permanently removed. This cannot be undone.'}
        </p>
        <div className="workout-close-actions">
          <button ref={safeButtonRef} type="button" onClick={onCancel}>
            Keep workout
          </button>
          <button className="discard-workout-button" type="button" onClick={onConfirm}>
            {resuming ? 'Discard session' : 'Delete workout'}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

function ExerciseIcon({ exercise, number }: { exercise: Exercise; number?: number }) {
  return (
    <span className="exercise-icon" aria-hidden="true">
      <img src={exerciseIconFor(exercise)} alt="" />
      {number !== undefined && <b>{number}</b>}
    </span>
  );
}

function MovementCard({
  movement,
  showRestTimes,
  number,
  history,
  onExerciseHistory,
  onExerciseComplete,
  onUpdateSet,
  onToggleSet,
  onAddSet,
  onSwitch,
  onRemove,
  onMachinePhotos,
  onMovementNotes,
  prBadges,
  supersetLabel,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  onMoveSet,
  onDeleteSet,
  onRemoveRestTime,
  onSuperset,
}: {
  movement: DraftMovement;
  showRestTimes: boolean;
  number: number;
  history: ExerciseHistoryEntry[];
  onExerciseHistory: () => void;
  onExerciseComplete: (isComplete: boolean) => void;
  onUpdateSet: (setKey: string, update: Partial<DraftSet>) => void;
  onToggleSet: (item: DraftSet) => void;
  onAddSet: () => void;
  onSwitch: () => void;
  onRemove: () => void;
  onMachinePhotos: (photoIds: string[]) => void;
  onMovementNotes: (value: string) => void;
  prBadges: Map<string, string[]>;
  supersetLabel: string | null;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveSet: (fromIndex: number, toIndex: number) => void;
  onDeleteSet: (index: number) => void;
  onRemoveRestTime: (item: DraftSet) => void;
  onSuperset: (button: HTMLButtonElement) => void;
}) {
  const cardio = movement.exercise.kind === 'cardio';
  const treadmill =
    cardio && (movement.exercise.equipment?.toLowerCase().includes('treadmill') ?? false);
  const weightUnit = useWeightUnit();
  const completedWorkingSetCount = movement.sets.filter(isCompletedWorkingSet).length;
  const lastSessionSummary =
    !cardio && history[0] ? compactSetSummary(history[0].sets, weightUnit) : '';
  const [expanded, setExpanded] = useState(!movement.isComplete);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openSetActionsKey, setOpenSetActionsKey] = useState<string | null>(null);
  const [openOverrides, setOpenOverrides] = useState<Readonly<Record<string, boolean>>>({});
  const [restEdits, setRestEdits] = useState<Readonly<Record<string, number>>>({});
  const [typeMenuSetKey, setTypeMenuSetKey] = useState<string | null>(null);
  const [draggingSetKey, setDraggingSetKey] = useState<string | null>(null);
  const [dragTargetSetKey, setDragTargetSetKey] = useState<string | null>(null);
  const [pendingSetCompletion, setPendingSetCompletion] = useState<{
    item: DraftSet;
    warning: SetEntryWarning;
  } | null>(null);
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

  useEffect(() => {
    if (!movement.isComplete) setExpanded(true);
  }, [movement.isComplete]);

  useEffect(() => {
    if (!openSetActionsKey && !typeMenuSetKey) return;

    const closeMenus = () => {
      setOpenSetActionsKey(null);
      setTypeMenuSetKey(null);
    };
    const closeOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('.set-actions-menu, .set-type-picker')
      ) {
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
  }, [openSetActionsKey, typeMenuSetKey]);

  function closeMovementMenu() {
    if (movementMenuRef.current) movementMenuRef.current.open = false;
  }

  function clearSetDrag() {
    draggingSetKeyRef.current = null;
    dragTargetSetKeyRef.current = null;
    setDraggingSetKey(null);
    setDragTargetSetKey(null);
  }

  /** New and unticked sets are edited in place; logged and suggested sets open on tap. */
  function isSetOpen(item: DraftSet) {
    return openOverrides[item.key] ?? (!item.completed && !item.fromPrevious);
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
      { reps: item.reps, weightKg: item.weight_kg, referenceWeightKg },
      weightUnit,
    );
    if (warning) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      setPendingSetCompletion({ item, warning });
      return;
    }
    completeSet(item);
  }

  function beginSetDrag(event: ReactPointerEvent<HTMLButtonElement>, setKey: string) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingSetKeyRef.current = setKey;
    dragTargetSetKeyRef.current = setKey;
    setDraggingSetKey(setKey);
    setDragTargetSetKey(setKey);
    setOpenSetActionsKey(null);
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

  function cancelSetDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    event.stopPropagation();
    clearSetDrag();
  }

  function renderSetDragHandle(item: DraftSet, index: number) {
    return (
      <SetDragHandle
        setNumber={index + 1}
        disabled={movement.sets.length < 2}
        onPointerDown={(event) => beginSetDrag(event, item.key)}
        onPointerMove={moveSetDrag}
        onPointerUp={finishSetDrag}
        onPointerCancel={cancelSetDrag}
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
        className={`set-actions-menu completed-summary-actions ${openSetActionsKey === item.key ? 'is-open' : ''}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {renderSetDragHandle(item, index)}
        <button
          type="button"
          className="completed-set-menu"
          aria-label={`Options for set ${index + 1}`}
          aria-expanded={openSetActionsKey === item.key}
          onClick={() => {
            setTypeMenuSetKey(null);
            setOpenSetActionsKey((current) => (current === item.key ? null : item.key));
          }}
        >
          ⋮
        </button>
        {openSetActionsKey === item.key && (
          <span className="set-actions-menu-popover">
            {!isSetOpen(item) && (
              <button
                type="button"
                onClick={() => {
                  setOpenSetActionsKey(null);
                  openSet(item.key);
                }}
              >
                <span aria-hidden="true">✎</span>
                Edit set
              </button>
            )}
            <button
              type="button"
              disabled={index === 0}
              onClick={() => {
                onMoveSet(index, index - 1);
                setOpenSetActionsKey(null);
              }}
            >
              <span aria-hidden="true">↑</span>
              Move earlier
            </button>
            <button
              type="button"
              disabled={index === movement.sets.length - 1}
              onClick={() => {
                onMoveSet(index, index + 1);
                setOpenSetActionsKey(null);
              }}
            >
              <span aria-hidden="true">↓</span>
              Move later
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                onDeleteSet(index);
                setOpenSetActionsKey(null);
              }}
            >
              <span aria-hidden="true">■</span>
              Delete set
            </button>
          </span>
        )}
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
          onClick={() => {
            setOpenSetActionsKey(null);
            setTypeMenuSetKey(menuOpen ? null : item.key);
          }}
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
    const valueButton = (field: SetField, label: string, className: string, value: ReactNode) => (
      <button
        type="button"
        className={`completed-set-value ${className}`}
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
                  {item.weight_kg === null ? '–' : formatWeight(item.weight_kg, weightUnit)}
                  {prBadges.has(item.key) && (
                    <b className="pr-badge" title={prBadges.get(item.key)?.join(', ')}>
                      PR
                    </b>
                  )}
                </>,
              )}
              {valueButton('reps', 'Edit repetitions', 'completed-set-reps', item.reps ?? '–')}
            </>
          )}
          {valueButton('rpe', 'Edit RPE', 'completed-set-rpe', item.rpe ?? '–')}
          {renderRowCompleteButton(item, index)}
          {renderCompletedSetActions(item, index)}
        </div>
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
                if (item.reps !== null) event.currentTarget.select();
              }}
              onClick={(event) => {
                if (item.reps !== null) event.currentTarget.select();
              }}
              onChange={(event) =>
                onUpdateSet(item.key, { reps: numberOrNull(event.target.value) })
              }
              aria-label={`Repetitions${suggested}`}
            />
          </>
        )}
        <select
          data-set-field="rpe"
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
          <input
            data-set-field="notes"
            className="set-editor-note"
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
      {supersetLabel && <div className="superset-ribbon">{supersetLabel}</div>}
      <header onClick={() => setExpanded((current) => !current)}>
        <ExerciseIcon exercise={movement.exercise} number={number} />
        <div>
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
            <ExerciseMuscleHelp exercise={movement.exercise} />
            <button
              type="button"
              className="movement-expand-toggle"
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${movement.exercise.name}`}
              aria-expanded={expanded}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((current) => !current);
              }}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m4 7 6 6 6-6" />
              </svg>
            </button>
          </h2>
          {movement.exercise.is_custom && <small className="custom-exercise-label">Custom</small>}
          <p>
            {[movement.exercise.muscle_group, movement.exercise.equipment]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {lastSessionSummary && (
            <p className="movement-last-session">
              Last {shortDate(history[0].workoutDate)} · {lastSessionSummary} ({weightUnit})
            </p>
          )}
          {!expanded && (
            <span className="movement-completed-summary">
              {completedWorkingSetCount} completed {completedWorkingSetCount === 1 ? 'set' : 'sets'}
            </span>
          )}
        </div>
        <div className="movement-header-actions" onClick={(event) => event.stopPropagation()}>
          {barType && (
            <button
              type="button"
              className="plate-calculator-button"
              aria-label={`Plate calculator for ${movement.exercise.name}`}
              disabled={movement.sets.length === 0}
              onClick={() => {
                closeMovementMenu();
                // The next set to lift, or the last one once every set is ticked.
                const next = movement.sets.find((item) => !item.completed) ?? movement.sets.at(-1);
                if (next) setPlateSetKey(next.key);
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
              setExpanded(!next);
              closeMovementMenu();
            }}
          >
            ✓
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
                {historyOpen ? 'Hide Recent History' : 'Recent History'}
              </button>
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
                {supersetLabel ? 'Edit Group' : 'Group Superset'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSwitch();
                  closeMovementMenu();
                }}
              >
                <span aria-hidden="true">⇄</span>
                Switch Exercise
              </button>
              <button
                type="button"
                disabled={!canMoveUp}
                onClick={() => {
                  onMoveUp();
                  closeMovementMenu();
                }}
              >
                <span aria-hidden="true">↑</span>
                Move Earlier
              </button>
              <button
                type="button"
                disabled={!canMoveDown}
                onClick={() => {
                  onMoveDown();
                  closeMovementMenu();
                }}
              >
                <span aria-hidden="true">↓</span>
                Move Later
              </button>
              <button
                type="button"
                className="movement-menu-danger"
                onClick={() => {
                  onRemove();
                  closeMovementMenu();
                }}
              >
                <span aria-hidden="true">■</span>
                Delete
              </button>
            </div>
          </details>
        </div>
      </header>

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
        <MachinePhotoChooser
          exercise={movement.exercise}
          selectedIds={movement.machinePhotoIds}
          autoPinLastUsed={!movement.machinePhotosInitialized}
          onChange={onMachinePhotos}
        />
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
        {movement.sets.map((item, index) => {
          const open = isSetOpen(item);
          return (
            <Fragment key={item.key}>
              <SwipeToDeleteSetRow
                flipKey={item.key}
                label={`set ${index + 1}`}
                disabled={movement.sets.length < 2}
                overlayOpen={openSetActionsKey === item.key || typeMenuSetKey === item.key}
                onDelete={() => onDeleteSet(index)}
              >
                <div
                  className={`set-details ${item.completed ? 'completed' : ''} ${item.fromPrevious ? 'previous-set-details' : ''} ${open ? 'is-open' : ''} ${draggingSetKey === item.key ? 'set-dragging' : ''} ${dragTargetSetKey === item.key && draggingSetKey !== item.key ? 'set-drop-target' : ''}`}
                  data-set-key={item.key}
                  data-expand-key={item.key}
                  data-expanded={open}
                >
                  {open ? renderSetEditor(item, index) : renderSetSummary(item, index)}
                </div>
              </SwipeToDeleteSetRow>
              {!cardio && showRestTimes && (item.rest_seconds ?? 0) > 0 && (
                <SwipeToDeleteSetRow
                  flipKey={`${item.key}:rest`}
                  label={`rest after set ${index + 1}`}
                  onDelete={() => removeRest(item)}
                >
                  <div className="rest-between">
                    <i />
                    <label>
                      <RestTimeSelect
                        seconds={item.rest_seconds!}
                        label={`Rest after set ${index + 1}`}
                        onChange={(seconds) => {
                          clearRestEdit(item.key);
                          if (seconds === 0) removeRest(item);
                          else onUpdateSet(item.key, { rest_seconds: seconds });
                        }}
                      />
                      <span>rest</span>
                    </label>
                    <i />
                  </div>
                </SwipeToDeleteSetRow>
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
          onConfirm={() => {
            completeSet(pendingSetCompletion.item);
            setPendingSetCompletion(null);
          }}
        />
      )}
      <button type="button" className="add-set-button" onClick={onAddSet}>
        ＋ Add set
      </button>
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
      <input
        className="movement-note"
        value={movement.notes}
        onChange={(event) => onMovementNotes(event.target.value)}
        placeholder="Exercise note for next time…"
      />
    </article>
  );
}

function SetEntryConfirmationDialog({
  warning,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  warning: SetEntryWarning;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const onCancelRef = useRef(onCancel);
  const backdropDismiss = useBackdropDismiss(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    window.requestAnimationFrame(() => confirmButtonRef.current?.focus());
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancelRef.current();
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
  }, []);

  return createPortal(
    <div className="modal-backdrop set-entry-confirmation-backdrop" {...backdropDismiss}>
      <section
        className="set-entry-confirmation panel"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="set-entry-confirmation-title"
        aria-describedby="set-entry-confirmation-message"
      >
        <h3 id="set-entry-confirmation-title">{warning.title}</h3>
        <p id="set-entry-confirmation-message">{warning.message}</p>
        <footer>
          <button type="button" onClick={onCancel}>
            Go back
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            className="confirm-unusual-set"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function ScanningLabel() {
  return (
    <span className="scanning-label">
      <span className="scanning-spinner" aria-hidden="true" />
      Scanning
    </span>
  );
}

function CardioSetScreenshotUpload({ onScan }: { onScan: (scan: CardioScreenshotScan) => void }) {
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<{ message: string; warning: boolean } | null>(null);

  async function importScreenshot(file: File) {
    if (scanning) return;
    setScanning(true);
    setStatus(null);
    try {
      const scan = await api.scanCardioScreenshot(file);
      onScan(scan);
      setStatus({
        message: `Scanned ${scan.fields_found.join(', ')}.${scan.warning ? ` ${scan.warning}` : ''} Review the set before saving.`,
        warning: Boolean(scan.warning),
      });
    } catch (reason) {
      setStatus({
        message: reason instanceof Error ? reason.message : 'Could not scan that screenshot.',
        warning: true,
      });
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="cardio-set-screenshot-upload">
      <label className={scanning ? 'disabled' : ''}>
        {scanning ? <ScanningLabel /> : 'Upload screenshot'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          disabled={scanning}
          aria-label="Upload cardio set screenshot"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importScreenshot(file);
          }}
        />
      </label>
      {status && (
        <small className={status.warning ? 'warning' : ''} role="status">
          {status.message}
        </small>
      )}
    </div>
  );
}

function MachinePhotoChooser({
  exercise,
  selectedIds,
  autoPinLastUsed,
  onChange,
}: {
  exercise: Exercise;
  selectedIds: string[];
  autoPinLastUsed: boolean;
  onChange: (photoIds: string[]) => void;
}) {
  const [photos, setPhotos] = useState<MachinePhotoUsage[]>([]);
  const [pending, setPending] = useState<{ file: File; previewUrl: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [expanded, setExpanded] = useState<MachinePhoto | null>(null);
  const [photoPanelOpen, setPhotoPanelOpen] = useState(false);
  const [choosingReplacement, setChoosingReplacement] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoRailRef = useRef<HTMLDivElement>(null);
  const autoPinLastUsedRef = useRef(autoPinLastUsed);
  const onChangeRef = useRef(onChange);
  const selectedIdsRef = useRef(selectedIds);

  useEffect(() => {
    onChangeRef.current = onChange;
    selectedIdsRef.current = selectedIds;
  }, [onChange, selectedIds]);

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

  useEffect(
    () => () => {
      if (pending) URL.revokeObjectURL(pending.previewUrl);
    },
    [pending],
  );

  function stagePhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setCaption('');
    setPending({ file, previewUrl: URL.createObjectURL(file) });
  }

  async function uploadPhoto() {
    if (!pending || !caption.trim()) {
      setError('Enter the machine name before saving the photo.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const upload = await optimisePhoto(pending.file);
      const photo = await api.uploadMachinePhoto(exercise.id, upload, caption.trim());
      setPhotos((current) => [
        { ...photo, exercise_name: exercise.name, workout_count: 0, last_used_date: null },
        ...current,
      ]);
      onChange(choosingReplacement ? [photo.id] : [...new Set([...selectedIds, photo.id])]);
      setChoosingReplacement(false);
      setPending(null);
      setCaption('');
      setPhotoPanelOpen(false);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not save that photo.');
    } finally {
      setUploading(false);
    }
  }

  function togglePhoto(photoId: string) {
    if (choosingReplacement) {
      onChange([photoId]);
      setChoosingReplacement(false);
      return;
    }
    onChange(
      selectedIds.includes(photoId)
        ? selectedIds.filter((current) => current !== photoId)
        : [...selectedIds, photoId],
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
    onChange(selectedIds.filter((id) => id !== photo.id));
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
  const pinnedPhotos = photos.filter((photo) => selectedIds.includes(photo.id));
  const primaryPinnedPhoto = pinnedPhotos[0] ?? null;
  const photoSummary = primaryPinnedPhoto
    ? `${primaryPinnedPhoto.caption}${pinnedPhotos.length > 1 ? ` +${pinnedPhotos.length - 1} more` : ''}`
    : photos.length > 0
      ? `${photos.length} saved · none pinned`
      : 'Take or choose a photo';

  return (
    <details
      className="machine-photo-picker"
      aria-label={`Machine photos for ${exercise.name}`}
      open={photoPanelOpen}
      onToggle={(event) => setPhotoPanelOpen(event.currentTarget.open)}
    >
      <summary className="machine-photo-summary">
        {primaryPinnedPhoto ? (
          <img src={primaryPinnedPhoto.thumbnail_url} alt="" loading="lazy" />
        ) : (
          <span className="machine-photo-placeholder" aria-hidden="true">
            <Icon name="camera" />
          </span>
        )}
        <span className="machine-photo-summary-copy">
          <strong>Equipment photo</strong>
          <small>{photoSummary}</small>
        </span>
        {selectedIds.length > 0 && <b>{selectedIds.length} pinned</b>}
        <span className="machine-photo-chevron" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="machine-photo-content">
        <p>Take, choose, or pin equipment photos for every set in this exercise.</p>
        <div className="machine-photo-actions">
          <label>
            <span aria-hidden="true">
              <Icon name="camera" />
            </span>
            Take photo
            <input
              className="sr-only"
              type="file"
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
        {error && <p className="machine-photo-error">{error}</p>}

        {pending && (
          <section className="photo-inline-editor panel">
            <button type="button" className="photo-inline-close" onClick={() => setPending(null)}>
              Cancel
            </button>
            <img src={pending.previewUrl} alt="New machine preview" />
            <div>
              <p className="section-kicker">NEW MACHINE PHOTO</p>
              <h2>Name this machine</h2>
              <p>For example: Hammer Strength lying leg curl.</p>
              <input
                autoFocus
                value={caption}
                maxLength={160}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Machine name"
              />
              <div className="photo-inline-actions">
                <button type="button" onClick={() => setPending(null)} disabled={uploading}>
                  Cancel
                </button>
                <button type="button" onClick={() => void uploadPhoto()} disabled={uploading}>
                  {uploading ? 'Saving…' : 'Save and pin'}
                </button>
              </div>
            </div>
          </section>
        )}
        {expanded && (
          <MachinePhotoDetail
            photo={expanded}
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
}: {
  photo: MachinePhoto;
  onClose: () => void;
  onUpdate?: (photo: MachinePhoto, caption: string) => Promise<void>;
  onDelete?: (photo: MachinePhoto) => Promise<void>;
  onChooseAnother?: () => void;
  /** Filters History to the workouts that pinned this machine. */
  onShowHistory?: () => void;
}) {
  const [caption, setCaption] = useState(photo.caption);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveCaption() {
    if (!onUpdate || !caption.trim() || caption.trim() === photo.caption) return;
    setSaving(true);
    setError(null);
    try {
      await onUpdate(photo, caption.trim());
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
        <button className="photo-detail-close" type="button" onClick={onClose}>
          Close
        </button>
        <img src={photo.full_url} alt={photo.caption} />
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
            <button type="button" onClick={() => void saveCaption()} disabled={saving}>
              Save name
            </button>
          )}
          {onChooseAnother && (
            <button type="button" className="photo-choose-other" onClick={onChooseAnother}>
              Switch photo
            </button>
          )}
          {onShowHistory && (
            <button type="button" className="photo-machine-history" onClick={onShowHistory}>
              <Icon name="filter" />
              All workouts on this machine
            </button>
          )}
          {onDelete && (
            <InlineConfirmButton
              className="photo-delete"
              label="Delete"
              confirmLabel="Delete photo"
              confirmationMessage="Also removes this photo from saved workouts."
              onConfirm={removePhoto}
              disabled={saving}
            />
          )}
          {error && <p role="alert">{error}</p>}
        </div>
      </div>
    </section>
  );
}

type ExercisePickerFilter = WorkoutCategory | 'all' | 'favorites' | 'recent';

function FuzzyHighlightedText({ value, query }: { value: string; query: string }) {
  const highlighted = new Set(fuzzyHighlightIndices(value, query));
  if (!highlighted.size) return value;

  return (
    <>
      {[...value].map((character, index) =>
        highlighted.has(index) ? (
          <b className="exercise-search-match" key={`${character}-${index}`}>
            {character}
          </b>
        ) : (
          <Fragment key={`${character}-${index}`}>{character}</Fragment>
        ),
      )}
    </>
  );
}

function ExercisePicker({
  exercises,
  excludedIds,
  recentExerciseIds,
  onFavoriteChange,
  onCreateExercise,
  singleSelect = false,
  onChoose,
  onCreateSuperset,
  onClose,
}: {
  exercises: Exercise[];
  excludedIds: string[];
  recentExerciseIds: string[];
  onFavoriteChange: (exerciseId: string, isFavorite: boolean) => Promise<void>;
  onCreateExercise: (input: ExerciseCreateInput) => Promise<Exercise>;
  singleSelect?: boolean;
  onChoose: (exercises: Exercise[]) => void;
  onCreateSuperset?: (exercises: Exercise[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ExercisePickerFilter>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [favoriteSavingIds, setFavoriteSavingIds] = useState<string[]>([]);
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [viewport, setViewport] = useState(() => {
    const visualViewport = window.visualViewport;
    return {
      height: visualViewport?.height ?? window.innerHeight,
      top: visualViewport?.offsetTop ?? 0,
      keyboardVisible: false,
    };
  });
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const backdropDismiss = useBackdropDismiss(onClose);
  const initialViewportHeightRef = useRef(window.visualViewport?.height ?? window.innerHeight);
  const query = search.trim();
  const available = exercises.filter((exercise) => !excludedIds.includes(exercise.id));
  const recent = recentExerciseIds
    .slice(0, 10)
    .map((id) => available.find((exercise) => exercise.id === id))
    .filter((exercise): exercise is Exercise => Boolean(exercise));
  const sections: Array<{ title: string; exercises: Exercise[] }> = [];

  if (query) {
    sections.push({
      title: 'Search results',
      exercises: rankExerciseSearchMatches(available, query, recentExerciseIds),
    });
  } else if (filter === 'favorites') {
    sections.push({ title: 'Favorites', exercises: available.filter((item) => item.is_favorite) });
  } else if (filter === 'recent') {
    sections.push({ title: 'Recently used', exercises: recent });
  } else {
    const scoped = available.filter((exercise) => filter === 'all' || exercise.category === filter);
    const favorites = scoped.filter((exercise) => exercise.is_favorite);
    const favoriteIds = new Set(favorites.map((exercise) => exercise.id));
    const recentlyUsed = recent.filter(
      (exercise) => scoped.some((item) => item.id === exercise.id) && !favoriteIds.has(exercise.id),
    );
    const featuredIds = new Set([
      ...favorites.map((exercise) => exercise.id),
      ...recentlyUsed.map((exercise) => exercise.id),
    ]);
    if (favorites.length) sections.push({ title: 'Favorites', exercises: favorites });
    if (recentlyUsed.length) sections.push({ title: 'Recently used', exercises: recentlyUsed });
    sections.push({
      title: filter === 'all' ? 'All exercises' : `${categoryNames[filter]} exercises`,
      exercises: scoped.filter((exercise) => !featuredIds.has(exercise.id)),
    });
  }
  const visibleExerciseCount = sections.reduce(
    (count, section) => count + section.exercises.length,
    0,
  );

  async function toggleFavorite(exercise: Exercise) {
    if (favoriteSavingIds.includes(exercise.id)) return;
    setFavoriteSavingIds((current) => [...current, exercise.id]);
    setPickerError(null);
    try {
      await onFavoriteChange(exercise.id, !exercise.is_favorite);
    } catch (error) {
      setPickerError(error instanceof Error ? error.message : 'Could not update this favorite.');
    } finally {
      setFavoriteSavingIds((current) => current.filter((id) => id !== exercise.id));
    }
  }

  function renderExercise(exercise: Exercise) {
    const selected = selectedIds.includes(exercise.id);
    return (
      <div className={`exercise-option ${selected ? 'selected' : ''}`} key={exercise.id}>
        <button
          type="button"
          className="exercise-option-select"
          aria-pressed={selected}
          onClick={() => {
            setSelectedIds((current) =>
              current.includes(exercise.id)
                ? current.filter((id) => id !== exercise.id)
                : singleSelect
                  ? [exercise.id]
                  : [...current, exercise.id],
            );
            searchRef.current?.blur();
          }}
        >
          <ExerciseIcon exercise={exercise} />
          <span className="exercise-option-copy">
            <strong>
              <FuzzyHighlightedText value={exercise.name} query={query} />
            </strong>
            {exercise.is_custom && <small className="custom-exercise-label">Custom</small>}
            <small className="exercise-option-tags">
              <em>{exercise.muscle_group}</em>
              {exercise.equipment && <em>{exercise.equipment}</em>}
            </small>
          </span>
          {selected && <b className="exercise-option-selected">✓</b>}
        </button>
        <ExerciseMuscleHelp exercise={exercise} />
        <button
          type="button"
          className={`exercise-favorite-button ${exercise.is_favorite ? 'active' : ''}`}
          aria-label={`${exercise.is_favorite ? 'Remove' : 'Add'} ${exercise.name} ${exercise.is_favorite ? 'from' : 'to'} favorites`}
          aria-pressed={exercise.is_favorite}
          disabled={favoriteSavingIds.includes(exercise.id)}
          onClick={() => void toggleFavorite(exercise)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M6 3h12v18l-6-4-6 4V3Z" />
          </svg>
        </button>
      </div>
    );
  }

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [search, filter]);

  useEffect(() => {
    const visualViewport = window.visualViewport;
    const updateViewport = () => {
      const height = visualViewport?.height ?? window.innerHeight;
      const top = visualViewport?.offsetTop ?? 0;
      setViewport({
        height,
        top,
        keyboardVisible: initialViewportHeightRef.current - height > 100,
      });
    };

    updateViewport();
    visualViewport?.addEventListener('resize', updateViewport);
    visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
    return () => {
      visualViewport?.removeEventListener('resize', updateViewport);
      visualViewport?.removeEventListener('scroll', updateViewport);
      window.removeEventListener('resize', updateViewport);
    };
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const root = document.getElementById('root');
    const rootWasInert = root?.hasAttribute('inert') ?? false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root?.setAttribute('inert', '');

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (!rootWasInert) root?.removeAttribute('inert');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const pickerHeight = viewport.keyboardVisible
    ? Math.max(280, viewport.height - 12)
    : Math.min(720, viewport.height * 0.84);
  const viewportStyle = {
    '--exercise-picker-viewport-top': `${viewport.top}px`,
    '--exercise-picker-viewport-height': `${viewport.height}px`,
    '--exercise-picker-height': `${pickerHeight}px`,
  } as CSSProperties;

  return createPortal(
    <div
      className="modal-backdrop exercise-picker-backdrop"
      style={viewportStyle}
      onPointerDown={(event) => {
        backdropDismiss.onPointerDown(event);
        if (event.target === event.currentTarget) event.preventDefault();
      }}
      onClick={backdropDismiss.onClick}
    >
      <section
        className={`exercise-picker panel ${viewport.keyboardVisible ? 'keyboard-visible' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-picker-title"
      >
        <header>
          <div className="exercise-picker-heading">
            <h2 id="exercise-picker-title">
              {singleSelect ? 'Switch Exercise' : 'Select Exercise'}
            </h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <label className="exercise-search-wrap">
          <span aria-hidden="true">⌕</span>
          <input
            ref={searchRef}
            className="exercise-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search…"
          />
        </label>
        <div className="exercise-filter-selects">
          <select
            aria-label="Body part"
            value={filter === 'favorites' || filter === 'recent' ? 'all' : filter}
            onChange={(event) => setFilter(event.target.value as WorkoutCategory | 'all')}
          >
            <option value="all">Any Body Part</option>
            {(
              [
                'push',
                'pull',
                'lower',
                'upper',
                'full_body',
                'cardio',
                'other',
              ] as WorkoutCategory[]
            ).map((category) => (
              <option key={category} value={category}>
                {categoryNames[category]}
              </option>
            ))}
          </select>
          <select
            aria-label="Exercise category"
            value={filter === 'favorites' || filter === 'recent' ? filter : 'all'}
            onChange={(event) => setFilter(event.target.value as 'all' | 'favorites' | 'recent')}
          >
            <option value="all">Any Category</option>
            <option value="favorites">Favorites</option>
            <option value="recent">Recently Used</option>
          </select>
          <button
            type="button"
            className="create-exercise-trigger"
            aria-label="Create new exercise"
            aria-haspopup="dialog"
            onClick={() => setCreateExerciseOpen(true)}
          >
            +
          </button>
        </div>
        <div className="exercise-list" ref={listRef}>
          {sections.map(
            (section) =>
              section.exercises.length > 0 && (
                <section className="exercise-list-section" key={section.title}>
                  <h3>{section.title}</h3>
                  {section.exercises.map(renderExercise)}
                </section>
              ),
          )}
          {!visibleExerciseCount && (
            <p className="muted-empty">
              {filter === 'favorites' && !query
                ? 'Tap the bookmark beside an exercise to add a favorite.'
                : filter === 'recent' && !query
                  ? 'Exercises from completed workouts will appear here.'
                  : 'No exercises match that search.'}
            </p>
          )}
          {pickerError && <p className="inline-error">{pickerError}</p>}
        </div>
        <div className={`exercise-picker-actions ${singleSelect ? 'single-action' : ''}`}>
          {!singleSelect && (
            <button
              className="create-superset-button"
              type="button"
              disabled={selectedIds.length < 2}
              onClick={() => onCreateSuperset?.(itemsInSelectionOrder(exercises, selectedIds))}
            >
              Add super set
            </button>
          )}
          <button
            className="add-selected-button"
            type="button"
            disabled={!selectedIds.length}
            onClick={() => onChoose(itemsInSelectionOrder(exercises, selectedIds))}
          >
            {singleSelect ? (
              'Switch exercise'
            ) : (
              <>
                <span>Add selected exercises</span> <b>{selectedIds.length}</b>
              </>
            )}
          </button>
        </div>
      </section>
      {createExerciseOpen && (
        <CreateExerciseDialog
          exercises={exercises}
          categoryLabels={categoryNames}
          initialName={query}
          initialCategory={
            filter === 'all' || filter === 'favorites' || filter === 'recent' ? '' : filter
          }
          viewportHeight={viewport.height}
          viewportTop={viewport.top}
          onCreate={onCreateExercise}
          onCreated={(exercise) => {
            setCreateExerciseOpen(false);
            setPickerError(null);
            setFilter('all');
            setSearch(exercise.name);
            setSelectedIds((current) =>
              singleSelect ? [exercise.id] : [...new Set([...current, exercise.id])],
            );
          }}
          onClose={() => setCreateExerciseOpen(false)}
        />
      )}
    </div>,
    document.body,
  );
}

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
  unlock?: () => void;
};

function LandscapeChartFrame({
  title,
  controls,
  children,
}: {
  title: string;
  controls: ReactNode;
  children: (expanded: boolean, close: () => void) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    expandedRef.current = false;
    setExpanded(false);
  }, []);

  const focusToggle = useCallback(() => {
    // The portal remounts the toggle; use its current node when restoring the compact view.
    toggleRef.current?.focus({ preventScroll: true });
  }, []);

  function unlockOrientation() {
    try {
      (screen.orientation as LockableScreenOrientation).unlock?.();
    } catch {
      // Orientation locking is optional, so the visual fallback can still close.
    }
  }

  async function enterLandscape() {
    // Mount the portal synchronously while the click still grants fullscreen permission.
    expandedRef.current = true;
    flushSync(() => setExpanded(true));
    const viewer = viewerRef.current;
    try {
      if (viewer?.requestFullscreen && !document.fullscreenElement) {
        // Fullscreen browsers override the target's transform. Rotate its child instead.
        await viewer.requestFullscreen();
      }
    } catch {
      // The fixed landscape layout below is the fallback on browsers without fullscreen support.
    }
    if (!expandedRef.current || viewerRef.current !== viewer) {
      if (document.fullscreenElement === viewer) {
        void document.exitFullscreen().catch(() => undefined);
      }
      return;
    }
    try {
      await (screen.orientation as LockableScreenOrientation).lock?.('landscape');
    } catch {
      // Orientation locking is not supported on every mobile browser.
    }
    if (!expandedRef.current || viewerRef.current !== viewer) unlockOrientation();
  }

  useEffect(() => {
    if (!expanded) return;
    const viewer = viewerRef.current;
    document.body.classList.add('chart-fullscreen-open');
    focusToggle();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      } else if (event.key === 'Tab' && viewer) {
        const focusable = viewer.querySelectorAll<HTMLElement>('button, [tabindex="0"]');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || !viewer.contains(document.activeElement))
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !viewer.contains(document.activeElement))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) close();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.body.classList.remove('chart-fullscreen-open');
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      expandedRef.current = false;
      unlockOrientation();
      if (document.fullscreenElement === viewer) {
        void document.exitFullscreen().catch(() => undefined);
      }
      focusToggle();
    };
  }, [expanded, close, focusToggle]);

  const frame = (
    <div className={`landscape-chart-frame ${expanded ? 'landscape-chart-expanded' : ''}`}>
      <div className="landscape-chart-toolbar">
        <strong className="landscape-chart-title">{title}</strong>
        <div className="landscape-chart-options">{controls}</div>
        <button
          type="button"
          ref={toggleRef}
          className="landscape-chart-toggle"
          aria-label={
            expanded ? `Exit full-screen ${title}` : `View ${title} full screen in landscape`
          }
          onClick={() => (expanded ? close() : void enterLandscape())}
        >
          <span aria-hidden="true">
            <Icon name={expanded ? 'close' : 'expand'} />
          </span>
          {expanded ? 'Exit' : 'Landscape'}
        </button>
      </div>
      <div className="landscape-chart-content">{children(expanded, close)}</div>
    </div>
  );

  return expanded
    ? createPortal(
        <div
          ref={viewerRef}
          className="landscape-chart-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={`${title} full screen`}
        >
          {frame}
        </div>,
        document.body,
      )
    : frame;
}

const PROGRESS_METRICS: Array<{ value: ProgressMetric; label: string; series: string }> = [
  { value: 'estimated_1rm', label: 'Est. 1RM', series: 'Est. 1RM' },
  { value: 'best_weight_kg', label: 'Top set', series: 'Top weight' },
  { value: 'volume_kg', label: 'Volume', series: 'Session volume' },
];

const RANGE_LABELS: Record<BodyTrendRange, string> = {
  '1m': '1M',
  '3m': '3M',
  '9m': '9M',
  '1y': '1Y',
  all: 'All',
};

interface ExerciseDetailHeader {
  exercise: Exercise;
  sessionCount: number | null;
  onBack: () => void;
}

export function ProgressScreen({
  dataRevision = null,
  exercises,
  measurements,
  personalRecords,
  onOpenWorkout,
  embedded = false,
  initialExerciseId = null,
  defaultExerciseId = null,
  browseFirst = false,
  onOpenSettings,
  onDetailChange,
}: {
  dataRevision?: string | null;
  exercises: Exercise[];
  measurements: BodyMeasurement[];
  personalRecords: PersonalRecord[];
  onOpenWorkout: (workoutId: string, exerciseId: string) => void;
  embedded?: boolean;
  initialExerciseId?: string | null;
  defaultExerciseId?: string | null;
  browseFirst?: boolean;
  onOpenSettings?: () => void;
  onDetailChange?: (header: ExerciseDetailHeader | null) => void;
}) {
  const weightUnit = useWeightUnit();
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
  const [visibleSessions, setVisibleSessions] = useState(browseFirst ? 5 : HISTORY_PAGE_SIZE);
  const [pickerRequest, setPickerRequest] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const libraryRoot = useRef<HTMLDivElement>(null);
  const libraryScroll = useRef(0);
  const metricIndicatorRef = useSlidingIndicator<HTMLDivElement>(metric);
  const rangeIndicatorRef = useSlidingIndicator<HTMLDivElement>(displayRange);
  const selectedExercise = strengthExercises.find((exercise) => exercise.id === exerciseId) ?? null;

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
            onBack: backToExercises,
          }
        : null,
    );
  }, [
    onDetailChange,
    browseFirst,
    fullProgress,
    selectedExercise,
    progressSessionCount,
    backToExercises,
  ]);
  useEffect(() => () => onDetailChange?.(null), [onDetailChange]);

  useEffect(() => {
    if (!exerciseId || libraryMode) return;
    let cancelled = false;
    setVisibleSessions(browseFirst ? 5 : HISTORY_PAGE_SIZE);
    setLoading(true);
    setProgressError(null);
    void api
      .exerciseProgress(exerciseId)
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
  }, [exerciseId, progressAttempt, dataRevision, libraryMode, browseFirst]);

  const metricInfo = PROGRESS_METRICS.find((item) => item.value === metric)!;
  const inRange = progress ? progressPointsForChart(progress.points, metric, displayRange) : [];
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
  const heaviestSetPoint = progress
    ? personalBestProgressPoint(progress.points, 'best_weight_kg')
    : null;
  const estimatedOneRepMaxPoint = progress
    ? personalBestProgressPoint(progress.points, 'estimated_1rm')
    : null;
  const volumePoint = progress ? personalBestProgressPoint(progress.points, 'volume_kg') : null;
  const bodyweight = measurements[0]?.weight_kg ?? null;
  const recordIds = useMemo(
    () =>
      new Set(
        personalRecords
          .filter(
            (record) =>
              record.exercise_id === exerciseId &&
              (record.record_type === 'weight' || record.record_type === 'reps_at_weight'),
          )
          .map((record) => record.workout_id),
      ),
    [personalRecords, exerciseId],
  );
  const sessionsNewestFirst = (progress?.points ?? []).slice().reverse();
  const formatMetric = (value: number) =>
    metric === 'volume_kg'
      ? Math.round(value).toLocaleString('en-GB')
      : Number(value.toFixed(1)).toLocaleString('en-GB');
  const formatMetricKg = (value: number) => formatMetric(weightFromKg(value, weightUnit));
  const chartPoints: TrendPoint[] = charted.map((point) => ({
    date: point.workout_date,
    value: weightFromKg(point[metric], weightUnit),
    id: point.workout_id,
    detail: `${formatWeight(point.best_weight_kg, weightUnit)} × ${point.best_reps}${point.best_rpe === null ? '' : ` @ RPE ${point.best_rpe}`}`,
  }));

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
          onClick={() => setDisplayRange(option.value)}
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
            dataRevision={dataRevision}
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
              className="text-link"
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
            {progress.points.length ? (
              <>
                <section className={browseFirst ? 'pulse-card exercise-progress-chart' : undefined}>
                  <div className="progress-hero">
                    <div className="progress-hero-summary">
                      <strong className="progress-hero-value">
                        {latestPoint ? formatMetricKg(latestPoint[metric]) : '–'}
                        <small>{weightUnit}</small>
                      </strong>
                      <p className="progress-hero-caption">
                        {latestPoint
                          ? `${metricInfo.series} · latest session ${shortDate(latestPoint.workout_date)}`
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
                    </div>
                    {!browseFirst && selectedExercise && (
                      <ExerciseIcon exercise={selectedExercise} />
                    )}
                  </div>
                  {rangeControls}
                  <LandscapeChartFrame
                    title={`${progress.exercise.name} · ${metricInfo.series}${weekly ? ' (best per week)' : ''}`}
                    controls={null}
                  >
                    {(expanded, close) => (
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
                          ? `${formatWeight(heaviestSetPoint.best_weight_kg, weightUnit)} × ${heaviestSetPoint.best_reps}`
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
                        {formatWeight(progress.personal_best_estimated_1rm, weightUnit, 1)}
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
                        {volumePoint ? formatWeight(volumePoint.volume_kg, weightUnit, 0) : '–'}
                      </b>
                      <small>
                        {volumePoint ? shortDate(volumePoint.workout_date) : 'Working sets'}
                      </small>
                    </div>
                    <div>
                      <span>Relative strength</span>
                      <b className="num">
                        {bodyweight && progress.personal_best_estimated_1rm
                          ? `${(progress.personal_best_estimated_1rm / bodyweight).toFixed(2)} × BW`
                          : '–'}
                      </b>
                      <small>
                        {bodyweight
                          ? `Best e1RM at ${formatWeight(bodyweight, weightUnit)}`
                          : 'Log bodyweight to compare'}
                      </small>
                    </div>
                  </section>
                  <section
                    className="pulse-card progress-sessions"
                    aria-label="Exercise session history"
                  >
                    <header className="pulse-card-header">
                      <h2>Sessions</h2>
                      <span>Best set · {metricInfo.label}</span>
                    </header>
                    <ul>
                      {sessionsNewestFirst.slice(0, visibleSessions).map((point) => (
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
                              {recordIds.has(point.workout_id) && <em className="pr-chip">PR</em>}
                            </span>
                            <span className="session-set num">
                              {formatWeight(point.best_weight_kg, weightUnit)} × {point.best_reps}
                              {point.best_rpe !== null && <small> @{point.best_rpe}</small>}
                            </span>
                            <b className="num">{formatMetricKg(point[metric])}</b>
                            <Icon name="chevron-right" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {visibleSessions < sessionsNewestFirst.length && (
                      <button
                        type="button"
                        className="show-more-button"
                        onClick={() => setVisibleSessions((count) => count + HISTORY_PAGE_SIZE * 2)}
                      >
                        Show more · {sessionsNewestFirst.length - visibleSessions} older
                      </button>
                    )}
                  </section>
                </div>
              </>
            ) : (
              <EmptyState
                title="No data yet"
                body="Complete this exercise in a workout to start its progress graph."
              />
            )}
          </div>
        )}
      </section>
    </section>
  );
}

function SettingsScreen({
  active,
  selectedGroup,
  onSelectGroup,
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
  csvGuideOpen,
  onCsvGuideOpenChange,
  onDeleteSamples,
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
  active: boolean;
  selectedGroup: SettingsGroupId | null;
  onSelectGroup: (group: SettingsGroupId | null) => void;
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
  csvGuideOpen: boolean;
  onCsvGuideOpenChange: (open: boolean) => void;
  onDeleteSamples: () => Promise<void>;
  onDataChange: () => Promise<void>;
}) {
  useSettingsPageJump('settings', active);
  const workoutDataSection = useRef<HTMLElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<RestAlertStatus>(() =>
    pushNotificationsSupported() ? 'checking' : 'unsupported',
  );
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const sharedPreferences = useTrainingPreferences();
  const [trainingPreferences, setTrainingPreferences] = useState<TrainingPreferences | null>(
    sharedPreferences.preferences,
  );
  const [trainingPreferencesStatus, setTrainingPreferencesStatus] = useState<string | null>(null);
  const [trainingPreferencesError, setTrainingPreferencesError] = useState<string | null>(null);
  const [savingTrainingPreferences, setSavingTrainingPreferences] = useState(false);
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
    setTrainingPreferences(sharedPreferences.preferences);
    setTrainingPreferencesError(sharedPreferences.error);
  }, [sharedPreferences.preferences, sharedPreferences.error]);

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
    setNotificationMessage(null);
    setNotificationError(null);
    if (notificationStatus === 'enabled') {
      setNotificationStatus('enabling');
      await disablePhonePushNotifications();
      setNotificationStatus('available');
      setNotificationMessage('Phone notifications are off.');
      return;
    }

    setNotificationStatus('enabling');
    try {
      await enablePhonePushNotifications();
      setNotificationStatus('enabled');
      setNotificationMessage('Phone notifications are on.');
    } catch (reason) {
      setNotificationStatus(Notification.permission === 'denied' ? 'blocked' : 'available');
      setNotificationError(
        reason instanceof Error ? reason.message : 'Could not enable phone notifications.',
      );
    }
  }

  async function saveTrainingPreferences() {
    if (!trainingPreferences || savingTrainingPreferences) return;
    setSavingTrainingPreferences(true);
    setTrainingPreferencesStatus(null);
    setTrainingPreferencesError(null);
    if (
      !Number.isInteger(trainingPreferences.weekly_muscle_set_goal) ||
      trainingPreferences.weekly_muscle_set_goal < 1 ||
      trainingPreferences.weekly_muscle_set_goal > 1000
    ) {
      setTrainingPreferencesError('Enter a weekly muscle set goal between 1 and 1,000 whole sets.');
      setSavingTrainingPreferences(false);
      return;
    }
    try {
      const saved = await api.updateTrainingPreferences(trainingPreferences);
      setTrainingPreferences(saved);
      sharedPreferences.applySaved(saved);
      await onDataChange();
      window.dispatchEvent(new Event('training-preferences-updated'));
      setTrainingPreferencesStatus('Training preferences saved.');
    } catch (reason) {
      setTrainingPreferencesError(
        reason instanceof Error ? reason.message : 'Could not save training preferences.',
      );
    } finally {
      setSavingTrainingPreferences(false);
    }
  }

  // Only recent workouts may be loaded; export ranges count back from the latest one logged.
  const workoutDates = [
    ...workouts.map((workout) => workout.workout_date),
    ...(historySummary?.last_workout_date ? [historySummary.last_workout_date] : []),
  ];

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
                <section
                  className="settings-panel panel"
                  aria-labelledby="training-preferences-title"
                >
                  <header>
                    <div>
                      <p className="section-kicker">TRAINING</p>
                      <h2 id="training-preferences-title">Units &amp; weekly goals</h2>
                    </div>
                  </header>
                  <p>Set your units, week start and muscle-set goal. Saved to your account.</p>
                  {trainingPreferences && (
                    <div className="training-preferences-grid">
                      <label>
                        Weight unit
                        <select
                          value={trainingPreferences.preferred_weight_unit}
                          onChange={(event) => {
                            setTrainingPreferences({
                              ...trainingPreferences,
                              preferred_weight_unit: event.target.value as 'kg' | 'lb',
                            });
                            setTrainingPreferencesStatus(null);
                          }}
                        >
                          <option value="kg">Kilograms</option>
                          <option value="lb">Pounds</option>
                        </select>
                      </label>
                      <label>
                        Week starts
                        <select
                          value={trainingPreferences.week_start}
                          onChange={(event) => {
                            setTrainingPreferences({
                              ...trainingPreferences,
                              week_start: event.target.value as 'monday' | 'sunday' | 'saturday',
                            });
                            setTrainingPreferencesStatus(null);
                          }}
                        >
                          <option value="monday">Monday</option>
                          <option value="sunday">Sunday</option>
                          <option value="saturday">Saturday</option>
                        </select>
                      </label>
                      <label>
                        Weekly sets per muscle
                        <input
                          type="number"
                          min="1"
                          max="1000"
                          step="1"
                          value={trainingPreferences.weekly_muscle_set_goal || ''}
                          aria-describedby="muscle-set-goal-help"
                          onChange={(event) => {
                            setTrainingPreferences({
                              ...trainingPreferences,
                              weekly_muscle_set_goal: Number(event.target.value),
                            });
                            setTrainingPreferencesStatus(null);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={savingTrainingPreferences}
                        onClick={() => void saveTrainingPreferences()}
                      >
                        {savingTrainingPreferences ? 'Saving…' : 'Save preferences'}
                      </button>
                    </div>
                  )}
                  <p id="muscle-set-goal-help">
                    Counts working sets, excluding warmups. Shown as the goal on Home’s Sets per
                    muscle bars.
                  </p>
                  {trainingPreferencesStatus && (
                    <p className="training-preference-status" role="status">
                      {trainingPreferencesStatus}
                    </p>
                  )}
                  {trainingPreferencesError && (
                    <p className="inline-error" role="alert">
                      {trainingPreferencesError}
                    </p>
                  )}
                </section>

                <section className="settings-panel panel" aria-labelledby="rest-settings-title">
                  <header>
                    <h2 id="rest-settings-title">Between sets</h2>
                  </header>
                  <div className="notification-setting-row">
                    <div>
                      <strong>Rest timer</strong>
                      <small>
                        {restTimerEnabled
                          ? 'Starts automatically after a completed set'
                          : 'Automatic rest countdowns are disabled'}
                      </small>
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
                      <small>
                        {showRestTimes
                          ? 'Display rest times between sets'
                          : 'Rest times between sets are hidden'}
                      </small>
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
                </section>
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
                  <p>Set the bodyweight chart shown in Body. Saved on this device.</p>
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
                      <small>
                        {reduceMotion
                          ? 'Screens, sheets and charts change without sliding or fading'
                          : systemPrefersReducedMotion()
                            ? 'Your phone already asks for reduced motion, so the app follows it'
                            : 'Screens slide, sheets glide and charts draw in'}
                      </small>
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
                  aria-labelledby="notification-settings-title"
                >
                  <header>
                    <div>
                      <p className="section-kicker">ALERTS</p>
                      <h2 id="notification-settings-title">Phone alerts</h2>
                    </div>
                  </header>
                  <p>Manage notifications on this device.</p>
                  <div className="notification-setting-row">
                    <div>
                      <strong>Phone alerts</strong>
                      <small>
                        {notificationStatus === 'enabled'
                          ? 'Rest timers, 2-hour workout reminders, and completed-video alerts are enabled'
                          : notificationStatus === 'unsupported'
                            ? 'Use an installed app and a supported browser to enable notifications'
                            : notificationStatus === 'blocked'
                              ? 'Blocked in phone settings'
                              : 'Rest timers, 2-hour workout reminders, and completed-video alerts are disabled'}
                      </small>
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
                  {notificationMessage && (
                    <p className="notification-setting-status" role="status">
                      {notificationMessage}
                    </p>
                  )}
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
                  <p>Bring in workout history and bodyweight, or download a copy of your data.</p>
                  <button
                    type="button"
                    className="profile-secondary workout-data-guide-button"
                    onClick={() => onCsvGuideOpenChange(true)}
                  >
                    Show guide
                  </button>
                  <div className="settings-actions data-transfer-actions">
                    <WorkoutCsvImport
                      onImport={onImportWorkouts}
                      guideOpen={csvGuideOpen}
                      onGuideOpenChange={onCsvGuideOpenChange}
                    />
                    <button type="button" onClick={() => setExportOpen(true)}>
                      ↓ Export data
                    </button>
                    {(historySummary?.has_sample_workouts ??
                      workouts.some((workout) => workout.is_sample)) && (
                      <InlineConfirmButton
                        className="sample-clear"
                        label="Remove sample workouts"
                        confirmLabel="Confirm removal"
                        onConfirm={onDeleteSamples}
                      />
                    )}
                  </div>
                </section>

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
                  <p>Walk through the features again or find out how to contribute.</p>
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
                  <p>Read the latest release notes and see what's changed in Relay.</p>
                  {updateCheck}
                </section>
                <section className="settings-panel panel" aria-labelledby="feedback-settings-title">
                  <header>
                    <div>
                      <p className="section-kicker">YOUR IDEAS</p>
                      <h2 id="feedback-settings-title">Feedback &amp; feature requests</h2>
                    </div>
                  </header>
                  <p>Tell us what could be better, report a problem or suggest a feature.</p>
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
        />
      )}
    </section>
  );
}

export function BodyCompositionScreen({
  dataRevision = null,
  measurements,
  onSave,
  onDelete,
  onDataChange,
  entryRequest = 0,
  trendPreference = DEFAULT_BODY_TREND_PREFERENCE,
  onOpenSettings,
  accountActions,
}: {
  dataRevision?: string | null;
  measurements: BodyMeasurement[];
  onSave: (payload: {
    measurement_date: string;
    weight_kg: number;
    body_fat_pct: number | null;
    notes: string | null;
  }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onDataChange: () => Promise<void>;
  entryRequest?: number;
  trendPreference?: BodyTrendPreference;
  onOpenSettings?: () => void;
  accountActions?: ReactNode;
}) {
  const weightUnit = useWeightUnit();
  const [measurementDate, setMeasurementDate] = useState(localDate());
  const [entryOpen, setEntryOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [weight, setWeight] = useState<number | null>(null);
  const [bodyFat, setBodyFat] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goals, setGoals] = useState<BodyWeightGoal[]>([]);
  const [goalTarget, setGoalTarget] = useState<number | null>(null);
  const [goalKind, setGoalKind] = useState<BodyGoalKind>('loss');
  const [goalDate, setGoalDate] = useState('');
  const [savingGoal, setSavingGoal] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState<BodyMeasurement | null>(null);
  const [editWeight, setEditWeight] = useState<number | null>(null);
  const [editBodyFat, setEditBodyFat] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [checkInPage, setCheckInPage] = useState(1);
  const [historyView, setHistoryView] = useState<'daily' | BodyHistoryPeriod>('daily');
  const historyViewIndicatorRef = useSlidingIndicator<HTMLDivElement>(historyView);
  const [trendDuration, setTrendDuration] = useState<BodyTrendDuration>(trendPreference.duration);
  const [trendStatistic, setTrendStatistic] = useState<BodyTrendStatistic>(
    trendPreference.statistic,
  );
  const activeGoal = goals.find((goal) => goal.active) ?? null;
  const dailyHistory = bodyHistoryWithWeightChanges(
    measurements
      .slice()
      .sort((first, second) => second.measurement_date.localeCompare(first.measurement_date)),
    goals,
    (measurement) => measurement.measurement_date,
  );
  // A week or month is judged by the goal in force on its last day.
  const historySummaries = bodyHistoryWithWeightChanges(
    historyView === 'daily' ? [] : summarizeBodyHistory(measurements, historyView, trendStatistic),
    goals,
    (summary) => summary.end_date,
  );
  const historyCount = historyView === 'daily' ? measurements.length : historySummaries.length;
  const checkInPageCount = Math.max(1, Math.ceil(historyCount / HISTORY_PAGE_SIZE));
  const pagedMeasurements = dailyHistory.slice(
    (checkInPage - 1) * HISTORY_PAGE_SIZE,
    checkInPage * HISTORY_PAGE_SIZE,
  );
  const pagedSummaries = historySummaries.slice(
    (checkInPage - 1) * HISTORY_PAGE_SIZE,
    checkInPage * HISTORY_PAGE_SIZE,
  );
  const latest = measurements[0];
  const targetWeight = goalTarget;
  const hasValidTarget =
    targetWeight !== null &&
    Number.isFinite(targetWeight) &&
    targetWeight > 0 &&
    targetWeight <= 500;
  const trendSummary = summarizeBodyWeightTrend(measurements, trendDuration);
  const trendValue = trendSummary[trendStatistic];

  useEffect(() => {
    setCheckInPage((page) => Math.min(page, checkInPageCount));
  }, [checkInPageCount]);

  useEffect(() => {
    if (entryRequest === 0) return;
    setEntryOpen(true);
    setGoalOpen(false);
  }, [entryRequest]);

  useEffect(() => {
    setTrendDuration(trendPreference.duration);
    setTrendStatistic(trendPreference.statistic);
  }, [trendPreference]);
  useEffect(() => {
    let cancelled = false;
    void api
      .listBodyWeightGoals()
      .then((next) => {
        if (!cancelled) setGoals(next);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : 'Could not load body-weight goals.');
      });
    return () => {
      cancelled = true;
    };
  }, [dataRevision]);

  function chooseGoalKind(kind: BodyGoalKind) {
    setGoalKind(kind);
    // Maintaining usually means holding today's weight, so start from it.
    if (kind === 'maintain' && goalTarget === null && latest) setGoalTarget(latest.weight_kg);
  }

  async function saveGoal() {
    if (!latest || !hasValidTarget || !goalDate) {
      setError('Log a current weight, target weight, and target date first.');
      return;
    }
    const direction = bodyGoalKind({
      start_weight_kg: latest.weight_kg,
      target_weight_kg: targetWeight!,
    });
    if (goalKind !== 'maintain' && direction !== goalKind) {
      setError(
        `For a weight-${goalKind} goal, choose a target ${goalKind === 'loss' ? 'below' : 'above'} your current ${formatWeight(latest.weight_kg, weightUnit)}.`,
      );
      return;
    }
    setSavingGoal(true);
    setError(null);
    try {
      const goal = await api.createBodyWeightGoal({
        start_date: localDate(),
        target_date: goalDate,
        // A maintain goal holds one weight, so its start and target are the same.
        start_weight_kg: goalKind === 'maintain' ? targetWeight! : latest.weight_kg,
        target_weight_kg: targetWeight!,
        active: true,
      });
      setGoals((current) => [goal, ...current.map((item) => ({ ...item, active: false }))]);
      await onDataChange();
      setGoalTarget(null);
      setGoalDate('');
      setGoalOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this target.');
    } finally {
      setSavingGoal(false);
    }
  }

  async function submitMeasurement() {
    const weightValue = weight;
    if (
      weightValue === null ||
      !Number.isFinite(weightValue) ||
      weightValue <= 0 ||
      weightValue > 500
    ) {
      setError(`Enter a body weight above 0 and up to ${formatWeight(500, weightUnit)}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        measurement_date: measurementDate,
        weight_kg: weightValue,
        body_fat_pct: bodyFat ? Number(bodyFat) : null,
        notes: notes.trim() || null,
      });
      setWeight(null);
      setBodyFat('');
      setNotes('');
      setEntryOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save this measurement.');
    } finally {
      setSaving(false);
    }
  }

  function beginMeasurementEdit(measurement: BodyMeasurement) {
    setEditingMeasurement(measurement);
    setEditWeight(measurement.weight_kg);
    setEditBodyFat(measurement.body_fat_pct === null ? '' : String(measurement.body_fat_pct));
    setEditError(null);
  }

  async function submitMeasurementEdit() {
    if (!editingMeasurement) return;
    const weightValue = editWeight;
    const bodyFatValue = editBodyFat.trim() ? Number(editBodyFat) : null;
    if (
      weightValue === null ||
      !Number.isFinite(weightValue) ||
      weightValue <= 0 ||
      weightValue > 500
    ) {
      setEditError(`Enter a body weight above 0 and up to ${formatWeight(500, weightUnit)}.`);
      return;
    }
    if (
      bodyFatValue !== null &&
      (!Number.isFinite(bodyFatValue) || bodyFatValue < 1 || bodyFatValue > 70)
    ) {
      setEditError('Enter a body-fat percentage between 1 and 70, or leave it blank.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      await onSave({
        measurement_date: editingMeasurement.measurement_date,
        weight_kg: weightValue,
        body_fat_pct: bodyFatValue,
        notes:
          editingMeasurement.notes === IMPORTED_BODYWEIGHT_NOTE ? null : editingMeasurement.notes,
      });
      setEditingMeasurement(null);
    } catch (saveError) {
      setEditError(
        saveError instanceof Error ? saveError.message : 'Could not update this check-in.',
      );
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <section className="body-screen content-page">
      <PageHeader
        eyebrow={`${measurements.length} ${measurements.length === 1 ? 'check-in' : 'check-ins'}${latest ? ` · latest ${shortDate(latest.measurement_date)}` : ''}`}
        title="Body"
        onOpenSettings={onOpenSettings}
        accountActions={accountActions}
      />
      <div className="body-reference-stats" aria-label="Bodyweight summary">
        <div>
          <span>Bodyweight</span>
          <strong>{latest ? formatWeight(latest.weight_kg, weightUnit) : '–'}</strong>
        </div>
        <div>
          <span>
            {activeGoal
              ? `${new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(`${activeGoal.target_date}T12:00:00`))} Goal`
              : 'Weight Goal'}
          </span>
          <strong>
            {activeGoal ? formatWeight(activeGoal.target_weight_kg, weightUnit) : '–'}
          </strong>
        </div>
        <div>
          <span>Body Fat</span>
          <strong>
            {latest && latest.body_fat_pct !== null ? `${latest.body_fat_pct}%` : '–'}
          </strong>
        </div>
        <div className="body-trend-stat">
          <div className="body-trend-stat-controls">
            <label>
              <span className="sr-only">Bodyweight trend statistic</span>
              <select
                aria-label="Bodyweight trend statistic"
                value={trendStatistic}
                onChange={(event) => setTrendStatistic(event.target.value as BodyTrendStatistic)}
              >
                <option value="average">Average</option>
                <option value="median">Median</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Bodyweight trend duration</span>
              <select
                aria-label="Bodyweight trend duration"
                value={trendDuration}
                onChange={(event) => setTrendDuration(event.target.value as BodyTrendDuration)}
              >
                {BODY_TREND_DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <strong>
            {trendValue === null
              ? '–'
              : `${weightFromKg(trendValue, weightUnit).toFixed(1)} ${weightUnit}`}
          </strong>
          <small>
            {trendSummary.count} {trendSummary.count === 1 ? 'check-in' : 'check-ins'}
          </small>
        </div>
      </div>

      {measurements.length > 1 && (
        <section className="pulse-card body-trend-panel">
          <header className="pulse-card-header">
            <h2>Trend</h2>
            <span>Tap or drag the chart to read a check-in</span>
          </header>
          <BodyTrendChart measurements={measurements} goals={goals} />
        </section>
      )}

      <div className="body-reference-actions">
        <button
          className={entryOpen ? 'active' : ''}
          type="button"
          onClick={() => {
            setError(null);
            setEntryOpen(true);
            setGoalOpen(false);
          }}
        >
          Log weigh-in
        </button>
        <button
          className={goalOpen ? 'active' : ''}
          type="button"
          onClick={() => {
            setError(null);
            setGoalKind(activeGoal ? bodyGoalKind(activeGoal) : 'loss');
            setGoalOpen(true);
            setEntryOpen(false);
          }}
        >
          {activeGoal ? 'New goal' : 'Set a goal'}
        </button>
      </div>

      {goalOpen && (
        <PopupDialog
          title="Add bodyweight goal"
          kicker="GOAL"
          className="body-goal-popup"
          onClose={() => setGoalOpen(false)}
        >
          <form
            className="body-goal-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveGoal();
            }}
          >
            {activeGoal && latest && bodyGoalKind(activeGoal) === 'maintain' && (
              <div className="body-goal-progress">
                <div>
                  <strong>{formatWeight(latest.weight_kg, weightUnit)}</strong>
                  <span>
                    Maintaining {formatWeight(activeGoal.target_weight_kg, weightUnit)} until{' '}
                    {prettyDate(activeGoal.target_date)}
                  </span>
                </div>
              </div>
            )}
            {activeGoal && latest && bodyGoalKind(activeGoal) !== 'maintain' && (
              <div className="body-goal-progress">
                <div>
                  <strong>{formatWeight(latest.weight_kg, weightUnit)}</strong>
                  <span>
                    → {formatWeight(activeGoal.target_weight_kg, weightUnit)} by{' '}
                    {prettyDate(activeGoal.target_date)}
                  </span>
                </div>
                <div className="zone2-track">
                  <i
                    style={{
                      width: `${Math.min(100, Math.max(0, (Math.abs(latest.weight_kg - activeGoal.start_weight_kg) / Math.max(Math.abs(activeGoal.target_weight_kg - activeGoal.start_weight_kg), 0.1)) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            )}
            <div className="segmented-control body-goal-kind" role="radiogroup" aria-label="Goal">
              {(
                [
                  ['loss', 'Lose'],
                  ['gain', 'Gain'],
                  ['maintain', 'Maintain'],
                ] as const
              ).map(([kind, label]) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={goalKind === kind}
                  className={goalKind === kind ? 'active' : ''}
                  onClick={() => chooseGoalKind(kind)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="goal-entry-fields">
              <label>
                {goalKind === 'maintain' ? 'Maintain' : 'Target'} ({weightUnit})
                <WeightInput weightKg={goalTarget} onWeightChange={setGoalTarget} />
              </label>
              <label>
                {goalKind === 'maintain' ? 'Until' : 'Target date'}
                <input
                  type="date"
                  value={goalDate}
                  onChange={(event) => setGoalDate(event.target.value)}
                />
              </label>
            </div>
            {error && <p className="inline-error">{error}</p>}
            <footer className="popup-dialog-actions">
              <button type="button" disabled={savingGoal} onClick={() => setGoalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="popup-primary-action" disabled={savingGoal}>
                {savingGoal ? 'Saving…' : 'Set goal'}
              </button>
            </footer>
          </form>
        </PopupDialog>
      )}

      {entryOpen && (
        <PopupDialog
          title="Log measurement"
          kicker="CHECK-IN"
          className="body-entry-popup"
          onClose={() => setEntryOpen(false)}
        >
          <form
            className="body-entry-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitMeasurement();
            }}
          >
            <div className="body-entry-fields">
              <label>
                Date
                <input
                  type="date"
                  value={measurementDate}
                  onChange={(event) => setMeasurementDate(event.target.value)}
                />
              </label>
              <label>
                Weight ({weightUnit})
                <WeightInput
                  autoFocus
                  weightKg={weight}
                  onWeightChange={setWeight}
                  placeholder={weightInputValue(measurements[0]?.weight_kg ?? 88, weightUnit)}
                />
              </label>
              <label>
                Body fat %
                <input
                  inputMode="decimal"
                  type="number"
                  min="1"
                  max="70"
                  step="0.1"
                  value={bodyFat}
                  onChange={(event) => setBodyFat(event.target.value)}
                  placeholder="Optional"
                />
              </label>
            </div>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Conditions or anything worth remembering…"
              rows={2}
            />
            {error && <p className="inline-error">{error}</p>}
            <footer className="popup-dialog-actions">
              <button type="button" disabled={saving} onClick={() => setEntryOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="popup-primary-action" disabled={saving}>
                {saving ? 'Saving…' : 'Save check-in'}
              </button>
            </footer>
          </form>
        </PopupDialog>
      )}

      <div
        ref={historyViewIndicatorRef}
        className="body-log-tabs slide-indicator"
        role="tablist"
        aria-label="Bodyweight records"
      >
        {(
          [
            ['daily', 'Daily'],
            ['week', `${trendStatistic === 'average' ? 'Avg' : 'Median'} Week`],
            ['month', `${trendStatistic === 'average' ? 'Avg' : 'Median'} Monthly`],
          ] as const
        ).map(([view, label]) => (
          <button
            key={view}
            className={historyView === view ? 'active' : ''}
            type="button"
            role="tab"
            aria-selected={historyView === view}
            onClick={() => {
              setHistoryView(view);
              setCheckInPage(1);
              setEditingMeasurement(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="panel body-history-panel" role="tabpanel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">HISTORY</p>
            <h2>Check-ins</h2>
          </div>
        </div>
        {!historyCount && <p className="body-empty">Your first check-in will appear here.</p>}
        {historyCount > 0 && (
          <div
            className={`body-history-table-head${historyView === 'daily' ? '' : ' body-history-summary-grid'}`}
            aria-hidden="true"
          >
            <span>
              {historyView === 'daily' ? 'Date' : historyView === 'week' ? 'Week' : 'Month'}
            </span>
            <span>Bodyweight</span>
            <span>Body Fat</span>
            {historyView === 'daily' && <span />}
          </div>
        )}
        {historyView === 'daily' &&
          pagedMeasurements.map((measurement) => (
            <Fragment key={measurement.id}>
              <article>
                <div className="body-history-date">
                  <strong>
                    {new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
                      new Date(`${measurement.measurement_date}T12:00:00`),
                    )}
                  </strong>
                  <small>{measurement.measurement_date.slice(0, 4)}</small>
                </div>
                <div className="body-history-weight">
                  <strong>
                    {formatWeight(measurement.weight_kg, weightUnit)}
                    <BodyHistoryWeightChange
                      change={measurement.weight_change}
                      comparison="previous check-in"
                      unit={weightUnit}
                      decimals={2}
                    />
                  </strong>
                  <small>{measurement.is_sample && 'Sample'}</small>
                  {measurement.notes && <p>{measurement.notes}</p>}
                </div>
                <div className="body-history-fat">
                  <strong>
                    {measurement.body_fat_pct !== null ? `${measurement.body_fat_pct}%` : '–'}
                  </strong>
                  <small>{measurement.body_fat_pct !== null ? 'estimate' : ''}</small>
                </div>
                <details className="body-row-menu">
                  <summary aria-label={`Actions for ${prettyDate(measurement.measurement_date)}`}>
                    ⋮
                  </summary>
                  <div className="body-history-actions">
                    <button type="button" onClick={() => beginMeasurementEdit(measurement)}>
                      Edit
                    </button>
                    <InlineConfirmButton
                      label="Delete"
                      confirmLabel="Delete check-in"
                      onConfirm={() => onDelete(measurement.id)}
                    />
                  </div>
                </details>
              </article>
              {editingMeasurement?.id === measurement.id && (
                <form
                  className="body-edit-form"
                  aria-label={`Edit check-in for ${prettyDate(editingMeasurement.measurement_date)}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitMeasurementEdit();
                  }}
                >
                  <header>
                    <div>
                      <p className="section-kicker">EDIT CHECK-IN</p>
                      <h2>{prettyDate(editingMeasurement.measurement_date)}</h2>
                    </div>
                  </header>
                  <div className="body-edit-content">
                    <div className="body-edit-fields">
                      <label>
                        Weight ({weightUnit})
                        <WeightInput weightKg={editWeight} onWeightChange={setEditWeight} />
                      </label>
                      <label>
                        Body fat %
                        <input
                          inputMode="decimal"
                          type="number"
                          min="1"
                          max="70"
                          step="0.1"
                          value={editBodyFat}
                          onChange={(event) => setEditBodyFat(event.target.value)}
                          placeholder="Optional"
                        />
                      </label>
                    </div>
                    {editError && <p className="inline-error">{editError}</p>}
                  </div>
                  <div className="body-edit-actions">
                    <button
                      type="button"
                      disabled={editSaving}
                      onClick={() => setEditingMeasurement(null)}
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={editSaving}>
                      {editSaving ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </form>
              )}
              {measurement.goal_change && (
                <BodyHistoryGoalDivider goal={measurement.goal_change} unit={weightUnit} />
              )}
            </Fragment>
          ))}
        {historyView !== 'daily' &&
          pagedSummaries.map((summary) => (
            <Fragment key={summary.start_date}>
              <article className="body-history-summary-grid">
                <div className="body-history-date">
                  <strong>
                    {historyView === 'week'
                      ? `${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(`${summary.start_date}T12:00:00`))} – ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(new Date(`${summary.end_date}T12:00:00`))}`
                      : new Intl.DateTimeFormat(undefined, { month: 'long' }).format(
                          new Date(`${summary.start_date}T12:00:00`),
                        )}
                  </strong>
                  <small>
                    {summary.start_date.slice(0, 4)}
                    {summary.start_date.slice(0, 4) !== summary.end_date.slice(0, 4)
                      ? `–${summary.end_date.slice(0, 4)}`
                      : ''}
                  </small>
                </div>
                <div className="body-history-weight">
                  <strong>
                    {weightFromKg(summary.weight_kg, weightUnit).toFixed(1)} {weightUnit}
                    <BodyHistoryWeightChange
                      change={summary.weight_change}
                      comparison={`previous ${historyView === 'week' ? 'week' : 'month'} with check-ins`}
                      unit={weightUnit}
                      decimals={1}
                      fixed
                    />
                  </strong>
                  <small>
                    {summary.count} {summary.count === 1 ? 'check-in' : 'check-ins'}
                  </small>
                </div>
                <div className="body-history-fat">
                  <strong>
                    {summary.body_fat_pct === null ? '–' : `${summary.body_fat_pct.toFixed(1)}%`}
                  </strong>
                </div>
              </article>
              {summary.goal_change && (
                <BodyHistoryGoalDivider goal={summary.goal_change} unit={weightUnit} />
              )}
            </Fragment>
          ))}
        <PaginationControls
          currentPage={checkInPage}
          totalPages={checkInPageCount}
          onPageChange={setCheckInPage}
          label={`${historyView} bodyweight history`}
        />
      </section>
    </section>
  );
}

function BodyTrendChart({
  measurements,
  goals,
}: {
  measurements: BodyMeasurement[];
  goals: BodyWeightGoal[];
}) {
  const weightUnit = useWeightUnit();
  const [displayRange, setDisplayRange] = useState<BodyTrendRange>('3m');
  // Weight and body fat use different units, so they are separate views rather than two y-axes.
  const [series, setSeries] = useState<'weight' | 'fat'>('weight');
  const ordered = filterMeasurementsByRange(measurements, displayRange).slice().reverse();
  const hasBodyFat = measurements.some((item) => item.body_fat_pct !== null);
  const selectedDateRange = dateRangeForDates(
    measurements.map((item) => item.measurement_date),
    displayRange,
  );
  const activeGoal = goals.find((goal) => goal.active) ?? null;
  const clippedGoal = activeGoal
    ? clipBodyWeightGoalPath(activeGoal, selectedDateRange.start_date, selectedDateRange.end_date)
    : null;
  const weekMs = 7 * 86_400_000;
  const averagePoints = useMemo<TrendPoint[]>(
    () =>
      ordered.map((item) => {
        const end = new Date(`${item.measurement_date}T12:00:00`).getTime();
        const window = measurements.filter((candidate) => {
          const time = new Date(`${candidate.measurement_date}T12:00:00`).getTime();
          return time <= end && time > end - weekMs;
        });
        const average =
          window.reduce((total, candidate) => total + candidate.weight_kg, 0) / window.length;
        return {
          date: item.measurement_date,
          value: weightFromKg(average, weightUnit),
          detail: `weighed ${formatWeight(item.weight_kg, weightUnit)}`,
        };
      }),
    // ordered is derived from measurements and the range.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measurements, displayRange, weightUnit],
  );
  const dailyPoints = useMemo<TrendPoint[]>(
    () =>
      ordered.map((item) => ({
        date: item.measurement_date,
        value: weightFromKg(item.weight_kg, weightUnit),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measurements, displayRange, weightUnit],
  );
  const fatPoints = useMemo<TrendPoint[]>(
    () =>
      ordered
        .filter((item) => item.body_fat_pct !== null)
        .map((item) => ({ date: item.measurement_date, value: item.body_fat_pct! })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measurements, displayRange, weightUnit],
  );
  const goalPath = useMemo<GoalPath | null>(
    () =>
      clippedGoal && series === 'weight'
        ? {
            startDate: clippedGoal.start_date,
            startValue: weightFromKg(clippedGoal.start_weight_kg, weightUnit),
            endDate: clippedGoal.target_date,
            endValue: weightFromKg(clippedGoal.target_weight_kg, weightUnit),
            label: `Goal ${formatWeight(activeGoal!.target_weight_kg, weightUnit)}`,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      clippedGoal?.start_date,
      clippedGoal?.target_date,
      clippedGoal?.start_weight_kg,
      clippedGoal?.target_weight_kg,
      series,
      weightUnit,
    ],
  );
  const showFat = series === 'fat' && hasBodyFat;
  const bodyRangeIndicatorRef = useSlidingIndicator<HTMLDivElement>(displayRange);
  const bodySeriesIndicatorRef = useSlidingIndicator<HTMLDivElement>(showFat);

  return (
    <div className="body-trend-chart">
      <div className="body-trend-chart-controls">
        <div
          ref={bodyRangeIndicatorRef}
          className="range-chips slide-indicator"
          role="tablist"
          aria-label="Body composition range"
        >
          {TIME_RANGE_OPTIONS.map((option) => (
            <button
              type="button"
              role="tab"
              key={option.value}
              aria-selected={displayRange === option.value}
              aria-label={option.label}
              className={displayRange === option.value ? 'active' : ''}
              onClick={() => setDisplayRange(option.value)}
            >
              {RANGE_LABELS[option.value]}
            </button>
          ))}
        </div>
        {hasBodyFat && (
          <div
            ref={bodySeriesIndicatorRef}
            className="segmented-control compact slide-indicator"
            role="tablist"
            aria-label="Body measure"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!showFat}
              className={!showFat ? 'active' : ''}
              onClick={() => setSeries('weight')}
            >
              Weight
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={showFat}
              className={showFat ? 'active' : ''}
              onClick={() => setSeries('fat')}
            >
              Body fat
            </button>
          </div>
        )}
      </div>
      <LandscapeChartFrame title={showFat ? 'Body fat trend' : 'Bodyweight trend'} controls={null}>
        {(expanded) =>
          showFat ? (
            <TrendChart
              points={fatPoints}
              label="Body fat percentage"
              seriesLabel="Body fat"
              unit="%"
              height={200}
              fillHeight={expanded}
            />
          ) : (
            <TrendChart
              points={averagePoints}
              backgroundPoints={dailyPoints}
              label="Bodyweight, 7-day average over daily weigh-ins"
              seriesLabel="7-day average"
              unit={weightUnit}
              area={false}
              goalPath={goalPath}
              height={200}
              fillHeight={expanded}
            />
          )
        }
      </LandscapeChartFrame>
      <ul className="chart-legend" aria-label="Chart legend">
        {showFat ? (
          <li>
            <i className="legend-line" aria-hidden="true" />
            Body fat · {fatPoints.length} {fatPoints.length === 1 ? 'reading' : 'readings'}
          </li>
        ) : (
          <>
            <li>
              <i className="legend-dot" aria-hidden="true" />
              Daily weigh-in
            </li>
            <li>
              <i className="legend-line" aria-hidden="true" />
              7-day average
            </li>
            {goalPath && (
              <li>
                <i className="legend-goal" aria-hidden="true" />
                Goal
              </li>
            )}
          </>
        )}
      </ul>
    </div>
  );
}

export function CardioScreen({
  dataRevision,
  exercises,
  onDataChange,
  onOpenWorkout,
}: {
  dataRevision: string | null;
  exercises: Exercise[];
  onDataChange: () => Promise<void>;
  onOpenWorkout: (workoutId: string) => void;
}) {
  const cardioExercises = exercises.filter((exercise) => exercise.kind === 'cardio');
  const defaultExercise =
    cardioExercises.find(
      (exercise) => exercise.name.toLocaleLowerCase() === 'incline treadmill walking',
    ) ??
    cardioExercises[0] ??
    null;
  const weightUnit = useWeightUnit();
  const empty: CardioSessionInput = {
    session_date: localDate(),
    exercise_id: defaultExercise?.id ?? null,
    activity_type: defaultExercise?.name ?? '',
    duration_minutes: 30,
    calories_kcal: null,
    average_heart_rate_bpm: null,
    distance_km: null,
    average_speed_kph: null,
    incline_percent: null,
    average_power_watts: null,
    average_mets: null,
    intensity: null,
    zone: 'Zone 2',
    qualifies_zone2: true,
    notes: null,
  };
  const [overview, setOverview] = useState<CardioOverview | null>(null);
  const [draft, setDraft] = useState<CardioSessionInput>(empty);
  const [metricSession, setMetricSession] = useState<CardioSession | null>(null);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<{ message: string; warning: boolean } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'pure_cardio' | 'workout_plus_cardio'>(
    'all',
  );
  const [historyPage, setHistoryPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const cardioFormRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!editingId) return;
    const frame = window.requestAnimationFrame(() =>
      cardioFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [editingId]);
  const load = () =>
    api
      .cardioOverview()
      .then(setOverview)
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'Could not load cardio.'),
      );
  useEffect(() => {
    void load();
    const reloadPreferences = () => void load();
    window.addEventListener('training-preferences-updated', reloadPreferences);
    return () => window.removeEventListener('training-preferences-updated', reloadPreferences);
  }, [dataRevision]);
  const filteredSessions =
    overview?.sessions.filter(
      (session) =>
        historyFilter === 'all' ||
        (session.workout_context === 'workout_plus_cardio'
          ? 'workout_plus_cardio'
          : 'pure_cardio') === historyFilter,
    ) ?? [];
  const historyPageCount = Math.max(
    1,
    Math.ceil(filteredSessions.length / CARDIO_HISTORY_PAGE_SIZE),
  );
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const pagedSessions = filteredSessions.slice(
    (currentHistoryPage - 1) * CARDIO_HISTORY_PAGE_SIZE,
    currentHistoryPage * CARDIO_HISTORY_PAGE_SIZE,
  );

  useEffect(() => {
    setHistoryPage((page) => Math.min(page, historyPageCount));
  }, [historyPageCount]);
  async function importScreenshot(file: File) {
    if (scanning) return;
    setError(null);
    setScanStatus(null);
    setScanning(true);
    try {
      const scan = await api.scanCardioScreenshot(file);
      const scannedExercise = scan.activity_type
        ? cardioExercises.find(
            (exercise) =>
              exercise.name.toLocaleLowerCase() === scan.activity_type?.toLocaleLowerCase(),
          )
        : null;
      setDraft((current) => ({
        ...current,
        session_date: scan.session_date ?? current.session_date,
        exercise_id: scannedExercise?.id ?? current.exercise_id,
        activity_type: scannedExercise?.name ?? current.activity_type,
        duration_minutes: scan.duration_minutes ?? current.duration_minutes,
        calories_kcal: scan.calories_kcal,
        average_heart_rate_bpm: scan.average_heart_rate_bpm,
        distance_km: scan.distance_km,
        average_speed_kph: scan.average_speed_kph,
        incline_percent: null,
        average_power_watts: null,
        average_mets: null,
      }));
      const scanned = scan.fields_found.join(', ');
      const activityWarning =
        scan.activity_type && !scannedExercise
          ? ` ${scan.activity_type} is not in the activity list, so the current activity was kept.`
          : '';
      setScanStatus({
        message: `Scanned ${scanned}.${activityWarning}${scan.warning ? ` ${scan.warning}` : ''} Review the fields below, then add the session.`,
        warning: Boolean(scan.warning || activityWarning),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not scan that screenshot.');
    } finally {
      setScanning(false);
    }
  }
  async function save() {
    if (saving) return;
    setError(null);
    try {
      if (!editingId && !draft.exercise_id) {
        setError('Choose a cardio exercise.');
        return;
      }
      const payload = {
        ...draft,
        intensity: null,
        qualifies_zone2: draft.zone === 'Zone 2',
      };
      setSaving(true);
      if (editingId) await api.updateCardio(editingId, payload);
      else await api.createCardio(payload);
      setDraft(empty);
      setScanStatus(null);
      setEditingId(null);
      setFormOpen(false);
      await onDataChange();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save cardio.');
    } finally {
      setSaving(false);
    }
  }
  async function remove(id: string) {
    try {
      await api.deleteCardio(id);
      await onDataChange();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete cardio.');
    }
  }
  if (!overview) return <LoadingState />;
  const week = overview.current_week;
  const today = localDate();
  const historyGroups = groupCardioHistory(pagedSessions, weekStartDayFrom(week.week_start));
  const allHistoryGroups = groupCardioHistory(filteredSessions, weekStartDayFrom(week.week_start));
  return (
    <div className="cardio-screen">
      {error && <p className="inline-error">{error}</p>}
      {metricSession && (
        <CardioMetricsEditor
          key={metricSession.id}
          session={metricSession}
          onClose={() => setMetricSession(null)}
          onSave={async (metrics) => {
            await api.updateCardioMetrics(metricSession.id, metrics);
            await onDataChange();
            await load();
          }}
        />
      )}
      {!formOpen && !editingId ? (
        <div className="cardio-page-actions">
          <button
            type="button"
            className="pulse-button primary"
            onClick={() => {
              setError(null);
              setFormOpen(true);
            }}
          >
            <Icon name="plus" />
            Log session
          </button>
          <button
            type="button"
            className="pulse-button secondary"
            aria-label="Import screenshot"
            onClick={() => {
              setError(null);
              setFormOpen(true);
              requestAnimationFrame(() =>
                cardioFormRef.current
                  ?.querySelector<HTMLInputElement>('input[type="file"]')
                  ?.click(),
              );
            }}
          >
            <Icon name="camera" />
            Import screenshot
          </button>
        </div>
      ) : (
        <section className="panel cardio-form" ref={cardioFormRef}>
          <h2>{editingId ? 'Edit cardio session' : 'Log cardio session'}</h2>
          <div className="cardio-screenshot-import">
            <div className="cardio-screenshot-copy">
              <strong>Import workout screenshot</strong>
              <small>
                OCR fills the form for review. Calories always come from Active Calories; Total
                Calories are ignored.
              </small>
            </div>
            <label className={scanning ? 'disabled' : ''}>
              {scanning ? <ScanningLabel /> : 'Choose screenshot'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                disabled={scanning}
                aria-label="Upload workout screenshot"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void importScreenshot(file);
                }}
              />
            </label>
          </div>
          {scanStatus && (
            <p
              className={`cardio-scan-status${scanStatus.warning ? ' warning' : ''}`}
              role="status"
            >
              {scanStatus.message}
            </p>
          )}
          <div className="cardio-fields">
            <label>
              Date
              <input
                type="date"
                value={draft.session_date}
                onChange={(event) => setDraft({ ...draft, session_date: event.target.value })}
              />
            </label>
            <label>
              Activity
              <select
                value={draft.exercise_id ?? ''}
                disabled={cardioExercises.length === 0}
                onChange={(event) => {
                  const exercise = cardioExercises.find((item) => item.id === event.target.value);
                  setDraft({
                    ...draft,
                    exercise_id: exercise?.id ?? null,
                    activity_type: exercise?.name ?? '',
                  });
                }}
              >
                {cardioExercises.length === 0 && <option value="">No cardio exercises</option>}
                {cardioExercises.map((exercise) => (
                  <option key={exercise.id} value={exercise.id}>
                    {exercise.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Minutes
              <input
                type="number"
                min="1"
                inputMode="numeric"
                value={draft.duration_minutes}
                onChange={(event) =>
                  setDraft({ ...draft, duration_minutes: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Zone
              <select
                value={draft.zone ?? ''}
                onChange={(event) => {
                  const zone = event.target.value || null;
                  setDraft({ ...draft, zone, qualifies_zone2: zone === 'Zone 2' });
                }}
              >
                <option value="">Not set</option>
                {[1, 2, 3, 4, 5].map((zone) => (
                  <option key={zone} value={`Zone ${zone}`}>
                    Zone {zone}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Calories burned (kcal)
              <input
                type="number"
                min="0"
                max="100000"
                step="1"
                inputMode="numeric"
                value={draft.calories_kcal ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, calories_kcal: numberOrNull(event.target.value) })
                }
                placeholder="e.g. 350"
              />
            </label>
            <label>
              Average HR (bpm)
              <input
                type="number"
                min="20"
                max="250"
                step="1"
                inputMode="numeric"
                value={draft.average_heart_rate_bpm ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, average_heart_rate_bpm: numberOrNull(event.target.value) })
                }
                placeholder="e.g. 142"
              />
            </label>
            <label>
              Distance (km)
              <input
                type="number"
                min="0"
                max="10000"
                step="0.01"
                inputMode="decimal"
                value={draft.distance_km ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, distance_km: numberOrNull(event.target.value) })
                }
                placeholder="Optional"
              />
            </label>
            <label>
              Average speed (km/h)
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                inputMode="decimal"
                value={draft.average_speed_kph ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, average_speed_kph: numberOrNull(event.target.value) })
                }
                placeholder="Optional"
              />
            </label>
            <label>
              Incline (%)
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                inputMode="decimal"
                value={draft.incline_percent ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, incline_percent: numberOrNull(event.target.value) })
                }
                placeholder="Optional"
              />
            </label>
            {(draft.activity_type.toLocaleLowerCase().includes('cycl') ||
              draft.activity_type.toLocaleLowerCase().includes('bike')) && (
              <label>
                Average power (watts)
                <input
                  type="number"
                  min="1"
                  max="3000"
                  step="1"
                  inputMode="numeric"
                  value={draft.average_power_watts ?? ''}
                  onChange={(event) =>
                    setDraft({ ...draft, average_power_watts: numberOrNull(event.target.value) })
                  }
                  placeholder="Optional"
                />
              </label>
            )}
            <label>
              Average METs
              <input
                type="number"
                min="0.1"
                max="50"
                step="0.1"
                inputMode="decimal"
                value={draft.average_mets ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, average_mets: numberOrNull(event.target.value) })
                }
                placeholder="e.g. 7.5"
              />
            </label>
          </div>
          <p className="cardio-calorie-hint">
            Performance metrics are optional. For calories, prefer your watch or machine’s active
            calorie estimate. MET-minutes are calculated as average METs × session minutes.
          </p>
          <textarea
            value={draft.notes ?? ''}
            onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })}
            placeholder="Notes"
          />
          <button className="primary-action" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add cardio session'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setEditingId(null);
              setFormOpen(false);
              setDraft(empty);
              setError(null);
              setScanStatus(null);
            }}
          >
            {editingId ? 'Cancel edit' : 'Cancel'}
          </button>
        </section>
      )}
      <CardioTrendCard overview={overview} today={today} />
      <section className="pulse-card cardio-history">
        <div className="cardio-history-header">
          <h2>History</h2>
          <div
            className="segmented-control cardio-history-filters"
            role="group"
            aria-label="Filter cardio history"
          >
            {[
              ['all', 'All'],
              ['pure_cardio', 'Cardio only'],
              ['workout_plus_cardio', 'After workout'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={historyFilter === value}
                onClick={() => {
                  setHistoryFilter(value as 'all' | 'pure_cardio' | 'workout_plus_cardio');
                  setHistoryPage(1);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {filteredSessions.length === 0 && (
          <p className="cardio-history-empty">No cardio sessions match this filter.</p>
        )}
        {historyGroups.map((group) => (
          <section className="cardio-history-week" key={group.start}>
            <h3>
              Week of {prettyDate(group.start)}
              <span>
                {allHistoryGroups
                  .find((item) => item.start === group.start)!
                  .sessions.reduce((total, item) => total + item.duration_minutes, 0)}{' '}
                min
              </span>
            </h3>
            {group.sessions.map((session) => {
              const workoutContext =
                session.workout_context === 'workout_plus_cardio'
                  ? 'workout_plus_cardio'
                  : 'pure_cardio';
              const workoutName = session.source_workout_name?.replace(/\s+workout$/i, '');
              return (
                <details className="cardio-history-row" key={session.id}>
                  <summary>
                    <span className="cardio-activity-icon">
                      <Icon name="pulse" />
                    </span>
                    <span className="cardio-history-row-title">
                      <strong>{session.activity_type}</strong>
                      <small>
                        {prettyDate(session.session_date)} ·{' '}
                        {workoutContext === 'workout_plus_cardio'
                          ? 'After workout'
                          : (session.zone ?? 'Cardio only')}
                      </small>
                    </span>
                    <span className="cardio-history-row-minutes">
                      {session.duration_minutes} min
                    </span>
                    <Icon name="chevron-down" />
                  </summary>
                  <div className="cardio-history-row-content">
                    <div className="cardio-session-title-row">
                      {workoutContext === 'workout_plus_cardio' && (
                        <span className="cardio-context-badge workout-plus-cardio">
                          After workout
                        </span>
                      )}
                      {session.source_workout_id ? (
                        <button
                          type="button"
                          className="cardio-history-workout-link"
                          onClick={() => onOpenWorkout(session.source_workout_id!)}
                        >
                          <strong>{session.activity_type}</strong>
                        </button>
                      ) : (
                        <strong>{session.activity_type}</strong>
                      )}
                    </div>
                    <small className="cardio-session-date">
                      {prettyDate(session.session_date)}
                    </small>
                    <small className="cardio-session-summary">
                      {session.duration_minutes} min ·{' '}
                      {session.zone ?? session.intensity ?? 'Unspecified'}
                      {workoutName ? ` · ${workoutName}` : ''}
                    </small>
                    <small className="cardio-session-energy">
                      {session.calories_kcal == null
                        ? 'Calories not logged'
                        : `${session.calories_kcal.toLocaleString()} kcal · ≈ ${fatEnergyEquivalent(session.calories_kcal, weightUnit)} fat burnt`}
                    </small>
                    <small className="cardio-session-performance">
                      {[
                        session.average_heart_rate_bpm == null
                          ? null
                          : `${session.average_heart_rate_bpm} bpm avg`,
                        session.distance_km == null ? null : `${session.distance_km} km`,
                        session.average_speed_kph == null
                          ? null
                          : `${session.average_speed_kph} km/h avg`,
                        session.incline_percent == null
                          ? null
                          : `${session.incline_percent}% incline`,
                        session.average_power_watts == null
                          ? null
                          : `${session.average_power_watts} W avg`,
                        session.average_mets == null ? null : `${session.average_mets} METs avg`,
                        session.average_mets == null
                          ? null
                          : `${(session.average_mets * session.duration_minutes).toLocaleString(
                              undefined,
                              { maximumFractionDigits: 1 },
                            )} MET-min`,
                      ]
                        .filter((value): value is string => value !== null)
                        .join(' · ') || 'Performance metrics not logged'}
                    </small>
                  </div>
                  <div className="cardio-session-actions">
                    <button
                      type="button"
                      onClick={() => setMetricSession(session)}
                      aria-label={`Edit performance metrics for ${session.activity_type} on ${session.session_date}`}
                    >
                      {[
                        session.calories_kcal,
                        session.average_heart_rate_bpm,
                        session.distance_km,
                        session.average_speed_kph,
                        session.incline_percent,
                        session.average_power_watts,
                        session.average_mets,
                      ].some((value) => value != null)
                        ? 'Edit metrics'
                        : 'Log metrics'}
                    </button>
                    {!session.source_workout_id && (
                      <>
                        <button
                          onClick={() => {
                            setEditingId(session.id);
                            setDraft({
                              ...session,
                              exercise_id:
                                cardioExercises.find((item) => item.name === session.activity_type)
                                  ?.id ?? null,
                            });
                          }}
                        >
                          Edit
                        </button>
                        <InlineConfirmButton
                          label="Delete"
                          confirmLabel="Delete session"
                          onConfirm={() => remove(session.id)}
                        />
                      </>
                    )}
                  </div>
                </details>
              );
            })}
          </section>
        ))}
        <PaginationControls
          currentPage={currentHistoryPage}
          totalPages={historyPageCount}
          onPageChange={setHistoryPage}
          label="cardio history"
        />
      </section>
    </div>
  );
}

function HistoryScreen({
  dataRevision,
  workouts,
  categoryColors,
  measurements,
  exercises,
  onEdit,
  onResume,
  onDelete,
  personalRecords,
  onDataChange,
  initialOpenId,
  section,
  onSectionChange,
  onOpenExercise,
  onOpenWorkout,
  initialExerciseId,
  initialMovementId,
  weekStartDay,
  heatmap,
  weeklySets,
  onOpenMuscleWorkout,
  historySummary,
  olderHistory,
  activeWorkout,
  activeWorkoutDate,
  onResumeWorkout,
  onStartWorkout,
  onReplaceActiveWorkout,
  onOpenSettings,
  accountActions,
}: {
  dataRevision: string | null;
  workouts: TrackedWorkout[];
  categoryColors: WorkoutTypeColors;
  measurements: BodyMeasurement[];
  exercises: Exercise[];
  onEdit: (workout: TrackedWorkout) => void;
  onResume: (workout: TrackedWorkout) => void;
  onDelete: (workout: TrackedWorkout) => void;
  personalRecords: PersonalRecord[];
  onDataChange: () => Promise<void>;
  initialOpenId: string | null;
  section: HistorySection;
  onSectionChange: (section: HistorySection) => void;
  onOpenExercise: (exerciseId: string) => void;
  onOpenWorkout: (workoutId: string, exerciseId: string | null) => void;
  initialExerciseId: string | null;
  initialMovementId: string | null;
  weekStartDay: number;
  heatmap: DashboardData['heatmap'];
  weeklySets: DashboardData['weekly_sets'] | undefined;
  onOpenMuscleWorkout: (contribution: WeeklyMuscleContribution) => Promise<void>;
  historySummary: WorkoutHistorySummary | null;
  olderHistory: OlderHistoryProps;
  activeWorkout: boolean;
  activeWorkoutDate: string | null;
  onResumeWorkout: () => void;
  onStartWorkout: (workoutDate?: string) => void;
  onReplaceActiveWorkout: (workoutDate: string) => void;
  onOpenSettings: () => void;
  accountActions?: ReactNode;
}) {
  const weightUnit = useWeightUnit();
  const [exerciseHeader, setExerciseHeader] = useState<ExerciseDetailHeader | null>(null);
  const muscleSetGoal = useTrainingPreferences().preferences?.weekly_muscle_set_goal ?? 10;
  const { types } = useWorkoutTypes();
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [extraVisibleCount, setExtraVisibleCount] = useState(0);
  const targetIndex = initialOpenId ? workouts.findIndex((item) => item.id === initialOpenId) : -1;
  const visibleCount =
    Math.max(initialHistoryVisibleCount(workouts, weekStartDay), targetIndex + 1) +
    extraVisibleCount;
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
  const openWorkoutSummaryRef = useRef<HTMLButtonElement>(null);
  const targetExerciseRef = useRef<HTMLDivElement>(null);
  const revealWorkoutRef = useRef(initialOpenId !== null);
  const today = localDate();
  const machineFilterId = machineFilter?.photo.id ?? null;
  const machineWorkouts =
    machineHistory && machineHistory.photoId === machineFilterId ? machineHistory.workouts : null;
  const weekGroups = useMemo(
    () => groupWorkoutsByWeek(workouts.slice(0, visibleCount), weekStartDay),
    [visibleCount, weekStartDay, workouts],
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
  const { hasOlder, loadingOlder, olderError, onLoadOlder } = olderHistory;
  const moreWorkouts = visibleCount < workouts.length || hasOlder;

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

  function renderWorkoutCard(workout: TrackedWorkout) {
    return (
      <HistoryWorkoutCard
        key={workout.id}
        workout={workout}
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
        showYear={machineFilter !== null}
        onToggle={() => {
          setTargetMovementId(null);
          setTargetExerciseId(machineFilter ? machineFilter.photo.exercise_id : null);
          setOpenId((current) => (current === workout.id ? null : workout.id));
        }}
        onOpenExercise={onOpenExercise}
        onResume={() => onResume(workout)}
        onEdit={() => onEdit(workout)}
        onDelete={() => onDelete(workout)}
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
  }, [section, openId, visibleCount, targetExerciseId]);

  return (
    <section
      className={`history-screen content-page${section === 'progress' && exerciseHeader ? ' exercise-header-view' : ''}`}
    >
      {section === 'progress' && exerciseHeader ? (
        <OverlayScreenHeader
          title={exerciseHeader.exercise.name}
          subtitle={[
            exerciseHeader.exercise.muscle_group,
            exerciseHeader.exercise.equipment,
            exerciseHeader.sessionCount === null
              ? null
              : `${exerciseHeader.sessionCount} ${exerciseHeader.sessionCount === 1 ? 'session' : 'sessions'}`,
          ]
            .filter(Boolean)
            .join(' \u00b7 ')}
          onBack={exerciseHeader.onBack}
          backLabel="Back to exercises"
          actions={<ExerciseMuscleHelp exercise={exerciseHeader.exercise} />}
        />
      ) : (
        <>
          <PageHeader
            eyebrow={
              section === 'progress'
                ? 'Exercise charts · records · sessions'
                : section === 'cardio'
                  ? 'Zone 2 · energy · sessions'
                  : `${totalWorkouts} ${totalWorkouts === 1 ? 'workout' : 'workouts'} logged`
            }
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
      {visitedSections.has('progress') && (
        <CachedTabPanel active={section === 'progress'}>
          <ProgressScreen
            dataRevision={dataRevision}
            exercises={exercises}
            personalRecords={personalRecords}
            measurements={measurements}
            onOpenWorkout={(workoutId, exerciseId) => onOpenWorkout(workoutId, exerciseId)}
            embedded
            browseFirst
            onDetailChange={setExerciseHeader}
            initialExerciseId={initialExerciseId}
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
                <section className="history-week" aria-label="Workouts on this machine">
                  <header className="history-week-header">
                    <h2>On this machine</h2>
                    <span className="num">Newest first</span>
                  </header>
                  <div className="history-week-list">{machineWorkouts.map(renderWorkoutCard)}</div>
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
                      onClick={() => setMachinePickerOpen(true)}
                    >
                      <Icon name="filter" />
                      Filter by machine
                    </button>
                  )}
                </header>
                <InteractiveWorkoutCalendar
                  entries={heatmap}
                  workouts={workouts}
                  olderHistory={olderHistory}
                  categoryColors={categoryColors}
                  activeWorkout={activeWorkout}
                  activeWorkoutDate={activeWorkoutDate}
                  onResumeWorkout={onResumeWorkout}
                  onEditWorkout={onEdit}
                  onStartWorkout={onStartWorkout}
                  onReplaceActiveWorkout={onReplaceActiveWorkout}
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
              {weekGroups.map((group) => {
                const label = weekGroupLabel(group.weekStart, today, weekStartDay);
                return (
                  <section className="history-week" key={group.weekStart} aria-label={label}>
                    <header className="history-week-header">
                      <h2>{label}</h2>
                      <span className="num">
                        {group.workouts.length}{' '}
                        {group.workouts.length === 1 ? 'workout' : 'workouts'} · {group.sets} sets
                        {group.volumeKg > 0 ? ` · ${formatVolume(group.volumeKg, weightUnit)}` : ''}
                      </span>
                    </header>
                    <div className="history-week-list">{group.workouts.map(renderWorkoutCard)}</div>
                  </section>
                );
              })}
              {moreWorkouts && (
                <div className="history-show-more">
                  <button
                    type="button"
                    className="show-more-button"
                    disabled={loadingOlder}
                    onClick={() => {
                      if (visibleCount < workouts.length) {
                        setExtraVisibleCount((count) => count + HISTORY_PAGE_SIZE * 2);
                      } else onLoadOlder();
                    }}
                  >
                    {loadingOlder
                      ? 'Loading older workouts…'
                      : olderError && visibleCount >= workouts.length
                        ? 'Retry loading older workouts'
                        : `Show more · ${Math.max(totalWorkouts - Math.min(visibleCount, workouts.length), 0)} older`}
                  </button>
                  {olderError && visibleCount >= workouts.length && (
                    <p className="history-show-more-error" role="alert">
                      {olderError}
                    </p>
                  )}
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
      {!exerciseHeader && (
        <MuscleSetsCard
          weeklySets={weeklySets}
          goal={muscleSetGoal}
          onOpenWorkout={onOpenMuscleWorkout}
        />
      )}
    </section>
  );
}

/** Another member's shared workouts, grouped by week like History but read-only. */
function SharedWorkoutHistory({
  workouts,
  personalRecords,
  onFilterMachine,
  renderWorkoutAction,
  categoryColors,
  weekStartDay,
}: SharedWorkoutListProps & { categoryColors: WorkoutTypeColors; weekStartDay: number }) {
  const weightUnit = useWeightUnit();
  const [openId, setOpenId] = useState<string | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<MachinePhoto | null>(null);
  const targetExerciseRef = useRef<HTMLDivElement>(null);
  const today = localDate();
  const weekGroups = useMemo(
    () => groupWorkoutsByWeek(workouts, weekStartDay),
    [weekStartDay, workouts],
  );
  const recordCounts = useMemo(() => recordCountsByWorkout(personalRecords), [personalRecords]);

  return weekGroups.map((group) => {
    const label = weekGroupLabel(group.weekStart, today, weekStartDay);
    return (
      <section className="history-week" key={group.weekStart} aria-label={label}>
        <header className="history-week-header">
          <h2>{label}</h2>
          <span className="num">
            {group.workouts.length} {group.workouts.length === 1 ? 'workout' : 'workouts'} ·{' '}
            {group.sets} sets
            {group.volumeKg > 0 ? ` · ${formatVolume(group.volumeKg, weightUnit)}` : ''}
          </span>
        </header>
        <div className="history-week-list">
          {group.workouts.map((workout) => (
            <HistoryWorkoutCard
              key={workout.id}
              workout={workout}
              open={openId === workout.id}
              summaryRef={null}
              targetExerciseId={null}
              targetExerciseRef={targetExerciseRef}
              categoryColor={workout.workout_type?.color ?? categoryColors[workout.category]}
              records={recordCounts.get(workout.id) ?? 0}
              personalRecords={personalRecords}
              activeWorkout={false}
              expandedPhoto={expandedPhoto}
              onExpandPhoto={setExpandedPhoto}
              onFilterMachine={onFilterMachine}
              onToggle={() => setOpenId((current) => (current === workout.id ? null : workout.id))}
              reactionAction={renderWorkoutAction?.(workout)}
            />
          ))}
        </div>
      </section>
    );
  });
}

function HistoryWorkoutCard({
  detailsOnly = false,
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
  reactionAction,
}: {
  detailsOnly?: boolean;
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
  reactionAction?: ReactNode;
}) {
  const weightUnit = useWeightUnit();
  const completedWorkoutSets = workout.movements
    .flatMap((movement) => movement.sets)
    .filter((item) => item.completed);
  const workingSetCount = workingSets(workout).length;
  const totalReps = completedWorkoutSets.reduce((total, item) => total + (item.reps ?? 0), 0);
  const totalVolume = workoutVolumeKg(workout);
  const totalDistance = completedWorkoutSets.reduce(
    (total, item) => total + (item.distance_km ?? 0),
    0,
  );
  const meta = [
    showYear
      ? `${shortDate(workout.workout_date)} ${workout.workout_date.slice(0, 4)}`
      : shortDate(workout.workout_date),
    workout.duration_minutes ? formatMinutesDuration(workout.duration_minutes) : null,
    workingSetCount ? `${workingSetCount} sets` : null,
  ].filter(Boolean);

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
          </span>
          <span className="history-card-metric num">
            {totalVolume > 0
              ? formatVolume(totalVolume, weightUnit)
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
      {reactionAction && <div className="history-card-social">{reactionAction}</div>}
      {open && (
        <div className="history-detail">
          {!detailsOnly && (
            <div className="history-workout-stats" aria-label="Workout totals">
              {workout.start_time && workout.end_time && (
                <span>
                  <small>When</small>
                  <strong>{formatWorkoutTimeRange(workout.start_time, workout.end_time)}</strong>
                </span>
              )}
              <span>
                <small>Time</small>
                <strong>{formatMinutesDuration(workout.duration_minutes)}</strong>
              </span>
              <span>
                <small>Sets</small>
                <strong>{completedWorkoutSets.length}</strong>
              </span>
              <span>
                <small>Reps</small>
                <strong>{totalReps || '–'}</strong>
              </span>
              <span>
                <small>Volume</small>
                <strong>{totalVolume ? formatWeight(totalVolume, weightUnit, 0) : '–'}</strong>
              </span>
            </div>
          )}
          {workout.movements.map((movement) => {
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
                  {best && <span className="num">Top {setLabel(best, weightUnit)}</span>}
                </div>
                {movement.machine_photos.length > 0 && (
                  <>
                    <div className="history-machine-photos">
                      {movement.machine_photos.map((photo) => (
                        <button
                          type="button"
                          key={photo.id}
                          onClick={() =>
                            onExpandPhoto(expandedPhoto?.id === photo.id ? null : photo)
                          }
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
                <HistorySetFlow
                  sets={movement.sets.filter((item) => item.completed)}
                  personalRecords={personalRecords}
                />
                {movement.sets
                  .filter((item) => item.notes)
                  .map((item) => (
                    <small key={item.id}>
                      Set {item.order_index + 1}: {item.notes}
                    </small>
                  ))}
                {movement.notes && <MovementNotes notes={movement.notes} />}
              </div>
            );
          })}
          {!detailsOnly && workout.notes && (
            <p className="history-workout-notes">{workout.notes}</p>
          )}
          {onResume && onEdit && onDelete && (
            <div className="workout-actions">
              {!activeWorkout && (
                <button className="resume-workout-button" type="button" onClick={onResume}>
                  Resume from now
                </button>
              )}
              <button type="button" onClick={onEdit}>
                Edit
              </button>
              <InlineConfirmButton
                className="delete-workout"
                label="Delete"
                confirmLabel="Confirm delete"
                onConfirm={onDelete}
              />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function HistorySetFlow({
  sets,
  personalRecords,
}: {
  sets: TrackedSet[];
  personalRecords: PersonalRecord[];
}) {
  const weightUnit = useWeightUnit();
  return (
    <div className="history-set-flow">
      {sets.map((item, index) => (
        <Fragment key={item.id}>
          <div className={`history-set-pill ${item.failed ? 'failed-set' : ''}`}>
            <b>Set {item.order_index + 1}</b>
            <span>{setResult(item, weightUnit)}</span>
            {item.rpe !== null && <small>RPE {item.rpe}</small>}
            <em>
              {item.set_type === 'warmup'
                ? 'Warm-up'
                : item.set_type === 'drop'
                  ? 'Drop'
                  : item.failed
                    ? 'Failed'
                    : ''}
            </em>
            {personalRecords.some((record) => record.set_id === item.id) && (
              <strong className="pr-badge">PR</strong>
            )}
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

function setResult(item: TrackedSet, weightUnit: WeightUnit): string {
  if (item.weight_kg !== null)
    return `${formatWeight(item.weight_kg, weightUnit)} × ${item.reps ?? '–'}`;
  const cardioValues = [
    item.duration_seconds ? formatDuration(item.duration_seconds) : null,
    item.distance_km !== null ? `${item.distance_km} km` : null,
    item.incline_percent !== null ? `${item.incline_percent}% incline` : null,
    item.speed_kph !== null ? `${item.speed_kph} km/h` : null,
  ].filter((value): value is string => value !== null);
  if (cardioValues.length) return cardioValues.join(' · ');
  return `${item.reps ?? '–'} reps`;
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
