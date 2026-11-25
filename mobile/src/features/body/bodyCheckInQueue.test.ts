import { onlineManager } from '@tanstack/react-query';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { memoryKv } from '../../testing/memoryKvStore';
import {
  bodyCheckInStatus,
  bodyCheckInSyncFailed,
  deleteBodyCheckIn,
  fetchBodyMeasurements,
  localBodyMeasurements,
  saveBodyCheckIn,
  setBodyCheckInOwner,
  syncBodyCheckIns,
} from './bodyCheckInQueue';

jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));

const server = (date: string, weight: number) => ({
  id: `server-${date}`,
  measurement_date: date,
  weight_kg: weight,
  body_fat_pct: null,
  notes: null,
  created_at: `${date}T07:00:00Z`,
  is_sample: false,
});
const checkIn = (date: string, weight: number) => ({
  measurement_date: date,
  weight_kg: weight,
  body_fat_pct: null,
  notes: null,
});

beforeEach(async () => {
  jest.clearAllMocks();
  memoryKv.clear();
  onlineManager.setOnline(true);
  setBodyCheckInOwner('u1');
  jest.mocked(apiGet).mockResolvedValue([server('2026-11-01', 80)]);
  jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => ({
    ...server((body as { measurement_date: string }).measurement_date, 0),
    ...(body as object),
  }));
  await fetchBodyMeasurements();
});
afterAll(() => setBodyCheckInOwner(null));

test('a check-in logged offline shows at once and is sent once on reconnecting', async () => {
  onlineManager.setOnline(false);
  const saved = saveBodyCheckIn(checkIn('2026-11-02', 81));
  expect(saved.id).toBe('local-body:2026-11-02');
  await syncBodyCheckIns();
  expect(apiSend).not.toHaveBeenCalled();
  expect(bodyCheckInStatus().pending).toBe(1);
  expect(localBodyMeasurements()!.map((row) => row.weight_kg)).toEqual([81, 80]);

  onlineManager.setOnline(true);
  expect(await syncBodyCheckIns()).toBe(1);
  expect(apiSend).toHaveBeenCalledTimes(1);
  expect(apiSend).toHaveBeenCalledWith('/api/body-measurements', 'POST', checkIn('2026-11-02', 81));
  expect(bodyCheckInStatus().pending).toBe(0);
  expect(await syncBodyCheckIns()).toBe(0);
  expect(apiSend).toHaveBeenCalledTimes(1);
  expect(localBodyMeasurements()![0].id).toBe('server-2026-11-02');
});

test('a refused check-in waits for a retry while the others are sent', async () => {
  onlineManager.setOnline(false);
  saveBodyCheckIn(checkIn('2026-11-02', 81));
  saveBodyCheckIn(checkIn('2026-11-03', 82));
  onlineManager.setOnline(true);
  jest.mocked(apiSend).mockRejectedValueOnce(new ApiError(422, 'Weight looks wrong.'));
  expect(await syncBodyCheckIns()).toBe(1);
  expect(bodyCheckInStatus()).toEqual({ pending: 1, error: 'Weight looks wrong.' });
  expect(await syncBodyCheckIns(true)).toBe(1);
  expect(bodyCheckInStatus()).toEqual({ pending: 0, error: null });
});

test('a connection failure keeps the check-in waiting without marking it refused', async () => {
  onlineManager.setOnline(false);
  saveBodyCheckIn(checkIn('2026-11-02', 81));
  onlineManager.setOnline(true);
  jest.mocked(apiSend).mockRejectedValueOnce(new Error('Network request failed'));
  await expect(syncBodyCheckIns()).rejects.toThrow('Network request failed');
  expect(bodyCheckInStatus()).toEqual({ pending: 1, error: null });
  expect(bodyCheckInSyncFailed()).toBe(true);
  expect(await syncBodyCheckIns()).toBe(1);
  expect(bodyCheckInSyncFailed()).toBe(false);
});

test('a deletion is sent for the day, and another account never sees the queue', async () => {
  onlineManager.setOnline(false);
  deleteBodyCheckIn('server-2026-11-01');
  expect(localBodyMeasurements()).toEqual([]);
  setBodyCheckInOwner('u2');
  expect(bodyCheckInStatus().pending).toBe(0);
  expect(localBodyMeasurements()).toBeNull();
  setBodyCheckInOwner('u1');
  expect(bodyCheckInStatus().pending).toBe(0);
});

/** A list request the test answers later. */
function deferredList() {
  let answer!: (rows: unknown) => void;
  jest.mocked(apiGet).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );
  return (rows: unknown) => answer(rows);
}

test('a list that started for one account never reaches the next account', async () => {
  memoryKv.clear();
  setBodyCheckInOwner('u1');
  const answerFirst = deferredList();
  const listing = fetchBodyMeasurements();
  setBodyCheckInOwner('u2');
  jest.mocked(apiGet).mockResolvedValueOnce([server('2026-11-05', 70)]);
  answerFirst([server('2026-11-01', 80)]);
  // Asked again for the signed-in account, whose rows are the only ones kept.
  expect((await listing).map((row) => row.weight_kg)).toEqual([70]);
  expect(localBodyMeasurements('u2')!.map((row) => row.weight_kg)).toEqual([70]);
  expect(localBodyMeasurements('u1')).toBeNull();
});

test('a list that started before a send keeps what the server acknowledged', async () => {
  memoryKv.clear();
  setBodyCheckInOwner(null);
  setBodyCheckInOwner('u1');
  // A fresh phone: no copy yet. The first list is slow; a weigh-in is sent meanwhile.
  const answerFirst = deferredList();
  const listing = fetchBodyMeasurements();
  saveBodyCheckIn(checkIn('2026-11-02', 81));
  await syncBodyCheckIns();
  expect(bodyCheckInStatus().pending).toBe(0);
  answerFirst([server('2026-11-01', 80)]);
  expect((await listing).map((row) => row.measurement_date)).toEqual(['2026-11-02', '2026-11-01']);
  expect(localBodyMeasurements()!.map((row) => row.measurement_date)).toEqual([
    '2026-11-02',
    '2026-11-01',
  ]);
});

/** The server answering a save, as beforeEach sets it. */
const answerSaves = () =>
  jest.mocked(apiSend).mockImplementation(async (_path, _method, body) => ({
    ...server((body as { measurement_date: string }).measurement_date, 0),
    ...(body as object),
  }));

test('sends the server did not answer are spaced out, and only the timed ones wait', async () => {
  let clock = Date.parse('2026-11-02T08:00:00Z');
  const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
  try {
    onlineManager.setOnline(false);
    saveBodyCheckIn(checkIn('2026-11-02', 81));
    onlineManager.setOnline(true);
    jest.mocked(apiSend).mockRejectedValue(new Error('Network request failed'));
    const unanswered = (send = syncBodyCheckIns()) =>
      expect(send).rejects.toThrow('Network request failed');

    // One unanswered send is ordinary: the next timed send goes as usual.
    await unanswered();
    await unanswered();
    expect(apiSend).toHaveBeenCalledTimes(2);
    // After two in a row, timed sends wait 15 seconds, then 30, then 60 from then on.
    let sends = 2;
    for (const wait of [15_000, 30_000, 60_000, 60_000]) {
      clock += wait - 1;
      expect(await syncBodyCheckIns()).toBe(0);
      expect(apiSend).toHaveBeenCalledTimes(sends);
      clock += 1;
      await unanswered();
      expect(apiSend).toHaveBeenCalledTimes((sends += 1));
    }
    expect(bodyCheckInStatus()).toEqual({ pending: 1, error: null });
    expect(bodyCheckInSyncFailed()).toBe(true);

    // Returning to the app or reconnecting, and Retry sync, send at once.
    await unanswered(syncBodyCheckIns(false, true));
    await unanswered(syncBodyCheckIns(true));
    expect(apiSend).toHaveBeenCalledTimes((sends += 2));
    expect(await syncBodyCheckIns()).toBe(0);
    expect(apiSend).toHaveBeenCalledTimes(sends);

    // So does a check-in made now. Once the server answers, nothing waits any more.
    answerSaves();
    saveBodyCheckIn(checkIn('2026-11-03', 82));
    await syncBodyCheckIns();
    expect(apiSend).toHaveBeenCalledTimes((sends += 2));
    expect(bodyCheckInStatus().pending).toBe(0);
    jest.mocked(apiSend).mockRejectedValueOnce(new Error('Network request failed'));
    saveBodyCheckIn(checkIn('2026-11-04', 83));
    expect(await syncBodyCheckIns()).toBe(1);
    expect(apiSend).toHaveBeenCalledTimes(sends + 2);
  } finally {
    now.mockRestore();
  }
});

test('a check-in the server already holds stops waiting once the history is read', async () => {
  onlineManager.setOnline(false);
  saveBodyCheckIn(checkIn('2026-11-02', 81));
  saveBodyCheckIn(checkIn('2026-11-03', 82));
  deleteBodyCheckIn('server-2026-11-01');
  onlineManager.setOnline(true);
  // The first save reached the server, but its answer never reached the phone.
  jest.mocked(apiSend).mockRejectedValueOnce(new Error('Network request failed'));
  await expect(syncBodyCheckIns()).rejects.toThrow('Network request failed');
  expect(bodyCheckInStatus().pending).toBe(3);
  expect(bodyCheckInSyncFailed()).toBe(true);

  // The server holds that check-in and no longer has the deleted one; the other still differs.
  jest.mocked(apiGet).mockResolvedValueOnce([server('2026-11-03', 82.5), server('2026-11-02', 81)]);
  const rows = await fetchBodyMeasurements();
  expect(bodyCheckInStatus().pending).toBe(1);
  expect(bodyCheckInSyncFailed()).toBe(true);
  expect(rows.map((row) => [row.measurement_date, row.weight_kg])).toEqual([
    ['2026-11-03', 82],
    ['2026-11-02', 81],
  ]);
  expect(rows[1].id).toBe('server-2026-11-02');
  expect(apiSend).toHaveBeenCalledTimes(1);

  // Only the check-in that differs is sent, and it is not held up by the earlier failure.
  expect(await syncBodyCheckIns()).toBe(1);
  expect(apiSend).toHaveBeenCalledTimes(2);
  expect(apiSend).toHaveBeenLastCalledWith(
    '/api/body-measurements',
    'POST',
    checkIn('2026-11-03', 82),
  );
  expect(bodyCheckInStatus().pending).toBe(0);
  expect(bodyCheckInSyncFailed()).toBe(false);
});

test('a list that started before a change was made never drops it', async () => {
  // A slow list from before the check-in existed on the server: it has no row for that day.
  const answerFirst = deferredList();
  const listing = fetchBodyMeasurements();
  onlineManager.setOnline(false);
  deleteBodyCheckIn('server-2026-11-01');
  answerFirst([]);
  await listing;
  // The list looks as if the deletion were done, but it is older than the deletion.
  expect(bodyCheckInStatus().pending).toBe(1);
});
