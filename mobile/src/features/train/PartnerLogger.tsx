import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addPartnerMovement,
  addPartnerSet,
  loggingForLabel,
  memberName,
  memberShortName,
  partners,
  partnerSummary,
  removePartnerMovement,
  removePartnerSet,
  updatePartnerSet,
  type TrainExercise,
} from '../../../../frontend/src/trainTogether';
import { partnerSetLabel, partnerWorkoutName } from '../../../../frontend/src/trainTogetherView';
import { partnerRepsInput, partnerWeightInput } from '../../../../frontend/src/trainTogetherInput';
import { draftPause } from '../../../../frontend/src/workoutPause';
import { weightInputValue, type WeightUnit } from '../../../../frontend/src/weightUnits';
import type {
  ActiveWorkoutDraft,
  StoredDraftMovement,
  StoredDraftSet,
} from '../../../../frontend/src/workoutDraft';
import { newId } from '../../data/deviceStorage';
import { Button } from '../../ui/components';
import { TextField } from '../../ui/controls';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { showMenu } from '../../ui/prompts';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { sessionBound } from '../workout/sessionBound';
import { formatPlain } from '../workout/NumberField';
import { PartnerNumberField } from './PartnerNumberField';
import { isConnectionFailure } from './trainErrors';
import { useElapsed } from '../workout/useElapsed';
import { trainIcons, usePartnerColours, type PartnerColours } from './partnerColours';
import { PartnerAvatar } from './PartnerAvatar';
import { trainActions, useTrainState } from './trainStore';
import { trainTogetherApi, trainTogetherKeys } from './trainTogetherApi';

/** The time an edit is made, taken in its press handler (never inside the updater). */
const editTime = () => Date.now();

const MORE_VERTICAL = { sf: 'ellipsis', md: 'more-vert' } as const;

/** A partner's exercise library for the add-exercise picker, while logging for them. */
function usePartnerLibrary(partnerId: string) {
  return useQuery({
    queryKey: trainTogetherKeys.partnerExercises(partnerId),
    queryFn: ({ signal }) =>
      sessionBound().read(() => trainTogetherApi.partnerExercises(partnerId, signal)),
    staleTime: 60_000,
  });
}

/**
 * Logging for a partner: their live workout in their colour, edited through the shared draft
 * helpers and their request loop. Weight, reps, the done tick, adding and removing sets, adding
 * an exercise and removing one added here. Cardio shows read-only. Their own phone keeps rest,
 * options and Finish.
 */
export function PartnerLogger({
  partnerId,
  weightUnit,
}: {
  partnerId: string;
  weightUnit: WeightUnit;
}) {
  const { colors, type, space, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const session = useTrainState((state) => state.read?.session ?? null);
  const sync = useTrainState((state) => state.partnerSync[partnerId] ?? null);
  const acked = useTrainState((state) => state.partnerAcked[partnerId] ?? null);
  const added = useTrainState((state) => state.added[partnerId]);
  const conflicts = useTrainState((state) => state.partnerConflicts[partnerId] ?? 0);
  const tones = usePartnerColours();
  const library = usePartnerLibrary(partnerId);
  const [picking, setPicking] = useState(false);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const cardTops = useRef(new Map<string, number>());
  /** An exercise just added here, shown once its card has laid out. */
  const reveal = useRef<string | null>(null);
  const member = partners(session).find((item) => item.user_id === partnerId) ?? null;
  const draft = sync?.draft ?? member?.workout?.draft ?? null;
  const exercises = useMemo(() => {
    const byId = new Map<string, TrainExercise>();
    for (const list of [library.data, member?.workout?.exercises, sync?.exercises])
      list?.forEach((item) => byId.set(item.id, item));
    return byId;
  }, [library.data, member?.workout?.exercises, sync?.exercises]);
  const top = Platform.OS === 'ios' ? 0 : insets.top;
  // Entering a partner's logger announces whose it is.
  const banner = useRef<ComponentRef<typeof Text>>(null);
  const present = !!member && !!draft;
  useEffect(() => {
    if (present && banner.current)
      AccessibilityInfo.sendAccessibilityEvent(banner.current, 'focus');
  }, [present]);
  if (!member || !draft) return null;
  const tone = tones[partnerId] ?? {
    accent: colors.accent,
    text: colors.accentText,
    soft: colors.accentSoft,
    tint: colors.surface2,
    line: colors.lineStrong,
  };
  const name = memberName(member);
  const short = memberShortName(member);
  const edit = (change: (current: ActiveWorkoutDraft) => ActiveWorkoutDraft, addedKey?: string) =>
    trainActions().editPartner(partnerId, change, addedKey);
  // Only a connection failure is "offline"; a refusal closes this logger (TrainTogetherHost).
  const failed = sync?.status === 'failed' && isConnectionFailure(sync.error);

  function addExercise(exercise: TrainExercise) {
    setPicking(false);
    const existing = draft!.movements.find((movement) => movement.exerciseId === exercise.id);
    if (existing) {
      // Already in their workout: show it rather than add it twice.
      const y = cardTops.current.get(existing.key);
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - space.gutter) });
      return;
    }
    haptics.tap();
    // Keys and time are made once, here: the queue may run the updater again after a conflict.
    const keys = { movementKey: newId(), setKey: newId() };
    const now = editTime();
    reveal.current = keys.movementKey;
    edit((current) => addPartnerMovement(current, exercise.id, keys, now), keys.movementKey);
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.banner, { backgroundColor: tone.accent, paddingTop: top + 6 }]}>
        <PartnerAvatar member={member} size={32} ring="#ffffff" />
        <Text
          ref={banner}
          accessibilityRole="header"
          style={[styles.bannerTitle, { color: colors.onAccent }]}
          numberOfLines={1}
        >
          {loggingForLabel(name)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to mine"
          onPress={() => trainActions().logFor(null, partnerId)}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}
        >
          <Icon name="chevronLeft" size={14} color={colors.onAccent} />
          <Text style={[type.footnote, { color: colors.onAccent, fontWeight: '700' }]}>
            Back to mine
          </Text>
        </Pressable>
      </View>
      {failed && (
        <View
          accessibilityRole="alert"
          style={[styles.offline, { backgroundColor: colors.dangerSoft }]}
        >
          <Icon name={trainIcons.offline} size={16} color={colors.danger} />
          <Text style={[type.footnote, { color: colors.danger, flex: 1, fontWeight: '600' }]}>
            Offline · Unsent change
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry"
            onPress={() => trainActions().retryPartner(partnerId)}
            style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
          >
            <Text style={[type.footnote, { color: colors.danger, fontWeight: '700' }]}>Retry</Text>
          </Pressable>
        </View>
      )}
      <PartnerHeader draft={draft} acked={acked} tone={tone} name={name} />
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: space.gutter,
          gap: space.stack,
          paddingBottom: insets.bottom + 40,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
      >
        {draft.movements.map((movement, index) => (
          <View
            key={movement.key}
            onLayout={(event) => {
              const y = event.nativeEvent.layout.y;
              cardTops.current.set(movement.key, y);
              if (reveal.current !== movement.key) return;
              reveal.current = null;
              scrollRef.current?.scrollTo({ y: Math.max(0, y - space.gutter) });
            }}
          >
            <PartnerCard
              number={index + 1}
              movement={movement}
              acked={acked?.movements.find((item) => item.key === movement.key) ?? null}
              exercise={exercises.get(movement.exerciseId) ?? null}
              name={short}
              tone={tone}
              unit={weightUnit}
              removable={!!added?.includes(movement.key)}
              conflicts={conflicts}
              edit={edit}
            />
          </View>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Add exercise for ${short}`}
          onPress={() => {
            haptics.tap();
            setPicking(true);
          }}
          style={({ pressed }) => [
            styles.addExercise,
            { backgroundColor: tone.soft, borderRadius: radius.lg },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[type.button, { color: tone.text }]}>+ Add exercise for {short}</Text>
        </Pressable>
      </ScrollView>
      {/* The frame says whose workout this is, all round the screen. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.frame, { borderColor: tone.accent }]}
      />
      <PartnerPicker
        visible={picking}
        name={short}
        loading={library.isPending}
        failed={library.isError}
        exercises={library.data ?? []}
        onRetry={() => void library.refetch()}
        onPick={addExercise}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

function PartnerHeader({
  draft,
  acked,
  tone,
  name,
}: {
  draft: ActiveWorkoutDraft;
  /** The copy the server acknowledged: its sets are the ones counted as done. */
  acked: ActiveWorkoutDraft | null;
  tone: PartnerColours;
  name: string;
}) {
  const { colors, type } = useTheme();
  // The owner's clock rules: pauses, corrections and a resumed workout's saved minutes.
  const elapsed = useElapsed(
    draft.startedAt,
    draftPause(draft),
    draft.previousDurationMinutes ?? 0,
  );
  const sets = acked
    ? partnerSummary({ revision: 0, draft: acked, exercises: [] }, 0).totalSetsDone
    : 0;
  return (
    <View style={[styles.header, { backgroundColor: tone.tint, borderColor: tone.line }]}>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
        {name}’s {partnerWorkoutName({ draft })}
      </Text>
      <View style={styles.meta}>
        <View
          style={[styles.liveDot, { backgroundColor: draft.pausedAt ? colors.muted : colors.good }]}
        />
        <Text
          style={[
            type.footnote,
            type.number,
            { color: draft.pausedAt ? colors.muted : colors.good },
          ]}
        >
          {draft.pausedAt ? elapsed : `Live ${elapsed}`}
        </Text>
        <Text style={[type.footnote, type.number, { color: colors.muted }]}>
          · {sets} {sets === 1 ? 'set' : 'sets'}
        </Text>
      </View>
    </View>
  );
}

const isWarmup = (item: StoredDraftSet) => item.warmup === true || item.set_type === 'warmup';

function PartnerCard({
  number,
  movement,
  acked,
  exercise,
  name,
  tone,
  unit,
  removable,
  conflicts,
  edit,
}: {
  number: number;
  movement: StoredDraftMovement;
  /** The same movement as the server last acknowledged it. */
  acked: StoredDraftMovement | null;
  exercise: TrainExercise | null;
  name: string;
  tone: PartnerColours;
  unit: WeightUnit;
  removable: boolean;
  /** Edits that came back not applied so far: the fields then show the server's values. */
  conflicts: number;
  edit: (change: (current: ActiveWorkoutDraft) => ActiveWorkoutDraft, addedKey?: string) => void;
}) {
  const { colors, type, radius } = useTheme();
  const title = exercise?.name ?? 'Exercise';
  const cardio = exercise?.kind === 'cardio';
  // Pending is not saved: "n done" counts what the server acknowledged.
  const done = acked?.sets.filter((item) => item.completed).length ?? 0;
  let working = 0;
  const labels = movement.sets.map((item) => (isWarmup(item) ? 'W' : String(++working)));

  function openMenu() {
    haptics.press();
    showMenu(title, [
      ...(cardio
        ? []
        : movement.sets.map((item, index) => ({
            label: `Remove set ${labels[index]}`,
            destructive: true,
            onPress: () => {
              const now = Date.now();
              edit((current) => removePartnerSet(current, movement.key, item.key, now));
            },
          }))),
      ...(removable
        ? [
            {
              label: 'Remove exercise',
              destructive: true,
              onPress: () => {
                const now = Date.now();
                edit((current) => removePartnerMovement(current, movement.key, now));
              },
            },
          ]
        : []),
    ]);
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radius.card },
      ]}
    >
      <View style={styles.cardHead}>
        <View style={[styles.badge, { backgroundColor: tone.accent }]}>
          <Text style={[styles.badgeText, { color: colors.onAccent }]}>{number}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            accessibilityRole="header"
            style={[styles.cardTitle, { color: tone.text }]}
            numberOfLines={2}
          >
            {title}
          </Text>
          <Text style={[type.footnote, { color: colors.muted }]}>
            {name}’s sets · {done} done
          </Text>
        </View>
        {(!cardio || removable) && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${title} options`}
            onPress={openMenu}
            style={({ pressed }) => [styles.more, pressed && styles.pressed]}
          >
            <Icon name={MORE_VERTICAL} size={20} color={tone.text} />
          </Pressable>
        )}
      </View>
      {cardio ? (
        <View style={{ gap: 6 }}>
          {movement.sets.map((item, index) => (
            <Text key={item.key} style={[type.callout, { color: colors.secondary }]}>
              {labels[index]} ·{' '}
              {partnerSetLabel(
                {
                  weight_kg: null,
                  reps: null,
                  duration_seconds: item.duration_seconds ?? null,
                  distance_km: item.distance_km ?? null,
                },
                unit,
              )}
              {item.completed ? ' ✓' : ''}
            </Text>
          ))}
        </View>
      ) : (
        <>
          <View style={[styles.columns, { borderColor: colors.line }]}>
            <Text style={[styles.head, styles.setCol, { color: colors.muted }]}>Set</Text>
            <Text style={[styles.head, styles.valueCol, { color: colors.muted }]}>
              Weight ({unit})
            </Text>
            <Text style={[styles.head, styles.valueCol, { color: colors.muted }]}>Reps</Text>
            <Text style={[styles.head, styles.rpeCol, { color: colors.muted }]}>RPE</Text>
            <View style={styles.checkCol} />
          </View>
          {movement.sets.map((item, index) => (
            <PartnerSetRow
              key={item.key}
              movementKey={movement.key}
              item={item}
              label={labels[index]}
              saved={acked?.sets.find((set) => set.key === item.key) ?? null}
              tone={tone}
              unit={unit}
              conflicts={conflicts}
              edit={edit}
            />
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add set to ${title}`}
            onPress={() => {
              haptics.tap();
              // Made once, here: the queue may run the updater again after a conflict.
              const key = newId();
              const now = Date.now();
              edit((current) => addPartnerSet(current, movement.key, key, now));
            }}
            style={({ pressed }) => [
              styles.addSet,
              { backgroundColor: tone.soft, borderRadius: radius.md },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[type.button, { color: tone.text }]}>+ Add set</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

function PartnerSetRow({
  movementKey,
  item,
  label,
  saved,
  tone,
  unit,
  conflicts,
  edit,
}: {
  movementKey: string;
  item: StoredDraftSet;
  label: string;
  /** The same set as the server acknowledged it, or null when it hasn't yet. */
  saved: StoredDraftSet | null;
  tone: PartnerColours;
  unit: WeightUnit;
  conflicts: number;
  edit: (change: (current: ActiveWorkoutDraft) => ActiveWorkoutDraft) => void;
}) {
  const { colors, radius } = useTheme();
  const warmup = label === 'W';
  // Anything not yet acknowledged looks pending, a set already done included.
  const pending =
    !saved ||
    saved.completed !== item.completed ||
    saved.weight_kg !== item.weight_kg ||
    saved.reps !== item.reps;
  const weightFormat = useMemo(() => (kg: number | null) => weightInputValue(kg, unit), [unit]);
  const patch = (update: Partial<StoredDraftSet>) => {
    // The time is taken once, here: the queue may run the updater again after a conflict.
    const now = Date.now();
    edit((current) => updatePartnerSet(current, movementKey, item.key, update, now));
  };
  const describe =
    item.weight_kg !== null || item.reps !== null
      ? partnerSetLabel(
          { weight_kg: item.weight_kg, reps: item.reps, duration_seconds: null, distance_km: null },
          unit,
        )
      : 'empty';
  return (
    <View
      style={[
        styles.row,
        { borderRadius: radius.md },
        item.completed && !pending && { backgroundColor: colors.goodSoft },
        !item.completed && warmup && { backgroundColor: `${colors.rpe['8.5']}26` },
      ]}
    >
      <Text
        style={[styles.setCol, styles.setLabel, { color: warmup ? colors.rpe['9'] : colors.text }]}
      >
        {label}
      </Text>
      <View style={styles.valueCol}>
        <PartnerNumberField
          value={item.weight_kg}
          format={weightFormat}
          read={(text) => partnerWeightInput(text, unit, item.weight_kg)}
          onChange={(weight_kg) => patch({ weight_kg })}
          label={`Set ${label} weight`}
          accent={tone.accent}
          resync={conflicts}
          done={item.completed}
        />
      </View>
      <View style={styles.valueCol}>
        <PartnerNumberField
          value={item.reps}
          format={formatPlain}
          read={partnerRepsInput}
          onChange={(reps) => patch({ reps })}
          label={`Set ${label} reps`}
          accent={tone.accent}
          resync={conflicts}
          keyboardType="number-pad"
          done={item.completed}
        />
      </View>
      <Text
        style={[styles.rpeCol, styles.rpe, { color: item.rpe ? colors.secondary : colors.muted }]}
      >
        {item.rpe ?? '–'}
      </Text>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`Set ${label}, ${describe}`}
        accessibilityState={{ checked: item.completed, busy: pending }}
        accessibilityHint={pending ? 'Not saved yet' : undefined}
        onPress={() => {
          if (!item.completed) haptics.success();
          else haptics.selection();
          patch({ completed: !item.completed });
        }}
        style={({ pressed }) => [
          styles.tick,
          item.completed && !pending
            ? { backgroundColor: colors.good, borderColor: colors.good }
            : {
                borderColor: pending ? tone.accent : colors.lineStrong,
                backgroundColor: colors.surface,
              },
          pressed && styles.pressed,
        ]}
      >
        {pending ? (
          <Icon name={trainIcons.pending} size={18} color={tone.accent} />
        ) : (
          <Icon name="check" size={18} color={item.completed ? colors.onAccent : colors.muted} />
        )}
      </Pressable>
    </View>
  );
}

/** The partner's exercise library, favourites first, to add one to their workout. */
function PartnerPicker({
  visible,
  name,
  loading,
  failed,
  exercises,
  onRetry,
  onPick,
  onClose,
}: {
  visible: boolean;
  name: string;
  loading: boolean;
  failed: boolean;
  exercises: TrainExercise[];
  onRetry: () => void;
  onPick: (exercise: TrainExercise) => void;
  onClose: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const shown = term
    ? exercises.filter(
        (item) =>
          item.name.toLowerCase().includes(term) || item.muscle_group.toLowerCase().includes(term),
      )
    : exercises;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Add exercise for ${name}`}
      keyboardShouldPersistTaps="handled"
    >
      <TextField
        value={search}
        onChangeText={setSearch}
        placeholder="Search exercises"
        label="Search exercises"
      />
      {failed ? (
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
            Couldn’t load {name}’s exercises.
          </Text>
          <Button label="Try again" variant="secondary" onPress={onRetry} />
        </View>
      ) : loading ? (
        <Text style={[type.callout, { color: colors.muted }]}>Loading…</Text>
      ) : (
        <View style={{ gap: 6 }}>
          {shown.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={item.name}
              onPress={() => onPick(item)}
              style={({ pressed }) => [
                styles.pick,
                { backgroundColor: colors.surface2, borderRadius: radius.md },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[type.callout, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={1}>
                {item.muscle_group}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },
  frame: { borderWidth: 2.5 },
  banner: {
    minHeight: 54,
    paddingHorizontal: 14,
    paddingBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bannerTitle: { flex: 1, fontSize: 14.5, fontWeight: '700' },
  back: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  offline: {
    minHeight: 44,
    paddingLeft: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  retry: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  card: { borderWidth: 1, padding: 12, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  columns: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6, borderBottomWidth: 1 },
  head: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  setCol: { width: 34, textAlign: 'center' },
  valueCol: { flex: 1, paddingHorizontal: 4 },
  rpeCol: { width: 40, textAlign: 'center' },
  checkCol: { width: 48 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingVertical: 4 },
  setLabel: { fontWeight: '700' },
  rpe: { fontWeight: '600' },
  tick: {
    width: 44,
    height: 44,
    marginLeft: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSet: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  addExercise: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  pick: {
    minHeight: 48,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
