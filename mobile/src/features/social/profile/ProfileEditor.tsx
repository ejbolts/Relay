import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  authErrorText,
  PROFILE_PHOTO_ERRORS,
  profileNameError,
} from '../../../../../frontend/src/authRules';
import { formatMemberSince, SEX_LABELS } from '../../../../../frontend/src/profileDisplay';
import type { Sex, User } from '../../../../../frontend/src/types';
import { ApiError } from '../../../data/api';
import { useUser } from '../../../session/SessionProvider';
import { Button, errorMessage } from '../../../ui/components';
import { Segmented, TextField } from '../../../ui/controls';
import { Icon } from '../../../ui/Icon';
import { ProfilePhoto } from '../../../ui/ProfilePhoto';
import { showMenu } from '../../../ui/prompts';
import { isToastAccountCurrent, showToast, toastAccount } from '../../../ui/Toast';
import { useTheme } from '../../../ui/theme';
import { settingsIcons } from '../../settings/icons';
import { removeProfilePhoto, updateProfile, uploadProfilePhoto } from '../../settings/settingsData';

const SEXES: Sex[] = ['male', 'female'];
type PickedPhoto = { uri: string; mimeType?: string | null };

/**
 * Inline editor for your own profile inside the profile header card, matching the web's
 * `ProfileIdentity` while reusing Settings' profile save endpoints and photo picker flow.
 */
export function ProfileEditor({
  onSaved,
  onClose,
}: {
  onSaved: (user: User) => void;
  onClose: () => void;
}) {
  // Shown only on your own profile, behind the sign-in gate.
  const user = useUser();
  const { colors, type, radius } = useTheme();
  const [displayName, setDisplayName] = useState(user.display_name);
  // Chosen once: the draft exists only until the account has a sex.
  const [sex, setSex] = useState<Sex | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sexDirty = !user.sex && sex !== null;
  const textDirty = displayName.trim() !== user.display_name || sexDirty;
  const dirty = textDirty || photo !== null || removePhoto;
  const hasPhoto = !!photo || (!!user.profile_photo_url && !removePhoto);
  const joined = formatMemberSince(user.created_at);

  async function pick(source: 'library' | 'camera') {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    };
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setError('Allow camera access in your phone’s settings to take a photo.');
          return;
        }
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      setPhoto({ uri: asset.uri, mimeType: asset.mimeType });
      setRemovePhoto(false);
      setError(null);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  function photoMenu() {
    showMenu(undefined, [
      { label: 'Choose photo', onPress: () => void pick('library') },
      { label: 'Take photo', onPress: () => void pick('camera') },
      ...(hasPhoto
        ? [
            {
              label: 'Remove photo',
              destructive: true,
              onPress: () => {
                setPhoto(null);
                setRemovePhoto(Boolean(user.profile_photo_url));
                setError(null);
              },
            },
          ]
        : []),
    ]);
  }

  async function save(sexConfirmed = false) {
    if (saving || !dirty) return;
    setError(null);
    const nameError = profileNameError(displayName);
    if (nameError) {
      setError(nameError);
      return;
    }
    // A sex cannot be changed later, so saving one is confirmed first.
    if (sexDirty && sex && !sexConfirmed) {
      Alert.alert(
        `Save your sex as ${SEX_LABELS[sex]}?`,
        'It sets your body measurement outline. After you save, only an administrator can change it.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: () => void save(true) },
        ],
      );
      return;
    }
    const account = toastAccount();
    setSaving(true);
    let detailsSaved = false;
    try {
      if (textDirty) {
        const updated = await updateProfile({
          ...(displayName.trim() !== user.display_name ? { display_name: displayName.trim() } : {}),
          ...(sexDirty && sex ? { sex } : {}),
        });
        if (!isToastAccountCurrent(account)) return;
        onSaved(updated);
        detailsSaved = true;
      }
      if (photo) {
        const updated = await uploadProfilePhoto(photo);
        if (!isToastAccountCurrent(account)) return;
        onSaved(updated);
      } else if (removePhoto) {
        const updated = await removeProfilePhoto();
        if (!isToastAccountCurrent(account)) return;
        onSaved(updated);
      }
      showToast('Profile saved.', undefined, { account });
      onClose();
    } catch (reason) {
      if (!isToastAccountCurrent(account)) return;
      const message =
        reason instanceof ApiError
          ? reason.code && PROFILE_PHOTO_ERRORS.has(reason.code)
            ? reason.message
            : authErrorText(reason)
          : errorMessage(reason);
      setError(`${detailsSaved ? 'Your details were saved. ' : ''}${message}`);
      setSaving(false);
    }
  }

  return (
    <View style={styles.form} accessibilityLabel="Edit profile">
      <View style={styles.headerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hasPhoto ? 'Change profile photo' : 'Add profile photo'}
          disabled={saving}
          onPress={photoMenu}
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <ProfilePhoto user={user} size={72} preview={photo?.uri} hidden={removePhoto} />
          <View style={[styles.photoBadge, { backgroundColor: colors.accent }]}>
            <Icon name={settingsIcons.camera} size={14} color={colors.onAccent} />
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameRow}>
            <Text style={[type.title, { color: colors.text, flexShrink: 1 }]} numberOfLines={2}>
              {user.display_name}
            </Text>
            <View
              style={[
                styles.badge,
                { backgroundColor: colors.accentSoft, borderRadius: radius.pill },
              ]}
            >
              <Text style={[type.caption, { color: colors.accentText, fontWeight: '700' }]}>
                You
              </Text>
            </View>
          </View>
          <Text style={[type.footnote, { color: colors.secondary }]} numberOfLines={1}>
            {user.username}
          </Text>
          {!!joined && (
            <Text style={[type.footnote, { color: colors.muted }]}>Joined {joined}</Text>
          )}
        </View>
      </View>

      <TextField
        label="Name"
        value={displayName}
        onChangeText={setDisplayName}
        editable={!saving}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={80}
        returnKeyType="done"
      />

      <LockedField label="Username" value={user.username} />

      {user.sex ? (
        <LockedField label="Sex" value={SEX_LABELS[user.sex]} />
      ) : (
        <View style={styles.field}>
          <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>Sex</Text>
          <Segmented
            accessibilityLabel="Sex"
            values={SEXES.map((option) => SEX_LABELS[option])}
            selectedIndex={sex ? SEXES.indexOf(sex) : -1}
            enabled={!saving}
            onChange={(index) => setSex(SEXES[index] ?? null)}
          />
        </View>
      )}

      {!!error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error}
        </Text>
      )}

      <View style={styles.actions}>
        <Button
          label="Cancel"
          variant="secondary"
          disabled={saving}
          onPress={onClose}
          style={{ flex: 1 }}
        />
        <Button
          label={saving ? 'Saving…' : 'Save profile'}
          variant="primary"
          disabled={!dirty || saving}
          loading={saving}
          onPress={() => void save()}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}

/** A read-only profile value with its lock icon, matching the web's locked Username/Sex fields. */
function LockedField({ label, value }: { label: string; value: string }) {
  const { colors, type, radius } = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}, ${value}, locked`} style={styles.field}>
      <Text style={[type.footnote, { color: colors.secondary, fontWeight: '600' }]}>{label}</Text>
      <View
        style={[
          styles.lockedBox,
          {
            backgroundColor: colors.surface2,
            borderColor: colors.line,
            borderRadius: radius.md,
          },
        ]}
      >
        <Text style={[type.body, { color: colors.secondary, flex: 1 }]} numberOfLines={1}>
          {value}
        </Text>
        <Icon name={settingsIcons.lock} size={14} color={colors.muted} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  badge: { paddingHorizontal: 8, paddingVertical: 2 },
  photoBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { gap: 6 },
  lockedBox: {
    minHeight: 46,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actions: { flexDirection: 'row', gap: 10 },
});
