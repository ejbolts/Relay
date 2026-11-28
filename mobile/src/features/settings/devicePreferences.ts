import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import {
  COLOUR_MODES,
  COLOUR_THEMES,
  DARK_STYLES,
  LIGHT_STYLES,
} from '../../../../frontend/src/appearanceChoices';
import {
  CHART_YEAR_LINES_KEY,
  parseChartYearLines,
  serializeChartYearLines,
} from '../../../../frontend/src/chartYears';
import {
  BODY_TREND_PREFERENCE_KEY,
  parseBodyTrendPreference,
  type BodyTrendPreference,
} from '../../../../frontend/src/bodyTrend';
import { deviceStorage } from '../../data/deviceStorage';

function preference<T>(
  key: string,
  parse: (value: string | null) => T,
  serialize: (value: T) => string,
) {
  let current: { value: T } | undefined;
  const listeners = new Set<() => void>();
  const read = () => {
    if (!current) {
      let saved: string | null = null;
      try {
        saved = deviceStorage.getItem(key);
      } catch {
        // Device storage can be unavailable. The preference still works in this session.
      }
      current = { value: parse(saved) };
    }
    return current.value;
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return {
    use: () => useSyncExternalStore(subscribe, read),
    /** The current value, for code outside React such as the logger's rest rules. */
    get: read,
    subscribe,
    set: (value: T) => {
      current = { value };
      try {
        deviceStorage.setItem(key, serialize(value));
      } catch {
        // Keep the in-memory choice when the phone cannot persist it.
      }
      listeners.forEach((listener) => listener());
    },
  };
}

function choice<Id extends string>(key: string, items: readonly { id: Id }[], fallback: Id) {
  return preference(
    key,
    (saved) => items.find(({ id }) => id === saved)?.id ?? fallback,
    (id) => id,
  );
}

export const colourMode = choice('gym-logger-colour-mode', COLOUR_MODES, 'auto');
export const colourTheme = choice('gym-logger-colour-theme', COLOUR_THEMES, 'blue');
export const darkStyle = choice('gym-logger-dark-style', DARK_STYLES, 'default');
export const lightStyle = choice('gym-logger-light-style', LIGHT_STYLES, 'default');
export const reduceMotion = preference(
  'gym-logger-reduce-motion',
  (saved) => saved === 'reduced',
  (reduced) => (reduced ? 'reduced' : 'full'),
);
/** Year lines on long charts in landscape, kept on the phone under the web's key. */
export const chartYearLines = preference(
  CHART_YEAR_LINES_KEY,
  parseChartYearLines,
  serializeChartYearLines,
);
export const bodyTrendPreference = preference<BodyTrendPreference>(
  BODY_TREND_PREFERENCE_KEY,
  parseBodyTrendPreference,
  JSON.stringify,
);

function enabledPreference(key: string) {
  return preference(
    key,
    (saved) => saved !== 'disabled',
    (on) => (on ? 'enabled' : 'disabled'),
  );
}

export const restTimerPreference = enabledPreference('gym-logger-rest-timer');
export const restTimesPreference = enabledPreference('gym-logger-show-rest-times');

export function useReduceMotion() {
  const reduced = reduceMotion.use();
  const [system, setSystem] = useState(false);
  useEffect(() => {
    let live = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      live = false;
      setSystem(value);
    });
    void Promise.resolve(AccessibilityInfo.isReduceMotionEnabled()).then(
      (value) => {
        if (live) setSystem(value === true);
      },
      () => undefined,
    );
    return () => {
      live = false;
      subscription?.remove();
    };
  }, []);
  return reduced || system;
}
