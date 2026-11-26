import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DEFAULT_WORKOUT_TYPES } from '../../../../frontend/src/workoutTypes';
import { Button } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';

/** The built-in colours first, then a spread of others that read on both themes. */
export const WORKOUT_TYPE_SWATCHES = [
  ...new Set([
    ...DEFAULT_WORKOUT_TYPES.map((type) => type.color),
    '#a855f7',
    '#ef4444',
    '#f97316',
    '#eab308',
    '#84cc16',
    '#06b6d4',
    '#0ea5e9',
    '#6366f1',
    '#ec4899',
    '#d946ef',
    '#78716c',
  ]),
];

/** Picks a workout type's colour from swatches; an unusual saved colour is kept first. */
export function ColourSheet({
  visible,
  title,
  color,
  saveLabel,
  isNew = false,
  onSave,
  onClose,
}: {
  visible: boolean;
  title: string;
  color: string;
  saveLabel: string;
  /** A new type can keep the colour it starts with; an existing one saves only a change. */
  isNew?: boolean;
  onSave: (color: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      {visible && <Swatches initial={color} saveLabel={saveLabel} isNew={isNew} onSave={onSave} />}
    </Sheet>
  );
}

function Swatches({
  initial,
  saveLabel,
  isNew,
  onSave,
}: {
  initial: string;
  saveLabel: string;
  isNew: boolean;
  onSave: (color: string) => void;
}) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState(initial.toLowerCase());
  const swatches = WORKOUT_TYPE_SWATCHES.includes(selected)
    ? WORKOUT_TYPE_SWATCHES
    : [selected, ...WORKOUT_TYPE_SWATCHES];
  return (
    <>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {swatches.map((swatch) => {
          const chosen = swatch === selected;
          return (
            <Pressable
              key={swatch}
              accessibilityRole="radio"
              accessibilityLabel={`Colour ${swatch}`}
              accessibilityState={{ checked: chosen }}
              onPress={() => {
                haptics.selection();
                setSelected(swatch);
              }}
              style={[
                styles.swatch,
                { backgroundColor: swatch, borderColor: chosen ? colors.text : 'transparent' },
              ]}
            >
              {chosen && <Icon name="check" size={18} color="#ffffff" />}
            </Pressable>
          );
        })}
      </View>
      <Button
        label={saveLabel}
        disabled={!isNew && selected === initial.toLowerCase()}
        onPress={() => onSave(selected)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  swatch: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
