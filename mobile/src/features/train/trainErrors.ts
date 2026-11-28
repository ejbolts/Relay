import { ApiError } from '../../data/api';

/** No answer, or a proxy's, rather than a refusal from Relay itself. */
export function isConnectionFailure(error: unknown) {
  return !(error instanceof ApiError) || [502, 503, 504].includes(error.status);
}
