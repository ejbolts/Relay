import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { decimalNumberOrNull } from '../../../../frontend/src/utils';
import {
  weightInputKg,
  weightInputValue,
  weightUnitName,
  type WeightUnit,
} from '../../../../frontend/src/weightUnits';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';

/**
 * A number with − and + buttons either side, like the web's ±0.1 steppers: each tap steps the
 * value with a light tick, and the number itself can be typed on the decimal keypad.
 *
 * It keeps exactly what is typed (such as "82." on the way to "82.5") and reports the parsed
 * value on every keystroke; a value changed from outside (a step) replaces the text.
 */
export function NumberStepper({
  value,
  format,
  parse,
  onChange,
  onStep,
  unit,
  label,
  stepLabel,
  step = 0.1,
  disabled,
  onSubmit,
}: {
  value: number | null;
  format: (value: number | null) => string;
  /** Reads the typed text; `current` is the value before this keystroke. */
  parse: (text: string, current: number | null) => number | null;
  onChange: (value: number | null) => void;
  /** Steps the value by `delta` (negative to decrease). */
  onStep: (delta: number) => void;
  unit: string;
  /** What the value is: "Bodyweight in kilograms". */
  label: string;
  /** What a step changes, for its buttons: "body fat by 0.1%". Defaults to "by 0.1 kg". */
  stepLabel?: string;
  step?: number;
  disabled?: boolean;
  onSubmit?: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const [text, setText] = useState(() => format(value));
  const latest = useRef(value);
  useEffect(() => {
    if (value === latest.current) return;
    latest.current = value;
    setText(format(value));
  }, [value, format]);
  const button = (delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${delta < 0 ? 'Decrease' : 'Increase'} ${stepLabel ?? `by ${step} ${unit}`}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={() => {
        void Haptics.selectionAsync();
        onStep(delta);
      }}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: colors.surface2, borderRadius: radius.md },
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.6 },
      ]}
    >
      <Icon name={delta < 0 ? 'minus' : 'plus'} size={18} color={colors.text} />
    </Pressable>
  );
  return (
    <View style={styles.row}>
      {button(-step)}
      <View style={[styles.value, { backgroundColor: colors.surface2, borderRadius: radius.md }]}>
        <TextInput
          value={text}
          onChangeText={(next) => {
            const typed = next.replace(',', '.');
            if (!/^\d*(?:\.\d*)?$/.test(typed)) return;
            setText(typed);
            const parsed = parse(typed, value);
            latest.current = parsed;
            if (parsed !== value) onChange(parsed);
          }}
          editable={!disabled}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
          onSubmitEditing={onSubmit}
          placeholder="–"
          placeholderTextColor={colors.muted}
          accessibilityLabel={label}
          style={[type.title, type.number, styles.input, { color: colors.text }]}
        />
        <Text style={[type.callout, { color: colors.muted, fontWeight: '600' }]}>{unit}</Text>
      </View>
      {button(step)}
    </View>
  );
}

const formatPlain = (value: number | null) => (value === null ? '' : String(value));
const parsePlain = (text: string) => decimalNumberOrNull(text);

/** A body-fat percentage stepper. */
export function BodyFatStepper(
  props: Pick<
    Parameters<typeof NumberStepper>[0],
    'value' | 'onChange' | 'onStep' | 'disabled' | 'onSubmit'
  >,
) {
  return (
    <NumberStepper
      {...props}
      format={formatPlain}
      parse={parsePlain}
      unit="%"
      label="Body fat percentage"
      stepLabel="body fat by 0.1%"
    />
  );
}

/**
 * A weight stepper that holds kilograms and shows the account's unit. Typing a shown value
 * unchanged keeps the precise stored kilograms, as the web's WeightInput does.
 */
export function WeightStepper({
  weightKg,
  unit,
  label,
  ...props
}: Pick<
  Parameters<typeof NumberStepper>[0],
  'onChange' | 'onStep' | 'disabled' | 'onSubmit' | 'step'
> & {
  weightKg: number | null;
  unit: WeightUnit;
  label?: string;
}) {
  return (
    <NumberStepper
      {...props}
      value={weightKg}
      format={(kg) => weightInputValue(kg, unit)}
      parse={(text, current) => weightInputKg(text, unit, current)}
      unit={unit}
      label={label ?? `Bodyweight in ${weightUnitName(unit)}`}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  step: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center' },
  value: {
    flex: 1,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 4,
  },
  input: { minWidth: 48, textAlign: 'center', paddingVertical: 0 },
});
