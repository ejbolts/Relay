import { useQuery, type QueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { dateRangeQuery, type DateRange } from '../../../../frontend/src/dateRanges';
import type {
  ArchivePreview,
  ArchiveRestored,
  CsvImportPreview,
  CsvImportResult,
  ImportBatch,
  ImportUndoResult,
  WorkoutImportOptions,
} from '../../../../frontend/src/types';
import { importFormFields } from '../../../../frontend/src/workoutImport';
import { ApiError, apiGet, apiOrigin, apiSend, clientVersionHeaders } from '../../data/api';
import { sessionToken } from '../../data/session';
import { uploadFile } from '../../data/uploadFile';

// Imports, exports and the full backup, against the same endpoints the web uses. Files come
// from the phone's document picker and leave through its share sheet.

/** A file picked on the phone, ready to upload. */
export interface PickedFile {
  uri: string;
  name: string;
  type: string;
}

/** Opens the document picker; null when the person cancels. */
export async function pickFile(types: string[], fallbackType: string): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // The picker takes MIME types; extensions only narrow the web's file input.
    type: types.filter((value) => value.includes('/')).concat('*/*'),
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name, type: asset.mimeType || fallbackType };
}

const UTIS: Record<string, string> = {
  'text/csv': 'public.comma-separated-values-text',
  'application/zip': 'public.zip-archive',
};

/** Hands a file in the phone's cache to the share sheet, which also saves it to Files. */
async function shareFile(file: File, type: string, dialogTitle: string) {
  await Sharing.shareAsync(file.uri, { mimeType: type, UTI: UTIS[type], dialogTitle });
}

/** Writes text to a cache file and shares it. */
export async function shareText(name: string, text: string, type: string, dialogTitle: string) {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(text);
  await shareFile(file, type, dialogTitle);
}

/**
 * Downloads a signed-in file (a CSV export or the backup) into the cache. Nothing is shared
 * until every selected file has downloaded, so a failure leaves no partial export.
 */
export async function downloadFile(path: string, name: string, failure: string): Promise<File> {
  if (!apiOrigin) throw new Error('Relay is not set up on this phone.');
  const origin = new URL(apiOrigin).origin;
  const token = await sessionToken(origin);
  let response: Response;
  try {
    response = await fetch(origin + path, {
      headers: {
        ...clientVersionHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'omit',
    });
  } catch {
    throw new Error('Could not reach Relay. Check your connection, then try again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, body?.error?.message ?? failure, body?.error?.code);
  }
  const bytes = await response.arrayBuffer();
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(new Uint8Array(bytes));
  return file;
}

export async function shareFiles(files: { file: File; type: string }[], dialogTitle: string) {
  // The share sheet takes one file at a time, so a second opens when the first closes.
  for (const { file, type } of files) await shareFile(file, type, dialogTitle);
}

export const exportPaths = {
  workouts: (range: DateRange) => `/api/workouts/export.csv${dateRangeQuery(range)}`,
  bodyweight: (range: DateRange) => `/api/body-measurements/export.csv${dateRangeQuery(range)}`,
};

export const previewImport = (file: PickedFile, options: WorkoutImportOptions) =>
  uploadFile<CsvImportPreview>('/api/workouts/import/preview', 'POST', file, {
    fields: importFormFields(options),
    failure: 'Could not review that CSV file.',
  });

export const saveImport = (file: PickedFile, options: WorkoutImportOptions) =>
  uploadFile<CsvImportResult>('/api/workouts/import', 'POST', file, {
    fields: importFormFields(options),
    failure: 'Could not save that import.',
  });

export const dataKeys = {
  importBatches: ['data', 'import-batches'] as const,
};

export function useImportBatches() {
  return useQuery({
    queryKey: dataKeys.importBatches,
    queryFn: ({ signal }) => apiGet<ImportBatch[]>('/api/workouts/import/batches', signal),
  });
}

export const undoImport = (id: string) =>
  apiSend<ImportUndoResult>(`/api/workouts/import/batches/${encodeURIComponent(id)}`, 'DELETE');

export const previewArchive = (file: PickedFile) =>
  uploadFile<ArchivePreview>('/api/account-archive/preview', 'POST', file, {
    failure: 'That backup could not be read.',
  });

export const restoreArchive = (file: PickedFile) =>
  uploadFile<ArchiveRestored>('/api/account-archive/restore', 'POST', file, {
    failure: 'The backup could not be restored. Nothing was changed.',
  });

export const removeSampleWorkouts = () => apiSend<void>('/api/sample-data', 'DELETE');

/**
 * An import, undo or restore changes training history, body weight, exercises and (for a
 * restore) splits, blocks and preferences, so everything is read again, as the web reloads.
 */
export function refreshAccountData(client: QueryClient) {
  return client.invalidateQueries();
}
