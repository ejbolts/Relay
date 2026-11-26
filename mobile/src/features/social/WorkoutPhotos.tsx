import { useQueryClient } from '@tanstack/react-query';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  JPEG_QUALITY,
  jpegFileName,
  needsOptimising,
  scaledSize,
} from '../../../../frontend/src/photoOptimiseRules';
import type { WorkoutPhoto } from '../../../../frontend/src/types';
import {
  canAddWorkoutPhoto,
  workoutPhotoLabel,
  workoutPhotoTitle,
} from '../../../../frontend/src/workoutPhotoRules';
import { errorMessage } from '../../ui/components';
import { showMenu } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';
import { showToast } from '../../ui/Toast';
import { AuthImage } from './Avatar';
import { PhotoViewer } from './PhotoViewer';
import { socialApi } from './socialApi';
import { showWorkoutPhotos } from './socialQueries';

/**
 * A workout's photos, swiped through one at a time. Each opens full screen, where its owner can
 * remove it.
 */
export function WorkoutPhotos({
  photos,
  subject,
  inset,
  full = false,
  onRemove,
}: {
  photos: WorkoutPhoto[];
  subject: string;
  /** The horizontal space around the strip, so a photo spans the card. */
  inset: number;
  full?: boolean;
  /** Given for your own workout: removes the photo being viewed. */
  onRemove?: (photo: WorkoutPhoto) => Promise<void>;
}) {
  const { colors, radius, type } = useTheme();
  const { width: screen } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [viewing, setViewing] = useState<number | null>(null);
  if (!photos.length) return null;
  const width = screen - inset;
  const first = photos[0];
  const height = Math.min(width * 1.25, Math.round((width * first.height) / first.width) || width);
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) =>
          setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
        }
        style={{ width, borderRadius: radius.lg }}
      >
        {photos.map((photo, position) => (
          <Pressable
            key={photo.id}
            accessibilityRole="imagebutton"
            accessibilityLabel={workoutPhotoLabel(position, photos.length, subject)}
            onPress={() => setViewing(position)}
          >
            <AuthImage
              url={full ? photo.full_url : photo.thumbnail_url}
              style={{ width, height }}
            />
          </Pressable>
        ))}
      </ScrollView>
      {photos.length > 1 && (
        <View pointerEvents="none" style={[styles.count, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
          <Text style={[type.caption, type.number, { color: '#fff', fontWeight: '600' }]}>
            {index + 1}/{photos.length}
          </Text>
        </View>
      )}
      <View
        pointerEvents="none"
        style={[styles.edge, { borderColor: colors.line, borderRadius: radius.lg }]}
      />
      {viewing !== null && (
        <PhotoViewer
          photos={photos.map((photo, position) => ({
            id: photo.id,
            url: photo.full_url,
            label: `Photo ${position + 1} of ${subject}`,
          }))}
          initialIndex={Math.min(viewing, photos.length - 1)}
          title={(position) => workoutPhotoTitle(position, photos.length)}
          onClose={() => setViewing(null)}
          onRemove={
            onRemove &&
            ((shown) => {
              const photo = photos.find((item) => item.id === shown.id);
              if (!photo) return;
              Alert.alert('Remove photo?', undefined, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Remove',
                  style: 'destructive',
                  onPress: () =>
                    void onRemove(photo).then(
                      () => setViewing(null),
                      (reason) => Alert.alert('Photo not removed', errorMessage(reason)),
                    ),
                },
              ]);
            })
          }
        />
      )}
    </View>
  );
}

type PickedPhoto = { uri: string; name: string; type: string };

/**
 * The photo to upload: shrunk to the size the server keeps and saved as JPEG when that helps, as
 * the web does before uploading. Formats other than JPEG, PNG and WebP (such as HEIC) are always
 * converted.
 */
async function optimise(asset: ImagePicker.ImagePickerAsset): Promise<PickedPhoto> {
  const name = asset.fileName ?? 'workout-photo.jpg';
  const type = asset.mimeType ?? 'image/jpeg';
  const common = /^image\/(jpe?g|png|webp)$/.test(type);
  if (common && !needsOptimising(asset.fileSize ?? Infinity, asset.width, asset.height))
    return { uri: asset.uri, name, type };
  const context = ImageManipulator.manipulate(asset.uri);
  context.resize(scaledSize(asset.width, asset.height));
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
  return { uri: saved.uri, name: jpegFileName(name), type: 'image/jpeg' };
}

/** Adding and removing photos on your own saved workout, shown everywhere it appears. */
export function useWorkoutPhotoEditor(workoutId: string, photos: WorkoutPhoto[]) {
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(source: 'library' | 'camera') {
    setError(null);
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError(
          source === 'camera'
            ? 'Allow camera access in your phone’s settings to take a photo.'
            : 'Allow photo access in your phone’s settings to add a photo.',
        );
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      setAdding(true);
      const saved = await socialApi.addWorkoutPhoto(workoutId, await optimise(asset));
      showWorkoutPhotos(client, workoutId, [...photos, saved]);
      showToast('Photo added');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setAdding(false);
    }
  }

  return {
    adding,
    error,
    canAdd: canAddWorkoutPhoto(photos),
    add: () =>
      showMenu(undefined, [
        { label: 'Choose photo', onPress: () => void pick('library') },
        { label: 'Take photo', onPress: () => void pick('camera') },
      ]),
    remove: async (photo: WorkoutPhoto) => {
      await socialApi.removeWorkoutPhoto(photo.id);
      showWorkoutPhotos(
        client,
        workoutId,
        photos.filter((item) => item.id !== photo.id),
      );
      showToast('Photo removed');
    },
  };
}

const styles = StyleSheet.create({
  count: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  edge: { ...StyleSheet.absoluteFill, borderWidth: StyleSheet.hairlineWidth },
});
