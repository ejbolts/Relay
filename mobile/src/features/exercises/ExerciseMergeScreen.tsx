import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { canMergeExercises } from '../../../../frontend/src/exerciseMergeCompatibility';
import {
  matchedNameParts,
  mergeSources,
  mergeTargetDetail,
  mergeTargets,
} from '../../../../frontend/src/exerciseMergeTargets';
import type { Exercise } from '../../../../frontend/src/types';
import { useExercises } from '../../data/queries';
import { Button, Card, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { FieldLabel, RadioRow } from '../blocks/parts';
import { Divider, MoreButton } from '../training/parts';
import { mergeExercise, updateExercise } from './exerciseQueries';

const PAGE = 20;

/**
 * Merges a custom exercise into another, as the web's dialog does: suggested standard
 * exercises first, the changes a custom exercise needs before it can merge, and a review of
 * what the merge keeps and removes.
 */
export function ExerciseMergeScreen(props: { sourceId?: string; targetId?: string }) {
  const exercises = useExercises();
  if (!exercises.data)
    return exercises.isError ? (
      <ErrorState
        message={errorMessage(exercises.error)}
        onRetry={() => void exercises.refetch()}
      />
    ) : (
      <Loading label="Loading exercises" />
    );
  return <MergeForm {...props} all={exercises.data} />;
}

function MergeForm({
  sourceId: initialSource = '',
  targetId: initialTarget = '',
  all,
}: {
  sourceId?: string;
  targetId?: string;
  all: Exercise[];
}) {
  const { colors, type, radius, space } = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const [sourceId, setSourceId] = useState(initialSource);
  const [targetId, setTargetId] = useState(initialTarget);
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [busy, setBusy] = useState<'change' | 'merge' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const source = all.find((item) => item.id === sourceId);
  const { candidates, suggested, listed } = mergeTargets(all, source, query);
  const chosen = candidates.find((entry) => entry.item.id === targetId);
  const target = chosen?.ready ? chosen.item : undefined;
  const needed = chosen && !chosen.ready ? chosen.changes : null;

  async function run(kind: 'change' | 'merge', action: () => Promise<void>) {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(null);
    }
  }

  const merge = () =>
    run('merge', async () => {
      if (!source || !target || !canMergeExercises(source, target)) return;
      const kept = await mergeExercise(client, source.id, target.id);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Exercises merged');
      // Opened from the custom exercise, which is gone now: show the one it merged into.
      if (initialSource) {
        router.dismiss();
        router.replace({ pathname: '/training/exercise/[id]', params: { id: kept.id } });
      } else router.back();
    });

  const change = () =>
    run('change', async () => {
      if (!source || !needed) return;
      await updateExercise(client, source.id, needed.update);
    });

  const chooseSource = () =>
    showMenu(
      'Custom exercise to merge',
      mergeSources(all).map((item) => ({
        label: item.name,
        onPress: () => {
          setSourceId(item.id);
          setTargetId('');
          setQuery('');
          setShown(PAGE);
          setError(null);
        },
      })),
    );

  const targetRow = (exercise: Exercise, ready: boolean, matchedWords?: string[]) => (
    <RadioRow
      key={exercise.id}
      label={exercise.name}
      accessibilityLabel={`${exercise.name}, ${mergeTargetDetail(exercise)}${ready ? '' : ', needs changes'}`}
      selected={targetId === exercise.id}
      onPress={() => {
        setTargetId(exercise.id);
        setError(null);
        // What the merge needs, or does, shows at the top.
        scroll.current?.scrollTo({ y: 0, animated: true });
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: colors.text }]} numberOfLines={2}>
          {matchedNameParts(exercise.name, matchedWords).map((part, index) => (
            <Text key={index} style={part.matched ? { fontWeight: '700' } : undefined}>
              {part.text}
            </Text>
          ))}
        </Text>
        <Text style={[type.caption, { color: colors.secondary }]} numberOfLines={1}>
          {mergeTargetDetail(exercise)}
        </Text>
        {!ready && (
          <Text style={[type.caption, { color: colors.gold, fontWeight: '600' }]}>
            Needs changes
          </Text>
        )}
      </View>
    </RadioRow>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Merge exercises' }} />
      <ScrollView
        ref={scroll}
        style={{ flex: 1, backgroundColor: colors.page }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: space.xxl * 2 }}
      >
        <View style={styles.group}>
          <FieldLabel>Custom exercise to merge</FieldLabel>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Custom exercise to merge: ${source?.name ?? 'Choose a custom exercise'}`}
            disabled={!!busy}
            onPress={chooseSource}
            style={[styles.select, { backgroundColor: colors.surface2, borderRadius: radius.md }]}
          >
            <Text
              style={[type.body, { color: source ? colors.text : colors.muted, flex: 1 }]}
              numberOfLines={1}
            >
              {source?.name ?? 'Choose a custom exercise'}
            </Text>
            <Icon name="chevronDown" size={14} color={colors.muted} />
          </Pressable>
        </View>
        {source && chosen && needed && (
          <Card accessibilityLabel="Changes needed to merge">
            <Text style={[type.headline, { color: colors.text }]}>
              {source.name} must match {chosen.item.name}
            </Text>
            {needed.equipment && (
              <Difference label="Equipment" from={needed.equipment.from} to={needed.equipment.to} />
            )}
            {needed.muscles && (
              <Difference
                label="Muscles"
                from={needed.muscles.from.join(', ')}
                to={needed.muscles.to.join(', ')}
              />
            )}
            <Text style={[type.footnote, { color: colors.secondary }]}>
              Its past sets will count towards the new muscles.
            </Text>
            <Button
              label={busy === 'change' ? 'Changing…' : `Change ${source.name}`}
              disabled={!!busy}
              onPress={() => void change()}
            />
          </Card>
        )}
        {source && target && (
          <Card accessibilityLabel="Merge review">
            <View style={styles.review}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.caption, { color: colors.danger, fontWeight: '700' }]}>
                  REMOVE
                </Text>
                <Text style={[type.headline, { color: colors.text }]}>{source.name}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[type.caption, { color: colors.good, fontWeight: '700' }]}>KEEP</Text>
                <Text style={[type.headline, { color: colors.text }]}>{target.name}</Text>
              </View>
            </View>
            <Text style={[type.callout, { color: colors.secondary }]}>
              {`• Combine workout history, records, machine photos and saved splits.\n• Keep ${target.name}’s muscle credits, defaults and machine-weight conversions.`}
            </Text>
            <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
              This merge cannot be undone.
            </Text>
            <Button
              label={busy === 'merge' ? 'Merging…' : 'Merge exercises'}
              variant="danger"
              disabled={!!busy}
              onPress={() => void merge()}
            />
          </Card>
        )}
        {source && (
          <View style={styles.group}>
            <FieldLabel>Merge into</FieldLabel>
            <View
              style={[styles.search, { backgroundColor: colors.surface2, borderRadius: radius.md }]}
            >
              <Icon name="search" size={16} color={colors.muted} />
              <TextInput
                accessibilityLabel="Search merge destination"
                placeholder="Search exercises"
                placeholderTextColor={colors.muted}
                value={query}
                onChangeText={(text) => {
                  setQuery(text);
                  setShown(PAGE);
                }}
                autoCorrect={false}
                clearButtonMode="while-editing"
                style={[type.body, { flex: 1, paddingVertical: 8, color: colors.text }]}
              />
            </View>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Merge destination"
              style={[styles.list, { backgroundColor: colors.surface, borderRadius: radius.lg }]}
            >
              {suggested.length > 0 && (
                <>
                  <Text style={[type.eyebrow, styles.heading, { color: colors.muted }]}>
                    SUGGESTED
                  </Text>
                  {suggested.map((entry, index) => (
                    <View key={entry.exercise.id}>
                      {index > 0 && <Divider inset={16} />}
                      {targetRow(entry.exercise, entry.ready, entry.matchedWords)}
                    </View>
                  ))}
                  {listed.length > 0 && (
                    <Text style={[type.eyebrow, styles.heading, { color: colors.muted }]}>
                      ALL EXERCISES
                    </Text>
                  )}
                </>
              )}
              {listed.slice(0, shown).map((entry, index) => (
                <View key={entry.item.id}>
                  {index > 0 && <Divider inset={16} />}
                  {targetRow(entry.item, entry.ready)}
                </View>
              ))}
              {listed.length > shown && (
                <MoreButton
                  label={`Show more (${listed.length - shown})`}
                  onPress={() => setShown(shown + PAGE)}
                />
              )}
              {!candidates.length && (
                <Text style={[type.callout, styles.empty, { color: colors.secondary }]}>
                  {query.trim()
                    ? 'No exercises match your search.'
                    : 'No other exercises of this kind.'}
                </Text>
              )}
            </View>
          </View>
        )}
        {!!error && (
          <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
            {error}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Difference({ label, from, to }: { label: string; from: string; to: string }) {
  const { colors, type } = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <Text style={[type.caption, { color: colors.muted, fontWeight: '600' }]}>{label}</Text>
      <Text style={[type.callout, { color: colors.secondary, textDecorationLine: 'line-through' }]}>
        {from}
      </Text>
      <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>{to}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  select: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 42,
  },
  list: { overflow: 'hidden', paddingVertical: 4 },
  heading: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  empty: { padding: 16, textAlign: 'center' },
  review: { flexDirection: 'row', gap: 12 },
});
