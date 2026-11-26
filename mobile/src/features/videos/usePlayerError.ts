import { useEffect } from 'react';
import type { VideoPlayer } from 'expo-video';

/** Calls `onError` if the player has already failed, or fails later while mounted. */
export function usePlayerError(player: VideoPlayer, onError: () => void) {
  useEffect(() => {
    // An error raised before this effect subscribed would otherwise never arrive.
    if (player.status === 'error') onError();
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') onError();
    });
    return () => subscription.remove();
  }, [player, onError]);
}
