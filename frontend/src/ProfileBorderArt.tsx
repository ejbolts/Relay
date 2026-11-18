import { useId } from 'react';
import { Band } from './ProfileBorderParts';
import { profileBorderShapes } from './profileBorderShapes';
import './profileBorders.css';

/** The frame of one profile border, laid over the photo it surrounds. */
export function ProfileBorderArt({ border, animated }: { border: string; animated: boolean }) {
  // Gradient ids are shared by the whole page, so each drawing needs its own.
  const id = `pb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg
      className={`profile-border-art${animated ? ' is-animated' : ''}`}
      viewBox="0 0 120 120"
      aria-hidden="true"
      focusable="false"
      data-border={border}
    >
      <Band width={9.6} stroke="rgb(8 12 20 / 34%)" />
      {profileBorderShapes(border, id)}
    </svg>
  );
}
