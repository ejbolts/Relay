import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { cardioSetUpdateFromScan } from '../../../../frontend/src/cardioScreenshot';
import type { WorkoutSetInput } from '../../../../frontend/src/types';
import { errorMessage } from '../../ui/components';
import { Icon } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { scanCardioPhoto } from '../cardio/cardioData';
import {
  CLIPBOARD_EMPTY_MESSAGE,
  CLIPBOARD_READ_ERROR,
  openCardioImportMenu,
  readClipboardScreenshot,
  type CardioImportSource,
} from '../cardio/cardioScreenshotImport';

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
  const opening = useRef(false);
  const mounted = useRef(true);
  const [phase, setPhase] = useState<'paste' | 'scan' | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function importFrom(source: CardioImportSource) {
    if (busy.current) return;
    busy.current = true;
    setMessage(null);
    let cleanup: (() => void) | undefined;
    try {
      let file: { uri: string; fileName?: string | null; mimeType?: string | null };
      if (source === 'clipboard') {
        setPhase('paste');
        let pasted: Awaited<ReturnType<typeof readClipboardScreenshot>>;
        try {
          pasted = await readClipboardScreenshot();
        } catch {
          if (mounted.current) setMessage(CLIPBOARD_READ_ERROR);
          return;
        }
        if (!pasted) {
          if (mounted.current) setMessage(CLIPBOARD_EMPTY_MESSAGE);
          return;
        }
        file = pasted;
        cleanup = pasted.cleanup;
      } else {
        if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
          if (mounted.current)
            setMessage('Allow camera access in your phone’s settings to take a photo.');
          return;
        }
        const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync(options)
            : await ImagePicker.launchImageLibraryAsync(options);
        if (result.canceled || !result.assets[0]) return;
        file = result.assets[0];
      }
      if (!mounted.current) return;
      setPhase('scan');
      const scan = await scanCardioPhoto(file);
      if (!mounted.current) return;
      onScanned(cardioSetUpdateFromScan(scan));
      if (scan.warning) setMessage(scan.warning);
    } catch (reason) {
      if (mounted.current) setMessage(errorMessage(reason));
    } finally {
      cleanup?.();
      busy.current = false;
      if (mounted.current) setPhase(null);
    }
  }

  async function openMenu() {
    if (busy.current || opening.current) return;
    opening.current = true;
    try {
      await openCardioImportMenu(
        (source) => void importFrom(source),
        () => mounted.current,
      );
    } finally {
      opening.current = false;
    }
  }

  const active = phase !== null;

  return (
    <View style={styles.wrap}>
      {!done && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Import screenshot for set ${number}`}
          accessibilityState={{ busy: active, disabled: active }}
          disabled={active}
          hitSlop={6}
          onPress={() => void openMenu()}
          style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
        >
          {active ? (
            <ActivityIndicator size="small" color={colors.accentText} />
          ) : (
            <Icon
              name={{ sf: 'photo.badge.plus', md: 'add-photo-alternate' }}
              size={14}
              color={colors.accentText}
            />
          )}
          <Text style={[type.footnote, { color: colors.accentText, fontWeight: '600' }]}>
            {phase === 'paste'
              ? 'Reading clipboard…'
              : phase === 'scan'
                ? 'Scanning…'
                : 'Import screenshot'}
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
