import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { machineDate, timeSince } from '../../../../frontend/src/machineHistory';
import type {
  MachinePhoto,
  MachinePhotoUsage,
  TrackedWorkout,
} from '../../../../frontend/src/types';
import { DEFAULT_WORKOUT_TYPES } from '../../../../frontend/src/workoutTypes';
import { apiGet } from '../../data/api';
import { MachineWorkoutsScreen } from './MachineWorkoutsScreen';
import { SessionDetailScreen } from './SessionDetailScreen';
import { TrainingTabScreen } from './TrainingTabScreen';
import {
  benchProgress,
  cardio,
  dashboard,
  library,
  lower,
  oldPush,
  olderCalendar,
  preferences,
  pull,
  records,
  conditioning,
  bench,
  squat,
  running,
  upper,
} from './trainingFixtures';

const mockRouter = { push: jest.fn(), back: jest.fn(), setParams: jest.fn() };
const mockWorkout = {
  live: null,
  start: jest.fn(),
  open: jest.fn(),
  openStartMenu: jest.fn(),
  discard: jest.fn(),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Stack: { Screen: () => null },
}));
jest.mock('./TrainingHeaderActions', () => ({ TrainingHeaderActions: () => null }));
jest.mock('../workout/WorkoutProvider', () => ({ useWorkout: () => mockWorkout }));
jest.mock('../social', () => ({ SavedWorkoutSocial: () => null }));
jest.mock('../workout/SavedWorkoutActions', () => ({
  SavedWorkoutActions: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiGet: jest.fn(),
}));
jest.mock('@react-native-segmented-control/segmented-control', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return () => createElement(View);
});

const TODAY = new Date('2026-11-22T10:00:00');

function photo(id: string, caption: string, exerciseId = 'bench'): MachinePhoto {
  return {
    id,
    exercise_id: exerciseId,
    caption,
    thumbnail_url: `/api/machine-photos/${id}/thumbnail`,
    full_url: `/api/machine-photos/${id}/full`,
    width: 800,
    height: 600,
    created_at: '2026-10-01T09:00:00Z',
  };
}
/** Cybex, merged from two photos of the same machine. */
const cybex: MachinePhoto = {
  ...photo('cybex', 'Cybex chest press'),
  images: [photo('cybex', 'Cybex chest press'), photo('cybex-2', 'Cybex chest press')],
};
function usage(
  machine: MachinePhoto,
  exerciseName: string,
  count: number,
  lastUsed: string | null,
): MachinePhotoUsage {
  return {
    ...machine,
    exercise_name: exerciseName,
    workout_count: count,
    last_used_date: lastUsed,
  };
}
const machines = [
  usage(cybex, 'Bench Press', 2, '2026-11-21'),
  usage(photo('hack', 'Panatta hack squat', 'squat'), 'Back Squat', 1, '2026-11-19'),
  usage(photo('spare', 'Spare bench'), 'Bench Press', 0, null),
];

/** Upper with Cybex pinned to its bench press. */
const upperOnCybex: TrackedWorkout = {
  ...upper,
  movements: upper.movements.map((movement) => ({ ...movement, machine_photos: [cybex] })),
};
const pullOnCybex: TrackedWorkout = {
  ...pull,
  movements: pull.movements.map((movement) => ({ ...movement, machine_photos: [cybex] })),
};

let responses: Record<string, unknown>;
function baseResponses(): Record<string, unknown> {
  return {
    '/api/workouts/snapshot?start=2026-08-01': {
      revision: '1',
      workouts: [upperOnCybex, conditioning, lower, pull],
    },
    '/api/workouts/snapshot?start=2026-02-01&end=2026-07-31': {
      revision: '1',
      workouts: [oldPush],
    },
    '/api/calendar?start=2026-02-01&end=2026-07-31': olderCalendar,
    '/api/dashboard?on_date=2026-11-22': dashboard,
    '/api/workout-types': DEFAULT_WORKOUT_TYPES,
    '/api/training-preferences': preferences,
    '/api/personal-records?include_blocks=true&include_fresh_start=true': records,
    '/api/body-measurements': [],
    '/api/exercises': [bench, squat, running],
    '/api/progress': library,
    '/api/progress/bench': benchProgress,
    '/api/training-blocks': { blocks: [] },
    '/api/cardio': cardio,
    '/api/machine-photos': machines,
    '/api/machine-photos/cybex/workouts': [upperOnCybex, pullOnCybex],
    '/api/machine-photos/hack/workouts': [],
    '/api/workouts/w-upper': upperOnCybex,
  };
}

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
  responses = baseResponses();
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    if (!(path in responses)) throw new Error(`Unexpected request ${path}`);
    return responses[path] as never;
  });
});
afterEach(() => client.clear());

const route = (id: string, caption: string, exercise: string) => ({
  pathname: '/training/machine/[id]',
  params: { id, caption, exercise },
});

describe("Sessions' machine photos", () => {
  test('a logged exercise shows its machine, which opens with its merged photos', async () => {
    await open(<TrainingTabScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: /^Sample upper session/ }));
    await fireEvent.press(screen.getByRole('imagebutton', { name: 'View Cybex chest press' }));

    expect(screen.getByRole('header', { name: 'Cybex chest press' })).toBeVisible();
    const gallery = screen.getByLabelText('Merged machine photos');
    expect(within(gallery).getByRole('button', { name: 'View photo 1 of 2' })).toBeSelected();
    await fireEvent.press(within(gallery).getByRole('button', { name: 'View photo 2 of 2' }));
    expect(within(gallery).getByRole('button', { name: 'View photo 2 of 2' })).toBeSelected();
    expect(
      screen.getByRole('imagebutton', {
        name: 'Cybex chest press, photo 2 of 2. Show full screen',
      }),
    ).toBeVisible();

    await fireEvent.press(screen.getByRole('button', { name: 'All workouts on this machine' }));
    expect(mockRouter.push).toHaveBeenCalledWith(
      route('cybex', 'Cybex chest press', 'Bench Press'),
    );
  });

  test("a session opened on its own offers the machine's workouts too", async () => {
    await open(<SessionDetailScreen workoutId="w-upper" />);
    await fireEvent.press(
      await screen.findByRole('imagebutton', { name: 'View Cybex chest press' }),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'All workouts on this machine' }));
    expect(mockRouter.push).toHaveBeenCalledWith(
      route('cybex', 'Cybex chest press', 'Bench Press'),
    );
  });
});

describe("the calendar's Filter by machine", () => {
  test('lists each saved machine with its exercise, last use and count, and opens one', async () => {
    await open(<TrainingTabScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Filter by machine' }));
    const list = await screen.findByLabelText('Saved machines');
    const first = within(list).getAllByRole('button')[0];
    expect(within(first).getByText('Cybex chest press')).toBeVisible();
    expect(within(first).getByText('Bench Press')).toBeVisible();
    expect(
      within(first).getByText(`Last used ${machineDate('2026-11-21')} · yesterday`),
    ).toBeVisible();
    expect(within(first).getByText('2×')).toBeVisible();
    expect(within(list).getByText('Not in a saved workout yet')).toBeVisible();
    // Six or fewer machines need no search.
    expect(screen.queryByLabelText('Search machines')).toBeNull();

    await fireEvent.press(within(list).getByRole('button', { name: /^Panatta hack squat/ }));
    expect(mockRouter.push).toHaveBeenCalledWith(route('hack', 'Panatta hack squat', 'Back Squat'));
  });

  test('searches a long list of machines by machine or exercise', async () => {
    responses['/api/machine-photos'] = Array.from({ length: 7 }, (_, index) =>
      usage(
        photo(`m${index}`, index === 3 ? 'Panatta hack squat' : `Cable ${index}`),
        index === 3 ? 'Back Squat' : 'Cable Fly',
        1,
        '2026-11-01',
      ),
    );
    await open(<TrainingTabScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Filter by machine' }));
    const search = await screen.findByLabelText('Search machines');
    expect(screen.getAllByRole('button', { name: /^Cable/ })).toHaveLength(6);
    await fireEvent.changeText(search, 'squat');
    expect(screen.queryAllByRole('button', { name: /^Cable/ })).toHaveLength(0);
    expect(screen.getByRole('button', { name: /^Panatta hack squat/ })).toBeVisible();
    await fireEvent.changeText(search, 'rower');
    expect(screen.getByText('No machines match “rower”.')).toBeVisible();
  });

  test('says how to save a machine when there are none', async () => {
    responses['/api/machine-photos'] = [];
    await open(<TrainingTabScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Filter by machine' }));
    expect(
      await screen.findByText(
        'No saved machine photos yet. While logging an exercise, tap Choose machine, then Add machine photo to save one.',
      ),
    ).toBeVisible();
  });

  test('shows a failed load with Try again', async () => {
    delete responses['/api/machine-photos'];
    await open(<TrainingTabScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Filter by machine' }));
    expect(await screen.findByText('Unexpected request /api/machine-photos')).toBeVisible();
    responses['/api/machine-photos'] = machines;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByLabelText('Saved machines')).toBeVisible();
  });
});

describe('Filtered by machine', () => {
  test('shows when the machine was last used, and its workouts with the newest open', async () => {
    await open(
      <MachineWorkoutsScreen
        photoId="cybex"
        caption="Cybex chest press"
        exerciseName="Bench Press"
      />,
    );
    expect(screen.getByRole('header', { name: 'Cybex chest press' })).toBeVisible();
    expect(screen.getByText('Bench Press')).toBeVisible();
    expect(
      await screen.findByText(
        `Last used ${machineDate('2026-11-21')} · ${timeSince('2026-11-21', '2026-11-22')} · 2 workouts`,
      ),
    ).toBeVisible();
    const list = screen.getByLabelText('Workouts on this machine');
    expect(within(list).getByText('Newest first')).toBeVisible();
    // The newest is open on its sets, and the other stays closed.
    expect(
      within(list).getByRole('button', { name: /^Sample upper session/, expanded: true }),
    ).toBeVisible();
    expect(within(list).getByRole('button', { name: /^Pull day/, expanded: false })).toBeVisible();
    expect(within(list).getByText('Top 100 kg × 5')).toBeVisible();

    // The machine already filtered by doesn't offer itself again.
    await fireEvent.press(
      within(list).getByRole('imagebutton', { name: 'View Cybex chest press' }),
    );
    expect(screen.queryByRole('button', { name: 'All workouts on this machine' })).toBeNull();
  });

  test('Change picks another machine', async () => {
    await open(<MachineWorkoutsScreen photoId="cybex" />);
    await screen.findByText(/^Last used/);
    await fireEvent.press(screen.getByRole('button', { name: 'Change' }));
    await fireEvent.press(await screen.findByRole('button', { name: /^Panatta hack squat/ }));
    expect(mockRouter.setParams).toHaveBeenCalledWith({
      id: 'hack',
      caption: 'Panatta hack squat',
      exercise: 'Back Squat',
    });
  });

  test('says when no saved workout uses the machine, and shows a failed load', async () => {
    const { unmount } = await open(<MachineWorkoutsScreen photoId="hack" />);
    expect(await screen.findByText('No saved workouts use this machine yet.')).toBeVisible();
    expect(screen.getByRole('header', { name: 'Panatta hack squat' })).toBeVisible();
    await unmount();

    delete responses['/api/machine-photos/hack/workouts'];
    await open(<MachineWorkoutsScreen photoId="hack" />);
    expect(
      await screen.findByText('Unexpected request /api/machine-photos/hack/workouts'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test("pages through a long history ten workouts at a time, with the web's pager", async () => {
    responses['/api/machine-photos/cybex/workouts'] = Array.from({ length: 12 }, (_, index) => ({
      ...pullOnCybex,
      id: `w-${index}`,
      name: `Session ${index + 1}`,
      workout_date: `2026-10-${String(30 - index).padStart(2, '0')}`,
    }));
    await open(<MachineWorkoutsScreen photoId="cybex" />);
    expect(await screen.findByText(/· 12 workouts$/)).toBeVisible();
    expect(screen.getByRole('button', { name: /^Session 10/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Session 11/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Page 1 of 2' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Previous machine workout page' })).toBeDisabled();

    await fireEvent.press(screen.getByRole('button', { name: 'Next machine workout page' }));
    // Only the current page is laid out.
    expect(screen.getByRole('button', { name: /^Session 12/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Session 1,/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Page 2 of 2' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Next machine workout page' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Page 1 of 2' }));
    expect(screen.getByRole('button', { name: /^Session 1,/ })).toBeVisible();
  });

  test('each workout opens in full, where it can be edited, resumed or given photos', async () => {
    await open(<MachineWorkoutsScreen photoId="cybex" />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Open Sample upper session' }));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/training/session/[id]',
      params: { id: 'w-upper', exercise: 'bench' },
    });
  });

  test("a merged photo's id answers as the machine it belongs to", async () => {
    // The route names Cybex's merged second photo; the catalog lists the surviving machine.
    responses['/api/machine-photos/cybex-2/workouts'] = [upperOnCybex];
    await open(<MachineWorkoutsScreen photoId="cybex-2" caption="Old photo" />);
    expect(await screen.findByRole('header', { name: 'Cybex chest press' })).toBeVisible();
    await screen.findByText(/^Last used/);
    await fireEvent.press(screen.getByRole('imagebutton', { name: 'View Cybex chest press' }));
    // It is already the current filter, so it isn't offered again.
    expect(screen.queryByRole('button', { name: 'All workouts on this machine' })).toBeNull();
  });

  test('a photo that fails to load says so and can be tried again', async () => {
    await open(<MachineWorkoutsScreen photoId="cybex" />);
    await fireEvent.press(
      await screen.findByRole('imagebutton', { name: 'View Cybex chest press' }),
    );
    // No server here, so the authorised image loader answers with nothing.
    expect(await screen.findByText('Photo not loaded')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  test("a late answer for the previous account never shows in the next account's list", async () => {
    let answer: (workouts: TrackedWorkout[]) => void = () => undefined;
    jest.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/api/machine-photos/cybex/workouts')
        return new Promise((resolve) => (answer = resolve as typeof answer)) as never;
      if (!(path in responses)) throw new Error(`Unexpected request ${path}`);
      return responses[path] as never;
    });
    const { unmount } = await open(<MachineWorkoutsScreen photoId="cybex" />);
    expect(screen.getByText('Finding your sessions…')).toBeVisible();
    // Signing in as someone else drops every cached answer and remounts the tabs.
    await unmount();
    client.clear();

    jest.mocked(apiGet).mockImplementation(async (path: string) => {
      if (path === '/api/machine-photos/cybex/workouts') return [] as never;
      if (path === '/api/machine-photos') return [] as never;
      if (!(path in responses)) throw new Error(`Unexpected request ${path}`);
      return responses[path] as never;
    });
    await render(withProviders(<MachineWorkoutsScreen photoId="cybex" />));
    expect(await screen.findByText('No saved workouts use this machine yet.')).toBeVisible();
    answer([upperOnCybex, pullOnCybex]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText('No saved workouts use this machine yet.')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Sample upper session/ })).toBeNull();
  });
});
