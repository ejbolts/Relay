import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { machineUsedShort } from '../../../../frontend/src/machineHistory';
import {
  captionAfterCoverChange,
  machinePhotoCount,
  mergedPhotoCount,
} from '../../../../frontend/src/machinePhotoMerge';
import type { MachinePhotoUsage } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { useAuthorisedImage } from '../../data/authorisedImage';
import { Button, errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { mergeMachinePhotos } from './machineMedia';

/**
 * Merges duplicate machines into one, as the web's merge picker does: select two or more (the
 * first tapped is the default cover), then choose the cover, whose settings are kept, and name it.
 */
export function MachineMerge({
  exerciseId,
  photos,
  onMerged,
  onCancel,
}: {
  exerciseId: string;
  photos: MachinePhotoUsage[];
  onMerged: (photo: MachinePhotoUsage, sourceIds: string[]) => void;
  onCancel: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const [selected, setSelected] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [keepId, setKeepId] = useState('');
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  const [today] = useState(localDate);
  const chosen = selected.flatMap((id) => photos.find((photo) => photo.id === id) ?? []);
  const allSelected = selected.length === photos.length;

  const toggle = (id: string) => {
    void Haptics.selectionAsync();
    setError('');
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  function review() {
    const keep = chosen[0];
    if (!keep || chosen.length < 2) return;
    setKeepId(keep.id);
    setCaption(keep.caption);
    setReviewing(true);
    setError('');
  }

  async function merge() {
    if (busy.current || !caption.trim()) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      const photo = await mergeMachinePhotos(exerciseId, selected, keepId, caption.trim());
      onMerged(photo, selected);
    } catch (reason) {
      setError(errorMessage(reason));
      busy.current = false;
      setSaving(false);
    }
  }

  const header = (
    title: string,
    back: string,
    onBack: () => void,
    action?: [string, () => void],
  ) => (
    <View style={styles.header}>
      <Button label={back} variant="link" disabled={saving} onPress={onBack} />
      <Text
        accessibilityRole="header"
        style={[type.headline, { color: colors.text, flex: 1, textAlign: 'center' }]}
      >
        {title}
      </Text>
      {action ? (
        <Button label={action[0]} variant="link" onPress={action[1]} />
      ) : (
        <View style={{ width: 60 }} />
      )}
    </View>
  );

  if (reviewing)
    return (
      <View style={{ gap: 12 }}>
        {header(`Merge ${chosen.length} machines`, 'Back', () => setReviewing(false))}
        <Text style={[type.eyebrow, { color: colors.muted }]}>Cover and settings</Text>
        <View style={styles.grid}>
          {chosen.map((photo) => (
            <MergeTile
              key={photo.id}
              photo={photo}
              role="radio"
              on={keepId === photo.id}
              badge={keepId === photo.id ? 'Cover' : undefined}
              detail={machinePhotoCount(photo) > 1 ? `${machinePhotoCount(photo)} photos` : ''}
              onPress={() => {
                setCaption(
                  captionAfterCoverChange(
                    caption,
                    chosen.find((item) => item.id === keepId),
                    photo,
                  ),
                );
                setKeepId(photo.id);
              }}
            />
          ))}
        </View>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Machine name"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Machine name"
          maxLength={160}
          editable={!saving}
          style={[
            type.body,
            styles.field,
            { backgroundColor: colors.surface2, borderRadius: radius.md, color: colors.text },
          ]}
        />
        {!!error && (
          <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
            {error}
          </Text>
        )}
        <Button
          label={saving ? 'Merging…' : `Merge into 1 machine · ${mergedPhotoCount(chosen)} photos`}
          disabled={saving || !caption.trim()}
          onPress={() => void merge()}
        />
      </View>
    );

  return (
    <View style={{ gap: 12 }}>
      {header(
        selected.length ? `${selected.length} selected` : 'Select duplicates',
        'Cancel',
        onCancel,
        [
          allSelected ? 'Deselect all' : 'Select all',
          () => setSelected(allSelected ? [] : photos.map((photo) => photo.id)),
        ],
      )}
      <View style={styles.grid}>
        {photos.map((photo) => (
          <MergeTile
            key={photo.id}
            photo={photo}
            role="checkbox"
            on={selected.includes(photo.id)}
            detail={`${machinePhotoCount(photo) > 1 ? `${machinePhotoCount(photo)} photos · ` : ''}${machineUsedShort(photo.last_used_date, today)}`}
            onPress={() => toggle(photo.id)}
          />
        ))}
      </View>
      <Button
        label={selected.length < 2 ? 'Select 2 or more to merge' : `Merge ${selected.length}`}
        disabled={selected.length < 2}
        onPress={review}
      />
    </View>
  );
}

function MergeTile({
  photo,
  role,
  on,
  badge,
  detail,
  onPress,
}: {
  photo: MachinePhotoUsage;
  role: 'checkbox' | 'radio';
  on: boolean;
  badge?: string;
  detail: string;
  onPress: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const image = useAuthorisedImage(photo.thumbnail_url);
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={photo.caption || 'Machine'}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
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
        {on && (
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            {badge ? (
              <Text style={[type.caption, { color: colors.onAccent, fontWeight: '700' }]}>
                {badge}
              </Text>
            ) : (
              <Icon name="check" size={10} color={colors.onAccent} />
            )}
          </View>
        )}
      </View>
      <Text style={[type.footnote, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
        {photo.caption || 'Machine'}
      </Text>
      {!!detail && (
        <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
          {detail}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31%', padding: 6, gap: 2, borderWidth: 2 },
  thumb: {
    width: '100%',
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: 72 },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { paddingHorizontal: 12, paddingVertical: 10, minHeight: 44 },
});
