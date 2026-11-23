import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { completionRecordDetail } from '../../../../frontend/src/recordLabels';
import { formatVolume } from '../../../../frontend/src/trainingSummary';
import { formatMinutesDuration } from '../../../../frontend/src/utils';
import type { WeightUnit } from '../../../../frontend/src/weightUnits';
import { Button } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import type { QueueStatus } from './finishedQueueSender';
import { loggerIcons } from './icons';
import { RefusedSaveCard } from './RefusedSaveCard';
import type { FinishedView, RefusedSave } from './WorkoutProvider';

const signed = (value: number, text: string) => `${value > 0 ? '+' : ''}${text}`;

/** What the workout just finished came to, and whether it has reached the server yet. */
export function FinishedSummary({
  finished,
  queue,
  refused,
  weightUnit,
  onReview,
  onDiscard,
  onDone,
}: {
  finished: FinishedView;
  queue: QueueStatus;
  /** This workout, when the server refused it. */
  refused: RefusedSave | null;
  weightUnit: WeightUnit;
  onReview: () => void;
  onDiscard: () => void;
  onDone: () => void;
}) {
  const { colors, type, radius, space } = useTheme();
  const insets = useSafeAreaInsets();
  const { summary, savedId, records } = finished;
  const refusal = Object.entries(queue.refusals).find(([key]) => key === finished.sessionId)?.[1];
  const status = savedId
    ? { icon: loggerIcons.synced, text: 'Saved', color: colors.good }
    : refusal
      ? {
          icon: loggerIcons.syncing,
          text: `Not saved: ${refusal}`,
          color: colors.danger,
        }
      : queue.outdated
        ? {
            icon: loggerIcons.syncing,
            text: 'Saved on this phone. Update Relay to sync it.',
            color: colors.secondary,
          }
        : queue.sending
          ? {
              icon: loggerIcons.syncing,
              text: 'Saving…',
              color: colors.secondary,
            }
          : {
              icon: loggerIcons.syncing,
              text: 'Waiting to sync',
              color: colors.secondary,
            };
  const previous = summary.previous;
  const stats = [
    { label: 'Time', value: formatMinutesDuration(summary.durationMinutes) },
    { label: 'Sets', value: String(summary.sets) },
    ...(summary.volumeKg > 0
      ? [{ label: 'Volume', value: formatVolume(summary.volumeKg, weightUnit) }]
      : []),
  ];
  const change =
    previous &&
    [
      summary.sets !== previous.sets &&
        signed(summary.sets - previous.sets, `${summary.sets - previous.sets} sets`),
      summary.volumeKg !== previous.volumeKg &&
        previous.volumeKg > 0 &&
        signed(
          summary.volumeKg - previous.volumeKg,
          formatVolume(summary.volumeKg - previous.volumeKg, weightUnit),
        ),
    ]
      .filter(Boolean)
      .join(' · ');

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.page }}
      contentContainerStyle={{
        padding: space.xl,
        paddingTop: space.xxl,
        paddingBottom: insets.bottom + space.xxl,
        gap: space.lg,
      }}
    >
      <View style={styles.hero}>
        <Icon name={loggerIcons.done} size={56} color={colors.good} />
        <Text accessibilityRole="header" style={[type.largeTitle, { color: colors.text }]}>
          Workout complete
        </Text>
        <Text style={[type.headline, { color: colors.secondary, textAlign: 'center' }]}>
          {summary.name}
        </Text>
      </View>
      <View style={[styles.stats, { backgroundColor: colors.surface, borderRadius: radius.card }]}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={[type.title, type.number, { color: colors.text }]}>{stat.value}</Text>
            <Text style={[type.footnote, { color: colors.muted }]}>{stat.label}</Text>
          </View>
        ))}
      </View>
      {!!change && (
        <Text style={[type.callout, { color: colors.secondary, textAlign: 'center' }]}>
          {change} vs last time
        </Text>
      )}
      {refused ? (
        <RefusedSaveCard save={refused} onReview={onReview} onDiscard={onDiscard} />
      ) : (
        <View style={styles.status} accessibilityLiveRegion="polite">
          <Icon name={status.icon} size={16} color={status.color} />
          <Text style={[type.footnote, { color: status.color, flexShrink: 1 }]}>{status.text}</Text>
        </View>
      )}
      {!!records?.length && (
        <View
          style={[styles.records, { backgroundColor: colors.goldSoft, borderRadius: radius.card }]}
        >
          <View style={styles.recordsTitle}>
            <Icon name="trophy" size={16} color={colors.gold} />
            <Text style={[type.headline, { color: colors.text }]}>
              {records.length === 1 ? 'New record' : `${records.length} new records`}
            </Text>
          </View>
          {records.map((record) => (
            <View key={record.id}>
              <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
                {record.exercise_name}
              </Text>
              <Text style={[type.footnote, { color: colors.secondary }]}>
                {completionRecordDetail(record, weightUnit)}
              </Text>
            </View>
          ))}
        </View>
      )}
      <Button label="Done" onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 6 },
  stats: { flexDirection: 'row', paddingVertical: 16 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  records: { padding: 16, gap: 10 },
  recordsTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
