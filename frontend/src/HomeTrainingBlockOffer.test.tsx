import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { TodayScreen } from './TodayScreen';
import { TrainingBlocksContext } from './trainingBlocksContext';
import { addDays } from './trainingSummary';
import { useHomeLayout } from './useHomeLayout';
import { reviewSet, reviewWorkout } from './weeklyReviewFixtures';
import type { TrackedWorkout, TrainingBlock, WorkoutTypeColors } from './types';

const TODAY = '2026-11-18';
const colors: WorkoutTypeColors = {
  upper: '#8b5cf6',
  lower: '#f59e0b',
  push: '#ef476f',
  pull: '#3b82f6',
  full_body: '#14b8a6',
  cardio: '#22c55e',
  other: '#94a3b8',
};

/** One session in each of the weeks ending with this one. */
const weekly = (weeks: number, extra: Partial<TrackedWorkout> = {}) =>
  Array.from({ length: weeks }, (_, index) => {
    const date = addDays('2026-11-16', -index * 7);
    return reviewWorkout(date, date, [reviewSet(100, 5)], extra);
  });

function Home({ workouts }: { workouts: TrackedWorkout[] }) {
  const home = useHomeLayout();
  return (
    <TodayScreen
      home={home}
      data={null}
      workouts={workouts}
      measurements={[]}
      personalRecords={[]}
      categoryColors={colors}
      workoutStartedAt={null}
      todayBodyweight={null}
      onSaveBodyweight={vi.fn()}
      onStartTemplate={vi.fn()}
      onStartEmpty={vi.fn()}
      onOpenHistory={vi.fn()}
      onOpenProgress={vi.fn()}
      onOpenCardio={vi.fn()}
      onOpenBody={vi.fn()}
      onOpenSettings={vi.fn()}
      today={TODAY}
    />
  );
}

const render = (workouts: TrackedWorkout[], blocks: TrainingBlock[] = []) =>
  renderToStaticMarkup(
    <TrainingBlocksContext.Provider
      value={{
        config: { blocks },
        block: null,
        select: () => {},
        changed: () => {},
        loading: false,
        error: null,
        retry: () => {},
      }}
    >
      <Home workouts={workouts} />
    </TrainingBlocksContext.Provider>,
  );

it('leaves the Start a block card off Home until four weeks have been trained', () => {
  expect(render([])).not.toContain('No block running');
  expect(render(weekly(3))).not.toContain('No block running');
  // Sample workouts are not the person's own training.
  expect(render(weekly(6, { is_sample: true }))).not.toContain('No block running');
  expect(render(weekly(4))).toContain('No block running');
});

it('shows a running block however little has been trained', () => {
  const html = render(
    [],
    [{ id: 'first', name: 'Winter strength', start_date: '2026-11-10', end_date: null }],
  );
  expect(html).toContain('Winter strength');
  expect(html).not.toContain('No block running');
});
