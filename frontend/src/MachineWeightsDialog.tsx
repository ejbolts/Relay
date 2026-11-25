import { useEffect, useId, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { api } from './api';
import { GuideCoach, type CoachStep } from './GuideCoach';
import { HelpPopup } from './HelpPopup';
import {
  FACTOR_RANGE,
  clampFactor,
  recentSessionCounts,
  recommendedReferenceId,
  pairFactor,
  progressViewPoints,
  suggestFactors,
  withReference,
} from './machineWeights';
import {
  BLANK_PAIR as BLANK,
  baseWeight,
  inLikelyRange,
  liveMapping,
  machineWeightsLayout,
  pairForFactor,
  pairTexts,
  pairWithMachineWeight,
  parsedMapping,
  sessionCount,
  sliderPosition,
  suggestionLabel,
  toggledNormalise,
  withSuggestions,
  type PairText,
} from './machineWeightsForm';
import { PopupDialog } from './PopupDialog';
import { PreviewDrawer } from './PreviewDrawer';
import {
  normaliseCoachSteps,
  normaliseFirstStep,
  normaliseStepAfterToggle,
  type CoachTarget,
} from './setupGuideCoach';
import { exitGuide, finishGuide, useActiveGuide } from './setupGuides';
import { TrendChart, type TrendPoint } from './PulseCharts';
import type { ExerciseProgress, MachineWeight, WeightMapping } from './types';
import { weightFromKg, type WeightUnit } from './weightUnits';
import { localDate } from './utils';
import './machineWeights.css';

function MachineThumb({ machine }: { machine: MachineWeight }) {
  return <img className="machine-weights-thumb" src={machine.thumbnail_url} alt="" />;
}

interface MachineWeightsDialogProps {
  exerciseId: string;
  exerciseName: string;
  mapping: WeightMapping;
  progress: ExerciseProgress;
  weightUnit: WeightUnit;
  onClose: () => void;
  onSaved: (mapping: WeightMapping) => void;
}

/** The dialog's controls each step of the machine weights guide is about. */
const NORMALISE_COACH_TARGETS: Partial<Record<CoachTarget, string>> = {
  'normalise.switch': '.machine-weights-toggle [role="switch"]',
  'normalise.reference': '.machine-weights-list li.is-reference',
  'normalise.match': '.machine-weights-list li.is-spoke',
  'normalise.save': '.machine-weights-save',
};

/**
 * Choose a reference machine and how each other machine's weights compare with it. Suggestions
 * need the exercise's whole history, so when `progress` covers only part of it (Progress
 * filtered to a training block) the dialog loads the rest before it opens.
 */
export function MachineWeightsDialog({
  partialHistory = false,
  ...props
}: MachineWeightsDialogProps & { partialHistory?: boolean }) {
  const { exerciseId, progress } = props;
  const [history, setHistory] = useState<ExerciseProgress | null>(null);
  useEffect(() => {
    if (!partialHistory) return;
    let cancelled = false;
    void api
      .exerciseProgress(exerciseId)
      .then((next) => !cancelled && setHistory(next))
      // Offline: the filtered sessions still give suggestions.
      .catch(() => !cancelled && setHistory(progress));
    return () => {
      cancelled = true;
    };
  }, [partialHistory, exerciseId, progress]);
  const full = partialHistory ? (history?.exercise.id === exerciseId ? history : null) : progress;
  return full ? <MachineWeightsEditor {...props} progress={full} /> : null;
}

function MachineWeightsEditor({
  exerciseId,
  exerciseName,
  mapping,
  progress,
  weightUnit,
  onClose,
  onSaved,
}: MachineWeightsDialogProps) {
  const formId = useId();
  const [draft, setDraft] = useState(mapping);
  const [texts, setTexts] = useState(() => {
    const initial = pairTexts(mapping, weightUnit);
    return mapping.enabled ? withSuggestions(initial, mapping, progress, weightUnit) : initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const guide = useActiveGuide('normalise');
  const [guideStep, setGuideStep] = useState(() => normaliseFirstStep(mapping.enabled));
  const { reference, tree, ordered } = machineWeightsLayout(draft);
  const recent = useMemo(() => recentSessionCounts(progress, localDate()), [progress]);
  const recommendedId = recommendedReferenceId(draft, recent);
  const suggestions = useMemo(
    () => suggestFactors(progress, draft.reference_machine_id),
    [progress, draft.reference_machine_id],
  );

  /** Typed pairs as entered so far; an unfinished pair leaves that machine unconverted. */
  const live = useMemo<WeightMapping>(
    () => liveMapping(draft, texts, weightUnit),
    [draft, texts, weightUnit],
  );
  const showPreview = tree && progress.points.length > 1;
  const previewPoints = useMemo<TrendPoint[]>(
    () =>
      showPreview
        ? progressViewPoints(progress, live, 'all').map((point) => ({
            date: point.workout_date,
            value: weightFromKg(point.estimated_1rm, weightUnit),
            id: point.workout_id,
          }))
        : [],
    [showPreview, progress, live, weightUnit],
  );
  const loggedPoints = useMemo<TrendPoint[]>(
    () =>
      showPreview
        ? progress.points.map((point) => ({
            date: point.workout_date,
            value: weightFromKg(point.estimated_1rm, weightUnit),
          }))
        : [],
    [showPreview, progress, weightUnit],
  );

  /** The draft with each machine's typed pair, or null after marking invalid pairs. */
  function parsedDraft(): WeightMapping | null {
    const { mapping: parsed, errors: nextErrors } = parsedMapping(draft, texts, weightUnit);
    setErrors(nextErrors);
    return parsed;
  }

  function setPair(machineId: string, text: PairText) {
    setTexts((current) => ({ ...current, [machineId]: text }));
    setErrors((current) => {
      const next = { ...current };
      delete next[machineId];
      return next;
    });
  }

  /** Your weight on the machine changes; the conversion, and so the trend, stays. */
  function setMachineWeight(machineId: string, text: PairText, value: string) {
    setPair(machineId, pairWithMachineWeight(text, value));
  }

  function chooseReference(machineId: string) {
    const current = parsedDraft();
    if (!current) return;
    const next = withReference(current, machineId);
    setDraft(next);
    setTexts(withSuggestions(pairTexts(next, weightUnit), next, progress, weightUnit));
  }

  function toggle() {
    const next = toggledNormalise(draft, recommendedId);
    setDraft(next);
    // Turning the switch on is the guide's first step; switching it off again returns there.
    if (guide) setGuideStep((step) => normaliseStepAfterToggle(step, next.enabled));
    if (next.enabled) {
      setTexts((current) => withSuggestions(current, next, progress, weightUnit));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = parsedDraft();
    if (!next || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await api.saveWeightMapping(exerciseId, next);
      if (saved.enabled) finishGuide('normalise');
      onSaved(saved);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save machine weights.');
      setSaving(false);
    }
  }

  const close = () => {
    exitGuide('normalise');
    onClose();
  };
  const coachSteps: CoachStep[] = normaliseCoachSteps({
    exerciseName,
    enabled: draft.enabled,
    referenceId: draft.reference_machine_id,
    machines: live.machines,
    suggested: (machineId) => suggestions.has(machineId),
  }).map(({ target, next, ...copy }, index) => ({
    ...copy,
    target: NORMALISE_COACH_TARGETS[target],
    next: next && { disabled: next.disabled, onClick: () => setGuideStep(index + 1) },
  }));

  return (
    <PopupDialog
      title="Machine weights"
      kicker={exerciseName}
      className="machine-weights-dialog"
      headerActions={
        <button
          type="submit"
          form={formId}
          className="overlay-header-save machine-weights-save"
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      }
      onClose={close}
    >
      <form id={formId} className="machine-weights-form" onSubmit={(event) => void submit(event)}>
        <div className="notification-setting-row machine-weights-toggle">
          <div className="machine-weights-toggle-label">
            <strong>Normalise weights</strong>
            <HelpPopup title="Normalise weights">
              <p>
                All machines in Progress shows every session in the reference machine’s weights.
                Each arrow shows what your weight on a machine equals on the reference. Drag the
                slider, or change either weight, and watch the preview.
              </p>
              <p>
                Suggested matches compare the est. 1RM from each session’s weight and reps with the
                reference machine’s trend around that date. A machine with too few sessions near the
                reference’s gets an estimate instead, with a wider likely range.
              </p>
              <p>
                Sessions without a machine count as the reference. Logged sets and History keep the
                weights you entered.
              </p>
            </HelpPopup>
          </div>
          <button
            type="button"
            role="switch"
            aria-label="Normalise weights"
            aria-checked={draft.enabled}
            className={draft.enabled ? 'is-on' : ''}
            onClick={toggle}
          >
            <span />
            {draft.enabled ? 'On' : 'Off'}
          </button>
        </div>
        {showPreview && reference && (
          <PreviewDrawer
            label="Preview"
            handle={
              <span className="machine-weights-preview-key">
                <span className="is-line" aria-hidden="true" />
                All machines ≈
                <span className="is-dot" aria-hidden="true" />
                As logged
              </span>
            }
          >
            <TrendChart
              points={previewPoints}
              backgroundPoints={loggedPoints}
              label={`${exerciseName} est. 1RM in ${reference.caption} weights`}
              seriesLabel="All machines ≈"
              unit={weightUnit}
              area={false}
              height={130}
            />
          </PreviewDrawer>
        )}
        <ul className={tree ? 'machine-weights-list is-tree' : 'machine-weights-list'}>
          {ordered.map((machine) => {
            const isReference = tree && machine.id === draft.reference_machine_id;
            const text = texts[machine.id] ?? BLANK;
            const liveMachine = live.machines.find((item) => item.id === machine.id)!;
            const factor = pairFactor(liveMachine);
            const suggestion = suggestions.get(machine.id);
            const errorId = `${formId}-${machine.id}-error`;
            const base = baseWeight(progress, machine.id, weightUnit);
            return (
              <li
                key={machine.id}
                className={isReference ? 'is-reference' : tree ? 'is-spoke' : undefined}
              >
                {tree && !isReference && (
                  <>
                    <span className="machine-weights-arrow" aria-hidden="true" />
                    <span className="machine-weights-ratio" aria-hidden="true">
                      ×{factor.toFixed(2)}
                    </span>
                  </>
                )}
                <div className="machine-weights-machine">
                  <img src={machine.thumbnail_url} alt="" loading="lazy" />
                  <span>
                    {isReference && <em className="machine-weights-reference">★ Reference</em>}
                    <strong>{machine.caption}</strong>
                    <small>
                      {machine.workout_count} {machine.workout_count === 1 ? 'workout' : 'workouts'}{' '}
                      · {recent.get(machine.id) ?? 0} in 3 months
                    </small>
                    {tree && !isReference && machine.id === recommendedId && (
                      <em className="machine-weights-recommended">Recommended reference</em>
                    )}
                    {tree && !isReference && (
                      <button
                        type="button"
                        className="text-link"
                        aria-label={`Make ${machine.caption} the reference`}
                        onClick={() => chooseReference(machine.id)}
                      >
                        Make reference
                      </button>
                    )}
                  </span>
                </div>
                {tree && reference && !isReference && (
                  <div className="machine-weights-pair">
                    <div className="machine-weights-equation">
                      <div className="machine-weights-side">
                        <label className="machine-weights-plate">
                          <MachineThumb machine={machine} />
                          <input
                            inputMode="decimal"
                            value={text.machine}
                            aria-label={`Weight on ${machine.caption}`}
                            aria-invalid={Boolean(errors[machine.id])}
                            aria-describedby={errors[machine.id] ? errorId : undefined}
                            onChange={(event) =>
                              setMachineWeight(machine.id, text, event.target.value)
                            }
                          />
                          <span>{weightUnit}</span>
                        </label>
                        <span className="machine-weights-side-name">
                          <small>This machine</small>
                          <span>{machine.caption}</span>
                        </span>
                      </div>
                      <span className="machine-weights-equals" aria-hidden="true">
                        =
                      </span>
                      <div className="machine-weights-side is-reference">
                        <label className="machine-weights-plate is-reference">
                          <MachineThumb machine={reference} />
                          <input
                            inputMode="decimal"
                            value={text.reference}
                            aria-label={`Matching weight on ${reference.caption} for ${machine.caption}`}
                            aria-invalid={Boolean(errors[machine.id])}
                            aria-describedby={errors[machine.id] ? errorId : undefined}
                            onChange={(event) =>
                              setPair(machine.id, { ...text, reference: event.target.value })
                            }
                          />
                          <span>{weightUnit}</span>
                          <span className="machine-weights-star" aria-hidden="true">
                            ★
                          </span>
                        </label>
                        <span className="machine-weights-side-name">
                          <small>★ Reference</small>
                          <span>{reference.caption}</span>
                        </span>
                      </div>
                    </div>
                    <div className="machine-weights-slider">
                      <span
                        className="machine-weights-track"
                        style={{ '--fill': sliderPosition(factor) } as CSSProperties}
                      >
                        {suggestion && (
                          <>
                            <span
                              className="machine-weights-band"
                              aria-hidden="true"
                              style={
                                {
                                  '--from': sliderPosition(suggestion.low),
                                  '--to': sliderPosition(suggestion.high),
                                } as CSSProperties
                              }
                            />
                            <span
                              className="machine-weights-marker"
                              aria-hidden="true"
                              style={{ '--at': sliderPosition(suggestion.factor) } as CSSProperties}
                            />
                          </>
                        )}
                        <input
                          type="range"
                          min={FACTOR_RANGE.min}
                          max={FACTOR_RANGE.max}
                          step={FACTOR_RANGE.step}
                          value={clampFactor(factor)}
                          aria-label={`Conversion for ${machine.caption}`}
                          aria-valuetext={`times ${factor.toFixed(2)}`}
                          onChange={(event) =>
                            setPair(
                              machine.id,
                              pairForFactor(text, Number(event.target.value), base),
                            )
                          }
                        />
                      </span>
                      <b className="num">×{factor.toFixed(2)}</b>
                    </div>
                    {suggestion && (
                      <p className="machine-weights-suggestion">
                        <span className="machine-weights-suggested">
                          <span className="machine-weights-diamond" aria-hidden="true" />
                          {suggestionLabel(suggestion)} ×{suggestion.factor.toFixed(2)} ·{' '}
                          {sessionCount(suggestion.sessions)}
                          {inLikelyRange(factor, suggestion) ? (
                            <em className="machine-weights-fit is-in">In range</em>
                          ) : (
                            <em className="machine-weights-fit">Outside range</em>
                          )}
                        </span>
                        {Math.abs(factor - suggestion.factor) >= 0.005 && (
                          <button
                            type="button"
                            className="text-link"
                            aria-label={`Use ${suggestionLabel(suggestion).toLowerCase()} ×${suggestion.factor.toFixed(2)} for ${machine.caption}`}
                            onClick={() =>
                              setPair(machine.id, pairForFactor(text, suggestion.factor, base))
                            }
                          >
                            Use
                          </button>
                        )}
                      </p>
                    )}
                    {errors[machine.id] && (
                      <p id={errorId} className="machine-weights-error" role="alert">
                        {errors[machine.id]}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {saveError && (
          <p className="machine-weights-error" role="alert">
            {saveError}
          </p>
        )}
      </form>
      {guide && (
        <GuideCoach
          step={coachSteps[guideStep]}
          index={guideStep}
          total={coachSteps.length}
          onBack={guideStep > 0 ? () => setGuideStep(guideStep - 1) : undefined}
          onExit={() => exitGuide('normalise')}
        />
      )}
    </PopupDialog>
  );
}
