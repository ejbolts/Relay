export interface SetEntryWarning {
  title: string;
  message: string;
  highReps: boolean;
}

export interface SetEntryValues {
  reps: number | null;
  weightKg: number | null;
  referenceWeightKg: number | null;
  originalReps?: number | null;
  skipHighRepWarning?: boolean;
}

export function isUnusuallyHighWeight(
  weightKg: number | null,
  referenceWeightKg: number | null,
): boolean {
  if (weightKg === null || weightKg <= 0) return false;
  if (referenceWeightKg === null || referenceWeightKg <= 0) return weightKg >= 300;
  if (weightKg <= referenceWeightKg) return false;

  const increase = weightKg - referenceWeightKg;
  return increase >= 100 || (increase >= 20 && weightKg >= referenceWeightKg * 2);
}

export function unusualSetEntryWarning(
  { reps, weightKg, referenceWeightKg, originalReps, skipHighRepWarning }: SetEntryValues,
  weightUnit: WeightUnit = 'kg',
): SetEntryWarning | null {
  const highReps =
    !skipHighRepWarning &&
    reps !== null &&
    reps > 20 &&
    (originalReps === undefined || reps !== originalReps);
  const highWeight = isUnusuallyHighWeight(weightKg, referenceWeightKg);

  if (highReps && highWeight) {
    return {
      title: 'Add high rep and weight set?',
      highReps: true,
      message: `You entered ${reps} reps at ${formatWeight(weightKg!, weightUnit)}. Confirm that both values are intended.`,
    };
  }
  if (highReps) {
    return {
      title: 'Add high rep set?',
      highReps: true,
      message: `You entered ${reps} reps. Confirm that this high-rep set is intended.`,
    };
  }
  if (highWeight) {
    return {
      title: `Is ${formatWeight(weightKg!, weightUnit)} intended?`,
      highReps: false,
      message:
        referenceWeightKg !== null && referenceWeightKg > 0
          ? `This is unusually high compared with the reference set at ${formatWeight(referenceWeightKg, weightUnit)}.`
          : 'This is an unusually high weight with no nearby reference set.',
    };
  }
  return null;
}
import { formatWeight, type WeightUnit } from './weightUnits';
