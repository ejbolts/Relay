import { Fragment } from 'react';
import { fuzzyHighlightIndices } from './exerciseSearch';

/** Bolds the characters of `value` that matched a fuzzy exercise search. */
export function FuzzyHighlightedText({ value, query }: { value: string; query: string }) {
  const highlighted = new Set(fuzzyHighlightIndices(value, query));
  if (!highlighted.size) return value;

  return (
    <>
      {[...value].map((character, index) =>
        highlighted.has(index) ? (
          <b className="exercise-search-match" key={`${character}-${index}`}>
            {character}
          </b>
        ) : (
          <Fragment key={`${character}-${index}`}>{character}</Fragment>
        ),
      )}
    </>
  );
}
