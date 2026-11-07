// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { isAppleTouchDevice, preventIosInputZoom } from './iosInputZoom';

const BASE = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
const iPhone = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
  platform: 'iPhone',
  maxTouchPoints: 5,
};
const iPadDesktopMode = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
  platform: 'MacIntel',
  maxTouchPoints: 5,
};
const mac = { ...iPadDesktopMode, maxTouchPoints: 0 };
const android = {
  userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130 Mobile',
  platform: 'Linux armv8l',
  maxTouchPoints: 5,
};

function viewport(content = BASE) {
  document.head.innerHTML = `<meta name="viewport" content="${content}">`;
  return document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!;
}

afterEach(() => {
  document.head.innerHTML = '';
});

describe('isAppleTouchDevice', () => {
  it('recognises iPhones and iPads in desktop mode only', () => {
    expect(isAppleTouchDevice(iPhone)).toBe(true);
    expect(isAppleTouchDevice(iPadDesktopMode)).toBe(true);
    expect(isAppleTouchDevice(mac)).toBe(false);
    expect(isAppleTouchDevice(android)).toBe(false);
  });
});

describe('preventIosInputZoom', () => {
  it('caps the viewport scale on iOS so focusing a field does not zoom', () => {
    const meta = viewport();
    preventIosInputZoom(document, iPhone as Navigator);
    expect(meta.content).toBe(`${BASE}, maximum-scale=1`);
    preventIosInputZoom(document, iPhone as Navigator);
    expect(meta.content).toBe(`${BASE}, maximum-scale=1`);
  });

  it('leaves the viewport alone elsewhere so pinch zoom keeps working', () => {
    const meta = viewport();
    preventIosInputZoom(document, android as Navigator);
    preventIosInputZoom(document, mac as Navigator);
    expect(meta.content).toBe(BASE);
  });
});
