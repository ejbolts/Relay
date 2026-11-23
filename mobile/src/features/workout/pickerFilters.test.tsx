import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Platform } from 'react-native';
import type { Exercise } from '../../../../frontend/src/types';
import { PromptHost } from '../../ui/prompts';
import { ExercisePicker } from './ExercisePicker';
import { bench, press } from './testFixtures';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'token') }));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiGet: jest.fn(async () => []),
}));

// Forty pieces of custom equipment, more than any phone screen holds.
const custom: Exercise[] = Array.from({ length: 40 }, (_, index) => ({
  ...bench,
  id: `custom-${index}`,
  name: `Custom lift ${index + 1}`,
  equipment: `Rig ${String(index + 1).padStart(2, '0')}`,
  is_custom: true,
}));

let client: QueryClient;
beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));
afterEach(() => client.clear());

async function openPicker(exercises: Exercise[]) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  await render(
    <QueryClientProvider client={client}>
      <ExercisePicker
        visible
        exercises={exercises}
        recentIds={[]}
        addedIds={new Set()}
        onAdd={jest.fn()}
        onCreate={jest.fn()}
        onClose={jest.fn()}
      />
      <PromptHost />
    </QueryClientProvider>,
  );
}

test('a long equipment list scrolls inside the menu and every option is reachable', async () => {
  await openPicker([bench, press, ...custom]);
  await fireEvent.press(screen.getByRole('button', { name: 'Equipment' }));
  // The menu sheet's options scroll view (the trigger shares its "Equipment" label).
  const scroller = screen
    .getAllByLabelText('Equipment')
    .find((node) => String(node.type).includes('ScrollView'));
  if (!scroller) throw new Error('The menu options are not in a scroll view');
  // The options live in a scroll view in a sheet bounded to the screen.
  expect(within(scroller).getByText('All equipment ✓')).toBeVisible();
  expect(within(scroller).getByText('Rig 40')).toBeVisible();
  await act(async () => fireEvent.press(within(scroller).getByText('Rig 40')));
  expect(screen.getByRole('button', { name: 'Equipment: Rig 40' })).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'Custom lift 40' })).toBeVisible();
  expect(screen.queryByRole('checkbox', { name: 'Bench Press' })).toBeNull();
});

test('a name only hidden by a filter is not offered to create again', async () => {
  await openPicker([bench, { ...press, equipment: 'Machine' }]);
  await fireEvent.press(screen.getByRole('button', { name: 'Equipment' }));
  await act(async () => fireEvent.press(screen.getByText('Machine')));
  await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'bench press');
  expect(screen.queryByRole('checkbox', { name: 'Bench Press' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create Bench Press' })).toBeNull();
  // A name that exists nowhere is still offered.
  await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'zercher squat');
  expect(screen.getByRole('button', { name: 'Create Zercher Squat' })).toBeVisible();
});
