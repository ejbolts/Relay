import { PopupDialog } from './PopupDialog';
import type { WeightUnit } from './weightUnits';
import type { WeeklyReview } from './weeklyReview';
import { WeeklyReviewSummary } from './WeeklyReviewSummary';

/** The finished week's review, opened once at the start of each new week. */
export function WeeklyReviewPopup({
  review,
  weightUnit,
  onClose,
  onOpenProgress,
  onOpenCardio,
  onOpenBody,
}: {
  review: WeeklyReview;
  weightUnit: WeightUnit;
  onClose: () => void;
  onOpenProgress: (exerciseId?: string) => void;
  onOpenCardio: () => void;
  onOpenBody: () => void;
}) {
  return (
    <PopupDialog
      title="Last week"
      kicker="WEEKLY REVIEW"
      className="weekly-review-popup"
      onClose={onClose}
    >
      <div className="weekly-review-popup-body">
        <WeeklyReviewSummary
          review={review}
          weightUnit={weightUnit}
          isCurrentWeek={false}
          onOpenProgress={onOpenProgress}
          onOpenCardio={onOpenCardio}
          onOpenBody={onOpenBody}
        />
      </div>
      <footer className="popup-dialog-actions">
        <button type="button" className="popup-primary-action" onClick={onClose}>
          Got it
        </button>
      </footer>
    </PopupDialog>
  );
}
