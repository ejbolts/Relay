import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CARDIO_GOAL_MINUTES,
  CARDIO_MAX_HEART_RATE,
  CARDIO_ZONE_NUMBERS,
  DEFAULT_CARDIO_PREFERENCES,
  cardioZoneDrafts,
  invalidZoneFields,
  parseCardioZoneRanges,
  validCardioInteger,
  withZoneMax,
  zonesFromMaxHeartRate,
} from '../../../../frontend/src/cardioZones';
import type { CardioPreferences } from '../../../../frontend/src/types';
import { Button, Card, CardHeader, ErrorState, Loading, errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showMenu } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';
import { useCardioOverview } from '../training/trainingQueries';
import { saveCardioZones } from './cardioData';
import { CardioChoice, CardioError, CardioField, CardioPage } from './CardioFields';
import { useCardioWrite } from './useCardioWrite';

export function CardioZonesScreen() {
  const overview = useCardioOverview();
  return (
    <CardioPage title="Heart-rate zones & goals">
      {overview.data ? (
        <ZonesForm preferences={overview.data.cardio_preferences ?? DEFAULT_CARDIO_PREFERENCES} />
      ) : overview.isError ? (
        <ErrorState
          message={errorMessage(overview.error)}
          onRetry={() => void overview.refetch()}
        />
      ) : (
        <Loading label="Loading heart-rate zones" />
      )}
    </CardioPage>
  );
}

function ZonesForm({ preferences }: { preferences: CardioPreferences }) {
  const { colors, type } = useTheme();
  const [zones, setZones] = useState(() => cardioZoneDrafts(preferences));
  const [goals, setGoals] = useState(() =>
    preferences.goals.map(({ zone, minutes }) => ({ zone, minutes: String(minutes) })),
  );
  const [maxHeartRate, setMaxHeartRate] = useState('');
  const [checked, setChecked] = useState(false);
  const { write, saving, saveError } = useCardioWrite();
  const maxBpm = Number(maxHeartRate);
  const canFill = validCardioInteger(maxBpm, CARDIO_MAX_HEART_RATE);
  const unusedZones = CARDIO_ZONE_NUMBERS.filter(
    (zone) => !goals.some((goal) => goal.zone === zone),
  );
  const invalid = checked ? invalidZoneFields(zones) : new Set<string>();
  let rangeError: string | null = null;
  let ranges: CardioPreferences['heart_rate_zones'] = [];
  try {
    ranges = parseCardioZoneRanges(zones);
  } catch (reason) {
    rangeError = errorMessage(reason);
  }
  const parsedGoals = goals.map(({ zone, minutes }) => ({ zone, minutes: Number(minutes) }));

  function save() {
    setChecked(true);
    if (
      rangeError ||
      parsedGoals.some(({ minutes }) => !validCardioInteger(minutes, CARDIO_GOAL_MINUTES))
    )
      return;
    void write(
      () => saveCardioZones({ heart_rate_zones: ranges, goals: parsedGoals }),
      'Zones & goals saved',
    );
  }

  return (
    <>
      <Card>
        <CardHeader title="Personal ranges (bpm)" />
        <View style={styles.row}>
          <CardioField
            label="Max heart rate"
            keyboardType="number-pad"
            placeholder="bpm"
            value={maxHeartRate}
            onChangeText={setMaxHeartRate}
            style={styles.flex}
            editable={!saving}
          />
          <Button
            label="Fill zones"
            variant="secondary"
            disabled={!canFill || saving}
            onPress={() => setZones(zonesFromMaxHeartRate(maxBpm))}
          />
        </View>
        <View style={styles.row}>
          <Text style={[type.caption, styles.zoneColumn, { color: colors.secondary }]}>Zone</Text>
          <Text style={[type.caption, styles.flex, { color: colors.secondary }]}>From</Text>
          <Text style={[type.caption, styles.flex, { color: colors.secondary }]}>To</Text>
        </View>
        {zones.map((zone, index) => (
          <View key={zone.zone} style={styles.row}>
            <Text
              style={[type.callout, styles.zoneColumn, { color: colors.text, alignSelf: 'center' }]}
            >
              Zone {zone.zone}
            </Text>
            <CardioField
              label={`Zone ${zone.zone} minimum bpm`}
              hideLabel
              style={styles.flex}
              keyboardType="number-pad"
              value={zone.min}
              onChangeText={(min) =>
                setZones((current) =>
                  current.map((item) => (item.zone === zone.zone ? { ...item, min } : item)),
                )
              }
              invalid={invalid.has(`${zone.zone}:min`)}
              editable={!saving}
            />
            <CardioField
              label={`Zone ${zone.zone} maximum bpm`}
              hideLabel
              style={styles.flex}
              keyboardType="number-pad"
              value={zone.max}
              onChangeText={(max) => setZones((current) => withZoneMax(current, index, max))}
              invalid={invalid.has(`${zone.zone}:max`)}
              editable={!saving}
            />
          </View>
        ))}
        {checked && rangeError && <CardioError message={rangeError} />}
      </Card>
      <Card>
        <CardHeader title="Weekly goals" />
        <View style={styles.row}>
          <Text style={[type.caption, styles.flex, { color: colors.secondary }]}>Zone</Text>
          <Text style={[type.caption, styles.flex, { color: colors.secondary }]}>Minutes</Text>
          <View style={styles.goalAction} />
        </View>
        {goals.map((goal, index) => (
          <View key={index} style={[styles.row, { alignItems: 'flex-start' }]}>
            <View style={styles.flex}>
              <CardioChoice
                label={`Goal ${index + 1} zone`}
                value={`Zone ${goal.zone}`}
                disabled={saving || unusedZones.length === 0}
                onPress={() =>
                  showMenu(
                    'Goal zone',
                    CARDIO_ZONE_NUMBERS.filter(
                      (zone) => zone === goal.zone || unusedZones.includes(zone),
                    ).map((zone) => ({
                      label: `Zone ${zone}`,
                      onPress: () =>
                        setGoals((current) =>
                          current.map((item, row) => (row === index ? { ...item, zone } : item)),
                        ),
                    })),
                  )
                }
              />
            </View>
            <CardioField
              label={`Goal ${index + 1} minutes`}
              hideLabel
              placeholder="Minutes"
              style={styles.flex}
              keyboardType="number-pad"
              value={goal.minutes}
              onChangeText={(minutes) =>
                setGoals((current) =>
                  current.map((item, row) => (row === index ? { ...item, minutes } : item)),
                )
              }
              editable={!saving}
              error={
                checked && !validCardioInteger(Number(goal.minutes), CARDIO_GOAL_MINUTES)
                  ? 'Enter whole minutes from 1 to 10,080.'
                  : undefined
              }
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove Zone ${goal.zone} goal`}
              accessibilityState={{ disabled: saving || goals.length === 1 }}
              disabled={saving || goals.length === 1}
              onPress={() => setGoals((current) => current.filter((_, row) => row !== index))}
              style={[styles.goalAction, styles.remove]}
            >
              <Icon
                name="trash"
                size={20}
                color={goals.length === 1 ? colors.muted : colors.danger}
              />
            </Pressable>
          </View>
        ))}
        {unusedZones.length > 0 && (
          <Button
            label="Add goal"
            icon="plus"
            variant="secondary"
            disabled={saving}
            onPress={() => setGoals([...goals, { zone: unusedZones[0], minutes: '30' }])}
          />
        )}
      </Card>
      {saveError && <CardioError message={saveError} />}
      <Button label={saving ? 'Saving…' : 'Save zones & goals'} disabled={saving} onPress={save} />
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  flex: { flex: 1 },
  zoneColumn: { flex: 0.75 },
  goalAction: { width: 44 },
  remove: { height: 46, alignItems: 'center', justifyContent: 'center' },
});
