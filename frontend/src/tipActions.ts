import type { TipTarget } from './tipsState';

/** A request from a tip's button. The app shell listens and opens the place it names. */
export interface TipAction {
  target: TipTarget;
  /** For Machine weights: the exercise to open, when the tip knows which one. */
  exerciseId?: string;
}

const EVENT = 'relay:tip-action';

export function openTipTarget(action: TipAction) {
  window.dispatchEvent(new CustomEvent<TipAction>(EVENT, { detail: action }));
}

export function onTipTarget(listener: (action: TipAction) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<TipAction>).detail);
  window.addEventListener(EVENT, handle);
  return () => window.removeEventListener(EVENT, handle);
}
