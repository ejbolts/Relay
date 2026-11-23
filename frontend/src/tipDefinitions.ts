/** Where a tip's button takes you. The app decides how to open each one. */
export type TipTarget =
  | 'machine-weights'
  | 'weight-goal'
  | 'training-blocks'
  | 'home-edit'
  | 'profile'
  | 'split'
  | 'appearance';

export const TIP_DEFINITIONS = {
  normalise: {
    title: 'Different machines, one progress chart',
    homeBody: 'Compare different machines on one chart with Machine weights.',
    body: 'Open Machine weights to normalise different stacks against a reference machine. Your logged weights stay unchanged.',
    surface: 'hint',
    action: { label: 'Open Machine weights', target: 'machine-weights' },
    reminds: true,
  },
  mergeMachines: {
    title: 'Saved the same machine twice?',
    homeBody: 'Choose Merge to combine duplicate machines and keep their history.',
    body: 'Choose Merge to combine duplicate machines, keeping their photos and workout links together.',
    surface: 'hint',
  },
  maintenance: {
    title: 'Maintain a range, not a single number',
    homeBody: 'Choose Maintain in your weight goal to set a lower and upper range.',
    body: 'Choose Maintain in your weight goal to set lower and upper limits. Your trend chart shows the band.',
    surface: 'home',
    action: { label: 'Set a goal', target: 'weight-goal' },
  },
  setType: {
    title: 'Warm-up or working set?',
    body: 'Tap W beside a set to make it a working set. Warm-ups don’t count toward volume.',
    surface: 'nudge',
    // Shown on the first logged warm-up, even on new accounts and inside the daily cooldown.
    priority: true,
  },
  reorder: {
    title: 'Put sets in order',
    body: 'Hold a set’s dotted handle, then drag it into place.',
    surface: 'nudge',
  },
  swipe: {
    title: 'One less tap',
    body: 'Swipe a set left to delete it. Undo is there if you need it.',
    surface: 'nudge',
  },
  plates: {
    title: 'Let Relay count the plates',
    body: 'Tap the plates beside the exercise to see what goes on each side.',
    surface: 'hint',
  },
  swap: {
    title: 'Machine taken?',
    homeBody: 'Swap exercise in the menu keeps your planned sets when a machine is taken.',
    body: 'Choose Swap exercise in the exercise menu to keep your planned sets.',
    surface: 'nudge',
  },
  machine: {
    title: 'Remember your machine',
    homeBody: 'Save an equipment photo with your seat and pin settings for next time.',
    body: 'Save an equipment photo with its seat and pin settings for next time.',
    surface: 'hint',
  },
  cardio: {
    title: 'Skip the typing',
    body: 'Upload or paste a cardio screenshot to fill in your set.',
    surface: 'nudge',
  },
  blocks: {
    title: 'Give your next phase a fresh start',
    body: 'Training blocks track new progress while keeping your full history.',
    surface: 'home',
    action: { label: 'Start a block', target: 'training-blocks' },
    reminds: true,
  },
  home: {
    title: 'Make Home your own',
    body: 'Tap the pencil to move, resize or hide your Home cards.',
    surface: 'home',
    action: { label: 'Edit Home', target: 'home-edit' },
  },
  friends: {
    title: 'Train alongside a friend',
    body: 'Share the QR code on your Profile to connect in person.',
    surface: 'home',
    action: { label: 'Open Profile', target: 'profile' },
  },
  back: {
    title: 'A quicker way back',
    body: 'Swipe right from the left edge to go back a screen.',
    surface: 'nudge',
  },
  split: {
    title: 'Have a regular rotation?',
    body: 'Save your split so Up next follows your training days.',
    surface: 'home',
    action: { label: 'Set up a split', target: 'split' },
    reminds: true,
  },
  repRange: {
    title: 'Know when to add weight',
    body: 'Give a planned exercise a rep range and Relay says when to stay and when to go up.',
    surface: 'home',
    action: { label: 'Open your split', target: 'split' },
    reminds: true,
  },
  appearance: {
    title: 'Make Relay look your way',
    body: 'Pick a colour theme, light or dark mode and a glass level in Settings › Appearance.',
    surface: 'home',
    action: { label: 'Open Appearance', target: 'appearance' },
  },
} as const;
export type TipId = keyof typeof TIP_DEFINITIONS;
