import { Pressable, StyleSheet, Text, View } from 'react-native';
import { pageSlots } from '../../../../frontend/src/pagination';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';

/**
 * The web's pager (`PaginationControls`): ‹ 1 … 14 … 30 ›, arrows plus at most five page
 * buttons from the shared `pageSlots`, a gap as a plain marker. Hidden while everything fits on
 * one page. `label` names what is paged: "machine workout" reads "Next machine workout page".
 */
export function ListPager({
  currentPage,
  totalPages,
  label,
  onPageChange,
}: {
  /** 1-based. */
  currentPage: number;
  totalPages: number;
  label: string;
  onPageChange: (page: number) => void;
}) {
  const { colors, type, radius } = useTheme();
  const last = Math.max(totalPages, 1);
  if (last <= 1) return null;
  const current = Math.min(Math.max(1, currentPage), last);
  const turnTo = (page: number) => {
    const next = Math.min(last, Math.max(1, page));
    if (next === current) return;
    haptics.selection();
    onPageChange(next);
  };
  const arrow = (direction: -1 | 1) => {
    const disabled = direction < 0 ? current === 1 : current === last;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${direction < 0 ? 'Previous' : 'Next'} ${label} page`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => turnTo(current + direction)}
        style={({ pressed }) => [styles.slot, pressed && { opacity: 0.6 }]}
      >
        <Icon
          name={direction < 0 ? 'chevronLeft' : 'chevronRight'}
          size={16}
          color={disabled ? colors.deemph : colors.accentText}
        />
      </Pressable>
    );
  };
  return (
    <View
      accessibilityLabel={`${label.charAt(0).toUpperCase()}${label.slice(1)} pages`}
      style={styles.pager}
    >
      {arrow(-1)}
      {pageSlots(current, last).map((slot, index) =>
        slot === null ? (
          <Text
            key={`gap-${index}`}
            importantForAccessibility="no"
            style={[type.callout, styles.gap, { color: colors.muted }]}
          >
            …
          </Text>
        ) : (
          <Pressable
            key={slot}
            accessibilityRole="button"
            accessibilityLabel={`Page ${slot} of ${last}`}
            accessibilityState={{ selected: slot === current }}
            onPress={() => turnTo(slot)}
            style={({ pressed }) => [styles.slot, pressed && { opacity: 0.6 }]}
          >
            <View
              style={[
                styles.page,
                { borderRadius: radius.sm },
                slot === current && { backgroundColor: colors.accent },
              ]}
            >
              <Text
                style={[
                  type.callout,
                  type.number,
                  {
                    color: slot === current ? colors.onAccent : colors.text,
                    fontWeight: slot === current ? '700' : '500',
                  },
                ]}
              >
                {slot}
              </Text>
            </View>
          </Pressable>
        ),
      )}
      {arrow(1)}
    </View>
  );
}

const styles = StyleSheet.create({
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 },
  slot: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  page: { minWidth: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  gap: { minWidth: 20, textAlign: 'center' },
});
