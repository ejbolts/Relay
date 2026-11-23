import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { diskUsedPercent, nativeClientLabel } from '../../../../frontend/src/adminAccounts';
import {
  formatBytes,
  formatLastActive,
  LIMIT_GROUPS,
  limitDraft,
  parseLimitDraft,
  plural,
  validLimit,
  videoQueueSummary,
} from '../../../../frontend/src/adminDisplay';
import type {
  AccountLimits,
  AccountLimitsSettings,
  ServerStatus,
} from '../../../../frontend/src/types';
import { Button, errorMessage, ErrorState, Loading } from '../../ui/components';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import { Row, Section, SectionError, SettingsPage } from '../settings/SettingsList';
import { adminApi, adminKeys, useAccountLimits, useServerStatus } from './adminData';

/** The web's folded Server panel: hidden account limits, storage, and app versions in use. */
export function AdminServerScreen() {
  const limits = useAccountLimits();
  const status = useServerStatus();
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  if (limits.isPending || status.isPending) return <Loading label="Loading the server" />;
  const failed = (!limits.data && limits.error) || (!status.data && status.error);
  if (failed)
    return (
      <ErrorState
        message={errorMessage(failed)}
        onRetry={() => void client.refetchQueries({ queryKey: adminKeys.all })}
      />
    );

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([limits.refetch(), status.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SettingsPage refreshing={refreshing} onRefresh={() => void refresh()}>
      {status.data && <StorageSection status={status.data} />}
      {status.data && <VersionsSection status={status.data} />}
      {limits.data && (
        // Keyed by the saved values, so the form restarts from what the server holds.
        <LimitsSection key={JSON.stringify(limits.data.values)} limits={limits.data} />
      )}
    </SettingsPage>
  );
}

function StorageSection({ status }: { status: ServerStatus }) {
  const { colors, type, radius } = useTheme();
  const used = diskUsedPercent(status.disk);
  return (
    <View style={{ gap: 8 }}>
      <Section title="Storage and processing">
        <View style={styles.meterRow}>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Disk used"
            accessibilityValue={{ min: 0, max: 100, now: used }}
            style={[styles.meter, { backgroundColor: colors.surface3, borderRadius: radius.pill }]}
          >
            <View
              style={{
                width: `${used}%`,
                height: '100%',
                backgroundColor: used >= 90 ? colors.danger : colors.accent,
                borderRadius: radius.pill,
              }}
            />
          </View>
          <Text style={[type.footnote, { color: colors.secondary }]}>
            {formatBytes(status.disk.free_bytes)} free of {formatBytes(status.disk.total_bytes)} (
            {used}% used)
          </Text>
        </View>
        <Row label="Database" value={formatBytes(status.database_bytes)} />
        <Row
          label="Machine photos"
          value={`${plural(status.photos, 'photo')} · ${formatBytes(status.photo_bytes)}`}
        />
        <Row label="Video files on disk" value={formatBytes(status.video_file_bytes)} />
        <Row label="Video queue" value={videoQueueSummary(status.video_queue)} />
      </Section>
    </View>
  );
}

function VersionsSection({ status }: { status: ServerStatus }) {
  const { colors, type } = useTheme();
  const now = useNow(60_000);
  const versions = status.client_versions ?? [];
  return (
    <Section title="App versions in use · last 30 days">
      {versions.map((usage) => (
        <View key={usage.version ?? 'unreported'} style={styles.version}>
          <Text style={[type.body, { color: colors.text, fontWeight: '600' }]}>
            {usage.version ? `Version ${usage.version}` : 'Not reported'}
          </Text>
          <Text style={[type.footnote, { color: colors.secondary }]}>
            {plural(usage.users, 'account')} · {plural(usage.sessions, 'device')} ·{' '}
            {formatLastActive(usage.last_seen_at, new Date(now))}
          </Text>
          {usage.native_clients?.map(({ client, sessions }) => (
            <Text key={client} style={[type.footnote, { color: colors.muted }]}>
              {nativeClientLabel(client)} · {plural(sessions, 'device')}
            </Text>
          ))}
        </View>
      ))}
      {versions.length === 0 && <Row label="Signed-in devices" value="None" />}
      <Row label="Oldest version that can save" value={status.minimum_write_version ?? 'Any'} />
    </Section>
  );
}

function LimitsSection({ limits }: { limits: AccountLimitsSettings }) {
  const client = useQueryClient();
  const { colors, type, radius } = useTheme();
  const [draft, setDraft] = useState(() => limitDraft(limits.values));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseLimitDraft(draft, limits.bounds);
  const names = Object.keys(limits.values) as (keyof AccountLimits)[];
  const changed = parsed !== null && names.some((name) => parsed[name] !== limits.values[name]);
  const defaultsDraft = limitDraft(limits.defaults);
  const showingDefaults = names.every((name) => draft[name] === defaultsDraft[name]);

  async function save() {
    if (!parsed || !changed || saving) return;
    setSaving(true);
    setError(null);
    try {
      client.setQueryData(adminKeys.limits, await adminApi.updateLimits(parsed));
      showToast('Limits saved.');
    } catch (reason) {
      setError(errorMessage(reason));
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      {LIMIT_GROUPS.map((group) => (
        <Section key={group.title} title={`Account limits · ${group.title}`}>
          {group.fields.map((field) => {
            const bound = limits.bounds[field.name];
            const valid = validLimit(draft[field.name], bound);
            const unit = field.unit ? ` ${field.unit}` : '';
            return (
              <Row
                key={field.name}
                label={field.label}
                accessory={
                  <View style={styles.limit}>
                    <Text style={[type.caption, { color: colors.muted }]}>
                      Default {limits.defaults[field.name].toLocaleString()}
                      {unit}
                    </Text>
                    <TextInput
                      accessibilityLabel={field.label}
                      value={draft[field.name]}
                      editable={!saving}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      selectTextOnFocus
                      onChangeText={(text) =>
                        setDraft((current) => ({ ...current, [field.name]: text }))
                      }
                      style={[
                        type.body,
                        type.number,
                        styles.input,
                        {
                          color: valid ? colors.text : colors.danger,
                          backgroundColor: colors.surface2,
                          borderRadius: radius.sm,
                          borderColor: valid ? 'transparent' : colors.danger,
                        },
                      ]}
                    />
                  </View>
                }
              />
            );
          })}
        </Section>
      ))}
      <SectionError message={error} />
      <View style={styles.buttons}>
        <Button
          label="Use defaults"
          variant="secondary"
          disabled={saving || showingDefaults}
          onPress={() => setDraft(defaultsDraft)}
        />
        <Button
          label={saving ? 'Saving…' : 'Save limits'}
          disabled={saving || !changed}
          onPress={() => void save()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  meterRow: { padding: 16, gap: 8 },
  meter: { height: 10, overflow: 'hidden' },
  version: { paddingHorizontal: 16, paddingVertical: 12, gap: 2 },
  limit: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: {
    minWidth: 76,
    textAlign: 'right',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  buttons: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
});
