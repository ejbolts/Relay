import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { machineUsedShort } from '../../../../frontend/src/machineHistory';
import type { Exercise, MachinePhotoUsage } from '../../../../frontend/src/types';
import { localDate } from '../../../../frontend/src/utils';
import { useAuthorisedImage } from '../../data/authorisedImage';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { askForMachinePhoto, uploadMachinePhoto } from './machineMedia';

/**
 * A swipeable row of an exercise's saved machines inside the exercise picker, as the web's
 * machine strip: tap one to do the exercise on it (tap again for the baseline exercise), or
 * photograph a new one.
 */
export function PickerMachineStrip({
  exercise,
  machines,
  chosenId,
  lastUsedId,
  onToggle,
  onAdded,
}: {
  exercise: Exercise;
  machines: MachinePhotoUsage[];
  /** The machine chosen for this exercise; null for the baseline exercise. */
  chosenId: string | null;
  lastUsedId: string | null;
  onToggle: (machineId: string) => void;
  onAdded: (photo: MachinePhotoUsage) => void;
}) {
  const { colors, type, radius } = useTheme();
  const [today] = useState(localDate);
  const [saving, setSaving] = useState(false);

  const add = () =>
    askForMachinePhoto((file, caption) => {
      setSaving(true);
      void uploadMachinePhoto(exercise.id, file, caption, [])
        .then((photo) =>
          onAdded({
            ...photo,
            exercise_name: exercise.name,
            workout_count: 0,
            last_used_date: null,
          }),
        )
        .catch((reason) =>
          Alert.alert(
            'Photo not saved',
            reason instanceof Error ? reason.message : 'Could not save the photo.',
          ),
        )
        .finally(() => setSaving(false));
    });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={`Machines for ${exercise.name}`}
      contentContainerStyle={styles.rail}
      keyboardShouldPersistTaps="handled"
    >
      {machines.map((machine) => (
        <MachineCard
          key={machine.id}
          machine={machine}
          chosen={chosenId === machine.id}
          detail={
            machine.id === lastUsedId
              ? 'Last used'
              : machineUsedShort(machine.last_used_date, today)
          }
          onPress={() => {
            void Haptics.selectionAsync();
            onToggle(machine.id);
          }}
        />
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add machine for ${exercise.name}`}
        disabled={saving}
        onPress={add}
        style={({ pressed }) => [
          styles.card,
          styles.addCard,
          { borderColor: colors.line, borderRadius: radius.md },
          pressed && { opacity: 0.7 },
        ]}
      >
        {saving ? (
          <ActivityIndicator color={colors.accentText} />
        ) : (
          <Icon name={{ sf: 'camera', md: 'photo-camera' }} size={18} color={colors.accentText} />
        )}
        <Text style={[type.caption, { color: colors.accentText, fontWeight: '600' }]}>
          {saving ? 'Saving…' : 'Add machine'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function MachineCard({
  machine,
  chosen,
  detail,
  onPress,
}: {
  machine: MachinePhotoUsage;
  chosen: boolean;
  detail: string;
  onPress: () => void;
}) {
  const { colors, type, radius } = useTheme();
  const image = useAuthorisedImage(machine.thumbnail_url);
  const name = machine.caption || 'Machine';
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={name}
      accessibilityState={{ checked: chosen }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.surface2,
          borderColor: chosen ? colors.accent : 'transparent',
          borderRadius: radius.md,
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
        {chosen && (
          <View style={[styles.tick, { backgroundColor: colors.accent }]}>
            <Icon name="check" size={10} color={colors.onAccent} />
          </View>
        )}
      </View>
      <Text style={[type.caption, { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>
        {detail}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: { gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  card: { width: 104, padding: 6, gap: 2, borderWidth: 2 },
  addCard: {
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  thumb: {
    width: '100%',
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: { width: '100%', height: 64 },
  tick: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
