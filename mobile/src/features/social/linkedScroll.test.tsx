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

test('a section jump repeats as the page grows, until the section can reach the top', async () => {
  const { hook, scrollTo, section, layout } = await setup();
  await act(async () => {
    layout(400);
    hook.current.onContentSizeChange(390, 700);
    hook.current.scrollToSection(section(500) as never, true);
  });
  // The page can scroll only 300 of the 488 needed while the results load: still pending.
  expect(scrollTo).toHaveBeenLastCalledWith({ y: 488, animated: true });
  await act(async () => hook.current.onContentSizeChange(390, 1400));
  expect(scrollTo).toHaveBeenCalledTimes(2);
  // Reached now, so later growth leaves the page where the reader is.
  await act(async () => hook.current.onContentSizeChange(390, 2000));
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
