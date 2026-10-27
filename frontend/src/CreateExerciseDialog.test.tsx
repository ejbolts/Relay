import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateExerciseDialog } from './CreateExerciseDialog';
import type { WorkoutCategory } from './types';

vi.mock('react-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-dom')>()),
  createPortal: (children: ReactNode) => children,
}));

beforeEach(() => vi.stubGlobal('document', { body: {} }));
afterEach(() => vi.unstubAllGlobals());

const categoryLabels: Record<WorkoutCategory, string> = {
  upper: 'Upper body',
  lower: 'Lower body',
  push: 'Push',
  pull: 'Pull',
  full_body: 'Full body',
  cardio: 'Cardio',
  other: 'Other',
};

describe('create exercise prompt', () => {
  it('prefills the search text and category without creating anything on open', () => {
    const onCreate = vi.fn();
    const markup = renderToStaticMarkup(
      <CreateExerciseDialog
        exercises={[]}
        categoryLabels={categoryLabels}
        initialName="New lat exercise"
        initialCategory="pull"
        viewportHeight={700}
        viewportTop={0}
        onCreate={onCreate}
        onCreated={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(markup).toContain('<dialog');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('value="New lat exercise"');
    expect(markup).toContain('value="pull" selected=""');
    expect(markup).toContain('Target muscle');
    expect(markup).toContain('Choose muscle');
    expect(markup).toContain('Direct · 1');
    expect(markup).toContain('Partial · ½');
    expect(markup).toContain('Equipment (optional)');
    expect(markup).toContain('type="submit"');
    expect(markup).toContain('Cancel');
    expect(onCreate).not.toHaveBeenCalled();
  });
});
