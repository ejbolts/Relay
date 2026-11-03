export type PhotoCrop = { zoom: number; x: number; y: number };
export const DEFAULT_PHOTO_CROP: PhotoCrop = { zoom: 1, x: 0.5, y: 0.5 };

export function photoCropRect(width: number, height: number, crop: PhotoCrop) {
  const side = Math.min(width, height) / Math.max(1, Math.min(4, crop.zoom));
  return {
    x: (width - side) * Math.max(0, Math.min(1, crop.x)),
    y: (height - side) * Math.max(0, Math.min(1, crop.y)),
    side,
  };
}

/** Export the square inside the circular preview; every avatar supplies its own round mask. */
export async function cropProfilePhoto(image: HTMLImageElement, crop: PhotoCrop): Promise<File> {
  const rect = photoCropRect(image.naturalWidth, image.naturalHeight, crop);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.max(1, Math.min(1024, Math.round(rect.side)));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Photo editing is unavailable. Try another browser.');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, rect.x, rect.y, rect.side, rect.side, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.9),
  );
  if (!blob) throw new Error('Could not crop this photo. Please try again.');
  return new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' });
}
