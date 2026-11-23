import { Host as ComposeHost, DatePickerDialog, TimePickerDialog } from '@expo/ui/jetpack-compose';
import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle, labelsHidden, tint } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { prettyDate } from '../../../../frontend/src/appShared';
import { isoLocalDate, parseLocalDate } from '../../../../frontend/src/trainingSummary';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';

/**
 * A labelled date, picked natively: SwiftUI's compact date picker on iOS (a pill that opens a
 * calendar), and Material's date picker dialog on Android. Dates are local yyyy-mm-dd strings.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
}) {
  const { colors, type, radius, scheme } = useTheme();
  const [open, setOpen] = useState(false);
  const caption = <Text style={[type.callout, { color: colors.secondary, flex: 1 }]}>{label}</Text>;
  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.row, { backgroundColor: colors.surface2, borderRadius: radius.md }]}>
        {caption}
        <Host matchContents colorScheme={scheme}>
          <DatePicker
            title={label}
            selection={value ? parseLocalDate(value) : new Date()}
            range={{
              ...(min ? { start: parseLocalDate(min) } : {}),
              ...(max ? { end: parseLocalDate(max) } : {}),
            }}
            displayedComponents={['date']}
            onDateChange={(date) => onChange(isoLocalDate(date))}
            modifiers={[datePickerStyle('compact'), labelsHidden(), tint(colors.accent)]}
          />
        </Host>
      </View>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ? prettyDate(value) : 'not set'}`}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: colors.surface2, borderRadius: radius.md },
          pressed && { opacity: 0.7 },
        ]}
      >
        {caption}
        <Text style={[type.callout, type.number, { color: colors.text, fontWeight: '600' }]}>
          {value ? prettyDate(value) : 'Choose'}
        </Text>
        <Icon name="chevronDown" size={16} color={colors.muted} />
      </Pressable>
      {open && (
        <ComposeHost matchContents>
          <DatePickerDialog
            // Material's picker works in UTC days.
            initialDate={value || isoLocalDate(new Date())}
            selectableDates={{
              ...(min ? { start: new Date(`${min}T00:00:00Z`) } : {}),
              ...(max ? { end: new Date(`${max}T00:00:00Z`) } : {}),
            }}
            color={colors.accent}
            confirmButtonLabel="OK"
            dismissButtonLabel="Cancel"
            onDateSelected={(date) => {
              setOpen(false);
              onChange(date.toISOString().slice(0, 10));
            }}
            onDismissRequest={() => setOpen(false)}
          />
        </ComposeHost>
      )}
    </>
  );
}

/** "HH:MM" as today's local time, for the pickers. */
function timeOnToday(value: string): Date {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

const hhmm = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/**
 * A labelled time of day ("HH:MM"), picked natively: SwiftUI's compact time picker on iOS, and
 * Material's time picker dialog on Android.
 */
export function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (time: string) => void;
}) {
  const { colors, type, radius, scheme } = useTheme();
  const [open, setOpen] = useState(false);
  const caption = <Text style={[type.callout, { color: colors.secondary, flex: 1 }]}>{label}</Text>;
  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.row, { backgroundColor: colors.surface2, borderRadius: radius.md }]}>
        {caption}
        <Host matchContents colorScheme={scheme}>
          <DatePicker
            title={label}
            selection={timeOnToday(value)}
            displayedComponents={['hourAndMinute']}
            onDateChange={(date) => onChange(hhmm(date))}
            modifiers={[datePickerStyle('compact'), labelsHidden(), tint(colors.accent)]}
          />
        </Host>
      </View>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value || 'not set'}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: colors.surface2, borderRadius: radius.md },
          pressed && { opacity: 0.7 },
        ]}
      >
        {caption}
        <Text style={[type.callout, type.number, { color: colors.text, fontWeight: '600' }]}>
          {value || 'Choose'}
        </Text>
        <Icon name="chevronDown" size={16} color={colors.muted} />
      </Pressable>
      {open && (
        <ComposeHost matchContents>
          <TimePickerDialog
            initialDate={timeOnToday(value).toISOString()}
            color={colors.accent}
            confirmButtonLabel="OK"
            dismissButtonLabel="Cancel"
            onDateSelected={(date) => {
              setOpen(false);
              onChange(hhmm(date));
            }}
            onDismissRequest={() => setOpen(false)}
          />
        </ComposeHost>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
});
