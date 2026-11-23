import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BLOCK_COLOR_CHOICES,
  isPaletteColor,
  validBlockColor,
} from '../../../../frontend/src/blockColors';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { FieldLabel } from './parts';

const DEFAULT_CUSTOM = '#3a7bd5';

/**
 * A block's colour: automatic, one of the palette's, or a custom hex colour. The web's colour
 * picker becomes a hex field here, since neither platform has a native colour well in Expo Go.
 */
export function BlockColorField({
  value,
  automatic,
  onChange,
  disabled,
}: {
  value: string | null;
  /** The colour the block gets without a choice. */
  automatic: string;
  onChange: (color: string | null) => void;
  disabled?: boolean;
}) {
  const { colors, type, radius } = useTheme();
  const custom = value !== null && !isPaletteColor(value) ? value.toLowerCase() : null;
  // The last custom colour stays on the chip after picking a palette colour, to return to it.
  const [lastCustom, setLastCustom] = useState(custom ?? DEFAULT_CUSTOM);
  const [hex, setHex] = useState(custom ?? '');
  const pick = (color: string | null) => {
    void Haptics.selectionAsync();
    onChange(color);
  };
  const chip = (on: boolean) => [
    styles.chip,
    {
      borderRadius: radius.pill,
      backgroundColor: on ? colors.accentSoft : colors.surface2,
      borderColor: on ? colors.accent : 'transparent',
    },
  ];
  return (
    <View style={{ gap: 10 }}>
      <FieldLabel>Colour</FieldLabel>
      <View style={styles.modes}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Automatic colour"
          accessibilityState={{ selected: value === null, disabled: !!disabled }}
          disabled={disabled}
          onPress={() => pick(null)}
          style={chip(value === null)}
        >
          <View style={[styles.dot, { backgroundColor: automatic }]} />
          <Text style={[type.footnote, { color: colors.text, fontWeight: '600' }]}>Auto</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Custom colour"
          accessibilityState={{ selected: !!custom, disabled: !!disabled }}
          disabled={disabled}
          onPress={() => {
            if (custom) return;
            setHex(lastCustom);
            pick(lastCustom);
          }}
          style={chip(!!custom)}
        >
          <View style={[styles.dot, { backgroundColor: custom ?? lastCustom }]} />
          <Text style={[type.footnote, { color: colors.text, fontWeight: '600' }]}>Custom</Text>
        </Pressable>
        {custom && (
          <TextInput
            accessibilityLabel="Hex colour"
            value={hex}
            maxLength={7}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!disabled}
            onChangeText={(typed) => {
              const next = typed.trim().startsWith('#') ? typed.trim() : `#${typed.trim()}`;
              setHex(next);
              if (validBlockColor(next)) {
                setLastCustom(next.toLowerCase());
                onChange(next.toLowerCase());
              }
            }}
            onBlur={() => setHex(custom)}
            style={[
              type.callout,
              type.number,
              styles.hex,
              {
                color: colors.text,
                backgroundColor: colors.surface2,
                borderRadius: radius.md,
                borderColor: validBlockColor(hex) ? 'transparent' : colors.danger,
              },
            ]}
          />
        )}
      </View>
      <View
        style={styles.swatches}
        accessibilityRole="radiogroup"
        accessibilityLabel="Colour palette"
      >
        {BLOCK_COLOR_CHOICES.map((choice) => {
          const on = value?.toLowerCase() === choice.hex;
          return (
            <Pressable
              key={choice.hex}
              accessibilityRole="radio"
              accessibilityLabel={choice.name}
              accessibilityState={{ checked: on, disabled: !!disabled }}
              disabled={disabled}
              hitSlop={2}
              onPress={() => pick(choice.hex)}
              style={[
                styles.swatch,
                { backgroundColor: choice.hex, borderColor: on ? colors.text : 'transparent' },
              ]}
            >
              {on && <Icon name="check" size={12} color={colors.page} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  modes: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 34,
    borderWidth: 1,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  hex: { minWidth: 96, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
