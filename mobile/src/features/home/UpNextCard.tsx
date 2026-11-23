import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { splitSkipMessage, splitSkipMove } from '../../../../frontend/src/splitSkip';
import { latestTopSets, shortDate, upNextSetLabel } from '../../../../frontend/src/trainingSummary';
import { localDate } from '../../../../frontend/src/utils';
import { useDashboard, useUpNext, useWeightUnit, useWorkoutHistory } from '../../data/queries';
import { Button, Card, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { showToast } from '../../ui/Toast';
import { useWorkout } from '../workout/WorkoutProvider';
import { useMoveSplit, useTypeColors } from './homeData';
import { homeIcons } from './homeIcons';

const SHOWN_EXERCISES = 6;

/** Home's first card, as on the web: the suggested session and the buttons that start it. */
export function UpNextCard() {
  const { colors, type, space } = useTheme();
  const router = useRouter();
  const today = localDate();
  const workout = useWorkout();
  const upNext = useUpNext();
  const dashboard = useDashboard();
  const history = useWorkoutHistory();
  const weightUnit = useWeightUnit();
  const { categoryColors, types } = useTypeColors();
  const moveSplit = useMoveSplit();
  const workouts = history.data;
  const latestSets = useMemo(() => latestTopSets(workouts ?? [], today), [workouts, today]);
  const { recommendation, label, template, isRestDay, needsSplitUpdate } = upNext;
  const skip = splitSkipMove(
    dashboard.data?.training_split,
    recommendation,
    needsSplitUpdate,
    today,
  );

  if (workout.live)
    return (
      <Card accessibilityLabel="Workout in progress">
        <View style={styles.row}>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.tag}>
              <View style={[styles.dot, { backgroundColor: colors.good }]} />
              <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>
                In progress
              </Text>
            </View>
            <Text style={[type.title, { color: colors.text }]} numberOfLines={1}>
              {workout.live.name.trim() || 'Workout'}
            </Text>
          </View>
          <Button label="Resume" icon="play" onPress={workout.open} />
        </View>
      </Card>
    );

  if (upNext.loading)
    return (
      <Card>
        <Loading label="Loading Up next" />
      </Card>
    );
  if (upNext.error && !dashboard.data)
    return (
      <Card>
        <ErrorState
          message={errorMessage(upNext.error)}
          onRetry={() => void Promise.all([dashboard.refetch(), history.refetch()])}
        />
      </Card>
    );

  async function skipDay() {
    if (!skip || moveSplit.isPending) return;
    const restSaved = skip.split.rest_saved === true;
    try {
      await moveSplit.mutateAsync({ step: skip.to, restSaved });
    } catch (error) {
      showToast(errorMessage(error) || 'Could not skip this day.');
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast(splitSkipMessage(skip, types), {
      label: 'Undo',
      run: () => {
        moveSplit
          .mutateAsync({ step: skip.from, restSaved })
          .catch((error) => showToast(errorMessage(error)));
      },
    });
  }

  const dotColor =
    recommendation && !isRestDay && !needsSplitUpdate
      ? (upNext.type?.color ?? categoryColors[recommendation.category])
      : null;
  const source =
    recommendation?.scheduled_date && recommendation.scheduled_date > today
      ? shortDate(recommendation.scheduled_date)
      : template
        ? recommendation?.routine_day?.movements.length
          ? 'Routine'
          : template.planned === 'type'
            ? 'Saved'
            : `Last: ${shortDate(template.sourceWorkout.workout_date)}`
        : null;
  const message = template
    ? null
    : needsSplitUpdate
      ? (recommendation?.reason ?? null)
      : !isRestDay && !recommendation?.split_name
        ? recommendation
          ? 'No previous session of this type yet. Start empty and add exercises.'
          : 'Log your first session to get a suggested next workout.'
        : null;
  const startsEmpty = !template && (isRestDay || needsSplitUpdate);
  const shown = template?.exercises.slice(0, SHOWN_EXERCISES) ?? [];
  const more = (template?.exercises.length ?? 0) - SHOWN_EXERCISES;

  return (
    <Card accessibilityLabel="Up next">
      <View style={styles.row}>
        <View style={[styles.tag, { flex: 1 }]}>
          {dotColor && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
          <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>
            {recommendation ? 'Up next' : 'Ready when you are'}
          </Text>
        </View>
        {skip && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Skip ${label?.toLowerCase() ?? 'this'} day`}
            accessibilityState={{ disabled: moveSplit.isPending }}
            disabled={moveSplit.isPending}
            hitSlop={8}
            onPress={() => void skipDay()}
            style={({ pressed }) => [styles.link, (pressed || moveSplit.isPending) && styles.dim]}
          >
            <Icon name="next" size={14} color={colors.accentText} />
            <Text style={[type.footnote, styles.linkText, { color: colors.accentText }]}>Skip</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.push('/split')}
          style={({ pressed }) => [styles.link, pressed && styles.dim]}
        >
          <Text style={[type.footnote, styles.linkText, { color: colors.accentText }]}>
            {recommendation?.split_name ? 'Edit split' : 'Set up split'}
          </Text>
        </Pressable>
      </View>
      <View style={[styles.row, { alignItems: 'baseline' }]}>
        <Text
          accessibilityRole="header"
          style={[type.title, { color: colors.text, flex: 1 }]}
          numberOfLines={2}
        >
          {needsSplitUpdate ? 'Update your split' : label ? `${label} day` : 'Start a workout'}
        </Text>
        {source && <Text style={[type.footnote, { color: colors.muted }]}>{source}</Text>}
      </View>
      {shown.length > 0 && (
        <View style={styles.exercises}>
          {shown.map((item) => {
            const set = upNextSetLabel(item, latestSets.get(item.exercise.id), weightUnit);
            return (
              <View
                key={item.exercise.id}
                accessible
                accessibilityLabel={`${item.exercise.name}, ${set.title}`}
                style={[styles.exercise, { borderBottomColor: colors.line }]}
              >
                <Text style={[type.footnote, { color: colors.text, flex: 1 }]} numberOfLines={1}>
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
      {more > 0 && (
        <Text style={[type.footnote, { color: colors.muted }]}>
          +{more} more{template?.planned ? '' : ' from last time'}
        </Text>
      )}
      {message && (
        <Text
          style={[type.footnote, { color: needsSplitUpdate ? colors.danger : colors.secondary }]}
        >
          {message}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Button
          label="Start workout"
          icon={template ? 'play' : homeIcons.addCircle}
          accessibilityLabel={template ? `Start ${label?.toLowerCase()} workout` : 'Start workout'}
          style={{ flex: 1 }}
          onPress={() =>
            workout.start(template && !startsEmpty ? { kind: 'up-next' } : { kind: 'empty' })
          }
        />
        {/* On a rest day, or while the split needs updating, Start workout already starts empty,
            so a second Empty button would do the same thing. */}
        {!startsEmpty && (
          <Button
            label="Empty"
            variant="secondary"
            accessibilityLabel="Start empty workout"
            onPress={() => workout.start({ kind: 'empty' })}
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 },
  linkText: { fontWeight: '600' },
  dim: { opacity: 0.55 },
  exercises: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
  exercise: {
    width: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
