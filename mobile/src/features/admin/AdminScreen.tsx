import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  accountActivityLabel,
  accountFilterOptions,
  accountOnline,
  accountsTitle,
  diskUsedPercent,
  feedbackResolvedNotice,
  filterAccounts,
  settingsSavedNotice,
  waitingRequestsLabel,
  type AccountFilter,
} from '../../../../frontend/src/adminAccounts';
import { VIDEO_UPLOAD_OPTIONS } from '../../../../frontend/src/adminDisplay';
import type {
  AdminUser,
  AppFeedback,
  ServerSettings,
  ServerSettingsUpdate,
} from '../../../../frontend/src/types';
import { useSession, useUser } from '../../session/SessionProvider';
import { Button, errorMessage, ErrorState, Loading } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { useNow } from '../../ui/useNow';
import {
  ChoiceRow,
  Row,
  Section,
  SectionError,
  SettingsPage,
  SwitchRow,
} from '../settings/SettingsList';
import {
  adminApi,
  adminKeys,
  useAdminActivity,
  useAdminFeedback,
  useAdminUsers,
  useServerSettings,
  useServerStatus,
} from './adminData';
import { adminIcons } from './icons';
import { adminRoutes } from './routes';
import { AccountTags } from './AccountTags';

/** The web's admin console: accounts, feedback, server switches, and the server's details. */
export function AdminScreen() {
  const user = useUser();
  const users = useAdminUsers();
  const feedback = useAdminFeedback();
  const settings = useServerSettings();
  const status = useServerStatus();
  const client = useQueryClient();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  useAdminActivity();

  if (users.isPending) return <Loading label="Loading accounts" />;
  if (users.error && !users.data)
    return <ErrorState message={errorMessage(users.error)} onRetry={() => void users.refetch()} />;

  async function refresh() {
    setRefreshing(true);
    try {
      await client.refetchQueries({ queryKey: adminKeys.all });
    } finally {
      setRefreshing(false);
    }
  }

  const usedPercent = status.data?.disk.total_bytes ? diskUsedPercent(status.data.disk) : null;
  return (
    <SettingsPage refreshing={refreshing} onRefresh={() => void refresh()}>
      <AccountsSection users={users.data} currentUserId={user.id} />
      {feedback.data && <FeedbackSection feedback={feedback.data} />}
      {settings.data && <SwitchesSection settings={settings.data} />}
      <Section title="Server">
        <Row
          label="Server details"
          icon={adminIcons.server}
          iconTint="#64748b"
          value={usedPercent === null ? null : `${usedPercent}% disk used`}
          onPress={() => router.push(adminRoutes.server)}
        />
      </Section>
    </SettingsPage>
  );
}

function AccountsSection({ users, currentUserId }: { users: AdminUser[]; currentUserId: string }) {
  const router = useRouter();
  const { colors, type, radius, space } = useTheme();
  const now = useNow(60_000);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AccountFilter | null>(null);
  const waiting = waitingRequestsLabel(users);
  const filters = accountFilterOptions(users, filter);
  const shown = filterAccounts(users, query, filter) ?? [];
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={[type.headline, { color: colors.text, flex: 1 }]}>
          {accountsTitle(users)}
        </Text>
        {waiting && (
          <Text
            style={[
              type.footnote,
              styles.badge,
              { color: colors.accentText, backgroundColor: colors.accentSoft },
            ]}
          >
            {waiting}
          </Text>
        )}
      </View>
      {users.length > 1 && (
        <View style={{ gap: space.sm }}>
          <View
            style={[styles.search, { backgroundColor: colors.surface2, borderRadius: radius.md }]}
          >
            <Icon name="search" size={15} color={colors.muted} />
            <TextInput
              accessibilityLabel="Search accounts"
              placeholder="Search name or username"
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
              style={[type.body, { color: colors.text, flex: 1, paddingVertical: 8 }]}
            />
          </View>
          {filters.length > 0 && (
            <View style={styles.filters} accessibilityLabel="Show only">
              {filters.map((option) => {
                const on = filter === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setFilter(on ? null : option.id)}
                    style={[
                      styles.chip,
                      {
                        borderRadius: radius.pill,
                        backgroundColor: on ? colors.accent : colors.surface2,
                      },
                    ]}
                  >
                    <Text
                      style={[type.footnote, { color: on ? colors.onAccent : colors.secondary }]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      )}
      {shown.length > 0 ? (
        <Section>
          {shown.map((account) => (
            <Pressable
              key={account.id}
              accessibilityRole="button"
              accessibilityLabel={`${account.display_name}, @${account.username}`}
              onPress={() => router.push(adminRoutes.account(account.id))}
              style={({ pressed }) => [
                styles.account,
                pressed && { backgroundColor: colors.surface2 },
                account.disabled_at !== null && { opacity: 0.6 },
              ]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[type.body, { color: colors.text, fontWeight: '600' }]}>
                  {account.display_name}
                </Text>
                <AccountTags account={account} isSelf={account.id === currentUserId} />
                <Text style={[type.footnote, { color: colors.muted }]}>@{account.username}</Text>
              </View>
              <Text
                numberOfLines={1}
                style={[
                  type.footnote,
                  styles.activity,
                  { color: accountOnline(account) ? colors.good : colors.muted },
                ]}
              >
                {accountActivityLabel(account, now)}
              </Text>
              <Icon name="chevronRight" size={14} color={colors.muted} />
            </Pressable>
          ))}
        </Section>
      ) : (
        <Text style={[type.callout, { color: colors.muted }]}>No accounts match.</Text>
      )}
    </View>
  );
}

function FeedbackSection({ feedback }: { feedback: AppFeedback[] }) {
  const client = useQueryClient();
  const { colors, type, space } = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const open = feedback.filter((item) => item.resolved_at === null).length;

  async function setResolved(item: AppFeedback, resolved: boolean) {
    if (busy) return;
    setBusy(item.id);
    setError(null);
    try {
      const updated = await adminApi.setFeedbackResolved(item.id, resolved);
      // Keep the row where it is until the next refresh, so it doesn't jump away mid-review.
      client.setQueryData<AppFeedback[]>(adminKeys.feedback, (current) =>
        current?.map((row) => (row.id === updated.id ? updated : row)),
      );
      showToast(feedbackResolvedNotice(updated, resolved));
    } catch (reason) {
      setError({ id: item.id, message: errorMessage(reason) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={[type.headline, { color: colors.text, flex: 1 }]}>
          App feedback
        </Text>
        {open > 0 && (
          <Text
            style={[
              type.footnote,
              styles.badge,
              { color: colors.accentText, backgroundColor: colors.accentSoft },
            ]}
          >
            {open} open
          </Text>
        )}
      </View>
      {feedback.length === 0 ? (
        <Text style={[type.callout, { color: colors.muted }]}>No feedback yet.</Text>
      ) : (
        <Section>
          {feedback.map((item) => {
            const resolved = item.resolved_at !== null;
            return (
              <View key={item.id} style={[styles.feedback, resolved && { opacity: 0.7 }]}>
                <View style={styles.heading}>
                  <Text style={[type.callout, { color: colors.text, fontWeight: '600', flex: 1 }]}>
                    @{item.username}
                  </Text>
                  <Text style={[type.footnote, { color: colors.muted }]}>
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                </View>
                <Text style={[type.body, { color: colors.text }]}>{item.message}</Text>
                {resolved && (
                  <Text style={[type.footnote, { color: colors.muted }]}>
                    Resolved{item.resolved_by && ` by @${item.resolved_by}`} ·{' '}
                    {new Date(item.resolved_at!).toLocaleString()}
                  </Text>
                )}
                {error?.id === item.id && (
                  <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
                    {error.message}
                  </Text>
                )}
                <Button
                  label={busy === item.id ? 'Saving…' : resolved ? 'Reopen' : 'Resolve'}
                  accessibilityLabel={`${resolved ? 'Reopen' : 'Resolve'} feedback from @${item.username}`}
                  variant={resolved ? 'secondary' : 'primary'}
                  disabled={busy !== null}
                  onPress={() => void setResolved(item, !resolved)}
                  style={{ alignSelf: 'flex-start' }}
                />
              </View>
            );
          })}
        </Section>
      )}
    </View>
  );
}

function SwitchesSection({ settings }: { settings: ServerSettings }) {
  const client = useQueryClient();
  const { updateUser } = useSession();
  const [saving, setSaving] = useState<ServerSettingsUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = { ...settings, ...saving };

  async function save(update: ServerSettingsUpdate) {
    if (saving) return;
    setSaving(update);
    setError(null);
    try {
      const saved = await adminApi.updateSettings(update);
      client.setQueryData(adminKeys.settings, saved);
      if (update.video_uploads) {
        // Show or hide Videos for this admin straight away; the switch is already saved, so a
        // failed refresh only delays that until the next sign-in check.
        await adminApi
          .me()
          .then(updateUser)
          .catch(() => undefined);
      }
      showToast(settingsSavedNotice(update, saved));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <Section title="Features">
        <ChoiceRow
          label="Video uploads"
          icon={adminIcons.video}
          iconTint="#ef4444"
          value={shown.video_uploads}
          disabled={saving !== null}
          choices={VIDEO_UPLOAD_OPTIONS.map(({ value, label }) => ({ value, label }))}
          onChange={(mode) => void save({ video_uploads: mode })}
        />
        <SwitchRow
          label="New sign-ups"
          icon={adminIcons.signUp}
          iconTint="#22c55e"
          value={shown.allow_registration}
          disabled={saving !== null}
          onChange={(open) => void save({ allow_registration: open })}
        />
      </Section>
      <SectionError message={error} />
    </>
  );
}

const styles = StyleSheet.create({
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6 },
  account: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  activity: { maxWidth: 130, textAlign: 'right' },
  feedback: { padding: 16, gap: 8 },
});
