import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { workoutTypeColor } from '../../../../frontend/src/dayColors';
import {
  plannedDayButtons,
  plannedDayKicker,
  plannedDayOn,
  plannedDayStart,
  plannedDayTitle,
  plannedStartPlan,
} from '../../../../frontend/src/plannedDay';
import { latestTopSets, upNextSetLabel } from '../../../../frontend/src/trainingSummary';
import { localDate } from '../../../../frontend/src/utils';
import {
  useDashboard,
  useSavedExercises,
  useWeightUnit,
  useWorkoutHistory,
} from '../../data/queries';
import { Button, Loading } from '../../ui/components';
import { useTheme } from '../../ui/theme';
import { useRoutines } from '../settings/settingsData';
import { useWorkout } from '../workout/WorkoutProvider';
import { homeIcons } from './homeIcons';
import { useTypeColors } from './homeData';
import { HomeSheet, useCloseThen } from './HomeSheet';

/**
 * Today or a later calendar day, as the web's planned-day sheet shows it: what the split plans
 * there and a way to start it now. Workouts always start today, so a later day never gets a
 * workout dated ahead (frontend/src/plannedDay.ts).
 */
export function PlannedDaySheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  const router = useRouter();
  const workout = useWorkout();
  const { closeThen, onDismiss } = useCloseThen(onClose);
  const today = localDate();
  const split = useDashboard().data?.training_split;
  const { types, categoryColors } = useTypeColors();
  const plan = useMemo(
    () => (date ? plannedDayOn(split, date, today, types) : null),
    [split, date, today, types],
  );
  return (
    <HomeSheet
      visible={!!date}
      onClose={onClose}
      onDismiss={onDismiss}
      kicker={date ? plannedDayKicker(date, today) : undefined}
      kickerColor={plan?.kind === 'training' ? workoutTypeColor(plan.type, categoryColors) : null}
      title={plan ? plannedDayTitle(plan) : ''}
    >
      {plan && (
        <PlannedDayBody
          plan={plan}
          split={split}
          today={today}
          live={!!workout.live}
          onResume={() => closeThen(workout.open)}
          onStart={(start) =>
            closeThen(() =>
              workout.start(
                start
                  ? {
                      kind: 'template',
                      template: start.template,
                      name: `${start.type.name} workout`,
                      category: start.category,
                      type: start.type,
                    }
                  : { kind: 'empty' },
              ),
            )
          }
          onEditSplit={() => closeThen(() => router.push('/split'))}
        />
      )}
    </HomeSheet>
  );
}

function PlannedDayBody({
  plan,
  split,
  today,
  live,
  onResume,
  onStart,
  onEditSplit,
}: {
  plan: ReturnType<typeof plannedDayOn>;
  split: Parameters<typeof plannedDayOn>[0];
  today: string;
  live: boolean;
  onResume: () => void;
  onStart: (start: ReturnType<typeof plannedDayStart> | null) => void;
  onEditSplit: () => void;
}) {
  const { colors, type, space } = useTheme();
  const { types } = useTypeColors();
  const history = useWorkoutHistory();
  const saved = useSavedExercises();
  const weightUnit = useWeightUnit();
  const startPlan = useMemo(
    () => plannedStartPlan(plan, split, today, types),
    [plan, split, today, types],
  );
  // The split's routine pre-fills the day; without it the day still starts from the type's saved
  // exercises or its last session.
  const needsRoutine = Boolean(startPlan && split?.routine_id);
  const routines = useRoutines();
  const routineLoading = needsRoutine && routines.isPending;
  const routine = needsRoutine
    ? (routines.data?.find((item) => item.id === split?.routine_id) ?? null)
    : null;
  const workouts = history.data;
  const start = useMemo(
    () =>
      !startPlan || routineLoading
        ? null
        : plannedDayStart({
            startPlan,
            routine,
            workouts: workouts ?? [],
            savedExercises: saved.data ?? {},
            today,
            weightUnit,
          }),
    [startPlan, routineLoading, routine, workouts, saved.data, today, weightUnit],
  );
  const latestSets = useMemo(() => latestTopSets(workouts ?? [], today), [workouts, today]);
  const buttons = plannedDayButtons({ plan, startPlan, today, activeWorkout: live });
  const shown = plan.kind === 'training' ? (start?.template?.exercises ?? []) : [];

  return (
    <>
      {plan.kind === 'training' && routineLoading && <Loading label="Loading the planned day" />}
      {shown.length > 0 && (
        <View>
          {shown.map((item) => {
            const set = upNextSetLabel(item, latestSets.get(item.exercise.id), weightUnit);
            return (
              <View
                key={item.exercise.id}
                accessible
                accessibilityLabel={`${item.exercise.name}, ${set.title}`}
                style={[styles.exercise, { borderBottomColor: colors.line }]}
              >
                <Text style={[type.callout, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                  {item.exercise.name}
                </Text>
                <Text style={[type.footnote, type.number, { color: colors.secondary }]}>
                  {set.text}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      {buttons.resume ? (
        <Button label="Resume workout" icon="play" onPress={onResume} />
      ) : (
        (buttons.start || buttons.empty) && (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {buttons.start && (
              <Button
                label={buttons.start.label}
                accessibilityLabel={buttons.start.accessibilityLabel}
                icon="play"
                disabled={!start}
                style={{ flex: 1 }}
                onPress={() => start && onStart(start)}
              />
            )}
            {buttons.empty && (
              <Button
                label={buttons.empty.label}
                accessibilityLabel="Start empty workout"
                icon={buttons.empty.compact ? undefined : homeIcons.addCircle}
                variant={buttons.empty.compact ? 'secondary' : 'primary'}
                style={buttons.empty.compact ? undefined : { flex: 1 }}
                onPress={() => onStart(null)}
              />
            )}
          </View>
        )
      )}
      <Button
        label={split?.enabled ? 'Edit split' : 'Set up split'}
        variant="link"
        style={{ alignSelf: 'center' }}
        onPress={onEditSplit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  exercise: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

/**
 * Loads the routines with Home while a split is on, so a planned day's sheet opens with its
 * exercises instead of a spinner that then grows.
 */
export function PlannedDayPrefetch() {
  useRoutines();
  return null;
}
