import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { nextOnboardingPrompt } from '../../../../frontend/src/appGuideProgress';
import { IMPORT_PROMPT_TEXT } from '../../../../frontend/src/workoutImport';
import { readJson, writeJson } from '../../data/deviceStorage';
import { useSession } from '../../session/SessionProvider';
import { appTourWaiting, useAppTour } from '../guides/tourProgress';

// The web asks a new account, after its tour, whether to bring its history in. The app does the
// same: once, after the quick tour of an account created on this phone (nextOnboardingPrompt).

const keyFor = (userId: string) => `relay-import-prompt:${encodeURIComponent(userId)}`;

/** Marks a just-created account to be asked once it signs in. */
export function queueImportPrompt(userId: string) {
  if (readJson(keyFor(userId)) === null) writeJson(keyFor(userId), 'waiting');
}

/** Asks a new account whether to import its workout history; Import opens the import screen. */
export function useImportPrompt() {
  const { status } = useSession();
  const router = useRouter();
  const userId = status.kind === 'signed-in' ? status.user.id : null;
  const tour = useAppTour(userId ?? '');
  useEffect(() => {
    if (!userId) return;
    const prompt = nextOnboardingPrompt({
      tour: !!tour || appTourWaiting(userId),
      importStep: readJson(keyFor(userId)) === 'waiting',
      release: false,
      releaseHeld: false,
    });
    if (prompt !== `import`) return;
    writeJson(keyFor(userId), 'done');
    Alert.alert(
      'Already tracking your workouts?',
      `${IMPORT_PROMPT_TEXT}\n\nYou can do this later in Settings → Data.`,
      [
        { text: 'Skip for now', style: 'cancel' },
        { text: 'Import', onPress: () => router.push('/data/import') },
      ],
    );
  }, [userId, tour, router]);
}
