import { onlineManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';
import { connectLivePresence } from './livePresence';
import { sessionToken } from './session';

jest.mock('./api', () => ({
  apiOrigin: 'https://relay.test',
  serverOrigin: () => 'https://relay.test',
  clientVersionHeaders: () => ({ 'X-Relay-Version': '1.3.2' }),
}));
jest.mock('./deviceStorage', () => ({
  newId: () => 'phone-id',
  readJson: () => null,
  writeJson: () => true,
}));
jest.mock('./session', () => ({ sessionToken: jest.fn(async () => 'phone-token') }));

class Socket {
  static readonly OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen?: () => void;
  onclose?: (event: { code: number }) => void;
  onmessage?: (event: { data: string }) => void;
  send = jest.fn();
  close = jest.fn();

  constructor(
    readonly url: string,
    readonly protocols: string[],
    readonly options: { headers: Record<string, string> },
  ) {
    Socket.instances.push(this);
  }

  open() {
    this.readyState = Socket.OPEN;
    this.onopen?.();
  }
}

const originalSocket = globalThis.WebSocket;
const originalAppState = AppState.currentState;
const listeners = () => ({
  readWorkout: () => null,
  onOpen: jest.fn(),
  onActiveWorkout: jest.fn(),
  onFriendPresence: jest.fn(),
  onNotifications: jest.fn(),
  onSignedOut: jest.fn(),
});
let changeAppState: (state: AppStateStatus) => void;
let live: ReturnType<typeof connectLivePresence> | undefined;

beforeEach(() => {
  jest.useFakeTimers();
  Socket.instances = [];
  globalThis.WebSocket = Socket as unknown as typeof WebSocket;
  AppState.currentState = 'active';
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    changeAppState = listener;
    return { remove: jest.fn() };
  });
  onlineManager.setOnline(true);
});

afterEach(() => {
  live?.stop();
  jest.useRealTimers();
  jest.restoreAllMocks();
  AppState.currentState = originalAppState;
  globalThis.WebSocket = originalSocket;
});

test('uses bearer auth, sends foreground state and relays server updates', async () => {
  const callbacks = listeners();
  live = connectLivePresence(callbacks);
  await Promise.resolve();
  const [socket] = Socket.instances;
  expect(socket.url).toBe('wss://relay.test/api/presence/ws');
  expect(socket.options.headers).toMatchObject({
    Authorization: 'Bearer phone-token',
    'X-Relay-Version': '1.3.2',
  });
  socket.open();
  expect(callbacks.onOpen).toHaveBeenCalledTimes(1);
  expect(JSON.parse(socket.send.mock.calls[0][0])).toEqual({
    type: 'state',
    device: 'phone-id',
    visible: true,
    workout: null,
  });
  live.report();
  expect(socket.send).toHaveBeenCalledTimes(1);

  socket.onmessage?.({ data: '{"type":"active_workout"}' });
  const presence = { type: 'presence', user_id: 'friend-id', presence: { online: true } };
  socket.onmessage?.({ data: JSON.stringify(presence) });
  socket.onmessage?.({ data: 'invalid JSON' });
  expect(callbacks.onActiveWorkout).toHaveBeenCalledTimes(1);
  expect(callbacks.onFriendPresence).toHaveBeenCalledWith(presence);
  socket.onmessage?.({ data: '{"type":"notifications"}' });
  expect(callbacks.onNotifications).toHaveBeenCalledTimes(1);

  changeAppState('background');
  expect(socket.close).toHaveBeenCalledWith(1000);
  socket.onmessage?.({ data: '{"type":"active_workout"}' });
  expect(callbacks.onActiveWorkout).toHaveBeenCalledTimes(1);

  changeAppState('active');
  await Promise.resolve();
  expect(Socket.instances).toHaveLength(2);
});

test('retries a dropped socket and stops on session revocation', async () => {
  const callbacks = listeners();
  live = connectLivePresence(callbacks);
  await Promise.resolve();
  Socket.instances[0].onclose?.({ code: 1006 });
  await jest.advanceTimersByTimeAsync(1_000);
  const [, retry] = Socket.instances;
  expect(retry).toBeDefined();
  retry.onclose?.({ code: 4401 });
  onlineManager.setOnline(false);
  onlineManager.setOnline(true);
  await jest.advanceTimersByTimeAsync(30_000);
  expect(callbacks.onSignedOut).toHaveBeenCalledTimes(1);
  expect(Socket.instances).toHaveLength(2);
});

test('does not open a late socket after losing the network while reading the token', async () => {
  let resolveToken!: (token: string) => void;
  jest
    .mocked(sessionToken)
    .mockImplementationOnce(() => new Promise((resolve) => (resolveToken = resolve)));
  live = connectLivePresence(listeners());
  onlineManager.setOnline(false);
  resolveToken('started-online');
  await Promise.resolve();
  expect(Socket.instances).toHaveLength(0);

  onlineManager.setOnline(true);
  await Promise.resolve();
  expect(Socket.instances).toHaveLength(1);
});
