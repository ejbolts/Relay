import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  connectionDetailRows,
  MINIMISE_AFTER_MS,
  nextCheckText,
  offlineNoticeLabel,
  offlineNoticeVisible,
  type ConnectionState,
  type WaitingToSync,
} from '../../../../frontend/src/connectionMonitor';
import {
  connection,
  useConnectionCheck,
  useConnectionReports,
  useConnectionState,
} from '../../data/connectionStatus';
import { Button } from '../../ui/components';
import { Icon, type IconPair } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { bodyCheckInStatus, subscribeBodyCheckIns } from '../body/bodyCheckInQueue';
import { useReduceMotion } from '../settings/devicePreferences';
import { useWorkout } from '../workout/WorkoutProvider';

const cloudOff: IconPair = { sf: 'icloud.slash', md: 'cloud-off' };
const retry: IconPair = { sf: 'arrow.clockwise', md: 'refresh' };

/** The pill shows its message, then shrinks to its icon, as the web's does. */
function useMinimised(offline: boolean) {
  const [minimised, setMinimised] = useState(false);
  const [open, setOpen] = useState(false);
  const [wasOffline, setWasOffline] = useState(offline);
  // The next outage starts with the full message and closed details.
  if (wasOffline !== offline) {
    setWasOffline(offline);
    if (!offline) {
      setMinimised(false);
      setOpen(false);
    }
  }
  useEffect(() => {
    if (!offline) return;
    const timer = setTimeout(() => setMinimised(true), MINIMISE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [offline]);
  return { minimised: offline && minimised, open: offline && open, setOpen };
}

/** Changes saved on this phone that have not reached Relay yet. */
function useWaitingToSync(): WaitingToSync {
  const workouts = useWorkout().queue.waiting;
  const checkIns = useSyncExternalStore(subscribeBodyCheckIns, () => bodyCheckInStatus().pending);
  return { workouts, checkIns };
}

/**
 * The web's offline notice: once an outage has lasted it floats at the top, says what is wrong,
 * shrinks to an icon that opens the details, and confirms when the app is back. It sits clear of
 * the tab bar, the live workout bar and toasts, which are all at the bottom.
 */
export function OfflineNotice() {
  useConnectionReports(useQueryClient());
  const state = useConnectionState();
  const offline = state.phase === 'offline';
  const label = offlineNoticeLabel(state);
  const visible = offlineNoticeVisible(state);
  const { minimised, open, setOpen } = useMinimised(offline);
  const insets = useSafeAreaInsets();
  const { colors, type, scheme } = useTheme();
  const reduced = useReduceMotion();
  const [shown] = useState(() => new Animated.Value(0));
  const waiting = useWaitingToSync();

  // Screen readers hear each change: the outage, its cause, and coming back.
  useEffect(() => {
    if (visible) AccessibilityInfo.announceForAccessibility(label);
  }, [visible, label]);

  // A short fade in each time it appears.
  useEffect(() => {
    if (!visible) return;
    shown.setValue(reduced ? 1 : 0);
    if (!reduced)
      Animated.timing(shown, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [visible, reduced, shown]);

  if (!visible) return null;
  const back = state.phase === 'back';
  const surface = scheme === 'light' ? colors.surfaceRaised : colors.surface2;
  const pillLook = [
    styles.pill,
    {
      backgroundColor: back ? colors.goodSoft : surface,
      borderColor: back ? colors.good : colors.lineStrong,
      boxShadow: `0 8px 32px ${colors.shadow}`,
    },
    minimised && styles.pillMinimised,
  ];
  const content = (
    <>
      <Icon name={back ? 'check' : cloudOff} size={20} color={back ? colors.good : colors.muted} />
      {!minimised && (
        <Text
          style={[type.footnote, { color: colors.text, fontWeight: '700' }]}
          numberOfLines={1}
          importantForAccessibility="no"
        >
          {label}
        </Text>
      )}
    </>
  );
  return (
    <>
      {/* Open details close with a tap anywhere else, as on the web. */}
      {open && (
        <Pressable
          style={StyleSheet.absoluteFill}
          accessible={false}
          onPress={() => setOpen(false)}
        />
      )}
      <Animated.View
        pointerEvents="box-none"
        style={[styles.wrap, { top: insets.top + 8, opacity: shown }]}
      >
        {back ? (
          <View accessible accessibilityLabel={label} style={pillLook}>
            {content}
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen(!open)}
            style={({ pressed }) => [pillLook, pressed && { opacity: 0.8 }]}
          >
            {content}
          </Pressable>
        )}
        {open && <Details label={label} state={state} waiting={waiting} surface={surface} />}
      </Animated.View>
    </>
  );
}

function Details({
  label,
  state,
  waiting,
  surface,
}: {
  label: string;
  state: ConnectionState;
  waiting: WaitingToSync;
  surface: string;
}) {
  const { colors, type, radius } = useTheme();
  const progress = useConnectionCheck();
  const [now, setNow] = useState(() => Date.now());
  // The countdown ticks only while the details are open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const next = nextCheckText(progress, now);
  return (
    <View
      accessibilityLabel="Connection details"
      style={[
        styles.details,
        {
          backgroundColor: surface,
          borderColor: colors.lineStrong,
          borderRadius: radius.toast,
          boxShadow: `0 12px 40px ${colors.shadow}`,
        },
      ]}
    >
      <View style={styles.title}>
        <Icon name={cloudOff} size={20} color={colors.muted} />
        <Text
          accessibilityRole="header"
          style={[type.callout, { color: colors.text, fontWeight: '700' }]}
        >
          {label}
        </Text>
      </View>
      {connectionDetailRows(state, waiting, now).map((row) => {
        const tone = row.state === 'bad' ? colors.danger : row.state === 'ok' ? colors.good : null;
        return (
          <View
            key={row.label}
            accessible
            accessibilityLabel={`${row.label}: ${row.value}`}
            style={[styles.row, { borderTopColor: colors.line }]}
          >
            <Text style={[type.footnote, { color: colors.muted }]}>{row.label}</Text>
            <View style={styles.value}>
              {tone && <View style={[styles.dot, { backgroundColor: tone }]} />}
              <Text style={[type.footnote, { color: tone ?? colors.text, fontWeight: '600' }]}>
                {row.value}
              </Text>
            </View>
          </View>
        );
      })}
      <View style={styles.actions}>
        <Text style={[type.caption, { color: colors.muted, flex: 1 }]}>{next}</Text>
        <Button
          label="Try now"
          icon={retry}
          size="small"
          disabled={progress.checking}
          onPress={connection.checkConnectionNow}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', gap: 8 },
  pill: {
    height: 44,
    maxWidth: 320,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 16,
    borderWidth: 1,
    borderRadius: 999,
  },
  // Just the icon, still a 44 pt target.
  pillMinimised: { width: 44, paddingLeft: 0, paddingRight: 0, justifyContent: 'center' },
  details: { width: '100%', maxWidth: 320, borderWidth: 1, padding: 14, paddingBottom: 12 },
  title: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  value: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
});
