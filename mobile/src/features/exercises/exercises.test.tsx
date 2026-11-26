import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DISMISSED_MERGE_SUGGESTIONS_KEY } from '../../../../frontend/src/exerciseMergeTargets';
import type {
  Exercise,
  ExerciseProgress,
  MachineProgressPoint,
  TrainingBlocks,
  WeightMapping,
} from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { memoryKv } from '../../testing/memoryKvStore';
import { showMenu, type MenuOption } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { selectBlock } from '../blocks/blockQueries';
import { ExerciseDetailScreen } from '../training/ExerciseDetailScreen';
import { ExercisesSection } from '../training/ExercisesSection';
import { exercise, preferences, TODAY } from '../training/trainingFixtures';
import { ExerciseEditScreen } from './ExerciseEditScreen';
import { ExerciseMergeScreen } from './ExerciseMergeScreen';
import { coachHighlight } from '../guides/GuideCoach';
import {
  activeSetupGuide,
  exitSetupGuide,
  resetSetupGuideForTests,
  startSetupGuide,
} from '../guides/setupGuides';
import { nextSessionEpoch } from '../../session/sessionEpoch';
import { resetTipsForTests, tipsFor } from '../guides/tips';
import { MachineWeightsScreen } from './MachineWeightsScreen';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  dismiss: jest.fn(),
  replace: jest.fn(),
};
const mockFocus = { current: true };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useIsFocused: () => mockFocus.current,
  // The header's buttons render with the screen, so a test can press them.
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
}));
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('../../ui/prompts', () => ({
  promptText: jest.fn(),
  showMenu: jest.fn(),
  PromptHost: () => null,
}));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));
jest.mock('./FactorSlider', () => ({ FactorSlider: () => null }));
// The native menu has no test renderer; this stand-in lists its items as buttons.
jest.mock('../../ui/MenuButton', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text, View } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    MenuButton: (props: {
      accessibilityLabel: string;
      items: { label: string; onPress: () => void }[];
    }) =>
      createElement(
        View,
        { accessibilityLabel: props.accessibilityLabel },
        props.items.map((item) =>
          createElement(
            Pressable,
            { key: item.label, accessibilityRole: 'button', onPress: item.onPress },
            createElement(Text, null, item.label),
          ),
        ),
      ),
  };
});
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

const shoulders = { category: 'push', muscle_group: 'Shoulders', equipment: 'Dumbbell' } as const;
const raises = exercise('raises', 'Lateral raises', {
  ...shoulders,
  is_custom: true,
  default_muscle_set_credits: [{ muscle_name: 'Side delts', sets: 1 }],
});
const lateral = exercise('lateral', 'Lateral Raise', {
  ...shoulders,
  default_muscle_set_credits: [{ muscle_name: 'Side delts', sets: 1 }],
});
const cable = exercise('cable', 'Cable Lateral Raise', {
  ...shoulders,
  equipment: 'Cable',
  default_muscle_set_credits: [{ muscle_name: 'Side delts', sets: 1 }],
});
const press = exercise('press', 'Chest Press', { equipment: 'Machine' });
const bench = exercise('bench', 'Bench Press');
const exercises: Exercise[] = [bench, press, raises, lateral, cable];

const blocks: TrainingBlocks = {
  blocks: [
    { id: 'base', name: 'Base', start_date: '2026-06-01', end_date: '2026-10-05' },
    {
      id: 'peak',
      name: 'Peak',
      start_date: '2026-10-05',
      end_date: null,
      planned_end_date: '2026-12-27',
    },
  ],
};

const session = (id: string, date: string, machine: string, weight: number) =>
  ({
    workout_id: id,
    workout_date: date,
    machine_photo_id: machine,
    best_weight_kg: weight,
    best_reps: 10,
    best_rpe: null,
    estimated_1rm: Math.round(weight * 1.333 * 10) / 10,
    volume_kg: weight * 30,
  }) satisfies MachineProgressPoint;
const sessions = [
  session('w1', '2026-10-13', 'cybex', 150),
  session('w2', '2026-10-27', 'hammer', 115),
  session('w3', '2026-11-10', 'cybex', 155),
  session('w4', '2026-11-17', 'hammer', 120),
];
const pressProgress: ExerciseProgress = {
  exercise: press,
  points: sessions,
  machine_points: sessions,
  personal_best_weight_kg: 155,
  personal_best_estimated_1rm: 206.6,
};
const machine = (id: string, caption: string, workouts: number) => ({
  id,
  caption,
  thumbnail_url: `/api/machine-photos/${id}/thumbnail`,
  workout_count: workouts,
  last_used_date: null,
  machine_kg: null,
  reference_kg: null,
});
const mapping: WeightMapping = {
  enabled: false,
  reference_machine_id: null,
  machines: [machine('cybex', 'Cybex', 2), machine('hammer', 'Hammer', 3)],
};

let responses: Record<string, unknown>;
let client: QueryClient;
function open(children: ReactNode) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}
const option = (options: MenuOption[], label: string) =>
  options.find((item) => item.label === label)!;

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
  memoryKv.clear();
  selectBlock('current');
  responses = {
    '/api/exercises': exercises,
    '/api/training-blocks': blocks,
    '/api/training-preferences': preferences,
    '/api/personal-records?include_blocks=true&include_fresh_start=true': [],
    '/api/progress': [],
    '/api/progress?block_id=peak': [],
    '/api/progress?block_id=base': [],
    '/api/progress/press': pressProgress,
    '/api/progress/press?block_id=peak': pressProgress,
    '/api/progress/raises?block_id=peak': { ...pressProgress, exercise: raises },
    '/api/exercises/press/weight-mapping': mapping,
    '/api/exercises/raises/weight-mapping': { ...mapping, machines: [] },
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (!(path in responses)) throw new Error(`Unexpected request ${path}`);
    return responses[path] as never;
  });
});
afterEach(() => client.clear());

describe('the exercise library', () => {
  test('reads trends for the running block, and the list options choose another', async () => {
    await open(<ExercisesSection />);
    await screen.findByRole('button', { name: /^Bench Press/ });
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith('/api/progress?block_id=peak', expect.anything()),
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Exercise list options' }));
    const choices = within(screen.getByLabelText('Training block'));
    expect(choices.getByRole('radio', { name: 'Peak (current)', checked: true })).toBeVisible();
    await fireEvent.press(choices.getByRole('radio', { name: 'Base' }));
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith('/api/progress?block_id=base', expect.anything()),
    );
    await fireEvent.press(choices.getByRole('radio', { name: 'All time' }));
    await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/progress', expect.anything()));

    await fireEvent.press(screen.getByRole('button', { name: 'Training blocks' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/blocks');
    await fireEvent.press(screen.getByRole('button', { name: 'Exercise list options' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Merge exercises' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/training/exercise-merge',
      params: {},
    });
  });

  test('a new exercise is created from the library, with Open in its confirmation', async () => {
    const created = exercise('face', 'Face Pull', { category: 'pull', muscle_group: 'Rear delts' });
    jest.mocked(apiSend).mockResolvedValueOnce(created);
    await open(<ExercisesSection />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Add exercise' }));
    await fireEvent.changeText(screen.getByLabelText('Exercise name'), 'Face Pull');
    await fireEvent.press(screen.getByRole('radio', { name: 'Pull' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Target muscle 1: Choose muscle' }));
    await act(async () =>
      option(jest.mocked(showMenu).mock.calls.at(-1)![1], 'Shoulders').onPress(),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save exercise' }));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(apiSend).toHaveBeenCalledWith(
      '/api/exercises',
      'POST',
      expect.objectContaining({ name: 'Face Pull', category: 'pull' }),
    );
    const [message, action] = jest.mocked(showToast).mock.calls.at(-1)!;
    expect(message).toBe('Face Pull added');
    await act(async () => action!.run());
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/training/exercise/[id]',
      params: { id: 'face' },
    });
  });
});

describe('an exercise’s progress', () => {
  test('shows the running block only until all time is chosen', async () => {
    await open(<ExerciseDetailScreen exerciseId="press" />);
    const scope = await screen.findByRole('button', {
      name: 'Showing the Peak block only. Show all time',
    });
    await fireEvent.press(scope);
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith('/api/progress/press', expect.anything()),
    );
    expect(
      screen.queryByRole('button', { name: 'Showing the Peak block only. Show all time' }),
    ).toBeNull();
  });

  test('filters to one machine, and opens Machine weights', async () => {
    await open(<ExerciseDetailScreen exerciseId="press" />);
    const bests = within(await screen.findByLabelText('Personal bests'));
    expect(bests.getByText('155 kg × 10')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Hammer' }));
    expect(bests.getByText('120 kg × 10')).toBeVisible();
    expect(screen.getByText('2 sessions', { exact: false })).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Normalise machine weights' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/training/machine-weights/[id]',
      params: { id: 'press' },
    });
  });

  test('reads in the reference machine’s weights while normalising', async () => {
    responses['/api/exercises/press/weight-mapping'] = {
      enabled: true,
      reference_machine_id: 'hammer',
      machines: [
        { ...mapping.machines[0], machine_kg: 150, reference_kg: 120 },
        mapping.machines[1],
      ],
    };
    await open(<ExerciseDetailScreen exerciseId="press" />);
    expect(await screen.findByRole('button', { name: 'All machines ≈' })).toBeVisible();
    const bests = within(screen.getByLabelText('Personal bests'));
    // 155 kg on the Cybex is 124 kg on the Hammer.
    expect(await bests.findByText('≈ 124 kg × 10')).toBeVisible();
    expect(screen.getByText(/in Hammer weights/)).toBeVisible();
  });

  test('the header menu hides an exercise, with Undo', async () => {
    jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => ({
      ...press,
      ...(body as object),
    }));
    await open(<ExerciseDetailScreen exerciseId="press" />);
    const menu = within(await screen.findByLabelText('Options for Chest Press'));
    // A standard exercise can't be edited or merged away.
    expect(menu.queryByText('Edit')).toBeNull();
    await fireEvent.press(menu.getByText('Hide from exercise lists'));
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(apiSend).toHaveBeenCalledWith('/api/exercises/press', 'PATCH', { hidden: true });
    const [message, undo] = jest.mocked(showToast).mock.calls.at(-1)!;
    expect(message).toBe('Hidden from exercise lists');
    await act(async () => undo!.run());
    expect(apiSend).toHaveBeenLastCalledWith('/api/exercises/press', 'PATCH', { hidden: false });
  });

  test('a custom exercise offers its likely duplicate, until marked not the same', async () => {
    const view = await open(<ExerciseDetailScreen exerciseId="raises" />);
    const menu = within(await screen.findByLabelText('Options for Lateral raises'));
    await fireEvent.press(menu.getByText('Edit'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/training/exercise-edit/[id]',
      params: { id: 'raises' },
    });

    expect(screen.getByText('Looks like Lateral Raise')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Merge' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/training/exercise-merge',
      params: { source: 'raises', target: 'lateral' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Not the same' }));
    expect(screen.queryByText('Looks like Lateral Raise')).toBeNull();
    expect(JSON.parse(memoryKv.get(DISMISSED_MERGE_SUGGESTIONS_KEY)!)).toEqual({
      raises: 'lateral',
    });
    await view.unmount();
    await open(<ExerciseDetailScreen exerciseId="raises" />);
    await screen.findByLabelText('Options for Lateral raises');
    expect(screen.queryByText('Looks like Lateral Raise')).toBeNull();
  });
});

test('editing a custom exercise sends only what changed', async () => {
  jest.mocked(apiSend).mockResolvedValueOnce({ ...raises, name: 'DB lateral raise' });
  await open(<ExerciseEditScreen exerciseId="raises" />);
  await fireEvent.changeText(await screen.findByLabelText('Name'), 'DB lateral raise');
  await fireEvent.press(screen.getByRole('button', { name: 'Credit per working set 1: direct' }));
  expect(screen.getByText('Its past sets will count towards the new muscles.')).toBeVisible();
  await fireEvent.press(screen.getByRole('button', { name: 'Save exercise' }));
  await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  expect(apiSend).toHaveBeenCalledWith('/api/exercises/raises', 'PATCH', {
    name: 'DB lateral raise',
    muscle_set_credits: [{ muscle_name: 'Side delts', sets: 0.5 }],
  });
  expect(showToast).toHaveBeenCalledWith('Exercise updated');
});

describe('merging exercises', () => {
  test('suggests the likely duplicate, reviews the merge, then shows the kept exercise', async () => {
    jest.mocked(apiSend).mockResolvedValueOnce(lateral);
    await open(<ExerciseMergeScreen sourceId="raises" />);
    expect(await screen.findByText('SUGGESTED')).toBeVisible();
    await fireEvent.press(screen.getByRole('radio', { name: /^Lateral Raise, Official/ }));
    expect(screen.getByText('This merge cannot be undone.')).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Merge exercises' }));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalled());
    expect(apiSend).toHaveBeenCalledWith('/api/exercises/raises/merge', 'POST', {
      target_exercise_id: 'lateral',
    });
    expect(showToast).toHaveBeenCalledWith('Exercises merged');
    expect(mockRouter.dismiss).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/training/exercise/[id]',
      params: { id: 'lateral' },
    });
  });

  test('a destination that differs needs the custom exercise changed first', async () => {
    jest.mocked(apiSend).mockResolvedValueOnce({ ...raises, equipment: 'Cable' });
    await open(<ExerciseMergeScreen />);
    await fireEvent.press(
      await screen.findByRole('button', { name: /^Custom exercise to merge: Choose/ }),
    );
    await act(async () =>
      option(jest.mocked(showMenu).mock.calls.at(-1)![1], 'Lateral raises').onPress(),
    );
    await fireEvent.press(
      screen.getByRole('radio', { name: /^Cable Lateral Raise, .*needs changes$/ }),
    );
    expect(screen.getByText('Lateral raises must match Cable Lateral Raise')).toBeVisible();
    expect(screen.queryByText('This merge cannot be undone.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Change Lateral raises' }));
    await waitFor(() =>
      expect(apiSend).toHaveBeenCalledWith('/api/exercises/raises', 'PATCH', {
        equipment: 'Cable',
      }),
    );
  });
});

describe('machine weights', () => {
  test('normalising fills each machine from your history, then saves the pairs', async () => {
    jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => body as never);
    await open(<MachineWeightsScreen exerciseId="press" />);
    await fireEvent(
      await screen.findByRole('switch', { name: 'Normalise weights' }),
      'valueChange',
      true,
    );
    // The Hammer is used most recently, so it is the reference, and the Cybex is matched to it.
    expect(await screen.findByText('★ Reference')).toBeVisible();
    expect(screen.getByLabelText('Weight on Cybex').props.value).toBe('155');
    expect(screen.getByText(/^(Suggested|Estimated) ×0\.\d\d/)).toBeVisible();
    await fireEvent.press(screen.getByRole('button', { name: 'Save machine weights' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(apiSend).toHaveBeenCalledWith(
      '/api/exercises/press/weight-mapping',
      'PUT',
      expect.objectContaining({ enabled: true, reference_machine_id: 'hammer' }),
    );
    expect(showToast).toHaveBeenCalledWith('Machine weights saved');
  });

  test('the machine weights guide coaches the switch, the reference, the match and Save', async () => {
    resetSetupGuideForTests();
    resetTipsForTests();
    jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => body as never);
    startSetupGuide('normalise', 'u1', []);
    await open(<MachineWeightsScreen exerciseId="press" />);
    expect(await screen.findByText('Switch on Normalise weights')).toBeVisible();
    expect(screen.getByText(/Your Chest Press machines weigh differently/)).toBeVisible();
    expect(coachHighlight()).toBe('normalise.switch');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    // Turning the switch on is the first step.
    await fireEvent(screen.getByRole('switch', { name: 'Normalise weights' }), 'valueChange', true);
    expect(await screen.findByText('Check the reference machine')).toBeVisible();
    expect(coachHighlight()).toBe('normalise.reference');
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Match the weights')).toBeVisible();
    expect(coachHighlight()).toBe('normalise.match');
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Save it')).toBeVisible();
    expect(coachHighlight()).toBe('normalise.save');
    await fireEvent.press(screen.getByRole('button', { name: 'Save machine weights' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(activeSetupGuide()).toBeNull();
    expect(tipsFor('u1').get().seen.normalise).toBe('learned');
  });

  test('a late save finishes only its own guide, in this session or after an account switch', async () => {
    const pending = () => {
      let resolve!: (value: unknown) => void;
      const promise = new Promise((done) => (resolve = done));
      return { promise, resolve };
    };
    for (const replace of ['same session', 'other account'] as const) {
      resetSetupGuideForTests();
      resetTipsForTests();
      const save = pending();
      jest.mocked(apiSend).mockReturnValueOnce(save.promise as never);
      startSetupGuide('normalise', 'u1', []);
      const view = await open(<MachineWeightsScreen exerciseId="press" />);
      await fireEvent(
        await screen.findByRole('switch', { name: 'Normalise weights' }),
        'valueChange',
        true,
      );
      await fireEvent.press(screen.getByRole('button', { name: 'Save machine weights' }));
      if (replace === 'other account') nextSessionEpoch();
      else exitSetupGuide('normalise');
      startSetupGuide('normalise', replace === 'other account' ? 'u2' : 'u1', []);
      const replacement = activeSetupGuide();
      await act(async () =>
        save.resolve({ enabled: true, reference_machine_id: 'hammer', machines: [] }),
      );
      expect(activeSetupGuide()).toBe(replacement);
      expect(tipsFor('u1').get().seen.normalise).toBeUndefined();
      expect(tipsFor('u2').get().seen.normalise).toBeUndefined();
      await view.unmount();
    }
  });

  test('switching to another tab ends the guide even though the screen stays mounted', async () => {
    resetSetupGuideForTests();
    const pause = (ms: number) => act(() => new Promise<void>((done) => setTimeout(done, ms)));
    const screenAt = () => (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 0, left: 0, right: 0, bottom: 0 },
        }}
      >
        <QueryClientProvider client={client}>
          <MachineWeightsScreen exerciseId="press" />
        </QueryClientProvider>
      </SafeAreaProvider>
    );
    try {
      startSetupGuide('normalise', 'u1', []);
      const view = await open(<MachineWeightsScreen exerciseId="press" />);
      expect(await screen.findByText('Switch on Normalise weights')).toBeVisible();
      // Briefly covered and back (as when the screen is replaced by itself): the guide stays.
      mockFocus.current = false;
      await view.rerender(screenAt());
      mockFocus.current = true;
      await view.rerender(screenAt());
      await pause(800);
      expect(activeSetupGuide()?.id).toBe('normalise');
      // Another tab: the Training stack keeps the screen mounted, out of sight.
      mockFocus.current = false;
      await view.rerender(screenAt());
      await pause(800);
      expect(activeSetupGuide()).toBeNull();
      expect(screen.queryByText(/Setup guide/)).toBeNull();
      expect(tipsFor('u1').get().seen.normalise).toBeUndefined();
    } finally {
      mockFocus.current = true;
    }
  });

  test('switching normalising off again returns the guide to its first step', async () => {
    resetSetupGuideForTests();
    startSetupGuide('normalise', 'u1', []);
    await open(<MachineWeightsScreen exerciseId="press" />);
    const toggle = await screen.findByRole('switch', { name: 'Normalise weights' });
    await fireEvent(toggle, 'valueChange', true);
    await fireEvent.press(await screen.findByRole('button', { name: 'Next' }));
    expect(screen.getByText('Match the weights')).toBeVisible();
    await fireEvent(toggle, 'valueChange', false);
    expect(screen.getByText('Switch on Normalise weights')).toBeVisible();
  });

  test('your weight keeps its conversion when it is emptied and typed again', async () => {
    await open(<MachineWeightsScreen exerciseId="press" />);
    await fireEvent(
      await screen.findByRole('switch', { name: 'Normalise weights' }),
      'valueChange',
      true,
    );
    const weight = () => screen.getByLabelText('Weight on Cybex');
    const match = () => screen.getByLabelText('Matching weight on Hammer for Cybex');
    const type = async (...values: string[]) => {
      for (const value of values) await fireEvent.changeText(weight(), value);
    };
    await screen.findByLabelText('Weight on Cybex');
    // A round pair to start from: 150 on the Cybex is 120 on the Hammer.
    await type('150');
    await fireEvent.changeText(match(), '120');

    // Cleared, then typed again a digit at a time.
    await type('', '1', '15', '150');
    expect(match().props.value).toBe('120');

    // Leaving the emptied box and coming back to it returns to the same conversion.
    await type('');
    await fireEvent(weight(), 'blur');
    await type('2', '20', '200');
    expect(match().props.value).toBe('160');
  });

  test('an unfinished pair is refused', async () => {
    await open(<MachineWeightsScreen exerciseId="press" />);
    await fireEvent(
      await screen.findByRole('switch', { name: 'Normalise weights' }),
      'valueChange',
      true,
    );
    await fireEvent.changeText(
      await screen.findByLabelText('Matching weight on Hammer for Cybex'),
      '',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Save machine weights' }));
    expect(await screen.findByText('Enter both weights, or leave both blank.')).toBeVisible();
    expect(apiSend).not.toHaveBeenCalled();
  });
});
