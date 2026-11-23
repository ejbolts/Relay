import { StyleSheet, Text, View } from 'react-native';
import { blockColor } from '../../../../frontend/src/blockColors';
import { blockStrip } from '../../../../frontend/src/trainingBlockSegments';
import type { TrainingBlocks } from '../../../../frontend/src/types';
import { useTheme } from '../../ui/theme';

const DARK_INK = '#0b0d0f';

/** Home's proportional strip of how blocks divide the logged history (the web's timeline). */
export function BlockStrip({
  config,
  currentId,
  today,
}: {
  config: TrainingBlocks;
  currentId?: string;
  today: string;
}) {
  const { colors, type, radius } = useTheme();
  const strip = blockStrip(config, currentId, today);
  if (!strip) return null;
  return (
    <View style={{ gap: 4 }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={strip.label}
        style={[styles.bar, { borderRadius: radius.sm }]}
      >
        {strip.segments.map((item) => {
          const block = config.blocks.find((entry) => entry.id === item.id);
          const fill =
            item.color ??
            (item.tone === 'current'
              ? colors.accent
              : item.tone === 'earlier' || !block
                ? colors.surface3
                : blockColor(config.blocks, block, today));
          const ink =
            item.ink ??
            (item.tone === 'current'
              ? colors.onAccent
              : item.tone === 'earlier'
                ? colors.secondary
                : DARK_INK);
          return (
            <View
              key={item.id}
              style={[
                styles.segment,
                { flexGrow: item.days, backgroundColor: fill },
                item.tone === 'current' && { borderColor: colors.accentText, borderWidth: 1 },
              ]}
            >
              <Text
                style={[type.caption, { color: ink, fontWeight: '600' }]}
                numberOfLines={1}
                ellipsizeMode="clip"
              >
                {item.label}
              </Text>
              {item.marked && strip.progress !== null && (
                <View
                  style={[
                    styles.today,
                    { left: `${strip.progress * 100}%`, backgroundColor: colors.text },
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        <Text style={[type.caption, { color: colors.muted }]}>{strip.startLabel}</Text>
        <Text style={[type.caption, { color: colors.muted }]}>{strip.endLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', height: 26, gap: 2, overflow: 'hidden' },
  segment: {
    flexBasis: 0,
    flexShrink: 1,
    minWidth: 4,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  today: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
});
