import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Alert, Platform, StyleSheet } from 'react-native';
import { readActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { freshTips, parseTips, tipStorageKey } from '../../../../frontend/src/tipsState';
import { resetTipsForTests } from '../guides/tips';
import { apiSend, currentUser } from '../../data/api';
import type { TrackedWorkout, WorkoutInput } from '../../../../frontend/src/types';
import { deviceStorage } from '../../data/deviceStorage';
import { useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { showMenu, type MenuOption } from '../../ui/prompts';
import { pushDay, types } from './testFixtures';
import { useWorkout, WorkoutProvider } from './WorkoutProvider';
import { setDropIndex } from './SetDrag';
import { WorkoutSheet } from './WorkoutSheet';

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
}));
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => children,
}));
// The set drag's pan gesture: each row's config lands on a stand-in view, so a test can run it.
jest.mock('react-native-gesture-handler', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ...jest.requireActual<typeof import('react-native-gesture-handler')>(
      'react-native-gesture-handler',
    ),
    usePanGesture: (config: unknown) => config,
    GestureDetector: ({ gesture, children }: { gesture: unknown; children: ReactNode }) => (
      <View testID="set-drag" {...{ gesture }}>
        {children}
      </View>
    ),
  };
});
jest.mock('./restAlerts', () => ({
  askForRestAlerts: jest.fn(async () => undefined),
  syncRestAlert: jest.fn(async () => undefined),
}));
jest.mock('../../ui/prompts', () => ({
  promptText: jest.fn(),
  showMenu: jest.fn(),
  promptShowing: () => mockPromptOpen.value,
  PromptHost: () => null,
}));
jest.mock('../../ui/Toast', () => ({
  showToast: jest.fn(),
  ToastHost: () => null,
  toastShowing: () => false,
  toastAccount: () => 'u1',
  toastAccountFor: () => 'u1',
  isToastAccountCurrent: () => true,
}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'token') }));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  currentUser: jest.fn(),
  apiSend: jest.fn(),
  apiGet: jest.fn(async () => []),
}));
/** Whether last week's push day counts as a saved workout (it is sample data otherwise). */
const mockSavedHistory = { value: false, five: false };
/** Whether a menu or text prompt is up, as ui/prompts reports it. */
const mockPromptOpen = { value: false };
jest.mock('../../data/queries', () => {
  const fixtures = jest.requireActual<typeof import('./testFixtures')>('./testFixtures');
  const sample = [fixtures.lastPush];
  const saved = [{ ...fixtures.lastPush, is_sample: false }];
  const five = [1, 2, 3, 4, 5].map((n) => ({
    ...fixtures.lastPush,
    id: `push-${n}`,
    is_sample: false,
  }));
  return {
    ...jest.requireActual<typeof import('../../data/queries')>('../../data/queries'),
    useDashboard: () => ({
      data: {
        recommendation: { category: 'push' },
        history: { first_workout_date: '2025-01-04' },
      },
    }),
    useWorkoutHistory: () => ({
      data: mockSavedHistory.five ? five : mockSavedHistory.value ? saved : sample,
    }),
    useWorkoutTypes: () => ({
      data: fixtures.types,
      isPlaceholderData: false,
      fetchStatus: 'idle',
    }),
    useSavedExercises: () => ({ data: {} }),
    useExercises: () => ({ data: fixtures.exercises }),
    useTrainingPreferences: () => ({
      data: { preferred_weight_unit: 'kg', default_rest_seconds: 90 },
    }),
    useUpNext: jest.fn(),
    refreshTraining: jest.fn(async () => undefined),
  };
});

const user = { id: 'u1', username: 'preview' } as Awaited<ReturnType<typeof currentUser>>;
let client: QueryClient;

beforeEach(() => {
  jest.clearAllMocks();
  memoryKv.clear();
  resetTipsForTests();
  mockSavedHistory.value = false;
  mockSavedHistory.five = false;
  mockPromptOpen.value = false;
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.mocked(currentUser).mockResolvedValue(user);
  jest.mocked(useUpNext).mockReturnValue({
    template: pushDay,
    label: 'Push',
    recommendation: { category: 'push' },
    type: types.find((type) => type.id === 'push'),
  } as unknown as ReturnType<typeof useUpNext>);
});
afterEach(() => client.clear());

let saved: WorkoutInput[] = [];
beforeEach(() => {
  saved = [];
  jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => {
    saved.push(body as WorkoutInput);
    return { id: 'saved-1' } as TrackedWorkout;
  });
  // Pick the last button of any alert (Finish workout, Log set).
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    buttons?.at(-1)?.onPress?.();
  });
});

async function openLogger(start = true) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const captured: { start?: ReturnType<typeof useWorkout>['start'] } = {};
  function Probe() {
    const workout = useWorkout();
    useEffect(() => {
      captured.start = workout.start;
    });
    return null;
  }
  const view = await render(
    <QueryClientProvider client={client}>
      <SessionProvider>
        <WorkoutProvider>
          <WorkoutSheet />
          <Probe />
        </WorkoutProvider>
      </SessionProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(currentUser).toHaveBeenCalled());
  await waitFor(() => expect(captured.start).toBeDefined());
  if (start) await act(async () => captured.start!({ kind: 'up-next' }));
  expect(await screen.findByText('Bench Press')).toBeVisible();
  return view;
}

const option = (options: MenuOption[], label: string) => {
  const found = options.find((item) => item.label.startsWith(label));
  if (!found) throw new Error(`No ${label} in ${options.map((item) => item.label).join(', ')}`);
  return found;
};

const draft = () => readActiveWorkoutDraft(deviceStorage);
const menuCall = (title: string) => {
  const call = jest
    .mocked(showMenu)
    .mock.calls.findLast(([heading]) => heading === title || heading?.startsWith(`${title} ·`));
  if (!call) throw new Error(`No menu ${title}`);
  return call[1] as MenuOption[];
};
const MINUTE = 60_000;

describe('correcting the workout time', () => {
  test('tapping the clock corrects the time so far, and the finish saves it', async () => {
    await openLogger();
    const clock = screen.getByRole('button', { name: /^Correct workout time, Live 0:0\d$/ });
    await fireEvent.press(clock);
    expect(screen.getByText('Workout time so far')).toBeVisible();
    expect(screen.getByLabelText('Hours').props.value).toBe('0');
    expect(screen.getByLabelText('Minutes').props.value).toBe('0');
    await fireEvent.changeText(screen.getByLabelText('Minutes'), '45');
    await fireEvent.press(screen.getByRole('button', { name: 'Set time' }));

    expect(
      await screen.findByRole('button', { name: /^Correct workout time, Live 45:0\d$/ }),
    ).toBeVisible();
    const stored = draft()!;
    // The real start stays; the correction is kept beside the pause, as the web stores it.
    expect(stored.adjustedMs).toBeGreaterThan(44 * MINUTE);
    expect(stored.adjustedMs).toBeLessThanOrEqual(45 * MINUTE);
    expect(stored.durationOverrideMinutes).toBeNull();

    await fireEvent.press(screen.getAllByRole('button', { name: 'Complete set 1' })[0]);
    await fireEvent.press(screen.getByRole('button', { name: 'Finish workout' }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].duration_minutes).toBe(45);
  });

  test('the workout menu opens the same correction, and Cancel leaves the clock alone', async () => {
    await openLogger();
    await fireEvent.press(screen.getByRole('button', { name: 'Workout options' }));
    const options = jest.mocked(showMenu).mock.calls.at(-1)![1] as MenuOption[];
    expect(options.map((item) => item.label).slice(0, 2)).toEqual([
      'Rename workout',
      'Adjust workout time',
    ]);
    await act(async () => option(options, 'Adjust workout time').onPress());
    await fireEvent.changeText(screen.getByLabelText('Hours'), '2');
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      screen.getByRole('button', { name: /^Correct workout time, Live 0:0\d$/ }),
    ).toBeVisible();
    expect(draft()?.adjustedMs).toBeUndefined();
  });

  test('out-of-range time stops the save instead of being clamped or cut short', async () => {
    await openLogger();
    await fireEvent.press(screen.getByRole('button', { name: /^Correct workout time/ }));
    await fireEvent.changeText(screen.getByLabelText('Minutes'), '65');
    expect(screen.getByText('0 to 59')).toBeVisible();
    const setTime = screen.getByRole('button', { name: 'Set time' });
    expect(setTime.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(setTime);
    expect(screen.getByText('Workout time so far')).toBeVisible();
    expect(draft()?.adjustedMs).toBeUndefined();
    // A pasted 100 stays 100 (and invalid); it is never cut to 10.
    await fireEvent.changeText(screen.getByLabelText('Minutes'), '100');
    expect(screen.getByLabelText('Minutes').props.value).toBe('100');
    expect(screen.getByText('0 to 59')).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText('Hours'), '24');
    expect(screen.getByText('0 to 23')).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText('Hours'), '1');
    await fireEvent.changeText(screen.getByLabelText('Minutes'), '');
    await fireEvent.press(screen.getByRole('button', { name: 'Set time' }));
    expect(
      await screen.findByRole('button', { name: /^Correct workout time, Live 1:00:0\d$/ }),
    ).toBeVisible();
  });

  test('a corrected clock keeps counting after the app reopens', async () => {
    const view = await openLogger();
    await fireEvent.press(screen.getByRole('button', { name: /^Correct workout time/ }));
    await fireEvent.changeText(screen.getByLabelText('Hours'), '1');
    await fireEvent.changeText(screen.getByLabelText('Minutes'), '5');
    await fireEvent.press(screen.getByRole('button', { name: 'Set time' }));
    const startedAt = draft()!.startedAt;
    await view.unmount();
    client.clear();

    await openLogger(false);
    expect(
      await screen.findByRole('button', { name: /^Correct workout time, Live 1:05:0\d$/ }),
    ).toBeVisible();
    expect(draft()!.startedAt).toBe(startedAt);
  });

  test('correcting a paused workout keeps it paused', async () => {
    await openLogger();
    await fireEvent.press(screen.getByRole('button', { name: 'Workout options' }));
    await act(async () =>
      option(
        jest.mocked(showMenu).mock.calls.at(-1)![1] as MenuOption[],
        'Pause workout',
      ).onPress(),
    );
    await fireEvent.press(screen.getByRole('button', { name: /^Correct workout time, 0:0\d$/ }));
    await fireEvent.changeText(screen.getByLabelText('Minutes'), '20');
    await fireEvent.press(screen.getByRole('button', { name: 'Set time' }));
    expect(
      await screen.findByRole('button', { name: 'Correct workout time, 20:00' }),
    ).toBeVisible();
    expect(screen.getByText('· Paused')).toBeVisible();
    expect(draft()?.pausedAt).not.toBeNull();
  });
});

describe('folding an exercise card', () => {
  test('the chevron folds the card to a summary and opens it again', async () => {
    await openLogger();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Complete set 1' })[0]);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Collapse Bench Press' })[0]);
    expect(screen.queryByRole('button', { name: 'Complete set 2' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add set to Bench Press' })).toBeNull();
    expect(screen.getByText('1 completed set')).toBeVisible();
    const expand = screen.getByRole('button', { name: 'Expand Bench Press' });
    expect(expand.props.accessibilityState).toMatchObject({ expanded: false });

    await fireEvent.press(expand);
    expect(screen.getByRole('button', { name: 'Complete set 2' })).toBeVisible();
    expect(screen.queryByText('1 completed set')).toBeNull();
    // Folding only changes what shows: the sets are as they were.
    expect(draft()?.movements[0].sets.map((set) => set.completed)).toEqual([true, false]);
  });

  test('the collapse button under the sets folds the card and turns green once the sets are done', async () => {
    await openLogger();
    const footer = () => screen.getAllByRole('button', { name: 'Collapse Bench Press' }).at(-1)!;
    expect(screen.getAllByRole('button', { name: 'Collapse Bench Press' })).toHaveLength(2);
    const fill = () => StyleSheet.flatten(footer().props.style).backgroundColor;
    const before = fill();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Complete set 1' })[0]);
    expect(fill()).toBe(before);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Complete set 2' })[0]);
    // Every working set ticked: the collapse button takes the green done treatment.
    expect(fill()).not.toBe(before);
    // Ticking every set never folds the card by itself.
    expect(screen.getAllByRole('button', { name: 'Collapse Bench Press' })).toHaveLength(2);
    await fireEvent.press(footer());
    expect(screen.getByText('2 completed sets')).toBeVisible();
  });

  test('a finished exercise opens folded, and marking it not finished opens it', async () => {
    const view = await openLogger();
    await fireEvent.press(screen.getByRole('button', { name: 'Finish Bench Press' }));
    // Finishing it keeps it open while you are looking at it.
    expect(screen.getAllByRole('button', { name: 'Collapse Bench Press' })).toHaveLength(2);
    await view.unmount();
    client.clear();

    await openLogger(false);
    expect(screen.getByRole('button', { name: 'Expand Bench Press' })).toBeVisible();
    expect(screen.getByText(/^\d completed sets?$/)).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Mark Bench Press as not finished' }));
    expect(screen.getAllByRole('button', { name: 'Collapse Bench Press' })).toHaveLength(2);
  });
});

type DragConfig = {
  enabled: boolean;
  activateAfterLongPress: number;
  onActivate: () => void;
  onUpdate: (event: { translationY: number }) => void;
  onDeactivate: (event: { canceled: boolean }) => void;
};
const dragOf = (row: number) => screen.getAllByTestId('set-drag')[row].props.gesture as DragConfig;

async function layOutSets(height = 60) {
  const blocks = screen.getAllByTestId(/^set-block-/);
  for (const [index, block] of blocks.entries())
    await fireEvent(block, 'layout', {
      nativeEvent: { layout: { y: 100 + index * height, height } },
    });
}

async function dragSet(row: number, dy: number, canceled = false) {
  const drag = dragOf(row);
  await act(async () => drag.onActivate());
  await act(async () => drag.onUpdate({ translationY: dy }));
  await act(async () => dragOf(row).onDeactivate({ canceled }));
}

async function addOverheadPress() {
  await fireEvent.press(screen.getByRole('button', { name: 'Add exercise' }));
  await fireEvent.changeText(screen.getByLabelText('Search exercises'), 'press');
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add 1' }));
}

describe('folded supersets', () => {
  test('a folded card that becomes next in its superset round opens and says Up next', async () => {
    await openLogger();
    await addOverheadPress();
    await fireEvent.press(screen.getByRole('button', { name: 'Actions for Bench Press' }));
    await act(async () =>
      option(
        jest.mocked(showMenu).mock.calls.at(-1)![1] as MenuOption[],
        'Superset with',
      ).onPress(),
    );
    await act(async () => option(menuCall('Superset with'), 'Overhead Press').onPress());
    await fireEvent.press(screen.getAllByRole('button', { name: 'Collapse Overhead Press' })[0]);
    expect(screen.getByRole('button', { name: 'Expand Overhead Press' })).toBeVisible();
    expect(screen.queryByText('Up next')).toBeNull();

    // Logging Bench Press's set makes Overhead Press next in the round.
    await fireEvent.press(screen.getAllByRole('button', { name: 'Complete set 1' })[0]);
    expect(await screen.findByText('Up next')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Expand Overhead Press' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Collapse Overhead Press' })).toHaveLength(2);
  });
});

describe('dragging to reorder sets', () => {
  test('the drop place is the block under the dragged set’s middle', () => {
    const blocks = [
      { y: 0, height: 60 },
      { y: 60, height: 100 },
      { y: 160, height: 60 },
    ];
    expect(setDropIndex(blocks, 0, 20)).toBe(0);
    expect(setDropIndex(blocks, 0, 40)).toBe(1);
    expect(setDropIndex(blocks, 0, 200)).toBe(2);
    expect(setDropIndex(blocks, 2, -150)).toBe(0);
    expect(setDropIndex(blocks, 2, -400)).toBe(0);
    expect(setDropIndex([undefined, ...blocks.slice(1)], 0, 100)).toBe(0);
  });

  test('holding a set and dragging it moves the set, its numbers following', async () => {
    await openLogger();
    await fireEvent.changeText(
      screen.getByLabelText('Weight kilograms for set 1, suggested value'),
      '100',
    );
    expect(dragOf(0)).toMatchObject({ enabled: true, activateAfterLongPress: 500 });
    await layOutSets();
    await dragSet(0, 70);

    expect(draft()?.movements[0].sets.map((set) => set.weight_kg)).toEqual([80, 100]);
    expect(screen.getByLabelText(/^Weight kilograms for set 2/).props.value).toBe('100');
  });

  test('a release batched with the last move drops where the finger was', async () => {
    await openLogger();
    await fireEvent.changeText(
      screen.getByLabelText('Weight kilograms for set 1, suggested value'),
      '100',
    );
    await layOutSets();
    const drag = dragOf(0);
    await act(async () => drag.onActivate());
    // The final move and the release reach React together, before any re-render.
    await act(async () => {
      drag.onUpdate({ translationY: 70 });
      drag.onDeactivate({ canceled: false });
    });
    expect(draft()?.movements[0].sets.map((set) => set.weight_kg)).toEqual([80, 100]);
  });

  test('a short or cancelled drag leaves the sets where they were', async () => {
    await openLogger();
    await fireEvent.changeText(
      screen.getByLabelText('Weight kilograms for set 1, suggested value'),
      '100',
    );
    await layOutSets();
    await dragSet(0, 20);
    await dragSet(0, 90, true);
    expect(draft()?.movements[0].sets.map((set) => set.weight_kg)).toEqual([100, 80]);
  });

  test('screen readers move a set with Move up and Move down in its menu', async () => {
    await openLogger();
    await fireEvent.changeText(
      screen.getByLabelText('Weight kilograms for set 1, suggested value'),
      '100',
    );
    await fireEvent.press(screen.getAllByLabelText(/^Set 1 type: /)[0]);
    await act(async () => option(menuCall('Set 1'), 'Move down').onPress());
    expect(draft()?.movements[0].sets.map((set) => set.weight_kg)).toEqual([80, 100]);
  });

  test('a single set has nothing to reorder', async () => {
    await openLogger();
    await fireEvent.press(screen.getAllByLabelText(/^Set 2 type: /)[0]);
    await act(async () => option(menuCall('Set 2'), 'Delete set').onPress());
    expect(dragOf(0).enabled).toBe(false);
  });
});

const storedTips = () => parseTips(deviceStorage.getItem(tipStorageKey('u1')));
const TIP_WAIT = { timeout: 8000 };
const pause = (ms: number) => act(() => new Promise<void>((done) => setTimeout(done, ms)));

async function logWarmup() {
  await fireEvent.press(screen.getAllByLabelText(/^Set 1 type: /)[0]);
  await act(async () => option(menuCall('Set 1'), 'Warm-up').onPress());
  await fireEvent.press(screen.getAllByRole('button', { name: 'Complete set 1' })[0]);
}

describe('tips beside the logger', () => {
  test('logging a warm-up shows the set type tip, and Dismiss puts it away everywhere', async () => {
    await openLogger();
    await logWarmup();
    // A priority tip, so it shows even before the account has saved a workout.
    expect(await screen.findByText('Warm-up or working set?', {}, TIP_WAIT)).toBeVisible();
    expect(screen.getByLabelText('Quick tip')).toBeVisible();
    expect(storedTips().shows?.setType).toBe(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Dismiss tip' }));
    expect(screen.queryByText('Warm-up or working set?')).toBeNull();
    expect(storedTips().seen.setType).toBe('dismissed');
  }, 30000);

  test('Show tips off keeps the logger quiet', async () => {
    deviceStorage.setItem(tipStorageKey('u1'), JSON.stringify({ ...freshTips(), enabled: false }));
    await openLogger();
    await logWarmup();
    await pause(3000);
    expect(screen.queryByText('Warm-up or working set?')).toBeNull();
    expect(storedTips().shows?.setType).toBeUndefined();
  }, 30000);

  test('changing a warm-up to a working set learns the set type tip', async () => {
    await openLogger();
    await fireEvent.press(screen.getAllByLabelText(/^Set 1 type: /)[0]);
    await act(async () => option(menuCall('Set 1'), 'Warm-up').onPress());
    await fireEvent.press(screen.getAllByLabelText(/^Set 1 type: /)[0]);
    await act(async () => option(menuCall('Set 1'), 'Working set').onPress());
    expect(storedTips().seen.setType).toBe('learned');
  });

  test('deleting sets from the menu suggests swiping, after a logged set', async () => {
    mockSavedHistory.value = true;
    await openLogger();
    for (let i = 0; i < 3; i++)
      await fireEvent.press(screen.getByRole('button', { name: 'Add set to Bench Press' }));
    for (let i = 0; i < 3; i++) {
      await fireEvent.press(screen.getAllByLabelText(/^Set 3 type: /)[0]);
      await act(async () => option(menuCall('Set 3'), 'Delete set').onPress());
    }
    expect(storedTips().counts['menu-delete']).toBe(3);
    await fireEvent.press(screen.getAllByRole('button', { name: 'Complete set 1' })[0]);
    expect(await screen.findByText('One less tap', {}, TIP_WAIT)).toBeVisible();
  }, 30000);

  test('moving a set learns the reorder tip', async () => {
    await openLogger();
    await fireEvent.press(screen.getAllByLabelText(/^Set 1 type: /)[0]);
    await act(async () => option(menuCall('Set 1'), 'Move down').onPress());
    expect(storedTips().seen.reorder).toBe('learned');
  });

  test('swapping an exercise learns the swap tip', async () => {
    await openLogger();
    expect(storedTips().seen.swap).toBeUndefined();
    await fireEvent.press(screen.getByRole('button', { name: 'Actions for Bench Press' }));
    await act(async () =>
      option(
        jest.mocked(showMenu).mock.calls.at(-1)![1] as MenuOption[],
        'Swap exercise',
      ).onPress(),
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Browse all exercises' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Overhead Press' }));
    expect(draft()?.movements.map((item) => item.exerciseId)).toEqual(['press']);
    expect(storedTips().seen.swap).toBe('learned');
  });

  test('removing an exercise and adding another soon after counts as replacing it', async () => {
    mockSavedHistory.five = true;
    await openLogger();
    await fireEvent.press(screen.getByRole('button', { name: 'Actions for Bench Press' }));
    await act(async () =>
      option(
        jest.mocked(showMenu).mock.calls.at(-1)![1] as MenuOption[],
        'Remove exercise',
      ).onPress(),
    );
    expect(storedTips().counts['replace-exercise']).toBeUndefined();
    await addOverheadPress();
    expect(storedTips().counts['replace-exercise']).toBe(1);
  });

  test('a drag whose set is deleted mid-drag ends, and the tips go again', async () => {
    await openLogger();
    await logWarmup();
    await layOutSets();
    await act(async () => dragOf(1).onActivate());
    // Set 2 goes while it is held (deleted elsewhere); no release ever arrives.
    await fireEvent.press(screen.getAllByLabelText(/^Set 2 type: /)[0]);
    await act(async () => option(menuCall('Set 2'), 'Delete set').onPress());
    expect(await screen.findByText('Warm-up or working set?', {}, TIP_WAIT)).toBeVisible();
  }, 30000);

  test('a pending tip waits while a set is dragged or a menu is open', async () => {
    await openLogger();
    await logWarmup();
    // Pick a set up and keep holding it: the set type tip waits.
    await layOutSets();
    await act(async () => dragOf(1).onActivate());
    await pause(3000);
    expect(screen.queryByText('Warm-up or working set?')).toBeNull();
    // A menu opens as the drag ends: still waiting.
    mockPromptOpen.value = true;
    await act(async () => dragOf(1).onDeactivate({ canceled: true }));
    await pause(2500);
    expect(screen.queryByText('Warm-up or working set?')).toBeNull();
    expect(storedTips().shows?.setType).toBeUndefined();
    // Once nothing is in the way, the quiet moment starts again and the tip shows.
    mockPromptOpen.value = false;
    expect(await screen.findByText('Warm-up or working set?', {}, TIP_WAIT)).toBeVisible();
  }, 30000);
});
