import type { ProfileBorder } from './types';

const amount = (value: number) => value.toLocaleString('en-GB', { maximumFractionDigits: 1 });

/** "62 / 100 workouts", with a percent sign kept against its number. */
export function borderProgressLabel(progress: NonNullable<ProfileBorder['progress']>): string {
  const gap = progress.unit === '%' ? '' : ' ';
  const shown = Math.min(progress.current, progress.target);
  return `${amount(shown)} / ${amount(progress.target)}${gap}${progress.unit}`;
}

/** How full the progress bar is, as a percentage with one decimal. */
export function borderProgressPercent(progress: NonNullable<ProfileBorder['progress']>): number {
  if (progress.target <= 0) return 100;
  return Math.round(Math.min(1, Math.max(0, progress.current / progress.target)) * 1000) / 10;
}
