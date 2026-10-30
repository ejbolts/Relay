import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AuthScreen } from './AuthScreen';
import type { AuthConfig } from './types';

const open: AuthConfig = { registration_open: true, invite_code_required: false };

/** Lower-cased so assertions do not depend on how React cases attribute names. */
function render(config: AuthConfig | null, initialMode?: 'sign-in' | 'create-account') {
  return renderToStaticMarkup(
    <AuthScreen config={config} onAuthenticated={vi.fn()} initialMode={initialMode} />,
  ).toLowerCase();
}

describe('AuthScreen', () => {
  it('explains a waiting friend invite only when one was opened', () => {
    expect(render(open)).not.toContain('friend request');
    vi.stubGlobal('window', {
      sessionStorage: { getItem: () => 'd7131000-7937-40be-b8ee-8b02800f5a36' },
    });
    try {
      expect(render(open)).toContain('sign in or create an account to send your friend request.');
      expect(render({ ...open, registration_open: false })).toContain(
        'sign in to send your friend request.',
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('renders the branded sign-in form with accessible, autofill-friendly fields', () => {
    const markup = render(open);

    expect(markup).toContain('relay');
    expect(markup).toContain('src="/relay-logo.png"');
    expect(markup).toContain('role="tablist"');
    expect(markup).toContain('autocomplete="current-password"');
    expect(markup).toContain('autocomplete="username"');
    expect(markup).toContain('inputmode="text"');
    expect(markup).not.toContain('type="email"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).not.toContain('autocomplete="name"');
    expect(markup).not.toContain('invite code');
    expect(markup).toMatch(/<label for="[^"]+">username<\/label>/);
    expect(markup).toContain('>sign in</span>');
  });

  it('renders the create-account form with a name, new password, and length hint', () => {
    const markup = render(open, 'create-account');

    expect(markup).toContain('autocomplete="name"');
    expect(markup).toContain('autocomplete="new-password"');
    expect(markup).toContain('at least 10 characters.');
    expect(markup).toContain('minlength="10"');
    expect(markup).toContain('maxlength="32"');
    expect(markup).not.toContain('not your last name.');
    expect(markup).not.toContain('friends see this.');
    expect(markup).toContain('placeholder="sam.sample"');
    expect(markup).toContain('your display name for friends to see on your profile.');
    expect(markup).toContain('must be unique.');
    expect(markup).not.toContain('new profiles are public');
    expect(markup).toContain('>create account</span>');
  });

  it('only asks for an invite code when the server requires one', () => {
    expect(render({ ...open, invite_code_required: true }, 'create-account')).toContain(
      'invite code',
    );
    expect(render(open, 'create-account')).not.toContain('invite code');
  });

  it('disables account creation and explains why when registration is closed', () => {
    const markup = render(
      { registration_open: false, invite_code_required: false },
      'create-account',
    );

    expect(markup).toContain('new accounts are closed');
    expect(markup).toMatch(/<button[^>]*role="tab"[^>]*disabled=""[^>]*>create account/);
    // A closed server always shows the sign-in form, even if create-account was requested.
    expect(markup).toContain('autocomplete="current-password"');
    expect(markup).not.toContain('autocomplete="name"');
  });

  it('falls back to a usable form while the config is still loading', () => {
    expect(render(null)).toContain('>sign in</span>');
  });
});
