import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
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
import { Icon } from '../../ui/Icon';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { Avatar } from './Avatar';
import { socialHeader } from './screenOptions';
import { socialApi } from './socialApi';
import { refreshSocial, socialKeys, useSharingChoices } from './socialQueries';

/**
 * Who can see your profile and what it shares, as the web's Settings section. A new visibility
 * waits for its confirm button; share switches save at once while the profile is shared.
 */
export function SharingSettingsScreen() {
  const { colors, space, type } = useTheme();
  const client = useQueryClient();
  const user = useUser();
  const query = useSharingChoices();
  const saved = query.data ?? null;
  const [draft, setDraft] = useState<SharingChoices | null>(null);
  const current = draft ?? (saved ? choicesFrom(saved) : PRIVATE_DEFAULTS);
  const save = useMutation({
    mutationFn: ({ next }: { next: SharingChoices; message: string }) =>
      socialApi.updateChoices(next),
    onMutate: ({ next }) => setDraft(next),
    onSuccess: (stored, { message }) => {
      client.setQueryData(socialKeys.choices, stored);
      setDraft(null);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(message);
      // Sharing opens or closes Social, the feed and every profile.
      void refreshSocial(client);
    },
    onError: () => setDraft(null),
  });
  const header = <Stack.Screen options={socialHeader(colors, 'Profile sharing')} />;

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.page }}
      contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 }}
    >
      {header}
      <Card>
        <CardHeader
          title="Who can see your profile"
          action={
            <Text
              style={[
                type.footnote,
                {
                  color: saved.visibility === 'private' ? colors.muted : colors.good,
                  fontWeight: '700',
                },
              ]}
            >
              {VISIBILITY_LABELS[saved.visibility]}
            </Text>
          }
        />
        <View accessibilityRole="radiogroup">
          {VISIBILITY_OPTIONS.map((option) => {
            const selected = current.visibility === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: save.isPending }}
                disabled={save.isPending}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setDraft(withVisibility(saved, current, option.value));
                }}
                style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[type.body, { color: colors.text, fontWeight: '600' }]}>
                    {VISIBILITY_LABELS[option.value]}
                  </Text>
                  <Text style={[type.footnote, { color: colors.secondary }]}>
                    {option.description}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    { borderColor: selected ? colors.accent : colors.lineStrong },
                    selected && { backgroundColor: colors.accent },
                  ]}
                >
                  {selected && <Icon name="check" size={12} color={colors.onAccent} />}
                </View>
              </Pressable>
            );
          })}
        </View>
        {(pending || (save.isPending && save.variables?.message !== SHARING_CHOICES_SAVED)) && (
          <Button
            label={VISIBILITY_CONFIRM[current.visibility]}
            disabled={save.isPending}
            onPress={() =>
              save.mutate({ next: current, message: VISIBILITY_SAVED[current.visibility] })
            }
          />
        )}
      </Card>
      <Card>
        <CardHeader title="What you share" />
        {ALWAYS_SHARED.map((item) => (
          <SettingRow key={item.label} label={item.label} description={item.description}>
            <Text style={[type.footnote, { color: colors.muted, fontWeight: '600' }]}>Always</Text>
          </SettingRow>
        ))}
        {SHARING_OPTIONS.map((option) => (
          <SettingRow key={option.key} label={option.label} description={option.description}>
            <Switch
              accessibilityLabel={option.label}
              value={current[option.key]}
              disabled={save.isPending}
              trackColor={{ true: colors.accent }}
              onValueChange={(value) => toggle({ ...current, [option.key]: value })}
            />
          </SettingRow>
        ))}
      </Card>
      <Card>
        <CardHeader title="Live activity" />
        {LIVE_OPTIONS.map((option) => (
          <SettingRow key={option.key} label={option.label}>
            <Switch
              accessibilityLabel={option.label}
              value={current[option.key]}
              disabled={save.isPending}
              trackColor={{ true: colors.accent }}
              onValueChange={(value) => toggle({ ...current, [option.key]: value })}
            />
          </SettingRow>
        ))}
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
      <Text style={[type.footnote, { color: colors.muted }]}>{SHARING_NEVER}</Text>
    </ScrollView>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  const { colors, type } = useTheme();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.body, { color: colors.text }]}>{label}</Text>
        {!!description && (
          <Text style={[type.footnote, { color: colors.secondary }]}>{description}</Text>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  preview: { gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  previewPerson: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
