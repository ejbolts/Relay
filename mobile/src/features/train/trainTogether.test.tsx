import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';
import { Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  partnerConflictNotice,
  type TrainExercise,
  type TrainMember,
  type TrainTogetherRead,
} from '../../../../frontend/src/trainTogether';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import type { ActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { ApiError } from '../../data/api';
import { showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { QrScanner } from '../social/FriendQrSheet';
import { socialApi } from '../social/socialApi';
import { PartnerLogger } from './PartnerLogger';
import { PartnerPace, TrainDeck, TrainEntry } from './TrainDeck';
import { TrainedWithPill } from './TrainedWithPill';
import { requestTrainJoin, takePendingTrainInvite } from './trainLinks';
import { TrainSheet } from './TrainSheet';
import { TrainStartSheet } from './TrainStartSheet';
import {
  EMPTY_TRAIN_STATE,
  getTrainState,
  setTrainActions,
  setTrainState,
  trainActions,
  type TrainActions,
  type TrainJoinFailure,
} from './trainStore';
import { TrainTogetherHost } from './TrainTogetherHost';
import { trainTogetherApi } from './trainTogetherApi';

jest.mock('../../data/api', () => ({
  ...jest.requireActual('../../data/api'),
  apiOrigin: 'https://relay.test',
}));
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('@react-native-segmented-control/segmented-control', () =>
  jest.requireActual('../../testing/segmentedControlMock'),
);
const mockRouter = { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn() };
const mockPath = { value: '/' };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPath.value,
}));
jest.mock('./trainTogetherApi', () => ({
  ...jest.requireActual('./trainTogetherApi'),
  trainTogetherApi: {
    read: jest.fn(),
    invite: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    partnerExercises: jest.fn(),
    changePartnerWorkout: jest.fn(),
  },
}));
// Requests go straight through; session binding has its own tests (workout/sessionBound).
jest.mock('../workout/sessionBound', () => ({
  sessionBound: () => ({ read: (request: () => unknown) => request() }),
}));
const mockSocket = { listener: null as null | (() => void) };
jest.mock('../../data/livePresence', () => ({
  onTrainTogether: (listener: () => void) => {
    mockSocket.listener = listener;
    return () => {
      mockSocket.listener = null;
    };
  },
}));
const mockWorkout = {
  live: null as null | object,
  open: jest.fn(),
  start: jest.fn(),
  openStartMenu: jest.fn(),
};
jest.mock('../workout/WorkoutProvider', () => ({
  useOptionalWorkout: () => mockWorkout,
  useWorkout: () => mockWorkout,
}));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../../ui/haptics', () => ({
  haptics: {
    selection: jest.fn(),
    tap: jest.fn(),
    press: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock('../../ui/prompts', () => ({ showMenu: jest.fn() }));
jest.mock('../social/socialApi', () => ({ socialApi: { addFriend: jest.fn(async () => ({})) } }));
jest.mock('../../data/authorisedImage', () => ({ useAuthorisedImage: () => null }));
const mockUser = {
  id: 'me',
  username: 'preview',
  display_name: 'Preview',
  profile_photo_url: null,
};
jest.mock('../../session/SessionProvider', () => ({
  useUser: () => mockUser,
  useOptionalSession: () => ({ status: { kind: 'signed-in', user: mockUser } }),
}));
const mockExercises = { data: [] as { id: string; name: string; kind: string }[] };
jest.mock('../../data/queries', () => ({
  ...jest.requireActual('../../data/queries'),
  useExercises: () => mockExercises,
}));
const mockCamera = { scan: null as null | ((result: { data: string }) => void) };
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
  CameraView: (props: { onBarcodeScanned: (result: { data: string }) => void }) => {
    mockCamera.scan = props.onBarcodeScanned;
    return null;
  },
}));

const api = jest.mocked(trainTogetherApi);
const toast = jest.mocked(showToast);
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 28, 8, minutes)).toISOString();
const bench: TrainExercise = {
  id: 'sam-bench',
  name: 'Bench Press',
  kind: 'strength',
  category: 'push',
  muscle_group: 'Chest',
  equipment: 'Barbell',
  same_as_exercise_id: 'my-bench',
};
const fly: TrainExercise = {
  ...bench,
  id: 'sam-fly',
  name: 'Cable Fly',
  same_as_exercise_id: null,
};
const set = (key: string, weight_kg: number | null, reps: number | null, completed: boolean) => ({
  key,
  reps,
  weight_kg,
  rpe: null,
  rest_seconds: null,
  duration_seconds: null,
  distance_km: null,
  notes: null,
  completed,
});
function draft(extra: Partial<ActiveWorkoutDraft> = {}): ActiveWorkoutDraft {
  const started = Date.now() - 20 * 60_000;
  return {
    version: 1,
    clientSessionId: 'sam-session',
    startedAt: started,
    updatedAt: started,
    lastActiveAt: started,
    name: '',
    workoutDate: '2026-11-28',
    category: 'push',
    notes: '',
    movements: [
      {
        key: 'm1',
        exerciseId: 'sam-bench',
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        sets: [set('s1', 80, 8, true), set('s2', 82.5, 8, false)],
      },
      {
        key: 'm2',
        exerciseId: 'sam-fly',
        notes: '',
        machinePhotoIds: [],
        supersetKey: null,
        sets: [set('f1', 12, 15, false)],
      },
    ],
    ...extra,
  };
}
const me: TrainMember = {
  user_id: 'me',
  username: 'preview',
  display_name: 'Preview',
  photo_url: null,
  is_self: true,
  joined_at: at(0),
  workout: null,
};
function sam(workout: ActiveWorkoutDraft | null = draft(), joined = at(5)): TrainMember {
  return {
    user_id: 'sam',
    username: 'sam',
    display_name: 'Sam',
    photo_url: null,
    is_self: false,
    joined_at: joined,
    workout: workout && { revision: 3, draft: workout, exercises: [bench, fly] },
  };
}
function withPartners(...partners: TrainMember[]): TrainTogetherRead {
  return {
    session: {
      id: 'session-1',
      started_at: at(0),
      expires_at: at(720),
      created_by: 'me',
      max_members: 4,
      members: [me, ...partners],
    },
    ended: null,
  };
}
const alone: TrainTogetherRead = { session: null, ended: null };

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: Infinity },
          mutations: { retry: false },
        },
      }),
  );
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

function fakeActions(): jest.Mocked<TrainActions> {
  return {
    join: jest.fn(
      async (_token: string, _from: 'scan' | 'link') => null as TrainJoinFailure | null,
    ),
    leave: jest.fn(),
    newInvite: jest.fn(async () => undefined),
    openSheet: jest.fn(),
    closeSheet: jest.fn(),
    logFor: jest.fn(),
    editPartner: jest.fn(),
    retryPartner: jest.fn(),
    addFriend: jest.fn(),
    closeStartWith: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWorkout.live = null;
  mockPath.value = '/';
  mockExercises.data = [];
  takePendingTrainInvite();
  setTrainActions(null);
});

describe('the session host', () => {
  it('reads the session, says who joined once, and nothing on the first read', async () => {
    api.read.mockResolvedValueOnce(withPartners());
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await waitFor(() => expect(getTrainState().read).toEqual(withPartners()));
    expect(toast).not.toHaveBeenCalled();

    // The socket says something changed: the host reads again.
    api.read.mockResolvedValueOnce(withPartners(sam(draft(), at(30))));
    await act(async () => mockSocket.listener?.());
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Sam joined'));
    expect(getTrainState().partnerSync.sam?.draft?.clientSessionId).toBe('sam-session');

    // Sam finishes: the session ends with their reason, said once.
    api.read.mockResolvedValueOnce({
      session: null,
      ended: { session_id: 'session-1', reason: 'finished', by_user_id: 'sam', by_name: 'Sam' },
    });
    await act(async () => mockSocket.listener?.());
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Sam finished their workout'));
    expect(getTrainState().partnerSync).toEqual({});
    expect(toast).toHaveBeenCalledTimes(2);
    await view.unmount();
    // Unmounting (signing out or switching account) empties everything.
    expect(getTrainState()).toEqual(EMPTY_TRAIN_STATE);
  });

  it('says nothing when you leave or finish yourself', async () => {
    api.read.mockResolvedValueOnce(withPartners(sam()));
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await waitFor(() => expect(getTrainState().read?.session).not.toBeNull());
    api.leave.mockResolvedValueOnce({
      session: null,
      ended: { session_id: 'session-1', reason: 'left', by_user_id: 'me', by_name: 'Preview' },
    });
    await act(async () => trainActions().leave());
    await waitFor(() => expect(getTrainState().read?.session).toBeNull());
    expect(api.leave).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('joins a code from a link once signed in, and offers to start with their exercises', async () => {
    api.read.mockResolvedValue(alone);
    requestTrainJoin('abcdefghijklmnop1234');
    api.join.mockResolvedValueOnce(withPartners(sam(draft(), at(-5))));
    mockExercises.data = [{ id: 'my-bench', name: 'Bench Press', kind: 'strength' }];
    const view = await render(
      <>
        <TrainTogetherHost userId="me" />
      </>,
      { wrapper: Providers },
    );
    await waitFor(() => expect(api.join).toHaveBeenCalledWith('abcdefghijklmnop1234'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Training with Sam'));
    // No workout open: the start sheet offers Sam's exercises.
    expect(getTrainState().startWith).toBe('sam');
    expect(await screen.findByText('Train with Sam')).toBeOnTheScreen();
    expect(screen.getByText('Cable Fly · no match')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Start with Sam’s exercises'));
    // The logger opens once the sheet has closed.
    await waitFor(() => expect(mockWorkout.start).toHaveBeenCalled());
    expect(mockWorkout.start).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'template',
        template: expect.objectContaining({
          exercises: [expect.objectContaining({ exercise: mockExercises.data[0] })],
        }),
      }),
    );
    expect(toast).toHaveBeenCalledWith("1 exercise isn't in your library");
    await view.unmount();
  });

  it('opens the logger after joining with a workout open', async () => {
    api.read.mockResolvedValue(alone);
    mockWorkout.live = { name: 'Push' };
    requestTrainJoin('abcdefghijklmnop1234');
    api.join.mockResolvedValueOnce(withPartners(sam()));
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await waitFor(() => expect(mockWorkout.open).toHaveBeenCalledTimes(1));
    expect(getTrainState().startWith).toBeNull();
    await view.unmount();
  });

  it("shows a link's refusal in a toast, with Add friend when they aren't friends", async () => {
    api.read.mockResolvedValue(alone);
    requestTrainJoin('abcdefghijklmnop1234');
    api.join.mockRejectedValueOnce(
      new ApiError(403, 'Add Sam as a friend to train together.', 'train_not_friends', false, {
        user_id: 'sam',
        name: 'Sam',
      }),
    );
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        'Add Sam as a friend to train together.',
        expect.objectContaining({ label: 'Add friend' }),
        { variant: 'error' },
      ),
    );
    await act(async () => toast.mock.calls[0][1]!.run());
    expect(socialApi.addFriend).toHaveBeenCalledWith('sam');
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Friend request sent to Sam'));
    await view.unmount();
  });

  it("sends edits to a partner's workout and says when the server's copy won", async () => {
    api.read.mockResolvedValue(withPartners(sam()));
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await waitFor(() => expect(getTrainState().partnerSync.sam).toBeDefined());
    const server = draft({ name: 'Changed' });
    api.changePartnerWorkout.mockResolvedValueOnce({
      revision: 9,
      draft: server,
      conflict: true,
      exercises: [bench],
    });
    await act(async () =>
      trainActions().editPartner('sam', (current) => ({ ...current, notes: 'x' })),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(partnerConflictNotice('Sam'), undefined, {
        variant: 'warning',
      }),
    );
    const [partnerId, change] = api.changePartnerWorkout.mock.calls[0];
    expect(partnerId).toBe('sam');
    expect(change.revision).toBe(3);
    expect(change.base.clientSessionId).toBe('sam-session');
    expect(getTrainState().partnerSync.sam?.draft).toBe(server);
    expect(getTrainState().partnerAcked.sam).toBe(server);
    await view.unmount();
  });

  it("never shows one account's late read to the next", async () => {
    let answer!: (read: TrainTogetherRead) => void;
    api.read.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const first = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await first.unmount();
    api.read.mockResolvedValueOnce(alone);
    const second = await render(<TrainTogetherHost userId="other" />, { wrapper: Providers });
    await waitFor(() => expect(getTrainState().read).toEqual(alone));
    await act(async () => answer(withPartners(sam())));
    expect(getTrainState().read).toEqual(alone);
    expect(getTrainState().userId).toBe('other');
    await second.unmount();
  });
});

describe('the Train together sheet', () => {
  it('shows a live code to scan or share, and leaving while in a session', async () => {
    const actions = fakeActions();
    setTrainActions(actions);
    setTrainState({
      userId: 'me',
      read: withPartners(sam()),
      sheet: { open: true, tab: 'code' },
      invite: {
        token: 'abcdefghijklmnop1234',
        expires_at: new Date(Date.now() + 272_000).toISOString(),
        session_id: 's',
      },
    });
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    const view = await render(<TrainSheet />, { wrapper: Providers });
    expect(screen.getByLabelText('QR code to train together')).toBeOnTheScreen();
    expect(screen.getByText(/^4:3\d$/)).toBeOnTheScreen();
    expect(actions.newInvite).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Share link' }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(JSON.stringify(share.mock.calls[0][0])).toContain(
      'https://relay.test/#train=abcdefghijklmnop1234',
    );
    expect(screen.getByRole('button', { name: 'Leave session' })).toBeOnTheScreen();
    await view.unmount();
  });

  it('asks for a new code when there is none or it expired', async () => {
    const actions = fakeActions();
    setTrainActions(actions);
    setTrainState({
      userId: 'me',
      read: alone,
      sheet: { open: true, tab: 'code' },
      invite: {
        token: 'old',
        expires_at: new Date(Date.now() - 1000).toISOString(),
        session_id: 's',
      },
    });
    const view = await render(<TrainSheet />, { wrapper: Providers });
    await waitFor(() => expect(actions.newInvite).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'Leave session' })).toBeNull();
    await view.unmount();
  });

  it("shows a scanned code's refusal beside the camera, with Add friend", async () => {
    const actions = fakeActions();
    actions.join.mockResolvedValueOnce({
      message: 'Add Sam as a friend to train together.',
      member: { user_id: 'sam', name: 'Sam' },
    });
    setTrainActions(actions);
    setTrainState({ userId: 'me', read: alone, sheet: { open: true, tab: 'scan' } });
    const view = await render(<TrainSheet />, { wrapper: Providers });
    await act(async () =>
      mockCamera.scan?.({ data: 'https://gym.example.com/#train=abcdefghijklmnop1234' }),
    );
    expect(actions.join).toHaveBeenCalledWith('abcdefghijklmnop1234', 'scan');
    expect(await screen.findByText('Add Sam as a friend to train together.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Add friend' }));
    expect(actions.addFriend).toHaveBeenCalledWith({ user_id: 'sam', name: 'Sam' });
    await view.unmount();
  });

  it('hands codes between the friend scanner and the train-together scanner', async () => {
    const onScanned = jest.fn();
    const onTrainInvite = jest.fn();
    const view = await render(
      <QrScanner userId="me" onScanned={onScanned} onTrainInvite={onTrainInvite} />,
      { wrapper: Providers },
    );
    await act(async () =>
      mockCamera.scan?.({ data: 'https://gym.example.com/#train=abcdefghijklmnop1234' }),
    );
    expect(onTrainInvite).toHaveBeenCalledWith('abcdefghijklmnop1234');
    await act(async () =>
      mockCamera.scan?.({
        data: 'https://gym.example.com/#friend=d7131000-7937-40be-b8ee-8b02800f5a36',
      }),
    );
    expect(onScanned).toHaveBeenCalledWith('d7131000-7937-40be-b8ee-8b02800f5a36');
    await view.unmount();
  });
});

describe('the live deck', () => {
  it('shows the entry, then the waiting countdown while a code is live', async () => {
    const actions = fakeActions();
    setTrainActions(actions);
    setTrainState({ userId: 'me', read: alone, invite: null });
    const view = await render(<TrainEntry />, { wrapper: Providers });
    await fireEvent.press(screen.getByRole('button', { name: 'Train together' }));
    expect(actions.openSheet).toHaveBeenCalledWith('code');
    await act(async () =>
      setTrainState({
        invite: {
          token: 'abcdefghijklmnop1234',
          expires_at: new Date(Date.now() + 200_000).toISOString(),
          session_id: 's',
        },
      }),
    );
    expect(screen.getByRole('button', { name: /^Waiting · 3:\d\d$/ })).toBeOnTheScreen();
    await view.unmount();
  });

  it("shows a partner's live line and switches to logging for them", async () => {
    const actions = fakeActions();
    setTrainActions(actions);
    setTrainState({ userId: 'me', read: withPartners(sam()) });
    const view = await render(<TrainDeck unit="kg" />, { wrapper: Providers });
    expect(screen.getByText('Bench Press · 80 kg × 8')).toBeOnTheScreen();
    expect(screen.getByText('1 set')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Log for Sam' }));
    expect(actions.logFor).toHaveBeenCalledWith('sam');
    await view.unmount();
  });

  it('shows a partner with no workout open without a Log button', async () => {
    setTrainState({ userId: 'me', read: withPartners(sam(null)) });
    const view = await render(<TrainDeck unit="kg" />, { wrapper: Providers });
    expect(screen.getByText('No workout open')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Log for Sam' })).toBeNull();
    await view.unmount();
  });

  it("shows the partner's latest set on a lift you share, in your unit", async () => {
    setTrainState({ userId: 'me', read: withPartners(sam()) });
    const view = await render(
      <>
        <PartnerPace exerciseId="my-bench" unit="lb" />
        <PartnerPace exerciseId="my-squat" unit="lb" />
      </>,
      { wrapper: Providers },
    );
    expect(screen.getAllByText(/Set \d/)).toHaveLength(1);
    expect(screen.getByLabelText('Sam, 176.37 lb × 8, set 1')).toBeOnTheScreen();
    await view.unmount();
  });
});

describe('logging for a partner', () => {
  function logFor(extra: Partial<typeof EMPTY_TRAIN_STATE> = {}) {
    const actions = fakeActions();
    setTrainActions(actions);
    const current = draft();
    setTrainState({
      userId: 'me',
      read: withPartners(sam(current)),
      loggingFor: 'sam',
      partnerSync: {
        sam: {
          revision: 3,
          draft: current,
          status: 'synced',
          notApplied: false,
          error: null,
          exercises: null,
        },
      },
      partnerAcked: { sam: current },
      ...extra,
    });
    return { actions, current };
  }
  const applied = (actions: jest.Mocked<TrainActions>, current: ActiveWorkoutDraft) =>
    actions.editPartner.mock.calls.at(-1)![1](current);

  it('edits weight, reps and the tick through the shared helpers', async () => {
    const { actions, current } = logFor();
    const view = await render(<PartnerLogger partnerId="sam" weightUnit="kg" />, {
      wrapper: Providers,
    });
    expect(screen.getByText('Logging for Sam')).toBeOnTheScreen();
    expect(screen.getByText('Sam’s Push workout')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Set 2 weight'), '85');
    expect(applied(actions, current).movements[0].sets[1].weight_kg).toBe(85);
    await fireEvent.changeText(screen.getByLabelText('Set 2 reps'), '6');
    expect(applied(actions, current).movements[0].sets[1].reps).toBe(6);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Set 2, 82.5 kg × 8' }));
    const ticked = applied(actions, current);
    expect(ticked.movements[0].sets[1].completed).toBe(true);
    // The partner's workout stays active while someone else logs it.
    expect(ticked.lastActiveAt).toBeGreaterThan(current.lastActiveAt!);
    await fireEvent.press(screen.getByRole('button', { name: 'Add set to Bench Press' }));
    expect(applied(actions, current).movements[0].sets).toHaveLength(3);
    await fireEvent.press(screen.getByRole('button', { name: 'Back to mine' }));
    expect(actions.logFor).toHaveBeenCalledWith(null);
    await view.unmount();
  });

  it('removes a set from the card menu', async () => {
    const { actions, current } = logFor();
    const view = await render(<PartnerLogger partnerId="sam" weightUnit="kg" />, {
      wrapper: Providers,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Bench Press options' }));
    const options = jest.mocked(showMenu).mock.calls[0][1];
    expect(options.map((option) => option.label)).toEqual(['Remove set 1', 'Remove set 2']);
    options[1].onPress();
    expect(applied(actions, current).movements[0].sets.map((item) => item.key)).toEqual(['s1']);
    await view.unmount();
  });

  it('never shows an unsent tick as saved, and offers Retry when sending failed', async () => {
    const acked = draft();
    const local = draft();
    local.movements[0].sets[1].completed = true;
    logFor({
      partnerAcked: { sam: acked },
      partnerSync: {
        sam: {
          revision: 3,
          draft: local,
          status: 'failed',
          notApplied: false,
          error: new Error('offline'),
          exercises: null,
        },
      },
    });
    const view = await render(<PartnerLogger partnerId="sam" weightUnit="kg" />, {
      wrapper: Providers,
    });
    expect(screen.getByText('Offline · Unsent change')).toBeOnTheScreen();
    const tick = screen.getByRole('checkbox', { name: 'Set 2, 82.5 kg × 8' });
    expect(tick.props.accessibilityState).toEqual({ checked: true, busy: true });
    expect(
      screen.getByRole('checkbox', { name: 'Set 1, 80 kg × 8' }).props.accessibilityState,
    ).toEqual({
      checked: true,
      busy: false,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(getTrainState().partnerSync.sam?.status).toBe('failed');
    await view.unmount();
  });

  it("adds an exercise from the partner's library, and shows one they already have", async () => {
    const { actions, current } = logFor();
    const squat = { ...bench, id: 'sam-squat', name: 'Squat', same_as_exercise_id: null };
    api.partnerExercises.mockResolvedValue([bench, squat]);
    const view = await render(<PartnerLogger partnerId="sam" weightUnit="kg" />, {
      wrapper: Providers,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Add exercise for Sam' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Bench Press' }));
    expect(actions.editPartner).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Add exercise for Sam' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Squat' }));
    expect(actions.editPartner).toHaveBeenCalledWith(
      'sam',
      expect.any(Function),
      expect.any(String),
    );
    const added = applied(actions, current);
    expect(added.movements.at(-1)).toMatchObject({
      exerciseId: 'sam-squat',
      sets: [{ completed: false }],
    });
    await view.unmount();
  });

  it('lets an exercise added here be removed', async () => {
    const { actions, current } = logFor({ added: { sam: ['m2'] } });
    const view = await render(<PartnerLogger partnerId="sam" weightUnit="kg" />, {
      wrapper: Providers,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Cable Fly options' }));
    const options = jest.mocked(showMenu).mock.calls[0][1];
    options.find((option) => option.label === 'Remove exercise')!.onPress();
    expect(applied(actions, current).movements.map((movement) => movement.key)).toEqual(['m1']);
    await view.unmount();
  });
});

describe('saved workouts', () => {
  const person = (user_id: string, display_name: string) => ({
    user_id,
    display_name,
    username: display_name.toLowerCase(),
    photo_url: null,
  });
  const workout = (trained_with: TrackedWorkout['trained_with'], trained_with_count?: number) => ({
    trained_with,
    trained_with_count,
  });

  it.each([
    [workout([person('sam', 'Sam')], 1), 'with Sam'],
    [workout([person('me', 'Preview'), person('priya', 'Priya')], 2), 'with You & Priya'],
    [workout([person('sam', 'Sam')], 2), 'with Sam & 1 other'],
  ])('says who it was trained with', async (saved, label) => {
    const view = await render(<TrainedWithPill workout={saved} />, { wrapper: Providers });
    expect(screen.getByText(label)).toBeOnTheScreen();
    await view.unmount();
  });

  it('shows nothing for a workout trained alone or from an older server', async () => {
    const view = await render(
      <>
        <TrainedWithPill workout={workout([], 0)} />
        <TrainedWithPill workout={workout(undefined)} />
      </>,
      { wrapper: Providers },
    );
    expect(screen.queryByText(/^with /)).toBeNull();
    await view.unmount();
  });
});

it('the start sheet opens the normal Start menu for your own workout', async () => {
  const actions = fakeActions();
  setTrainActions(actions);
  setTrainState({ userId: 'me', read: withPartners(sam()), startWith: 'sam' });
  const view = await render(<TrainStartSheet />, { wrapper: Providers });
  await fireEvent.press(screen.getByRole('button', { name: 'Start my own workout' }));
  expect(actions.closeStartWith).toHaveBeenCalled();
  await waitFor(() => expect(mockWorkout.openStartMenu).toHaveBeenCalled());
  await view.unmount();
});

it('leaves the session from the sheet, with no confirmation', async () => {
  const actions = fakeActions();
  setTrainActions(actions);
  setTrainState({ userId: 'me', read: withPartners(sam()), sheet: { open: true, tab: 'code' } });
  const view = await render(<TrainSheet />, { wrapper: Providers });
  await fireEvent.press(screen.getByRole('button', { name: 'Leave session' }));
  expect(actions.leave).toHaveBeenCalledTimes(1);
  expect(actions.closeSheet).toHaveBeenCalledTimes(1);
  await view.unmount();
});
