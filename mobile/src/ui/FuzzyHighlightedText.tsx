import { Text } from 'react-native';
import { fuzzyHighlightIndices } from '../../../frontend/src/exerciseSearch';

/**
 * The letters of `value` that a fuzzy exercise search matched, in heavier type, as the web shows
 * them. Render it inside a Text.
 */
export function FuzzyHighlightedText({ value, query }: { value: string; query: string }) {
  const highlighted = new Set(fuzzyHighlightIndices(value, query));
  if (!highlighted.size) return <>{value}</>;
  // Runs of matched and unmatched letters, so a name needs a few nested Texts, not one per letter.
  const runs: { text: string; match: boolean }[] = [];
  [...value].forEach((character, index) => {
    const match = highlighted.has(index);
    const last = runs.at(-1);
    if (last && last.match === match) last.text += character;
    else runs.push({ text: character, match });
  });
  return (
    <>
      {runs.map((run, index) =>
        run.match ? (
          <Text key={index} style={{ fontWeight: '900' }}>
            {run.text}
          </Text>
        ) : (
          run.text
        ),
      )}
    </>
  );
}
