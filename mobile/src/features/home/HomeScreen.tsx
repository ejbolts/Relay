import { Text, View } from 'react-native';
import { useDashboard, useUpNext, useWorkoutHistory } from '../../data/queries';
import { Button, Card, Screen } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { useWorkout } from '../workout/WorkoutProvider';

/** Placeholder Home: Up next and its start buttons. The Home PR adds the full set of cards. */
export function HomeScreen() {
  const { colors, type, space } = useTheme();
  const upNext = useUpNext();
  const dashboard = useDashboard();
  const history = useWorkoutHistory();
  const workout = useWorkout();
  return (
    <Screen
      title="Home"
      refreshing={dashboard.isRefetching}
      onRefresh={() => void Promise.all([dashboard.refetch(), history.refetch()])}
    >
      <Card>
        <Text style={[type.eyebrow, { color: colors.accentText }]}>UP NEXT</Text>
        <Text style={[type.title, { color: colors.text }]}>
          {upNext.label ? `${upNext.label} day` : 'Start a workout'}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            label="Start workout"
            icon="play"
            style={{ flex: 1 }}
            onPress={() => workout.start(upNext.template ? { kind: 'up-next' } : { kind: 'empty' })}
          />
          <Button
            label="Empty"
            variant="secondary"
            onPress={() => workout.start({ kind: 'empty' })}
          />
        </View>
      </Card>
    </Screen>
  );
}
