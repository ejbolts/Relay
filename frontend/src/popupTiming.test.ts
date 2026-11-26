import { describe, expect, it } from 'vitest';
import { POPUP_MS, toastDuration } from './popupTiming';

describe('toastDuration', () => {
  it('times a toast by what it is for', () => {
    expect(toastDuration('status', 'Saved')).toBe(POPUP_MS.standard);
    expect(toastDuration('action', 'Check-in saved')).toBe(POPUP_MS.standard);
    expect(toastDuration('warning', 'This workout is waiting to sync.')).toBe(POPUP_MS.important);
    expect(toastDuration('celebrate', 'All-time weight PR')).toBe(POPUP_MS.important);
    expect(toastDuration('error', 'Could not reach Relay.')).toBe(POPUP_MS.critical);
  });

  it('lets the owner pick another time', () => {
    expect(toastDuration('action', 'Set deleted', 'quick')).toBe(POPUP_MS.quick);
    expect(toastDuration('action', 'Workout deleted', 'important')).toBe(POPUP_MS.important);
  });

  it('gives a long message time to read, but never shortens a longer time', () => {
    expect(toastDuration('status', 'x'.repeat(90))).toBe(POPUP_MS.standard);
    expect(toastDuration('status', 'x'.repeat(91))).toBe(POPUP_MS.important);
    expect(toastDuration('action', 'x'.repeat(91), 'quick')).toBe(POPUP_MS.important);
    expect(toastDuration('error', 'x'.repeat(91))).toBe(POPUP_MS.critical);
  });
});
