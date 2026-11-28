import { exercisesToCopy, memberName, type TrainMember } from './trainTogether';
import { PopupDialog } from './PopupDialog';
import { TrainTogetherAvatar } from './TrainTogetherAvatar';
import type { PartnerPalette } from './trainTogetherTheme';

export function TrainTogetherStartSheet({
  partner,
  palette,
  catalogueLoaded = true,
  catalogueError = null,
  onRetryCatalogue,
  onStartWithPartner,
  onStartOwn,
  onClose,
}: {
  partner: TrainMember;
  palette?: PartnerPalette;
  catalogueLoaded?: boolean;
  catalogueError?: string | null;
  onRetryCatalogue?: () => void;
  onStartWithPartner: (exerciseIds: string[], unmatched: string[]) => void;
  onStartOwn: () => void;
  onClose: () => void;
}) {
  const name = memberName(partner);
  const workout = partner.workout;
  const copied = workout ? exercisesToCopy(workout) : { exerciseIds: [], unmatched: [] };
  const exerciseById = new Map((workout?.exercises ?? []).map((item) => [item.id, item]));
  const movements = workout?.draft.movements ?? [];
  const chips: Array<{ key: string; name: string; matched: boolean }> = [];
  const seen = new Set<string>();
  for (const movement of movements) {
    const ex = exerciseById.get(movement.exerciseId);
    if (!ex || seen.has(ex.id)) continue;
    seen.add(ex.id);
    chips.push({
      key: movement.key,
      name: ex.name,
      matched: Boolean(ex.same_as_exercise_id),
    });
  }

  const workoutName = workout?.draft.name?.trim() || 'workout';
  const exerciseCount = chips.length;

  return (
    <PopupDialog
      variant="sheet"
      title={`Train with ${name}`}
      className="train-together-start-sheet"
      onClose={onClose}
    >
      <div className="tt-start-body">
        <div className="tt-start-partner">
          <TrainTogetherAvatar
            person={partner}
            size="xl"
            palette={palette}
            live={workout !== null}
          />
          <div className="tt-start-copy">
            <strong>{workout ? `${name}’s ${workoutName}` : name}</strong>
            <span>
              {workout
                ? `${exerciseCount} ${exerciseCount === 1 ? 'exercise' : 'exercises'}`
                : 'No workout open'}
            </span>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="tt-chip-wrap" aria-label={`${name}'s exercises`}>
            {chips.map((chip) => (
              <span key={chip.key} className={`tt-ex-chip${chip.matched ? '' : ' is-unmatched'}`}>
                {chip.matched ? chip.name : `${chip.name} · no match`}
              </span>
            ))}
          </div>
        )}

        {copied.exerciseIds.length > 0 && !catalogueLoaded && catalogueError && (
          <p className="inline-error" role="alert">
            {catalogueError}
          </p>
        )}

        <div className="tt-start-actions">
          {copied.exerciseIds.length > 0 &&
            (catalogueLoaded ? (
              <button
                type="button"
                className="pulse-button primary tt-full-btn"
                onClick={() => onStartWithPartner(copied.exerciseIds, copied.unmatched)}
              >
                {`Start with ${name}’s exercises`}
              </button>
            ) : catalogueError && onRetryCatalogue ? (
              <button
                type="button"
                className="pulse-button primary tt-full-btn"
                onClick={onRetryCatalogue}
              >
                Retry loading exercises
              </button>
            ) : (
              <button type="button" className="pulse-button primary tt-full-btn" disabled>
                Loading your exercises…
              </button>
            ))}
          <button
            type="button"
            className={`pulse-button ${copied.exerciseIds.length > 0 ? 'secondary' : 'primary'} tt-full-btn`}
            onClick={onStartOwn}
          >
            Start my own workout
          </button>
        </div>
      </div>
    </PopupDialog>
  );
}
