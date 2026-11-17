import { useState, type InputHTMLAttributes } from 'react';
import { useWeightUnit } from './trainingPreferencesContext';
import { weightInputKg, weightInputValue, type WeightUnit } from './weightUnits';

/** The parent owns canonical kg; only the focused input owns a temporary display string. */
export function WeightInput({
  weightKg,
  onWeightChange,
  selectOnFocus = false,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  weightKg: number | null;
  onWeightChange: (kg: number | null) => void;
  selectOnFocus?: boolean;
}) {
  const unit = useWeightUnit();
  const [draft, setDraft] = useState<{ value: string; unit: WeightUnit; kg: number | null } | null>(
    null,
  );
  // A remote update replaces the value immediately, even while focused. The temporary string
  // belongs only to the canonical value it produced and must never overwrite a newer value.
  const currentDraft = draft?.unit === unit && draft.kg === weightKg ? draft : null;
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={currentDraft ? currentDraft.value : weightInputValue(weightKg, unit)}
      onFocus={(event) => {
        setDraft({ value: event.currentTarget.value, unit, kg: weightKg });
        if (selectOnFocus && weightKg !== null) event.currentTarget.select();
        props.onFocus?.(event);
      }}
      onClick={(event) => {
        if (selectOnFocus && weightKg !== null) event.currentTarget.select();
        props.onClick?.(event);
      }}
      onChange={(event) => {
        const value = event.target.value.replace(',', '.');
        if (!/^\d*(?:\.\d*)?$/.test(value)) return;
        const kg = weightInputKg(value, unit, weightKg);
        setDraft({ value, unit, kg });
        if (kg !== weightKg) onWeightChange(kg);
      }}
      onBlur={(event) => {
        if (currentDraft) {
          const kg = weightInputKg(currentDraft.value, unit, weightKg);
          if (kg !== weightKg) onWeightChange(kg);
        }
        setDraft(null);
        props.onBlur?.(event);
      }}
    />
  );
}
