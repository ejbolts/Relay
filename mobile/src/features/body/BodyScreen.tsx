import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  bodyGoalTarget,
  maintenanceRange,
  maintenanceStatus,
} from '../../../../frontend/src/bodyMeasurementHistory';
import { dayMonth } from '../../../../frontend/src/trainingSummary';
import type { BodyMeasurement, BodyWeightGoal } from '../../../../frontend/src/types';
import { formatWeight } from '../../../../frontend/src/weightUnits';
import { useWeightUnit } from '../../data/queries';
import { Button, ErrorState, errorMessage, Loading, Screen } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { BodyHistory } from './BodyHistory';
import { syncBodyCheckIns } from './bodyCheckInQueue';
import { CheckInSyncCard, MaintenanceTip } from './BodyNotices';
import { bodyIcons } from './bodyIcons';
import {
  bodyCheckInApi,
  bodyGoalApi,
  bodyKeys,
  refreshBodyMeasurements,
  useBodyGoals,
  useBodyMeasurements,
} from './bodyQueries';
import { BodySizesCard } from './BodySizesCard';
import { BodyTrendChart } from './BodyTrendChart';
import { GoalSheet, type GoalRequest } from './GoalSheet';
import { clearMaintainGoalRequest, useMaintainGoalRequested } from './maintainGoalRequest';
import { WeighInSheet } from './WeighInSheet';

/** The goal form on Maintain, as Home's maintenance tip asks for. */
const MAINTAIN_GOAL: GoalRequest = { goal: null, kind: 'maintain' };

/**
 * Removes a goal from view at once and deletes it only when its Undo toast ends without Undo
 * (it times out, is dismissed or a newer toast replaces it), as the web's goal removal does, so
 * Undo never has to recreate it and the goal is never deleted while Undo is still on screen.
 */
function useGoalRemoval() {
  const client = useQueryClient();
  const [pendingIds, setPendingIds] = useState<readonly string[]>([]);
  const settle = useCallback(
    (id: string) => setPendingIds((ids) => ids.filter((pending) => pending !== id)),
    [],
  );
  const start = useCallback(
    (goal: BodyWeightGoal) => {
      setPendingIds((ids) => [...ids, goal.id]);
      showToast('Goal removed', {
        label: 'Undo',
        run: () => settle(goal.id),
        onDismiss: () =>
          void bodyGoalApi.remove(goal.id).then(
            () =>
              client.invalidateQueries({ queryKey: bodyKeys.goals }).then(() => settle(goal.id)),
            () => {
              settle(goal.id);
              showToast('Could not remove this goal. It has been restored.');
            },
          ),
      });
    },
    [client, settle],
  );
  return { pendingIds, start };
}

/**
 * The web's Body tab: bodyweight, goal and body fat at a glance, logging a weigh-in, setting a
 * goal, the trend, body measurements on a figure and the check-in history.
 */
export function BodyScreen() {
  const { colors, type, radius } = useTheme();
  const client = useQueryClient();
  const unit = useWeightUnit();
  const measurementsQuery = useBodyMeasurements();
  const goalsQuery = useBodyGoals();
  const removal = useGoalRemoval();
  const [refreshing, setRefreshing] = useState(false);
  const [entry, setEntry] = useState<{ editing: BodyMeasurement | null } | null>(null);
  const [goalRequest, setGoalRequest] = useState<GoalRequest | null>(null);
  const maintainRequested = useMaintainGoalRequested();
  const measurements = measurementsQuery.data ?? [];
  const goals = (goalsQuery.data ?? []).filter((goal) => !removal.pendingIds.includes(goal.id));
  const latest = measurements[0];
  // The newest reading, which may come from an earlier check-in than the latest weigh-in.
  const latestBodyFat = measurements.find((item) => item.body_fat_pct !== null);
  const activeGoal = goals.find((goal) => goal.active) ?? null;

  async function refresh() {
    setRefreshing(true);
    try {
      // Pulling down also retries check-ins waiting on the phone, refused or not.
      await syncBodyCheckIns(true).catch(() => undefined);
      await client.refetchQueries({ queryKey: bodyKeys.all, type: 'active' });
    } finally {
      setRefreshing(false);
    }
  }

  /** Deletes a check-in at once; Undo saves it back as it was. */
  function deleteCheckIn(measurement: BodyMeasurement) {
    bodyCheckInApi.deleteBodyMeasurement(measurement.id).then(
      () => {
        void refreshBodyMeasurements(client);
        showToast('Check-in deleted', {
          label: 'Undo',
          run: () =>
            void bodyCheckInApi
              .saveBodyMeasurement({
                measurement_date: measurement.measurement_date,
                weight_kg: measurement.weight_kg,
                body_fat_pct: measurement.body_fat_pct,
                notes: measurement.notes,
              })
              .then(
                () => refreshBodyMeasurements(client),
                (reason) => showToast(errorMessage(reason)),
              ),
        });
      },
      (reason) => showToast(errorMessage(reason)),
    );
  }

  const count = measurements.length;
  return (
    <>
      <Screen
        title="Body"
        eyebrow={
          measurementsQuery.data
            ? `${count} ${count === 1 ? 'check-in' : 'check-ins'}${latest ? ` · latest ${dayMonth(latest.measurement_date)}` : ''}`
            : undefined
        }
        refreshing={refreshing}
        onRefresh={() => void refresh()}
      >
        {measurementsQuery.isPending ? (
          <Loading label="Loading body check-ins" />
        ) : !measurementsQuery.data ? (
          <ErrorState
            message={errorMessage(measurementsQuery.error)}
            onRetry={() => void measurementsQuery.refetch()}
          />
        ) : (
          <>
            <CheckInSyncCard />
            <MaintenanceTip
              goals={goals}
              latest={latest}
              ready={!!goalsQuery.data}
              onSetGoal={() => setGoalRequest({ goal: null, kind: 'maintain' })}
            />
            <View style={styles.stats} accessibilityLabel="Bodyweight summary">
              <Stat
                label="Bodyweight"
                value={latest ? formatWeight(latest.weight_kg, unit) : '–'}
              />
              {activeGoal ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit goal, ${bodyGoalTarget(activeGoal, unit)}`}
                  onPress={() => setGoalRequest({ goal: activeGoal })}
                  style={({ pressed }) => [
                    styles.stat,
                    {
                      backgroundColor: colors.surface,
                      borderRadius: radius.lg,
                      borderColor: colors.line,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={styles.statLabel}>
                    <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
                      {new Date(`${activeGoal.target_date}T12:00:00`).toLocaleDateString(
                        undefined,
                        {
                          month: 'long',
                        },
                      )}{' '}
                      goal
                    </Text>
                    <Icon name="chevronRight" size={11} color={colors.muted} />
                  </View>
                  <Text
                    style={[type.headline, type.number, { color: colors.text }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {bodyGoalTarget(activeGoal, unit)}
                  </Text>
                  {latest && maintenanceRange(activeGoal) && (
                    <Text style={[type.caption, { color: colors.secondary }]}>
                      {maintenanceStatus(activeGoal, latest.weight_kg)}
                    </Text>
                  )}
                </Pressable>
              ) : (
                <Stat label="Weight goal" value="–" />
              )}
              <Stat
                label="Body fat"
                value={latestBodyFat ? `${latestBodyFat.body_fat_pct}%` : '–'}
                detail={
                  latestBodyFat && latestBodyFat !== latest
                    ? dayMonth(latestBodyFat.measurement_date)
                    : undefined
                }
              />
            </View>
            <View style={styles.actions}>
              <Button
                label="Log weigh-in"
                icon={bodyIcons.scale}
                onPress={() => setEntry({ editing: null })}
                style={{ flex: 1 }}
              />
              <Button
                label={activeGoal ? 'New goal' : 'Set a goal'}
                variant="secondary"
                icon={bodyIcons.flag}
                onPress={() => setGoalRequest({ goal: null })}
                style={{ flex: 1 }}
              />
            </View>
            {count > 1 && <BodyTrendChart measurements={measurements} goals={goals} />}
            <BodySizesCard />
            <BodyHistory
              measurements={measurements}
              goals={goals}
              onEdit={(measurement) => setEntry({ editing: measurement })}
              onDelete={deleteCheckIn}
              onEditGoal={(goal) => setGoalRequest({ goal })}
              onRemoveGoal={removal.start}
            />
          </>
        )}
      </Screen>
      <WeighInSheet
        visible={!!entry}
        measurements={measurements}
        editing={entry?.editing ?? null}
        onClose={() => setEntry(null)}
      />
      <GoalSheet
        request={goalRequest ?? (maintainRequested ? MAINTAIN_GOAL : null)}
        goals={goals}
        latestKg={latest?.weight_kg ?? null}
        onClose={() => {
          setGoalRequest(null);
          clearMaintainGoalRequest();
        }}
        onRemove={removal.start}
      />
    </>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const { colors, type, radius } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${detail ? `, ${detail}` : ''}`}
      style={[
        styles.stat,
        { backgroundColor: colors.surface, borderRadius: radius.lg, borderColor: colors.line },
      ]}
    >
      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[type.headline, type.number, { color: colors.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {!!detail && <Text style={[type.caption, { color: colors.secondary }]}>{detail}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 8 },
  stat: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statLabel: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  actions: { flexDirection: 'row', gap: 10 },
});
