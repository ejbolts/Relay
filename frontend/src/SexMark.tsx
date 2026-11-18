import { Icon } from './Icon';
import { SEX_LABELS } from './profileDisplay';
import type { Sex } from './types';
import './profileBorders.css';

/** The account's sex as a small symbol beside its name. */
export function SexMark({ sex }: { sex: Sex | null | undefined }) {
  if (sex !== 'male' && sex !== 'female') return null;
  return (
    <span className={`sex-mark ${sex}`} role="img" aria-label={SEX_LABELS[sex]}>
      <Icon name={sex} />
    </span>
  );
}
