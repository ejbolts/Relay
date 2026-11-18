import type { SVGProps } from 'react';
import { C, R } from './profileBorderGeometry';

export type Stop = [offset: number, colour: string];

/** A gradient across the whole border: top to bottom, or corner to corner. */
export function Fade({
  id,
  stops,
  across = false,
}: {
  id: string;
  stops: Stop[];
  across?: boolean;
}) {
  return (
    <linearGradient
      id={id}
      gradientUnits="userSpaceOnUse"
      x1={across ? 14 : C}
      y1={across ? 14 : 2}
      x2={across ? 106 : C}
      y2={across ? 106 : 118}
    >
      {stops.map(([offset, colour]) => (
        <stop key={offset} offset={offset} stopColor={colour} />
      ))}
    </linearGradient>
  );
}

export function Band({
  r = R,
  width,
  stroke,
  ...rest
}: { r?: number; width: number; stroke: string } & SVGProps<SVGCircleElement>) {
  return <circle cx={C} cy={C} r={r} fill="none" stroke={stroke} strokeWidth={width} {...rest} />;
}

/** A glint on the ring. It circles slowly where the border is allowed to move. */
export function Sheen({ width, colour = '#fff' }: { width: number; colour?: string }) {
  return (
    <circle
      className="profile-border-sheen"
      cx={C}
      cy={C}
      r={R}
      fill="none"
      stroke={colour}
      strokeWidth={width}
      strokeLinecap="round"
      pathLength={100}
      strokeDasharray="7 93"
      opacity={0.6}
      transform={`rotate(-60 ${C} ${C})`}
    />
  );
}
