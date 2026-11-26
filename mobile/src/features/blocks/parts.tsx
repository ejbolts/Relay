import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { haptics } from '../../ui/haptics';

/** A text action in a screen's header, such as Save, that turns into a spinner while it works. */
export function HeaderTextButton({
  label,
  accessibilityLabel,
  disabled,
  busy,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const { colors, type } = useTheme();
  if (busy) return <ActivityIndicator color={colors.accentText} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
    >
      <Text
        style={[
          type.body,
          { color: colors.accentText, fontWeight: '600', opacity: disabled ? 0.4 : 1 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A small caption above a group of controls. */
export function FieldLabel({ children }: { children: string }) {
  const { colors, type } = useTheme();
  return (
    <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>{children}</Text>
  );
}

/** One choice of several, as tiles with a label and a detail under it (the web's radio tiles). */
export function ChoiceTiles<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly { value: T; label: string; detail?: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const { colors, type, radius } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel>{label}</FieldLabel>
      <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const on = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={[option.label, option.detail].filter(Boolean).join(', ')}
              accessibilityState={{ checked: on, disabled: !!disabled }}
              disabled={disabled}
              onPress={() => {
                haptics.selection();
                onChange(option.value);
              }}
              style={({ pressed }) => [
                styles.tile,
                {
                  // Three choices sit in a row; two or four make a 2 × 2 grid.
                  flexBasis: options.length % 3 === 0 ? '30%' : '45%',
                  borderRadius: radius.md,
                  backgroundColor: on ? colors.accentSoft : colors.surface2,
                  borderColor: on ? colors.accent : 'transparent',
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text
                style={[
                  type.callout,
                  { color: on ? colors.accentText : colors.text, fontWeight: '600' },
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
              {!!option.detail && (
                <Text style={[type.caption, { color: colors.secondary }]} numberOfLines={1}>
                  {option.detail}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A row in a list of choices, ticked when chosen. `children` replaces the label and detail. */
export function RadioRow({
  label,
  detail,
  selected,
  onPress,
  accessibilityLabel,
  leading,
  trailing,
  children,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const { colors, type } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? [label, detail].filter(Boolean).join(', ')}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      {leading}
      {children ?? (
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.body, { color: colors.text }]} numberOfLines={2}>
            {label}
          </Text>
          {!!detail && (
            <Text style={[type.caption, { color: colors.secondary }]} numberOfLines={1}>
              {detail}
            </Text>
          )}
        </View>
      )}
      {trailing}
      {selected && <Icon name="check" size={16} color={colors.accentText} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexGrow: 1,
    minHeight: 52,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    borderWidth: 1,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
