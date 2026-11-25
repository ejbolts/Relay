import * as Haptics from 'expo-haptics';

// The app's haptic vocabulary, so every control feels the same. Each call is fire-and-forget:
// devices without a haptic engine (and tests) simply do nothing.

const quietly = (run: () => Promise<void>) => {
  try {
    void run().catch(() => undefined);
  } catch {
    // No haptics on this device.
  }
};

export const haptics = {
  /** A value changed: a switch, segment, picker or slider step. */
  selection: () => quietly(() => Haptics.selectionAsync()),
  /** A button press. */
  tap: () => quietly(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** A heavier press, such as a long press that opens a menu. */
  press: () => quietly(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  /** Something finished: a workout saved, a set logged. */
  success: () => quietly(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** Something needs attention before it happens, such as a destructive confirmation. */
  warning: () => quietly(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** Something failed. */
  error: () => quietly(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
