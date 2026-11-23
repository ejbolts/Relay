import { pushedScreenOptions } from '../../ui/navigation';
import type { Palette } from '../../ui/theme';

/** The native header Social's pushed screens show over the tabs, matching the shared chrome. */
export function socialHeader(colors: Palette, title: string) {
  return pushedScreenOptions(colors, title);
}
