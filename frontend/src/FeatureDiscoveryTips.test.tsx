// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { BodyWeightTip, MachineWeightTip } from './FeatureDiscoveryTips';
import type { BodyWeightGoal, WeightMapping } from './types';
const { learn } = vi.hoisted(() => ({ learn: vi.fn() }));
vi.mock('./Tips', () => ({
  useTips: () => ({ learn }),
  TipSlot: ({
    id,
    eligible,
    children,
  }: {
    id: string;
    eligible: boolean;
    children?: ReactNode;
  }) => (
    <div data-tip={id} data-eligible={eligible}>
      {children}
    </div>
  ),
}));
let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  learn.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function render(child: ReactNode) {
  await act(async () => root.render(child));
}
const mapping = (counts: number[], enabled = false) =>
  ({
    enabled,
    reference_machine_id: null,
    machines: counts.map((workout_count, i) => ({ id: String(i), workout_count })),
  }) as WeightMapping;
const eligible = () => container.firstElementChild?.getAttribute('data-eligible');
it('suggests normalisation only after two machines have actual sessions', async () => {
  await render(
    <MachineWeightTip mapping={mapping([4, 0])}>
      <button>Machine weights</button>
    </MachineWeightTip>,
  );
  expect(eligible()).toBe('false');
  await render(
    <MachineWeightTip mapping={mapping([4, 1])}>
      <button>Machine weights</button>
    </MachineWeightTip>,
  );
  expect(eligible()).toBe('true');
  expect(container.querySelector('button')?.textContent).toBe('Machine weights');
});
it('retires normalisation when an existing or newly saved mapping is enabled', async () => {
  await render(<MachineWeightTip mapping={mapping([4, 1], true)}>Settings</MachineWeightTip>);
  expect(eligible()).toBe('false');
  expect(learn).toHaveBeenCalledWith('normalise');
});
it('waits for goal history and three weigh-ins before suggesting a maintenance band', async () => {
  await render(<BodyWeightTip measurementCount={3} goals={[]} ready={false} />);
  expect(eligible()).toBe('false');
  await render(<BodyWeightTip measurementCount={2} goals={[]} ready />);
  expect(eligible()).toBe('false');
  await render(<BodyWeightTip measurementCount={3} goals={[]} ready />);
  expect(eligible()).toBe('true');
});
it('recognises maintenance ranges in historical goals and ignores invalid ranges', async () => {
  await render(
    <BodyWeightTip
      measurementCount={3}
      ready
      goals={[{ maintenance_min_kg: 82, maintenance_max_kg: 80 } as BodyWeightGoal]}
    />,
  );
  expect(eligible()).toBe('true');
  await render(
    <BodyWeightTip
      measurementCount={3}
      ready
      goals={[{ maintenance_min_kg: 80, maintenance_max_kg: 82 } as BodyWeightGoal]}
    />,
  );
  expect(eligible()).toBe('false');
  expect(learn).toHaveBeenCalledWith('maintenance');
});
