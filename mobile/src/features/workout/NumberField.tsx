import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import { Keyboard, Platform, StyleSheet, TextInput, type KeyboardTypeOptions } from 'react-native';
import { decimalNumberOrNull } from '../../../../frontend/src/utils';
import { useTheme } from '../../ui/theme';

/**
 * A number entry for a set: it keeps exactly what is typed (such as "82." on the way to "82.5")
 * and reports the parsed value on every keystroke, so the stored workout always has it. A value
 * changed from outside (a suggestion moving on) replaces the text. An empty field shows a dash,
 * as the web's empty set input shows nothing: never last time's value, which could be read as
 * still being there.
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
    onSubmitEditing,
  },
  ref,
) {
  const { colors, type, radius, scheme } = useTheme();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => format(value));
  const latest = useRef(value);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  useImperativeHandle(ref, () => input.current!, []);
  // Android's Back hides the keyboard but leaves the field focused, with its outline and caret
  // on a logged set's row: hiding the keyboard ends the edit, as it does on iOS.
  useEffect(() => {
    if (!focused || Platform.OS !== 'android') return;
    const hidden = Keyboard.addListener('keyboardDidHide', () => input.current?.blur());
    return () => hidden.remove();
  }, [focused]);
  useEffect(() => {
    if (value === latest.current) return;
    latest.current = value;
    setText(format(value));
  }, [value, format]);
  return (
    <TextInput
      ref={input}
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
      placeholder="–"
      placeholderTextColor={`${colors.muted}8C`}
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
