/** Exercise management's screens, pushed on Training's stack. */
export const exerciseRoutes = {
  edit: (id: string) => ({ pathname: '/training/exercise-edit/[id]', params: { id } }) as const,
  /** Starts with the custom exercise to merge, and a destination, when they are known. */
  merge: (source?: string, target?: string) =>
    ({
      pathname: '/training/exercise-merge',
      params: { ...(source && { source }), ...(target && { target }) },
    }) as const,
  machineWeights: (id: string) =>
    ({ pathname: '/training/machine-weights/[id]', params: { id } }) as const,
};
