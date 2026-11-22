import { PopupDialog } from './PopupDialog';
import type { WeightUnit } from './weightUnits';
import { WeeklyReviewBrowser, type WeeklyReviewData } from './WeeklyReviewBrowser';

/** The weekly review, opening on the finished week with arrows to earlier weeks and this week. */
export function WeeklyReviewPopup({
  data,
  weightUnit,
  onClose,
  onOpenProgress,
  onOpenCardio,
  onOpenBody,
}: {
  data: WeeklyReviewData;
  weightUnit: WeightUnit;
  onClose: () => void;
  onOpenProgress: (exerciseId?: string) => void;
  onOpenCardio: () => void;
  onOpenBody: () => void;
}) {
  return (
    <PopupDialog
      title="Weekly review"
      className="weekly-review-popup"
      onClose={onClose}
      actions={
        <button type="button" className="popup-primary-action" onClick={onClose}>
          Got it
        </button>
      }
    >
      <div className="weekly-review-popup-body">
        <WeeklyReviewBrowser
          {...data}
          weightUnit={weightUnit}
          initialWeeksAgo={1}
          onOpenProgress={onOpenProgress}
          onOpenCardio={onOpenCardio}
          onOpenBody={onOpenBody}
        />
      </div>
    </PopupDialog>
  );
}
