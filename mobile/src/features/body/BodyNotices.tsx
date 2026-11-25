import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  AppState,
  Dimensions,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  usedMaintenanceRange,
  weightGoalReached,
} from '../../../../frontend/src/bodyMeasurementHistory';
import { TIP_DEFINITIONS } from '../../../../frontend/src/tipDefinitions';
import { hintMayShow, TIP_QUIET_MS } from '../../../../frontend/src/tipScheduling';
import { tipWorkoutCount } from '../../../../frontend/src/tipTriggers';
import type { BodyMeasurement, BodyWeightGoal } from '../../../../frontend/src/types';
import { useDashboard, useWorkoutHistory } from '../../data/queries';
import { Button, Card } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { promptShowing } from '../../ui/prompts';
import { space, useTheme } from '../../ui/theme';
import { sheetShowing } from '../../ui/Sheet';
import { toastShowing } from '../../ui/Toast';
import { tipAnchorLayout } from '../guides/LoggerTips';
import { useTips } from '../guides/tips';
import {
  retryBodyCheckIns,
  useBodyCheckInStatus,
  useBodyCheckInSyncFailed,
} from './BodyCheckInSync';
import { bodyIcons } from './bodyIcons';

const TICK_MS = 500;
/** As the web's, the bottom of the screen is kept for the tab bar. */
const BOTTOM_RESERVED = 75;

/** What the card last announced, shared by every tab's card so switching tabs stays quiet. */
let lastAnnounced: string | null = null;

/**
 * Check-ins saved on this phone that the server hasn't confirmed, as the web's sync card. Shown
 * at the top of every tab, as the web's is; BodyCheckInSync alone owns the queue and its sync.
 */
export function CheckInSyncCard() {
  const { pending, error } = useBodyCheckInStatus();
  const syncFailed = useBodyCheckInSyncFailed();
  useEffect(() => {
    if (pending === 0) lastAnnounced = null;
  }, [pending]);
  return pending === 0 ? null : (
    <CheckInSyncDetails pending={pending} error={error} canRetry={!!error || syncFailed} />
  );
}

function CheckInSyncDetails({
  pending,
  error,
  canRetry,
}: {
  pending: number;
  error: string | null;
  canRetry: boolean;
}) {
  const { colors, type, radius } = useTheme();
  // Every tab keeps its card mounted; only the one on screen speaks.
  const focused = useIsFocused();
  const count = `${pending} ${pending === 1 ? 'check-in' : 'check-ins'} saved on this phone`;
  const message = `${count}. ${error ?? 'Waiting to sync'}`;
  useEffect(() => {
    // Android announces through the live region; iOS has none, so say it, as the web's status.
    if (!focused || Platform.OS !== 'ios' || lastAnnounced === message) return;
    lastAnnounced = message;
    AccessibilityInfo.announceForAccessibility(message);
  }, [focused, message]);
  return (
    <Card accessibilityLabel="Check-in sync" style={{ gap: 8 }}>
      <View accessibilityLiveRegion={focused ? 'polite' : 'none'} style={styles.row}>
        <Icon name={bodyIcons.cloud} size={18} color={colors.secondary} />
        <Text style={[type.callout, { color: colors.text, fontWeight: '600', flex: 1 }]}>
          {count}
        </Text>
        {!error && (
          <Text
            style={[
              type.caption,
              styles.badge,
              {
                color: colors.secondary,
                backgroundColor: colors.surface2,
                borderRadius: radius.pill,
              },
            ]}
          >
            Waiting to sync
          </Text>
        )}
      </View>
      {error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error}
        </Text>
      )}
      {canRetry && (
        <Button
          label="Retry sync"
          variant="secondary"
          size="small"
          onPress={() => void retryBodyCheckIns()}
        />
      )}
    </Card>
  );
}

/**
 * The web's maintenance tip: once the latest weigh-in reaches a loss or gain goal, and no goal
 * has used a range yet, suggest maintaining a range. It follows the account's tips
 * (features/guides/tips) and the web's rules for a tip beside its control (tipScheduling): after
 * a first saved workout, in a quiet moment on Body, within the daily tip allowance and up to three
 * showings. Once it appears it stays for the visit; Show tips switches it off, and dismissing it
 * or setting the goal also takes it out of Home's bulb, as on the web.
 */
export function MaintenanceTip({
  goals,
  latest,
  ready,
  onSetGoal,
}: {
  goals: BodyWeightGoal[];
  latest: BodyMeasurement | undefined;
  ready: boolean;
  onSetGoal: () => void;
}) {
  const { learn } = useTips();
  const focused = useIsFocused();
  const history = useWorkoutHistory();
  const totalWorkouts = useDashboard().data?.history?.total_workouts;
  const usedMaintenance = usedMaintenanceRange(goals);
  useEffect(() => {
    if (ready && usedMaintenance) learn('maintenance');
  }, [ready, usedMaintenance, learn]);
  const activeGoal = goals.find((goal) => goal.active) ?? null;
  const eligible = ready && weightGoalReached(activeGoal, latest?.weight_kg) && !usedMaintenance;
  // Each visit to Body asks again, as the web's tip goes when its page changes.
  if (!eligible || !focused || !history.data) return null;
  return (
    <MaintenanceTipVisit
      workoutCount={tipWorkoutCount(history.data, totalWorkouts)}
      onSetGoal={onSetGoal}
    />
  );
}

/**
 * A quiet moment, as the web's: no sheet (a weigh-in, goal or any other), toast, menu or prompt,
 * keyboard or app switch.
 */
const quiet = () =>
  !sheetShowing() &&
  !toastShowing() &&
  !(typeof promptShowing === 'function' && promptShowing()) &&
  !Keyboard.isVisible() &&
  AppState.currentState !== 'background' &&
  AppState.currentState !== 'inactive';

function MaintenanceTipVisit({
  workoutCount,
  onSetGoal,
}: {
  workoutCount: number;
  onSetGoal: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const tips = useTips();
  const [shown, setShown] = useState(false);
  const anchor = useRef<ComponentRef<typeof View>>(null);
  const { get, shown: recordShowing } = tips;
  useEffect(() => {
    if (shown) return;
    let quietSince = 0;
    let tick = 0;
    let ended = false;
    // Each tick measures where the card would appear and decides when that measurement returns,
    // so a showing is only spent while the place is on screen (as the web's slot check) and the
    // moment is quiet. An answer that arrives after a newer tick, or after the visit, is ignored.
    const timer = setInterval(() => {
      const view = anchor.current;
      if (!view) return;
      const asked = ++tick;
      tipAnchorLayout.measure(view, ({ y, width }) => {
        if (ended || asked !== tick) return;
        const now = Date.now();
        const inView = width > 0 && y >= 0 && y < Dimensions.get('window').height - BOTTOM_RESERVED;
        if (!quiet() || !inView) {
          quietSince = 0;
          return;
        }
        quietSince ||= now;
        if (now - quietSince < TIP_QUIET_MS) return;
        const environment = { page: 'body', ready: true, resting: false, workoutCount };
        if (!hintMayShow(get(), 'maintenance', environment, now)) return;
        ended = true;
        // It counts towards its showings and spends the day's tip, as on the web.
        recordShowing('maintenance', now);
        setShown(true);
      });
    }, TICK_MS);
    return () => {
      ended = true;
      clearInterval(timer);
    };
  }, [shown, workoutCount, get, recordShowing]);
  const status = tips.state.seen.maintenance;
  if (!shown)
    // Marks where the card would appear without taking space: the negative margin cancels the
    // page's gap before it.
    return (
      <View
        ref={anchor}
        collapsable={false}
        pointerEvents="none"
        style={{ height: 0, marginTop: -space.stack }}
      />
    );
  if (!tips.state.enabled || status === 'dismissed' || status === 'learned') return null;
  const tip = TIP_DEFINITIONS.maintenance;
  const hide = () => tips.dismiss('maintenance');
  return (
    <View
      accessibilityLabel="Quick tip"
      style={[
        styles.tip,
        {
          backgroundColor: colors.accentSoft,
          borderColor: colors.cardBorder,
          borderWidth: 1,
          borderRadius: radius.lg,
        },
      ]}
    >
      <Icon name={bodyIcons.sparkle} size={18} color={colors.accentText} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[type.callout, { color: colors.text, fontWeight: '700' }]}>{tip.title}</Text>
        <Text style={[type.footnote, { color: colors.secondary }]}>{tip.body}</Text>
        <Button
          label={tip.action.label}
          variant="link"
          onPress={() => {
            hide();
            onSetGoal();
          }}
          style={{ alignSelf: 'flex-start' }}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss tip"
        hitSlop={8}
        onPress={() => {
          haptics.tap();
          hide();
        }}
      >
        <Icon name="close" size={14} color={colors.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
});
