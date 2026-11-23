import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { workoutExportFileName } from '../../../../frontend/src/downloadFileName';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import { ApiError, apiOrigin } from '../../data/api';
import { sessionToken } from '../../data/session';

// Sharing a saved workout, as the web's Export menu: its share card as a PNG, or its sets as a
// CSV file, handed to the phone's share sheet (which also saves or copies them).

let logo: Promise<string> | null = null;

/** The Relay logo for the share card, as a file on the phone. */
export function workoutCardLogo(): Promise<string> {
  logo ??= Asset.fromModule(require('../../../assets/icon.png'))
    .downloadAsync()
    .then((asset) => asset.localUri ?? asset.uri)
    .catch((reason: unknown) => {
      logo = null;
      throw reason;
    });
  return logo;
}

/** The card's height in its own units (it is always 1080 wide). */
export function workoutCardHeight(svg: string): number {
  return Number(/viewBox="0 0 1080 ([\d.]+)"/.exec(svg)?.[1] ?? 1350);
}

async function shareFile(name: string, write: (file: File) => Promise<void>, type: string) {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await write(file);
  await Sharing.shareAsync(file.uri, {
    mimeType: type,
    UTI: type === 'image/png' ? 'public.png' : 'public.comma-separated-values-text',
    dialogTitle: 'Share workout',
  });
}

/** Shares the card, given as a base64 PNG. */
export function shareWorkoutCard(workout: Pick<TrackedWorkout, 'workout_date'>, png: string) {
  return shareFile(
    `relay-workout-${workout.workout_date}.png`,
    (file) => file.write(png, { encoding: 'base64' }),
    'image/png',
  );
}

/** Shares the workout's sets as the same CSV the web exports. */
export async function exportWorkoutCsv(
  workout: Pick<TrackedWorkout, 'id' | 'workout_date' | 'name'>,
) {
  if (!apiOrigin) throw new Error('Relay is not set up on this phone.');
  const origin = new URL(apiOrigin).origin;
  const token = await sessionToken(origin);
  let response: Response;
  try {
    response = await fetch(
      `${origin}/api/workouts/export.csv?workout_id=${encodeURIComponent(workout.id)}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'omit' },
    );
  } catch {
    throw new Error('Could not reach Relay. Check your connection, then try again.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.message ?? 'Could not export this workout. Try again.',
      body?.error?.code,
    );
  }
  const csv = await response.text();
  await shareFile(workoutExportFileName(workout), (file) => file.write(csv), 'text/csv');
}
