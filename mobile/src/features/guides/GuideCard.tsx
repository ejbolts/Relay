import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { guideIcons } from './icons';

export interface GuideNext {
  label?: string;
  disabled?: boolean;
  onPress: () => void;
}

/**
 * One step of a guide, as the web's guide card: a kicker with the step count, Skip guide, the
 * step's title and text, Back and Next, and the progress along its bottom.
 */
export function GuideCard({
  guide,
  index,
  total,
  title,
  onBack,
  next,
  onLeave,
  folded = false,
  handle,
  children,
}: {
  /** The guide's name in the kicker, such as "Quick tour". */
  guide: string;
  index: number;
  total: number;
  title: string;
  onBack?: () => void;
  next?: GuideNext;
  onLeave: () => void;
  /** Folded away to the kicker, title, Next and progress, to see more of the screen. */
  folded?: boolean;
  /** A grabber above the kicker, for a card that folds. */
  handle?: ReactNode;
  children: ReactNode;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.card}>
      {handle}
      <View style={styles.header}>
        <View style={styles.kicker}>
          <Icon name={guideIcons.sparkle} size={14} color={colors.accentText} />
          <Text style={[type.eyebrow, { color: colors.accentText }]}>
            {guide} · {index + 1} of {total}
          </Text>
        </View>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={onLeave}>
          <Text style={[type.footnote, { color: colors.muted, fontWeight: '600' }]}>
            Skip guide
          </Text>
        </Pressable>
      </View>
      <Text
        accessibilityRole="header"
        accessibilityLiveRegion="polite"
        style={[type.title, { color: colors.text }]}
      >
        {title}
      </Text>
      {!folded && children}
      {((onBack && !folded) || next) && (
        <View style={styles.actions}>
          {/* Next stays in one place, so a quick second tap never lands on Back. */}
          {onBack && !folded ? (
            <Button
              label="Back"
              variant="secondary"
              icon="chevronLeft"
              style={{ flex: 1 }}
              onPress={onBack}
            />
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {next ? (
            <Button
              label={next.label ?? 'Next'}
              disabled={next.disabled}
              style={{ flex: 1 }}
              onPress={next.onPress}
            />
          ) : (
            <View style={{ flex: 1 }} />
          )}
        </View>
      )}
      <View style={styles.progress} accessibilityElementsHidden importantForAccessibility="no">
        {Array.from({ length: total }, (_, item) => (
          <View
            key={item}
            style={[
              styles.dot,
              { backgroundColor: item <= index ? colors.accent : colors.surface3 },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

export function GuideText({ children }: { children: ReactNode }) {
  const { colors, type } = useTheme();
  return <Text style={[type.body, { color: colors.secondary }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', gap: 10 },
  progress: { flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 4, borderRadius: 2 },
});
