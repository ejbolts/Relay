import { useState, type KeyboardEvent } from 'react';
import { PopupDialog } from './PopupDialog';
import {
  BAR_TYPES,
  PLATES,
  loadPlates,
  plateFor,
  plateStep,
  plateTotal,
  saveBar,
  savedBar,
  type BarType,
} from './plateLoading';
import { useWeightUnit } from './trainingPreferencesContext';
import type { Exercise } from './types';
import { decimalNumberOrNull } from './utils';
import { weightFromKg, weightInputKg, type WeightUnit } from './weightUnits';
import './plateCalculator.css';

const formatNumber = (value: number) => Number(value.toFixed(2)).toLocaleString('en-GB');

/**
 * Shows the plates to load on each side for a set's weight, drawn on the bar. Plates can be
 * added or removed to build a weight, and "Use" copies the total into the set.
 */
export function PlateCalculatorDialog({
  exercise,
  barType: usualBar,
  setLabel,
  weightKg,
  onUse,
  onClose,
}: {
  exercise: Pick<Exercise, 'id' | 'name'>;
  /** The bar this exercise normally uses. */
  barType: BarType;
  /** Which set the weight is for, such as "Set 2" or "Warm-up". */
  setLabel: string;
  weightKg: number | null;
  onUse: (weightKg: number) => void;
  onClose: () => void;
}) {
  const unit = useWeightUnit();
  const [initial] = useState(() => {
    const bar = savedBar(exercise.id, usualBar, unit);
    const target = weightKg === null ? bar.weight : Number(weightFromKg(weightKg, unit).toFixed(2));
    return { bar, target, perSide: loadPlates(target, bar.weight, unit).perSide };
  });
  const [barType, setBarType] = useState(initial.bar.type);
  const [barWeight, setBarWeight] = useState(initial.bar.weight);
  const [barInput, setBarInput] = useState(String(initial.bar.weight));
  const [target, setTarget] = useState(initial.target);
  const [perSide, setPerSide] = useState(initial.perSide);

  const total = plateTotal(barWeight, perSide);
  const shortPerSide = Math.max(0, Math.round(((target - total) / 2) * 100) / 100);
  const plateWeight = total - barWeight;

  function changeBar(type: BarType, weight: number) {
    setBarType(type);
    setBarWeight(weight);
    setPerSide(loadPlates(target, weight, unit).perSide);
    saveBar(exercise.id, { type, weight, unit });
  }

  function chooseBar(type: BarType) {
    const weight = BAR_TYPES[type].weight[unit];
    setBarInput(String(weight));
    changeBar(type, weight);
  }

  function editBarWeight(value: string) {
    setBarInput(value);
    const weight = decimalNumberOrNull(value);
    if (weight !== null && weight > 0 && weight < 200) changeBar(barType, weight);
  }

  function step(direction: 1 | -1) {
    const next = Math.max(barWeight, total + direction * plateStep(unit));
    setTarget(next);
    setPerSide(loadPlates(next, barWeight, unit).perSide);
  }

  function buildPlates(next: number[]) {
    setPerSide(next);
    setTarget(plateTotal(barWeight, next));
  }

  const status =
    target < barWeight
      ? {
          warn: true,
          text: `${formatNumber(target)} ${unit} is lighter than the ${formatNumber(barWeight)} ${unit} bar`,
        }
      : shortPerSide > 0
        ? {
            warn: true,
            text: `${formatNumber(target)} ${unit} needs ${formatNumber(shortPerSide)} ${unit} more per side. Showing the nearest weight below.`,
          }
        : perSide.length === 0
          ? { warn: false, text: 'Just the bar' }
          : { warn: false, text: 'Loads exactly' };

  return (
    <PopupDialog
      title="Plate calculator"
      kicker={`${setLabel} · ${exercise.name}`}
      className="plate-calculator"
      onClose={onClose}
    >
      <div className="plate-calculator-body">
        <div className="plate-calculator-total">
          <button
            type="button"
            className="plate-calculator-step"
            aria-label={`${formatNumber(plateStep(unit))} ${unit} less`}
            disabled={total <= barWeight}
            onClick={() => step(-1)}
          >
            −{formatNumber(plateStep(unit))}
          </button>
          <div aria-live="polite">
            <strong>
              {formatNumber(total)}
              <span>{unit}</span>
            </strong>
            <small>
              {formatNumber(barWeight)} {unit} bar + {formatNumber(plateWeight)} {unit} plates
            </small>
          </div>
          <button
            type="button"
            className="plate-calculator-step"
            aria-label={`${formatNumber(plateStep(unit))} ${unit} more`}
            onClick={() => step(1)}
          >
            +{formatNumber(plateStep(unit))}
          </button>
        </div>
        <p className={`plate-calculator-status ${status.warn ? 'is-warning' : ''}`} role="status">
          {status.warn ? '' : '✓ '}
          {status.text}
        </p>

        <BarbellDiagram
          barType={barType}
          perSide={perSide}
          unit={unit}
          onRemove={(index) => buildPlates(perSide.filter((_, item) => item !== index))}
        />
        <p className="plate-calculator-side">
          Each side:{' '}
          <b>{perSide.length ? `${perSide.map(formatNumber).join(' + ')} ${unit}` : 'no plates'}</b>
        </p>

        <div className="plate-calculator-bars">
          <div className="plate-calculator-chips" role="group" aria-label="Bar">
            {(Object.keys(BAR_TYPES) as BarType[]).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={barType === type}
                onClick={() => chooseBar(type)}
              >
                {BAR_TYPES[type].label}
              </button>
            ))}
          </div>
          <label className="plate-calculator-bar-weight">
            Bar weight
            <input
              inputMode="decimal"
              value={barInput}
              onChange={(event) => editBarWeight(event.target.value)}
              onBlur={() => setBarInput(String(barWeight))}
            />
            {unit}
          </label>
        </div>

        <div className="plate-calculator-plates" role="group" aria-label="Add a pair of plates">
          {PLATES[unit].map((plate) => {
            const count = perSide.filter((weight) => weight === plate.weight).length;
            return (
              <button
                key={plate.weight}
                type="button"
                aria-label={`Add a pair of ${formatNumber(plate.weight)} ${unit} plates${count ? `, ${count} on each side` : ''}`}
                onClick={() =>
                  buildPlates([...perSide, plate.weight].sort((left, right) => right - left))
                }
              >
                <span className="plate-calculator-disc" style={{ background: plate.colour }} />
                <b>{formatNumber(plate.weight)}</b>
                {count > 0 && <span className="plate-calculator-count">×{count}</span>}
              </button>
            );
          })}
        </div>
        <p className="plate-calculator-hint">
          Tap a plate to add a pair. Tap a plate on the bar to remove it.
        </p>
      </div>
      <footer className="popup-dialog-actions">
        <button type="button" onClick={onClose}>
          Close
        </button>
        <button
          type="button"
          className="popup-primary-action"
          onClick={() => {
            onUse(weightInputKg(String(total), unit, weightKg) ?? total);
            onClose();
          }}
        >
          Use {formatNumber(total)} {unit}
        </button>
      </footer>
    </PopupDialog>
  );
}

const WIDTH = 360;
const HEIGHT = 150;
const MIDDLE = HEIGHT / 2;
const SLEEVE_START = WIDTH / 2 - 64;
const COLLAR = 6;
const SLEEVE_END = 10;

/** The bar with each side's plates, heaviest nearest the collar. */
export function BarbellDiagram({
  barType,
  perSide,
  unit,
  onRemove,
}: {
  barType: BarType;
  perSide: readonly number[];
  unit: WeightUnit;
  onRemove?: (index: number) => void;
}) {
  const plates = perSide.map((weight) => plateFor(unit, weight));
  const room = SLEEVE_START - COLLAR - SLEEVE_END - 2;
  const needed = plates.reduce((sum, plate) => sum + plate.thickness, 0);
  // Very heavy loads are drawn thinner so they stay on the sleeve.
  const squeeze = needed > room ? room / needed : 1;
  const description = perSide.length
    ? `${BAR_TYPES[barType].label} with ${perSide.map(formatNumber).join(', ')} ${unit} on each side`
    : `Empty ${BAR_TYPES[barType].label.toLowerCase()}`;

  function removeOnKey(event: KeyboardEvent, index: number) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onRemove?.(index);
  }

  return (
    <div className="plate-calculator-bar">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={description}>
        <BarFrame barType={barType} />
        {([-1, 1] as const).map((side) => {
          const inner = side < 0 ? SLEEVE_START : WIDTH - SLEEVE_START;
          let edge = inner + side * COLLAR;
          return (
            <g key={side}>
              <rect
                className="plate-calculator-collar"
                x={side < 0 ? inner - COLLAR : inner}
                y={MIDDLE - 13}
                width={COLLAR}
                height={26}
                rx={1.5}
              />
              <rect
                className="plate-calculator-sleeve"
                x={side < 0 ? SLEEVE_END : inner + COLLAR}
                y={MIDDLE - 7}
                width={SLEEVE_START - COLLAR - SLEEVE_END}
                height={14}
                rx={4}
              />
              {plates.map((plate, index) => {
                const thickness = plate.thickness * squeeze;
                const x = side < 0 ? edge - thickness : edge;
                edge += side * thickness;
                const label = formatNumber(plate.weight);
                return (
                  <g
                    key={index}
                    className="plate-calculator-plate"
                    {...(onRemove && {
                      role: 'button',
                      tabIndex: side < 0 ? 0 : -1,
                      'aria-label': `Remove a pair of ${label} ${unit} plates`,
                      onClick: () => onRemove(index),
                      onKeyDown: (event: KeyboardEvent) => removeOnKey(event, index),
                    })}
                  >
                    <rect
                      x={x + 0.5}
                      y={MIDDLE - plate.height / 2}
                      width={Math.max(1, thickness - 1)}
                      height={plate.height}
                      rx={2.5}
                      fill={plate.colour}
                      stroke={
                        plate.weight === 2.5 && unit === 'kg'
                          ? 'rgb(255 255 255 / 45%)'
                          : 'rgb(0 0 0 / 35%)'
                      }
                    />
                    {thickness >= 10 && (
                      <text
                        x={x + thickness / 2}
                        y={MIDDLE}
                        fill={plate.ink}
                        transform={`rotate(-90 ${x + thickness / 2} ${MIDDLE})`}
                      >
                        {label}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** The part between the collars: straight, EZ-curved or a trap bar's hexagon frame. */
function BarFrame({ barType }: { barType: BarType }) {
  const left = SLEEVE_START;
  const right = WIDTH - SLEEVE_START;
  const centre = WIDTH / 2;
  if (barType === 'trap') {
    return (
      <g className="plate-calculator-frame">
        <path
          d={`M${left} ${MIDDLE}H${centre - 58}L${centre - 34} ${MIDDLE - 40}H${centre + 34}L${centre + 58} ${MIDDLE}H${right}M${centre - 58} ${MIDDLE}L${centre - 34} ${MIDDLE + 40}H${centre + 34}L${centre + 58} ${MIDDLE}`}
        />
        <path
          className="plate-calculator-handles"
          d={`M${centre - 26} ${MIDDLE - 18}V${MIDDLE + 18}M${centre + 26} ${MIDDLE - 18}V${MIDDLE + 18}`}
        />
      </g>
    );
  }
  if (barType === 'ez') {
    const bend = 9;
    return (
      <g className="plate-calculator-frame">
        <path
          d={`M${left} ${MIDDLE}H${centre - 46}L${centre - 36} ${MIDDLE - bend}L${centre - 22} ${MIDDLE + bend}L${centre - 10} ${MIDDLE}H${centre + 10}L${centre + 22} ${MIDDLE + bend}L${centre + 36} ${MIDDLE - bend}L${centre + 46} ${MIDDLE}H${right}`}
        />
      </g>
    );
  }
  return (
    <g className="plate-calculator-frame">
      <path d={`M${left} ${MIDDLE}H${right}`} />
      <path className="plate-calculator-knurl" d={`M${left + 14} ${MIDDLE}H${right - 14}`} />
    </g>
  );
}
