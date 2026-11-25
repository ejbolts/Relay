import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  muscleSetsView,
  muscleWeekName,
  setChangeLabel,
  setChangeTone,
  setCredits,
  signedSetChange,
} from '../../../../frontend/src/muscleSetRows';
import { muscleSetGoal } from '../../../../frontend/src/muscleSetGoals';
import type { TrackedWorkout } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { useDashboard, useTrainingPreferences, useWorkoutHistory } from '../../data/queries';
import { useUser } from '../../session/SessionProvider';
import { Button, Card, CardHeader, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { haptics } from '../../ui/haptics';
import { mixColor } from './color';
import { homeIcons } from './homeIcons';
import { useLiveMuscleSources, withLiveMuscleSets } from '../review/liveMuscleSources';
import { useOptionalWorkout } from '../workout/WorkoutProvider';
import { MuscleContributionSheet } from './MuscleContributionSheet';

const NO_WORKOUTS: TrackedWorkout[] = [];

/**
 * Working sets per muscle against each muscle's weekly goal, with the week before behind it, as
 * on the web. Step back through earlier weeks; Show more lists every muscle. A muscle opens the
 * workouts and exercises that supplied its sets, and Muscle goals edits every muscle's goal.
 * Like the web's, it counts the workout in progress and finished ones the dashboard doesn't yet.
 */
export function MuscleSetsCard() {
  const { colors, type } = useTheme();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const dashboard = useDashboard();
  const preferences = useTrainingPreferences();
  const user = useUser();
  const workout = useOptionalWorkout();
  const workouts = useWorkoutHistory().data ?? NO_WORKOUTS;
  const live = useLiveMuscleSources(user.id, dashboard.data);
  const today = localDate();
  const weeks = useMemo(() => {
    const data = dashboard.data;
    const withLive = (week: NonNullable<typeof data>['weekly_sets']) =>
      withLiveMuscleSets(week, live, workouts, today);
    return {
      current: data?.weekly_sets && withLive(data.weekly_sets),
      history: data?.weekly_sets_history?.map(withLive),
    };
  }, [dashboard.data, live, workouts, today]);
  const [weeksAgo, setWeeksAgo] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const goal = preferences.data?.weekly_muscle_set_goal ?? 10;
  const goals = preferences.data?.weekly_muscle_set_goals;
  const view = muscleSetsView({
    weeklySets: weeks.current,
    history: weeks.history,
    weeksAgo,
    goal,
    goals,
    expanded,
  });
  const muscle = view.allMuscles.find((item) => item.muscle_group === selected) ?? null;
  const step = (by: number) => {
    haptics.selection();
    setWeeksAgo(view.weeksAgo + by);
  };
  const changeColor = {
    up: colors.good,
    down: colors.danger,
    pending: colors.muted,
    same: colors.muted,
  };

  return (
    <Card>
      <CardHeader
        title="Sets per muscle"
        action={
          <View style={styles.nav} accessibilityLabel="Week">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous week"
              accessibilityState={{ disabled: view.weeksAgo >= view.weeks.length - 1 }}
              disabled={view.weeksAgo >= view.weeks.length - 1}
              hitSlop={8}
              onPress={() => step(1)}
              style={({ pressed }) => [
                styles.navButton,
                (pressed || view.weeksAgo >= view.weeks.length - 1) && styles.dim,
              ]}
            >
              <Icon name="chevronLeft" size={16} color={colors.text} />
            </Pressable>
            <Text
              accessibilityLiveRegion="polite"
              style={[type.footnote, styles.navLabel, { color: colors.text }]}
            >
              {view.name}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next week"
              accessibilityState={{ disabled: view.current }}
              disabled={view.current}
              hitSlop={8}
              onPress={() => step(-1)}
              style={({ pressed }) => [styles.navButton, (pressed || view.current) && styles.dim]}
            >
              <Icon name="chevronRight" size={16} color={colors.text} />
            </Pressable>
          </View>
        }
      />
      {dashboard.isPending ? (
        <Loading label="Loading sets per muscle" />
      ) : !dashboard.data ? (
        <ErrorState
          message={errorMessage(dashboard.error)}
          onRetry={() => void dashboard.refetch()}
        />
      ) : (
        <>
          <View style={styles.key}>
            {view.week && (
              <View style={styles.keyItem}>
                <View style={[styles.swatch, { backgroundColor: colors.accent }]} />
                <Text style={[type.caption, { color: colors.secondary }]}>
                  {view.current ? 'Current week' : view.name}
                </Text>
              </View>
            )}
            {view.previous && (
              <View style={styles.keyItem}>
                <View
                  style={[
                    styles.swatch,
                    styles.previousSwatch,
                    { borderColor: mixColor(colors.text, colors.surface, 0.32) },
                  ]}
                />
                <Text style={[type.caption, { color: colors.secondary }]}>
                  {muscleWeekName(view.weeksAgo + 1)}
                </Text>
              </View>
            )}
            <View style={styles.keyItem}>
              <View style={[styles.goalKey, { backgroundColor: colors.text }]} />
              <Text style={[type.caption, { color: colors.secondary }]}>
                {Object.keys(goals ?? {}).length ? 'Weekly target' : `Goal ${goal}`}
              </Text>
            </View>
          </View>
          {view.rows.length > 0 && (
            <View style={{ gap: 14 }}>
              {view.rows.map((row) => (
                <Pressable
                  key={row.muscle_group}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.muscle_group}: ${setCredits(row.raw_sets)} of ${row.target} sets${
                    row.change === null ? '' : `, ${setChangeLabel(row.change, view.current)}`
                  }`}
                  accessibilityHint="Shows the exercises that count towards it"
                  onPress={() => setSelected(row.muscle_group)}
                >
                  <Text
                    style={[type.footnote, styles.name, { color: colors.text }]}
                    numberOfLines={2}
                  >
                    {row.muscle_group}
                  </Text>
                  <View style={styles.track}>
                    {row.previous !== null && row.previous > 0 && (
                      <View
                        style={[
                          styles.bar,
                          styles.previousBar,
                          {
                            width: `${(row.previous / view.scale) * 100}%`,
                            // The web's ink at 32 %: a light outline the week's fill shows through.
                            borderColor: mixColor(colors.text, colors.surface, 0.32),
                          },
                        ]}
                      />
                    )}
                    <View
                      style={[
                        styles.bar,
                        {
                          width: `${(row.raw_sets / view.scale) * 100}%`,
                          backgroundColor: colors.accent,
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.goalTick,
                        {
                          left: `${(row.target / view.scale) * 100}%`,
                          backgroundColor: colors.text,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.value}>
                    <Text
                      style={[
                        type.footnote,
                        type.number,
                        { color: colors.text, fontWeight: '700' },
                      ]}
                    >
                      {setCredits(row.raw_sets)}
                      <Text style={{ color: colors.muted, fontWeight: '500' }}>
                        {' '}
                        / {row.target}
                      </Text>
                    </Text>
                    {row.change !== null && (
                      <Text
                        style={[
                          type.caption,
                          type.number,
                          {
                            color: changeColor[setChangeTone(row.change, view.current)],
                            fontWeight: '600',
                          },
                        ]}
                      >
                        {signedSetChange(row.change)}
                      </Text>
                    )}
                  </View>
                </Pressable>
              ))}
            </View>
          )}
          {!view.trainedCount && (
            <Text style={[type.footnote, { color: colors.muted }]}>
              {view.current
                ? 'No working sets logged yet this week.'
                : 'No working sets logged that week.'}
            </Text>
          )}
          <View style={styles.footnote}>
            <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>
              {view.trainedCount > 0 && view.untrained > 0
                ? `${view.untrained} muscles not trained${view.current ? ' yet' : ''}`
                : ''}
            </Text>
            <Button
              label="Muscle goals"
              icon={homeIcons.target}
              variant="link"
              size="small"
              onPress={() => router.push('/muscle-goals')}
            />
          </View>
          {view.canExpand && (
            // The web's centred toggle, its chevron after the label.
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              hitSlop={6}
              onPress={() => setExpanded((value) => !value)}
              style={({ pressed }) => [styles.expand, pressed && { opacity: 0.6 }]}
            >
              <Text style={[type.footnote, styles.expandLabel, { color: colors.accentText }]}>
                {expanded ? 'Show less' : 'Show more'}
              </Text>
              <Icon
                name={expanded ? 'chevronUp' : 'chevronDown'}
                size={16}
                color={colors.accentText}
              />
            </Pressable>
          )}
        </>
      )}
      <MuscleContributionSheet
        muscle={muscle}
        current={view.current}
        weekLabel={view.name}
        goal={muscle ? muscleSetGoal(muscle.muscle_group, goal, goals) : goal}
        defaultGoal={goal}
        goals={goals}
        liveWorkoutId={live.liveWorkoutId}
        onOpenLive={() => workout?.open()}
        onClose={() => setSelected(null)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  navLabel: { minWidth: 84, textAlign: 'center', fontWeight: '600' },
  dim: { opacity: 0.35 },
  key: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 8, borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  previousSwatch: { borderWidth: 1.5, borderLeftWidth: 0 },
  goalKey: { width: 2, height: 12, borderRadius: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { width: 96, lineHeight: 16 },
  track: { flex: 1, height: 8, justifyContent: 'center' },
  bar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  previousBar: { borderWidth: 1.5, borderLeftWidth: 0, zIndex: 1 },
  goalTick: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    width: 2,
    marginLeft: -1,
    borderRadius: 2,
    zIndex: 2,
  },
  value: { width: 52, alignItems: 'flex-end' },
  footnote: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expand: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  expandLabel: { fontWeight: '600' },
});
