import { Image, StyleSheet, View } from 'react-native';
import { exerciseIconFor } from '../../../../frontend/src/exerciseIcons';
import type { Exercise } from '../../../../frontend/src/types';
import { useTheme } from '../../ui/theme';

/** An exercise's picture, the same one the web shows, for lists such as a feed card's. */
export function ExerciseIcon({ exercise, size = 28 }: { exercise: Exercise; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: size / 4, backgroundColor: colors.surface2 },
      ]}
    >
      <Image
        source={exerciseIconFor(exercise)}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
