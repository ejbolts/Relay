import type { PartnerLastSet } from './trainTogether';
import { formatWeight, type WeightUnit } from './weightUnits';

function formatCardioLastSet(set: PartnerLastSet): string | null {
  const parts: string[] = [];
  if (set.duration_seconds && set.duration_seconds > 0) {
    parts.push(`${Math.max(1, Math.round(set.duration_seconds / 60))} min`);
  }
  if (set.distance_km && set.distance_km > 0) {
    parts.push(`${Number(set.distance_km.toFixed(1))} km`);
  }
  return parts.length ? parts.join(' · ') : null;
}

export function formatPartnerSetValue(set: PartnerLastSet, weightUnit: WeightUnit): string | null {
  if (set.weight_kg !== null && set.reps !== null) {
    return `${formatWeight(set.weight_kg, weightUnit)} × ${set.reps}`;
  }
  if (set.weight_kg !== null) {
    return formatWeight(set.weight_kg, weightUnit);
  }
  if (set.reps !== null) {
    return `${set.reps} ${set.reps === 1 ? 'rep' : 'reps'}`;
  }
  return formatCardioLastSet(set);
}
