import SegmentedControl, {
  type SegmentedControlProps,
} from '@react-native-segmented-control/segmented-control';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useState, type ComponentType } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  authErrorText,
  PROFILE_PHOTO_ERRORS,
  profileNameError,
} from '../../../../frontend/src/authRules';
import { formatMemberSince, SEX_LABELS } from '../../../../frontend/src/profileDisplay';
import type { Sex } from '../../../../frontend/src/types';
import { ApiError } from '../../data/api';
import { useSession, useUser } from '../../session/SessionProvider';
import { errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showMenu } from '../../ui/prompts';
import { showToast } from '../../ui/Toast';
import { useTheme } from '../../ui/theme';
import { settingsIcons } from './icons';
import { ProfilePhoto } from '../../ui/ProfilePhoto';
import { removeProfilePhoto, updateProfile, uploadProfilePhoto } from './settingsData';
import { Row, Section, SettingsPage } from './SettingsList';

const SEXES: Sex[] = ['male', 'female'];
// The library's class typing predates React 19's JSX types.
const NativeSegmentedControl = SegmentedControl as unknown as ComponentType<SegmentedControlProps>;
type PickedPhoto = { uri: string; mimeType?: string | null };

/** Name, photo and (once) sex, as Edit profile on the web; saved together from the header. */
export function EditProfileScreen() {
  const user = useUser();
  const { updateUser } = useSession();
  const router = useRouter();
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
    setSaving(true);
    let detailsSaved = false;
    try {
      if (textDirty) {
        updateUser(
          await updateProfile({
            ...(displayName.trim() !== user.display_name
              ? { display_name: displayName.trim() }
              : {}),
            ...(sexDirty && sex ? { sex } : {}),
          }),
        );
        detailsSaved = true;
      }
      if (photo) updateUser(await uploadProfilePhoto(photo));
      else if (removePhoto) updateUser(await removeProfilePhoto());
      showToast('Profile saved.');
      router.back();
    } catch (reason) {
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
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{
          headerRight: () =>
            saving ? (
              <ActivityIndicator color={colors.accentText} />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save profile"
                accessibilityState={{ disabled: !dirty }}
                disabled={!dirty}
                hitSlop={8}
                onPress={() => void save()}
              >
                <Text
                  style={[
                    type.body,
                    { color: colors.accentText, fontWeight: '600', opacity: dirty ? 1 : 0.4 },
                  ]}
                >
                  Save
                </Text>
              </Pressable>
            ),
        }}
      />
      <SettingsPage>
        <View style={styles.photo}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasPhoto ? 'Change profile photo' : 'Add profile photo'}
            disabled={saving}
            onPress={photoMenu}
          >
            <ProfilePhoto user={user} size={112} preview={photo?.uri} hidden={removePhoto} />
            <View style={[styles.photoBadge, { backgroundColor: colors.accent }]}>
              <Icon name={settingsIcons.camera} size={15} color={colors.onAccent} />
            </View>
          </Pressable>
          {!!joined && (
            <Text style={[type.footnote, { color: colors.muted }]}>Joined {joined}</Text>
          )}
        </View>
        <Section title="Name">
          <TextInput
            accessibilityLabel="Name"
            value={displayName}
            onChangeText={setDisplayName}
            editable={!saving}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            maxLength={80}
            returnKeyType="done"
            style={[type.body, styles.name, { color: colors.text }]}
          />
        </Section>
        <Section>
          <Row
            label="Username"
            value={user.username}
            accessory={<Icon name={settingsIcons.lock} size={13} color={colors.muted} />}
            accessibilityLabel={`Username, ${user.username}, locked`}
          />
          {user.sex ? (
            <Row
              label="Sex"
              value={SEX_LABELS[user.sex]}
              accessory={<Icon name={settingsIcons.lock} size={13} color={colors.muted} />}
              accessibilityLabel={`Sex, ${SEX_LABELS[user.sex]}, locked`}
            />
          ) : (
            <Row
              label="Sex"
              accessory={
                <NativeSegmentedControl
                  accessibilityLabel="Sex"
                  style={{ width: 170 }}
                  values={SEXES.map((option) => SEX_LABELS[option])}
                  selectedIndex={sex ? SEXES.indexOf(sex) : -1}
                  enabled={!saving}
                  onChange={(event) =>
                    setSex(SEXES[event.nativeEvent.selectedSegmentIndex] ?? null)
                  }
                />
              }
            />
          )}
        </Section>
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={[
              type.callout,
              { color: colors.danger, borderRadius: radius.md, paddingHorizontal: 4 },
            ]}
          >
            {error}
          </Text>
        )}
      </SettingsPage>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  photo: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  photoBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { minHeight: 50, paddingHorizontal: 16 },
});
