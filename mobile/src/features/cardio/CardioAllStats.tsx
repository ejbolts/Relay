import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { prettyDate } from '../../../../frontend/src/appShared';
import { CARDIO_ENERGY_PERIODS, cardioEnergyStats } from '../../../../frontend/src/cardioEnergy';
import type { CardioEnergyPeriod } from '../../../../frontend/src/types';
import { useWeightUnit } from '../../data/queries';
import { CardHeader } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { Divider, Segmented } from '../training/parts';

export function CardioAllStats({
  periods,
  weekEnd,
}: {
  periods?: CardioEnergyPeriod[];
  weekEnd: string;
}) {
  const { colors, type, radius } = useTheme();
  const unit = useWeightUnit();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<CardioEnergyPeriod['period']>('week');
  const options = CARDIO_ENERGY_PERIODS.filter(({ value }) =>
    periods?.some((item) => item.period === value),
  );
  const summary = periods?.find((item) => item.period === period) ?? periods?.[0];
  if (!summary) return null;
  const displayEnd = summary.period === 'week' ? weekEnd : summary.end_date;
  return (
    <>
      <Divider />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="All stats"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={styles.toggle}
      >
        <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>All stats</Text>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} color={colors.secondary} size={16} />
      </Pressable>
      {open && (
        <>
          <CardHeader
            title="Progress"
            action={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="About cardio progress"
                hitSlop={10}
                onPress={() =>
                  Alert.alert(
                    'Cardio progress',
                    `Sessions through ${prettyDate(summary.end_date)} count. Average MET is weighted by duration and estimated when missing. Blank elevation gain is calculated from incline and distance. Fat energy equivalent compares logged calories with 7,700 kcal per kilogram of body fat.`,
                  )
                }
              >
                <Icon
                  name={{ sf: 'questionmark.circle', md: 'help-outline' }}
                  size={19}
                  color={colors.secondary}
                />
              </Pressable>
            }
          />
          <Segmented
            accessibilityLabel="Cardio progress period"
            values={options.map(({ label }) => label)}
            selectedIndex={options.findIndex(({ value }) => value === summary.period)}
            onChange={(index) => setPeriod(options[index].value)}
          />
          <Text style={[type.footnote, { color: colors.secondary }]}>
            {prettyDate(summary.start_date)} – {prettyDate(displayEnd)}
          </Text>
          <View style={styles.grid}>
            {cardioEnergyStats(summary, unit).map(({ label, value, unit: statUnit, count }) => (
              <View
                key={label}
                style={[styles.stat, { backgroundColor: colors.surface2, borderRadius: radius.md }]}
              >
                <Text style={[type.caption, { color: colors.secondary }]}>{label}</Text>
                <Text style={[type.headline, type.number, { color: colors.text }]}>
                  {value}
                  {statUnit ? ` ${statUnit}` : ''}
                </Text>
                {!!count && <Text style={[type.caption, { color: colors.muted }]}>{count}</Text>}
              </View>
            ))}
          </View>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  toggle: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexBasis: '46%', flexGrow: 1, gap: 3, padding: 10 },
});
