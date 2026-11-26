import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VISIBILITY_LABELS } from '../../../../frontend/src/sharedProfileDisplay';
import {
  ALWAYS_SHARED,
  choicesFrom,
  LIVE_OPTIONS,
  livePreview,
  PRIVATE_DEFAULTS,
  savesAtOnce,
  SHARING_CHOICES_SAVED,
  SHARING_NEVER,
  SHARING_OPTIONS,
  VISIBILITY_CONFIRM,
  VISIBILITY_OPTIONS,
  VISIBILITY_SAVED,
  visibilityPending,
  withVisibility,
} from '../../../../frontend/src/sharingChoices';
import type { SharingChoices } from '../../../../frontend/src/types';
import { useUser } from '../../session/SessionProvider';
import { Button, Card, CardHeader, ErrorState, errorMessage, Loading } from '../../ui/components';
import { Switch } from '../../ui/controls';
import { haptics } from '../../ui/haptics';
import { isToastAccountCurrent, showToast, toastAccount } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { pushedScreenOptions } from '../../ui/navigation';
import { syncLiftLeaderboardsForSharing } from '../training/exerciseInfoQueries';
import { Avatar } from './Avatar';
import { socialApi } from './socialApi';
import { refreshSocial, socialKeys, useSharingChoices } from './socialQueries';

/**
 * Who can see your profile and what it shares, as the web's Settings section. A new visibility
 * waits for its confirm button; share switches save at once while the profile is shared.
 */
/** The label for a saved visibility, or `null` for one this release doesn't know. */
function visibilityLabel(value: string): string | null {
  return Object.prototype.hasOwnProperty.call(VISIBILITY_LABELS, value)
    ? VISIBILITY_LABELS[value as keyof typeof VISIBILITY_LABELS]
    : null;
}

export function SharingSettingsScreen() {
  const { colors, radius, space, type } = useTheme();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const user = useUser();
  const query = useSharingChoices();
  const saved = query.data ?? null;
  const [draft, setDraft] = useState<SharingChoices | null>(null);
  const current = draft ?? (saved ? choicesFrom(saved) : PRIVATE_DEFAULTS);
  const save = useMutation({
    mutationFn: ({ next }: { next: SharingChoices; message: string }) =>
      socialApi.updateChoices(next),
    onMutate: ({ next }) => {
      setDraft(next);
      // The session the save started in: a late answer mustn't land in another account's cache.
      return { account: toastAccount() };
    },
    onSuccess: (stored, { message }, context) => {
      if (!context || !isToastAccountCurrent(context.account)) return;
      client.setQueryData(socialKeys.choices, stored);
      setDraft(null);
      haptics.success();
      showToast(message);
      // Sharing opens or closes Social, the feed, every profile and friends' lift rankings.
      void refreshSocial(client);
      syncLiftLeaderboardsForSharing(client, stored.visibility);
    },
    onError: () => setDraft(null),
  });
  const header = <Stack.Screen options={pushedScreenOptions(colors, 'Profile sharing')} />;

  if (!saved) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page }}>
        {header}
        {query.error ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <Loading label="Loading your sharing choices" />
        )}
      </View>
    );
  }

  const pending = visibilityPending(saved, current);
  const toggle = (next: SharingChoices) => {
    if (savesAtOnce(saved, current)) save.mutate({ next, message: SHARING_CHOICES_SAVED });
    else setDraft(next);
  };
  const preview = livePreview(current, null);
  // A newer server can send a visibility this release doesn't know: show it neutrally.
  const savedLabel = visibilityLabel(saved.visibility);
  const shared = savedLabel !== null && saved.visibility !== 'private';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.page }}
      contentContainerStyle={{
        padding: space.gutter,
        gap: space.stack,
        paddingBottom: insets.bottom + 32,
      }}
    >
      {header}
      <Card>
        <CardHeader
          title="Who can see your profile"
          action={
            <View
              style={[
                styles.statusPill,
                {
                  borderRadius: radius.pill,
                  backgroundColor: shared ? colors.accentSoft : colors.surface2,
                  borderColor: shared ? colors.accent : colors.lineStrong,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  { color: shared ? colors.accentText : colors.muted },
                ]}
              >
                {savedLabel ?? 'Other'}
              </Text>
            </View>
          }
        />
        <View accessibilityRole="radiogroup" style={styles.radioGroup}>
          {VISIBILITY_OPTIONS.map((option) => {
            const selected = current.visibility === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: save.isPending }}
                disabled={save.isPending}
                onPress={() => {
                  haptics.selection();
                  setDraft(withVisibility(saved, current, option.value));
                }}
                style={({ pressed }) => [
                  styles.optionCard,
                  {
                    borderRadius: radius.lg,
                    backgroundColor: selected ? colors.accentSoft : colors.surface2,
                    borderColor: selected ? colors.accent : colors.lineStrong,
                  },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View
                  style={[
                    styles.radio,
                    { borderColor: selected ? colors.accent : colors.lineStrong },
                  ]}
                >
                  {selected && (
                    <View style={[styles.radioDot, { backgroundColor: colors.accent }]} />
                  )}
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
                    {VISIBILITY_LABELS[option.value]}
                  </Text>
                  <Text style={[type.footnote, { color: colors.secondary, lineHeight: 18 }]}>
                    {option.description}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        {(pending || (save.isPending && save.variables?.message !== SHARING_CHOICES_SAVED)) && (
          <Button
            label={VISIBILITY_CONFIRM[current.visibility]}
            loading={save.isPending}
            onPress={() =>
              save.mutate({ next: current, message: VISIBILITY_SAVED[current.visibility] })
            }
          />
        )}
      </Card>
      <Card>
        <CardHeader title="What you share" />
        <View>
          {ALWAYS_SHARED.map((item, index) => (
            <SettingRow
              key={item.label}
              label={item.label}
              description={item.description}
              divider={index > 0}
            >
              <Text style={[type.footnote, { color: colors.muted, fontWeight: '600' }]}>
                Always
              </Text>
            </SettingRow>
          ))}
          {SHARING_OPTIONS.map((option) => (
            <SettingRow
              key={option.key}
              label={option.label}
              description={option.description}
              divider
            >
              <Switch
                accessibilityLabel={option.label}
                value={current[option.key]}
                disabled={save.isPending}
                onChange={(value) => toggle({ ...current, [option.key]: value })}
              />
            </SettingRow>
          ))}
        </View>
      </Card>
      <Card>
        <CardHeader title="Live activity" />
        <View>
          {LIVE_OPTIONS.map((option, index) => (
            <SettingRow key={option.key} label={option.label} divider={index > 0}>
              <Switch
                accessibilityLabel={option.label}
                value={current[option.key]}
                disabled={save.isPending}
                onChange={(value) => toggle({ ...current, [option.key]: value })}
              />
            </SettingRow>
          ))}
        </View>
        <View style={[styles.preview, { borderTopColor: colors.line }]}>
          <Text style={[type.caption, { color: colors.muted }]}>Friends see you as</Text>
          <View style={styles.previewPerson}>
            <Avatar person={user} size={36} status={preview.status} />
            <View>
              <Text style={[type.callout, { color: colors.text, fontWeight: '600' }]}>
                {user.display_name}
              </Text>
              <Text style={[type.footnote, { color: colors.secondary }]}>{preview.text}</Text>
            </View>
          </View>
        </View>
      </Card>
      {save.error && (
        <Text accessibilityRole="alert" style={[type.callout, { color: colors.danger }]}>
          {errorMessage(save.error)}
        </Text>
      )}
      <Text style={[type.footnote, { color: colors.muted, paddingHorizontal: 4 }]}>
        {SHARING_NEVER}
      </Text>
    </ScrollView>
  );
}

function SettingRow({
  label,
  description,
  divider = false,
  children,
}: {
  label: string;
  description?: string;
  divider?: boolean;
  children: ReactNode;
}) {
  const { colors, type } = useTheme();
  return (
    <View
      style={[
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.callout, { color: colors.text, fontWeight: '500' }]}>{label}</Text>
        {!!description && (
          <Text style={[type.footnote, { color: colors.secondary }]}>{description}</Text>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  statusPill: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  radioGroup: { gap: 8 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingVertical: 8 },
  preview: { gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  previewPerson: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
