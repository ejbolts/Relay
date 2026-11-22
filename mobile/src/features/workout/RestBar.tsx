import { Pressable, StyleSheet, Text, View } from 'react-native';
import { nextSetAfterRest, restOvertimeLabel } from '../../../../frontend/src/restComplete';
import { formatSeconds } from '../../../../frontend/src/utils';
import type { WeightUnit } from '../../../../frontend/src/weightUnits';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import type { LoggerState } from './loggerState';
import { restSecondsLeft, type RestState } from './restTimer';

/**
 * The rest after a logged set, docked at the bottom of the logger: a countdown with -30 s, +30 s
 * and Skip, then "Rest complete" with the next set until it is logged or dismissed.
 */
export function RestBar({
  rest,
  state,
  weightUnit,
  bottom,
  onAdjust,
  onSkip,
  onDismissDone,
}: {
  rest: RestState;
  state: LoggerState;
  weightUnit: WeightUnit;
  bottom: number;
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
  onDismissDone: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const now = useNow(rest.timer ? 1000 : 5000);
  if (!rest.timer && !rest.done) return null;
  const panel = [
    styles.panel,
    { bottom, backgroundColor: colors.surface3, borderRadius: radius.card },
  ];

  if (rest.timer) {
    const left = restSecondsLeft(rest.timer, now);
    const fraction = rest.timer.totalSeconds > 0 ? left / rest.timer.totalSeconds : 0;
    const paused = rest.timer.pausedLeft !== null;
    return (
      <View style={panel} accessibilityLabel={`Rest ${formatSeconds(left)} left`}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(Math.min(1, fraction) * 100)}%`,
              backgroundColor: colors.accentSoft,
            },
          ]}
        />
        <Icon name="timer" size={18} color={colors.accentText} />
        <View style={{ flex: 1 }}>
          <Text style={[type.caption, { color: colors.muted }]}>
            {paused ? 'Rest paused' : 'Rest'}
          </Text>
          <Text style={[type.title, type.number, { color: colors.text }]}>
            {formatSeconds(left)}
          </Text>
        </View>
        <RestButton
          label="−30"
          accessibilityLabel="Take 30 seconds off the rest"
          onPress={() => onAdjust(-30)}
        />
        <RestButton
          label="+30"
          accessibilityLabel="Add 30 seconds to the rest"
          onPress={() => onAdjust(30)}
        />
        <RestButton label="Skip" accessibilityLabel="Skip rest" onPress={onSkip} strong />
      </View>
    );
  }

  const done = rest.done!;
  const next = nextSetAfterRest(state.movements, done.movementKey, weightUnit);
  return (
    <View style={panel} accessibilityLiveRegion="polite">
      <Icon name="check" size={18} color={colors.good} />
      <View style={{ flex: 1 }}>
        <Text style={[type.callout, { color: colors.text, fontWeight: '700' }]}>
          Rest complete{' '}
          <Text style={[type.callout, type.number, { color: colors.muted, fontWeight: '500' }]}>
            {restOvertimeLabel(done.endedAt, now)}
          </Text>
        </Text>
        {next && (
          <Text style={[type.footnote, { color: colors.secondary }]} numberOfLines={1}>
            {[next.exercise, next.set, next.target].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss rest complete"
        hitSlop={8}
        onPress={onDismissDone}
        style={styles.close}
      >
        <Icon name="close" size={16} color={colors.secondary} />
      </Pressable>
    </View>
  );
}

function RestButton({
  label,
  accessibilityLabel,
  onPress,
  strong,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  strong?: boolean;
}) {
  const { colors, type, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: strong ? colors.accent : colors.surface2,
          borderRadius: radius.md,
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text
        style={[type.callout, { color: strong ? colors.onAccent : colors.text, fontWeight: '700' }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  button: {
    minWidth: 48,
    height: 40,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
