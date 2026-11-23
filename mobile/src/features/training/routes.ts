import type { TrainingSection } from './TrainingTabScreen';

/** The Training tab, opened at one of its sections. */
export const trainingRoute = (section: TrainingSection) =>
  ({ pathname: '/training', params: { section } }) as const;
