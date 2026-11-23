import { appGuideProgress } from './appGuideProgress';

export {
  nextOnboardingPrompt,
  type AppGuideStage,
  type OnboardingPrompt,
} from './appGuideProgress';

const progress = appGuideProgress(() => window.localStorage);

export const { queueAppGuide, appGuideWaiting, finishAppTour, importStepWaiting, finishAppGuide } =
  progress;
