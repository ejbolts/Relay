import { describe, expect, it } from 'vitest';
import {
  captionAfterCoverChange,
  machinePhotoCount,
  mergedPhotoCount,
  pinnedAfterMerge,
} from './machinePhotoMerge';

const image = { id: 'i', thumbnail_url: '', full_url: '', width: 1, height: 1 };

describe('merging saved machines', () => {
  it('counts each machine as at least one photo', () => {
    expect(machinePhotoCount({})).toBe(1);
    expect(machinePhotoCount({ images: [] })).toBe(1);
    expect(mergedPhotoCount([{}, { images: [image, image] } as never])).toBe(3);
  });

  it("follows the cover's name until a name of one's own is typed", () => {
    expect(captionAfterCoverChange('', undefined, { caption: 'Cybex' })).toBe('Cybex');
    expect(captionAfterCoverChange('Cybex ', { caption: 'Cybex' }, { caption: 'Hammer' })).toBe(
      'Hammer',
    );
    expect(
      captionAfterCoverChange('Chest press', { caption: 'Cybex' }, { caption: 'Hammer' }),
    ).toBe('Chest press');
  });

  it('repoints pins at the merged machine without repeating it', () => {
    expect(pinnedAfterMerge(['a', 'x', 'b'], 'a', ['a', 'b'])).toEqual(['a', 'x']);
    expect(pinnedAfterMerge(['x'], 'a', ['a', 'b'])).toEqual(['x']);
  });
});
