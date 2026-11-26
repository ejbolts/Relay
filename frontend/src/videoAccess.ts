import type { User } from './types';

/**
 * Video uploads stay available unless the server explicitly says the account cannot upload, so an
 * older server that leaves `can_upload_videos` out still allows them. Shared by the web and the
 * native app.
 */
export function canUploadVideos(user: Pick<User, 'can_upload_videos'> | null): boolean {
  return user === null || user.can_upload_videos !== false;
}
