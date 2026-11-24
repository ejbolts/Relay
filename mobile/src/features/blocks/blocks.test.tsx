import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Alert, Text, type AlertButton } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initialHistoryStart } from '../../../../frontend/src/historyWindow';
import { addDays } from '../../../../frontend/src/trainingSummary';
import type {
  TrackedWorkout,
  TrainingBlock,
  TrainingBlockSummary,
  TrainingBlocks,
} from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { showToast } from '../../ui/Toast';
import { preferences, TODAY } from '../training/trainingFixtures';
import { selectBlock, useBlockScope } from './blockQueries';
import { coachHighlight } from '../guides/GuideCoach';
import { activeSetupGuide, resetSetupGuideForTests, startSetupGuide } from '../guides/setupGuides';
import { resetTipsForTests, tipsFor } from '../guides/tips';
import { BlockFormScreen } from './BlockFormScreen';
import { BlocksScreen } from './BlocksScreen';
import { BlockSummaryScreen } from './BlockSummaryScreen';
import { HomeTrainingBlockCard } from './index';

const mockRouter = { push: jest.fn(), back: jest.fn(), navigate: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Stack: {
    Screen: ({ options }: { options?: { headerRight?: () => ReactNode } }) =>
      options?.headerRight?.() ?? null,
  },
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn(), ToastHost: () => null }));
// Pinches can't be made in a test; the timeline's pinch reaches its handlers through this stand-in.
const mockPinches: { onUpdate?: (event: { scale: number; focalX: number }) => void }[] = [];
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: unknown }) => children,
  GestureDetector: ({ children }: { children: unknown }) => children,
  ScrollView: jest.requireActual<typeof import('react-native')>('react-native').ScrollView,
  usePinchGesture: (config: (typeof mockPinches)[number]) => {
    mockPinches.push(config);
    return config;
  },
}));
jest.mock('expo-screen-orientation', () => ({
  lockAsync: jest.fn(async () => undefined),
  unlockAsync: jest.fn(async () => undefined),
  OrientationLock: { LANDSCAPE: 'landscape' },
}));
// A plain text box for the native date picker, so a test can type a date.
jest.mock('../body/DateField', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    DateField: (props: { label: string; value: string; onChange: (date: string) => void }) =>
      createElement(TextInput, {
        accessibilityLabel: props.label,
        value: props.value,
        onChangeText: props.onChange,
      }),
  };
});

// Sunday 22 November 2026.
const today = '2026-11-22';
const block = (id: string, start: string, extra: Partial<TrainingBlock> = {}): TrainingBlock => ({
  id,
  name: id,
  start_date: start,
  end_date: null,
  ...extra,
});
const base = block('Base', '2026-06-01', { end_date: '2026-09-07', workout_count: 30 });
const peak = block('Peak', '2026-09-07', { planned_end_date: '2026-12-27', workout_count: 24 });
const config: TrainingBlocks = {
  blocks: [base, peak],
  history_start: '2025-11-03',
  earlier_workout_count: 40,
};
const stats = (id: string, volume: number, prs: number, workouts: number) => ({
  block_id: id,
  name: id,
  start_date: '',
  workout_count: workouts,
  set_count: workouts * 15,
  volume_kg: volume,
  pr_count: prs,
});
const peakSummary: TrainingBlockSummary = {
  block: stats('Peak', 30_000, 6, 24),
  previous: stats('Base', 30_000, 4, 30),
};
const weekly = (weeks: number) =>
  Array.from(
    { length: weeks },
    (_, index) =>
      ({ id: `w${index}`, workout_date: addDays('2026-11-16', -index * 7) }) as TrackedWorkout,
  );

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
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  selectBlock('current');
  responses = {
    '/api/training-blocks': config,
    '/api/training-blocks/Peak/summary': peakSummary,
    '/api/training-blocks/Base/summary': { block: stats('Base', 30_000, 4, 30), previous: null },
    '/api/training-preferences': preferences,
    [`/api/workouts/snapshot?start=${initialHistoryStart()}`]: { revision: '1', workouts: [] },
    [`/api/dashboard?on_date=${today}`]: { weekly_sets: { week_start: '2026-11-16' } },
  };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (!(path in responses)) throw new Error(`Unexpected request ${path}`);
    return responses[path] as never;
  });
});
afterEach(() => client.clear());

describe('Home’s training block card', () => {
  test('shows the running block’s week, days left and progress, and opens the blocks', async () => {
    await open(<HomeTrainingBlockCard />);
    const card = await screen.findByRole('button', { name: /^Peak, Week 11 of 16, 35 days left/ });
    expect(screen.getByLabelText('Peak progress')).toBeVisible();
    expect(screen.getByLabelText('Timeline: Before blocks, Base, Peak')).toBeVisible();
    await fireEvent.press(card);
    expect(mockRouter.push).toHaveBeenCalledWith('/blocks');
  });

  test('offers the summary once the planned end has passed', async () => {
    responses['/api/training-blocks'] = {
      blocks: [{ ...peak, planned_end_date: '2026-11-15' }],
    };
    await open(<HomeTrainingBlockCard />);
    await fireEvent.press(
      await screen.findByRole('button', {
        name: 'Peak, finished, 10 weeks · ended 15 Nov. See your summary',
      }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/blocks/summary/[id]',
      params: { id: 'Peak' },
    });
  });

  test('offers the first block after four weeks of training, and nothing before', async () => {
    responses['/api/training-blocks'] = { blocks: [] };
    const view = await open(<HomeTrainingBlockCard />);
    await waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith('/api/training-blocks', expect.anything()),
    );
    expect(screen.queryByText('No block running')).toBeNull();
    await view.unmount();

    responses[`/api/workouts/snapshot?start=${initialHistoryStart()}`] = {
      revision: '1',
      workouts: weekly(4),
    };
    await open(<HomeTrainingBlockCard />);
    await fireEvent.press(
      await screen.findByRole('button', {
        name: 'Training block, no block running. Start a block',
      }),
    );
    expect(mockRouter.push).toHaveBeenCalledWith({ pathname: '/blocks/edit', params: {} });
  });
});

describe('the blocks overview', () => {
  test('lists the year’s blocks, the block in progress, and the history before blocks', async () => {
    await open(<BlocksScreen />);
    const list = within(await screen.findByLabelText('2026 training blocks'));
    expect(list.getByRole('button', { name: /^Peak, current, 7 Sep – Today/ })).toBeVisible();
    expect(list.getByText('35 days left · Planned end 27 Dec')).toBeVisible();
    expect(list.getByText('30 workouts')).toBeVisible();
    // Same volume over fewer weeks so far.
    expect(await screen.findByText(/^vs Base: /)).toBeVisible();
    expect(screen.getByText('+27%')).toBeVisible();

    await fireEvent.press(list.getByRole('button', { name: 'Edit Base' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/blocks/edit',
      params: { id: 'Base' },
    });
    await fireEvent.press(screen.getByRole('button', { name: 'New training block' }));
    expect(mockRouter.push).toHaveBeenLastCalledWith({ pathname: '/blocks/edit', params: {} });

    await fireEvent.press(screen.getByRole('button', { name: 'Previous year' }));
    const earlier = within(screen.getByLabelText('2025 training blocks'));
    expect(earlier.getByText('Before blocks')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Previous year' })).toBeDisabled();
  });
});

describe('the training timeline', () => {
  test('pinching zooms the timeline in to months, and it opens in landscape', async () => {
    await open(<BlocksScreen />);
    await screen.findByLabelText('2026 training blocks');
    const hidden = { includeHiddenElements: true };
    expect(screen.queryByText('Mar', hidden)).toBeNull();
    await act(async () => mockPinches.at(-1)!.onUpdate!({ scale: 2.5, focalX: 160 }));
    expect(screen.getAllByText('Mar', hidden).length).toBeGreaterThan(0);

    await fireEvent.press(
      screen.getByRole('button', { name: 'View Training timeline full screen in landscape' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Exit full-screen Training timeline' }),
    ).toBeVisible();
    expect(jest.requireMock('expo-screen-orientation').lockAsync).toHaveBeenCalledWith('landscape');
  });
});

describe('the block form', () => {
  test('starts a block today, shows it as the current one, and confirms', async () => {
    const started = block('Winter', today);
    jest
      .mocked(apiSend)
      .mockResolvedValueOnce({ blocks: [base, { ...peak, end_date: today }, started] });
    await open(<BlockFormScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Block name'), ' Winter ');
    await fireEvent.press(screen.getByRole('radio', { name: '8 weeks, 16 Jan' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Lavender' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start block' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(apiSend).toHaveBeenCalledWith('/api/training-blocks', 'POST', {
      name: 'Winter',
      start_date: today,
      planned_end_date: '2027-01-16',
      color: '#b59cf0',
    });
    expect(showToast).toHaveBeenCalledWith('Training block started');
  });

  test('the training blocks guide coaches a new block’s form and finishes once it starts', async () => {
    resetSetupGuideForTests();
    resetTipsForTests();
    jest.mocked(apiSend).mockResolvedValueOnce({ blocks: [base, peak, block('Winter', today)] });
    startSetupGuide('blocks', 'u1', []);
    await open(<BlockFormScreen />);
    expect(await screen.findByText('Setup guide · 1 of 4')).toBeVisible();
    expect(screen.getByText('Name this phase')).toBeVisible();
    expect(coachHighlight()).toBe('blocks.name');
    // Next waits for a name, as the web's.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Block name'), 'Winter');
    await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Pick a start')).toBeVisible();
    expect(coachHighlight()).toBe('blocks.start');
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Name this phase')).toBeVisible();
    for (let step = 0; step < 3; step++)
      await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Start the block')).toBeVisible();
    expect(screen.getByText('Setup guide · 4 of 4')).toBeVisible();
    expect(coachHighlight()).toBe('blocks.submit');
    // The last step finishes with the real Start.
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Start block' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(activeSetupGuide()).toBeNull();
    expect(tipsFor('u1').get().seen.blocks).toBe('learned');
    expect(screen.queryByText(/Setup guide/)).toBeNull();
  });

  test('a block form opened outside a guide shows no coaching; Skip guide or leaving marks nothing', async () => {
    resetSetupGuideForTests();
    resetTipsForTests();
    let view = await open(<BlockFormScreen />);
    expect(await screen.findByLabelText('Block name')).toBeVisible();
    expect(screen.queryByText(/Setup guide/)).toBeNull();
    await view.unmount();

    startSetupGuide('blocks', 'u1', []);
    view = await open(<BlockFormScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Skip guide' }));
    expect(activeSetupGuide()).toBeNull();
    expect(screen.queryByText(/Setup guide/)).toBeNull();
    expect(coachHighlight()).toBeNull();
    await view.unmount();

    startSetupGuide('blocks', 'u1', []);
    view = await open(<BlockFormScreen />);
    expect(await screen.findByText('Setup guide · 1 of 4')).toBeVisible();
    await view.unmount();
    await waitFor(() => expect(activeSetupGuide()).toBeNull());
    expect(tipsFor('u1').get().seen.blocks).toBeUndefined();
  });

  test('a custom start asks for the date', async () => {
    await open(<BlockFormScreen />);
    const starts = within(await screen.findByLabelText('Starts'));
    await fireEvent.press(starts.getByRole('radio', { name: 'Custom' }));
    await fireEvent.changeText(screen.getByLabelText('Start date'), '2026-11-02');
    expect(starts.getByRole('radio', { name: 'Custom, 2 Nov 2026', checked: true })).toBeVisible();
  });

  test('edits a block, or removes it after asking', async () => {
    jest.mocked(apiSend).mockResolvedValue(config);
    const view = await open(<BlockFormScreen blockId="Peak" />);
    expect(
      await screen.findByRole('radio', { name: 'Custom, 27 Dec', checked: true }),
    ).toBeVisible();
    await fireEvent.changeText(screen.getByLabelText('Block name'), 'Peaking');
    await fireEvent.press(screen.getByRole('button', { name: 'Save block' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(apiSend).toHaveBeenCalledWith('/api/training-blocks/Peak', 'PUT', {
      name: 'Peaking',
      start_date: '2026-09-07',
      planned_end_date: '2026-12-27',
      color: null,
    });
    await view.unmount();

    await open(<BlockFormScreen blockId="Peak" />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Remove block' }));
    const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)![2] as AlertButton[];
    await act(async () => buttons.find((button) => button.text === 'Remove block')!.onPress!());
    expect(apiSend).toHaveBeenLastCalledWith('/api/training-blocks/Peak', 'DELETE');
  });
});

describe('a block’s summary', () => {
  test('adds up the block against the last one, and starts the next block', async () => {
    jest.mocked(apiSend).mockResolvedValueOnce(config);
    await open(<BlockSummaryScreen blockId="Peak" />);
    expect(await screen.findByLabelText('PRs, 6, 2 more')).toBeVisible();
    expect(screen.getByLabelText('Volume, 30.0 t, Same as last block')).toBeVisible();
    expect(screen.getByText('Compared with Base')).toBeVisible();
    expect(screen.getByText('CURRENT BLOCK')).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'Start next block' }));
    expect(screen.getByLabelText('Block name').props.value).toBe('Block 3');
    await fireEvent.press(screen.getByRole('radio', { name: '12 weeks, 13 Feb' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start block' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(apiSend).toHaveBeenCalledWith('/api/training-blocks', 'POST', {
      name: 'Block 3',
      start_date: today,
      planned_end_date: '2027-02-13',
    });
    expect(showToast).toHaveBeenCalledWith('Training block started');
  });

  test('starts a deload week, and opens the block’s progress', async () => {
    jest.mocked(apiSend).mockResolvedValueOnce(config);
    const view = await open(<BlockSummaryScreen blockId="Peak" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Deload week first' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start deload' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(apiSend).toHaveBeenCalledWith('/api/training-blocks', 'POST', {
      name: 'Deload week',
      start_date: today,
      planned_end_date: '2026-11-28',
      deload: true,
    });
    await view.unmount();

    function Scope() {
      return <Text>{`Progress shows ${useBlockScope().selection}`}</Text>;
    }
    await open(
      <>
        <BlockSummaryScreen blockId="Base" />
        <Scope />
      </>,
    );
    expect(await screen.findByText('BLOCK COMPLETE')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Start next block' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'View progress' }));
    expect(screen.getByText('Progress shows Base')).toBeVisible();
    expect(mockRouter.navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: '/training',
        params: expect.objectContaining({ section: 'exercises' }),
      }),
    );
  });
});
