import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  NO_SHARED_WORKOUT_FILTERS,
  SHARED_FILTER_DATES_ERROR,
  sharedFilterDatesInvalid,
  sharedWorkoutFilterCount,
  sharedWorkoutTypeChoices,
  sharedWorkoutTypeValue,
  withSharedWorkoutType,
} from '../../../../frontend/src/sharedHistoryFilters';
import { localDate } from '../../../../frontend/src/utils';
import type {
  SharedWorkoutFilterOptions,
  SharedWorkoutFilters,
} from '../../../../frontend/src/types';
import { Button, IconButton } from '../../ui/components';
import { DateField } from '../../ui/DateField';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { showMenu } from '../../ui/prompts';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';

/** The filter button beside a profile's Workouts title, with the number of filters set. */
export function HistoryFilterButton({
  filters,
  onPress,
}: {
  filters: SharedWorkoutFilters;
  onPress: () => void;
}) {
  const active = sharedWorkoutFilterCount(filters);
  return (
    <IconButton
      icon="filter"
      badge={active > 0 ? String(active) : null}
      pressed={active > 0}
      accessibilityLabel={active > 0 ? `Filter workouts, ${active} set` : 'Filter workouts'}
      onPress={onPress}
    />
  );
}

/**
 * The web's history filters in a sheet: workout type, exercise, machine (when the member shares
 * machine photos) and a date range. Each choice applies at once, as on the web.
 */
export function HistoryFilterSheet({
  visible,
  filters,
  options,
  onChange,
  onClose,
}: {
  visible: boolean;
  filters: SharedWorkoutFilters;
  options: SharedWorkoutFilterOptions;
  onChange: (next: SharedWorkoutFilters) => void;
  onClose: () => void;
}) {
  const { colors, type } = useTheme();
  const active = sharedWorkoutFilterCount(filters);
  // An older or newer server may leave a list out: treat it as empty.
  const exercises = Array.isArray(options.exercises) ? options.exercises : [];
  const machines = Array.isArray(options.machines) ? options.machines : [];
  const typeChoices = sharedWorkoutTypeChoices({
    exercises,
    machines,
    workout_types: Array.isArray(options.workout_types) ? options.workout_types : undefined,
  });
  const typeValue = sharedWorkoutTypeValue(filters);
  const exercise = exercises.find((item) => item.id === filters.exercise_id);
  const machine = machines.find((item) => item.id === filters.machine_photo_id);
  const invalid = sharedFilterDatesInvalid(filters);
  return (
    <Sheet visible={visible} onClose={onClose} title="Filter workouts">
      <View style={{ gap: 12 }}>
        <ChoiceRow
          label="Workout type"
          value={typeChoices.find((choice) => choice.value === typeValue)?.label ?? 'All types'}
          onPress={() =>
            showMenu(
              'Workout type',
              typeChoices.map((choice) => ({
                label: choice.label,
                onPress: () => onChange(withSharedWorkoutType(filters, choice.value)),
              })),
            )
          }
        />
        <ChoiceRow
          label="Exercise"
          value={exercise?.name ?? 'All exercises'}
          onPress={() =>
            showMenu('Exercise', [
              { label: 'All exercises', onPress: () => onChange({ ...filters, exercise_id: '' }) },
              ...exercises.map((item) => ({
                label: item.name,
                onPress: () => onChange({ ...filters, exercise_id: item.id }),
              })),
            ])
          }
        />
        {machines.length > 0 && (
          <ChoiceRow
            label="Machine"
            value={machine?.caption ?? 'All shared machines'}
            onPress={() =>
              showMenu('Machine', [
                {
                  label: 'All shared machines',
                  onPress: () => onChange({ ...filters, machine_photo_id: '' }),
                },
                ...machines.map((item) => ({
                  label: item.caption,
                  onPress: () => onChange({ ...filters, machine_photo_id: item.id }),
                })),
              ])
            }
          />
        )}
        <DateRow
          label="From"
          value={filters.start_date}
          onChange={(start_date) => onChange({ ...filters, start_date })}
        />
        <DateRow
          label="To"
          value={filters.end_date}
          onChange={(end_date) => onChange({ ...filters, end_date })}
        />
        {invalid && (
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {SHARED_FILTER_DATES_ERROR}
          </Text>
        )}
        <View style={styles.actions}>
          {active > 0 && (
            <Button
              label="Reset filters"
              variant="secondary"
              onPress={() => {
                haptics.tap();
                onChange(NO_SHARED_WORKOUT_FILTERS);
              }}
              style={{ flex: 1 }}
            />
          )}
          <Button label="Done" onPress={onClose} style={{ flex: 1 }} />
        </View>
      </View>
    </Sheet>
  );
}

/** A labelled choice, like the web's <select>: it shows what is chosen and opens a menu. */
function ChoiceRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  const { colors, type, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.surface3 : colors.surface2,
          borderColor: colors.lineStrong,
          borderRadius: radius.md,
        },
      ]}
    >
      <Text style={[type.callout, { color: colors.secondary }]}>{label}</Text>
      <Text
        style={[
          type.callout,
          { color: colors.text, fontWeight: '600', flex: 1, textAlign: 'right' },
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Icon name="chevronDown" size={13} color={colors.secondary} />
    </Pressable>
  );
}

/** A date that can be left unset, as the web's date input: Clear empties it again. */
function DateRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
}) {
  // iOS's compact picker always draws a date, so an unset date there would look like today.
  // Until one is chosen it is a row saying so, which starts the picker at today.
  if (Platform.OS === 'ios' && !value)
    return <ChoiceRow label={label} value="Any date" onPress={() => onChange(localDate())} />;
  return (
    <View style={styles.dateRow}>
      <View style={{ flex: 1 }}>
        <DateField label={label} value={value} onChange={onChange} />
      </View>
      {!!value && (
        <IconButton
          icon="close"
          accessibilityLabel={`Clear ${label} date`}
          onPress={() => onChange('')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
