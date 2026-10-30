import { useEffect, useId, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { UndoBodyweightCheckIn } from './bodyweightCheckIn';
import { ConsistencyCard } from './ConsistencyCard';
import { Icon } from './Icon';
import { ProfileAvatar } from './ProfileAvatar';
import { MuscleSetsCard } from './MuscleSetsCard';
import { formatMemberSince } from './profileDisplay';
import { HomeLayoutSections } from './HomeLayoutSections';
import type { useHomeLayout } from './useHomeLayout';
import { homeSectionSettings, updateHomeSectionSettings, type HomeSectionId } from './homeLayout';
import { CardioGoalCard } from './CardioGoalCard';
import { CardioGoalCardSettingsForm } from './CardioGoalCardSettings';
import { SparkBars, Sparkline } from './PulseCharts';
import {
  averageOf,
  daysBetween,
  parseLocalDate,
  recentStrengthRecords,
  shortDate,
  trainingDayGrid,
  weekStartDayFrom,
  weeklyBodyweightAverages,
  weeklyTrainingTotals,
  type SessionTemplate,
} from './trainingSummary';
import type {
  BodyMeasurement,
  DashboardData,
  PersonalRecord,
  TrackedWorkout,
  User,
  WeeklyMuscleContribution,
  WorkoutTypeColors,
} from './types';
import { localDate } from './utils';
import { useTrainingPreferences, useWeightUnit } from './trainingPreferencesContext';
import { WeightInput } from './WeightInput';
import { useDailyCheckIns } from './useDailyCheckIns';
import { ProfileButton } from './AccountHeaderActions';
import { useUpNextSession } from './upNext';
import {
  formatWeight,
  formatWeightNumber,
  recordDisplayValue,
  weightFromKg,
  weightToKg,
  weightInputValue,
  weightUnitName,
} from './weightUnits';
import { formatElapsed, useElapsedSeconds } from './elapsed';

export function PageHeader({
  eyebrow,
  title,
  titleAction,
  actions,
  accountActions,
  onOpenSettings,
  headingLevel = 1,
}: {
  eyebrow?: string;
  title: string;
  titleAction?: ReactNode;
  actions?: ReactNode;
  accountActions?: ReactNode;
  onOpenSettings?: () => void;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        {titleAction ? (
          <div className="page-header-title-row">
            <Heading>{title}</Heading>
            {titleAction}
          </div>
        ) : (
          <Heading>{title}</Heading>
        )}
      </div>
      {(actions || accountActions || onOpenSettings) && (
        <div className="page-header-actions">
          {actions}
          {accountActions}
          {onOpenSettings && <SettingsButton onClick={onOpenSettings} />}
        </div>
      )}
    </header>
  );
}

export function SettingsButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="icon-button-pulse" type="button" onClick={onClick} aria-label="Settings">
      <Icon name="settings" />
    </button>
  );
}

function formatTotal(value: number | null | undefined): string {
  return value == null ? '–' : value.toLocaleString();
}

const RECORD_LABELS: Partial<Record<PersonalRecord['record_type'], string>> = {
  reps_at_weight: 'Volume PR',
  weight: 'Weight PR',
};

export interface TodayScreenProps {
  home: ReturnType<typeof useHomeLayout>;
  data: DashboardData | null;
  workouts: TrackedWorkout[];
  measurements: BodyMeasurement[];
  personalRecords: PersonalRecord[];
  categoryColors: WorkoutTypeColors;
  workoutStartedAt: number | null;
  workoutSaving?: boolean;
  todayBodyweight: number | null;
  todayBodyFat?: number | null;
  onSaveBodyweight: (weight: number) => Promise<UndoBodyweightCheckIn>;
  onSaveBodyFat?: (bodyFat: number) => Promise<UndoBodyweightCheckIn>;
  onStartTemplate: (template: SessionTemplate) => void;
  onStartEmpty: () => void;
  onStartRecommended?: () => void;
  onEditSplit?: () => void;
  onResumeWorkout: () => void;
  onOpenHistory: () => void;
  onOpenWorkout?: (contribution: WeeklyMuscleContribution) => void | Promise<void>;
  onOpenProgress: (exerciseId?: string) => void;
  onOpenCardio: () => void;
  onOpenBody: () => void;
  onOpenSettings: () => void;
  /** Omitted when the account cannot upload videos, which hides the video entry point. */
  onOpenVideos?: () => void;
  /** Omitted outside the signed-in app (tests). */
  onOpenProfile?: () => void;
  /** Shown on the profile button so the signed-in account is visible at a glance. */
  profileLabel?: string;
  profilePhotoUrl?: string | null;
  /** The signed-in account for the Profile section; omitted outside the signed-in app. */
  profile?: Pick<User, 'display_name' | 'username' | 'profile_photo_url' | 'created_at'>;
  /** Friend requests waiting for an answer, shown as a count on the profile button. */
  friendRequests?: number;
  notifications?: ReactNode;
  accountActions?: ReactNode;
  /** Unresolved app feedback, shown to administrators beside friend requests. */
  openFeedback?: number;
  calendar?: ReactNode;
  /** The Friends card with friends' latest sessions; omitted outside the signed-in app. */
  friendsActivity?: ReactNode;
  today?: string;
}

export function TodayScreen({
  home,
  data,
  workouts,
  measurements,
  personalRecords,
  categoryColors,
  workoutStartedAt,
  workoutSaving = false,
  todayBodyweight,
  todayBodyFat = null,
  onSaveBodyweight,
  onSaveBodyFat,
  onStartTemplate,
  onStartEmpty,
  onStartRecommended,
  onEditSplit,
  onResumeWorkout,
  onOpenHistory,
  onOpenWorkout,
  onOpenProgress,
  onOpenCardio,
  onOpenBody,
  onOpenSettings,
  onOpenVideos,
  onOpenProfile,
  profileLabel,
  profilePhotoUrl,
  profile,
  friendRequests = 0,
  notifications,
  accountActions,
  openFeedback = 0,
  calendar,
  friendsActivity,
  today = localDate(),
}: TodayScreenProps) {
  const weightUnit = useWeightUnit();
  const muscleSetGoal = useTrainingPreferences().preferences?.weekly_muscle_set_goal ?? 10;
  const weekStartDay = weekStartDayFrom(data?.weekly_sets?.week_start ?? data?.zone2?.week_start);
  const weeks = useMemo(
    () => weeklyTrainingTotals(workouts, today, weekStartDay, 12),
    [today, weekStartDay, workouts],
  );
  const grid = useMemo(
    () => trainingDayGrid(workouts, today, weekStartDay, 12),
    [today, weekStartDay, workouts],
  );
  const {
    recommendation,
    label: recommendationLabel,
    template,
    type: recommendedType,
    isRestDay,
    needsSplitUpdate,
  } = useUpNextSession(data?.recommendation, workouts, today);
  const currentWeek = weeks.at(-1);
  const history = weeks.slice(0, -1);
  const haveWorkouts = workouts.length > 0;
  const workoutsThisWeek = haveWorkouts ? (currentWeek?.workouts ?? 0) : data?.workouts_this_week;
  // Cardio sessions are mirrored from workouts' cardio movements, so no workouts means none.
  const cardioSessionsThisWeek = haveWorkouts
    ? (currentWeek?.cardioSessions ?? 0)
    : data
      ? 0
      : null;
  const averageWorkouts = averageOf(history.map((week) => week.workouts));
  const averageCardioSessions = averageOf(history.map((week) => week.cardioSessions));
  const trainingDays = grid.flat().filter((day) => day.workouts > 0).length;
  const zone2 = data?.zone2 ?? null;
  const cardioGoals = data?.cardio_goals ?? (zone2 ? [{ zone: 2, ...zone2 }] : []);
  const latest = measurements[0] ?? null;
  const recentWeights = measurements
    .slice(0, 30)
    .map((measurement) => measurement.weight_kg)
    .reverse();
  const monthAgo = latest
    ? measurements.find(
        (measurement) => daysBetween(measurement.measurement_date, latest.measurement_date) >= 28,
      )
    : null;
  const monthChange = latest && monthAgo ? latest.weight_kg - monthAgo.weight_kg : null;
  const weeklyWeights = useMemo(
    () =>
      weeklyBodyweightAverages(measurements, today, weekStartDay, 12).filter(
        (value): value is number => value !== null,
      ),
    [measurements, today, weekStartDay],
  );
  const records = recentStrengthRecords(personalRecords, 3);
  const strengthRecordCount = useMemo(
    () =>
      personalRecords.filter((record) => record.value > 0 && record.record_type in RECORD_LABELS)
        .length,
    [personalRecords],
  );
  const memberSince = profile ? formatMemberSince(profile.created_at, 'short') : null;

  const checkIns = useDailyCheckIns(onSaveBodyweight, onSaveBodyFat);
  const sections: Record<HomeSectionId, ReactNode> = {
    profile: profile ? (
      <section className="pulse-card today-profile" aria-labelledby="today-profile-title">
        {onOpenProfile ? (
          <button
            className="today-profile-photo"
            type="button"
            onClick={onOpenProfile}
            aria-label="Open profile"
          >
            <ProfileAvatar className="profile-avatar today-profile-avatar" user={profile} />
          </button>
        ) : (
          <ProfileAvatar className="profile-avatar today-profile-avatar" user={profile} />
        )}
        <div className="today-profile-body">
          <h2 id="today-profile-title">{profile.display_name.trim() || profile.username}</h2>
          <p>
            @{profile.username}
            {memberSince && ` · since ${memberSince}`}
          </p>
          <dl className="today-profile-stats">
            <div>
              <dt>
                <span className="today-profile-icon workouts" aria-hidden="true">
                  <Icon name="calendar" />
                </span>
                Workouts
              </dt>
              <dd className="num">{formatTotal(data?.history?.total_workouts)}</dd>
            </div>
            <div>
              <dt>
                <span className="today-profile-icon cardio" aria-hidden="true">
                  <Icon name="heart" />
                </span>
                Cardio
              </dt>
              <dd className="num">{formatTotal(data?.total_cardio_sessions)}</dd>
            </div>
            <div>
              <dt>
                <span className="today-profile-icon records" aria-hidden="true">
                  <Icon name="trophy" />
                </span>
                PRs
              </dt>
              <dd className="num">{formatTotal(data ? strengthRecordCount : null)}</dd>
            </div>
          </dl>
        </div>
      </section>
    ) : null,
    'next-workout':
      workoutStartedAt === null ? (
        <section className="pulse-card next-session" aria-labelledby="next-session-title">
          <div className="next-session-top">
            <p className="next-session-tag">
              {recommendation && !isRestDay && !needsSplitUpdate && (
                <i
                  className="category-dot"
                  style={{
                    background: recommendedType?.color ?? categoryColors[recommendation.category],
                  }}
                  aria-hidden="true"
                />
              )}
              {recommendation ? 'Up next' : 'Ready when you are'}
            </p>
            {onEditSplit && (
              <button className="text-button" type="button" onClick={onEditSplit}>
                Edit split
              </button>
            )}
          </div>
          <div className="next-session-head">
            <h2 id="next-session-title">
              {needsSplitUpdate
                ? 'Update your split'
                : recommendationLabel
                  ? `${recommendationLabel} day`
                  : 'Start a workout'}
            </h2>
            {recommendation?.scheduled_date && recommendation.scheduled_date > today ? (
              <small>{shortDate(recommendation.scheduled_date)}</small>
            ) : (
              template && (
                <small>
                  {recommendation?.routine_day
                    ? 'Routine'
                    : `Last: ${shortDate(template.sourceWorkout.workout_date)}`}
                </small>
              )
            )}
          </div>
          {template ? (
            <>
              <ul className="next-session-exercises">
                {template.exercises.slice(0, 6).map(({ exercise, topSet, summary }) => (
                  <li key={exercise.id}>
                    <span title={exercise.name}>{exercise.name}</span>
                    <b className="num" title={summary}>
                      {exercise.kind !== 'cardio' && topSet
                        ? `${formatWeightNumber(topSet.weight_kg ?? 0, weightUnit)}×${topSet.reps ?? '–'}`
                        : summary}
                    </b>
                  </li>
                ))}
              </ul>
              {template.exercises.length > 6 && (
                <p className="next-session-more">
                  +{template.exercises.length - 6} more from last time
                </p>
              )}
            </>
          ) : needsSplitUpdate ? (
            <p className="inline-error">{recommendation?.reason}</p>
          ) : !isRestDay && !recommendation?.split_name ? (
            <p className="next-session-meta">
              {recommendation
                ? 'No previous session of this type yet. Start empty and add exercises.'
                : 'Log your first session to get a suggested next workout.'}
            </p>
          ) : null}
          <div className="next-session-actions">
            {template ? (
              <button
                className="pulse-button primary"
                type="button"
                onClick={() =>
                  onStartRecommended ? onStartRecommended() : onStartTemplate(template)
                }
                aria-label={`Start ${recommendationLabel?.toLowerCase()} workout`}
              >
                <Icon name="play" filled />
                Start workout
              </button>
            ) : (
              <button
                className="pulse-button primary"
                type="button"
                onClick={
                  isRestDay || needsSplitUpdate
                    ? onStartEmpty
                    : (onStartRecommended ?? onStartEmpty)
                }
              >
                <Icon name="plus" />
                Start workout
              </button>
            )}
            <button
              className="pulse-button primary next-session-empty"
              type="button"
              onClick={onStartEmpty}
              aria-label="Start empty workout"
            >
              Empty
            </button>
          </div>
        </section>
      ) : null,
    workouts: (
      <button type="button" className="pulse-kpi" onClick={onOpenHistory}>
        <span>Workouts</span>
        <strong>{workoutsThisWeek ?? '–'}</strong>
        <em>
          {averageWorkouts === null ? 'This week' : `12-wk avg ${averageWorkouts.toFixed(1)}`}
        </em>
        <SparkBars
          values={weeks.map((week) => week.workouts)}
          label="Workouts per week, last 12 weeks"
        />
      </button>
    ),
    'cardio-sessions': (
      <button type="button" className="pulse-kpi" onClick={onOpenCardio} data-guide-target="cardio">
        <span>Cardio sessions</span>
        <strong>{cardioSessionsThisWeek ?? '–'}</strong>
        <em>
          {averageCardioSessions === null
            ? 'This week'
            : `12-wk avg ${averageCardioSessions.toFixed(1)}`}
        </em>
        <SparkBars
          values={weeks.map((week) => week.cardioSessions)}
          label="Cardio sessions per week, last 12 weeks"
        />
      </button>
    ),
    'weekly-bodyweight': (
      <button type="button" className="pulse-kpi" onClick={onOpenBody}>
        <span>Body weight</span>
        <strong>
          {latest ? `${weightFromKg(latest.weight_kg, weightUnit).toFixed(1)} ${weightUnit}` : '–'}
        </strong>
        <em>
          {monthChange !== null
            ? `${monthChange > 0 ? '+' : monthChange < 0 ? '−' : '±'}${weightFromKg(Math.abs(monthChange), weightUnit).toFixed(1)} ${weightUnit} / 4 wk`
            : measurements.length
              ? `${measurements.length} ${measurements.length === 1 ? 'check-in' : 'check-ins'}`
              : 'No check-ins'}
        </em>
        <Sparkline
          values={weeklyWeights}
          label="Average body weight per week, last 12 weeks"
          height={26}
        />
      </button>
    ),
    consistency: (
      <ConsistencyCard streak={data?.current_streak ?? 0} trainingDays={trainingDays}>
        {calendar}
      </ConsistencyCard>
    ),
    'muscle-sets': (
      <MuscleSetsCard
        weeklySets={data?.weekly_sets}
        goal={muscleSetGoal}
        onOpenWorkout={onOpenWorkout}
      />
    ),
    zone2: (
      <CardioGoalCard
        goals={cardioGoals}
        settings={homeSectionSettings(home.editing ? home.draft : home.layout, 'zone2')}
        daysLeft={zone2 ? Math.max(0, daysBetween(today, zone2.week_end) + 1) : null}
        onOpen={onOpenCardio}
      />
    ),
    'bodyweight-trend': (
      <button type="button" className="pulse-card pulse-mini" onClick={onOpenBody}>
        <span>Bodyweight</span>
        <strong>
          {latest ? weightFromKg(latest.weight_kg, weightUnit).toFixed(1) : '–'}
          <small> {weightUnit}</small>
        </strong>
        <Sparkline
          values={recentWeights.map((weight) => weightFromKg(weight, weightUnit))}
          label={`Bodyweight in ${weightUnitName(weightUnit)}, last 30 check-ins`}
          height={70}
          yAxis
        />
        <p className={monthChange !== null && monthChange < 0 ? 'trend-down' : ''}>
          {monthChange === null
            ? `${measurements.length} check-ins`
            : `${monthChange > 0 ? '+' : monthChange < 0 ? '−' : '±'}${weightFromKg(Math.abs(monthChange), weightUnit).toFixed(1)} ${weightUnit} in 30 days`}
        </p>
      </button>
    ),
    ...(Object.fromEntries(
      (
        [
          ['bodyweight-check-in', 'weight'],
          ['body-fat-check-in', 'fat'],
          ['combined-check-in', 'combined'],
        ] as const
      ).map(([id, mode]) => [
        id,
        <DashboardQuickBodyweight
          key={id}
          mode={mode}
          latestBodyweight={latest?.weight_kg ?? null}
          todayBodyweight={todayBodyweight}
          todayBodyFat={todayBodyFat}
          latestBodyFat={
            measurements.find((item) => item.body_fat_pct !== null)?.body_fat_pct ?? null
          }
          {...checkIns}
        />,
      ]),
    ) as Record<'bodyweight-check-in' | 'body-fat-check-in' | 'combined-check-in', ReactNode>),
    records: (
      <section className="pulse-card" aria-labelledby="records-title">
        <header className="pulse-card-header">
          <h2 id="records-title">Recent records</h2>
          <button type="button" className="text-link" onClick={() => onOpenProgress()}>
            Progress
          </button>
        </header>
        {records.length ? (
          <ul className="record-list">
            {records.map((record) => (
              <li key={record.id}>
                <button type="button" onClick={() => onOpenProgress(record.exercise_id)}>
                  <span className="record-icon" aria-hidden="true">
                    <Icon name="trophy" />
                  </span>
                  <span className="record-copy">
                    <b>{record.exercise_name ?? 'Exercise'}</b>
                    <small>
                      {RECORD_LABELS[record.record_type]}
                      {record.record_type === 'reps_at_weight' && record.weight_kg != null
                        ? ` @ ${formatWeight(record.weight_kg, weightUnit)}`
                        : ''}{' '}
                      · {shortDate(record.achieved_date)}
                    </small>
                  </span>
                  <strong className="num">{recordDisplayValue(record, weightUnit)}</strong>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pulse-empty-line">Your next strength milestone will appear here.</p>
        )}
      </section>
    ),
    friends: friendsActivity ?? null,
  };

  return (
    <section className="today-screen content-page">
      <PageHeader
        eyebrow={parseLocalDate(today).toLocaleDateString('en-GB', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
        title="Home"
        onOpenSettings={onOpenSettings}
        accountActions={
          accountActions ?? (
            <div className="account-header-actions">
              {notifications}
              {onOpenProfile && (
                <ProfileButton
                  onClick={onOpenProfile}
                  name={profileLabel}
                  photoUrl={profilePhotoUrl}
                  friendRequests={friendRequests}
                  openFeedback={openFeedback}
                />
              )}
            </div>
          )
        }
        actions={
          <>
            <button
              ref={home.editButton}
              className="icon-button-pulse"
              type="button"
              aria-label={home.editing ? 'Save Home layout' : 'Edit Home layout'}
              title={home.editing ? 'Save Home layout' : 'Edit Home layout'}
              aria-busy={home.saving}
              aria-pressed={home.editing}
              disabled={!home.loaded || (home.editing && (home.saving || home.dragging))}
              onClick={home.toggleEditing}
            >
              <Icon name="edit" />
            </button>
            {onOpenVideos && (
              <button
                className="icon-button-pulse"
                type="button"
                onClick={onOpenVideos}
                aria-label="Video logger"
                data-guide-target="videos"
              >
                <Icon name="video" />
              </button>
            )}
          </>
        }
      />

      {home.loadError && (
        <p className="inline-error" role="alert">
          Could not load your saved layout.{' '}
          <button type="button" className="text-link" onClick={home.retry}>
            Retry
          </button>
        </p>
      )}
      <p className="sr-only" role="status">
        {home.message}
      </p>
      {workoutStartedAt !== null && (
        <LiveWorkoutCard
          startedAt={workoutStartedAt}
          saving={workoutSaving}
          onResume={onResumeWorkout}
        />
      )}
      <HomeLayoutSections
        layout={home.editing ? home.draft : home.layout}
        sections={sections}
        onStartEditing={home.loaded && !home.saving ? home.edit : undefined}
        customisers={{
          zone2: (
            <CardioGoalCardSettingsForm
              goals={cardioGoals.map((goal) => ({ zone: goal.zone, minutes: goal.goal_minutes }))}
              value={homeSectionSettings(home.draft, 'zone2')}
              onChange={(change) =>
                home.change(updateHomeSectionSettings(home.draft, 'zone2', change))
              }
            />
          ),
        }}
        edit={
          home.editing
            ? {
                onChange: home.change,
                onDraggingChange: home.setDragging,
                saving: home.saving,
              }
            : undefined
        }
      />
    </section>
  );
}

function LiveWorkoutCard({
  startedAt,
  saving,
  onResume,
}: {
  startedAt: number;
  saving: boolean;
  onResume: () => void;
}) {
  const elapsed = useElapsedSeconds(startedAt);
  return (
    <button
      className="pulse-card live-workout-card"
      type="button"
      onClick={onResume}
      disabled={saving}
    >
      <span className="live-workout-label">
        <i aria-hidden="true" />
        {saving ? 'Workout finished' : 'Workout live'}
      </span>
      {!saving && (
        <time className="live-workout-duration num" dateTime={`PT${elapsed}S`}>
          {formatElapsed(elapsed)}
        </time>
      )}
      <span className="live-workout-resume">
        {saving ? 'Saving in the background…' : 'Resume'}
        {!saving && <Icon name="chevron-right" />}
      </span>
    </button>
  );
}

const BODYWEIGHT_UNDO_MS = 5000;

export function DashboardQuickBodyweight({
  mode = 'combined',
  busy = false,
  undoVersion = 0,
  undoVersionRef,
  latestBodyweight,
  todayBodyweight,
  latestBodyFat = null,
  todayBodyFat = null,
  onSave,
  onSaveBodyFat,
}: {
  mode?: 'weight' | 'fat' | 'combined';
  busy?: boolean;
  undoVersion?: number;
  undoVersionRef?: { current: number };
  latestBodyweight: number | null;
  todayBodyweight: number | null;
  latestBodyFat?: number | null;
  todayBodyFat?: number | null;
  onSave: (weight: number) => Promise<UndoBodyweightCheckIn>;
  onSaveBodyFat?: (bodyFat: number) => Promise<UndoBodyweightCheckIn>;
}) {
  const weightUnit = useWeightUnit();
  const initialWeight = todayBodyweight ?? latestBodyweight;
  const titleId = useId();
  const [weight, setWeight] = useState<number | null>(initialWeight);
  const [bodyFat, setBodyFat] = useState<string>(() => String(todayBodyFat ?? latestBodyFat ?? ''));
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<{
    run: UndoBodyweightCheckIn;
    attempt: number;
    kind: 'weight' | 'fat';
    version: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedWeight = weight;

  useEffect(() => {
    setBodyFat(String(todayBodyFat ?? latestBodyFat ?? ''));
  }, [todayBodyFat, latestBodyFat]);

  useEffect(() => {
    const nextWeight = todayBodyweight ?? latestBodyweight;
    setWeight(nextWeight);
  }, [latestBodyweight, todayBodyweight]);

  useEffect(() => {
    if (!undo || saving) return;
    const timer = window.setTimeout(() => setUndo(null), BODYWEIGHT_UNDO_MS);
    return () => window.clearTimeout(timer);
  }, [undo, saving]);

  async function save() {
    if (saving || busy) return;
    if (
      selectedWeight === null ||
      !Number.isFinite(selectedWeight) ||
      selectedWeight <= 0 ||
      selectedWeight > 500
    ) {
      setError(`Enter a bodyweight above 0 and up to ${formatWeight(500, weightUnit)}.`);
      return;
    }
    setSaving(true);
    setError(null);
    setUndo(null);
    try {
      const run = await onSave(selectedWeight);
      setUndo({ run, attempt: 0, kind: 'weight', version: undoVersionRef?.current ?? 0 });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save today’s weight.');
    } finally {
      setSaving(false);
    }
  }

  async function saveFat() {
    if (saving || busy || !onSaveBodyFat) return;
    const value = bodyFat.trim() === '' ? NaN : Number(bodyFat);
    if (!Number.isFinite(value) || value < 1 || value > 70) {
      setError('Enter body fat from 1% to 70%.');
      return;
    }
    if (todayBodyweight === null) {
      setError('Log today’s body weight before logging body fat.');
      return;
    }
    setSaving(true);
    setError(null);
    setUndo(null);
    try {
      const run = await onSaveBodyFat(value);
      setUndo({ run, attempt: 0, kind: 'fat', version: undoVersionRef?.current ?? 0 });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save today’s body fat.');
    } finally {
      setSaving(false);
    }
  }

  function nudgeFat(delta: number) {
    const current = Number(bodyFat);
    const base = bodyFat !== '' && Number.isFinite(current) ? current : (latestBodyFat ?? 0);
    setBodyFat(Math.min(70, Math.max(1, base + delta)).toFixed(1));
    setError(null);
  }

  async function undoSave() {
    if (!undo || saving) return;
    setSaving(true);
    setError(null);
    try {
      await undo.run();
      setUndo(null);
    } catch (undoError) {
      setError(undoError instanceof Error ? undoError.message : 'Could not undo the check-in.');
      setUndo((current) => current && { ...current, attempt: current.attempt + 1 });
    } finally {
      setSaving(false);
    }
  }

  function nudge(delta: number) {
    const base =
      selectedWeight !== null && Number.isFinite(selectedWeight) && selectedWeight > 0
        ? selectedWeight
        : (latestBodyweight ?? 0);
    setWeight(
      weightToKg(
        Number(Math.max(0, weightFromKg(base, weightUnit) + delta).toFixed(2)),
        weightUnit,
      ),
    );
    setError(null);
  }

  return (
    <section className="pulse-card quick-bodyweight" aria-labelledby={titleId}>
      <header className="pulse-card-header">
        <h2 id={titleId}>
          {mode === 'weight'
            ? 'Body weight check-in'
            : mode === 'fat'
              ? 'Body fat check-in'
              : 'Combined check-in'}
        </h2>
      </header>
      {(mode !== 'fat' || !onSaveBodyFat) && (
        <section className="quick-check-in-row" aria-label="Body weight check-in">
          <header className="quick-check-in-heading">
            {mode === 'combined' && <h3>Body weight</h3>}
            <span className={todayBodyweight === null ? '' : 'logged'} role="status">
              {todayBodyweight === null
                ? 'Not logged today'
                : `Saved today · ${weightFromKg(todayBodyweight, weightUnit).toFixed(1)} ${weightUnit}`}
            </span>
          </header>
          <form
            className="quick-bodyweight-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <button
              type="button"
              className="stepper"
              onClick={() => nudge(-0.1)}
              aria-label={`Decrease by 0.1 ${weightUnit}`}
              disabled={saving || busy}
            >
              −
            </button>
            <label>
              <span className="sr-only">Bodyweight in {weightUnitName(weightUnit)}</span>
              <WeightInput
                weightKg={weight}
                disabled={saving || busy}
                aria-label={`Bodyweight in ${weightUnitName(weightUnit)}`}
                style={
                  {
                    '--bw-chars': `${Math.max(weightInputValue(weight, weightUnit).length, 1)}ch`,
                  } as CSSProperties
                }
                onWeightChange={(kg) => {
                  setWeight(kg);
                  setError(null);
                }}
              />
              <b aria-hidden="true">{weightUnit}</b>
            </label>
            <button
              type="button"
              className="stepper"
              onClick={() => nudge(0.1)}
              aria-label={`Increase by 0.1 ${weightUnit}`}
              disabled={saving || busy}
            >
              +
            </button>
            <button className="pulse-button primary" type="submit" disabled={saving || busy}>
              {saving ? 'Saving…' : todayBodyweight === null ? 'Log' : 'Update'}
            </button>
          </form>
        </section>
      )}
      {onSaveBodyFat && mode !== 'weight' && (
        <section className="quick-check-in-row body-fat-check-in" aria-label="Body fat check-in">
          <header className="quick-check-in-heading">
            {mode === 'combined' && <h3>Body fat</h3>}
            <span className={todayBodyFat === null ? '' : 'logged'} role="status">
              {todayBodyFat === null
                ? 'Not logged today'
                : `Saved today · ${todayBodyFat.toFixed(1)}%`}
            </span>
          </header>
          <form
            className="quick-bodyweight-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveFat();
            }}
          >
            <button
              className="stepper"
              type="button"
              aria-label="Decrease body fat by 0.1%"
              disabled={saving || busy}
              onClick={() => nudgeFat(-0.1)}
            >
              −
            </button>
            <label>
              <span className="sr-only">Body fat percentage</span>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                max="70"
                step="0.1"
                placeholder="—"
                aria-label="Body fat percentage"
                disabled={saving || busy}
                value={bodyFat}
                style={{ '--bw-chars': `${Math.max(bodyFat.length, 1)}ch` } as CSSProperties}
                onChange={(event) => {
                  setBodyFat(event.target.value);
                  setError(null);
                }}
              />
              <b aria-hidden="true">%</b>
            </label>
            <button
              className="stepper"
              type="button"
              aria-label="Increase body fat by 0.1%"
              disabled={saving || busy}
              onClick={() => nudgeFat(0.1)}
            >
              +
            </button>
            <button
              className="pulse-button primary"
              type="submit"
              disabled={saving || busy || todayBodyweight === null}
            >
              {saving ? 'Saving…' : todayBodyFat === null ? 'Log' : 'Update'}
            </button>
          </form>
          {todayBodyweight === null && (
            <p className="quick-check-in-hint">Log today’s body weight first.</p>
          )}
        </section>
      )}
      {undo &&
        undo.version === undoVersion &&
        createPortal(
          <div
            key={undo.attempt}
            className={`undo-toast bodyweight-undo-toast${saving ? ' is-undoing' : ''}`}
            role="status"
            aria-atomic="true"
            style={{ '--undo-toast-duration': `${BODYWEIGHT_UNDO_MS}ms` } as CSSProperties}
          >
            <span>
              {saving
                ? 'Undoing check-in…'
                : undo.kind === 'fat'
                  ? 'Body fat saved'
                  : 'Body weight saved'}
            </span>
            <button
              className="undo-toast-action"
              type="button"
              disabled={saving || busy}
              onClick={() => void undoSave()}
            >
              Undo
            </button>
            <button
              className="undo-toast-close"
              type="button"
              disabled={saving || busy}
              aria-label={
                undo.kind === 'fat'
                  ? 'Dismiss body fat notification'
                  : 'Dismiss body weight notification'
              }
              onClick={() => setUndo(null)}
            >
              <Icon name="close" />
            </button>
          </div>,
          document.body,
        )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function TodaySkeleton() {
  return (
    <section
      className="today-screen content-page today-loading-skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p className="sr-only">Loading your training summary</p>
      <div className="page-header" aria-hidden="true">
        <div>
          <span className="skeleton-block skeleton-eyebrow" />
          <span className="skeleton-block skeleton-title" />
        </div>
      </div>
      <div className="pulse-card skeleton-card skeleton-card-tall" aria-hidden="true" />
      <div className="pulse-kpis" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <div className="pulse-kpi" key={item}>
            <span className="skeleton-block skeleton-label" />
            <span className="skeleton-block skeleton-value" />
          </div>
        ))}
      </div>
      <div className="pulse-card skeleton-card" aria-hidden="true" />
    </section>
  );
}
