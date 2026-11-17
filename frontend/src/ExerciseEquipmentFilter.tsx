import { exerciseEquipmentOptions } from './exerciseEquipment';

// Option value for "custom exercises only"; equipment names never start with a colon.
const CUSTOM_OPTION = ':custom';

export function ExerciseEquipmentFilter({
  exercises,
  value,
  onChange,
  customOnly,
  onCustomOnlyChange,
  allLabel = 'Equipment',
}: {
  exercises: { equipment: string | null }[];
  value: string;
  onChange: (value: string) => void;
  /** When given, the menu also offers Custom, which shows only the person's own exercises. */
  customOnly?: boolean;
  onCustomOnlyChange?: (customOnly: boolean) => void;
  /** The option that shows every exercise; a field with its own label says "All equipment". */
  allLabel?: string;
}) {
  const offersCustom = onCustomOnlyChange !== undefined;
  return (
    <select
      aria-label="Equipment"
      value={offersCustom && customOnly ? CUSTOM_OPTION : value}
      onChange={(event) => {
        const next = event.target.value;
        if (offersCustom) {
          onCustomOnlyChange(next === CUSTOM_OPTION);
          if (next === CUSTOM_OPTION) {
            onChange('');
            return;
          }
        }
        onChange(next);
      }}
    >
      <option value="">{allLabel}</option>
      {offersCustom && <option value={CUSTOM_OPTION}>Custom</option>}
      {exerciseEquipmentOptions(exercises).map((equipment) => (
        <option key={equipment} value={equipment}>
          {equipment}
        </option>
      ))}
    </select>
  );
}
