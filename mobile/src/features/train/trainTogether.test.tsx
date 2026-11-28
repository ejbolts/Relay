import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';
import { AccessibilityInfo, Share } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  partnerConflictNotice,
  updatePartnerSet,
  type TrainExercise,
  type TrainMember,
  type TrainTogetherRead,
} from '../../../../frontend/src/trainTogether';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import type { ActiveWorkoutDraft } from '../../../../frontend/src/workoutDraft';
import { ApiError } from '../../data/api';
import { showMenu } from '../../ui/prompts';
import { dismissActionToasts, showToast } from '../../ui/Toast';
import { QrScanner } from '../social/FriendQrSheet';
import { socialApi } from '../social/socialApi';
import { WorkoutCard } from '../training/WorkoutCard';
import { PartnerLogger } from './PartnerLogger';
import { PartnerPace, TrainDeck, TrainEntry } from './TrainDeck';
import { TrainedWithPill } from './TrainedWithPill';
import {
  clearPendingTrainInvite,
  pendingTrainInvite,
  requestTrainJoin,
  takePendingTrainInvite,
} from './trainLinks';
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
jest.mock('../../ui/Toast', () => ({
  showToast: jest.fn(),
  dismissActionToasts: jest.fn(),
  toastAccountFor: (id: string) => `account:${id}`,
}));
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
  // Answers queued by one test never reach the next.
  Object.values(api).forEach((request) => request.mockReset());
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
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Sam joined', undefined, { account: 'account:me' }),
    );
    expect(getTrainState().partnerSync.sam?.draft?.clientSessionId).toBe('sam-session');

    // Sam finishes: the session ends with their reason, said once.
    api.read.mockResolvedValueOnce({
      session: null,
      ended: { session_id: 'session-1', reason: 'finished', by_user_id: 'sam', by_name: 'Sam' },
    });
    await act(async () => mockSocket.listener?.());
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Sam finished their workout', undefined, {
        account: 'account:me',
      }),
    );
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
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Training with Sam', undefined, { account: 'account:me' }),
    );
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
        { variant: 'error', account: 'account:me' },
      ),
    );
    await act(async () => toast.mock.calls[0][1]!.run());
    expect(socialApi.addFriend).toHaveBeenCalledWith('sam');
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Friend request sent to Sam', undefined, {
        account: 'account:me',
      }),
    );
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
        account: 'account:me',
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
    expect(actions.logFor).toHaveBeenCalledWith(null, 'sam');
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

type WriteResult = Awaited<ReturnType<typeof api.changePartnerWorkout>>;

describe('the session, after the web review', () => {
  it('keeps a join when an older read that says "no session" arrives after it', async () => {
    const late = deferred<TrainTogetherRead>();
    api.read.mockReturnValueOnce(late.promise);
    api.join.mockResolvedValueOnce(withPartners(sam()));
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await act(async () => void (await trainActions().join('abcdefghijklmnop1234', 'scan')));
    await waitFor(() => expect(getTrainState().read?.session?.id).toBe('session-1'));
    await act(async () => late.resolve(alone));
    await act(async () => new Promise((done) => setTimeout(done, 50)));
    expect(getTrainState().read?.session?.id).toBe('session-1');
    expect(getTrainState().partnerSync.sam).toBeDefined();
    await view.unmount();
  });

  it('never applies a read whose caller is another account', async () => {
    const theirs = withPartners(sam());
    theirs.session!.members[0] = { ...me, user_id: 'someone-else' };
    api.read.mockResolvedValueOnce(theirs);
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await waitFor(() => expect(api.read).toHaveBeenCalled());
    await act(async () => undefined);
    expect(getTrainState().read).toBeNull();
    await view.unmount();
  });

  it.each(['scan', 'link'] as const)(
    'a %s join answered after a sign-out does nothing for the next account',
    async (from) => {
      api.read.mockResolvedValue(alone);
      const refused = deferred<TrainTogetherRead>();
      const accepted = deferred<TrainTogetherRead>();
      api.join.mockReturnValueOnce(refused.promise).mockReturnValueOnce(accepted.promise);
      const first = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
      const actions = trainActions();
      let refusal: unknown = 'unset';
      void actions.join('abcdefghijklmnop1234', from).then((result) => (refusal = result));
      void actions.join('zyxwvutsrqponmlk9876', from);
      await first.unmount();
      const next = await render(<TrainTogetherHost userId="other" />, { wrapper: Providers });
      await act(async () =>
        refused.reject(
          new ApiError(403, 'Add Sam as a friend to train together.', 'train_not_friends', false, {
            user_id: 'sam',
            name: 'Sam',
          }),
        ),
      );
      await act(async () => accepted.resolve(withPartners(sam())));
      // No refusal beside the scanner, no toast, no Add friend, no logger, no start sheet.
      expect(refusal).toBeNull();
      expect(toast).not.toHaveBeenCalled();
      expect(mockWorkout.open).not.toHaveBeenCalled();
      expect(getTrainState().startWith).toBeNull();
      expect(getTrainState().userId).toBe('other');
      await next.unmount();
    },
  );

  it('an Add friend pressed after the account changed does nothing', async () => {
    api.read.mockResolvedValue(alone);
    const first = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    const stale = trainActions();
    await first.unmount();
    const next = await render(<TrainTogetherHost userId="other" />, { wrapper: Providers });
    stale.addFriend({ user_id: 'sam', name: 'Sam' });
    expect(socialApi.addFriend).not.toHaveBeenCalled();
    await next.unmount();
  });

  it('announces a partner who joins, seen by the read after making a code', async () => {
    api.read.mockResolvedValueOnce(alone);
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await waitFor(() => expect(getTrainState().read).toEqual(alone));
    api.invite.mockResolvedValueOnce({
      token: 'abcdefghijklmnop1234',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
      session_id: 'session-1',
    });
    api.read.mockResolvedValueOnce(withPartners(sam(draft(), at(30))));
    await act(async () => trainActions().newInvite());
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Sam joined', undefined, { account: 'account:me' }),
    );
    await view.unmount();
  });

  it('makes one code at a time, never retries by itself, and drops a code from another session', async () => {
    api.read.mockResolvedValue(withPartners());
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await waitFor(() => expect(getTrainState().read?.session?.id).toBe('session-1'));
    const made = deferred<{ token: string; expires_at: string; session_id: string }>();
    api.invite.mockReturnValueOnce(made.promise);
    void trainActions().newInvite();
    void trainActions().newInvite();
    await act(async () => made.reject(new ApiError(409, 'This session is full.', 'train_full')));
    expect(api.invite).toHaveBeenCalledTimes(1);
    expect(getTrainState().inviteError).toBe('This session is full.');
    // A held code for another session goes when the session changes.
    await act(async () =>
      setTrainState({
        invite: {
          token: 't',
          expires_at: new Date(Date.now() + 1000).toISOString(),
          session_id: 'old',
        },
      }),
    );
    api.read.mockResolvedValueOnce(withPartners(sam()));
    await act(async () => mockSocket.listener?.());
    await waitFor(() => expect(getTrainState().invite).toBeNull());
    await view.unmount();
  });

  it('submits a link code once, and leaves once however often Leave is pressed', async () => {
    api.read.mockResolvedValue(withPartners(sam()));
    api.join.mockResolvedValue(withPartners(sam()));
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await act(async () => requestTrainJoin('abcdefghijklmnop1234'));
    await act(async () => requestTrainJoin('abcdefghijklmnop1234'));
    expect(api.join).toHaveBeenCalledTimes(1);
    const leaving = deferred<TrainTogetherRead>();
    api.leave.mockReturnValueOnce(leaving.promise);
    trainActions().leave();
    trainActions().leave();
    await act(async () => leaving.reject(new Error('Could not reach Relay.')));
    expect(api.leave).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(
      "Couldn't leave the session. Could not reach Relay.",
      undefined,
      { variant: 'error', account: 'account:me' },
    );
    await view.unmount();
  });

  it("drops a partner's queue when their workout closes, and starts from the next real one", async () => {
    api.read.mockResolvedValueOnce(withPartners(sam()));
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await waitFor(() => expect(getTrainState().partnerSync.sam?.revision).toBe(3));
    api.read.mockResolvedValueOnce(withPartners(sam(null)));
    await act(async () => mockSocket.listener?.());
    await waitFor(() => expect(getTrainState().partnerSync.sam).toBeUndefined());
    expect(getTrainState().partnerAcked.sam).toBeUndefined();
    const fresh = sam(draft({ clientSessionId: 'sam-again' }));
    fresh.workout!.revision = 11;
    api.read.mockResolvedValueOnce(withPartners(fresh));
    await act(async () => mockSocket.listener?.());
    await waitFor(() => expect(getTrainState().partnerSync.sam?.revision).toBe(11));
    await view.unmount();
  });

  it("closes a partner's logger and says why when the server refuses, rather than offline", async () => {
    api.read.mockResolvedValue(withPartners(sam()));
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await waitFor(() => expect(getTrainState().partnerSync.sam).toBeDefined());
    await act(async () => trainActions().logFor('sam'));
    api.changePartnerWorkout.mockRejectedValueOnce(
      new ApiError(404, 'Not a partner.', 'train_not_partner'),
    );
    await act(async () =>
      trainActions().editPartner('sam', (current) => ({ ...current, notes: 'x' })),
    );
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Sam’s workout is no longer open to you.', undefined, {
        variant: 'error',
        account: 'account:me',
      }),
    );
    expect(getTrainState().loggingFor).toBeNull();
    await view.unmount();
  });
});

describe('logging for a partner, after the web review', () => {
  async function partnerMode() {
    api.read.mockResolvedValue(withPartners(sam()));
    api.partnerExercises.mockResolvedValue([
      bench,
      fly,
      { ...bench, id: 'sam-row', name: 'Row', same_as_exercise_id: null },
    ]);
    const view = await render(
      <>
        <TrainTogetherHost userId="me" />
        <PartnerLogger partnerId="sam" weightUnit="kg" />
      </>,
      { wrapper: Providers },
    );
    await waitFor(() => expect(getTrainState().partnerSync.sam).toBeDefined());
    await act(async () => trainActions().logFor('sam'));
    return view;
  }
  const echo = () =>
    api.changePartnerWorkout.mockImplementation(async (_id, change) => ({
      revision: 9,
      draft: change.draft,
      conflict: false,
      exercises: [bench, fly],
    }));

  it('keeps a new set, its reps and its tick under one key when an earlier edit conflicts', async () => {
    const view = await partnerMode();
    const first = deferred<WriteResult>();
    api.changePartnerWorkout.mockReturnValueOnce(first.promise);
    // An edit in flight, then the new set, its reps and its tick while it runs.
    await fireEvent.changeText(screen.getByLabelText('Set 2 weight'), '85');
    await fireEvent.press(screen.getByRole('button', { name: 'Add set to Bench Press' }));
    await fireEvent.changeText(screen.getByLabelText('Set 3 reps'), '6');
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Set 3,/ }));
    echo();
    // The server's copy changed meanwhile: the weight is not applied, the later edits replay.
    await act(async () =>
      first.resolve({
        revision: 8,
        draft: draft({ notes: 'theirs' }),
        conflict: true,
        exercises: [bench, fly],
      }),
    );
    await waitFor(() => expect(getTrainState().partnerSync.sam?.status).toBe('synced'));
    const followUp = api.changePartnerWorkout.mock.calls.at(-1)![1];
    const sent = followUp.draft;
    const added = sent.movements[0].sets[2];
    // Sent against the copy the edits were made on, at the server's revision, so it merges.
    expect(followUp.revision).toBe(8);
    expect(sent.movements[0].sets[1].weight_kg).toBe(82.5);
    expect(added).toMatchObject({ reps: 6, completed: true });
    expect(sent.movements[0].sets.filter((item) => item.key === added.key)).toHaveLength(1);
    await view.unmount();
  });

  it('keeps an added exercise and its reps under one key when an earlier edit conflicts', async () => {
    const view = await partnerMode();
    const first = deferred<WriteResult>();
    api.changePartnerWorkout.mockReturnValueOnce(first.promise);
    await fireEvent.changeText(screen.getByLabelText('Set 2 weight'), '85');
    await fireEvent.press(screen.getByRole('button', { name: 'Add exercise for Sam' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Row' }));
    const rowReps = await waitFor(() => {
      const fields = screen.getAllByLabelText('Set 1 reps');
      expect(fields).toHaveLength(3);
      return fields[2];
    });
    await fireEvent.changeText(rowReps, '12');
    echo();
    await act(async () =>
      first.resolve({
        revision: 8,
        draft: draft({ notes: 'theirs' }),
        conflict: true,
        exercises: [bench, fly],
      }),
    );
    await waitFor(() => expect(getTrainState().partnerSync.sam?.status).toBe('synced'));
    const sent = api.changePartnerWorkout.mock.calls.at(-1)![1].draft;
    const rows = sent.movements.filter((movement) => movement.exerciseId === 'sam-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].sets).toEqual([expect.objectContaining({ reps: 12 })]);
    expect(getTrainState().added.sam).toEqual([rows[0].key]);
    await view.unmount();
  });

  it('counts only acknowledged sets as done, and marks any unacknowledged change pending', async () => {
    const acked = draft();
    const local = draft();
    local.movements[0].sets[0].weight_kg = 82.5;
    local.movements[0].sets[1].completed = true;
    setTrainActions(fakeActions());
    setTrainState({
      userId: 'me',
      read: withPartners(sam(acked)),
      loggingFor: 'sam',
      partnerSync: {
        sam: {
          revision: 3,
          draft: local,
          status: 'syncing',
          notApplied: false,
          error: null,
          exercises: null,
        },
      },
      partnerAcked: { sam: acked },
    });
    const view = await render(<PartnerLogger partnerId="sam" weightUnit="kg" />, {
      wrapper: Providers,
    });
    expect(screen.getByText('Sam’s sets · 1 done')).toBeOnTheScreen();
    // Set 1 was done already; its new weight isn't saved yet, so it looks pending too.
    expect(
      screen.getAllByRole('checkbox', { name: /^Set 1,/ })[0].props.accessibilityState.busy,
    ).toBe(true);
    expect(screen.queryByText('Offline · Unsent change')).toBeNull();
    await view.unmount();
  });

  it('keeps invalid numbers on screen without sending them, clears on empty, reads pounds', async () => {
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
    });
    const view = await render(<PartnerLogger partnerId="sam" weightUnit="lb" />, {
      wrapper: Providers,
    });
    const reps = screen.getByLabelText('Set 2 reps');
    await fireEvent.changeText(reps, '6.5');
    await fireEvent.changeText(reps, '-1');
    await fireEvent.changeText(reps, '99999');
    expect(actions.editPartner).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Set 2 reps').props.value).toBe('99999');
    await fireEvent.changeText(reps, '');
    expect(actions.editPartner.mock.calls.at(-1)![1](current).movements[0].sets[1].reps).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Set 2 weight'), '200');
    const update = actions.editPartner.mock.calls.at(-1)![1];
    expect(update(current).movements[0].sets[1].weight_kg).toBeCloseTo(90.718, 2);
    // Every updater is safe to run twice: the same result each time.
    expect(update(current)).toEqual(update(current));
    await view.unmount();
  });

  it('follows the owner’s pause rules for the clock', async () => {
    setTrainActions(fakeActions());
    const paused = draft({ pausedAt: Date.now() - 60_000, pausedMs: 0 });
    setTrainState({
      userId: 'me',
      read: withPartners(sam(paused)),
      loggingFor: 'sam',
      partnerAcked: { sam: paused },
    });
    const view = await render(<PartnerLogger partnerId="sam" weightUnit="kg" />, {
      wrapper: Providers,
    });
    // Started 20 minutes ago, paused a minute ago: 19 minutes, and not "Live".
    expect(screen.getByText(/^19:\d\d$/)).toBeOnTheScreen();
    await view.unmount();
  });

  it('moves focus to the banner on entering, and uses first names in tight places', async () => {
    const focus = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(() => undefined);
    setTrainActions(fakeActions());
    const long = { ...sam(), display_name: 'Sam Rivera' };
    setTrainState({
      userId: 'me',
      read: withPartners(long),
      loggingFor: 'sam',
      partnerAcked: { sam: draft() },
    });
    const view = await render(<PartnerLogger partnerId="sam" weightUnit="kg" />, {
      wrapper: Providers,
    });
    expect(screen.getByText('Logging for Sam Rivera')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add exercise for Sam' })).toBeOnTheScreen();
    expect(screen.getAllByText('Sam’s sets · 1 done').length).toBeGreaterThan(0);
    expect(focus).toHaveBeenCalled();
    await view.unmount();
    const deck = await render(<TrainDeck unit="kg" />, { wrapper: Providers });
    expect(screen.getByRole('button', { name: 'Log for Sam' })).toBeOnTheScreen();
    expect(screen.getByText('Sam Rivera')).toBeOnTheScreen();
    await deck.unmount();
    focus.mockRestore();
  });
});

describe('the scanner, after the web review', () => {
  it('does not resubmit a refused code until Scan again', async () => {
    const actions = fakeActions();
    actions.join.mockResolvedValue({ message: 'This code has expired. Ask for a new one.' });
    setTrainActions(actions);
    setTrainState({ userId: 'me', read: alone, sheet: { open: true, tab: 'scan' } });
    const view = await render(<TrainSheet />, { wrapper: Providers });
    const code = { data: 'https://gym.example.com/#train=abcdefghijklmnop1234' };
    await act(async () => mockCamera.scan?.(code));
    await act(async () => mockCamera.scan?.(code));
    expect(actions.join).toHaveBeenCalledTimes(1);
    await fireEvent.press(await screen.findByRole('button', { name: 'Scan again' }));
    await act(async () => mockCamera.scan?.(code));
    expect(actions.join).toHaveBeenCalledTimes(2);
    await view.unmount();
  });
});

it('shows a real saved-workout card with one visible and one hidden partner', async () => {
  const workout = {
    id: 'w1',
    name: 'Push day',
    workout_date: '2026-11-28',
    category: 'push',
    notes: null,
    duration_minutes: 52,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: '2026-11-28T09:00:00Z',
    updated_at: '2026-11-28T10:00:00Z',
    movements: [],
    trained_with: [{ user_id: 'sam', display_name: 'Sam', username: 'sam', photo_url: null }],
    trained_with_count: 2,
  } as TrackedWorkout;
  const view = await render(
    <WorkoutCard
      workout={workout}
      color="#f00"
      records={0}
      open={false}
      onToggle={() => undefined}
      showYear={false}
    />,
    { wrapper: Providers },
  );
  expect(screen.getByText('with Sam & 1 other')).toBeOnTheScreen();
  await view.unmount();
});

describe('after the second review', () => {
  const statusOf = () => getTrainState().partnerSync.sam?.status;

  async function hostWithSam() {
    api.read.mockResolvedValue(withPartners(sam()));
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await waitFor(() => expect(getTrainState().partnerSync.sam).toBeDefined());
    return view;
  }

  it('settles your own Undo before showing a partner’s logger', async () => {
    const view = await hostWithSam();
    await act(async () => trainActions().logFor('sam'));
    expect(dismissActionToasts).toHaveBeenCalledTimes(1);
    await act(async () => trainActions().logFor(null, 'sam'));
    expect(dismissActionToasts).toHaveBeenCalledTimes(1);
    await view.unmount();
  });

  it('keeps edits replayed after a conflict pending until the server has them', async () => {
    const view = await hostWithSam();
    const first = deferred<WriteResult>();
    api.changePartnerWorkout
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new Error('Could not reach Relay.'));
    const now = Date.now();
    await act(async () => {
      trainActions().editPartner('sam', (current) =>
        updatePartnerSet(current, 'm1', 's2', { weight_kg: 85 }, now),
      );
      trainActions().editPartner('sam', (current) =>
        updatePartnerSet(current, 'm1', 's2', { completed: true }, now),
      );
    });
    await act(async () =>
      first.resolve({ revision: 8, draft: draft(), conflict: true, exercises: [bench, fly] }),
    );
    await waitFor(() => expect(statusOf()).toBe('failed'));
    // The tick was replayed on the server's copy but never sent: still pending, not counted.
    expect(getTrainState().partnerSync.sam?.draft?.movements[0].sets[1].completed).toBe(true);
    expect(getTrainState().partnerAcked.sam?.movements[0].sets[1].completed).toBe(false);
    await view.unmount();
  });

  it.each([
    [new ApiError(500, 'Relay could not complete this request.'), 'offline'],
    [new ApiError(429, 'Too many requests.'), 'offline'],
    [new ApiError(408, 'Timed out.'), 'offline'],
    [new Error('Could not reach Relay.'), 'offline'],
    [new ApiError(403, 'No.'), 'refused'],
    [new ApiError(422, 'Not allowed.', 'train_change_not_allowed'), 'refused'],
  ])('treats %p as %s', async (error, expected) => {
    const view = await hostWithSam();
    await act(async () => trainActions().logFor('sam'));
    api.changePartnerWorkout.mockRejectedValueOnce(error);
    await act(async () =>
      trainActions().editPartner('sam', (current) => ({ ...current, notes: 'x' })),
    );
    if (expected === 'offline') {
      // Kept for Retry, with the logger still open.
      await waitFor(() => expect(statusOf()).toBe('failed'));
      expect(getTrainState().loggingFor).toBe('sam');
      expect(getTrainState().partnerSync.sam?.draft?.notes).toBe('x');
    } else {
      await waitFor(() => expect(getTrainState().loggingFor).toBeNull());
    }
    await view.unmount();
  });

  it('binds every notice to the account', async () => {
    api.read.mockResolvedValueOnce(withPartners());
    const view = await render(<TrainTogetherHost userId="me" />, { wrapper: Providers });
    await waitFor(() => expect(getTrainState().read).toBeTruthy());
    api.read.mockResolvedValueOnce(withPartners(sam(draft(), at(30))));
    await act(async () => mockSocket.listener?.());
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Sam joined', undefined, { account: 'account:me' }),
    );
    await view.unmount();
  });

  it('shows the server’s value in a focused field once an edit comes back not applied', async () => {
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
    });
    const view = await render(<PartnerLogger partnerId="sam" weightUnit="kg" />, {
      wrapper: Providers,
    });
    const weight = screen.getByLabelText('Set 2 weight');
    await fireEvent(weight, 'focus');
    // Typed but not in the stored draft yet (the fake action keeps it): looks pending.
    await fireEvent.changeText(weight, '85');
    expect(screen.getByLabelText('Set 2 weight').props.accessibilityHint).toBe('Not saved yet');
    // The server's copy won: the field shows its value even while focused.
    await act(async () => setTrainState({ partnerConflicts: { sam: 1 } }));
    expect(screen.getByLabelText('Set 2 weight').props.value).toBe('82.5');
    await view.unmount();
  });

  it('clears the focus return once focus has moved', async () => {
    const focus = jest
      .spyOn(AccessibilityInfo, 'sendAccessibilityEvent')
      .mockImplementation(() => undefined);
    setTrainState({ userId: 'me', read: withPartners(sam()), focusReturn: 'sam' });
    const view = await render(<TrainDeck unit="kg" />, { wrapper: Providers });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(getTrainState().focusReturn).toBeNull();
    await view.unmount();
    focus.mockRestore();
  });

  it("keeps one account's late read out of the next, under one shared query client", async () => {
    const shared = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const SharedProviders = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={shared}>{children}</QueryClientProvider>
    );
    const late = deferred<TrainTogetherRead>();
    api.read.mockReturnValueOnce(late.promise);
    const first = await render(<TrainTogetherHost userId="me" />, { wrapper: SharedProviders });
    await first.unmount();
    api.read.mockResolvedValue(alone);
    const second = await render(<TrainTogetherHost userId="other" />, {
      wrapper: SharedProviders,
    });
    await waitFor(() => expect(getTrainState().read).toEqual(alone));
    // The first account's answer arrives after the switch, into the same client.
    await act(async () => late.resolve(withPartners(sam())));
    await act(async () => mockSocket.listener?.());
    await act(async () => new Promise((done) => setTimeout(done, 20)));
    expect(getTrainState().read).toEqual(alone);
    expect(getTrainState().partnerSync).toEqual({});
    await second.unmount();
  });
});

describe('a kept link code', () => {
  it('is deleted once older than five minutes, and when cleared', async () => {
    const { memoryKv } = jest.requireActual<typeof import('../../testing/memoryKvStore')>(
      '../../testing/memoryKvStore',
    );
    requestTrainJoin('abcdefghijklmnop1234', Date.now() - 6 * 60_000);
    expect(pendingTrainInvite()).toBeNull();
    expect(memoryKv.has('relay.pendingTrainInvite')).toBe(false);
    requestTrainJoin('abcdefghijklmnop1234');
    expect(memoryKv.has('relay.pendingTrainInvite')).toBe(true);
    clearPendingTrainInvite();
    expect(memoryKv.has('relay.pendingTrainInvite')).toBe(false);
  });
});
