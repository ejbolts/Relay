import { createContext } from 'react';
import type { useReleaseAnnouncement } from './useReleaseAnnouncement';

/** One running release and account-specific read state for every cached header. */
export const ReleaseAnnouncementContext = createContext<ReturnType<
  typeof useReleaseAnnouncement
> | null>(null);
