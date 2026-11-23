import { Pressable, StyleSheet, Text, View } from 'react-native';
import { blockColor } from '../../../../frontend/src/blockColors';
import type { TrainingBlock, TrainingBlocks } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { Icon } from '../../ui/Icon';
import { useTheme, type Palette } from '../../ui/theme';

/**
 * A block's colour on the phone. The shared rule names the running block's automatic colour
 * as the web's accent variable, which is the accent text colour here.
 */
export const nativeBlockColor = (color: string, colors: Palette) =>
  color.startsWith('var(') ? colors.accentText : color;

/**
 * Progress covers only this block: says so, and brings the whole history back in one tap.
 */
export function BlockScopeChip({
  block,
  config,
  onClear,
}: {
  block: TrainingBlock;
  config: TrainingBlocks;
  onClear: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const color = nativeBlockColor(blockColor(config.blocks, block, localDate()), colors);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Showing the ${block.name} block only. Show all time`}
      onPress={onClear}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: colors.surface2, borderRadius: radius.pill },
        pressed && { opacity: 0.6 },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[type.footnote, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
        {block.name}
      </Text>
      <Icon name="close" size={12} color={colors.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    minHeight: 28,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
