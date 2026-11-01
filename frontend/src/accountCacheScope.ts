import { readLastUser } from './deviceAccount';
import { offlineGeneration } from './offlineStore';

/** A response belongs to the account and cache lifetime that initiated its request. */
export function captureAccountCacheScope() {
  const owner = readLastUser()?.id;
  const generation = offlineGeneration();
  return {
    owner,
    isCurrent: () => generation === offlineGeneration() && owner === readLastUser()?.id,
  };
}

export type AccountCacheScope = ReturnType<typeof captureAccountCacheScope>;
