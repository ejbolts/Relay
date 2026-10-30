const equipmentAliases: Record<string, string> = {
  bb: 'Barbell',
  barbell: 'Barbell',
  barbells: 'Barbell',
  db: 'Dumbbell',
  dumbbell: 'Dumbbell',
  dumbbells: 'Dumbbell',
  cable: 'Cable',
  cables: 'Cable',
  machine: 'Machine',
  machines: 'Machine',
  smith: 'Smith machine',
  'smith machine': 'Smith machine',
  'ez bar': 'EZ bar',
  'ez curl bar': 'EZ bar',
  'trap bar': 'Trap bar',
  'hex bar': 'Trap bar',
  kb: 'Kettlebell',
  kettlebell: 'Kettlebell',
  kettlebells: 'Kettlebell',
  band: 'Resistance band',
  bands: 'Resistance band',
  'resistance band': 'Resistance band',
  'resistance bands': 'Resistance band',
  bodyweight: 'Bodyweight',
  'body weight': 'Bodyweight',
};

export function exerciseEquipment(equipment: string | null): string {
  const clean = equipment?.trim().replace(/[-_]/g, ' ').replace(/\s+/g, ' ') ?? '';
  return equipmentAliases[clean.toLowerCase()] ?? (clean || 'Unspecified');
}

export function exerciseEquipmentOptions(exercises: { equipment: string | null }[]): string[] {
  return [...new Set(exercises.map((exercise) => exerciseEquipment(exercise.equipment)))].sort();
}

export const equipmentSearchTerms: Record<string, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  cable: 'Cable',
  machine: 'Machine',
  smith: 'Smith machine',
  ezbar: 'EZ bar',
  trapbar: 'Trap bar',
  kettlebell: 'Kettlebell',
  band: 'Resistance band',
  bodyweight: 'Bodyweight',
};
