import type { CardioSession, TrackedWorkout } from './types';
import { workingSets, workoutDisplayName, workoutVolumeKg } from './trainingSummary';
import { isCompletedWorkingSet } from './workoutSets';
import { formatWeight, type WeightUnit } from './weightUnits';
import relayLogo from '../public/relay-logo.png?inline';

export type WorkoutCardStyle = 'midnight' | 'paper';
export type WorkoutCardLayout = 'portrait' | 'compact';
export type WorkoutCardStat =
  'duration' | 'exercises' | 'sets' | 'reps' | 'volume' | 'distance' | 'calories' | 'records';
export interface CardStat {
  id: WorkoutCardStat;
  label: string;
  value: string;
}

export function defaultWorkoutCardStats(workout: TrackedWorkout): WorkoutCardStat[] {
  const cardio =
    workout.category === 'cardio' ||
    workout.movements.some(
      (movement) =>
        movement.exercise.kind === 'cardio' && movement.sets.some((set) => set.completed),
    );
  const strength = workout.movements.some(
    (movement) => movement.exercise.kind !== 'cardio' && movement.sets.some(isCompletedWorkingSet),
  );
  if (cardio && !strength) return ['duration', 'distance', 'calories'];
  return [
    'duration',
    'exercises',
    'sets',
    'reps',
    'volume',
    'records',
    ...(cardio ? (['distance', 'calories'] as const) : []),
  ];
}

/** A display-only adapter; standalone cardio exports never create or change a saved workout. */
export function cardioWorkoutForSharing(session: CardioSession): TrackedWorkout {
  return {
    id: session.id,
    name: session.activity_type,
    workout_date: session.session_date,
    category: 'cardio',
    notes: null,
    duration_minutes: session.duration_minutes,
    start_time: null,
    end_time: null,
    is_sample: false,
    created_at: session.created_at,
    updated_at: session.updated_at,
    movements: [
      {
        id: session.id,
        order_index: 0,
        notes: null,
        machine_photos: [],
        superset_group_id: null,
        superset_name: null,
        exercise: {
          id: session.id,
          name: session.activity_type,
          kind: 'cardio',
          category: 'cardio',
          muscle_group: 'Cardio',
          equipment: null,
          is_custom: false,
          is_favorite: false,
          muscle_contributions: [],
        },
        sets: [
          {
            id: session.id,
            order_index: 0,
            reps: null,
            weight_kg: null,
            rpe: null,
            rest_seconds: null,
            duration_seconds: session.duration_minutes * 60,
            distance_km: session.distance_km ?? null,
            calories_kcal: session.calories_kcal ?? null,
            incline_percent: null,
            speed_kph: null,
            bodyweight_kg: null,
            percentile: null,
            warmup: false,
            set_type: 'normal',
            failed: false,
            target_reps: null,
            notes: null,
            completed: true,
          },
        ],
      },
    ],
  };
}

export function workoutCardStats(
  workout: TrackedWorkout,
  unit: WeightUnit,
  records: number,
): CardStat[] {
  const sets = workingSets(workout);
  const completed = workout.movements.flatMap((movement) =>
    movement.sets.filter((set) => set.completed),
  );
  const duration = workout.duration_minutes;
  return [
    {
      id: 'duration',
      label: 'Duration',
      value: duration === null ? '—' : `${Number(duration.toFixed(1))} min`,
    },
    {
      id: 'exercises',
      label: 'Exercises',
      value: String(
        new Set(
          workout.movements
            .filter((movement) => movement.sets.some(isCompletedWorkingSet))
            .map((movement) => movement.exercise.id),
        ).size,
      ),
    },
    { id: 'sets', label: 'Working sets', value: String(sets.length) },
    {
      id: 'reps',
      label: 'Reps',
      value: String(sets.reduce((sum, set) => sum + (set.reps ?? 0), 0)),
    },
    { id: 'volume', label: 'Volume', value: formatWeight(workoutVolumeKg(workout), unit, 0) },
    {
      id: 'distance',
      label: 'Distance',
      value: `${Number(completed.reduce((sum, set) => sum + (set.distance_km ?? 0), 0).toFixed(2))} km`,
    },
    {
      id: 'calories',
      label: 'Calories',
      value: `${Math.round(completed.reduce((sum, set) => sum + (set.calories_kcal ?? 0), 0))} kcal`,
    },
    { id: 'records', label: 'Personal records', value: String(records) },
  ];
}

function xml(value: string): string {
  return (
    value
      // XML 1.0 permits tab/newline/carriage return, but not other C0 controls.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(
        /[&<>"']/g,
        (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!,
      )
  );
}

function titleLines(title: string): string[] {
  const words = title.trim().split(/\s+/u);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    for (const part of Array.from(word)
      .join('')
      .match(/.{1,22}/gu) ?? []) {
      if (Array.from(`${line} ${part}`).length > 23 && line) {
        lines.push(line);
        line = part;
      } else line = line ? `${line} ${part}` : part;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 2) return [lines[0], `${Array.from(lines[1]).slice(0, 20).join('')}…`];
  return lines;
}

/** One self-contained drawing powers both the preview and the PNG; no remote assets or private metadata. */
export function workoutCardSvg({
  workout,
  stats,
  style,
  showDate,
  layout = 'portrait',
}: {
  workout: TrackedWorkout;
  stats: CardStat[];
  style: WorkoutCardStyle;
  showDate: boolean;
  layout?: WorkoutCardLayout;
}): string {
  const paper = style === 'paper';
  const color = paper
    ? {
        bg: '#f3f5f7',
        ink: '#14181c',
        muted: '#48515a',
        accent: '#1f62b4',
        panel: '#ffffff',
        line: '#d9dee2',
      }
    : {
        bg: '#15181b',
        ink: '#f3f5f6',
        muted: '#b4bcc2',
        accent: '#6da7ec',
        panel: '#1d2125',
        line: '#353b41',
      };
  const date = showDate
    ? new Date(`${workout.workout_date}T12:00:00`).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';
  const lines = titleLines(workoutDisplayName(workout));
  const compact = layout === 'compact';
  const columns = compact ? Math.max(1, Math.min(3, stats.length)) : stats.length === 1 ? 1 : 2;
  const rows = Math.max(1, Math.ceil(stats.length / columns));
  const height = compact ? 132 : Math.min(260, (636 - (rows - 1) * 18) / rows);
  const margin = compact ? 48 : 64;
  const gap = compact ? 16 : 18;
  const width = (1080 - margin * 2 - gap * (columns - 1)) / columns;
  const titleY = compact ? 214 : 278;
  const titleStep = compact ? 64 : 82;
  const titleSize = compact ? 56 : 76;
  const dateY = compact ? titleY + (lines.length - 1) * titleStep + 46 : 408;
  const dividerY = compact
    ? (showDate ? dateY : titleY + (lines.length - 1) * titleStep) + 38
    : 450;
  const statsY = compact ? dividerY + 32 : 490;
  const cardHeight = compact
    ? statsY + (stats.length ? rows * (height + gap) - gap : 0) + 48
    : 1350;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${cardHeight}" viewBox="0 0 1080 ${cardHeight}" role="img" aria-label="Workout summary">
    <rect width="1080" height="${cardHeight}" fill="${color.bg}"/>
    <g fill="none" stroke="${color.line}" stroke-width="2"><circle cx="1000" cy="115" r="212"/><circle cx="1000" cy="115" r="160"/><circle cx="1000" cy="115" r="108"/></g>
    <g font-family="Arial, Helvetica, sans-serif">
      <image x="${margin}" y="${compact ? 32 : 52}" width="72" height="72" href="${relayLogo}"/>
      <text x="${margin + 92}" y="${compact ? 80 : 100}" fill="${color.ink}" font-size="34" font-weight="700" letter-spacing="5">RELAY</text>
      <text x="${margin}" y="${compact ? 146 : 180}" fill="${color.accent}" font-size="23" font-weight="700" letter-spacing="4">WORKOUT COMPLETE</text>
      ${lines
        .map((line, index) => {
          // Bound wide capitals and Unicode too, rather than relying on character count alone.
          const width =
            Array.from(line).reduce(
              (sum, char) =>
                sum + (char.codePointAt(0)! > 255 ? 1.1 : 'MW@%'.includes(char) ? 1 : 0.7),
              0,
            ) * titleSize;
          return `<text x="${margin - 4}" y="${titleY + index * titleStep}" fill="${color.ink}" font-size="${titleSize}" font-weight="700"${width > 940 ? ' textLength="940" lengthAdjust="spacingAndGlyphs"' : ''}>${xml(line)}</text>`;
        })
        .join('')}
      ${showDate ? `<text x="${margin}" y="${dateY}" fill="${color.muted}" font-size="29">${xml(date)}</text>` : ''}
      <path d="M${margin} ${dividerY}H${1080 - margin}" stroke="${color.line}" stroke-width="2"/>
      ${stats
        .map((stat, index) => {
          const x = margin + (index % columns) * (width + gap);
          const y = statsY + Math.floor(index / columns) * (height + gap);
          const size = compact
            ? stat.value.length > 9
              ? 34
              : 46
            : stat.value.length > 11
              ? 43
              : 56;
          return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="22" fill="${color.panel}"/>
          <text x="${x + 30}" y="${y + height / 2 - 4}" fill="${index === 0 ? color.accent : color.ink}" font-size="${size}" font-weight="700">${xml(stat.value)}</text>
          <text x="${x + 30}" y="${y + height / 2 + (compact ? 32 : 40)}" fill="${color.muted}" font-size="${compact ? 22 : 25}">${xml(stat.label)}</text>`;
        })
        .join('')}
    </g>
  </svg>`;
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
