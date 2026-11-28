import type { CSSProperties } from 'react';
import {
  memberName,
  partnerSetOnSameLift,
  type TrainMember,
  type TrainPartnerWorkout,
} from './trainTogether';
import { TrainTogetherAvatar } from './TrainTogetherAvatar';
import { formatPartnerSetValue } from './trainTogetherFormat';
import { partnerCssVars, type PartnerPalette } from './trainTogetherTheme';
import type { WeightUnit } from './weightUnits';
import type { StoredDraftSet } from './workoutDraft';

function completedSetNumber(
  workout: TrainPartnerWorkout,
  movementKey: string,
  set: StoredDraftSet,
): number {
  const movement = workout.draft.movements.find((item) => item.key === movementKey);
  if (!movement) return 1;
  const done = movement.sets.filter((item) => item.completed === true);
  const index = done.findIndex((item) => item.key === set.key);
  return index >= 0 ? index + 1 : done.length || 1;
}

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
    const match = partnerSetOnSameLift(partner.workout, myExerciseId);
    if (!match) continue;
    const value = formatPartnerSetValue(
      {
        weight_kg: match.set.weight_kg ?? null,
        reps: match.set.reps ?? null,
        duration_seconds: match.set.duration_seconds ?? null,
        distance_km: match.set.distance_km ?? null,
      },
      weightUnit,
    );
    if (!value) continue;
    rows.push({
      partner,
      palette: palettes[index],
      name: memberName(partner),
      value,
      setNumber: completedSetNumber(partner.workout, match.movementKey, match.set),
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
