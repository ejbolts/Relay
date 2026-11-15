import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PrToast } from './PrToast';

describe('personal record popup', () => {
  it('announces the relative record with the bodyweight of the lift', () => {
    const markup = renderToStaticMarkup(
      <PrToast
        entries={[
          {
            exercise: 'Bench Press',
            labels: ['Relative strength PR'],
            reps: 8,
            weightKg: 100,
            bodyweightKg: 80,
          },
        ]}
        onClose={() => {}}
      />,
    );
    expect(markup).toContain('Relative strength PR');
    expect(markup).toContain('1.25× BW');
    expect(markup).toContain('at 80 kg BW');
  });
  it.each(['Volume PR for this weight', 'Weight PR'])(
    'announces %s with the exercise and set',
    (label) => {
      const markup = renderToStaticMarkup(
        <PrToast
          entries={[{ exercise: 'Bench Press', labels: [label], reps: 9, weightKg: 100 }]}
          onClose={() => {}}
        />,
      );
      expect(markup).toContain('role="status"');
      expect(markup).toContain('aria-live="polite"');
      expect(markup).toContain(label);
      expect(markup).toContain('Bench Press');
      expect(markup).toContain('9 reps at 100 kg');
      expect(markup).toContain('Dismiss personal record popup');
    },
  );
});
