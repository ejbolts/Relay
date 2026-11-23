import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import {
  ARCHIVE_DOWNLOAD_FAILED,
  ARCHIVE_FILE_TYPES,
  ARCHIVE_MAX_BYTES,
  ARCHIVE_RESTORE_WARNING,
  ARCHIVE_RESTORED,
  ARCHIVE_TOO_LARGE,
  archiveCountRows,
  archiveFileName,
  archiveKicker,
  archiveSkippedNote,
} from '../../../../frontend/src/accountArchive';
import type { ArchivePreview } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { useDashboard } from '../../data/queries';
import { Button, errorMessage } from '../../ui/components';
import { Sheet } from '../../ui/Sheet';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { Row, Section, SectionError } from '../settings/SettingsList';
import {
  discardStagedFile,
  downloadFiles,
  evictAccountData,
  pickFile,
  previewArchive,
  removeSampleWorkouts,
  restoreArchive,
  shareFiles,
  type PickedFile,
} from './dataApi';
import { restoreBlocker, useLocalWorkoutWrites, type LocalWorkoutWrites } from './localWrites';
import { dataIcons } from './icons';

/**
 * Settings' Data section, as the web's Data page: importing and exporting CSVs, the import
 * history, the full backup and its restore, and removing sample workouts.
 */
export function DataSection() {
  const router = useRouter();
  const client = useQueryClient();
  const dashboard = useDashboard();
  const [downloading, setDownloading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: PickedFile; preview: ArchivePreview } | null>(
    null,
  );
  const writes = useLocalWorkoutWrites();

  async function download() {
    if (downloading) return;
    setDownloading(true);
    setError(null);
    try {
      const [file] = await downloadFiles(
        [{ path: '/api/account-archive', name: archiveFileName(localDate()) }],
        ARCHIVE_DOWNLOAD_FAILED,
      );
      await shareFiles([{ file, type: 'application/zip' }], 'Relay backup');
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setDownloading(false);
    }
  }

  async function check() {
    if (checking) return;
    // Workouts this phone has yet to send could overwrite what the backup puts back.
    const blocked = restoreBlocker(writes);
    setError(blocked);
    if (blocked) return;
    setChecking(true);
    let file: PickedFile | null = null;
    try {
      file = await pickFile(ARCHIVE_FILE_TYPES, 'application/zip', {
        maxBytes: ARCHIVE_MAX_BYTES,
        tooLarge: ARCHIVE_TOO_LARGE,
      });
      if (file) setPending({ file, preview: await previewArchive(file) });
    } catch (caught) {
      if (file) discardStagedFile(file);
      setError(errorMessage(caught));
    } finally {
      setChecking(false);
    }
  }

  function removeSamples() {
    Alert.alert('Remove sample workouts?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setRemoving(true);
          setError(null);
          try {
            await removeSampleWorkouts();
            await evictAccountData(client);
            showToast('Sample workouts removed. They will not be seeded again.');
          } catch (caught) {
            setError(errorMessage(caught));
          } finally {
            setRemoving(false);
          }
        },
      },
    ]);
  }

  return (
    <>
      <Section title="Data">
        <Row
          label="Import workouts"
          icon={dataIcons.upload}
          iconTint="#2c74d0"
          onPress={() => router.push('/data/import')}
        />
        <Row
          label="Import history"
          icon={dataIcons.history}
          iconTint="#64748b"
          onPress={() => router.push('/data/import-history')}
        />
        <Row
          label="Export data"
          icon={dataIcons.share}
          iconTint="#10b981"
          onPress={() => router.push('/data/export')}
        />
        <Row
          label={downloading ? 'Preparing…' : 'Download backup'}
          icon={dataIcons.backup}
          iconTint="#8b5cf6"
          busy={downloading}
          chevron={false}
          accessibilityLabel="Download backup"
          onPress={() => void download()}
        />
        <Row
          label={checking ? 'Checking…' : 'Restore backup'}
          icon={dataIcons.restore}
          iconTint="#f59e0b"
          busy={checking}
          chevron={false}
          accessibilityLabel="Restore backup"
          onPress={() => void check()}
        />
        {dashboard.data?.history?.has_sample_workouts && (
          <Row
            label="Remove sample workouts"
            icon={dataIcons.samples}
            iconTint="#c53b3b"
            destructive
            busy={removing}
            chevron={false}
            onPress={removeSamples}
          />
        )}
      </Section>
      <SectionError message={error} />
      {pending && (
        <RestoreSheet
          pending={pending}
          writes={writes}
          onClose={() => {
            discardStagedFile(pending.file);
            setPending(null);
          }}
          onRestored={async () => {
            discardStagedFile(pending.file);
            setPending(null);
            // A restore replaces splits, blocks, layout and preferences as well as training, so
            // every cached and offline read is dropped and read again (the web reloads).
            await evictAccountData(client);
            showToast(ARCHIVE_RESTORED);
          }}
        />
      )}
    </>
  );
}

/** The web's Restore this backup? confirmation: the backup's counts beside today's. */
function RestoreSheet({
  pending,
  writes,
  onClose,
  onRestored,
}: {
  pending: { file: PickedFile; preview: ArchivePreview };
  writes: LocalWorkoutWrites;
  onClose: () => void;
  onRestored: () => Promise<void>;
}) {
  const { colors, type, space } = useTheme();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipped = archiveSkippedNote(pending.preview.photos_skipped);

  async function restore() {
    if (restoring) return;
    // Checked again: a workout may have been started or finished since the backup was picked.
    const blocked = restoreBlocker(writes);
    setError(blocked);
    if (blocked) return;
    setRestoring(true);
    try {
      await restoreArchive(pending.file);
      await onRestored();
    } catch (caught) {
      setError(errorMessage(caught));
      setRestoring(false);
    }
  }

  const cell = [type.callout, styles.num, { color: colors.text }];
  return (
    <Sheet
      visible
      title="Restore this backup?"
      kicker={archiveKicker(pending.preview)}
      onClose={() => {
        if (!restoring) onClose();
      }}
    >
      <View style={{ gap: space.md }}>
        <View
          style={[styles.table, { backgroundColor: colors.surface }]}
          accessibilityLabel="Backup and current data"
        >
          <View style={[styles.tr, { borderBottomColor: colors.line }]}>
            <Text style={[type.footnote, { flex: 1 }]} />
            <Text style={[type.footnote, styles.num, { color: colors.muted }]}>Backup</Text>
            <Text style={[type.footnote, styles.num, { color: colors.muted }]}>Now</Text>
          </View>
          {archiveCountRows(pending.preview).map((row) => (
            <View
              key={row.key}
              style={[styles.tr, { borderBottomColor: colors.line }]}
              accessible
              accessibilityLabel={`${row.label}: ${row.archive ?? 0} in backup, ${row.current ?? 0} now`}
            >
              <Text style={[type.callout, { flex: 1, color: colors.text }]}>{row.label}</Text>
              <Text style={cell}>{row.archive}</Text>
              <Text style={cell}>{row.current}</Text>
            </View>
          ))}
        </View>
        {skipped && <Text style={[type.footnote, { color: colors.secondary }]}>{skipped}</Text>}
        <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
          {ARCHIVE_RESTORE_WARNING}
        </Text>
        {error && (
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {error}
          </Text>
        )}
        <Button
          label={restoring ? 'Restoring…' : 'Restore backup'}
          disabled={restoring}
          onPress={() => void restore()}
        />
        <Button variant="secondary" label="Cancel" disabled={restoring} onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  table: { borderRadius: 14, overflow: 'hidden' },
  tr: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  num: { width: 72, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
