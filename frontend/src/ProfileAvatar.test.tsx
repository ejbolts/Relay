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
    expect(markup).toContain('class="profile-border-art" viewBox="-10 -10 140 140"');
    expect(markup).toContain('data-border="centurion"');
    expect(markup).not.toContain('is-animated');
  });

  it('lets a border move only where it is asked to', () => {
    const markup = renderToStaticMarkup(
      <ProfileAvatar
        className="profile-avatar"
        user={{ ...account, profile_photo_url: null, profile_border: 'unbreakable' }}
        animated
      />,
    );
    expect(markup).toContain('class="profile-border-art is-animated"');
    expect(markup).toContain('profile-border-aura');
  });

  it('draws every consistency border differently, with Centurion a clear step up from Regular', () => {
    const draw = (key: string) =>
      renderToStaticMarkup(
        <ProfileAvatar
          className="profile-avatar"
          user={{ ...account, profile_photo_url: null, profile_border: key }}
        />,
      );
    const keys = ['first-steps', 'regular', 'centurion', 'iron-legion'];
    keys.push('seven-straight', 'locked-in', 'hundred-days', 'unbreakable');
    const looks = keys.map((key) => draw(key).replace(/data-border="[^"]+"/, ''));
    expect(new Set(looks).size).toBe(keys.length);

    expect(draw('centurion')).toContain('profile-border-plume');
    expect(draw('centurion')).toContain('profile-border-aura');
    expect(draw('regular')).not.toContain('profile-border-plume');
    expect(draw('regular')).not.toContain('profile-border-aura');
    // Unbreakable is epic now: it glows, but without the legendary runes Iron Legion keeps.
    expect(draw('unbreakable')).toContain('profile-border-aura');
    expect(draw('unbreakable')).not.toContain('profile-border-runes');
    expect(draw('iron-legion')).toContain('profile-border-runes');
    expect(draw('seven-straight')).toContain('>7</text>');
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
    const ids = [...markup.matchAll(/<(?:linear|radial)Gradient id="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
    const used = new Set([...markup.matchAll(/url\(#([^)]+)\)/g)].map((match) => match[1]));
    expect(used.size).toBeGreaterThan(0);
    for (const id of used) expect(ids).toContain(id);
  });

  it('draws seasons and yearly events from their key alone', () => {
    const draw = (key: string) =>
      renderToStaticMarkup(
        <ProfileAvatar
          className="profile-avatar"
          user={{ ...account, profile_photo_url: null, profile_border: key }}
        />,
      );
    expect(draw('season-1-3')).toContain('>S1</text>');
    expect(draw('season-12-1')).toContain('>S12</text>');
    expect(draw('christmas-2026')).toContain('>2026</text>');
    expect(draw('summer-2026')).toContain('>26–27</text>');
    expect(draw('season-1-4')).not.toContain('profile-border-art');
    expect(draw('easter-2027')).not.toContain('profile-border-art');
  });

  it('gives mythic borders a halo, a flare and an orbit that legendary ones lack', () => {
    const draw = (key: string) =>
      renderToStaticMarkup(
        <ProfileAvatar
          className="profile-avatar"
          user={{ ...account, profile_photo_url: null, profile_border: key }}
          animated
        />,
      );
    for (const layer of ['profile-border-halo', 'profile-border-flare', 'profile-border-orbit']) {
      expect(draw('deadlift-club-5')).toContain(layer);
      expect(draw('deadlift-club-4')).not.toContain(layer);
    }
    expect(draw('deadlift-club-5')).toContain('>V</text>');
  });

  it('circles a sheen around tier V strength borders only', () => {
    const draw = (key: string) =>
      renderToStaticMarkup(
        <ProfileAvatar
          className="profile-avatar"
          user={{ ...account, profile_photo_url: null, profile_border: key }}
          animated
        />,
      );
    for (const family of ['bench-club', 'squat-club', 'deadlift-club', 'gravity-defier']) {
      expect(draw(`${family}-5`)).toContain('class="profile-border-sheen"');
      for (const tier of [4, 3, 2]) expect(draw(`${family}-${tier}`)).not.toContain('sheen');
    }
    for (const key of ['thousand-hours', 'unbreakable', 'million-kilo', 'season-1-3']) {
      expect(draw(key)).not.toContain('sheen');
    }
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
