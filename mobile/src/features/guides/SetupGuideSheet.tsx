import { useRouter } from 'expo-router';
import { useState } from 'react';
import { multiMachineExerciseId } from '../../../../frontend/src/machineUsage';
import {
  blocksGuideSteps,
  guideFacts,
  GUIDE_TIPS,
  NORMALISE_GUIDE_WAIT,
  SETUP_GUIDE_TITLES,
  splitGuideSteps,
  type GuideStepCopy,
  type SetupGuideId,
} from '../../../../frontend/src/setupGuideSteps';
import { TIP_DEFINITIONS } from '../../../../frontend/src/tipDefinitions';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import { formatWeight } from '../../../../frontend/src/weightUnits';
import { useWeightUnit, useWorkoutHistory } from '../../data/queries';
import { Button } from '../../ui/components';
import { Sheet } from '../../ui/Sheet';
import { GuideCard, GuideText } from './GuideCard';
import { useTips } from './tips';

/**
 * A setup guide, stepped through in a sheet: the web coaches inside the feature's own screens, so
 * the app explains each step with your own training first, then opens the feature to do it.
 * Reaching the end counts the guide as done, and its tips stop suggesting the feature.
 */
export function SetupGuideSheet({
  guide,
  onClose,
}: {
  guide: SetupGuideId | null;
  onClose: () => void;
}) {
  return (
    <Sheet visible={!!guide} title={guide ? SETUP_GUIDE_TITLES[guide] : ''} onClose={onClose}>
      {guide && <SetupGuideSteps key={guide} guide={guide} onClose={onClose} />}
    </Sheet>
  );
}

const FINISH: Record<SetupGuideId, string> = {
  normalise: TIP_DEFINITIONS.normalise.action.label,
  blocks: TIP_DEFINITIONS.blocks.action.label,
  split: TIP_DEFINITIONS.split.action.label,
};

function SetupGuideSteps({ guide, onClose }: { guide: SetupGuideId; onClose: () => void }) {
  const router = useRouter();
  const tips = useTips();
  const unit = useWeightUnit();
  const history = useWorkoutHistory().data;
  // Worked out once when the guide starts, as on the web.
  const [workouts] = useState<TrackedWorkout[]>(() => history ?? []);
  const [machineExerciseId] = useState(() => multiMachineExerciseId(workouts));
  const [steps] = useState<GuideStepCopy[]>(() => {
    const facts = guideFacts(workouts);
    if (guide === 'blocks') return blocksGuideSteps(facts.lift);
    if (guide === 'split') return splitGuideSteps(facts, (kg) => formatWeight(kg, unit, 1));
    return [{ title: TIP_DEFINITIONS.normalise.title, body: TIP_DEFINITIONS.normalise.body }];
  });
  const [index, setIndex] = useState(0);

  if (guide === 'normalise' && !machineExerciseId) {
    return (
      <>
        <GuideText>{NORMALISE_GUIDE_WAIT.body}</GuideText>
        <Button label="OK" onPress={onClose} />
      </>
    );
  }

  function finish() {
    for (const tip of GUIDE_TIPS[guide]) tips.learn(tip);
    onClose();
    if (guide === 'blocks') router.push('/blocks/edit');
    else if (guide === 'split') router.push('/split');
    else
      router.push({
        pathname: '/training/machine-weights/[id]',
        params: { id: machineExerciseId! },
      });
  }

  const step = steps[index];
  const last = index === steps.length - 1;
  return (
    <GuideCard
      guide="Setup guide"
      index={index}
      total={steps.length}
      title={step.title}
      onBack={index > 0 ? () => setIndex(index - 1) : undefined}
      next={{
        label: last ? FINISH[guide] : 'Next',
        onPress: last ? finish : () => setIndex(index + 1),
      }}
      onLeave={onClose}
    >
      <GuideText>{step.body}</GuideText>
    </GuideCard>
  );
}
