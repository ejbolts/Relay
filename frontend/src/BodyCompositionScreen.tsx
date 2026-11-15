import { BodyWeightTip } from './FeatureDiscoveryTips';
import { BodySizesCard } from './BodySizesCard';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api } from './api';
import { useWeightUnit } from './trainingPreferencesContext';
import { WeightInput } from './WeightInput';
import { formatWeight, weightFromKg, weightInputValue } from './weightUnits';
import type { BodyMeasurement, BodyWeightGoal } from './types';
import {
  BODY_TREND_DURATION_OPTIONS,
  clipBodyWeightGoalPath,
  filterMeasurementsByRange,
  summarizeBodyWeightTrend,
} from './bodyTrend';
import type { BodyTrendDuration, BodyTrendRange, BodyTrendStatistic } from './bodyTrend';
import {
  bodyGoalKind,
  bodyGoalName,
  bodyGoalTarget,
  maintenanceRange,
  maintenanceStatus,
  bodyHistoryWithWeightChanges,
  summarizeBodyHistory,
} from './bodyMeasurementHistory';
import type { BodyGoalKind, BodyHistoryPeriod } from './bodyMeasurementHistory';
import { BodyHistoryGoalDivider, BodyHistoryWeightChange } from './BodyHistoryWeightChange';
import { GOAL_UNDO_MS, useGoalRemoval } from './useGoalRemoval';
import { DEFAULT_BODY_TREND_PREFERENCE, type BodyTrendPreference } from './bodyTrendPreference';
import { InlineConfirmButton } from './InlineConfirmButton';
import { PopupDialog } from './PopupDialog';
import { useSlidingIndicator } from './motionHooks';
import { SwipeToDeleteSetRow } from './SwipeToDeleteSetRow';
import { PaginationControls } from './PaginationControls';
import { Icon } from './Icon';
import { TrendChart, type GoalPath, type TrendPoint } from './PulseCharts';
import { PageHeader } from './TodayScreen';
import { shortDate } from './trainingSummary';
import { localDate } from './utils';
import { dateRangeForDates, TIME_RANGE_OPTIONS } from './dateRanges';
import { HISTORY_PAGE_SIZE, RANGE_LABELS, prettyDate } from './appShared';
import { LandscapeChartFrame } from './LandscapeChartFrame';

const IMPORTED_BODYWEIGHT_NOTE = 'Imported from workout CSV.';

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
  const [goalsReady, setGoalsReady] = useState(false);
  const [measurementDate, setMeasurementDate] = useState(localDate());
  const [entryOpen, setEntryOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  const [weight, setWeight] = useState<number | null>(null);
  const [bodyFat, setBodyFat] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goals, setGoals] = useState<BodyWeightGoal[]>([]);
  const [goalRemovalError, setGoalRemovalError] = useState<string | null>(null);
  const [goalTarget, setGoalTarget] = useState<number | null>(null);
  const [goalMinimum, setGoalMinimum] = useState<number | null>(null);
  const [goalMaximum, setGoalMaximum] = useState<number | null>(null);
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
  const goalRemoval = useGoalRemoval<BodyWeightGoal>({
    remove: (id) => api.deleteBodyWeightGoal(id),
    onRemoved: () => void onDataChange(),
    onRestore: ({ goal, index }) =>
      setGoals((current) =>
        current.some((item) => item.id === goal.id)
          ? current
          : [...current.slice(0, index), goal, ...current.slice(index)],
      ),
    onFailed: setGoalRemovalError,
  });
  const pendingGoalId = goalRemoval.pendingId;
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
    setGoalsReady(false);
    void api
      .listBodyWeightGoals()
      .then((next) => {
        // A goal waiting out its Undo window stays hidden when the list reloads.
        if (!cancelled) {
          setGoals(next.filter((goal) => goal.id !== pendingGoalId()));
          setGoalsReady(true);
        }
      })
      .catch((reason) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : 'Could not load body-weight goals.');
      });
    return () => {
      cancelled = true;
    };
  }, [dataRevision, pendingGoalId]);

  /** A goal divider in body history; swipe it left to remove the goal, with Undo. */
  function renderGoalDivider(goal: BodyWeightGoal) {
    return (
      <SwipeToDeleteSetRow
        className="body-goal-swipe"
        label={`goal: ${bodyGoalName(goal, weightUnit)}`}
        onDelete={() => {
          const index = goals.findIndex((item) => item.id === goal.id);
          if (index < 0) return;
          setGoalRemovalError(null);
          setGoals((current) => current.filter((item) => item.id !== goal.id));
          goalRemoval.start(goal, index);
        }}
      >
        <BodyHistoryGoalDivider goal={goal} unit={weightUnit} />
      </SwipeToDeleteSetRow>
    );
  }

  function chooseGoalKind(kind: BodyGoalKind) {
    setGoalKind(kind);
  }

  async function saveGoal() {
    const range = maintenanceRange({
      maintenance_min_kg: goalMinimum,
      maintenance_max_kg: goalMaximum,
    });
    if (goalKind === 'maintain' && !range) {
      setError(
        `Enter a minimum and a higher maximum, both above 0 and at most ${formatWeight(500, weightUnit)}.`,
      );
      return;
    }
    if (!latest || (goalKind !== 'maintain' && !hasValidTarget) || !goalDate) {
      setError('Log a current weight, target weight, and target date first.');
      return;
    }
    const savedTarget =
      range && goalKind === 'maintain' ? (range[0] + range[1]) / 2 : targetWeight!;
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
        start_weight_kg: goalKind === 'maintain' ? savedTarget : latest.weight_kg,
        target_weight_kg: savedTarget,
        ...(goalKind === 'maintain' && range
          ? { maintenance_min_kg: range[0], maintenance_max_kg: range[1] }
          : {}),
        active: true,
      });
      setGoals((current) => [goal, ...current.map((item) => ({ ...item, active: false }))]);
      await onDataChange();
      setGoalTarget(null);
      setGoalMinimum(null);
      setGoalMaximum(null);
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
      <BodyWeightTip measurementCount={measurements.length} goals={goals} ready={goalsReady} />
      <div className="body-reference-stats" aria-label="Bodyweight summary">
        <div>
          <span>Bodyweight</span>
          <strong>{latest ? formatWeight(latest.weight_kg, weightUnit) : '–'}</strong>
        </div>
        <div>
          <span>
            {activeGoal
              ? `${new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(`${activeGoal.target_date}T12:00:00`))} goal`
              : 'Weight goal'}
          </span>
          <strong>{activeGoal ? bodyGoalTarget(activeGoal, weightUnit) : '–'}</strong>
          {activeGoal && latest && maintenanceRange(activeGoal) && (
            <small>{maintenanceStatus(activeGoal, latest.weight_kg)}</small>
          )}
        </div>
        <div>
          <span>Body fat</span>
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
            setGoalMinimum(activeGoal?.maintenance_min_kg ?? null);
            setGoalMaximum(activeGoal?.maintenance_max_kg ?? null);
            setGoalOpen(true);
            setEntryOpen(false);
          }}
        >
          {activeGoal ? 'New goal' : 'Set a goal'}
        </button>
      </div>

      <BodySizesCard dataRevision={dataRevision} />

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
                    Maintaining {bodyGoalTarget(activeGoal, weightUnit)} until{' '}
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
              {goalKind === 'maintain' ? (
                <>
                  <label>
                    Minimum ({weightUnit})
                    <WeightInput weightKg={goalMinimum} onWeightChange={setGoalMinimum} />
                  </label>
                  <label>
                    Maximum ({weightUnit})
                    <WeightInput weightKg={goalMaximum} onWeightChange={setGoalMaximum} />
                  </label>
                </>
              ) : (
                <label>
                  Target ({weightUnit})
                  <WeightInput weightKg={goalTarget} onWeightChange={setGoalTarget} />
                </label>
              )}
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
            <span>Body fat</span>
            {historyView === 'daily' && <span />}
          </div>
        )}
        {goalRemovalError && (
          <p className="inline-error" role="alert">
            {goalRemovalError}
          </p>
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
              {measurement.goal_change && renderGoalDivider(measurement.goal_change)}
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
              {summary.goal_change && renderGoalDivider(summary.goal_change)}
            </Fragment>
          ))}
        <PaginationControls
          currentPage={checkInPage}
          totalPages={checkInPageCount}
          onPageChange={setCheckInPage}
          label={`${historyView} bodyweight history`}
        />
      </section>
      {goalRemoval.pending &&
        createPortal(
          <div
            key={goalRemoval.pending.goal.id}
            className="undo-toast top-toast"
            role="status"
            aria-atomic="true"
            style={{ '--undo-toast-duration': `${GOAL_UNDO_MS}ms` } as CSSProperties}
          >
            <span>Goal removed</span>
            <button className="undo-toast-action" type="button" onClick={goalRemoval.undo}>
              Undo
            </button>
            <button
              className="undo-toast-close"
              type="button"
              aria-label="Dismiss goal notification"
              onClick={goalRemoval.dismiss}
            >
              <Icon name="close" />
            </button>
          </div>,
          document.body,
        )}
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
  // Clip only the start: a future target date extends the chart so the goal line reaches it.
  const clippedGoal = activeGoal
    ? clipBodyWeightGoalPath(activeGoal, selectedDateRange.start_date)
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
            ...(maintenanceRange(activeGoal!)
              ? {
                  minValue: weightFromKg(activeGoal!.maintenance_min_kg!, weightUnit),
                  maxValue: weightFromKg(activeGoal!.maintenance_max_kg!, weightUnit),
                }
              : {}),
            label: `Goal ${bodyGoalTarget(activeGoal!, weightUnit)}`,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      clippedGoal?.start_date,
      clippedGoal?.target_date,
      clippedGoal?.start_weight_kg,
      clippedGoal?.target_weight_kg,
      activeGoal?.maintenance_min_kg,
      activeGoal?.maintenance_max_kg,
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
