import { act, render } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { mergeTipStates, TIP_SYNC_DEBOUNCE_MS } from '../../../../frontend/src/tipSync';
import { tipStorageKey } from '../../../../frontend/src/tipsState';
import { ApiError, request } from '../../data/api';
import { forgetSessionTokenIf, sessionToken } from '../../data/session';
import { nextSessionEpoch } from '../../session/sessionEpoch';
import { memoryKv } from '../../testing/memoryKvStore';
import { resetTipsForTests, tipsFor } from './tips';
import { TipSyncHost } from './TipSyncHost';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
const mockSession = { user: { id: 'u1' } };
jest.mock('../../session/SessionProvider', () => ({ useUser: () => mockSession.user }));
jest.mock('../../data/api', () => ({
  ...jest.requireActual('../../data/api'),
  request: jest.fn(),
  serverOrigin: () => 'https://relay.example.com',
}));
jest.mock('../../data/session', () => ({
  sessionToken: jest.fn(),
  forgetSessionTokenIf: jest.fn(),
}));

/** Each account's tips on the server, merged on every save as /api/tips does. */
let server: Record<string, Record<string, unknown>>;
let tokens: Record<string, string>;
const accountFor = (token: string) => Object.keys(tokens).find((id) => tokens[id] === token)!;
const sent = () =>
  jest.mocked(request).mock.calls.filter(([path]) => path.startsWith('/api/tips?'));
let appStateListener: ((state: AppStateStatus) => void) | undefined;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  memoryKv.clear();
  resetTipsForTests();
  mockSession.user = { id: 'u1' };
  server = { u1: {}, u2: {} };
  tokens = { u1: 'token-1', u2: 'token-2' };
  jest.mocked(sessionToken).mockImplementation(async () => tokens[mockSession.user.id]);
  jest.mocked(request).mockImplementation(async (path, init, token) => {
    const account = accountFor(token as string);
    server[account] = mergeTipStates(server[account], JSON.parse(String(init?.body)));
    return server[account];
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener;
    return { remove: () => (appStateListener = undefined) };
  });
});
afterEach(() => {
  jest.useRealTimers();
});

const flush = () => act(async () => jest.advanceTimersByTimeAsync(0));

test('on sign-in, the account’s tips from the web merge into this phone’s', async () => {
  server.u1 = { seen: { plates: 'learned', futureTip: 'dismissed' }, enabled: false, enabledAt: 7 };
  tipsFor('u1').dismiss('swap');
  await render(<TipSyncHost />);
  await flush();
  const [[path, init, token]] = sent();
  expect(path).toBe('/api/tips?account=u1');
  expect(init?.method).toBe('PUT');
  expect(token).toBe('token-1');
  expect(tipsFor('u1').get()).toMatchObject({
    enabled: false,
    enabledAt: 7,
    seen: { plates: 'learned', swap: 'dismissed' },
  });
  expect(JSON.parse(memoryKv.get(tipStorageKey('u1'))!).seen.plates).toBe('learned');
  // The phone's progress reached the account, and the tip it doesn't know stayed there.
  expect(server.u1.seen).toEqual({ plates: 'learned', futureTip: 'dismissed', swap: 'dismissed' });
});

test('a change on this phone is saved to the account after a pause', async () => {
  await render(<TipSyncHost />);
  await flush();
  tipsFor('u1').enable(false);
  await act(async () => jest.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS - 1));
  expect(sent()).toHaveLength(1);
  await act(async () => jest.advanceTimersByTimeAsync(1));
  expect(sent()).toHaveLength(2);
  expect(server.u1).toMatchObject({ enabled: false, enabledAt: expect.any(Number) });
});

test('coming back to the app fetches the account’s tips', async () => {
  await render(<TipSyncHost />);
  await flush();
  await act(async () => jest.advanceTimersByTimeAsync(60_000));
  server.u1 = { seen: { back: 'dismissed' } };
  await act(async () => appStateListener?.('active'));
  await flush();
  expect(tipsFor('u1').get().seen.back).toBe('dismissed');
});

test('a late reply after switching accounts never reaches either account', async () => {
  let reply: (value: unknown) => void = () => {};
  jest.mocked(request).mockImplementationOnce(() => new Promise((resolve) => (reply = resolve)));
  const view = await render(<TipSyncHost />);
  await flush();
  // Signed out of u1 and into u2 before the server answered.
  nextSessionEpoch();
  mockSession.user = { id: 'u2' };
  await view.rerender(<TipSyncHost />);
  await flush();
  await act(async () => reply({ seen: { plates: 'learned' }, enabled: false, enabledAt: 9 }));
  expect(tipsFor('u2').get().seen).toEqual({});
  expect(tipsFor('u2').get().enabled).toBe(true);
  expect(tipsFor('u1').get().seen).toEqual({});
  // u2's own sync used u2's sign-in.
  expect(sent().at(-1)?.[2]).toBe('token-2');
});

test('a sync started for one session is not sent with the next session’s sign-in', async () => {
  let token: (value: string) => void = () => {};
  jest
    .mocked(sessionToken)
    .mockImplementationOnce(() => new Promise((resolve) => (token = resolve)));
  await render(<TipSyncHost />);
  await flush();
  nextSessionEpoch();
  await act(async () => token('token-2'));
  expect(sent()).toHaveLength(0);
});

test('an older server without the tip store leaves tips on the phone', async () => {
  jest.mocked(request).mockRejectedValue(new ApiError(404, 'Not found'));
  await render(<TipSyncHost />);
  await flush();
  tipsFor('u1').dismiss('swap');
  await act(async () => jest.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS * 2));
  expect(sent()).toHaveLength(1);
  expect(tipsFor('u1').get().seen.swap).toBe('dismissed');
});

test('a sign-in the server has ended is forgotten only if it is still the saved one', async () => {
  jest.mocked(request).mockRejectedValue(new ApiError(401, 'Sign in again'));
  await render(<TipSyncHost />);
  await flush();
  expect(forgetSessionTokenIf).toHaveBeenCalledWith('https://relay.example.com', 'token-1');
});

test('each save names the account and the generation the phone last synced', async () => {
  jest.mocked(request).mockImplementation(async (_path, init) => {
    server.u1 = mergeTipStates(server.u1, JSON.parse(String(init?.body)));
    return { ...server.u1, generation: 'g1' };
  });
  await render(<TipSyncHost />);
  await flush();
  tipsFor('u1').dismiss('swap');
  await act(async () => jest.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS));
  expect(sent().map(([path]) => path)).toEqual([
    '/api/tips?account=u1',
    '/api/tips?account=u1&generation=g1',
  ]);
  // The generation is the phone's bookkeeping, never sent as a tip.
  expect(JSON.parse(String(sent()[1][1]?.body)).syncGeneration).toBeUndefined();
});

test('after an archive restore the phone adopts the restored tips', async () => {
  memoryKv.set(
    tipStorageKey('u1'),
    JSON.stringify({
      enabled: false,
      enabledAt: 9,
      seen: { swap: 'dismissed' },
      syncGeneration: 'g1',
    }),
  );
  jest
    .mocked(request)
    .mockResolvedValue({ enabled: true, seen: { plates: 'learned' }, generation: 'g2' });
  await render(<TipSyncHost />);
  await flush();
  expect(sent()[0][0]).toBe('/api/tips?account=u1&generation=g1');
  expect(tipsFor('u1').get()).toMatchObject({
    enabled: true,
    seen: { plates: 'learned' },
    syncGeneration: 'g2',
  });
  expect(tipsFor('u1').get().seen.swap).toBeUndefined();
});

test('tips refused for another account stop syncing', async () => {
  jest
    .mocked(request)
    .mockRejectedValue(new ApiError(409, 'Not this account', 'tip_account_mismatch'));
  await render(<TipSyncHost />);
  await flush();
  tipsFor('u1').dismiss('swap');
  await act(async () => jest.advanceTimersByTimeAsync(TIP_SYNC_DEBOUNCE_MS * 2));
  expect(sent()).toHaveLength(1);
});
