import { useMemo } from 'react';
import { COLOUR_THEMES, mixHex } from '../../../../frontend/src/appearanceChoices';
import { partners, partnerThemeIds } from '../../../../frontend/src/trainTogether';
import type { IconPair } from '../../ui/Icon';
import { colourTheme } from '../settings/devicePreferences';
import { useTheme, type Palette } from '../../ui/theme';
import { useTrainState } from './trainStore';

/** A partner's colours, from their theme as DESIGN.md derives them. */
export interface PartnerColours {
  accent: string;
  /** Labels, counts and the partner's exercise titles. */
  text: string;
  /** Chips, the pace strip and tonal buttons. */
  soft: string;
  /** The partner mode header's background. */
  tint: string;
  /** Borders. */
  line: string;
}

export function partnerColours(
  themeId: string,
  scheme: 'light' | 'dark',
  colors: Pick<Palette, 'surface'>,
): PartnerColours {
  const theme = COLOUR_THEMES.find((item) => item.id === themeId) ?? COLOUR_THEMES[0];
  const light = scheme === 'light';
  const surface = /^#[0-9a-f]{6}$/i.test(colors.surface)
    ? colors.surface
    : light
      ? '#ffffff'
      : '#15181b';
  return {
    accent: theme.accent,
    text: light ? theme.lightText : theme.text,
    soft: `${theme.accent}${light ? '1f' : '33'}`,
    tint: mixHex(theme.accent, surface, light ? 6 : 14),
    line: `${theme.accent}${light ? '5c' : '57'}`,
  };
}

/** Each partner's colours by user id, in the session's order, skipping your own theme. */
export function usePartnerColours(): Record<string, PartnerColours> {
  const { scheme, colors } = useTheme();
  const own = colourTheme.use();
  const session = useTrainState((state) => state.read?.session ?? null);
  return useMemo(() => {
    const list = partners(session);
    const ids = partnerThemeIds(own, list.length);
    return Object.fromEntries(
      list.map((member, index) => [member.user_id, partnerColours(ids[index], scheme, colors)]),
    );
  }, [session, own, scheme, colors]);
}

export const trainIcons = {
  together: { sf: 'person.2.fill', md: 'group' },
  qr: { sf: 'qrcode', md: 'qr-code-2' },
  share: { sf: 'square.and.arrow.up', md: 'share' },
  offline: { sf: 'wifi.slash', md: 'wifi-off' },
  pending: { sf: 'clock', md: 'schedule' },
} satisfies Record<string, IconPair>;
