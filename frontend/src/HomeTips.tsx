import { useEffect, useMemo } from 'react';
import { TipSlot, useTips } from './Tips';
import { useTrainingBlocks } from './trainingBlocksContext';
import { daysBetween } from './trainingSummary';
import { localDate } from './utils';
import { runningAsInstalledApp } from './homeScreenGuideState';
import type { TipId } from './tipsState';
import type { TrackedWorkout } from './types';

export function HomeTips({
  workouts,
  createdAt,
  hasSplit,
  measurementCount = 0,
}: {
  workouts: TrackedWorkout[];
  createdAt?: string;
  hasSplit: boolean;
  measurementCount?: number;
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
  const real = workouts.filter((workout) => !workout.is_sample);
  const exercises = real
    .flatMap((workout) => workout.movements ?? [])
    .map((movement) => movement.exercise);
  const hasMachines = exercises.some((exercise) => /machine|cable/i.test(exercise.equipment ?? ''));
  const hasBarbell = exercises.some((exercise) => /barbell/i.test(exercise.equipment ?? ''));
  const hasCardio = exercises.some((exercise) => exercise.kind === 'cardio');
  const eligible = useMemo(() => {
    const pool: TipId[] = [
      'reorder',
      'swipe',
      ...(hasBarbell ? ['plates' as const] : []),
      ...(hasMachines ? ['normalise' as const, 'mergeMachines' as const, 'machine' as const] : []),
      ...(measurementCount >= 3 ? ['maintenance' as const] : []),
      ...(hasCardio ? ['cardio' as const] : []),
      ...(real.length >= 5 ? ['swap' as const] : []),
      ...(weeks >= 4 && !blocks.loading && !blocks.error && blocks.config.blocks.length === 0
        ? ['blocks' as const]
        : []),
      ...(oldEnough ? ['home' as const] : []),
      ...(experienced && !hasSplit ? ['split' as const] : []),
      'friends',
      ...(typeof window !== 'undefined' && runningAsInstalledApp() ? ['back' as const] : []),
    ];
    return pool.filter(
      (id) => tips.state.seen[id] !== 'learned' && tips.state.seen[id] !== 'dismissed',
    );
  }, [
    hasBarbell,
    hasMachines,
    hasCardio,
    measurementCount,
    real.length,
    weeks,
    blocks.loading,
    blocks.error,
    blocks.config.blocks.length,
    oldEnough,
    experienced,
    hasSplit,
    tips.state.seen,
  ]);
  return eligible.length ? <TipSlot id={eligible[0]} eligible homeTips={eligible} /> : null;
}
