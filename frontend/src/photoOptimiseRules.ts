/**
 * Shared by the web and the app. Phones store photos far larger than a machine photo needs: an iPhone photo is often 3–8 MB and
 * 12–48 megapixels. Before uploading, photos are shrunk to the size the server keeps and
 * re-encoded as JPEG, so they fit the upload limit and send quickly on a gym's mobile signal.
 */

/** Longest side the server stores for a machine photo; anything larger is wasted upload. */
export const PHOTO_MAX_DIMENSION = 1800;
/** The JPEG quality a shrunk photo is saved at. */
export const JPEG_QUALITY = 0.85;
/** A photo this small that already fits is sent untouched rather than re-compressed. */
export const SMALL_ENOUGH_BYTES = 1.5 * 1024 * 1024;

export function scaledSize(
  width: number,
  height: number,
  maxDimension = PHOTO_MAX_DIMENSION,
): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function needsOptimising(
  bytes: number,
  width: number,
  height: number,
  maxDimension = PHOTO_MAX_DIMENSION,
): boolean {
  return bytes > SMALL_ENOUGH_BYTES || Math.max(width, height) > maxDimension;
}

export function jpegFileName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '').trim();
  return `${base || 'machine-photo'}.jpg`;
}
