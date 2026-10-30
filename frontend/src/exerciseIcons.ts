import abCrunchMachineIcon from './assets/exercise-icons/ab-crunch-machine.webp';
import backExtensionIcon from './assets/exercise-icons/back-extension.webp';
import backSquatIcon from './assets/exercise-icons/back-squat.webp';
import benchPressIcon from './assets/exercise-icons/bench-press.webp';
import bicepsCurlIcon from './assets/exercise-icons/biceps-curl.webp';
import bulgarianSplitSquatIcon from './assets/exercise-icons/bulgarian-split-squat.webp';
import calfRaiseIcon from './assets/exercise-icons/calf-raise.webp';
import chestFlyIcon from './assets/exercise-icons/chest-fly.webp';
import coreIcon from './assets/exercise-icons/core.webp';
import cyclingIcon from './assets/exercise-icons/cycling.webp';
import deadliftIcon from './assets/exercise-icons/deadlift.webp';
import dipsIcon from './assets/exercise-icons/dips.webp';
import facePullIcon from './assets/exercise-icons/face-pull.webp';
import hackSquatIcon from './assets/exercise-icons/hack-squat.webp';
import hamstringCurlIcon from './assets/exercise-icons/hamstring-curl.webp';
import hangingLegRaiseIcon from './assets/exercise-icons/hanging-leg-raise.webp';
import hipThrustIcon from './assets/exercise-icons/hip-thrust.webp';
import inclineWalkIcon from './assets/exercise-icons/incline-walk.webp';
import latPulldownIcon from './assets/exercise-icons/lat-pulldown.webp';
import lateralRaiseIcon from './assets/exercise-icons/lateral-raise.webp';
import legExtensionIcon from './assets/exercise-icons/leg-extension.webp';
import legPressIcon from './assets/exercise-icons/leg-press.webp';
import overheadPressIcon from './assets/exercise-icons/overhead-press.webp';
import pecDeckIcon from './assets/exercise-icons/pec-deck.webp';
import preacherCurlIcon from './assets/exercise-icons/preacher-curl.webp';
import pullUpIcon from './assets/exercise-icons/pull-up.webp';
import romanianDeadliftIcon from './assets/exercise-icons/romanian-deadlift.webp';
import rowingIcon from './assets/exercise-icons/rowing.webp';
import runningIcon from './assets/exercise-icons/running.webp';
import seatedRowIcon from './assets/exercise-icons/seated-row.webp';
import stairClimberIcon from './assets/exercise-icons/stair-climber.webp';
import tricepsPushdownIcon from './assets/exercise-icons/triceps-pushdown.webp';
import type { Exercise } from './types';

export type ExerciseIconKey =
  | 'ab-crunch-machine'
  | 'back-extension'
  | 'back-squat'
  | 'bench-press'
  | 'biceps-curl'
  | 'bulgarian-split-squat'
  | 'calf-raise'
  | 'chest-fly'
  | 'core'
  | 'cycling'
  | 'deadlift'
  | 'dips'
  | 'face-pull'
  | 'hack-squat'
  | 'hamstring-curl'
  | 'hanging-leg-raise'
  | 'hip-thrust'
  | 'incline-walk'
  | 'lat-pulldown'
  | 'lateral-raise'
  | 'leg-extension'
  | 'leg-press'
  | 'overhead-press'
  | 'pec-deck'
  | 'preacher-curl'
  | 'pull-up'
  | 'romanian-deadlift'
  | 'rowing'
  | 'running'
  | 'seated-row'
  | 'stair-climber'
  | 'triceps-pushdown';

type ExerciseIconExercise = Pick<
  Exercise,
  'name' | 'kind' | 'category' | 'muscle_group' | 'equipment'
>;

const iconUrls: Record<ExerciseIconKey, string> = {
  'ab-crunch-machine': abCrunchMachineIcon,
  'back-extension': backExtensionIcon,
  'back-squat': backSquatIcon,
  'bench-press': benchPressIcon,
  'biceps-curl': bicepsCurlIcon,
  'bulgarian-split-squat': bulgarianSplitSquatIcon,
  'calf-raise': calfRaiseIcon,
  'chest-fly': chestFlyIcon,
  core: coreIcon,
  cycling: cyclingIcon,
  deadlift: deadliftIcon,
  dips: dipsIcon,
  'face-pull': facePullIcon,
  'hack-squat': hackSquatIcon,
  'hamstring-curl': hamstringCurlIcon,
  'hanging-leg-raise': hangingLegRaiseIcon,
  'hip-thrust': hipThrustIcon,
  'incline-walk': inclineWalkIcon,
  'lat-pulldown': latPulldownIcon,
  'lateral-raise': lateralRaiseIcon,
  'leg-extension': legExtensionIcon,
  'leg-press': legPressIcon,
  'overhead-press': overheadPressIcon,
  'pec-deck': pecDeckIcon,
  'preacher-curl': preacherCurlIcon,
  'pull-up': pullUpIcon,
  'romanian-deadlift': romanianDeadliftIcon,
  rowing: rowingIcon,
  running: runningIcon,
  'seated-row': seatedRowIcon,
  'stair-climber': stairClimberIcon,
  'triceps-pushdown': tricepsPushdownIcon,
};

const exactIcons: Record<string, ExerciseIconKey> = {
  'back extension machine': 'back-extension',
  'back squat': 'back-squat',
  'barbell bench press': 'bench-press',
  'barbell curl': 'biceps-curl',
  'barbell row': 'seated-row',
  'bulgarian split squat': 'bulgarian-split-squat',
  'cable fly': 'chest-fly',
  'cable shoulder extensions': 'face-pull',
  cycling: 'cycling',
  'cycling (indoor)': 'cycling',
  deadlift: 'deadlift',
  dips: 'dips',
  'dumbbell shoulder press': 'overhead-press',
  'face pull': 'face-pull',
  'front squat': 'back-squat',
  'hammer curl': 'biceps-curl',
  'hanging leg raise': 'hanging-leg-raise',
  'hip thrust': 'hip-thrust',
  'incline dumbbell press': 'bench-press',
  'incline treadmill walking': 'incline-walk',
  'lat pulldown': 'lat-pulldown',
  'lateral raise': 'lateral-raise',
  'leg extension': 'leg-extension',
  'leg press': 'leg-press',
  'lying leg curl': 'hamstring-curl',
  'machine bicep preacher curl': 'preacher-curl',
  'machine chest press': 'bench-press',
  'overhead press': 'overhead-press',
  'pec deck': 'pec-deck',
  plank: 'core',
  'pull-up': 'pull-up',
  rowing: 'rowing',
  running: 'running',
  'romanian deadlift': 'romanian-deadlift',
  'seated ab crunch machine': 'ab-crunch-machine',
  'seated cable row': 'seated-row',
  'seated leg curl': 'hamstring-curl',
  'seated machine row': 'seated-row',
  'single leg press': 'leg-press',
  'single-arm cable biceps curl': 'biceps-curl',
  'single-arm cable pullover': 'lat-pulldown',
  'single-arm cable triceps pushdown': 'triceps-pushdown',
  'single-arm lat pulldown (machine)': 'lat-pulldown',
  'single-arm preacher curl': 'preacher-curl',
  'stair climber': 'stair-climber',
  'standing calf raise': 'calf-raise',
  'straight-arm cable pulldown': 'lat-pulldown',
  'triceps machine extension': 'triceps-pushdown',
  'triceps pushdown': 'triceps-pushdown',
  walking: 'incline-walk',
};

function normalized(value: string | null) {
  return (value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[‐‑–—]/g, '-')
    .replace(/\s+/g, ' ');
}

function includesAny(value: string, words: string[]) {
  return words.some((word) => value.includes(word));
}

export function exerciseIconKey(exercise: ExerciseIconExercise): ExerciseIconKey {
  const name = normalized(exercise.name);
  const exact = exactIcons[name];
  if (exact) return exact;

  if (exercise.kind === 'cardio') {
    if (includesAny(name, ['cycle', 'cycling', 'bike', 'spin'])) return 'cycling';
    if (name.includes('row')) return 'rowing';
    if (includesAny(name, ['stair', 'step'])) return 'stair-climber';
    if (name.includes('walk') || (name.includes('incline') && name.includes('treadmill'))) {
      return 'incline-walk';
    }
    return 'running';
  }

  const muscle = normalized(exercise.muscle_group);
  const equipment = normalized(exercise.equipment);
  const searchable = `${name} ${muscle} ${equipment}`;

  if (name.includes('hack squat')) return 'hack-squat';
  if (name.includes('bulgarian') || name.includes('split squat')) return 'bulgarian-split-squat';
  if (name.includes('squat')) return 'back-squat';
  if (name.includes('romanian') || /\brdl\b/.test(name)) return 'romanian-deadlift';
  if (name.includes('deadlift')) return 'deadlift';
  if (name.includes('leg press')) return 'leg-press';
  if (name.includes('leg extension')) return 'leg-extension';
  if (includesAny(name, ['leg curl', 'hamstring curl'])) return 'hamstring-curl';
  if (includesAny(name, ['hip thrust', 'glute bridge'])) return 'hip-thrust';
  if (name.includes('calf')) return 'calf-raise';
  if (name.includes('back extension')) return 'back-extension';
  if (includesAny(name, ['hanging leg raise', 'hanging knee raise'])) return 'hanging-leg-raise';
  if (name.includes('crunch')) return equipment.includes('machine') ? 'ab-crunch-machine' : 'core';
  if (includesAny(name, ['plank', 'sit-up', 'situp', 'core'])) return 'core';
  if (name.includes('pec deck')) return 'pec-deck';
  if (includesAny(name, ['reverse fly', 'rear delt fly'])) return 'face-pull';
  if (name.includes('fly')) return equipment.includes('machine') ? 'pec-deck' : 'chest-fly';
  if (name.includes('lateral raise')) return 'lateral-raise';
  if (name.includes('face pull')) return 'face-pull';
  if (includesAny(name, ['pull-up', 'pull up', 'chin-up', 'chin up'])) return 'pull-up';
  if (includesAny(name, ['pulldown', 'pull-down', 'pullover'])) return 'lat-pulldown';
  if (name.includes('row')) return 'seated-row';
  if (name.includes('dip')) return 'dips';
  if (name.includes('preacher')) return 'preacher-curl';
  if (name.includes('curl')) return muscle.includes('hamstring') ? 'hamstring-curl' : 'biceps-curl';
  if (name.includes('tricep')) return 'triceps-pushdown';
  if (name.includes('raise') && muscle.includes('shoulder')) return 'lateral-raise';
  if (name.includes('press')) {
    if (searchable.includes('leg')) return 'leg-press';
    if (includesAny(searchable, ['shoulder', 'overhead', 'military'])) return 'overhead-press';
    return 'bench-press';
  }

  if (muscle.includes('calf')) return 'calf-raise';
  if (muscle.includes('hamstring')) return 'romanian-deadlift';
  if (muscle.includes('glute')) return 'hip-thrust';
  if (muscle.includes('quad')) return 'back-squat';
  if (includesAny(muscle, ['core', 'abdominal'])) return 'core';
  if (muscle.includes('bicep')) return 'biceps-curl';
  if (muscle.includes('tricep')) return 'triceps-pushdown';
  if (muscle.includes('rear delt')) return 'face-pull';
  if (muscle.includes('shoulder')) return 'lateral-raise';
  if (muscle.includes('lat')) return 'lat-pulldown';
  if (muscle.includes('back')) return 'seated-row';
  if (includesAny(muscle, ['chest', 'pectoral'])) return 'bench-press';
  if (exercise.category === 'lower') return 'back-squat';
  if (exercise.category === 'pull') return 'seated-row';
  if (exercise.category === 'push' || exercise.category === 'upper') return 'bench-press';
  return 'core';
}

export function exerciseIconFor(exercise: ExerciseIconExercise) {
  return iconUrls[exerciseIconKey(exercise)];
}
