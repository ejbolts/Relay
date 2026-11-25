import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ComponentRef, type Ref } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  exerciseMuscleCredits,
  formatMuscleCreditSets,
  isCardioExercise,
  partialSetsEnabledForWeek,
  selectPartialSetWeek,
} from '../../../../frontend/src/exercisePartialSets';
import { addDays, weekStartDayOf, weekStartFor } from '../../../../frontend/src/trainingSummary';
import type { Exercise } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { useExercises, useTrainingPreferences } from '../../data/queries';
import { Switch } from '../../ui/controls';
import { DateField } from '../../ui/DateField';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { isToastAccountCurrent, toastAccount } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { updateExercisePartialSets } from './exerciseInfoQueries';
import { trainingIcons } from './icons';
import { Divider } from './parts';

/**
 * The (?) button that opens an exercise's muscle set credits explanation, used in the exercise
 * list, exercise detail header and exercise picker.
 */
export function ExerciseMuscleHelpButton({
  exercise,
  onPress,
  variant = 'row',
  ref,
}: {
  exercise: Pick<Exercise, 'name'>;
  onPress: () => void;
  /** `header` matches ExerciseOptionsMenu's circular pill in the detail navigation bar. */
  variant?: 'row' | 'header';
  /** Trigger node ref, used by the inline picker overlay to restore screen-reader focus on close. */
  ref?: Ref<ComponentRef<typeof Pressable>>;
}) {
  const { colors } = useTheme();
  const header = variant === 'header';
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      accessibilityLabel={`Muscle set credits for ${exercise.name}`}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [
        styles.triggerTouch,
        !header && styles.rowTriggerTouch,
        pressed && { opacity: 0.65 },
      ]}
    >
      {header ? (
        <View style={[styles.headerPill, { backgroundColor: colors.surface2 }]}>
          <Icon name={trainingIcons.help} size={18} color={colors.accentText} />
        </View>
      ) : (
        <Icon name={trainingIcons.help} size={19} color={colors.secondary} />
      )}
    </Pressable>
  );
}

/**
 * Explains which muscles an exercise trains and how many sets it credits to each, with the
 * weekly partial-sets toggle matching the web's ExerciseMuscleHelp dialog.
 */
export function ExerciseMuscleHelpSheet({
  exercise,
  onClose,
  inline = false,
}: {
  exercise: Exercise | null;
  onClose: () => void;
  /**
   * Renders as an in-modal bottom sheet instead of a nested RN Modal, so opening from inside
   * ExercisePicker's Modal works reliably on both iOS and Android.
   */
  inline?: boolean;
}) {
  if (!exercise) return null;
  return <ExerciseMuscleHelpContent exercise={exercise} onClose={onClose} inline={inline} />;
}

function ExerciseMuscleHelpContent({
  exercise: passedExercise,
  onClose,
  inline,
}: {
  exercise: Exercise;
  onClose: () => void;
  inline: boolean;
}) {
  const { colors, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const exercises = useExercises().data;
  const preferencesQuery = useTrainingPreferences();
  const preferencesReady = preferencesQuery.data !== undefined;
  const ownedExercise = exercises?.find((item) => item.id === passedExercise.id);
  const exercise = ownedExercise ?? passedExercise;

  const weekStartDay = weekStartDayOf(preferencesQuery.data?.week_start);
  const today = localDate();
  const currentWeek = weekStartFor(today, weekStartDay);
  const [pickedWeek, setPickedWeek] = useState<{ date: string; weekStartDay: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inlineTitleRef = useRef<ComponentRef<typeof Text>>(null);

  useEffect(() => {
    if (!inline) return;
    // Move screen-reader focus into the overlay once it has laid out.
    const frame = requestAnimationFrame(() => {
      if (inlineTitleRef.current) {
        AccessibilityInfo.sendAccessibilityEvent(inlineTitleRef.current, 'focus');
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [inline, exercise.id]);

  // If the account's week-start preference changes while the sheet is open, re-snap any picked
  // week to the new week start (clamped to currentWeek).
  const selectedWeek = (() => {
    if (!pickedWeek) return currentWeek;
    if (pickedWeek.weekStartDay === weekStartDay) return pickedWeek.date;
    const resnapped = weekStartFor(pickedWeek.date, weekStartDay);
    return resnapped > currentWeek ? currentWeek : resnapped;
  })();

  const cardio = isCardioExercise(exercise);
  const { credits, direct, partial } = exerciseMuscleCredits(exercise);
  const partialEnabled = partialSetsEnabledForWeek(exercise, selectedWeek);
  const controlsDisabled = saving || !preferencesReady;
  const nextWeekDisabled = controlsDisabled || selectedWeek >= currentWeek;

  async function togglePartialSets() {
    if (!ownedExercise || !preferencesReady || saving) return;
    const account = toastAccount();
    setSaving(true);
    setError(null);
    try {
      await updateExercisePartialSets(client, exercise.id, !partialEnabled, selectedWeek, account);
    } catch {
      if (isToastAccountCurrent(account)) setError('Could not save partial sets. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const body = cardio ? (
    <Text style={[type.callout, { color: colors.secondary, lineHeight: 22 }]}>
      Cardio does not add strength sets to your weekly muscle totals.
    </Text>
  ) : (
    <>
      {partial.length > 0 && ownedExercise && (
        <View
          style={[
            styles.partialControl,
            {
              backgroundColor: colors.surface2,
              borderColor: colors.line,
              borderRadius: radius.lg,
            },
          ]}
        >
          <View style={styles.weekHeader}>
            <Text style={[type.callout, { color: colors.text, fontWeight: '600', flex: 1 }]}>
              Week of
            </Text>
            <View style={styles.weekStepGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Previous partial-set week"
                accessibilityState={{ disabled: controlsDisabled }}
                disabled={controlsDisabled}
                onPress={() => {
                  haptics.selection();
                  setPickedWeek({ date: addDays(selectedWeek, -7), weekStartDay });
                  setError(null);
                }}
                style={({ pressed }) => [
                  styles.weekStep,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.lineStrong,
                    borderRadius: radius.sm,
                  },
                  pressed && !controlsDisabled && { opacity: 0.7 },
                  controlsDisabled && { opacity: 0.4 },
                ]}
              >
                <Icon name="chevronLeft" size={18} color={colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Next partial-set week"
                accessibilityState={{ disabled: nextWeekDisabled }}
                disabled={nextWeekDisabled}
                onPress={() => {
                  haptics.selection();
                  setPickedWeek({ date: addDays(selectedWeek, 7), weekStartDay });
                  setError(null);
                }}
                style={({ pressed }) => [
                  styles.weekStep,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.lineStrong,
                    borderRadius: radius.sm,
                  },
                  pressed && !nextWeekDisabled && { opacity: 0.7 },
                  nextWeekDisabled && { opacity: 0.4 },
                ]}
              >
                <Icon name="chevronRight" size={18} color={colors.text} />
              </Pressable>
            </View>
          </View>
          <DateField
            label="Partial-set week"
            value={selectedWeek}
            max={today}
            disabled={controlsDisabled}
            onChange={(date) => {
              const next = selectPartialSetWeek(date, today, weekStartDay);
              if (next) setPickedWeek({ date: next, weekStartDay });
              setError(null);
            }}
          />
          <Divider />
          <View style={styles.switchRow}>
            <Text style={[type.callout, { color: colors.text, fontWeight: '600', flex: 1 }]}>
              Count partial sets
            </Text>
            <Switch
              accessibilityLabel="Count partial sets"
              value={partialEnabled}
              disabled={controlsDisabled}
              onChange={() => void togglePartialSets()}
            />
          </View>
          {saving && (
            <Text accessibilityLiveRegion="polite" style={[type.footnote, { color: colors.muted }]}>
              Saving…
            </Text>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
              {error}
            </Text>
          )}
        </View>
      )}
      {credits.length > 0 ? (
        <View style={styles.groups}>
          {[
            { title: 'Direct work', emptyLabel: 'direct', items: direct },
            { title: 'Partial credit · assistance', emptyLabel: 'partial', items: partial },
          ].map(({ title, emptyLabel, items }) => (
            <View key={title} style={styles.group}>
              <Text
                accessibilityRole="header"
                style={[type.callout, { color: colors.text, fontWeight: '600' }]}
              >
                {title}
              </Text>
              {items.length > 0 ? (
                <View
                  style={[
                    styles.creditList,
                    {
                      backgroundColor: colors.surface2,
                      borderColor: colors.line,
                      borderRadius: radius.lg,
                    },
                  ]}
                >
                  {items.map((credit, index) => {
                    const disabledCredit = credit.sets < 1 && !partialEnabled;
                    return (
                      <View key={credit.muscle_name}>
                        {index > 0 && <Divider inset={14} />}
                        <View style={styles.creditRow}>
                          <Text style={[type.callout, { color: colors.text, flex: 1 }]}>
                            {credit.muscle_name}
                          </Text>
                          <Text
                            style={[
                              type.callout,
                              type.number,
                              disabledCredit
                                ? { color: colors.muted, fontWeight: '600' }
                                : { color: colors.text, fontWeight: '700' },
                            ]}
                          >
                            {formatMuscleCreditSets(credit.sets, partialEnabled)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={[type.footnote, { color: colors.secondary, lineHeight: 20 }]}>
                  No {emptyLabel} credits assigned.
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : (
        <Text style={[type.callout, { color: colors.secondary, lineHeight: 22 }]}>
          No muscle set credits are available for this exercise.
        </Text>
      )}
      <Text style={[type.footnote, { color: colors.secondary, lineHeight: 20 }]}>
        Partial sets carry forward from the selected week until changed again. Earlier weeks keep
        their settings. Direct sets always count; warmups and unfinished sets do not.
      </Text>
    </>
  );

  if (!inline) {
    return (
      <Sheet visible onClose={onClose} kicker="MUSCLE SET CREDITS" title={exercise.name}>
        {body}
      </Sheet>
    );
  }

  return (
    <View
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={[StyleSheet.absoluteFill, styles.inlineBackdrop]}
    >
      <Pressable style={StyleSheet.absoluteFill} accessible={false} onPress={onClose} />
      <View
        style={[styles.inlineCard, { backgroundColor: colors.surface, marginTop: insets.top + 48 }]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.lineStrong }]} />
        <ScrollView
          contentContainerStyle={[
            styles.inlineBody,
            { paddingBottom: Math.max(insets.bottom, 16) + 20 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inlineHeader}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[type.eyebrow, { color: colors.accentText }]}>MUSCLE SET CREDITS</Text>
              <Text
                ref={inlineTitleRef}
                accessible
                accessibilityRole="header"
                style={[type.title, { color: colors.text }]}
              >
                {exercise.name}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={styles.closeTouch}
            >
              {({ pressed }) => (
                <View
                  style={[
                    styles.closeFace,
                    { backgroundColor: colors.surface2 },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Icon name="close" size={15} color={colors.secondary} />
                </View>
              )}
            </Pressable>
          </View>
          {body}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  triggerTouch: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTriggerTouch: {
    marginHorizontal: -4,
  },
  headerPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partialControl: {
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weekStepGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weekStep: {
    width: 44,
    height: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    gap: 12,
  },
  groups: { gap: 16 },
  group: { gap: 8 },
  creditList: { borderWidth: 1, overflow: 'hidden' },
  creditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  inlineBackdrop: {
    zIndex: 20,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  inlineCard: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    marginTop: 8,
  },
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  inlineBody: {
    padding: 20,
    gap: 16,
  },
  closeTouch: {
    width: 44,
    height: 44,
    margin: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeFace: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
