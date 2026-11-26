import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { prettyDate } from '../../../../frontend/src/appShared';
import { hasCardioMetrics } from '../../../../frontend/src/cardioForm';
import {
  CARDIO_HISTORY_FILTERS,
  CARDIO_HISTORY_WEEKS_PER_PAGE,
  cardioDeletion,
  cardioSessionContextLabel,
  cardioSessionsPerWorkout,
  cardioSessionEnergy,
  cardioSessionPerformance,
  filterCardioHistory,
  type CardioDeletion,
  type CardioHistoryFilter,
} from '../../../../frontend/src/cardioHistory';
import {
  CARDIO_TREND_METRICS,
  cardioTrendSelection,
  formatCardioAmount,
  groupCardioHistory,
  type CardioTrendMetricKey,
} from '../../../../frontend/src/cardioTrend';
import { weekStartDayFrom } from '../../../../frontend/src/trainingSummary';
import type { CardioOverview, CardioSession } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { refreshTraining, useWeightUnit } from '../../data/queries';
import { Button, Card, CardHeader, errorMessage } from '../../ui/components';
import { OFFLINE_MESSAGE, waitingForNetwork } from '../../data/offline';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { showToast } from '../../ui/Toast';
import { CardioAllStats } from '../cardio/CardioAllStats';
import { deleteCardioEntry } from '../cardio/cardioData';
import { openCardioImportMenu } from '../cardio/cardioScreenshotImport';
import { CardioShareSheet } from '../cardio/CardioShareSheet';
import { chartNeutral } from './contrast';
import { trainingIcons } from './icons';
import { Chip, Divider, MoreButton, Note, Segmented } from './parts';
import { useCardioOverview } from './trainingQueries';
import { haptics } from '../../ui/haptics';

const shortDay = (value: string) =>
  new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });

/** Cardio: the weekly trend, the session history and the weekly zone goals, as on the web. */
export function CardioSection() {
  const overview = useCardioOverview();
  const router = useRouter();
  const openingMenu = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (waitingForNetwork(overview))
    return (
      <Note
        action={
          <Button label="Try again" variant="secondary" onPress={() => void overview.refetch()} />
        }
      >
        {OFFLINE_MESSAGE}
      </Note>
    );
  if (overview.isPending) return <Note>Loading cardio…</Note>;
  if (overview.isError)
    return (
      <Note
        action={
          <Button label="Try again" variant="secondary" onPress={() => void overview.refetch()} />
        }
      >
        Could not load cardio.
      </Note>
    );
  async function openImport() {
    if (openingMenu.current) return;
    openingMenu.current = true;
    try {
      await openCardioImportMenu(
        (source) => router.push({ pathname: '/cardio/log', params: { import: source } }),
        () => mounted.current,
      );
    } finally {
      openingMenu.current = false;
    }
  }
  return (
    <View style={{ gap: 20 }}>
      {/* The web's two actions, side by side: log by hand, or read a watch screenshot. */}
      <View style={styles.actions}>
        <Button
          label="Log session"
          icon="plus"
          style={styles.action}
          onPress={() => router.push('/cardio/log')}
        />
        <Button
          label="Import screenshot"
          variant="secondary"
          icon={{ sf: 'camera', md: 'photo-camera' }}
          style={styles.action}
          onPress={() => void openImport()}
        />
      </View>
      <CardioTrend overview={overview.data} />
      <CardioHistory overview={overview.data} />
      <ZoneGoals overview={overview.data} />
    </View>
  );
}

function CardioTrend({ overview }: { overview: CardioOverview }) {
  const { colors, type } = useTheme();
  const [metricKey, setMetricKey] = useState<CardioTrendMetricKey>('time');
  const [selectedStart, setSelectedStart] = useState<string | null>(null);
  const [distanceKey, setDistanceKey] = useState<string | null>(null);
  const view = cardioTrendSelection(
    overview.sessions,
    overview.current_week.week_start,
    localDate(),
    metricKey,
    selectedStart,
    distanceKey,
  );
  const { selected, metric, value, difference, maximum } = view;
  // The web's grey bars, darkened where needed to keep 3:1 on the card.
  const neutral = chartNeutral(colors);
  return (
    <Card accessibilityLabel="Weekly cardio trend">
      <Segmented
        accessibilityLabel="Cardio trend metric"
        values={CARDIO_TREND_METRICS.map((item) => item.label)}
        selectedIndex={CARDIO_TREND_METRICS.findIndex((item) => item.key === metricKey)}
        onChange={(index) => setMetricKey(CARDIO_TREND_METRICS[index].key)}
      />
      {metricKey === 'distance' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8 }}
          accessibilityLabel="Distance activity"
        >
          {view.distanceGroups.map((group) => (
            <Chip
              key={group.key}
              label={group.label}
              selected={view.distanceGroup?.key === group.key}
              onPress={() => setDistanceKey(group.key)}
            />
          ))}
        </ScrollView>
      )}
      <View accessibilityLiveRegion="polite" style={{ gap: 2 }}>
        <Text style={[type.caption, styles.kicker, { color: colors.muted }]}>
          {(
            `${selected.start === overview.current_week.week_start ? 'This week' : 'Week'} · ` +
            `${shortDay(selected.start)} – ${shortDay(selected.end)}`
          ).toUpperCase()}
        </Text>
        <Text style={[type.largeTitle, type.number, { color: colors.text }]}>
          {value === null ? '—' : formatCardioAmount(value)}
          <Text style={[type.headline, { color: colors.muted }]}>
            {' '}
            {'suffix' in metric ? `${metric.unit} ${metric.suffix}` : metric.unit}
          </Text>
        </Text>
        <Text style={[type.footnote, { color: colors.secondary }]}>
          {selected.sessions} {selected.sessions === 1 ? 'session' : 'sessions'}
          {difference !== null &&
            ` · ${
              Math.abs(difference) < 0.05
                ? 'No change'
                : `${difference > 0 ? '↑' : '↓'} ${formatCardioAmount(Math.abs(difference))} ${metric.unit}`
            } vs previous week`}
        </Text>
      </View>
      <View style={styles.bars} accessibilityLabel="Last eight weeks">
        {view.weeks.slice(1).map((week) => {
          const amount = week[metricKey];
          const active = selected.start === week.start;
          return (
            <Pressable
              key={week.start}
              accessibilityRole="button"
              accessibilityLabel={`Week of ${shortDay(week.start)}: ${amount === null ? 'not logged' : `${formatCardioAmount(amount)} ${metric.unit}`}`}
              accessibilityState={{ selected: active }}
              onPress={() => {
                haptics.selection();
                setSelectedStart(week.start);
              }}
              style={styles.barColumn}
            >
              {/* The web's bars: grey weeks and the chosen one in accent, on a baseline. */}
              <View style={[styles.track, { borderBottomColor: colors.line }]}>
                <View
                  style={[
                    styles.bar,
                    amount === null
                      ? {
                          height: '4%',
                          borderWidth: 1,
                          borderStyle: 'dashed',
                          borderColor: colors.muted,
                        }
                      : {
                          height: `${Math.max(3, (amount / maximum) * 100)}%`,
                          backgroundColor: active ? colors.accent : neutral,
                        },
                  ]}
                />
              </View>
              <Text
                style={[type.caption, { color: active ? colors.text : colors.muted, fontSize: 10 }]}
                numberOfLines={1}
              >
                {shortDay(week.start)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.weekStats}>
        <WeekStat
          label="Avg HR"
          value={selected.heartRate === null ? '—' : `${Math.round(selected.heartRate)} bpm`}
        />
        <WeekStat label="Avg MET" value={selected.mets === null ? '—' : selected.mets.toFixed(1)} />
        <WeekStat
          label={metricKey === 'time' ? (view.distanceGroup?.label ?? 'Distance') : 'Time'}
          value={
            metricKey === 'time'
              ? view.selectedDistance === null
                ? '—'
                : `${formatCardioAmount(view.selectedDistance)} km`
              : `${formatCardioAmount(selected.time)} min`
          }
        />
      </View>
      <CardioAllStats periods={overview.energy_periods} weekEnd={overview.current_week.week_end} />
    </Card>
  );
}

function WeekStat({ label, value }: { label: string; value: string }) {
  const { colors, radius, type } = useTheme();
  return (
    <View style={[styles.weekStat, { backgroundColor: colors.surface2, borderRadius: radius.md }]}>
      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[type.callout, type.number, { color: colors.text, fontWeight: '700' }]}>
        {value}
      </Text>
    </View>
  );
}

function CardioHistory({ overview }: { overview: CardioOverview }) {
  const { colors, type } = useTheme();
  const [filter, setFilter] = useState<CardioHistoryFilter>('all');
  const [weeks, setWeeks] = useState(CARDIO_HISTORY_WEEKS_PER_PAGE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<CardioSession | null>(null);
  const client = useQueryClient();
  const sessions = filterCardioHistory(overview.sessions, filter);
  // Deleting a session deletes its workout only when that is all the workout holds.
  const perWorkout = cardioSessionsPerWorkout(overview.sessions);
  const remove = (session: CardioSession, deletion: CardioDeletion) =>
    Alert.alert(
      'Delete session?',
      `Delete ${session.activity_type} on ${prettyDate(session.session_date)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete session',
          style: 'destructive',
          onPress: () =>
            void deleteCardioEntry(deletion).then(
              () => {
                setOpenId(null);
                void refreshTraining(client);
                showToast('Session deleted');
              },
              (reason) => showToast(errorMessage(reason), undefined, { variant: 'error' }),
            ),
        },
      ],
    );
  const groups = groupCardioHistory(sessions, weekStartDayFrom(overview.current_week.week_start));
  return (
    <Card accessibilityLabel="Cardio history">
      <CardHeader title="History" />
      <Segmented
        accessibilityLabel="Filter cardio history"
        values={CARDIO_HISTORY_FILTERS.map(([, label]) => label)}
        selectedIndex={CARDIO_HISTORY_FILTERS.findIndex(([value]) => value === filter)}
        onChange={(index) => {
          setFilter(CARDIO_HISTORY_FILTERS[index][0]);
          setWeeks(CARDIO_HISTORY_WEEKS_PER_PAGE);
        }}
      />
      {sessions.length === 0 && <Note>No cardio sessions match this filter.</Note>}
      {groups.slice(0, weeks).map((group) => (
        <View key={group.start} style={{ gap: 2 }}>
          <View style={styles.weekHeader}>
            <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600', flex: 1 }]}>
              Week of {prettyDate(group.start)}
            </Text>
            <Text style={[type.footnote, type.number, { color: colors.secondary }]}>
              {group.sessions.reduce((total, item) => total + item.duration_minutes, 0)} min
            </Text>
          </View>
          {group.sessions.map((session, index) => (
            <View key={session.id}>
              {index > 0 && <Divider inset={44} />}
              <CardioRow
                session={session}
                open={openId === session.id}
                onToggle={() => setOpenId(openId === session.id ? null : session.id)}
                onShare={() => setSharing(session)}
                onDelete={(() => {
                  const deletion = cardioDeletion(session, perWorkout);
                  return deletion ? () => remove(session, deletion) : undefined;
                })()}
              />
            </View>
          ))}
        </View>
      ))}
      {groups.length > weeks && (
        <MoreButton
          label="Show earlier weeks"
          onPress={() => setWeeks(weeks + CARDIO_HISTORY_WEEKS_PER_PAGE)}
        />
      )}
      {sharing && <CardioShareSheet session={sharing} onClose={() => setSharing(null)} />}
    </Card>
  );
}

function CardioRow({
  session,
  open,
  onToggle,
  onShare,
  onDelete,
}: {
  session: CardioSession;
  open: boolean;
  onToggle: () => void;
  onShare: () => void;
  /** Absent for a session inside a workout, which is removed in that workout. */
  onDelete?: () => void;
}) {
  const { colors, type } = useTheme();
  const unit = useWeightUnit();
  const router = useRouter();
  const linked = session.source_workout_id;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${session.activity_type}, ${prettyDate(session.session_date)}, ${session.duration_minutes} minutes`}
        onPress={() => {
          haptics.selection();
          onToggle();
        }}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
      >
        <View style={[styles.activityIcon, { backgroundColor: colors.accentSoft }]}>
          <Icon name={trainingIcons.heart} size={16} color={colors.accentText} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
            {session.activity_type}
          </Text>
          <Text style={[type.caption, { color: colors.secondary }]} numberOfLines={1}>
            {prettyDate(session.session_date)} · {cardioSessionContextLabel(session)}
          </Text>
        </View>
        <Text style={[type.callout, type.number, { color: colors.text, fontWeight: '600' }]}>
          {session.duration_minutes} min
        </Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={12} color={colors.muted} />
      </Pressable>
      {open && (
        <View style={styles.rowDetail}>
          <Text style={[type.footnote, { color: colors.secondary }]}>
            {cardioSessionEnergy(session, unit)}
          </Text>
          <Text style={[type.footnote, { color: colors.secondary }]}>
            {cardioSessionPerformance(session)}
          </Text>
          <View style={styles.rowActions}>
            <Button label="Share card" variant="link" onPress={onShare} />
            <Button
              label={hasCardioMetrics(session) ? 'Edit metrics' : 'Log metrics'}
              variant="link"
              onPress={() =>
                router.push({ pathname: '/cardio/metrics/[id]', params: { id: session.id } })
              }
            />
            <Button
              label="Edit"
              variant="link"
              accessibilityLabel={
                linked
                  ? `Edit ${session.activity_type} on ${session.session_date} in its workout`
                  : undefined
              }
              // A session inside a workout is edited there, as on the web.
              onPress={() =>
                linked
                  ? router.push({ pathname: '/edit-workout/[id]', params: { id: linked } })
                  : router.push({ pathname: '/cardio/edit/[id]', params: { id: session.id } })
              }
            />
            {!!linked && (
              <Button
                label="Open workout"
                variant="link"
                onPress={() =>
                  router.push({
                    pathname: '/training/session/[id]',
                    params: { id: linked },
                  })
                }
              />
            )}
            {onDelete && <Button label="Delete" variant="link" onPress={onDelete} />}
          </View>
        </View>
      )}
    </View>
  );
}

function ZoneGoals({ overview }: { overview: CardioOverview }) {
  const { colors, radius, type } = useTheme();
  const router = useRouter();
  const zones = overview.cardio_preferences?.heart_rate_zones ?? [];
  const zonesSet = zones.length > 0;
  const goals = overview.goal_weeks ?? [{ zone: 2, ...overview.current_week }];
  return (
    <Card accessibilityLabel="Weekly zone goals">
      <CardHeader
        title="Weekly zone goals"
        action={
          <Button label="Edit zones" variant="link" onPress={() => router.push('/cardio/zones')} />
        }
      />
      {goals.map((goal, index) => {
        const range = zones.find((item) => item.zone === goal.zone);
        const share = zonesSet
          ? Math.min(1, goal.completed_minutes / Math.max(goal.goal_minutes, 1))
          : 0;
        return (
          <View key={goal.zone} style={{ gap: 8 }}>
            {index > 0 && <Divider />}
            <View style={styles.goal}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
                  Zone {goal.zone}
                </Text>
                {range && (
                  <Text style={[type.caption, { color: colors.muted }]}>
                    {range.min_bpm}–{range.max_bpm} bpm
                  </Text>
                )}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text
                  style={[type.callout, type.number, { color: colors.text, fontWeight: '700' }]}
                >
                  {zonesSet ? goal.completed_minutes : '–'} / {goal.goal_minutes} min
                </Text>
                {zonesSet && (
                  <Text
                    style={[
                      type.caption,
                      { color: goal.complete ? colors.good : colors.secondary },
                    ]}
                  >
                    {goal.complete ? 'Goal reached' : `${goal.remaining_minutes} min to go`}
                  </Text>
                )}
              </View>
            </View>
            {zonesSet && (
              <View
                style={[
                  styles.goalTrack,
                  {
                    backgroundColor: colors.surface2,
                    borderRadius: radius.pill,
                  },
                ]}
              >
                <View
                  style={{
                    width: `${share * 100}%`,
                    height: '100%',
                    borderRadius: radius.pill,
                    backgroundColor: goal.complete ? colors.good : colors.accent,
                  }}
                />
              </View>
            )}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, paddingHorizontal: 10 },
  kicker: { fontWeight: '600', letterSpacing: 0.6 },
  bars: { flexDirection: 'row', gap: 4, height: 136, alignItems: 'flex-end' },
  barColumn: { flex: 1, alignItems: 'center', gap: 6, height: '100%' },
  track: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderBottomWidth: 1,
  },
  bar: { width: '65%', borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  weekStats: { flexDirection: 'row', gap: 8 },
  weekStat: { flex: 1, gap: 4, paddingHorizontal: 11, paddingVertical: 10 },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDetail: { paddingLeft: 44, paddingBottom: 12, gap: 4 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 2 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  goalTrack: { height: 6, overflow: 'hidden' },
});
