import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { muscleSetGoal, type MuscleSetGoals } from '../../../../frontend/src/muscleSetGoals';
import { POPUP_MS } from '../../../../frontend/src/popupTiming';
import type { WeeklySetGain } from '../../../../frontend/src/weeklySetsUpdate';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';

export interface WeeklySetsUpdate {
  /** Each logged set's changes get a new id, which restarts the countdown. */
  id: number;
  gains: WeeklySetGain[];
}

const credits = (value: number) => String(Number(value.toFixed(3)));

/**
 * The weekly sets a logged working set adds to its muscles, as the web's shelf shows them: one
 * column per muscle with its new total against the goal. It folds away after a few seconds;
 * touching it keeps it up, and a second touch closes it.
 */
export function WeeklySetsShelf({
  update,
  goal,
  goals,
  bottom,
  onDismiss,
}: {
  update: WeeklySetsUpdate;
  goal: number;
  goals?: MuscleSetGoals;
  bottom: number;
  onDismiss: () => void;
}) {
  const { colors, type, radius } = useTheme();
  // Keyed to the update, so a newly logged set lets go of a hold and restarts the countdown.
  const [heldFor, setHeldFor] = useState<number | null>(null);
  const held = heldFor === update.id;
  useEffect(() => {
    if (held) return;
    const timer = setTimeout(onDismiss, POPUP_MS.standard);
    return () => clearTimeout(timer);
  }, [update.id, held, onDismiss]);

  const summary = update.gains
    .map(
      (item) =>
        `${item.muscle} ${credits(item.after)} of ${credits(muscleSetGoal(item.muscle, goal, goals))} weekly sets, up ${credits(item.gain)}`,
    )
    .join('. ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={summary}
      accessibilityHint={held ? 'Closes weekly sets' : 'Keeps weekly sets open'}
      accessibilityLiveRegion="polite"
      onPress={() => (held ? onDismiss() : setHeldFor(update.id))}
      style={[
        styles.shelf,
        { bottom, backgroundColor: colors.surface3, borderRadius: radius.card },
      ]}
    >
      {update.gains.map((item) => {
        const target = muscleSetGoal(item.muscle, goal, goals);
        const percent = (value: number) =>
          target > 0 ? Math.min(100, (value / target) * 100) : 100;
        const met = item.after >= target;
        return (
          <View key={item.muscle} style={styles.cell}>
            <View style={styles.nameRow}>
              <Text
                style={[type.caption, { color: colors.secondary, flexShrink: 1 }]}
                numberOfLines={1}
              >
                {item.muscle}
              </Text>
              <Text
                style={[type.caption, type.number, { color: colors.accentText, fontWeight: '700' }]}
              >
                +{credits(item.gain)}
              </Text>
            </View>
            <View style={styles.valueRow}>
              <Text style={[type.headline, type.number, { color: colors.text }]}>
                {credits(item.after)}
              </Text>
              <Text style={[type.caption, type.number, { color: colors.muted }]}>
                /{credits(target)}
              </Text>
              {met && <Icon name="check" size={12} color={colors.good} />}
            </View>
            <View style={[styles.bar, { backgroundColor: colors.surface2 }]}>
              <View
                style={[
                  styles.fill,
                  { width: `${percent(item.before)}%`, backgroundColor: colors.lineStrong },
                ]}
              />
              <View
                style={[
                  styles.fill,
                  {
                    left: `${percent(item.before)}%`,
                    width: `${percent(item.after) - percent(item.before)}%`,
                    backgroundColor: met ? colors.good : colors.accent,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shelf: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 7,
  },
  cell: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'space-between' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 4 },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
