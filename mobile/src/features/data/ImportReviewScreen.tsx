import { useQueryClient } from '@tanstack/react-query';
import { useNavigation, usePreventRemove, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  IMPORT_SAFETY_NOTE,
  importReviewTotals,
  importSavedMessage,
  importSourceSummary,
  mappedExerciseId,
  REVIEW_SESSION_LIMIT,
  reviewSessionAction,
  reviewSessionDetails,
  reviewSessionsOverflow,
} from '../../../../frontend/src/workoutImport';
import { useUser } from '../../session/SessionProvider';
import { Button } from '../../ui/components';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { Row, Section, SettingsPage } from '../settings/SettingsList';
import { refreshAccountData } from './dataApi';
import {
  canSaveImport,
  clearImport,
  retryReview,
  saveReviewedImport,
  useImportSession,
} from './importSession';

/** Expo Router's navigation types leave out the stack's beforeRemove event. */
type Leaving = { addListener: (event: 'beforeRemove', listener: () => void) => () => void };

/** The web's Review import: totals, exercise mapping, warnings and sessions, then Save import. */
export function ImportReviewScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const client = useQueryClient();
  const { colors, type, space } = useTheme();
  const userId = useUser().id;
  const session = useImportSession(userId);
  const { preview, options, file } = session;
  // 'saving' runs from Save until the saved data is refreshed; 'saved' then leaves this screen.
  const [phase, setPhase] = useState<'review' | 'saving' | 'saved'>('review');
  const saving = phase !== 'review';

  // Leaving the review (back, or a swipe) cancels it: nothing is saved. Not while saving.
  useEffect(
    () =>
      saving
        ? undefined
        : (navigation as unknown as Leaving).addListener('beforeRemove', clearImport),
    [navigation, saving],
  );
  // While Save runs, no Back (header, gesture or Android's) can leave; the screen leaves itself.
  usePreventRemove(phase === 'saving', () => undefined);
  useEffect(() => {
    if (phase === 'saved') router.back();
  }, [phase, router]);

  if (!preview || !options || !file) return <SettingsPage>{null}</SettingsPage>;
  const totals = importReviewTotals(preview);
  const overflow = reviewSessionsOverflow(preview.sessions.length);
  const exercises = preview.available_exercises ?? [];
  const matches = preview.exercise_matches ?? [];
  const busy = saving || session.reviewing;

  async function save() {
    if (saving || !canSaveImport(session)) return;
    setPhase('saving');
    try {
      const result = await saveReviewedImport(userId);
      if (!result) return setPhase('review');
      await refreshAccountData(client);
      showToast(importSavedMessage(result));
      setPhase('saved');
    } catch {
      // The reason shows on the review, which stays open.
      setPhase('review');
    }
  }

  const muted = [type.footnote, { color: colors.secondary }];
  return (
    <SettingsPage>
      <View style={{ gap: 4 }}>
        <Text style={[type.headline, { color: colors.text }]} numberOfLines={2}>
          {file.name}
        </Text>
        <Text style={muted}>{importSourceSummary(options)}</Text>
      </View>
      {matches.length > 0 && (
        <View style={{ gap: space.sm }}>
          <Section title={`Exercise mapping (${matches.length})`}>
            {matches.map((match) => {
              const id = mappedExerciseId(options, match);
              const name = exercises.find((exercise) => exercise.id === id)?.name;
              return (
                <Row
                  key={match.incoming_name}
                  label={match.incoming_name}
                  value={name ?? 'Automatic'}
                  disabled={busy}
                  accessibilityLabel={`Map ${match.incoming_name}`}
                  onPress={() =>
                    router.push({
                      pathname: '/data/import-mapping',
                      params: { name: match.incoming_name },
                    })
                  }
                />
              );
            })}
          </Section>
          {session.stale && !session.reviewing && (
            <Button variant="secondary" label="Try again" onPress={() => retryReview(userId)} />
          )}
        </View>
      )}
      <View style={{ gap: space.sm }}>
        {session.reviewing ? (
          <View style={styles.updating} accessibilityRole="progressbar">
            <ActivityIndicator color={colors.accentText} />
            <Text style={[type.callout, { color: colors.text }]}>Updating…</Text>
          </View>
        ) : (
          <>
            {totals.sessions && (
              <Text style={[type.callout, { color: colors.text }]}>
                <Text style={styles.strong}>{totals.sessions.added}</Text> and{' '}
                <Text style={styles.strong}>{totals.sessions.sets}</Text> will be added.
                {totals.sessions.skipped && (
                  <Text style={{ color: colors.secondary }}> {totals.sessions.skipped}</Text>
                )}
              </Text>
            )}
            {totals.bodyweight && (
              <Text style={[type.callout, { color: colors.text }]}>
                <Text style={styles.strong}>{totals.bodyweight.added}</Text> will be added.{' '}
                <Text style={{ color: colors.secondary }}>{totals.bodyweight.kept}</Text>
              </Text>
            )}
          </>
        )}
        {totals.newExercises && <Text style={muted}>{totals.newExercises}</Text>}
        <Text style={[type.footnote, { color: colors.muted }]}>{IMPORT_SAFETY_NOTE}</Text>
      </View>
      {preview.warnings.length > 0 && (
        <Section title={`Warnings (${preview.warnings.length})`}>
          {preview.warnings.map((warning, index) => (
            <View key={index} style={styles.item}>
              <Text style={[type.footnote, { color: colors.text }]}>{warning}</Text>
            </View>
          ))}
        </Section>
      )}
      {preview.sessions.length > 0 && (
        <Section title="Sessions in this file">
          {preview.sessions.slice(0, REVIEW_SESSION_LIMIT).map((item, index) => (
            <View key={index} style={styles.item}>
              <View style={styles.itemTop}>
                <Text
                  numberOfLines={1}
                  style={[type.callout, { color: colors.text, fontWeight: '600', flex: 1 }]}
                >
                  {item.name}
                </Text>
                <Text
                  style={[
                    type.caption,
                    { color: item.duplicate ? colors.muted : colors.good, fontWeight: '600' },
                  ]}
                >
                  {reviewSessionAction(item)}
                </Text>
              </View>
              <Text style={muted}>{reviewSessionDetails(item)}</Text>
            </View>
          ))}
        </Section>
      )}
      {overflow && <Text style={muted}>{overflow}</Text>}
      <View style={{ gap: space.sm }}>
        {session.error && (
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {session.error}
          </Text>
        )}
        <Button
          label={saving ? 'Saving…' : 'Save import'}
          disabled={saving || !canSaveImport(session)}
          onPress={() => void save()}
        />
        <Button
          variant="secondary"
          label="Cancel"
          disabled={saving}
          onPress={() => router.back()}
        />
      </View>
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: '700' },
  updating: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  item: { paddingHorizontal: 16, paddingVertical: 12, gap: 3 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
