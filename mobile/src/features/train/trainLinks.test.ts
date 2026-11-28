import { trainInviteLink } from '../../../../frontend/src/trainTogether';
import { redirectSystemPath } from '../../app/+native-intent';
import { webLinkRoute } from '../../session/webLinks';
import { memoryKv } from '../../testing/memoryKvStore';
import { requestTrainJoin, takePendingTrainInvite } from './trainLinks';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('expo-router', () => ({}));

const token = 'abcDEF123_-xyz7890';

afterEach(() => {
  takePendingTrainInvite();
});

it.each([
  trainInviteLink(token, 'https://gym.example.com'),
  trainInviteLink(token, 'http://127.0.0.1:8000'),
  `relay-mobile:///#train=${token}`,
  `exp://127.0.0.1:18822/--/#train=${token}`,
])('reads a train-together code from %s and opens Home under it', (link) => {
  expect(webLinkRoute(link)).toEqual({ route: '/', train: token });
});

it('ignores malformed codes', () => {
  expect(webLinkRoute('https://gym.example.com/#train=short')?.train).toBeUndefined();
  expect(webLinkRoute('https://gym.example.com/#train=bad*chars*here*long')?.train).toBeUndefined();
});

it('keeps a code from a system link through Sign in, once', () => {
  expect(
    redirectSystemPath({ path: trainInviteLink(token, 'https://gym.example.com'), initial: true }),
  ).toBe('/');
  expect(memoryKv.has('relay.pendingTrainInvite')).toBe(true);
  expect(takePendingTrainInvite()).toBe(token);
  expect(takePendingTrainInvite()).toBeNull();
  expect(memoryKv.has('relay.pendingTrainInvite')).toBe(false);
});

it('drops a kept code older than five minutes', () => {
  const now = Date.now();
  requestTrainJoin(token, now - 5 * 60_000 - 1);
  expect(takePendingTrainInvite(now)).toBeNull();
  requestTrainJoin(token, now - 4 * 60_000);
  expect(takePendingTrainInvite(now)).toBe(token);
});
