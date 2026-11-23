import { NativeTabs } from 'expo-router/native-tabs';
import { LiveWorkoutAccessory } from '../../features/workout/LiveWorkoutAccessory';
import { useWorkout } from '../../features/workout/WorkoutProvider';
import { useTheme } from '../../ui/theme';

/**
 * The web's bottom navigation as a native tab bar (Liquid Glass on iOS 26+). Start is a tab that
 * never opens: pressing it opens the Start menu, or the logger while a workout is live. On iOS
 * 27+ it sits on its own surface, as the web's centre button does.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const workout = useWorkout();
  const live = !!workout.live;
  return (
    <NativeTabs tintColor={colors.accentText} minimizeBehavior="onScrollDown">
      {live && (
        <NativeTabs.BottomAccessory>
          <LiveWorkoutAccessory />
        </NativeTabs.BottomAccessory>
      )}
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="training">
        <NativeTabs.Trigger.Label>Training</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="start"
        prominent
        disabled
        accessibilityLabel={live ? 'Open workout' : 'Start a workout'}
        listeners={{ tabPress: workout.openStartMenu }}
      >
        <NativeTabs.Trigger.Label>{live ? 'Workout' : 'Start'}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={live ? 'timer' : 'plus'} md={live ? 'timer' : 'add'} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="social">
        <NativeTabs.Trigger.Label>Social</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2.fill" md="group" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="body">
        <NativeTabs.Trigger.Label>Body</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="figure.stand" md="accessibility_new" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
