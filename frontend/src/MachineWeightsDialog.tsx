import { useId, useMemo, useState, type FormEvent } from 'react';
import { api } from './api';
import { HelpPopup } from './HelpPopup';
import {
  FACTOR_RANGE,
  clampFactor,
  defaultReferenceId,
  pairFactor,
  progressViewPoints,
  suggestFactors,
  withReference,
  type FactorSuggestion,
} from './machineWeights';
import { PopupDialog } from './PopupDialog';
import { TrendChart, type TrendPoint } from './PulseCharts';
import type { ExerciseProgress, WeightMapping } from './types';
import { weightFromKg, weightInputKg, weightInputValue, type WeightUnit } from './weightUnits';
import { decimalNumberOrNull } from './utils';
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

/** A pair of typed weights for a conversion, keeping a weight already entered for the machine. */
function pairForFactor(text: PairText, factor: number, unit: WeightUnit): PairText {
  const typed = decimalNumberOrNull(text.machine);
  const machine = typed && typed > 0 ? typed : unit === 'lb' ? 100 : 50;
  return { machine: trimmed(machine), reference: trimmed(machine * factor) };
}

/** Fill machines without a pair from their suggestions. */
function withSuggestions(
  texts: PairTexts,
  mapping: WeightMapping,
  suggestions: Map<string, FactorSuggestion>,
  unit: WeightUnit,
): PairTexts {
  const next = { ...texts };
  for (const machine of mapping.machines) {
    const text = next[machine.id] ?? BLANK;
    const suggestion = suggestions.get(machine.id);
    if (suggestion && machine.id !== mapping.reference_machine_id && !text.machine.trim()) {
      next[machine.id] = pairForFactor(text, suggestion.factor, unit);
    }
  }
  return next;
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
    return mapping.enabled
      ? withSuggestions(
          initial,
          mapping,
          suggestFactors(progress, mapping.reference_machine_id),
          weightUnit,
        )
      : initial;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reference = draft.machines.find((machine) => machine.id === draft.reference_machine_id);
  const suggestions = useMemo(
    () => suggestFactors(progress, draft.reference_machine_id),
    [progress, draft.reference_machine_id],
  );

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
  const showPreview = draft.enabled && Boolean(reference) && progress.points.length > 1;
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

  function chooseReference(machineId: string) {
    const current = parsedDraft();
    if (!current) return;
    const next = withReference(current, machineId);
    setDraft(next);
    setTexts(
      withSuggestions(
        pairTexts(next, weightUnit),
        next,
        suggestFactors(progress, machineId),
        weightUnit,
      ),
    );
  }

  function toggle() {
    const next = {
      ...draft,
      enabled: !draft.enabled,
      reference_machine_id: draft.reference_machine_id ?? defaultReferenceId(draft),
    };
    setDraft(next);
    if (next.enabled) {
      setTexts((current) =>
        withSuggestions(
          current,
          next,
          suggestFactors(progress, next.reference_machine_id),
          weightUnit,
        ),
      );
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
                All machines in Progress shows every session in the reference machine’s weights. For
                each other machine, enter one pair of weights that feel the same, or drag its slider
                and watch the preview.
              </p>
              <p>
                Suggestions compare your est. 1RM either side of each switch to or from the
                reference within two weeks, and need at least two switches.
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
        <ul className="machine-weights-list">
          {draft.machines.map((machine) => {
            const isReference = draft.enabled && machine.id === draft.reference_machine_id;
            const text = texts[machine.id] ?? BLANK;
            const liveMachine = live.machines.find((item) => item.id === machine.id)!;
            const factor = pairFactor(liveMachine);
            const suggestion = suggestions.get(machine.id);
            const errorId = `${formId}-${machine.id}-error`;
            return (
              <li key={machine.id} className={isReference ? 'is-reference' : undefined}>
                <div className="machine-weights-machine">
                  <img src={machine.thumbnail_url} alt="" loading="lazy" />
                  <span>
                    <strong>{machine.caption}</strong>
                    <small>
                      {machine.workout_count} {machine.workout_count === 1 ? 'workout' : 'workouts'}
                    </small>
                  </span>
                  {isReference ? (
                    <em className="machine-weights-reference">Reference</em>
                  ) : (
                    draft.enabled && (
                      <button
                        type="button"
                        className="text-link"
                        aria-label={`Make ${machine.caption} the reference`}
                        onClick={() => chooseReference(machine.id)}
                      >
                        Make reference
                      </button>
                    )
                  )}
                </div>
                {draft.enabled && !isReference && reference && (
                  <div className="machine-weights-pair">
                    <label>
                      <input
                        inputMode="decimal"
                        value={text.machine}
                        aria-label={`Weight on ${machine.caption}`}
                        aria-invalid={Boolean(errors[machine.id])}
                        aria-describedby={errors[machine.id] ? errorId : undefined}
                        onChange={(event) =>
                          setPair(machine.id, { ...text, machine: event.target.value })
                        }
                      />
                      {weightUnit} here
                    </label>
                    <label>
                      <span aria-hidden="true">=</span>
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
                      {weightUnit} on {reference.caption}
                    </label>
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
                          setPair(
                            machine.id,
                            pairForFactor(text, Number(event.target.value), weightUnit),
                          )
                        }
                      />
                      <b className="num">×{factor.toFixed(2)}</b>
                    </div>
                    {suggestion && (
                      <p className="machine-weights-suggestion">
                        <span>
                          Suggested ×{suggestion.factor.toFixed(2)} · {suggestion.switches} switches
                        </span>
                        {Math.abs(factor - suggestion.factor) >= 0.005 && (
                          <button
                            type="button"
                            className="text-link"
                            aria-label={`Use suggested ×${suggestion.factor.toFixed(2)} for ${machine.caption}`}
                            onClick={() =>
                              setPair(
                                machine.id,
                                pairForFactor(text, suggestion.factor, weightUnit),
                              )
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
