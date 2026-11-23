import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { cardioSetUpdateFromScan } from '../../../../frontend/src/cardioScreenshot';
import type { WorkoutSetInput } from '../../../../frontend/src/types';
import { errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { showMenu } from '../../ui/prompts';
import { useTheme } from '../../ui/theme';
import { scanCardioPhoto } from '../cardio/cardioData';

/**
 * Fills a cardio set from a screenshot of a watch or machine summary, as the web's set
 * screenshot upload does: the scanned set is the finished set, so it is logged. A scan warning
 * stays showing under the set.
 */
export function CardioSetImport({
  number,
  done,
  onScanned,
}: {
  number: number;
  /** A logged set offers no import, but keeps showing what its scan warned about. */
  done: boolean;
  onScanned: (update: Partial<WorkoutSetInput>) => void;
}) {
  const { colors, type } = useTheme();
  const busy = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function importFrom(source: 'camera' | 'library') {
    if (busy.current) return;
    busy.current = true;
    setMessage(null);
    try {
      if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        setMessage('Allow camera access in your phone’s settings to take a photo.');
        return;
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;
      setScanning(true);
      const scan = await scanCardioPhoto(result.assets[0]);
      onScanned(cardioSetUpdateFromScan(scan));
      if (scan.warning) setMessage(scan.warning);
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      busy.current = false;
      setScanning(false);
    }
  }

  return (
    <View style={styles.wrap}>
      {!done && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Import screenshot for set ${number}`}
          accessibilityState={{ busy: scanning, disabled: scanning }}
          disabled={scanning}
          hitSlop={6}
          onPress={() =>
            showMenu('Import screenshot', [
              { label: 'Choose screenshot', onPress: () => void importFrom('library') },
              { label: 'Take photo', onPress: () => void importFrom('camera') },
            ])
          }
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
        >
          {scanning ? (
            <ActivityIndicator size="small" color={colors.accentText} />
          ) : (
            <Icon
              name={{ sf: 'photo.badge.plus', md: 'add-photo-alternate' }}
              size={14}
              color={colors.accentText}
            />
          )}
          <Text style={[type.footnote, { color: colors.accentText, fontWeight: '600' }]}>
            {scanning ? 'Scanning…' : 'Import screenshot'}
          </Text>
        </Pressable>
      )}
      {!!message && (
        <Text accessibilityRole="alert" style={[type.footnote, { color: colors.danger }]}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
});
