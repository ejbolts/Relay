/**
 * Phones store photos far larger than a machine photo needs: an iPhone photo is often 3–8 MB and
 * 12–48 megapixels. Before uploading, photos are shrunk to the size the server keeps and
 * re-encoded as JPEG, so they fit the upload limit and send quickly on a gym's mobile signal.
 */

import {
  JPEG_QUALITY,
  jpegFileName,
  needsOptimising,
  PHOTO_MAX_DIMENSION,
  scaledSize,
} from './photoOptimiseRules';

// The size rules are shared with the app (see photoOptimiseRules.ts); this adds the browser's
// decoding and re-encoding.
export {
  jpegFileName,
  needsOptimising,
  PHOTO_MAX_DIMENSION,
  scaledSize,
} from './photoOptimiseRules';

type DecodedImage = { source: CanvasImageSource; width: number; height: number; close(): void };

async function decode(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Applies the camera's rotation, which a re-encoded JPEG would otherwise lose.
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Some browsers cannot build a bitmap from every format; an <img> may still decode it.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => undefined,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The photo to upload: shrunk and re-encoded when that helps, otherwise the original. */
export async function optimisePhoto(file: File, maxDimension = PHOTO_MAX_DIMENSION): Promise<File> {
  let image: DecodedImage;
  try {
    image = await decode(file);
  } catch {
    return file; // The server decodes formats this browser cannot, such as HEIC elsewhere.
  }
  try {
    if (!needsOptimising(file.size, image.width, image.height, maxDimension)) return file;
    const size = scaledSize(image.width, image.height, maxDimension);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.fillStyle = '#fff'; // JPEG has no transparency; keep see-through areas light.
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(image.source, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], jpegFileName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } finally {
    image.close();
  }
}
