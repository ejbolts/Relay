import { useSyncExternalStore } from 'react';
import type {
  CsvImportPreview,
  CsvImportResult,
  WorkoutImportOptions,
} from '../../../../frontend/src/types';
import { importAddsAnything, withExerciseMapping } from '../../../../frontend/src/workoutImport';
import { errorMessage } from '../../ui/components';
import { discardStagedFile, previewImport, saveImport, type PickedFile } from './dataApi';

// The import being reviewed, shared by the import, review and mapping screens. As on the web,
// nothing is saved until Save import; changing a mapping reviews the file again, and Save stays
// off until that review arrives.
//
// A review belongs to the account that started it and to that visit to the import screen: the
// screen ends it when it closes (as it does on signing out), a request from an ended review is
// ignored when it answers, and only the owner can see or save it.

export interface ImportSession {
  /** The signed-in account that picked the file. */
  ownerId: string | null;
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
  ownerId: null,
  file: null,
  options: null,
  preview: null,
  reviewing: false,
  stale: false,
  saving: false,
  error: null,
};

let state = EMPTY;
/** Bumped whenever a review ends or a newer request starts; older answers are dropped. */
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

const ownedBy = (ownerId: string) => (state.ownerId === ownerId ? state : EMPTY);

/** The review, for its owner; any other account sees none. */
export function useImportSession(ownerId: string) {
  return useSyncExternalStore(subscribe, () => ownedBy(ownerId));
}

/** The owner's last review or save failure. */
export const importError = (ownerId: string) => ownedBy(ownerId).error;

/**
 * Reviews a file with the given options for `ownerId`. Resolves true once its review has arrived
 * and is still current; false when it failed, or the review ended or moved on meanwhile.
 */
export async function reviewImport(
  ownerId: string,
  file: PickedFile,
  options: WorkoutImportOptions,
): Promise<boolean> {
  const run = ++generation;
  const sameReview = state.ownerId === ownerId && state.file === file;
  if (!sameReview && state.file && state.file !== file) discardStagedFile(state.file);
  set({
    ownerId,
    file,
    options,
    reviewing: true,
    error: null,
    // A new file starts a new review; a remapped one keeps showing its last review meanwhile.
    ...(!sameReview && { preview: null, stale: false }),
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
export function remapExercise(ownerId: string, incomingName: string, exerciseId: string) {
  const { file, options } = ownedBy(ownerId);
  if (!file || !options || state.saving) return;
  const mapped = withExerciseMapping(options, incomingName, exerciseId);
  set({ options: mapped, stale: true, error: null });
  void reviewImport(ownerId, file, mapped);
}

/** Tries the review again after a mapping's review failed. */
export function retryReview(ownerId: string) {
  const { file, options } = ownedBy(ownerId);
  if (file && options && !state.saving) void reviewImport(ownerId, file, options);
}

export const canSaveImport = (session: ImportSession) =>
  !!session.ownerId &&
  !!session.preview &&
  !session.saving &&
  !session.reviewing &&
  !session.stale &&
  importAddsAnything(session.preview);

/**
 * Saves the owner's reviewed import. Resolves null when there is nothing to save for this account
 * or the review ended while saving; throws when the save fails, leaving the review open with the
 * reason.
 */
export async function saveReviewedImport(ownerId: string): Promise<CsvImportResult | null> {
  const session = ownedBy(ownerId);
  if (!canSaveImport(session) || !session.file || !session.options) return null;
  const run = generation;
  set({ saving: true, error: null });
  try {
    const result = await saveImport(session.file, session.options);
    if (run === generation) set({ saving: false });
    return result;
  } catch (caught) {
    if (run === generation) set({ saving: false, error: errorMessage(caught) });
    throw caught;
  }
}

/** Ends the review (leaving the review, closing the import screen, signing out); nothing is saved. */
export function clearImport() {
  if (state.saving) return;
  generation += 1;
  if (state.file) discardStagedFile(state.file);
  set(EMPTY);
}

/** Ends any review, even mid-save, as when the import screen closes. For tests too. */
export function resetImportSession() {
  generation += 1;
  if (state.file) discardStagedFile(state.file);
  state = EMPTY;
  listeners.forEach((listener) => listener());
}
