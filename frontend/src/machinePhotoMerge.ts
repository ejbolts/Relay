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

/**
 * Every id that now means the merged machine: the merged-away machines and the photos they held
 * from earlier merges, which saved sets and pins may still name.
 */
export function mergedAwayIds(
  photos: Pick<MachinePhoto, 'id' | 'images'>[],
  sourceIds: string[],
): string[] {
  const sources = new Set(sourceIds);
  return [
    ...new Set(
      photos
        .filter((photo) => sources.has(photo.id))
        .flatMap((photo) => [photo.id, ...(photo.images ?? []).map((image) => image.id)]),
    ),
  ];
}

/**
 * An exercise's pins and set assignments after a merge, as the server remaps saved sets: every
 * merged-away id becomes the merged machine, so a logged set keeps its machine.
 */
export function movementAfterMachineMerge<
  T extends { machinePhotoIds: string[]; sets: { machine_photo_id?: string | null }[] },
>(movement: T, mergedId: string, awayIds: string[]): T {
  const away = new Set(awayIds);
  if (
    !movement.machinePhotoIds.some((id) => away.has(id)) &&
    !movement.sets.some((set) => set.machine_photo_id && away.has(set.machine_photo_id))
  )
    return movement;
  return {
    ...movement,
    machinePhotoIds: pinnedAfterMerge(movement.machinePhotoIds, mergedId, awayIds),
    sets: movement.sets.map((set) =>
      set.machine_photo_id && away.has(set.machine_photo_id)
        ? { ...set, machine_photo_id: mergedId }
        : set,
    ),
  };
}
