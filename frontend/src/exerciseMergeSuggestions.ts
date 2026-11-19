import { equipmentSearchTerms, exerciseEquipment } from './exerciseEquipment';
import { canMergeExercises, mergeChanges, muscles } from './exerciseMergeCompatibility';
import { searchTokens } from './exerciseSearch';
import type { Exercise } from './types';

/** Short forms people use for a whole exercise name. */
const ACRONYMS: Record<string, string> = {
  rdl: 'romanian deadlift',
  rdls: 'romanian deadlift',
  sldl: 'stiff leg deadlift',
  ohp: 'overhead press',
};
/** Other names for the same movement. */
const PHRASES: [RegExp, string][] = [
  [/\bhamstrings? curls?\b/g, 'leg curl'],
  [/\bpec(?:toral)? fl(?:y|ies)\b/g, 'pec deck'],
  [/\bskull[ -]+crushers?\b/g, 'skullcrusher'],
];
/** Words that describe the usual way of doing an exercise, so they never tell two apart. */
const FILLER = new Set(['flat', 'the', 'a', 'an', 'and', 'with', 'on', 'of', 'exercise']);

/** How alike two names are, from 0 to 1, for listing a custom exercise's likely duplicates. */
export const SUGGESTED_MATCH = 0.6;
/** Close enough to point out on the custom exercise's own page. */
export const STRONG_MATCH = 0.8;

interface NameWords {
  /** Name words other than equipment, singular, in order. */
  words: string[];
  /** Equipment the name itself mentions, such as Dumbbell for "DB". */
  equipment: Set<string>;
}

function singular(word: string): string {
  return word.length > 3 && word.endsWith('s') && !/(ss|us)$/.test(word) ? word.slice(0, -1) : word;
}

function nameWords(name: string): NameWords {
  const expanded = PHRASES.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    name
      .toLocaleLowerCase()
      .split(/([^\p{L}\p{N}]+)/u)
      .map((part) => ACRONYMS[part] ?? part)
      .join(''),
  );
  const words: string[] = [];
  const equipment = new Set<string>();
  for (const token of searchTokens(expanded)) {
    if (equipmentSearchTerms[token]) equipment.add(equipmentSearchTerms[token]);
    else if (!FILLER.has(token)) words.push(singular(token));
  }
  return { words, equipment };
}

/** One edit apart: a typo, a missing or extra letter, or two swapped letters. */
function oneEditApart(first: string, second: string): boolean {
  if (Math.abs(first.length - second.length) > 1) return false;
  let start = 0;
  while (start < first.length && first[start] === second[start]) start += 1;
  const rest = (a: number, b: number) => first.slice(start + a) === second.slice(start + b);
  return (
    rest(1, 1) ||
    rest(1, 0) ||
    rest(0, 1) ||
    (first[start] === second[start + 1] && first[start + 1] === second[start] && rest(2, 2))
  );
}

function wordMatch(word: string, other: string): number {
  if (word === other) return 1;
  // An abbreviation, such as "ext" for "extension".
  if (word.length >= 3 && other.startsWith(word)) return 0.85;
  if (word.length >= 5 && other.length >= 5 && oneEditApart(word, other)) return 0.8;
  return 0;
}

/** Joins neighbouring words the other name writes as one, such as "pull down" for "pulldown". */
function joinAgainst(words: string[], other: string[]): { word: string; parts: string[] }[] {
  const joined: { word: string; parts: string[] }[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const pair = words[index] + (words[index + 1] ?? '');
    if (index + 1 < words.length && other.includes(pair)) {
      joined.push({ word: pair, parts: [words[index], words[index + 1]] });
      index += 1;
    } else {
      joined.push({ word: words[index], parts: [words[index]] });
    }
  }
  return joined;
}

/**
 * How alike two names' words are, from 0 to 1, and which of the second name's words matched.
 * Extra words on either side lower the score rather than ruling the pair out.
 */
function wordSimilarity(mine: string[], theirs: string[]): { score: number; matched: string[] } {
  const own = joinAgainst(mine, theirs);
  const other = joinAgainst(
    theirs,
    own.map((item) => item.word),
  );
  if (!own.length || !other.length) return { score: 0, matched: [] };
  const used = new Set<number>();
  let total = 0;
  for (const { word } of own) {
    let best = 0;
    let bestIndex = -1;
    other.forEach((item, index) => {
      const value = used.has(index) ? 0 : wordMatch(word, item.word);
      if (value > best) [best, bestIndex] = [value, index];
    });
    if (bestIndex >= 0) {
      used.add(bestIndex);
      total += best;
    }
  }
  return {
    score: (2 * total) / (own.length + other.length),
    matched: [...used].flatMap((index) => other[index].parts),
  };
}

const sameName = (first: string, second: string) =>
  searchTokens(first).join(' ') === searchTokens(second).join(' ');

export interface MergeSuggestion {
  exercise: Exercise;
  /** From 0 to 1. */
  score: number;
  /** Merging needs no changes to the custom exercise first. */
  ready: boolean;
  /** Words of the standard exercise's name that match, for highlighting. */
  matchedWords: string[];
}

/** How closely a custom exercise's name matches a standard exercise, or null when it cannot. */
export function mergeSuggestion(source: Exercise, target: Exercise): MergeSuggestion | null {
  if (target.is_custom || !mergeChanges(source, target)) return null;
  const ready = canMergeExercises(source, target);
  if (target.alternative_names?.some((name) => sameName(name, source.name))) {
    return { exercise: target, score: 1, ready, matchedWords: [] };
  }
  const mine = nameWords(source.name);
  const theirs = nameWords(target.name);
  const targetEquipment = exerciseEquipment(target.equipment);
  // Equipment named in the custom exercise rules out other variants: "DB press" is never the
  // barbell one.
  if (
    mine.equipment.size &&
    !mine.equipment.has(targetEquipment) &&
    !(mine.equipment.has('Machine') && targetEquipment === 'Smith machine') &&
    ![...theirs.equipment].some((item) => mine.equipment.has(item))
  )
    return null;
  // Equipment counts as one more word, from the name or else the custom exercise's setting.
  const sourceEquipment = mine.equipment.size
    ? [...mine.equipment]
    : [exerciseEquipment(source.equipment)].filter((item) => item !== 'Unspecified');
  const equipmentWord = (items: string[]) => items.map((item) => `[${item}]`);
  const similarity = wordSimilarity(
    [...mine.words, ...equipmentWord(sourceEquipment.slice(0, 1))],
    [...theirs.words, ...equipmentWord(sourceEquipment.length ? [targetEquipment] : [])],
  );
  const matched = similarity.matched;
  // A name match that works different muscles is most likely another exercise.
  const targetMuscles = muscles(target);
  const sharesMuscle = muscles(source).some((muscle) => targetMuscles.includes(muscle));
  const score = similarity.score * (sharesMuscle ? 1 : 0.75);
  const equipmentWords = searchTokens(target.name).filter(
    (token) => equipmentSearchTerms[token] && mine.equipment.has(equipmentSearchTerms[token]),
  );
  return { exercise: target, score, ready, matchedWords: [...matched, ...equipmentWords] };
}

/**
 * Standard exercises a custom exercise most likely duplicates, best first: "Lateral raises"
 * suggests Lateral Raise, "Military press" suggests Overhead Press.
 */
export function mergeSuggestions(
  source: Exercise,
  exercises: Exercise[],
  { limit = 3, minimum = SUGGESTED_MATCH }: { limit?: number; minimum?: number } = {},
): MergeSuggestion[] {
  if (!source.is_custom) return [];
  const sourceEquipment = exerciseEquipment(source.equipment);
  return exercises
    .flatMap((target) => {
      const suggestion = mergeSuggestion(source, target);
      return suggestion && suggestion.score >= minimum ? [suggestion] : [];
    })
    .sort(
      (first, second) =>
        second.score - first.score ||
        Number(second.ready) - Number(first.ready) ||
        Number(exerciseEquipment(second.exercise.equipment) === sourceEquipment) -
          Number(exerciseEquipment(first.exercise.equipment) === sourceEquipment) ||
        first.exercise.name.length - second.exercise.name.length ||
        first.exercise.name.localeCompare(second.exercise.name),
    )
    .slice(0, limit);
}

/** Whether a word of a suggested exercise's name matched the custom exercise's name. */
export function isMatchedWord(word: string, matchedWords: readonly string[]): boolean {
  const { words, equipment } = nameWords(word);
  const tokens = [
    ...words,
    ...searchTokens(word).filter((token) => equipmentSearchTerms[token] && equipment.size),
  ];
  return tokens.length > 0 && tokens.every((token) => matchedWords.includes(token));
}
