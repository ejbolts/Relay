/** True on iPhone, iPod and iPad, including iPads that report a desktop Mac user agent. */
export function isAppleTouchDevice(
  nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator,
): boolean {
  return (
    /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  );
}

/**
 * Stop iOS zooming the page into a focused field whose text is smaller than 16px.
 *
 * iOS honours `maximum-scale` for that automatic zoom but ignores it for pinch zoom, so people can
 * still zoom by hand. Other platforms keep the original viewport, where it would block pinch zoom.
 */
export function preventIosInputZoom(doc: Document = document, nav = navigator): void {
  if (!isAppleTouchDevice(nav)) return;
  const viewport = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport || /maximum-scale/.test(viewport.content)) return;
  viewport.content = `${viewport.content}, maximum-scale=1`;
}
