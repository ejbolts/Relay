import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  TRAINING_TIME_HELP_BODY,
  TRAINING_TIME_HELP_TITLE,
  TRAINING_TIME_RANGES,
  trainingTimeForRange,
  trainingTimeStats,
  type TrainingTimeRange,
} from '../../../../../frontend/src/trainingTimeDisplay';
import type { TrainingTime } from '../../../../../frontend/src/types';
import { Card } from '../../../ui/components';
import { Segmented } from '../../../ui/controls';
import { haptics } from '../../../ui/haptics';
import { Icon } from '../../../ui/Icon';
import { useTheme } from '../../../ui/theme';
import { socialIcons } from '../icons';

/**
 * Time trained card: all time by default, with a Past year segmented control when the server
 * provides it, and a (?) button explaining how Combined avoids double-counting cardio.
 */
export function ProfileTrainingTimeCard({
  allTime,
  pastYear,
}: {
  allTime: TrainingTime;
  pastYear?: TrainingTime | null;
}) {
  const { colors, radius, type } = useTheme();
  const [range, setRange] = useState<TrainingTimeRange>('all');
  const time = trainingTimeForRange(allTime, pastYear, range);
  const stats = trainingTimeStats(time);

  return (
    <Card accessibilityLabel="Time trained">
      <View style={styles.header}>
        <Text style={[type.eyebrow, { color: colors.accentText }]}>ACTIVITY</Text>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={[type.cardTitle, { color: colors.text }]}>
            Time trained
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="About time trained"
            onPress={() => {
              haptics.tap();
              Alert.alert(TRAINING_TIME_HELP_TITLE, TRAINING_TIME_HELP_BODY);
            }}
            style={({ pressed }) => [styles.helpButton, pressed && { opacity: 0.6 }]}
          >
            <Icon name={socialIcons.info} size={17} color={colors.muted} />
          </Pressable>
        </View>
      </View>
      {pastYear && (
        <Segmented
          accessibilityLabel="Time trained range"
          values={TRAINING_TIME_RANGES.map((option) => option.label)}
          selectedIndex={TRAINING_TIME_RANGES.findIndex((option) => option.value === range)}
          onChange={(index) => setRange(TRAINING_TIME_RANGES[index].value)}
        />
      )}
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            accessible
            accessibilityLabel={
              stat.detail
                ? `${stat.label}: ${stat.value}, ${stat.detail}`
                : `${stat.label}: ${stat.value}`
            }
            style={[styles.statTile, { backgroundColor: colors.surface2, borderRadius: radius.md }]}
          >
            <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
              {stat.label}
            </Text>
            <Text
              style={[styles.statValue, type.number, { color: colors.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {stat.value}
            </Text>
            {!!stat.detail && (
              <Text style={[type.caption, { color: colors.secondary }]} numberOfLines={1}>
                {stat.detail}
              </Text>
            )}
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { gap: 0 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    marginTop: -8,
    marginBottom: -8,
  },
  helpButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stats: { flexDirection: 'row', gap: 10 },
  statTile: { flex: 1, gap: 4, padding: 12 },
  statValue: { fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
});
