import { describe, expect, it } from 'vitest';

const assets = import.meta.glob<string>('./assets/exercise-icons/*', {
  eager: true,
  import: 'default',
  query: '?inline',
});

describe('exercise icon assets', () => {
  it('ships lightweight WebP thumbnails rather than original artwork', () => {
    expect(Object.keys(assets).length).toBeGreaterThan(0);
    for (const [file, dataUrl] of Object.entries(assets)) {
      expect(file, 'Only compressed WebP icons belong in the shipped icon directory').toMatch(
        /\.webp$/,
      );
      expect(dataUrl, file).toMatch(/^data:image\/webp;base64,/);
      const bytes = atob(dataUrl.split(',')[1]);
      expect(bytes.slice(0, 4), file).toBe('RIFF');
      expect(bytes.slice(8, 12), file).toBe('WEBP');
      // Current icons average about 6 KB. Leave encoding headroom without
      // allowing a full-size generated image into this frequently used set.
      expect(bytes.length, `${file} exceeds the 12 KiB thumbnail budget`).toBeLessThanOrEqual(
        12 * 1024,
      );
    }
  });
});
