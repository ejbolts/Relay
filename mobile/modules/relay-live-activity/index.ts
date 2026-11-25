import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** The Swift module in ios/RelayLiveActivityModule.swift. */
export interface RelayLiveActivityNative {
  /** Whether Live Activities are on for Relay (Settings › Relay › Live Activities). */
  isSupported(): boolean;
  /** Starts the rest's activity, or updates the one showing for this workout. */
  show(
    sessionId: string,
    exercise: string,
    nextSet: string | null,
    /** Milliseconds since 1970. */
    endsAt: number,
    totalSeconds: number,
    pausedSeconds: number | null,
  ): Promise<void>;
  /** Ends every rest activity. */
  end(): Promise<void>;
}

/**
 * The native module, or null where it doesn't exist: Expo Go (which can't load local native
 * code), Android, and any build made without it.
 */
export function relayLiveActivity(): RelayLiveActivityNative | null {
  if (Platform.OS !== 'ios') return null;
  try {
    return requireOptionalNativeModule<RelayLiveActivityNative>('RelayLiveActivity');
  } catch {
    return null;
  }
}
