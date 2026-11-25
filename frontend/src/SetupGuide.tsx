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
import { guideDone, GUIDE_TIPS, NORMALISE_GUIDE_WAIT, SETUP_GUIDE_TITLES } from './setupGuideSteps';
import { useTips } from './Tips';
import { useTrainingBlocks } from './trainingBlocksContext';
import type { TrackedWorkout } from './types';
import './setupGuide.css';

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
      title={NORMALISE_GUIDE_WAIT.title}
      className="setup-guide-wait"
      size="compact"
      onClose={() => setNeedsMachines(false)}
      actions={
        <button
          type="button"
          className="popup-primary-action"
          onClick={() => setNeedsMachines(false)}
        >
          OK
        </button>
      }
    >
      <p>{NORMALISE_GUIDE_WAIT.body}</p>
    </PopupDialog>
  );
}

const GUIDE_ICONS: Record<SetupGuideId, IconName> = {
  normalise: 'level',
  blocks: 'calendar',
  split: 'up',
};

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
          const done = guideDone(id, tips.state.seen, hasBlocks);
          return (
            <li key={id}>
              <button type="button" onClick={() => openSetupGuide(id)}>
                <span className="setup-guide-list-glyph">
                  <Icon name={GUIDE_ICONS[id]} />
                </span>
                <strong>{SETUP_GUIDE_TITLES[id]}</strong>
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
