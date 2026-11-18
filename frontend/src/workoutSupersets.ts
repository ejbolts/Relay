export type SupersetMovement = {
  key: string;
  supersetKey: string | null;
};

export function applySupersetSelection<T extends SupersetMovement>(
  movements: T[],
  anchorKey: string,
  partnerKeys: Iterable<string>,
  newGroupKey: string,
): T[] {
  const anchor = movements.find((movement) => movement.key === anchorKey);
  if (!anchor) return movements;

  const availableKeys = new Set(movements.map((movement) => movement.key));
  const selectedKeys = new Set(
    [...partnerKeys].filter((key) => key !== anchorKey && availableKeys.has(key)),
  );
  if (selectedKeys.size === 0) return movements;

  const previousGroupKey = anchor.supersetKey;
  const groupKey = previousGroupKey ?? newGroupKey;

  return movements.map((movement) => {
    let supersetKey = movement.supersetKey;
    if (movement.key === anchorKey || selectedKeys.has(movement.key)) {
      supersetKey = groupKey;
    } else if (previousGroupKey && movement.supersetKey === previousGroupKey) {
      supersetKey = null;
    }

    return supersetKey === movement.supersetKey ? movement : { ...movement, supersetKey };
  });
}

export function clearSuperset<T extends SupersetMovement>(movements: T[], anchorKey: string): T[] {
  const groupKey = movements.find((movement) => movement.key === anchorKey)?.supersetKey;
  if (!groupKey) return movements;

  return movements.map((movement) =>
    movement.supersetKey === groupKey ? { ...movement, supersetKey: null } : movement,
  );
}

/** What a group of this many exercises is called: two is a superset, three a tri-set. */
export function supersetGroupName(size: number): 'Superset' | 'Tri-set' | 'Giant set' {
  if (size >= 4) return 'Giant set';
  return size === 3 ? 'Tri-set' : 'Superset';
}

/** Moves a group's exercises next to its first one, keeping their order, so a round reads top to bottom. */
export function keepSupersetTogether<T extends SupersetMovement>(
  movements: T[],
  groupKey: string,
): T[] {
  const first = movements.findIndex((movement) => movement.supersetKey === groupKey);
  if (first < 0) return movements;
  const members = movements.filter((movement) => movement.supersetKey === groupKey);
  const others = movements.filter((movement) => movement.supersetKey !== groupKey);
  const ordered = [...others.slice(0, first), ...members, ...others.slice(first)];
  return ordered.every((movement, index) => movement === movements[index]) ? movements : ordered;
}

type RoundMovement = SupersetMovement & { sets: ReadonlyArray<{ completed: boolean }> };

const loggedSets = (movement: RoundMovement) => movement.sets.filter((set) => set.completed).length;

/**
 * Grouped exercises still owed a set in the round in progress, in workout order.
 * A round is in progress once any exercise has logged more sets than another that still has one to do.
 */
export function supersetRoundPending<T extends RoundMovement>(
  movements: T[],
  groupKey: string,
): T[] {
  const group = movements.filter((movement) => movement.supersetKey === groupKey);
  if (group.length < 2) return [];
  const round = Math.max(...group.map(loggedSets));
  return group.filter((movement) => loggedSets(movement) < round && movement.sets.length >= round);
}

/** The exercise to do next in this one's group round, or null once the round is done. */
export function nextInSupersetRound<T extends RoundMovement>(
  movements: T[],
  movementKey: string,
): T | null {
  const groupKey = movements.find((item) => item.key === movementKey)?.supersetKey;
  return groupKey ? (supersetRoundPending(movements, groupKey)[0] ?? null) : null;
}
