import { forwardRef, useEffect, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, TextInput, type KeyboardTypeOptions } from 'react-native';
import { decimalNumberOrNull } from '../../../../frontend/src/utils';
import { useTheme } from '../../ui/theme';

/**
 * A number entry for a set: it keeps exactly what is typed (such as "82." on the way to "82.5")
 * and reports the parsed value on every keystroke, so the stored workout always has it. A value
 * changed from outside (a suggestion moving on) replaces the text.
 */
export const NumberField = forwardRef<
  ComponentRef<typeof TextInput>,
  {
    value: number | null;
    format: (value: number | null) => string;
    parse: (text: string) => number | null;
    onChange: (value: number | null) => void;
    label: string;
    keyboardType?: KeyboardTypeOptions;
    /** Shown muted: a value copied from last time, used if the set is logged as it is. */
    suggested?: boolean;
    done?: boolean;
    /** Shown faintly while empty, such as last time's value. */
    placeholder?: string;
    onSubmitEditing?: () => void;
  }
>(function NumberField(
  {
    value,
    format,
    parse,
    onChange,
    label,
    keyboardType = 'decimal-pad',
    suggested,
    done,
    placeholder,
    onSubmitEditing,
  },
  ref,
) {
  const { colors, type, radius, scheme } = useTheme();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => format(value));
  const latest = useRef(value);
  useEffect(() => {
    if (value === latest.current) return;
    latest.current = value;
    setText(format(value));
  }, [value, format]);
  return (
    <TextInput
      ref={ref}
      value={text}
      onChangeText={(next) => {
        setText(next);
        const parsed = parse(next);
        latest.current = parsed;
        if (parsed !== value) onChange(parsed);
      }}
      onSubmitEditing={onSubmitEditing}
      keyboardType={keyboardType}
      returnKeyType="done"
      selectTextOnFocus
      placeholder={placeholder || '–'}
      placeholderTextColor={colors.muted}
      selectionColor={colors.accent}
      cursorColor={colors.accent}
      keyboardAppearance={scheme}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityLabel={suggested ? `${label}, suggested value` : label}
      style={[
        type.body,
        type.number,
        styles.field,
        {
          borderRadius: radius.sm,
          // The web's set input: a raised field with a strong outline, accent while typing; a
          // logged set reads as plain numbers on its green row.
          backgroundColor: done && !focused ? 'transparent' : colors.surface2,
          borderColor: focused ? colors.accent : done ? 'transparent' : colors.lineStrong,
          color: suggested && !done ? colors.muted : colors.text,
          fontWeight: '600',
        },
      ]}
    />
  );
});

const styles = StyleSheet.create({
  field: {
    flex: 1,
    minWidth: 52,
    height: 38,
    borderWidth: 1,
    paddingHorizontal: 6,
    fontSize: 15,
    textAlign: 'center',
  },
});

/** Whole numbers only, such as reps or heart rate. */
export function parseWhole(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Decimals with either separator, such as "82.5" or "82,5", as the web reads them. */
export const parseDecimal = decimalNumberOrNull;

export const formatPlain = (value: number | null) =>
  value === null ? '' : String(Number(value.toFixed(2)));
