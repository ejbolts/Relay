const REDUCE_MOTION_KEY = 'gym-logger-reduce-motion';

export function reduceMotionPreference(): boolean {
  try {
    return window.localStorage.getItem(REDUCE_MOTION_KEY) === 'reduced';
  } catch {
    return false;
  }
}

export function saveReduceMotionPreference(reduced: boolean): void {
  try {
    window.localStorage.setItem(REDUCE_MOTION_KEY, reduced ? 'reduced' : 'full');
  } catch {
    // The in-memory setting still applies when storage is unavailable.
  }
}

/** Marks the document so CSS and JS animations can switch off together. */
export function applyReduceMotion(reduced: boolean): void {
  document.documentElement.toggleAttribute('data-reduce-motion', reduced);
}

export function systemPrefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** True when either the in-app setting or the phone's accessibility setting asks for less motion. */
export function motionReduced(): boolean {
  if (typeof document === 'undefined') return true;
  return (
    document.documentElement.hasAttribute('data-reduce-motion') || systemPrefersReducedMotion()
  );
}
