import type { ReactNode, Ref } from 'react';
import { Icon } from './Icon';
import { SwipeFold, SwipeFoldHandle } from './SwipeFold';
import { useElementHeight } from './useElementHeight';
import { useSwipeToggle } from './useSwipeToggle';
import './guideCard.css';

export interface GuideNext {
  label?: string;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * One step of a guide, shared by the app tour and the setup guides' coach: a kicker with the step
 * count, the step's title and text, Back and Next, and the progress along its bottom.
 *
 * The card sits against one edge of the screen (`edge`), with its grabber on the side facing the
 * middle. Dragging the grabber toward that edge, or tapping it, folds the text and Back away and
 * keeps the kicker, title, Next and progress. Each new step opens again.
 */
export function GuideCard({
  guide,
  index,
  total,
  title,
  titleRef,
  edge = 'bottom',
  onBack,
  next,
  onLeave,
  children,
}: {
  /** The guide's name in the kicker, such as "Quick tour". */
  guide: string;
  index: number;
  total: number;
  title: string;
  /**
   * The host focuses the title on each new step. Without one, new steps are announced instead,
   * for a card that leaves focus where it is.
   */
  titleRef?: Ref<HTMLHeadingElement>;
  edge?: 'top' | 'bottom';
  onBack?: () => void;
  next?: GuideNext;
  onLeave: () => void;
  children: ReactNode;
}) {
  const [foldRef, full] = useElementHeight<HTMLDivElement>();
  const { open, dragged, panelStyle, handleProps } = useSwipeToggle({
    opens: edge === 'top' ? 'down' : 'up',
    full,
    resetKey: index,
  });
  const handle = (
    <SwipeFoldHandle className="guide-card-handle" label="guide" handleProps={handleProps} />
  );
  return (
    <div
      className={`guide-card is-${edge}${open ? '' : ' is-folded'}${dragged === null ? '' : ' sheet-dragging'}`}
      style={panelStyle}
    >
      {edge === 'bottom' && handle}
      <div className="guide-card-header">
        <span className="guide-card-kicker">
          <Icon name="sparkle" />
          {guide} · {index + 1} of {total}
        </span>
        <button type="button" className="guide-card-leave" onClick={onLeave}>
          Skip guide
        </button>
      </div>
      <div aria-live={titleRef ? undefined : 'polite'}>
        <h3 className="guide-card-title" ref={titleRef} tabIndex={titleRef ? -1 : undefined}>
          {title}
        </h3>
        <SwipeFold open={open} contentRef={foldRef} className="guide-card-body">
          {children}
        </SwipeFold>
      </div>
      {(onBack || next) && (
        <div className="guide-card-actions">
          {onBack && (
            <button
              type="button"
              className="pulse-button secondary guide-card-back"
              onClick={onBack}
            >
              <Icon name="chevron-left" />
              Back
            </button>
          )}
          {next && (
            <button
              type="button"
              className="pulse-button primary guide-card-next"
              disabled={next.disabled}
              onClick={next.onClick}
            >
              {next.label ?? 'Next'}
              <Icon name="chevron-right" />
            </button>
          )}
        </div>
      )}
      <span className="guide-card-progress" aria-hidden="true">
        {Array.from({ length: total }, (_, item) => (
          <i key={item} className={item <= index ? 'is-done' : undefined} />
        ))}
      </span>
      {edge === 'top' && handle}
    </div>
  );
}
