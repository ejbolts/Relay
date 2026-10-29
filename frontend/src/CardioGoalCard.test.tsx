import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CardioGoalCard } from './CardioGoalCard';
import { trackedCardioGoals } from './cardioZones';
import type { CardioGoalCardSettings } from './homeLayout';
import type { CardioGoalWeek } from './types';

const goals: CardioGoalWeek[] = [
  { zone: 2, goal_minutes: 150, completed_minutes: 60, remaining_minutes: 90, complete: false },
  { zone: 4, goal_minutes: 30, completed_minutes: 30, remaining_minutes: 0, complete: true },
];
const render = (settings: CardioGoalCardSettings, items = goals) =>
  renderToStaticMarkup(
    <CardioGoalCard goals={items} settings={settings} daysLeft={4} onOpen={vi.fn()} />,
  );

describe('Home cardio goal card', () => {
  it('tracks one chosen goal and falls back to every goal when it was removed', () => {
    expect(trackedCardioGoals(goals, { zone: 4, style: 'list' })).toEqual([goals[1]]);
    expect(trackedCardioGoals(goals, { zone: 3, style: 'list' })).toEqual(goals);
    expect(trackedCardioGoals(goals, { zone: null, style: 'list' })).toEqual(goals);
  });

  it('shows a single goal as the progress design with time remaining', () => {
    const markup = render({ zone: 2, style: 'progress' });
    expect(markup).toContain('<span>Zone 2 cardio</span>');
    expect(markup).toContain('<strong>60<small> / 150 min</small></strong>');
    expect(markup).toContain('role="meter"');
    expect(markup).toContain('90 min to go · 4 days left');
    expect(markup).not.toContain('Zone 4');
  });

  it('renders ring and list designs for every goal', () => {
    const rings = render({ zone: null, style: 'ring' });
    expect(rings.match(/cardio-goal-ring\b/g)).toHaveLength(2);
    expect(rings).toContain('cardio-goal-ring complete');
    expect(rings).toContain('1 of 2 goals reached');
    const list = render({ zone: null, style: 'list' });
    expect(list).not.toContain('role="meter"');
    expect(list).toContain('<b>Zone 4</b> <small>30 / 30 min</small>');
  });

  it('reports a reached single goal and an empty goal list', () => {
    expect(render({ zone: 4, style: 'ring' })).toContain('Weekly goal reached');
    expect(render({ zone: null, style: 'progress' }, [])).toContain('Set a weekly goal in Cardio');
  });
});
