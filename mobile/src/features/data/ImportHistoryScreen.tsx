import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImportBatch } from '../../../../frontend/src/types';
import {
  importBatchCounts,
  importBatchDetails,
  importUndoneMessage,
  importUndoWarning,
  NO_TRACKED_IMPORTS,
  NOTHING_LEFT_TO_REMOVE,
} from '../../../../frontend/src/workoutImport';
import { errorMessage, ErrorState, Loading } from '../../ui/components';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { Section, SectionError, SettingsPage } from '../settings/SettingsList';
import { refreshAccountData, undoImport, useImportBatches } from './dataApi';

/** Tracked imports, newest first, each with Undo behind a confirmation, as on the web. */
export function ImportHistoryScreen() {
  const batches = useImportBatches();
  const client = useQueryClient();
  const { colors, type } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Only a pull shows the spinner; refreshes after an undo run quietly.
  const [pulling, setPulling] = useState(false);

  if (batches.isPending) return <Loading label="Loading imports" />;
  if (batches.error && !batches.data)
    return (
      <ErrorState message={errorMessage(batches.error)} onRetry={() => void batches.refetch()} />
    );

  async function undo(batch: ImportBatch) {
    setBusy(batch.id);
    setError(null);
    try {
      const result = await undoImport(batch.id);
      await refreshAccountData(client);
      showToast(importUndoneMessage(result));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  function confirm(batch: ImportBatch) {
    const lines = [
      importBatchCounts(batch) || NOTHING_LEFT_TO_REMOVE,
      importBatchDetails(batch),
      importUndoWarning(batch),
    ].filter(Boolean);
    Alert.alert(`Undo ${batch.file_name}?`, lines.join('\n\n'), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Undo import', style: 'destructive', onPress: () => void undo(batch) },
    ]);
  }

  const list = batches.data ?? [];
  return (
    <SettingsPage
      refreshing={pulling}
      onRefresh={() => {
        setPulling(true);
        void batches.refetch().finally(() => setPulling(false));
      }}
    >
      {list.length === 0 ? (
        <Text style={[type.callout, { color: colors.secondary }]}>{NO_TRACKED_IMPORTS}</Text>
      ) : (
        <Section>
          {list.map((batch) => (
            <View key={batch.id} style={styles.row}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  numberOfLines={1}
                  style={[type.callout, { color: colors.text, fontWeight: '600' }]}
                >
                  {batch.file_name}
                </Text>
                <Text style={[type.footnote, { color: colors.secondary }]}>
                  {importBatchCounts(batch) || NOTHING_LEFT_TO_REMOVE}
                </Text>
                <Text style={[type.footnote, { color: colors.muted }]}>
                  {importBatchDetails(batch)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Undo ${batch.file_name}`}
                disabled={busy !== null}
                onPress={() => confirm(batch)}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.undo,
                  { backgroundColor: colors.surface2 },
                  (pressed || busy !== null) && { opacity: 0.5 },
                ]}
              >
                <Text style={[type.footnote, { color: colors.danger, fontWeight: '600' }]}>
                  {busy === batch.id ? 'Undoing…' : 'Undo'}
                </Text>
              </Pressable>
            </View>
          ))}
        </Section>
      )}
      <SectionError message={error} />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  undo: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
});
