import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { partialSetsEnabledForWeek } from '../../../../frontend/src/exercisePartialSets';
import type { Exercise, LiftRanking, TrainingPreferences } from '../../../../frontend/src/types';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { queryKeys } from '../../data/queries';
import { nextSessionEpoch } from '../../session/sessionEpoch';
import { socialKeys } from '../social/socialQueries';
import { ExerciseDetailScreen } from './ExerciseDetailScreen';
import { exerciseInfoKeys, syncLiftLeaderboardsForSharing } from './exerciseInfoQueries';
import { ExerciseMuscleHelpSheet } from './ExerciseMuscleHelp';
import { ExercisesSection } from './ExercisesSection';
import { LiftLeaderboardCard } from './LiftLeaderboardCard';
import {
  bench,
  benchProgress,
  exercise,
  library,
  preferences,
  records,
  running,
  squat,
  TODAY,
} from './trainingFixtures';

const mockRouter = { push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
}));
jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(async () => undefined),
  unlockAsync: jest.fn(async () => undefined),
  OrientationLock: { LANDSCAPE: 'landscape' },
}));
jest.mock('../../ui/prompts', () => ({
  promptText: jest.fn(),
  showMenu: jest.fn(),
  PromptHost: () => null,
}));
jest.mock('../../ui/DateField', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    DateField: (props: { label: string; value: string; disabled?: boolean }) =>
      createElement(
        Text,
        { accessibilityLabel: props.label, accessibilityState: { disabled: !!props.disabled } },
        props.value,
      ),
  };
});
jest.mock('../../ui/MenuButton', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MenuButton: (props: { accessibilityLabel: string }) =>
      createElement(View, { accessibilityLabel: props.accessibilityLabel }),
  };
});
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('@react-native-segmented-control/segmented-control', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return function SegmentedControl(props: {
    values: string[];
    selectedIndex: number;
    accessibilityLabel: string;
    onChange: (event: { nativeEvent: { selectedSegmentIndex: number } }) => void;
  }) {
    return createElement(
      View,
      { accessibilityLabel: props.accessibilityLabel },
      props.values.map((value, index) =>
        createElement(
          Pressable,
          {
            key: value,
            accessibilityRole: 'tab',
            accessibilityState: { selected: index === props.selectedIndex },
            onPress: () => props.onChange({ nativeEvent: { selectedSegmentIndex: index } }),
          },
          createElement(Text, null, value),
        ),
      ),
    );
  };
});

const benchWithCredits: Exercise = {
  ...bench,
  partial_sets_default: true,
  partial_sets_enabled: false,
  partial_set_weeks: [
    { week_start: '2026-11-02', enabled: false },
    { week_start: '2026-11-09', enabled: true },
    { week_start: '2026-11-16', enabled: false },
  ],
  default_muscle_set_credits: [
    { muscle_name: 'Pectorals', sets: 1 },
    { muscle_name: 'Triceps', sets: 0.5 },
  ],
};

const samRanking: LiftRanking = {
  member: { id: 'sam', display_name: 'Sam Chen', profile_photo_url: null },
  is_you: false,
  best: {
    exercise_id: 'bench',
    weight_kg: 105,
    reps: 5,
    estimated_1rm: 122.5,
    achieved_date: '2026-11-20',
    normalised: false,
  },
};

const yourRanking: LiftRanking = {
  member: { id: 'me', display_name: 'Preview', profile_photo_url: null },
  is_you: true,
  best: {
    exercise_id: 'bench',
    weight_kg: 100,
    reps: 5,
    estimated_1rm: 116.7,
    achieved_date: '2026-11-21',
    normalised: true,
  },
};

let responses: Record<string, unknown>;
let client: QueryClient;

function withProviders(children: ReactNode) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

function open(children: ReactNode) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(withProviders(children));
}

beforeAll(() => {
  jest.useFakeTimers({
    now: TODAY,
    doNotFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'nextTick',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'hrtime',
      'performance',
    ],
  });
});
afterAll(() => jest.useRealTimers());

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(apiSend).mockReset();
  onlineManager.setOnline(true);
  responses = {
    '/api/exercises': [benchWithCredits, squat, running],
    '/api/training-preferences': preferences,
    '/api/training-blocks': { blocks: [] },
    '/api/personal-records?include_blocks=true&include_fresh_start=true': records,
    '/api/progress': library,
    '/api/progress/bench': benchProgress,
    '/api/progress/squat': { ...benchProgress, exercise: squat, points: [] },
    '/api/exercises/bench/weight-mapping': {
      enabled: false,
      reference_machine_id: null,
      machines: [],
    },
    '/api/exercises/squat/weight-mapping': {
      enabled: false,
      reference_machine_id: null,
      machines: [],
    },
    '/api/sharing/lifts/bench': { entries: [samRanking, yourRanking] },
    '/api/sharing/lifts/squat': { entries: [samRanking] },
    '/api/sharing': { visibility: 'friends', pending_requests: 0 },
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (!(path in responses)) throw new Error(`Unexpected request ${path}`);
    return responses[path] as never;
  });
});

afterEach(() => {
  onlineManager.setOnline(true);
  client.clear();
});

describe('muscle set credits (?) dialog', () => {
  test('opens from an exercise list row without navigating, browses weeks and saves partial sets', async () => {
    let currentBench = benchWithCredits;
    jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => {
      const { partial_sets_enabled, week_start } = body as {
        partial_sets_enabled: boolean;
        week_start: string;
      };
      const updated: Exercise = {
        ...currentBench,
        partial_set_weeks: [
          ...(currentBench.partial_set_weeks ?? []).filter(
            (item) => item.week_start !== week_start,
          ),
          { week_start, enabled: partial_sets_enabled },
        ],
      };
      updated.partial_sets_enabled = partialSetsEnabledForWeek(updated, '2026-11-16');
      currentBench = updated;
      responses['/api/exercises'] = [currentBench, squat, running];
      return updated as never;
    });

    await open(<ExercisesSection />);
    const help = await screen.findByRole('button', { name: 'Muscle set credits for Bench Press' });
    await fireEvent.press(help);

    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByText('MUSCLE SET CREDITS')).toBeVisible();
    expect(screen.getByText('Direct work')).toBeVisible();
    expect(screen.getAllByText('Pectorals').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1 set')).toBeVisible();
    expect(screen.getByText('Partial credit · assistance')).toBeVisible();
    expect(screen.getAllByText('Triceps').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Off')).toBeVisible();
    expect(screen.getByLabelText('Partial-set week')).toHaveTextContent('2026-11-16');
    expect(screen.getByRole('button', { name: 'Next partial-set week' })).toBeDisabled();

    // Previous week (2026-11-09) had partial sets enabled.
    await fireEvent.press(screen.getByRole('button', { name: 'Previous partial-set week' }));
    expect(screen.getByLabelText('Partial-set week')).toHaveTextContent('2026-11-09');
    expect(screen.getByText('0.5 sets')).toBeVisible();

    // Two weeks back (2026-11-02) had partial sets off; toggling it saves only that week.
    await fireEvent.press(screen.getByRole('button', { name: 'Previous partial-set week' }));
    expect(screen.getByLabelText('Partial-set week')).toHaveTextContent('2026-11-02');
    expect(screen.getByText('Off')).toBeVisible();

    await act(async () => {
      fireEvent(screen.getByLabelText('Count partial sets'), 'valueChange', true);
    });
    expect(apiSend).toHaveBeenCalledWith('/api/exercises/bench/partial-sets', 'PATCH', {
      partial_sets_enabled: true,
      week_start: '2026-11-02',
    });
    expect(await screen.findByText('0.5 sets')).toBeVisible();

    // Returning to this week keeps its own setting (Off).
    await fireEvent.press(screen.getByRole('button', { name: 'Next partial-set week' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Next partial-set week' }));
    expect(screen.getByLabelText('Partial-set week')).toHaveTextContent('2026-11-16');
    expect(screen.getByText('Off')).toBeVisible();
  });

  test('disables week selection and saving while preferences load, and re-snaps if week_start changes', async () => {
    // TODAY is Sunday 2026-11-22: a Sunday-start account must not send Monday 2026-11-16 while
    // training preferences are still pending.
    let resolvePreferences!: (value: TrainingPreferences) => void;
    jest.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/api/training-preferences') {
        return new Promise<TrainingPreferences>((resolve) => {
          resolvePreferences = resolve;
        }) as never;
      }
      if (!(path in responses)) throw new Error(`Unexpected request ${path}`);
      return responses[path] as never;
    });

    await open(<ExerciseMuscleHelpSheet exercise={benchWithCredits} onClose={jest.fn()} />);
    await screen.findByLabelText('Count partial sets');

    expect(screen.getByRole('button', { name: 'Previous partial-set week' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next partial-set week' })).toBeDisabled();
    expect(screen.getByLabelText('Partial-set week')).toBeDisabled();

    await act(async () => {
      fireEvent(screen.getByLabelText('Count partial sets'), 'valueChange', true);
    });
    expect(apiSend).not.toHaveBeenCalled();

    // Once Sunday preferences arrive, the week snaps to Sunday 2026-11-22 and saving enables.
    await act(async () => {
      resolvePreferences({ ...preferences, week_start: 'sunday' });
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Partial-set week')).toHaveTextContent('2026-11-22'),
    );
    expect(screen.getByRole('button', { name: 'Previous partial-set week' })).toBeEnabled();
    expect(screen.getByLabelText('Partial-set week')).toBeEnabled();

    // Stepping back one week gives Sunday 2026-11-15; if week_start changes to Monday while open,
    // the picked week re-snaps to Monday 2026-11-09.
    await fireEvent.press(screen.getByRole('button', { name: 'Previous partial-set week' }));
    expect(screen.getByLabelText('Partial-set week')).toHaveTextContent('2026-11-15');
    await act(async () => {
      client.setQueryData<TrainingPreferences>(queryKeys.trainingPreferences, {
        ...preferences,
        week_start: 'monday',
      });
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Partial-set week')).toHaveTextContent('2026-11-09'),
    );
  });

  test('drops a deferred PATCH reply after a sign-out and sign-in without touching the new cache', async () => {
    let resolvePatch!: (value: Exercise) => void;
    jest.mocked(apiSend).mockImplementationOnce(
      () =>
        new Promise<Exercise>((resolve) => {
          resolvePatch = resolve;
        }) as never,
    );

    await open(<ExerciseMuscleHelpSheet exercise={benchWithCredits} onClose={jest.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Count partial sets')).toBeEnabled());

    await act(async () => {
      fireEvent(screen.getByLabelText('Count partial sets'), 'valueChange', true);
    });
    expect(apiSend).toHaveBeenCalledTimes(1);

    // Simulate signing out and signing back in with fresher exercise data in the new session.
    nextSessionEpoch();
    const freshBench: Exercise = { ...benchWithCredits, is_favorite: true };
    client.setQueryData<Exercise[]>(queryKeys.exercises, [freshBench, squat, running]);
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    // The old session's PATCH resolves with stale data (is_favorite: false).
    await act(async () => {
      resolvePatch({ ...benchWithCredits, is_favorite: false, partial_sets_enabled: true });
    });

    const cached = client.getQueryData<Exercise[]>(queryKeys.exercises);
    expect(cached?.find((item) => item.id === 'bench')?.is_favorite).toBe(true);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  test('shows an error alert when saving partial sets fails and saves cleanly on retry', async () => {
    const savedBench: Exercise = {
      ...benchWithCredits,
      partial_sets_enabled: true,
      partial_set_weeks: [
        ...(benchWithCredits.partial_set_weeks ?? []).filter(
          (item) => item.week_start !== '2026-11-16',
        ),
        { week_start: '2026-11-16', enabled: true },
      ],
    };
    jest
      .mocked(apiSend)
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async () => {
        responses['/api/exercises'] = [savedBench, squat, running];
        return savedBench as never;
      });

    await open(<ExerciseDetailScreen exerciseId="bench" />);
    const help = await screen.findByRole('button', { name: 'Muscle set credits for Bench Press' });
    await fireEvent.press(help);
    await waitFor(() => expect(screen.getByLabelText('Partial-set week')).toBeEnabled());

    await act(async () => {
      fireEvent(screen.getByLabelText('Count partial sets'), 'valueChange', true);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save partial sets. Try again.',
    );

    // Retrying clears the error alert and saves the partial-set choice.
    await act(async () => {
      fireEvent(screen.getByLabelText('Count partial sets'), 'valueChange', true);
    });
    expect(await screen.findByText('0.5 sets')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(apiSend).toHaveBeenCalledTimes(2);
  });

  test('explains cardio exercises and exercises with no credits', async () => {
    const view = await open(<ExerciseMuscleHelpSheet exercise={running} onClose={jest.fn()} />);
    expect(
      screen.getByText('Cardio does not add strength sets to your weekly muscle totals.'),
    ).toBeVisible();

    const empty = exercise('empty', 'Custom Stretch', { default_muscle_set_credits: [] });
    await view.rerender(
      withProviders(<ExerciseMuscleHelpSheet exercise={empty} onClose={jest.fn()} />),
    );
    expect(
      screen.getByText('No muscle set credits are available for this exercise.'),
    ).toBeVisible();
  });
});

describe("friends' lift ranking", () => {
  test('revalidates a stale cached Private choice and shows the ranking once sharing is on', async () => {
    // Settings cached Private earlier; sharing was then turned on from another device.
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    client.setQueryData(
      socialKeys.choices,
      { visibility: 'private', pending_requests: 0 },
      { updatedAt: 0 },
    );
    await render(withProviders(<LiftLeaderboardCard exerciseId="bench" />));

    expect(await screen.findByLabelText('Friends')).toBeVisible();
    expect(screen.getByText('Sam Chen')).toBeVisible();
    expect(apiGet).toHaveBeenCalledWith('/api/sharing', expect.anything());
    expect(apiGet).toHaveBeenCalledWith('/api/sharing/lifts/bench', expect.anything());
  });

  test('pull-to-refresh on exercise detail refreshes sharing choices', async () => {
    await open(<ExerciseDetailScreen exerciseId="bench" />);
    await screen.findByLabelText('Friends');
    const sharingCalls = () =>
      jest.mocked(apiGet).mock.calls.filter(([path]) => path === '/api/sharing').length;
    const before = sharingCalls();

    await act(async () => {
      // RefreshControl is not a host element in Jest; call the ScrollView's refresh handler.
      const scroll = screen.getByTestId('exercise-detail-scroll');
      scroll.props.refreshControl.props.onRefresh();
    });
    await waitFor(() => expect(sharingCalls()).toBe(before + 1));
  });

  test('ranks you among friends on exercise detail and opens a friend profile', async () => {
    await open(<ExerciseDetailScreen exerciseId="bench" />);
    const card = await screen.findByLabelText('Friends');
    expect(within(card).getByText('All-time est. 1RM')).toBeVisible();
    expect(within(card).getByText('Sam Chen')).toBeVisible();
    expect(within(card).getByText('122.5 kg')).toBeVisible();
    expect(within(card).getByText('105 kg × 5')).toBeVisible();
    expect(within(card).getByText('You')).toBeVisible();
    expect(within(card).getByText('≈ 116.7 kg')).toBeVisible();
    expect(within(card).getByText('≈ 100 kg × 5')).toBeVisible();

    // Only friends open a profile; your own row is not a button.
    expect(within(card).queryByRole('button', { name: /^2\. You/ })).toBeNull();
    expect(within(card).getByLabelText('2. You, ≈ 116.7 kg')).toBeVisible();

    await fireEvent.press(
      within(card).getByRole('button', { name: '1. Sam Chen, 122.5 kg. Open profile' }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/social/profile/[id]',
      params: { id: 'sam' },
    });
  });

  test('still shows friends ranking when you have no sessions for the exercise yet', async () => {
    await open(<ExerciseDetailScreen exerciseId="squat" />);
    expect(
      await screen.findByText('Complete this exercise in a workout to start its progress graph.'),
    ).toBeVisible();
    const card = await screen.findByLabelText('Friends');
    expect(within(card).getByText('Sam Chen')).toBeVisible();
  });

  test('hides a previously loaded ranking when offline, on a 403 refetch, and when sharing turns Private', async () => {
    await open(<LiftLeaderboardCard exerciseId="bench" />);
    expect(await screen.findByLabelText('Friends')).toBeVisible();
    expect(screen.getByText('Sam Chen')).toBeVisible();

    // Going offline immediately suppresses stale cached entries.
    await act(async () => {
      onlineManager.setOnline(false);
    });
    expect(screen.queryByLabelText('Friends')).toBeNull();

    // Returning online restores the card until a refetch fails with 403 sharing_required on the same key.
    await act(async () => {
      onlineManager.setOnline(true);
    });
    expect(await screen.findByLabelText('Friends')).toBeVisible();

    let rejectLeaderboard = true;
    jest.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/api/sharing/lifts/bench' && rejectLeaderboard) {
        throw new ApiError(403, 'Sharing required', 'sharing_required');
      }
      if (!(path in responses)) throw new Error(`Unexpected request ${path}`);
      return responses[path] as never;
    });
    await act(async () => {
      await client.refetchQueries({ queryKey: exerciseInfoKeys.liftLeaderboard('bench') });
    });
    await waitFor(() => expect(screen.queryByLabelText('Friends')).toBeNull());

    // Recovering online with a successful refetch shows it again; switching sharing to Private removes it.
    rejectLeaderboard = false;
    await act(async () => {
      await client.refetchQueries({ queryKey: exerciseInfoKeys.liftLeaderboard('bench') });
    });
    expect(await screen.findByLabelText('Friends')).toBeVisible();

    await act(async () => {
      client.setQueryData(socialKeys.choices, { visibility: 'private' });
      syncLiftLeaderboardsForSharing(client, 'private');
    });
    await waitFor(() => expect(screen.queryByLabelText('Friends')).toBeNull());
    expect(client.getQueryData(exerciseInfoKeys.liftLeaderboard('bench'))).toBeUndefined();
  });
});
