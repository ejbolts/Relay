import { fuzzyScoreFields } from './exerciseSearch';

/** How well a word matches a name; a misspelt ending such as "Squatz" still finds "Squat". */
function wordScore(name: string, word: string): number | null {
  for (let length = word.length; length >= Math.min(word.length, 4); length -= 1) {
    const score = fuzzyScoreFields([name], word.slice(0, length));
    if (score !== null) return score + (word.length - length) * 10;
  }
  return null;
}

/**
 * The exercises whose names best match an imported exercise name, best first, for the top of its
 * mapping menu. More matching words rank higher, then closer matches.
 */
export function bestExerciseMatches<T extends { name: string }>(
  incomingName: string,
  exercises: T[],
  limit = 5,
): T[] {
  const words = incomingName
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1);
  if (!words.length) return [];
  return exercises
    .map((exercise, index) => {
      let matched = 0;
      let score = 0;
      for (const word of words) {
        const found = wordScore(exercise.name, word);
        if (found === null) continue;
        matched += 1;
        score += found;
      }
      return { exercise, index, matched, score };
    })
    .filter((match) => match.matched > 0)
    .sort(
      (first, second) =>
        second.matched - first.matched || first.score - second.score || first.index - second.index,
    )
    .slice(0, limit)
    .map((match) => match.exercise);
}
