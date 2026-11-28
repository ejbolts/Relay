import type { CSSProperties } from 'react';
import { memberShortName, type TrainMember } from './trainTogether';
import { partnerPace } from './trainTogetherView';
import { TrainTogetherAvatar } from './TrainTogetherAvatar';
import { partnerCssVars, type PartnerPalette } from './trainTogetherTheme';
import type { WeightUnit } from './weightUnits';

/**
 * Inline Partner Pace Strip placed inside a MovementCard between the movement header and the
 * set column headers whenever one or more partners have completed a set on the same lift.
 */
export function TrainTogetherPaceStrip({
  partners,
  palettes,
  myExerciseId,
  weightUnit,
}: {
  partners: TrainMember[];
  palettes: PartnerPalette[];
  myExerciseId: string;
  weightUnit: WeightUnit;
}) {
  const rows: Array<{
    partner: TrainMember;
    palette?: PartnerPalette;
    name: string;
    value: string;
    setNumber: number;
  }> = [];

  for (let index = 0; index < partners.length && rows.length < 3; index += 1) {
    const partner = partners[index];
    if (!partner.workout) continue;
    const pace = partnerPace(partner.workout, myExerciseId, weightUnit);
    if (!pace) continue;
    rows.push({
      partner,
      palette: palettes[index],
      name: memberShortName(partner),
      value: pace.label,
      setNumber: pace.setNumber,
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="tt-pace-strips" aria-label="Partners on this exercise">
      {rows.map(({ partner, palette, name, value, setNumber }) => (
        <div
          key={partner.user_id}
          className="tt-pace-strip"
          style={palette ? (partnerCssVars(palette) as CSSProperties) : undefined}
        >
          <TrainTogetherAvatar person={partner} size="sm" palette={palette} />
          <span className="tt-pace-strip-text num">
            <b>{name}</b> · {value}
          </span>
          <span className="tt-pace-strip-set num">Set {setNumber}</span>
        </div>
      ))}
    </div>
  );
}
