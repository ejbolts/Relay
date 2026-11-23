import type { TrainingSection } from './TrainingTabScreen';

/**
 * The Training tab, opened at one of its sections. Call it when navigating, not while rendering:
 * each call is a new request, so the tab switches even if it last showed this section.
 */
export const trainingRoute = (section: TrainingSection) =>
  ({ pathname: '/training', params: { section, request: String(Date.now()) } }) as const;
