import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { decimalNumberOrNull } from '../../../../frontend/src/utils';
import {
  weightInputKg,
  weightInputValue,
  weightUnitName,
  type WeightUnit,
} from '../../../../frontend/src/weightUnits';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';

/**
 * A number with − and + buttons either side inside one bordered input, matching the web's
 * input outline with native tactile stepping: each tap steps the value with a selection haptic,
 * and the number itself can be typed on the decimal keypad.
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
  placeholder,
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
  placeholder?: string;
  step?: number;
  disabled?: boolean;
  onSubmit?: () => void;
}) {
  const { colors, type, radius, scheme } = useTheme();
  const [text, setText] = useState(() => format(value));
  const [focused, setFocused] = useState(false);
  const latest = useRef(value);
  useEffect(() => {
    if (value === latest.current) return;
    latest.current = value;
    setText(format(value));
  }, [value, format]);

  const showUnit = text.length > 0 || (placeholder !== undefined && placeholder !== 'Optional');
  const button = (delta: number, side: 'left' | 'right') => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${delta < 0 ? 'Decrease' : 'Increase'} ${stepLabel ?? `by ${step} ${unit}`}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onStep(delta);
      }}
      style={({ pressed }) => [
        styles.step,
        side === 'left'
          ? { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.line }
          : { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.line },
        pressed && !disabled && { backgroundColor: colors.surface3 },
        disabled && { opacity: 0.45 },
      ]}
    >
      <Icon name={delta < 0 ? 'minus' : 'plus'} size={17} color={colors.secondary} />
    </Pressable>
  );

  return (
    <View
      style={[
        styles.shell,
        {
          backgroundColor: colors.surface2,
          borderColor: focused ? colors.accent : colors.lineStrong,
          borderRadius: radius.md,
        },
      ]}
    >
      {button(-step, 'left')}
      <View style={styles.value}>
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
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!disabled}
          keyboardType="decimal-pad"
          keyboardAppearance={scheme}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          returnKeyType="done"
          selectTextOnFocus
          onSubmitEditing={onSubmit}
          placeholder={placeholder ?? '0'}
          placeholderTextColor={colors.muted}
          accessibilityLabel={label}
          style={[
            text.length > 0 ? type.headline : type.body,
            type.number,
            styles.input,
            { color: colors.text },
          ]}
        />
        {showUnit && (
          <Text style={[type.footnote, { color: colors.muted, fontWeight: '600' }]}>{unit}</Text>
        )}
      </View>
      {button(step, 'right')}
    </View>
  );
}

const formatPlain = (value: number | null) => (value === null ? '' : String(value));
const parsePlain = (text: string) => decimalNumberOrNull(text);

/** A body-fat percentage stepper. */
export function BodyFatStepper(
  props: Pick<
    Parameters<typeof NumberStepper>[0],
    'value' | 'onChange' | 'onStep' | 'disabled' | 'onSubmit' | 'placeholder'
  >,
) {
  return (
    <NumberStepper
      placeholder="Optional"
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
  'onChange' | 'onStep' | 'disabled' | 'onSubmit' | 'step' | 'placeholder'
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
  shell: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 46,
    borderWidth: 1,
    overflow: 'hidden',
  },
  step: { width: 44, height: 46, alignItems: 'center', justifyContent: 'center' },
  value: {
    flex: 1,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    gap: 4,
  },
  input: { minWidth: 56, textAlign: 'center', paddingVertical: 0 },
});
