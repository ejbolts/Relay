import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import type {
  MachinePhoto,
  MachinePhotoUsage,
  MachineSetting,
} from '../../../../frontend/src/types';
import { apiSend } from '../../data/api';
import { uploadFile } from '../../data/uploadFile';
import { promptText, showMenu } from '../../ui/prompts';

export interface MachinePhotoFile {
  uri: string;
  name: string;
  type: string;
}

/** Saves a photo of a machine for an exercise, with its name and settings, as the web does. */
export function uploadMachinePhoto(
  exerciseId: string,
  file: MachinePhotoFile,
  caption: string,
  settings: MachineSetting[],
): Promise<MachinePhoto> {
  return uploadFile<MachinePhoto>(
    `/api/exercises/${encodeURIComponent(exerciseId)}/machine-photos`,
    'POST',
    file,
    {
      fields: { caption, machine_settings: JSON.stringify({ settings }) },
      failure: 'Relay could not save this photo.',
    },
  );
}

/** Renames a saved machine. */
export function renameMachinePhoto(photoId: string, caption: string) {
  return apiSend<MachinePhoto>(`/api/machine-photos/${encodeURIComponent(photoId)}`, 'PATCH', {
    caption,
  });
}

/** Deletes a saved machine and its photos, taking it off saved workouts too, as the web does. */
export function deleteMachinePhoto(photoId: string) {
  return apiSend<void>(
    `/api/machine-photos/${encodeURIComponent(photoId)}?detach_from_workouts=true`,
    'DELETE',
  );
}

/** Merges duplicate machines into one, keeping `keepPhotoId`'s cover and settings. */
export function mergeMachinePhotos(
  exerciseId: string,
  photoIds: string[],
  keepPhotoId: string,
  caption: string,
) {
  return apiSend<MachinePhotoUsage>(
    `/api/exercises/${encodeURIComponent(exerciseId)}/machine-photos/merge`,
    'POST',
    { photo_ids: photoIds, keep_photo_id: keepPhotoId, caption },
  );
}

async function pickPhoto(source: 'camera' | 'library'): Promise<MachinePhotoFile | null> {
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
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets[0];
  return asset
    ? {
        uri: asset.uri,
        name: asset.fileName ?? 'machine.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      }
    : null;
}

/**
 * A new machine: Take photo or Choose photo, then its name, as the web's machine photo form asks
 * for them. Calls `onPicked` with the photo and its name; cancelling at any point does nothing.
 */
export function askForMachinePhoto(onPicked: (file: MachinePhotoFile, caption: string) => void) {
  const pick = (source: 'camera' | 'library') =>
    void pickPhoto(source).then((file) => {
      if (!file) return;
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
          onPicked(file, caption.trim());
        },
      });
    });
  showMenu('Add machine photo', [
    { label: 'Take photo', onPress: () => pick('camera') },
    { label: 'Choose photo', onPress: () => pick('library') },
  ]);
}
