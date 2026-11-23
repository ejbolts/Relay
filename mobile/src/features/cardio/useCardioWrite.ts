import { useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { refreshTraining } from '../../data/queries';
import { errorMessage } from '../../ui/components';
import { showToast } from '../../ui/Toast';

export function useCardioWrite() {
  const client = useQueryClient();
  const router = useRouter();
  const navigation = useNavigation();
  const locked = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function write<T>(
    save: () => Promise<T>,
    message: string | ((saved: T) => Promise<string>),
  ) {
    if (locked.current) return;
    locked.current = true;
    setSaveError(null);
    setSaving(true);
    try {
      const saved = await save();
      void refreshTraining(client);
      if (navigation.isFocused()) router.back();
      showToast(typeof message === 'string' ? message : await message(saved));
    } catch (reason) {
      setSaveError(errorMessage(reason));
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }

  return { write, saving, saveError };
}
