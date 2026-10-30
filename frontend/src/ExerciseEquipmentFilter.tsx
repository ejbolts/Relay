import { exerciseEquipmentOptions } from './exerciseEquipment';

export function ExerciseEquipmentFilter({
  exercises,
  value,
  onChange,
}: {
  exercises: { equipment: string | null }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select aria-label="Equipment" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Any equipment</option>
      {exerciseEquipmentOptions(exercises).map((equipment) => (
        <option key={equipment} value={equipment}>
          {equipment}
        </option>
      ))}
    </select>
  );
}
