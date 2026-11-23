import {
  canMergeExercises,
  mergeChanges,
  mergeDistance,
  type MergeChanges,
} from './exerciseMergeCompatibility';
import {
  STRONG_MATCH,
  isMatchedWord,
  mergeSuggestions,
  type MergeSuggestion,
} from './exerciseMergeSuggestions';
import { exerciseSearchAllowsTypos, exerciseSearchScore } from './exerciseSearch';
import type { Exercise } from './types';

/** An exercise a custom exercise could merge into, and what it would take. */
export interface MergeTarget {
  item: Exercise;
  changes: MergeChanges;
  /** Merging needs no changes to the custom exercise first. */
  ready: boolean;
  distance: number;
  score: number | null;
}

/** The exercises that can be merged away: only custom ones. */
export const mergeSources = (exercises: Exercise[]) => exercises.filter((item) => item.is_custom);

/**
 * Where a custom exercise can merge, best first: exercises ready to merge, then those matching
 * the search (or, before one, the custom exercise's own name), then the fewest differences.
 * Before a search, the likeliest standard exercises are `suggested` under their own heading and
 * left out of `listed`.
 */
export function mergeTargets(
  exercises: Exercise[],
  source: Exercise | undefined,
  query: string,
): { candidates: MergeTarget[]; suggested: MergeSuggestion[]; listed: MergeTarget[] } {
  if (!source) return { candidates: [], suggested: [], listed: [] };
  const typos = exerciseSearchAllowsTypos(exercises, query);
  const candidates = exercises
    .map((item) => ({ item, changes: mergeChanges(source, item) }))
    .filter(
      (entry): entry is { item: Exercise; changes: MergeChanges } =>
        entry.changes !== null && exerciseSearchScore(entry.item, query, typos) !== null,
    )
    .map((entry) => ({
      ...entry,
      ready: canMergeExercises(source, entry.item),
      distance: mergeDistance(source, entry.item),
      // Before a search, a duplicate usually shares its name: "DB Bench" and
      // "Dumbbell Bench Press".
      score: exerciseSearchScore(entry.item, query.trim() || source.name, typos),
    }))
    .sort(
      (a, b) =>
        Number(b.ready) - Number(a.ready) ||
        Number(b.score !== null) - Number(a.score !== null) ||
        (a.score ?? 0) - (b.score ?? 0) ||
        a.distance - b.distance ||
        a.item.name.localeCompare(b.item.name),
    );
  const suggested = query.trim() ? [] : mergeSuggestions(source, exercises);
  const suggestedIds = new Set(suggested.map((entry) => entry.exercise.id));
  return {
    candidates,
    suggested,
    listed: candidates.filter((entry) => !suggestedIds.has(entry.item.id)),
  };
}

/** "Official · Chest · Barbell": whose exercise it is, its muscle group and equipment. */
export function mergeTargetDetail(exercise: Exercise) {
  return [exercise.is_custom ? 'Custom' : 'Official', exercise.muscle_group, exercise.equipment]
    .filter(Boolean)
    .join(' · ');
}

/** A suggested exercise's name in parts, with the words that matched the custom name marked. */
export function matchedNameParts(
  name: string,
  matchedWords: readonly string[] | undefined,
): { text: string; matched: boolean }[] {
  if (!matchedWords?.length) return [{ text: name, matched: false }];
  return name
    .split(/([^\p{L}\p{N}]+)/u)
    .filter(Boolean)
    .map((text) => ({ text, matched: isMatchedWord(text, matchedWords) }));
}

/** Where a device keeps the suggestions marked "Not the same". */
export const DISMISSED_MERGE_SUGGESTIONS_KEY = 'gym-logger-dismissed-merge-suggestions';

/**
 * Suggestions marked "Not the same" on this device, from what was saved: custom exercise ID to
 * standard exercise ID. Anything else saved there is ignored.
 */
export function parseDismissedMergeSuggestions(saved: unknown): Record<string, string> {
  return saved && typeof saved === 'object' && !Array.isArray(saved)
    ? Object.fromEntries(
        Object.entries(saved).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {};
}

/**
 * The standard exercise a custom exercise most likely duplicates, for the "Looks like …" nudge,
 * unless that suggestion was marked "Not the same".
 */
export function mergeNudgeTarget(
  exercise: Exercise,
  exercises: Exercise[],
  dismissed: Readonly<Record<string, string>>,
): Exercise | null {
  const [suggestion] = mergeSuggestions(exercise, exercises, { limit: 1, minimum: STRONG_MATCH });
  if (!suggestion || dismissed[exercise.id] === suggestion.exercise.id) return null;
  return suggestion.exercise;
}
