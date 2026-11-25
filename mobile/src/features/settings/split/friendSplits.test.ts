import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../../../data/api';
import { saveSessionToken, sessionToken } from '../../../data/session';
import { copyFriendSplit } from './friendSplits';

// Save split through the real request layer and token store, with the keychain in memory.
const mockKeychain = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mockKeychain.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void mockKeychain.set(key, value),
  deleteItemAsync: async (key: string) => void mockKeychain.delete(key),
}));
jest.mock('../../../data/api', () => {
  process.env.EXPO_PUBLIC_RELAY_API_ORIGIN = 'https://relay.test';
  return jest.requireActual('../../../data/api');
});
// The session the save belongs to, as the toast hosts track it.
const mockAccount = { current: 'user:me#1' };
jest.mock('../../../ui/Toast', () => ({
  toastAccount: () => mockAccount.current,
  isToastAccountCurrent: (account: string) => account === mockAccount.current,
}));

const ORIGIN = 'https://relay.test';
const reply = (status: number, body?: unknown) =>
  ({ ok: status < 400, status, json: async () => body }) as Response;
const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
const bearer = (call: number) =>
  (fetchMock.mock.calls[call][1].headers as Record<string, string>).Authorization;

let client: QueryClient;
beforeEach(async () => {
  jest.clearAllMocks();
  mockKeychain.clear();
  mockAccount.current = 'user:me#1';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  client = new QueryClient();
  await saveSessionToken(ORIGIN, 'token-me');
});
afterEach(() => client.clear());

test('a refused save forgets the token it was sent with, when it is still the saved one', async () => {
  fetchMock.mockResolvedValueOnce(reply(401, { error: { message: 'Sign in to continue.' } }));
  await expect(copyFriendSplit(client, 'alex', 'source')).rejects.toBeInstanceOf(ApiError);
  expect(bearer(0)).toBe('Bearer token-me');
  // Signed out everywhere: a restart can't reopen the account from its cache.
  expect(await sessionToken(ORIGIN)).toBeNull();
});

test('a refusal that arrives after another account signed in keeps the new token', async () => {
  let respond!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => (respond = resolve)));
  const saving = copyFriendSplit(client, 'alex', 'source');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(bearer(0)).toBe('Bearer token-me');
  // Sign out, then sign in as Sam, before the answer comes back.
  mockAccount.current = 'signed-out#2';
  mockKeychain.clear();
  mockAccount.current = 'user:sam#3';
  await saveSessionToken(ORIGIN, 'token-sam');
  respond(reply(401, { error: { message: 'Sign in to continue.' } }));
  await expect(saving).rejects.toBeInstanceOf(ApiError);
  expect(await sessionToken(ORIGIN)).toBe('token-sam');
});

test('other failures leave the saved token alone', async () => {
  fetchMock.mockResolvedValueOnce(
    reply(422, { error: { message: 'You can save up to 20 splits.' } }),
  );
  await expect(copyFriendSplit(client, 'alex', 'source')).rejects.toThrow(
    'You can save up to 20 splits.',
  );
  expect(await sessionToken(ORIGIN)).toBe('token-me');
});
