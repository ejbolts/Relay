import { QueryClient } from '@tanstack/react-query';
import { memoryKv } from '../../testing/memoryKvStore';
import { forgetOfflineQueries, saveOfflineQueries, seedOfflineQueries } from './offlineQueries';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));

const clients: QueryClient[] = [];
function newClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  return client;
}

beforeEach(() => memoryKv.clear());
afterEach(() => clients.splice(0).forEach((client) => client.clear()));

async function load(client: QueryClient, queryKey: unknown[], data: unknown) {
  await client.fetchQuery({ queryKey, queryFn: async () => data });
}

test('kept queries come back for the same account after the app closes, marked stale', async () => {
  const first = newClient();
  const stop = saveOfflineQueries(first, 'u1');
  await load(first, ['exercises'], [{ id: 'bench' }]);
  await load(first, ['training-preferences'], { preferred_weight_unit: 'lb' });
  await load(first, ['personal-records'], ['not kept']);
  stop();

  const next = newClient();
  seedOfflineQueries(next, 'u1');
  expect(next.getQueryData(['exercises'])).toEqual([{ id: 'bench' }]);
  expect(next.getQueryData(['training-preferences'])).toEqual({ preferred_weight_unit: 'lb' });
  expect(next.getQueryData(['personal-records'])).toBeUndefined();
  expect(next.getQueryState(['exercises'])?.dataUpdatedAt).toBe(0);
});

test('one copy per query: a new day replaces yesterday', async () => {
  const client = newClient();
  const stop = saveOfflineQueries(client, 'u1');
  await load(client, ['dashboard', '2026-11-21'], { day: 21 });
  await load(client, ['dashboard', '2026-11-22'], { day: 22 });
  await load(client, ['workout-types'], ['types']);
  stop();
  const next = newClient();
  seedOfflineQueries(next, 'u1');
  expect(next.getQueryData(['dashboard', '2026-11-21'])).toBeUndefined();
  expect(next.getQueryData(['dashboard', '2026-11-22'])).toEqual({ day: 22 });
  expect(next.getQueryData(['workout-types'])).toEqual(['types']);
});

test('a saved workout or older page never replaces the history window', async () => {
  const client = newClient();
  const stop = saveOfflineQueries(client, 'u1');
  await load(client, ['workouts', '2026-09-01'], ['window']);
  await load(client, ['workouts', 'detail', 'w1'], { id: 'w1' });
  await load(client, ['workouts', 'baselines', '2026-09-01'], ['older']);
  await load(client, ['workouts', 'body-measurements'], ['weigh-ins']);
  await load(client, ['workouts', '2026-10-01'], ['next window']);
  stop();
  const next = newClient();
  seedOfflineQueries(next, 'u1');
  expect(next.getQueryData(['workouts', '2026-09-01'])).toBeUndefined();
  expect(next.getQueryData(['workouts', '2026-10-01'])).toEqual(['next window']);
  expect(next.getQueryData(['workouts', 'detail', 'w1'])).toBeUndefined();
  expect(next.getQueryData(['workouts', 'baselines', '2026-09-01'])).toEqual(['older']);
  expect(next.getQueryData(['workouts', 'body-measurements'])).toEqual(['weigh-ins']);
});

test('another account never sees the copies, and signing out removes them', async () => {
  const client = newClient();
  const stop = saveOfflineQueries(client, 'u1');
  await load(client, ['exercises'], [{ id: 'bench' }]);
  stop();
  const other = newClient();
  seedOfflineQueries(other, 'u2');
  expect(other.getQueryData(['exercises'])).toBeUndefined();
  expect(memoryKv.size).toBe(0);

  const again = newClient();
  const stopAgain = saveOfflineQueries(again, 'u1');
  await load(again, ['exercises'], [{ id: 'bench' }]);
  stopAgain();
  forgetOfflineQueries();
  expect(memoryKv.size).toBe(0);
});
