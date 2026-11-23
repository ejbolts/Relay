import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  splitDayCount,
  splitDayName,
  splitDayTotal,
  splitFailure,
} from '../../../../frontend/src/splitEditing';
import { exerciseMuscles } from '../../../../frontend/src/splitTargets';
import type { Routine } from '../../../../frontend/src/types';
import { OFFLINE_MESSAGE, waitingForNetwork } from '../../data/offline';
import { Button, Card, CardHeader } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { showToast, toastAccount } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { copyFriendSplit, splitRoutes } from '../settings/split/friendSplits';
import { SplitPattern } from '../settings/split/SplitParts';
import { useProfileSplits } from './socialQueries';

/** As the web's set blocks: up to ten, then a count of the rest. */
const MAX_PIPS = 10;

/**
 * A friend's shared splits on their profile, as the web's profile Splits card: each opens to its
 * cycle (a row per exercise with a block per planned set, muscles on request) and Save split,
 * which keeps a private copy in your own library.
 */
export function FriendSplits({ ownerId }: { ownerId: string }) {
  const { colors, type } = useTheme();
  const client = useQueryClient();
  const router = useRouter();
  const query = useProfileSplits(ownerId, true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Splits saved on this visit, as the web's: their button says Saved and can't save twice.
  const [copied, setCopied] = useState<string[]>([]);
  const [importedId, setImportedId] = useState<string | null>(null);
  const routines = query.data;
  const offline = waitingForNetwork(query);
  const loadError = offline ? OFFLINE_MESSAGE : query.error ? splitFailure(query.error) : null;
  const shown = error ?? (routines ? null : loadError);

  async function save(routine: Routine) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    // The account the copy is saved for: its toast and Edit belong to that session only.
    const account = toastAccount();
    try {
      const result = await copyFriendSplit(client, ownerId, routine.id);
      if (result.kind !== 'saved') return;
      haptics.success();
      setImportedId(result.routine.id);
      setCopied((ids) => [...ids, routine.id]);
      showToast(
        'Split saved',
        { label: 'Edit', run: () => router.push(splitRoutes.edit(result.routine.id)) },
        { account },
      );
    } catch (reason) {
      setError(splitFailure(reason));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Splits"
        action={
          copied.length > 0 ? (
            <Button
              label="View my splits"
              variant="link"
              size="small"
              onPress={() => router.push(splitRoutes.library(importedId ?? undefined))}
            />
          ) : undefined
        }
      />
      {shown && (
        <View style={{ gap: 6 }}>
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {shown}
          </Text>
          {!error && (
            <Button
              label="Try again"
              variant="link"
              size="small"
              align="start"
              onPress={() => void query.refetch()}
            />
          )}
        </View>
      )}
      {!routines && !loadError && (
        <Text style={[type.callout, { color: colors.secondary }]}>Loading splits…</Text>
      )}
      {routines?.length === 0 && (
        <Text style={[type.callout, { color: colors.secondary }]}>No shared splits.</Text>
      )}
      {routines?.map((routine, index) => {
        const open = openId === routine.id;
        const saved = copied.includes(routine.id);
        return (
          <View
            key={routine.id}
            style={[
              { gap: 10 },
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.line,
                paddingTop: 12,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              accessibilityLabel={`${routine.name}, ${splitDayCount(routine.days)}`}
              onPress={() => {
                haptics.selection();
                setOpenId(open ? null : routine.id);
              }}
              style={({ pressed }) => [{ gap: 8, minHeight: 44 }, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.titleRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.headline, { color: colors.text }]}>{routine.name}</Text>
                  <Text style={[type.footnote, { color: colors.muted }]}>
                    {splitDayCount(routine.days)}
                  </Text>
                </View>
                <Icon name={open ? 'chevronUp' : 'chevronDown'} size={14} color={colors.muted} />
              </View>
              <SplitPattern days={routine.days} />
            </Pressable>
            {open && (
              <>
                <SplitCycle routine={routine} />
                <Button
                  label={saved ? 'Saved' : 'Save split'}
                  icon={saved ? 'check' : undefined}
                  accessibilityLabel={saved ? `${routine.name} saved` : `Save ${routine.name}`}
                  disabled={busy || saved}
                  loading={busy && !saved}
                  onPress={() => void save(routine)}
                />
              </>
            )}
          </View>
        );
      })}
    </Card>
  );
}

/** A split's cycle as the web's: a row per exercise, with a block for each planned set. */
export function SplitCycle({ routine }: { routine: Routine }) {
  const { colors, type, radius } = useTheme();
  const [showMuscles, setShowMuscles] = useState(false);
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.tools}>
        <Pressable
          accessibilityRole="switch"
          accessibilityLabel="Muscles"
          hitSlop={{ top: 6, bottom: 6 }}
          accessibilityState={{ checked: showMuscles }}
          onPress={() => {
            haptics.selection();
            setShowMuscles((value) => !value);
          }}
          style={({ pressed }) => [
            styles.toggle,
            {
              borderRadius: radius.pill,
              borderColor: showMuscles ? colors.accent : colors.lineStrong,
              backgroundColor: showMuscles ? colors.accentSoft : 'transparent',
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text
            style={[
              type.footnote,
              { color: showMuscles ? colors.accentText : colors.secondary, fontWeight: '600' },
            ]}
          >
            Muscles
          </Text>
        </Pressable>
      </View>
      {routine.days.map((day, index) => {
        const total = splitDayTotal(day);
        const colour = day.workout_type?.color ?? colors.deemph;
        return (
          <View key={index} style={styles.day}>
            <View style={[styles.dayBar, { backgroundColor: colour }]} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={styles.dayTitle}>
                <Text style={[type.footnote, type.number, { color: colors.muted, width: 18 }]}>
                  {index + 1}
                </Text>
                <Text style={[type.callout, { color: colors.text, fontWeight: '600', flex: 1 }]}>
                  {splitDayName(day)}
                </Text>
                {!!total && (
                  <Text style={[type.footnote, type.number, { color: colors.secondary }]}>
                    {total}
                  </Text>
                )}
              </View>
              {day.movements.length ? (
                day.movements.map((movement, mi) => {
                  const cardio = movement.exercise.kind === 'cardio';
                  const length = Math.round(
                    movement.sets.reduce((sum, set) => sum + (set.duration_seconds ?? 0), 0) / 60,
                  );
                  const count = movement.sets.length;
                  return (
                    <View key={mi} style={styles.exercise}>
                      <View style={{ flex: 1 }}>
                        <Text style={[type.footnote, { color: colors.text }]}>
                          {movement.exercise.name}
                        </Text>
                        {showMuscles && (
                          <Text style={[type.caption, { color: colors.muted }]}>
                            {exerciseMuscles(movement.exercise)}
                          </Text>
                        )}
                      </View>
                      {cardio ? (
                        <View style={styles.pips}>
                          <View
                            style={{
                              width: Math.max(6, Math.min(length, 120) * 0.6),
                              height: 6,
                              borderRadius: 3,
                              backgroundColor: colour,
                            }}
                          />
                          <Text style={[type.caption, type.number, { color: colors.secondary }]}>
                            {length} min
                          </Text>
                        </View>
                      ) : (
                        <View
                          accessible
                          accessibilityRole="image"
                          accessibilityLabel={`${count} ${count === 1 ? 'set' : 'sets'}`}
                          style={styles.pips}
                        >
                          {Array.from({ length: Math.min(count, MAX_PIPS) }, (_, pip) => (
                            <View key={pip} style={[styles.pip, { backgroundColor: colour }]} />
                          ))}
                          {count > MAX_PIPS && (
                            <Text style={[type.caption, { color: colors.secondary }]}>
                              +{count - MAX_PIPS}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              ) : (
                <Text style={[type.footnote, { color: colors.muted }]}>
                  {day.workout_type_id ? 'No exercises' : 'Rest day'}
                </Text>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tools: { flexDirection: 'row', justifyContent: 'flex-end' },
  toggle: {
    minHeight: 32,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
  },
  day: { flexDirection: 'row', gap: 10 },
  dayBar: { width: 4, borderRadius: 2 },
  dayTitle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  exercise: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 24 },
  pips: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  pip: { width: 8, height: 8, borderRadius: 2 },
});
