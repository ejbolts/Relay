import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProgressExerciseSearch } from './ProgressExerciseSearch';
import type { Exercise } from './types';

const exercises: Exercise[] = [
  {
    id: 'lat-pulldown',
    name: 'Single-Arm Lat Pulldown',
    category: 'pull',
    kind: 'strength',
    muscle_group: 'Lats',
    equipment: 'Machine',
    is_custom: false,
    is_favorite: false,
    muscle_contributions: [],
  },
];

describe('progress exercise search control', () => {
  it('shows a persistent searchable list for the Training exercise browser', () => {
    const markup = renderToStaticMarkup(
      <ProgressExerciseSearch
        exercises={exercises}
        exerciseId="lat-pulldown"
        onChange={vi.fn()}
        browseOnly
      />,
    );
    expect(markup).toContain('is-browsing');
    expect(markup).toContain('value=""');
    expect(markup).toContain('role="listbox"');
    expect(markup).toContain('Single-Arm Lat Pulldown');
    expect(markup).not.toContain('Browse exercises');
  });
  it('renders the selected exercise as an accessible searchable combobox', () => {
    const onChange = vi.fn();
    const markup = renderToStaticMarkup(
      <ProgressExerciseSearch
        exercises={exercises}
        exerciseId="lat-pulldown"
        onChange={onChange}
      />,
    );
    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('type="search"');
    expect(markup).toContain('aria-autocomplete="list"');
    expect(markup).toContain('value="Single-Arm Lat Pulldown"');
    expect(markup).toContain('Browse exercises');
    expect(onChange).not.toHaveBeenCalled();
  });
});
