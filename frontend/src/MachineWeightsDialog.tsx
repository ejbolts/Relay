import { useId, useMemo, useState, type FormEvent } from 'react';
import { api } from './api';
import { HelpPopup } from './HelpPopup';
import {
  FACTOR_RANGE,
  clampFactor,
  latestWeightKg,
  recentSessionCounts,
  recommendedReferenceId,
  pairFactor,
  progressViewPoints,
  suggestFactors,
  withReference,
} from './machineWeights';
import { PopupDialog } from './PopupDialog';
import { TrendChart, type TrendPoint } from './PulseCharts';
import type { ExerciseProgress, MachineWeight, WeightMapping } from './types';
import { weightFromKg, weightInputKg, weightInputValue, type WeightUnit } from './weightUnits';
import { decimalNumberOrNull, localDate } from './utils';
import './machineWeights.css';

type PairText = { machine: string; reference: string };
type PairTexts = Record<string, PairText>;

const BLANK: PairText = { machine: '', reference: '' };

function pairTexts(mapping: WeightMapping, unit: WeightUnit): PairTexts {
  return Object.fromEntries(
    mapping.machines.map((machine) => [
      machine.id,
      {
        machine: weightInputValue(machine.machine_kg, unit),
        reference: weightInputValue(machine.reference_kg, unit),
      },
    ]),
  );
}

const trimmed = (value: number) => String(Math.round(value * 10) / 10);

/** Your latest weight on a machine in the display unit, or a round default. */
function baseWeight(progress: ExerciseProgress, machineId: string, unit: WeightUnit): number {
  const kg = latestWeightKg(progress, machineId);
  if (kg === null) return unit === 'lb' ? 100 : 50;
  return Math.round(weightFromKg(kg, unit) * 2) / 2;
}

/** A pair of typed weights for a conversion, keeping a weight already entered for the machine. */
function pairForFactor(text: PairText, factor: number, base: number): PairText {
  const typed = decimalNumberOrNull(text.machine);
  const machine = typed && typed > 0 ? typed : base;
  return { machine: trimmed(machine), reference: trimmed(machine * factor) };
}

/** The conversion a typed pair describes, or null while either weight is missing. */
function typedFactor(text: PairText): number | null {
  const machine = decimalNumberOrNull(text.machine);
  const reference = decimalNumberOrNull(text.reference);
  return machine && reference && machine > 0 && reference > 0 ? reference / machine : null;
}

/** Fill machines without a pair from their suggestions, starting from your latest weight. */
function withSuggestions(
  texts: PairTexts,
  mapping: WeightMapping,
  progress: ExerciseProgress,
  unit: WeightUnit,
): PairTexts {
  const suggestions = suggestFactors(progress, mapping.reference_machine_id);
  const next = { ...texts };
  for (const machine of mapping.machines) {
    const text = next[machine.id] ?? BLANK;
    const suggestion = suggestions.get(machine.id);
    if (suggestion && machine.id !== mapping.reference_machine_id && !text.machine.trim()) {
      next[machine.id] = pairForFactor(
        text,
        suggestion.factor,
        baseWeight(progress, machine.id, unit),
      );
    }
  }
  return next;
}

function MachineThumb({ machine }: { machine: MachineWeight }) {
  return <img className="machine-weights-thumb" src={machine.thumbnail_url} alt="" />;
}

/** Choose a reference machine and how each other machine's weights compare with it. */
export function MachineWeightsDialog({
  exerciseId,
  exerciseName,
  mapping,
  progress,
  weightUnit,
  onClose,
  onSaved,
}: {
  exerciseId: string;
  exerciseName: string;
  mapping: WeightMapping;
  progress: ExerciseProgress;
  weightUnit: WeightUnit;
  onClose: () => void;
  onSaved: (mapping: WeightMapping) => void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState(mapping);
  const [texts, setTexts] = useState(() => {
    const initial = pairTexts(mapping, weightUnit);
    return mapping.enabled ? withSuggestions(initial, mapping, progress, weightUnit) : initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reference = draft.machines.find((machine) => machine.id === draft.reference_machine_id);
  const recent = useMemo(() => recentSessionCounts(progress, localDate()), [progress]);
  const recommendedId = recommendedReferenceId(draft, recent);
  const suggestions = useMemo(
    () => suggestFactors(progress, draft.reference_machine_id),
    [progress, draft.reference_machine_id],
  );
  const tree = draft.enabled && reference !== undefined;
  // The reference leads, with an arrow to each machine measured against it.
  const ordered =
    reference && tree
      ? [reference, ...draft.machines.filter((machine) => machine.id !== reference.id)]
      : draft.machines;

  /** Typed pairs as entered so far; an unfinished pair leaves that machine unconverted. */
  const live = useMemo<WeightMapping>(
    () => ({
      ...draft,
      machines: draft.machines.map((machine) => {
        const text = texts[machine.id] ?? BLANK;
        const machineKg = weightInputKg(text.machine, weightUnit, machine.machine_kg);
        const referenceKg = weightInputKg(text.reference, weightUnit, machine.reference_kg);
        return machineKg && referenceKg && machineKg > 0 && referenceKg > 0
          ? { ...machine, machine_kg: machineKg, reference_kg: referenceKg }
          : { ...machine, machine_kg: null, reference_kg: null };
      }),
    }),
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
    const nextErrors: Record<string, string> = {};
    const machines = draft.machines.map((machine) => {
      if (machine.id === draft.reference_machine_id) return machine;
      const text = texts[machine.id] ?? BLANK;
      const machineKg = weightInputKg(text.machine, weightUnit, machine.machine_kg);
      const referenceKg = weightInputKg(text.reference, weightUnit, machine.reference_kg);
      const blank = !text.machine.trim() && !text.reference.trim();
      if (!blank && (!machineKg || !referenceKg || machineKg <= 0 || referenceKg <= 0)) {
        nextErrors[machine.id] = 'Enter both weights, or leave both blank.';
      }
      return blank
        ? { ...machine, machine_kg: null, reference_kg: null }
        : { ...machine, machine_kg: machineKg, reference_kg: referenceKg };
    });
    setErrors(nextErrors);
    return Object.keys(nextErrors).length ? null : { ...draft, machines };
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
    const factor = typedFactor(text);
    const typed = decimalNumberOrNull(value);
    setPair(
      machineId,
      factor && typed && typed > 0
        ? { machine: value, reference: trimmed(typed * factor) }
        : { ...text, machine: value },
    );
  }

  function chooseReference(machineId: string) {
    const current = parsedDraft();
    if (!current) return;
    const next = withReference(current, machineId);
    setDraft(next);
    setTexts(withSuggestions(pairTexts(next, weightUnit), next, progress, weightUnit));
  }

  function toggle() {
    const next = {
      ...draft,
      enabled: !draft.enabled,
      reference_machine_id: draft.reference_machine_id ?? recommendedId,
    };
    setDraft(next);
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
      onSaved(await api.saveWeightMapping(exerciseId, next));
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save machine weights.');
      setSaving(false);
    }
  }

  return (
    <PopupDialog
      title="Machine weights"
      kicker={exerciseName}
      className="machine-weights-dialog"
      headerActions={
        <button type="submit" form={formId} className="machine-weights-save" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      }
      onClose={onClose}
    >
      <form id={formId} className="machine-weights-form" onSubmit={(event) => void submit(event)}>
        <div className="notification-setting-row machine-weights-toggle">
          <div className="machine-weights-toggle-label">
            <strong>Normalise weights</strong>
            <HelpPopup title="Normalise weights">
              <p>
                All machines in Progress shows every session in the reference machine’s weights.
                Each arrow shows what your weight on a machine equals on the reference. Change
                either weight, or drag the slider, and watch the preview.
              </p>
              <p>
                Suggestions compare the est. 1RM from each session’s weight and reps with the
                reference machine’s trend around that date.
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
          <section className="machine-weights-preview" aria-label="Preview">
            <TrendChart
              points={previewPoints}
              backgroundPoints={loggedPoints}
              label={`${exerciseName} est. 1RM in ${reference.caption} weights`}
              seriesLabel="All machines ≈"
              unit={weightUnit}
              area={false}
              height={130}
            />
            <p className="machine-weights-preview-key">
              <span className="is-line" aria-hidden="true" />
              All machines ≈
              <span className="is-dot" aria-hidden="true" />
              As logged
            </p>
          </section>
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
                      <span className="machine-weights-equals" aria-hidden="true">
                        =
                      </span>
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
                    </div>
                    <div className="machine-weights-slider">
                      <input
                        type="range"
                        min={FACTOR_RANGE.min}
                        max={FACTOR_RANGE.max}
                        step={FACTOR_RANGE.step}
                        value={clampFactor(factor)}
                        aria-label={`Conversion for ${machine.caption}`}
                        aria-valuetext={`times ${factor.toFixed(2)}`}
                        onChange={(event) =>
                          setPair(machine.id, pairForFactor(text, Number(event.target.value), base))
                        }
                      />
                      <b className="num">×{factor.toFixed(2)}</b>
                    </div>
                    {suggestion && (
                      <p className="machine-weights-suggestion">
                        <span>
                          Suggested ×{suggestion.factor.toFixed(2)} · {suggestion.sessions} sessions
                        </span>
                        {Math.abs(factor - suggestion.factor) >= 0.005 && (
                          <button
                            type="button"
                            className="text-link"
                            aria-label={`Use suggested ×${suggestion.factor.toFixed(2)} for ${machine.caption}`}
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
    </PopupDialog>
  );
}
