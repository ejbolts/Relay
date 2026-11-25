import { Pressable, StyleSheet, Text, View } from 'react-native';
import { nextSetAfterRest, restOvertimeLabel } from '../../../../frontend/src/restComplete';
import { restTimerProgress } from '../../../../frontend/src/restProgress';
import { formatSeconds } from '../../../../frontend/src/utils';
import type { WeightUnit } from '../../../../frontend/src/weightUnits';
import { haptics } from '../../ui/haptics';
import { Icon, type IconName, type IconPair } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import type { LoggerState } from './loggerState';
import { restSecondsLeft, type RestState } from './restTimer';

const ADJUST_SECONDS = 30;
const SKIP_BACK: IconPair = { sf: 'gobackward.30', md: 'replay-30' };
const SKIP_FORWARD: IconPair = { sf: 'goforward.30', md: 'forward-30' };

/**
 * The rest after a logged set, docked at the bottom of the logger as the web's rest pill: pause
 * or play (the workout and its rest together), the countdown, end, -30, +30 and hide. A hidden
 * rest tucks into a small notch on the bottom edge. After the rest, "Rest complete" shows the
 * next set until it is logged or dismissed.
 */
export function RestBar({
  rest,
  state,
  weightUnit,
  hidden,
  joined,
  onTogglePause,
  onAdjust,
  onSkip,
  onHide,
  onShow,
  onDismissDone,
}: {
  rest: RestState;
  state: LoggerState;
  weightUnit: WeightUnit;
  /** Tucked into the notch. */
  hidden: boolean;
  /** The weekly sets shelf sits on top, so the pill squares its top corners to join it. */
  joined: boolean;
  onTogglePause: () => void;
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
  onHide: () => void;
  onShow: () => void;
  onDismissDone: () => void;
}) {
  const { colors, type } = useTheme();
  const now = useNow(rest.timer ? 1000 : 5000);
  if (!rest.timer && !rest.done) return null;
  const pill = [
    styles.pill,
    {
      backgroundColor: colors.surface,
      borderColor: colors.lineStrong,
      shadowColor: colors.shadow,
    },
    joined && styles.joined,
  ];

  if (rest.timer) {
    const left = restSecondsLeft(rest.timer, now);
    const paused = state.pause.pausedAt !== null || rest.timer.pausedLeft !== null;
    const time = formatSeconds(left);
    if (hidden)
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Show ${paused ? 'paused ' : ''}rest timer, ${time} left`}
          onPress={() => {
            haptics.tap();
            onShow();
          }}
          style={[
            styles.notch,
            {
              backgroundColor: colors.surface,
              borderColor: colors.lineStrong,
              shadowColor: colors.shadow,
            },
          ]}
        >
          <Icon name={paused ? 'pause' : 'timer'} size={16} color={colors.accentText} />
          <Text style={[styles.notchTime, type.number, { color: colors.text }]}>{time}</Text>
          <Icon name="chevronUp" size={14} color={colors.muted} />
        </Pressable>
      );
    const verb = paused ? 'Resume' : 'Pause';
    return (
      <View style={pill} accessibilityRole="none">
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(restTimerProgress(left, rest.timer.totalSeconds) * 100)}%`,
              backgroundColor: colors.accentSoft,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${verb} workout and rest timer`}
          onPress={() => {
            haptics.selection();
            onTogglePause();
          }}
          style={({ pressed }) => [
            styles.round,
            { backgroundColor: colors.accent },
            pressed && styles.pressed,
          ]}
        >
          <Icon name={paused ? 'play' : 'pause'} size={18} color={colors.onAccent} />
        </Pressable>
        <Text
          accessibilityRole="timer"
          accessibilityLabel={`Rest timer ${time}${paused ? ', paused' : ''}`}
          style={[styles.time, type.number, { color: colors.text }]}
        >
          {time}
        </Text>
        <PillButton
          icon="close"
          size={16}
          color={colors.muted}
          accessibilityLabel="End rest timer"
          onPress={onSkip}
        />
        <View style={{ flex: 1 }} />
        <PillButton
          icon={SKIP_BACK}
          size={24}
          color={colors.accentText}
          accessibilityLabel={`Take ${ADJUST_SECONDS} seconds off the rest`}
          onPress={() => onAdjust(-ADJUST_SECONDS)}
        />
        <PillButton
          icon={SKIP_FORWARD}
          size={24}
          color={colors.accentText}
          accessibilityLabel={`Add ${ADJUST_SECONDS} seconds to the rest`}
          onPress={() => onAdjust(ADJUST_SECONDS)}
        />
        <PillButton
          icon="chevronDown"
          size={18}
          color={colors.muted}
          accessibilityLabel="Hide rest timer"
          onPress={onHide}
        />
      </View>
    );
  }

  const done = rest.done!;
  const next = nextSetAfterRest(state.movements, done.movementKey, weightUnit);
  return (
    <View style={[pill, styles.done]} accessibilityLiveRegion="polite">
      <View style={[styles.doneMark, { backgroundColor: colors.goodSoft }]}>
        <Icon name="check" size={16} color={colors.good} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.callout, { color: colors.text, fontWeight: '700' }]} numberOfLines={1}>
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
      <PillButton
        icon="close"
        size={16}
        color={colors.muted}
        accessibilityLabel="Dismiss rest complete"
        onPress={onDismissDone}
      />
    </View>
  );
}

function PillButton({
  icon,
  size,
  color,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName | IconPair;
  size: number;
  color: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.round, pressed && styles.pressed]}
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The web's 56 pt rest pill: one row, a line-strong outline and a drop shadow.
  pill: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderRadius: 28,
    overflow: 'hidden',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  joined: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  done: { height: undefined, minHeight: 56, gap: 10, paddingLeft: 10, paddingVertical: 6 },
  doneMark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  time: {
    paddingLeft: 10,
    paddingRight: 2,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  notch: {
    alignSelf: 'center',
    minWidth: 52,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 22,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  notchTime: { fontSize: 14, fontWeight: '800' },
});
