import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { multiMachineExerciseId } from '../../../../frontend/src/machineUsage';
import { NORMALISE_GUIDE_WAIT, type SetupGuideId } from '../../../../frontend/src/setupGuideSteps';
import { OFFLINE_MESSAGE, waitingForNetwork } from '../../data/offline';
import { useWorkoutHistory } from '../../data/queries';
import { useUser } from '../../session/SessionProvider';
import { Button, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Sheet } from '../../ui/Sheet';
import { GuideText } from './GuideCard';
import { startSetupGuide } from './setupGuides';
import { useTips } from './tips';

/**
 * Starts a setup guide, as the web's guide host: the guide opens its feature, whose own screen
 * coaches each step in place (`GuideCoach`), and saving the feature finishes it. Comparing
 * machines needs one exercise logged on two saved machines: this sheet waits for the history
 * (with loading, offline and retry states), and says what is needed when the history shows it
 * isn't there yet.
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
  const workouts = history.data;
  // Comparing machines needs your history to know whether it can start. Blocks and splits start
  // at once, with the history so far (their wording has a version without it).
  const machines = guide === 'normalise';
  const machineExerciseId =
    machines && workouts !== undefined ? multiMachineExerciseId(workouts) : null;
  const starts = guide && (!machines || machineExerciseId) ? guide : null;
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
      router.push(
        {
          pathname: '/training/machine-weights/[id]',
          params: { id: machineExerciseId! },
        },
        { withAnchor: true },
      );
  }, [starts, tips, user.id, workouts, onClose, router, machineExerciseId]);

  return (
    <Sheet
      visible={machines && !machineExerciseId}
      title={NORMALISE_GUIDE_WAIT.title}
      onClose={onClose}
    >
      {workouts !== undefined ? (
        // Known history without one exercise on two machines: say what is needed first.
        <>
          <GuideText>{NORMALISE_GUIDE_WAIT.body}</GuideText>
          <Button label="OK" onPress={onClose} />
        </>
      ) : waitingForNetwork(history) || history.error ? (
        <ErrorState
          message={waitingForNetwork(history) ? OFFLINE_MESSAGE : errorMessage(history.error)}
          onRetry={() => void history.refetch()}
        />
      ) : (
        <Loading label="Loading your workouts" />
      )}
    </Sheet>
  );
}
