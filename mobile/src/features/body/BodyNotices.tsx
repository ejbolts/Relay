import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  usedMaintenanceRange,
  weightGoalReached,
} from '../../../../frontend/src/bodyMeasurementHistory';
import { TIP_DEFINITIONS } from '../../../../frontend/src/tipDefinitions';
import { hintMayShow, TIP_QUIET_MS } from '../../../../frontend/src/tipScheduling';
import { savedWorkoutCount } from '../../../../frontend/src/tipTriggers';
import type { BodyMeasurement, BodyWeightGoal } from '../../../../frontend/src/types';
import { useWorkoutHistory } from '../../data/queries';
import { Button, Card } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { promptShowing } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';
import { toastShowing } from '../../ui/Toast';
import { useTips } from '../guides/tips';
import { useBodyCheckInStatus } from './BodyCheckInSync';
import { syncBodyCheckIns } from './bodyCheckInQueue';
import { bodyIcons } from './bodyIcons';

const TICK_MS = 500;

/** Check-ins saved on this phone that the server hasn't confirmed, as the web's sync card. */
export function CheckInSyncCard() {
  const { colors, type, radius } = useTheme();
  const { pending, error } = useBodyCheckInStatus();
  if (pending === 0) return null;
  return (
    <Card accessibilityLabel="Check-in sync" style={{ gap: 8 }}>
      <View style={styles.row}>
        <Icon name={bodyIcons.cloud} size={18} color={colors.secondary} />
        <Text style={[type.callout, { color: colors.text, fontWeight: '600', flex: 1 }]}>
          {pending} {pending === 1 ? 'check-in' : 'check-ins'} saved on this phone
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
        <>
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {error}
          </Text>
          <Button
            label="Retry sync"
            variant="secondary"
            size="small"
            onPress={() => void syncBodyCheckIns(true).catch(() => undefined)}
          />
        </>
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
  const usedMaintenance = usedMaintenanceRange(goals);
  useEffect(() => {
    if (ready && usedMaintenance) learn('maintenance');
  }, [ready, usedMaintenance, learn]);
  const activeGoal = goals.find((goal) => goal.active) ?? null;
  const eligible = ready && weightGoalReached(activeGoal, latest?.weight_kg) && !usedMaintenance;
  // Each visit to Body asks again, as the web's tip goes when its page changes.
  if (!eligible || !focused || !history.data) return null;
  return (
    <MaintenanceTipVisit workoutCount={savedWorkoutCount(history.data)} onSetGoal={onSetGoal} />
  );
}

/** A quiet moment: no toast, menu or prompt, keyboard or app switch, as the logger's tips. */
const quiet = () =>
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
  const { get, shown: recordShowing } = tips;
  useEffect(() => {
    if (shown) return;
    let quietSince = 0;
    const timer = setInterval(() => {
      const now = Date.now();
      if (!quiet()) {
        quietSince = 0;
        return;
      }
      quietSince ||= now;
      if (now - quietSince < TIP_QUIET_MS) return;
      const environment = { page: 'body', ready: true, resting: false, workoutCount };
      if (!hintMayShow(get(), 'maintenance', environment, now)) return;
      // It counts towards its showings and spends the day's tip, as on the web.
      recordShowing('maintenance', now);
      setShown(true);
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [shown, workoutCount, get, recordShowing]);
  const status = tips.state.seen.maintenance;
  if (!shown || !tips.state.enabled || status === 'dismissed' || status === 'learned') return null;
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
