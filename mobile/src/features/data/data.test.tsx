import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { usePreventRemove } from 'expo-router';
import * as Sharing from 'expo-sharing';
import type { ReactElement } from 'react';
import { Alert, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type {
  ArchivePreview,
  CsvImportPreview,
  CsvImportResult,
  ImportBatch,
} from '../../../../frontend/src/types';
import { apiGet, apiSend, clientVersionHeaders } from '../../data/api';
import { uploadFile } from '../../data/uploadFile';
import { memoryKv } from '../../testing/memoryKvStore';
import { showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { saveOfflineQueries } from '../workout/offlineQueries';
import { DataSection } from './DataSection';
import { ExportScreen } from './ExportScreen';
import { ImportHistoryScreen } from './ImportHistoryScreen';
import { ImportMappingScreen } from './ImportMappingScreen';
import { ImportReviewScreen } from './ImportReviewScreen';
import { ImportScreen } from './ImportScreen';
import { queueImportPrompt, useImportPrompt } from './importPrompt';
import {
  resetImportSession,
  reviewImport,
  saveReviewedImport,
  useImportSession,
} from './importSession';

const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockNavigation = { setOptions: jest.fn(), addListener: jest.fn(() => () => undefined) };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useNavigation: () => mockNavigation,
  useLocalSearchParams: () => mockParams,
  usePreventRemove: jest.fn(),
}));
jest.mock('../../data/api', () => ({
  ...jest.requireActual<typeof import('../../data/api')>('../../data/api'),
  apiOrigin: 'https://relay.test',
  apiGet: jest.fn(),
  apiSend: jest.fn(),
}));
jest.mock('../../data/session', () => ({ sessionToken: jest.fn(async () => 'token') }));
jest.mock('../../data/uploadFile', () => ({ uploadFile: jest.fn() }));
jest.mock('../../ui/Toast', () => ({ showToast: jest.fn() }));
jest.mock('../../ui/prompts', () => ({ showMenu: jest.fn(), promptText: jest.fn() }));
jest.mock('expo-sqlite/kv-store', () => jest.requireActual('../../testing/memoryKvStore'));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));

// The file system, in memory: what was written, deleted, downloaded and uploaded.
const mockFiles = {
  written: {} as Record<string, unknown>,
  deleted: [] as string[],
  upload: jest.fn(),
  download: jest.fn(),
};
jest.mock('expo-file-system', () => {
  const join = (dir: unknown, name?: string) =>
    name === undefined
      ? String(dir)
      : `${typeof dir === 'string' ? dir : (dir as { uri: string }).uri}/${name}`;
  class MockDirectory {
    uri: string;
    exists = false;
    constructor(dir: unknown, name?: string) {
      this.uri = join(dir, name);
    }
    create() {}
    delete() {}
  }
  class MockFile {
    uri: string;
    exists = true;
    size: number | undefined = undefined;
    constructor(dir: unknown, name?: string) {
      this.uri = join(dir, name);
    }
    static downloadFileAsync = (url: string, to: MockFile, options: unknown) => {
      mockFiles.download(url, to.uri, options);
      return Promise.resolve(to);
    };
    create() {}
    write(content: unknown) {
      mockFiles.written[this.uri.split('/').pop()!] = content;
    }
    delete() {
      mockFiles.deleted.push(this.uri);
    }
    upload(url: string, options: unknown) {
      return mockFiles.upload(this.uri, url, options);
    }
  }
  return {
    Paths: { cache: { uri: 'file:///cache' } },
    Directory: MockDirectory,
    File: MockFile,
    UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  };
});

const mockUser = { id: 'u1' };
const mockSession = { status: { kind: 'signed-in', user: mockUser } };
jest.mock('../../session/SessionProvider', () => ({
  useSession: () => mockSession,
  useUser: () => mockUser,
}));
const mockWorkout: {
  live: { resumedWorkoutId: string | null } | null;
  queue: { waiting: number };
} = { live: null, queue: { waiting: 0 } };
jest.mock('../workout/WorkoutProvider', () => ({ useWorkout: () => mockWorkout }));
// Finished workouts this phone still has to send, as the queue stores them.
let mockQueued: { pendingSave: { userId: string; workoutId: string | null } }[] = [];
jest.mock('../../../../frontend/src/finishedWorkoutQueue', () => ({
  readFinishedWorkouts: () => mockQueued,
}));

// Android's name for a CSV, which the server refuses; the upload sends text/csv.
const csv = {
  uri: 'file:///cache/DocumentPicker/history.csv',
  name: 'history.csv',
  mimeType: 'text/comma-separated-values',
  size: 2048,
};
const zip = {
  uri: 'file:///cache/DocumentPicker/backup.zip',
  name: 'backup.zip',
  mimeType: 'application/zip',
  size: 4096,
};
const preview: CsvImportPreview = {
  exercise_matches: [{ incoming_name: 'Bench', exercise_id: null, exercise_name: 'Bench' }],
  available_exercises: [
    { id: 'e1', name: 'Barbell Bench Press', kind: 'weight' },
    { id: 'e2', name: 'Back Squat', kind: 'weight' },
  ],
  sessions: [
    {
      workout_date: '2026-10-13',
      name: 'Push day',
      exercises: ['Bench'],
      sets: 3,
      duplicate: false,
    },
  ],
  workouts_to_create: 1,
  workouts_to_skip: 0,
  sets_to_import: 3,
  new_exercises: ['Bench'],
  warnings: ['Row 4 has no reps.'],
};
const saved: CsvImportResult = {
  workouts_created: 1,
  workouts_skipped: 0,
  exercises_created: 0,
  sets_imported: 3,
  body_measurements_created: 0,
  body_measurements_updated: 0,
  warnings: [],
};
const archive: ArchivePreview = {
  created_at: null,
  username: 'preview',
  archive: { workouts: 12, cardio_sessions: 1, body_check_ins: 3, custom_exercises: 0, photos: 0 },
  current: { workouts: 4, cardio_sessions: 0, body_check_ins: 1, custom_exercises: 0, photos: 0 },
  photos_skipped: 1,
};
const batch: ImportBatch = {
  id: 'b1',
  file_name: 'hevy.csv',
  source: 'hevy',
  created_at: '2026-10-13T10:00:00Z',
  workouts: 2,
  body_measurements: 0,
};
const gym = { source: 'gym', weight_unit: 'kg', distance_unit: 'km' } as const;
const pickedCsv = { uri: csv.uri, name: csv.name, type: 'text/csv' };

function newClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
}

async function renderWith(element: ReactElement, client = newClient()) {
  return await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <QueryClientProvider client={client}>{element}</QueryClientProvider>
    </SafeAreaProvider>,
  );
}

let routes: Record<string, unknown> = {};
function respond(changes: Record<string, unknown>) {
  routes = { ...routes, ...changes };
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    const key = Object.keys(routes).find((prefix) => path.startsWith(prefix));
    if (!key) throw new Error(`Unexpected ${path}`);
    const value = routes[key];
    return typeof value === 'function' ? (value as () => unknown)() : value;
  });
}

/** A promise the test settles itself. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function pick(asset: object) {
  jest
    .mocked(DocumentPicker.getDocumentAsync)
    .mockResolvedValue({ canceled: false, assets: [asset] } as never);
}

function uploaded(status: number, body: unknown) {
  return { status, body: JSON.stringify(body), headers: {} };
}

const OLD_COPY = 'relay.mobile.query-cache.v1:["workouts","2026-10-01"]';
const offlineKeys = () =>
  [...memoryKv.keys()].filter((key) => key.startsWith('relay.mobile.query'));

beforeEach(() => {
  // Choice rows open the menu sheet, as on Android, so tests can pick from it.
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.clearAllMocks();
  resetImportSession();
  mockQueued = [];
  memoryKv.clear();
  mockParams = {};
  mockUser.id = 'u1';
  mockWorkout.live = null;
  mockWorkout.queue = { waiting: 0 };
  mockFiles.written = {};
  mockFiles.deleted = [];
  routes = {};
  respond({
    '/api/training-preferences': { preferred_weight_unit: 'kg' },
    '/api/dashboard': { history: { last_workout_date: '2026-10-13', has_sample_workouts: true } },
    '/api/workouts/snapshot': { workouts: [{ workout_date: '2026-10-01' }] },
    '/api/body-measurements': [{ measurement_date: '2026-09-01' }],
    '/api/workouts/import/batches': [],
  });
});

describe('importing workouts', () => {
  it('reviews the picked file with the chosen source and opens the review', async () => {
    pick(csv);
    jest.mocked(uploadFile).mockResolvedValue(preview);
    await renderWith(<ImportScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Strong' }));
    expect(await screen.findByText('Workout weights in file')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose CSV file' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/data/import-review'));
    expect(uploadFile).toHaveBeenCalledWith(
      '/api/workouts/import/preview',
      'POST',
      pickedCsv,
      expect.objectContaining({
        fields: { source: 'strong', weight_unit: 'kg', distance_unit: 'km' },
      }),
    );
  });

  it('shows why a file could not be reviewed', async () => {
    pick(csv);
    jest.mocked(uploadFile).mockRejectedValue(new Error('That file has no Date column.'));
    await renderWith(<ImportScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose CSV file' }));
    expect(await screen.findByText('That file has no Date column.')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('refuses a CSV over the server’s limit before sending it, and drops the copy', async () => {
    pick({ ...csv, size: 21 * 1024 * 1024 });
    await renderWith(<ImportScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose CSV file' }));
    expect(await screen.findByText('CSV imports are limited to 20 MB.')).toBeTruthy();
    expect(uploadFile).not.toHaveBeenCalled();
    expect(mockFiles.deleted).toEqual([csv.uri]);
  });

  it('shares the spreadsheet template for the Relay source', async () => {
    await renderWith(<ImportScreen />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Using your own spreadsheet? Share the template' }),
    );
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(String(mockFiles.written['relay-workout-template.csv'])).toContain(
      'Date Lifted,Exercise',
    );
  });

  it('remaps an exercise, reviews again and saves the reviewed import', async () => {
    jest.mocked(uploadFile).mockResolvedValue(preview);
    await reviewImport('u1', pickedCsv, gym);
    // Map Bench to the best match on its own screen, which reviews the file again.
    mockParams = { name: 'Bench' };
    const mapping = await renderWith(<ImportMappingScreen />);
    await fireEvent.press(screen.getByText('Barbell Bench Press'));
    expect(mockRouter.back).toHaveBeenCalled();
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(2));
    expect(jest.mocked(uploadFile).mock.calls[1][3]?.fields?.exercise_mappings).toBe(
      '{"Bench":"e1"}',
    );
    await mapping.unmount();
    mockRouter.back.mockClear();

    await renderWith(<ImportReviewScreen />);
    expect(await screen.findByText('1 session')).toBeTruthy();
    expect(screen.getByText('Row 4 has no reps.')).toBeTruthy();
    expect(screen.getByText('2026-10-13 · 3 sets · Bench')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Map Bench' })).toBeTruthy();

    jest.mocked(uploadFile).mockResolvedValue(saved);
    const save = await screen.findByRole('button', { name: 'Save import' });
    await waitFor(() => expect(save).not.toBeDisabled());
    await fireEvent.press(save);
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Imported 3 sets across 1 workout.'),
    );
    expect(jest.mocked(uploadFile).mock.calls[2][0]).toBe('/api/workouts/import');
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
  });

  it('holds the review, and Back, until a save has finished, then leaves once', async () => {
    jest.mocked(uploadFile).mockResolvedValue(preview);
    await reviewImport('u1', pickedCsv, gym);
    const pending = deferred<CsvImportResult>();
    jest.mocked(uploadFile).mockReturnValue(pending.promise as never);
    await renderWith(<ImportReviewScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Save import' }));

    // Saving: Save is locked, and Back can't remove the screen.
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(jest.mocked(usePreventRemove).mock.calls.at(-1)![0]).toBe(true);
    expect(mockRouter.back).not.toHaveBeenCalled();

    await act(async () => pending.resolve(saved));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    // Save never came back on between the upload finishing and the screen leaving.
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(uploadFile).toHaveBeenCalledTimes(2);
  });

  it('drops a review that answers after the screen closed and another account signed in', async () => {
    pick(csv);
    const pending = deferred<CsvImportPreview>();
    jest.mocked(uploadFile).mockReturnValue(pending.promise as never);
    const first = await renderWith(<ImportScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose CSV file' }));
    await waitFor(() => expect(uploadFile).toHaveBeenCalledTimes(1));
    // Account A leaves (signing out unmounts the screens), then B signs in.
    await first.unmount();
    mockUser.id = 'u2';
    await act(async () => pending.resolve(preview));

    const { result } = await renderHook(() => useImportSession('u2'));
    expect(result.current.preview).toBeNull();
    expect(result.current.file).toBeNull();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(await saveReviewedImport('u2')).toBeNull();
    expect(uploadFile).toHaveBeenCalledTimes(1);
    // A's staged copy is gone too.
    expect(mockFiles.deleted).toContain(csv.uri);
  });

  it('shows and saves a review only for the account that started it', async () => {
    jest.mocked(uploadFile).mockResolvedValue(preview);
    await reviewImport('u1', pickedCsv, gym);
    const { result } = await renderHook(() => useImportSession('u2'));
    expect(result.current.preview).toBeNull();
    expect(await saveReviewedImport('u2')).toBeNull();
    expect(uploadFile).toHaveBeenCalledTimes(1);
  });

  it('undoes a tracked import after confirming, and drops cached and offline reads', async () => {
    respond({ '/api/workouts/import/batches': [batch] });
    jest.mocked(apiSend).mockResolvedValue({
      workouts_removed: 2,
      body_measurements_removed: 0,
      body_measurements_preserved: 0,
      exercises_removed: 0,
    });
    const client = newClient();
    saveOfflineQueries(client, 'u1');
    client.setQueryData(['workouts', '2026-10-01'], { workouts: [{ id: 'imported' }] });
    expect(offlineKeys()).toContain(OLD_COPY);
    const alert = jest.spyOn(Alert, 'alert');
    await renderWith(<ImportHistoryScreen />, client);
    await fireEvent.press(await screen.findByRole('button', { name: 'Undo hevy.csv' }));
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => buttons.find((button) => button.text === 'Undo import')!.onPress!());
    expect(apiSend).toHaveBeenCalledWith('/api/workouts/import/batches/b1', 'DELETE');
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Import undone: removed 2 sessions and 0 check-ins.'),
    );
    expect(client.getQueryData(['workouts', '2026-10-01'])).toBeUndefined();
    expect(offlineKeys()).not.toContain(OLD_COPY);
  });

  it('won’t undo while the saved workout being edited may be one it deletes', async () => {
    respond({ '/api/workouts/import/batches': [batch] });
    mockWorkout.live = { resumedWorkoutId: 'w1' };
    const alert = jest.spyOn(Alert, 'alert');
    await renderWith(<ImportHistoryScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Undo hevy.csv' }));
    expect(
      screen.getByText(
        'Finish or discard the saved workout you’re editing before undoing an import; it may be one this undo deletes.',
      ),
    ).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
    expect(apiSend).not.toHaveBeenCalled();
  });

  it('won’t undo while an edit to a saved workout waits to be sent', async () => {
    respond({ '/api/workouts/import/batches': [batch] });
    mockQueued = [
      { pendingSave: { userId: 'u1', workoutId: 'w1' } },
      // Another account's leftovers on this phone don't count.
      { pendingSave: { userId: 'u9', workoutId: 'w9' } },
    ];
    const alert = jest.spyOn(Alert, 'alert');
    await renderWith(<ImportHistoryScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Undo hevy.csv' }));
    expect(
      screen.getByText(/Changes to a saved workout on this phone haven’t synced/),
    ).toBeTruthy();
    expect(alert).not.toHaveBeenCalled();
  });

  it('asks a new account once whether to import', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    queueImportPrompt('u1');
    await renderHook(() => useImportPrompt());
    await renderHook(() => useImportPrompt());
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mock.calls[0][2]!.find((button) => button.text === 'Import')!.onPress!();
    expect(mockRouter.push).toHaveBeenCalledWith('/data/import');
  });
});

describe('exporting', () => {
  it('downloads both CSV files to files, signed in, then shares them', async () => {
    await renderWith(<ExportScreen />);
    await fireEvent(screen.getByLabelText('Bodyweight check-ins'), 'valueChange', true);
    expect(
      await screen.findByText(
        'Shares two CSV files: workout history and bodyweight check-ins. Photos, videos, supersets, goals, RPE and workout notes are excluded.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Share CSV' }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(2));
    expect(mockFiles.download.mock.calls.map(([url]) => url)).toEqual([
      'https://relay.test/api/workouts/export.csv',
      'https://relay.test/api/body-measurements/export.csv',
    ]);
    expect(mockFiles.download.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        headers: { ...clientVersionHeaders(), Authorization: 'Bearer token' },
      }),
    );
  });

  async function chooseBodyweightMonth() {
    await fireEvent(screen.getByLabelText('Workout history'), 'valueChange', false);
    await fireEvent(screen.getByLabelText('Bodyweight check-ins'), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: /^Export time frame/ }));
    const [, options] = jest.mocked(showMenu).mock.calls.at(-1)!;
    await act(async () => options.find((item) => item.label.startsWith('1 month'))!.onPress());
  }

  it('waits for the check-ins before a bounded export, rather than exporting all time', async () => {
    const measurements = deferred<unknown>();
    respond({ '/api/body-measurements': () => measurements.promise });
    await renderWith(<ExportScreen />);
    await chooseBodyweightMonth();
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
    await act(async () => measurements.resolve([{ measurement_date: '2026-09-15' }]));
    await fireEvent.press(await screen.findByRole('button', { name: 'Share CSV' }));
    await waitFor(() => expect(mockFiles.download).toHaveBeenCalledTimes(1));
    expect(mockFiles.download.mock.calls[0][0]).toBe(
      'https://relay.test/api/body-measurements/export.csv?start_date=2026-08-15&end_date=2026-09-15',
    );
  });

  it('offers a retry when the check-ins fail to load, and exports nothing meanwhile', async () => {
    let fail = true;
    respond({
      '/api/body-measurements': () =>
        fail ? Promise.reject(new Error('offline')) : [{ measurement_date: '2026-09-15' }],
    });
    await renderWith(<ExportScreen />);
    await chooseBodyweightMonth();
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByRole('button', { name: 'Share CSV' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Share CSV' }));
    expect(mockFiles.download).not.toHaveBeenCalled();
    fail = false;
    await fireEvent.press(retry);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share CSV' })).toBeEnabled());
    await fireEvent.press(screen.getByRole('button', { name: 'Share CSV' }));
    await waitFor(() => expect(mockFiles.download).toHaveBeenCalledTimes(1));
    expect(mockFiles.download.mock.calls[0][0]).toContain('start_date=2026-08-15');
  });
});

describe('backups', () => {
  it('shows the Data rows and downloads the backup to a file for the share sheet', async () => {
    await renderWith(<DataSection />);
    await fireEvent.press(screen.getByRole('button', { name: 'Import workouts' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/data/import');
    expect(await screen.findByRole('button', { name: 'Remove sample workouts' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Download backup' }));
    await waitFor(() =>
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        expect.stringMatching(/relay-exports\/relay-backup-\d{4}-\d{2}-\d{2}\.zip$/),
        expect.objectContaining({ mimeType: 'application/zip' }),
      ),
    );
    expect(mockFiles.download).toHaveBeenCalledWith(
      'https://relay.test/api/account-archive',
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
  });

  it('restores from the file itself, then drops cached and offline reads and the copy', async () => {
    pick(zip);
    mockFiles.upload
      .mockResolvedValueOnce(uploaded(200, archive))
      .mockResolvedValueOnce(uploaded(200, { restored: archive.archive, photos_skipped: 1 }));
    const client = newClient();
    saveOfflineQueries(client, 'u1');
    client.setQueryData(['workouts', '2026-10-01'], { workouts: [{ id: 'before-restore' }] });
    await renderWith(<DataSection />, client);
    await fireEvent.press(screen.getByRole('button', { name: 'Restore backup' }));
    expect(await screen.findByText('Restore this backup?')).toBeTruthy();
    expect(screen.getByLabelText('Workouts: 12 in backup, 4 now')).toBeTruthy();
    expect(
      screen.getByText('1 photo in this backup is missing and will be left out.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Restore backup' }).at(-1)!);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Backup restored.'));

    expect(mockFiles.upload.mock.calls.map(([uri, url]) => [uri, url])).toEqual([
      [zip.uri, 'https://relay.test/api/account-archive/preview'],
      [zip.uri, 'https://relay.test/api/account-archive/restore'],
    ]);
    expect(mockFiles.upload.mock.calls[1][2]).toEqual(
      expect.objectContaining({
        fieldName: 'file',
        mimeType: 'application/zip',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
    expect(uploadFile).not.toHaveBeenCalled();
    expect(client.getQueryData(['workouts', '2026-10-01'])).toBeUndefined();
    // The copy kept for offline use is gone; only reads fetched since the restore are kept.
    expect(offlineKeys()).not.toContain(OLD_COPY);
    expect(mockFiles.deleted).toContain(zip.uri);
  });

  it('falls back to the multipart upload where the file API may not read the pick', async () => {
    pick(zip);
    mockFiles.upload.mockRejectedValueOnce(
      new Error("Missing 'READ' permission for accessing the file."),
    );
    jest.mocked(uploadFile).mockResolvedValueOnce(archive);
    await renderWith(<DataSection />);
    await fireEvent.press(screen.getByRole('button', { name: 'Restore backup' }));
    expect(await screen.findByText('Restore this backup?')).toBeTruthy();
    expect(uploadFile).toHaveBeenCalledWith(
      '/api/account-archive/preview',
      'POST',
      { uri: zip.uri, name: 'backup.zip', type: 'application/zip' },
      { failure: 'That backup could not be read.' },
    );
  });

  it('shows why the server refused a backup', async () => {
    pick(zip);
    mockFiles.upload.mockResolvedValueOnce(
      uploaded(400, { error: { message: 'This is not a Relay backup.' } }),
    );
    await renderWith(<DataSection />);
    await fireEvent.press(screen.getByRole('button', { name: 'Restore backup' }));
    expect(await screen.findByText('This is not a Relay backup.')).toBeTruthy();
    expect(mockFiles.deleted).toContain(zip.uri);
  });

  it('refuses a backup over the server’s limit before uploading it', async () => {
    pick({ ...zip, size: 600 * 1024 * 1024 });
    await renderWith(<DataSection />);
    await fireEvent.press(screen.getByRole('button', { name: 'Restore backup' }));
    expect(await screen.findByText('This archive is too large to restore.')).toBeTruthy();
    expect(mockFiles.upload).not.toHaveBeenCalled();
    expect(mockFiles.deleted).toEqual([zip.uri]);
  });

  it('won’t restore while a workout is in progress', async () => {
    mockWorkout.live = { resumedWorkoutId: null };
    await renderWith(<DataSection />);
    await fireEvent.press(screen.getByRole('button', { name: 'Restore backup' }));
    expect(screen.getByText(/Finish or discard the workout in progress/)).toBeTruthy();
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();
  });

  it('won’t restore while finished workouts wait to be sent, and checks again on confirm', async () => {
    mockWorkout.queue = { waiting: 2 };
    const client = newClient();
    const view = await renderWith(<DataSection />, client);
    await fireEvent.press(screen.getByRole('button', { name: 'Restore backup' }));
    expect(screen.getByText(/2 finished workouts on this phone haven’t synced yet/)).toBeTruthy();
    expect(DocumentPicker.getDocumentAsync).not.toHaveBeenCalled();

    // Clear to pick the backup, then a workout finishes before Restore is confirmed.
    const again = () =>
      view.rerender(
        <SafeAreaProvider
          initialMetrics={{
            frame: { x: 0, y: 0, width: 390, height: 844 },
            insets: { top: 0, left: 0, right: 0, bottom: 0 },
          }}
        >
          <QueryClientProvider client={client}>
            <DataSection />
          </QueryClientProvider>
        </SafeAreaProvider>,
      );
    mockWorkout.queue = { waiting: 0 };
    await again();
    pick(zip);
    mockFiles.upload.mockResolvedValueOnce(uploaded(200, archive));
    await fireEvent.press(screen.getByRole('button', { name: 'Restore backup' }));
    expect(await screen.findByText('Restore this backup?')).toBeTruthy();
    mockWorkout.queue = { waiting: 1 };
    await again();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Restore backup' }).at(-1)!);
    expect(
      await screen.findByText(/1 finished workout on this phone hasn’t synced yet/),
    ).toBeTruthy();
    expect(mockFiles.upload).toHaveBeenCalledTimes(1);
  });
});
