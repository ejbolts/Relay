import { useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useCollapseAnimation } from './motionHooks';
import { useSettingsReveal } from './settingsNavigation';
import './collapsibleSection.css';

/**
 * A section folded down to its heading until opened. The heading holds the toggle button; the
 * rest of the section slides open and closed with the same motion as exercise cards.
 */
export function CollapsibleSection({
  className,
  kicker,
  title,
  headingLevel = 2,
  headingId,
  headingClassName,
  badge,
  help,
  defaultExpanded = false,
  children,
}: {
  className: string;
  kicker?: string;
  title: string;
  headingLevel?: 2 | 3;
  headingId?: string;
  headingClassName?: string;
  /** Status shown beside the chevron, so it stays visible while the section is folded. */
  badge?: ReactNode;
  /** A separate help control beside the title; tapping it does not fold the section. */
  help?: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const titleId = headingId ?? `${id}-title`;
  const ref = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  useSettingsReveal(title, () => setExpanded(true));
  useCollapseAnimation(ref, expanded);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const toggleEnd = (
    <span className="collapsible-toggle-end">
      {badge}
      <Icon name="chevron-down" />
    </span>
  );

  return (
    <section
      ref={ref}
      className={`${className} collapsible-section${expanded ? '' : ' is-collapsed'}`}
      aria-labelledby={titleId}
    >
      <header onClick={() => setExpanded((current) => !current)}>
        <div>
          {kicker && <p className="section-kicker">{kicker}</p>}
          <Heading
            id={titleId}
            className={
              [headingClassName, help && 'collapsible-heading-with-help']
                .filter(Boolean)
                .join(' ') || undefined
            }
          >
            <button type="button" className="collapsible-toggle" aria-expanded={expanded}>
              <span>{title}</span>
              {!help && toggleEnd}
            </button>
            {help}
            {help && toggleEnd}
          </Heading>
        </div>
      </header>
      {children}
    </section>
  );
}
