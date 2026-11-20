import { BodyWeightTip } from './FeatureDiscoveryTips';
import { BodyHistoryRowMenu } from './BodyHistoryRowMenu';
import { BodySizesCard } from './BodySizesCard';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from './api';
import { useWeightUnit } from './trainingPreferencesContext';
import { WeightInput } from './WeightInput';
import { formatWeight, weightFromKg } from './weightUnits';
import type { BodyMeasurement, BodyWeightGoal } from './types';
import { clipBodyWeightGoalPath, filterMeasurementsByRange } from './bodyTrend';
import { useRangePinchZoom } from './rangePinchZoom';
import type { BodyTrendRange } from './bodyTrend';
import {
  bodyGoalKind,
  bodyGoalName,
  bodyGoalTarget,
  maintenanceRange,
  maintenanceStatus,
  weightGoalReached,
  bodyHistoryWithWeightChanges,
  summarizeBodyHistory,
} from './bodyMeasurementHistory';
import type { BodyGoalKind, BodyHistoryPeriod } from './bodyMeasurementHistory';
import { BodyHistoryGoalDivider, BodyHistoryWeightChange } from './BodyHistoryWeightChange';
import { useGoalRemoval } from './useGoalRemoval';
import { Toast } from './Toast';
import { DEFAULT_BODY_TREND_PREFERENCE, type BodyTrendPreference } from './bodyTrendPreference';
import { PopupDialog } from './PopupDialog';
import { useSlidingIndicator } from './motionHooks';
import { SwipeToDeleteSetRow } from './SwipeToDeleteSetRow';
import { PaginationControls } from './PaginationControls';
import { Icon } from './Icon';
import { TrendChart, type GoalPath, type TrendPoint } from './PulseCharts';
import { PageHeader } from './TodayScreen';
import { dayMonth } from './trainingSummary';
import { localDate } from './utils';
import { dateRangeForDates, TIME_RANGE_OPTIONS } from './dateRanges';
import { HISTORY_PAGE_SIZE, RANGE_LABELS, prettyDate } from './appShared';
import { LandscapeChartFrame } from './LandscapeChartFrame';
import { IMPORTED_BODYWEIGHT_NOTE, WeighInDialog } from './WeighInDialog';
import './bodyScreen.css';

export function BodyCompositionScreen({
  dataRevision = null,
  measurements,
  onSave,
  onDelete,
  onDataChange,
  entryRequest = 0,
  goalRequest = 0,
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
  /** Counts requests from elsewhere to open the goal form on Maintain. */
  goalRequest?: number;
  trendPreference?: BodyTrendPreference;
  onOpenSettings?: () => void;
  accountActions?: ReactNode;
}) {
  const weightUnit = useWeightUnit();
  const [goalsReady, setGoalsReady] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);
  // The goal the dialog edits; null while it adds a new goal.
  const [editingGoal, setEditingGoal] = useState<BodyWeightGoal | null>(null);
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
  const historyPanelRef = useRef<HTMLElement>(null);
  const [historyView, setHistoryView] = useState<'daily' | BodyHistoryPeriod>('daily');
  const historyViewIndicatorRef = useSlidingIndicator<HTMLDivElement>(historyView);
  const trendStatistic = trendPreference.statistic;
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
  // Clamped here as well as stored, so a shorter history never renders an empty page first.
  const currentCheckInPage = Math.min(checkInPage, checkInPageCount);
  const pagedMeasurements = dailyHistory.slice(
    (currentCheckInPage - 1) * HISTORY_PAGE_SIZE,
    currentCheckInPage * HISTORY_PAGE_SIZE,
  );
  const pagedSummaries = historySummaries.slice(
    (currentCheckInPage - 1) * HISTORY_PAGE_SIZE,
    currentCheckInPage * HISTORY_PAGE_SIZE,
  );
  const latest = measurements[0];
  // The newest reading, which may come from an earlier check-in than the latest weigh-in.
  const latestBodyFat = measurements.find((item) => item.body_fat_pct !== null);
  const targetWeight = goalTarget;
  const hasValidTarget =
    targetWeight !== null &&
    Number.isFinite(targetWeight) &&
    targetWeight > 0 &&
    targetWeight <= 500;

  useEffect(() => {
    setCheckInPage((page) => Math.min(page, checkInPageCount));
  }, [checkInPageCount]);

  // Reaching a loss or gain goal is the moment a maintenance range becomes the next step.
  const goalReached = weightGoalReached(activeGoal, latest?.weight_kg);
  const openMaintenanceGoal = useCallback(() => {
    setError(null);
    setEditingGoal(null);
    setGoalKind('maintain');
    setGoalMinimum(null);
    setGoalMaximum(null);
    setGoalOpen(true);
    setEntryOpen(false);
  }, []);
  useEffect(() => {
    if (goalRequest > 0) openMaintenanceGoal();
  }, [goalRequest, openMaintenanceGoal]);

  useEffect(() => {
    if (entryRequest === 0) return;
    setEntryOpen(true);
    setGoalOpen(false);
  }, [entryRequest]);

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
        onDelete={() => removeGoal(goal)}
      >
        <BodyHistoryGoalDivider goal={goal} unit={weightUnit} />
      </SwipeToDeleteSetRow>
    );
  }

  /** Removes a goal at once, with Undo in a popup until the delete is sent. */
  function removeGoal(goal: BodyWeightGoal) {
    const index = goals.findIndex((item) => item.id === goal.id);
    if (index < 0) return;
    setGoalRemovalError(null);
    setGoals((current) => current.filter((item) => item.id !== goal.id));
    goalRemoval.start(goal, index);
  }

  function chooseGoalKind(kind: BodyGoalKind) {
    setGoalKind(kind);
  }

  /** Opens the goal dialog empty, to add a goal that replaces the active one. */
  function openNewGoal() {
    setError(null);
    if (editingGoal) {
      setEditingGoal(null);
      setGoalTarget(null);
      setGoalDate('');
    }
    setGoalKind(activeGoal ? bodyGoalKind(activeGoal) : 'loss');
    setGoalMinimum(activeGoal?.maintenance_min_kg ?? null);
    setGoalMaximum(activeGoal?.maintenance_max_kg ?? null);
    setGoalOpen(true);
    setEntryOpen(false);
  }

  /** Opens the goal dialog filled in with a goal, to change its target or date. */
  function openGoalEdit(goal: BodyWeightGoal) {
    setError(null);
    setEditingGoal(goal);
    setGoalKind(bodyGoalKind(goal));
    setGoalTarget(goal.target_weight_kg);
    setGoalMinimum(goal.maintenance_min_kg ?? null);
    setGoalMaximum(goal.maintenance_max_kg ?? null);
    setGoalDate(goal.target_date);
    setGoalOpen(true);
    setEntryOpen(false);
  }

  function closeGoal() {
    setGoalOpen(false);
    if (editingGoal) {
      // The next new goal starts empty, not with the edited goal's values.
      setEditingGoal(null);
      setGoalTarget(null);
      setGoalDate('');
    }
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
    if ((!latest && !editingGoal) || (goalKind !== 'maintain' && !hasValidTarget) || !goalDate) {
      setError('Log a current weight, target weight, and target date first.');
      return;
    }
    const savedTarget =
      range && goalKind === 'maintain' ? (range[0] + range[1]) / 2 : targetWeight!;
    // An edited goal keeps where it started; a new one starts from the latest weigh-in.
    const startWeight = editingGoal ? editingGoal.start_weight_kg : latest!.weight_kg;
    const direction = bodyGoalKind({
      start_weight_kg: startWeight,
      target_weight_kg: targetWeight!,
    });
    if (goalKind !== 'maintain' && direction !== goalKind) {
      setError(
        `For a weight-${goalKind} goal, choose a target ${goalKind === 'loss' ? 'below' : 'above'} ${editingGoal ? 'its starting' : 'your current'} ${formatWeight(startWeight, weightUnit)}.`,
      );
      return;
    }
    setSavingGoal(true);
    setError(null);
    try {
      const payload = {
        start_date: editingGoal ? editingGoal.start_date : localDate(),
        target_date: goalDate,
        start_weight_kg: goalKind === 'maintain' ? savedTarget : startWeight,
        target_weight_kg: savedTarget,
        ...(goalKind === 'maintain' && range
          ? { maintenance_min_kg: range[0], maintenance_max_kg: range[1] }
          : {}),
        active: true,
      };
      if (editingGoal) {
        const goal = await api.updateBodyWeightGoal(editingGoal.id, payload);
        setGoals((current) => current.map((item) => (item.id === goal.id ? goal : item)));
      } else {
        const goal = await api.createBodyWeightGoal(payload);
        setGoals((current) => [goal, ...current.map((item) => ({ ...item, active: false }))]);
      }
      await onDataChange();
      setEditingGoal(null);
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
        eyebrow={`${measurements.length} ${measurements.length === 1 ? 'check-in' : 'check-ins'}${latest ? ` · latest ${dayMonth(latest.measurement_date)}` : ''}`}
        title="Body"
        onOpenSettings={onOpenSettings}
        accountActions={accountActions}
      />
      <BodyWeightTip
        goalReached={goalReached}
        goals={goals}
        ready={goalsReady}
        onSetGoal={openMaintenanceGoal}
      />
      <div className="body-reference-stats" aria-label="Bodyweight summary">
        <div>
          <span>Bodyweight</span>
          <strong>{latest ? formatWeight(latest.weight_kg, weightUnit) : '–'}</strong>
        </div>
        {activeGoal ? (
          <div className="body-goal-tile">
            <button type="button" onClick={() => openGoalEdit(activeGoal)}>
              <span>
                {`${new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(`${activeGoal.target_date}T12:00:00`))} goal`}
                <Icon name="chevron-right" />
              </span>
              <strong>{bodyGoalTarget(activeGoal, weightUnit)}</strong>
            </button>
            {latest && maintenanceRange(activeGoal) && (
              <small>{maintenanceStatus(activeGoal, latest.weight_kg)}</small>
            )}
          </div>
        ) : (
          <div>
            <span>Weight goal</span>
            <strong>–</strong>
          </div>
        )}
        <div>
          <span>Body fat</span>
          <strong>{latestBodyFat ? `${latestBodyFat.body_fat_pct}%` : '–'}</strong>
          {latestBodyFat && latestBodyFat !== latest && (
            <small>
              <time dateTime={latestBodyFat.measurement_date}>
                {dayMonth(latestBodyFat.measurement_date)}
              </time>
            </small>
          )}
        </div>
      </div>

      <div className="body-reference-actions">
        <button
          className={entryOpen ? 'active' : ''}
          type="button"
          onClick={() => {
            setEntryOpen(true);
            setGoalOpen(false);
          }}
        >
          Log weigh-in
        </button>
        <button
          className={goalOpen && !editingGoal ? 'active' : ''}
          type="button"
          onClick={openNewGoal}
        >
          {activeGoal ? 'New goal' : 'Set a goal'}
        </button>
      </div>

      {measurements.length > 1 && (
        <section className="pulse-card body-trend-panel">
          <header className="pulse-card-header">
            <h2>Trend</h2>
          </header>
          <BodyTrendChart measurements={measurements} goals={goals} />
        </section>
      )}

      <BodySizesCard dataRevision={dataRevision} />

      {goalOpen && (
        <PopupDialog
          title={editingGoal ? 'Edit goal' : 'Add bodyweight goal'}
          className="body-goal-popup"
          busy={savingGoal}
          onClose={closeGoal}
          actions={
            <>
              {editingGoal && (
                <button
                  type="button"
                  className="popup-tertiary-action is-danger body-goal-remove"
                  disabled={savingGoal}
                  onClick={() => {
                    const goal = editingGoal;
                    closeGoal();
                    removeGoal(goal);
                  }}
                >
                  Remove goal
                </button>
              )}
              <button type="button" disabled={savingGoal} onClick={closeGoal}>
                Cancel
              </button>
              <button
                type="submit"
                form="body-goal-form"
                className="popup-primary-action"
                disabled={savingGoal}
              >
                {savingGoal ? 'Saving…' : editingGoal ? 'Save goal' : 'Set goal'}
              </button>
            </>
          }
        >
          <form
            id="body-goal-form"
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
            {/* An edit changes the target and date; a new direction is a new goal. */}
            {!editingGoal && (
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
            )}
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
          </form>
        </PopupDialog>
      )}

      {entryOpen && (
        <WeighInDialog
          measurements={measurements}
          onSave={onSave}
          onClose={() => setEntryOpen(false)}
        />
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

      <section className="panel body-history-panel" role="tabpanel" ref={historyPanelRef}>
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
                <BodyHistoryRowMenu
                  label={`Actions for ${prettyDate(measurement.measurement_date)}`}
                  onEdit={() => beginMeasurementEdit(measurement)}
                  onDelete={() => onDelete(measurement.id)}
                />
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
          currentPage={currentCheckInPage}
          totalPages={checkInPageCount}
          onPageChange={setCheckInPage}
          label={`${historyView} bodyweight history`}
          scrollTarget={historyPanelRef}
        />
      </section>
      {goalRemoval.pending && (
        <Toast
          id={goalRemoval.pending.goal.id}
          message="Goal removed"
          action={{ label: 'Undo', run: goalRemoval.undo }}
          dismissLabel="Dismiss goal notification"
          onDismiss={goalRemoval.dismiss}
        />
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
  const measurementDates = useMemo(
    () => measurements.map((item) => item.measurement_date),
    [measurements],
  );
  const { pinchZoom, pinching, pinchStart, selectRange } = useRangePinchZoom(
    measurementDates,
    displayRange,
    setDisplayRange,
  );
  const ordered = (
    pinching
      ? measurements.filter((item) => item.measurement_date >= pinchStart!)
      : filterMeasurementsByRange(measurements, displayRange)
  )
    .slice()
    .reverse();
  const hasBodyFat = measurements.some((item) => item.body_fat_pct !== null);
  const selectedDateRange = pinching
    ? { start_date: pinchStart }
    : dateRangeForDates(measurementDates, displayRange);
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
    [measurements, displayRange, pinchStart, weightUnit],
  );
  const dailyPoints = useMemo<TrendPoint[]>(
    () =>
      ordered.map((item) => ({
        date: item.measurement_date,
        value: weightFromKg(item.weight_kg, weightUnit),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measurements, displayRange, pinchStart, weightUnit],
  );
  const fatPoints = useMemo<TrendPoint[]>(
    () =>
      ordered
        .filter((item) => item.body_fat_pct !== null)
        .map((item) => ({ date: item.measurement_date, value: item.body_fat_pct! })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [measurements, displayRange, pinchStart, weightUnit],
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
              onClick={() => selectRange(option.value)}
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
              pinchZoom={pinchZoom}
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
              pinchZoom={pinchZoom}
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
