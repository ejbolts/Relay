import { useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { formatSeconds } from '../../../../frontend/src/utils';
import { haptics } from '../../ui/haptics';
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
      onPress={() => {
        haptics.tap();
        onInsert();
      }}
      // A 26 pt circle, as the web's outlined "+", in a 44 pt touch area of its own.
      style={({ pressed }) => [styles.insertTouch, pressed && { opacity: 0.6 }]}
    >
      <View
        style={[
          styles.insert,
          { backgroundColor: colors.surface, borderColor: `${colors.accent}8C` },
        ]}
      >
        <Icon name="plus" size={14} color={colors.accentText} />
      </View>
    </Pressable>
  );
}

const DASHES = Array.from({ length: 48 }, (_, index) => index);

/** The divider's line either side of the rest: solid under a rest, dashed in an open gap. */
function Rule({ dashed }: { dashed?: boolean }) {
  const { colors } = useTheme();
  if (!dashed) return <View style={[styles.rule, { backgroundColor: colors.line }]} />;
  return (
    <View style={styles.dashes}>
      {DASHES.map((index) => (
        <View key={index} style={[styles.dash, { backgroundColor: colors.lineStrong }]} />
      ))}
    </View>
  );
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
          trigger={{ text: `${text} ↕`, color }}
          width={76}
          height={32}
          touch={{ height: 44 }}
          fill={ghost ? colors.surface : colors.surface2}
          cornerRadius={16}
          style={[
            styles.pill,
            {
              backgroundColor: ghost ? colors.surface : colors.surface2,
              borderColor: ghost ? colors.lineStrong : 'transparent',
            },
          ]}
        >
          <View style={styles.pillContent}>
            <Text style={[type.callout, type.number, { color, fontWeight: '600' }]}>{text}</Text>
            <Icon
              name={{ sf: 'chevron.up.chevron.down', md: 'unfold-more' }}
              size={14}
              color={color}
            />
          </View>
        </MenuButton>
        <Text style={[styles.restWord, { color: colors.muted }]}>Rest</Text>
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
  const { colors } = useTheme();
  if (!onInsert && !onAddRest) return null;
  return (
    <View style={[styles.row, styles.insertRow]}>
      <View style={styles.lead}>
        {onInsert && <InsertButton beforeSet={beforeSet} onInsert={onInsert} />}
      </View>
      <Rule dashed />
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
            trigger={{ text: '+ REST', color: colors.muted }}
            width={76}
            height={30}
            touch={{ height: 44 }}
            fill={colors.surface}
            cornerRadius={15}
            style={[styles.pill, styles.addRest, { borderColor: colors.lineStrong }]}
          >
            <View style={styles.pillContent}>
              <Icon name="plus" size={12} color={colors.muted} />
              <Text style={[styles.restWord, { color: colors.muted }]}>Rest</Text>
            </View>
          </MenuButton>
          <Rule dashed />
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
    minHeight: 44,
  },
  insertRow: { minHeight: 44 },
  lead: { width: 34, alignItems: 'center' },
  // Wider than its 34 pt column; the rule beside it takes no touches, so nothing overlaps.
  insertTouch: {
    width: 44,
    height: 44,
    marginHorizontal: -5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insert: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  dashes: { flex: 1, height: 1, flexDirection: 'row', gap: 4, overflow: 'hidden' },
  dash: { width: 4, height: 1 },
  pill: {
    minWidth: 52,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  restWord: { fontSize: 11, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  addRest: { height: 30, borderRadius: 15, borderStyle: 'dashed' },
  remove: {
    width: 56,
    marginLeft: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
