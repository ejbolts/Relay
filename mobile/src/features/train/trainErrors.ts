import { TRAIN_ERRORS } from '../../../../frontend/src/trainTogether';
import { ApiError } from '../../data/api';

const REFUSALS: readonly string[] = [
  TRAIN_ERRORS.notPartner,
  TRAIN_ERRORS.noWorkout,
  TRAIN_ERRORS.changeNotAllowed,
];

/**
 * Relay refused the request, so sending it again can't work: a train-together refusal, or any
 * other 4xx except a timeout (408) or too many requests (429).
 */
export function isRefusal(error: unknown) {
  if (!(error instanceof ApiError)) return false;
  if (error.code && REFUSALS.includes(error.code)) return true;
  return error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;
}

/**
 * Anything else may work when sent again: no answer, a timeout, too many requests or any server
 * error. Shown as "Offline · Unsent change" with Retry, keeping the unsent edit.
 */
export function isConnectionFailure(error: unknown) {
  return !isRefusal(error);
}
