/** Lower-cases text, drops accents and splits it into words, so "Café & Co" gives cafe, co. */
export function searchWords(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** How many typing mistakes a searched word may contain: none below four letters. */
export function typoAllowance(word: string): number {
  return word.length < 4 ? 0 : word.length < 8 ? 1 : 2;
}

/**
 * Edits (insert, delete, replace or swap two neighbouring letters) between two words, or null
 * when it is more than `max`.
 */
export function editDistance(first: string, second: string, max: number): number | null {
  if (Math.abs(first.length - second.length) > max) return null;
  let before: number[] = [];
  let previous = Array.from({ length: second.length + 1 }, (_, index) => index);
  for (let row = 1; row <= first.length; row += 1) {
    const current = [row];
    let rowBest = row;
    for (let column = 1; column <= second.length; column += 1) {
      const replace = first[row - 1] === second[column - 1] ? 0 : 1;
      let value = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + replace,
      );
      if (
        row > 1 &&
        column > 1 &&
        first[row - 1] === second[column - 2] &&
        first[row - 2] === second[column - 1]
      )
        value = Math.min(value, before[column - 2] + 1);
      current.push(value);
      rowBest = Math.min(rowBest, value);
    }
    if (rowBest > max) return null;
    before = previous;
    previous = current;
  }
  const distance = previous[second.length];
  return distance <= max ? distance : null;
}

export interface TypoMatch {
  distance: number;
  /** Letters of the word that the query covers: all of it, or the start while still typing. */
  length: number;
}

/** Matches a mistyped query against a word, or against its start while the word is being typed. */
export function typoMatch(query: string, word: string): TypoMatch | null {
  const max = typoAllowance(query);
  if (!max) return null;
  let best: TypoMatch | null = null;
  for (const length of new Set([word.length, query.length, query.length - 1, query.length + 1])) {
    // A typo match must cover most of the query, so "pass" cannot match "p".
    if (length > word.length || length < query.length - max) continue;
    const distance = editDistance(query, word.slice(0, length), max);
    // The whole word is checked first, so it wins a tie with the start of the same word.
    if (distance !== null && (!best || distance < best.distance)) best = { distance, length };
  }
  return best;
}
