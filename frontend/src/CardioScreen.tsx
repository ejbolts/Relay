import { useTips } from './Tips';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { useWeightUnit } from './trainingPreferencesContext';
import type { CardioOverview, CardioSession, CardioSessionInput, Exercise } from './types';
import { InlineConfirmButton } from './InlineConfirmButton';
import { CardioTrendCard } from './CardioTrendCard';
import { groupCardioHistory, sessionElevation, sessionMets } from './cardioTrend';
import { CardioMetricsEditor } from './CardioMetricsEditor';
import { CardioZoneSettings } from './CardioZoneSettings';
import { DEFAULT_CARDIO_PREFERENCES } from './cardioZones';
import { fatEnergyEquivalent } from './cardioEnergy';
import { PaginationControls } from './PaginationControls';
import { Icon } from './Icon';
import { WorkoutShareCard } from './WorkoutShareCard';
import { useWorkoutShareReminder } from './useWorkoutShareReminder';
import { useToast } from './Toast';
import { cardioWorkoutForSharing } from './workoutCard';
import { weekStartDayFrom } from './trainingSummary';
import { localDate } from './utils';
import { numberOrNull, prettyDate } from './appShared';
import { LoadingState } from './LoadingState';

/** History pages hold whole weeks, so a week's sessions are never split across pages. */
const CARDIO_HISTORY_WEEKS_PER_PAGE = 3;

/** A history value, marked with ≈ when it was calculated rather than logged. */
function estimatedMetric(value: number | null, estimated: boolean, unit: string) {
  if (value === null) return null;
  // Non-breaking spaces keep the sign, number and unit on one line.
  const amount = value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return `${estimated ? '≈\u00A0' : ''}${amount}\u00A0${unit}`;
}

function ScanningLabel() {
  return (
    <span className="scanning-label">
      <span className="scanning-spinner" aria-hidden="true" />
      Scanning
    </span>
  );
}

export function CardioScreen({
  dataRevision,
  exercises,
  onDataChange,
  onOpenWorkout,
  onEditWorkout = onOpenWorkout,
}: {
  dataRevision: string | null;
  exercises: Exercise[];
  onDataChange: () => Promise<void>;
  onOpenWorkout: (workoutId: string) => void;
  /** Opens the workout a session was logged in, in the workout editor. */
  onEditWorkout?: (workoutId: string) => void;
}) {
  const tips = useTips();
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
    elevation_gain_m: null,
    intensity: null,
    zone: null,
    qualifies_zone2: false,
    notes: null,
  };
  const [overview, setOverview] = useState<CardioOverview | null>(null);
  const [zoneSettingsOpen, setZoneSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<CardioSessionInput>(empty);
  const [metricSession, setMetricSession] = useState<CardioSession | null>(null);
  const [cardioSharing, setCardioSharing] = useState<CardioSession | null>(null);
  const [shareReminder] = useWorkoutShareReminder();
  const toast = useToast();
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
  const historyRef = useRef<HTMLElement>(null);
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
  const allHistoryGroups = groupCardioHistory(
    filteredSessions,
    weekStartDayFrom(overview?.current_week.week_start),
  );
  const historyPageCount = Math.max(
    1,
    Math.ceil(allHistoryGroups.length / CARDIO_HISTORY_WEEKS_PER_PAGE),
  );
  const currentHistoryPage = Math.min(historyPage, historyPageCount);
  const historyGroups = allHistoryGroups.slice(
    (currentHistoryPage - 1) * CARDIO_HISTORY_WEEKS_PER_PAGE,
    currentHistoryPage * CARDIO_HISTORY_WEEKS_PER_PAGE,
  );
  // Sessions per workout: deleting a session deletes its workout only when that is all it holds.
  const sessionsPerWorkout = new Map<string, number>();
  for (const session of overview?.sessions ?? []) {
    if (session.source_workout_id)
      sessionsPerWorkout.set(
        session.source_workout_id,
        (sessionsPerWorkout.get(session.source_workout_id) ?? 0) + 1,
      );
  }

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
      tips.learn('cardio');
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
        elevation_gain_m: scan.elevation_gain_m ?? null,
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
        zone: null,
        qualifies_zone2: false,
      };
      setSaving(true);
      if (editingId) {
        await api.updateCardio(editingId, payload);
        toast.show('Cardio saved');
      } else {
        const saved = await api.createCardio(payload);
        if (!scanStatus) tips.event('manual-cardio', 'cardio', 2);
        toast.show(
          shareReminder
            ? {
                message: 'Workout saved',
                action: {
                  label: 'Share card',
                  run: () => {
                    toast.dismiss();
                    setCardioSharing(saved);
                  },
                },
              }
            : 'Cardio saved',
        );
      }
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
  async function remove(session: CardioSession) {
    try {
      // A session logged on its own is saved as a cardio-only workout; deleting it deletes that.
      if (session.source_workout_id) await api.deleteWorkout(session.source_workout_id);
      else await api.deleteCardio(session.id);
      await onDataChange();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete cardio.');
    }
  }
  if (!overview) return <LoadingState />;
  const week = overview.current_week;
  const today = localDate();
  const zonesSet = Boolean(overview.cardio_preferences?.heart_rate_zones.length);
  return (
    <div className="cardio-screen">
      {cardioSharing && (
        <WorkoutShareCard
          workout={cardioWorkoutForSharing(cardioSharing)}
          records={0}
          onClose={() => setCardioSharing(null)}
        />
      )}
      {zoneSettingsOpen && (
        <CardioZoneSettings
          preferences={overview.cardio_preferences ?? DEFAULT_CARDIO_PREFERENCES}
          onClose={() => setZoneSettingsOpen(false)}
          onSaved={async () => {
            await onDataChange();
            await load();
          }}
        />
      )}
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
              Elevation gain (m)
              <input
                type="number"
                min="0"
                max="30000"
                step="0.1"
                inputMode="decimal"
                value={draft.elevation_gain_m ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, elevation_gain_m: numberOrNull(event.target.value) })
                }
                placeholder="Auto from incline"
              />
            </label>
            <label>
              Average MET
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
                placeholder="Auto"
              />
            </label>
          </div>
          <p className="cardio-calorie-hint">
            Performance metrics are optional. For calories, prefer your watch or machine’s active
            calorie estimate.
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
            className="pulse-button secondary cardio-form-cancel"
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
      <section className="pulse-card cardio-history" ref={historyRef}>
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
              ['workout_plus_cardio', 'With workout'],
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
                {group.sessions.reduce((total, item) => total + item.duration_minutes, 0)} min
              </span>
            </h3>
            {group.sessions.map((session, index) => {
              const workoutContext =
                session.workout_context === 'workout_plus_cardio'
                  ? 'workout_plus_cardio'
                  : 'pure_cardio';
              const workoutName = session.source_workout_name?.replace(/\s+workout$/i, '');
              const linked = session.source_workout_id;
              // A session inside a strength workout, or sharing one, is removed in that workout.
              const deletable =
                !linked ||
                (workoutContext === 'pure_cardio' && sessionsPerWorkout.get(linked) === 1);
              return (
                <details
                  className={`cardio-history-row${index > 0 && group.sessions[index - 1].session_date !== session.session_date ? ' cardio-history-new-day' : ''}`}
                  key={session.id}
                >
                  <summary>
                    <span className="cardio-activity-icon">
                      <Icon name="pulse" />
                    </span>
                    <span className="cardio-history-row-title">
                      <strong>{session.activity_type}</strong>
                      <small>
                        {prettyDate(session.session_date)} ·{' '}
                        {workoutContext === 'workout_plus_cardio'
                          ? `With ${workoutName ?? 'workout'}`
                          : (session.zone ?? 'Cardio only')}
                      </small>
                    </span>
                    <span className="cardio-history-row-minutes">
                      {session.duration_minutes} min
                    </span>
                    <Icon name="chevron-down" />
                  </summary>
                  <div className="cardio-history-row-content">
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
                        estimatedMetric(
                          sessionElevation(session),
                          session.elevation_gain_m == null,
                          'm elevation',
                        ),
                        estimatedMetric(
                          sessionMets(session),
                          session.average_mets == null,
                          'MET avg',
                        ),
                      ]
                        .filter((value): value is string => value !== null)
                        .join(' · ') || 'Performance metrics not logged'}
                    </small>
                  </div>
                  <div className="cardio-session-actions">
                    <button
                      type="button"
                      className="pulse-button secondary small"
                      onClick={() => setCardioSharing(session)}
                    >
                      Share card
                    </button>
                    <button
                      type="button"
                      className="pulse-button secondary small"
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
                        session.elevation_gain_m,
                      ].some((value) => value != null)
                        ? 'Edit metrics'
                        : 'Log metrics'}
                    </button>
                    <button
                      type="button"
                      className="pulse-button secondary small"
                      aria-label={
                        linked
                          ? `Edit ${session.activity_type} on ${session.session_date} in its workout`
                          : undefined
                      }
                      onClick={() => {
                        if (linked) {
                          onEditWorkout(linked);
                          return;
                        }
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
                    {deletable && (
                      <InlineConfirmButton
                        className="pulse-button danger-soft small"
                        label="Delete"
                        confirmLabel="Delete session"
                        onConfirm={() => remove(session)}
                      />
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
          scrollTarget={historyRef}
        />
      </section>
      <section className="pulse-card cardio-goals-summary" aria-labelledby="cardio-goals-title">
        <header>
          <h2 id="cardio-goals-title">Weekly zone goals</h2>
          <button
            type="button"
            className="pulse-button link small cardio-goals-edit"
            aria-label={zonesSet ? 'Edit heart-rate zones and goals' : 'Set heart-rate zones'}
            onClick={() => setZoneSettingsOpen(true)}
          >
            {zonesSet ? 'Edit' : 'Set zones'}
          </button>
        </header>
        <ul className="cardio-goal-list">
          {(overview.goal_weeks ?? [{ zone: 2, ...week }]).map((goal) => {
            const range = overview.cardio_preferences?.heart_rate_zones.find(
              (item) => item.zone === goal.zone,
            );
            return (
              <li key={goal.zone} className={goal.complete ? 'complete' : undefined}>
                <span>
                  <strong>Zone {goal.zone}</strong>
                  {range && (
                    <small>
                      {range.min_bpm}–{range.max_bpm} bpm
                    </small>
                  )}
                </span>
                {zonesSet ? (
                  <span>
                    <b>
                      {goal.completed_minutes} / {goal.goal_minutes} min
                    </b>
                    <small>
                      {goal.complete ? 'Goal reached' : `${goal.remaining_minutes} min to go`}
                    </small>
                  </span>
                ) : (
                  // Sessions get a zone from heart-rate ranges, so progress waits for them.
                  <span>
                    <b>– / {goal.goal_minutes} min</b>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
