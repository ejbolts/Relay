import { StyleSheet, Text, View } from 'react-native';
import { recordKindLabel } from '../../../../frontend/src/recordLabels';
import { recentRecords, shortDate } from '../../../../frontend/src/trainingSummary';
import { formatWeight, recordDisplayValue } from '../../../../frontend/src/weightUnits';
import { usePersonalRecords, useWeightUnit } from '../../data/queries';
import { Card, CardHeader, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { homeIcons } from './homeIcons';

/** The newest three PRs, one per set, exercise and record type, as on the web. */
export function RecordsCard() {
  const { colors, type } = useTheme();
  const records = usePersonalRecords();
  const weightUnit = useWeightUnit();
  const shown = records.data ? recentRecords(records.data, 3) : [];
  return (
    <Card>
      <CardHeader title="Recent records" />
      {records.isPending ? (
        <Loading label="Loading records" />
      ) : !records.data ? (
        <ErrorState message={errorMessage(records.error)} onRetry={() => void records.refetch()} />
      ) : shown.length ? (
        <View>
          {shown.map((record, index) => {
            const detail = `${recordKindLabel(record, weightUnit)} · ${shortDate(record.achieved_date)}`;
            const bodyweight =
              record.bodyweight_kg != null
                ? `at ${formatWeight(record.bodyweight_kg, weightUnit)} BW`
                : null;
            const value = recordDisplayValue(record, weightUnit);
            return (
              <View
                key={record.id}
                accessible
                accessibilityLabel={[record.exercise_name ?? 'Exercise', detail, bodyweight, value]
                  .filter(Boolean)
                  .join(', ')}
                style={[
                  styles.row,
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.line,
                  },
                ]}
              >
                <View style={[styles.icon, { backgroundColor: colors.goldSoft }]}>
                  <Icon name={homeIcons.trophy} size={16} color={colors.gold} />
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text
                    style={[type.callout, { color: colors.text, fontWeight: '600' }]}
                    numberOfLines={1}
                  >
                    {record.exercise_name ?? 'Exercise'}
                  </Text>
                  <Text style={[type.footnote, { color: colors.muted }]}>{detail}</Text>
                  {bodyweight && (
                    <Text style={[type.footnote, { color: colors.muted }]}>{bodyweight}</Text>
                  )}
                </View>
                <Text
                  style={[type.callout, type.number, { color: colors.text, fontWeight: '700' }]}
                >
                  {value}
                </Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={[type.footnote, { color: colors.muted }]}>
          Your next strength milestone will appear here.
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
