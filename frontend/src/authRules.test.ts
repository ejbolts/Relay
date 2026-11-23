import { describe, expect, it } from 'vitest';
import {
  authErrorText,
  passwordChangeError,
  passwordChangeFailureText,
  profileNameError,
} from './authRules';

describe('password changes', () => {
  it('reports the first problem in the order the form shows its fields', () => {
    const fields = { current: '', next: 'short', confirm: 'other' };
    expect(passwordChangeError(fields)).toBe('Enter your current password.');
    expect(passwordChangeError(fields, { temporary: true })).toBe('Enter the temporary password.');
    expect(passwordChangeError({ ...fields, current: 'old' })).toBe(
      'New password: use at least 10 characters.',
    );
    expect(passwordChangeError({ current: 'old', next: 'long enough!', confirm: 'nope' })).toBe(
      'The new passwords do not match.',
    );
    expect(
      passwordChangeError({ current: 'old', next: 'long enough!', confirm: 'long enough!' }),
    ).toBeNull();
  });

  it('names the current password when Settings checks it', () => {
    const wrong = {
      status: 400,
      code: 'invalid_password',
      message: 'That password is not correct.',
    };
    expect(authErrorText(wrong)).toBe('That password is not correct.');
    expect(passwordChangeFailureText(wrong)).toBe('Your current password is not correct.');
  });
});

describe('server error copy', () => {
  it('uses friendly copy by code, then by status, then the server message', () => {
    expect(authErrorText({ status: 409, code: 'display_name_taken', message: 'x' })).toMatch(
      /Another account already uses that name/,
    );
    expect(authErrorText({ status: 422, code: 'validation', message: 'x' })).toBe(
      'Check your details and try again.',
    );
    expect(authErrorText({ status: 503, message: 'x' })).toBe(
      'The server had a problem. Try again in a moment.',
    );
    expect(authErrorText({ status: 409, code: 'sex_locked', message: 'Ask an admin.' })).toBe(
      'Ask an admin.',
    );
  });

  it('needs a name to show in the app', () => {
    expect(profileNameError('  ')).toBe('Enter a name to show in the app.');
    expect(profileNameError('Sam')).toBeNull();
  });
});
