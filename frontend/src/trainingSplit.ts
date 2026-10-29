import type { TrainingSplit } from './types';
import { addDays, parseLocalDate } from './trainingSummary';

export const MAX_SPLIT_DAYS = 28;

/** Preserve A/B suffixes in narrow cells while the full name stays accessible. */
export function splitPreviewLabel(name: string): string {
  return name.replace(/^(upper|lower|full) body\b/i, '$1');
}
export const SPLIT_TEMPLATES = [
  { id: 'upper-lower', name: 'Upper / Lower', types: ['upper', 'lower', null] },
  { id: 'ppl', name: 'Push / Pull / Legs', types: ['push', 'pull', 'lower', null] },
  { id: 'fbeod', name: 'FBEOD', types: ['full_body', null] },
  { id: 'cardio', name: 'Cardio', types: ['cardio', null] },
] as const;

export function splitFromTemplate(id: string, startDate: string): TrainingSplit {
  const preset = SPLIT_TEMPLATES.find((item) => item.id === id);
  return {
    name: preset?.name ?? 'My split',
    enabled: true,
    start_date: startDate,
    steps: (preset?.types ?? ['upper', null]).map((workout_type_id) => ({ workout_type_id })),
  };
}

/** UTC day numbers avoid daylight-saving changes in the length of a local day. */
export function splitStepOnDate(split: TrainingSplit, date: string): number | null {
  const dayNumber = (value: string) => {
    const parsed = parseLocalDate(value);
    return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()) / 86_400_000;
  };
  const elapsed = dayNumber(date) - dayNumber(split.start_date);
  return elapsed < 0 || !split.steps.length ? null : elapsed % split.steps.length;
}

export function splitPreview(split: TrainingSplit, from: string, count = 7) {
  return Array.from({ length: count }, (_, offset) => {
    const date = addDays(from, offset);
    const index = splitStepOnDate(split, date);
    return { date, typeId: index === null ? undefined : split.steps[index].workout_type_id };
  });
}
