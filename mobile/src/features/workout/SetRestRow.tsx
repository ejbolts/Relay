import * as Haptics from 'expo-haptics';
import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { formatSeconds } from '../../../../frontend/src/utils';
import { Icon } from '../../ui/Icon';
import { MenuButton } from '../../ui/MenuButton';
import { useTheme } from '../../ui/theme';
import { restMenuItems } from './restChoices';

/**
 * Adds a set at this point in the list, as the web's "+" between sets does: before the first set,
 * or between two sets.
 */
function InsertButton({ beforeSet, onInsert }: { beforeSet: number; onInsert: () => void }) {
  const { colors } = useTheme();
  const label = beforeSet === 1 ? 'Add set at start' : `Add set before set ${beforeSet}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onInsert();
      }}
      style={({ pressed }) => [
        styles.insert,
        { backgroundColor: colors.surface2, borderColor: colors.line },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Icon name="plus" size={11} color={colors.accentText} />
    </Pressable>
  );
}

/** The divider's hairline, either side of the rest. */
function Rule() {
  const { colors } = useTheme();
  return <View style={[styles.rule, { backgroundColor: colors.line }]} />;
}

/**
 * The rest after a set, between it and the next one, as the web's rest divider: tap to change it,
 * swipe it away to remove it. A rest only suggested from last time (`ghost`) is drawn faintly
 * until it is confirmed.
 */
export function SetRestRow({
  setNumber,
  seconds,
  ghost,
  onChange,
  onRemove,
  onInsert,
}: {
  /** The set the rest follows. */
  setNumber: number;
  seconds: number;
  ghost: boolean;
  onChange: (seconds: number) => void;
  onRemove: () => void;
  /** Adds a set after `setNumber`, shown at the start of the divider. */
  onInsert?: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const swipeable = useRef<{ close: () => void } | null>(null);
  const text = formatSeconds(seconds);
  const color = ghost ? colors.muted : colors.secondary;
  return (
    <ReanimatedSwipeable
      ref={(methods) => {
        swipeable.current = methods;
      }}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      renderRightActions={() => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove rest after set ${setNumber}`}
          onPress={() => {
            swipeable.current?.close();
            onRemove();
          }}
          style={[styles.remove, { backgroundColor: colors.dangerFill, borderRadius: radius.sm }]}
        >
          <Icon name="trash" size={14} color={colors.onAccent} />
        </Pressable>
      )}
    >
      <View style={[styles.row, { backgroundColor: colors.surface }]}>
        <View style={styles.lead}>
          {onInsert && <InsertButton beforeSet={setNumber + 1} onInsert={onInsert} />}
        </View>
        <Rule />
        <MenuButton
          accessibilityLabel={`Rest after set ${setNumber}: ${text}${ghost ? ', suggested' : ''}`}
          title={`Rest after set ${setNumber}`}
          items={restMenuItems({ current: seconds, onPick: onChange, onNone: onRemove })}
          trigger={{ text: `${text} rest`, color }}
          width={86}
          height={26}
          fill={ghost ? colors.surface : colors.surface2}
          cornerRadius={13}
          style={[
            styles.pill,
            {
              backgroundColor: ghost ? colors.surface : colors.surface2,
              borderColor: ghost ? colors.line : 'transparent',
            },
          ]}
        >
          <Text style={[type.footnote, type.number, { color, fontWeight: '600' }]}>
            {text} rest
          </Text>
        </MenuButton>
        <Rule />
      </View>
    </ReanimatedSwipeable>
  );
}

/**
 * The gap between two sets with no rest showing, as the web's insert row: "+" adds a set here,
 * and Rest adds the rest after the set above from a menu of rest times. Above the first set it
 * offers only "+".
 */
export function SetInsertRow({
  beforeSet,
  onInsert,
  onAddRest,
  suggestedRest,
}: {
  /** The number of the set a new set goes before (1 for the start of the list). */
  beforeSet: number;
  onInsert?: () => void;
  onAddRest?: (seconds: number) => void;
  /** Where Custom… starts, usually the nearest rest in the exercise. */
  suggestedRest?: number;
}) {
  const { colors, type } = useTheme();
  if (!onInsert && !onAddRest) return null;
  return (
    <View style={[styles.row, styles.insertRow]}>
      <View style={styles.lead}>
        {onInsert && <InsertButton beforeSet={beforeSet} onInsert={onInsert} />}
      </View>
      <Rule />
      {onAddRest && (
        <>
          <MenuButton
            accessibilityLabel={`Add rest after set ${beforeSet - 1}`}
            title={`Rest after set ${beforeSet - 1}`}
            items={restMenuItems({
              current: null,
              onPick: onAddRest,
              customStart: suggestedRest,
            })}
            trigger={{ text: 'Rest', color: colors.muted }}
            width={52}
            height={22}
            fill={colors.surface}
            cornerRadius={11}
            style={[styles.pill, styles.addRest, { borderColor: colors.line }]}
          >
            <Text style={[type.caption, { color: colors.muted, fontWeight: '600' }]}>Rest</Text>
          </MenuButton>
          <Rule />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    minHeight: 30,
  },
  insertRow: { minHeight: 24 },
  lead: { width: 34, alignItems: 'center' },
  insert: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  pill: {
    minWidth: 52,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRest: { height: 22, borderRadius: 11 },
  remove: {
    width: 56,
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
