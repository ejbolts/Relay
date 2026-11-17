export const BODY_SIZE_FIELDS = [
  ['neck_cm', 'Neck'],
  ['shoulders_cm', 'Shoulders'],
  ['chest_cm', 'Chest'],
  ['waist_cm', 'Waist'],
  ['hips_cm', 'Hips'],
  ['left_arm_cm', 'Left upper arm'],
  ['right_arm_cm', 'Right upper arm'],
  ['left_thigh_cm', 'Left thigh'],
  ['right_thigh_cm', 'Right thigh'],
  ['left_calf_cm', 'Left calf'],
  ['right_calf_cm', 'Right calf'],
  ['wrist_cm', 'Wrist'],
  ['ankle_cm', 'Ankle'],
] as const;
export type BodySizeField = (typeof BODY_SIZE_FIELDS)[number][0];
export type BodySizeLog = { measurement_date: string } & Record<BodySizeField, number | null>;
