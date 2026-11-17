import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ProfileAvatar } from './ProfileAvatar';

const account = { display_name: 'Lifter', username: 'lifter' };

describe('ProfileAvatar', () => {
  it("shows the account's photo when it has one", () => {
    const markup = renderToStaticMarkup(
      <ProfileAvatar
        className="profile-avatar"
        user={{ ...account, profile_photo_url: '/api/profile/photo?v=abc' }}
      />,
    );
    expect(markup).toContain('class="profile-avatar has-photo"');
    expect(markup).toContain('src="/api/profile/photo?v=abc"');
    expect(markup).not.toContain('>L<');
  });

  it('falls back to the initial without a photo', () => {
    const markup = renderToStaticMarkup(
      <ProfileAvatar className="profile-avatar" user={{ ...account, profile_photo_url: null }} />,
    );
    expect(markup).toBe('<span class="profile-avatar" aria-hidden="true">L</span>');
  });
});
