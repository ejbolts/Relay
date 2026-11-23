import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  bodyFigureKindForSex,
  bodySizeUnit,
  sharedBodyFigureValues,
} from '../../../../../frontend/src/bodySizeEntries';
import type { BodySizeLog } from '../../../../../frontend/src/bodySizes';
import type { Sex } from '../../../../../frontend/src/types';
import { useWeightUnit } from '../../../data/queries';
import { Card, CardHeader } from '../../../ui/components';
import { haptics } from '../../../ui/haptics';
import { Icon } from '../../../ui/Icon';
import { useTheme } from '../../../ui/theme';
import { BodyFigure } from '../../body/BodyFigure';

const shortDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/**
 * A member's shared tape measurements on their body outline, one dated entry at a time,
 * read-only and in the viewer's unit.
 */
export function ProfileBodySizesCard({
  entries,
  sex,
}: {
  /** Newest first. */
  entries: BodySizeLog[];
  sex: Sex | null | undefined;
}) {
  const { colors, radius, type } = useTheme();
  const weightUnit = useWeightUnit();
  const size = useMemo(() => bodySizeUnit(weightUnit), [weightUnit]);
  const [index, setIndex] = useState(0);
  const shownIndex = entries.length ? Math.min(index, entries.length - 1) : 0;
  const shown = entries[shownIndex];
  const values = useMemo(() => (shown ? sharedBodyFigureValues(shown, size) : {}), [shown, size]);

  return (
    <Card accessibilityLabel="Body measurements">
      <CardHeader title="Body measurements" />
      {!shown ? (
        <Text style={[type.callout, { color: colors.secondary }]}>No body measurements yet.</Text>
      ) : (
        <>
          <View
            style={[
              styles.stepperBar,
              { backgroundColor: colors.surface2, borderRadius: radius.md },
            ]}
          >
            {entries.length > 1 ? (
              <StepButton
                label="Earlier measurements"
                icon="chevronLeft"
                disabled={shownIndex >= entries.length - 1}
                onPress={() => setIndex(shownIndex + 1)}
              />
            ) : (
              <View style={styles.stepSpacer} />
            )}
            <Text
              style={[
                type.callout,
                type.number,
                styles.stepperDate,
                { color: colors.text, fontWeight: '600' },
              ]}
              numberOfLines={1}
            >
              {shortDate(shown.measurement_date)}
            </Text>
            {entries.length > 1 ? (
              <StepButton
                label="Later measurements"
                icon="chevronRight"
                disabled={shownIndex === 0}
                onPress={() => setIndex(shownIndex - 1)}
              />
            ) : (
              <View style={styles.stepSpacer} />
            )}
          </View>
          <BodyFigure kind={bodyFigureKindForSex(sex)} unit={size.unit} values={values} />
        </>
      )}
    </Card>
  );
}

function StepButton({
  label,
  icon,
  disabled,
  onPress,
}: {
  label: string;
  icon: 'chevronLeft' | 'chevronRight';
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.stepButton,
        { borderRadius: radius.sm },
        pressed && !disabled && { backgroundColor: colors.surface3 },
        disabled && { opacity: 0.3 },
      ]}
    >
      <Icon name={icon} size={18} color={colors.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepperBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    padding: 2,
  },
  stepperDate: { flex: 1, textAlign: 'center', fontSize: 14 },
  stepButton: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepSpacer: { width: 44, height: 40 },
});
