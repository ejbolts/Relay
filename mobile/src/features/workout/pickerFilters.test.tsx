import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { AccessibilityInfo, Keyboard, Platform } from 'react-native';
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

test('Custom in the Equipment menu filters to custom exercises and swaps cleanly with equipment', async () => {
  const customCurl: Exercise = {
    ...bench,
    id: 'custom-curl',
    name: 'Custom Dumbbell Curl',
    category: 'pull',
    muscle_group: 'Biceps',
    equipment: 'Dumbbell',
    is_custom: true,
  };
  await openPicker([bench, press, customCurl]);
  await fireEvent.press(screen.getByRole('button', { name: 'Equipment' }));
  await act(async () => fireEvent.press(screen.getByText('Custom')));
  expect(screen.getByRole('button', { name: 'Equipment: Custom' })).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'Custom Dumbbell Curl' })).toBeVisible();
  expect(screen.queryByRole('checkbox', { name: 'Bench Press' })).toBeNull();

  // Picking an equipment option replaces Custom rather than combining with it.
  await fireEvent.press(screen.getByRole('button', { name: 'Equipment: Custom' }));
  await act(async () => fireEvent.press(screen.getByText('Barbell')));
  expect(screen.getByRole('button', { name: 'Equipment: Barbell' })).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'Bench Press' })).toBeVisible();
  expect(screen.queryByRole('checkbox', { name: 'Custom Dumbbell Curl' })).toBeNull();

  // Returning to All equipment shows everything again.
  await fireEvent.press(screen.getByRole('button', { name: 'Equipment: Barbell' }));
  await act(async () => fireEvent.press(screen.getByText('All equipment')));
  expect(screen.getByRole('button', { name: 'Equipment' })).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'Bench Press' })).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'Custom Dumbbell Curl' })).toBeVisible();
});

test('the (?) button opens muscle set credits without selecting the exercise and traps accessibility focus', async () => {
  const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
  const focusSpy = jest
    .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
    .mockImplementation(() => undefined);
  const benchCredits: Exercise = {
    ...bench,
    default_muscle_set_credits: [
      { muscle_name: 'Pectorals', sets: 1 },
      { muscle_name: 'Triceps', sets: 0.5 },
    ],
  };
  await openPicker([benchCredits, press]);
  await fireEvent.press(screen.getByRole('button', { name: 'Muscle set credits for Bench Press' }));
  expect(dismissSpy).toHaveBeenCalled();
  expect(screen.getByText('MUSCLE SET CREDITS')).toBeVisible();
  expect(screen.getByText('Pectorals')).toBeVisible();
  expect(screen.getByText('1 set')).toBeVisible();
  expect(screen.getByText('Triceps')).toBeVisible();
  expect(screen.getByText('0.5 sets')).toBeVisible();
  // Screen-reader focus moves to the sheet's title.
  await waitFor(() => expect(focusSpy).toHaveBeenCalledWith(expect.anything(), 'focus'));
  const titleNode = focusSpy.mock.calls[0][0] as unknown as { props: { children: unknown } };
  expect(titleNode.props.children).toBe('Bench Press');
  focusSpy.mockClear();
  // While the inline credits overlay is open, picker controls are hidden from assistive tech.
  expect(screen.queryByRole('checkbox', { name: 'Bench Press' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();

  await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByText('MUSCLE SET CREDITS')).toBeNull();
  // Closing restores picker controls to assistive tech and leaves Bench Press unselected.
  expect(screen.getByRole('checkbox', { name: 'Bench Press' })).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
  // Focus returns to the (?) that opened the sheet.
  await waitFor(() => expect(focusSpy).toHaveBeenCalledWith(expect.anything(), 'focus'));
  const triggerNode = focusSpy.mock.calls[0][0] as unknown as {
    props: { accessibilityLabel?: string };
  };
  expect(triggerNode.props.accessibilityLabel).toBe('Muscle set credits for Bench Press');
  dismissSpy.mockRestore();
  focusSpy.mockRestore();
});
