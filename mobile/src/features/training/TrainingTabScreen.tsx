import { Text } from 'react-native';
import { Card, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';

/** Placeholder: the Training PR adds Sessions, Exercises and Cardio. */
export function TrainingTabScreen() {
  const { colors, type } = useTheme();
  return (
    <Screen title="Training">
      <Card>
        <Text style={[type.callout, { color: colors.secondary }]}>
          Sessions, exercises and cardio.
        </Text>
      </Card>
    </Screen>
  );
}
