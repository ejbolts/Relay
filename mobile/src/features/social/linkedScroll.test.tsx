import { act, renderHook } from '@testing-library/react-native';
import { useLinkedScroll } from './linkedScroll';

/** The hook on a stand-in ScrollView, with a section that sits `y` down the page. */
async function setup() {
  const view = await renderHook(() => useLinkedScroll());
  const scrollTo = jest.fn();
  const content = {};
  Object.assign(view.result.current.scrollRef, {
    current: { getInnerViewRef: () => content, scrollTo },
  });
  const section = (y: number) => ({
    measureLayout: jest.fn((_relative: unknown, done: (x: number, y: number) => void) =>
      done(0, y),
    ),
  });
  const layout = (height: number) =>
    view.result.current.onLayout({ nativeEvent: { layout: { height } } } as never);
  return { hook: view.result, scrollTo, section, layout };
}

beforeEach(() => {
  jest
    .spyOn(globalThis, 'requestAnimationFrame')
    .mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
});
afterEach(() => jest.restoreAllMocks());

test('a jump repeats as the page changes size until its results settle and it can reach the top', async () => {
  const { hook, scrollTo, section, layout } = await setup();
  await act(async () => {
    layout(400);
    hook.current.onContentSizeChange(390, 2000);
    hook.current.scrollToSection(section(500) as never, true);
  });
  // Reachable on the old page, but the results asked for haven't loaded: still pending.
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 488, animated: true });
  // Their loading placeholder shortens the page, then they settle while it's still short.
  await act(async () => hook.current.onContentSizeChange(390, 700));
  await act(async () => hook.current.sectionReady());
  expect(scrollTo).toHaveBeenCalledTimes(3);
  // The results lay out and lengthen the page: the jump lands and is done.
  await act(async () => hook.current.onContentSizeChange(390, 1400));
  expect(scrollTo).toHaveBeenCalledTimes(4);
  await act(async () => hook.current.onContentSizeChange(390, 2000));
  expect(scrollTo).toHaveBeenCalledTimes(4);
});

test('a jump whose results are already shown is done as soon as it lands', async () => {
  const { hook, scrollTo, section, layout } = await setup();
  await act(async () => {
    layout(400);
    hook.current.onContentSizeChange(390, 2000);
    hook.current.scrollToSection(section(500) as never, true, true);
  });
  await act(async () => hook.current.onContentSizeChange(390, 2500));
  expect(scrollTo.mock.calls).toEqual([[{ y: 488, animated: true }]]);
});

test('a screen size change retries a pending jump', async () => {
  const { hook, scrollTo, section, layout } = await setup();
  await act(async () => {
    layout(400);
    hook.current.onContentSizeChange(390, 700);
    hook.current.scrollToSection(section(500) as never, true, true);
  });
  // Too short for 488 with a 400 pt screen, so it waits; a smaller screen can reach it.
  await act(async () => layout(200));
  expect(scrollTo).toHaveBeenCalledTimes(2);
  await act(async () => hook.current.onContentSizeChange(390, 900));
  expect(scrollTo).toHaveBeenCalledTimes(2);
});

test('a drag cancels a pending jump, and Reduce motion jumps without animating', async () => {
  const { hook, scrollTo, section, layout } = await setup();
  await act(async () => {
    layout(400);
    hook.current.onContentSizeChange(390, 700);
    hook.current.scrollToSection(section(500) as never, false);
  });
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 488, animated: false });
  await act(async () => {
    hook.current.onScrollBeginDrag();
    hook.current.onContentSizeChange(390, 1400);
  });
  expect(scrollTo).toHaveBeenCalledTimes(1);
});

test('a newer request replaces a pending one', async () => {
  const { hook, scrollTo, section, layout } = await setup();
  await act(async () => {
    layout(400);
    hook.current.onContentSizeChange(390, 700);
    hook.current.scrollToSection(section(500) as never, true);
    hook.current.scrollToSection(section(900) as never, true);
  });
  scrollTo.mockClear();
  // The page growing follows only the newer request.
  await act(async () => hook.current.onContentSizeChange(390, 1400));
  expect(scrollTo.mock.calls).toEqual([[{ y: 888, animated: true }]]);
});
