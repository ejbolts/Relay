import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { canEditExercise, exerciseHiddenNotice } from '../../../../frontend/src/exerciseEdit';
import { EXTRA_REPS_SETTING, tracksExtraReps } from '../../../../frontend/src/extraReps';
import type { Exercise } from '../../../../frontend/src/types';
import { errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { MenuButton, type MenuItem } from '../../ui/MenuButton';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { updateExercise } from './exerciseQueries';
import { setExtraReps } from './extraRepsSetting';
import { exerciseRoutes } from './routes';

/** Hides or shows an exercise in lists, with Undo in the confirmation. */
async function setHidden(client: QueryClient, exercise: Exercise, hidden: boolean, undo: boolean) {
  try {
    await updateExercise(client, exercise.id, { hidden });
    showToast(
      exerciseHiddenNotice(hidden),
      undo
        ? { label: 'Undo', run: () => void setHidden(client, exercise, !hidden, false) }
        : undefined,
    );
  } catch (error) {
    showToast(errorMessage(error), undefined, { variant: 'error' });
  }
}

/**
 * The exercise's options, as the web's menu: edit and merge a custom exercise, log partial and
 * assisted reps on a strength exercise, hide any.
 */
export function ExerciseOptionsMenu({ exercise }: { exercise: Exercise }) {
  const { colors } = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const items: MenuItem[] = [
    ...(canEditExercise(exercise)
      ? [
          { label: 'Edit', onPress: () => router.push(exerciseRoutes.edit(exercise.id)) },
          {
            label: 'Merge with another exercise',
            onPress: () => router.push(exerciseRoutes.merge(exercise.id)),
          },
        ]
      : []),
    ...(exercise.kind === 'strength'
      ? [
          {
            label: EXTRA_REPS_SETTING,
            checked: tracksExtraReps(exercise),
            onPress: () => void setExtraReps(client, exercise, !tracksExtraReps(exercise)),
          },
        ]
      : []),
    {
      label: exercise.hidden ? 'Show in exercise lists' : 'Hide from exercise lists',
      onPress: () => void setHidden(client, exercise, !exercise.hidden, true),
    },
  ];
  return (
    <MenuButton
      accessibilityLabel={`Options for ${exercise.name}`}
      items={items}
      trigger={{ sf: 'ellipsis', color: colors.accentText, size: 16 }}
      width={32}
      height={32}
      fill={colors.surface2}
    >
      <View style={[styles.button, { backgroundColor: colors.surface2 }]}>
        <Icon name="more" size={18} color={colors.accentText} />
      </View>
    </MenuButton>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
