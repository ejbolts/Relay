import { describe, expect, it } from 'vitest';
import {
  captionAfterCoverChange,
  machinePhotoCount,
  mergedAwayIds,
  mergedPhotoCount,
  movementAfterMachineMerge,
  pinnedAfterMerge,
} from './machinePhotoMerge';

const image = {
  id: 'i',
  exercise_id: 'e',
  caption: '',
  created_at: '',
  thumbnail_url: '',
  full_url: '',
  width: 1,
  height: 1,
};

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

describe("a live exercise's machines after a merge", () => {
  const movement = {
    machinePhotoIds: ['a', 'b', 'c'],
    sets: [
      { machine_photo_id: 'a', completed: true },
      { machine_photo_id: 'old-a-photo', completed: true },
      { machine_photo_id: 'c', completed: true },
      { machine_photo_id: null, completed: false },
    ],
  };

  it('moves pins and logged sets on merged-away machines to the merged one', () => {
    const away = mergedAwayIds(
      [{ id: 'a', images: [{ ...image, id: 'old-a-photo' }] }, { id: 'b' }, { id: 'c' }],
      ['a', 'b'],
    );
    expect(away).toEqual(['a', 'old-a-photo', 'b']);
    const next = movementAfterMachineMerge(movement, 'b', away);
    expect(next.machinePhotoIds).toEqual(['b', 'c']);
    expect(next.sets.map((set) => set.machine_photo_id)).toEqual(['b', 'b', 'c', null]);
  });

  it('leaves an exercise that used none of them alone', () => {
    expect(movementAfterMachineMerge(movement, 'x', ['y'])).toBe(movement);
  });
});
