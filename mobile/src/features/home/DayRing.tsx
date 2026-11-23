import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

/** Clear space between the arcs of a mixed day, so neighbouring colours never touch (dp). */
const GAP = 3;

/**
 * A day's outline: one flat colour, or equal arcs around it when the day mixes workout types, as
 * the web's dayRing draws them. Fills its parent; give the parent a border radius.
 */
export function DayRing({
  colors,
  radius,
  width = 2,
  opacity = 1,
}: {
  colors: string[];
  radius: number;
  width?: number;
  opacity?: number;
}) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  if (!colors.length) return null;
  if (colors.length === 1)
    return (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderWidth: width, borderColor: colors[0], borderRadius: radius, opacity },
        ]}
      />
    );
  const inset = width / 2;
  const w = (size?.w ?? 0) - width;
  const h = (size?.h ?? 0) - width;
  const r = Math.max(0, Math.min(radius - inset, w / 2, h / 2));
  const perimeter = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
  const step = perimeter / colors.length;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity }]}
      onLayout={(event) =>
        setSize({ w: event.nativeEvent.layout.width, h: event.nativeEvent.layout.height })
      }
    >
      {size && w > 0 && h > 0 && (
        <Svg width={size.w} height={size.h}>
          {colors.map((color, index) => (
            <Rect
              key={`${color}-${index}`}
              x={inset}
              y={inset}
              width={w}
              height={h}
              rx={r}
              fill="none"
              stroke={color}
              strokeWidth={width}
              strokeDasharray={[Math.max(0, step - GAP), perimeter - step + GAP]}
              // The stroke starts at the top-left corner's end; begin each arc a step further on.
              strokeDashoffset={-(index * step) + GAP / 2 + (Math.PI * r) / 4}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}
