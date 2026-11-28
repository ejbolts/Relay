import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, type KeyboardTypeOptions } from 'react-native';
import type { PartnerInput } from '../../../../frontend/src/trainTogetherInput';
import { useTheme } from '../../ui/theme';

/**
 * A number in a partner's set. It keeps exactly what is typed; a valid value is sent, empty
 * clears it, and invalid text stays in the field, outlined as invalid, and is not sent. A value
 * changed from outside (the partner's own phone) replaces the text only while not editing.
 */
export function PartnerNumberField({
  value,
  format,
  read,
  onChange,
  label,
  accent,
  done,
  keyboardType = 'decimal-pad',
  resync = 0,
}: {
  value: number | null;
  format: (value: number | null) => string;
  read: (text: string) => PartnerInput;
  onChange: (value: number | null) => void;
  label: string;
  /** The partner's colour, for the focused outline. */
  accent: string;
  done?: boolean;
  keyboardType?: KeyboardTypeOptions;
  /** Moves on when an edit came back not applied: the field then shows the server's value. */
  resync?: number;
}) {
  const { colors, radius, type } = useTheme();
  const [text, setText] = useState(() => format(value));
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const shown = useRef(value);
  const synced = useRef(resync);
  useEffect(() => {
    // Not applied: the server's value replaces the text, even while typing.
    const notApplied = resync !== synced.current;
    synced.current = resync;
    // A conflict elsewhere leaves text that already reads as the stored value alone (half-typed
    // "82." included); only a field whose own edit wasn't applied takes the server's value.
    const typed = read(text);
    const matches =
      (typed.kind === 'empty' ? null : typed.kind === 'value' ? typed.value : NaN) === value;
    if (notApplied && matches) return;
    if (!notApplied && (focused || value === shown.current)) return;
    shown.current = value;
    setText(format(value));
    setInvalid(false);
  }, [value, focused, format, resync, read, text]);
  // A focused field whose text isn't the stored value yet looks pending, not saved.
  const typed = read(text);
  const pending =
    focused &&
    !invalid &&
    (typed.kind === 'empty' ? null : typed.kind === 'value' ? typed.value : value) !== value;
  return (
    <TextInput
      value={text}
      onChangeText={(next) => {
        setText(next);
        const input = read(next);
        setInvalid(input.kind === 'invalid');
        if (input.kind === 'invalid') return;
        const parsed = input.kind === 'empty' ? null : input.value;
        shown.current = parsed;
        if (parsed !== value) onChange(parsed);
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityLabel={label}
      accessibilityHint={
        invalid ? 'Not a valid number; not sent' : pending ? 'Not saved yet' : undefined
      }
      accessibilityState={{ disabled: false }}
      keyboardType={keyboardType}
      selectTextOnFocus
      style={[
        styles.field,
        type.number,
        {
          color: colors.text,
          borderRadius: radius.md,
          backgroundColor: done && !focused && !invalid ? 'transparent' : colors.surface2,
          borderStyle: pending ? 'dashed' : 'solid',
          borderColor: invalid
            ? colors.danger
            : focused
              ? accent
              : done
                ? 'transparent'
                : colors.lineStrong,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 44,
    borderWidth: 1.5,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    paddingVertical: 6,
  },
});
