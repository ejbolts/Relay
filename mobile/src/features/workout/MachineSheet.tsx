import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { machineLastUsedLabel } from '../../../../frontend/src/machineHistory';
import { cleanMachineSettings } from '../../../../frontend/src/setMachines';
import type { Exercise, MachinePhotoUsage, MachineSetting } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { apiSend } from '../../data/api';
import { Button } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { promptText, showMenu } from '../../ui/prompts';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { loggerKeys, machineSettings, useMachinePhotos } from './loggerQueries';
import { uploadMachinePhoto, useAccountImage } from './machineMedia';

export interface MachineTarget {
  movementKey: string;
  exercise: Exercise;
  machinePhotoIds: string[];
  machineSettings?: MachineSetting[];
}

/**
 * The machines an exercise is done on, as the web's machine chooser offers them: pin one (or
 * several, then each set names its machine), photograph a new one, and keep its settings such
 * as seat height. Choosing a machine suggests sets from its own last session.
 */
export function MachineSheet({
  target,
  onChoose,
  onSettings,
  onClose,
}: {
  target: MachineTarget | null;
  /** `chosen` marks machines the person picked rather than ones restored automatically. */
  onChoose: (machinePhotoIds: string[], photos: MachinePhotoUsage[]) => void;
  onSettings: (settings: MachineSetting[]) => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={!!target} onClose={onClose} title="Machines" kicker={target?.exercise.name}>
      {target && (
        <MachineChoices
          key={target.movementKey}
          target={target}
          onChoose={onChoose}
          onSettings={onSettings}
        />
      )}
    </Sheet>
  );
}

function MachineChoices({
  target,
  onChoose,
  onSettings,
}: {
  target: MachineTarget;
  onChoose: (machinePhotoIds: string[], photos: MachinePhotoUsage[]) => void;
  onSettings: (settings: MachineSetting[]) => void;
}) {
  const { colors, type } = useTheme();
  const client = useQueryClient();
  const query = useMachinePhotos(target.exercise.id);
  const photos = query.data ?? [];
  const [uploading, setUploading] = useState(false);
  const [today] = useState(localDate);
  const pinned = target.machinePhotoIds;
  const primary = pinned.at(-1);

  const choose = (ids: string[], list = photos) => {
    void Haptics.selectionAsync();
    onChoose(ids, list);
    // A newly chosen machine records its saved settings, as on the web.
    const added = ids.at(-1);
    if (added && added !== primary)
      void machineSettings(target.exercise.id, added)
        .then((result) => onSettings(result.settings))
        .catch(() => undefined);
  };

  async function addPhoto(source: 'camera' | 'library') {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        source === 'camera' ? 'Camera access is off' : 'Photo access is off',
        source === 'camera'
          ? 'Allow camera access in Settings to photograph a machine.'
          : 'Allow photo access in Settings to choose a machine photo.',
      );
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    promptText({
      title: 'Machine name',
      value: '',
      placeholder: 'Such as Cybex leg press',
      submitLabel: 'Save',
      onSubmit: (caption) => {
        if (!caption.trim()) {
          Alert.alert('Name the machine', 'Enter the machine name before saving the photo.');
          return;
        }
        setUploading(true);
        void uploadMachinePhoto(
          target.exercise.id,
          {
            uri: asset.uri,
            name: asset.fileName ?? 'machine.jpg',
            type: asset.mimeType ?? 'image/jpeg',
          },
          caption.trim(),
          target.machineSettings ?? [],
        )
          .then((photo) => {
            const added: MachinePhotoUsage = {
              ...photo,
              exercise_name: target.exercise.name,
              workout_count: 0,
              last_used_date: null,
            };
            const list = [added, ...photos];
            client.setQueryData(loggerKeys.machines(target.exercise.id), list);
            choose([...new Set([...pinned, photo.id])], list);
          })
          .catch((reason) =>
            Alert.alert(
              'Photo not saved',
              reason instanceof Error ? reason.message : 'Could not save the photo.',
            ),
          )
          .finally(() => setUploading(false));
      },
    });
  }

  return (
    <View style={{ gap: 14 }}>
      {query.isPending ? (
        <ActivityIndicator color={colors.accentText} />
      ) : query.isError && !photos.length ? (
        <Text style={[type.callout, { color: colors.secondary }]}>
          Could not load this exercise&apos;s machines.
        </Text>
      ) : (
        photos.map((photo) => {
          const on = pinned.includes(photo.id);
          return (
            <MachineRow
              key={photo.id}
              photo={photo}
              on={on}
              detail={[
                photo.workout_count
                  ? `${photo.workout_count} ${photo.workout_count === 1 ? 'workout' : 'workouts'}`
                  : null,
                machineLastUsedLabel(photo.last_used_date, today),
              ]
                .filter(Boolean)
                .join(' · ')}
              onPress={() =>
                choose(on ? pinned.filter((id) => id !== photo.id) : [...pinned, photo.id])
              }
            />
          );
        })
      )}
      <Button
        label={uploading ? 'Saving photo…' : 'Add machine photo'}
        icon={{ sf: 'camera', md: 'photo-camera' }}
        variant="secondary"
        disabled={uploading}
        onPress={() =>
          showMenu('Add machine photo', [
            { label: 'Take photo', onPress: () => void addPhoto('camera') },
            { label: 'Choose photo', onPress: () => void addPhoto('library') },
          ])
        }
      />
      {primary && (
        <SettingsEditor
          // Each machine keeps its own settings.
          key={primary}
          exerciseId={target.exercise.id}
          machinePhotoId={primary}
          settings={target.machineSettings ?? []}
          onSaved={onSettings}
        />
      )}
    </View>
  );
}

function MachineRow({
  photo,
  on,
  detail,
  onPress,
}: {
  photo: MachinePhotoUsage;
  on: boolean;
  detail: string;
  onPress: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const image = useAccountImage(photo.thumbnail_url);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={photo.caption || 'Machine'}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: colors.surface2,
          borderRadius: radius.md,
          borderColor: on ? colors.accent : 'transparent',
        },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: colors.surface3, borderRadius: radius.sm }]}>
        {image ? (
          <Image source={{ uri: image }} style={styles.thumbImage} />
        ) : (
          <Icon name={{ sf: 'photo', md: 'photo' }} size={18} color={colors.muted} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.headline, { color: colors.text }]} numberOfLines={1}>
          {photo.caption || 'Machine'}
        </Text>
        {!!detail && (
          <Text style={[type.footnote, { color: colors.muted }]} numberOfLines={1}>
            {detail}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.check,
          { backgroundColor: on ? colors.accent : colors.surface, borderColor: colors.lineStrong },
        ]}
      >
        {on && <Icon name="check" size={14} color={colors.onAccent} />}
      </View>
    </Pressable>
  );
}

function SettingsEditor({
  exerciseId,
  machinePhotoId,
  settings,
  onSaved,
}: {
  exerciseId: string;
  machinePhotoId: string;
  settings: MachineSetting[];
  onSaved: (settings: MachineSetting[]) => void;
}) {
  const { colors, type, radius } = useTheme();
  const [rows, setRows] = useState<MachineSetting[]>(() =>
    settings.length ? settings : [{ name: '', value: '' }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = [
    styles.field,
    type.body,
    { backgroundColor: colors.surface2, borderRadius: radius.md, color: colors.text },
  ];
  const changeRow = (index: number, values: Partial<MachineSetting>) => {
    setError(null);
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...values } : row)));
  };

  async function save() {
    let cleaned: MachineSetting[];
    try {
      cleaned = cleanMachineSettings(rows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enter a setting name and value.');
      return;
    }
    setSaving(true);
    try {
      const saved = await apiSend<{ settings: MachineSetting[] }>(
        `/api/exercises/${encodeURIComponent(exerciseId)}/machine-settings?machine_photo_id=${encodeURIComponent(machinePhotoId)}`,
        'PUT',
        { settings: cleaned },
      );
      onSaved(saved.settings);
      setRows(saved.settings.length ? saved.settings : [{ name: '', value: '' }]);
    } catch {
      setError('Could not save settings. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[type.eyebrow, { color: colors.muted }]}>
        Settings
      </Text>
      {rows.map((row, index) => (
        <View key={index} style={styles.settingRow}>
          <TextInput
            value={row.name}
            onChangeText={(name) => changeRow(index, { name })}
            placeholder="Seat height"
            placeholderTextColor={colors.muted}
            accessibilityLabel={`Setting ${index + 1} name`}
            maxLength={40}
            style={[...field, { flex: 2 }]}
          />
          <TextInput
            value={row.value}
            onChangeText={(value) => changeRow(index, { value })}
            placeholder="5"
            placeholderTextColor={colors.muted}
            accessibilityLabel={`Setting ${index + 1} value`}
            keyboardType="decimal-pad"
            maxLength={12}
            style={[...field, { flex: 1 }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove setting ${index + 1}`}
            hitSlop={8}
            onPress={() =>
              setRows((current) =>
                current.length > 1
                  ? current.filter((_, i) => i !== index)
                  : [{ name: '', value: '' }],
              )
            }
          >
            <Icon name="close" size={16} color={colors.muted} />
          </Pressable>
        </View>
      ))}
      {!!error && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {error}
        </Text>
      )}
      <View style={styles.settingActions}>
        <Button
          label="Add setting"
          icon="plus"
          variant="link"
          onPress={() => setRows((current) => [...current, { name: '', value: '' }])}
        />
        <Button
          label={saving ? 'Saving…' : 'Save settings'}
          variant="secondary"
          disabled={saving}
          onPress={() => void save()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderWidth: 2 },
  thumb: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: 52, height: 52 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { paddingHorizontal: 12, paddingVertical: 8, minHeight: 42 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
