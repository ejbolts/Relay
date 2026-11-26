import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { cardioDistanceGroups } from '../../../../frontend/src/cardioTrend';
import {
  bodyGoalChip,
  bodyGoalProgress,
  distancePeriodName,
  distancePeriodStart,
  exerciseNameMap,
  freshnessLabel,
  freshnessLevel,
  goalDaysLeftLabel,
  muscleFreshness,
  ordinal,
  spotlightSummary,
  weekBoard,
  weekStandings,
} from '../../../../frontend/src/homeInsights';
import type {
  CardioDistanceSettings,
  ExerciseSpotlightSettings,
} from '../../../../frontend/src/homeLayout';
import { presenceStatus, presenceText } from '../../../../frontend/src/presenceStatus';
import { shortDate } from '../../../../frontend/src/trainingSummary';
import { localDate } from '../../../../frontend/src/utils';
import {
  formatWeight,
  formatWeightNumber,
  weightFromKg,
} from '../../../../frontend/src/weightUnits';
import { useDashboard, useExercises, useWeightUnit, useWorkoutHistory } from '../../data/queries';
import { useUser } from '../../session/SessionProvider';
import { Button, Card, CardHeader } from '../../ui/components';
import { ProfilePhoto } from '../../ui/ProfilePhoto';
import { useTheme } from '../../ui/theme';
import { useBodyGoals, useBodyMeasurements } from '../body/bodyQueries';
import { socialRoutes } from '../social';
import { Avatar } from '../social/Avatar';
import { sharingRequired } from '../social/socialApi';
import { useFriendConnections } from '../social/socialQueries';
import { trainingRoute } from '../training/routes';
import { useCardioOverview, useExerciseLibrary } from '../training/trainingQueries';
import { Meter, Ring, Sparkline } from './Sparks';
import { useWeekStartDay } from './StatCards';

// Home's opt-in cards, as on the web (frontend/src/HomeInsightCards.tsx). Each reads its own
// data, shows a line while it loads or fails, and draws a shorter version at compact width.

function Empty({ children }: { children: string }) {
  const { colors, type } = useTheme();
  return <Text style={[type.footnote, { color: colors.muted }]}>{children}</Text>;
}

function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Button label={label} variant="link" onPress={onPress} />;
}

/** Progress to the active body-weight goal, with the chip and days left. */
export function BodyGoalCard({ compact }: { compact: boolean }) {
  const { colors, type } = useTheme();
  const router = useRouter();
  const unit = useWeightUnit();
  const today = localDate();
  const goals = useBodyGoals();
  const latest = useBodyMeasurements().data?.[0] ?? null;
  const goal = goals.data?.find((item) => item.active) ?? null;
  const progress = goal && latest ? bodyGoalProgress(goal, latest.weight_kg, today) : null;
  const chip = bodyGoalChip(progress, unit);
  const weight = (kg: number) => formatWeightNumber(kg, unit, 1);
  return (
    <Card>
      <CardHeader
        title="Body goal"
        action={<LinkButton label="Body" onPress={() => router.navigate('/body')} />}
      />
      {goals.isPending ? (
        <Empty>Loading your goal…</Empty>
      ) : !goals.data ? (
        <Empty>Your goal could not be loaded.</Empty>
      ) : !goal ? (
        <Empty>Set a body-weight goal on Body to follow it here.</Empty>
      ) : !progress ? (
        <Empty>Log your weight to see your progress.</Empty>
      ) : (
        <>
          <View style={styles.headline}>
            <Text style={[styles.value, type.number, { color: colors.text }]}>
              {weight(progress.current_kg)}
              <Text style={[type.caption, { color: colors.muted }]}> {unit}</Text>
            </Text>
            {chip && (
              <Text
                style={[
                  type.caption,
                  styles.chip,
                  { color: chip.tone === 'good' ? colors.good : colors.gold },
                  { backgroundColor: colors.surface2 },
                ]}
              >
                {chip.text}
              </Text>
            )}
          </View>
          {progress.done !== null ? (
            compact ? (
              <View style={{ alignItems: 'center' }}>
                <Ring
                  value={progress.done}
                  max={1}
                  size={84}
                  label={`Progress to your goal, ${Math.round(progress.done * 100)}%`}
                >
                  <Text style={[type.headline, type.number, { color: colors.text }]}>
                    {weight(progress.changed_kg)}
                  </Text>
                  <Text style={[type.caption, { color: colors.muted }]}>
                    of {weight(progress.planned_kg)} {unit}
                  </Text>
                </Ring>
              </View>
            ) : (
              <>
                <Meter
                  value={Math.round(progress.done * 100)}
                  max={100}
                  label="Progress to your goal"
                />
                <View style={styles.between}>
                  <Text style={[type.caption, type.number, { color: colors.secondary }]}>
                    Start {weight(goal.start_weight_kg)}
                  </Text>
                  <Text style={[type.caption, type.number, { color: colors.secondary }]}>
                    Goal {formatWeight(goal.target_weight_kg, unit, 1)} by{' '}
                    {shortDate(goal.target_date)}
                  </Text>
                </View>
              </>
            )
          ) : (
            <View style={styles.between}>
              <Text style={[type.caption, type.number, { color: colors.secondary }]}>
                {progress.range
                  ? `${weight(progress.range[0])}–${formatWeight(progress.range[1], unit, 1)}`
                  : formatWeight(goal.target_weight_kg, unit, 1)}
              </Text>
              <Text style={[type.caption, { color: colors.secondary }]}>
                until {shortDate(goal.target_date)}
              </Text>
            </View>
          )}
          <Text style={[type.caption, { color: colors.muted }]}>
            {goalDaysLeftLabel(progress.days_left, today > goal.target_date)}
          </Text>
        </>
      )}
    </Card>
  );
}

/** One lift's estimated 1RM and its trend: the chosen exercise, or the most trained one. */
export function ExerciseSpotlightCard({ settings }: { settings: ExerciseSpotlightSettings }) {
  const { colors, type } = useTheme();
  const router = useRouter();
  const unit = useWeightUnit();
  const summaries = useExerciseLibrary().data;
  const names = useSpotlightNames();
  const summary = summaries ? spotlightSummary(summaries, settings.exercise_id) : null;
  const name = summary ? (names.get(summary.exercise_id) ?? 'Exercise') : 'Exercise spotlight';
  const change = summary?.change_kg ?? null;
  return (
    <Card>
      <CardHeader
        title={name}
        action={
          <LinkButton
            label="Progress"
            onPress={() =>
              summary
                ? router.push(
                    {
                      pathname: '/training/exercise/[id]',
                      params: { id: summary.exercise_id },
                    },
                    { withAnchor: true },
                  )
                : router.navigate(trainingRoute('exercises'))
            }
          />
        }
      />
      {!summaries ? (
        <Empty>Loading your lifts…</Empty>
      ) : !summary ? (
        <Empty>Log a strength workout to spotlight a lift here.</Empty>
      ) : (
        <>
          <Text style={[type.caption, { color: colors.muted }]}>Est. 1RM</Text>
          <View style={styles.headline}>
            <Text style={[styles.value, type.number, { color: colors.text }]}>
              {summary.normalised ? '≈' : ''}
              {formatWeightNumber(summary.latest_estimated_1rm ?? 0, unit, 1)}
              <Text style={[type.caption, { color: colors.muted }]}> {unit}</Text>
            </Text>
            {change !== null && (
              <Text
                style={[
                  type.footnote,
                  type.number,
                  {
                    fontWeight: '600',
                    color: change > 0 ? colors.good : change < 0 ? colors.danger : colors.muted,
                  },
                ]}
              >
                {change > 0 ? '+' : change < 0 ? '−' : '±'}
                {formatWeight(Math.abs(change), unit, 1)}
              </Text>
            )}
          </View>
          <Sparkline
            values={summary.trend.map((point) => weightFromKg(point.estimated_1rm, unit))}
            label={`${name} estimated one-rep max, last 8 weeks`}
            height={48}
          />
          <Text style={[type.caption, { color: colors.muted }]}>
            {summary.trend.length > 1
              ? `8 weeks to ${shortDate(summary.last_date)}`
              : `Last trained ${shortDate(summary.last_date)}`}
          </Text>
        </>
      )}
    </Card>
  );
}

/** Exercise names by id, for the spotlight and its settings. */
export function useSpotlightNames() {
  const workouts = useWorkoutHistory().data;
  const exercises = useExercises().data;
  return useMemo(() => exerciseNameMap(workouts ?? [], exercises ?? []), [workouts, exercises]);
}

const FULL_FRESHNESS = 10;
const COMPACT_FRESHNESS = 3;

/** Days since each muscle was last trained, most rested first. */
export function MuscleFreshnessCard({ compact }: { compact: boolean }) {
  const { colors, type } = useTheme();
  const today = localDate();
  const data = useDashboard().data;
  const [expanded, setExpanded] = useState(false);
  const muscles = useMemo(
    () => muscleFreshness([data?.weekly_sets, ...(data?.weekly_sets_history ?? [])], today),
    [data?.weekly_sets, data?.weekly_sets_history, today],
  );
  const limit = compact ? COMPACT_FRESHNESS : FULL_FRESHNESS;
  const shown = expanded ? muscles : muscles.slice(0, limit);
  const tone = { fresh: colors.good, recovering: colors.gold, recent: colors.muted };
  return (
    <Card>
      <CardHeader title="Muscle freshness" />
      {muscles.length === 0 ? (
        <Empty>Log a workout to see which muscles are fresh.</Empty>
      ) : (
        <>
          <View>
            {shown.map((item) => (
              <View
                key={item.muscle}
                accessible
                accessibilityLabel={`${item.muscle}, ${freshnessLabel(item.days)}`}
                style={styles.listRow}
              >
                <Text style={[type.footnote, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                  {item.muscle}
                </Text>
                <Text
                  style={[
                    type.footnote,
                    type.number,
                    { color: tone[freshnessLevel(item.days)], fontWeight: '700' },
                  ]}
                >
                  {freshnessLabel(item.days, compact)}
                </Text>
              </View>
            ))}
          </View>
          {muscles.length > limit && (
            <Button
              label={
                expanded
                  ? 'Show less'
                  : compact
                    ? `+${muscles.length - limit} more`
                    : `+${muscles.length - limit} trained more recently`
              }
              variant="link"
              style={{ alignSelf: 'flex-start' }}
              onPress={() => setExpanded((value) => !value)}
            />
          )}
        </>
      )}
    </Card>
  );
}

/** Distance by activity this week or month, longest bar first. */
export function CardioDistanceCard({ settings }: { settings: CardioDistanceSettings }) {
  const { colors, type, radius } = useTheme();
  const router = useRouter();
  const today = localDate();
  const weekStartDay = useWeekStartDay();
  const cardio = useCardioOverview();
  const start = distancePeriodStart(settings.period, today, weekStartDay);
  const groups = cardio.data
    ? cardioDistanceGroups(cardio.data.sessions, start, today).filter((group) => group.distance > 0)
    : [];
  const longest = Math.max(...groups.map((group) => group.distance), 0.1);
  const palette = [colors.accent, colors.good, colors.gold, '#a78bfa', colors.danger];
  return (
    <Card>
      <CardHeader
        title="Cardio distance"
        action={
          <LinkButton label="Cardio" onPress={() => router.navigate(trainingRoute('cardio'))} />
        }
      />
      <Text style={[type.caption, { color: colors.muted }]}>
        {distancePeriodName(settings.period, today)}
      </Text>
      {cardio.isPending ? (
        <Empty>Loading your cardio…</Empty>
      ) : !cardio.data ? (
        <Empty>Your cardio could not be loaded.</Empty>
      ) : groups.length === 0 ? (
        <Empty>{`No distance logged ${settings.period === 'week' ? 'this week' : 'this month'}.`}</Empty>
      ) : (
        <View style={{ gap: 10 }}>
          {groups.map((group, index) => {
            const color = palette[index % palette.length];
            const distance = Number(group.distance.toFixed(1)).toLocaleString('en-GB');
            const sessions = `${group.sessions} ${group.sessions === 1 ? 'session' : 'sessions'}`;
            return (
              <View
                key={group.key}
                accessible
                accessibilityLabel={`${group.label}: ${distance} km, ${sessions}`}
                style={{ gap: 4 }}
              >
                <View style={styles.between}>
                  <View style={styles.distanceName}>
                    <View style={[styles.dot, { backgroundColor: color }]} />
                    <Text style={[type.footnote, { color: colors.text }]}>{group.label}</Text>
                  </View>
                  <Text style={[type.footnote, type.number, { color: colors.text }]}>
                    <Text style={{ fontWeight: '700' }}>{distance}</Text> km
                    <Text style={{ color: colors.muted }}> · {sessions}</Text>
                  </Text>
                </View>
                <View
                  style={{
                    height: 6,
                    borderRadius: radius.pill,
                    width: `${(group.distance / longest) * 100}%`,
                    backgroundColor: color,
                  }}
                />
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

/** Training days this week, you and your friends, ranked. */
export function FriendsWeekCard({ compact }: { compact: boolean }) {
  const { colors, type } = useTheme();
  const router = useRouter();
  const user = useUser();
  const today = localDate();
  const weekStartDay = useWeekStartDay();
  const workouts = useWorkoutHistory().data;
  const friends = useFriendConnections();
  const locked = friends.data?.locked === true || sharingRequired(friends.error);
  const rows = useMemo(
    () =>
      friends.data && !friends.data.locked
        ? weekStandings(
            friends.data.friends,
            {
              id: 'you',
              display_name: user.display_name,
              profile_photo_url: user.profile_photo_url ?? null,
            },
            workouts ?? [],
            today,
            weekStartDay,
          )
        : [],
    [friends.data, user.display_name, user.profile_photo_url, workouts, today, weekStartDay],
  );
  const { rank, yourRank, summary } = weekBoard(rows);
  return (
    <Card>
      <CardHeader
        title="Friends this week"
        action={
          <LinkButton
            label={locked ? 'Share' : 'Social'}
            onPress={() =>
              locked ? router.push(socialRoutes.sharing) : router.navigate(socialRoutes.tab)
            }
          />
        }
      />
      {friends.isPending ? (
        <Empty>Loading your friends…</Empty>
      ) : locked ? (
        <Empty>Share your profile to compare weeks with friends.</Empty>
      ) : !friends.data ? (
        <Empty>Your friends could not be loaded.</Empty>
      ) : rows.length < 2 ? (
        <Empty>Add friends to compare your weeks.</Empty>
      ) : compact ? (
        <View style={{ gap: 2 }}>
          <Text style={[type.caption, { color: colors.muted }]}>Your rank</Text>
          <Text style={[styles.value, type.number, { color: colors.text }]}>
            {ordinal(yourRank)}
            <Text style={[type.caption, { color: colors.muted }]}> of {rows.length}</Text>
          </Text>
          {!!summary && <Text style={[type.caption, { color: colors.secondary }]}>{summary}</Text>}
        </View>
      ) : (
        <View>
          {rows.map((row) => {
            const days = `${row.days} ${row.days === 1 ? 'day' : 'days'}`;
            // B3: a friend's photo shows a dot while they're online or working out, as on the web.
            const status = row.friend ? presenceStatus(row.friend.presence) : null;
            const live = status && status.kind !== 'away' ? presenceText(status) : null;
            const content = (
              <>
                <Text style={[type.footnote, type.number, styles.rank, { color: colors.muted }]}>
                  {rank(row.days)}
                </Text>
                {row.is_you ? (
                  <ProfilePhoto user={user} size={28} />
                ) : (
                  <Avatar person={row} size={28} status={status} />
                )}
                <Text
                  style={[
                    type.footnote,
                    { flex: 1, color: colors.text, fontWeight: row.is_you ? '700' : '500' },
                  ]}
                  numberOfLines={1}
                >
                  {row.is_you ? 'You' : row.display_name}
                </Text>
                <Text style={[type.footnote, type.number, { color: colors.text }]}>{days}</Text>
              </>
            );
            return row.friend ? (
              <Pressable
                key={row.id}
                accessibilityRole="button"
                accessibilityLabel={[`${rank(row.days)}. ${row.display_name}`, live, days]
                  .filter(Boolean)
                  .join(', ')}
                onPress={() => router.push(socialRoutes.profile(row.id))}
                style={({ pressed }) => [styles.boardRow, pressed && { opacity: 0.6 }]}
              >
                {content}
              </Pressable>
            ) : (
              <View
                key={row.id}
                accessible
                accessibilityLabel={`${rank(row.days)}. You, ${days}`}
                style={[styles.boardRow, { backgroundColor: colors.accentSoft, borderRadius: 10 }]}
              >
                {content}
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  headline: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  value: { fontSize: 24, fontWeight: '700', letterSpacing: -0.3 },
  chip: {
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  between: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  distanceName: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rank: { width: 16, textAlign: 'center' },
  boardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
});
