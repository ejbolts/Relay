import type { MachinePhoto } from './types';

// Merging duplicate saved machines into one, as the web's merge picker and the native app's
// machine sheet both do it. Plain functions with no React or browser APIs.

/** How many photos a saved machine holds; a machine merged before keeps them all. */
export function machinePhotoCount(photo: Pick<MachinePhoto, 'images'>): number {
  return Math.max(photo.images?.length ?? 1, 1);
}

/** How many photos the merged machine will hold. */
export function mergedPhotoCount(photos: Pick<MachinePhoto, 'images'>[]): number {
  return photos.reduce((total, photo) => total + machinePhotoCount(photo), 0);
}

/** The merged machine's name follows the chosen cover's until the user types their own. */
export function captionAfterCoverChange(
  caption: string,
  previousCover: Pick<MachinePhoto, 'caption'> | undefined,
  nextCover: Pick<MachinePhoto, 'caption'>,
): string {
  return !previousCover || caption.trim() === previousCover.caption.trim()
    ? nextCover.caption
    : caption;
}

/** Pinned machines after a merge: merged-away machines become the merged one, once. */
export function pinnedAfterMerge(
  pinnedIds: string[],
  mergedId: string,
  sourceIds: string[],
): string[] {
  const sources = new Set(sourceIds);
  return [...new Set(pinnedIds.map((id) => (sources.has(id) ? mergedId : id)))];
}
