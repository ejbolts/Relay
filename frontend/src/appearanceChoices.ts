export const COLOUR_MODES = [
  { id: 'dark', name: 'Dark', icon: 'moon' },
  { id: 'light', name: 'Light', icon: 'sun' },
  { id: 'auto', name: 'Automatic', icon: 'contrast' },
] as const;
export type ColourModeId = (typeof COLOUR_MODES)[number]['id'];
/** The mode on screen: Automatic shows whichever of these the phone is set to. */
export type ShownColourMode = Exclude<ColourModeId, 'auto'>;
export const DARK_STYLES = [
  { id: 'default', name: 'Default' },
  { id: 'stained', name: 'Stained' },
  { id: 'oled', name: 'OLED' },
] as const;
export type DarkStyleId = (typeof DARK_STYLES)[number]['id'];
export const LIGHT_STYLES = [
  { id: 'default', name: 'Default' },
  { id: 'stained', name: 'Stained' },
] as const;
export type LightStyleId = (typeof LIGHT_STYLES)[number]['id'];
/** How see-through the frosted-glass cards and tab bar are; `off` keeps them solid. */
export const GLASS_LEVELS = [
  { id: 'off', name: 'Off' },
  { id: 'subtle', name: 'Subtle' },
  { id: 'medium', name: 'Medium' },
  { id: 'strong', name: 'Strong' },
] as const;
export type GlassLevelId = (typeof GLASS_LEVELS)[number]['id'];
export const DEFAULT_GLASS_LEVEL: GlassLevelId = 'medium';
export const COLOUR_THEMES = [
  {
    id: 'blue',
    name: 'Blue',
    detail: 'Original',
    accent: '#2c74d0',
    hover: '#357bd6',
    text: '#7fb4f1',
    lightText: '#1f62b4',
  },
  {
    id: 'emerald',
    name: 'Emerald',
    detail: 'Forest green',
    accent: '#237844',
    hover: '#2d8a51',
    text: '#78d49c',
    lightText: '#1b6638',
  },
  {
    id: 'plum',
    name: 'Plum',
    detail: 'Soft purple',
    accent: '#8057ba',
    hover: '#9069c7',
    text: '#c4a2ef',
    lightText: '#663f9e',
  },
  {
    id: 'coral',
    name: 'Coral',
    detail: 'Warm coral',
    accent: '#a44850',
    hover: '#b7565e',
    text: '#f3a0a6',
    lightText: '#943a42',
  },
  {
    id: 'amber',
    name: 'Amber',
    detail: 'Burnt amber',
    accent: '#985014',
    hover: '#ac6020',
    text: '#efb06d',
    lightText: '#8a4410',
  },
  {
    id: 'neutral',
    name: 'Neutral',
    detail: 'Silver grey',
    accent: '#5f6670',
    hover: '#6c747e',
    text: '#c5cbd2',
    lightText: '#4a525b',
  },
] as const;
export type ColourThemeId = (typeof COLOUR_THEMES)[number]['id'];

/** Mix two #rrggbb colours, matching CSS `color-mix(in srgb, a pct%, b)`. */
export function mixHex(a: string, b: string, pct: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(channel(a, i) * (pct / 100) + channel(b, i) * (1 - pct / 100))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Page colour for the phone's browser bar; kept in step with the `--p-page` token in pulse.css. */
export function browserThemeColour(
  mode: ShownColourMode,
  style: DarkStyleId,
  themeId: ColourThemeId,
  lightStyle: LightStyleId = 'default',
): string {
  const theme = COLOUR_THEMES.find((entry) => entry.id === themeId) ?? COLOUR_THEMES[0];
  if (mode === 'light')
    return lightStyle === 'stained' ? mixHex(theme.accent, '#f3f5f7', 7) : '#f3f5f7';
  if (style === 'oled') return '#000000';
  if (style === 'stained') return mixHex(theme.accent, '#0a0d12', 7);
  return '#0b0d0f';
}
