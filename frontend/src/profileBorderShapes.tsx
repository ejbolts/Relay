import type { ReactNode } from 'react';
import { C, R, arc, around, at, dots, flame, leaf, star, ticks } from './profileBorderGeometry';
import { Band, Fade, Sheen, type Stop } from './ProfileBorderParts';

/**
 * How each profile border looks. The server owns a border's name and challenge; this file only
 * knows how to draw its key, so a key it has never seen leaves the photo plain.
 */
const STEEL: Stop[] = [
  [0, '#f3f4f6'],
  [0.28, '#8b93a1'],
  [0.5, '#e5e7eb'],
  [0.74, '#6b7280'],
  [1, '#d1d5db'],
];

/** A bumper plate: a thick coloured ring with pale stripes and two blocks of lettering. */
function plate(id: string, light: string, dark: string, ink: string) {
  return (
    <>
      <Fade
        id={`${id}a`}
        across
        stops={[
          [0, light],
          [1, dark],
        ]}
      />
      <Band width={9} stroke={`url(#${id}a)`} />
      <Band r={56.6} width={0.9} stroke="#111827" opacity={0.75} />
      <path
        d={`${arc(49.4, 0, 359.9)}${arc(54.6, 0, 359.9)}`}
        fill="none"
        stroke={ink}
        strokeWidth={0.7}
        opacity={0.6}
      />
      <path
        d={`${arc(R, -24, 24)}${arc(R, 156, 204)}`}
        fill="none"
        stroke={ink}
        strokeWidth={2.4}
        strokeDasharray="2.6 1.3"
        opacity={0.92}
      />
    </>
  );
}

const WAVES = around(16)
  .map((deg, index) =>
    index === 0
      ? `M${at(55.4, deg)}Q${at(58.4, deg + 11.25)} ${at(55.4, deg + 22.5)}`
      : `Q${at(58.4, deg + 11.25)} ${at(55.4, deg + 22.5)}`,
  )
  .join('');

/** A heartbeat trace round the ring: a sharp beat, then the small wave that follows it. */
const PULSE = `M${at(R, 0)}${[58, 122, 238, 302]
  .map(
    (deg) =>
      `A${R} ${R} 0 0 1 ${at(R, deg - 6)}L${at(50.4, deg - 4.4)}L${at(59.4, deg - 1.6)}` +
      `L${at(46.6, deg + 2.2)}L${at(R, deg + 4.6)}A${R} ${R} 0 0 1 ${at(R, deg + 7)}` +
      `Q${at(55.2, deg + 9.5)} ${at(R, deg + 12)}`,
  )
  .join('')}A${R} ${R} 0 0 1 ${at(R, 359.9)}`;

/** A chevron pointing outward at the bottom of the ring, as on a rank badge. */
const chevron = (deg: number) => `M${at(56.6, deg - 3)}L${at(60, deg)}L${at(56.6, deg + 3)}`;

/** A gold point standing out from the ring, for a family's grandest tier. */
const point = (deg: number) => `M${at(56.2, deg - 3.4)}L${at(62.4, deg)}L${at(56.2, deg + 3.4)}Z`;

const TIER_INK = ['#cbd5e1', '#fbbf24', '#fde68a'];

/**
 * How a tiered border shows its tier: one, two or three rank chevrons at the bottom. From tier 2
 * the ring gains gold rims; a family's grandest tier adds a beaded gold frame and a glint.
 */
function tierMarks(id: string, tier: number, options: { grand?: boolean; sheen?: boolean } = {}) {
  const grand = options.grand ?? tier >= 3;
  const sheen = options.sheen ?? grand;
  const angles = Array.from({ length: tier }, (_, index) => 180 + (index - (tier - 1) / 2) * 8.5);
  return (
    <>
      {tier >= 2 && (
        <>
          <Fade
            id={`${id}tier`}
            across
            stops={[
              [0, '#fef3c7'],
              [0.5, '#f59e0b'],
              [1, '#fde68a'],
            ]}
          />
          <path
            d={`${arc(47.3, 0, 359.9)}${arc(56.7, 0, 359.9)}`}
            fill="none"
            stroke={`url(#${id}tier)`}
            strokeWidth={1.1}
          />
        </>
      )}
      {tier >= 2 && (
        <path
          d={dots([45, 135, 225, 315], 56.7, 1.5)}
          fill={`url(#${id}tier)`}
          stroke="#0b1220"
          strokeWidth={0.5}
        />
      )}
      {grand && (
        <path
          d={around(8, 22.5).map(point).join('')}
          fill={`url(#${id}tier)`}
          stroke="#0b1220"
          strokeWidth={0.5}
          strokeLinejoin="round"
        />
      )}
      <path
        d={angles.map(chevron).join('')}
        fill="none"
        stroke="#0b1220"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={angles.map(chevron).join('')}
        fill="none"
        stroke={TIER_INK[Math.min(tier, 3) - 1]}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {sheen && <Sheen width={4} colour="#fff7d6" />}
    </>
  );
}

const LIFT_PLATES = {
  bench: ['#f87171', '#b91c1c', '#fff'],
  squat: ['#60a5fa', '#1d4ed8', '#fff'],
  deadlift: ['#fde047', '#ca8a04', '#422006'],
} as const;

/**
 * Plates loaded either side of the ring, as on a bar: one, two or three a side by tier. Each is
 * outlined so it reads on any ring colour.
 */
function loadedPlates(tier: number, colour: string) {
  const plates = Array.from({ length: tier }, (_, index) => 108.4 + index * 3.6);
  const rects = (x: number, index: number) => {
    const height = 26 - index * 2;
    return (
      <g key={x}>
        {[x, 120 - x - 3].map((left) => (
          <rect
            key={left}
            x={left}
            y={C - height / 2}
            width={3}
            height={height}
            rx={0.8}
            fill={colour}
            stroke="#0b1220"
            strokeWidth={0.7}
          />
        ))}
      </g>
    );
  };
  return (
    <>
      <path d="M104.6 60H120M15.4 60H0" stroke="#0b1220" strokeWidth={3.4} />
      <path d="M104.6 60H120M15.4 60H0" stroke="#d1d5db" strokeWidth={1.8} />
      {plates.map(rects)}
    </>
  );
}

/** A lift club tier: its bumper plate, with plates loaded by tier and gold lettering at the top. */
function plateTier(id: string, lift: keyof typeof LIFT_PLATES, tier: number) {
  const [light, dark, ink] = LIFT_PLATES[lift];
  return (
    <>
      {plate(id, light, dark, tier >= 3 ? '#fde68a' : ink)}
      {tierMarks(id, tier)}
      {loadedPlates(tier, tier >= 3 ? '#fbbf24' : dark)}
    </>
  );
}

const FLAMES = {
  fire: {
    band: ['#dc2626', '#f97316', '#fbbf24'],
    flames: ['#b91c1c', '#ea580c', '#f59e0b'],
    embers: '#fde047',
    rim: '#fef3c7',
  },
  // White-hot: the flames burn blue.
  blue: {
    band: ['#1e3a8a', '#2563eb', '#7dd3fc'],
    flames: ['#1d4ed8', '#38bdf8', '#e0f2fe'],
    embers: '#f0f9ff',
    rim: '#e0f2fe',
  },
} as const;

/** A ring of flames, for the long streaks. */
function flameRing(id: string, colours: (typeof FLAMES)[keyof typeof FLAMES], tall = 1) {
  return (
    <>
      <Fade
        id={`${id}a`}
        stops={[
          [0, colours.band[0]],
          [0.55, colours.band[1]],
          [1, colours.band[2]],
        ]}
      />
      <Fade
        id={`${id}b`}
        stops={[
          [0, colours.flames[0]],
          [0.6, colours.flames[1]],
          [1, colours.flames[2]],
        ]}
      />
      <path
        className="profile-border-flames"
        d={around(15)
          .map((deg, index) => flame(deg, 53.6, [7.2, 4.6, 5.8][index % 3] * tall, 8.5))
          .join('')}
        fill={`url(#${id}b)`}
      />
      <path
        className="profile-border-embers"
        d={around(15, 12)
          .map((deg, index) => flame(deg, 53.4, [3, 4, 3.4][index % 3] * tall, 5))
          .join('')}
        fill={colours.embers}
      />
      <Band width={6.4} stroke={`url(#${id}a)`} />
      <Band r={49.4} width={0.9} stroke={colours.rim} opacity={0.85} />
    </>
  );
}

const LAURELS = [
  // Regular: a bronze ring with a sprig either side.
  { band: ['#b45309', '#78350f'], leaves: ['#fcd34d', '#b45309'], at: [90, 112, 134], star: false },
  // Centurion: a red ring with a full gold laurel.
  {
    band: ['#ef4444', '#7f1d1d'],
    leaves: ['#fde68a', '#d97706'],
    at: [46, 68, 90, 112, 134, 156],
    star: true,
  },
  // Iron Legion: imperial purple with a laurel that nearly closes.
  {
    band: ['#7c3aed', '#2e1065'],
    leaves: ['#fef3c7', '#f59e0b'],
    at: [30, 50, 70, 90, 110, 130, 150],
    star: true,
  },
] as const;

/** A laurel wreath, for the workout count. */
function laurel(id: string, tier: number) {
  const look = LAURELS[tier - 1];
  return (
    <>
      <Fade
        id={`${id}a`}
        across
        stops={[
          [0, look.band[0]],
          [1, look.band[1]],
        ]}
      />
      <Fade
        id={`${id}b`}
        stops={[
          [0, look.leaves[0]],
          [1, look.leaves[1]],
        ]}
      />
      <Band width={6.4} stroke={`url(#${id}a)`} />
      <path
        d={`${arc(48.4, 0, 359.9)}${arc(55.6, 0, 359.9)}`}
        fill="none"
        stroke="#fbbf24"
        strokeWidth={tier >= 2 ? 1 : 0.6}
        opacity={tier >= 2 ? 1 : 0.6}
      />
      <path
        d={look.at
          .flatMap((deg) => [leaf(57.4, deg, 10.4, 4.4, 42), leaf(57.4, 360 - deg, 10.4, 4.4, -42)])
          .join('')}
        fill={`url(#${id}b)`}
        stroke="#78350f"
        strokeWidth={0.4}
      />
      {look.star && (
        <path
          d={star(56, 0, tier >= 3 ? 5 : 4.2, tier >= 3 ? 2.1 : 1.8)}
          fill="#fde68a"
          stroke="#78350f"
          strokeWidth={0.4}
        />
      )}
      {tierMarks(id, tier)}
    </>
  );
}

/** The bench, squat and deadlift colours around one ring; the crown waits for the top tier. */
function bigThree(id: string, tier: number) {
  return (
    <>
      <Fade
        id={`${id}a`}
        stops={[
          [0, '#fef3c7'],
          [1, '#d97706'],
        ]}
      />
      {(['#dc2626', '#eab308', '#2563eb'] as const).map((colour, index) => (
        <path
          key={colour}
          d={arc(R, index * 120 + 3, index * 120 + 117)}
          fill="none"
          stroke={colour}
          strokeWidth={7.4}
        />
      ))}
      {tier >= 2 && (
        <path
          d={dots([120, 240], R, 2.6)}
          fill={`url(#${id}a)`}
          stroke="#78350f"
          strokeWidth={0.5}
        />
      )}
      {tier >= 3 && (
        <path
          d="M52.4 10.4l-1.6-8 4.8 3.6L60 .4l4.4 5.6 4.8-3.6-1.6 8z"
          fill={`url(#${id}a)`}
          stroke="#78350f"
          strokeWidth={0.5}
          strokeLinejoin="round"
        />
      )}
      {tierMarks(id, tier)}
    </>
  );
}

const RECORD_METALS = [
  ['#fed7aa', '#f97316', '#9a3412'],
  ['#fde68a', '#f59e0b', '#b45309'],
  ['#f5f3ff', '#a78bfa', '#5b21b6'],
] as const;

/** A ring broken open by a record, in bronze, gold and then violet. */
function recordBreaker(id: string, tier: number) {
  const [light, mid, dark] = RECORD_METALS[tier - 1];
  return (
    <>
      <Fade
        id={`${id}a`}
        across
        stops={[
          [0, light],
          [0.5, mid],
          [1, dark],
        ]}
      />
      <path d={arc(R, 54, 381)} fill="none" stroke={`url(#${id}a)`} strokeWidth={7} />
      <path
        d={
          `M${at(48.5, 54.2)}L${at(52.4, 48.6)}L${at(55.5, 54.2)}Z` +
          `M${at(48.5, 20.8)}L${at(50.6, 25.6)}L${at(53, 22.6)}L${at(55.5, 26.4)}L${at(55.5, 20.8)}Z`
        }
        fill={mid}
      />
      <path
        d={
          `M${at(54.6, 33)}L${at(60, 30)}L${at(58.6, 37.4)}Z` +
          `M${at(56.6, 42.6)}L${at(60.4, 44.4)}L${at(57.6, 48)}Z` +
          `M${at(50, 37.5)}L${at(53.4, 35)}L${at(53, 40.4)}Z`
        }
        fill={tier >= 3 ? '#fde68a' : light}
      />
      {tierMarks(id, tier)}
    </>
  );
}

/** A heartbeat around the ring. The heart joins at tier 2, and the beat glows at tier 3. */
function cardiomaniac(id: string, tier: number) {
  return (
    <>
      <Fade
        id={`${id}a`}
        across
        stops={[
          [0, tier >= 3 ? '#be123c' : '#991b1b'],
          [1, '#450a0a'],
        ]}
      />
      <Band width={8} stroke={`url(#${id}a)`} />
      {tier >= 3 && (
        <path
          d={PULSE}
          fill="none"
          stroke="#fb7185"
          strokeWidth={3.6}
          strokeLinejoin="round"
          opacity={0.45}
        />
      )}
      <path
        d={PULSE}
        fill="none"
        stroke={tier >= 3 ? '#ffe4e6' : '#fda4af'}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {tier >= 2 && (
        <path
          className="profile-border-heart"
          d="M60 11.6C52.6 6.6 53.4.8 57.2.8 58.9.8 59.8 2 60 3c.2-1 1.1-2.2 2.8-2.2 3.8 0 4.6 5.8-2.8 10.8z"
          fill="#fb7185"
          stroke="#450a0a"
          strokeWidth={0.5}
        />
      )}
      {tierMarks(id, tier)}
    </>
  );
}

const SHAPES: Record<string, (id: string) => ReactNode> = {
  'first-steps': (id) => (
    <>
      <Fade
        id={`${id}a`}
        across
        stops={[
          [0, '#6ee7b7'],
          [1, '#0d9488'],
        ]}
      />
      <Band width={6} stroke={`url(#${id}a)`} />
      <path d={dots(around(5), R, 1.7)} fill="#ecfdf5" />
    </>
  ),
  'seven-straight': (id) => (
    <>
      <Fade
        id={`${id}a`}
        stops={[
          [0, '#67e8f9'],
          [1, '#2563eb'],
        ]}
      />
      <path
        d={around(7)
          .map((deg) => arc(R, deg - 21, deg + 21))
          .join('')}
        fill="none"
        stroke={`url(#${id}a)`}
        strokeWidth={6.5}
        strokeLinecap="round"
      />
    </>
  ),
  'locked-in': (id) => (
    <>
      <Fade
        id={`${id}a`}
        across
        stops={[
          [0, '#8b5cf6'],
          [1, '#4c1d95'],
        ]}
      />
      <Band width={7.5} stroke={`url(#${id}a)`} />
      <Band
        width={2.4}
        stroke="#ddd6fe"
        pathLength={30}
        strokeDasharray="0.62 0.38"
        strokeLinecap="round"
      />
      <rect x={55} y={5.4} width={10} height={8.2} rx={1.8} fill="#ede9fe" />
      <path
        d="M56.9 5.6v-2.4a3.1 3.1 0 0 1 6.2 0v2.4"
        fill="none"
        stroke="#ede9fe"
        strokeWidth={1.7}
      />
      <circle cx={C} cy={9.4} r={1.2} fill="#5b21b6" />
      {tierMarks(id, 1)}
    </>
  ),
  'monday-club': (id) => (
    <>
      <Fade
        id={`${id}a`}
        stops={[
          [0, '#d9f99d'],
          [0.3, '#84cc16'],
        ]}
      />
      <path
        d={around(7)
          .slice(1)
          .map((deg) => arc(R, deg - 21.5, deg + 21.5))
          .join('')}
        fill="none"
        stroke="#64748b"
        strokeWidth={5}
        strokeLinecap="round"
      />
      <path
        d={arc(R, -21.5, 21.5)}
        fill="none"
        stroke={`url(#${id}a)`}
        strokeWidth={8}
        strokeLinecap="round"
      />
    </>
  ),
  'dawn-patrol': (id) => (
    <>
      <Fade
        id={`${id}a`}
        stops={[
          [0, '#fde047'],
          [0.3, '#fb923c'],
          [0.62, '#ec4899'],
          [1, '#4338ca'],
        ]}
      />
      <Band width={7} stroke={`url(#${id}a)`} />
      <path
        d={ticks([-44, -22, 0, 22, 44], 57.4, 60)}
        stroke="#fde047"
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </>
  ),
  'night-shift': (id) => (
    <>
      <Fade
        id={`${id}a`}
        across
        stops={[
          [0, '#4338ca'],
          [0.5, '#1e1b4b'],
          [1, '#312e81'],
        ]}
      />
      <Band width={7.5} stroke={`url(#${id}a)`} />
      <Band r={56.2} width={0.8} stroke="#a5b4fc" opacity={0.7} />
      <path
        d={
          star(R, 118, 3, 1.1, 4) +
          star(R, 196, 2.3, 0.85, 4) +
          star(R, 262, 3, 1.1, 4) +
          star(R, 322, 2.1, 0.8, 4)
        }
        fill="#eef2ff"
      />
      <path d={dots([150, 228, 292], R, 0.7)} fill="#c7d2fe" />
      <path
        d="M96.6 13.2a7 7 0 1 0 7.4 9.9a5.7 5.7 0 0 1-7.4-9.9z"
        fill="#fde68a"
        stroke="#1e1b4b"
        strokeWidth={0.6}
      />
    </>
  ),
  'iron-habit': (id) => (
    <>
      <Fade id={`${id}a`} across stops={STEEL} />
      <Band width={8} stroke={`url(#${id}a)`} />
      <path
        d={`${arc(47.8, 0, 359.9)}${arc(56.2, 0, 359.9)}`}
        fill="none"
        stroke="#1f2937"
        strokeWidth={0.8}
      />
      <path d={dots(around(12), R, 1.6)} fill="#374151" />
      <path d={dots(around(12), 52.5, 0.55)} fill="#f9fafb" />
    </>
  ),
  'four-seasons': () => (
    <>
      {(['#4ade80', '#facc15', '#f97316', '#7dd3fc'] as const).map((colour, index) => (
        <path
          key={colour}
          d={arc(R, index * 90 + 4, index * 90 + 86)}
          fill="none"
          stroke={colour}
          strokeWidth={7}
          strokeLinecap="round"
        />
      ))}
      <path d={ticks(around(12, 15), 50.2, 53.8)} stroke="#fff" strokeWidth={1} opacity={0.85} />
    </>
  ),
  regular: (id) => laurel(id, 1),
  centurion: (id) => laurel(id, 2),
  'iron-legion': (id) => laurel(id, 3),
  'hundred-days': (id) => (
    <>
      {flameRing(id, FLAMES.fire)}
      {tierMarks(id, 2, { sheen: true })}
    </>
  ),
  unbreakable: (id) => (
    <>
      {flameRing(id, FLAMES.blue, 1.18)}
      {tierMarks(id, 3)}
    </>
  ),
  'whale-lifter': (id) => (
    <>
      <Fade
        id={`${id}a`}
        stops={[
          [0, '#22d3ee'],
          [0.5, '#0284c7'],
          [1, '#0c4a6e'],
        ]}
      />
      <Band width={7} stroke={`url(#${id}a)`} />
      <path d={WAVES} fill="none" stroke="#e0f2fe" strokeWidth={1.1} strokeLinecap="round" />
      <path
        d="M58.2 10.2C58 6.8 54.6 3.6 47.4.8c5.6-1.4 10.4.2 12.6 3.6 2.2-3.4 7-5 12.6-3.6-7.2 2.8-10.6 6-10.8 9.4z"
        fill="#f0f9ff"
        stroke="#0c4a6e"
        strokeWidth={0.5}
      />
      {tierMarks(id, 1)}
    </>
  ),
  'hundred-hours': (id) => (
    <>
      <Fade
        id={`${id}a`}
        across
        stops={[
          [0, '#334155'],
          [1, '#0f172a'],
        ]}
      />
      <Band width={8.6} stroke={`url(#${id}a)`} />
      <Band r={56.5} width={1} stroke="#cbd5e1" />
      <Band r={47.6} width={0.6} stroke="#64748b" />
      <path
        d={ticks(
          around(60).filter((_, index) => index % 5 !== 0),
          53.6,
          55.2,
        )}
        stroke="#94a3b8"
        strokeWidth={0.6}
      />
      <path d={ticks(around(12).slice(1), 49.8, 55.2)} stroke="#f8fafc" strokeWidth={1.5} />
      <path d={`M${at(56.2, -4.6)}L${at(56.2, 4.6)}L${at(49.6, 0)}Z`} fill="#ef4444" />
    </>
  ),
  'million-kilo': (id) => (
    <>
      <Fade
        id={`${id}a`}
        across
        stops={[
          [0, '#f8fafc'],
          [0.35, '#a5b4fc'],
          [0.65, '#67e8f9'],
          [1, '#f5d0fe'],
        ]}
      />
      <Fade
        id={`${id}b`}
        stops={[
          [0, '#ffffff'],
          [0.12, '#67e8f9'],
        ]}
      />
      <Band width={7.4} stroke={`url(#${id}a)`} />
      <Band width={7.4} stroke="#fff" pathLength={24} strokeDasharray="1 1" opacity={0.3} />
      <Band r={56.1} width={0.8} stroke="#818cf8" opacity={0.75} />
      <Band r={48} width={0.6} stroke="#e0e7ff" opacity={0.8} />
      <path
        d={star(R, 122, 3.4, 1.1, 4) + star(R, 212, 2.6, 0.9, 4) + star(R, 304, 3.4, 1.1, 4)}
        fill="#fff"
      />
      <path
        d="M54 4.4l3-3.6h6l3 3.6-6 8.2z"
        fill={`url(#${id}b)`}
        stroke="#0e7490"
        strokeWidth={0.5}
      />
      <path
        d="M54 4.4h12M57 .8l3 3.6 3-3.6M60 4.4v8.2"
        fill="none"
        stroke="#fff"
        strokeWidth={0.5}
      />
      <Sheen width={5} />
      {tierMarks(id, 2, { grand: true, sheen: false })}
    </>
  ),
  'pound-for-pound': (id) => (
    <>
      <Fade
        id={`${id}a`}
        stops={[
          [0, '#6ee7b7'],
          [1, '#047857'],
        ]}
      />
      <path
        d={`${arc(R, 13, 167)}${arc(R, 193, 347)}`}
        fill="none"
        stroke={`url(#${id}a)`}
        strokeWidth={6.6}
        strokeLinecap="round"
      />
      <path
        d="M55.6 6.2h8.8M55.6 9.8h8.8"
        stroke="#fbbf24"
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      <path d="M60 107.6l4.4 6.8h-8.8z" fill="#fbbf24" />
    </>
  ),
  'bench-club-1': (id) => plateTier(id, 'bench', 1),
  'bench-club-2': (id) => plateTier(id, 'bench', 2),
  'bench-club-3': (id) => plateTier(id, 'bench', 3),
  'squat-club-1': (id) => plateTier(id, 'squat', 1),
  'squat-club-2': (id) => plateTier(id, 'squat', 2),
  'squat-club-3': (id) => plateTier(id, 'squat', 3),
  'deadlift-club-1': (id) => plateTier(id, 'deadlift', 1),
  'deadlift-club-2': (id) => plateTier(id, 'deadlift', 2),
  'deadlift-club-3': (id) => plateTier(id, 'deadlift', 3),
  'big-three-1': (id) => bigThree(id, 1),
  'big-three-2': (id) => bigThree(id, 2),
  'big-three-3': (id) => bigThree(id, 3),
  'hat-trick': (id) => (
    <>
      <Fade
        id={`${id}a`}
        across
        stops={[
          [0, '#f472b6'],
          [1, '#9333ea'],
        ]}
      />
      <Band width={6} stroke={`url(#${id}a)`} />
      <path
        d={star(55.4, -30, 3.9, 1.6) + star(55.4, 0, 4.4, 1.8) + star(55.4, 30, 3.9, 1.6)}
        fill="#fde047"
        stroke="#86198f"
        strokeWidth={0.4}
      />
    </>
  ),
  'record-breaker-1': (id) => recordBreaker(id, 1),
  'record-breaker-2': (id) => recordBreaker(id, 2),
  'record-breaker-3': (id) => recordBreaker(id, 3),
  'marathon-month': (id) => (
    <>
      <Fade
        id={`${id}a`}
        across
        stops={[
          [0, '#fb923c'],
          [1, '#c2410c'],
        ]}
      />
      <Band width={9} stroke={`url(#${id}a)`} />
      <path
        d={[47.6, 50.6, 53.4, 56.4].map((r) => arc(r, 0, 359.9)).join('')}
        fill="none"
        stroke="#fff7ed"
        strokeWidth={0.6}
        opacity={0.9}
      />
      <path d={arc(R, -3.4, 3.4)} fill="none" stroke="#fff" strokeWidth={9} />
      <path
        d={`${arc(54.2, -3.4, 0)}${arc(49.8, 0, 3.4)}`}
        fill="none"
        stroke="#111827"
        strokeWidth={2.2}
      />
    </>
  ),
  'cardiomaniac-1': (id) => cardiomaniac(id, 1),
  'cardiomaniac-2': (id) => cardiomaniac(id, 2),
  'cardiomaniac-3': (id) => cardiomaniac(id, 3),
  hybrid: (id) => (
    <>
      <Fade id={`${id}a`} across stops={STEEL} />
      <Fade
        id={`${id}b`}
        stops={[
          [0, '#fb923c'],
          [1, '#dc2626'],
        ]}
      />
      <path d={arc(R, 184, 356)} fill="none" stroke={`url(#${id}a)`} strokeWidth={7.6} />
      <path d={arc(R, 4, 176)} fill="none" stroke={`url(#${id}b)`} strokeWidth={7.6} />
      <path d={dots([225, 270, 315], R, 1.5)} fill="#374151" />
      <path
        d={arc(R, 30, 150)}
        fill="none"
        stroke="#fff7ed"
        strokeWidth={1.4}
        strokeDasharray="1.2 6"
        strokeLinecap="round"
        opacity={0.9}
      />
      <path
        d="M62.4.4l-6.6 8h4l-2.2 6.4 7-8.6h-4z"
        fill="#fde047"
        stroke="#713f12"
        strokeWidth={0.5}
        strokeLinejoin="round"
      />
      <circle cx={C} cy={112} r={2.2} fill="#fde047" stroke="#713f12" strokeWidth={0.5} />
    </>
  ),
  everest: (id) => (
    <>
      <Fade
        id={`${id}a`}
        stops={[
          [0, '#f0f9ff'],
          [0.45, '#7dd3fc'],
          [1, '#1e3a8a'],
        ]}
      />
      <Band width={7} stroke={`url(#${id}a)`} />
      <Band r={56} width={0.8} stroke="#fff" opacity={0.85} />
      <path d={dots([128, 164, 200, 236], R, 0.8)} fill="#fff" />
      <path
        d="M39.6 13.6l9.4-9.8 3.6 3.4L60-2.2l7.4 9.4 3.6-3.4 9.4 9.8c-12.6-5.8-27.8-5.8-40.4 0z"
        fill="#f8fafc"
        stroke="#1e3a8a"
        strokeWidth={0.5}
        strokeLinejoin="round"
      />
      <path d="M60-2.2l7.4 9.4 3.6-3.4 9.4 9.8c-4.6-2.1-9.4-3.5-14.4-4.2z" fill="#93c5fd" />
      <Sheen width={4} />
    </>
  ),
};

/** Whether this build can draw the border, so an unknown key leaves the photo plain. */
export function hasProfileBorderArt(border: string | null | undefined): border is string {
  return typeof border === 'string' && Object.hasOwn(SHAPES, border);
}

/** Draws a border's shapes. `id` prefixes its gradients, which the whole page shares. */
export function profileBorderShapes(border: string, id: string): ReactNode {
  return SHAPES[border]?.(id) ?? null;
}
