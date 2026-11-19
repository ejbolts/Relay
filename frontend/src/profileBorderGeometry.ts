/**
 * Geometry for the profile borders, which are drawn in a 120-unit box around the photo. The
 * photo's edge is the circle of radius 50 at the centre, so a border sits on that edge and
 * reaches out to 60.
 */
export const C = 60;
export const R = 52;

export const round = (value: number) => Math.round(value * 100) / 100;

/** The point `r` from the centre at `deg`, measured clockwise from the top. */
export function xy(r: number, deg: number): [number, number] {
  const angle = ((deg - 90) * Math.PI) / 180;
  return [round(C + r * Math.cos(angle)), round(C + r * Math.sin(angle))];
}

export const at = (r: number, deg: number) => xy(r, deg).join(' ');

/** A clockwise arc of the circle of radius `r`. */
export const arc = (r: number, from: number, to: number) =>
  `M${at(r, from)}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${at(r, to)}`;

/** `count` angles spread evenly round the circle. */
export const around = (count: number, start = 0) =>
  Array.from({ length: count }, (_, index) => start + (index * 360) / count);

export const ticks = (angles: number[], inner: number, outer: number) =>
  angles.map((deg) => `M${at(inner, deg)}L${at(outer, deg)}`).join('');

export const dots = (angles: number[], r: number, size: number) =>
  angles
    .map((deg) => {
      const [x, y] = xy(r, deg);
      return `M${round(x - size)} ${y}a${size} ${size} 0 1 0 ${size * 2} 0a${size} ${size} 0 1 0 ${-size * 2} 0`;
    })
    .join('');

/** A star centred `r` out at `deg`, pointing away from the centre. */
export function star(r: number, deg: number, outer: number, inner: number, points = 5) {
  const [cx, cy] = xy(r, deg);
  const corners = Array.from({ length: points * 2 }, (_, index) => {
    const angle = ((deg - 90 + (index * 180) / points) * Math.PI) / 180;
    const reach = index % 2 === 0 ? outer : inner;
    return `${round(cx + reach * Math.cos(angle))} ${round(cy + reach * Math.sin(angle))}`;
  });
  return `M${corners.join('L')}Z`;
}

/** A leaf lying along the ring at `deg`, leaning by `tilt` degrees. */
export function leaf(r: number, deg: number, length: number, width: number, tilt: number) {
  const [cx, cy] = xy(r, deg);
  const angle = ((deg + tilt) * Math.PI) / 180;
  const dx = round((length / 2) * Math.cos(angle));
  const dy = round((length / 2) * Math.sin(angle));
  const rotation = round(deg + tilt);
  return (
    `M${round(cx - dx)} ${round(cy - dy)}` +
    `A${length / 2} ${width / 2} ${rotation} 0 1 ${round(cx + dx)} ${round(cy + dy)}` +
    `A${length / 2} ${width / 2} ${rotation} 0 1 ${round(cx - dx)} ${round(cy - dy)}Z`
  );
}

/** A flame rising from the ring at `deg`, leaning clockwise. */
export function flame(deg: number, base: number, height: number, half: number) {
  return (
    `M${at(base, deg - half)}` +
    `Q${at(base + height * 0.55, deg - half * 0.9)} ${at(base + height, deg + half * 0.9)}` +
    `Q${at(base + height * 0.35, deg + half * 0.7)} ${at(base, deg + half)}Z`
  );
}
