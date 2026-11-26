import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NO_SHARED_WORKOUT_FILTERS } from '../../../../frontend/src/sharedHistoryFilters';
import type { SharedWorkoutFilterOptions } from '../../../../frontend/src/types';
import { showMenu } from '../../ui/prompts';
import { HistoryFilterSheet } from './HistoryFilters';

jest.mock('../../ui/prompts', () => ({ showMenu: jest.fn() }));

const machine = (id: string, caption: string) => ({
  id,
  exercise_id: 'lat',
  caption,
  thumbnail_url: '',
  full_url: '',
  width: 1,
  height: 1,
  created_at: '2026-11-01T00:00:00Z',
});
const options: SharedWorkoutFilterOptions = {
  workout_types: [{ id: 'arms', name: 'Arms', color: '#ec4899', is_custom: true, archived: false }],
  exercises: [
    { id: 'bench', name: 'Bench Press' },
    { id: 'lat', name: 'Lat Pulldown' },
  ],
  machines: [machine('m1', 'Cable stack'), machine('m2', 'Plate loaded')],
};

const show = (sheet: ReactElement) =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      {sheet}
    </SafeAreaProvider>,
  );

/** The labels of the menu a row opens. */
async function menu(row: RegExp) {
  await fireEvent.press(screen.getByRole('button', { name: row }));
  return jest
    .mocked(showMenu)
    .mock.calls.at(-1)![1]
    .map((item) => item.label);
}

test('each filter menu ticks the choice that is set', async () => {
  const onChange = jest.fn();
  await show(
    <HistoryFilterSheet
      visible
      filters={{
        ...NO_SHARED_WORKOUT_FILTERS,
        category: '',
        workout_type_id: 'arms',
        exercise_id: 'lat',
        machine_photo_id: 'm2',
      }}
      options={options}
      optionsState={{ status: 'ready', onRetry: () => undefined }}
      onChange={onChange}
      onClose={() => undefined}
    />,
  );
  const types = await menu(/^Workout type, /);
  expect(types).toContain('Arms ✓');
  expect(types.filter((label) => label.endsWith('✓'))).toEqual(['Arms ✓']);
  expect(await menu(/^Exercise, /)).toEqual(['All exercises', 'Bench Press', 'Lat Pulldown ✓']);
  expect(await menu(/^Machine, /)).toEqual([
    'All shared machines',
    'Cable stack',
    'Plate loaded ✓',
  ]);
  // Picking still applies the choice.
  await act(async () => jest.mocked(showMenu).mock.calls.at(-1)![1][1].onPress());
  expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ machine_photo_id: 'm1' }));
});

test('with nothing set, the All choices are ticked', async () => {
  await show(
    <HistoryFilterSheet
      visible
      filters={NO_SHARED_WORKOUT_FILTERS}
      options={options}
      optionsState={{ status: 'ready', onRetry: () => undefined }}
      onChange={() => undefined}
      onClose={() => undefined}
    />,
  );
  expect((await menu(/^Workout type, /))[0]).toBe('All types ✓');
  expect((await menu(/^Exercise, /))[0]).toBe('All exercises ✓');
  expect((await menu(/^Machine, /))[0]).toBe('All shared machines ✓');
});
