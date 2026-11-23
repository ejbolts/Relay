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
  joined,
  onDismiss,
}: {
  update: WeeklySetsUpdate;
  goal: number;
  goals?: MuscleSetGoals;
  /** Sits on top of the rest pill: square bottom corners and no bottom outline, as one card. */
  joined: boolean;
  onDismiss: () => void;
}) {
  const { colors, type } = useTheme();
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
        {
          backgroundColor: colors.surface,
          borderColor: colors.lineStrong,
          shadowColor: colors.shadow,
        },
        joined && styles.joined,
      ]}
    >
      {update.gains.map((item, index) => {
        const target = muscleSetGoal(item.muscle, goal, goals);
        const percent = (value: number) =>
          target > 0 ? Math.min(100, (value / target) * 100) : 100;
        const met = item.after >= target;
        return (
          <View
            key={item.muscle}
            style={[
              styles.cell,
              index > 0 && { borderLeftWidth: 1, borderLeftColor: colors.lineStrong },
            ]}
          >
            <View style={styles.nameRow}>
              <Text
                style={[type.caption, { color: colors.secondary, flexShrink: 1 }]}
                numberOfLines={1}
              >
                {item.muscle}
              </Text>
              <View
                style={[
                  styles.gain,
                  { backgroundColor: met ? `${colors.good}29` : colors.accentSoft },
                ]}
              >
                <Text
                  style={[
                    styles.gainText,
                    type.number,
                    { color: met ? colors.good : colors.accentText },
                  ]}
                >
                  +{credits(item.gain)}
                </Text>
              </View>
            </View>
            <View style={styles.valueRow}>
              <Text style={[styles.value, type.number, { color: met ? colors.good : colors.text }]}>
                {credits(item.after)}
              </Text>
              <Text style={[type.caption, type.number, { color: colors.muted }]}>
                /{credits(target)}
              </Text>
              {met && (
                <View style={[styles.met, { backgroundColor: colors.good }]}>
                  <Icon name="check" size={10} color={colors.onAccent} />
                </View>
              )}
            </View>
            <View style={[styles.bar, { backgroundColor: colors.surface3 }]}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${percent(item.before)}%`,
                    backgroundColor: met ? colors.good : `${colors.accent}8C`,
                  },
                ]}
              />
              <View
                style={[
                  styles.fill,
                  {
                    left: `${percent(item.before)}%`,
                    width: `${percent(item.after) - percent(item.before)}%`,
                    backgroundColor: met ? colors.good : colors.accentText,
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
  // The web's shelf: one outlined card, a column per muscle split by vertical rules.
  shelf: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  joined: {
    borderBottomWidth: 0,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  cell: { flex: 1, gap: 2, paddingLeft: 12, paddingRight: 10, paddingTop: 10, paddingBottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'space-between' },
  gain: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 1 },
  gainText: { fontSize: 11, fontWeight: '800' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  value: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  met: {
    width: 15,
    height: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginLeft: 2,
  },
  bar: { height: 5, borderRadius: 999, overflow: 'hidden', marginTop: 6 },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 999 },
});
