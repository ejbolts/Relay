export type TrainingDataRefreshCause = 'startup' | 'navigation' | 'mutation';

export function trainingDataActivityLabel(cause: TrainingDataRefreshCause): string | null {
  return cause === 'mutation' ? 'Updating training data…' : null;
}
