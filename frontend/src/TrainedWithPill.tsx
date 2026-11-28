import { colourThemePreference } from './colourThemes';
import { trainedWithLabel, type TrainedWith } from './trainTogether';
import { TrainTogetherAvatar } from './TrainTogetherAvatar';
import { partnerPalettes } from './trainTogetherTheme';

function isLightMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.colourMode === 'light';
}

/**
 * Compact "with Sam" pill for saved workout cards (History, Workout Detail, Friends Feed,
 * Shared Workouts). Displays up to 3 overlapping 18px avatars + label from `trainedWithLabel`.
 */
export function TrainedWithPill({
  trainedWith,
  trainedWithCount,
  viewerId,
  className = '',
}: {
  trainedWith?: TrainedWith[] | null;
  trainedWithCount?: number | null;
  viewerId?: string | null;
  className?: string;
}) {
  const label = trainedWithLabel(trainedWith, trainedWithCount, viewerId);
  if (!label) return null;

  const people = (trainedWith ?? []).slice(0, 3);
  const palettes = partnerPalettes(
    colourThemePreference(),
    Math.max(people.length, 1),
    isLightMode(),
  );

  return (
    <span className={`tt-with-pill${className ? ` ${className}` : ''}`}>
      {people.length > 0 && (
        <span className="tt-avatar-stack" aria-hidden="true">
          {people.map((person, index) => {
            const isViewer = Boolean(viewerId && person.user_id === viewerId);
            return (
              <TrainTogetherAvatar
                key={person.user_id}
                person={person}
                size="xs"
                variant={isViewer ? 'self' : 'partner'}
                palette={isViewer ? undefined : palettes[index]}
              />
            );
          })}
        </span>
      )}
      <span className="tt-with-pill-label">{label}</span>
    </span>
  );
}
