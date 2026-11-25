import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { MachinePhoto } from '../../../../frontend/src/types';
import { loadAuthorisedImage, useAuthorisedImage } from '../../data/authorisedImage';
import { Button } from '../../ui/components';
import { haptics } from '../../ui/haptics';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';
import { useTheme } from '../../ui/theme';
import { PhotoViewer } from '../social/PhotoViewer';
import { trainingIcons } from './icons';

/** The machine Training's sessions are filtered by, with its exercise for display. */
export type MachineFilter = { photo: MachinePhoto; exerciseName: string };

/**
 * Every workout on one machine, as the web's "Filtered by machine" view. The caption and
 * exercise travel along so the screen has a title before the machine list loads.
 */
export const machineWorkoutsRoute = ({ photo, exerciseName }: MachineFilter) =>
  ({
    pathname: '/training/machine/[id]',
    params: { id: photo.id, caption: photo.caption, exercise: exerciseName },
  }) as const;

const TILE_WIDTH = 92;

/**
 * A logged exercise's machine photos, as the web's session card shows them: a captioned
 * thumbnail for each pinned machine. Tapping one opens it, with its merged photos and, on your
 * own history, the way to every workout on that machine.
 */
export function MachinePhotoStrip({
  photos,
  exerciseName,
  onFilterMachine,
  machineFilterId = null,
}: {
  photos: MachinePhoto[];
  exerciseName: string;
  /** Lists only workouts that pinned this machine. Omitted for shared, read-only history. */
  onFilterMachine?: (filter: MachineFilter) => void;
  /** The machine the list is already filtered by, which doesn't offer its own filter again. */
  machineFilterId?: string | null;
}) {
  const [viewing, setViewing] = useState<MachinePhoto | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityLabel="Machine photos"
        contentContainerStyle={styles.strip}
      >
        {photos.map((photo) => (
          <MachineTile
            key={photo.id}
            photo={photo}
            onPress={() => {
              haptics.tap();
              setViewing(photo);
            }}
          />
        ))}
      </ScrollView>
      <MachinePhotoSheet
        photo={viewing}
        exerciseName={exerciseName}
        onClose={() => setViewing(null)}
        onShowHistory={
          onFilterMachine && viewing && !isMachine(viewing, machineFilterId)
            ? () => {
                setViewing(null);
                onFilterMachine({ photo: viewing, exerciseName });
              }
            : undefined
        }
      />
    </>
  );
}

function MachineTile({ photo, onPress }: { photo: MachinePhoto; onPress: () => void }) {
  const { colors, type, radius } = useTheme();
  const image = useAuthorisedImage(photo.thumbnail_url);
  const caption = photo.caption || 'Machine';
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={`View ${caption}`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && { opacity: 0.7 }]}
    >
      <View
        style={[styles.tileImage, { backgroundColor: colors.surface3, borderRadius: radius.sm }]}
      >
        {image ? (
          <Image source={{ uri: image }} style={StyleSheet.absoluteFill} />
        ) : (
          <Icon name={{ sf: 'photo', md: 'photo' }} size={18} color={colors.muted} />
        )}
        <View style={[styles.expand, { borderRadius: radius.sm }]}>
          <Icon name={trainingIcons.expand} size={11} color="#fff" />
        </View>
      </View>
      <Text
        style={[type.caption, { color: colors.secondary, fontWeight: '600' }]}
        numberOfLines={1}
      >
        {caption}
      </Text>
    </Pressable>
  );
}

/**
 * One machine, as the web's photo detail in a session: the photo large (tap for full screen),
 * the photos merged into it, its name, and "All workouts on this machine" where offered.
 */
export function MachinePhotoSheet({
  photo,
  exerciseName,
  onClose,
  onShowHistory,
}: {
  photo: MachinePhoto | null;
  exerciseName: string;
  onClose: () => void;
  onShowHistory?: () => void;
}) {
  return (
    <Sheet
      visible={!!photo}
      onClose={onClose}
      title={photo?.caption || 'Machine'}
      kicker={exerciseName}
    >
      {/* A machine opened again starts on its first photo. */}
      {photo && <MachineDetail key={photo.id} photo={photo} onShowHistory={onShowHistory} />}
    </Sheet>
  );
}

function MachineDetail({
  photo,
  onShowHistory,
}: {
  photo: MachinePhoto;
  onShowHistory?: () => void;
}) {
  const { colors, radius, type } = useTheme();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const images = photo.images?.length ? photo.images : [photo];
  const [index, setIndex] = useState(0);
  const [fullScreen, setFullScreen] = useState(false);
  const image = images[Math.min(index, images.length - 1)];
  // One loader for the sheet and the full-screen viewer; the thumbnail stands in meanwhile.
  const [attempt, setAttempt] = useState(0);
  const full = useLoadedImage(image.full_url, attempt);
  const thumb = useAuthorisedImage(image.thumbnail_url);
  const shown = full.uri ?? thumb;
  const unavailable = full.status === 'failed' && !thumb;
  const caption = photo.caption || 'Machine';
  // As wide as the sheet allows, in the photo's own shape, no taller than half the screen.
  const width = Math.min(screenWidth - 40, 560);
  const ratio = image.width > 0 && image.height > 0 ? image.height / image.width : 0.75;
  const height = Math.min(width * ratio, screenHeight * 0.5);
  return (
    <View style={{ gap: 14 }}>
      <Pressable
        accessibilityRole="imagebutton"
        accessibilityLabel={
          images.length > 1
            ? `${caption}, photo ${index + 1} of ${images.length}. Show full screen`
            : `${caption}. Show full screen`
        }
        onPress={() => setFullScreen(true)}
        style={[
          styles.photo,
          { height, backgroundColor: colors.surface3, borderRadius: radius.md },
        ]}
      >
        {shown ? (
          <Image source={{ uri: shown }} style={StyleSheet.absoluteFill} resizeMode="contain" />
        ) : unavailable ? (
          <View style={styles.unavailable}>
            <Icon name={{ sf: 'photo', md: 'photo' }} size={22} color={colors.muted} />
            <Text style={[type.footnote, { color: colors.muted, textAlign: 'center' }]}>
              Photo not loaded
            </Text>
          </View>
        ) : (
          <ActivityIndicator accessibilityLabel="Loading photo" color={colors.muted} />
        )}
      </Pressable>
      {unavailable && (
        <Button
          label="Try again"
          variant="secondary"
          size="small"
          align="center"
          onPress={() => setAttempt(attempt + 1)}
        />
      )}
      {images.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="Merged machine photos"
          contentContainerStyle={styles.gallery}
        >
          {images.map((item, itemIndex) => (
            <GalleryThumb
              key={item.id}
              url={item.thumbnail_url}
              label={`View photo ${itemIndex + 1} of ${images.length}`}
              selected={itemIndex === index}
              onPress={() => {
                haptics.selection();
                setIndex(itemIndex);
              }}
            />
          ))}
        </ScrollView>
      )}
      {onShowHistory && (
        <Button
          label="All workouts on this machine"
          icon="filter"
          variant="secondary"
          block
          onPress={onShowHistory}
        />
      )}
      {fullScreen && (
        <PhotoViewer
          photos={images.map((item, itemIndex) => ({
            id: item.id,
            url: item.full_url,
            label: `${caption}, photo ${itemIndex + 1} of ${images.length}`,
          }))}
          initialIndex={index}
          title={() => caption}
          onClose={() => setFullScreen(false)}
        />
      )}
    </View>
  );
}

/** Whether `photo` is the machine `machineId` names, by its own id or a merged photo's. */
function isMachine(photo: MachinePhoto, machineId: string | null) {
  return (
    !!machineId &&
    (photo.id === machineId || !!photo.images?.some((image) => image.id === machineId))
  );
}

type LoadedImage = { status: 'loading' | 'ready' | 'failed'; uri: string | null };

/** An authorised image, telling a failed load from one still loading; a new attempt retries. */
function useLoadedImage(url: string, attempt: number): LoadedImage {
  const key = `${attempt}:${url}`;
  const [loaded, setLoaded] = useState<{ key: string; uri: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    // A failed load isn't remembered by the loader, so another attempt asks again.
    void loadAuthorisedImage(url).then((uri) => {
      if (!cancelled) setLoaded({ key, uri });
    });
    return () => {
      cancelled = true;
    };
  }, [key, url]);
  if (loaded?.key !== key) return { status: 'loading', uri: null };
  return loaded.uri ? { status: 'ready', uri: loaded.uri } : { status: 'failed', uri: null };
}

function GalleryThumb({
  url,
  label,
  selected,
  onPress,
}: {
  url: string;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, radius } = useTheme();
  const image = useAuthorisedImage(url);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.galleryThumb,
        {
          backgroundColor: colors.surface3,
          borderRadius: radius.sm,
          borderColor: selected ? colors.accent : 'transparent',
        },
      ]}
    >
      {image && (
        <Image source={{ uri: image }} style={[StyleSheet.absoluteFill, { borderRadius: 6 }]} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: { gap: 10, paddingVertical: 2 },
  tile: { width: TILE_WIDTH, gap: 5, minHeight: 44 },
  tileImage: {
    width: TILE_WIDTH,
    height: 69,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  expand: {
    position: 'absolute',
    right: 5,
    bottom: 5,
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  photo: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  unavailable: { alignItems: 'center', gap: 6, paddingHorizontal: 24 },
  gallery: { gap: 8 },
  galleryThumb: { width: 56, height: 56, borderWidth: 2, overflow: 'hidden' },
});
