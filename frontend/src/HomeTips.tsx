import { useEffect } from 'react';
import { TipSlot, useTips } from './Tips';
import { useTrainingBlocks } from './trainingBlocksContext';
import { daysBetween } from './trainingSummary';
import { localDate } from './utils';
import type { TrackedWorkout } from './types';

export function HomeTips({
  workouts,
  createdAt,
  hasSplit,
}: {
  workouts: TrackedWorkout[];
  createdAt?: string;
  hasSplit: boolean;
}) {
  const tips = useTips();
  const { learn } = tips;
  const blocks = useTrainingBlocks();
  const weeks = new Set(
    workouts
      .filter((workout) => !workout.is_sample)
      .map((workout) => {
        const date = new Date(`${workout.workout_date}T12:00:00`);
        date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        return date.toISOString().slice(0, 10);
      }),
  ).size;
  useEffect(() => {
    if (blocks.config.blocks.length) learn('blocks');
  }, [blocks.config.blocks.length, learn]);
  useEffect(() => {
    if (hasSplit) learn('split');
  }, [hasSplit, learn]);
  const experienced = workouts.filter((workout) => !workout.is_sample).length >= 3;
  const oldEnough = !!createdAt && daysBetween(createdAt.slice(0, 10), localDate()) >= 7;
  const eligible = [
    ...(weeks >= 4 && !blocks.loading && !blocks.error && blocks.config.blocks.length === 0
      ? ['blocks' as const]
      : []),
    ...(oldEnough ? ['home' as const] : []),
    ...(experienced && !hasSplit ? ['split' as const] : []),
  ].filter((id) => tips.state.seen[id] !== 'learned' && tips.state.seen[id] !== 'dismissed');
  const id =
    eligible.find((id) => id === tips.active) ?? eligible.find((id) => !tips.state.seen[id]);
  const nextId =
    id && eligible.length > 1 ? eligible[(eligible.indexOf(id) + 1) % eligible.length] : undefined;
  return id ? <TipSlot id={id} eligible nextId={nextId} /> : null;
}
