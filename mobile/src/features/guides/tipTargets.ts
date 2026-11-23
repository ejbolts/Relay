import type { useRouter } from 'expo-router';
import type { TipTarget } from '../../../../frontend/src/tipDefinitions';
import { requestMaintainGoal } from '../body/maintainGoalRequest';
import { socialRoutes } from '../social';

/**
 * Opens the place a tip's button names, as the web's app shell does for `openTipTarget`. A weight
 * goal opens Body with its goal form on Maintain.
 */
export function openTipTarget(
  router: ReturnType<typeof useRouter>,
  target: TipTarget,
  { userId, exerciseId }: { userId: string; exerciseId?: string | null },
) {
  switch (target) {
    case 'machine-weights':
      if (exerciseId)
        router.push({
          pathname: '/training/machine-weights/[id]',
          params: { id: exerciseId },
        });
      else router.navigate('/training');
      return;
    case 'weight-goal':
      requestMaintainGoal();
      router.navigate('/body');
      return;
    case 'training-blocks':
      router.push('/blocks');
      return;
    case 'home-edit':
      router.push('/home-layout');
      return;
    case 'profile':
      router.push(socialRoutes.profile(userId));
      return;
    case 'split':
      router.push('/split');
      return;
    case 'appearance':
      router.push('/settings/appearance');
      return;
  }
}
