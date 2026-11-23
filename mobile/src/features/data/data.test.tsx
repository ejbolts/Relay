import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ArchivePreview, CsvImportPreview, ImportBatch } from '../../../../frontend/src/types';
import { apiGet, apiSend } from '../../data/api';
import { uploadFile } from '../../data/uploadFile';
import { showToast } from '../../ui/Toast';
import { DataSection } from './DataSection';
import { ExportScreen } from './ExportScreen';
import { ImportHistoryScreen } from './ImportHistoryScreen';
import { ImportMappingScreen } from './ImportMappingScreen';
import { ImportReviewScreen } from './ImportReviewScreen';
import { ImportScreen } from './ImportScreen';
import { queueImportPrompt, useImportPrompt } from './importPrompt';
import { resetImportSession, reviewImport } from './importSession';

const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockNavigation = { setOptions: jest.fn(), addListener: jest.fn(() => () => undefined) };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useNavigation: () => mockNavigation,
  useLocalSearchParams: () => mockParams,
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
const mockWritten: Record<string, unknown> = {};
jest.mock('expo-file-system', () => ({
  Paths: { cache: 'cache' },
  File: class {
    uri: string;
    fileName: string;
    constructor(_dir: string, fileName: string) {
      this.fileName = fileName;
      this.uri = `file:///cache/${fileName}`;
    }
    create() {}
    write(content: unknown) {
      mockWritten[this.fileName] = content;
    }
  },
}));
const mockSession = { status: { kind: 'signed-in', user: { id: 'u1' } } };
jest.mock('../../session/SessionProvider', () => ({ useSession: () => mockSession }));

// Android's name for a CSV, which the server refuses; the upload sends text/csv.
const csv = {
  uri: 'file:///picked/history.csv',
  name: 'history.csv',
  mimeType: 'text/comma-separated-values',
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

async function renderWith(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
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

function respond(routes: Record<string, unknown>) {
  jest.mocked(apiGet).mockImplementation(async (path: string) => {
    const key = Object.keys(routes).find((prefix) => path.startsWith(prefix));
    if (!key) throw new Error(`Unexpected ${path}`);
    return routes[key];
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetImportSession();
  mockParams = {};
  respond({
    '/api/training-preferences': { preferred_weight_unit: 'kg' },
    '/api/dashboard': { history: { last_workout_date: '2026-10-13', has_sample_workouts: true } },
    '/api/workouts/snapshot': { workouts: [{ workout_date: '2026-10-01' }] },
    '/api/body-measurements': [{ measurement_date: '2026-09-01' }],
    '/api/workouts/import/batches': [],
  });
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(4),
  })) as unknown as typeof fetch;
});

describe('importing workouts', () => {
  it('reviews the picked file with the chosen source and opens the review', async () => {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [csv],
    } as never);
    jest.mocked(uploadFile).mockResolvedValue(preview);
    await renderWith(<ImportScreen />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Strong' }));
    expect(await screen.findByText('Workout weights in file')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose CSV file' }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/data/import-review'));
    expect(uploadFile).toHaveBeenCalledWith(
      '/api/workouts/import/preview',
      'POST',
      { uri: csv.uri, name: 'history.csv', type: 'text/csv' },
      expect.objectContaining({
        fields: { source: 'strong', weight_unit: 'kg', distance_unit: 'km' },
      }),
    );
  });

  it('shows why a file could not be reviewed', async () => {
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [csv],
    } as never);
    jest.mocked(uploadFile).mockRejectedValue(new Error('That file has no Date column.'));
    await renderWith(<ImportScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Choose CSV file' }));
    expect(await screen.findByText('That file has no Date column.')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('shares the spreadsheet template for the Relay source', async () => {
    await renderWith(<ImportScreen />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Using your own spreadsheet? Share the template' }),
    );
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(String(mockWritten['relay-workout-template.csv'])).toContain('Date Lifted,Exercise');
  });

  it('remaps an exercise, reviews again and saves the reviewed import', async () => {
    jest.mocked(uploadFile).mockResolvedValue(preview);
    const file = { uri: csv.uri, name: csv.name, type: 'text/csv' };
    await reviewImport(file, { source: 'gym', weight_unit: 'kg', distance_unit: 'km' });
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

    await renderWith(<ImportReviewScreen />);
    expect(await screen.findByText('1 session')).toBeTruthy();
    expect(screen.getByText('Row 4 has no reps.')).toBeTruthy();
    expect(screen.getByText('2026-10-13 · 3 sets · Bench')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Map Bench' })).toBeTruthy();

    jest.mocked(uploadFile).mockResolvedValue({
      workouts_created: 1,
      workouts_skipped: 0,
      exercises_created: 0,
      sets_imported: 3,
      body_measurements_created: 0,
      body_measurements_updated: 0,
      warnings: [],
    });
    const save = await screen.findByRole('button', { name: 'Save import' });
    await waitFor(() => expect(save).not.toBeDisabled());
    await fireEvent.press(save);
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Imported 3 sets across 1 workout.'),
    );
    expect(jest.mocked(uploadFile).mock.calls[2][0]).toBe('/api/workouts/import');
  });

  it('undoes a tracked import after confirming', async () => {
    const batch: ImportBatch = {
      id: 'b1',
      file_name: 'hevy.csv',
      source: 'hevy',
      created_at: '2026-10-13T10:00:00Z',
      workouts: 2,
      body_measurements: 0,
    };
    respond({ '/api/workouts/import/batches': [batch] });
    jest.mocked(apiSend).mockResolvedValue({
      workouts_removed: 2,
      body_measurements_removed: 0,
      body_measurements_preserved: 0,
      exercises_removed: 0,
    });
    const alert = jest.spyOn(Alert, 'alert');
    await renderWith(<ImportHistoryScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Undo hevy.csv' }));
    const buttons = alert.mock.calls[0][2]!;
    await act(async () => buttons.find((button) => button.text === 'Undo import')!.onPress!());
    expect(apiSend).toHaveBeenCalledWith('/api/workouts/import/batches/b1', 'DELETE');
    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith('Import undone: removed 2 sessions and 0 check-ins.'),
    );
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

describe('exporting and backing up', () => {
  it('shares both CSV files for the chosen time frame', async () => {
    await renderWith(<ExportScreen />);
    await fireEvent(screen.getByLabelText('Bodyweight check-ins'), 'valueChange', true);
    expect(
      await screen.findByText(
        'Shares two CSV files: workout history and bodyweight check-ins. Photos, videos, supersets, goals, RPE and workout notes are excluded.',
      ),
    ).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Share CSV' }));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledTimes(2));
    expect(jest.mocked(globalThis.fetch).mock.calls.map(([url]) => String(url))).toEqual([
      'https://relay.test/api/workouts/export.csv',
      'https://relay.test/api/body-measurements/export.csv',
    ]);
  });

  it('shows the Data rows and shares the full backup', async () => {
    await renderWith(<DataSection />);
    await fireEvent.press(screen.getByRole('button', { name: 'Import workouts' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/data/import');
    expect(await screen.findByRole('button', { name: 'Remove sample workouts' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Download backup' }));
    await waitFor(() =>
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        expect.stringMatching(/relay-backup-\d{4}-\d{2}-\d{2}\.zip$/),
        expect.objectContaining({ mimeType: 'application/zip' }),
      ),
    );
  });

  it('restores a backup after showing its counts', async () => {
    const archive: ArchivePreview = {
      created_at: null,
      username: 'preview',
      archive: {
        workouts: 12,
        cardio_sessions: 1,
        body_check_ins: 3,
        custom_exercises: 0,
        photos: 0,
      },
      current: {
        workouts: 4,
        cardio_sessions: 0,
        body_check_ins: 1,
        custom_exercises: 0,
        photos: 0,
      },
      photos_skipped: 1,
    };
    jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///picked/backup.zip', name: 'backup.zip', mimeType: 'application/zip' },
      ],
    } as never);
    jest.mocked(uploadFile).mockResolvedValueOnce(archive).mockResolvedValueOnce({});
    await renderWith(<DataSection />);
    await fireEvent.press(screen.getByRole('button', { name: 'Restore backup' }));
    expect(await screen.findByText('Restore this backup?')).toBeTruthy();
    expect(screen.getByLabelText('Workouts: 12 in backup, 4 now')).toBeTruthy();
    expect(
      screen.getByText('1 photo in this backup is missing and will be left out.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Restore backup' }).at(-1)!);
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Backup restored.'));
    expect(jest.mocked(uploadFile).mock.calls[1][0]).toBe('/api/account-archive/restore');
  });
});
