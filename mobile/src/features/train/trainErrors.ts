import { partnerAccessEnded, partnerWriteRefused } from '../../../../frontend/src/trainTogether';
import { ApiError } from '../../data/api';

// Thin wrappers over the shared rule for a failed partner write (frontend/src/trainTogether.ts),
// reading the status and code from this app's own ApiError.

/** Relay refused the change, so sending it again can't work. */
export function isRefusal(error: unknown) {
  return error instanceof ApiError && partnerWriteRefused(error.status, error.code);
}

/** The refusal says you can no longer change this partner's workout at all. */
export function isAccessEnded(error: unknown) {
  return error instanceof ApiError && partnerAccessEnded(error.code);
}

/** Anything else may work when sent again: "Offline · Unsent change" with Retry. */
export function isConnectionFailure(error: unknown) {
  return !isRefusal(error);
}
