import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  usedMaintenanceRange,
  weightGoalReached,
} from '../../../../frontend/src/bodyMeasurementHistory';
import { TIP_DEFINITIONS } from '../../../../frontend/src/tipDefinitions';
import type { BodyMeasurement, BodyWeightGoal } from '../../../../frontend/src/types';
import { readJson, writeJson } from '../../data/deviceStorage';
import { Button, Card } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { useBodyCheckInStatus } from './BodyCheckInSync';
import { syncBodyCheckIns } from './bodyCheckInQueue';
import { bodyIcons } from './bodyIcons';

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
            onPress={() => void syncBodyCheckIns(true).catch(() => undefined)}
          />
        </>
      )}
    </Card>
  );
}

const tipKey = (account: string) => `relay.mobile.tips.maintenance.v1:${account}`;

/**
 * The web's maintenance tip: once the latest weigh-in reaches a loss or gain goal, and no goal
 * has used a range yet, suggest maintaining a range. Dismissing it, or setting the goal, hides
 * it on this phone.
 */
export function MaintenanceTip({
  account,
  goals,
  latest,
  ready,
  onSetGoal,
}: {
  account: string | null;
  goals: BodyWeightGoal[];
  latest: BodyMeasurement | undefined;
  ready: boolean;
  onSetGoal: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const [hidden, setHidden] = useState(
    () => !account || readJson<boolean>(tipKey(account)) === true,
  );
  const activeGoal = goals.find((goal) => goal.active) ?? null;
  const eligible =
    ready && weightGoalReached(activeGoal, latest?.weight_kg) && !usedMaintenanceRange(goals);
  if (hidden || !eligible || !account) return null;
  const tip = TIP_DEFINITIONS.maintenance;
  const hide = () => {
    writeJson(tipKey(account), true);
    setHidden(true);
  };
  return (
    <View
      accessibilityLabel="Quick tip"
      style={[styles.tip, { backgroundColor: colors.accentSoft, borderRadius: radius.lg }]}
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
        onPress={hide}
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
