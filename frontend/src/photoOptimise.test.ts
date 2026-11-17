import { describe, expect, it } from 'vitest';
import { PHOTO_MAX_DIMENSION, jpegFileName, needsOptimising, scaledSize } from './photoOptimise';

describe('photo optimising', () => {
  it('shrinks a phone photo to the size the server keeps, keeping its shape', () => {
    expect(scaledSize(4032, 3024)).toEqual({ width: 1800, height: 1350 });
    expect(scaledSize(3024, 4032)).toEqual({ width: 1350, height: 1800 });
    expect(scaledSize(8064, 6048).width).toBe(PHOTO_MAX_DIMENSION);
  });

  it('never enlarges a small photo', () => {
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('leaves photos that are already small alone', () => {
    expect(needsOptimising(400 * 1024, 1200, 900)).toBe(false);
    expect(needsOptimising(400 * 1024, 4032, 3024)).toBe(true);
    expect(needsOptimising(6 * 1024 * 1024, 1600, 1200)).toBe(true);
    expect(needsOptimising(400 * 1024, 1200, 900, 1024)).toBe(true);
  });

  it('names the re-encoded photo as a JPEG', () => {
    expect(jpegFileName('IMG_0412.HEIC')).toBe('IMG_0412.jpg');
    expect(jpegFileName('leg press.png')).toBe('leg press.jpg');
    expect(jpegFileName('.heic')).toBe('machine-photo.jpg');
  });
});
