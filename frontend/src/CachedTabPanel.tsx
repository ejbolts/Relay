import type { ReactNode } from 'react';

export function CachedTabPanel({
  active,
  children,
  inert,
}: {
  active: boolean;
  children: ReactNode;
  inert?: boolean;
}) {
  return (
    <div
      className="cached-tab-panel"
      hidden={!active}
      inert={inert}
      aria-hidden={inert || undefined}
    >
      {children}
    </div>
  );
}
