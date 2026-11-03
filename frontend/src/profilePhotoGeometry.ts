export type PhotoCrop = { zoom: number; x: number; y: number };
export const DEFAULT_PHOTO_CROP: PhotoCrop = { zoom: 1, x: 0.5, y: 0.5 };
export type CropPoint = { x: number; y: number };
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

/** Keep the image under the gesture's midpoint while panning and changing magnification. */
export function reframePhotoCrop(
  width: number,
  height: number,
  crop: PhotoCrop,
  zoom: number,
  from: CropPoint = { x: 0.5, y: 0.5 },
  to: CropPoint = from,
): PhotoCrop {
  const rect = photoCropRect(width, height, crop);
  const nextZoom = clamp(zoom, 1, 4);
  const side = Math.min(width, height) / nextZoom;
  return {
    zoom: nextZoom,
    x: width > side ? clamp((rect.x + from.x * rect.side - to.x * side) / (width - side)) : 0.5,
    y: height > side ? clamp((rect.y + from.y * rect.side - to.y * side) / (height - side)) : 0.5,
  };
}

export function gesturePhotoCrop(
  width: number,
  height: number,
  crop: PhotoCrop,
  from: CropPoint[],
  to: CropPoint[],
): PhotoCrop {
  const midpoint = (points: CropPoint[]) => ({
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  });
  const distance = (points: CropPoint[]) =>
    Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  const factor =
    from.length === 2 && to.length === 2 ? distance(to) / Math.max(0.001, distance(from)) : 1;
  return reframePhotoCrop(width, height, crop, crop.zoom * factor, midpoint(from), midpoint(to));
}

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
