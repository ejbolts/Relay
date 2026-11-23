import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { WorkoutPhoto } from '../../../../frontend/src/types';
import { useTheme } from '../../ui/theme';
import { AuthImage } from './Avatar';

/** A workout's photos, swiped through one at a time. */
export function WorkoutPhotos({
  photos,
  subject,
  inset,
  full = false,
}: {
  photos: WorkoutPhoto[];
  subject: string;
  /** The horizontal space around the strip, so a photo spans the card. */
  inset: number;
  full?: boolean;
}) {
  const { colors, radius, type } = useTheme();
  const { width: screen } = useWindowDimensions();
  const [index, setIndex] = useState(0);
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
          <AuthImage
            key={photo.id}
            url={full ? photo.full_url : photo.thumbnail_url}
            accessibilityLabel={`${subject}, photo ${position + 1} of ${photos.length}`}
            style={{ width, height }}
          />
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
    </View>
  );
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
