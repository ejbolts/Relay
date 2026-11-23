import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect, type ReactNode } from 'react';
import { Alert, Platform } from 'react-native';
import { readActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { apiSend, currentUser } from '../../data/api';
import type { TrackedWorkout, WorkoutInput } from '../../../../frontend/src/types';
import { deviceStorage } from '../../data/deviceStorage';
import { useUpNext } from '../../data/queries';
import { SessionProvider } from '../../session/SessionProvider';
import { memoryKv } from '../../testing/memoryKvStore';
import { showMenu, type MenuOption } from '../../ui/prompts';
import { pushDay, types } from './testFixtures';
import { useWorkout, WorkoutProvider } from './WorkoutProvider';
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
jest.mock('./restAlerts', () => ({
  askForRestAlerts: jest.fn(async () => undefined),
  syncRestAlert: jest.fn(async () => undefined),
}));
jest.mock('../../ui/prompts', () => ({
  promptText: jest.fn(),
  showMenu: jest.fn(),
  PromptHost: () => null,
}));
jest.mock('../../ui/Toast', () => ({
  showToast: jest.fn(),
  ToastHost: () => null,
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
jest.mock('../../data/queries', () => {
  const fixtures = jest.requireActual<typeof import('./testFixtures')>('./testFixtures');
  return {
    ...jest.requireActual<typeof import('../../data/queries')>('../../data/queries'),
    useDashboard: () => ({
      data: {
        recommendation: { category: 'push' },
        history: { first_workout_date: '2025-01-04' },
      },
    }),
    useWorkoutHistory: () => ({ data: [fixtures.lastPush] }),
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
