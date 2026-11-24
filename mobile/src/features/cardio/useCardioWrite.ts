import { useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { refreshTraining } from '../../data/queries';
import { errorMessage } from '../../ui/components';
import { isToastAccountCurrent, showToast, toastAccount, type ToastAction } from '../../ui/Toast';

export type CardioWriteToast = string | { message: string; action?: ToastAction };

export function useCardioWrite() {
  const client = useQueryClient();
  const router = useRouter();
  const navigation = useNavigation();
  const locked = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function write<T>(
    save: () => Promise<T>,
    message: string | ((saved: T, account: string) => Promise<CardioWriteToast>),
  ) {
    if (locked.current) return;
    locked.current = true;
    const account = toastAccount();
    setSaveError(null);
    setSaving(true);
    try {
      const saved = await save();
      if (!isToastAccountCurrent(account)) return;
      void refreshTraining(client);
      if (navigation.isFocused()) router.back();
      const resolved = typeof message === 'string' ? message : await message(saved, account);
      if (!isToastAccountCurrent(account)) return;
      if (typeof resolved === 'string') showToast(resolved, undefined, { account });
      else showToast(resolved.message, resolved.action, { account });
    } catch (reason) {
      if (isToastAccountCurrent(account)) setSaveError(errorMessage(reason));
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }

  return { write, saving, saveError };
}
