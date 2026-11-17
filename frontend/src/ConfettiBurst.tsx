import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

const CONFETTI_COLORS = ['#209cda', '#ffe066', '#8b5cf6', '#ff6b6b', '#2dd4bf', '#f7a8c4'];
const CONFETTI_PIECES = Array.from({ length: 36 }, (_, index) => ({
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  delay: `${(index % 9) * 0.07}s`,
  drift: `${((index * 29) % 90) - 45}px`,
  duration: `${2.7 + (index % 6) * 0.15}s`,
  height: `${8 + (index % 4) * 2}px`,
  left: `${2 + ((index * 37) % 96)}%`,
  radius: index % 3 === 0 ? '50%' : '2px',
  rotation: `${360 + ((index * 47) % 540)}deg`,
  width: `${5 + (index % 3) * 2}px`,
}));

export function ConfettiBurst({ onComplete }: { onComplete?: () => void }) {
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!onCompleteRef.current) return;
    const timer = window.setTimeout(() => onCompleteRef.current?.(), 4200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="confetti-burst" aria-hidden="true">
      {CONFETTI_PIECES.map((piece, index) => (
        <i
          key={index}
          className="confetti-piece"
          style={
            {
              '--confetti-color': piece.color,
              '--confetti-delay': piece.delay,
              '--confetti-drift': piece.drift,
              '--confetti-duration': piece.duration,
              '--confetti-height': piece.height,
              '--confetti-left': piece.left,
              '--confetti-radius': piece.radius,
              '--confetti-rotation': piece.rotation,
              '--confetti-width': piece.width,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
