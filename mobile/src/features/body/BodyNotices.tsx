import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  usedMaintenanceRange,
  weightGoalReached,
} from '../../../../frontend/src/bodyMeasurementHistory';
import { TIP_DEFINITIONS } from '../../../../frontend/src/tipDefinitions';
import type { BodyMeasurement, BodyWeightGoal } from '../../../../frontend/src/types';
import { Button, Card } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useTips } from '../guides/tips';
import { retryBodyCheckIns, useBodyCheckInStatus } from './BodyCheckInSync';
import { bodyIcons } from './bodyIcons';

/** What the card last announced, shared by every tab's card so switching tabs stays quiet. */
let lastAnnounced: string | null = null;

/**
 * Check-ins saved on this phone that the server hasn't confirmed, as the web's sync card. Shown
 * at the top of every tab, as the web's is; BodyCheckInSync alone owns the queue and its sync.
 */
export function CheckInSyncCard() {
  const { pending, error } = useBodyCheckInStatus();
  useEffect(() => {
    if (pending === 0) lastAnnounced = null;
  }, [pending]);
  return pending === 0 ? null : <CheckInSyncDetails pending={pending} error={error} />;
}

function CheckInSyncDetails({ pending, error }: { pending: number; error: string | null }) {
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
        <>
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {error}
          </Text>
          <Button
            label="Retry sync"
            variant="secondary"
            size="small"
            onPress={() => void retryBodyCheckIns()}
          />
        </>
      )}
    </Card>
  );
}

/**
 * The web's maintenance tip: once the latest weigh-in reaches a loss or gain goal, and no goal
 * has used a range yet, suggest maintaining a range. It shares the account's tips on this phone
 * (features/guides/tips): Show tips switches it off, and dismissing it or setting the goal also
 * takes it out of Home's bulb, as on the web.
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
  const { colors, type, radius } = useTheme();
  const tips = useTips();
  const { learn } = tips;
  const usedMaintenance = usedMaintenanceRange(goals);
  useEffect(() => {
    if (ready && usedMaintenance) learn('maintenance');
  }, [ready, usedMaintenance, learn]);
  const activeGoal = goals.find((goal) => goal.active) ?? null;
  const eligible = ready && weightGoalReached(activeGoal, latest?.weight_kg) && !usedMaintenance;
  if (!eligible || !tips.state.enabled || tips.state.seen.maintenance) return null;
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
