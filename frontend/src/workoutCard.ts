import relayLogo from '../public/relay-logo.png?inline';
import { workoutCardSvg as drawWorkoutCard } from './workoutCardDrawing';

// The drawing is shared with the app (see workoutCardDrawing.ts); this adds the web's logo, PNG
// export and download.
export {
  cardioWorkoutForSharing,
  defaultWorkoutCardStats,
  workoutCardStats,
  type CardStat,
  type WorkoutCardLayout,
  type WorkoutCardStat,
  type WorkoutCardStyle,
} from './workoutCardDrawing';

/** One self-contained drawing powers both the preview and the PNG; no remote assets or private metadata. */
export function workoutCardSvg(
  options: Omit<Parameters<typeof drawWorkoutCard>[0], 'logo'>,
): string {
  return drawWorkoutCard({ ...options, logo: relayLogo });
}

export function workoutCardPreview(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function workoutCardPng(svg: string): Promise<Blob> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not prepare the card. Try again.'));
    image.src = workoutCardPreview(svg);
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image export is unavailable in this browser.');
  context.drawImage(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Could not export the image. Try again.')),
      'image/png',
    ),
  );
}

export function downloadWorkoutCard(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before releasing the URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
