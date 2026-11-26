import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PHOTO_UNAVAILABLE } from '../../../../frontend/src/workoutPhotoRules';
import { loadAuthorisedImage } from '../../data/authorisedImage';
import { Icon } from '../../ui/Icon';

export interface ViewerPhoto {
  id: string;
  url: string;
  /** Spoken description, such as "Photo 2 of Alex’s Push day". */
  label: string;
}

/**
 * Photos full screen on black, as the web's viewer: swipe between them, and on your own workout,
 * remove the one showing. Close returns to the screen behind.
 */
export function PhotoViewer({
  photos,
  initialIndex = 0,
  title,
  onClose,
  onRemove,
}: {
  photos: ViewerPhoto[];
  initialIndex?: number;
  title: (index: number) => string;
  onClose: () => void;
  /** Given for your own photos: removes the one showing. */
  onRemove?: (photo: ViewerPhoto) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);
  const current = photos[Math.min(index, photos.length - 1)];
  const bar = 52;
  const area = height - insets.top - insets.bottom - bar;
  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="overFullScreen"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.page, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={[styles.bar, { height: bar }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [styles.round, pressed && { opacity: 0.6 }]}
          >
            <Icon name="close" size={16} color="#fff" />
          </Pressable>
          <Text accessibilityRole="header" style={styles.title} numberOfLines={1}>
            {title(index)}
          </Text>
          {onRemove && current ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
              hitSlop={8}
              onPress={() => onRemove(current)}
              style={({ pressed }) => [styles.round, pressed && { opacity: 0.6 }]}
            >
              <Icon name="trash" size={17} color="#fff" />
            </Pressable>
          ) : (
            <View style={styles.spacer} />
          )}
        </View>
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * width, y: 0 }}
          onMomentumScrollEnd={(event) =>
            setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
          }
        >
          {photos.map((photo) => (
            <ViewerImage key={photo.id} photo={photo} width={width} height={area} />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** One photo, fitted to the screen; it says so when it can't be loaded. */
function ViewerImage({
  photo,
  width,
  height,
}: {
  photo: ViewerPhoto;
  width: number;
  height: number;
}) {
  const [loaded, setLoaded] = useState<{ url: string; uri: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadAuthorisedImage(photo.url).then((uri) => {
      if (!cancelled) setLoaded({ url: photo.url, uri });
    });
    return () => {
      cancelled = true;
    };
  }, [photo.url]);
  const result = loaded?.url === photo.url ? loaded : null;
  return (
    <View style={[styles.slide, { width, height }]}>
      {!result ? (
        <ActivityIndicator color="#fff" accessibilityLabel="Loading photo" />
      ) : result.uri ? (
        <Image
          source={{ uri: result.uri }}
          resizeMode="contain"
          style={{ width, height }}
          accessibilityLabel={photo.label}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text accessibilityRole="alert" style={styles.problem}>
          {PHOTO_UNAVAILABLE}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#000' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 12,
  },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  spacer: { width: 36, height: 36 },
  title: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  slide: { alignItems: 'center', justifyContent: 'center' },
  problem: { color: '#fff', fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
});
