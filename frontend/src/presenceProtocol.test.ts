import { describe, expect, it } from 'vitest';
import { decodePresenceEvent } from './presenceProtocol';

describe('decodePresenceEvent', () => {
  it('reads the invalidation messages, including train together', () => {
    for (const type of ['active_workout', 'notifications', 'admin_activity_sync', 'train_together'])
      expect(decodePresenceEvent(JSON.stringify({ type }))).toEqual({ type });
  });

  it('ignores types it does not know, so newer servers cannot break older apps', () => {
    expect(decodePresenceEvent('{"type":"something_new"}')).toBeNull();
    expect(decodePresenceEvent('not json')).toBeNull();
    expect(decodePresenceEvent(42)).toBeNull();
  });
});
