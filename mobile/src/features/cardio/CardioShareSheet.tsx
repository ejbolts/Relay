import { useEffect, useState } from 'react';
import type { CardioSession } from '../../../../frontend/src/types';
import { cardioWorkoutForSharing } from '../../../../frontend/src/workoutCardDrawing';
import { isToastAccountCurrent, onToastAccountChange, toastAccount } from '../../ui/Toast';
import { ShareWorkoutSheet } from '../social/ShareWorkoutSheet';

interface ActiveCardioShare {
  session: CardioSession;
  account: string;
}

type ShareHost = (next: ActiveCardioShare | null) => void;
const hosts: ShareHost[] = [];

/**
 * Opens the cardio share card from a root-level host (such as from the save toast after
 * leaving the log screen). Drops requests whose account is no longer current.
 */
export function openCardioShareSheet(session: CardioSession, account = toastAccount()) {
  if (!isToastAccountCurrent(account)) return;
  hosts.at(-1)?.({ session, account });
}

/**
 * Hosts a cardio share card opened from the save toast so it still opens after navigating away
 * from the cardio log screen, and closes immediately if the session changes.
 */
export function CardioShareHost() {
  const [active, setActive] = useState<ActiveCardioShare | null>(null);

  useEffect(() => {
    const host: ShareHost = setActive;
    hosts.push(host);
    return () => {
      const index = hosts.indexOf(host);
      if (index !== -1) hosts.splice(index, 1);
    };
  }, []);

  useEffect(
    () =>
      onToastAccountChange((account) => {
        setActive((current) => (current && current.account !== account ? null : current));
      }),
    [],
  );

  if (!active || !isToastAccountCurrent(active.account)) return null;
  return <CardioShareSheet session={active.session} onClose={() => setActive(null)} />;
}

/**
 * A cardio session's share card, as the web's Share card in Cardio history: the workout card drawn
 * for the session, without Export CSV.
 */
export function CardioShareSheet({
  session,
  onClose,
}: {
  session: CardioSession;
  onClose: () => void;
}) {
  const [workout] = useState(() => cardioWorkoutForSharing(session));
  return <ShareWorkoutSheet workout={workout} records={0} csv={false} onClose={onClose} />;
}
