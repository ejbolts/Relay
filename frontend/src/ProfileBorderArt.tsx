import { useId } from 'react';
import { profileBorderShapes } from './profileBorderShapes';
import './profileBorders.css';

/** The frame of one profile border, laid over the photo it surrounds. */
export function ProfileBorderArt({ border, animated }: { border: string; animated: boolean }) {
  // Gradient ids are shared by the whole page, so each drawing needs its own.
  const id = `pb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg
      className={`profile-border-art${animated ? ' is-animated' : ''}`}
      viewBox="-10 -10 140 140"
      aria-hidden="true"
      focusable="false"
      data-border={border}
    >
      {profileBorderShapes(border, id)}
    </svg>
  );
}
