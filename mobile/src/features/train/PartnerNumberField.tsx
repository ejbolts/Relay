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
}) {
  const { colors, radius, type } = useTheme();
  const [text, setText] = useState(() => format(value));
  const [focused, setFocused] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const shown = useRef(value);
  useEffect(() => {
    if (focused || value === shown.current) return;
    shown.current = value;
    setText(format(value));
    setInvalid(false);
  }, [value, focused, format]);
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
      accessibilityHint={invalid ? 'Not a valid number; not sent' : undefined}
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
