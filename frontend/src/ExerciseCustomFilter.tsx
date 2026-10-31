export function ExerciseCustomFilter({
  active,
  onChange,
}: {
  active: boolean;
  onChange: (active: boolean) => void;
}) {
  return (
    <button
      type="button"
      className="exercise-custom-filter"
      aria-label="Custom exercises"
      aria-pressed={active}
      onClick={() => onChange(!active)}
    >
      Custom
    </button>
  );
}
