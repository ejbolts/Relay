import { useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  hasSplitTemplate,
  legacySplitRoutine,
  shareSplitError,
  splitDayCount,
  splitDayName,
  splitDayTotal,
  splitFailure,
  splitsActiveFirst,
  splitTemplateName,
} from '../../../../../frontend/src/splitEditing';
import { SPLIT_TEMPLATES } from '../../../../../frontend/src/trainingSplit';
import type { Routine, TrainingSplit, WorkoutType } from '../../../../../frontend/src/types';
import { localDate } from '../../../../../frontend/src/utils';
import { useWorkoutTypes } from '../../../data/queries';
import {
  Button,
  buttonColors,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  Loading,
} from '../../../ui/components';
import { haptics } from '../../../ui/haptics';
import { Icon } from '../../../ui/Icon';
import { showMenu } from '../../../ui/prompts';
import { Sheet } from '../../../ui/Sheet';
import { showToast } from '../../../ui/Toast';
import { useTheme } from '../../../ui/theme';
import { settingsIcons } from '../icons';
import {
  deleteRoutine,
  refreshSplits,
  saveRoutine,
  saveTrainingSplit,
  startRoutine,
  useRoutines,
  useTrainingSplit,
} from '../settingsData';
import { SettingsPage } from '../SettingsList';
import { SplitGuide } from './SplitGuide';
import { DateStepper, SplitPattern, SplitPreview } from './SplitParts';

/** Your splits, as the web's split page: the library, the active split's week, and templates. */
export function SplitLibraryScreen() {
  const routines = useRoutines();
  const split = useTrainingSplit();
  const types = useWorkoutTypes();
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  if (routines.isPending || split.isPending) return <Loading label="Loading splits" />;
  const error = routines.error ?? split.error;
  if (error && (!routines.data || split.data === undefined))
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={() => {
          void routines.refetch();
          void split.refetch();
        }}
      />
    );
  return (
    <Library
      routines={routines.data!}
      split={split.data ?? null}
      types={types.data ?? []}
      typesReady={!types.isPlaceholderData && !types.error}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        void refreshSplits(client).finally(() => setRefreshing(false));
      }}
    />
  );
}

function Library({
  routines,
  split,
  types,
  typesReady,
  refreshing,
  onRefresh,
}: {
  routines: Routine[];
  split: TrainingSplit | null;
  types: WorkoutType[];
  typesReady: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const { colors, type } = useTheme();
  const [using, setUsing] = useState<Routine | null>(null);
  const [busy, setBusy] = useState(false);
  const activeId = split?.enabled ? (split.routine_id ?? 'current-split') : null;
  const legacy = legacySplitRoutine(split, types);
  const displayed = splitsActiveFirst([...(legacy ? [legacy] : []), ...routines], activeId);
  const [expanded, setExpanded] = useState<string | null>(activeId);
  // Active split's exercise breakdown starts collapsed (matching web) so Templates stay above the fold.
  const [exercisesOpen, setExercisesOpen] = useState<Record<string, boolean>>({});
  const secondary = buttonColors(colors, 'secondary');

  const edit = (params: { id: string } | { template: string }) =>
    router.push({ pathname: '/split/edit', params });

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      await refreshSplits(client);
    } catch (reason) {
      // A failure needs reading (it may say what to fix), so it doesn't fade like a toast.
      Alert.alert(splitFailure(reason));
    } finally {
      setBusy(false);
    }
  }

  function options(routine: Routine) {
    showMenu(routine.name, [
      {
        label: routine.shared ? 'Hide from my profile' : 'Show on my profile',
        onPress: () =>
          void run(async () => {
            const shareError = shareSplitError(routine);
            if (shareError) throw new Error(shareError);
            const saved = await saveRoutine({ ...routine, shared: !routine.shared });
            showToast(
              saved.shared ? 'Split shown on your profile.' : 'Split hidden from your profile.',
            );
          }),
      },
      ...(routine.id !== activeId
        ? [
            {
              label: 'Delete split',
              destructive: true,
              onPress: () =>
                Alert.alert(
                  'Delete split?',
                  `${routine.name} will be removed from your library and profile. Friends keep their saved copies.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete split',
                      style: 'destructive',
                      onPress: () =>
                        void run(async () => {
                          await deleteRoutine(routine.id);
                          showToast('Split deleted');
                        }),
                    },
                  ],
                ),
            },
          ]
        : []),
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <SplitGuide />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New split"
                disabled={!typesReady}
                hitSlop={8}
                onPress={() => edit({ template: 'custom' })}
              >
                <Icon name="plus" size={22} color={colors.accentText} />
              </Pressable>
            </View>
          ),
        }}
      />
      <SettingsPage refreshing={refreshing} onRefresh={onRefresh}>
        <View style={{ gap: 12 }}>
          <View style={styles.sectionHeader}>
            <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
              My splits
            </Text>
          </View>
          {displayed.length === 0 && (
            <EmptyState
              icon={settingsIcons.split}
              title="No saved splits"
              message="Pick a template below or build your own rotation."
              action={{
                label: 'New split',
                icon: 'plus',
                onPress: () => edit({ template: 'custom' }),
              }}
            />
          )}
          {displayed.map((routine) => {
            const active = routine.id === activeId;
            const open = expanded === routine.id;
            const showExercises = !!exercisesOpen[routine.id];
            const hasExercises = routine.days.some((day) => day.movements.length > 0);
            return (
              <Card
                key={routine.id}
                accessibilityLabel={routine.name}
                style={active ? { borderColor: colors.accent, borderWidth: 1.5 } : undefined}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={`${routine.name}, ${splitDayCount(routine.days)}${active ? ', active' : ''}`}
                  onPress={() => setExpanded(open ? null : routine.id)}
                  style={{ gap: 8 }}
                >
                  <View style={styles.cardTitle}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[type.headline, { color: colors.text }]}>{routine.name}</Text>
                      <Text style={[type.footnote, { color: colors.muted }]}>
                        {splitDayCount(routine.days)} · {routine.shared ? 'On profile' : 'Only you'}
                      </Text>
                    </View>
                    {active && (
                      <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
                        <Text
                          style={[type.caption, { color: colors.accentText, fontWeight: '700' }]}
                        >
                          Active
                        </Text>
                      </View>
                    )}
                    <Icon
                      name={open ? 'chevronUp' : 'chevronDown'}
                      size={14}
                      color={colors.muted}
                    />
                  </View>
                  <SplitPattern days={routine.days} />
                </Pressable>

                {open && (
                  <>
                    {active && split && (
                      <View style={[styles.dividerBlock, { borderTopColor: colors.line }]}>
                        <SplitPreview split={split} types={types} />
                      </View>
                    )}
                    {active ? (
                      hasExercises && (
                        <View style={{ gap: 8 }}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Exercises & sets"
                            accessibilityState={{ expanded: showExercises }}
                            onPress={() => {
                              haptics.selection();
                              setExercisesOpen((current) => ({
                                ...current,
                                [routine.id]: !current[routine.id],
                              }));
                            }}
                            style={styles.disclosure}
                          >
                            <Icon
                              name={showExercises ? 'chevronDown' : 'chevronRight'}
                              size={14}
                              color={colors.muted}
                            />
                            <Text style={[type.callout, { color: colors.secondary }]}>
                              Exercises &amp; sets
                            </Text>
                          </Pressable>
                          {showExercises && <Cycle routine={routine} />}
                        </View>
                      )
                    ) : (
                      <View style={[styles.dividerBlock, { borderTopColor: colors.line }]}>
                        <Cycle routine={routine} />
                      </View>
                    )}
                  </>
                )}

                <View style={[styles.actionsRow, { borderTopColor: colors.line }]}>
                  <Button
                    label="Edit split"
                    variant="secondary"
                    disabled={busy || !typesReady}
                    onPress={() => edit({ id: routine.id })}
                  />
                  <Button
                    label={active ? 'Change schedule' : 'Use split'}
                    variant={active ? 'secondary' : 'primary'}
                    disabled={busy}
                    onPress={() => setUsing(routine)}
                    style={{ flex: 1 }}
                  />
                  {routine.id !== 'current-split' && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Options for ${routine.name}`}
                      disabled={busy}
                      onPress={() => {
                        haptics.tap();
                        options(routine);
                      }}
                      style={({ pressed }) => [
                        styles.more,
                        {
                          backgroundColor: secondary.fill,
                          borderColor: secondary.border,
                        },
                        pressed && { opacity: 0.7 },
                        busy && { opacity: 0.45 },
                      ]}
                    >
                      <Icon name="more" size={18} color={secondary.ink} />
                    </Pressable>
                  )}
                </View>
              </Card>
            );
          })}
        </View>

        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={[type.headline, { color: colors.text }]}>
            Templates
          </Text>
          <View style={styles.templates}>
            {SPLIT_TEMPLATES.map((preset) => {
              const saved = hasSplitTemplate(routines, preset);
              return (
                <Pressable
                  key={preset.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${splitTemplateName(preset)} template${saved ? ', already in My splits' : ''}`}
                  accessibilityState={{ disabled: saved || busy || !typesReady }}
                  disabled={saved || busy || !typesReady}
                  onPress={() => {
                    haptics.tap();
                    edit({ template: preset.id });
                  }}
                  style={({ pressed }) => [
                    styles.template,
                    {
                      backgroundColor: pressed ? colors.surface2 : colors.surface,
                      borderColor: colors.lineStrong,
                    },
                    saved && { opacity: 0.55 },
                  ]}
                >
                  <View style={styles.cardTitle}>
                    <Text
                      style={[type.callout, { color: colors.text, fontWeight: '600', flex: 1 }]}
                    >
                      {splitTemplateName(preset)}
                    </Text>
                    <Icon name={saved ? 'check' : 'plus'} size={15} color={colors.accentText} />
                  </View>
                  <SplitPattern
                    dashWidth={20}
                    days={preset.types.map((id) => ({
                      workout_type: types.find((item) => item.id === id) ?? null,
                    }))}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>
      </SettingsPage>
      <UseSplitSheet
        routine={using}
        split={split}
        active={!!using && using.id === activeId}
        busy={busy}
        onClose={() => setUsing(null)}
        onUse={(startDate) => {
          const routine = using!;
          void run(async () => {
            if (routine.id === 'current-split')
              await saveTrainingSplit({
                ...split!,
                start_date: startDate,
                enabled: true,
                // Splits follow logged workouts; saving here moves a By date split over.
                progression: 'workouts',
              });
            else await startRoutine(routine.id, startDate);
            setUsing(null);
            setExpanded(routine.id);
            showToast(`Using ${routine.name}`);
          });
        }}
      />
    </>
  );
}

/** Each day of a split with its planned work. */
function Cycle({ routine }: { routine: Routine }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {routine.days.map((day, index) => {
        const total = splitDayTotal(day);
        return (
          <View key={index} style={styles.cycleDay}>
            <View
              style={[
                styles.cycleBar,
                { backgroundColor: day.workout_type?.color ?? colors.deemph, overflow: 'hidden' },
              ]}
            >
              {/* A mixed day stacks a band of each type's colour. */}
              {(day.extra_workout_types?.length ?? 0) > 0 &&
                [day.workout_type, ...(day.extra_workout_types ?? [])].map((item, at) => (
                  <View
                    key={at}
                    style={{ flex: 1, backgroundColor: item?.color ?? colors.deemph }}
                  />
                ))}
            </View>
            <Text style={[type.callout, type.number, { color: colors.muted, width: 22 }]}>
              {index + 1}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
                {splitDayName(day)}
              </Text>
              {day.movements.length > 0 && (
                <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={2}>
                  {day.movements.map((movement) => movement.exercise.name).join(' · ')}
                </Text>
              )}
            </View>
            {!!total && (
              <Text style={[type.footnote, type.number, { color: colors.secondary }]}>{total}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

function UseSplitSheet({
  routine,
  split,
  active,
  busy,
  onUse,
  onClose,
}: {
  routine: Routine | null;
  split: TrainingSplit | null;
  active: boolean;
  busy: boolean;
  onUse: (startDate: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={!!routine} title={active ? 'Change schedule' : 'Use split'} onClose={onClose}>
      {routine && (
        <UseSplitForm
          key={routine.id}
          routine={routine}
          initialDate={active ? (split?.start_date ?? localDate()) : localDate()}
          busy={busy}
          onUse={onUse}
        />
      )}
    </Sheet>
  );
}

function UseSplitForm({
  routine,
  initialDate,
  busy,
  onUse,
}: {
  routine: Routine;
  initialDate: string;
  busy: boolean;
  onUse: (startDate: string) => void;
}) {
  const { colors, type, radius } = useTheme();
  const [startDate, setStartDate] = useState(initialDate);
  return (
    <>
      <View style={{ gap: 6 }}>
        <Text style={[type.headline, { color: colors.text }]}>{routine.name}</Text>
        <Text style={[type.footnote, { color: colors.muted }]}>{splitDayCount(routine.days)}</Text>
        <SplitPattern days={routine.days} />
      </View>
      <View
        style={{
          backgroundColor: colors.surface2,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.lineStrong,
        }}
      >
        <DateStepper label="Starts" date={startDate} onChange={setStartDate} disabled={busy} />
      </View>
      <Button
        label={busy ? 'Saving…' : 'Use this split'}
        block
        loading={busy}
        disabled={busy}
        onPress={() => onUse(startDate)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  dividerBlock: { borderTopWidth: 1, paddingTop: 12 },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    alignSelf: 'flex-start',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 12,
  },
  more: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templates: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  template: {
    flexBasis: '47%',
    flexGrow: 1,
    padding: 14,
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  cycleDay: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  cycleBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
});
