import {
  FACTOR_RANGE,
  clampFactor,
  latestWeightKg,
  suggestFactors,
  type FactorSuggestion,
} from './machineWeights';
import type { ExerciseProgress, WeightMapping } from './types';
import { decimalNumberOrNull } from './utils';
import { weightFromKg, weightInputKg, weightInputValue, type WeightUnit } from './weightUnits';

// The Machine weights form's rules: each machine's typed pair of weights (your weight on it, and
// what that equals on the reference machine), turned into the mapping that is saved.

/**
 * A machine's two typed weights. `held` is the conversion kept while your weight on the machine
 * is being edited: the one the pair showed when the edit began, or null if it showed none.
 */
export type PairText = { machine: string; reference: string; held?: number | null };
export type PairTexts = Record<string, PairText>;

export const BLANK_PAIR: PairText = { machine: '', reference: '' };

/** The saved pairs as typed text in the display unit. */
export function pairTexts(mapping: WeightMapping, unit: WeightUnit): PairTexts {
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
export function baseWeight(progress: ExerciseProgress, machineId: string, unit: WeightUnit) {
  const kg = latestWeightKg(progress, machineId);
  if (kg === null) return unit === 'lb' ? 100 : 50;
  return Math.round(weightFromKg(kg, unit) * 2) / 2;
}

/** A pair of typed weights for a conversion, keeping a weight already entered for the machine. */
export function pairForFactor(text: PairText, factor: number, base: number): PairText {
  const typed = decimalNumberOrNull(text.machine);
  const machine = typed && typed > 0 ? typed : base;
  return { machine: trimmed(machine), reference: trimmed(machine * factor) };
}

/** Where a conversion sits along the slider, from 0 at its minimum to 1 at its maximum. */
export function sliderPosition(factor: number): number {
  return (clampFactor(factor) - FACTOR_RANGE.min) / (FACTOR_RANGE.max - FACTOR_RANGE.min);
}

/** Whether a conversion falls within the middle half of your sessions' conversions. */
export function inLikelyRange(factor: number, suggestion: FactorSuggestion): boolean {
  const rounded = Math.round(factor * 100) / 100;
  return rounded >= suggestion.low && rounded <= suggestion.high;
}

/** The conversion a typed pair describes, or null while either weight is missing. */
export function typedFactor(text: PairText): number | null {
  const machine = decimalNumberOrNull(text.machine);
  const reference = decimalNumberOrNull(text.reference);
  return machine && reference && machine > 0 && reference > 0 ? reference / machine : null;
}

/**
 * Your weight on the machine changes; the conversion, and so the trend, stays.
 *
 * The conversion is the one the pair showed when this edit began. Working it out again from the
 * two boxes on each keystroke would let an emptied box, or a half-typed weight and its rounded
 * match, replace it. A pair that showed no conversion has none to keep, so its other weight is
 * left alone while this one is typed.
 */
export function pairWithMachineWeight(text: PairText, value: string): PairText {
  const held = text.held !== undefined ? text.held : typedFactor(text);
  const typed = decimalNumberOrNull(value);
  return {
    machine: value,
    reference: held && typed && typed > 0 ? trimmed(typed * held) : text.reference,
    held,
  };
}

/** The matching weight on the reference changes, so the pair shows a new conversion. */
export function pairWithReferenceWeight(text: PairText, value: string): PairText {
  return { machine: text.machine, reference: value };
}

/**
 * Leaving the weight box ends the edit. A finished pair then speaks for itself: the next edit
 * keeps the conversion it shows. An unfinished one still holds the conversion to return to.
 */
export function pairSettled(text: PairText): PairText {
  return text.held === undefined || typedFactor(text) === null
    ? text
    : { machine: text.machine, reference: text.reference };
}

/**
 * Fill machines without a pair from their suggestions: your latest weight on the machine, and
 * what it works out as on the reference. A pair you saved or started typing is kept.
 */
export function withSuggestions(
  texts: PairTexts,
  mapping: WeightMapping,
  progress: ExerciseProgress,
  unit: WeightUnit,
): PairTexts {
  const suggestions = suggestFactors(progress, mapping.reference_machine_id);
  const next = { ...texts };
  for (const machine of mapping.machines) {
    const text = next[machine.id] ?? BLANK_PAIR;
    const suggestion = suggestions.get(machine.id);
    const blank = !text.machine.trim() && !text.reference.trim();
    if (suggestion && machine.id !== mapping.reference_machine_id && blank) {
      next[machine.id] = pairForFactor(
        text,
        suggestion.factor,
        baseWeight(progress, machine.id, unit),
      );
    }
  }
  return next;
}

/** The pairs as typed so far; an unfinished pair leaves that machine unconverted. */
export function liveMapping(draft: WeightMapping, texts: PairTexts, unit: WeightUnit) {
  return {
    ...draft,
    machines: draft.machines.map((machine) => {
      const text = texts[machine.id] ?? BLANK_PAIR;
      const machineKg = weightInputKg(text.machine, unit, machine.machine_kg);
      const referenceKg = weightInputKg(text.reference, unit, machine.reference_kg);
      return machineKg && referenceKg && machineKg > 0 && referenceKg > 0
        ? { ...machine, machine_kg: machineKg, reference_kg: referenceKg }
        : { ...machine, machine_kg: null, reference_kg: null };
    }),
  };
}

export const PAIR_ERROR = 'Enter both weights, or leave both blank.';

/** The mapping to save with each machine's typed pair, or the machines whose pair is unfinished. */
export function parsedMapping(
  draft: WeightMapping,
  texts: PairTexts,
  unit: WeightUnit,
): { mapping: WeightMapping | null; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const machines = draft.machines.map((machine) => {
    if (machine.id === draft.reference_machine_id) return machine;
    const text = texts[machine.id] ?? BLANK_PAIR;
    const machineKg = weightInputKg(text.machine, unit, machine.machine_kg);
    const referenceKg = weightInputKg(text.reference, unit, machine.reference_kg);
    const blank = !text.machine.trim() && !text.reference.trim();
    if (!blank && (!machineKg || !referenceKg || machineKg <= 0 || referenceKg <= 0)) {
      errors[machine.id] = PAIR_ERROR;
    }
    return blank
      ? { ...machine, machine_kg: null, reference_kg: null }
      : { ...machine, machine_kg: machineKg, reference_kg: referenceKg };
  });
  return {
    mapping: Object.keys(errors).length ? null : { ...draft, machines },
    errors,
  };
}

/** How a suggestion is labelled: a rough one has too few sessions near the reference's. */
export function suggestionLabel(suggestion: FactorSuggestion): string {
  return suggestion.basis === 'rough' ? 'Estimated' : 'Suggested';
}

export const sessionCount = (count: number) => `${count} ${count === 1 ? 'session' : 'sessions'}`;

/** Normalising switched on or off; switching on picks the recommended reference if none is set. */
export function toggledNormalise(
  draft: WeightMapping,
  recommendedId: string | null,
): WeightMapping {
  return {
    ...draft,
    enabled: !draft.enabled,
    reference_machine_id: draft.reference_machine_id ?? recommendedId,
  };
}

/**
 * The machines in the order the form lists them. While normalising, the reference leads, with
 * each other machine measured against it (`tree`).
 */
export function machineWeightsLayout(draft: WeightMapping) {
  const reference = draft.machines.find((machine) => machine.id === draft.reference_machine_id);
  const tree = draft.enabled && reference !== undefined;
  return {
    reference,
    tree,
    ordered:
      reference && tree
        ? [reference, ...draft.machines.filter((machine) => machine.id !== reference.id)]
        : draft.machines,
  };
}
