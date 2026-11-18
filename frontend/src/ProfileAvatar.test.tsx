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

  it('draws the border the account wears around the photo', () => {
    const markup = renderToStaticMarkup(
      <ProfileAvatar
        className="profile-avatar"
        user={{ ...account, profile_photo_url: '/photo.webp', profile_border: 'centurion' }}
      />,
    );
    expect(markup).toContain('class="profile-avatar has-photo avatar-bordered"');
    expect(markup).toContain('class="profile-border-art" viewBox="0 0 120 120"');
    expect(markup).toContain('data-border="centurion"');
    expect(markup).not.toContain('is-animated');
  });

  it('lets a border move only where it is asked to', () => {
    const markup = renderToStaticMarkup(
      <ProfileAvatar
        className="profile-avatar"
        user={{ ...account, profile_photo_url: null, profile_border: 'hundred-days' }}
        animated
      />,
    );
    expect(markup).toContain('class="profile-border-art is-animated"');
    expect(markup).toContain('profile-border-sheen');
  });

  it('gives each drawing its own gradients, so two borders never share colours', () => {
    const markup = renderToStaticMarkup(
      <>
        <ProfileAvatar
          className="profile-avatar"
          user={{ ...account, profile_photo_url: null, profile_border: 'bench-club-1' }}
        />
        <ProfileAvatar
          className="profile-avatar"
          user={{ ...account, profile_photo_url: null, profile_border: 'squat-club-1' }}
        />
      </>,
    );
    const ids = [...markup.matchAll(/<linearGradient id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(markup).toContain(`url(#${id})`);
  });

  it('leaves the photo plain for a border this version cannot draw', () => {
    const markup = renderToStaticMarkup(
      <ProfileAvatar
        className="profile-avatar"
        user={{ ...account, profile_photo_url: null, profile_border: 'from-a-newer-release' }}
      />,
    );
    expect(markup).toBe('<span class="profile-avatar" aria-hidden="true">L</span>');
  });
});
