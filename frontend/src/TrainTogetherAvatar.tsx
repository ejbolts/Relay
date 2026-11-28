import { useState, type CSSProperties } from 'react';
import { memberName } from './trainTogether';
import { partnerCssVars, type PartnerPalette } from './trainTogetherTheme';

export interface TrainAvatarPerson {
  display_name?: string | null;
  username?: string | null;
  photo_url?: string | null;
}

function initialFor(person: TrainAvatarPerson): string {
  const label = memberName(person);
  return label.slice(0, 1).toUpperCase() || '?';
}

/**
 * Ringed circular avatar for Train together: shows the member's profile photo when set,
 * falling back to their initial. Optional live dot and finite 2-repeat join pulse ring.
 */
export function TrainTogetherAvatar({
  person,
  size = 'md',
  palette,
  variant = 'partner',
  live = null,
  pulse = false,
  className = '',
}: {
  person: TrainAvatarPerson;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  palette?: PartnerPalette;
  variant?: 'self' | 'partner' | 'solid';
  /** true = green live dot, false = muted dot, null = no dot. */
  live?: boolean | null;
  /** Plays a finite 2-repeat join ring pulse, off when reduced motion is enabled. */
  pulse?: boolean;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const url = person.photo_url ?? null;
  const showPhoto = Boolean(url) && url !== failedUrl;
  const style = palette ? (partnerCssVars(palette) as CSSProperties) : undefined;
  const classes = [
    'tt-avatar',
    `tt-avatar--${size}`,
    `tt-avatar--${variant}`,
    showPhoto ? 'has-photo' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const circle = (
    <span className={classes} style={style} aria-hidden="true">
      {showPhoto && url ? (
        <img src={url} alt="" decoding="async" onError={() => setFailedUrl(url)} />
      ) : (
        <span className="tt-avatar-initial">{initialFor(person)}</span>
      )}
      {live !== null && <span className={`tt-avatar-dot${live ? '' : ' is-muted'}`} />}
    </span>
  );

  if (!pulse) return circle;
  return (
    <span className="tt-avatar-pulse-wrap" style={style}>
      <span className="tt-avatar-ring-pulse" aria-hidden="true" />
      {circle}
    </span>
  );
}
