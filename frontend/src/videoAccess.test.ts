import { describe, expect, it } from 'vitest';
import { canUploadVideos } from './videoAccess';

describe('canUploadVideos', () => {
  it('allows uploads unless the server explicitly says no', () => {
    expect(canUploadVideos({ can_upload_videos: true })).toBe(true);
    expect(canUploadVideos({ can_upload_videos: false })).toBe(false);
    // An older server leaves the field out.
    expect(canUploadVideos({} as { can_upload_videos: boolean })).toBe(true);
    expect(canUploadVideos(null)).toBe(true);
  });
});
