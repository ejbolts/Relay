import { onlineManager } from '@tanstack/react-query';
import { ApiError, apiGet, apiSend } from '../../data/api';
import { memoryKv } from '../../testing/memoryKvStore';
import {
  bodyCheckInStatus,
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
