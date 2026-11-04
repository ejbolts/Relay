// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cropProfilePhoto,
  DEFAULT_PHOTO_CROP,
  photoCropRect,
  gesturePhotoCrop,
  reframePhotoCrop,
} from './profilePhotoGeometry';

afterEach(() => vi.restoreAllMocks());

describe('profile crop geometry and export', () => {
  it('anchors zoom at an off-centre pinch midpoint and allows that midpoint to move', () => {
    const start = { zoom: 1, x: 0.5, y: 0.5 };
    const crop = gesturePhotoCrop(
      1200,
      800,
      start,
      [
        { x: 0.1, y: 0.25 },
        { x: 0.4, y: 0.25 },
      ],
      [
        { x: 0.1, y: 0.5 },
        { x: 0.7, y: 0.5 },
      ],
    );
    expect(crop.zoom).toBeCloseTo(2);
    const rect = photoCropRect(1200, 800, crop);
    expect(rect.x + 0.4 * rect.side).toBeCloseTo(400);
    expect(rect.y + 0.5 * rect.side).toBeCloseTo(200);
  });

  it('limits extreme pinches, keeps portrait crops inside the source and preserves the crop centre', () => {
    const crop = reframePhotoCrop(800, 1200, DEFAULT_PHOTO_CROP, 100);
    expect(crop).toEqual({ zoom: 4, x: 0.5, y: 0.5 });
    expect(reframePhotoCrop(800, 1200, crop, 0)).toEqual(DEFAULT_PHOTO_CROP);
    const edge = reframePhotoCrop(800, 1200, crop, 4, { x: 0.5, y: 0.5 }, { x: 100, y: -100 });
    expect(edge.x).toBe(0);
    expect(edge.y).toBe(1);
  });
  it('centres landscape and portrait photos and keeps edge crops within the image', () => {
    expect(photoCropRect(1200, 800, DEFAULT_PHOTO_CROP)).toEqual({ x: 200, y: 0, side: 800 });
    expect(photoCropRect(800, 1200, DEFAULT_PHOTO_CROP)).toEqual({ x: 0, y: 200, side: 800 });
    expect(photoCropRect(1200, 800, { zoom: 2, x: 1, y: 0 })).toEqual({ x: 800, y: 0, side: 400 });
    expect(photoCropRect(800, 1200, { zoom: 4, x: 0, y: 1 })).toEqual({ x: 0, y: 1000, side: 200 });
    expect(photoCropRect(800, 800, { zoom: 0, x: -2, y: 2 })).toEqual({ x: 0, y: 0, side: 800 });
  });

  it('exports exactly the selected square with an opaque background and a 1024px cap', async () => {
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback,
    ) {
      expect(this.width).toBe(1024);
      expect(this.height).toBe(1024);
      callback(new Blob(['jpeg'], { type: 'image/jpeg' }));
    });
    const image = { naturalWidth: 4000, naturalHeight: 3000 } as HTMLImageElement;
    const result = await cropProfilePhoto(image, { zoom: 2, x: 0.25, y: 1 });
    expect(context.drawImage).toHaveBeenCalledWith(image, 625, 1500, 1500, 1500, 0, 0, 1024, 1024);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1024, 1024);
    expect(encode).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9);
    expect(result.type).toBe('image/jpeg');
  });

  it('reports export failures instead of returning an un-cropped photo', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    await expect(
      cropProfilePhoto(
        { naturalWidth: 800, naturalHeight: 800 } as HTMLImageElement,
        DEFAULT_PHOTO_CROP,
      ),
    ).rejects.toThrow('Photo editing is unavailable');
  });
});
