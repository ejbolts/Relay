import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { POPUP_MS } from '../../../../frontend/src/popupTiming';
import { WeeklySetsShelf } from './WeeklySetsShelf';

describe('weekly sets shelf', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const update = { id: 1, gains: [{ muscle: 'Chest', before: 3, after: 4, gain: 1 }] };

  it('keeps its countdown while the rest beside it is hidden and shown', async () => {
    const onDismiss = jest.fn();
    const shelf = (joined: boolean) => (
      <WeeklySetsShelf update={update} goal={10} joined={joined} onDismiss={onDismiss} />
    );
    const view = await render(shelf(true));
    await act(async () => undefined);
    await act(async () => jest.advanceTimersByTime(POPUP_MS.standard - 500));
    // Hiding the rest only unjoins the shelf from the pill; the countdown carries on.
    await view.rerender(shelf(false));
    await view.rerender(shelf(true));
    expect(onDismiss).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(600));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('keeps a hold across hiding the rest', async () => {
    const onDismiss = jest.fn();
    const shelf = (joined: boolean) => (
      <WeeklySetsShelf update={update} goal={10} joined={joined} onDismiss={onDismiss} />
    );
    const view = await render(shelf(true));
    await fireEvent.press(screen.getByLabelText(/^Chest 4 of 10 weekly sets/));
    await view.rerender(shelf(false));
    await act(async () => jest.advanceTimersByTime(POPUP_MS.standard * 3));
    expect(onDismiss).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText(/^Chest 4 of 10 weekly sets/));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
