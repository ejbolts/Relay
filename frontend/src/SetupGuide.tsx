import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { multiMachineExerciseId } from './machineUsage';
import { PopupDialog } from './PopupDialog';
import {
  exitGuide,
  onGuideFinished,
  onSetupGuide,
  openSetupGuide,
  SETUP_GUIDE_IDS,
  startGuide,
  useActiveGuide,
  type SetupGuideId,
} from './setupGuides';
import { useTips } from './Tips';
import { useTrainingBlocks } from './trainingBlocksContext';
import type { TipId } from './tipsState';
import type { TrackedWorkout } from './types';
import './setupGuide.css';

/** The tips a finished guide has taught, so they stop suggesting the feature. */
const GUIDE_TIPS: Record<SetupGuideId, TipId[]> = {
  normalise: ['normalise'],
  blocks: ['blocks'],
  split: ['split', 'repRange'],
};

/**
 * Starts a guide in the feature's own screen, where the screen's coach takes over, and ends a
 * split guide once the person leaves the splits page.
 */
export function SetupGuideHost({ workouts }: { workouts: TrackedWorkout[] }) {
  const tips = useTips();
  const { act, learn } = tips;
  const page = tips.environment.page;
  const splitGuide = useActiveGuide('split');
  const reachedSplits = useRef(false);
  const [needsMachines, setNeedsMachines] = useState(false);
  const latest = useRef({ workouts, hasSplit: false });
  useEffect(() => {
    latest.current = { workouts, hasSplit: tips.state.seen.split === 'learned' };
  });

  useEffect(
    () =>
      onSetupGuide((id) => {
        const { workouts: current, hasSplit } = latest.current;
        if (id === 'normalise') {
          const exerciseId = multiMachineExerciseId(current);
          if (!exerciseId) {
            setNeedsMachines(true);
            return;
          }
          startGuide(id, current);
          act('normalise', exerciseId);
          return;
        }
        reachedSplits.current = false;
        startGuide(id, current);
        act(id === 'blocks' ? 'blocks' : hasSplit ? 'repRange' : 'split');
      }),
    [act],
  );
  useEffect(
    () =>
      onGuideFinished((id) => {
        for (const tip of GUIDE_TIPS[id]) learn(tip);
      }),
    [learn],
  );
  useEffect(() => {
    if (!splitGuide) return;
    if (page === 'split') reachedSplits.current = true;
    else if (reachedSplits.current) exitGuide('split');
  }, [page, splitGuide]);

  if (!needsMachines) return null;
  return (
    <PopupDialog
      title="Compare machines"
      className="setup-guide-wait"
      onClose={() => setNeedsMachines(false)}
    >
      <p>
        This needs one exercise logged on two saved machines. Save a machine photo on an exercise
        while you log it, then use the other machine next time.
      </p>
      <footer className="popup-dialog-actions">
        <button
          type="button"
          className="popup-primary-action"
          onClick={() => setNeedsMachines(false)}
        >
          OK
        </button>
      </footer>
    </PopupDialog>
  );
}

const GUIDE_ROWS: Record<SetupGuideId, { title: string; icon: IconName }> = {
  normalise: { title: 'Compare machines', icon: 'level' },
  blocks: { title: 'Training blocks', icon: 'calendar' },
  split: { title: 'Splits and rep ranges', icon: 'up' },
};

/** Whether the feature a guide sets up is already in use. */
function guideDone(id: SetupGuideId, seen: Partial<Record<TipId, string>>, hasBlocks: boolean) {
  if (id === 'normalise') return seen.normalise === 'learned';
  if (id === 'blocks') return hasBlocks || seen.blocks === 'learned';
  return seen.split === 'learned' && seen.repRange === 'learned';
}

export function SetupGuidesSettings() {
  const tips = useTips();
  const blocks = useTrainingBlocks();
  const hasBlocks = blocks.config.blocks.length > 0;
  return (
    <section className="settings-panel panel" aria-labelledby="setup-guides-settings-title">
      <header>
        <h2 id="setup-guides-settings-title">Setup guides</h2>
      </header>
      <ul className="setup-guide-list">
        {SETUP_GUIDE_IDS.map((id) => {
          const row = GUIDE_ROWS[id];
          const done = guideDone(id, tips.state.seen, hasBlocks);
          return (
            <li key={id}>
              <button type="button" onClick={() => openSetupGuide(id)}>
                <span className="setup-guide-list-glyph">
                  <Icon name={row.icon} />
                </span>
                <strong>{row.title}</strong>
                {done && <span className="setup-guide-list-done">Set up</span>}
                <Icon name="chevron-right" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
