import type { BodyFigureKind } from './bodyFigureShapes';

/** The body outline each account last chose for its measurements on this device. */
const sessionState = new Map<string, BodyFigureKind>();

export const DEFAULT_BODY_FIGURE: BodyFigureKind = 'male';

const keyFor = (userId: string) => `gym-logger-body-figure:${encodeURIComponent(userId)}`;

export function loadBodyFigure(userId: string | null): BodyFigureKind {
  if (userId === null) return DEFAULT_BODY_FIGURE;
  const key = keyFor(userId);
  const remembered = sessionState.get(key);
  if (remembered) return remembered;
  try {
    const stored = window.localStorage.getItem(key);
    return stored === 'male' || stored === 'female' ? stored : DEFAULT_BODY_FIGURE;
  } catch {
    return DEFAULT_BODY_FIGURE;
  }
}

export function saveBodyFigure(userId: string | null, kind: BodyFigureKind): void {
  if (userId === null) return;
  const key = keyFor(userId);
  sessionState.set(key, kind);
  try {
    window.localStorage.setItem(key, kind);
  } catch {
    // Keep the choice for this session if browser storage is unavailable.
  }
}
