import { useMemo } from 'react';
import { partners } from '../../../../frontend/src/trainTogether';
import { partnerPalettes, type PartnerPalette } from '../../../../frontend/src/trainTogetherTheme';
import type { IconPair } from '../../ui/Icon';
import { useTheme } from '../../ui/theme';
import { colourTheme } from '../settings/devicePreferences';
import { useTrainState } from './trainStore';

/** A partner's colours, from the shared palette both apps draw with. */
export type PartnerColours = PartnerPalette;

/** Each partner's colours by user id, in the session's order, skipping your own theme. */
export function usePartnerColours(): Record<string, PartnerColours> {
  const { scheme } = useTheme();
  const own = colourTheme.use();
  const session = useTrainState((state) => state.read?.session ?? null);
  return useMemo(() => {
    const list = partners(session);
    const palettes = partnerPalettes(own, list.length, scheme === 'light');
    return Object.fromEntries(list.map((member, index) => [member.user_id, palettes[index]]));
  }, [session, own, scheme]);
}

export const trainIcons = {
  together: { sf: 'person.2.fill', md: 'group' },
  qr: { sf: 'qrcode', md: 'qr-code-2' },
  share: { sf: 'square.and.arrow.up', md: 'share' },
  offline: { sf: 'wifi.slash', md: 'wifi-off' },
  pending: { sf: 'clock', md: 'schedule' },
} satisfies Record<string, IconPair>;
