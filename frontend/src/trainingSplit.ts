import type { TrainingSplit } from './types';
import { addDays, isoLocalDate, parseLocalDate } from './trainingSummary';

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

/** Two complete, Monday-first months, using the same uninterrupted cycle as the week preview. */
export function splitCalendarPreview(split: TrainingSplit, from: string, monthOffset = 0) {
  const anchor = parseLocalDate(from);
  return Array.from({ length: 2 }, (_, index) => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth() + monthOffset + index, 1, 12);
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
    const leading = (first.getDay() + 6) % 7;
    const preview = splitPreview(split, isoLocalDate(first), days);
    const cells: Array<(typeof preview)[number] | null> = [
      ...Array.from({ length: leading }, () => null),
      ...preview,
    ];
    while (cells.length % 7) cells.push(null);
    return {
      first: isoLocalDate(first),
      title: first.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
      cells,
    };
  });
}
