import { useQuery, type QueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths, UploadType } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  ARCHIVE_READ_FAILED,
  ARCHIVE_RESTORE_FAILED,
} from '../../../../frontend/src/accountArchive';
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
import { forgetOfflineQueries } from '../workout/offlineQueries';

// Imports, exports and the full backup, against the same endpoints the web uses. Files come
// from the phone's document picker and leave through its share sheet. Backups can be hundreds of
// megabytes, so they move between the server and files natively, never through JavaScript memory.

const UNREACHABLE = 'Could not reach Relay. Check your connection, then try again.';

/** A file picked on the phone, ready to upload. */
export interface PickedFile {
  uri: string;
  name: string;
  type: string;
}

/** Removes the picker's copy of a file once its import or restore is over. */
export function discardStagedFile(file: PickedFile) {
  try {
    const staged = new File(file.uri);
    // Only the picker's copies in this app's cache are ours to delete.
    if (staged.uri.startsWith(Paths.cache.uri) && staged.exists) staged.delete();
  } catch {
    // Already gone; the system clears the cache in time anyway.
  }
}

/**
 * Opens the document picker; null when the person cancels. The picker copies the file into the
 * cache before it reports the size, so a file over `maxBytes` is removed again at once and
 * refused with `tooLarge`, before anything is sent.
 */
export async function pickFile(
  types: string[],
  fallbackType: string,
  { maxBytes, tooLarge }: { maxBytes: number; tooLarge: string },
): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    // The picker takes MIME types; extensions only narrow the web's file input.
    type: types.filter((value) => value.includes('/')).concat('*/*'),
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  const picked = { uri: asset.uri, name: asset.name, type: uploadType(asset.name, fallbackType) };
  let size = asset.size;
  if (size === undefined) {
    try {
      size = new File(asset.uri).size;
    } catch {
      size = undefined;
    }
  }
  if (size !== undefined && size > maxBytes) {
    discardStagedFile(picked);
    throw new Error(tooLarge);
  }
  return picked;
}

const TYPES_BY_EXTENSION: Record<string, string> = {
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  txt: 'text/plain',
  zip: 'application/zip',
};

/**
 * The type to upload a picked file as. Android calls a CSV `text/comma-separated-values`, which
 * the server refuses, so the type comes from the extension, as a browser's file input sends it.
 */
export function uploadType(name: string, fallbackType: string): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return TYPES_BY_EXTENSION[extension] ?? fallbackType;
}

const UTIS: Record<string, string> = {
  'text/csv': 'public.comma-separated-values-text',
  'application/zip': 'public.zip-archive',
};

/** Hands a file in the phone's cache to the share sheet, which also saves it to Files. */
async function shareFile(file: File, type: string, dialogTitle: string) {
  await Sharing.shareAsync(file.uri, { mimeType: type, UTI: UTIS[type], dialogTitle });
}

/**
 * Where exports and backups wait for the share sheet. The app receiving a file may still be
 * reading it after the sheet closes, so each export clears the previous one's files instead.
 */
function freshExportFolder(): Directory {
  const folder = new Directory(Paths.cache, 'relay-exports');
  try {
    if (folder.exists) folder.delete();
  } catch {
    // A file still open elsewhere stays until the system clears the cache.
  }
  folder.create({ idempotent: true, intermediates: true });
  return folder;
}

/** Writes text to a cache file and shares it. */
export async function shareText(name: string, text: string, type: string, dialogTitle: string) {
  const file = new File(freshExportFolder(), name);
  file.create({ overwrite: true });
  file.write(text);
  await shareFile(file, type, dialogTitle);
}

function serverOrigin() {
  if (!apiOrigin) throw new Error('Relay is not set up on this phone.');
  return new URL(apiOrigin).origin;
}

async function signedInHeaders(origin: string): Promise<Record<string, string>> {
  const token = await sessionToken(origin);
  return { ...clientVersionHeaders(), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

/**
 * Downloads signed-in files (CSV exports or the backup) straight to files in the cache, with the
 * app's version headers. Nothing is shared until every file has downloaded, so a failure leaves
 * no partial export.
 */
export async function downloadFiles(
  files: { path: string; name: string }[],
  failure: string,
): Promise<File[]> {
  const origin = serverOrigin();
  const headers = await signedInHeaders(origin);
  const folder = freshExportFolder();
  try {
    return await Promise.all(
      files.map(({ path, name }) =>
        File.downloadFileAsync(origin + path, new File(folder, name), {
          headers,
          idempotent: true,
        }),
      ),
    );
  } catch {
    // The native download reports neither the server's reason nor whether it was reached.
    throw new Error(failure);
  }
}

export async function shareFiles(files: { file: File; type: string }[], dialogTitle: string) {
  // The share sheet takes one file at a time, so a second opens when the first closes.
  for (const { file, type } of files) await shareFile(file, type, dialogTitle);
}

/**
 * Sends a picked file as the multipart `file` field straight from the file (the phone streams it
 * rather than holding it in memory), signed in and with the app's version headers. Where the
 * file API may not read the picked file (Expo Go), it falls back to `uploadFile`.
 */
async function uploadPicked<T>(path: string, file: PickedFile, failure: string): Promise<T> {
  const origin = serverOrigin();
  let result: { body: string; status: number };
  try {
    result = await new File(file.uri).upload(origin + path, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: file.type,
      headers: await signedInHeaders(origin),
    });
  } catch (caught) {
    // Expo Go lets its file API read only the project's own folders, and the picker's copy sits
    // outside them; there the file goes through React Native's multipart upload instead.
    if (/permission/i.test(String(caught))) return uploadFile<T>(path, 'POST', file, { failure });
    throw new Error(UNREACHABLE);
  }
  let body: { error?: { message?: string; code?: string } } | null = null;
  try {
    body = result.body ? JSON.parse(result.body) : null;
  } catch {
    body = null;
  }
  if (result.status >= 200 && result.status < 300) return body as T;
  throw new ApiError(result.status, body?.error?.message ?? failure, body?.error?.code);
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
  uploadPicked<ArchivePreview>('/api/account-archive/preview', file, ARCHIVE_READ_FAILED);

export const restoreArchive = (file: PickedFile) =>
  uploadPicked<ArchiveRestored>('/api/account-archive/restore', file, ARCHIVE_RESTORE_FAILED);

export const removeSampleWorkouts = () => apiSend<void>('/api/sample-data', 'DELETE');

/** After an import adds data, everything derived from training history is read again. */
export function refreshAccountData(client: QueryClient) {
  return client.invalidateQueries();
}

/**
 * After an undo, a restore or removing samples takes data away, no read may keep showing it: the
 * copies kept on the phone for offline use are dropped, every cached read is cleared, and the
 * screens showing them load again from the server (as the web reloads).
 */
export async function evictAccountData(client: QueryClient) {
  forgetOfflineQueries();
  await client.resetQueries();
}
