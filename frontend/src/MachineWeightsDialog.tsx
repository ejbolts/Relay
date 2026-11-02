import { useId, useState, type FormEvent } from 'react';
import { api } from './api';
import { HelpPopup } from './HelpPopup';
import { defaultReferenceId, pairFactor, withReference } from './machineWeights';
import { PopupDialog } from './PopupDialog';
import type { WeightMapping } from './types';
import { weightInputKg, weightInputValue, type WeightUnit } from './weightUnits';
import './machineWeights.css';

type PairText = { machine: string; reference: string };

function pairTexts(mapping: WeightMapping, unit: WeightUnit): Record<string, PairText> {
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

/** Choose a reference machine and how each other machine's weights compare with it. */
export function MachineWeightsDialog({
  exerciseId,
  exerciseName,
  mapping,
  weightUnit,
  onClose,
  onSaved,
}: {
  exerciseId: string;
  exerciseName: string;
  mapping: WeightMapping;
  weightUnit: WeightUnit;
  onClose: () => void;
  onSaved: (mapping: WeightMapping) => void;
}) {
  const formId = useId();
  const [draft, setDraft] = useState(mapping);
  const [texts, setTexts] = useState(() => pairTexts(mapping, weightUnit));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reference = draft.machines.find((machine) => machine.id === draft.reference_machine_id);

  /** The draft with each machine's typed pair, or null after marking invalid pairs. */
  function parsedDraft(): WeightMapping | null {
    const nextErrors: Record<string, string> = {};
    const machines = draft.machines.map((machine) => {
      if (machine.id === draft.reference_machine_id) return machine;
      const text = texts[machine.id] ?? { machine: '', reference: '' };
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

  function chooseReference(machineId: string) {
    const current = parsedDraft();
    if (!current) return;
    const next = withReference(current, machineId);
    setDraft(next);
    setTexts(pairTexts(next, weightUnit));
  }

  function toggle() {
    setDraft((current) => ({
      ...current,
      enabled: !current.enabled,
      reference_machine_id: current.reference_machine_id ?? defaultReferenceId(current),
    }));
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
                each other machine, enter one pair of weights that feel the same.
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
        <ul className="machine-weights-list">
          {draft.machines.map((machine) => {
            const isReference = draft.enabled && machine.id === draft.reference_machine_id;
            const text = texts[machine.id] ?? { machine: '', reference: '' };
            const typed = {
              machine_kg: weightInputKg(text.machine, weightUnit),
              reference_kg: weightInputKg(text.reference, weightUnit),
            };
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
                          setTexts((current) => ({
                            ...current,
                            [machine.id]: { ...text, machine: event.target.value },
                          }))
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
                          setTexts((current) => ({
                            ...current,
                            [machine.id]: { ...text, reference: event.target.value },
                          }))
                        }
                      />
                      {weightUnit} on {reference.caption}
                    </label>
                    <b className="num">×{pairFactor(typed).toFixed(2)}</b>
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
