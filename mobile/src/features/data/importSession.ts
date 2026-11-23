import { useSyncExternalStore } from 'react';
import type { CsvImportPreview, WorkoutImportOptions } from '../../../../frontend/src/types';
import { importAddsAnything, withExerciseMapping } from '../../../../frontend/src/workoutImport';
import { errorMessage } from '../../ui/components';
import { previewImport, saveImport, type PickedFile } from './dataApi';

// The import being reviewed, shared by the import, review and mapping screens. As on the web,
// nothing is saved until Save import; changing a mapping reviews the file again, and Save stays
// off until that review arrives.

export interface ImportSession {
  file: PickedFile | null;
  options: WorkoutImportOptions | null;
  preview: CsvImportPreview | null;
  /** A review request is running. */
  reviewing: boolean;
  /** A mapping changed and its review has not arrived (or failed). */
  stale: boolean;
  saving: boolean;
  error: string | null;
}

const EMPTY: ImportSession = {
  file: null,
  options: null,
  preview: null,
  reviewing: false,
  stale: false,
  saving: false,
  error: null,
};

let state = EMPTY;
let generation = 0;
const listeners = new Set<() => void>();

function set(change: Partial<ImportSession>) {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useImportSession = () => useSyncExternalStore(subscribe, () => state);

/** The last review's or save's failure. */
export const importError = () => state.error;

/** Reviews a file with the given options. Resolves true once its review has arrived. */
export async function reviewImport(
  file: PickedFile,
  options: WorkoutImportOptions,
): Promise<boolean> {
  const run = ++generation;
  set({
    file,
    options,
    reviewing: true,
    error: null,
    // A new file starts a new review; a remapped one keeps showing its last review meanwhile.
    ...(file !== state.file && { preview: null, stale: false }),
  });
  try {
    const preview = await previewImport(file, options);
    if (run !== generation) return false;
    set({ preview, reviewing: false, stale: false });
    return true;
  } catch (caught) {
    if (run !== generation) return false;
    set({ reviewing: false, error: errorMessage(caught) });
    return false;
  }
}

/** Maps an imported exercise name ('' for the automatic match) and reviews the file again. */
export function remapExercise(incomingName: string, exerciseId: string) {
  if (!state.file || !state.options) return;
  const options = withExerciseMapping(state.options, incomingName, exerciseId);
  set({ options, stale: true, error: null });
  void reviewImport(state.file, options);
}

/** Tries the review again after a mapping's review failed. */
export function retryReview() {
  if (state.file && state.options) void reviewImport(state.file, state.options);
}

export const canSaveImport = (session: ImportSession) =>
  !!session.preview &&
  !session.saving &&
  !session.reviewing &&
  !session.stale &&
  importAddsAnything(session.preview);

/** Saves the reviewed import. Throws when it fails, leaving the review open with the reason. */
export async function saveReviewedImport() {
  if (!canSaveImport(state) || !state.file || !state.options) return null;
  set({ saving: true, error: null });
  try {
    const result = await saveImport(state.file, state.options);
    set({ saving: false });
    return result;
  } catch (caught) {
    set({ saving: false, error: errorMessage(caught) });
    throw caught;
  }
}

/** Leaves the review; nothing is saved. */
export function clearImport() {
  if (state.saving) return;
  generation += 1;
  set(EMPTY);
}

/** For tests. */
export function resetImportSession() {
  generation += 1;
  state = EMPTY;
}
