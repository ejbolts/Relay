import { AppState, type AppStateStatus } from 'react-native';

type Api = typeof import('./api');
type Status = typeof import('./connectionStatus');

jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0', extra: {} } }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: async () => JSON.stringify({ origin: 'https://relay.test', token: 'sample-token' }),
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined,
}));

const reply = (status: number) =>
  ({ ok: status < 400, status, json: async () => ({ error: { message: 'No' } }) }) as Response;
const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => reply(200));
let appStateListener: ((state: AppStateStatus) => void) | undefined;
let api: Api;
let status: Status;
let stop: () => void;

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => reply(200));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (state: AppStateStatus) => void;
    return { remove: () => (appStateListener = undefined) } as ReturnType<
      typeof AppState.addEventListener
    >;
  });
  process.env.EXPO_PUBLIC_RELAY_API_ORIGIN = 'https://relay.test';
  // The request layer, the outcome hook and the monitor from one module load.
  jest.isolateModules(() => {
    api = jest.requireActual<Api>('./api');
    status = jest.requireActual<Status>('./connectionStatus');
  });
  // Something shows the status, so the monitor checks and confirms.
  stop = status.connection.subscribe(() => undefined);
});

afterEach(() => {
  stop();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const unreachable = () => fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
const health = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/api/health')).length;

it('hears a save that reached nothing straight from the request layer', async () => {
  unreachable();
  await expect(api.apiSend('/api/workouts/w1/live', 'PUT', {})).rejects.toThrow(
    'Could not reach Relay',
  );
  expect(status.connection.state()).toMatchObject({ phase: 'checking', server: 'unreachable' });
});

it('reads a proxy answering 502–504 as Relay down, before any check runs', async () => {
  fetchMock.mockResolvedValueOnce(reply(503));
  await expect(api.apiGet('/api/dashboard')).rejects.toBeInstanceOf(api.ApiError);
  expect(health()).toBe(0);
  expect(status.connection.state()).toMatchObject({ phase: 'checking', server: 'down' });
});

it.each([401, 404, 422, 500])(
  'counts a %i answer as Relay reached, ending the outage',
  async (code) => {
    unreachable();
    await expect(api.apiGet('/api/dashboard')).rejects.toThrow();
    expect(status.connection.state().phase).toBe('checking');
    fetchMock.mockResolvedValueOnce(reply(code));
    await expect(api.apiGet('/api/dashboard')).rejects.toBeInstanceOf(api.ApiError);
    expect(status.connection.state().phase).toBe('online');
  },
);

it('reports nothing for a request the screen cancelled', async () => {
  const screen = new AbortController();
  fetchMock.mockImplementationOnce(
    (_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')));
      }),
  );
  const cancelled = expect(api.apiGet('/api/dashboard', screen.signal)).rejects.toThrow('Aborted');
  await jest.advanceTimersByTimeAsync(0);
  screen.abort();
  await cancelled;
  expect(status.connection.state().phase).toBe('online');
});

it('a failure the caller turns into data still counts as a failure', async () => {
  unreachable();
  const fallback = await api.apiGet('/api/auth/friend-invite').catch(() => ({ invite_code: null }));
  expect(fallback).toEqual({ invite_code: null });
  expect(status.connection.state().phase).toBe('checking');
});

it('checks at once when the app returns to the foreground during an outage', async () => {
  fetchMock.mockImplementation(async () => {
    throw new TypeError('Network request failed');
  });
  await expect(api.apiGet('/api/dashboard')).rejects.toThrow();
  expect(health()).toBe(0);
  appStateListener?.('active');
  await jest.advanceTimersByTimeAsync(0);
  expect(health()).toBe(1);
});
