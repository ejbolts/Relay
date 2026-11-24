import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { newId } from '../../data/deviceStorage';
import { showMenu, type MenuOption } from '../../ui/prompts';

/** Where a cardio screenshot import comes from: the photo library, camera, or clipboard. */
export type CardioImportSource = 'library' | 'camera' | 'clipboard';

export const CLIPBOARD_EMPTY_MESSAGE =
  'No image on the clipboard. Copy a screenshot first, or allow Paste and try again.';
export const CLIPBOARD_READ_ERROR =
  'Could not read the clipboard. Try again, or choose a screenshot.';

export interface StagedClipboardImage {
  uri: string;
  fileName: string;
  mimeType: string;
  cleanup: () => void;
}

const DATA_URL_PREFIX = /^data:([^;]+);base64,(.+)$/s;
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/** Checks whether the clipboard holds an image, without prompting for paste permission on iOS. */
export async function hasClipboardImage(): Promise<boolean> {
  try {
    return Boolean(await Clipboard.hasImageAsync());
  } catch {
    return false;
  }
}

/**
 * Opens the native screenshot import menu: Choose screenshot, Take photo, and Paste screenshot
 * when the clipboard holds an image.
 */
export async function openCardioImportMenu(
  onSelect: (source: CardioImportSource) => void,
  isOpen?: () => boolean,
): Promise<void> {
  const hasImage = await hasClipboardImage();
  if (isOpen && !isOpen()) return;
  const options: MenuOption[] = [
    { label: 'Choose screenshot', onPress: () => onSelect('library') },
    { label: 'Take photo', onPress: () => onSelect('camera') },
  ];
  if (hasImage) {
    options.push({ label: 'Paste screenshot', onPress: () => onSelect('clipboard') });
  }
  showMenu('Import screenshot', options);
}

/**
 * Reads an image from the clipboard and writes it to a temporary cache file so React Native's
 * multipart upload can stream it on both Android and iOS. Call `cleanup()` after scanning.
 */
export async function readClipboardScreenshot(): Promise<StagedClipboardImage | null> {
  const image = await Clipboard.getImageAsync({ format: 'png' });
  const raw = image?.data?.trim();
  if (!raw) return null;
  const match = DATA_URL_PREFIX.exec(raw);
  const mimeType = (match?.[1] ?? 'image/png').toLowerCase();
  const base64 = (match?.[2] ?? raw).trim();
  if (!base64) return null;
  const extension = EXTENSIONS[mimeType] ?? 'png';
  const file = new File(Paths.cache, `relay-cardio-paste-${newId()}.${extension}`);
  file.create({ overwrite: true });
  await file.write(base64, { encoding: 'base64' });
  return {
    uri: file.uri,
    fileName: `screenshot.${extension}`,
    mimeType,
    cleanup: () => {
      try {
        file.delete();
      } catch {
        // Temporary cache files are cleaned up by the system if deletion fails.
      }
    },
  };
}
