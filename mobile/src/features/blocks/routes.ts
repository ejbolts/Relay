/** Training blocks' screens: a stack pushed over the tabs, from Training or Home. */
export const blockRoutes = {
  overview: '/blocks',
  /** A new block, or editing a saved one. */
  edit: (id?: string) => ({ pathname: '/blocks/edit', params: id ? { id } : {} }) as const,
  summary: (id: string) => ({ pathname: '/blocks/summary/[id]', params: { id } }) as const,
};
