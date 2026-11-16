import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { BlockTimeline, TIMELINE_BLOCKS } from './TrainingBlockTimeline';
import type { TrainingBlocks } from './types';

function config(count: number, extra: Partial<TrainingBlocks> = {}): TrainingBlocks {
  const blocks = Array.from({ length: count }, (_, i) => ({
    id: `b${i + 1}`,
    name: `Block ${i + 1}`,
    start_date: `2025-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
    end_date: null,
  }));
  return { blocks, ...extra } as TrainingBlocks;
}
const labels = (markup: string) => markup.match(/aria-label="Timeline: ([^"]*)"/)?.[1];

it('names every block when there are only a few', () => {
  const markup = renderToStaticMarkup(<BlockTimeline config={config(3)} currentId="b3" />);
  expect(labels(markup)).toBe('Block 1, Block 2, Block 3');
});

it('folds older blocks into one Earlier segment so the newest stay readable', () => {
  const markup = renderToStaticMarkup(<BlockTimeline config={config(200)} currentId="b200" />);
  const segments = markup.match(/class="training-block-segment/g) ?? [];
  expect(segments).toHaveLength(TIMELINE_BLOCKS + 1);
  expect(labels(markup)).toMatch(/^194 earlier blocks, Block 195, .*Block 200$/);
  expect(markup).toContain('>Earlier</span>');
  expect(markup).toContain('training-block-segment current');
});

it('mentions pre-block history inside the Earlier segment', () => {
  const markup = renderToStaticMarkup(
    <BlockTimeline
      config={config(8, { history_start: '2024-01-01', earlier_workout_count: 12 })}
      currentId="b8"
    />,
  );
  expect(labels(markup)).toMatch(/^2 earlier blocks and history, Block 3/);
});
