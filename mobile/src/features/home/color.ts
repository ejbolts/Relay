/** Mixes two #rrggbb colours, `amount` of the first: CSS color-mix(in srgb, a amount, b). */
export function mixColor(a: string, b: string, amount: number) {
  const parse = (hex: string) => {
    const value = hex.replace('#', '');
    const full =
      value.length === 3
        ? value
            .split('')
            .map((c) => c + c)
            .join('')
        : value.slice(0, 6);
    const number = parseInt(full, 16);
    return Number.isNaN(number) ? null : [number >> 16, (number >> 8) & 255, number & 255];
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return a;
  const channel = (index: number) =>
    Math.round(left[index] * amount + right[index] * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}
