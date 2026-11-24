import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { multiMachineExerciseId } from '../../../../frontend/src/machineUsage';
import { NORMALISE_GUIDE_WAIT, type SetupGuideId } from '../../../../frontend/src/setupGuideSteps';
import { waitingForNetwork } from '../../data/offline';
import { useWorkoutHistory } from '../../data/queries';
import { useUser } from '../../session/SessionProvider';
import { Button } from '../../ui/components';
import { Sheet } from '../../ui/Sheet';
import { GuideText } from './GuideCard';
import { startSetupGuide } from './setupGuides';
import { useTips } from './tips';

/**
 * Starts a setup guide, as the web's guide host: the guide opens its feature, whose own screen
 * coaches each step in place (`GuideCoach`), and saving the feature finishes it. Comparing
 * machines needs one exercise logged on two saved machines, so without one this sheet says so
 * instead.
 */
export function SetupGuideSheet({
  guide,
  onClose,
}: {
  guide: SetupGuideId | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const user = useUser();
  const tips = useTips();
  const history = useWorkoutHistory();
  // The guide talks about your own training, so it starts once the history is in.
  const loaded = !history.isPending || !!history.error || waitingForNetwork(history);
  const workouts = history.data;
  const machineExerciseId = guide === 'normalise' ? multiMachineExerciseId(workouts ?? []) : null;
  const waits = loaded && guide === 'normalise' && !machineExerciseId;
  const starts = loaded && guide && !waits ? guide : null;
  const begun = useRef<SetupGuideId | null>(null);

  useEffect(() => {
    if (!starts) {
      begun.current = null;
      return;
    }
    if (begun.current === starts) return;
    begun.current = starts;
    // Opening a guide engages its tip, as the web's tip action does.
    if (starts === 'split') tips.engage(tips.state.seen.split === 'learned' ? 'repRange' : 'split');
    else tips.engage(starts);
    startSetupGuide(starts, user.id, workouts ?? []);
    onClose();
    if (starts === 'blocks') router.push('/blocks/edit');
    else if (starts === 'split') router.push('/split');
    else
      router.push({
        pathname: '/training/machine-weights/[id]',
        params: { id: machineExerciseId! },
      });
  }, [starts, tips, user.id, workouts, onClose, router, machineExerciseId]);

  return (
    <Sheet visible={waits} title={NORMALISE_GUIDE_WAIT.title} onClose={onClose}>
      <GuideText>{NORMALISE_GUIDE_WAIT.body}</GuideText>
      <Button label="OK" onPress={onClose} />
    </Sheet>
  );
}
