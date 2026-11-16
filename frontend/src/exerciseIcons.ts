import abCrunchMachineIcon from './assets/exercise-icons/ab-crunch-machine.webp';
import backExtensionIcon from './assets/exercise-icons/back-extension.webp';
import backSquatIcon from './assets/exercise-icons/back-squat.webp';
import barbellRowIcon from './assets/exercise-icons/barbell-row.webp';
import benchPressIcon from './assets/exercise-icons/bench-press.webp';
import bicepsCurlIcon from './assets/exercise-icons/biceps-curl.webp';
import bulgarianSplitSquatIcon from './assets/exercise-icons/bulgarian-split-squat.webp';
import calfRaiseIcon from './assets/exercise-icons/calf-raise.webp';
import cableCrunchIcon from './assets/exercise-icons/cable-crunch.webp';
import cableGluteKickbackIcon from './assets/exercise-icons/cable-glute-kickback.webp';
import cableLateralRaiseIcon from './assets/exercise-icons/cable-lateral-raise.webp';
import chestFlyIcon from './assets/exercise-icons/chest-fly.webp';
import coreIcon from './assets/exercise-icons/core.webp';
import cyclingIcon from './assets/exercise-icons/cycling.webp';
import deadliftIcon from './assets/exercise-icons/deadlift.webp';
import dipsIcon from './assets/exercise-icons/dips.webp';
import dumbbellBenchPressIcon from './assets/exercise-icons/dumbbell-bench-press.webp';
import dumbbellReverseFlyIcon from './assets/exercise-icons/dumbbell-reverse-fly.webp';
import dumbbellRowIcon from './assets/exercise-icons/dumbbell-row.webp';
import dumbbellShoulderPressIcon from './assets/exercise-icons/dumbbell-shoulder-press.webp';
import facePullIcon from './assets/exercise-icons/face-pull.webp';
import hackSquatIcon from './assets/exercise-icons/hack-squat.webp';
import hamstringCurlIcon from './assets/exercise-icons/hamstring-curl.webp';
import hangingLegRaiseIcon from './assets/exercise-icons/hanging-leg-raise.webp';
import hipThrustIcon from './assets/exercise-icons/hip-thrust.webp';
import hipAbductionMachineIcon from './assets/exercise-icons/hip-abduction-machine.webp';
import inclineWalkIcon from './assets/exercise-icons/incline-walk.webp';
import inclineDumbbellPressIcon from './assets/exercise-icons/incline-dumbbell-press.webp';
import latPulldownIcon from './assets/exercise-icons/lat-pulldown.webp';
import lateralRaiseIcon from './assets/exercise-icons/lateral-raise.webp';
import legExtensionIcon from './assets/exercise-icons/leg-extension.webp';
import legPressIcon from './assets/exercise-icons/leg-press.webp';
import machineChestPressIcon from './assets/exercise-icons/machine-chest-press.webp';
import machineHipThrustIcon from './assets/exercise-icons/machine-hip-thrust.webp';
import machineLateralRaiseIcon from './assets/exercise-icons/machine-lateral-raise.webp';
import machineLatPulldownIcon from './assets/exercise-icons/machine-lat-pulldown.webp';
import machineRowIcon from './assets/exercise-icons/machine-row.webp';
import machineShoulderPressIcon from './assets/exercise-icons/machine-shoulder-press.webp';
import overheadPressIcon from './assets/exercise-icons/overhead-press.webp';
import overheadCableTricepsExtensionIcon from './assets/exercise-icons/overhead-cable-triceps-extension.webp';
import pecDeckIcon from './assets/exercise-icons/pec-deck.webp';
import preacherCurlIcon from './assets/exercise-icons/preacher-curl.webp';
import pullUpIcon from './assets/exercise-icons/pull-up.webp';
import pushUpIcon from './assets/exercise-icons/push-up.webp';
import romanianDeadliftIcon from './assets/exercise-icons/romanian-deadlift.webp';
import reversePecDeckIcon from './assets/exercise-icons/reverse-pec-deck.webp';
import rowingIcon from './assets/exercise-icons/rowing.webp';
import runningIcon from './assets/exercise-icons/running.webp';
import seatedRowIcon from './assets/exercise-icons/seated-row.webp';
import seatedCalfRaiseIcon from './assets/exercise-icons/seated-calf-raise.webp';
import seatedLegCurlIcon from './assets/exercise-icons/seated-leg-curl.webp';
import singleArmCableBicepsCurlIcon from './assets/exercise-icons/single-arm-cable-biceps-curl.webp';
import singleArmCableLatPulldownIcon from './assets/exercise-icons/single-arm-cable-lat-pulldown.webp';
import singleArmCableTricepsPushdownIcon from './assets/exercise-icons/single-arm-cable-triceps-pushdown.webp';
import singleArmMachineLatPulldownIcon from './assets/exercise-icons/single-arm-machine-lat-pulldown.webp';
import smithBenchPressIcon from './assets/exercise-icons/smith-bench-press.webp';
import smithShoulderPressIcon from './assets/exercise-icons/smith-shoulder-press.webp';
import smithSquatIcon from './assets/exercise-icons/smith-squat.webp';
import stairClimberIcon from './assets/exercise-icons/stair-climber.webp';
import straightArmCablePulldownIcon from './assets/exercise-icons/straight-arm-cable-pulldown.webp';
import tricepsPushdownIcon from './assets/exercise-icons/triceps-pushdown.webp';
import tricepsExtensionMachineIcon from './assets/exercise-icons/triceps-extension-machine.webp';
import type { Exercise } from './types';

export type ExerciseIconKey =
  | 'ab-crunch-machine'
  | 'back-extension'
  | 'back-squat'
  | 'barbell-row'
  | 'bench-press'
  | 'biceps-curl'
  | 'bulgarian-split-squat'
  | 'calf-raise'
  | 'cable-crunch'
  | 'cable-glute-kickback'
  | 'cable-lateral-raise'
  | 'chest-fly'
  | 'core'
  | 'cycling'
  | 'deadlift'
  | 'dips'
  | 'dumbbell-bench-press'
  | 'dumbbell-reverse-fly'
  | 'dumbbell-row'
  | 'dumbbell-shoulder-press'
  | 'face-pull'
  | 'hack-squat'
  | 'hamstring-curl'
  | 'hanging-leg-raise'
  | 'hip-thrust'
  | 'hip-abduction-machine'
  | 'incline-walk'
  | 'incline-dumbbell-press'
  | 'lat-pulldown'
  | 'lateral-raise'
  | 'leg-extension'
  | 'leg-press'
  | 'machine-chest-press'
  | 'machine-hip-thrust'
  | 'machine-lateral-raise'
  | 'machine-lat-pulldown'
  | 'machine-row'
  | 'machine-shoulder-press'
  | 'overhead-press'
  | 'overhead-cable-triceps-extension'
  | 'pec-deck'
  | 'preacher-curl'
  | 'pull-up'
  | 'push-up'
  | 'romanian-deadlift'
  | 'reverse-pec-deck'
  | 'rowing'
  | 'running'
  | 'seated-row'
  | 'seated-calf-raise'
  | 'seated-leg-curl'
  | 'single-arm-cable-biceps-curl'
  | 'single-arm-cable-lat-pulldown'
  | 'single-arm-cable-triceps-pushdown'
  | 'single-arm-machine-lat-pulldown'
  | 'smith-bench-press'
  | 'smith-shoulder-press'
  | 'smith-squat'
  | 'stair-climber'
  | 'straight-arm-cable-pulldown'
  | 'triceps-pushdown'
  | 'triceps-extension-machine';

type ExerciseIconExercise = Pick<
  Exercise,
  'name' | 'kind' | 'category' | 'muscle_group' | 'equipment'
>;

const iconUrls: Record<ExerciseIconKey, string> = {
  'ab-crunch-machine': abCrunchMachineIcon,
  'back-extension': backExtensionIcon,
  'back-squat': backSquatIcon,
  'barbell-row': barbellRowIcon,
  'bench-press': benchPressIcon,
  'biceps-curl': bicepsCurlIcon,
  'bulgarian-split-squat': bulgarianSplitSquatIcon,
  'calf-raise': calfRaiseIcon,
  'cable-crunch': cableCrunchIcon,
  'cable-glute-kickback': cableGluteKickbackIcon,
  'cable-lateral-raise': cableLateralRaiseIcon,
  'chest-fly': chestFlyIcon,
  core: coreIcon,
  cycling: cyclingIcon,
  deadlift: deadliftIcon,
  dips: dipsIcon,
  'dumbbell-bench-press': dumbbellBenchPressIcon,
  'dumbbell-reverse-fly': dumbbellReverseFlyIcon,
  'dumbbell-row': dumbbellRowIcon,
  'dumbbell-shoulder-press': dumbbellShoulderPressIcon,
  'face-pull': facePullIcon,
  'hack-squat': hackSquatIcon,
  'hamstring-curl': hamstringCurlIcon,
  'hanging-leg-raise': hangingLegRaiseIcon,
  'hip-thrust': hipThrustIcon,
  'hip-abduction-machine': hipAbductionMachineIcon,
  'incline-walk': inclineWalkIcon,
  'incline-dumbbell-press': inclineDumbbellPressIcon,
  'lat-pulldown': latPulldownIcon,
  'lateral-raise': lateralRaiseIcon,
  'leg-extension': legExtensionIcon,
  'leg-press': legPressIcon,
  'machine-chest-press': machineChestPressIcon,
  'machine-hip-thrust': machineHipThrustIcon,
  'machine-lateral-raise': machineLateralRaiseIcon,
  'machine-lat-pulldown': machineLatPulldownIcon,
  'machine-row': machineRowIcon,
  'machine-shoulder-press': machineShoulderPressIcon,
  'overhead-press': overheadPressIcon,
  'overhead-cable-triceps-extension': overheadCableTricepsExtensionIcon,
  'pec-deck': pecDeckIcon,
  'preacher-curl': preacherCurlIcon,
  'pull-up': pullUpIcon,
  'push-up': pushUpIcon,
  'romanian-deadlift': romanianDeadliftIcon,
  'reverse-pec-deck': reversePecDeckIcon,
  rowing: rowingIcon,
  running: runningIcon,
  'seated-row': seatedRowIcon,
  'seated-calf-raise': seatedCalfRaiseIcon,
  'seated-leg-curl': seatedLegCurlIcon,
  'single-arm-cable-biceps-curl': singleArmCableBicepsCurlIcon,
  'single-arm-cable-lat-pulldown': singleArmCableLatPulldownIcon,
  'single-arm-cable-triceps-pushdown': singleArmCableTricepsPushdownIcon,
  'single-arm-machine-lat-pulldown': singleArmMachineLatPulldownIcon,
  'smith-bench-press': smithBenchPressIcon,
  'smith-shoulder-press': smithShoulderPressIcon,
  'smith-squat': smithSquatIcon,
  'stair-climber': stairClimberIcon,
  'straight-arm-cable-pulldown': straightArmCablePulldownIcon,
  'triceps-pushdown': tricepsPushdownIcon,
  'triceps-extension-machine': tricepsExtensionMachineIcon,
};

const exactIcons: Record<string, ExerciseIconKey> = {
  'back extension machine': 'back-extension',
  'back squat': 'back-squat',
  'barbell bench press': 'bench-press',
  'barbell curl': 'biceps-curl',
  'barbell row': 'barbell-row',
  'bulgarian split squat': 'bulgarian-split-squat',
  'cable fly': 'chest-fly',
  'cable crunch': 'cable-crunch',
  'cable glute kickback': 'cable-glute-kickback',
  'cable lateral raise': 'cable-lateral-raise',
  'cable shoulder extensions': 'face-pull',
  cycling: 'cycling',
  'cycling (indoor)': 'cycling',
  deadlift: 'deadlift',
  dips: 'dips',
  'dumbbell bench press': 'dumbbell-bench-press',
  'dumbbell reverse fly': 'dumbbell-reverse-fly',
  'dumbbell row': 'dumbbell-row',
  'dumbbell shoulder press': 'dumbbell-shoulder-press',
  'face pull': 'face-pull',
  'front squat': 'back-squat',
  'hammer curl': 'biceps-curl',
  'hanging leg raise': 'hanging-leg-raise',
  'hip thrust': 'hip-thrust',
  'incline dumbbell press': 'incline-dumbbell-press',
  'incline treadmill walking': 'incline-walk',
  'lat pulldown': 'lat-pulldown',
  'lateral raise': 'lateral-raise',
  'leg extension': 'leg-extension',
  'leg press': 'leg-press',
  'lying leg curl': 'hamstring-curl',
  'machine bicep preacher curl': 'preacher-curl',
  'machine chest press': 'machine-chest-press',
  'machine shoulder press': 'machine-shoulder-press',
  'machine lateral raise': 'machine-lateral-raise',
  'machine lat pulldown': 'machine-lat-pulldown',
  'machine hip thrust': 'machine-hip-thrust',
  'hip abduction machine': 'hip-abduction-machine',
  'overhead press': 'overhead-press',
  'overhead cable triceps extension': 'overhead-cable-triceps-extension',
  'pec deck': 'pec-deck',
  'reverse pec deck': 'reverse-pec-deck',
  plank: 'core',
  'pull-up': 'pull-up',
  'push-up': 'push-up',
  rowing: 'rowing',
  running: 'running',
  'romanian deadlift': 'romanian-deadlift',
  'seated ab crunch machine': 'ab-crunch-machine',
  'seated cable row': 'seated-row',
  'seated leg curl': 'seated-leg-curl',
  'seated machine row': 'machine-row',
  'seated calf raise': 'seated-calf-raise',
  'single leg press': 'leg-press',
  'single-arm cable biceps curl': 'single-arm-cable-biceps-curl',
  'single-arm cable lat pulldown': 'single-arm-cable-lat-pulldown',
  'single-arm cable pullover': 'lat-pulldown',
  'single-arm cable triceps pushdown': 'single-arm-cable-triceps-pushdown',
  'single-arm lat pulldown (machine)': 'single-arm-machine-lat-pulldown',
  'single-arm preacher curl': 'preacher-curl',
  'smith machine bench press': 'smith-bench-press',
  'smith machine shoulder press': 'smith-shoulder-press',
  'smith machine squat': 'smith-squat',
  'stair climber': 'stair-climber',
  'standing calf raise': 'calf-raise',
  'straight-arm cable pulldown': 'straight-arm-cable-pulldown',
  'triceps machine extension': 'triceps-extension-machine',
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
  const equipment = normalized(exercise.equipment);
  const gear = `${name} ${equipment}`;
  const singleArm = /\b(single[- ]arm|one[- ]arm|unilateral)\b/.test(name);

  if (exercise.kind !== 'cardio') {
    if (gear.includes('smith')) {
      if (name.includes('squat')) return 'smith-squat';
      if (name.includes('press')) {
        if (includesAny(name, ['shoulder', 'overhead', 'military'])) return 'smith-shoulder-press';
        if (includesAny(name, ['bench', 'chest'])) return 'smith-bench-press';
      }
    }
    if (gear.includes('cable')) {
      if (singleArm) {
        if (includesAny(name, ['lat pulldown', 'lat pull-down', 'lat pull down']))
          return 'single-arm-cable-lat-pulldown';
        if (name.includes('tricep') && includesAny(name, ['pushdown', 'push-down'])) {
          return 'single-arm-cable-triceps-pushdown';
        }
        if (
          name.includes('curl') &&
          !includesAny(name, ['leg', 'hamstring', 'preacher', 'hammer'])
        ) {
          return 'single-arm-cable-biceps-curl';
        }
      }
      if (name.includes('glute') && name.includes('kickback')) return 'cable-glute-kickback';
      if (name.includes('crunch')) return 'cable-crunch';
      if (name.includes('lateral raise')) return 'cable-lateral-raise';
      if (includesAny(name, ['pulldown', 'pull-down']) && /\bstraight[- ]arms?\b/.test(name)) {
        return 'straight-arm-cable-pulldown';
      }
      if (name.includes('overhead') && name.includes('tricep') && name.includes('extension')) {
        return 'overhead-cable-triceps-extension';
      }
    }
    if (gear.includes('dumbbell')) {
      if (includesAny(name, ['reverse fly', 'rear delt fly'])) return 'dumbbell-reverse-fly';
      if (/\brows?\b/.test(name) && !includesAny(name, ['supported', 'upright', 'seated'])) {
        return 'dumbbell-row';
      }
      if (name.includes('press')) {
        if (includesAny(name, ['shoulder', 'overhead', 'military']))
          return 'dumbbell-shoulder-press';
        if (includesAny(name, ['bench', 'chest', 'incline'])) {
          return name.includes('incline') ? 'incline-dumbbell-press' : 'dumbbell-bench-press';
        }
      }
    }
    if (/\bpush[- ]?ups?\b/.test(name)) return 'push-up';
    if (
      gear.includes('barbell') &&
      /\brows?\b/.test(name) &&
      !includesAny(name, ['upright', 'seated', 'supported'])
    ) {
      return 'barbell-row';
    }
  }

  // Respect explicit equipment in the movement name. A cable station or Smith
  // machine must not turn into one of the seated lever-machine illustrations.
  const machine =
    includesAny(`${name} ${equipment}`, ['machine', 'plate-loaded', 'selectorized']) &&
    !includesAny(`${name} ${equipment}`, [
      'cable',
      'smith',
      'barbell',
      'dumbbell',
      'kettlebell',
      'band',
      'bodyweight',
    ]);
  if (exercise.kind !== 'cardio' && machine) {
    if (includesAny(name, ['lat pulldown', 'lat pull-down', 'lat pull down'])) {
      return singleArm ? 'single-arm-machine-lat-pulldown' : 'machine-lat-pulldown';
    }
    if (name.includes('hip abduction')) return 'hip-abduction-machine';
    if (name.includes('hip thrust')) return 'machine-hip-thrust';
    if (name.includes('seated') && name.includes('calf')) return 'seated-calf-raise';
    if (name.includes('seated') && includesAny(name, ['leg curl', 'hamstring curl'])) {
      return 'seated-leg-curl';
    }
    if (includesAny(name, ['reverse pec', 'reverse fly', 'rear delt fly']))
      return 'reverse-pec-deck';
    if (name.includes('lateral raise')) return 'machine-lateral-raise';
    if (/\brows?\b/.test(name)) return 'machine-row';
    if (name.includes('tricep') && name.includes('extension')) return 'triceps-extension-machine';
    if (name.includes('press')) {
      if (includesAny(name, ['shoulder', 'overhead', 'military'])) return 'machine-shoulder-press';
      if (includesAny(name, ['chest', 'bench'])) return 'machine-chest-press';
    }
  }
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
  const searchable = `${name} ${muscle} ${equipment}`;

  if (name.includes('hack squat')) return 'hack-squat';
  if (name.includes('bulgarian') || name.includes('split squat')) return 'bulgarian-split-squat';
  if (name.includes('squat')) return 'back-squat';
  if (name.includes('romanian') || /\brdl\b/.test(name)) return 'romanian-deadlift';
  if (name.includes('deadlift')) return 'deadlift';
  if (name.includes('leg press')) return 'leg-press';
  if (name.includes('leg extension')) return 'leg-extension';
  if (includesAny(name, ['leg curl', 'hamstring curl'])) {
    return name.includes('seated') ? 'seated-leg-curl' : 'hamstring-curl';
  }
  if (includesAny(name, ['hip thrust', 'glute bridge'])) return 'hip-thrust';
  if (name.includes('calf')) return name.includes('seated') ? 'seated-calf-raise' : 'calf-raise';
  if (name.includes('back extension')) return 'back-extension';
  if (includesAny(name, ['hanging leg raise', 'hanging knee raise'])) return 'hanging-leg-raise';
  if (name.includes('crunch')) return equipment.includes('machine') ? 'ab-crunch-machine' : 'core';
  if (includesAny(name, ['plank', 'sit-up', 'situp', 'core'])) return 'core';
  if (name.includes('pec deck')) return name.includes('reverse') ? 'reverse-pec-deck' : 'pec-deck';
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
