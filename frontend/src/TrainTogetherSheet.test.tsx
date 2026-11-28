// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jsQR from 'jsqr';
import { ApiError, api } from './api';
import { FriendQrScanner } from './FriendQrScanner';
import { ToastProvider } from './Toast';
import {
  TRAIN_ERRORS,
  type TrainInvite,
  type TrainMember,
  type TrainSession,
} from './trainTogether';
import { TRAIN_INVITE_EVENT } from './trainTogetherInvite';
import { TrainTogetherSheet } from './TrainTogetherSheet';
import { TrainTogetherStartSheet } from './TrainTogetherStartSheet';
import { partnerPalettes } from './trainTogetherTheme';
import type { User } from './types';

vi.mock('jsqr', () => ({ default: vi.fn() }));

const USER: User = {
  id: 'u-alex',
  username: 'alex',
  display_name: 'Alex',
  is_admin: false,
  profile_photo_url: null,
} as User;

const INVITE: TrainInvite = {
  token: 'AbCdEfGhIjKlMnOpQrStUvWx',
  expires_at: new Date(Date.now() + 272_000).toISOString(),
  session_id: 'sess-1',
};

const PARTNER: TrainMember = {
  user_id: 'u-sam',
  username: 'sam',
  display_name: 'Sam',
  photo_url: null,
  is_self: false,
  joined_at: '2026-11-28T08:01:00Z',
  workout: {
    revision: 3,
    draft: {
      version: 1,
      startedAt: Date.now() - 120_000,
      updatedAt: Date.now(),
      name: 'Push day',
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
          sets: [],
        },
        {
          key: 'm2',
          exerciseId: 'sam-fly',
          notes: '',
          machinePhotoIds: [],
          supersetKey: null,
          sets: [],
        },
      ],
    },
    exercises: [
      {
        id: 'sam-bench',
        name: 'Bench Press',
        kind: 'strength',
        category: 'push',
        muscle_group: 'Chest',
        equipment: 'Barbell',
        same_as_exercise_id: 'alex-bench',
      },
      {
        id: 'sam-fly',
        name: 'Cable Fly',
        kind: 'strength',
        category: 'push',
        muscle_group: 'Chest',
        equipment: 'Cable',
        same_as_exercise_id: null,
      },
    ],
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
    };
  }
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(jsQR).mockReset();
});

function setupCameraScan(decoded: string) {
  let now = 0;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb((now += 1000)), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
    },
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4);
  vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(640);
  vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(640);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
    getImageData: (_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    }),
  } as unknown as CanvasRenderingContext2D);
  vi.mocked(jsQR).mockReturnValue({ data: decoded } as ReturnType<typeof jsQR>);
}

describe('TrainTogetherSheet', () => {
  it('renders QR code, countdown, Copy link toast, active partners and Leave session', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const onLeave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const session: TrainSession = {
      id: 'sess-1',
      started_at: '2026-11-28T08:00:00Z',
      expires_at: '2026-11-28T20:00:00Z',
      created_by: USER.id,
      max_members: 4,
      members: [
        {
          user_id: USER.id,
          username: USER.username,
          display_name: USER.display_name,
          photo_url: null,
          is_self: true,
          joined_at: '2026-11-28T08:00:00Z',
          workout: null,
        },
        PARTNER,
      ],
    };

    await act(async () =>
      root.render(
        <ToastProvider>
          <TrainTogetherSheet
            user={USER}
            session={session}
            partners={[PARTNER]}
            palettes={partnerPalettes('blue', 1, false)}
            invite={INVITE}
            inviteSeconds={272}
            creatingInvite={false}
            joining={false}
            leaving={false}
            onCreateInvite={vi.fn().mockResolvedValue(INVITE)}
            onJoin={vi.fn().mockResolvedValue(undefined)}
            onLeave={onLeave}
            onClose={onClose}
          />
        </ToastProvider>,
      ),
    );

    const dialog = document.querySelector('dialog.train-together-sheet')!;
    expect(dialog.querySelector('svg.qr-code')).not.toBeNull();
    expect(dialog.textContent).toContain('4:32');
    expect(dialog.textContent).toContain('Sam');

    const copyBtn = [...dialog.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Copy link'),
    )!;
    await act(async () => copyBtn.click());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/#train=${INVITE.token}`);
    expect(document.body.textContent).toContain('Link copied');

    const leaveBtn = [...dialog.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Leave session'),
    )!;
    await act(async () => leaveBtn.click());
    expect(onLeave).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows not-friends error with Add friend button that sends friend request', async () => {
    setupCameraScan(`https://gym.example.com/#train=${INVITE.token}`);
    const addFriendSpy = vi
      .spyOn(api.sharing, 'addFriend')
      .mockResolvedValue({ status: 'outgoing' });
    const onJoin = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Add Jordan as a friend to train together.', TRAIN_ERRORS.notFriends, 403, {
          user_id: 'u-jordan',
          name: 'Jordan',
        }),
      );

    await act(async () =>
      root.render(
        <ToastProvider>
          <TrainTogetherSheet
            user={USER}
            session={null}
            partners={[]}
            palettes={partnerPalettes('blue', 1, false)}
            invite={INVITE}
            inviteSeconds={270}
            creatingInvite={false}
            joining={false}
            leaving={false}
            initialTab="scan"
            onCreateInvite={vi.fn().mockResolvedValue(INVITE)}
            onJoin={onJoin}
            onLeave={vi.fn().mockResolvedValue(undefined)}
            onClose={vi.fn()}
          />
        </ToastProvider>,
      ),
    );

    for (let i = 0; i < 4; i += 1) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    }

    const dialog = document.querySelector('dialog.train-together-sheet')!;
    expect(onJoin).toHaveBeenCalledWith(INVITE.token);
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain(
      'Add Jordan as a friend to train together.',
    );

    const addBtn = [...dialog.querySelectorAll('button')].find(
      (b) => b.textContent === 'Add friend',
    )!;
    await act(async () => addBtn.click());
    expect(addFriendSpy).toHaveBeenCalledWith('u-jordan');
    expect(addBtn.textContent).toBe('Friend request sent');
  });
});

describe('FriendQrScanner cross-handoff', () => {
  it('hands a scanned train link in the friend scanner to the train join path', async () => {
    setupCameraScan(`https://gym.example.com/#train=${INVITE.token}`);
    const received = vi.fn();
    window.addEventListener(TRAIN_INVITE_EVENT, received);
    try {
      await act(async () => root.render(<FriendQrScanner userId={USER.id} onScanned={vi.fn()} />));
      for (let i = 0; i < 4; i += 1) {
        await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
      }
      expect(received).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(TRAIN_INVITE_EVENT, received);
    }
  });
});

describe('TrainTogetherStartSheet', () => {
  it('lists matched and unmatched chips and triggers both start actions', async () => {
    const onStartWithPartner = vi.fn();
    const onStartOwn = vi.fn();
    await act(async () =>
      root.render(
        <TrainTogetherStartSheet
          partner={PARTNER}
          palette={partnerPalettes('blue', 1, false)[0]}
          onStartWithPartner={onStartWithPartner}
          onStartOwn={onStartOwn}
          onClose={vi.fn()}
        />,
      ),
    );

    const dialog = document.querySelector('dialog.train-together-start-sheet')!;
    expect(dialog.textContent).toContain('Train with Sam');
    expect(dialog.textContent).toContain('Bench Press');
    expect(dialog.textContent).toContain('Cable Fly · no match');

    const copyBtn = [...dialog.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Start with Sam’s exercises'),
    )!;
    await act(async () => copyBtn.click());
    expect(onStartWithPartner).toHaveBeenCalledWith(['alex-bench'], ['Cable Fly']);

    const ownBtn = [...dialog.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Start my own workout'),
    )!;
    await act(async () => ownBtn.click());
    expect(onStartOwn).toHaveBeenCalledOnce();
  });
});
