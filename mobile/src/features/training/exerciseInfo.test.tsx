import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { partialSetsEnabledForWeek } from '../../../../frontend/src/exercisePartialSets';
import type { Exercise, LiftRanking } from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { ExerciseDetailScreen } from './ExerciseDetailScreen';
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
    DateField: (props: { label: string; value: string }) =>
      createElement(Text, { accessibilityLabel: props.label }, props.value),
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
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (!(path in responses)) throw new Error(`Unexpected request ${path}`);
    return responses[path] as never;
  });
});

afterEach(() => client.clear());

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

  test('shows an error alert when saving partial sets fails', async () => {
    jest.mocked(apiSend).mockRejectedValueOnce(new Error('offline'));
    await open(<ExerciseDetailScreen exerciseId="bench" />);
    const help = await screen.findByRole('button', { name: 'Muscle set credits for Bench Press' });
    await fireEvent.press(help);

    await act(async () => {
      fireEvent(screen.getByLabelText('Count partial sets'), 'valueChange', true);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save partial sets. Try again.',
    );
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

  test('hides when the leaderboard is empty or fails to load', async () => {
    responses['/api/sharing/lifts/bench'] = { entries: [] };
    const view = await open(<LiftLeaderboardCard exerciseId="bench" />);
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith('/api/sharing/lifts/bench', expect.anything()),
    );
    expect(screen.queryByLabelText('Friends')).toBeNull();

    jest.mocked(apiGet).mockRejectedValueOnce(new Error('sharing_required'));
    await view.rerender(withProviders(<LiftLeaderboardCard exerciseId="other" />));
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith('/api/sharing/lifts/other', expect.anything()),
    );
    expect(screen.queryByLabelText('Friends')).toBeNull();
  });
});
