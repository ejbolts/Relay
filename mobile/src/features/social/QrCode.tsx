import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { encode } from 'uqr';

/**
 * A QR code drawn as one SVG path, dark on light so every camera can read it in any theme. Made
 * with the same encoder and settings as the web's, so both draw the same code for a link.
 */
export function QrCode({ value, label, size }: { value: string; label: string; size: number }) {
  const { modules, path } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 4 });
    let drawn = '';
    qr.data.forEach((row, y) =>
      row.forEach((dark, x) => {
        if (dark) drawn += `M${x} ${y}h1v1h-1z`;
      }),
    );
    return { modules: qr.size, path: drawn };
  }, [value]);
  // Whole points per module keep the edges between modules crisp, without antialiased seams.
  const drawn = Math.max(1, Math.floor(size / modules)) * modules;
  return (
    <Svg
      width={drawn}
      height={drawn}
      viewBox={`0 0 ${modules} ${modules}`}
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <Rect width={modules} height={modules} fill="#fff" />
      <Path d={path} fill="#000" />
    </Svg>
  );
}
